import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { requireTraveler } from "../../server/auth/require-traveler";
import { readBoundedJsonBody } from "../../server/http/read-json-body";
import { AppError } from "../../server/http/app-error";
import { apiFailure, apiSuccess } from "../../server/http/api-response";
import { createPlanningAdmission } from "./planning-admission";
import { assistantV2RequestSchema, type AssistantV2Request } from "../assistant-agent-v2/http-contract";
import { createQaDiagnostics } from "../ai/qa-diagnostics";
const admit = createPlanningAdmission();

function extractAssistantReplyText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const turn = (result as { turn?: unknown }).turn;
  if (!turn || typeof turn !== "object") return "";
  const planning = turn as { responsePlan?: { qa?: { answer?: unknown } }; plan?: { qa?: { answer?: unknown } }; message?: unknown };
  const qaAnswer = planning.responsePlan?.qa?.answer ?? planning.plan?.qa?.answer;
  if (typeof qaAnswer === "string" && qaAnswer.trim().length > 0) return qaAnswer;
  if (typeof planning.message === "string" && planning.message.trim().length > 0) return planning.message;
  return "";
}

function splitStreamChunks(text: string): string[] {
  if (!text) return [];
  // Split into natural word/phrase slices (~24 chars) for smooth progressive rendering.
  const tokens = text.match(/\S+\s*/g);
  if (!tokens) return [text];
  const chunks: string[] = [];
  let buffer = "";
  for (const token of tokens) {
    buffer += token;
    if (buffer.length >= 24) {
      chunks.push(buffer);
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function initialStepLabel(request: AssistantV2Request): string {
  if (request.operation === "START") return "Đang khởi tạo phiên trợ lý…";
  if (request.operation === "SAVE") return "Đang kiểm tra và lưu chuyến đi…";
  if (request.operation === "LOCATION") return "Đang cập nhật vị trí và tính toán lại…";
  if (request.operation === "RECONCILE") return "Đang đối soát trạng thái thao tác trước…";
  return "Đang phân tích yêu cầu của bạn…";
}

function createPlanningSseResponse(
  parsed: AssistantV2Request,
  run: () => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Stream already closed by client.
        }
      };

      const timers: Array<ReturnType<typeof setTimeout>> = [];
      const clearTimers = () => {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
      };

      send({ type: "step", label: initialStepLabel(parsed) });
      if (parsed.operation === "TURN" || parsed.operation === "LOCATION") {
        timers.push(
          setTimeout(() => {
            send({ type: "step", label: "Đang tra cứu dữ liệu Hà Giang & kiểm tra ràng buộc…" });
          }, 900),
          setTimeout(() => {
            send({ type: "step", label: "Đang tổng hợp phương án & chuẩn bị phản hồi…" });
          }, 2_800),
        );
      }

      try {
        const result = await run();
        clearTimers();
        const replyText = extractAssistantReplyText(result);
        if (replyText) {
          send({ type: "step", label: "Đang soạn câu trả lời…" });
          const chunks = splitStreamChunks(replyText);
          for (const chunk of chunks) {
            send({ type: "delta", text: chunk });
            if (chunks.length > 1) {
              await new Promise((resolve) => setTimeout(resolve, 14));
            }
          }
        }
        send({ type: "result", data: result });
        send({ type: "done" });
      } catch (error) {
        clearTimers();
        if (error instanceof AppError) {
          send({ type: "error", code: error.code, message: error.message, status: error.status });
        } else {
          send({
            type: "error",
            code: "PLANNING_UNAVAILABLE",
            message: "Chức năng lập hành trình tạm thời không khả dụng. Hãy giữ nội dung và thử lại.",
            status: 503,
          });
        }
      } finally {
        clearTimers();
        try {
          controller.close();
        } catch {
          // Ignore double-close.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Assistant-Runtime": "v2",
    },
  });
}

export async function planningResponse(request: Request, deps: { authorization: AuthorizationDependencies; v2?: (input: AssistantV2Request, key: string, actorId: string, headers: Headers) => Promise<unknown> }) {
  const noStore = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); response.headers.set("X-Assistant-Runtime", "v2"); return response; };
  try {
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_INPUT", "Yêu cầu phải là JSON.", 415);
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new AppError("INVALID_IDEMPOTENCY_KEY", "Thiếu mã yêu cầu hợp lệ.", 400);
    const invalid = new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400);
    // A 28-stop preview can contain 27 verified geometries of 512 points each.
    // Preserve the bound without rejecting that legitimate save projection.
    const body = await readBoundedJsonBody(request, { maxBytes: 1_048_576, tooLargeError: invalid, emptyError: invalid, invalidJsonError: invalid });
    // One assistant: only the V2 action is served. Any other action (including the retired V1 planning actions) is rejected.
    if (!body || typeof body !== "object" || !("action" in body) || body.action !== "ASSISTANT_V2") throw invalid;
    const parsed = assistantV2RequestSchema.safeParse(body);
    if (!parsed.success) throw invalid;
    if (!deps.v2) throw new AppError("ASSISTANT_UNAVAILABLE", "Phiên trợ lý tạm thời không khả dụng.", 503);
    const diagnostics = createQaDiagnostics({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV });
    const run = () => admit(actor.userId, () => diagnostics.run(() => deps.v2!(parsed.data, key, actor.userId, request.headers)));
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      return createPlanningSseResponse(parsed.data, run);
    }
    const result = await run();
    return noStore(apiSuccess(result));
  } catch (error) {
    if (error instanceof AppError) return noStore(apiFailure(error.code, error.message, error.status));
    // Never serialize provider, database or private request details.
    return noStore(apiFailure("PLANNING_UNAVAILABLE", "Chức năng lập hành trình tạm thời không khả dụng. Hãy giữ nội dung và thử lại.", 503));
  }
}

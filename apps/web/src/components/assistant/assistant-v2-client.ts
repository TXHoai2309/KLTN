import type { AssistantV2Request } from "../../modules/assistant-agent-v2/http-contract";
import type { PlanningV2Turn } from "../../modules/assistant-agent-v2/travel-planning-session";
import type { InTripV2Turn } from "../../modules/assistant-agent-v2/in-trip-session";

export type AssistantV2Reply = { runtimeVersion: "v2"; sessionId?: string; stateToken?: string; mode: "PLANNING" | "IN_TRIP"; turn?: PlanningV2Turn | InTripV2Turn; save?: { save?: { status: string; data?: { tripId: string } }; workspace?: { savedTripId: string | null; pendingSaveKey: string | null }; message?: string } };
export class AssistantV2ClientError extends Error {
  constructor(readonly code: string, readonly status: number) { super(status === 409 ? "Phiên hoặc phương án đã thay đổi. Mở lại phiên để đọc trạng thái hiện tại; yêu cầu cũ chưa được tự động áp dụng." : status === 401 || status === 403 ? "Vui lòng đăng nhập lại để tiếp tục." : "Chưa hoàn tất yêu cầu. Giữ nội dung và kiểm tra lại cùng thao tác."); }
}
export async function assistantV2Fetch(request: AssistantV2Request, key: string, fetcher: typeof fetch = fetch): Promise<AssistantV2Reply> {
  const response = await fetcher("/api/ai/planning", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(request), signal: AbortSignal.timeout(115_000) });
  const envelope = await response.json() as { success?: boolean; data?: AssistantV2Reply; error?: { code?: string } };
  if (!response.ok || envelope.success !== true || envelope.data?.runtimeVersion !== "v2") throw new AssistantV2ClientError(envelope.error?.code ?? "ASSISTANT_UNAVAILABLE", response.status);
  return envelope.data;
}

export type AssistantV2StreamCallbacks = {
  onStep?: (label: string) => void;
  onDelta?: (chunk: string) => void;
};

/** Stream progress steps and progressive text from `/api/ai/planning` via SSE, falling back to JSON if needed. */
export async function assistantV2Stream(
  request: AssistantV2Request,
  key: string,
  callbacks: AssistantV2StreamCallbacks = {},
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AssistantV2Reply> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("/api/ai/planning", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(request),
    signal: options.signal ?? AbortSignal.timeout(115_000),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
    const envelope = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      data?: AssistantV2Reply;
      error?: { code?: string };
    };
    if (!response.ok || envelope.success !== true || envelope.data?.runtimeVersion !== "v2") {
      throw new AssistantV2ClientError(envelope.error?.code ?? "ASSISTANT_UNAVAILABLE", response.status);
    }
    return envelope.data;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalReply: AssistantV2Reply | null = null;

  const processBlock = (block: string) => {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    if (!raw || raw === "[DONE]") return;
    let event: { type?: string; label?: string; text?: string; data?: AssistantV2Reply; code?: string; status?: number };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return;
    }
    if (event.type === "step" && typeof event.label === "string") {
      callbacks.onStep?.(event.label);
    } else if (event.type === "delta" && typeof event.text === "string") {
      callbacks.onDelta?.(event.text);
    } else if (event.type === "result" && event.data?.runtimeVersion === "v2") {
      finalReply = event.data;
    } else if (event.type === "error") {
      throw new AssistantV2ClientError(event.code ?? "ASSISTANT_UNAVAILABLE", event.status ?? 503);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex = buffer.indexOf("\n\n");
    while (sepIndex !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      processBlock(block);
      sepIndex = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim().length > 0) {
    processBlock(buffer);
  }
  if (!finalReply) {
    throw new AssistantV2ClientError("ASSISTANT_UNAVAILABLE", 503);
  }
  return finalReply;
}

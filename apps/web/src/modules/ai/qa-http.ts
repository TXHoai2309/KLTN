import { AppError } from "../../server/http/app-error";
import { QA_BODY_MAX_BYTES, QA_ERROR_HTTP_STATUS, qaRequestSchema, qaIdempotencyKeySchema, qaCompletedResponseSchema, qaReferenceIdSchema, qaRenameConversationSchema, qaUpdateConversationSchema, type QaRequest } from "./qa-contract";
import { assertQaSameOrigin } from "./qa-principal";
import type { QaPrincipal } from "./qa-runtime-contract";
import type { QaCompletedTurn } from "./qa-contract";
import { qaReportFailure, qaStage, type QaDiagnostics } from "./qa-diagnostics";
import { withQaRequestBudget } from "./qa-request-budget";

export type QaHttpDependencies = {
  enabled: () => boolean;
  diagnostics?: QaDiagnostics;
  resolve: (headers: Headers) => Promise<QaPrincipal>;
  ask: (principal: QaPrincipal, key: string, request: QaRequest, signal?: AbortSignal) => Promise<{ data: QaCompletedTurn; replayed: boolean }>;
  history: (principal: QaPrincipal, id: string) => Promise<unknown>;
  get?: (principal: QaPrincipal, id: string) => Promise<{ conversation: unknown; turns: unknown[] }>;
  list?: (principal: QaPrincipal, options?: { cursor?: string | null; limit?: number; search?: string }) => Promise<unknown>;
  rename?: (principal: QaPrincipal, id: string, title: string) => Promise<unknown>;
  update?: (principal: QaPrincipal, id: string, updates: { title?: string; knowledgeMode?: any }) => Promise<unknown>;
  turns?: (principal: QaPrincipal, id: string, options?: { cursor?: string | null; limit?: number }) => Promise<unknown>;
  delete: (principal: QaPrincipal, id: string) => Promise<unknown>;
};
export function qaJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
export function qaHttpError(error: unknown) {
  if (error instanceof AppError && error.code in QA_ERROR_HTTP_STATUS && error.code !== "OPERATION_STATUS_UNKNOWN") {
    const code = error.code as keyof typeof QA_ERROR_HTTP_STATUS;
    // Never reflect provider/SQL/user exception messages or arbitrary details.
    return qaJson({ success: false, operationStatus: "FAILED", error: { code, message: `Không thể xử lý yêu cầu (${code}).` } }, QA_ERROR_HTTP_STATUS[code]);
  }
  return qaJson({ success: false, operationStatus: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác nhận thao tác. Thử lại với cùng nội dung và Idempotency-Key." }, retryWithSameKey: true }, 503);
}
export async function readQaRequest(request: Request): Promise<QaRequest> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new AppError("UNSUPPORTED_MEDIA_TYPE", "JSON required", 415);
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > QA_BODY_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Body limit", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST", "Missing body", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new AppError("INVALID_REQUEST", "Body timeout", 400)); }, 5000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      total += value.byteLength;
      if (total > QA_BODY_MAX_BYTES) { await reader.cancel().catch(() => undefined); throw new AppError("PAYLOAD_TOO_LARGE", "Body limit", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let json: unknown;
    try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new AppError("INVALID_REQUEST", "Invalid JSON", 400); }
    const parsed = qaRequestSchema.safeParse(json);
    if (!parsed.success) throw new AppError("INVALID_REQUEST", "Invalid request", 400);
    return parsed.data;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export function createQaHttpHandlers(deps: QaHttpDependencies) {
  const guard = () => { if (!deps.enabled()) throw new AppError("AI_UNAVAILABLE", "AI unavailable", 503); };
  const readOnly = async <T>(work: () => Promise<T>): Promise<T> => {
    try { return await work(); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError("INTERNAL_SERVER_ERROR", "Read failure", 500); }
  };
  return {
    async ask(request: Request) {
      const work = () => withQaRequestBudget(request.signal, async signal => {
      try {
        guard(); assertQaSameOrigin(request);
        const rawKey = request.headers.get("Idempotency-Key");
        if (rawKey === null || !rawKey.trim()) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Key required", 400);
        const key = qaIdempotencyKeySchema.safeParse(rawKey);
        if (!key.success) throw new AppError("IDEMPOTENCY_KEY_INVALID", "Key invalid", 400);
        const input = await readOnly(() => readQaRequest(request));
        qaStage("REQUEST_ACCEPTED");
        const principal = await readOnly(() => deps.resolve(request.headers));
        qaStage("PRINCIPAL_RESOLVED");
        const result = await deps.ask(principal, key.data, input, signal);
        qaStage("HTTP_RESPONSE_VALIDATION");
        const body = qaCompletedResponseSchema.parse({ success: true, operationStatus: "SUCCESS", data: result.data });
        return qaJson(body, 200, result.replayed ? { "Idempotency-Replayed": "true" } : {});
      } catch (error) {
        qaReportFailure(error, error instanceof AppError && error.code in QA_ERROR_HTTP_STATUS ? error.code : "OPERATION_STATUS_UNKNOWN");
        return qaHttpError(error);
      }
      });
      return deps.diagnostics ? deps.diagnostics.run(work) : work();
    },
    async conversation(request: Request, id: string, remove: boolean) {
      try {
        guard();
        if (remove) assertQaSameOrigin(request);
        if (!qaReferenceIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Not found", 404);
        const principal = await readOnly(() => deps.resolve(request.headers));
        if (remove) {
          const data = await deps.delete(principal, id);
          return qaJson({ success: true, operationStatus: "SUCCESS", data });
        }
        if (deps.get) {
          const result = (await readOnly(() => deps.get!(principal, id))) as { conversation: unknown; turns: unknown[] };
          return qaJson({ success: true, data: result.turns, conversation: result.conversation });
        }
        const data = await readOnly(() => deps.history(principal, id));
        return qaJson({ success: true, data });
      } catch (error) { return qaHttpError(error); }
    },
    async listConversations(request: Request) {
      try {
        guard();
        const url = new URL(request.url);
        const cursor = url.searchParams.get("cursor") || undefined;
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam && /^\d+$/.test(limitParam) ? Number(limitParam) : undefined;
        const search = url.searchParams.get("search") || url.searchParams.get("q") || undefined;
        const principal = await readOnly(() => deps.resolve(request.headers));
        const data = await readOnly(async () => deps.list ? deps.list(principal, { cursor, limit, search }) : { items: [], nextCursor: null, hasMore: false });
        return qaJson({ success: true, data });
      } catch (error) { return qaHttpError(error); }
    },
    async renameConversation(request: Request, id: string) {
      try {
        guard(); assertQaSameOrigin(request);
        if (!qaReferenceIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Not found", 404);
        let json: unknown;
        try { json = await request.json(); } catch { throw new AppError("INVALID_REQUEST", "Invalid JSON", 400); }
        const parsed = qaUpdateConversationSchema.safeParse(json);
        if (!parsed.success) throw new AppError("INVALID_REQUEST", "Invalid title or mode", 400);
        const principal = await readOnly(() => deps.resolve(request.headers));
        const data = deps.update ? await deps.update(principal, id, parsed.data) : deps.rename && parsed.data.title ? await deps.rename(principal, id, parsed.data.title) : { id, ...parsed.data };
        return qaJson({ success: true, operationStatus: "SUCCESS", data });
      } catch (error) { return qaHttpError(error); }
    },
    async conversationTurns(request: Request, id: string) {
      try {
        guard();
        if (!qaReferenceIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Not found", 404);
        const url = new URL(request.url);
        const cursor = url.searchParams.get("cursor") || undefined;
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam && /^\d+$/.test(limitParam) ? Number(limitParam) : undefined;
        const principal = await readOnly(() => deps.resolve(request.headers));
        const data = await readOnly(async () => deps.turns ? deps.turns(principal, id, { cursor, limit }) : { turns: [], nextCursor: null, hasMore: false });
        return qaJson({ success: true, data });
      } catch (error) { return qaHttpError(error); }
    },
  };
}

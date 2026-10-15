import { AppError } from "@/server/http/app-error";

// In-flight protection only: no historical counters, database budget or time quota.
// Keep state through development hot reload; each server process owns its slots.
const runtime = globalThis as typeof globalThis & { __kltnEditorialAiInflight?: Map<string, symbol> };
const inflight = runtime.__kltnEditorialAiInflight ??= new Map<string, symbol>();
export const EDITORIAL_AI_MAX_CONCURRENT = 4;

export async function withEditorialAiConcurrency<T>(actorId: string, action: () => Promise<T>): Promise<T> {
  if (inflight.has(actorId)) throw new AppError("EDITORIAL_AI_IN_PROGRESS", "AI đang xử lý yêu cầu trước. Vui lòng đợi thao tác đó hoàn tất.", 409);
  if (inflight.size >= EDITORIAL_AI_MAX_CONCURRENT) throw new AppError("EDITORIAL_AI_BUSY", "AI đang xử lý nhiều yêu cầu. Vui lòng thử lại khi một thao tác hoàn tất.", 503);
  const token = Symbol();
  inflight.set(actorId, token);
  try { return await action(); }
  finally { if (inflight.get(actorId) === token) inflight.delete(actorId); }
}

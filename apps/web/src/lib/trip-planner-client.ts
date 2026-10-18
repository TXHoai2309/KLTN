import { plannerResultSchema, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import type { TripRequirementInput } from "@/modules/trip-requirement/trip-requirement-contract";

export type PlannerClientResult = { ok: true; proposal: PlannerResult } | { ok: false; code: string; message: string; ambiguous: boolean };
export async function requestTripProposal(requirement: TripRequirementInput, key: string, signal: AbortSignal, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)): Promise<PlannerClientResult> {
  const fail = (code: string, message: string, ambiguous = false): PlannerClientResult => ({ ok: false, code, message, ambiguous });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 25_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const onInterrupted = () => { void reader?.cancel().catch(() => undefined); };
  let resolveInterrupted: (() => void) | undefined;
  const interrupted = new Promise<PlannerClientResult>(resolve => {
    resolveInterrupted = () => { onInterrupted(); resolve(fail("NETWORK_AMBIGUITY", "Chưa nhận được kết quả. Thử lại cùng yêu cầu để tránh tạo trùng trong phiên này.", true)); };
    controller.signal.addEventListener("abort", resolveInterrupted, { once: true });
    if (controller.signal.aborted) resolveInterrupted();
  });
  const read = async (): Promise<PlannerClientResult> => { try {
    if (controller.signal.aborted) return fail("NETWORK_AMBIGUITY", "Yêu cầu đã dừng; bạn có thể thử lại cùng yêu cầu.", true);
    const response = await fetcher("/api/trip-proposals", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ requirement }) });
    if (response.status === 401) return fail("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    if (response.status === 403) return fail("FORBIDDEN", "Bạn không có quyền lập lịch trình trong phiên này.");
    if (response.status === 422) return fail("TRIP_REQUIREMENT_UNCLEAR", "Nhu cầu chưa đủ rõ hoặc ngày đã thay đổi. Hãy quay lại kiểm tra nhu cầu.");
    if (response.status === 409) return fail("PLANNER_DATA_CHANGED", "Dữ liệu điểm đến hoặc nhu cầu đã thay đổi. Hãy quay lại kiểm tra trước khi tạo lại.");
    if (response.status === 429) return fail("RATE_LIMITED", "Hãy đợi một chút trước khi tạo lại lịch trình.");
    const unavailable = () => fail("PLANNER_UNAVAILABLE", "Dịch vụ lập lịch trình tạm thời không khả dụng. Bạn có thể thử lại.");
    if (!response.ok && response.status !== 503) return unavailable();
    reader = response.body?.getReader();
    if (!reader) return response.ok ? fail("INVALID_RESPONSE", "Không thể xác minh kết quả lập lịch trình.") : unavailable();
    let body = "", bytes = 0; const decoder = new TextDecoder();
    const bodyReader = reader;
    try { while (true) { const next = await bodyReader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 512 * 1024) { await bodyReader.cancel(); return fail("INVALID_RESPONSE", "Kết quả vượt giới hạn xử lý."); } body += decoder.decode(next.value, { stream: true }); } }
    finally { bodyReader.releaseLock(); }
    let raw: { success?: unknown; data?: unknown; error?: { code?: unknown } };
    try { raw = JSON.parse(body + decoder.decode()); } catch { return response.ok ? fail("INVALID_RESPONSE", "Không thể xác minh kết quả lập lịch trình.") : unavailable(); }
    if (!response.ok) return raw?.success === false && raw.error?.code === "PLANNER_NOT_CONFIGURED"
      ? fail("PLANNER_NOT_CONFIGURED", "Nguồn dữ liệu lập lịch trình chưa được xác minh cho môi trường này. Vui lòng liên hệ quản trị viên.") : unavailable();
    const parsed = plannerResultSchema.safeParse(raw.data);
    if (raw.success !== true || !parsed.success || JSON.stringify(parsed.data.requirement) !== JSON.stringify(requirement)) return fail("INVALID_RESPONSE", "Không thể xác minh đề xuất cho nhu cầu hiện tại.");
    return { ok: true, proposal: parsed.data };
  } catch { return fail("NETWORK_AMBIGUITY", "Chưa nhận được kết quả. Thử lại cùng yêu cầu để tránh tạo trùng trong phiên này.", true); } };
  try { return await Promise.race([read(), interrupted]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); if (resolveInterrupted) controller.signal.removeEventListener("abort", resolveInterrupted); }
}

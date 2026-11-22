/**
 * Client-safe error vocabulary for the tripsage chat. It is imported by both the server stream (for the texts it
 * writes into the stream) and the browser (to turn any failure into a Vietnamese notice). It must not import
 * server modules, env or provider code. A notice is built from the HTTP status and a few known texts only; the raw
 * `error.message` of a failure is never shown, so provider text or keys cannot reach the screen through it.
 */
export const TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT = "Trợ lý tạm thời không khả dụng. Nội dung của bạn vẫn được giữ, hãy thử lại sau ít phút.";
export const TRIPSAGE_PROVIDER_LIMIT_TEXT = "Dịch vụ AI tạm thời không khả dụng do đang giới hạn lượt dùng hoặc hết hạn mức. Hãy thử lại sau ít phút.";

export type ChatNoticeKind = "RATE_LIMITED" | "UNAUTHENTICATED" | "FORBIDDEN" | "DISABLED" | "INVALID" | "UNAVAILABLE" | "INTERRUPTED";
export type ChatNotice = { kind: ChatNoticeKind; message: string; retryAfterSeconds?: number; canResend: boolean };

/** Thrown by the chat fetch wrapper for a non-2xx answer; carries only status, error code and a validated Retry-After. */
export class TripsageChatHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterSeconds?: number;
  constructor(status: number, code: string | null, retryAfterSeconds?: number) {
    super(`tripsage chat http ${status}`);
    this.name = "TripsageChatHttpError";
    this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Retry-After is server evidence: integer seconds (0..3600) or nothing. */
export function parseChatRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d{1,5}$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return seconds >= 1 && seconds <= 3600 ? seconds : undefined;
}

/** Wraps fetch so a non-2xx answer becomes a typed error instead of the raw response body text. */
export function createTripsageChatFetch(base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const response = await base(input, init);
    if (response.ok) return response;
    let code: string | null = null;
    try { const body = await response.json() as { error?: { code?: unknown } }; if (typeof body?.error?.code === "string") code = body.error.code.slice(0, 64); } catch { /* body is optional */ }
    throw new TripsageChatHttpError(response.status, code, parseChatRetryAfter(response.headers.get("Retry-After")));
  }) as typeof fetch;
}

const notice = (kind: ChatNoticeKind, message: string, canResend: boolean, retryAfterSeconds?: number): ChatNotice => ({ kind, message, canResend, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });

/** Maps any failure to a Vietnamese notice, or null when the user stopped the turn on purpose. */
export function classifyChatError(error: unknown): ChatNotice | null {
  if (error instanceof Error && error.name === "AbortError") return null;
  if (error instanceof TripsageChatHttpError) {
    const { status } = error;
    if (status === 429) return notice("RATE_LIMITED", error.retryAfterSeconds ? `Bạn đang gửi yêu cầu quá nhanh. Hãy đợi khoảng ${error.retryAfterSeconds} giây rồi gửi lại.` : "Bạn đang gửi yêu cầu quá nhanh. Hãy đợi một chút rồi gửi lại.", true, error.retryAfterSeconds);
    if (status === 401) return notice("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.", false);
    if (status === 403) return notice("FORBIDDEN", "Bạn không có quyền dùng trợ lý lập hành trình này.", false);
    if (status === 404) return notice("DISABLED", "Trợ lý lập hành trình hiện chưa khả dụng.", false);
    if (status >= 400 && status < 500) return notice("INVALID", "Nội dung yêu cầu chưa hợp lệ. Hãy chỉnh lại hoặc rút gọn rồi gửi lại.", false);
    return notice("UNAVAILABLE", TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT, true);
  }
  const message = error instanceof Error ? error.message : "";
  if (message === TRIPSAGE_PROVIDER_LIMIT_TEXT) return notice("UNAVAILABLE", TRIPSAGE_PROVIDER_LIMIT_TEXT, true);
  if (message === TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT) return notice("UNAVAILABLE", TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT, true);
  return notice("INTERRUPTED", "Kết nối bị ngắt giữa chừng. Lịch trình hiển thị phía trên (nếu có) là bản hợp lệ gần nhất và chưa được lưu. Bạn có thể gửi lại.", true);
}

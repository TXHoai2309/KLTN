/** Retry-After is server evidence, never a default cooldown guessed by the client. */
export function editorialRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return;
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    const seconds = Number(v);
    return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 31_536_000 ? seconds : undefined;
  }
  // Require an actual HTTP-date; Date.parse also accepts misleading numeric strings.
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) return;
  const expiry = Date.parse(v), seconds = Math.ceil((expiry - now) / 1000);
  return Number.isFinite(expiry) && seconds >= 0 && seconds <= 31_536_000 ? seconds : undefined;
}

export function editorial429Message(code: unknown, providerCode?: unknown) {
  const message = code === "EDITORIAL_AI_PROVIDER_RATE_LIMIT" ? "OpenAI đang giới hạn yêu cầu AI. Vui lòng đợi trước khi thử lại."
    : code === "EDITORIAL_AI_PROVIDER_QUOTA" ? "OpenAI báo thiếu quota hoặc cần kiểm tra billing."
    : "Bạn đang yêu cầu AI quá nhanh. Vui lòng đợi trước khi thử lại.";
  const safeCode = typeof providerCode === "string" && ["rate_limit_exceeded", "insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(providerCode) ? providerCode : null;
  return message + (safeCode ? ` Mã OpenAI: ${safeCode}.` : "");
}

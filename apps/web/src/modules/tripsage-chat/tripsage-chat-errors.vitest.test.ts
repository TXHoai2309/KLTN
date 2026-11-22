import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TripsageChatNotice } from "../../components/tripsage-chat/tripsage-chat-notice";
import { classifyChatError, createTripsageChatFetch, parseChatRetryAfter, TRIPSAGE_PROVIDER_LIMIT_TEXT, TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT, TripsageChatHttpError } from "./tripsage-chat-errors";

const SECRET = "sk-test-secret-key-do-not-leak";
const failing = (status: number, headers: Record<string, string> = {}, body: unknown = { success: false, error: { code: "X", message: `raw ${SECRET}` } }) => createTripsageChatFetch((async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch);
const caught = async (fetcher: typeof fetch) => { try { await fetcher("/api/ai/chat", { method: "POST" }); } catch (error) { return error; } throw new Error("expected failure"); };

describe("chat fetch wrapper and error classification", () => {
  it("passes a successful response through untouched", async () => {
    const ok = createTripsageChatFetch((async () => new Response("data: x", { status: 200 })) as unknown as typeof fetch);
    expect((await ok("/api/ai/chat")).status).toBe(200);
  });

  it("429 keeps a valid Retry-After and tells the user to wait that long", async () => {
    const notice = classifyChatError(await caught(failing(429, { "retry-after": "12" })));
    expect(notice).toMatchObject({ kind: "RATE_LIMITED", retryAfterSeconds: 12, canResend: true });
    expect(notice!.message).toContain("12 giây");
  });

  it("429 without or with a bogus Retry-After never invents a number", async () => {
    for (const headers of [{}, { "retry-after": "abc" }, { "retry-after": "-5" }, { "retry-after": "99999999" }] as Record<string, string>[]) {
      const notice = classifyChatError(await caught(failing(429, headers)));
      expect(notice!.kind).toBe("RATE_LIMITED");
      expect(notice!.retryAfterSeconds).toBeUndefined();
      expect(notice!.message).not.toMatch(/\d/);
    }
    expect(parseChatRetryAfter("30")).toBe(30);
  });

  const table: [number, string, string, boolean][] = [
    [401, "UNAUTHENTICATED", "đăng nhập", false], [403, "FORBIDDEN", "quyền", false], [404, "DISABLED", "chưa khả dụng", false],
    [400, "INVALID", "chưa hợp lệ", false], [415, "INVALID", "chưa hợp lệ", false], [503, "UNAVAILABLE", "tạm thời không khả dụng", true], [500, "UNAVAILABLE", "tạm thời không khả dụng", true],
  ];
  for (const [status, kind, text, canResend] of table) {
    it(`HTTP ${status} -> ${kind}, Vietnamese, no raw server text`, async () => {
      const notice = classifyChatError(await caught(failing(status)))!;
      expect(notice).toMatchObject({ kind, canResend });
      expect(notice.message).toContain(text);
      expect(JSON.stringify(notice)).not.toContain(SECRET);
      expect(JSON.stringify(notice)).not.toContain("raw");
    });
  }
  it("flag off (404) reveals no flag or config name", async () => {
    expect(classifyChatError(await caught(failing(404)))!.message).not.toMatch(/TRIPSAGE|flag|ENABLED|env/i);
  });

  it("server-sent stream error texts map to the unavailable state; anything else is an interrupted stream", () => {
    expect(classifyChatError(new Error(TRIPSAGE_PROVIDER_UNAVAILABLE_TEXT))).toMatchObject({ kind: "UNAVAILABLE", canResend: true });
    expect(classifyChatError(new Error(TRIPSAGE_PROVIDER_LIMIT_TEXT))).toMatchObject({ kind: "UNAVAILABLE", message: TRIPSAGE_PROVIDER_LIMIT_TEXT });
    for (const error of [new TypeError(`network error ${SECRET}`), new Error("terminated"), "weird", undefined]) {
      const notice = classifyChatError(error)!;
      expect(notice).toMatchObject({ kind: "INTERRUPTED", canResend: true });
      expect(notice.message).toContain("bị ngắt");
      expect(notice.message).toContain("chưa được lưu");
      expect(notice.message).not.toContain(SECRET);
    }
  });

  it("a deliberate stop is not an error", () => {
    const abort = new Error("aborted"); abort.name = "AbortError";
    expect(classifyChatError(abort)).toBeNull();
  });
});

describe("notice component", () => {
  const html = (error: unknown, onResend?: () => void) => renderToStaticMarkup(createElement(TripsageChatNotice, { notice: classifyChatError(error), onResend }));
  it("renders an alert with the message and a resend button when resending is useful", () => {
    const markup = html(new TypeError("network error"), () => {});
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("bị ngắt");
    expect(markup).toContain("Gửi lại");
  });
  it("shows the Retry-After wait for 429", () => {
    expect(html(new TripsageChatHttpError(429, "RATE_LIMITED", 20), () => {})).toContain("20 giây");
  });
  it("has no resend button for sign-in, flag-off or invalid input, and renders nothing without a notice", () => {
    for (const status of [401, 404, 400]) expect(html(new TripsageChatHttpError(status, null), () => {})).not.toContain("Gửi lại");
    expect(renderToStaticMarkup(createElement(TripsageChatNotice, { notice: null }))).toBe("");
  });
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Explicit local smoke only. Creates its own guest session/conversation and
// removes only those resources afterwards. Cookies/IDs/source prose stay private.
if (process.env.QA_DIAGNOSTIC_HTTP !== "1") {
  console.info("QA_LOCAL_HTTP_SMOKE skipped (set QA_DIAGNOSTIC_HTTP=1 to run against localhost:3010).");
  process.exit(0);
}
const origin = "http://localhost:3010";
let cookie;
let conversationId;
let headTurnId;
async function request(path, method, data, key) {
  const body = data === undefined ? undefined : JSON.stringify(data);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${origin}${path}`, {
      method, signal: AbortSignal.timeout(65000),
      headers: { origin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
      body,
    });
    const value = await response.json();
    if (value.operationStatus === "UNKNOWN" && key && attempt === 0) continue;
    if (!response.ok || !value.success) throw new Error(`Local QA request failed: HTTP ${response.status}, ${value.error?.code ?? "UNKNOWN"}`);
    return { response, value };
  }
}
const results = [];
try {
  const bootstrap = await request("/api/ai/session", "POST");
  cookie = bootstrap.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("kltn_qa_guest="), "Expected a fresh owned guest session");
  const questions = process.env.QA_HTTP_SCENARIO === "natural" ? [
    { question: "chào bạn nha", statuses: ["CONVERSATIONAL"], factual: false },
    { question: "Giới thiệu về Cao nguyên đá Đồng Văn", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "Ở đó có những đặc điểm địa chất nào nổi bật?", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "Địa điểm này được UNESCO công nhận là gì?", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "giá vé vào là bao nhiêu", statuses: ["ANSWERED", "PARTIAL"], factual: true },
  ] : [
    { question: "Giá vé bao nhiêu?", statuses: ["CLARIFICATION_REQUIRED"], factual: false },
    { question: "hi", statuses: ["CONVERSATIONAL"], factual: false },
    { question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn? ,./", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "Cảm ơn, ở đó có gì nổi bật?", statuses: ["ANSWERED", "PARTIAL"], factual: true },
    { question: "giá vé vào thì sao?", statuses: ["ANSWERED", "PARTIAL"], factual: true },
  ];
  let lastPayload;
  let lastKey;
  for (const [index, test] of questions.entries()) {
    const question = test.question;
    const payload = conversationId ? { conversationId, parentTurnId: headTurnId, question } : { question, context: { type: "GENERAL" } };
    const key = `qa-local-smoke-${randomUUID()}`;
    const started = Date.now();
    const { value } = await request("/api/ai/ask", "POST", payload, key);
    conversationId = value.data.conversationId;
    headTurnId = value.data.turnId;
    const prose = value.data.answerParts.map(part => part.text).join("\n");
    results.push({ index, status: value.data.status, answerMode: test.factual ? value.data.answerMode ?? "SYNTHESIS" : "NOT_APPLICABLE", matched: test.statuses.includes(value.data.status), partCount: value.data.answerParts.length, citationCount: value.data.citations.length, elapsedMs: Date.now() - started,
      ...(process.env.QA_HTTP_SCENARIO === "natural" ? { recordLedParts: value.data.answerParts.filter(part => /^(?:hồ sơ|theo hồ sơ|tài liệu nêu|hồ sơ ghi)/iu.test(part.text)).length, textCharacters: prose.length } : {}) });
    console.info("QA_LOCAL_HTTP_TURN", JSON.stringify(results.at(-1)));
    if (test.factual && test.statuses.includes(value.data.status)) assert.ok(value.data.citations.length > 0, "Factual reply needs citations");
    else assert.equal(value.data.citations.length, 0, "Social/clarification outcomes have no factual citations");
    lastPayload = payload;
    lastKey = key;
  }
  const replay = await request("/api/ai/ask", "POST", lastPayload, lastKey);
  assert.equal(replay.response.headers.get("idempotency-replayed"), "true");
  assert.equal(replay.value.data.turnId, headTurnId);
  const history = await request(`/api/ai/conversations/${conversationId}`, "GET");
  assert.equal(history.value.data.length, questions.length);
  assert.deepEqual(history.value.data.map(turn => turn.response.status), results.map(result => result.status));
  console.info("QA_LOCAL_HTTP_SMOKE", JSON.stringify({ passed: results.every(result => result.matched), turns: results.length, replayed: true, persistedHistoryVerified: true }));
  assert.ok(results.every(result => result.matched), "Some completed turns did not match the annotated outcome; all results above are retained");
} finally {
  if (cookie) {
    if (conversationId) await request(`/api/ai/conversations/${conversationId}`, "DELETE");
    await request("/api/ai/session", "DELETE");
    console.info("QA_LOCAL_HTTP_CLEANUP", JSON.stringify({ ownedConversationDeleted: Boolean(conversationId), ownGuestRevoked: true }));
  }
}

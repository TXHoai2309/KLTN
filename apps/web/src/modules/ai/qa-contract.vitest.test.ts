import { describe, expect, it } from "vitest";

import type { MutationApiResponse } from "../../lib/mutation-contract";
import {
  QA_BODY_MAX_BYTES,
  QA_INSUFFICIENT_SOURCE_MESSAGE,
  QA_ERROR_HTTP_STATUS,
  QA_IDEMPOTENCY_HEADER,
  qaAnswerPartSchema,
  qaCitationLocatorSchema,
  qaCompletedTurnSchema,
  qaContextSchema,
  qaIdempotencyKeySchema,
  qaPublicCitationSchema,
  qaRequestSchema,
  qaResponseSchema,
  qaSourceUrlSchema,
  type QaCompletedTurn,
  type QaPublicCitation,
} from "./qa-contract";

type AnsweredTurn = Extract<QaCompletedTurn, { status: "ANSWERED" }>;

function citation(): QaPublicCitation {
  return {
    id: "c1",
    sourceId: "source_fixture_a",
    title: "Tài liệu kiểm thử A",
    sourceUrl: null,
    locators: [{ pageNumber: 3 }],
  };
}

function answered(): AnsweredTurn {
  return {
    conversationId: "conv_fixture",
    turnId: "turn_fixture_01",
    turnState: "COMPLETED",
    context: { type: "GENERAL" },
    status: "ANSWERED",
    answerParts: [{ text: "Nội dung fixture, không phải dữ kiện sản phẩm.", citationIds: ["c1"] }],
    citations: [citation()],
    unansweredAspects: [],
  };
}

function identity() {
  const { conversationId, turnId, turnState, context } = answered();
  return { conversationId, turnId, turnState, context };
}

function insufficient() {
  return {
    ...identity(),
    status: "INSUFFICIENT_SOURCE",
    answerParts: [],
    citations: [],
    message: QA_INSUFFICIENT_SOURCE_MESSAGE,
  };
}

function clarification() {
  return {
    ...identity(),
    status: "CLARIFICATION_REQUIRED",
    answerParts: [],
    citations: [],
    clarificationQuestion: "Bạn muốn hỏi về đối tượng nào?",
  };
}

function without(input: object, key: string) {
  const copy: Record<string, unknown> = { ...input };
  delete copy[key];
  return copy;
}

describe("Task 191 request contract (no HTTP/session/runtime)", () => {
  it("accepts first turn and defaults only first-turn context", () => {
    expect(qaRequestSchema.parse({ question: "Dinh thự họ Vương có gì đặc biệt?" }))
      .toEqual({ question: "Dinh thự họ Vương có gì đặc biệt?", context: { type: "GENERAL" } });
    expect(qaRequestSchema.safeParse({ question: "Câu hỏi", context: { type: "GENERAL" } }).success).toBe(true);
  });

  it("accepts follow-up references without resetting omitted context", () => {
    const input = { conversationId: "conv_fixture", parentTurnId: "turn_fixture_01", question: "Nó nằm ở đâu?" };
    expect(qaRequestSchema.parse(input)).toEqual(input);
    expect(qaRequestSchema.safeParse({ ...input, context: { type: "GENERAL" } }).success).toBe(true);
    expect(qaRequestSchema.safeParse({ ...input, parentTurnId: null }).success).toBe(true);
  });

  it.each([
    { question: "Câu hỏi", parentTurnId: "turn_01" },
    { question: "Câu hỏi", parentTurnId: null },
    { question: "Câu hỏi", conversationId: "conv_01" },
    { question: "Câu hỏi", conversationId: null, parentTurnId: null },
    { question: "Câu hỏi", conversationId: "", parentTurnId: "turn_01" },
    { question: "Câu hỏi", conversationId: "conv_01", parentTurnId: "" },
  ])("rejects incomplete/invalid identity combination %j", (input) => {
    expect(qaRequestSchema.safeParse(input).success).toBe(false);
  });

  it("normalizes NFC and trims before applying the limit", () => {
    expect(qaRequestSchema.parse({ question: "  Ha\u0300 Giang  \n" }).question).toBe("Hà Giang");
    expect(qaRequestSchema.safeParse({ question: ` ${"a".repeat(2000)} ` }).success).toBe(true);
    expect(qaRequestSchema.safeParse({ question: "😀".repeat(1000) }).success).toBe(true);
    expect(qaRequestSchema.safeParse({ question: "😀".repeat(1001) }).success).toBe(false);
  });

  it.each([undefined, null, 42, "", " \n\t ", "a".repeat(2001)])("rejects invalid question %j", (question) => {
    expect(qaRequestSchema.safeParse({ question }).success).toBe(false);
  });

  it.each(["userId", "role", "ownerId", "history", "messages", "evidence", "sources", "citations", "prompt", "model"])
    ("rejects client-supplied %s", (key) => {
      expect(qaRequestSchema.safeParse({ question: "Câu hỏi", [key]: "untrusted" }).success).toBe(false);
      expect(qaRequestSchema.safeParse({ question: "Câu hỏi", conversationId: "conv_01", parentTurnId: "turn_01", [key]: "untrusted" }).success).toBe(false);
    });

  it.each([
    { type: "DESTINATION", destinationId: "destination_01" },
    { type: "TRIP", tripId: "trip_01" },
    { type: "OTHER" },
    { type: "GENERAL", title: "Client metadata" },
    { type: "GENERAL", history: [] },
  ])("rejects inactive/non-strict context %j without fallback", (context) => {
    expect(qaRequestSchema.safeParse({ question: "Câu hỏi", context }).success).toBe(false);
    expect(qaRequestSchema.safeParse({ question: "Câu hỏi", conversationId: "conv_01", parentTurnId: "turn_01", context }).success).toBe(false);
  });

  it("rejects non-object requests and unknown nested context", () => {
    expect(qaRequestSchema.safeParse([]).success).toBe(false);
    expect(qaContextSchema.safeParse(null).success).toBe(false);
  });
});

describe("Task 191 citation structure (not provenance authenticity)", () => {
  it.each([[], [{ pageNumber: 3 }], [{ section: "Mục A" }], [{ pageNumber: 3, section: "Mục A" }], [{ pageNumber: 3 }, { pageNumber: 7 }]].map((locators) => ({ locators })))
    ("accepts known locator shapes %j", ({ locators }) => {
      expect(qaPublicCitationSchema.safeParse({ ...citation(), locators }).success).toBe(true);
    });

  it.each([{}, { pageNumber: 0 }, { pageNumber: -1 }, { pageNumber: 1.5 }, { pageNumber: "3" }, { pageNumber: null }, { section: " " }, { section: "a".repeat(301) }, { section: null }, { chunkIndex: 3 }])
    ("rejects empty/invalid locator %j", (locator) => {
      expect(qaCitationLocatorSchema.safeParse(locator).success).toBe(false);
    });

  it.each(["id", "sourceId", "title", "sourceUrl", "locators"])("requires public citation field %s", (key) => {
    expect(qaPublicCitationSchema.safeParse(without(citation(), key)).success).toBe(false);
  });

  it.each(["documentId", "chunkId", "documentVersion", "embedding", "score", "excerpt", "snippet", "rawText", "storageUrl", "downloadUrl"])
    ("rejects private/internal field %s", (key) => {
      expect(qaPublicCitationSchema.safeParse({ ...citation(), [key]: "private" }).success).toBe(false);
    });

  it.each(["", "not a URL", "/files/a.pdf", "file:///private/a.pdf", "javascript:alert(1)", "ftp://example.test/a", "https://user:password@example.test/a", "https://example.test/a b", "https://example.test/a\n"])
    ("rejects invalid source URL syntax %j", (sourceUrl) => {
      expect(qaSourceUrlSchema.safeParse(sourceUrl).success).toBe(false);
    });

  it("accepts null/HTTP(S) syntax without claiming public-access approval", () => {
    expect(qaSourceUrlSchema.safeParse(null).success).toBe(true);
    expect(qaSourceUrlSchema.safeParse("https://example.test/source").success).toBe(true);
    // A syntactically valid signed URL is not proof of public permission.
    // Runtime projection MUST reject private/signed URLs, independently of Zod.
    expect(qaSourceUrlSchema.safeParse("https://example.test/file?signature=fixture").success).toBe(true);
  });

  it("requires non-empty source identity/title and rejects locator-free object", () => {
    expect(qaPublicCitationSchema.safeParse({ ...citation(), sourceId: "" }).success).toBe(false);
    expect(qaPublicCitationSchema.safeParse({ ...citation(), title: " " }).success).toBe(false);
    expect(qaPublicCitationSchema.safeParse({ ...citation(), locators: [{}] }).success).toBe(false);
  });
});

describe("Task 191 completed outcomes and reference integrity", () => {
  it("accepts ANSWERED and PARTIAL with explicit unanswered aspects", () => {
    expect(qaCompletedTurnSchema.safeParse(answered()).success).toBe(true);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), status: "PARTIAL", unansweredAspects: ["Chưa đủ dữ liệu về thời điểm."] }).success).toBe(true);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), status: "PARTIAL" }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), unansweredAspects: ["Phần thiếu"] }).success).toBe(false);
  });

  it("accepts server-controlled insufficient message only", () => {
    expect(qaCompletedTurnSchema.safeParse(insufficient()).success).toBe(true);
    expect(qaCompletedTurnSchema.safeParse({ ...insufficient(), message: "Model invented failure message" }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse(without(insufficient(), "message")).success).toBe(false);
  });

  it("bounds and normalizes clarification, without proving semantic safety", () => {
    expect(qaCompletedTurnSchema.safeParse(clarification()).success).toBe(true);
    for (const value of ["", " ", "a".repeat(2001)]) {
      expect(qaCompletedTurnSchema.safeParse({ ...clarification(), clarificationQuestion: value }).success).toBe(false);
    }
    expect(qaCompletedTurnSchema.safeParse(without(clarification(), "clarificationQuestion")).success).toBe(false);
  });

  it.each([insufficient(), clarification()])("forbids factual parts/citations in non-answer outcome %j", (turn) => {
    expect(qaCompletedTurnSchema.safeParse({ ...turn, answerParts: answered().answerParts }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...turn, citations: [citation()] }).success).toBe(false);
  });

  it.each([
    { text: "", citationIds: ["c1"] },
    { text: " ", citationIds: ["c1"] },
    { text: "Nội dung", citationIds: [] },
    { text: "Nội dung", citationIds: ["c1"], evidence: "private" },
  ])("requires evidence-referencing non-empty answer part %j", (part) => {
    expect(qaAnswerPartSchema.safeParse(part).success).toBe(false);
  });

  it("rejects empty answer/citation arrays for ANSWERED and PARTIAL", () => {
    for (const status of ["ANSWERED", "PARTIAL"]) {
      const turn = { ...answered(), status, unansweredAspects: status === "PARTIAL" ? ["Phần thiếu"] : [] };
      expect(qaCompletedTurnSchema.safeParse({ ...turn, answerParts: [] }).success).toBe(false);
      expect(qaCompletedTurnSchema.safeParse({ ...turn, citations: [] }).success).toBe(false);
    }
  });

  it("rejects dangling, duplicate and unreferenced citation IDs", () => {
    const part = answered().answerParts[0]!;
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), answerParts: [{ ...part, citationIds: ["missing"] }] }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), answerParts: [{ ...part, citationIds: ["c1", "c1"] }] }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), citations: [citation(), citation()] }).success).toBe(false);
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), citations: [citation(), { ...citation(), id: "c2" }] }).success).toBe(false);
  });

  it("supports multiple citations per part and reuse across parts", () => {
    const turn = answered();
    turn.citations.push({ ...citation(), id: "c2", locators: [{ pageNumber: 7 }] });
    turn.answerParts[0]!.citationIds.push("c2");
    turn.answerParts.push({ text: "Phần fixture khác.", citationIds: ["c1"] });
    expect(qaCompletedTurnSchema.safeParse(turn).success).toBe(true);
  });

  it.each(["conversationId", "turnId", "turnState", "context"])("requires completed identity field %s", (key) => {
    expect(qaCompletedTurnSchema.safeParse(without(answered(), key)).success).toBe(false);
  });

  it.each([
    { status: "AI_UNAVAILABLE" },
    { answerText: "Duplicate text" },
    { notice: null },
    { clarificationQuestion: "Wrong branch" },
    { context: { type: "DESTINATION", destinationId: "dest_01" } },
    { turnState: "PROCESSING" },
  ])("rejects mixed/inactive response fields %j", (extra) => {
    expect(qaCompletedTurnSchema.safeParse({ ...answered(), ...extra }).success).toBe(false);
  });
});

describe("Task 191 shared envelope and runtime boundaries", () => {
  it("is compatible with shared MutationApiResponse without changing helpers", () => {
    const parsed = qaResponseSchema.parse({ success: true, operationStatus: "SUCCESS", data: answered() });
    const shared: MutationApiResponse<QaCompletedTurn> = parsed;
    expect(shared.operationStatus).toBe("SUCCESS");
  });

  it("separates validation, technical failure and unknown completion", () => {
    for (const code of ["INVALID_REQUEST", "AI_UNAVAILABLE", "AI_INVALID_RESPONSE", "INTERNAL_SERVER_ERROR"]) {
      expect(qaResponseSchema.safeParse({ success: false, operationStatus: "FAILED", error: { code, message: "Thông báo đã làm sạch." } }).success).toBe(true);
    }
    const unknown = { success: false, operationStatus: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác định kết quả ghi." }, retryWithSameKey: true };
    expect(qaResponseSchema.safeParse(unknown).success).toBe(true);
    expect(qaResponseSchema.safeParse(without(unknown, "retryWithSameKey")).success).toBe(false);
    expect(qaResponseSchema.safeParse({ ...unknown, retryWithSameKey: false }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ ...unknown, error: { code: "AI_UNAVAILABLE", message: "Lỗi AI" } }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ success: false, operationStatus: "FAILED", error: unknown.error }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ success: false, operationStatus: "FAILED", error: { code: "INSUFFICIENT_SOURCE", message: "Thiếu nguồn" } }).success).toBe(false);
  });

  it("rejects contradictory success, unknown content and pending admission", () => {
    expect(qaResponseSchema.safeParse({ success: false, operationStatus: "SUCCESS", data: answered() }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ success: true, operationStatus: "UNKNOWN", data: answered() }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ success: true, operationStatus: "SUCCESS", data: { ...identity(), turnState: "PROCESSING" } }).success).toBe(false);
    expect(qaResponseSchema.safeParse({ success: true, operationStatus: "SUCCESS", data: { ...answered(), turnState: "ACCEPTED" } }).success).toBe(false);
  });

  it("defines required idempotency scalar and body boundary without an HTTP parser", () => {
    expect(QA_IDEMPOTENCY_HEADER).toBe("Idempotency-Key");
    expect(qaIdempotencyKeySchema.parse(" key_fixture ")).toBe("key_fixture");
    for (const key of [undefined, "", " ", "a".repeat(201)]) {
      expect(qaIdempotencyKeySchema.safeParse(key).success).toBe(false);
    }
    expect(QA_BODY_MAX_BYTES).toBe(16 * 1024);
  });

  it("maps HTTP policy while keeping content outcomes separate", () => {
    expect(QA_ERROR_HTTP_STATUS.INVALID_REQUEST).toBe(400);
    expect(QA_ERROR_HTTP_STATUS.PAYLOAD_TOO_LARGE).toBe(413);
    expect(QA_ERROR_HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE).toBe(415);
    expect(QA_ERROR_HTTP_STATUS.UNAUTHENTICATED).toBe(401);
    expect(QA_ERROR_HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(QA_ERROR_HTTP_STATUS.CONTEXT_UNAVAILABLE).toBe(404);
    expect(QA_ERROR_HTTP_STATUS.CONVERSATION_STALE).toBe(409);
    expect(QA_ERROR_HTTP_STATUS.CONVERSATION_BUSY).toBe(409);
    expect(QA_ERROR_HTTP_STATUS.IDEMPOTENCY_KEY_REUSED).toBe(409);
    expect(QA_ERROR_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(QA_ERROR_HTTP_STATUS.AI_UNAVAILABLE).toBe(503);
    expect(QA_ERROR_HTTP_STATUS.AI_INVALID_RESPONSE).toBe(502);
    expect(QA_ERROR_HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    expect(QA_ERROR_HTTP_STATUS.OPERATION_STATUS_UNKNOWN).toBe(503);
  });
});

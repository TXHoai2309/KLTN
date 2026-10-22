import {
  QA_INSUFFICIENT_SOURCE_MESSAGE,
  type QaCompletedTurn,
  type QaConversationDetailMetadata,
  type QaRequest,
} from "../qa-contract";

// Synthetic wire data for FE integration only. These are not product sources,
// server authorization credentials, or a runtime fallback when QA is unavailable.
const context = { type: "DESTINATION" as const, destinationId: "panel_destination_fixture" };
const firstRequest = {
  question: "Điểm kiểm thử có gì?", context, knowledgeMode: "SOURCE_ONLY",
} satisfies QaRequest;
const firstTurn = {
  conversationId: "panel_conversation_fixture", turnId: "panel_turn_1", turnState: "COMPLETED",
  context, knowledgeMode: "SOURCE_ONLY", status: "ANSWERED",
  answerParts: [{ text: "Đây là dữ kiện giả lập từ tài liệu kiểm thử.", mode: "SOURCE", citationIds: ["panel_citation_1"] }],
  citations: [{ id: "panel_citation_1", sourceId: "panel_source_fixture", title: "Nguồn giả lập — không phải nguồn sản phẩm", sourceUrl: null, locators: [] }],
  unansweredAspects: [],
} satisfies QaCompletedTurn;
const followUpRequest = {
  conversationId: firstTurn.conversationId, parentTurnId: firstTurn.turnId,
  question: "Nên chuẩn bị gì?", knowledgeMode: "EXPANDED",
} satisfies QaRequest;
const followUpTurn = {
  ...firstTurn, turnId: "panel_turn_2", knowledgeMode: "EXPANDED",
  answerParts: [{ text: "Gợi ý giả lập để kiểm tra nhãn kiến thức mở rộng.", mode: "EXPANDED", citationIds: [] }], citations: [],
} satisfies QaCompletedTurn;
const conversation = {
  id: firstTurn.conversationId, title: "Hội thoại kiểm thử", context, knowledgeMode: "EXPANDED",
  headTurnId: followUpTurn.turnId, createdAt: "2026-10-22T00:00:00.000Z", lastActivityAt: "2026-10-22T00:01:00.000Z",
} satisfies QaConversationDetailMetadata;
const history = [
  { question: firstRequest.question, response: firstTurn },
  { question: followUpRequest.question, response: followUpTurn },
];

export const qaPanelWireFixtures = {
  session: { success: true, data: { identity: "GUEST:panel_identity_fixture" } },
  first: { key: "panel_first_key", request: firstRequest, response: { success: true, operationStatus: "SUCCESS", data: firstTurn } },
  followUp: { key: "panel_followup_key", request: followUpRequest, response: { success: true, operationStatus: "SUCCESS", data: followUpTurn } },
  insufficient: { success: true, operationStatus: "SUCCESS", data: {
    conversationId: firstTurn.conversationId, turnId: firstTurn.turnId, turnState: "COMPLETED", context,
    knowledgeMode: "SOURCE_ONLY", status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [],
    message: QA_INSUFFICIENT_SOURCE_MESSAGE, reason: "NO_EVIDENCE",
  } },
  get: { success: true, data: history, conversation },
  turns: [
    { success: true, data: { turns: history.slice(0, 1), hasMore: true, nextCursor: firstTurn.turnId } },
    { success: true, data: { turns: history.slice(1), hasMore: false, nextCursor: null } },
  ],
  preference: { request: { knowledgeMode: "EXPANDED" }, response: {
    success: true, operationStatus: "SUCCESS", data: { id: conversation.id, title: conversation.title, knowledgeMode: "EXPANDED" },
  } },
  unavailable: { success: false, operationStatus: "FAILED", error: { code: "CONTEXT_UNAVAILABLE", message: "Không thể xử lý yêu cầu (CONTEXT_UNAVAILABLE)." } },
  unknown: { success: false, operationStatus: "UNKNOWN", retryWithSameKey: true, error: {
    code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác nhận thao tác. Thử lại với cùng nội dung và Idempotency-Key.",
  } },
} as const;

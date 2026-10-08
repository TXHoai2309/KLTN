import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaRequestSchema } from "../src/modules/ai/qa-contract";
import type { AssistantAttempt, AssistantTransport, AssistantTransportResult } from "../src/components/assistant/assistant-controller";
import { citationFixture, type CitationFixture } from "./assistant-citation-fixtures";

export const DEMO_FIXTURE_MARKER = "TASK195_DEVELOPMENT_FIXTURE_ONLY";
export type DemoScenario = "ANSWERED" | "PARTIAL" | "INSUFFICIENT_SOURCE" | "CLARIFICATION_REQUIRED" | "FAILED" | "UNKNOWN" | "NETWORK" | "MALFORMED";

/** In-memory deterministic simulation. No fetch, real sources, identity or DB. */
export class DemoAssistantTransport implements AssistantTransport {
  scenario: DemoScenario = "ANSWERED";
  delayMs = 600;
  citationScenario: CitationFixture = "ONE";
  private responses = new Map<string, AssistantTransportResult>();
  private seen = new Set<string>();
  private counter = 0;
  async send(attempt: AssistantAttempt, signal: AbortSignal): Promise<AssistantTransportResult> {
    const scenario = this.scenario;
    const sourceFixture = citationFixture(this.citationScenario);
    if (this.delayMs) await new Promise<void>((resolve, reject) => {
      const done = () => { signal.removeEventListener("abort", aborted); resolve(); };
      const timer = setTimeout(done, this.delayMs);
      const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(new Error("Demo client stopped waiting")); };
      if (signal.aborted) aborted(); else signal.addEventListener("abort", aborted, { once: true });
    });
    if (this.seen.has(attempt.key)) return this.responses.get(attempt.key)!;
    const request = qaRequestSchema.parse(JSON.parse(attempt.body));
    const index = ++this.counter;
    const identity = {
      conversationId: "conversationId" in request ? request.conversationId : `conv_demo_${index}`,
      turnId: `turn_demo_${index}`, turnState: "COMPLETED", context: { type: "GENERAL" },
    };
    const answered = {
      ...sourceFixture,
      ...identity, status: "ANSWERED", unansweredAspects: [],
    };
    let data: unknown = answered;
    if (scenario === "PARTIAL") data = { ...answered, status: "PARTIAL", unansweredAspects: ["Phần kiểm thử chưa có dữ liệu mô phỏng."] };
    if (scenario === "INSUFFICIENT_SOURCE") data = { ...identity, status: scenario, answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE };
    if (scenario === "CLARIFICATION_REQUIRED") data = { ...identity, status: scenario, answerParts: [], citations: [], clarificationQuestion: "Bạn muốn thử nhánh giao diện nào tiếp theo?" };
    const completed: AssistantTransportResult = { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data } };
    const result: AssistantTransportResult = scenario === "FAILED"
      ? { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Lỗi kỹ thuật mô phỏng. Bạn có thể sửa và gửi lại câu hỏi." } } }
      : completed;
    this.responses.set(attempt.key, result);
    this.seen.add(attempt.key);
    if (scenario === "UNKNOWN") return { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "UNKNOWN", retryWithSameKey: true, error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác nhận kết quả mô phỏng." } } };
    if (scenario === "NETWORK") return { kind: "networkAmbiguity" };
    if (scenario === "MALFORMED") return { kind: "response", httpStatus: 200, body: { success: true, data: { answerText: "Không được render nội dung malformed này." } } };
    return result;
  }
}

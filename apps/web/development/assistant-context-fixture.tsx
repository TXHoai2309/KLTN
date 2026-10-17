// Browser QA only: no API, database, provider or product facts.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AssistantChat, AssistantShell } from "../src/components/assistant/assistant-chat";
import type { AssistantTransport } from "../src/components/assistant/assistant-controller";
import type { QaContext } from "../src/modules/ai/qa-contract";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "../src/modules/ai/qa-contract";
import "../src/components/assistant/assistant.css";

const destinations = [{ id: "synthetic_a", name: "Điểm kiểm thử A" }, { id: "synthetic_b", name: "Điểm kiểm thử B với tên dài để kiểm tra màn hình nhỏ" }];
function Fixture() {
  const [scenario, setScenario] = useState("success");
  const [available, setAvailable] = useState(true);
  const [requests, setRequests] = useState<string[]>([]);
  const [transport] = useState<AssistantTransport>(() => {
    const contexts = new Map<string, QaContext>();
    let count = 0;
    return { send: async attempt => {
      setRequests(current => [...current, attempt.body]);
      const mode = document.querySelector<HTMLSelectElement>("#fixture-scenario")?.value;
      if (mode === "slow") await new Promise(resolve => setTimeout(resolve, 600));
      if (mode === "unknown") return { kind: "networkAmbiguity" };
      if (mode === "technical") return { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau." } } };
      if (mode === "failed") return { kind: "response", httpStatus: 404, body: { success: false, operationStatus: "FAILED", error: { code: "CONTEXT_UNAVAILABLE", message: "Bối cảnh điểm đến không còn khả dụng." } } };
      const conversationId = "conversationId" in attempt.payload ? attempt.payload.conversationId : `conv_fixture_${++count}`;
      const context = "conversationId" in attempt.payload ? contexts.get(conversationId)! : attempt.payload.context;
      contexts.set(conversationId, context);
      const base = { conversationId, turnId: `turn_fixture_${requests.length}_${Date.now()}`, turnState: "COMPLETED", context };
      if (["paragraphs", "list", "table", "partial", "slow", "excerpts"].includes(mode ?? "")) return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: {
        ...base, status: mode === "partial" ? "PARTIAL" : "ANSWERED",
        ...(mode === "excerpts" ? { answerMode: "SOURCE_EXCERPTS" } : {}),
        ...(mode === "paragraphs" ? {} : { presentation: mode === "table" ? "TABLE" : mode === "list" ? "LIST" : "PARAGRAPHS" }),
        answerParts: [
          { text: "Địa chất: Điểm kiểm thử A có địa hình và hóa thạch hư cấu để kiểm tra giao diện.", citationIds: ["c1"] },
          { text: "Văn hóa: Điểm kiểm thử B có truyền thống dân tộc hư cấu; danh hiệu UNESCO trong ví dụ này cũng chỉ là dữ liệu kiểm thử.", citationIds: ["c1"] },
        ],
        citations: [{ id: "c1", sourceId: "fixture_source", title: "Nguồn hư cấu — không phải thông tin du lịch", sourceUrl: null, locators: [{ section: "Kiểm thử giao diện" }] }],
        unansweredAspects: mode === "partial" ? ["Chưa xác minh được thông tin trong hồ sơ còn áp dụng tại thời điểm bạn hỏi."] : [],
      } } };
      if (mode === "verification") return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { ...base, status: "INSUFFICIENT_SOURCE", reason: "ANSWER_VERIFICATION", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [] } } };
      if (mode === "no-evidence" || mode === "missing-support") return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { ...base, status: "INSUFFICIENT_SOURCE", reason: mode === "no-evidence" ? "NO_EVIDENCE" : "MISSING_SUPPORT", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [] } } };
      return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { conversationId, turnId: `turn_fixture_${requests.length}_${Date.now()}`, turnState: "COMPLETED", context, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE } } };
    } };
  });
  return <>
    <div><strong>US22/US23 — deterministic browser fixture only</strong> <label htmlFor="fixture-scenario">Response</label><select id="fixture-scenario" value={scenario} onChange={event => setScenario(event.target.value)}><option value="success">Insufficient source</option><option value="no-evidence">No evidence</option><option value="missing-support">Missing support</option><option value="paragraphs">Legacy paragraphs</option><option value="list">List</option><option value="table">Table</option><option value="partial">Partial</option><option value="excerpts">Reviewed excerpts</option><option value="verification">Verification rejected</option><option value="slow">Slow</option><option value="technical">Technical failure</option><option value="unknown">Unknown</option><option value="failed">Unavailable</option></select>
      <button onClick={() => setAvailable(value => !value)}>Toggle auth revalidation</button>
      <a href="#other-destination">View unrelated content</a>
    </div>
    <AssistantShell><AssistantChat transport={transport} identity="fixture_guest" available={available} syncContextUrl initialContext={{ type: "DESTINATION", destinationId: "synthetic_a" }} destinations={destinations} /></AssistantShell>
    <output aria-label="Recorded requests">{JSON.stringify(requests)}</output>
    <div id="other-destination">Unrelated content. Opening this section never sets assistant context.</div>
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);

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
      if (mode === "unknown") return { kind: "networkAmbiguity" };
      if (mode === "technical") return { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau." } } };
      if (mode === "failed") return { kind: "response", httpStatus: 404, body: { success: false, operationStatus: "FAILED", error: { code: "CONTEXT_UNAVAILABLE", message: "Bối cảnh điểm đến không còn khả dụng." } } };
      const conversationId = "conversationId" in attempt.payload ? attempt.payload.conversationId : `conv_fixture_${++count}`;
      const context = "conversationId" in attempt.payload ? contexts.get(conversationId)! : attempt.payload.context;
      contexts.set(conversationId, context);
      return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { conversationId, turnId: `turn_fixture_${requests.length}_${Date.now()}`, turnState: "COMPLETED", context, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE } } };
    } };
  });
  return <>
    <div><strong>US22/US23 — deterministic browser fixture only</strong> <label htmlFor="fixture-scenario">Response</label><select id="fixture-scenario" value={scenario} onChange={event => setScenario(event.target.value)}><option value="success">Success</option><option value="technical">Technical failure</option><option value="unknown">Unknown</option><option value="failed">Unavailable</option></select>
      <button onClick={() => setAvailable(value => !value)}>Toggle auth revalidation</button>
      <a href="#other-destination">View unrelated content</a>
    </div>
    <AssistantShell><AssistantChat transport={transport} identity="fixture_guest" available={available} syncContextUrl initialContext={{ type: "DESTINATION", destinationId: "synthetic_a" }} destinations={destinations} /></AssistantShell>
    <output aria-label="Recorded requests">{JSON.stringify(requests)}</output>
    <div id="other-destination">Unrelated content. Opening this section never sets assistant context.</div>
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);

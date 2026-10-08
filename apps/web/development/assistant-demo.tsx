import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AssistantChat, AssistantShell } from "../src/components/assistant/assistant-chat";
import { DemoAssistantTransport, DEMO_FIXTURE_MARKER, type DemoScenario } from "./assistant-demo-transport";
import "../src/components/assistant/assistant.css";

function Demo() {
  const [transport] = useState(() => new DemoAssistantTransport());
  const [dark, setDark] = useState(false);
  const [scenario, setScenario] = useState<DemoScenario>("ANSWERED");
  return <div className={dark ? "dark" : ""} data-demo={DEMO_FIXTURE_MARKER}>
    <div className="demo-controls"><strong>DEMO / DỮ LIỆU MÔ PHỎNG</strong>
      <label>Nhánh kiểm thử <select value={scenario} onChange={(event) => { const value = event.target.value as DemoScenario; setScenario(value); transport.scenario = value; }}>
        {["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED", "FAILED", "UNKNOWN", "NETWORK", "MALFORMED"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Độ trễ <select defaultValue="600" onChange={(event) => { transport.delayMs = Number(event.target.value); }}><option value="600">600 ms</option><option value="3000">3 giây</option></select></label>
      <button onClick={() => setDark(!dark)}>Đổi giao diện {dark ? "sáng" : "tối"}</button>
    </div>
    <AssistantShell><AssistantChat transport={transport} identity="demo-local-session" demo /></AssistantShell>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Demo />);

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, Sun } from "lucide-react";
import { AssistantAnswer, AssistantChat, AssistantShell } from "../src/components/assistant/assistant-chat";
import { citationFixture, type CitationFixture } from "./assistant-citation-fixtures";
import { DemoAssistantTransport, DEMO_FIXTURE_MARKER, type DemoScenario } from "./assistant-demo-transport";
import "../src/components/assistant/assistant.css";
import "./assistant-demo.css";

function Demo() {
  const [transport] = useState(() => new DemoAssistantTransport());
  const [dark, setDark] = useState(false);
  const [scenario, setScenario] = useState<DemoScenario>("ANSWERED");
  const [sources, setSources] = useState<CitationFixture>("ONE");
  const [previewWidth, setPreviewWidth] = useState(0);
  const [invalidUrl, setInvalidUrl] = useState(false);
  const preview = citationFixture(sources);
  if (invalidUrl) preview.citations = preview.citations.map((citation) => ({ ...citation, sourceUrl: "javascript:alert(1)" }));
  return <div className={dark ? "dark" : ""} data-demo={DEMO_FIXTURE_MARKER}>
    <div className="demo-controls"><div className="demo-controls-inner"><strong>DEMO / DỮ LIỆU MÔ PHỎNG</strong>
      <label>Nhánh kiểm thử <select value={scenario} onChange={(event) => { const value = event.target.value as DemoScenario; setScenario(value); transport.scenario = value; }}>
        {["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED", "FAILED", "UNKNOWN", "NETWORK", "MALFORMED"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Độ trễ <select defaultValue="600" onChange={(event) => { transport.delayMs = Number(event.target.value); }}><option value="600">600 ms</option><option value="3000">3 giây</option></select></label>
      <label>Nguồn mô phỏng <select value={sources} onChange={(event) => { const value = event.target.value as CitationFixture; setSources(value); transport.citationScenario = value; }}>
        {["ONE", "MULTI", "LONG", "MANY"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Container kiểm thử <select value={previewWidth} onChange={(event) => setPreviewWidth(Number(event.target.value))}>
        <option value={0}>Ẩn</option>{[320, 360, 420].map((value) => <option key={value} value={value}>{value}px</option>)}
      </select></label>
      <label><input type="checkbox" checked={invalidUrl} onChange={(event) => setInvalidUrl(event.target.checked)} />URL sai trong renderer test</label>
      <button onClick={() => setDark(!dark)}>{dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}Giao diện {dark ? "sáng" : "tối"}</button>
    </div></div>
    <AssistantShell><AssistantChat transport={transport} identity="demo-local-session" demo /></AssistantShell>
    {!!previewWidth && <section aria-label="Renderer sandbox development only" style={{ width: previewWidth, maxWidth: "100%", margin: "16px auto", padding: 12, boxSizing: "border-box" }}>
      <strong>DEMO / DỮ LIỆU MÔ PHỎNG — renderer riêng, không phải completed server turn</strong>
      <AssistantAnswer turn={preview} />
    </section>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<Demo />);

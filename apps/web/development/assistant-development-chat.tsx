"use client";

import { useId, useState } from "react";
import { AssistantChat } from "../src/components/assistant/assistant-chat";
import { DemoAssistantTransport, DEMO_FIXTURE_MARKER, type DemoScenario } from "./assistant-demo-transport";
import type { CitationFixture } from "./assistant-citation-fixtures";

/** One transport per mounted chat. Only imported by the development page branch. */
export function AssistantDevelopmentChat() {
  const [transport] = useState(() => {
    const demo = new DemoAssistantTransport();
    demo.citationScenario = "MULTI";
    return demo;
  });
  const [scenario, setScenario] = useState<DemoScenario>("ANSWERED");
  const [sources, setSources] = useState<CitationFixture>("MULTI");
  const [delay, setDelay] = useState(600);
  const id = useId();
  return <div data-demo={DEMO_FIXTURE_MARKER}>
    <details style={{ marginBottom: 12, padding: 12, border: "1px solid var(--assistant-line)", borderRadius: 8, background: "var(--assistant-soft)", fontSize: 12 }}>
      <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>DEMO / DỮ LIỆU MÔ PHỎNG · Điều khiển kiểm thử</summary>
      <p>Chỉ mô phỏng giao diện, không gọi AI, không lưu hội thoại. Chọn nhánh trước khi gửi; retry giữ nguyên kết quả của lượt cũ.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label htmlFor={`${id}-scenario`}>Nhánh kiểm thử <select id={`${id}-scenario`} value={scenario} onChange={(event) => {
          const value = event.target.value as DemoScenario; setScenario(value); transport.scenario = value;
        }} style={{ minHeight: 44, maxWidth: "100%", background: "var(--assistant-card)", color: "var(--assistant-ink)" }}>
          {["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED", "FAILED", "UNKNOWN", "NETWORK", "MALFORMED"].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label htmlFor={`${id}-sources`}>Nguồn mô phỏng <select id={`${id}-sources`} value={sources} onChange={(event) => {
          const value = event.target.value as CitationFixture; setSources(value); transport.citationScenario = value;
        }} style={{ minHeight: 44, maxWidth: "100%", background: "var(--assistant-card)", color: "var(--assistant-ink)" }}>
          {["ONE", "MULTI", "LONG", "MANY"].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label htmlFor={`${id}-delay`}>Độ trễ <select id={`${id}-delay`} value={delay} onChange={(event) => {
          const value = Number(event.target.value); setDelay(value); transport.delayMs = value;
        }} style={{ minHeight: 44, maxWidth: "100%", background: "var(--assistant-card)", color: "var(--assistant-ink)" }}>
          <option value={600}>600 ms</option><option value={3000}>3 giây</option>
        </select></label>
      </div>
    </details>
    <AssistantChat transport={transport} identity="demo-local-session" demo />
  </div>;
}

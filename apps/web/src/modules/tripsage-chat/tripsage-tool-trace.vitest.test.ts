import { describe, expect, it } from "vitest";
import { sanitizeStoredParts } from "./assistant-conversation-contract";
import { createToolTraceCollector, readConversationTrace, TOOL_TRACE_PART } from "./tripsage-tool-trace";

describe("operator tool trace", () => {
  it("records input, output and errors, keeps memory tools private and bounds large values", () => {
    const trace = createToolTraceCollector(["remember"]);
    trace.input("c1", "proposeItinerary", { selection: { days: [["a", "a"]] } });
    trace.error("c1", "INVALID_AI_PLAN: Điểm \"a\" bị lặp");
    trace.input("c2", "remember", { text: "bí mật" });
    trace.output("c2", { ok: true, saved: "bí mật" });
    trace.input("c3", "listDestinations", {});
    trace.output("c3", { items: "x".repeat(10_000) });
    const snapshot = trace.snapshot()!;
    expect(snapshot.entries[0]).toMatchObject({ tool: "proposeItinerary", error: expect.stringContaining("bị lặp") });
    expect(JSON.stringify(snapshot)).not.toContain("bí mật");
    expect(String(snapshot.entries[2]!.output)).toContain("[cắt bớt]");
  });

  it("is dropped from the user read path and returned by the admin read", async () => {
    const parts = [{ type: "text", text: "Chào" }, { type: TOOL_TRACE_PART, data: { v: 1, entries: [{ tool: "findOrigin", callId: "c1" }] } }];
    expect(sanitizeStoredParts(parts)).toEqual([{ type: "text", text: "Chào" }]);
    const db = { assistantConversation: { findUnique: async () => ({ id: "conv-12345678", title: "t", userId: "u", messages: [{ role: "assistant", createdAt: new Date("2026-11-22T00:00:00Z"), parts }] }) } };
    const read = await readConversationTrace(db, "conv-12345678");
    expect(read?.turns[0]).toMatchObject({ text: "Chào", tools: [{ tool: "findOrigin" }] });
  });
});

import { describe, expect, it, vi } from "vitest";
import { PlanningClient } from "./planning-client";
import { EMPTY_PLANNING_NEEDS, type PlanningRequest, type PlanningWorkspace } from "../../modules/assistant-planning/planning-contract";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";

function scenario(loseCheckpoint = false) {
  let stored: PlanningWorkspace = { conversationId: "history", version: 0, needs: structuredClone(EMPTY_PLANNING_NEEDS), pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" }, dialogueRevision: 0, checkpoint: null, exchanges: [] };
  const replies = new Map<string, unknown>();
  const call = vi.fn(async (body: string, key: string): Promise<unknown> => {
    const request = JSON.parse(body) as PlanningRequest;
    if (request.action === "START" || request.action === "READ") return structuredClone(stored);
    if (request.action === "ANALYZE") return { intent: "NEEDS", needs: { ...request.draft, requirement: { durationDays: 3 } }, unresolved: [], message: "" };
    if (request.action === "CHECKPOINT") {
      if (replies.has(key)) return replies.get(key);
      expect(request.revision).toBe(stored.dialogueRevision);
      stored = { ...stored, dialogueRevision: request.revision + 1, checkpoint: request.checkpoint, exchanges: [...stored.exchanges!, ...request.exchanges] };
      const reply = { conversationId: "history", dialogueRevision: stored.dialogueRevision };
      replies.set(key, reply);
      if (loseCheckpoint) { loseCheckpoint = false; throw Error("lost checkpoint response"); }
      return reply;
    }
    throw Error("No generation, REVIEW or Save expected");
  });
  return { call, read: () => stored, client: () => new PlanningClient("USER:history", call) };
}

describe("durable planning conversation separate from Trip Save", () => {
  it("keeps rendered proposal snapshots in memory without including them in durable dialogue writes", async () => {
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    const generated = { proposal, selection: { days: [["a"]] }, attempts: [{ status: proposal.status, checks: [] }], repairError: null, version: 2 };
    const calls: PlanningRequest[] = [];
    const client = new PlanningClient("USER:transient-card", async body => {
      const request = JSON.parse(body) as PlanningRequest; calls.push(request);
      const workspace = { conversationId: "transient-card", version: 0, needs: fixtureNeeds, pendingSaveKey: null, savedTripId: null, dialogueRevision: 0 };
      if (request.action === "START") return workspace;
      if (request.action === "REVIEW") return { ...workspace, version: 1 };
      if (request.action === "GENERATE") return generated;
      if (request.action === "CHECKPOINT") return { dialogueRevision: 1 };
      throw Error("No other writes");
    });
    await client.start(null); await client.generate();
    expect(client.getSnapshot().messages.at(-1)?.proposal?.proposal.proposalId).toBe(proposal.proposalId);
    const checkpoint = calls.find(request => request.action === "CHECKPOINT")!;
    expect(checkpoint.action).toBe("CHECKPOINT");
    expect(JSON.stringify(checkpoint)).not.toContain("proposalId");
    expect(JSON.stringify(checkpoint)).not.toContain('"arrivalMinute"');
    client.reopenHistory();
    expect(client.getSnapshot().messages.at(-1)?.proposal).toBeUndefined();
  });
  it("restores an unfinished conversation and continues the missing question", async () => {
    const test = scenario(), first = test.client();
    await first.send("Tôi muốn lập hành trình 3 ngày", null);
    expect(test.read().needs).toEqual(EMPTY_PLANNING_NEEDS);
    const reopened = test.client(); await reopened.restore("history");
    expect(reopened.getSnapshot().draft.requirement.durationDays).toBe(3);
    expect(reopened.getSnapshot().messages).toEqual(first.getSnapshot().messages);
    expect(reopened.getSnapshot().prompt).toEqual({ kind: "NEED", field: "transport" });
    reopened.reopenHistory();
    expect(reopened.getSnapshot().messages).toHaveLength(1);
    expect(reopened.getSnapshot().message).not.toContain("hết hiệu lực");
  });
  it("retries a lost checkpoint acknowledgement with the identical operation and no duplicate turn", async () => {
    const test = scenario(true), client = test.client();
    await client.send("Tôi muốn lập hành trình 3 ngày", null);
    expect(client.getSnapshot().uncertain).toBe(true);
    await client.reconcile();
    expect(client.getSnapshot().uncertain).toBe(false);
    const checkpointCalls = test.call.mock.calls.filter(([body]) => JSON.parse(body).action === "CHECKPOINT");
    expect(checkpointCalls).toHaveLength(2);
    expect(checkpointCalls[0]).toEqual(checkpointCalls[1]);
    expect(test.read().exchanges).toHaveLength(1);
    expect(test.call.mock.calls.filter(([body]) => JSON.parse(body).action === "ANALYZE")).toHaveLength(1);
  });
  it("keeps old text but asks for a fresh date when a restored date has expired", async () => {
    const client = new PlanningClient("USER:expired-history", async () => ({ conversationId: "expired-history", version: 0, dialogueRevision: 1, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, today: "2026-11-20", checkpoint: { needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 3, transport: "MOTORCYCLE", startDate: "2026-11-15" } }, unresolved: [], resume: "NEEDS" }, exchanges: [{ id: "old-date", question: "15 tháng 11", reply: "Bạn thích trải nghiệm nào?", at: 1 }] }));
    await client.restore("expired-history");
    expect(client.getSnapshot().messages).toHaveLength(1);
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
    expect(client.getSnapshot().message).toContain("đã qua");
  });
});

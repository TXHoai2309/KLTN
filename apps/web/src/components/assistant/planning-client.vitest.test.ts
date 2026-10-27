import { describe, expect, it, vi } from "vitest";
import { PlanningClient, PlanningClientError, getPlanningClient } from "./planning-client";
import { EMPTY_PLANNING_NEEDS } from "../../modules/assistant-planning/planning-contract";
import { fixtureNeeds, planningCandidate, fixtureRoutes, planningNow } from "../../test/planning-fixtures";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";
const workspace = { conversationId: "chat-a", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null };
describe("Planning conversation recovery", () => {
  it("lets a Guest ask public QA after a planning login invitation, retaining the original intent", async () => {
    const call = vi.fn();
    const client = new PlanningClient("GUEST:a", call);
    await client.send("Tôi muốn lập hành trình 3 ngày", null, { type: "GENERAL" });
    expect(await client.send("Mã Pí Lèng có gì hay?", null)).toBe("QA");
    expect(client.getSnapshot().authIntent?.text).toBe("Tôi muốn lập hành trình 3 ngày");
    expect(client.getSnapshot().messages.some(m => m.question === "Mã Pí Lèng có gì hay?")).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });
  it("retains a Guest invitation when public QA attaches its conversation ID", async () => {
    const client = getPlanningClient("GUEST:invitation", null, "same-chat:0");
    await client.send("Tôi muốn lập hành trình", null);
    expect(getPlanningClient("GUEST:invitation", "qa-created-id", "same-chat:0")).toBe(client);
    expect(getPlanningClient("GUEST:invitation", null, "same-chat:1").getSnapshot().authIntent).toBeUndefined();
  });
  it("separates an independent public question from a mixed Guest planning request", async () => {
    const client = new PlanningClient("GUEST:mixed");
    const text = "Tôi muốn lập hành trình 3 ngày, Mã Pí Lèng có gì hay?";
    expect(await client.send(text, null)).toBe("QA");
    expect(client.publicQuestion(text)).toBe("Mã Pí Lèng có gì hay?");
    expect(client.getSnapshot().authIntent?.text).toBe(text);
    expect(client.getSnapshot().workspace).toBeNull();
  });
  it("shows the submitted question before START and replaces the pending exchange exactly once", async () => {
    let release!: (value: unknown) => void;
    const call = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValueOnce({ intent: "NEEDS", needs: EMPTY_PLANNING_NEEDS, unresolved: [], message: "" });
    const client = new PlanningClient("USER:a", call);
    const sending = client.send("Tôi muốn tạo hành trình", null);
    expect(client.getSnapshot().messages).toEqual([expect.objectContaining({ question: "Tôi muốn tạo hành trình", reply: "" })]);
    release(workspace); await sending;
    expect(client.getSnapshot().messages).toHaveLength(1);
    expect(client.getSnapshot().messages[0]?.reply).toContain("mấy ngày");
  });

  it("does not silently defer the departure date based on a model flag in an unrelated answer", async () => {
    const call = vi.fn().mockResolvedValueOnce(workspace).mockResolvedValueOnce({
      intent: "NEEDS", needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 3, transport: "MOTORCYCLE" } },
      unresolved: [], message: "", dateDeferred: true,
    });
    const client = new PlanningClient("USER:a", call); await client.start(null); await client.analyze("3 ngày, xe máy");
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
    expect(client.getSnapshot().dateDeferred).toBe(false);
  });
  it("asks for the departure date when regenerating old needs with no explicit deferral", async () => {
    const client = new PlanningClient("USER:a", async () => ({ ...workspace, needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 3, transport: "MOTORCYCLE" } } }));
    await client.restore("chat-a");
    await client.analyze("Đúng rồi, tạo đi");
    expect(client.getSnapshot().generated).toBeNull();
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
  });
  it("recovers a lost START response by retrying the identical body and key", async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValue(workspace);
    const client = new PlanningClient("USER:a", call);
    await client.start(null);
    expect(client.getSnapshot().uncertain).toBe(true);
    await client.reconcile();
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
    expect(client.getSnapshot().workspace?.conversationId).toBe("chat-a");
    expect(client.getSnapshot().uncertain).toBe(false);
  });
  it("ignores a result after account invalidation", async () => {
    let release!: (value: unknown) => void;
    const client = new PlanningClient("USER:a", () => new Promise(resolve => { release = resolve; }));
    const starting = client.start(null);
    client.invalidate();
    release(workspace);
    await starting;
    expect(client.getSnapshot().workspace).toBeNull();
    expect(client.getSnapshot().active).toBe(false);
  });
  it("preserves Q&A draft state without changing planning needs", async () => {
    const call = vi.fn().mockResolvedValueOnce(workspace).mockResolvedValueOnce({ intent: "QA", needs: EMPTY_PLANNING_NEEDS, unresolved: [], message: "" });
    const client = new PlanningClient("USER:a", call);
    await client.start(null);
    const before = client.getSnapshot().draft;
    expect(await client.analyze("Mã Pí Lèng có gì hay?")).toBe("QA");
    expect(client.getSnapshot().draft).toEqual(before);
  });
  it("does not treat a known auth denial as an uncertain write", async () => {
    const client = new PlanningClient("USER:a", async () => { throw new PlanningClientError("Đăng nhập lại", 401, "UNAUTHENTICATED"); });
    await client.start(null);
    expect(client.getSnapshot().uncertain).toBe(false);
  });
  it("answers QA after saving while refusing implicit saved-trip edits", async () => {
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, savedTripId: "saved" })
      .mockResolvedValueOnce({ intent: "QA", needs: EMPTY_PLANNING_NEEDS, unresolved: [], message: "" })
      .mockResolvedValueOnce({ intent: "EDIT", needs: EMPTY_PLANNING_NEEDS, unresolved: [], message: "" });
    const client = new PlanningClient("USER:a", call); await client.start("chat-a");
    expect(await client.analyze("Mã Pí Lèng có gì hay?")).toBe("QA");
    expect(await client.analyze("Bỏ ngày 2")).toBe("HANDLED");
    expect(client.getSnapshot().error).toContain("Chuyến này đã lưu");
    expect(client.getSnapshot().savedTripId).toBe("saved");
  });
  it("keeps the original itinerary and day-specific instruction through a needs-changing edit", async () => {
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    const changed = { ...fixtureNeeds, preferredDestinationIds: ["b"], destinationNames: { b: "Điểm b" } };
    const generated = { proposal, selection: { days: [["a"]] }, attempts: [{ status: proposal.status, checks: [] }], repairError: null, version: 2 };
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds })
      .mockResolvedValueOnce({ ...workspace, version: 1, needs: fixtureNeeds }).mockResolvedValueOnce(generated)
      .mockResolvedValueOnce({ intent: "EDIT", needs: changed, message: "Kiểm tra nhu cầu mới", unresolved: [] })
      .mockResolvedValueOnce({ ...workspace, version: 3, needs: changed }).mockRejectedValueOnce(new PlanningClientError("AI unavailable", 503, "AI_UNAVAILABLE"));
    const client = new PlanningClient("USER:a", call);
    await client.start(null); await client.generate();
    await client.analyze("Thêm Điểm b vào ngày 1");
    expect(client.getSnapshot().editingFrom?.selection).toEqual({ days: [["a"]] });
    await client.generate();
    const request = JSON.parse(call.mock.calls.at(-1)![0]);
    expect(request.previous).toEqual({ days: [["a"]] });
    expect(request.instruction).toBe("Thêm Điểm b vào ngày 1");
    expect(client.getSnapshot().editingFrom?.selection).toEqual({ days: [["a"]] });
  });
  it("retains disambiguation across turns and resolves removal as removal", async () => {
    const needs = { ...fixtureNeeds, requiredDestinationIds: ["a"], destinationNames: { a: "Điểm a" } };
    const unresolved = [{ name: "Điểm", required: true, remove: true, choices: [{ id: "a", name: "Điểm a" }, { id: "b", name: "Điểm b" }] }];
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, needs }).mockResolvedValueOnce({ intent: "NEEDS", needs, message: "Chọn điểm để bỏ", unresolved }).mockResolvedValueOnce({ intent: "CLARIFY", needs, message: "Vui lòng chọn tên chính xác", unresolved });
    const client = new PlanningClient("USER:a", call);
    await client.start(null); await client.analyze("Bỏ Điểm"); await client.analyze("Đi 3 ngày");
    expect(JSON.parse(call.mock.calls.at(-1)![0]).unresolved).toEqual(unresolved);
    client.resolve(0, "a");
    expect(client.getSnapshot().draft.requiredDestinationIds).toEqual([]);
  });
});

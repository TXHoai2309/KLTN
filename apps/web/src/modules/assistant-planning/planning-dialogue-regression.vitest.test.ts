import { describe, expect, it, vi } from "vitest";
import { PlanningClient } from "../../components/assistant/planning-client";
import { applyPlanningUnderstanding, planningUnderstandingSchema } from "./planning-ai";
import { EMPTY_PLANNING_NEEDS, planningNeedsSchema, type PlanningWorkspace } from "./planning-contract";
import { choiceIndex, needsRecap, nextNeedsPrompt } from "./planning-dialogue";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";

const base = planningUnderstandingSchema.parse({ intent: "NEEDS", durationDays: null, transport: null, startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [], message: "Bạn dự định khởi hành ngày nào?", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE" });
const now = new Date("2026-10-27T03:00:00Z");
const dialogue = { question: "Bạn dự định khởi hành ngày nào?", field: "startDate" as const, recent: [], current: null };
const ready = planningNeedsSchema.parse({ ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 3, transport: "MOTORCYCLE" } });
const interpret = (text: string, draft = ready) => applyPlanningUnderstanding({ ...base, intent: "CLARIFY", departureText: text }, draft, [], [], dialogue, { text, now });

describe("Owner screenshot date and interruption regressions", () => {
  it("recognizes a copied full option line and rejects an unrelated numbered line", () => {
    const choices = [{ id: "lung-cu", name: "[TEST] Cột cờ Lũng Cú" }];
    expect(choiceIndex("1. [TEST] Cột cờ Lũng Cú — đồng văn · Dự kiến tham quan 90 phút", choices)).toBe(0);
    expect(choiceIndex("Chọn 1: [TEST] Cột cờ Lũng Cú", choices)).toBe(0);
    expect(choiceIndex("1. Điểm khác", choices)).toBe(-1);
  });
  it("normalizes 31/10 even when understanding asks the old generic clarification", () => {
    const result = interpret("31/10");
    expect(result.intent).toBe("NEEDS");
    expect(result.needs.requirement.startDate).toBe("2026-10-31");
    expect(nextNeedsPrompt(result.needs, false, false).prompt).toEqual({ kind: "NEED", field: "preferences" });
    expect(result.needs.requirement.companions).toBeNull();
  });
  it("retains other explicit needs while asking to correct an invalid date", () => {
    const result = applyPlanningUnderstanding({ ...base, durationDays: 3, transport: "MOTORCYCLE", departureText: "31/11" }, EMPTY_PLANNING_NEEDS, [], [], dialogue, { text: "Đi 3 ngày bằng xe máy, ngày 31/11", now });
    expect(result.intent).toBe("CLARIFY");
    expect(result.needs.requirement).toMatchObject({ durationDays: 3, transport: "MOTORCYCLE" });
    expect(result.needs.requirement.startDate).toBeFalsy();
  });
  it("retains the next-week window and its anchor, never Monday as the chosen date", () => {
    const result = interpret("khoảng tuần sau");
    expect(result.needs.requirement.startDate).toBeFalsy();
    expect(result.needs.departureWindow).toEqual({ from: "2026-11-02", to: "2026-11-08", anchorDate: "2026-10-27" });
    const prompt = nextNeedsPrompt(result.needs, false, false);
    expect(prompt.message).toContain("02/11/2026–08/11/2026");
    expect(prompt.message).toContain("sơ bộ");
    const deferred = applyPlanningUnderstanding({ ...base, dateDeferred: true }, result.needs, [], [], dialogue, { text: "Chưa chốt ngày", now });
    expect(deferred.needs.dateDeferred).toBe(true);
    expect(deferred.needs.departureWindow).toEqual(result.needs.departureWindow);
    expect(needsRecap(deferred.needs)).toContain("chưa chốt ngày cụ thể");
  });
  it("confirms replacing a precise date with a window before discarding the date", async () => {
    const draft = { ...ready, requirement: { ...ready.requirement, startDate: "2026-10-31" } };
    const analysis = interpret("khoảng tuần sau", draft);
    expect(analysis.needs.requirement.startDate).toBe("2026-10-31");
    expect(analysis.dateConfirmation?.requirement.startDate).toBeUndefined();
    const call = vi.fn().mockResolvedValueOnce({ conversationId: "date-change", version: 0, needs: draft, pendingSaveKey: null, savedTripId: null, today: "2026-10-27" }).mockResolvedValueOnce(analysis);
    const client = new PlanningClient("USER:date-change", call);
    await client.start(null); await client.analyze("khoảng tuần sau");
    expect(client.getSnapshot().prompt?.kind).toBe("DATE_CHANGE");
    await client.analyze("Đồng ý");
    expect(client.getSnapshot().draft.requirement.startDate).toBeFalsy();
    expect(client.getSnapshot().message).toContain("02/11/2026");
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("does not trust an unspoken model date or mutate needs from dated public QA", () => {
    const invented = applyPlanningUnderstanding({ ...base, startDate: "2026-11-02", departureText: "2026-11-02" }, ready, [], [], dialogue, { text: "Xe máy", now });
    expect(invented.needs.requirement.startDate).toBeFalsy();
    const qa = applyPlanningUnderstanding({ ...base, intent: "QA", startDate: "2026-11-02", departureText: "31/10" }, ready, [], [], dialogue, { text: "31/10 có lễ hội gì?", now });
    expect(qa.needs).toEqual(ready);
    expect(qa.intent).toBe("QA");
  });
  it("restores the original absolute tomorrow date, then asks again if it has expired", async () => {
    const resolved = interpret("mai").needs;
    const workspace: PlanningWorkspace = { conversationId: "restored", version: 1, needs: resolved, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" }, today: "2026-10-29" };
    const call = vi.fn(async () => workspace);
    const client = new PlanningClient("USER:restored", call);
    await client.restore("restored");
    await client.analyze("Đúng rồi, tạo đi");
    expect(client.getSnapshot().draft.requirement.startDate).toBe("2026-10-28");
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
    expect(client.getSnapshot().message).toContain("đã qua");
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("supplies bounded public QA context but clarifies bare agreement after interruption", async () => {
    const call = vi.fn().mockResolvedValueOnce({ conversationId: "interrupted", version: 0, needs: ready, pendingSaveKey: null, savedTripId: null })
      .mockResolvedValueOnce({ intent: "QA", needs: ready, unresolved: [], message: "" });
    const client = new PlanningClient("USER:interrupted", call);
    await client.start(null);
    client.setPublicDialogue([{ question: "Mã Pí Lèng có gì?", answer: "Thông tin đã trả lời." }]);
    expect(await client.analyze("Ở đó có đi bộ được không?")).toBe("QA");
    expect(JSON.parse(call.mock.calls.at(-1)![0]).dialogue.publicTurns[0].question).toContain("Mã Pí Lèng");
    await client.analyze("Có");
    expect(client.getSnapshot().draft).toEqual(ready);
    expect(call).toHaveBeenCalledTimes(2);
    expect(client.getSnapshot().generated).toBeNull();
  });
  it("uses the Vietnam day across the UTC midnight boundary", () => {
    expect(vietnamDateOf(new Date("2026-10-27T17:01:00Z"))).toBe("2026-10-28");
  });
});

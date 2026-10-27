import { describe, expect, it, vi } from "vitest";
import { PlanningClient, PlanningClientError } from "./planning-client";
import { EMPTY_PLANNING_NEEDS, type PlanningAnalysis, type PlanningNeeds, type PlanningRequest, type PlanningWorkspace } from "../../modules/assistant-planning/planning-contract";
import { generatePlanningProposal } from "../../modules/assistant-planning/planning-engine";
import { tripRequirementInputSchema } from "../../modules/trip-requirement/trip-requirement-contract";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { AppError } from "../../server/http/app-error";

function setup(needs: PlanningNeeds = fixtureNeeds, initialDays = [["a"]], routes = fixtureRoutes) {
  let workspace: PlanningWorkspace = { conversationId: "chat", version: 0, needs, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } };
  const analyses: PlanningAnalysis[] = [];
  const generate = vi.fn(async () => ({ days: initialDays }));
  const save = vi.fn(async () => ({ save: { status: "SUCCESS", data: { tripId: "saved-trip" } } }));
  const call = vi.fn(async (body: string, _key: string): Promise<unknown> => {
    const request = JSON.parse(body) as PlanningRequest;
    if (request.action === "START" || request.action === "READ") return workspace;
    if (request.action === "ANALYZE") {
      const next = analyses.shift(); if (!next) throw new Error("Missing analysis fixture"); return next;
    }
    if (request.action === "REVIEW") {
      workspace = { ...workspace, version: workspace.version + 1, needs: { ...request.needs, requirement: tripRequirementInputSchema.parse(request.needs.requirement) } }; return workspace;
    }
    if (request.action === "GENERATE") {
      const result = await generatePlanningProposal({ needs: workspace.needs, candidates: ["a", "b", "c", "d"].map(id => planningCandidate(id)), previous: request.previous, edit: request.edit, instruction: request.instruction, routes, generate, now: planningNow, recheck: async () => true }).catch(error => { if (error instanceof AppError) throw new PlanningClientError(error.message, error.status, error.code); throw error; });
      workspace = { ...workspace, version: workspace.version + 1 }; return { ...result, version: workspace.version };
    }
    if (request.action === "SAVE") return save();
    throw new Error("Unexpected request");
  });
  const client = new PlanningClient("USER:a", call);
  const analysis = (patch: Partial<PlanningAnalysis> = {}) => { analyses.push({ intent: "NEEDS", needs: client.getSnapshot().draft, unresolved: [], message: "", ...patch }); };
  const operation = (kind: "ADD" | "REMOVE" | "REPLACE" | "REPLAN_DAY", options = [{ id: "b", name: "Điểm b", reason: "Đồng Văn · Thiên nhiên" }, { id: "c", name: "Điểm c", reason: "Đồng Văn · Thiên nhiên" }]) => analysis({ intent: "EDIT", operation: { kind, day: 1, targetName: kind === "REPLACE" || kind === "REMOVE" ? "Điểm a" : null, destinationName: null }, options });
  return { client, call, analysis, operation, generate, save };
}

describe("Chat-first planning with real scheduler and validation", () => {
  it("keeps the original card snapshot when an edit is canceled or a replacement fails", async () => {
    const { client, operation, call } = setup();
    await client.start(null); await client.generate();
    const snapshot = structuredClone(client.getSnapshot().messages[0]!.proposal);
    expect(snapshot).toBeDefined();
    operation("REPLACE"); await client.analyze("Thay Điểm a");
    await client.analyze("Không đổi nữa");
    expect(client.getSnapshot().messages.filter(m => m.proposal)).toHaveLength(1);
    expect(client.getSnapshot().messages[0]!.proposal).toEqual(snapshot);
    operation("REPLACE"); await client.analyze("Thay Điểm a");
    call.mockRejectedValueOnce(new PlanningClientError("unavailable", 503, "PLANNING_UNAVAILABLE"));
    await client.chooseOption(0);
    expect(client.getSnapshot().messages.filter(m => m.proposal)).toHaveLength(1);
    expect(client.getSnapshot().messages[0]!.proposal).toEqual(snapshot);
  });
  it("asks missing needs in order, accepts skips, recaps, then generates only on confirmation", async () => {
    const { client, analysis, call, save } = setup(EMPTY_PLANNING_NEEDS);
    await client.start(null); expect(client.getSnapshot().message).toBe("Bạn muốn đi mấy ngày?");
    analysis({ needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 1 } } });
    await client.analyze("1"); expect(client.getSnapshot().message).toContain("ô tô hay xe máy");
    expect(JSON.parse(call.mock.calls.at(-1)![0]).dialogue.field).toBe("durationDays");
    analysis({ needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 1, transport: "CAR" } } });
    await client.analyze("Ô tô"); expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "startDate" });
    await client.analyze("Chưa chốt ngày"); expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "preferences" });
    await client.analyze("Bỏ qua"); expect(client.getSnapshot().message).toContain("Nhịp đi:");
    await client.analyze("Bỏ qua phần còn lại"); expect(client.getSnapshot().prompt?.kind).toBe("RECAP");
    expect(client.getSnapshot().message).toContain("Chưa chốt"); expect(client.getSnapshot().generated).toBeNull();
    await client.analyze("Đúng rồi, tạo đi"); expect(client.getSnapshot().generated?.selection.days).toEqual([["a"]]);
    expect(client.getSnapshot().generated?.proposal.eligibleForFinalConfirmation).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("correcting a recap asks for review again without generating", async () => {
    const reviewed = { ...fixtureNeeds, preferencesDone: true };
    const { client, analysis, generate } = setup(reviewed); await client.start(null);
    expect(client.getSnapshot().prompt?.kind).toBe("RECAP");
    analysis({ needs: { ...reviewed, requirement: { ...fixtureNeeds.requirement, transport: "MOTORCYCLE" } } });
    await client.analyze("Đổi thành xe máy"); expect(client.getSnapshot().message).toContain("Xe máy");
    expect(client.getSnapshot().prompt?.kind).toBe("RECAP"); expect(generate).not.toHaveBeenCalled();
  });
  it("proactively offers points, does not choose on bare yes, and applies choice 2 without another confirmation", async () => {
    const { client, operation, generate, save } = setup(); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm một điểm vào ngày 1, bạn gợi ý giúp tôi");
    expect(client.getSnapshot().message).toContain("1. Điểm b"); expect(client.getSnapshot().message).toContain("2. Điểm c");
    await client.analyze("Có"); expect(client.getSnapshot().message).toContain("số mấy");
    expect(client.getSnapshot().generated?.selection.days).toEqual([["a"]]);
    await client.analyze("Chọn số 2"); expect(client.getSnapshot().generated?.selection.days).toEqual([["a", "c"]]);
    expect(generate).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });
  it("replacement excludes the old mandatory point and preserves the untouched day", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 2 }, requiredDestinationIds: ["a"], destinationNames: { a: "Điểm a" } };
    const { client, operation } = setup(needs, [["a"], ["d"]]); await client.start(null); await client.generate();
    operation("REPLACE"); await client.analyze("Thay Điểm a ngày 1 bằng điểm khác"); await client.analyze("Chọn số 1");
    expect(client.getSnapshot().generated?.selection.days).toEqual([["b"], ["d"]]);
    expect(client.getSnapshot().draft.excludedDestinationIds).toContain("a");
    expect(client.getSnapshot().draft.requiredDestinationIds).not.toContain("a");
  });
  it("canceling an offer keeps the current itinerary and cannot save on a later yes", async () => {
    const { client, operation, save } = setup(); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Gợi ý thêm điểm ngày 1"); await client.analyze("Thôi, không đổi nữa");
    await client.analyze("Có"); expect(client.getSnapshot().generated?.selection.days).toEqual([["a"]]); expect(save).not.toHaveBeenCalled();
  });
  it("Q&A leaves the itinerary unchanged and requires clarifying a later bare yes before saving", async () => {
    const { client, analysis, save } = setup(); await client.start(null); await client.generate();
    const before = client.getSnapshot().generated;
    analysis({ intent: "QA" }); expect(await client.analyze("Điểm a có gì?")).toBe("QA");
    expect(client.getSnapshot().generated).toBe(before);
    await client.analyze("Có"); expect(save).not.toHaveBeenCalled(); expect(client.getSnapshot().message).toContain("xác nhận thao tác");
    await client.analyze("Đồng ý"); expect(save).toHaveBeenCalledTimes(1); expect(client.getSnapshot().savedTripId).toBe("saved-trip");
  });
  it("reopened history invalidates a pending option and requires explicit regeneration", async () => {
    const { client, operation, generate } = setup(); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1"); client.reopenHistory(); await client.chooseOption(0);
    expect(client.getSnapshot().generated).toBeNull(); expect(client.getSnapshot().prompt?.kind).toBe("REGENERATE"); expect(generate).toHaveBeenCalledTimes(1);
  });
  it("a pace-limit failure retains the old itinerary without claiming the new point was added", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, pace: "RELAXED" as const } };
    const { client, operation } = setup(needs, [["a", "d"]]); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1"); await client.chooseOption(0);
    expect(client.getSnapshot().generated).toBeNull(); expect(client.getSnapshot().editingFrom?.selection.days).toEqual([["a", "d"]]);
    expect(client.getSnapshot().error).toContain("nhịp độ"); expect(client.getSnapshot().savedTripId).toBeNull();
  });
  it("locks duplicate selection while checking the chosen itinerary", async () => {
    const { client, operation, call } = setup(); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1");
    await Promise.all([client.chooseOption(0), client.chooseOption(0)]);
    expect(call.mock.calls.filter(([body]) => JSON.parse(body).edit)).toHaveLength(1);
  });
  it("exact-save recovery still retries the same body and key after response loss", async () => {
    const { client, call } = setup(); await client.start(null); await client.generate();
    call.mockRejectedValueOnce(new Error("response lost")); await client.analyze("Có");
    const request = call.mock.calls.at(-1); expect(client.getSnapshot().uncertain).toBe(true);
    await client.reconcile(); expect(call.mock.calls.at(-1)).toEqual(request); expect(client.getSnapshot().savedTripId).toBe("saved-trip");
  });
  it("canceling a failed edit clears the edit and restores requirements before another generation", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, pace: "RELAXED" as const } };
    const { client, operation, analysis, call } = setup(needs, [["a", "d"]]); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1"); await client.chooseOption(0);
    expect(client.getSnapshot().uncertain).toBe(false);
    await client.analyze("Không đổi nữa"); expect(client.getSnapshot().draft.preferredDestinationIds).toEqual([]);
    const reloaded = new PlanningClient("USER:a", call); await reloaded.restore("chat");
    expect(reloaded.getSnapshot().draft.preferredDestinationIds).toEqual([]);
    analysis({ needs: { ...needs, requirement: { ...needs.requirement, startDate: "2026-11-03" } } });
    await client.analyze("Đổi ngày đi thành 2026-11-03"); await client.analyze("Đồng ý");
    expect(JSON.parse(call.mock.calls.at(-1)![0]).edit).toBeUndefined();
    expect(client.getSnapshot().generated?.selection.days).toEqual([["a", "d"]]);
  });
  it("canceling a needs correction restores the current proposal without applying the correction", async () => {
    const { client, analysis } = setup(); await client.start(null); await client.generate();
    const before = client.getSnapshot().generated;
    analysis({ needs: { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 2 } } });
    await client.analyze("Đổi thành 2 ngày"); await client.analyze("Không đổi nữa");
    expect(client.getSnapshot().draft.requirement.durationDays).toBe(1);
    expect(client.getSnapshot().generated).toBe(before);
  });
  it("retries an uncertain rollback with its original body/key without creating an itinerary", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, pace: "RELAXED" as const } };
    const { client, operation, call, generate } = setup(needs, [["a", "d"]]); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1"); await client.chooseOption(0);
    call.mockRejectedValueOnce(new Error("rollback response lost")); await client.analyze("Không đổi nữa");
    const rollback = call.mock.calls.at(-1); expect(client.getSnapshot().uncertain).toBe(true);
    await client.reconcile(); expect(call.mock.calls.at(-1)).toEqual(rollback);
    expect(client.getSnapshot().draft.preferredDestinationIds).toEqual([]); expect(generate).toHaveBeenCalledTimes(1);
  });
  it("keeps durable rollback through further needs corrections after a failed edit", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, pace: "RELAXED" as const } };
    const { client, operation, analysis, call } = setup(needs, [["a", "d"]]); await client.start(null); await client.generate();
    operation("ADD"); await client.analyze("Thêm điểm ngày 1"); await client.chooseOption(0);
    analysis({ needs: { ...needs, requirement: { ...needs.requirement, startDate: "2026-11-03" } } }); await client.analyze("Đổi ngày khởi hành");
    await client.analyze("Không đổi nữa");
    const reloaded = new PlanningClient("USER:a", call); await reloaded.restore("chat");
    expect(reloaded.getSnapshot().draft.preferredDestinationIds).toEqual([]);
    expect(reloaded.getSnapshot().draft.requirement.startDate).toBe(fixtureNeeds.requirement.startDate);
  });
  it("retains a newly confirmed must-visit as mandatory", async () => {
    const { client, analysis } = setup(); await client.start(null); await client.generate();
    analysis({ intent: "EDIT", operation: { kind: "ADD", day: 1, targetName: null, destinationName: "Điểm b" }, options: [{ id: "b", name: "Điểm b", reason: "Điểm đã chọn" }], mandatoryAddition: true });
    await client.analyze("Thêm Điểm b ngày 1, bắt buộc phải có b"); await client.chooseOption(0);
    expect(client.getSnapshot().draft.requiredDestinationIds).toContain("b");
  });
  it("uses AI understanding of a natural affirmation only for the current pending action", async () => {
    const { client, analysis, save } = setup(); await client.start(null); await client.analyze("Bỏ qua phần còn lại");
    analysis({ replyAction: "CONFIRM" }); await client.analyze("Ổn rồi, cứ thế làm nhé");
    expect(client.getSnapshot().generated).not.toBeNull(); expect(save).not.toHaveBeenCalled();
    expect(client.getSnapshot().messages.at(-1)?.question).toBe("Ổn rồi, cứ thế làm nhé");
  });
  it("asks before applying timing changes to other days", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 2 } };
    const routes = { route: async (...args: Parameters<typeof fixtureRoutes.route>) => ({ ...await fixtureRoutes.route(...args), durationSeconds: args[0].from.id === "b" && args[0].to.id === "d" ? 1800 : 600 }) };
    const { client, operation, save } = setup(needs, [["a"], ["d"]], routes); await client.start(null); await client.generate();
    operation("REPLACE"); await client.analyze("Thay Điểm a ở ngày 1"); await client.chooseOption(0);
    expect(client.getSnapshot().prompt?.kind).toBe("APPLY_CHANGE"); expect(client.getSnapshot().message).toContain("Ngày 2");
    expect(client.getSnapshot().generated).toBeNull(); expect(save).not.toHaveBeenCalled();
    await client.analyze("Có"); expect(client.getSnapshot().generated?.selection.days).toEqual([["b"], ["d"]]);
    expect(save).not.toHaveBeenCalled();
  });
});

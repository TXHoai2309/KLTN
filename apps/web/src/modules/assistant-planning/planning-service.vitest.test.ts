import { describe, expect, it, vi } from "vitest";
import { executePlanning, planningProposalHash, type PlanningDependencies } from "./planning-service";
import { scheduleSelection } from "./planning-engine";
import { planningNow, fixtureNeeds, planningCandidate, fixtureRoutes } from "../../test/planning-fixtures";
import type { PlanningWorkspace } from "./planning-contract";
import { AppError } from "../../server/http/app-error";

function setup() {
  let workspace: PlanningWorkspace = { conversationId: "chat", version: 0, needs: fixtureNeeds, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } };
  let hash: string | null = null;
  let completedKey: string | null = null;
  let completedHash: string | null = null;
  let pending: { key: string; input: Parameters<PlanningDependencies["save"]>[0] } | null = null;
  const repository: PlanningDependencies["repository"] = {
    start: vi.fn(async () => workspace), read: vi.fn(async () => workspace),
    checkpoint: vi.fn(),
    assertVersion: vi.fn(async (_id, version) => { if (workspace.version !== version) throw new Error("version conflict"); return workspace; }),
    review: vi.fn(async (_id, version, needs) => { workspace = { ...workspace, version: version + 1, needs }; return workspace; }),
    publishProposal: vi.fn(async (_id, version, fingerprint) => { hash = fingerprint; workspace = { ...workspace, version: version + 1 }; return workspace; }),
    assertProposal: vi.fn(async (_id, version, fingerprint) => { if (workspace.version !== version || (hash && fingerprint !== hash)) throw new Error("superseded proposal"); }),
    completedSave: vi.fn(async (_id, key, fingerprint) => { if (!workspace.savedTripId) return null; if (completedKey !== key || completedHash !== fingerprint) throw new Error("different save payload"); return workspace.savedTripId; }),
    pendingSave: vi.fn(async () => pending),
    reserveSave: vi.fn(async (_id, _version, key, fingerprint, input) => { completedKey = key; completedHash = fingerprint; pending = { key, input }; workspace = { ...workspace, pendingSaveKey: key }; }),
    finishSave: vi.fn(async (_id, _key, tripId) => { pending = null; workspace = { ...workspace, savedTripId: tripId, pendingSaveKey: null }; }),
  };
  const deps: PlanningDependencies = { repository, candidates: async () => [planningCandidate("a"), planningCandidate("b")], recheck: async () => true, routes: fixtureRoutes, generate: vi.fn(async () => ({ days: [["a", "b"]] })), analyze: vi.fn<PlanningDependencies["analyze"]>(async (_text, draft) => ({ intent: "QA", needs: draft, unresolved: [], message: "" })), now: () => planningNow, save: vi.fn<PlanningDependencies["save"]>(async () => ({ status: "SUCCESS", data: { tripId: "trip-owned", validation: {} } })), validateForSave: async () => ({ canConfirm: true }) };
  return { deps, repository };
}
describe("Chat planning service end-to-end with controlled boundaries", () => {
  it("publishes once and returns the actual proposal when only language composition fails", async () => {
    const { deps, repository } = setup();
    deps.compose = vi.fn().mockRejectedValue(new Error("language timeout"));
    const result = await executePlanning({ action: "GENERATE", conversationId: "chat", version: 0, previous: null, instruction: "Tạo lịch" }, "generate-language-failure", deps);
    expect(result).toMatchObject({ version: 1, reply: expect.stringContaining("chưa lưu") });
    expect(repository.publishProposal).toHaveBeenCalledTimes(1);
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("uses the server calendar for analysis and composes the normalized date before the next question", async () => {
    const { deps } = setup();
    deps.analyze = vi.fn<PlanningDependencies["analyze"]>(async (_text, draft) => ({ intent: "NEEDS", needs: { ...draft, requirement: { ...draft.requirement, startDate: "2026-10-31" } }, unresolved: [], message: "" }));
    deps.compose = vi.fn(async input => input.canonical);
    const result = await executePlanning({ action: "ANALYZE", conversationId: "chat", version: 0, text: "31/10", draft: fixtureNeeds, unresolved: [] }, "analyze-date", deps);
    expect(result).toMatchObject({ followUpMessage: expect.stringContaining("31/10/2026") });
    expect(deps.analyze).toHaveBeenLastCalledWith("31/10", fixtureNeeds, expect.any(Array), [], undefined, planningNow);
    expect(deps.compose).toHaveBeenCalledTimes(1);
  });
  it("rejects expired restored dates before invoking itinerary generation", async () => {
    const { deps } = setup();
    deps.now = () => new Date("2026-11-03T03:00:00Z");
    await expect(executePlanning({ action: "GENERATE", conversationId: "chat", version: 0, previous: null, instruction: "Tạo lại" }, "expired", deps)).rejects.toThrow(/đã qua/);
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("review → AI selection → genuine validator → explicit canonical save", async () => {
    const { deps } = setup();
    const reviewed = await executePlanning({ action: "REVIEW", conversationId: "chat", version: 0, needs: fixtureNeeds }, "review-key", deps) as PlanningWorkspace;
    const generated = await executePlanning({ action: "GENERATE", conversationId: "chat", version: reviewed.version, previous: null, instruction: "Tạo lịch" }, "generate-key", deps) as Awaited<ReturnType<typeof import("./planning-engine").generatePlanningProposal>>;
    expect(generated.proposal.checks.every(c => c.status === "PASS")).toBe(true);
    expect(deps.save).not.toHaveBeenCalled();
    const outcome = await executePlanning({ action: "SAVE", conversationId: "chat", version: generated.version!, confirm: true, proposal: generated.proposal }, "save-key", deps);
    expect(outcome).toMatchObject({ save: { status: "SUCCESS", data: { tripId: "trip-owned" } } });
    expect(deps.save).toHaveBeenCalledTimes(1);
    await executePlanning({ action: "SAVE", conversationId: "chat", version: generated.version!, confirm: true, proposal: generated.proposal }, "save-key", deps);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
  it("does not gate a committed REVIEW retry on its pre-commit version", async () => {
    const { deps, repository } = setup();
    await executePlanning({ action: "REVIEW", conversationId: "chat", version: 0, needs: fixtureNeeds }, "same-key", deps);
    expect(repository.assertVersion).not.toHaveBeenCalled();
  });
  it("UNKNOWN keeps the save slot; FAILED releases it; unverified mobility blocks saving", async () => {
    const { deps, repository } = setup();
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "UNKNOWN", error: { code: "UNKNOWN", message: "Unknown" }, retryWithSameKey: true });
    const request = { action: "SAVE" as const, conversationId: "chat", version: 0, confirm: true as const, proposal };
    expect(await executePlanning(request, "save-key", deps)).toMatchObject({ save: { status: "UNKNOWN" } });
    expect(repository.finishSave).not.toHaveBeenCalled();
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "FAILED", httpStatus: 422, error: { code: "FAIL", message: "No" } });
    await executePlanning(request, "save-key", deps);
    expect(repository.finishSave).toHaveBeenCalledWith("chat", "save-key", null);
    await executePlanning({ action: "REVIEW", conversationId: "chat", version: 0, needs: { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, mobilityConstraints: { flags: ["SENIORS"], note: null } } } }, "review", deps);
    await expect(executePlanning({ ...request, version: 1 }, "blocked-key", deps)).rejects.toThrow(/chưa đáp ứng/);
  });
  it("a restored reservation retries the original confirmed save intent", async () => {
    const { deps, repository } = setup();
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "UNKNOWN", error: { code: "UNKNOWN", message: "Unknown" }, retryWithSameKey: true });
    await executePlanning({ action: "SAVE", conversationId: "chat", version: 0, confirm: true, proposal }, "immutable-save-key", deps);
    // A reloaded browser supplies no itinerary; the server retains the validated
    // explicitly confirmed intent and resumes exactly that operation on request.
    expect(await executePlanning({ action: "RECONCILE", conversationId: "chat" }, "new-read-key", deps)).toMatchObject({ workspace: { savedTripId: "trip-owned", pendingSaveKey: null } });
    expect(vi.mocked(deps.save).mock.calls[0]).toEqual(vi.mocked(deps.save).mock.calls[1]);
    expect(repository.finishSave).toHaveBeenCalledWith("chat", "immutable-save-key", "trip-owned");
  });
  it("rejects stale proposal versions and a different SAVE after success", async () => {
    const { deps } = setup();
    const first = await executePlanning({ action: "GENERATE", conversationId: "chat", version: 0, previous: null, instruction: "" }, "generate-1", deps) as Awaited<ReturnType<typeof import("./planning-engine").generatePlanningProposal>>;
    const second = await executePlanning({ action: "GENERATE", conversationId: "chat", version: first.version!, previous: first.selection, instruction: "xếp lại" }, "generate-2", deps) as typeof first;
    expect(planningProposalHash(second.proposal)).toBeTruthy();
    await expect(executePlanning({ action: "SAVE", conversationId: "chat", version: first.version!, confirm: true, proposal: first.proposal }, "stale-key", deps)).rejects.toThrow(/version/);
    await executePlanning({ action: "SAVE", conversationId: "chat", version: second.version!, confirm: true, proposal: second.proposal }, "correct-key", deps);
    await expect(executePlanning({ action: "SAVE", conversationId: "chat", version: second.version!, confirm: true, proposal: second.proposal }, "different-key", deps)).rejects.toThrow(/different save/);
  });
  it("reconciles a committed save before fresh route/date validation on same-session retry", async () => {
    const { deps, repository } = setup();
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    const request = { action: "SAVE" as const, conversationId: "chat", version: 0, confirm: true as const, proposal };
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "UNKNOWN", error: { code: "UNKNOWN", message: "Unknown" }, retryWithSameKey: true });
    await executePlanning(request, "save-key", deps);
    const read = repository.read;
    vi.mocked(repository.read).mockImplementationOnce(async id => { await repository.finishSave(id, "save-key", "trip-owned"); return read(id); });
    deps.validateForSave = vi.fn(async () => { throw Error("Routes unavailable after commit"); });
    deps.now = () => new Date("2026-12-01T00:00:00Z");
    expect(await executePlanning(request, "save-key", deps)).toMatchObject({ save: { status: "SUCCESS" } });
    expect(deps.validateForSave).not.toHaveBeenCalled();
  });
  it("returns refreshed unlocked state after a terminal reconciliation failure", async () => {
    const { deps } = setup();
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "UNKNOWN", error: { code: "UNKNOWN", message: "Unknown" }, retryWithSameKey: true });
    await executePlanning({ action: "SAVE", conversationId: "chat", version: 0, confirm: true, proposal }, "save-key", deps);
    vi.mocked(deps.save).mockRejectedValueOnce(new AppError("DESTINATION_UNAVAILABLE", "Điểm đã ẩn", 422));
    expect(await executePlanning({ action: "RECONCILE", conversationId: "chat" }, "read-key", deps)).toMatchObject({ workspace: { pendingSaveKey: null, savedTripId: null }, message: "Điểm đã ẩn" });
  });
  it("resumes an uncommitted UNKNOWN via canonical save so new failures release its reservation", async () => {
    const { deps, repository } = setup();
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    const request = { action: "SAVE" as const, conversationId: "chat", version: 0, confirm: true as const, proposal };
    vi.mocked(deps.save).mockResolvedValueOnce({ status: "UNKNOWN", error: { code: "UNKNOWN", message: "Unknown" }, retryWithSameKey: true });
    await executePlanning(request, "save-key", deps);
    deps.validateForSave = vi.fn(async () => { throw Error("Must not precede canonical replay"); });
    vi.mocked(deps.save).mockRejectedValueOnce(new AppError("DESTINATION_UNAVAILABLE", "Điểm đã ẩn", 422));
    await expect(executePlanning(request, "save-key", deps)).rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE" });
    expect(deps.validateForSave).not.toHaveBeenCalled();
    expect(repository.finishSave).toHaveBeenCalledWith("chat", "save-key", null);
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema, type PlanningGenerated } from "../assistant-planning/planning-contract";
import { analyzePlanningText } from "../assistant-planning/planning-ai";
import { planningProposalHash, type PlanningDependencies } from "../assistant-planning/planning-service";
import { planningCandidate, fixtureRoutes, planningNow } from "../../test/planning-fixtures";
import * as validator from "../trip-planner/planner-validator";
import { executeAssistantV2Action } from "./agent-runtime";
import { fallbackPlanningV2Reply } from "./planning-response";
import { startTravelPlanningV2Session } from "./travel-planning-session";
import type { BoundedEdit } from "./planning-replanning";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v204-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const op = (kind: BoundedEdit["operations"][number]["kind"], values: Partial<BoundedEdit["operations"][number]> = {}): BoundedEdit["operations"][number] => ({ kind, day: null, targetName: null, destinationName: null, position: null, criteria: null, ...values });
function fixture() {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "v204-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let hash: string | null = null;
  let edit: BoundedEdit = { operations: [op("REMOVE", { day: 2, targetName: "Dinh Vương" })] };
  const candidates = [
    { ...planningCandidate("a"), name: "Đầu ngày một" }, { ...planningCandidate("b"), name: "Cuối ngày một" },
    { ...planningCandidate("c"), name: "Dinh Vương", latitude: 22 }, { ...planningCandidate("d"), name: "Cuối ngày hai" },
    { ...planningCandidate("e"), name: "Lũng Cú" }, { ...planningCandidate("f"), name: "Cuối ngày ba" },
    { ...planningCandidate("g"), name: "Lô Lô Chải", category: "Văn hóa", latitude: 23.01 },
    { ...planningCandidate("h"), name: "Lô Lô Chải khác", category: "Văn hóa", latitude: 23.02 },
  ];
  const repository: PlanningDependencies["repository"] = {
    start: vi.fn(async () => structuredClone(workspace)), read: vi.fn(async () => structuredClone(workspace)), checkpoint: vi.fn(),
    assertVersion: vi.fn(async (id, version) => { if (id !== workspace.conversationId || version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Stale", 409); return structuredClone(workspace); }),
    review: vi.fn(async (_id, version, needs) => { workspace = { ...workspace, needs, version: version + 1 }; hash = null; return structuredClone(workspace); }),
    publishProposal: vi.fn(async (_id, version, nextHash, _key, refinement) => {
      if (version !== workspace.version || refinement && refinement.previousHash !== hash) throw new AppError("PLANNING_CHANGED", "Stale", 409);
      workspace = structuredClone({ ...workspace, version: version + 1, ...(refinement ? { needs: refinement.needs } : {}) }); hash = nextHash;
      return structuredClone(workspace);
    }),
    assertProposal: vi.fn(async (_id, version, fingerprint) => { if (version !== workspace.version || hash !== fingerprint) throw new AppError("PLANNING_CHANGED", "Stale proposal", 409); }),
    completedSave: vi.fn(), pendingSave: vi.fn(), reserveSave: vi.fn(), finishSave: vi.fn(),
  };
  const authorization: AuthorizationDependencies = {
    resolveSession: async () => ({ user: { id: "owner" } }),
    database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER", status: "ACTIVE" }) } } as unknown as Pick<Database, "user">,
  };
  const deps: PlanningDependencies = {
    repository, candidates: vi.fn(async () => structuredClone(candidates)), analyze: vi.fn(analyzePlanningText),
    generate: vi.fn(async () => ({ days: [["a", "b"], ["c", "d"], ["e", "f"]] })),
    routes: { route: vi.fn(fixtureRoutes.route) }, recheck: vi.fn(async () => true), now: () => planningNow,
    save: vi.fn(), validateForSave: vi.fn(), compose: vi.fn(),
  };
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    const name = body.response_format.json_schema.name; requests.push(name);
    const input = JSON.parse(body.messages.at(-1)!.content) as { latestUserText?: string; interleaving?: unknown };
    let value: unknown = name === "planning_v2_bounded_edit" ? edit : {
      intent: input.latestUserText === "3 ngày ô tô" ? "NEEDS" : "EDIT",
      durationDays: input.latestUserText === "3 ngày ô tô" ? 3 : null,
      transport: input.latestUserText === "3 ngày ô tô" ? "CAR" : null,
      startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null,
      destinations: input.latestUserText === "3 ngày ô tô" ? [{ name: "Đầu ngày một", required: true, remove: false }, { name: "Lô Lô Chải khác", required: false, remove: true }] : [],
      message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
    };
    if (name === "trip_chat_understanding" && input.interleaving && typeof value === "object" && value !== null) {
      value = { ...value, interleaved: { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false } };
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const start = () => startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v204-start-key" }, { authorization, forActor: () => deps, compose: async plan => fallbackPlanningV2Reply(plan) });
  return { start, deps, repository, candidates, requests, setEdit: (...operations: BoundedEdit["operations"]) => { edit = { operations }; }, hash: () => hash };
}
function proposal(generated: PlanningGenerated | null) { if (!generated) throw new Error("Missing proposal"); return generated; }

describe("V2-04 surgical replanning on the canonical unsaved proposal", () => {
  it.each(["REMOVE", "REPLACE", "ADD"] as const)("%s preserves other days exactly and publishes one validated version", async kind => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-initial-turn");
    const old = proposal(first.generated); const snapshot = structuredClone(old); const validate = vi.spyOn(validator, "validatePlannerDays");
    vi.mocked(f.deps.routes.route).mockClear(); vi.mocked(f.repository.publishProposal).mockClear();
    f.setEdit(op(kind, { day: 2, targetName: kind === "ADD" ? null : "Dinh Vương", destinationName: kind === "REMOVE" ? null : "Lô Lô Chải", position: kind === "ADD" ? 1 : null }));
    const result = await session.send(`${kind} ngày 2`, "v204-edit-turn"); const next = proposal(result.generated);
    expect(result.responsePlan).toMatchObject({ goal: "REPLAN_PROPOSAL", proposalChanged: true, replanDelta: { affectedDays: [2], dependencyDays: [] } });
    expect(next.selection.days[1]).toEqual(kind === "REMOVE" ? ["d"] : kind === "ADD" ? ["g", "c", "d"] : ["g", "d"]);
    expect(next.proposal.days[0]).toEqual(old.proposal.days[0]); expect(next.proposal.days[2]).toEqual(old.proposal.days[2]);
    expect(first.generated).toEqual(snapshot); expect(next.version).toBe(first.workspace.version + 1);
    expect(result.workspace.needs.requiredDestinationIds).toContain("a"); expect(result.workspace.needs.excludedDestinationIds).toContain("h");
    expect(validate).toHaveBeenCalledOnce(); expect(f.repository.publishProposal).toHaveBeenCalledOnce(); expect(f.deps.generate).toHaveBeenCalledOnce();
    expect(f.deps.routes.route).toHaveBeenCalled();
    for (const [pair] of vi.mocked(f.deps.routes.route).mock.calls) expect(next.selection.days[1]).toContain(pair.to.id);
    expect(f.hash()).toBe(planningProposalHash(next.proposal));
    expect(next.proposal.checks.find(check => check.key === "OPENING_HOURS")?.status).toBe("INSUFFICIENT_DATA");
    expect(next.proposal.eligibleForFinalConfirmation).toBe(false); expect(result.message).toContain("chưa lưu");
    expect(f.deps.save).not.toHaveBeenCalled(); expect(f.repository.reserveSave).not.toHaveBeenCalled();
  });

  it("moves between two days, validates both, and preserves the third day", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-move-initial");
    const validate = vi.spyOn(validator, "validatePlannerDays"); vi.mocked(f.repository.publishProposal).mockClear();
    f.setEdit(op("MOVE", { targetName: "Dinh Vương", day: 1, position: 1 }));
    const result = await session.send("Chuyển Dinh Vương từ ngày 2 sang đầu ngày 1", "v204-move-turn");
    expect(result.generated?.selection.days).toEqual([["c", "a", "b"], ["d"], ["e", "f"]]);
    expect(result.generated?.proposal.days[2]).toEqual(first.generated?.proposal.days[2]);
    expect(result.responsePlan.replanDelta).toMatchObject({ affectedDays: [1, 2], moved: [{ name: "Dinh Vương", from: 2, to: 1 }] });
    expect(validate).toHaveBeenCalledOnce(); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("clarifies ambiguous replacement and missing day with bounded existing resolutions", async () => {
    const f = fixture();
    const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-clarify-initial");
    f.setEdit(op("REPLACE", { targetName: "Dinh Vương", destinationName: "Lô Lô" }));
    const ambiguous = await session.send("Thay Dinh Vương bằng Lô Lô", "v204-ambiguous-turn");
    expect(ambiguous.responsePlan).toMatchObject({ goal: "REPLAN_CLARIFY", replanCode: "AMBIGUOUS_DESTINATION" });
    expect(ambiguous.generated).toEqual(first.generated); expect(ambiguous.workspace).toEqual(first.workspace);
    const resolved = await session.send("1", "v204-resolution-turn"); expect(resolved.generated?.selection.days[1]).toEqual(["g", "d"]);
    f.setEdit(op("ADD", { destinationName: "Dinh Vương" }));
    const missing = await session.send("Thêm Dinh Vương", "v204-missing-day-turn");
    expect(missing.responsePlan.replanCode).toBe("MISSING_DAY"); expect(missing.generated).toEqual(resolved.generated);
    // Adding at the existing append position changes the next day's inbound;
    // choose day 3 here so there is no unaccepted downstream dependency.
    const chosen = await session.send("Ngày 3", "v204-day-choice-turn");
    expect(chosen.generated?.selection.days[2]).toEqual(["e", "f", "c"]);
    expect(chosen.workspace.version).toBe(resolved.workspace.version + 1);
  });

  it("clarifies an ambiguous target and preserves state on cancellation or a missing target", async () => {
    const f = fixture(); f.candidates[3]!.name = "Dinh Vương khác";
    const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-target-initial");
    f.setEdit(op("REMOVE", { targetName: "Dinh", day: 2 }));
    const ambiguous = await session.send("Bỏ Dinh ngày 2", "v204-target-ambiguous");
    expect(ambiguous.responsePlan.replanCode).toBe("AMBIGUOUS_TARGET"); expect(ambiguous.generated).toEqual(first.generated);
    const cancel = await session.send("giữ nguyên", "v204-target-cancel"); expect(cancel.generated).toEqual(first.generated);
    f.setEdit(op("REMOVE", { targetName: "Không tồn tại" }));
    const missing = await session.send("Bỏ Không tồn tại", "v204-target-missing");
    expect(missing.responsePlan.replanCode).toBe("MISSING_TARGET"); expect(missing.workspace).toEqual(first.workspace);
    expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("uses only eligible existing candidates for a semantic cultural replacement", async () => {
    const f = fixture(); const session = await f.start(); await session.send("3 ngày ô tô", "v204-semantic-initial");
    f.setEdit(op("REPLACE", { day: 2, targetName: "Dinh Vương", criteria: { culture: true, closer: true, anchorName: "Lũng Cú" } }));
    const result = await session.send("Thay Dinh Vương bằng điểm văn hóa gần Lũng Cú hơn", "v204-semantic-turn");
    expect(result.generated?.selection.days[1]).toEqual(["g", "d"]); expect(f.deps.generate).toHaveBeenCalledOnce();
    expect(result.workspace.needs.excludedDestinationIds).toEqual(expect.arrayContaining(["c", "h"]));
  });

  it("keeps the old canonical proposal when no semantic candidate qualifies", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-empty-initial");
    f.candidates[6]!.category = "Thiên nhiên";
    f.setEdit(op("REPLACE", { targetName: "Dinh Vương", criteria: { culture: true, closer: true, anchorName: "Lũng Cú" } }));
    const result = await session.send("Thay bằng điểm văn hóa gần Lũng Cú", "v204-empty-turn");
    expect(result.responsePlan).toMatchObject({ goal: "REPLAN_FAILED", replanCode: "NO_ALTERNATIVE_FOUND", proposalChanged: false });
    expect(result.generated).toEqual(first.generated); expect(result.workspace).toEqual(first.workspace); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
    f.setEdit(op("REPLACE", { targetName: "Dinh Vương", criteria: { culture: false, closer: false, anchorName: null } }));
    const vague = await session.send("Thay Dinh Vương", "v204-vague-replacement");
    expect(vague.responsePlan.replanCode).toBe("AMBIGUOUS_DESTINATION"); expect(vague.generated).toEqual(first.generated);
    expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("rejects a Validator violation without publishing or claiming success", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-invalid-initial");
    f.candidates[6]!.minimumDurationMinutes = 600; f.candidates[6]!.suggestedDurationMinutes = 600;
    f.setEdit(op("REPLACE", { day: 2, targetName: "Dinh Vương", destinationName: "Lô Lô Chải" }));
    const result = await session.send("Thay Dinh Vương bằng Lô Lô Chải", "v204-invalid-turn");
    expect(result.refinementCandidate?.proposal.status).toBe("NO_FEASIBLE_ITINERARY");
    expect(result.responsePlan).toMatchObject({ goal: "REPLAN_FAILED", refinementOutcome: "REJECTED", proposalChanged: false });
    expect(result.message).toContain("vi phạm"); expect(result.generated).toEqual(first.generated); expect(result.workspace).toEqual(first.workspace);
    expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("requires explicit acceptance before changing a cross-day route dependency", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-dependency-initial");
    f.setEdit(op("REMOVE", { targetName: "Cuối ngày hai", day: 2 }));
    const pending = await session.send("Bỏ Cuối ngày hai", "v204-dependency-turn");
    expect(pending.responsePlan).toMatchObject({ goal: "REPLAN_CLARIFY", replanCode: "OUT_OF_SCOPE" });
    expect(pending.message).toContain("ngày 3"); expect(pending.generated).toEqual(first.generated); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
    const accepted = await session.send("có", "v204-dependency-accept");
    expect(accepted.responsePlan.replanDelta).toMatchObject({ affectedDays: [2], dependencyDays: [3] });
    expect(accepted.generated?.proposal.days[0]).toEqual(first.generated?.proposal.days[0]);
    expect(accepted.generated?.proposal.days[2]?.stops[0]?.inbound?.fromDestinationId).toBe("c");
    expect(accepted.workspace.version).toBe(first.workspace.version + 1); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("publishes compound edits once and never publishes a half-applied failure", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-compound-initial");
    f.setEdit(op("REMOVE", { day: 2, targetName: "Dinh Vương" }), op("ADD", { day: 2, destinationName: "Lô Lô Chải", position: 1 }));
    const result = await session.send("Bỏ Dinh Vương và thêm Lô Lô Chải đầu ngày 2", "v204-compound-turn");
    expect(result.generated?.selection.days[1]).toEqual(["g", "d"]); expect(result.workspace.version).toBe(first.workspace.version + 1);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
    f.setEdit(op("REMOVE", { day: 2, targetName: "Lô Lô Chải" }), op("ADD", { day: 2, destinationName: "Không có" }));
    const failed = await session.send("Bỏ Lô Lô Chải thêm Không có ngày 2", "v204-compound-fail");
    expect(failed.responsePlan.goal).toBe("REPLAN_CLARIFY"); expect(failed.generated).toEqual(result.generated); expect(failed.workspace).toEqual(result.workspace);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("blocks stale versions/fingerprints, validates the action boundary and enforces the skill allowlist", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-stale-initial");
    const action = { skill: "itinerary-replanning", context: { userId: "owner", workspace: first.workspace }, action: "replan-preliminary-proposal" as const, payload: { current: { ...proposal(first.generated), version: 0 }, text: "Bỏ Dinh Vương", key: "v204-stale-action" } };
    const services = { planning: { userId: "owner", dependencies: f.deps } };
    await expect(executeAssistantV2Action(action, services)).rejects.toMatchObject({ cause: { code: "PLANNING_CHANGED" } });
    action.payload.current = { ...structuredClone(proposal(first.generated)), version: first.workspace.version }; action.payload.current.proposal.days[0]!.stops[0]!.destination.name = "Tampered stop";
    await expect(executeAssistantV2Action(action, services)).rejects.toMatchObject({ cause: { code: "PLANNING_CHANGED" } });
    await expect(executeAssistantV2Action({ ...action, payload: { ...action.payload, extra: true } }, services)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(executeAssistantV2Action({ ...action, skill: "travel-planning" }, services)).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
    expect(f.requests.filter(name => name === "planning_v2_bounded_edit")).toHaveLength(0); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("freezes an UNKNOWN publication and deduplicates replay without mutating the known proposal", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-unknown-initial");
    vi.mocked(f.repository.publishProposal).mockRejectedValueOnce(new AppError("OPERATION_STATUS_UNKNOWN", "Uncertain write", 503));
    const result = await session.send("Bỏ Dinh Vương ngày 2", "v204-unknown-turn");
    expect(result.uncertain).toBe(true); expect(result.responsePlan.refinementOutcome).toBe("UNKNOWN"); expect(result.generated).toEqual(first.generated);
    expect(result.message).toContain("đối soát");
    await expect(session.send("Thêm điểm", "v204-after-unknown")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
    expect(await session.send("Bỏ Dinh Vương ngày 2", "v204-unknown-turn")).toEqual(result); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("supports an explicitly requested day replan through the existing generator with scope enforcement", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-day-replan-initial");
    f.setEdit(op("REPLAN_DAY", { day: 2 }));
    vi.mocked(f.deps.generate).mockResolvedValueOnce({ days: [["a", "b"], ["g", "d"], ["e", "f"]] });
    const result = await session.send("Bố trí lại ngày 2", "v204-day-replan-turn");
    expect(result.generated?.selection.days[1]).toEqual(["g", "d"]);
    expect(result.generated?.proposal.days[0]).toEqual(first.generated?.proposal.days[0]); expect(result.generated?.proposal.days[2]).toEqual(first.generated?.proposal.days[2]);
    vi.mocked(f.deps.generate).mockResolvedValueOnce({ days: [["b", "a"], ["c", "d"], ["e", "f"]] });
    const rejected = await session.send("Bố trí lại ngày 2", "v204-day-replan-invalid");
    expect(rejected.responsePlan).toMatchObject({ goal: "REPLAN_FAILED", refinementOutcome: "FAILED", proposalChanged: false });
    expect(rejected.generated).toEqual(result.generated); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("does not fabricate route evidence or accept a changed data snapshot", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("3 ngày ô tô", "v204-evidence-initial");
    vi.mocked(f.deps.recheck).mockResolvedValueOnce(false);
    const changed = await session.send("Bỏ Dinh Vương ngày 2", "v204-evidence-changed");
    expect(changed.responsePlan.goal).toBe("REPLAN_FAILED"); expect(changed.generated).toEqual(first.generated);
    vi.mocked(f.deps.routes.route).mockResolvedValue({ fromDestinationId: "b", toDestinationId: "d", status: "INSUFFICIENT_DATA", reason: "UNAVAILABLE", durationSeconds: null, distanceMeters: null, provider: "STADIA_MAPS" });
    const unknown = await session.send("Bỏ Dinh Vương ngày 2", "v204-evidence-unknown");
    expect(unknown.responsePlan.goal).toBe("REPLAN_PROPOSAL");
    expect(unknown.generated?.proposal.checks.find(check => check.key === "TRAVEL_TIME")?.status).toBe("INSUFFICIENT_DATA");
    expect(unknown.generated?.proposal.eligibleForFinalConfirmation).toBe(false); expect(f.deps.save).not.toHaveBeenCalled();
  });
});

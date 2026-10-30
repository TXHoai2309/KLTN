import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema, type PlanningWorkspace } from "../assistant-planning/planning-contract";
import { analyzePlanningText, generateAiSelection, planningUnderstandingSchema } from "../assistant-planning/planning-ai";
import { executePlanning, type PlanningDependencies } from "../assistant-planning/planning-service";
import * as engine from "../assistant-planning/planning-engine";
import * as validator from "../trip-planner/planner-validator";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { assertStartDateForFinalConfirmation } from "../trip-requirement/trip-requirement-readiness";
import { executeAssistantV2Action } from "./agent-runtime";
import { fallbackPlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { startTravelPlanningV2Session, type PlanningSessionState } from "./travel-planning-session";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "fixture-only-v2", qaModel: "unrelated-model" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(role: "TRAVELER" | "ADMIN" | null = "TRAVELER") {
  let identity = role ? "owner" : null;
  const authorization: AuthorizationDependencies = {
    resolveSession: async () => identity ? { user: { id: identity } } : null,
    database: { user: { findUnique: async () => identity ? { id: identity, role, status: "ACTIVE" } : null } } as unknown as Pick<Database, "user">,
  };
  let workspace = planningWorkspaceSchema.parse({ conversationId: "owned-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  const repository: PlanningDependencies["repository"] = {
    start: vi.fn(async id => { if (id && id !== workspace.conversationId) throw new AppError("PLANNING_NOT_FOUND", "Not owned", 404); return structuredClone(workspace); }),
    read: vi.fn(async () => structuredClone(workspace)),
    checkpoint: vi.fn(),
    assertVersion: vi.fn(async (id, version) => {
      if (id !== workspace.conversationId || version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Stale state", 409);
      return structuredClone(workspace);
    }),
    review: vi.fn(async (id, version, needs) => {
      if (id !== workspace.conversationId || version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Stale state", 409);
      workspace = { ...workspace, version: version + 1, needs: structuredClone(needs) };
      return structuredClone(workspace);
    }),
    publishProposal: vi.fn(async (_id, version) => { workspace = { ...workspace, version: version + 1 }; return structuredClone(workspace); }),
    assertProposal: vi.fn(), completedSave: vi.fn(async () => null), pendingSave: vi.fn(async () => null), reserveSave: vi.fn(), finishSave: vi.fn(),
  };
  const save = vi.fn<PlanningDependencies["save"]>();
  const deps: PlanningDependencies = {
    repository, candidates: vi.fn(async () => [planningCandidate("a"), planningCandidate("b"), planningCandidate("c")]),
    analyze: vi.fn(analyzePlanningText), generate: vi.fn(generateAiSelection), recheck: vi.fn(async () => true),
    routes: { route: vi.fn(fixtureRoutes.route) }, save, validateForSave: vi.fn(), now: () => planningNow,
    compose: vi.fn(async () => { throw new Error("V1 composition must not run"); }),
  };
  const requests: { name: string; input: Record<string, unknown> }[] = [];
  const understanding = (text: string) => planningUnderstandingSchema.parse({
    intent: /2 hoặc 3|xe buýt/.test(text) ? "CLARIFY" : "NEEDS",
    durationDays: text.includes("3 ngày") ? 3 : text.includes("2 ngày") ? 2 : null,
    transport: text.includes("ô tô") ? "CAR" : text.includes("xe máy") ? "MOTORCYCLE" : null,
    startDate: text.includes("05/11/2026") ? "2026-11-05" : null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null,
    destinations: [], message: /2 hoặc 3/.test(text) ? "Bạn chọn 2 hay 3 ngày?" : /xe buýt/.test(text) ? "Bạn đi ô tô hay xe máy?" : "",
    operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
  });
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    const last = body.messages.at(-1);
    if (!last) throw new Error("Missing model input");
    const input = JSON.parse(last.content) as Record<string, unknown>;
    const name = body.response_format.json_schema.name;
    requests.push({ name, input });
    const requirement = input.requirement as { durationDays: number } | undefined;
    let value: unknown = name === "trip_chat_understanding" ? understanding(String(input.latestUserText))
      : name === "trip_chat_selection" ? { days: Array.from({ length: requirement?.durationDays ?? 0 }, (_, i) => [["a", "b", "c"][i]]) }
      : { message: fallbackPlanningV2Reply(input as PlanningResponsePlan) };
    if (name === "trip_chat_understanding" && input.interleaving && typeof value === "object" && value !== null) {
      value = { ...value, interleaved: { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false } };
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const boundaries = { authorization, qaForActor: () => ({ userId: "owner", service: { ask: async () => { throw new AppError("AI_UNAVAILABLE", "fixture QA unavailable", 503); } } }), forActor: vi.fn(() => deps) };
  const start = (conversationId: string | null = null, resume?: PlanningSessionState) => startTravelPlanningV2Session({ headers: new Headers(), conversationId, key: "v2-start-key", resume }, boundaries);
  return { start, boundaries, deps, repository, save, requests, workspace: () => structuredClone(workspace), changeIdentity: (id: string | null) => { identity = id; } };
}

describe("V2-02 internal authenticated planning path", () => {
  it("restores the minimum brief on a fresh session and generates once", async () => {
    const f = setup(); const a = await f.start();
    await a.send("2 ngày", "v207a-worker-a-days");
    const b = await f.start("owned-chat", JSON.parse(JSON.stringify(a.exportState())));
    const result = await b.send("ô tô", "v207a-worker-b-car");
    expect(result.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    expect(result.generated?.proposal.requirement).toMatchObject({ durationDays: 2, transport: "CAR" });
    expect(f.deps.generate).toHaveBeenCalledOnce(); expect(f.repository.publishProposal).toHaveBeenCalledOnce(); expect(f.save).not.toHaveBeenCalled();
  });
  it("preserves UNKNOWN on a fresh session and blocks another generation", async () => {
    const f = setup(); const a = await f.start();
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new Error("provider lost"));
    expect((await a.send("2 ngày ô tô", "v207a-unknown-a")).uncertain).toBe(true);
    const b = await f.start("owned-chat", JSON.parse(JSON.stringify(a.exportState())));
    await expect(b.send("3 ngày ô tô", "v207a-unknown-b")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
    expect(f.deps.generate).toHaveBeenCalledOnce(); expect(f.save).not.toHaveBeenCalled();
  });
  it("recovers the committed REVIEW version after a rejected initial generation and waits for an explicit new turn", async () => {
    const f = setup(); const session = await f.start();
    // V2-10: one corrective retry is made inside the turn, so the generator must fail twice to fail the turn.
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new AppError("PACE_LIMIT", "fixture invalid density", 422)).mockRejectedValueOnce(new AppError("PACE_LIMIT", "fixture invalid density", 422));
    const failed = await session.send("2 ngày ô tô", "v207-initial-generation-fail");
    expect(failed.responsePlan.goal).toBe("PROPOSAL_FAILED"); expect(failed.generated).toBeNull(); expect(failed.uncertain).toBe(false);
    expect(failed.workspace.version).toBe(1); expect(f.deps.generate).toHaveBeenCalledTimes(2); expect(f.save).not.toHaveBeenCalled();
    const recovered = await session.send("2 ngày ô tô", "v207-explicit-generation-retry");
    expect(recovered.responsePlan.goal).toBe("PRESENT_PROPOSAL"); expect(recovered.workspace.version).toBe(3); expect(f.deps.generate).toHaveBeenCalledTimes(3); expect(f.save).not.toHaveBeenCalled();
  });
  it("passes plain JSON needs to persistence when an exact date clears an optional departure window", async () => {
    const f = setup(); const session = await f.start();
    const result = await session.send("2 ngày ô tô khởi hành 05/11/2026", "v207-exact-date-json");
    expect(result.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    const needs = vi.mocked(f.repository.review).mock.calls[0]?.[2];
    expect(needs).toBeDefined(); expect(needs).toStrictEqual(JSON.parse(JSON.stringify(needs)));
    expect(result.latestNeeds.requirement.startDate).toBe("2026-11-05");
  });
  it.each(["TRAVELER", "ADMIN"] as const)("runs the exact new-trip → 2 days → car demo for %s using existing AI/engine/routes/Validator", async role => {
    const f = setup(role);
    const generate = vi.spyOn(engine, "generatePlanningProposal");
    const validate = vi.spyOn(validator, "validatePlannerDays");
    const session = await f.start();
    const first = await session.send("Tôi muốn lập hành trình đến Hà Giang bằng AI", "v2-demo-intent");
    expect(first.responsePlan.goal).toBe("ASK_DURATION");
    expect(first.message).toContain("mấy ngày?");
    const second = await session.send("2 ngày", "v2-demo-duration");
    expect(second.responsePlan.goal).toBe("ASK_TRANSPORT");
    expect(second.message).toContain("giữ tuyến gọn");
    expect(second.message).toContain("ô tô hay xe máy?");
    expect(f.repository.review).not.toHaveBeenCalled();
    const final = await session.send("ô tô", "v2-demo-transport");
    expect(final.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    expect(final.readiness.canDraft).toBe(true);
    expect(final.generated?.proposal).toMatchObject({ phase: "PRELIMINARY_PROPOSAL", status: "INSUFFICIENT_DATA", eligibleForFinalConfirmation: false, requirement: { durationDays: 2, transport: "CAR", startDate: null, pace: null, interests: [], companions: null, mobilityConstraints: null } });
    expect(final.generated?.proposal.days.map(day => day.date)).toEqual([null, null]);
    expect(final.generated?.proposal.checks.find(check => check.key === "OPENING_HOURS")?.status).toBe("INSUFFICIENT_DATA");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.deps.routes.route).toHaveBeenCalled();
    expect(f.repository.review).toHaveBeenCalledTimes(1);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
    expect(f.deps.compose).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.repository.reserveSave).not.toHaveBeenCalled();
    expect(final.message).toMatch(/chưa có ngày khởi hành/); expect(final.message).toMatch(/chưa lưu/);
    const plans = f.requests.filter(request => request.name === "planning_v2_response");
    expect(plans.map(request => request.input.goal)).toEqual(["ASK_DURATION", "ASK_TRANSPORT", "PRESENT_PROPOSAL"]);
    expect(plans.every(request => !("canonical" in request.input))).toBe(true);
    const understandingCalls = f.requests.filter(request => request.name === "trip_chat_understanding");
    expect(understandingCalls[2]?.input.dialogue).toMatchObject({ field: "transport" });
    // Existing Save gate still rejects this date-less proposal, never persisting a Trip.
    if (!final.generated) throw new Error("Expected a preliminary proposal");
    expect(() => assertStartDateForFinalConfirmation(final.generated!.proposal.requirement, planningNow)).toThrow(expect.objectContaining({ code: "TRIP_START_DATE_REQUIRED" }));
    await expect(executePlanning({ action: "SAVE", conversationId: final.workspace.conversationId, version: final.workspace.version, confirm: true, proposal: final.generated.proposal }, "explicit-save-no-date", f.deps)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    expect(f.save).not.toHaveBeenCalled();
  });

  it("drafts immediately from duration + motorcycle in the same message", async () => {
    const f = setup();
    const result = await (await f.start()).send("Tôi muốn đi Hà Giang 3 ngày bằng xe máy.", "v2-both-values");
    expect(result.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    expect(result.generated?.proposal.requirement).toMatchObject({ durationDays: 3, transport: "MOTORCYCLE" });
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
  });

  it("uses the latest explicit duration before generation", async () => {
    const f = setup(); const session = await f.start();
    await session.send("2 ngày", "v2-initial-days");
    await session.send("à 3 ngày", "v2-correct-days");
    const result = await session.send("ô tô", "v2-correct-car");
    expect(result.generated?.proposal.days).toHaveLength(3);
    expect(result.generated?.proposal.requirement.durationDays).toBe(3);
  });

  it("does not guess ambiguous duration or substitute unsupported transport", async () => {
    const f = setup(); const session = await f.start();
    const ambiguous = await session.send("2 hoặc 3 ngày", "v2-ambiguous-days");
    expect(ambiguous.responsePlan.goal).toBe("CLARIFY");
    expect(ambiguous.workspace.needs.requirement.durationDays).toBeUndefined();
    await session.send("2 ngày", "v2-chosen-days");
    const unsupported = await session.send("xe buýt", "v2-unsupported-bus");
    expect(unsupported.responsePlan.goal).toBe("CLARIFY");
    expect(unsupported.workspace.needs.requirement.transport).toBeUndefined();
    expect(f.deps.generate).not.toHaveBeenCalled();
  });

  it("does not promote a tentative ambiguous duration into a draft after a transport-only reply", async () => {
    const f = setup(); const session = await f.start();
    await session.send("2 hoặc 3 ngày", "v2-tentative-days");
    const transport = await session.send("ô tô", "v2-tentative-car");
    expect(transport.responsePlan.goal).toBe("ASK_DURATION");
    expect(transport.generated).toBeNull();
    expect(f.deps.generate).not.toHaveBeenCalled();
    const resolved = await session.send("2 ngày", "v2-confirmed-days");
    expect(resolved.generated?.proposal.requirement.durationDays).toBe(2);
  });

  it("keeps business work single-execution when result composition fails and the same turn is repeated", async () => {
    const f = setup();
    const compose = vi.fn(async () => { throw new Error("language provider failure"); });
    const session = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v2-fallback-start" }, { ...f.boundaries, compose });
    const result = await session.send("2 ngày ô tô", "v2-fallback-turn");
    const replay = await session.send("2 ngày ô tô", "v2-fallback-turn");
    expect(replay).toEqual(result);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
    expect(f.save).not.toHaveBeenCalled();
    await expect(session.send("3 ngày ô tô", "v2-fallback-turn")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects Guest, foreign conversation, changed identity and stale workspace before model use", async () => {
    const guest = setup(null);
    await expect(guest.start()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(guest.boundaries.forActor).not.toHaveBeenCalled();
    const f = setup();
    await expect(f.start("foreign-chat")).rejects.toMatchObject({ code: "PLANNING_NOT_FOUND" });
    const session = await f.start();
    f.changeIdentity("different-user");
    await expect(session.send("2 ngày ô tô", "v2-identity-change")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.deps.analyze).not.toHaveBeenCalled();
    f.changeIdentity("owner");
    const fresh = await f.start();
    vi.mocked(f.repository.assertVersion).mockRejectedValueOnce(new AppError("PLANNING_CHANGED", "Stale", 409));
    await expect(fresh.send("2 ngày ô tô", "v2-stale-state")).rejects.toMatchObject({ code: "PLANNING_CHANGED" });
    expect(f.deps.generate).not.toHaveBeenCalled();
  });

  it("keeps action inputs, context binding, readiness and missing dependencies enforced", async () => {
    const f = setup(); const context = { userId: "owner", workspace: f.workspace() };
    const input = { skill: "travel-planning", context, action: "generate-preliminary-proposal" as const, payload: { needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 2, transport: "BUS" } }, key: "v2-invalid-action" } };
    await expect(executeAssistantV2Action(input)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    input.payload.needs.requirement.transport = "CAR";
    await expect(executeAssistantV2Action(input)).rejects.toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause: { code: "PLANNING_CONTEXT_REQUIRED" } });
    await expect(executeAssistantV2Action(input, { planning: { userId: "different-user", dependencies: f.deps } })).rejects.toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause: { code: "PLANNING_CONTEXT_REQUIRED" } });
    await expect(executeAssistantV2Action({ ...input, payload: { needs: EMPTY_PLANNING_NEEDS, key: "v2-empty-action" } }, { planning: { userId: "owner", dependencies: f.deps } })).rejects.toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause: { code: "TRIP_NEEDS_INCOMPLETE" } });
    expect(f.deps.generate).not.toHaveBeenCalled();
  });

  it("preserves planning when the QA service is unavailable", async () => {
    const f = setup(); const session = await f.start();
    const first = await session.send("2 ngày ô tô", "v2-one-proposal");
    vi.mocked(f.deps.analyze).mockResolvedValueOnce({ intent: "QA", needs: first.workspace.needs, unresolved: [], message: "", operation: null });
    const next = await session.send("Giá vé bao nhiêu?", "v2-later-qa");
    expect(next.responsePlan.goal).toBe("QA_FAILED");
    expect(next.generated).toEqual(first.generated);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
  });

  it("cannot replace a real Validator violation with a fluent all-pass claim", async () => {
    const f = setup();
    vi.mocked(f.deps.candidates).mockResolvedValue([planningCandidate("a", 600), planningCandidate("b", 600)]);
    const compose = vi.fn(async () => "Tất cả đều đáp ứng, lịch hợp lý và có thể lưu ngay.");
    const session = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v2-violation-start" }, { ...f.boundaries, compose });
    const result = await session.send("2 ngày ô tô", "v2-violation-turn");
    expect(result.generated?.proposal.status).toBe("NO_FEASIBLE_ITINERARY");
    expect(result.generated?.proposal.checks.some(check => check.status === "VIOLATION")).toBe(true);
    expect(result.message).toMatch(/chưa đạt|vi phạm/); expect(result.message).not.toMatch(/đều đáp ứng/);
    expect(f.save).not.toHaveBeenCalled();
  });

  it("returns a controlled uncertain business failure without claiming a proposal or retrying the engine", async () => {
    const f = setup();
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new Error("selection provider unavailable"));
    const session = await f.start();
    const failed = await session.send("2 ngày ô tô", "v2-provider-failure");
    expect(failed.responsePlan).toMatchObject({ goal: "PROPOSAL_FAILED", refinementOutcome: "UNKNOWN", proposalChanged: false });
    expect(failed.generated).toBeNull(); expect(failed.uncertain).toBe(true);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.repository.publishProposal).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });

  it("retries a lost REVIEW acknowledgement with the identical payload/key before checking the old version", async () => {
    const f = setup();
    const original = vi.mocked(f.repository.review).getMockImplementation();
    if (!original) throw new Error("Expected the canonical review fixture");
    let committed: PlanningWorkspace | null = null;
    vi.mocked(f.repository.review).mockImplementation(async (...args) => {
      if (committed) return structuredClone(committed);
      committed = await original(...args);
      throw new AppError("OPERATION_STATUS_UNKNOWN", "Lost review acknowledgement", 503);
    });
    const request = {
      skill: "travel-planning", context: { userId: "owner", workspace: f.workspace() },
      action: "generate-preliminary-proposal" as const,
      payload: { needs: { ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 2, transport: "CAR" } }, key: "v2-unknown-review" },
    };
    const services = { planning: { userId: "owner", dependencies: f.deps } };
    await expect(executeAssistantV2Action(request, services)).rejects.toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause: { code: "OPERATION_STATUS_UNKNOWN" } });
    const result = await executeAssistantV2Action(request, services);
    expect(result.generated.proposal.phase).toBe("PRELIMINARY_PROPOSAL");
    expect(vi.mocked(f.repository.review).mock.calls[0]).toEqual(vi.mocked(f.repository.review).mock.calls[1]);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight same-key turn even after REVIEW has advanced the persisted version", async () => {
    const f = setup();
    const original = vi.mocked(f.deps.generate).getMockImplementation();
    if (!original) throw new Error("Expected selection fixture");
    let release: () => void = () => { throw new Error("Missing generation barrier"); };
    const barrier = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(f.deps.generate).mockImplementation(async input => { await barrier; return original(input); });
    const session = await f.start();
    const first = session.send("2 ngày ô tô", "v2-concurrent-turn");
    await vi.waitFor(() => expect(f.deps.generate).toHaveBeenCalledTimes(1));
    expect(f.workspace().version).toBe(1);
    const second = session.send("2 ngày ô tô", "v2-concurrent-turn");
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { EMPTY_PLANNING_NEEDS, planningRequestSchema, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { analyzePlanningText, generateAiSelection, planningUnderstandingSchema } from "../assistant-planning/planning-ai";
import { planningProposalHash, type PlanningDependencies } from "../assistant-planning/planning-service";
import * as validator from "../trip-planner/planner-validator";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { executeAssistantV2Action } from "./agent-runtime";
import { acceptsPlanningV2Reply, fallbackPlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { startTravelPlanningV2Session, type PlanningSessionState } from "./travel-planning-session";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v203-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type Understanding = z.infer<typeof planningUnderstandingSchema>;
const base: Understanding = {
  intent: "NEEDS", durationDays: null, transport: null, startDate: null, departureText: null,
  pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [],
  message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
};
const facts: Record<string, Partial<Understanding>> = {
  "Tôi muốn đi Hà Giang": {}, "2 ngày": { durationDays: 2 }, "ô tô": { transport: "CAR" },
  "2 ngày ô tô": { durationDays: 2, transport: "CAR" },
  "Mình thích trải nghiệm văn hóa": { interests: ["CULTURE_HISTORY"] },
  "Mình muốn nhịp vừa phải": { pace: "MODERATE" },
  "Mình muốn đi thư thả hơn": { pace: "RELAXED" },
  "Thích văn hóa, đi vừa phải, nhóm 2 người": { interests: ["CULTURE_HISTORY"], pace: "MODERATE", companions: { type: null, groupSize: 2 } },
  "Thực ra mình thích thiên nhiên hơn": { interests: ["NATURE"] },
  "Đi cùng người yêu, 2 người": { companions: { type: "COUPLE", groupSize: 2 } },
  "Mình đi cùng bố mẹ": { intent: "CLARIFY", companions: { type: "FAMILY", groupSize: null } },
  "Bố mẹ mình đi bộ khá khó": { mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: null } },
  "Nhất định muốn ghé Cột cờ Lũng Cú": { destinations: [{ name: "Cột cờ Lũng Cú", required: true, remove: false }] },
  "Không muốn đi Mã Pì Lèng": { destinations: [{ name: "Mã Pì Lèng", required: false, remove: true }] },
  "Muốn ghé Lũng": { destinations: [{ name: "Lũng", required: true, remove: false }] },
  "Giá vé bao nhiêu?": { intent: "QA" },
};

function fixture() {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "v203-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let fingerprint: string | null = null;
  const candidates = [
    { ...planningCandidate("nature"), name: "Mã Pì Lèng", category: "Thiên nhiên" },
    { ...planningCandidate("culture"), name: "Dinh Vương", category: "Văn hóa" },
    { ...planningCandidate("lungcu"), name: "Cột cờ Lũng Cú", category: "Văn hóa" },
    { ...planningCandidate("lungtam"), name: "Làng Lũng Tám", category: "Văn hóa" },
  ];
  const repository: PlanningDependencies["repository"] = {
    start: vi.fn(async () => structuredClone(workspace)), read: vi.fn(async () => structuredClone(workspace)), checkpoint: vi.fn(),
    assertVersion: vi.fn(async (id, version) => { if (id !== workspace.conversationId || version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Stale", 409); return structuredClone(workspace); }),
    review: vi.fn(async (_id, version, needs) => { workspace = { ...workspace, needs, version: version + 1 }; fingerprint = null; return structuredClone(workspace); }),
    publishProposal: vi.fn(async (_id, version, hash, _key, refinement) => {
      if (version !== workspace.version || refinement && refinement.previousHash !== fingerprint) throw new AppError("PLANNING_CHANGED", "Stale", 409);
      workspace = { ...workspace, version: version + 1, ...(refinement ? { needs: refinement.needs } : {}) }; fingerprint = hash;
      return structuredClone(workspace);
    }),
    assertProposal: vi.fn(async (_id, version, hash) => { if (version !== workspace.version || hash !== fingerprint) throw new AppError("PLANNING_CHANGED", "Stale proposal", 409); }),
    completedSave: vi.fn(), pendingSave: vi.fn(), reserveSave: vi.fn(), finishSave: vi.fn(),
  };
  const authorization: AuthorizationDependencies = {
    resolveSession: async () => ({ user: { id: "owner" } }),
    database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER", status: "ACTIVE" }) } } as unknown as Pick<Database, "user">,
  };
  const deps: PlanningDependencies = {
    repository, candidates: vi.fn(async () => structuredClone(candidates)), analyze: vi.fn(analyzePlanningText), generate: vi.fn(generateAiSelection),
    routes: { route: vi.fn(fixtureRoutes.route) }, recheck: vi.fn(async () => true), now: () => planningNow,
    save: vi.fn(), validateForSave: vi.fn(), compose: vi.fn(),
  };
  const requests: { name: string; input: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[]; response_format: { json_schema: { name: string } } };
    const latest = body.messages.at(-1);
    if (!latest) throw new Error("Missing model input");
    const input = JSON.parse(latest.content) as Record<string, unknown>;
    const name = body.response_format.json_schema.name;
    requests.push({ name, input });
    let value: unknown;
    if (name === "trip_chat_understanding") {
      value = { ...base, ...(facts[String(input.latestUserText)] ?? {}) };
      const dialogue = input.dialogue as { mode?: string; current?: unknown } | undefined;
      if (dialogue?.current && !dialogue.mode) throw new Error("Refinement context missing");
      if (dialogue?.mode) expect(body.messages.some(message => message.content.includes("tinh chỉnh sở thích"))).toBe(true);
    } else if (name === "trip_chat_selection") {
      const requirement = input.requirement as { durationDays: number; interests: string[]; pace: string | null };
      const needs = input.needs as { requiredDestinationIds: string[]; excludedDestinationIds?: string[] };
      const eligible = (input.eligibleCandidates as { id: string; category: string }[]).map(candidate => candidate.id);
      const preferred = requirement.interests.includes("CULTURE_HISTORY") ? ["culture", "lungcu", "lungtam"] : ["nature", "culture", "lungcu"];
      const ids = [...new Set([...needs.requiredDestinationIds, ...preferred])].filter(id => eligible.includes(id) && !needs.excludedDestinationIds?.includes(id));
      value = { days: Array.from({ length: requirement.durationDays }, (_, i) => [ids[i % ids.length]]) };
    } else value = { message: fallbackPlanningV2Reply(input as PlanningResponsePlan) };
    if (name === "trip_chat_understanding" && input.interleaving && typeof value === "object" && value !== null) {
      value = { ...value, interleaved: { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false } };
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const boundaries = { authorization, qaForActor: () => ({ userId: "owner", service: { ask: async () => { throw new AppError("AI_UNAVAILABLE", "fixture QA unavailable", 503); } } }), forActor: () => deps };
  const start = (compose?: (plan: PlanningResponsePlan) => Promise<string>, resume?: PlanningSessionState) => startTravelPlanningV2Session({ headers: new Headers(), conversationId: resume?.workspace.conversationId ?? null, key: "v203-start-key", resume }, { ...boundaries, ...(compose ? { compose } : {}) });
  return { start, deps, repository, candidates, requests, workspace: () => structuredClone(workspace), fingerprint: () => fingerprint };
}

describe("V2-03 progressive refinement", () => {
  it("restores the current proposal on a fresh worker before cultural refinement", async () => {
    const f = fixture(); const a = await f.start();
    const first = await a.send("2 ngày ô tô", "v207a-refine-worker-a");
    const b = await f.start(undefined, JSON.parse(JSON.stringify(a.exportState())));
    const refined = await b.send("Mình thích trải nghiệm văn hóa", "v207a-refine-worker-b");
    expect(refined.responsePlan).toMatchObject({ goal: "REFINE_PROPOSAL", proposalChanged: true });
    expect(refined.generated?.selection).not.toEqual(first.generated?.selection);
    expect(f.fingerprint()).toBe(planningProposalHash(refined.generated!.proposal));
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(2); expect(f.deps.save).not.toHaveBeenCalled();
  });
  it("does not let a public V1 request select the internal refinement understanding policy", () => {
    expect(planningRequestSchema.safeParse({ action: "ANALYZE", conversationId: "chat", version: 0, text: "Văn hóa", draft: EMPTY_PLANNING_NEEDS,
      dialogue: { question: "", field: null, recent: [], current: null, mode: "PREFERENCE_REFINEMENT" },
    }).success).toBe(false);
  });

  it("demonstrates culture then moderate pace without a remaining-field questionnaire", async () => {
    const f = fixture(); const validate = vi.spyOn(validator, "validatePlannerDays"); const session = await f.start();
    await session.send("Tôi muốn đi Hà Giang", "v203-demo-intent");
    await session.send("2 ngày", "v203-demo-duration");
    const first = await session.send("ô tô", "v203-demo-transport");
    const original = structuredClone(first.generated);
    const culture = await session.send("Mình thích trải nghiệm văn hóa", "v203-demo-culture");
    expect(culture.responsePlan).toMatchObject({ goal: "REFINE_PROPOSAL", proposalChanged: true, refinementOutcome: "PUBLISHED" });
    expect(culture.responsePlan.refinement?.changedFields).toEqual(["interests"]);
    expect(culture.message).toMatch(/ưu tiên.*văn hóa/);
    expect(culture.message).not.toMatch(/Mình ghi nhận|\?/);
    expect(culture.generated?.selection).not.toEqual(first.generated?.selection);
    expect(culture.generated?.version).toBe(first.workspace.version + 1);
    expect(culture.generated?.proposal.proposalId).not.toBe(first.generated?.proposal.proposalId);
    const pace = await session.send("Mình muốn nhịp vừa phải", "v203-demo-pace");
    expect(pace.latestNeeds.requirement).toMatchObject({ interests: ["CULTURE_HISTORY"], pace: "MODERATE", startDate: null, companions: null, mobilityConstraints: null });
    expect(pace.message).toMatch(/tránh nhồi.*giữ thời gian tham quan/);
    expect(pace.message).not.toContain("?");
    expect(pace.generated?.proposal.phase).toBe("PRELIMINARY_PROPOSAL");
    expect(pace.generated?.proposal.checks.find(check => check.key === "OPENING_HOURS")?.status).toBe("INSUFFICIENT_DATA");
    expect(pace.generated?.proposal.eligibleForFinalConfirmation).toBe(false);
    expect(first.generated).toEqual(original);
    expect(f.fingerprint()).toBe(planningProposalHash(pace.generated!.proposal));
    expect(f.deps.generate).toHaveBeenCalledTimes(3); expect(validate).toHaveBeenCalledTimes(3);
    expect(f.deps.routes.route).toHaveBeenCalledTimes(3);
    expect(f.repository.review).toHaveBeenCalledTimes(1);
    expect(f.deps.save).not.toHaveBeenCalled(); expect(f.repository.reserveSave).not.toHaveBeenCalled();
  });

  it("applies multiple explicit facts together once, including a count without an assumed group type", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày ô tô", "v203-multi-first");
    const result = await session.send("Thích văn hóa, đi vừa phải, nhóm 2 người", "v203-multi-facts");
    expect(result.latestNeeds.requirement).toMatchObject({ interests: ["CULTURE_HISTORY"], pace: "MODERATE", companions: null });
    expect(result.latestNeeds.companionDraft).toEqual({ groupSize: 2 });
    expect(result.responsePlan.planningImplications).toEqual(expect.arrayContaining(["CULTURE_PRIORITY", "MODERATE_PACE", "GROUP_CONTEXT"]));
    expect(result.message).not.toContain("?"); expect(f.deps.generate).toHaveBeenCalledTimes(2);
  });

  it("replaces a conflicting interest correction and treats repetitions as no change", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày ô tô", "v203-correct-first");
    await session.send("Mình thích trải nghiệm văn hóa", "v203-correct-culture");
    const nature = await session.send("Thực ra mình thích thiên nhiên hơn", "v203-correct-nature");
    expect(nature.generated?.proposal.requirement.interests).toEqual(["NATURE"]);
    expect(nature.message).toMatch(/chuyển ưu tiên.*thiên nhiên/);
    const again = await session.send("Thực ra mình thích thiên nhiên hơn", "v203-repeat-nature");
    expect(again.responsePlan.goal).toBe("ACKNOWLEDGE_NO_CHANGE"); expect(again.generated).toEqual(nature.generated);
    expect(again.message).not.toContain("?"); expect(f.deps.generate).toHaveBeenCalledTimes(3);
  });

  it("does not invent romance, ages, mobility or a mandatory count from companion context", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày ô tô", "v203-family-first");
    const couple = await session.send("Đi cùng người yêu, 2 người", "v203-couple");
    expect(couple.generated?.proposal.requirement.companions).toEqual({ type: "COUPLE", groupSize: 2 });
    expect(couple.message).not.toMatch(/lãng mạn|\?/);
    // A fresh partial-family answer must not force the missing companion count.
    const g = fixture(); const another = await g.start(); await another.send("2 ngày ô tô", "v203-parents-first");
    const parents = await another.send("Mình đi cùng bố mẹ", "v203-parents");
    expect(parents.latestNeeds.companionDraft?.type).toBe("FAMILY");
    expect(parents.latestNeeds.companionDraft?.groupSize).toBeUndefined();
    expect(parents.generated?.proposal.requirement.mobilityConstraints).toBeNull();
    expect(parents.message).not.toMatch(/cao tuổi|đi bộ khó|\?/);
  });

  it("re-evaluates mobility via the real Validator without certifying accessibility", async () => {
    const f = fixture(); const validate = vi.spyOn(validator, "validatePlannerDays"); const session = await f.start();
    await session.send("2 ngày ô tô", "v203-mobility-first");
    const result = await session.send("Bố mẹ mình đi bộ khá khó", "v203-mobility");
    expect(result.generated?.proposal.requirement.mobilityConstraints?.flags).toEqual(["AVOID_LONG_WALKING"]);
    expect(result.generated?.proposal.checks.find(check => check.key === "MOBILITY")?.status).toBe("INSUFFICIENT_DATA");
    expect(result.message).toMatch(/đánh giá lại.*chưa thể xác minh/); expect(validate).toHaveBeenCalledTimes(2);
    expect(f.deps.recheck).toHaveBeenCalledTimes(2);
  });

  it("uses existing must-visit and exclusion normalization, and clarifies ambiguous destinations", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày ô tô", "v203-stops-first");
    const required = await session.send("Nhất định muốn ghé Cột cờ Lũng Cú", "v203-required");
    expect(required.generated?.selection.days.flat()).toContain("lungcu");
    expect(required.workspace.needs.requiredDestinationIds).toContain("lungcu");
    const excluded = await session.send("Không muốn đi Mã Pì Lèng", "v203-excluded");
    expect(excluded.generated?.selection.days.flat()).not.toContain("nature");
    expect(excluded.workspace.needs.excludedDestinationIds).toContain("nature");
    const ambiguous = await session.send("Muốn ghé Lũng", "v203-ambiguous");
    expect(ambiguous.responsePlan.goal).toBe("CLARIFY");
    expect(ambiguous.responsePlan.optionalQuestion?.choices).toHaveLength(2);
    expect(ambiguous.generated).toEqual(excluded.generated);
    expect(f.deps.generate).toHaveBeenCalledTimes(3);
    const chosen = await session.send("1", "v203-resolve");
    expect(chosen.responsePlan.goal).toBe("ACKNOWLEDGE_NO_CHANGE");
    expect(chosen.workspace.needs.requiredDestinationIds).toEqual(["lungcu"]);
  });

  it("preserves the proposal on QA service failure without refinement", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày ô tô", "v203-edit-first");
    const result = await session.send("Giá vé bao nhiêu?", "v203-qa-turn");
    expect(result.responsePlan.goal).toBe("QA_FAILED"); expect(result.generated).toEqual(first.generated);
    expect(result.workspace).toEqual(first.workspace); expect(f.deps.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous canonical proposal on generation failure while retaining latest explicit needs", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày ô tô", "v203-fail-first");
    const hash = f.fingerprint(); vi.mocked(f.deps.generate).mockRejectedValueOnce(new Error("fixture provider unavailable"));
    const failed = await session.send("Mình thích trải nghiệm văn hóa", "v203-fail");
    expect(failed.responsePlan).toMatchObject({ goal: "REFINEMENT_FAILED", refinementOutcome: "FAILED", proposalChanged: false });
    expect(failed.generated).toEqual(first.generated); expect(failed.workspace).toEqual(first.workspace);
    expect(failed.latestNeeds.requirement.interests).toEqual(["CULTURE_HISTORY"]); expect(f.fingerprint()).toBe(hash);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1); expect(failed.message).toMatch(/đề xuất trước vẫn được giữ/);
    const cancel = await session.send("giữ nguyên", "v203-fail-cancel");
    expect(cancel.latestNeeds).toEqual(first.workspace.needs); expect(cancel.generated).toEqual(first.generated);
  });

  it("rejects a violating candidate without publishing it or reporting valid refinement", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày ô tô", "v203-reject-first");
    vi.mocked(f.deps.candidates).mockResolvedValue(f.candidates.map(candidate => ({ ...candidate, minimumDurationMinutes: 600, suggestedDurationMinutes: 600 })));
    const result = await session.send("Mình thích trải nghiệm văn hóa", "v203-reject");
    expect(result.responsePlan.refinementOutcome).toBe("REJECTED");
    expect(result.refinementCandidate?.proposal.status).toBe("NO_FEASIBLE_ITINERARY");
    expect(result.responsePlan.validation?.status).toBe("NO_FEASIBLE_ITINERARY"); expect(result.message).toContain("vi phạm");
    expect(result.generated).toEqual(first.generated); expect(result.workspace).toEqual(first.workspace);
    expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
  });

  it("keeps the current proposal when no eligible candidate remains instead of publishing an empty itinerary", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày ô tô", "v203-empty-first");
    vi.mocked(f.deps.candidates).mockResolvedValue([]);
    const empty = await session.send("Mình thích trải nghiệm văn hóa", "v203-empty-refine");
    expect(empty.responsePlan.refinementOutcome).toBe("REJECTED");
    expect(empty.refinementCandidate?.proposal.checks.some(check => check.status === "INSUFFICIENT_DATA")).toBe(true);
    expect(empty.generated).toEqual(first.generated); expect(empty.workspace).toEqual(first.workspace);
    expect(empty.message).toContain("đề xuất trước vẫn được giữ"); expect(f.repository.publishProposal).toHaveBeenCalledTimes(1);
  });

  it("shares a concurrent refinement turn and never publishes two canonical replacements", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày ô tô", "v203-concurrent-first");
    const original = vi.mocked(f.deps.generate).getMockImplementation();
    if (!original) throw new Error("Expected fixture provider");
    let release: () => void = () => { throw new Error("Missing barrier"); };
    const barrier = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(f.deps.generate).mockImplementation(async input => { await barrier; return original(input); });
    const first = session.send("Mình thích trải nghiệm văn hóa", "v203-concurrent-refine");
    await vi.waitFor(() => expect(f.deps.generate).toHaveBeenCalledTimes(2));
    const second = session.send("Mình thích trải nghiệm văn hóa", "v203-concurrent-refine");
    release(); const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b); expect(f.deps.generate).toHaveBeenCalledTimes(2); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("rejects stale current proposals before generation and freezes unknown publication outcomes", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày ô tô", "v203-unknown-first");
    if (!first.generated) throw new Error("Missing first proposal");
    await expect(executeAssistantV2Action({ skill: "travel-planning", context: { userId: "owner", workspace: first.workspace }, action: "refine-preliminary-proposal", payload: { needs: first.workspace.needs, current: { ...first.generated, version: 0 }, key: "v203-stale-action" } }, { planning: { userId: "owner", dependencies: f.deps } })).rejects.toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause: { code: "PLANNING_CHANGED" } });
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    vi.mocked(f.repository.publishProposal).mockRejectedValueOnce(new AppError("OPERATION_STATUS_UNKNOWN", "Unknown publication", 503));
    const unknown = await session.send("Mình thích trải nghiệm văn hóa", "v203-unknown");
    expect(unknown.uncertain).toBe(true); expect(unknown.responsePlan.refinementOutcome).toBe("UNKNOWN");
    expect(unknown.generated).toEqual(first.generated); expect(unknown.message).toMatch(/Chưa rõ.*đối soát/);
    await expect(session.send("Mình muốn nhịp vừa phải", "v203-after-unknown")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
    const replay = await session.send("Mình thích trải nghiệm văn hóa", "v203-unknown"); expect(replay).toEqual(unknown);
    expect(f.deps.generate).toHaveBeenCalledTimes(2);
  });

  it("does not repeat business work on language failure, rejects acknowledgements and factual suitability claims", async () => {
    const f = fixture(); let fail = false;
    const session = await f.start(async plan => { if (fail) throw new Error("wording unavailable"); return fallbackPlanningV2Reply(plan); });
    await session.send("2 ngày ô tô", "v203-language-first"); fail = true;
    const result = await session.send("Mình thích trải nghiệm văn hóa", "v203-language");
    expect(result.message).toMatch(/ưu tiên.*văn hóa/); expect(result.responsePlan.proposalChanged).toBe(true);
    expect(f.deps.generate).toHaveBeenCalledTimes(2); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
    expect(acceptsPlanningV2Reply("Mình ghi nhận bạn thích văn hóa nhé. Bạn đi cùng ai?", result.responsePlan)).toBe(false);
    expect(acceptsPlanningV2Reply("Mình ưu tiên văn hóa ở điểm này vì nó ít đông và phù hợp người khó đi bộ. Đây là sơ bộ, chưa đủ dữ liệu.", result.responsePlan)).toBe(false);
    expect(acceptsPlanningV2Reply(result.message, result.responsePlan)).toBe(true);
    expect(f.deps.save).not.toHaveBeenCalled();
  });
});

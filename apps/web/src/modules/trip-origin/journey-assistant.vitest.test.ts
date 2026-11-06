import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { startTravelPlanningV2Session } from "../assistant-agent-v2/travel-planning-session";
import { createAssistantV2HttpService } from "../assistant-agent-v2/http-service";
import { assistantV2RequestSchema } from "../assistant-agent-v2/http-contract";
import { createTestSessionHeadStore } from "../assistant-agent-v2/session-head-test-store";
import { planningNeedsSchema, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { planningHash } from "../assistant-planning/planning-repository";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { candidate } from "../trip-planner/__fixtures__/planner-fixtures";
import { createPlannerService } from "../trip-planner/planner-service";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { AppError } from "@/server/http/app-error";

function fixture() {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "owned-origin-chat", version: 0, needs: { requirement: { durationDays: 1, transport: "CAR", startDate: "2027-01-02" }, requiredDestinationIds: ["a"], preferredDestinationIds: [], destinationNames: {} }, pendingSaveKey: null, savedTripId: null });
  let hash: string | null = null, unknown = false;
  const now = new Date("2027-01-01T00:00:00Z");
  const repository: PlanningDependencies["repository"] = {
    start: async () => structuredClone(workspace), read: async () => structuredClone(workspace), checkpoint: vi.fn(),
    assertVersion: async (_id, version) => { if (workspace.version !== version) throw new AppError("PLANNING_CHANGED", "stale", 409); return structuredClone(workspace); },
    review: async (_id, version, needs) => { if (workspace.version !== version) throw new AppError("PLANNING_CHANGED", "stale", 409); workspace = { ...workspace, version: version + 1, needs }; return structuredClone(workspace); },
    publishProposal: async (_id, version, nextHash, _key, refinement) => {
      if (unknown) throw new Error("lost publication response");
      if (workspace.version !== version) throw new AppError("PLANNING_CHANGED", "stale", 409);
      hash = nextHash; workspace = { ...workspace, version: version + 1, needs: refinement?.needs ?? workspace.needs }; return structuredClone(workspace);
    },
    assertProposal: async (_id, _version, proposedHash) => { if (hash !== proposedHash) throw new AppError("PLANNING_CHANGED", "proposal superseded", 409); },
    completedSave: vi.fn(async () => null), pendingSave: vi.fn(async () => null), reserveSave: vi.fn(), finishSave: vi.fn(),
  };
  const metric = { status: "VERIFIED" as const, reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" as const };
  const deps: PlanningDependencies = { repository, candidates: async () => [candidate("a")], recheck: async () => true, generate: async () => ({ days: [["a"]] }),
    routes: { route: async pair => ({ ...metric, fromDestinationId: pair.from.id, toDestinationId: pair.to.id }), coordinateRoute: async () => metric },
    analyze: vi.fn(async (_text, needs) => ({ intent: "QA" as const, needs, unresolved: [], message: "source-only QA" })), save: vi.fn(), validateForSave: vi.fn(), now: () => now };
  const authorization = { database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER" }) } } as unknown as Database, resolveSession: async () => ({ user: { id: "owner" } }) };
  const boundaries = { authorization, forActor: () => deps, compose: async () => "Thông tin đã được ghi nhận.", qaForActor: () => ({ userId: "owner", service: { ask: async () => { throw new AppError("AI_UNAVAILABLE", "synthetic QA outage", 503); } } }) };
  return { deps, authorization, boundaries, workspace: () => workspace, unknown: () => { unknown = true; } };
}
describe("Assistant structured ORIGIN operation", () => {
  it("normalizes the dedicated contract and rejects using in-trip GPS as an origin payload", () => {
    const base = { action: "ASSISTANT_V2", operation: "ORIGIN", sessionId: "00000000-0000-4000-8000-000000000001" };
    expect(assistantV2RequestSchema.safeParse({ ...base, journey: COMPLETE_JOURNEY_FIXTURE }).success).toBe(true);
    expect(assistantV2RequestSchema.safeParse({ ...base, location: { source: "GPS", latitude: 21, longitude: 105 } }).success).toBe(false);
  });
  it("generates and refines through shared form scheduling while retaining constraints/checkpoint state", async () => {
    const f = fixture();
    const session = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "origin-start" }, f.boundaries);
    const first = await session.provideOrigin(COMPLETE_JOURNEY_FIXTURE, "origin-first");
    expect(first.generated?.proposal.requirement.journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
    const form = createPlannerService({ repository: { candidates: f.deps.candidates, recheck: f.deps.recheck }, routes: f.deps.routes, now: f.deps.now });
    const direct = await form.propose("owner", "origin-form-parity", first.generated!.proposal.requirement);
    expect(first.generated?.proposal.days).toEqual(direct.days);
    expect(first.generated?.proposal.checks).toEqual(direct.checks);
    expect(first.generated?.proposal.journeyPlan).toEqual(direct.journeyPlan);
    const second = await session.provideOrigin({ ...COMPLETE_JOURNEY_FIXTURE, departureMinute: 480 }, "origin-refine");
    expect(second.generated?.version).toBeGreaterThan(first.generated!.version!);
    expect(second.latestNeeds.requiredDestinationIds).toEqual(["a"]);
    expect(second.generated?.proposal.days[0]?.stops[0]?.arrivalMinute).toBe(540);
    const beforeQa = session.exportState();
    await session.send("Một câu hỏi văn hóa Hà Giang?", "origin-qa-interruption");
    const afterQa = session.exportState();
    expect(afterQa.generated).toEqual(beforeQa.generated);
    expect(afterQa.needs).toEqual(beforeQa.needs);
    expect(afterQa.workspace.version).toBe(beforeQa.workspace.version);
    const restored = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: f.workspace().conversationId, key: "origin-resume", resume: session.exportState() }, f.boundaries);
    expect((await restored.snapshot()).generated?.proposal.requirement.journey?.departureMinute).toBe(480);
    expect(f.deps.save).not.toHaveBeenCalled();
    await expect(restored.provideOrigin({ ...COMPLETE_JOURNEY_FIXTURE, origin: { ...COMPLETE_JOURNEY_FIXTURE.origin!, latitude: 20, longitude: 102 } }, "outside-origin")).rejects.toMatchObject({ code: "ORIGIN_OUTSIDE_VIETNAM" });
  });
  it("freezes after uncertain origin refinement and preserves the previous canonical proposal", async () => {
    const f = fixture(); const session = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "origin-start" }, f.boundaries);
    const original = await session.provideOrigin(COMPLETE_JOURNEY_FIXTURE, "origin-first");
    f.unknown();
    await expect(session.provideOrigin({ ...COMPLETE_JOURNEY_FIXTURE, departureMinute: 480 }, "origin-unknown")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
    const snapshot = await session.snapshot(); expect(snapshot.uncertain).toBe(true); expect(snapshot.generated).toEqual(original.generated);
    await expect(session.provideOrigin(COMPLETE_JOURNEY_FIXTURE, "origin-new-mutation")).rejects.toMatchObject({ code: "PLANNING_BUSY" });
  });
  it("carries encrypted state over HTTP workers and rejects stale versions/different actor", async () => {
    const f = fixture(); const heads = createTestSessionHeadStore();
    const options = { authorization: f.authorization, forActor: () => f.deps, heads, secret: () => "origin-test-only-long-secret-more-than-32-characters", now: () => 1 };
    const a = createAssistantV2HttpService(options), b = createAssistantV2HttpService(options);
    const started = await a({ action: "ASSISTANT_V2", operation: "START" }, "origin-http-start", "owner", new Headers()) as { sessionId: string; stateToken: string };
    const command = { action: "ASSISTANT_V2" as const, operation: "ORIGIN" as const, ...started, journey: COMPLETE_JOURNEY_FIXTURE };
    const result = await b(command, "origin-http-first", "owner", new Headers()) as { turn: { generated: unknown }; stateToken: string };
    expect(result.turn.generated).not.toBeNull();
    expect(result.stateToken).not.toContain("Hà Nội");
    await expect(a(command, "origin-http-stale", "owner", new Headers())).rejects.toMatchObject({ status: 409 });
    await expect(a(command, "origin-http-foreign", "other", new Headers())).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
  });
});

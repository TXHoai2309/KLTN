import { vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../server/authorization/guard";
import { AppError } from "../server/http/app-error";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema } from "../modules/assistant-planning/planning-contract";
import { analyzePlanningText } from "../modules/assistant-planning/planning-ai";
import type { PlanningDependencies } from "../modules/assistant-planning/planning-service";
import { fixtureRoutes, planningCandidate, planningNow } from "./planning-fixtures";
import { fallbackPlanningV2Reply } from "../modules/assistant-agent-v2/planning-response";
import { startTravelPlanningV2Session, type PlanningSessionState } from "../modules/assistant-agent-v2/travel-planning-session";

/** What the fake classifier "understood" for one user text. The session under test is real. */
export type FakeUnderstanding = { durationDays?: number; transport?: "MOTORCYCLE" | "CAR"; overnightCount?: number; intent?: string; interests?: string[]; pace?: "RELAXED" | "MODERATE" | "PACKED"; question?: string; unsupported?: boolean; edit?: { operations: Record<string, unknown>[] } };

/** A real planning session over four stops in three areas, with only the model boundary faked. */
export function createPlanningSessionFixture(understandings: Record<string, FakeUnderstanding>) {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "v210-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let hash: string | null = null;
  const candidates = [
    { ...planningCandidate("a"), name: "Quản Bạ", area: "Quản Bạ" }, { ...planningCandidate("b"), name: "Đồng Văn", area: "Đồng Văn" },
    { ...planningCandidate("c"), name: "Mã Pì Lèng", area: "Mèo Vạc" }, { ...planningCandidate("d"), name: "Nho Quế", area: "Mèo Vạc" },
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
    generate: vi.fn(async () => ({ days: [["a", "b"], ["c", "d"]] })),
    routes: { route: vi.fn(fixtureRoutes.route) }, recheck: vi.fn(async () => true), now: () => planningNow,
    save: vi.fn(), validateForSave: vi.fn(), compose: vi.fn(),
  };
  let pendingEdit: { operations: Record<string, unknown>[] } | null = null;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    const name = body.response_format.json_schema.name;
    const input = JSON.parse(body.messages.at(-1)!.content) as { latestUserText?: string; interleaving?: unknown };
    const fact = understandings[input.latestUserText ?? ""] ?? {};
    // The bounded-edit request carries the user text under another key, so the edit comes from the last understood turn.
    if (name === "trip_chat_understanding" && fact.edit) pendingEdit = fact.edit;
    if (name === "planning_v2_bounded_edit") return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(pendingEdit ?? { operations: [] }) } }] });
    let value: unknown = name !== "trip_chat_understanding" ? { days: [["a", "b"], ["c", "d"]] } : {
      intent: fact.intent ?? "NEEDS", durationDays: fact.durationDays ?? null, transport: fact.transport ?? null, overnightCount: fact.overnightCount ?? null,
      startDate: null, departureText: null, pace: fact.pace ?? null, interests: fact.interests ?? null, companions: null, mobilityConstraints: null,
      destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
    };
    if (name === "trip_chat_understanding" && input.interleaving) value = { ...(value as object), interleaved: { question: fact.question ?? null, subjectName: null, usesReferent: false, compound: false, unsupported: fact.unsupported ?? false } };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const qaAsk = vi.fn(async () => { throw new AppError("AI_UNAVAILABLE", "fixture QA unavailable", 503); });
  const start = (resume?: PlanningSessionState) => startTravelPlanningV2Session({ headers: new Headers(), conversationId: resume ? "v210-chat" : null, key: "v210-start-key", resume },
    { authorization, forActor: () => deps, compose: async plan => fallbackPlanningV2Reply(plan), qaForActor: () => ({ userId: "owner", service: { ask: qaAsk } }) });
  return { start, deps, repository, qaAsk };
}

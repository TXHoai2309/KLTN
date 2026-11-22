import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { EMPTY_PLANNING_NEEDS, planningRequestSchema, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { analyzePlanningText } from "../assistant-planning/planning-ai";
import { planningProposalHash, type PlanningDependencies } from "../assistant-planning/planning-service";
import { planningCandidate, fixtureRoutes, planningNow } from "../../test/planning-fixtures";
import { createQaService } from "../ai/qa-service";
import { createQaGenerator } from "../ai/qa-generation";
import { createQaQuestionUnderstander } from "../ai/qa-question-understander";
import type { QaConversationStore } from "../ai/qa-conversation-store";
import type { QaEvidence, QaHistoryTurn, QaRetriever } from "../ai/qa-runtime-contract";
import { qaRequestSchema, type QaRequest } from "../ai/qa-contract";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "../ai/qa-contract";
import { executeAssistantV2Action } from "./agent-runtime";
import { fallbackPlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { startTravelPlanningV2Session } from "./travel-planning-session";
import type { BoundedEdit } from "./planning-replanning";
import type { QaRouting } from "./qa-session";
import { createPlanningQaSession } from "./qa-session";
import type { QaActionServices } from "./qa-actions";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v205-fixture-only", qaModel: "gpt-6.1-sol" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const initialText = "Tôi muốn đi Hà Giang 2 ngày bằng ô tô";
const question = "Dinh họ Vương xây năm nào?";
const claim = "Dinh thự họ Vương được khởi công năm 1898.";
const operation = (kind: BoundedEdit["operations"][number]["kind"], values: Partial<BoundedEdit["operations"][number]> = {}): BoundedEdit["operations"][number] => ({ kind, day: null, targetName: null, destinationName: null, position: null, criteria: null, ...values });
const routing = (values: Partial<QaRouting> = {}): QaRouting => ({ question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false, ...values });

function fixture(role: "TRAVELER" | "ADMIN" = "TRAVELER") {
  let identity = "owner";
  let workspace = planningWorkspaceSchema.parse({ conversationId: "planning-owned", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let hash: string | null = null;
  let route = routing();
  let edit: BoundedEdit = { operations: [operation("ADD", { day: 2, destinationName: "Dinh thự họ Vương" })] };
  const candidates = [
    { ...planningCandidate("a"), name: "Cột cờ Lũng Cú" },
    { ...planningCandidate("b"), name: "Lô Lô Chải" },
    { ...planningCandidate("c"), name: "Làng Lũng Tám" },
    { ...planningCandidate("vuong"), name: "Dinh thự họ Vương", category: "Văn hóa" },
  ];
  const repository: PlanningDependencies["repository"] = {
    start: vi.fn(async () => structuredClone(workspace)), read: vi.fn(async () => structuredClone(workspace)), checkpoint: vi.fn(),
    assertVersion: vi.fn(async (id, version) => { if (id !== workspace.conversationId || version !== workspace.version) throw new AppError("PLANNING_CHANGED", "Stale", 409); return structuredClone(workspace); }),
    review: vi.fn(async (_id, version, needs) => { workspace = { ...workspace, needs: structuredClone(needs), version: version + 1 }; hash = null; return structuredClone(workspace); }),
    publishProposal: vi.fn(async (_id, version, fingerprint, _key, refinement) => {
      if (version !== workspace.version || refinement && refinement.previousHash !== hash) throw new AppError("PLANNING_CHANGED", "Stale", 409);
      workspace = structuredClone({ ...workspace, version: version + 1, ...(refinement ? { needs: refinement.needs } : {}) }); hash = fingerprint;
      return structuredClone(workspace);
    }),
    assertProposal: vi.fn(async (_id, version, fingerprint) => { if (version !== workspace.version || hash !== fingerprint) throw new AppError("PLANNING_CHANGED", "Stale proposal", 409); }),
    completedSave: vi.fn(), pendingSave: vi.fn(), reserveSave: vi.fn(), finishSave: vi.fn(),
  };
  const authorization: AuthorizationDependencies = {
    resolveSession: async () => ({ user: { id: identity } }),
    database: { user: { findUnique: async () => ({ id: identity, role, status: "ACTIVE" }) } } as unknown as Pick<Database, "user">,
  };
  const deps: PlanningDependencies = {
    repository, candidates: vi.fn(async () => structuredClone(candidates)), analyze: vi.fn(analyzePlanningText),
    generate: vi.fn(async () => ({ days: [["a", "b"], ["c"]] })), routes: { route: vi.fn(fixtureRoutes.route) },
    recheck: vi.fn(async () => true), now: () => planningNow, save: vi.fn(), validateForSave: vi.fn(), compose: vi.fn(),
  };
  const history: QaHistoryTurn[] = [];
  let request: QaRequest;
  let sequence = 0;
  const store: QaConversationStore = {
    reserve: vi.fn<QaConversationStore["reserve"]>(async (principal, _key, input) => {
      expect(principal).toEqual({ kind: "USER", id: "owner" });
      request = qaRequestSchema.parse(input);
      if ("conversationId" in request) {
        expect(request.conversationId).toBe("qa-owned"); expect(request.parentTurnId).toBe(history.at(-1)!.response.turnId);
      }
      return { kind: "RESERVED", conversationId: "qa-owned", turnId: `qa-${++sequence}`, fence: 1, history: structuredClone(history), context: { type: "GENERAL" } };
    }),
    complete: vi.fn(async (_principal, _reservation, data) => { history.push({ question: request.question, response: structuredClone(data) }); return data; }),
    fail: vi.fn(async () => {}), history: vi.fn(async () => history), delete: vi.fn(), revokeGuest: vi.fn(), cleanup: vi.fn(),
  };
  const evidence: QaEvidence = { citationId: "source1", documentId: "private-document", generationId: "index-generation", contentVersionId: "version1", chunkId: "private-chunk", chunkHash: "chunkhash", text: claim, tokenCount: 24, score: 1,
    citation: { id: "source1", sourceId: "reviewed-source", title: "Tài liệu lịch sử đã duyệt (fixture)", sourceUrl: null, locators: [{ pageNumber: 1 }] } };
  const retriever: QaRetriever = { retrieve: vi.fn(async () => [evidence]), recheck: vi.fn(async () => true) };
  const generator = createQaGenerator();
  vi.spyOn(generator, "generate");
  const qaService = createQaService({ store, retriever, generator, understander: createQaQuestionUnderstander() });
  vi.spyOn(qaService, "ask");
  const providerNames: string[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string; schema: { required: string[] } } }; messages: { content: string }[] };
    const name = body.response_format.json_schema.name; providerNames.push(name);
    const input = JSON.parse(body.messages.at(-1)!.content) as { latestUserText?: string; interleaving?: { subjectName: string | null }; recentQaSubject?: string };
    if (name === "trip_chat_understanding" && input.interleaving) expect(body.response_format.json_schema.schema.required).toContain("interleaved");
    let value: unknown;
    if (name === "planning_v2_bounded_edit") {
      if (input.recentQaSubject) expect(input.recentQaSubject).toBe("Dinh thự họ Vương");
      value = edit;
    } else if (name === "qa_question_understanding") value = { targetSubjects: ["Dinh thự họ Vương"], intent: "HISTORY", attributes: ["năm xây dựng"], temporalConstraint: null, conditions: [], searchQuery: question, ambiguous: false, clarificationQuestion: null };
    else if (name === "trip_chat_understanding") value = {
      intent: input.latestUserText === initialText || input.latestUserText === "Tôi thích văn hóa hơn" || input.latestUserText === "2 ngày" || input.latestUserText === "ô tô" ? "NEEDS" : route.question || route.unsupported ? "QA" : "EDIT",
      durationDays: input.latestUserText === initialText || input.latestUserText === "2 ngày" ? 2 : null,
      transport: input.latestUserText === initialText || input.latestUserText === "ô tô" ? "CAR" : null,
      startDate: null, departureText: null, pace: null, interests: input.latestUserText === "Tôi thích văn hóa hơn" ? ["CULTURE_HISTORY"] : null,
      companions: null, mobilityConstraints: null, destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE", interleaved: route,
    };
    else value = { status: "ANSWERED", answerParts: [{ text: claim, citationIds: ["source1"], mode: "SOURCE" }], unanswered: false };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const qaForActor = vi.fn(() => ({ userId: "owner", service: qaService }));
  const compose = vi.fn(async (plan: PlanningResponsePlan) => fallbackPlanningV2Reply(plan));
  const start = () => startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v205-start-key" }, { authorization, forActor: () => deps, qaForActor, compose });
  return { start, deps, repository, candidates, qaService, qaForActor, retriever, generator, store, history, evidence, compose, providerNames,
    setRoute: (value: QaRouting) => { route = value; }, setEdit: (...operations: BoundedEdit["operations"]) => { edit = { operations }; },
    hash: () => hash, workspace: () => structuredClone(workspace), changeIdentity: () => { identity = "other"; },
  };
}

describe("V2-05 grounded Q&A interleaved with the current planning session", () => {
  it("preserves the existing Destination page context at the V2 HTTP integration boundary", async () => {
    const ask = vi.fn<QaActionServices["service"]["ask"]>().mockRejectedValue(new AppError("AI_UNAVAILABLE", "fixture only", 503));
    const context = { type: "DESTINATION" as const, destinationId: "public-destination" };
    const qa = createPlanningQaSession("owner", new Headers(), () => ({ userId: "owner", service: { ask } }), context);
    await qa.answer("Điểm này có lịch sử gì?", "v207-page-context", { userId: "owner", workspace: null }, []);
    expect(ask).toHaveBeenCalledOnce(); expect(ask.mock.calls[0]?.[2]).toMatchObject({ context, knowledgeMode: "SOURCE_ONLY" });
  });
  it.each(["TRAVELER", "ADMIN"] as const)("demonstrates proposal → grounded QA → bounded ADD for %s with exactly one edit version", async role => {
    const f = fixture(role); const session = await f.start(); const before = await session.send(initialText, "v205-demo-initial"); const hash = f.hash();
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" }));
    const qa = await session.send(question, "v205-demo-question");
    expect(qa.responsePlan.goal).toBe("QA_ANSWER"); expect(qa.message).toContain("1898"); expect(qa.responsePlan.qa?.status).toBe("ANSWERED");
    expect(qa.responsePlan.qa?.citations).toEqual([f.evidence.citation]); expect(qa.generated).toEqual(before.generated); expect(qa.workspace).toEqual(before.workspace);
    expect(qa.latestNeeds).toEqual(before.latestNeeds); expect(f.hash()).toBe(hash); expect(f.deps.generate).toHaveBeenCalledOnce(); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
    expect(f.retriever.recheck).toHaveBeenCalled(); expect(f.generator.generate).toHaveBeenCalledOnce();
    f.setRoute(routing());
    const after = await session.send("Cho Dinh họ Vương vào ngày 2 đi", "v205-demo-add");
    expect(after.responsePlan.goal).toBe("REPLAN_PROPOSAL"); expect(after.generated?.selection.days[1]).toEqual(["c", "vuong"]);
    expect(after.generated?.proposal.days[0]).toEqual(before.generated?.proposal.days[0]); expect(after.workspace.version).toBe(before.workspace.version + 1);
    expect(f.hash()).toBe(planningProposalHash(after.generated!.proposal)); expect(f.deps.generate).toHaveBeenCalledOnce(); expect(f.deps.save).not.toHaveBeenCalled();
  });

  it("resolves a QA subject alias for the next referent edit, then resumes preference refinement", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-referent-first");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); await session.send(question, "v205-referent-qa");
    f.setRoute(routing({ usesReferent: true }));
    const added = await session.send("Cho điểm này vào ngày 2", "v205-referent-add");
    expect(added.responsePlan.goal).toBe("REPLAN_PROPOSAL"); expect(added.generated?.selection.days[1]).toContain("vuong");
    f.setRoute(routing()); const refined = await session.send("Tôi thích văn hóa hơn", "v205-referent-refine");
    expect(refined.responsePlan.goal).toBe("REFINE_PROPOSAL"); expect(refined.latestNeeds.requirement.interests).toEqual(["CULTURE_HISTORY"]);
    expect(refined.workspace.version).toBe(first.workspace.version + 2); expect(f.qaService.ask).toHaveBeenCalledOnce();
  });

  it("keeps MISSING_DAY pending across QA and resumes its original bounded edit", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-pending-first");
    f.setEdit(operation("ADD", { destinationName: "Dinh thự họ Vương" }));
    const pending = await session.send("Thêm Dinh họ Vương", "v205-pending-edit"); expect(pending.responsePlan.replanCode).toBe("MISSING_DAY");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); const qa = await session.send(question, "v205-pending-qa");
    expect(qa.workspace).toEqual(first.workspace); expect(qa.generated).toEqual(first.generated);
    f.setRoute(routing()); const resumed = await session.send("ngày 2", "v205-pending-day");
    expect(resumed.generated?.selection.days[1]).toEqual(["c", "vuong"]); expect(resumed.workspace.version).toBe(first.workspace.version + 1);
  });

  it("keeps UNKNOWN frozen across read-only QA, including when the write actually committed", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-unknown-first");
    const publish = vi.mocked(f.repository.publishProposal).getMockImplementation()!;
    vi.mocked(f.repository.publishProposal).mockImplementationOnce(async (...args) => { await publish(...args); throw new AppError("OPERATION_STATUS_UNKNOWN", "Lost acknowledgement", 503); });
    const unknown = await session.send("Thêm Dinh họ Vương ngày 2", "v205-unknown-write"); expect(unknown.uncertain).toBe(true);
    expect(f.workspace().version).toBe(first.workspace.version + 1);
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); const qa = await session.send(question, "v205-unknown-qa");
    expect(qa.responsePlan.goal).toBe("QA_ANSWER"); expect(qa.uncertain).toBe(true); expect(qa.generated).toEqual(first.generated); expect(qa.workspace).toEqual(first.workspace);
    f.setRoute(routing()); await expect(session.send("Thêm điểm ngày 2", "v205-unknown-after")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
    expect(await session.send("Thêm Dinh họ Vương ngày 2", "v205-unknown-write")).toEqual(unknown); expect(f.repository.publishProposal).toHaveBeenCalledTimes(2);
  });

  it("retains planning input clarification before the first proposal", async () => {
    const f = fixture(); const session = await f.start(); const needs = await session.send("2 ngày", "v205-brief-duration");
    expect(needs.responsePlan.goal).toBe("ASK_TRANSPORT");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); const qa = await session.send(question, "v205-brief-qa"); expect(qa.latestNeeds).toEqual(needs.latestNeeds);
    f.setRoute(routing()); const draft = await session.send("ô tô", "v205-brief-transport");
    expect(draft.responsePlan.goal).toBe("PRESENT_PROPOSAL"); expect(draft.latestNeeds.requirement.durationDays).toBe(2);
  });

  it("returns insufficient source without generating facts or losing planning state", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-empty-first");
    vi.mocked(f.retriever.retrieve).mockResolvedValue([]); f.setRoute(routing({ question, subjectName: "Dinh họ Vương" }));
    const qa = await session.send(question, "v205-empty-qa");
    expect(qa.responsePlan.qa).toMatchObject({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [] });
    expect(qa.message).not.toContain("1898"); expect(f.generator.generate).not.toHaveBeenCalled(); expect(qa.generated).toEqual(first.generated); expect(qa.workspace).toEqual(first.workspace);
  });

  it.each(["technical", "invalid-citation", "eligibility"])("keeps %s QA failure separate from insufficient sources and preserves pending edit", async failure => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-failure-first");
    f.setEdit(operation("ADD", { destinationName: "Dinh thự họ Vương" })); await session.send("Thêm Dinh họ Vương", "v205-failure-pending");
    if (failure === "technical") vi.mocked(f.generator.generate).mockRejectedValueOnce(new AppError("AI_UNAVAILABLE", "fixture", 503));
    if (failure === "invalid-citation") vi.mocked(f.generator.generate).mockResolvedValueOnce({ status: "ANSWERED", answerParts: [{ text: claim, citationIds: ["forged"] }], citations: [], unansweredAspects: [] });
    if (failure === "eligibility") vi.mocked(f.retriever.recheck).mockResolvedValueOnce(false);
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); const qa = await session.send(question, "v205-failure-qa");
    expect(qa.responsePlan.goal).toBe("QA_FAILED"); expect(qa.responsePlan.qa).toBeUndefined(); expect(qa.message).not.toContain("1898"); expect(qa.generated).toEqual(first.generated);
    f.setRoute(routing()); const continued = await session.send("ngày 2", "v205-failure-continue"); expect(continued.generated?.selection.days[1]).toContain("vuong");
  });

  it("clarifies ambiguous QA/edit referents instead of choosing a stop from a multi-stop proposal", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-ambiguous-first");
    f.setRoute(routing({ question: "Điểm này xây năm nào?", usesReferent: true }));
    const qa = await session.send("Điểm này xây năm nào?", "v205-ambiguous-qa"); expect(qa.responsePlan.goal).toBe("QA_CLARIFY");
    expect(f.qaService.ask).not.toHaveBeenCalled(); f.setRoute(routing({ usesReferent: true }));
    const edit = await session.send("Thêm nó ngày 2", "v205-ambiguous-edit"); expect(edit.responsePlan.goal).toBe("QA_CLARIFY"); expect(edit.generated).toEqual(first.generated);
    expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("does not silently drop compound intent and hands its edit back for an explicit next turn", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-compound-first");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương", compound: true }));
    const result = await session.send("Dinh họ Vương xây năm nào, nếu hay thì cho vào ngày 2", "v205-compound-qa");
    expect(result.message).toContain("1898"); expect(result.message).toMatch(/phần chỉnh lịch mình chưa làm/i); expect(result.generated).toEqual(first.generated);
    f.setRoute(routing()); const added = await session.send("Cho Dinh họ Vương ngày 2", "v205-compound-add"); expect(added.generated?.selection.days[1]).toContain("vuong");
  });

  it("does not treat a bare agreement after QA as acceptance of a pending cross-day change", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-confirm-first");
    f.setEdit(operation("REMOVE", { day: 1, targetName: "Lô Lô Chải" })); const pending = await session.send("Bỏ Lô Lô Chải ngày 1", "v205-confirm-pending");
    expect(pending.responsePlan.replanCode).toBe("OUT_OF_SCOPE");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); await session.send(question, "v205-confirm-qa");
    const repeated = await session.send("có", "v205-confirm-ambiguous"); expect(repeated.responsePlan.goal).toBe("REPLAN_CLARIFY"); expect(repeated.generated).toEqual(first.generated);
    const accepted = await session.send("có", "v205-confirm-explicit"); expect(accepted.responsePlan.goal).toBe("REPLAN_PROPOSAL"); expect(accepted.workspace.version).toBe(first.workspace.version + 1);
  });

  it("keeps existing QA history and result idempotency without passing answer prose to planning composition", async () => {
    const f = fixture(); const session = await f.start(); await session.send(initialText, "v205-history-first");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); const qa = await session.send(question, "v205-history-qa");
    expect(await session.send(question, "v205-history-qa")).toEqual(qa); expect(f.qaService.ask).toHaveBeenCalledOnce();
    f.setRoute(routing({ question: "Điểm này có gì đặc biệt?", usesReferent: true }));
    const followup = await session.send("Điểm này có gì đặc biệt?", "v205-history-followup"); expect(followup.responsePlan.goal).toBe("QA_ANSWER");
    expect(f.history).toHaveLength(2); expect(vi.mocked(f.retriever.retrieve).mock.lastCall?.[1][0]?.question).toBe(question);
    expect(f.compose).toHaveBeenCalledOnce(); expect(JSON.stringify(followup.responsePlan.qa)).not.toContain("private-document");
  });

  it("returns controlled unsupported for place research without calling QA or planning writes", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-research-first");
    f.setRoute(routing({ unsupported: true })); const result = await session.send("Tìm quán cafe tốt nhất gần Đồng Văn", "v205-research-request");
    expect(result.responsePlan.goal).toBe("QA_UNSUPPORTED"); expect(result.generated).toEqual(first.generated); expect(f.qaService.ask).not.toHaveBeenCalled(); expect(f.deps.generate).toHaveBeenCalledOnce();
  });

  it("enforces QA's action schemas, actor binding, source-only policy and read-only allowlist", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-boundary-first");
    const input = { skill: "ha-giang-qa", context: { userId: "owner", workspace: first.workspace }, action: "answer-ha-giang-question" as const,
      payload: { key: "v205-boundary-action", request: { question, context: { type: "GENERAL" }, knowledgeMode: "SOURCE_ONLY" } } };
    await expect(executeAssistantV2Action(input, { qa: { userId: "other", service: f.qaService } })).rejects.toMatchObject({ cause: { code: "QA_CONTEXT_REQUIRED" } });
    await expect(executeAssistantV2Action({ ...input, payload: { ...input.payload, needs: first.latestNeeds } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(executeAssistantV2Action({ ...input, payload: { ...input.payload, request: { ...input.payload.request, knowledgeMode: "EXPANDED" } } }, { qa: { userId: "owner", service: f.qaService } })).rejects.toMatchObject({ cause: { code: "INVALID_REQUEST" } });
    for (const action of ["generate-preliminary-proposal", "refine-preliminary-proposal", "replan-preliminary-proposal"]) await expect(executeAssistantV2Action({ ...input, action })).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
    expect(planningRequestSchema.safeParse({ action: "ANALYZE", conversationId: "planning-owned", version: 0, text: question, draft: EMPTY_PLANNING_NEEDS, interleaving: { subjectName: "vuong" } }).success).toBe(false);
    expect(f.qaService.ask).not.toHaveBeenCalled(); f.changeIdentity();
    await expect(session.send(question, "v205-boundary-identity")).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(f.qaService.ask).not.toHaveBeenCalled();
  });

  it("does not promote an ambiguous comparison or a now-hidden QA destination to an edit referent", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-subjects-first");
    f.setRoute(routing({ question: "So sánh Dinh họ Vương và Lũng Cú", subjectName: "Dinh họ Vương" }));
    await session.send("So sánh Dinh họ Vương và Lũng Cú", "v205-subjects-compare");
    f.setRoute(routing({ usesReferent: true })); const ambiguous = await session.send("Thêm điểm này ngày 2", "v205-subjects-ambiguous");
    expect(ambiguous.responsePlan.goal).toBe("QA_CLARIFY"); expect(ambiguous.generated).toEqual(first.generated);
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" })); await session.send(question, "v205-subjects-qa");
    f.candidates[3]!.visibility = "HIDDEN"; f.setRoute(routing({ usesReferent: true }));
    const hidden = await session.send("Thêm nó ngày 2", "v205-subjects-hidden"); expect(hidden.responsePlan.goal).toBe("QA_CLARIFY");
    expect(hidden.generated).toEqual(first.generated); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });

  it("keeps QA classification authoritative over extracted preference facts and preserves PARTIAL/citations", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-partial-first");
    f.setRoute(routing({ question, subjectName: "Dinh họ Vương" }));
    vi.mocked(f.generator.generate).mockResolvedValueOnce({ status: "PARTIAL", answerParts: [{ text: claim, mode: "SOURCE", citationIds: ["source1"] }], citations: [f.evidence.citation], unansweredAspects: ["Chưa có dữ liệu cho khía cạnh còn lại."] });
    // The fixture deliberately emits raw NEEDS + CULTURE_HISTORY as well as a
    // factual route: V2 must not normalize those facts into planning state.
    const result = await session.send("Tôi thích văn hóa hơn", "v205-partial-question");
    expect(result.responsePlan.qa?.status).toBe("PARTIAL"); expect(result.responsePlan.qa?.citations).toEqual([f.evidence.citation]);
    expect(result.latestNeeds).toEqual(first.latestNeeds); expect(result.generated).toEqual(first.generated); expect(f.deps.generate).toHaveBeenCalledOnce();
  });

  it("forwards the trusted QA principal including its abuse network identity and rejects a mismatched principal", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send(initialText, "v205-principal-first");
    const principal = { kind: "USER" as const, id: "owner", networkId: "a".repeat(64) };
    vi.mocked(f.qaService.ask).mockResolvedValueOnce({ replayed: false, data: { status: "INSUFFICIENT_SOURCE", message: QA_INSUFFICIENT_SOURCE_MESSAGE, answerParts: [], citations: [], conversationId: "qa-owned", turnId: "qa-network", turnState: "COMPLETED", context: { type: "GENERAL" }, knowledgeMode: "SOURCE_ONLY" } });
    const action = { skill: "ha-giang-qa", context: { userId: "owner", workspace: first.workspace }, action: "answer-ha-giang-question" as const,
      payload: { key: "v205-principal-action", request: { question, context: { type: "GENERAL" }, knowledgeMode: "SOURCE_ONLY" } } };
    await executeAssistantV2Action(action, { qa: { userId: "owner", service: f.qaService, principal } });
    expect(f.qaService.ask).toHaveBeenCalledWith(principal, "v205-principal-action", action.payload.request);
    await expect(executeAssistantV2Action(action, { qa: { userId: "owner", service: f.qaService, principal: { ...principal, id: "other" } } })).rejects.toMatchObject({ cause: { code: "QA_CONTEXT_REQUIRED" } });
    expect(f.qaService.ask).toHaveBeenCalledOnce(); expect(f.repository.publishProposal).toHaveBeenCalledOnce();
  });
});

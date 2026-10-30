import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { analyzePlanningText } from "../assistant-planning/planning-ai";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { acceptsPlanningV2Reply, fallbackPlanningV2Reply, safePlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { travelPlanningSkill } from "./skills/travel-planning";
import { startTravelPlanningV2Session } from "./travel-planning-session";
import type { BoundedEdit } from "./planning-replanning";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v208-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** The fake model plays the classifier: the test, not the code under test,
 * decides what each utterance means. The seam under test is session.send(). */
const adviceTexts = ["gợi ý cho tôi nên đi như nào", "lịch này ổn chưa", "đi vậy có mệt không", "theo bạn nên đi như nào", "có nên thêm điểm nào không", "lịch mới này ổn chưa"];
const removeFirstStop: BoundedEdit = { operations: [{ kind: "REMOVE", day: 1, targetName: "Quản Bạ", destinationName: null, position: null, criteria: null }] };

function fixture() {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "v208-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let hash: string | null = null;
  let edit = removeFirstStop;
  const candidates = [
    { ...planningCandidate("a"), name: "Quản Bạ" }, { ...planningCandidate("b"), name: "Đồng Văn" },
    { ...planningCandidate("c"), name: "Mã Pì Lèng" }, { ...planningCandidate("d"), name: "Nho Quế" }, { ...planningCandidate("e"), name: "Lũng Cú" },
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
  const requests: string[] = [];
  let interleavedOverride: { question?: string | null; compound?: boolean; unsupported?: boolean } = {};
  const qaAsk = vi.fn(async () => { throw new AppError("AI_UNAVAILABLE", "fixture QA unavailable", 503); });
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    const name = body.response_format.json_schema.name; requests.push(name);
    const input = JSON.parse(body.messages.at(-1)!.content) as { latestUserText?: string; interleaving?: unknown };
    const text = input.latestUserText ?? "";
    const initial = text === "2 ngày xe máy";
    const needsOnly = initial || text === "2 ngày" || text === "xe máy" || text === "thực ra đi ô tô";
    let value: unknown = name === "planning_v2_bounded_edit" ? edit : {
      intent: needsOnly || text.startsWith("thử lại") ? "NEEDS" : text === "lập lại lịch cho tôi" ? "REGENERATE" : adviceTexts.includes(text) ? "ADVISE" : "EDIT",
      durationDays: initial || text === "2 ngày" ? 2 : null, transport: initial || text === "xe máy" ? "MOTORCYCLE" : text === "thực ra đi ô tô" ? "CAR" : null,
      startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null,
      destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
    };
    if (name === "trip_chat_understanding" && input.interleaving && typeof value === "object" && value !== null) {
      value = { ...value, interleaved: { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false, ...interleavedOverride } };
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const start = () => startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v208-start-key" }, { authorization, forActor: () => deps, compose: async plan => fallbackPlanningV2Reply(plan), qaForActor: () => ({ userId: "owner", service: { ask: qaAsk } }) });
  return { start, deps, repository, requests, qaAsk, setEdit: (next: BoundedEdit) => { edit = next; }, setInterleaved: (next: typeof interleavedOverride) => { interleavedOverride = next; } };
}

describe("V2-08 planning guidance is read-only and distinct from replanning", () => {
  it.each(adviceTexts)("answers %j as guidance on the current proposal without mutating it", async text => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày xe máy", "v208-initial-turn");
    expect(first.generated).not.toBeNull();
    const before = structuredClone({ workspace: first.workspace, generated: first.generated, needs: first.latestNeeds });
    vi.mocked(f.deps.generate).mockClear(); vi.mocked(f.repository.publishProposal).mockClear(); vi.mocked(f.repository.review).mockClear();

    const result = await session.send(text, "v208-advice-turn");

    expect(result.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false });
    expect(result.message).not.toContain("Bạn muốn điều chỉnh cụ thể điều gì");
    expect({ workspace: result.workspace, generated: result.generated, needs: result.latestNeeds }).toEqual(before);
    expect(f.deps.generate).not.toHaveBeenCalled();
    expect(f.repository.publishProposal).not.toHaveBeenCalled();
    expect(f.repository.review).not.toHaveBeenCalled();
    expect(f.deps.save).not.toHaveBeenCalled();
  });

  it("still routes an explicit removal to bounded replanning after guidance", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày xe máy", "v208-contrast-initial");
    await session.send("lịch này ổn chưa", "v208-contrast-advice");
    const result = await session.send("bỏ Quản Bạ đi", "v208-contrast-edit");
    expect(result.responsePlan).toMatchObject({ goal: "REPLAN_PROPOSAL", proposalChanged: true });
    expect(result.generated?.version).toBe((first.generated?.version ?? 0) + 1);
  });
});

describe("V2-08 guidance response plan and wording", () => {
  it("carries proposal-derived signals and a useful fallback instead of a clarifying question", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày xe máy", "v208-plan-initial");
    const result = await session.send("gợi ý cho tôi nên đi như nào", "v208-plan-advice");
    const guidance = result.responsePlan.guidance;
    expect(guidance?.days.map(day => day.stops)).toEqual([["Quản Bạ", "Đồng Văn"], ["Mã Pì Lèng", "Nho Quế"]]);
    expect(guidance?.signals).toContainEqual({ code: "DATE_REQUIRED_FOR_HOURS" });
    expect(result.message).toContain("Quản Bạ → Đồng Văn");
    expect(result.message).toContain("Mã Pì Lèng → Nho Quế");
    // V2-10 caveat policy: plain advice carries no caveat about checks, the date or saving.
    expect(result.message).not.toMatch(/ngày khởi hành|giờ mở cửa|chưa lưu/);
    expect(result.message).not.toContain("?");
  });
});

describe("V2-08 acceptsPlanningV2Reply for guidance", () => {
  const plan = (overrides: Partial<PlanningResponsePlan> = {}): PlanningResponsePlan => ({
    goal: "PLANNING_GUIDANCE", knownFacts: { durationDays: 2, transport: "MOTORCYCLE" } as PlanningResponsePlan["knownFacts"], planningImplications: [], mustNotClaim: ["SAVED", "APPLIED", "UNSUPPORTED_FACTS", "VALIDITY_WITHOUT_EVIDENCE"], proposalChanged: false,
    validation: { status: "INSUFFICIENT_DATA", checks: [{ key: "OPENING_HOURS", status: "INSUFFICIENT_DATA" }], eligibleForFinalConfirmation: false },
    guidance: { days: [{ day: 1, stops: ["Quản Bạ", "Đồng Văn", "Lũng Cú"], stopCount: 3, travelMinutes: 87, finishMinute: 807 }, { day: 2, stops: ["Mã Pì Lèng", "Nho Quế"], stopCount: 2, travelMinutes: 38, finishMinute: 698 }],
      overnights: [], signals: [{ code: "DENSER_DAY", day: 1, stopCount: 3, lighterDay: 2, lighterStopCount: 2 }], fallbackSuggestions: [{ day: 1, dropStop: "Lũng Cú", reason: "DENSER_DAY" }], validation: { status: "INSUFFICIENT_DATA", pendingChecks: ["OPENING_HOURS"], eligibleForFinalConfirmation: false } },
    ...overrides,
  });
  it("accepts natural advice that cites plan numbers and times", () => {
    expect(acceptsPlanningV2Reply("Ngày 1 có 3 điểm, nhiều hơn ngày 2 (2 điểm), và dự kiến kết thúc khoảng 13:27. Nếu muốn thư thả hơn, mình sẽ bớt Lũng Cú trước chứ không thêm điểm mới. Vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại trước khi lưu.", { ...plan(), userQuestion: "lịch này ổn chưa" })).toBe(true);
  });
  it.each([
    ["claims the plan was changed", "Mình đã bỏ Lũng Cú khỏi ngày 1 cho nhẹ hơn."],
    ["claims a pass without evidence", "Lịch này hợp lệ và đáp ứng mọi kiểm tra."],
    ["claims a save", "Mình đã lưu chuyến đi cho bạn."],
    ["invents atmosphere facts", "Mã Pì Lèng buổi sáng ít đông và rất lãng mạn."],
    ["invents a number", "Ngày 1 có 7 điểm nên khá mệt."],
    ["asks two questions", "Bạn thấy sao? Bạn có muốn bớt không?"],
  ])("rejects a reply that %s", (_name, message) => { expect(acceptsPlanningV2Reply(message, plan())).toBe(false); });
});

describe("V2-08 guidance composition retry", () => {
  const base = { goal: "PLANNING_GUIDANCE", knownFacts: {}, planningImplications: [], mustNotClaim: ["SAVED", "APPLIED", "UNSUPPORTED_FACTS", "VALIDITY_WITHOUT_EVIDENCE"], proposalChanged: false,
    guidance: { days: [{ day: 1, stops: ["Quản Bạ", "Đồng Văn"], stopCount: 2, travelMinutes: 66, finishMinute: 700 }], signals: [], fallbackSuggestions: [], validation: { status: "PROPOSAL_READY", pendingChecks: [], eligibleForFinalConfirmation: true } } } as unknown as PlanningResponsePlan;
  it("retries once with the rejection reason, then uses the accepted model wording", async () => {
    const compose = vi.fn<(plan: PlanningResponsePlan) => Promise<string>>().mockResolvedValueOnce("Mình đã bỏ Đồng Văn cho nhẹ hơn.").mockResolvedValueOnce("Một ngày hai điểm, di chuyển khoảng 66 phút là khá nhẹ nhàng.");
    const message = await safePlanningV2Reply(base, travelPlanningSkill as never, compose);
    expect(message).toBe("Một ngày hai điểm, di chuyển khoảng 66 phút là khá nhẹ nhàng.");
    expect(compose).toHaveBeenCalledTimes(2);
    expect(compose.mock.calls[0]![0].retryHint).toBeUndefined();
    expect(compose.mock.calls[1]![0].retryHint).toMatch(/read-only/);
  });
  it("falls back to deterministic advice after two rejected replies without a clarifying question", async () => {
    const compose = vi.fn<(plan: PlanningResponsePlan) => Promise<string>>().mockResolvedValue("Mình đã lưu chuyến đi rồi.");
    const message = await safePlanningV2Reply(base, travelPlanningSkill as never, compose);
    expect(compose).toHaveBeenCalledTimes(2);
    expect(message).toBe(fallbackPlanningV2Reply(base));
    expect(message).not.toContain("?");
  });
});

describe("V2-08 proposal explanation and failure explanation", () => {
  it("leads the first proposal with the chosen route and rationale before the validation caveat", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày xe máy", "v208-present-initial");
    const route = result.message.indexOf("Quản Bạ → Đồng Văn"), caveat = result.message.indexOf("chưa lưu");
    expect(route).toBeGreaterThanOrEqual(0); expect(caveat).toBeGreaterThan(route);
    expect(result.message).toMatch(/chưa lưu/); expect(result.message).toContain("2 ngày");
    expect(result.message).toContain("ngày khởi hành");
  });
  it.each([["INVALID_AI_PLAN", /dựng lại|thử lại/], ["AI_UNAVAILABLE", /tạm thời|thử lại/], ["SOMETHING_ELSE", /thử lại/]])("explains a generation failure (%s) with what happened and what to do next", async (code, next) => {
    const f = fixture(); const session = await f.start();
    vi.mocked(f.deps.generate).mockRejectedValue(new AppError(code, "internal detail", 502));
    const result = await session.send("2 ngày xe máy", "v208-failure-initial");
    expect(result.responsePlan).toMatchObject({ goal: "PROPOSAL_FAILED", failureCode: code, proposalChanged: false });
    expect(result.message).toMatch(next); expect(result.message).toContain("nhu cầu"); expect(result.message).toContain("chưa lưu");
    expect(result.message).not.toContain("internal detail"); expect(result.message).not.toContain("đáp ứng các kiểm tra");
    expect(result.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
  });
  it("names the violated checks and offers a lighter retry for an infeasible proposal", () => {
    const message = fallbackPlanningV2Reply({ goal: "PRESENT_PROPOSAL", knownFacts: {}, planningImplications: [], mustNotClaim: ["SAVED", "APPLIED", "UNSUPPORTED_FACTS", "VALIDITY_WITHOUT_EVIDENCE"],
      validation: { status: "NO_FEASIBLE_ITINERARY", checks: [{ key: "TRAVEL_TIME", status: "VIOLATION" }, { key: "OPENING_HOURS", status: "INSUFFICIENT_DATA" }], eligibleForFinalConfirmation: false } } as unknown as PlanningResponsePlan);
    expect(message).toContain("thời gian di chuyển"); expect(message).toMatch(/gọn hơn|ít điểm hơn/); expect(message).toMatch(/chưa (?:\S+ ){0,2}lưu/);
  });
  it("recovers from a failed generation on the next turn without asking for the known brief again", async () => {
    const f = fixture(); const session = await f.start();
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new AppError("INVALID_AI_PLAN", "x", 502));
    await session.send("2 ngày xe máy", "v208-recover-initial");
    const retry = await session.send("thử lại với tuyến gọn hơn", "v208-recover-retry");
    expect(retry.generated).not.toBeNull(); expect(retry.message).not.toMatch(/mấy ngày|ô tô hay xe máy/);
  });
});

describe("V2-08 context reuse", () => {
  it("rebuilds from the known brief on an explicit regenerate request instead of asking for it again", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày xe máy", "v208-reuse-initial");
    vi.mocked(f.deps.generate).mockClear();
    const result = await session.send("lập lại lịch cho tôi", "v208-reuse-regenerate");
    expect(result.message).not.toMatch(/mấy ngày|ô tô hay xe máy|bao nhiêu ngày/);
    expect(result.responsePlan).toMatchObject({ goal: "REFINE_PROPOSAL", proposalChanged: true });
    expect(result.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
    expect(f.deps.generate).toHaveBeenCalledOnce();
    expect(result.generated?.version).toBe((first.generated?.version ?? 0) + 1);
  });
  it("does not reuse a superseded fact: a later explicit correction wins", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày xe máy", "v208-correct-initial");
    const result = await session.send("thực ra đi ô tô", "v208-correct-turn");
    expect(result.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "CAR" });
    expect(result.generated?.proposal.requirement).toMatchObject({ transport: "CAR" });
  });
});

describe("V2-08 guidance interleaved with pending state", () => {
  it("keeps a pending replanning clarification across guidance and resumes it afterwards", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày xe máy", "v208-pending-initial");
    f.setEdit({ operations: [{ kind: "ADD", day: null, targetName: null, destinationName: "Lũng Cú", position: null, criteria: null }] });
    const asked = await session.send("Thêm Lũng Cú", "v208-pending-ask");
    expect(asked.responsePlan).toMatchObject({ goal: "REPLAN_CLARIFY", replanCode: "MISSING_DAY" });
    const advised = await session.send("đi vậy có mệt không", "v208-pending-advice");
    expect(advised.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false });
    expect(advised.generated).toEqual(asked.generated); expect(advised.workspace).toEqual(asked.workspace);
    const resumed = await session.send("Ngày 2", "v208-pending-resume");
    expect(resumed.responsePlan).toMatchObject({ goal: "REPLAN_PROPOSAL", proposalChanged: true });
    expect(resumed.generated?.selection.days[1]).toContain("e");
  });
  it("allows read-only guidance while an UNKNOWN publication blocks mutation", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày xe máy", "v208-unknown-initial");
    vi.mocked(f.repository.publishProposal).mockRejectedValueOnce(new AppError("OPERATION_STATUS_UNKNOWN", "Uncertain write", 503));
    const unknown = await session.send("bỏ Quản Bạ đi", "v208-unknown-edit");
    expect(unknown.uncertain).toBe(true);
    vi.mocked(f.repository.publishProposal).mockClear();
    const advised = await session.send("lịch này ổn chưa", "v208-unknown-advice");
    expect(advised.responsePlan.goal).toBe("PLANNING_GUIDANCE"); expect(advised.uncertain).toBe(true);
    expect(advised.generated).toEqual(first.generated); expect(f.repository.publishProposal).not.toHaveBeenCalled();
    await expect(session.send("bỏ Quản Bạ đi", "v208-unknown-retry-new-key")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
  });
  it("advises on the latest canonical proposal after a replan, not the superseded one", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày xe máy", "v208-latest-initial");
    await session.send("bỏ Quản Bạ đi", "v208-latest-edit");
    const advised = await session.send("lịch mới này ổn chưa", "v208-latest-advice");
    expect(advised.responsePlan.guidance?.days[0]?.stops).toEqual(["Đồng Văn"]);
    expect(advised.message).not.toContain("Quản Bạ");
  });
  it("gives honest guidance when there is no proposal yet and generates nothing", async () => {
    const f = fixture(); const session = await f.start();
    const advised = await session.send("gợi ý cho tôi nên đi như nào", "v208-none-advice");
    expect(advised.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false });
    expect(advised.generated).toBeNull(); expect(f.deps.generate).not.toHaveBeenCalled(); expect(advised.message).not.toContain("Bạn muốn điều chỉnh cụ thể điều gì");
  });
});

describe("V2-08 guidance answers the question that was asked", () => {
  it("passes the user's question to the composer as data", async () => {
    const f = fixture(); const compose = vi.fn(async (plan: PlanningResponsePlan) => fallbackPlanningV2Reply(plan));
    const session = await startTravelPlanningV2Session({ headers: new Headers(), conversationId: null, key: "v208-start-key" }, { authorization: { resolveSession: async () => ({ user: { id: "owner" } }), database: { user: { findUnique: async () => ({ id: "owner", role: "TRAVELER", status: "ACTIVE" }) } } as never }, forActor: () => f.deps, compose });
    await session.send("2 ngày xe máy", "v208-question-initial");
    await session.send("đi vậy có mệt không", "v208-question-advice");
    expect(compose.mock.calls.at(-1)![0]).toMatchObject({ goal: "PLANNING_GUIDANCE", userQuestion: "đi vậy có mệt không" });
  });
  it("rejects a reply that claims the checks passed", () => {
    const plan = { goal: "PLANNING_GUIDANCE", knownFacts: {}, planningImplications: [], mustNotClaim: [], validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false }, guidance: { days: [], signals: [], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } } as unknown as PlanningResponsePlan;
    for (const message of ["Các kiểm tra về thời gian di chuyển đều đạt.", "Lịch này đạt kiểm tra rồi."]) expect(acceptsPlanningV2Reply(message, plan)).toBe(false);
    expect(acceptsPlanningV2Reply("Mình sẽ đặt thêm thời gian nghỉ ở ngày đầu.", plan)).toBe(true);
  });
});

describe("V2-08 guidance never re-asks the known brief", () => {
  const known = { goal: "PLANNING_GUIDANCE", knownFacts: { durationDays: 2, transport: "MOTORCYCLE" }, planningImplications: [], mustNotClaim: [], validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false },
    guidance: { days: [], signals: [], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } } as unknown as PlanningResponsePlan;
  it.each(["Bạn định đi mấy ngày?", "Bạn đi ô tô hay xe máy?", "Bạn dùng phương tiện nào?"])("rejects %j when duration and transport are already known", message => {
    expect(acceptsPlanningV2Reply(message, known)).toBe(false);
  });
  it("still allows a different single question", () => {
    expect(acceptsPlanningV2Reply("Mình giữ nguyên tuyến này. Bạn muốn xem phương án bớt một điểm không?", known)).toBe(true);
  });
});

describe("V2-08 deterministic gates for requirements 1, 6 and 8", () => {
  const base = (known: object, goal = "PLANNING_GUIDANCE") => ({ goal, knownFacts: known, planningImplications: [], mustNotClaim: [], validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false },
    guidance: { days: [{ day: 1, stops: ["Quản Bạ", "Đồng Văn"], stopCount: 2, travelMinutes: 60, finishMinute: 700 }], signals: [], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } }) as unknown as PlanningResponsePlan;
  it("rejects the generic 'what do you want to adjust' question as guidance wording", () => {
    for (const message of ["Bạn muốn điều chỉnh cụ thể điều gì trong đề xuất này?", "Bạn muốn chỉnh sửa phần nào?"]) expect(acceptsPlanningV2Reply(message, base({ durationDays: 2, transport: "MOTORCYCLE" }))).toBe(false);
  });
  it("only blocks asking for a fact that is actually known", () => {
    expect(acceptsPlanningV2Reply("Bạn đi ô tô hay xe máy?", base({ durationDays: 2 }))).toBe(true);
    expect(acceptsPlanningV2Reply("Bạn đi ô tô hay xe máy?", base({ durationDays: 2, transport: "CAR" }))).toBe(false);
    expect(acceptsPlanningV2Reply("Bạn định đi mấy ngày？", base({ durationDays: 2 }))).toBe(false);
  });
  it("counts a full-width question mark as a question", () => {
    expect(acceptsPlanningV2Reply("Bạn thấy sao？ Bạn muốn bớt không？", base({}))).toBe(false);
  });
  it("requires a proposal reply to name the route it chose", () => {
    const plan = base({ durationDays: 2 }, "PRESENT_PROPOSAL");
    expect(acceptsPlanningV2Reply("Đây là bản sơ bộ, mình chưa lưu và còn thiếu dữ liệu nên chưa đủ thông tin để xác nhận.", plan)).toBe(false);
    expect(acceptsPlanningV2Reply("Mình xếp Quản Bạ rồi Đồng Văn để gọn đường. Đây là bản sơ bộ; chưa đủ dữ liệu nên chưa lưu.", plan)).toBe(true);
  });
  it("keeps a pending question across a guidance turn and then continues the brief", async () => {
    const f = fixture(); const session = await f.start();
    const asked = await session.send("2 ngày", "v208-ask-duration");
    expect(asked.responsePlan.goal).toBe("ASK_TRANSPORT");
    const advised = await session.send("gợi ý cho tôi nên đi như nào", "v208-ask-advice");
    expect(advised.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false }); expect(advised.generated).toBeNull();
    const resumed = await session.send("xe máy", "v208-ask-resume");
    expect(resumed.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    expect(resumed.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
  });
});

describe("V2-08 question-field precedence: semantic intent beats an auxiliary field", () => {
  it("keeps an explicit ADVISE intent as guidance when the model also fills the interleaved question field", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("2 ngày xe máy", "v208-prec-initial");
    f.setInterleaved({ question: "lịch này ổn chưa" });
    const result = await session.send("lịch này ổn chưa", "v208-prec-advice");
    expect(result.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false });
    expect(f.qaAsk).not.toHaveBeenCalled(); expect(result.generated).toEqual(first.generated);
  });
  it.each([
    ["compound", { question: "lịch này ổn chưa", compound: true }],
    ["unsupported", { question: "lịch này ổn chưa", unsupported: true }],
  ])("still treats an %s flag as a QA-side turn even with ADVISE", async (_name, override) => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày xe máy", "v208-prec2-initial");
    f.setInterleaved(override);
    const result = await session.send("lịch này ổn chưa", "v208-prec2-advice");
    expect(result.responsePlan.goal).toMatch(/^QA_/); expect(result.responsePlan.proposalChanged).toBe(false);
  });
  it("still routes a real QA intent with a question to QA", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày xe máy", "v208-prec3-initial");
    f.setInterleaved({ question: "Dinh họ Vương xây năm nào?" });
    // The fake classifier maps unknown text to EDIT; the interleaved question alone must still reach QA for a non-ADVISE intent.
    const result = await session.send("Dinh họ Vương xây năm nào?", "v208-prec3-qa");
    expect(result.responsePlan.goal).toMatch(/^QA_/);
  });
});

describe("V2-08 guidance wording while a write is UNKNOWN", () => {
  const unknown = { goal: "PLANNING_GUIDANCE", knownFacts: {}, planningImplications: [], mustNotClaim: [], lastKnownOnly: true, validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false },
    guidance: { days: [{ day: 1, stops: ["Quản Bạ", "Đồng Văn"], stopCount: 2, travelMinutes: 60, finishMinute: 700 }], signals: [{ code: "BALANCED_LOAD", maxStopCount: 2, maxTravelMinutes: 60 }], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } } as unknown as PlanningResponsePlan;
  it("rejects wording that presents the proposal as current and accepts wording that says it is last known", () => {
    expect(acceptsPlanningV2Reply("Lịch hiện tại khá nhẹ: ngày 1 có 2 điểm.", unknown)).toBe(false);
    expect(acceptsPlanningV2Reply("Đây là bản đã biết gần nhất vì lần ghi trước chưa rõ kết quả; ngày 1 có 2 điểm nên khá nhẹ.", unknown)).toBe(true);
  });
  it("the deterministic wording states it is the last known proposal", () => {
    expect(fallbackPlanningV2Reply(unknown)).toContain("bản đã biết gần nhất");
  });
  it("marks the plan lastKnownOnly in a live UNKNOWN session and keeps mutation blocked", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày xe máy", "v208-last-initial");
    vi.mocked(f.repository.publishProposal).mockRejectedValueOnce(new AppError("OPERATION_STATUS_UNKNOWN", "Uncertain write", 503));
    await session.send("bỏ Quản Bạ đi", "v208-last-edit");
    const advised = await session.send("lịch này ổn chưa", "v208-last-advice");
    expect(advised.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", lastKnownOnly: true }); expect(advised.message).toContain("gần nhất"); expect(advised.uncertain).toBe(true);
    await expect(session.send("bỏ Quản Bạ đi", "v208-last-retry")).rejects.toMatchObject({ code: "OPERATION_STATUS_UNKNOWN" });
  });
});

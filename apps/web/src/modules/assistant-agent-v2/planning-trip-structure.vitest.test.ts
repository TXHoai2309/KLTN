import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { analyzePlanningText } from "../assistant-planning/planning-ai";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { fallbackPlanningV2Reply } from "./planning-response";
import { startTravelPlanningV2Session, type PlanningSessionState } from "./travel-planning-session";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v209-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** The fake model plays the classifier. The seam under test is session.send(). */
const facts: Record<string, { durationDays?: number; transport?: "MOTORCYCLE" | "CAR"; overnightCount?: number; overnightArea?: { afterDay: number | null; name: string }; intent?: string }> = {
  "2 ngày 1 đêm bằng xe máy": { durationDays: 2, transport: "MOTORCYCLE", overnightCount: 1 },
  "2 ngày 1 đêm": { durationDays: 2, overnightCount: 1 },
  "3N2Đ": { durationDays: 3, overnightCount: 2 },
  "2 ngày": { durationDays: 2 },
  "2 ngày 5 đêm": { durationDays: 2, overnightCount: 5 },
  "xe máy": { transport: "MOTORCYCLE" },
  "thực ra 2 đêm": { overnightCount: 2 },
  "thực ra 5 đêm": { overnightCount: 5 },
  "mình nghỉ 1 đêm": { overnightCount: 1 },
  "lập lại lịch": { intent: "REGENERATE" },
  "2 ngày 1 đêm, ngủ Đồng Văn": { durationDays: 2, overnightCount: 1, overnightArea: { afterDay: null, name: "Đồng Văn" } },
  "2 ngày 1 đêm, ngủ Sapa": { durationDays: 2, overnightCount: 1, overnightArea: { afterDay: null, name: "Sapa" } },
  "3 ngày 2 đêm, ngủ Đồng Văn": { durationDays: 3, overnightCount: 2, overnightArea: { afterDay: null, name: "Đồng Văn" } },
  "tôi muốn ngủ Mèo Vạc": { overnightArea: { afterDay: null, name: "Mèo Vạc" } },
  "tôi muốn ngủ Lũng Cú": { overnightArea: { afterDay: null, name: "Lũng Cú" } },
  "thực ra ngủ Đồng Văn": { overnightArea: { afterDay: 1, name: "Đồng Văn" } },
  "đêm đầu nên nghỉ đâu?": { intent: "ADVISE" },
  "tìm homestay ở Đồng Văn cho tôi": { intent: "QA" },
};

function fixture() {
  let workspace = planningWorkspaceSchema.parse({ conversationId: "v209-chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" } });
  let hash: string | null = null;
  const candidates = [
    { ...planningCandidate("a"), name: "Quản Bạ", area: "Quản Bạ" }, { ...planningCandidate("b"), name: "Đồng Văn", area: "Đồng Văn" },
    { ...planningCandidate("c"), name: "Mã Pì Lèng", area: "Mèo Vạc" }, { ...planningCandidate("d"), name: "Nho Quế", area: "Mèo Vạc" },
    { ...planningCandidate("e"), name: "Lũng Cú", area: "Lũng Cú" },
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
  const understandingSchemas: { required?: string[] }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string; schema: unknown } }; messages: { content: string }[] };
    const name = body.response_format.json_schema.name;
    const input = JSON.parse(body.messages.at(-1)!.content) as { latestUserText?: string; interleaving?: unknown };
    if (name === "trip_chat_understanding") understandingSchemas.push(body.response_format.json_schema.schema as { required?: string[] });
    const fact = facts[input.latestUserText ?? ""] ?? {};
    // Only fields the model "said" are sent; the production parse must tolerate omitted nullable fields.
    let value: unknown = {
      intent: fact.intent ?? "NEEDS", durationDays: fact.durationDays ?? null, transport: fact.transport ?? null,
      ...(fact.overnightCount !== undefined ? { overnightCount: fact.overnightCount } : {}),
      ...(fact.overnightArea ? { overnightArea: fact.overnightArea } : {}),
      startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null,
      destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE",
    };
    if (name !== "trip_chat_understanding") value = { days: [["a", "b"], ["c", "d"]] };
    else if (input.interleaving) value = { ...(value as object), interleaved: { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false } };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  }));
  const start = (resume?: PlanningSessionState) => startTravelPlanningV2Session({ headers: new Headers(), conversationId: resume ? "v209-chat" : null, key: "v209-start-key", resume }, { authorization, forActor: () => deps, compose: async plan => fallbackPlanningV2Reply(plan) });
  return { start, deps, repository, understandingSchemas, workspace: () => structuredClone(workspace) };
}

describe("V2-09 trip structure: days and nights are separate facts", () => {
  it("captures duration, nights and transport in one turn and does not ask again", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày 1 đêm bằng xe máy", "v209-all-in-one");
    expect(result.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
    expect(result.latestNeeds.tripStructure).toEqual({ overnightCount: 1 });
    expect(result.responsePlan.goal).toBe("PRESENT_PROPOSAL"); expect(result.message).not.toMatch(/mấy ngày|ô tô hay xe máy/);
    expect(f.deps.generate).toHaveBeenCalledOnce();
  });
  it("stores a 3N2Đ style answer as 3 days and 2 nights", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("3N2Đ", "v209-3n2d");
    expect(result.latestNeeds.requirement.durationDays).toBe(3); expect(result.latestNeeds.tripStructure).toEqual({ overnightCount: 2 });
  });
  it("never derives nights from a days-only answer and keeps the old flow", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày", "v209-days-only");
    expect(result.latestNeeds.tripStructure).toBeUndefined(); expect(result.responsePlan.goal).toBe("ASK_TRANSPORT");
  });
  it("asks one clarification instead of silently fixing inconsistent nights", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày 5 đêm", "v209-inconsistent");
    expect(result.responsePlan).toMatchObject({ goal: "CLARIFY", clarificationField: "tripStructure", tripShapeConflict: { durationDays: 2, overnightCount: 5 } });
    expect(result.latestNeeds.tripStructure).toBeUndefined(); expect(result.latestNeeds.requirement.durationDays).toBeUndefined();
    expect(result.message).toContain("2"); expect(result.message).toContain("5"); expect((result.message.match(/\?/g) ?? []).length).toBe(1);
  });
  it("a later explicit correction wins; an inconsistent correction leaves the last valid value", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm", "v209-correct-initial");
    const fixed = await session.send("thực ra 2 đêm", "v209-correct-two");
    expect(fixed.latestNeeds.tripStructure).toEqual({ overnightCount: 2 });
    const rejected = await session.send("thực ra 5 đêm", "v209-correct-five");
    expect(rejected.responsePlan.clarificationField).toBe("tripStructure"); expect(rejected.latestNeeds.tripStructure).toEqual({ overnightCount: 2 });
  });
  it("survives a capsule transfer to another worker and still builds the proposal", async () => {
    const f = fixture(); const a = await f.start();
    await a.send("2 ngày 1 đêm", "v209-worker-a");
    const b = await f.start(JSON.parse(JSON.stringify(a.exportState())));
    const result = await b.send("xe máy", "v209-worker-b");
    expect(result.latestNeeds.tripStructure).toEqual({ overnightCount: 1 });
    expect(result.responsePlan.goal).toBe("PRESENT_PROPOSAL"); expect(result.generated?.proposal.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
  });
  it("keeps the nights when the user asks to rebuild", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v209-regen-initial");
    const result = await session.send("lập lại lịch", "v209-regen");
    expect(result.latestNeeds.tripStructure).toEqual({ overnightCount: 1 }); expect(result.message).not.toMatch(/mấy ngày|mấy đêm|ô tô hay xe máy/);
  });
  it("records nights added after a proposal without rebuilding the itinerary", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày xe máy".replace("2 ngày xe máy", "2 ngày 1 đêm bằng xe máy"), "v209-late-initial");
    vi.mocked(f.deps.generate).mockClear();
    const result = await session.send("mình nghỉ 1 đêm", "v209-late-nights");
    expect(result.latestNeeds.tripStructure).toEqual({ overnightCount: 1 }); expect(f.deps.generate).not.toHaveBeenCalled();
    expect(result.generated?.version).toBe(first.generated?.version);
  });
});

describe("V2-09 model request contract", () => {
  it("sends a strict-compatible schema: overnightCount is required and no `default` keyword is sent", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm", "v209-contract");
    const sent = f.understandingSchemas.at(-1)!;
    expect(sent.required).toContain("overnightCount"); expect(JSON.stringify(sent)).not.toContain('"default"');
  });
});

describe("V2-09 overnight explanation in the proposal and advice", () => {
  it("states days and nights, the day-end area to pause in, and never invents lodging", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày 1 đêm bằng xe máy", "v209-explain");
    expect(result.responsePlan.guidance?.overnights).toEqual([{ afterDay: 1, area: "Đồng Văn", nextDayLegMinutes: expect.anything(), source: "DERIVED" }]);
    expect(result.responsePlan.guidance?.days.map(day => day.stopCount)).toEqual([2, 2]);
    expect(result.message).toContain("2 ngày 1 đêm"); expect(result.message).toMatch(/nghỉ đêm[^.]*Đồng Văn/);
    expect(result.message).not.toMatch(/khách sạn|homestay|đặt phòng|giá phòng|còn phòng/i);
  });
  it("does not mention nights when the user never stated them", async () => {
    const f = fixture(); const a = await f.start(); await a.send("2 ngày", "v209-nonight-a");
    const result = await a.send("xe máy", "v209-nonight-b");
    expect(result.responsePlan.guidance?.overnights).toEqual([]); expect(result.message).not.toMatch(/đêm/);
  });
  it("answers 'where to stay the first night' as read-only guidance from the current proposal", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày 1 đêm bằng xe máy", "v209-advice-initial");
    vi.mocked(f.deps.generate).mockClear(); vi.mocked(f.repository.publishProposal).mockClear(); vi.mocked(f.repository.review).mockClear();
    const result = await session.send("đêm đầu nên nghỉ đâu?", "v209-advice");
    expect(result.responsePlan).toMatchObject({ goal: "PLANNING_GUIDANCE", proposalChanged: false });
    expect(result.message).toContain("Đồng Văn"); expect(result.message).not.toMatch(/khách sạn|homestay|đặt phòng|giá phòng/i);
    expect(result.generated).toEqual(first.generated); expect(result.latestNeeds).toEqual(first.latestNeeds);
    expect(f.deps.generate).not.toHaveBeenCalled(); expect(f.repository.publishProposal).not.toHaveBeenCalled(); expect(f.repository.review).not.toHaveBeenCalled();
  });
  it("rejects model wording that names lodging, prices or availability and accepts an area suggestion", async () => {
    const { acceptsPlanningV2Reply } = await import("./planning-response");
    const plan = { goal: "PLANNING_GUIDANCE", knownFacts: { durationDays: 2 }, tripStructure: { overnightCount: 1 }, planningImplications: [], mustNotClaim: [], validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false },
      guidance: { days: [{ day: 1, stops: ["A", "B"], stopCount: 2, travelMinutes: 60, finishMinute: 700 }, { day: 2, stops: ["C"], stopCount: 1, travelMinutes: 29, finishMinute: 600 }], overnights: [{ afterDay: 1, area: "Đồng Văn", nextDayLegMinutes: 29, source: "DERIVED" }], signals: [], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } } as never;
    for (const bad of ["Bạn nên đặt phòng homestay Hoa Mai giá 450 nghìn.", "Còn phòng ở Đồng Văn, bạn đặt ngay nhé."]) expect(acceptsPlanningV2Reply(bad, plan)).toBe(false);
    expect(acceptsPlanningV2Reply("Ngày 1 kết thúc quanh Đồng Văn nên nghỉ đêm khu vực đó; ngày 2 mở đầu bằng khoảng 29 phút di chuyển. Mình chưa có dữ liệu lưu trú cụ thể.", plan)).toBe(true);
  });
  it("does not pretend to research lodging: a homestay request stays on the QA/unsupported side", async () => {
    const f = fixture(); const session = await f.start(); await session.send("2 ngày 1 đêm bằng xe máy", "v209-homestay-initial");
    const result = await session.send("tìm homestay ở Đồng Văn cho tôi", "v209-homestay");
    expect(result.responsePlan.goal).toMatch(/^QA_/); expect(result.responsePlan.proposalChanged).toBe(false);
    expect(result.message).not.toMatch(/giá|đặt phòng|còn phòng/i);
  });
});

describe("V2-09 explicit overnight area: grounded, enforced after selection, latest wins", () => {
  it("keeps 'ngủ Đồng Văn' as an explicit, canonical area for the first night and never asks where to sleep", async () => {
    const f = fixture(); const session = await f.start();
    const asked = await session.send("2 ngày 1 đêm, ngủ Đồng Văn", "v209-area-explicit");
    expect(asked.latestNeeds.tripStructure).toEqual({ overnightCount: 1, overnightAreas: [{ afterDay: 1, area: "Đồng Văn" }] });
    expect(asked.message).not.toMatch(/ngủ ở đâu|nghỉ ở đâu/);
    const built = await session.send("xe máy", "v209-area-build");
    expect(vi.mocked(f.deps.generate).mock.calls[0]![0].instruction).not.toMatch(/nghỉ đêm|kết thúc ở/);
    expect(built.responsePlan.guidance?.overnights[0]).toMatchObject({ afterDay: 1, area: "Đồng Văn", source: "USER" });
  });
  it("refuses to invent an area that no destination belongs to and offers known areas", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("2 ngày 1 đêm, ngủ Sapa", "v209-area-unknown");
    expect(result.responsePlan.goal).toBe("CLARIFY"); expect(result.message).toContain("Sapa"); expect(result.message).toMatch(/Đồng Văn|Mèo Vạc/);
    expect(result.latestNeeds.tripStructure).toBeUndefined();
  });
  it("asks which night when several nights exist and the user named one area", async () => {
    const f = fixture(); const session = await f.start();
    const result = await session.send("3 ngày 2 đêm, ngủ Đồng Văn", "v209-area-which-night");
    expect(result.responsePlan.goal).toBe("CLARIFY"); expect(result.message).toMatch(/đêm nào|đêm 1|đêm đầu/); expect((result.message.match(/\?/g) ?? []).length).toBe(1);
  });
  it("hides the night preference from the model: it is applied by code, not by prompt", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v209-hidden-initial"); vi.mocked(f.deps.generate).mockClear();
    await session.send("tôi muốn ngủ Mèo Vạc", "v209-hidden");
    expect(vi.mocked(f.deps.generate).mock.calls[0]![0].needs.tripStructure).toBeUndefined();
    expect(vi.mocked(f.deps.generate).mock.calls[0]![0].needs.requirement.durationDays).toBe(2);
  });
  it("changing the area after a proposal rebuilds it and ends day 1 in that area with no extra model call", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày 1 đêm bằng xe máy", "v209-change-initial");
    vi.mocked(f.deps.generate).mockClear();
    const result = await session.send("tôi muốn ngủ Mèo Vạc", "v209-change");
    expect(result.responsePlan).toMatchObject({ goal: "REFINE_PROPOSAL", proposalChanged: true });
    expect(vi.mocked(f.deps.generate)).toHaveBeenCalledOnce(); expect(vi.mocked(f.deps.generate).mock.calls[0]![0].instruction).not.toMatch(/nghỉ đêm|kết thúc ở/);
    expect(result.generated?.version).toBe((first.generated?.version ?? 0) + 1);
    expect(result.generated?.proposal.days[0]?.stops.at(-1)?.destination.area).toBe("Mèo Vạc");
    expect(result.responsePlan.guidance?.overnights[0]).toMatchObject({ afterDay: 1, area: "Mèo Vạc", source: "USER" });
    expect(result.message).toMatch(/nghỉ đêm[^.]*Mèo Vạc/);
  });
  it("says so plainly when the preference cannot be arranged, and does not touch the Validator verdict", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v209-unmet-initial");
    const result = await session.send("tôi muốn ngủ Lũng Cú", "v209-unmet");
    expect(result.generated?.overnightUnmet).toEqual([{ afterDay: 1, wantedArea: "Lũng Cú", actualArea: "Đồng Văn" }]);
    expect(result.message).toMatch(/chưa xếp được[^.]*Lũng Cú/); expect(result.generated?.proposal.status).not.toBe("PROPOSAL_READY");
  });
  it("latest explicit area wins and a rebuild keeps it", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v209-latest-initial");
    await session.send("tôi muốn ngủ Mèo Vạc", "v209-latest-first");
    const back = await session.send("thực ra ngủ Đồng Văn", "v209-latest-second");
    expect(back.latestNeeds.tripStructure?.overnightAreas).toEqual([{ afterDay: 1, area: "Đồng Văn" }]);
    const regenerated = await session.send("lập lại lịch", "v209-latest-regen");
    expect(regenerated.latestNeeds.tripStructure?.overnightAreas).toEqual([{ afterDay: 1, area: "Đồng Văn" }]);
  });
});

describe("V2-09 live findings: an unbuildable night preference must not poison later rebuilds", () => {
  it("drops the preference that failed to build, says so, records the failure code, and a later rebuild works", async () => {
    const f = fixture(); const session = await f.start();
    const first = await session.send("2 ngày 1 đêm bằng xe máy", "v209-poison-initial");
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new AppError("AI_UNAVAILABLE", "deadline", 503));
    const failed = await session.send("tôi muốn ngủ Mèo Vạc", "v209-poison-fail");
    expect(failed.responsePlan).toMatchObject({ goal: "REFINEMENT_FAILED", failureCode: "AI_UNAVAILABLE", overnightPreferenceDropped: true, proposalChanged: false });
    expect(failed.latestNeeds.tripStructure).toEqual({ overnightCount: 1 }); expect(failed.generated).toEqual(first.generated);
    expect(failed.message).toMatch(/nơi nghỉ đêm/);
    const rebuilt = await session.send("lập lại lịch", "v209-poison-rebuild");
    expect(rebuilt.responsePlan.goal).toBe("REFINE_PROPOSAL"); expect(rebuilt.latestNeeds.tripStructure).toEqual({ overnightCount: 1 });
  });
  it("adds no model call to honour a night preference, so the request model budget is not spent", async () => {
    const f = fixture(); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v209-budget-initial");
    vi.mocked(f.deps.generate).mockClear();
    await session.send("tôi muốn ngủ Mèo Vạc", "v209-budget");
    expect(vi.mocked(f.deps.generate).mock.calls.length).toBe(1);
  });
});

describe("V2-09 area wording", () => {
  it("does not repeat 'khu vực' when the stored area label already starts with it", async () => {
    const { fallbackPlanningV2Reply } = await import("./planning-response");
    const plan = { goal: "PLANNING_GUIDANCE", knownFacts: {}, planningImplications: [], mustNotClaim: [], overnightUnmet: [{ afterDay: 1, wantedArea: "khu vực hà giang", actualArea: "mèo vạc" }],
      validation: { status: "INSUFFICIENT_DATA", checks: [], eligibleForFinalConfirmation: false },
      guidance: { days: [{ day: 1, stops: ["A"], stopCount: 1, travelMinutes: 10, finishMinute: 600 }, { day: 2, stops: ["B"], stopCount: 1, travelMinutes: 10, finishMinute: 600 }], overnights: [{ afterDay: 1, area: "mèo vạc", nextDayLegMinutes: 20, source: "DERIVED" }], signals: [], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: [], eligibleForFinalConfirmation: false } } } as never;
    const text = fallbackPlanningV2Reply(plan);
    expect(text).not.toMatch(/khu vực khu vực/); expect(text).toContain("khu vực hà giang"); expect(text).toContain("khu vực mèo vạc");
  });
});

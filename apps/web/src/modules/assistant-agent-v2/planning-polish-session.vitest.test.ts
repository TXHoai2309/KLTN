import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../server/http/app-error";
import { createPlanningSessionFixture } from "../../test/planning-session-fixture";
import { composePlanningV2Reply } from "./planning-response";
import { travelPlanningSkill } from "./skills/travel-planning";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v210-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const removeFirst = { operations: [{ kind: "REMOVE", day: 1, targetName: "Quản Bạ", destinationName: null, position: null, criteria: null }] };
const understandings = {
  "lập hành trình đi hà giang": {}, "2 ngày": { durationDays: 2 }, "xe máy": { transport: "MOTORCYCLE" as const },
  "2 ngày 1 đêm bằng xe máy": { durationDays: 2, transport: "MOTORCYCLE" as const, overnightCount: 1 },
  "gợi ý cho tôi nên đi như nào": { intent: "ADVISE" }, "lịch này ổn chưa": { intent: "ADVISE" }, "đi vậy có mệt không": { intent: "ADVISE" },
  "bỏ Quản Bạ đi": { intent: "EDIT", edit: removeFirst },
  "Dinh họ Vương xây năm nào?": { intent: "QA", question: "Dinh họ Vương xây năm nào?" },
  "tìm homestay đẹp ở Đồng Văn": { intent: "QA", question: "tìm homestay đẹp ở Đồng Văn", unsupported: true },
};
/** One caveat is one sentence that states a status limit (not saved / unchecked / missing date). */
const caveatSentences = (text: string) => text.split(/(?<=[.!])\s+/).filter(sentence => /chưa lưu|chưa kiểm tra|chưa có ngày|chưa đủ dữ liệu|giờ mở cửa (?:vẫn|chưa|cần)|cần kiểm tra lại/i.test(sentence)).length;
const MECHANICAL = /^(?:Mình (?:đã )?ghi nhận|Thông tin của bạn là|Bạn muốn điều chỉnh cụ thể điều gì)/;
const JARGON = /fingerprint|capsule|workspace|version|validator|\bPASS\b|\bintent\b|action id|ACTION_|AI_UNAVAILABLE|INVALID_AI_PLAN|REPLAN_|PLANNING_GUIDANCE/i;

describe("V2-10 conversation shape across a whole conversation (session seam)", () => {
  it("minimal trip: a useful implication, no questionnaire, then a strategy-first proposal with one caveat", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    const first = await session.send("lập hành trình đi hà giang", "v210-turn-a1");
    expect(first.responsePlan.goal).toBe("ASK_DURATION"); expect(first.message).toContain("mấy ngày"); expect(caveatSentences(first.message)).toBe(0);
    const second = await session.send("2 ngày", "v210-turn-a2");
    expect(second.responsePlan.goal).toBe("ASK_TRANSPORT"); expect(second.message).toMatch(/gọn/); expect(caveatSentences(second.message)).toBe(0);
    const proposal = await session.send("xe máy", "v210-turn-a3");
    expect(proposal.message).toMatch(/^Với 2 ngày đi xe máy/); expect(proposal.message.indexOf("Quản Bạ")).toBeLessThan(proposal.message.search(/chưa lưu/));
    expect(caveatSentences(proposal.message)).toBe(1); expect(proposal.message).not.toMatch(/sơ bộ|một số kiểm tra chưa đủ dữ liệu/i);
  });
  it("read-only turns carry no caveat unless the question is about checks, the date or saving", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v210-turn-b1");
    const advice = await session.send("gợi ý cho tôi nên đi như nào", "v210-turn-b2");
    expect(advice.responsePlan.goal).toBe("PLANNING_GUIDANCE"); expect(caveatSentences(advice.message)).toBe(0);
    const tired = await session.send("đi vậy có mệt không", "v210-turn-b3");
    expect(caveatSentences(tired.message)).toBe(0);
    const sound = await session.send("lịch này ổn chưa", "v210-turn-b4");
    expect(caveatSentences(sound.message)).toBe(1);
  });
  it("an edit is explained as a change: what went, which day, what stayed, and one caveat", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    await session.send("2 ngày 1 đêm bằng xe máy", "v210-turn-c1");
    const edited = await session.send("bỏ Quản Bạ đi", "v210-turn-c2");
    expect(edited.responsePlan.goal).toBe("REPLAN_PROPOSAL");
    expect(edited.message).toMatch(/^Mình đã bỏ Quản Bạ khỏi ngày 1/); expect(edited.message).toMatch(/ngày 2 giữ nguyên/); expect(edited.message).toMatch(/nhẹ hơn/);
    expect(edited.message).not.toMatch(/Đề xuất sơ bộ đã chỉnh/); expect(caveatSentences(edited.message)).toBe(1);
  });
  it("a failed generation says what happened and what to do next, with no raw error and the needs kept", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    vi.mocked(f.deps.generate).mockRejectedValueOnce(new AppError("AI_UNAVAILABLE", "internal detail", 503));
    const failed = await session.send("2 ngày 1 đêm bằng xe máy", "v210-turn-d1");
    expect(failed.responsePlan.goal).toBe("PROPOSAL_FAILED"); expect(failed.message).toMatch(/thử lại/); expect(failed.message).not.toMatch(JARGON); expect(failed.message).not.toContain("internal detail");
    expect(failed.latestNeeds.requirement).toMatchObject({ durationDays: 2, transport: "MOTORCYCLE" });
  });
  it("factual-question wrappers leave the plan alone, carry no caveat and no raw error", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    const proposal = await session.send("2 ngày 1 đêm bằng xe máy", "v210-turn-e1");
    const failed = await session.send("Dinh họ Vương xây năm nào?", "v210-turn-e2");
    expect(failed.responsePlan.goal).toBe("QA_FAILED"); expect(failed.generated).toEqual(proposal.generated); expect(failed.message).not.toMatch(JARGON); expect(caveatSentences(failed.message)).toBe(0);
    const unsupported = await session.send("tìm homestay đẹp ở Đồng Văn", "v210-turn-e3");
    expect(unsupported.responsePlan.goal).toBe("QA_UNSUPPORTED"); expect(unsupported.message).not.toMatch(/giá|đặt phòng|còn phòng/i); expect(caveatSentences(unsupported.message)).toBe(0);
  });
  it("no reply anywhere in the conversation opens with a mechanical phrase or leaks technical state", async () => {
    const f = createPlanningSessionFixture(understandings); const session = await f.start();
    const replies: string[] = [];
    for (const [i, text] of ["lập hành trình đi hà giang", "2 ngày", "xe máy", "gợi ý cho tôi nên đi như nào", "bỏ Quản Bạ đi", "lịch này ổn chưa", "Dinh họ Vương xây năm nào?"].entries()) replies.push((await session.send(text, `v210-turn-f${i}`)).message);
    for (const reply of replies) { expect(reply).not.toMatch(MECHANICAL); expect(reply).not.toMatch(JARGON); }
  });
});

describe("V2-10 live findings: first-attempt failures, advice without a proposal", () => {
  const overPacked = { days: [["a", "b", "c", "d"], []] };
  it("retries once with the pace limit when the model over-packs a day, instead of failing the draft", async () => {
    const f = createPlanningSessionFixture({ ...understandings, "xe máy": { transport: "MOTORCYCLE" } }); const session = await f.start();
    vi.mocked(f.deps.generate).mockResolvedValueOnce(overPacked);
    await session.send("2 ngày", "v210-turn-g1");
    const proposal = await session.send("xe máy", "v210-turn-g2");
    expect(proposal.responsePlan.goal).toBe("PRESENT_PROPOSAL");
    expect(vi.mocked(f.deps.generate)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.deps.generate).mock.calls[1]![0].instruction).toMatch(/tối đa 3 điểm/);
  });
  it("still reports a clear failure after the single retry, never looping", async () => {
    const f = createPlanningSessionFixture({ ...understandings, "xe máy": { transport: "MOTORCYCLE" } }); const session = await f.start();
    vi.mocked(f.deps.generate).mockResolvedValue(overPacked);
    await session.send("2 ngày", "v210-turn-h1");
    const failed = await session.send("xe máy", "v210-turn-h2");
    expect(failed.responsePlan).toMatchObject({ goal: "PROPOSAL_FAILED", failureCode: "PACE_LIMIT" });
    expect(vi.mocked(f.deps.generate)).toHaveBeenCalledTimes(2); expect(failed.message).toMatch(/thử lại/); expect(failed.message).not.toMatch(/PACE_LIMIT/);
  });
  it("advice with no proposal does not ask again for the days and vehicle that are already known", async () => {
    const f = createPlanningSessionFixture({ ...understandings, "xe máy": { transport: "MOTORCYCLE" }, "đêm đầu nên nghỉ đâu": { intent: "ADVISE" } }); const session = await f.start();
    vi.mocked(f.deps.generate).mockResolvedValue(overPacked);
    await session.send("2 ngày", "v210-turn-i1"); await session.send("xe máy", "v210-turn-i2");
    const advice = await session.send("đêm đầu nên nghỉ đâu", "v210-turn-i3");
    expect(advice.responsePlan.goal).toBe("PLANNING_GUIDANCE"); expect(advice.message).toMatch(/thử lại/); expect(advice.message).not.toMatch(/số ngày|phương tiện/);
  });
  it("hands the composer the finished caveat and user-facing facts, not internal check names or outcomes", async () => {
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => { sent.push(String(JSON.parse(String(init?.body)).messages.at(-1).content)); return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ message: "ok" }) } }] }); }));
    const plan = { goal: "REFINE_PROPOSAL", knownFacts: { durationDays: 2, transport: "MOTORCYCLE" }, planningImplications: ["MINIMUM_BRIEF", "DATE_REQUIRED_FOR_SAVE"], mustNotClaim: ["SAVED"], refinementOutcome: "PUBLISHED", proposalChanged: true,
      validation: { status: "INSUFFICIENT_DATA", checks: [{ key: "MOBILITY", status: "PASS" }, { key: "OPENING_HOURS", status: "INSUFFICIENT_DATA" }], eligibleForFinalConfirmation: false },
      refinement: { changedFields: ["interests"], newFacts: {}, planningImplications: ["CULTURE_PRIORITY"], requiresRegeneration: true },
      guidance: { days: [{ day: 1, stops: ["A"], stopCount: 1, travelMinutes: null, finishMinute: null }], overnights: [], signals: [{ code: "DATE_REQUIRED_FOR_HOURS" }], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: ["OPENING_HOURS"], eligibleForFinalConfirmation: false } } } as never;
    await composePlanningV2Reply(plan, travelPlanningSkill as never);
    expect(sent[0]).not.toMatch(/MOBILITY|OPENING_HOURS|refinementOutcome|PUBLISHED|mustNotClaim/);
    expect(sent[0]).toContain("chưa có ngày khởi hành"); expect(sent[0]).toContain("chiều sâu văn hóa");
  });
});

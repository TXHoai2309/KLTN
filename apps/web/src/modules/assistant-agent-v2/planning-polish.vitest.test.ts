import { afterEach, describe, expect, it, vi } from "vitest";
import { measureAssistantTurn } from "../../server/assistant-turn-metrics";
import { acceptsPlanningV2Reply, fallbackPlanningV2Reply, safePlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { travelPlanningSkill } from "./skills/travel-planning";

afterEach(() => { vi.restoreAllMocks(); });

const guidance = { days: [{ day: 1, stops: ["Quản Bạ", "Đồng Văn"], stopCount: 2, travelMinutes: 66, finishMinute: 700 }, { day: 2, stops: ["Mã Pì Lèng", "Nho Quế"], stopCount: 2, travelMinutes: 38, finishMinute: 698 }], overnights: [], signals: [{ code: "BALANCED_LOAD", maxStopCount: 2, maxTravelMinutes: 66 }, { code: "DATE_REQUIRED_FOR_HOURS" }], fallbackSuggestions: [], validation: { status: "INSUFFICIENT_DATA", pendingChecks: ["OPENING_HOURS"], eligibleForFinalConfirmation: false } };
const plan = (overrides: Partial<PlanningResponsePlan> = {}) => ({
  goal: "PLANNING_GUIDANCE", knownFacts: { durationDays: 2, transport: "MOTORCYCLE" }, planningImplications: [], mustNotClaim: ["SAVED", "APPLIED", "UNSUPPORTED_FACTS", "VALIDITY_WITHOUT_EVIDENCE"], proposalChanged: false, userQuestion: "đi vậy có mệt không",
  validation: { status: "INSUFFICIENT_DATA", checks: [{ key: "OPENING_HOURS", status: "INSUFFICIENT_DATA" }], eligibleForFinalConfirmation: false }, guidance, ...overrides,
}) as unknown as PlanningResponsePlan;

/** The per-turn metric line is the observable contract: counts per composed goal, never text. */
async function metricsOf(work: () => Promise<unknown>) {
  vi.restoreAllMocks();
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  await measureAssistantTurn(work);
  const line = info.mock.calls.map(call => String(call[0] + " " + (call[1] ?? ""))).find(text => text.startsWith("ASSISTANT_V2_TURN_METRICS"));
  return JSON.parse(line!.slice("ASSISTANT_V2_TURN_METRICS".length));
}

describe("V2-10 composer outcome metric", () => {
  it("counts an accepted model reply and a rejected-to-fallback reply per goal, without any text", async () => {
    const accepted = await metricsOf(() => safePlanningV2Reply(plan(), travelPlanningSkill as never, async () => "Nhìn chung lịch này không quá mệt: mỗi ngày 2 điểm, di chuyển 66 phút ngày 1."));
    expect(accepted.composerOutcomes).toEqual({ PLANNING_GUIDANCE: { accepted: 1, fallback: 0 } });
    const rejected = await metricsOf(() => safePlanningV2Reply(plan(), travelPlanningSkill as never, async () => "Mình đã lưu chuyến đi rồi."));
    expect(rejected.composerOutcomes).toEqual({ PLANNING_GUIDANCE: { accepted: 0, fallback: 1 } });
    expect(JSON.stringify(rejected)).not.toContain("đã lưu");
  });
  it("counts nothing for goals that never call the model", async () => {
    const metrics = await metricsOf(() => safePlanningV2Reply(plan({ goal: "REPLAN_PROPOSAL" }), travelPlanningSkill as never, async () => { throw new Error("must not compose"); }));
    expect(metrics.composerOutcomes).toEqual({});
  });
  it("counts a composer that throws as a fallback", async () => {
    const metrics = await metricsOf(() => safePlanningV2Reply(plan(), travelPlanningSkill as never, async () => { throw new Error("provider down"); }));
    expect(metrics.composerOutcomes).toEqual({ PLANNING_GUIDANCE: { accepted: 0, fallback: 1 } });
  });
});

const proposal = (overrides: Partial<PlanningResponsePlan> = {}) => plan({ goal: "PRESENT_PROPOSAL", userQuestion: undefined, planningImplications: ["MINIMUM_BRIEF", "COMPACT_TRIP", "DATE_REQUIRED_FOR_SAVE"], ...overrides });
/** One caveat is one sentence that states a status limit (not saved / unchecked / missing date). */
const caveatSentences = (text: string) => text.split(/(?<=[.!])\s+/).filter(sentence => /chưa lưu|chưa kiểm tra|chưa có ngày|chưa đủ dữ liệu|giờ mở cửa (?:vẫn|chưa|cần)|cần kiểm tra lại/i.test(sentence)).length;

describe("V2-10 safety gates stay strict, style rails are gone", () => {
  const natural = "Với 2 ngày đi xe máy, mình giữ ngày 1 theo Quản Bạ → Đồng Văn rồi ngày 2 Mã Pì Lèng → Nho Quế để lịch gọn. Lịch chưa lưu, và vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại.";
  it("accepts a natural proposal that never uses the old literal phrases", () => {
    expect(natural).not.toMatch(/sơ bộ|chưa đủ dữ liệu/); expect(acceptsPlanningV2Reply(natural, proposal())).toBe(true);
  });
  it("still accepts the old wording (compatible, not required)", () => {
    expect(acceptsPlanningV2Reply("Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Đây là đề xuất sơ bộ, chưa lưu; một số kiểm tra chưa đủ dữ liệu vì chưa có ngày khởi hành.", proposal())).toBe(true);
  });
  it("requires the proposal reply to convey that it is not saved", () => {
    expect(acceptsPlanningV2Reply("Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Chưa có ngày khởi hành nên giờ mở cửa cần kiểm tra lại.", proposal())).toBe(false);
  });
  it("requires the concrete cause of an incomplete check, not a boilerplate", () => {
    expect(acceptsPlanningV2Reply("Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Lịch chưa lưu.", proposal())).toBe(false);
  });
  it("accepts a refinement reply that has no per-topic keywords and may ask one question", () => {
    const refine = proposal({ goal: "REFINE_PROPOSAL", planningImplications: ["MINIMUM_BRIEF", "CULTURE_PRIORITY"], refinement: { changedFields: ["interests"], newFacts: {}, planningImplications: ["CULTURE_PRIORITY"], requiresRegeneration: true } as never });
    expect(acceptsPlanningV2Reply("Mình đã xếp lại: ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế, nghiêng về các điểm có chiều sâu hơn. Lịch chưa lưu và chưa có ngày đi nên giờ mở cửa cần kiểm tra lại. Bạn muốn thêm ngày đi cụ thể không?", refine)).toBe(true);
  });
  it.each([
    ["claims it was saved", "Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Mình đã lưu chuyến đi rồi."],
    ["claims the checks passed without evidence", "Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Lịch chưa lưu; các kiểm tra đều đáp ứng nhưng chưa có ngày khởi hành."],
    ["names lodging and price", "Mình xếp ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Lịch chưa lưu, chưa có ngày khởi hành; bạn đặt phòng homestay giá 450 nghìn nhé."],
  ])("still rejects a proposal reply that %s", (_name, message) => { expect(acceptsPlanningV2Reply(message, proposal())).toBe(false); });
});

describe("V2-10 caveat policy by turn type", () => {
  const advice = (userQuestion: string) => plan({ userQuestion });
  it("read-only advice carries no caveat unless the question is about checks, the date or saving", () => {
    const tired = fallbackPlanningV2Reply(advice("đi vậy có mệt không"));
    expect(caveatSentences(tired)).toBe(0); expect(tired).not.toMatch(/giờ mở cửa|chưa lưu/);
    const slow = fallbackPlanningV2Reply(advice("nếu đi chậm thì sao"));
    expect(caveatSentences(slow)).toBe(0);
  });
  it.each(["lịch này ổn chưa", "lịch này lưu được chưa", "đã kiểm tra giờ mở cửa chưa", "cần chốt ngày đi chưa"])("adds exactly one short caveat when asked %j", question => {
    expect(caveatSentences(fallbackPlanningV2Reply(advice(question)))).toBe(1);
  });
  it("rejects model advice that adds an unrelated caveat, and accepts it when the question asks about checks", () => {
    const withCaveat = "Nhìn chung lịch này không quá mệt: mỗi ngày 2 điểm. Lưu ý giờ mở cửa chưa được kiểm tra vì chưa có ngày đi.";
    expect(acceptsPlanningV2Reply(withCaveat, advice("đi vậy có mệt không"))).toBe(false);
    expect(acceptsPlanningV2Reply(withCaveat, advice("lịch này ổn chưa"))).toBe(true);
  });
  it("a created or changed proposal carries exactly one caveat sentence in the fixed wording", () => {
    expect(caveatSentences(fallbackPlanningV2Reply(proposal()))).toBe(1);
    expect(fallbackPlanningV2Reply(proposal())).toMatch(/ngày khởi hành/);
    expect(fallbackPlanningV2Reply(proposal())).not.toMatch(/Một số kiểm tra chưa đủ dữ liệu/);
  });
  it("names which checks passed instead of a vague 'valid' once the proposal is ready", () => {
    const ready = proposal({ validation: { status: "PROPOSAL_READY", checks: [{ key: "TRAVEL_TIME", status: "PASS" }, { key: "OPENING_HOURS", status: "PASS" }], eligibleForFinalConfirmation: true } as never });
    const text = fallbackPlanningV2Reply(ready);
    expect(text).toMatch(/thời gian di chuyển/); expect(text).toMatch(/giờ mở cửa/); expect(text).not.toMatch(/Validator|PASS/);
  });
  it("names the violated check and offers a lighter retry when the proposal is not feasible", () => {
    const bad = proposal({ validation: { status: "NO_FEASIBLE_ITINERARY", checks: [{ key: "TRAVEL_TIME", status: "VIOLATION" }], eligibleForFinalConfirmation: false } as never });
    const text = fallbackPlanningV2Reply(bad);
    expect(text).toMatch(/thời gian di chuyển/); expect(text).toMatch(/gọn hơn|ít điểm hơn/); expect(acceptsPlanningV2Reply(text, bad)).toBe(true);
  });
});

describe("V2-10 numbers are checked by unit against facts of the same kind", () => {
  const advice = (userQuestion = "lịch này ổn chưa") => plan({ userQuestion, tripStructure: { overnightCount: 1 }, guidance: { ...guidance, overnights: [{ afterDay: 1, area: "Đồng Văn", nextDayLegMinutes: 21, source: "DERIVED" }] } as never });
  it("accepts quantities that match a fact of their own kind", () => {
    expect(acceptsPlanningV2Reply("Ngày 1 có 2 điểm và khoảng 66 phút di chuyển, ngày 2 khoảng 38 phút; chặng nối sang ngày 2 mất 21 phút. Với 2 ngày 1 đêm thì khá cân bằng. Chưa có ngày khởi hành nên giờ mở cửa chưa kiểm tra được.", advice())).toBe(true);
    expect(acceptsPlanningV2Reply("Ngày 1 kết thúc khoảng 11:40 nên còn thoải mái. Lịch chưa lưu, và chưa có ngày khởi hành nên giờ mở cửa chưa kiểm tra được.", advice())).toBe(true);
  });
  it.each([
    ["hours that no fact states, although the digit exists elsewhere", "Tổng cộng khoảng 2 giờ trên đường."],
    ["a duration in 'tiếng'", "Ngày 1 đi khoảng 66 tiếng."],
    ["kilometres", "Chặng nối dài khoảng 2 km."],
    ["a minutes figure used as a stop count", "Ngày 1 có 38 điểm."],
    ["a stop count used as minutes", "Ngày 2 mất khoảng 1 phút di chuyển."],
    ["a day number that does not exist", "Ngày 3 khá nhẹ."],
    ["nights that were never stated", "Với 2 ngày 2 đêm thì khá cân bằng."],
    ["a clock time that is not stored", "Ngày 1 kết thúc khoảng 17:30."],
  ])("rejects %s", (_name, message) => { expect(acceptsPlanningV2Reply(message, advice())).toBe(false); });
  it("applies the same unit rule to a proposal reply", () => {
    const present = proposal();
    expect(acceptsPlanningV2Reply("Với 2 ngày đi xe máy, mình giữ ngày 1 theo Quản Bạ → Đồng Văn rồi ngày 2 Mã Pì Lèng → Nho Quế. Lịch chưa lưu, và vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại.", present)).toBe(true);
    expect(acceptsPlanningV2Reply("Với 2 ngày đi xe máy, mình giữ ngày 1 theo Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế, tổng khoảng 2 giờ lái xe. Lịch chưa lưu, và chưa có ngày khởi hành nên giờ mở cửa cần kiểm tra lại.", present)).toBe(false);
  });
});

describe("V2-10 a proposal reply carries exactly one caveat sentence", () => {
  it("rejects a proposal or refinement reply that repeats the caveat", () => {
    const twice = "Với 2 ngày đi xe máy, mình giữ ngày 1 Quản Bạ → Đồng Văn, ngày 2 Mã Pì Lèng → Nho Quế. Lịch này chưa lưu. Giờ mở cửa chưa kiểm tra vì chưa có ngày khởi hành.";
    expect(acceptsPlanningV2Reply(twice, proposal())).toBe(false);
    expect(acceptsPlanningV2Reply(twice, proposal({ goal: "REFINE_PROPOSAL" }))).toBe(false);
  });
});
describe("V2-10 advice without a proposal", () => {
  it("offers to retry when the brief is known, and asks only for what is missing otherwise", () => {
    const none = (knownFacts: object) => plan({ knownFacts: knownFacts as never, guidance: { ...guidance, days: [], signals: [], fallbackSuggestions: [], overnights: [] } as never });
    const known = fallbackPlanningV2Reply(none({ durationDays: 2, transport: "MOTORCYCLE" }));
    expect(known).toMatch(/thử lại/); expect(known).not.toMatch(/số ngày|phương tiện/);
    expect(fallbackPlanningV2Reply(none({}))).toMatch(/số ngày/);
    expect(fallbackPlanningV2Reply(none({ durationDays: 2 }))).toMatch(/phương tiện/);
  });
});

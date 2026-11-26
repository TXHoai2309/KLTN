import { describe, expect, it } from "vitest";
import { HA_GIANG_CITY_CENTER, resolveOvernightAnchorTown } from "../../lib/overnight-anchor";
import { candidate as makePlannerCandidate } from "../trip-planner/__fixtures__/planner-fixtures";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { estimatedRoadKm, estimateSeconds, haversine } from "../trip-planner/planner-geography";
import { arrangeTripRoute } from "../trip-planner/planner-route";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import {
  detectRelaxAndFamilySignals,
  hasGentlePaceWording,
  hasRelaxReasonSignal,
  hasYoungChildSignal,
} from "./tripsage-relax-signals";

function makeCandidate(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  area: string,
  suggestedDurationMinutes = 60,
): PlannerCandidate {
  return makePlannerCandidate(id, {
    name,
    area,
    address: `${name}, ${area}, Hà Giang`,
    category: "Cảnh quan",
    latitude,
    longitude,
    minimumDurationMinutes: Math.min(30, suggestedDurationMinutes),
    suggestedDurationMinutes,
  });
}

// Realistic coordinates around Hà Giang loop + off-loop Bắc Mê
const HA_THANH = makeCandidate("dest-ha-thanh", "Làng văn hóa Hạ Thành", 22.845, 104.9406, "TP Hà Giang", 60);
const BAC_SUM = makeCandidate("dest-bac-sum", "Dốc Bắc Sum", 22.9882, 104.9359, "Quản Bạ", 30);
const QUAN_BA = makeCandidate("dest-quan-ba", "Cổng trời Quản Bạ", 23.0493, 104.9927, "Quản Bạ", 60);
const NUI_DOI = makeCandidate("dest-nui-doi", "Núi Đôi Cô Tiên", 23.0642, 105.0008, "Quản Bạ", 45);
const LUNG_TAM = makeCandidate("dest-lung-tam", "Làng dệt lanh Lùng Tám", 23.0444, 105.0674, "Quản Bạ", 60);
const YEN_MINH = makeCandidate("dest-yen-minh", "Rừng thông Yên Minh", 23.1208, 105.1445, "Yên Minh", 45);
const THAM_MA = makeCandidate("dest-tham-ma", "Dốc Thẩm Mã", 23.169, 105.1942, "Yên Minh", 20);
const SUNG_LA = makeCandidate("dest-sung-la", "Thung lũng Sủng Là", 23.2271, 105.2024, "Đồng Văn", 60);
const VUONG = makeCandidate("dest-vuong", "Dinh thự họ Vương", 23.2563, 105.2621, "Đồng Văn", 90);
const DONG_VAN = makeCandidate("dest-dong-van", "Phố cổ Đồng Văn", 23.2783, 105.3614, "Đồng Văn", 90);
const LUNG_CU = makeCandidate("dest-lung-cu", "Cột cờ Lũng Cú", 23.3634, 105.3163, "Lũng Cú", 90);
const MA_PI_LENG = makeCandidate("dest-ma-pi-leng", "Đèo Mã Pì Lèng", 23.24, 105.4, "Mèo Vạc", 60);
const NHO_QUE = makeCandidate("dest-nho-que", "Sông Nho Quế", 23.1907, 105.4695, "Mèo Vạc", 120);
const BAC_ME = makeCandidate("dest-bac-me", "Di tích Căng Bắc Mê", 22.7536, 105.2877, "Bắc Mê", 60);

const FULL_POOL = [
  HA_THANH,
  BAC_SUM,
  QUAN_BA,
  NUI_DOI,
  LUNG_TAM,
  YEN_MINH,
  THAM_MA,
  SUNG_LA,
  VUONG,
  DONG_VAN,
  LUNG_CU,
  MA_PI_LENG,
  NHO_QUE,
  BAC_ME,
];

const CAU_GIAY_JOURNEY = {
  origin: {
    label: "Quận Cầu Giấy, Hà Nội",
    latitude: 21.0362,
    longitude: 105.7906,
    source: "NOMINATIM" as const,
    confirmed: true,
  },
  departureMinute: 420, // 07:00
  returnDeadlineMinute: 1080, // 18:00
  returnDepartureMinute: 420,
};

/** Realistic road-time provider matching Hanoi ↔ Hà Giang (~295 km, ~5.5–6h by car) and mountain legs. */
const REALISTIC_ROUTES: RouteProvider = {
  route: async ({ from, to, transport }) => {
    const km = estimatedRoadKm(from, to, 1.5);
    const secs = Math.max(300, Math.round(estimateSeconds(from, to, transport, 1.5)));
    return {
      fromDestinationId: from.id,
      toDestinationId: to.id,
      status: "VERIFIED",
      reason: null,
      durationSeconds: secs,
      distanceMeters: Math.round(km * 1000),
      provider: "STADIA_MAPS",
    };
  },
  coordinateRoute: async ({ from, to, transport }) => {
    const straightKm = haversine(from, to);
    // Highway + mountain mix for long legs from Hanoi (~1.3x straight line, ~58 km/h car average)
    const winding = straightKm >= 120 ? 1.32 : 1.5;
    const km = straightKm * winding;
    const speedKmh = straightKm >= 120 ? (transport === "CAR" ? 56 : 45) : (transport === "CAR" ? 38 : 32);
    const secs = Math.max(300, Math.round((km / speedKmh) * 3600));
    return {
      status: "VERIFIED",
      reason: null,
      durationSeconds: secs,
      distanceMeters: Math.round(km * 1000),
      provider: "STADIA_MAPS",
    };
  },
};

describe("S14 / S6 deterministic signal detection", () => {
  it("detects young child signals with and without Vietnamese diacritics", () => {
    expect(hasYoungChildSignal(["Nhà mình 2 vợ chồng với 1 bé 7 tuổi đi Hà Giang"])).toBe(true);
    expect(hasYoungChildSignal(["nha minh co 1 be 7 tuoi di Ha Giang"])).toBe(true);
    expect(hasYoungChildSignal(["Đi cùng con nhỏ nên cần nhẹ nhàng"])).toBe(true);
    expect(hasYoungChildSignal(["di cung con nho"])).toBe(true);
    expect(hasYoungChildSignal(["Đoàn có trẻ em và người lớn"])).toBe(true);
    expect(hasYoungChildSignal(["doan co tre em"])).toBe(true);
    expect(hasYoungChildSignal(["Nhà có em bé đi cùng"])).toBe(true);
    expect(hasYoungChildSignal(["nha co em be"])).toBe(true);
    expect(hasYoungChildSignal(["Con mình 10 tuổi đi được không?"])).toBe(true);
    expect(hasYoungChildSignal(["con minh 5 tuoi"])).toBe(true);
  });

  it("avoids false positives on non-child words, older ages (> 10), and negations", () => {
    expect(hasYoungChildSignal(["Nhóm 4 bạn bè đi phượt xe máy"])).toBe(false);
    expect(hasYoungChildSignal(["nhom 4 ban be di phuot"])).toBe(false);
    expect(hasYoungChildSignal(["Khách sạn có bể bơi không?"])).toBe(false);
    expect(hasYoungChildSignal(["khach san co be boi khong"])).toBe(false);
    expect(hasYoungChildSignal(["Đường bé, xe bé đi có ổn không?"])).toBe(false);
    expect(hasYoungChildSignal(["Nhóm mình 4 người đều 25 tuổi"])).toBe(false);
    expect(hasYoungChildSignal(["Con mình 11 tuổi rồi, thích leo núi"])).toBe(false);
    expect(hasYoungChildSignal(["Đoàn toàn người lớn, không có trẻ em"])).toBe(false);
    expect(hasYoungChildSignal(["Không có con nhỏ, không có bé đi cùng"])).toBe(false);
    expect(hasYoungChildSignal(["Trẻ trên 10 tuổi có đi được không?"])).toBe(false);
  });

  it("detects relax/early-return signals with/without diacritics and does not misfire on 'không vội cũng được' or negations", () => {
    expect(hasRelaxReasonSignal("Về gần 23h thì muộn quá với bé. Cho nhà mình thêm 1 ngày để đi thư thả hơn nhé.")).toBe(true);
    expect(hasRelaxReasonSignal("them 1 ngay de di thu tha hon")).toBe(true);
    expect(hasRelaxReasonSignal("Đi thong thả hơn chút nhé")).toBe(true);
    expect(hasRelaxReasonSignal("di thong tha hon")).toBe(true);
    expect(hasRelaxReasonSignal("Thêm ngày cho đỡ mệt")).toBe(true);
    expect(hasRelaxReasonSignal("them ngay cho do met")).toBe(true);
    expect(hasRelaxReasonSignal("đi nhẹ nhàng thôi")).toBe(true);
    expect(hasRelaxReasonSignal("di nhe nhang thoi")).toBe(true);
    expect(hasRelaxReasonSignal("cho về sớm hơn chút")).toBe(true);
    expect(hasRelaxReasonSignal("ve som hon")).toBe(true);
    expect(hasRelaxReasonSignal("về 22h muộn quá")).toBe(true);
    expect(hasRelaxReasonSignal("ve 22h muon qua")).toBe(true);

    // Must NOT trigger on casual "không vội cũng được" or explicit negations
    expect(hasRelaxReasonSignal("Thêm 1 ngày, không vội cũng được")).toBe(false);
    expect(hasRelaxReasonSignal("khong voi cung duoc")).toBe(false);
    expect(hasRelaxReasonSignal("Thêm 1 ngày")).toBe(false);
    expect(hasRelaxReasonSignal("Thêm 1 ngày để đi thêm Mèo Vạc")).toBe(false);
    expect(hasRelaxReasonSignal("Không cần về sớm, muộn cũng được")).toBe(false);
    expect(hasRelaxReasonSignal("Không cần thư thả đâu, xếp nhiều điểm vào")).toBe(false);
    expect(hasGentlePaceWording(["Thêm 1 ngày, không vội cũng được"])).toBe(false);
  });

  it("combines S14 and S6 flags cleanly without misfiring for regular travelers", () => {
    const regularAddDay = detectRelaxAndFamilySignals({
      latestUserText: "Thêm 1 ngày, không vội cũng được",
      userTexts: ["Nhóm 4 bạn bè đi Hà Giang 3 ngày từ Hà Nội", "Thêm 1 ngày, không vội cũng được"],
      recordedPace: undefined,
      effectivePace: "PACKED",
      durationIncreased: true,
    });
    expect(regularAddDay.gentleFamily).toBe(false);
    expect(regularAddDay.relaxAddDayMode).toBe(false);

    const familyAddDay = detectRelaxAndFamilySignals({
      latestUserText: "Thêm 1 ngày nhé",
      userTexts: ["Nhà mình 2 vợ chồng với 1 bé 7 tuổi từ Cầu Giấy", "Thêm 1 ngày nhé"],
      recordedPace: undefined,
      effectivePace: "PACKED",
      durationIncreased: true,
    });
    expect(familyAddDay.hasYoungChild).toBe(true);
    expect(familyAddDay.gentleFamily).toBe(true);
    expect(familyAddDay.relaxAddDayMode).toBe(true);

    const relaxedAddDay = detectRelaxAndFamilySignals({
      latestUserText: "Thêm 1 ngày",
      userTexts: ["Đi 3 ngày từ Hà Nội", "Thêm 1 ngày"],
      recordedPace: "RELAXED",
      effectivePace: "RELAXED",
      durationIncreased: true,
    });
    expect(relaxedAddDay.gentleFamily).toBe(true);
    expect(relaxedAddDay.relaxAddDayMode).toBe(true);
  });
});

describe("S14 — adding a day to relax keeps stop count, returns earlier, and pulls last night near TP Hà Giang", () => {
  const familyTurn1Text =
    "Nhà mình 2 vợ chồng với 1 bé 7 tuổi, tự lái ô tô từ Hà Nội (nhà ở Cầu Giấy), muốn đi Hà Giang 3 ngày 2 đêm từ 11/12. Bé còn nhỏ nên đi nhẹ nhàng, ít leo trèo.";
  const familyTurn2Text =
    "Về gần 23h thì muộn quá với bé. Cho nhà mình thêm 1 ngày để đi thư thả hơn nhé.";

  it("does not fill new stops on 3→4 day family relax request, pulls penultimate night closer to TP Hà Giang, and returns earlier", async () => {
    const sixStops = [QUAN_BA, NUI_DOI, YEN_MINH, SUNG_LA, VUONG, DONG_VAN];
    const emitted3Day: PlannerResult[] = [];
    const tools3Day = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted3Day.push(r),
      journey: CAU_GIAY_JOURNEY,
      tripInfo: {
        transport: "CAR",
        durationDays: 3,
        startDate: "2026-12-11",
        travelers: 3,
        pace: "RELAXED",
      },
      latestUserText: familyTurn1Text,
    });

    const res3 = await tools3Day.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id, NUI_DOI.id], [YEN_MINH.id, SUNG_LA.id], [VUONG.id, DONG_VAN.id]] } },
      { toolCallId: "t-s14-3d", messages: [], context: {} },
    ) as { ok: boolean };
    expect(res3.ok).toBe(true);
    const plan3 = emitted3Day.at(-1)!;
    const returnEnd3 = plan3.journeyPlan?.legs.find(leg => leg.kind === "RETURN")?.endMinute ?? null;
    expect(returnEnd3).not.toBeNull();

    // Build currentItinerary snapshot from Turn 1 (exact 6 stops)
    const currentItinerary = {
      days: [
        { day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 870, departureMinute: 930 }] },
        { day: 2, stops: [{ id: NUI_DOI.id, name: NUI_DOI.name, arrivalMinute: 480, departureMinute: 525 }, { id: YEN_MINH.id, name: YEN_MINH.name, arrivalMinute: 620, departureMinute: 665 }, { id: SUNG_LA.id, name: SUNG_LA.name, arrivalMinute: 780, departureMinute: 840 }] },
        { day: 3, stops: [{ id: VUONG.id, name: VUONG.name, arrivalMinute: 480, departureMinute: 570 }, { id: DONG_VAN.id, name: DONG_VAN.name, arrivalMinute: 615, departureMinute: 705 }] },
      ],
    };

    // Turn 2: increase to 4 days — even if the model tries to sneak extra stops (LUNG_CU, MA_PI_LENG) into selection,
    // S14 strips unrequested extras and sets fill = false.
    const emitted4Day: PlannerResult[] = [];
    const tools4Day = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted4Day.push(r),
      journey: CAU_GIAY_JOURNEY,
      currentItinerary,
      tripInfo: {
        transport: "CAR",
        durationDays: 4,
        startDate: "2026-12-11",
        travelers: 3,
        pace: "RELAXED",
      },
      userHistoryTexts: [familyTurn1Text],
      latestUserText: familyTurn2Text,
    });

    const res4 = await tools4Day.proposeItinerary.execute!(
      {
        selection: {
          days: [
            [QUAN_BA.id],
            [NUI_DOI.id, YEN_MINH.id],
            [SUNG_LA.id, VUONG.id, DONG_VAN.id],
            [LUNG_CU.id, MA_PI_LENG.id],
          ],
        },
      },
      { toolCallId: "t-s14-4d", messages: [], context: {} },
    ) as { ok: boolean; relaxSpreadApplied?: boolean; note?: string };

    expect(res4.ok).toBe(true);
    expect(res4.relaxSpreadApplied).toBe(true);
    expect(res4.note).toContain("đã giãn lịch, giữ số điểm, về sớm hơn");
    expect(res4.note).toContain("KHÔNG gợi ý thêm điểm");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("đã giãn lịch, giữ số điểm, về sớm hơn");

    const plan4 = emitted4Day.at(-1)!;
    const ids4 = plan4.days.flatMap(d => d.stops.map(s => s.destination.id));
    expect(ids4).toHaveLength(sixStops.length);
    expect(new Set(ids4)).toEqual(new Set(sixStops.map(s => s.id)));
    expect(ids4).not.toContain(LUNG_CU.id);
    expect(ids4).not.toContain(MA_PI_LENG.id);

    // Final return on 4-day relaxed plan is strictly earlier than 3-day plan
    const returnEnd4 = plan4.journeyPlan?.legs.find(leg => leg.kind === "RETURN")?.endMinute ?? null;
    expect(returnEnd4).not.toBeNull();
    expect(returnEnd4!).toBeLessThan(returnEnd3!);

    // Penultimate night (Day 3) sits closer to TP Hà Giang than Đồng Văn (~63.6 km straight-line)
    const day3LastStop = plan4.days[2]?.stops.at(-1)?.destination;
    expect(day3LastStop).toBeDefined();
    const day3ToHgKm = haversine(day3LastStop!, HA_GIANG_CITY_CENTER);
    const dongVanToHgKm = haversine(DONG_VAN, HA_GIANG_CITY_CENTER);
    expect(day3ToHgKm).toBeLessThan(dongVanToHgKm);
  });

  it("in relax mode, still restores a previously dropped mustIncludeDestinationIds stop without filling other stops", async () => {
    const currentItinerary = {
      days: [
        { day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 870, departureMinute: 930 }] },
        { day: 2, stops: [{ id: YEN_MINH.id, name: YEN_MINH.name, arrivalMinute: 480, departureMinute: 525 }, { id: SUNG_LA.id, name: SUNG_LA.name, arrivalMinute: 660, departureMinute: 720 }] },
        { day: 3, stops: [{ id: DONG_VAN.id, name: DONG_VAN.name, arrivalMinute: 480, departureMinute: 570 }] },
      ],
    };
    const emitted: PlannerResult[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted.push(r),
      journey: CAU_GIAY_JOURNEY,
      currentItinerary,
      tripInfo: {
        transport: "CAR",
        durationDays: 4,
        startDate: "2026-12-11",
        travelers: 3,
        pace: "RELAXED",
        mustIncludeDestinationIds: [VUONG.id],
      },
      userHistoryTexts: [familyTurn1Text],
      latestUserText: familyTurn2Text,
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [YEN_MINH.id], [SUNG_LA.id], [DONG_VAN.id]] } },
      { toolCallId: "t-s14-req", messages: [], context: {} },
    ) as { ok: boolean; relaxSpreadApplied?: boolean };

    expect(res.ok).toBe(true);
    expect(res.relaxSpreadApplied).toBe(true);
    const ids = emitted.at(-1)!.days.flatMap(d => d.stops.map(s => s.destination.id));
    // 4 shown stops + 1 restored required stop = 5 (no other filler stops added)
    expect(ids).toHaveLength(5);
    expect(ids).toContain(VUONG.id);
  });

  it("non-regression: regular traveler without child/relax signals still gets fill = true on 'Thêm 1 ngày'", async () => {
    const currentItinerary = {
      days: [
        { day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 870, departureMinute: 930 }] },
        { day: 2, stops: [{ id: YEN_MINH.id, name: YEN_MINH.name, arrivalMinute: 480, departureMinute: 525 }] },
        { day: 3, stops: [{ id: DONG_VAN.id, name: DONG_VAN.name, arrivalMinute: 480, departureMinute: 570 }] },
      ],
    };
    const emitted: PlannerResult[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted.push(r),
      journey: CAU_GIAY_JOURNEY,
      currentItinerary,
      tripInfo: {
        transport: "CAR",
        durationDays: 4,
        startDate: "2026-12-11",
        travelers: 4,
      },
      userHistoryTexts: ["Nhóm 4 bạn bè tự lái từ Hà Nội đi Hà Giang 3 ngày"],
      latestUserText: "Thêm 1 ngày, không vội cũng được",
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [YEN_MINH.id], [DONG_VAN.id], []] } },
      { toolCallId: "t-regular-add", messages: [], context: {} },
    ) as { ok: boolean; relaxSpreadApplied?: boolean };

    expect(res.ok).toBe(true);
    expect(res.relaxSpreadApplied).toBeUndefined();
    const ids = emitted.at(-1)!.days.flatMap(d => d.stops.map(s => s.destination.id));
    expect(ids.length).toBeGreaterThan(3);
  });
});

describe("S6 — gentle/family trip prefers Day 1 overnight in TP Hà Giang, penalizes off-loop Bắc Mê, and preserves ADR-53", () => {
  it("keeps Night 1 in TP Hà Giang (not Bắc Mê) for a family with young child departing from Cầu Giấy, Hà Nội", async () => {
    const requirement = tripRequirementInputSchema.parse({
      startDate: "2026-12-11",
      durationDays: 3,
      transport: "CAR",
      pace: "RELAXED",
      interests: ["NATURE"],
      journey: CAU_GIAY_JOURNEY,
    });

    // Even when Bắc Mê is present in the initial days and pool, gentleFamily steers Day 1 overnight to TP Hà Giang
    // (either OUTBOUND_ONLY or ending in TP Hà Giang) and avoids overnighting in Bắc Mê.
    const arranged = await arrangeTripRoute({
      requirement,
      days: [[BAC_ME], [QUAN_BA, YEN_MINH], [SUNG_LA, DONG_VAN]],
      pool: FULL_POOL,
      fill: true,
      journeyPreferences: { gentleFamily: true },
      coordinateRoute: REALISTIC_ROUTES.coordinateRoute,
    });

    const day1Last = arranged.days[0]?.at(-1);
    const day1Area = day1Last ? resolveOvernightAnchorTown(day1Last)?.area : "TP Hà Giang";
    expect(day1Area).toBe("TP Hà Giang");
    expect(day1Area).not.toBe("Bắc Mê");

    // No non-final day should end overnight in Bắc Mê
    for (let i = 0; i < arranged.days.length - 1; i++) {
      const last = arranged.days[i]?.at(-1);
      if (!last) continue;
      expect(resolveOvernightAnchorTown(last)?.area).not.toBe("Bắc Mê");
    }
  });

  it("via proposeItinerary: family departing Cầu Giấy gets Night 1 in TP Hà Giang and never auto-fills Bắc Mê", async () => {
    const emitted: PlannerResult[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted.push(r),
      journey: CAU_GIAY_JOURNEY,
      tripInfo: {
        transport: "CAR",
        durationDays: 3,
        startDate: "2026-12-11",
        travelers: 3,
      },
      latestUserText: "Nhà mình 2 vợ chồng với 1 bé 7 tuổi, tự lái ô tô từ Cầu Giấy Hà Nội, đi 3 ngày nhẹ nhàng",
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [YEN_MINH.id, SUNG_LA.id], [DONG_VAN.id]] } },
      { toolCallId: "t-s6-chat", messages: [], context: {} },
    ) as { ok: boolean };

    expect(res.ok).toBe(true);
    const plan = emitted.at(-1)!;
    const day1 = plan.days[0]!;
    const day1Area = day1.stops.length === 0
      ? (day1.journeyDayKind === "OUTBOUND_ONLY" ? "TP Hà Giang" : null)
      : resolveOvernightAnchorTown(day1.stops.at(-1)!.destination)?.area;
    expect(day1Area).toBe("TP Hà Giang");

    const allIds = plan.days.flatMap(d => d.stops.map(s => s.destination.id));
    expect(allIds).not.toContain(BAC_ME.id);
  });

  it("ADR-53 preservation: explicit 'tối ngày 1 nghỉ ở Đồng Văn' still overrides S6 Day 1 TP Hà Giang preference", async () => {
    const emitted: PlannerResult[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => FULL_POOL, routes: REALISTIC_ROUTES, now: () => new Date("2026-11-26T08:00:00Z") },
      emitItinerary: r => emitted.push(r),
      journey: CAU_GIAY_JOURNEY,
      tripInfo: {
        transport: "CAR",
        durationDays: 3,
        startDate: "2026-12-11",
        travelers: 3,
        pace: "RELAXED",
        overnightAreas: [{ afterDay: 1, area: "Đồng Văn" }],
      },
      latestUserText: "Nhà mình có 1 bé 7 tuổi, tự lái từ Hà Nội 3 ngày, tối ngày 1 nghỉ ở Đồng Văn nhé",
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[DONG_VAN.id], [VUONG.id, SUNG_LA.id], [QUAN_BA.id]] } },
      { toolCallId: "t-s6-adr53", messages: [], context: {} },
    ) as { ok: boolean };

    expect(res.ok).toBe(true);
    const plan = emitted.at(-1)!;
    const day1Last = plan.days[0]?.stops.at(-1)?.destination;
    expect(day1Last?.id).toBe(DONG_VAN.id);
    expect(resolveOvernightAnchorTown(day1Last!)?.area).toBe("Đồng Văn");
  });
});

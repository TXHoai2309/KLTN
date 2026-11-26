import { describe, expect, it } from "vitest";
import { computeBudgetSavingsChips, estimateTripCost } from "./tripsage-cost";
import { reconcileQuickRepliesWithQuestion, resolveFallbackQuickReplies, TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { isItineraryActionChipWithoutPlan, isOutOfScopeDestinationChip } from "./tripsage-chat-context";

describe("Point 3 — question-chip alignment & sensible budget savings chips", () => {
  it("L2: replaces mismatched violation chips when closing question asks how to reach the trip hub", () => {
    const text =
      "Chạy xe máy từ Hải Phòng, đi vòng Hà Giang rồi quay về trong 3 ngày 2 đêm sẽ quá gấp và không kịp về đúng hạn. Mình khuyên ra điểm tập kết trước, rồi thuê xe máy để khám phá Hà Giang; 3 ngày sẽ tính từ đó.\n\nBạn muốn ra điểm tập kết bằng cách nào?";
    const reconciled = reconcileQuickRepliesWithQuestion({
      text,
      emittedReplies: ["Giảm còn 3 điểm/ngày", "Đổi nhịp vừa phải", "Giữ bản nháp này"],
      hasOriginCandidates: false,
      itinerary: null,
      cost: null,
      accessLeg: null,
      tripInfo: { homeCity: "Hải Phòng", durationDays: 3, transport: "MOTORCYCLE" },
    });
    expect(reconciled).toBeTruthy();
    expect(reconciled).not.toContain("Giảm còn 3 điểm/ngày");
    expect(reconciled!.some(c => /xe khách/i.test(c))).toBe(true);
    expect(reconciled!.some(c => /tàu|máy bay|hà nội/i.test(c))).toBe(true);
  });

  it("L2 fallback: resolves transport chips when no suggestReplies was called on a hub-transport question", () => {
    const fallback = resolveFallbackQuickReplies({
      text: "Chặng từ Hải Phòng khá dài.\n\nBạn muốn ra điểm tập kết bằng cách nào?",
      hasEmittedQuickReplies: false,
      hasOriginCandidates: false,
      itinerary: null,
      cost: null,
      accessLeg: null,
      tripInfo: { homeCity: "Hải Phòng", durationDays: 3, transport: "MOTORCYCLE" },
    });
    expect(fallback).toBeTruthy();
    expect(fallback!.some(c => /xe khách/i.test(c))).toBe(true);
    expect(fallback!.some(c => /Giảm còn 3 điểm/i.test(c))).toBe(false);
  });

  it("keeps model chips intact when they already match the closing question", () => {
    const kept = reconcileQuickRepliesWithQuestion({
      text: "Lịch 2 ngày chỉ có 1 đêm.\n\nBạn muốn ưu tiên phương án nào?",
      emittedReplies: ["2 ngày, ngủ Đồng Văn đêm 1", "Giữ 2 ngày, bỏ ngủ Đồng Văn", "Thêm 1 ngày cho thong thả"],
      hasOriginCandidates: false,
      itinerary: null,
      cost: null,
      accessLeg: null,
      tripInfo: { durationDays: 2, transport: "CAR" },
    });
    expect(kept).toBeNull();
  });

  it("L7: never offers 'Bớt 1 ngày (còn 1 ngày)' when trip duration is <= 2 days", () => {
    const twoDayCar = estimateTripCost({
      transport: "CAR",
      travelers: 2,
      days: 2,
      distanceKm: 340,
      budgetCap: 6_000_000,
      lines: [
        { category: "transport", label: "Ô tô có tài xế tại Hà Giang", amount: 4_400_000, basis: "2 ngày × 2,2 triệu/ngày" },
        { category: "lodging", label: "Chỗ nghỉ 1 đêm", amount: 700_000 },
        { category: "food", label: "Ăn uống", amount: 800_000 },
        { category: "activities", label: "Thuyền Sông Nho Quế và vé tham quan", amount: 500_000 },
      ],
    });
    expect(twoDayCar.withinCap).toBe(false);

    const chips = computeBudgetSavingsChips(twoDayCar, null, "CAR");
    expect(chips.some(c => c.id === "shorten-day")).toBe(false);
    expect(chips.some(c => /còn 1 ngày|bớt 1 ngày/i.test(c.label))).toBe(false);
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(chips.some(c => c.id === "switch-motorbike")).toBe(true);

    // Fallback quick replies also must NOT offer "Bớt 1 ngày" on a 2-day over-budget trip
    const fallback = resolveFallbackQuickReplies({
      text: "Bảng chi phí hiện vượt ngân sách.\n\nBạn muốn giảm chi phí theo hướng nào?",
      hasEmittedQuickReplies: false,
      hasOriginCandidates: false,
      itinerary: null,
      cost: twoDayCar,
      accessLeg: null,
      tripInfo: { durationDays: 2, transport: "CAR" },
    });
    expect(fallback).toBeTruthy();
    expect(fallback!.some(c => /Bớt 1 ngày/i.test(c))).toBe(false);
  });

  it("computes vehicle-dependent shorten-day savings (car with driver > motorbike) for >= 3-day trips", () => {
    const commonLines = [
      { category: "lodging" as const, label: "Chỗ nghỉ 2 đêm", amount: 1_000_000 },
      { category: "food" as const, label: "Ăn uống", amount: 1_200_000 },
    ];
    const car3Days = estimateTripCost({
      transport: "CAR",
      travelers: 2,
      days: 3,
      distanceKm: 350,
      budgetCap: 6_000_000,
      lines: [
        ...commonLines,
        { category: "transport", label: "Ô tô có tài xế tại Hà Giang", amount: 6_600_000 },
      ],
    });
    const moto3Days = estimateTripCost({
      transport: "MOTORCYCLE",
      travelers: 2,
      days: 3,
      distanceKm: 350,
      budgetCap: 2_000_000,
      lines: [
        ...commonLines,
        { category: "transport", label: "Thuê xe máy", amount: 600_000 },
      ],
    });

    const carShorten = computeBudgetSavingsChips(car3Days, null, "CAR").find(c => c.id === "shorten-day");
    const motoShorten = computeBudgetSavingsChips(moto3Days, null, "MOTORCYCLE").find(c => c.id === "shorten-day");
    expect(carShorten).toBeTruthy();
    expect(motoShorten).toBeTruthy();
    expect(carShorten!.estimatedSavingsVnd).toBeGreaterThan(motoShorten!.estimatedSavingsVnd + 1_500_000);
  });

  it("D7 (B11, B12, B13): rejects itinerary-action chips before any plan exists, blocks out-of-scope destination chips (Sa Pa), and guides consistent list formatting", async () => {
    // Unit predicates
    expect(isItineraryActionChipWithoutPlan("Bỏ Cột cờ khỏi lịch")).toBe(true);
    expect(isItineraryActionChipWithoutPlan("Giữ Cột cờ, không leo lên đỉnh")).toBe(true);
    expect(isItineraryActionChipWithoutPlan("Giữ 2 ngày, bỏ ngủ Đồng Văn")).toBe(false);
    expect(isItineraryActionChipWithoutPlan("Giữ xe khách, chốt giá sau")).toBe(false);
    expect(isItineraryActionChipWithoutPlan("Lên lịch có Lũng Cú")).toBe(false);

    expect(isOutOfScopeDestinationChip("Ưu tiên nhẹ nhàng ở Sa Pa")).toBe(true);
    expect(isOutOfScopeDestinationChip("Khám phá Mộc Châu 2 ngày")).toBe(true);
    expect(isOutOfScopeDestinationChip("Lên lịch Hà Giang nhẹ nhàng")).toBe(false);
    expect(isOutOfScopeDestinationChip("Từ Lào Cai đi Hà Giang")).toBe(false);
    expect(isOutOfScopeDestinationChip("Đi Đà Lạt cho nhẹ")).toBe(true);
    expect(isOutOfScopeDestinationChip("Ghé hồ Ba Bể")).toBe(true);
    expect(isOutOfScopeDestinationChip("Săn mây Y Tý")).toBe(true);

    // Tool-level guard in suggestReplies when no itinerary exists
    const tools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: { route: async () => ({ status: "INSUFFICIENT_DATA" }) as never } },
      emitItinerary: () => {},
      latestUserText: "Cột cờ Lũng Cú có bao nhiêu bậc thang?",
    });

    const b11 = await tools.suggestReplies.execute!(
      { replies: ["Giữ Cột cờ, không leo lên đỉnh", "Bỏ Cột cờ khỏi lịch"] },
      { toolCallId: "t-b11", messages: [], context: {} },
    ) as { ok: boolean; code?: string };
    expect(b11.ok).toBe(false);
    expect(b11.code).toBe("NO_ITINERARY_FOR_ACTION_CHIPS");

    const b12 = await tools.suggestReplies.execute!(
      { replies: ["Ưu tiên nhẹ nhàng ở Sa Pa", "Hỏi về chợ phiên Hà Giang"] },
      { toolCallId: "t-b12", messages: [], context: {} },
    ) as { ok: boolean; code?: string };
    expect(b12.ok).toBe(false);
    expect(b12.code).toBe("OUT_OF_SCOPE_DESTINATION_CHIP");

    const validDiscovery = await tools.suggestReplies.execute!(
      { replies: ["Gợi ý điểm ngắm cảnh nhẹ hơn", "Lên lịch Hà Giang nhẹ nhàng"] },
      { toolCallId: "t-ok", messages: [], context: {} },
    ) as { ok: boolean };
    expect(validDiscovery.ok).toBe(true);

    // Post-turn reconcile safety net replaces B11 & B12 chips cleanly
    const reconciled = reconcileQuickRepliesWithQuestion({
      text: "Sa Pa có cáp treo còn Hà Giang hợp đi cung đường núi.\n\nBạn muốn khám phá thêm phần nào?",
      emittedReplies: ["Ưu tiên nhẹ nhàng ở Sa Pa", "Bỏ Cột cờ khỏi lịch", "Xem chợ phiên Hà Giang"],
      hasOriginCandidates: false,
      itinerary: null,
      cost: null,
      accessLeg: null,
      tripInfo: null,
    });
    expect(reconciled).toEqual([
      "Lên lịch Hà Giang nhẹ nhàng",
      "Gợi ý điểm ngắm cảnh nhẹ hơn",
      "Xem chợ phiên Hà Giang",
    ]);

    // B13 prompt guidance for consistent bullet formatting
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("định dạng đồng nhất cho mọi mục tương đương");
  });
});

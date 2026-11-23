import { describe, expect, it } from "vitest";
import { computeBudgetSavingsChips, estimateTripCost } from "./tripsage-cost";
import { reconcileQuickRepliesWithQuestion, resolveFallbackQuickReplies } from "./tripsage-chat-service";

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
});

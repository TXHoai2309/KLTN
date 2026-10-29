import { describe, expect, it, vi } from "vitest";
import { EMPTY_PLANNING_NEEDS } from "../assistant-planning/planning-contract";
import { acceptsPlanningV2Reply, fallbackPlanningV2Reply, planningResponsePlan, safePlanningV2Reply, type PlanningResponsePlan } from "./planning-response";
import { loadAssistantSkill } from "./skill-registry";

describe("V2 response-plan wording boundary", () => {
  it("does not let wording deny the itinerary already supplied in a proposal card", async () => {
    const plan = planningResponsePlan({ ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 2, transport: "CAR" } }, "PRESENT_PROPOSAL");
    plan.validation = { status: "PROPOSAL_READY", checks: [], eligibleForFinalConfirmation: true };
    const misleading = "Đề xuất sơ bộ đã sẵn sàng. Dữ liệu hiện có chưa gồm lịch trình và các điểm dừng cụ thể để mình trình bày.";
    expect(acceptsPlanningV2Reply(misleading, plan)).toBe(false);
    expect(await safePlanningV2Reply(plan, loadAssistantSkill("travel-planning"), async () => misleading)).toBe(fallbackPlanningV2Reply(plan));
  });
  it("derives a single material goal and compact-trip implication without a canonical sentence", () => {
    const plan = planningResponsePlan({ ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 2 } });
    expect(plan.goal).toBe("ASK_TRANSPORT");
    expect(plan.planningImplications).toContain("COMPACT_TRIP");
    expect(plan).not.toHaveProperty("canonical");
    expect(acceptsPlanningV2Reply(fallbackPlanningV2Reply(plan), plan)).toBe(true);
    expect(acceptsPlanningV2Reply("Bạn khởi hành ngày nào?", plan)).toBe(false);
    expect(acceptsPlanningV2Reply("Bạn đi ô tô? Bạn thích gì?", plan)).toBe(false);
  });

  it("falls back for invented factual/saved claims without changing the response goal or known facts", async () => {
    const plan = planningResponsePlan(EMPTY_PLANNING_NEEDS);
    const before = structuredClone(plan);
    for (const message of ["Chuyến đi đã được lưu thành công.", "Điểm này mở cửa lúc 08:00.", "Bạn muốn đi 5 ngày?"]) {
      expect(await safePlanningV2Reply(plan, loadAssistantSkill("travel-planning"), async () => message)).toBe(fallbackPlanningV2Reply(plan));
    }
    const mutatingComposer = vi.fn(async (value: PlanningResponsePlan) => { value.goal = "PRESENT_PROPOSAL"; return "Chuyến đi đã được lưu."; });
    await safePlanningV2Reply(plan, loadAssistantSkill("travel-planning"), mutatingComposer);
    expect(plan).toEqual(before);
  });

  it("preserves insufficient-data semantics even when positive claims avoid the phrase all checks pass", () => {
    const plan = planningResponsePlan({ ...EMPTY_PLANNING_NEEDS, requirement: { durationDays: 2, transport: "CAR" } }, "PRESENT_PROPOSAL");
    plan.validation = { status: "INSUFFICIENT_DATA", checks: [{ key: "OPENING_HOURS", status: "INSUFFICIENT_DATA" }], eligibleForFinalConfirmation: false };
    expect(acceptsPlanningV2Reply("Đề xuất sơ bộ chưa đủ dữ liệu nhưng các kiểm tra hiện tại đáp ứng, lịch hợp lý.", plan)).toBe(false);
    expect(acceptsPlanningV2Reply(fallbackPlanningV2Reply(plan), plan)).toBe(true);
  });
});

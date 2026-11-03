import { describe, expect, it, vi } from "vitest";
import { acceptPlanningReply, safePlanningReply, type PlanningReplyInput } from "./planning-reply";
import { fixtureNeeds } from "../../test/planning-fixtures";
import { needsRecap } from "./planning-dialogue";
const input: PlanningReplyInput = { kind: "NEED", field: "startDate", canonical: "Bạn dự định khởi hành ngày nào?", needs: fixtureNeeds, latestText: "Xe máy" };

describe("Language composition cannot decide or invent workflow outcomes", () => {
  it("allows grounded proposal prose without forcing the stock opening sentence", () => {
    const proposal = { ...input, kind: "PROPOSAL" as const, eligibleForSave: true,
      canonical: "Mình đã lên lịch bên dưới và các bước kiểm tra đều đáp ứng. Bạn muốn chỉnh gì thêm hay lưu vào Chuyến đi của tôi?" };
    expect(acceptPlanningReply("Lịch trình đã xếp xong để bạn xem bên dưới nhé. Bản này chưa lưu; bạn có thể chỉnh thêm hoặc xác nhận lưu chuyến đi.", proposal)).toBe(true);
    expect(acceptPlanningReply("Lịch hiện chưa được lưu; bạn muốn lưu vào Chuyến đi của tôi không?", proposal)).toBe(true);
    expect(acceptPlanningReply("Đã lưu chuyến đi thành công.", proposal)).toBe(false);
  });
  it("rejects a fluent but false pass for a preliminary proposal", () => {
    const preliminary = { ...input, kind: "PROPOSAL" as const, eligibleForSave: false,
      canonical: "Đây là hành trình sơ bộ, chưa thể lưu." };
    expect(acceptPlanningReply("Đây là lịch sơ bộ, chưa thể lưu; mình cần kiểm tra thêm.", preliminary)).toBe(true);
    expect(acceptPlanningReply("Lịch trình chưa lưu nhưng tất cả kiểm tra đều đáp ứng.", preliminary)).toBe(false);
  });
  it("accepts a natural acknowledgement followed by the one missing question", () => {
    expect(acceptPlanningReply("Đi xe máy nhé, mình ghi nhận rồi. Bạn tính khởi hành ngày nào?", input)).toBe(true);
  });
  it("allows a natural current-topic question without forcing a literal template", () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["NATURE" as const] } };
    const guided = { ...input, field: "preferences", needs, canonical: "Nhịp đi: bạn muốn thư thả, vừa phải hay trải nghiệm nhiều nhất có thể?" };
    expect(acceptPlanningReply("Bạn thích một chuyến đi thư thả hay nhịp đi vừa phải hơn?", guided)).toBe(true);
    expect(acceptPlanningReply("Bạn đi cùng ai?", guided)).toBe(false);
  });
  it.each(["Mình đã lưu chuyến đi. Bạn khởi hành ngày nào?", "Mình chọn 31/10/2026 nhé?", "Đi cùng gia đình nhé, bạn đi ngày nào?", "Mọi kiểm tra đều đáp ứng. Bạn đi ngày nào?", "Bạn đi ngày nào? Bao nhiêu người?", "Mình đã tạo hành trình. Bạn đi ngày nào?"])("rejects unsafe prose: %s", message => {
    expect(acceptPlanningReply(message, input)).toBe(false);
  });
  it("keeps every recap fact and the complete normalized year", () => {
    const recap = { ...input, kind: "RECAP" as const, canonical: needsRecap(fixtureNeeds) };
    expect(acceptPlanningReply(recap.canonical, recap)).toBe(true);
    expect(acceptPlanningReply(recap.canonical.replace("02/11/2026", "02/11"), recap)).toBe(false);
  });
  it("returns a truthful fallback after a composition failure without propagating uncertainty", async () => {
    const compose = vi.fn().mockRejectedValue(new Error("provider timeout"));
    expect(await safePlanningReply(compose, input)).toBe(input.canonical);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(await safePlanningReply(async () => "Đã lưu thành công", input)).toBe(input.canonical);
  });
});

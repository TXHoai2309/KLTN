import { describe, expect, it } from "vitest";
import { parsePlanMessage } from "./assistant-plan-message";

describe("parsePlanMessage", () => {
  it("splits the itinerary summary into intro, days and notes", () => {
    const parsed = parsePlanMessage("Lịch trình 3 ngày bằng xe máy, chia các điểm tham quan theo đúng thời lượng bạn có: ngày 1: [TEST] Cổng trời Quản Bạ & Núi Đôi → [TEST] Dinh họ Vương (Nhà Vương); ngày 2: [TEST] Cột cờ Lũng Cú → [TEST] Phố cổ Đồng Văn; ngày 3: [TEST] Đèo Mã Pí Lèng → [TEST] Hẻm Tu Sản & Sông Nho Quế. Lịch này chưa lưu, và vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại.");
    expect(parsed?.intro).toBe("Lịch trình 3 ngày bằng xe máy, chia các điểm tham quan theo đúng thời lượng bạn có");
    expect(parsed?.days.map(day => day.stops.length)).toEqual([2, 2, 2]);
    expect(parsed?.days[2].stops[1]).toBe("[TEST] Hẻm Tu Sản & Sông Nho Quế");
    expect(parsed?.notes).toEqual(["Lịch này chưa lưu, và vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại."]);
  });
  it("leaves messages without a day list alone", () => {
    expect(parsePlanMessage("Bạn muốn đi mấy ngày?")).toBeNull();
  });
});

import type { EditorialContext } from "../editorial-contract";
import { bacMeContext } from "./bac-me-v4";

/** Synthetic regression data, NOT verified history or citations for publication. */
export const khauVaiContext: EditorialContext = {
  ...bacMeContext, id: "fixture-khau-vai", name: "Chợ tình Khâu Vai", category: "văn hóa",
  description: "Fixture Chợ tình Khâu Vai giới thiệu một không gian gặp gỡ và giao lưu văn hóa.\n\nTruyền thuyết được kể lại\nTrong lời kể của fixture, một câu chuyện tình được lưu truyền như truyền thuyết. Đây là lời kể dân gian, không phải sự kiện lịch sử đã được xác minh.\n\nTập quán gặp gỡ\nNội dung fixture mô tả sinh hoạt giao lưu, trò chuyện và những tập quán của cộng đồng.\n\nNgày hội trong hồ sơ mẫu\nHồ sơ thử nghiệm ghi ngày hội là 27 tháng 3 âm lịch; thời gian tổ chức từng năm cần được kiểm tra với đơn vị quản lý.\n\nTrải nghiệm văn hóa\nDu khách trong kịch bản thử nghiệm tìm hiểu lời kể và phong tục với sự tôn trọng cộng đồng.",
  media: bacMeContext.media.map((m, i) => ({ ...m, id: `khau-vai-photo-${i}`, alt: "Ảnh minh họa fixture Khâu Vai" })),
  sources: ["legend", "custom", "festival"].map(id => ({ id: `fixture-${id}`, title: `Nguồn tổng hợp fixture ${id}; không phải bằng chứng cho sự kiện`, url: `https://example.test/${id}`, websiteRights: "APPROVED" })),
};

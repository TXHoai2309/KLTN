import { editorialFixture } from "./editorial-fixture";
import { autoLayout } from "../editorial-engine";
import type { EditorialContext, EditorialLayout, EditorialLayoutV1 } from "../editorial-contract";

// Synthetic acceptance prose, never inserted into a datasource or asserted as travel facts.
export function editorialQualityFixture(name: string, category: string, count: number) {
  const context = editorialFixture(category, count);
  context.name = name;
  context.description = `${name} trong khung hình mở đầu. Đây là văn bản kiểm thử tổng hợp, không phải thông tin du lịch đã xác minh.\n\nĐường nét trong cảnh quan\nNhững đường nét trong ảnh tạo nên nhịp nhìn cho phần giới thiệu. Nội dung này chỉ phục vụ kiểm tra khả năng đọc của một bài viết có nguồn.\n\nMột góc nhìn khác\nĐoạn văn thứ hai giữ nội dung riêng, với độ dài vừa đủ để so sánh tỷ lệ giữa hình ảnh và phần thuyết minh trên màn hình nhỏ.\n\nNhịp sống trong từng khung hình\nPhần cuối nối tiếp câu chuyện bằng những hình ảnh trong thư viện. Đây là dữ liệu tổng hợp dành riêng cho kiểm thử bố cục.`;
  return context;
}
export const qualityCases = [
  ["dong-van", "Cao nguyên đá Đồng Văn", "thiên nhiên – thắng cảnh", 3],
  ["nho-que", "Nho Quế", "thiên nhiên – thắng cảnh", 5],
  ["bac-me", "Căng Bắc Mê", "di tích lịch sử", 2],
  ["lo-lo-chai", "Lô Lô Chải", "làng du lịch – bản làng", 8],
  ["no-photo", "Một điểm đến chưa có ảnh", "thiên nhiên – thắng cảnh", 0],
] as const;
export function legacyDuplicateFixture(context: EditorialContext): EditorialLayoutV1 {
  const layout = autoLayout(context);
  const intro = layout.blocks.find(b => b.type === "INTRO")!;
  // Reproduce the owner's failure: a full factual sentence copied into a heading.
  const duplicate = "Cao nguyên đá Đồng Văn là Công viên địa chất toàn cầu UNESCO...";
  intro.text = duplicate;
  const story = layout.blocks.find(b => b.type === "IMAGE_TEXT_SPLIT" || b.type === "TEXT_SECTION")!;
  story.title = duplicate; story.text = duplicate;
  return layout;
}

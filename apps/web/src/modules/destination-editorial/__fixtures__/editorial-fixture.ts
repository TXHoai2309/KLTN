import type { EditorialContext } from "../editorial-contract";
export function editorialFixture(category = "thiên nhiên – thắng cảnh", count = 4): EditorialContext {
  return { id: "fixture", name: "Miền xanh Hà Giang", category, area: "Hà Giang", latitude: 23, longitude: 105,
    description: "Những triền núi mở ra trong sương sớm. Đây là nội dung mô tả tổng hợp cho fixture trình bày, không phải dữ kiện du lịch thực tế.\n\nCon đường dẫn qua những khoảng xanh và mái nhà nhỏ. Nhịp kể chậm để người đọc khám phá hình ảnh và câu chuyện đã được biên tập.\n\nTừ một góc nhìn khác, màu sắc và đường nét tạo nên cảm giác về chuyến đi. Bố cục lựa chọn ảnh phù hợp, không bổ sung dữ kiện ngoài hồ sơ.",
    suggestedDurationMinutes: 90, openingDays: ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "UNKNOWN", intervals: [] })),
    media: Array.from({ length: count }, (_, i) => ({ id: `photo-${i}`, url: `https://res.cloudinary.com/fixture/image/upload/v1/photo-${i}.jpg`, alt: `Ảnh phong cảnh fixture ${i + 1}`, caption: "Hình ảnh fixture cô lập", author: "Fixture", sourceUrl: null, isCover: i === 0, websiteRights: "APPROVED", storageReference: JSON.stringify({ provider: "cloudinary", cloud: "fixture", assetId: `asset-${i}`, publicId: `photo-${i}`, version: 1, width: i % 2 ? 900 : 1600, height: 1000 }) })),
    sources: [{ id: "source", title: "Nguồn fixture được kiểm duyệt", url: "https://example.org/source", websiteRights: "APPROVED" }],
  };
}

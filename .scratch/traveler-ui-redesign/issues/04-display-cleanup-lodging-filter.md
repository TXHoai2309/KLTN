# 04: Dọn dữ liệu hiển thị và lọc chỗ lưu trú khỏi gợi ý vui chơi

**What to build:** Bỏ tiền tố "[Tạm]" khi hiển thị tên điểm, viết hoa đúng địa danh, bỏ dòng địa chỉ khi chỉ là "khu vực hà giang". Thêm `places.types` (hoặc `primaryType`, xem câu hỏi mở của PARITY) vào field mask Google Places và lọc các loại lưu trú (lodging, hotel, homestay, resort, guest house, hostel, campground) khỏi các slot ACTIVITY/FREE/EVENING.

**Blocked by:** Không có

**Status:** done

**Nguồn:** [slim D23](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [PARITY BR-8, BR-10](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md)

- [x] Hàm làm sạch tên hiển thị có unit test ("[Tạm] Núi Đôi Cô Tiên" → "Núi Đôi Cô Tiên"; "khu vực hà giang" → ẩn).
- [x] Kiểm SKU và giá Google Places trước khi đổi field mask; ghi kết luận vào ticket.
- [x] "Gần đây có thể ghé" không còn khách sạn, homestay, resort trong bộ dữ liệu test (ví dụ Balana, H'mong Village Resort, Homestay Tommy house); tên chung chung như "Khu Vui Chơi" có quy tắc xử lý rõ.
- [x] Tổng số lượt gọi Places mỗi kế hoạch không tăng (`ACTIVITY_MAX_ANCHORS` giữ 16).

**Kết luận kiểm SKU Google Places (2026-11-23, ADR-49):**
- Theo tài liệu Google Places API (New) Text Search (`places:searchText`), các field `places.displayName`, `places.location`, `places.types` và `places.primaryType` đều thuộc cùng nhóm **Text Search Pro SKU** (bảng giá tính theo bậc cao nhất trong `X-Goog-FieldMask`). Vì field mask cũ đã có `places.displayName` và `places.location` (Pro), thêm `places.types` **không làm tăng bậc SKU** và không đổi số lượt gọi (`ACTIVITY_MAX_ANCHORS = 16`).
- Chọn `places.types` thay vì `places.primaryType` vì `types` trả đầy đủ mảng phân loại (ví dụ `["resort_hotel", "lodging", "point_of_interest"]`), lọc sót ít hơn ở Hà Giang nơi `primaryType` hay là `point_of_interest`, kết hợp thêm bộ lọc theo tên (`homestay`, `hotel`, `resort`, `khách sạn`, `nhà nghỉ`, `hostel`, `lodge`...) và lọc tên chung chung (`"Khu Vui Chơi"`, `"Điểm tham quan"`, ...).

**Bằng chứng kiểm tra (2026-11-23):**
- `npx vitest run src/lib/traveler-display-clean.vitest.test.ts src/modules/tripsage-chat/tripsage-places.vitest.test.ts src/modules/tripsage-chat/tripsage-activities.vitest.test.ts src/modules/tripsage-chat/tripsage-concierge-timeline.vitest.test.ts src/app/trips/trips-view.vitest.test.ts`: PASS (5 files, 53/53 tests).
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.

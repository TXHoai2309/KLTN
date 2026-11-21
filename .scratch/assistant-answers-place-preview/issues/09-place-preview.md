# 09: Xem nhanh địa điểm (Place preview)

**What to build:** Mỗi điểm đến trong danh mục trong timeline và mỗi gợi ý Google Places (chỗ nghỉ, quán ăn, có `place_id`) có nút "Xem nhanh". Bấm vào mở modal ngay trong trang với iframe Maps Embed API chế độ place (hiện tên, số sao, số lượt đánh giá, địa chỉ), ghi chú "Thông tin từ Google Maps, ứng dụng chưa kiểm tra", và link "Xem đánh giá đầy đủ trên Google Maps" mở tab mới. Không có nút cho tên địa điểm trợ lý chỉ viết trong lời văn.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 22–30, mục "Xem nhanh địa điểm").

**Blocked by:** 07 (cùng sửa thẻ timeline)

**Status:** done

- [x] Một component modal dùng chung nhận điểm đến danh mục (tọa độ, URL Google Maps đã xác minh nếu có) hoặc gợi ý có `place_id`; URL embed và URL link dựng từ dữ liệu hệ thống, không từ chữ model viết.
- [x] Dùng khóa trình duyệt Google sẵn có; không gọi Places Details; không thêm backend. Khóa phía server và khóa Stadia không xuất hiện trong trình duyệt.
- [x] Nút chỉ render khi có tọa độ hợp lệ hoặc `place_id`.
- [x] Trợ năng: role dialog có nhãn, bẫy focus, Esc / nút đóng / bấm ra ngoài để đóng, trả focus về nút mở; trên màn hình hẹp hiển thị gần toàn màn hình.
- [x] Khi iframe lỗi vẫn có dòng báo và link Google Maps.
- [x] Link mở tab mới với `noopener noreferrer`.
- [x] Render test: có/không có nút đúng điều kiện; dialog có iframe đúng URL embed và link đúng; Esc đóng và trả focus.
- [x] Ghi chú vận hành trong mô tả hoàn thành: cần bật Maps Embed API cho khóa trình duyệt và giới hạn referrer.
- [x] Typecheck, vitest component, `git diff --check` sạch.

## Ghi chú hoàn thành

- **Yêu cầu vận hành (bắt buộc trên Google Cloud Console):** Cần bật **Maps Embed API** cho khóa trình duyệt (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) và kiểm tra giới hạn HTTP referrer (domain production và `localhost`). Hiện trong `.env` local chưa cấu hình `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, nên modal sẽ hiển thị thông báo fallback + link mở Google Maps (chờ bật API / nạp khóa trình duyệt để kiểm tra trực quan iframe).
- **File đã đổi:**
  - `apps/web/src/lib/place-preview-url.ts` (dựng URL Maps Embed API v1 chế độ place và link Google Maps từ `placeId` hoặc tọa độ/URL đã xác minh của danh mục; chỉ đọc `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
  - `apps/web/src/components/place-preview/place-preview-modal.tsx` & `place-preview-modal.css` (modal dùng chung có `role="dialog"`, `aria-modal`, `aria-labelledby`, bẫy focus Tab/Shift+Tab, Esc/nút đóng/backdrop đóng và trả focus, fallback khi lỗi iframe/thiếu khóa, link `noopener noreferrer`, gần toàn màn hình trên mobile `<= 640px`, có slot `footerAction` cho ticket 10)
  - `apps/web/src/modules/trip-planner/planner-contract.ts` & `planner-candidates.ts` (truyền tùy chọn `googleMapsUrl` đã xác minh từ danh mục `Destination`)
  - `apps/web/src/modules/tripsage-chat/tripsage-timeline.ts` & `tripsage-chat-tools.ts` (mang tọa độ/địa chỉ/`googleMapsUrl` trên lượt tham quan `VISIT` và `placeId` trên gợi ý từ `searchPlaces`)
  - `apps/web/src/components/tripsage-chat/tripsage-timeline-view.tsx`, `tripsage-places-view.tsx`, `apps/web/src/components/assistant/assistant.css` (nút `"Xem nhanh"` chỉ render khi có tọa độ hợp lệ hoặc `placeId`, mở `PlacePreviewModal`; không render cho chữ trong lời văn markdown)
  - `apps/web/src/components/place-preview/place-preview-modal.vitest.test.ts` (5 test render, URL, fallback, bàn phím Esc/Tab, kiểm soát không rò khóa server/Stadia)
  - `apps/web/src/modules/tripsage-chat/tripsage-concierge-timeline.vitest.test.ts` (cập nhật 1 assertion `shown[0].place` để chấp nhận thêm `placeId` do yêu cầu mới của ticket 09)
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/components/place-preview src/components/tripsage-chat src/modules/tripsage-chat/tripsage-concierge-timeline.vitest.test.ts`: PASS (10 files, 60 tests, bao gồm source-guard client bundle)
  - `git diff --check`: PASS
- **Việc chưa làm:** Kiểm tra trực quan iframe thật trên trình duyệt (chờ bật Maps Embed API + `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).

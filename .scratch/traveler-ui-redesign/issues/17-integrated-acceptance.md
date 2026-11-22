# 17: Nghiệm thu tích hợp: trình duyệt 1440/768/375, sáng/tối, tương phản, thời gian

**What to build:** Chạy toàn bộ tiêu chí của hai spec trên preview deploy: chụp các màn hình ở 1440, 768 và 375px, cả sáng và tối; grep CSS; đo tương phản; chạy lại kịch bản Đà Nẵng 4 người và ghi thời gian từng lượt; kiểm điều hướng bằng bàn phím và viền focus.

**Blocked by:** 03, 08, 09, 11, 12, 13, 14, 15, 16

**Status:** verified-offline

**Nguồn:** [slim AC, Test Plan](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [PARITY AC](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md), [design §6](../../../docs/design/traveler-ui-system.md)

- [x] Toàn bộ AC 1–11 của slim và AC 1–10 của PARITY được đối chiếu bằng unit/contract/component test, token audit, WCAG AA contrast audit và production webpack build (chụp màn hình trình duyệt thật 1440/768/375px và chạy kịch bản AC-5 trên preview deploy chờ owner duyệt deploy & phiên đăng nhập thật).
- [x] Danh sách kiểm tra ở design §6 đạt phần kiểm tra tĩnh/offline: một nút chính/màn hình, 0 `font-weight: 650/700+`, 0 `#hex` cứng, 0 `Inter`, 0 `box-shadow` ngoài `none` / `var(--tv-shadow-float)` trên cả 9 file CSS người đi; 16/16 cặp màu sáng & tối đạt WCAG AA (>= 4.5:1); có `:focus-visible` trên nút, tab, chip và link.
- [x] Typecheck (`npm run check-types` 4/4 Turbo tasks), build web (`npm run build --workspace web -- --webpack`, 60/60 static pages), toàn bộ 150 bộ test tripsage, trip-save, trip-pin, trip-read, trip-edit, companion & traveler-ui PASS (1115/1115 passed, 17 file / 65 test postgres/live opt-in skipped); quét 289 file `.next/static` = 0 secret/key; `git diff --check` sạch.
- [x] Cập nhật Status và Acceptance Evidence của hai spec, cùng `docs/ai-progress.md`.

## Chỉnh sửa tích hợp phát hiện khi chạy toàn bộ suite

- Sửa `apps/web/src/components/trip-companions/companion-group-view.tsx`: đổi `dayIndex: day.dayIndex` thành `dayNumber: day.dayIndex` trên `TravelerDayTabItem` để tab ngày trang chia sẻ hiển thị đúng màu `--tv-day-1..7`.
- Mở rộng `apps/web/src/components/traveler-ui/traveler-tokens-audit.vitest.test.ts` thêm `day-timeline.css` (tổng 9 file CSS người đi).
- Sửa `apps/web/src/components/assistant/global-assistant.tsx` giữ lại mẫu `edit|in-trip` trong regex ẩn pill nổi trên `/trips/[id]` để khớp kiểm tra hợp đồng ở `saved-trip-assistant-acceptance.vitest.test.ts`.
- Sửa mock `next/navigation` trong 4 file test mới và tọa độ riêng trong `tripsage-plan-progress.vitest.test.ts` để không xung đột khi chạy toàn bộ suite với `isolate: false`.

## Phần chưa xác minh runtime (cần owner hoặc môi trường thật)

- Chụp ảnh trình duyệt thật 1440 / 768 / 375px (sáng & tối) + đo `getComputedStyle` trên preview deploy và chạy kịch bản AC-5 thật để ghi thời gian từng lượt (không deploy theo ràng buộc cứng).
- Áp dụng Prisma migration #55 (`20261123022000_assistant_conversation_auto_title`) lên DB môi trường đích (không sửa DB prod).
- 17 file / 65 test tích hợp Postgres / live opt-in (cần disposable Postgres / live credentials).

# 01: Bộ token `--tv-*`, nút 3 cỡ × 6 kiểu, tab ngày — áp trước lên trang chi tiết chuyến đi

**What to build:** Thêm token `--tv-*` (màu sáng/tối, chữ, khoảng cách, bo góc, bóng, chuyển động) vào `packages/ui/src/styles/globals.css`. Dựng thành phần nút theo bảng cỡ sm/md/lg và các kiểu chính/phụ/chữ/link/nguy hiểm/chỉ icon, cùng kiểu tab ngày 32px có chấm màu ngày. Áp ngay lên CSS của trang `/trips/[id]` mà chưa đổi bố cục, làm lát mẫu (tracer) để thấy giao diện thon gọn hơn từ lát đầu.

**Blocked by:** Không có

**Status:** verified-offline

**Nguồn:** [design §2–§3.2](../../../docs/design/traveler-ui-system.md), [slim A1–A5](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md)

- [x] Token đủ theo design §2.1–§2.4, có bản tối theo đúng cách app đang làm theme sáng/tối.
- [x] Nút sm 28px / md 34px / lg 44px, chữ 12.5/13.5/14px đậm 500, bo 8px, không bóng; có trạng thái hover, nhấn, focus (vòng 2px), đang chạy.
- [x] CSS trang chi tiết không còn `font-weight` 650/700, bóng trên thẻ/nút/tab, hay mã hex viết cứng ngoài token; mực navy được thay bằng `--tv-ink`.
- [x] Tab ngày cao 32px, số điểm cùng dòng ("Ngày 1 · 4"), gạch chân màu ngày khi đang chọn; màu ngày trùng màu đường trên bản đồ.
- [x] Link "Xem nhanh" thay cho hộp viền 25px.
- [ ] Đo lại bằng `getComputedStyle` như buổi rà soát 2026-11-23 và ghi số trước/sau vào ticket; typecheck và test trips hiện có PASS.

**Bằng chứng kiểm tra (2026-11-23):**
- `npm run check-types`: PASS (4/4 packages).
- `npx vitest run src/components/traveler-ui src/app/trips src/components/place-preview`: PASS (14 files, 59/59 tests), gồm 4 test mới trong `traveler-ui.vitest.test.ts` kiểm tra đủ token `--tv-*` sáng/tối, 3 cỡ × 6 kiểu nút, `TravelerDayTabs`, và không còn `font-weight` 650/700+, không hex viết cứng, không `box-shadow` ngoài `--tv-shadow-float` trong `trips.css` và `traveler-ui.css`.
- `npm run build --workspace web -- --webpack`: PASS (60/60 routes; Turbopack mặc định hết RAM native trên Windows khi chạy babel loader subprocess).
- `git diff --check`: PASS.
- Chưa đo `getComputedStyle` trực tiếp trên trình duyệt (chưa mở phiên đăng nhập `/trips/[id]` trên dev server); để mục đo trình duyệt cho lượt kiểm trình duyệt / Ticket 17.

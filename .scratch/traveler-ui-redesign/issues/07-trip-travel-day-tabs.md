# 07: Tab Ngày đi / Ngày về trên trang chi tiết; chặng tiếp cận rời khỏi mục ghim

**What to build:** Trang chi tiết có thanh tab Ngày đi · Ngày 1…N · Ngày về khi chuyến có chặng tiếp cận. Panel Ngày đi/Ngày về hiện các đoạn của chặng như `TripsageAccessLegCard only="outbound|return"`. Bỏ thẻ chặng tiếp cận khỏi "Mục đã ghim"; các mục ghim khác giữ nguyên.

**Blocked by:** 05, 06

**Status:** verified-offline

**Nguồn:** [PARITY BR-6, US 11](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md)

- [x] Chuyến có chặng tiếp cận: có hai tab đầu và cuối, chấm xám, tên "Ngày đi 12/12" (PARITY AC-4).
- [x] Chuyến không có chặng tiếp cận: chỉ có Ngày 1…N.
- [x] "Mục đã ghim" không còn thẻ chặng tiếp cận; dữ liệu ghim cũ (kind ACCESS) vẫn đọc được.
- [x] Trang chia sẻ không có tab ngày đi/về (kiểm ở ticket 09).

## Bằng chứng

- `TripDetailView` (`apps/web/src/app/trips/trips-view.tsx`) đọc chặng tiếp cận hiện hành từ `pinnedItems` (kind `ACCESS`, chỉ chủ chuyến), hiển thị tab `"Ngày đi DD/MM"` và `"Ngày về DD/MM"` với chấm xám (`kind: "travel"`, `--tv-ink-3`) cùng panel dùng `TripsageAccessLegCard only="outbound" | "return"`.
- `TripPinnedSection` (`apps/web/src/components/trip-pinned/trip-pinned-section.tsx`) lọc bỏ `kind: "ACCESS"` khỏi "Mục đã ghim" trong khi `readPinnedItems` và `trip-pin-contract.ts` vẫn đọc đầy đủ.
- Test mới: `apps/web/src/app/trips/trips-travel-day-tabs.vitest.test.ts` (3/3 PASS).
- Lệnh kiểm tra:
  - `npx vitest run src/app/trips src/modules/trip-save/trip-pin.vitest.test.ts src/components/trip-timeline src/components/traveler-ui`: PASS (17 files, 77/77 tests).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.
- Chưa kiểm trên trình duyệt thật.

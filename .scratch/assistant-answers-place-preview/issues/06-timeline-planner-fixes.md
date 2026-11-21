# 06: Sửa các mốc timeline do bộ lập lịch tạo

**What to build:** Timeline trong ngày (Day timeline) đọc hợp lý: không còn "nghỉ đêm" lúc 09:30 hay 10:50 khi ngày còn thời gian; ngày kết thúc sớm vì hết điểm phù hợp ghi "tự do buổi chiều"; nhãn khu vực nghỉ đêm dùng tên khu vực của điểm cuối ngày, không lặp chữ ("khu vực khu vực hà giang"); ngày không có lượt tham quan nhưng có chặng đi ghi "Ngày di chuyển · <km> · ~<giờ>" thay vì "Chưa có điểm phù hợp". Khi chặng đầu chiếm gần trọn ngày 1 của chuyến ngắn, `proposeItinerary` trả `hubHint` để trợ lý gợi ý tập kết ở TP Hà Giang.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 18–21, mục "Lỗi lập lịch" và "Hiển thị và UI").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Chẩn đoán vì sao mốc nghỉ đêm được đặt ngay sau lượt tham quan cuối khi còn sớm; sửa ở nơi dựng timeline, không đổi giờ giấc đã được Validator kiểm tra.
- [x] Nhãn khu vực nghỉ đêm không lặp từ "khu vực".
- [x] Ngày chỉ di chuyển hiển thị "Ngày di chuyển" kèm quãng đường và thời gian.
- [x] Ngưỡng "ngày 1 quá dài" được định nghĩa ở một chỗ, có comment lý do; `hubHint` trả về khi vượt ngưỡng ở chuyến ngắn; ví dụ Thanh Hóa, 3 ngày, xe máy (~446 km ngày 1) có `hubHint`.
- [x] Test: dựng timeline và render cho các trường hợp trên (giống test timeline/concierge hiện có).
- [x] Typecheck, vitest liên quan, `git diff --check` sạch.

## Ghi chú hoàn thành

- **Nguyên nhân gốc (đã tái hiện FAIL trước khi sửa):**
  1. `buildDayTimeline` trong `tripsage-timeline.ts` luôn gán `OVERNIGHT.startMinute = lastStop?.departureMinute ?? null`, nên khi ngày kết thúc sớm (09:30 hoặc 10:50) mốc "Nghỉ đêm" bị đặt vào buổi sáng; không có mốc "Tự do buổi chiều".
  2. `buildDayTimeline` ghép cứng `` `Nghỉ đêm khu vực ${lastStop.destination.area}` ``, nên khi `area` trong DB đã bắt đầu bằng `"khu vực "` sẽ lặp thành `"Nghỉ đêm khu vực khu vực ..."`.
  3. `TripsageItineraryView` hiển thị `"Chưa có điểm phù hợp cho ngày này."` cho mọi ngày `stops.length === 0`, kể cả ngày di chuyển (`OUTBOUND_ONLY` / `RETURN_ONLY`), và `buildDayTimeline` không gắn nhãn `"Ngày di chuyển · <km> · ~<giờ>"`.
  4. `tripsage-chat-tools.ts` chỉ kiểm tra `LONG_OUTBOUND_MINUTES = 600` (10 giờ) hoặc `OVERNIGHT_DRIVING_UNSUPPORTED`, nên chuyến ngắn (≤ 4 ngày) đi xa như Thanh Hóa (~446 km, ~7–8,5 giờ) không nhất thiết nhận `hubHint`.
- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-timeline.ts`: thêm `EARLY_DAY_END_MINUTE = 960` và kind `FREE_TIME` ("Tự do buổi chiều" khi ngày kết thúc trước 16:00, bỏ giờ buổi sáng khỏi mốc `OVERNIGHT` mà không thay đổi giờ Validator); thêm `formatOvernightLabel` (bỏ lặp tiền tố "khu vực") và `formatTravelOnlyDayLabel` ("Ngày di chuyển · <km> km · ~<giờ>").
  - `apps/web/src/components/tripsage-chat/tripsage-timeline-view.tsx`: hỗ trợ icon cho `FREE_TIME`.
  - `apps/web/src/components/tripsage-chat/tripsage-itinerary-view.tsx`: hiển thị `formatTravelOnlyDayLabel` thay cho "Chưa có điểm phù hợp" trên ngày chỉ di chuyển.
  - `apps/web/src/modules/tripsage-chat/tripsage-access-leg.ts` & `tripsage-chat-tools.ts`: tập trung ngưỡng `LONG_OUTBOUND_MINUTES`, `SHORT_TRIP_MAX_DAYS`, `SHORT_TRIP_LONG_OUTBOUND_MINUTES`, `SHORT_TRIP_LONG_OUTBOUND_KM` và hàm `shouldSuggestHub` có comment lý do; trả `hubHint` ưu tiên `hub:HA_GIANG_CITY` cho chuyến ngắn ngày 1 quá dài.
  - `apps/web/src/modules/tripsage-chat/tripsage-timeline-fixes.vitest.test.ts`: 3 test bao phủ kết thúc sớm + tự do buổi chiều + không lặp "khu vực", ngày chỉ di chuyển 446 km, và `hubHint` cho Thanh Hóa 3 ngày xe máy.
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`: PASS.
  - `npx vitest run src/modules/tripsage-chat src/components/tripsage-chat`: 39/39 files, 368/368 tests PASS.
  - `git diff --check`: PASS.
- **Việc chưa làm:** Kiểm thử trình duyệt cuối luồng (ticket 13).

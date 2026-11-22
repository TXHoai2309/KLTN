# ASSISTANT-TRIP-TIMELINE-PARITY — Chi phí khớp nhau, một mẫu lịch trình ngày cho mọi trang, khối "Tối nay"

## Status

`implemented, verified-offline` (2026-11-23). Toàn bộ tickets 04–09 đã triển khai và vượt qua kiểm thử unit/component/typecheck/build cục bộ; chờ xác minh trình duyệt thật trên preview deploy (không deploy/push khi chưa được owner yêu cầu).

Tickets (chung với TRAVELER-UI-SLIM-REDESIGN): [.scratch/traveler-ui-redesign](../../.scratch/traveler-ui-redesign/README.md), các ticket 04–09.

Thuật ngữ theo [GLOSSARY](../../GLOSSARY.md): chặng tiếp cận, **chặng tiếp cận hiện hành**, **ngày đi / ngày về**, **tối nay**, timeline trong ngày, gợi ý vui chơi quanh đây, gợi ý chỗ nghỉ, chỗ nghỉ đã chọn, bảng chi phí ước tính, điểm tập kết.

## Problem Statement

Có ba vấn đề, owner báo từ cuộc chat kế hoạch 10 người, 5 ngày, xuất phát TP Hồ Chí Minh:

1. **Hai con số chi phí lệch nhau.** Bảng chi phí trong chat ghi chặng tiếp cận 37.164.420đ, còn mục đã ghim ghi 56.000.000đ. Nguyên nhân: mỗi lần trợ lý gọi `planAccessLeg` sẽ tạo một chặng tiếp cận mới. Bảng chi phí lấy bản mới nhất, có giá máy bay Google Flights khoảng 3,12 triệu/người khứ hồi. Người dùng lại ghim một thẻ cũ, có giá ước tính 2,5 triệu mỗi chiều. Không có gì đánh dấu thẻ đó đã cũ.
2. **Ba trang hiển thị một lịch trình theo ba kiểu.**
   - Chat dùng danh sách chữ gọn (`tripsage-timeline-view.tsx`).
   - Trang chuyến đi dùng thẻ có ảnh, trục giờ, bình minh/hoàng hôn (inline trong `TripDetailView`, `app/trips/trips-view.tsx`).
   - Trang chia sẻ có một kiểu riêng nữa (`companion-group-view.tsx`).
   - Chặng tiếp cận ở chat nằm trong tab "Ngày đi / Ngày về", còn ở trang chuyến đi lại nằm trong "Mục đã ghim".
3. **Thiếu "tối nay ở đâu, chơi gì".**
   - Hệ thống đã tự tìm gợi ý buổi tối (slot `EVENING` trong `tripsage-activities.ts`), nhưng không có khối hiển thị rõ khu vực nghỉ đêm kèm vài nơi đi tối.
   - Khi người dùng hỏi "tối ngày 1 ở Hà Giang có những chỗ nào", trợ lý trả lời chung chung.
   - Mục "Gần đây có thể ghé" lẫn cả khách sạn và resort (Balana Hà Giang, H'mong Village Resort), vì kết quả Places không có loại địa điểm để lọc.

## Solution

1. Mỗi cuộc trò chuyện có đúng một **chặng tiếp cận hiện hành**. Bảng chi phí, mục đã ghim và chuyến đi khi lưu đều dùng bản này. Thẻ cũ bị làm mờ, có nhãn "Đã có bản mới" và không ghim được. Mục ghim đang trỏ tới bản cũ tự đổi sang bản hiện hành.
2. Một component **lịch trình ngày** dùng chung cho chat, trang chuyến đi và trang chia sẻ, lấy giao diện trang chuyến đi làm gốc. Trang chuyến đi có tab Ngày đi / Ngày 1…N / Ngày về giống chat.
3. Mỗi đêm trong chuyến có khối **Tối nay**: khu vực nghỉ đêm, chỗ nghỉ đã chọn hoặc gợi ý chỗ nghỉ, và tối đa 3 nơi ăn hoặc chơi trong bán kính 3 km. Đây là gợi ý chưa kiểm tra, được lưu cùng chuyến đi. Trợ lý trả lời câu "tối nay đi đâu" từ khối này.

## User Stories

### Chi phí khớp nhau

1. As a Traveler, I want the cost table, my pinned access leg and my saved trip to show the same access-leg price, so that I can trust the total.
2. As a Traveler, I want an older access-leg card in the chat to look outdated and say "Đã có bản mới", so that I do not pin a stale price.
3. As a Traveler, I want my pinned access leg to follow the newest version automatically, so that I do not have to re-pin after the assistant replans.
4. As a Traveler, I want the "Chặng tiếp cận" cost line to list the price of each segment (máy bay / xe khách, mỗi chiều, mỗi người × số người), so that I can see it matches the card.
5. As a Traveler, I want a trip I already saved to keep the access leg it was saved with, so that my confirmed plan does not change silently.

### Một mẫu lịch trình ngày

6. As a Traveler, I want the chat itinerary, my trip page and the shared trip page to look the same, so that I recognise my plan everywhere.
7. As a Traveler, I want each stop shown as a card with a photo, its order, its time and duration on a time rail, so that the day is easy to scan.
8. As a Traveler, I want each day to show sunrise/sunset and weather as the trip page does today, so that the chat plan is just as informative.
9. As a Traveler in the chat, I want "Xem nhanh", "Gần đây có thể ghé" and lunch suggestions to stay inside the same card, so that I lose nothing from the chat view.
10. As a Traveler on a narrow chat panel or phone, I want the photo to shrink or move above the title, so that the card stays readable.
11. As a Traveler, I want my trip page to have "Ngày đi", "Ngày 1…N", "Ngày về" tabs with the access leg inside the first and last tab, so that it matches the chat.
12. As a Trip member, I want the shared trip page to show Ngày 1…N from the trip hub, without the host's home-city travel days, so that I see only what applies to the whole group.

### Tối nay

13. As a Traveler, I want each night of my trip (Ngày 1 to Ngày N−1) to end with a "Tối nay" block, so that I know where I sleep and what I can do that evening.
14. As a Traveler, I want "Tối nay" to show the overnight area, my chosen lodging or lodging suggestions, and up to 3 places to eat or hang out within about 3 km, so that I get a concrete short list.
15. As a Traveler, I want "Tối nay" labelled as an unverified suggestion, so that I do not mistake it for a scheduled visit or a booking.
16. As a Traveler, I want "Tối nay" to appear automatically when the plan is made, without the assistant asking first, so that planning stays short.
17. As a Traveler, I want "Tối nay" and the other suggestions saved with my trip and shown on the trip and shared pages, so that the group sees the same list.
18. As a Traveler, I want the suggestions of a day I edit to be searched again, so that they match the new overnight area.
19. As a Traveler, I want hotels, homestays and resorts kept out of "Gần đây có thể ghé" and the evening list, so that those lists only show things to do.
20. As a Traveler, I want the assistant to answer "tối nay ở đâu / đi đâu" with the overnight area and places from "Tối nay", so that its answer matches what I see.

## Business Rules

- **BR-1 Một bản hiện hành.** Chặng tiếp cận hiện hành là bản mới nhất mà `planAccessLeg` tạo ra trong cuộc trò chuyện. Mỗi chặng tiếp cận có một id ổn định. Bảng chi phí ghi lại id của chặng mà nó đã cộng.
- **BR-2 Thẻ cũ.** Thẻ chặng tiếp cận có id khác bản hiện hành vẫn xem được, nhưng bị làm mờ, có nhãn "Đã có bản mới" và không có nút ghim.
- **BR-3 Mục ghim theo bản hiện hành.** Khi lưu chuyến đi từ chat, mục ghim `ACCESS` luôn lấy bản hiện hành. Hiển thị phía client cũng thay mục ghim cũ bằng bản hiện hành.
- **BR-4 Chuyến đã lưu không tự đổi.** Chặng tiếp cận đã lưu cùng chuyến đi là bản chụp lúc lưu. Một chặng tiếp cận mới trong chat chỉ ảnh hưởng chuyến đi khi người dùng lưu lại.
- **BR-5 Dòng chi phí khớp thẻ.** Dòng "Chặng tiếp cận (đi và về)" ghi giá từng đoạn và tổng của đúng bản đã cộng. Tổng đó bằng "Tổng tham khảo cả nhóm" trên thẻ.
- **BR-6 Ngày đi / ngày về.** Đây là các tab trước Ngày 1 và sau Ngày N, không tính vào số ngày chuyến đi. Có ở chat và trang chuyến đi. Không có ở trang chia sẻ, vì thành phố nhà của chủ chuyến là thông tin riêng (ADR-42, ADR-47).
- **BR-7 Tối nay chỉ ở đêm trong chuyến.** Ngày 1 đến Ngày N−1 có khối Tối nay, ngày cuối không có. Khu vực nghỉ đêm là điểm dừng cuối của ngày, giống anchor `EVENING` hiện tại.
- **BR-8 Giới hạn Tối nay.** Tối đa 3 nơi, bán kính 3 km (hiện là 5 km), không lấy loại lưu trú (lodging, hotel, homestay, resort, guest house, hostel, campground).
- **BR-9 Gợi ý không phải lịch.** Tối nay, gần đây có thể ghé và gợi ý ăn trưa không chiếm giờ trong timeline, không phải đầu vào của Constraint Validator, không ảnh hưởng bảng chi phí ước tính.
- **BR-10 Lọc lưu trú ở mọi gợi ý vui chơi.** Áp cho slot `ACTIVITY`, `FREE`, `EVENING`. Gợi ý chỗ nghỉ vẫn đi đường riêng của nó.

## Roles / Authorization

Không đổi. Mục ghim `ACCESS` chỉ chủ chuyến thấy. Trang chia sẻ chỉ đọc phần chia sẻ được, như hiện tại (`shareablePins` bỏ `ACCESS`, `sharedMeetingPoint` chỉ lộ điểm tập kết).

## Ownership Rules

Không đổi. Mọi kiểm tra quyền vẫn ở server, theo chủ chuyến và thành viên nhóm.

## UX / UI Contract

- **Component lịch trình ngày dùng chung** (`DayTimeline`). Nhận dữ liệu ngày đã chuẩn hoá: ngày, giờ mặt trời, khởi hành, chặng đi, lượt tham quan, nghỉ trưa, Tối nay, và các gợi ý tuỳ chọn. Có hai biến thể:
  - `full` cho trang chuyến đi và trang chia sẻ: ảnh lớn, giống giao diện hiện tại của trang chuyến đi.
  - `compact` cho chat: ảnh nhỏ bên trái. Khi khung hẹp dưới khoảng 480px thì ảnh nằm trên tiêu đề.
- **Phần chỉ có ở chat:** nút "Xem nhanh", "Gần đây có thể ghé", nút "So sánh cách đi" khi chưa có chặng tiếp cận. Chỉ hiện khi trang truyền callback hoặc dữ liệu tương ứng; trang chuyến đi cũng hiện "Gần đây có thể ghé" nếu chuyến đã lưu kèm dữ liệu đó.
- **Tab ngày:** Ngày đi (nếu có) · Ngày 1…N · Ngày về (nếu có), dùng chung một thanh tab.
  - Panel Ngày đi / Ngày về hiển thị các đoạn của chặng tiếp cận, như `TripsageAccessLegCard only="outbound|return"`.
  - Trang chuyến đi bỏ thẻ chặng tiếp cận khỏi "Mục đã ghim". Các mục ghim khác vẫn ở đó.
- **Khối Tối nay:** tiêu đề "Tối nay · nghỉ ở {khu vực}"; dòng chỗ nghỉ (đã chọn, hoặc tối đa 2–3 gợi ý); danh sách tối đa 3 nơi, mỗi nơi có khoảng cách và nút "Xem nhanh" ở chat; nhãn "gợi ý, chưa kiểm tra".
- **Thẻ chặng tiếp cận cũ:** độ mờ khoảng 0.55, nhãn "Đã có bản mới", không có nút ghim.

## Data Contract

- `AccessLegPart` thêm `id: string`, tạo lúc `buildAccessLeg`.
- Data part của bảng chi phí ghi `accessLegId` của chặng đã cộng.
- Phía client, `state.accessLeg` là bản hiện hành (đã như vậy). Thẻ trong tin nhắn so `id` với bản hiện hành để biết mình đã cũ.
- `TimelineSuggestion` kind `EVENING` giữ nguyên. Khối Tối nay đọc từ các gợi ý `EVENING` của `d{n}-overnight`, cộng với gợi ý chỗ nghỉ và chỗ nghỉ đã chọn sẵn có.
- **Không cần migration.** Chuyến đã lưu đã giữ `nearbySuggestions` theo ADR-45 và mục ghim theo ADR-47, đều là JSON.
- `GOOGLE_PLACES_FIELD_MASK` thêm `places.types` (hoặc `places.primaryType`) để lọc loại lưu trú. Cần xem lại mức giá SKU Text Search trước khi đổi; field mask hiện đã có `displayName`.

## API Contract

Không thêm endpoint. Payload lưu chuyến (`trip-save`) giữ schema hiện tại, chỉ là mục ghim `ACCESS` luôn mang bản hiện hành. Phần đọc chuyến (`trip-read`) và trang chia sẻ trả về đủ dữ liệu cho `DayTimeline` (đã có `nearbySuggestions`, `journeySnapshot`).

## Error / Recovery

- Places lỗi hoặc không có kết quả: khối Tối nay vẫn hiện khu vực nghỉ và chỗ nghỉ, cộng dòng "Chưa tìm được gợi ý buổi tối". Không bịa địa điểm.
- Chặng tiếp cận chưa có: tab Ngày đi / Ngày về hiện placeholder kèm nút "So sánh cách đi", như hiện tại.

## Write Semantics / Idempotency

Không đổi. Lưu chuyến đi vẫn dùng hợp đồng `SUCCESS` / `FAILED` / `UNKNOWN` và khoá idempotency hiện tại.

## External Services

Google Places Text Search: thêm field `types`. Tổng số lượt gọi mỗi kế hoạch không tăng, vẫn giới hạn `ACTIVITY_MAX_ANCHORS = 16`.

## Acceptance Criteria

1. Sau khi trợ lý gọi `planAccessLeg` hai lần, thẻ đầu tiên hiện "Đã có bản mới" và không ghim được. Dòng chặng tiếp cận trong bảng chi phí, mục ghim và chuyến đi khi lưu đều cùng một tổng.
2. Lưu chuyến, rồi trợ lý lập chặng tiếp cận mới: chuyến đã lưu vẫn giữ tổng cũ cho tới khi lưu lại.
3. Chat, trang chuyến đi và trang chia sẻ cùng render từ `DayTimeline`. Một lượt tham quan có cùng ảnh, thứ tự, giờ và thời lượng ở cả ba trang.
4. Trang chuyến đi có tab Ngày đi / Ngày về khi chuyến có chặng tiếp cận. Thẻ chặng tiếp cận không còn nằm trong "Mục đã ghim".
5. Trang chia sẻ không hiện Ngày đi / Ngày về và không lộ thành phố nhà.
6. Chuyến 5 ngày có đúng 4 khối Tối nay. Mỗi khối có tối đa 3 nơi, đều trong 3 km, không có khách sạn, homestay hay resort.
7. "Gần đây có thể ghé" không còn khách sạn, homestay hay resort.
8. Chỉnh lịch làm đổi điểm dừng cuối của một ngày thì Tối nay của ngày đó được tìm lại.
9. Hỏi "tối ngày 1 đi đâu" thì trợ lý nêu khu vực nghỉ và các nơi lấy từ Tối nay của ngày 1.
10. Constraint Validator, giờ trong timeline và bảng chi phí ước tính không đổi khi Tối nay thay đổi.

## Test Plan

- Unit (vitest):
  - `buildAccessLeg` sinh id.
  - Bảng chi phí ghi `accessLegId`.
  - Logic thẻ cũ / mục ghim theo bản hiện hành.
  - Bộ lọc loại lưu trú.
  - Bán kính 3 km và giới hạn 3 cho `EVENING`.
  - Chỉ Ngày 1…N−1 có Tối nay.
- Component (compact-ui harness hiện có):
  - `DayTimeline` ở biến thể `full` và `compact`.
  - Tab ngày đi / ngày về có và không có chặng tiếp cận.
  - Trang chia sẻ không có tab ngày đi / ngày về.
- Hồi quy: các bộ test tripsage, trip-save, trip-pin, companion hiện có.
- Trình duyệt: một chuyến 10 người, 5 ngày, từ TP Hồ Chí Minh, xem ở chat, trang chuyến đi và trang chia sẻ, trên desktop và mobile.

## Expected Modules / Files

- `modules/tripsage-chat/tripsage-access-leg.ts`: id của chặng.
- `modules/tripsage-chat/tripsage-chat-tools.ts`: `estimateCosts` ghi `accessLegId`; mô tả cho trợ lý về Tối nay.
- `modules/tripsage-chat/tripsage-activities.ts`: bán kính 3 km và tối đa 3 cho `EVENING`; lọc loại lưu trú.
- `modules/tripsage-chat/tripsage-places.ts`: field mask có `types`.
- `modules/tripsage-chat/tripsage-chat-service.ts`: luật trả lời "tối nay" từ dữ liệu Tối nay.
- `components/trip-timeline/day-timeline.tsx` (mới): component dùng chung, tách từ phần ngày của `TripDetailView`.
- `components/tripsage-chat/tripsage-timeline-view.tsx`: dùng `DayTimeline` compact.
- `components/tripsage-chat/tripsage-access-leg-card.tsx`: trạng thái cũ.
- `components/tripsage-chat/tripsage-chat-client.tsx`: so id, truyền bản hiện hành cho mục ghim.
- `app/trips/trips-view.tsx`: dùng `DayTimeline` full kèm tab ngày đi / ngày về; bỏ thẻ chặng tiếp cận khỏi mục ghim.
- `components/trip-companions/companion-group-view.tsx`: dùng `DayTimeline` full, không có ngày đi / ngày về.
- CSS: trip-planner / assistant / companion. Tách style dùng chung vào một file cho `DayTimeline`.

## Migration Impact

Không có. Mọi dữ liệu mới đều nằm trong JSON đã có.

## Environment Impact

Không có biến môi trường mới. Cần kiểm tra lại giá Google Places khi thêm field `types`.

## Implementation Sequence

1. **Chi phí khớp nhau (BR-1…BR-5):** id chặng, `accessLegId`, thẻ cũ, mục ghim theo bản hiện hành. Đây là lát nhỏ, giao được riêng.
2. **Lọc lưu trú và Tối nay ở phía dữ liệu (BR-7, BR-8, BR-10):** field mask, bộ lọc, 3 km / 3 nơi, luật trả lời của trợ lý.
3. **`DayTimeline` dùng chung:** tách từ trang chuyến đi, áp cho trang chuyến đi trước (ít rủi ro), rồi tới chat compact, cuối cùng là trang chia sẻ.
4. **Tab ngày đi / ngày về ở trang chuyến đi;** bỏ thẻ chặng tiếp cận khỏi mục ghim.
5. **Khối Tối nay trong `DayTimeline`** và tìm lại gợi ý khi chỉnh lịch.
6. Cập nhật GLOSSARY nếu cần, `docs/ai-progress.md`, và ADR nếu việc gộp component làm đổi ranh giới module.

## Acceptance Evidence

- **2026-11-23 (offline integrated verification — Ticket 17):**
  - AC-1, AC-2 (chặng tiếp cận hiện hành, thẻ cũ mờ 0.55 + "Đã có bản mới", đồng bộ mục ghim trước lưu & giữ snapshot sau lưu): `tripsage-current-access-leg.vitest.test.ts` PASS (Ticket 05).
  - AC-3, AC-4, AC-5 (`DayTimeline` dùng chung `full`/`compact`, tab Ngày đi/Ngày về trên chi tiết chuyến đi, loại `ACCESS` khỏi "Mục đã ghim", trang chia sẻ dùng `DayTimeline full` + `RouteStrip` và không lộ thành phố nhà/Ngày đi-về): `day-timeline.vitest.test.ts`, `trips-travel-day-tabs.vitest.test.ts`, `companion-group-parity.vitest.test.ts` PASS (Tickets 06, 07, 09).
  - AC-6, AC-7, AC-8, AC-9, AC-10 (khối "Tối nay" 3 km / <= 3 nơi, lọc chỗ lưu trú qua `places.types` — ADR-49, làm mới gợi ý tối best-effort sau `applyEdit`, trợ lý trả lời từ ngữ cảnh "Tối nay"): `tripsage-activities.vitest.test.ts`, `tripsage-evening-plan.vitest.test.ts` PASS (Tickets 04, 08).
  - Tích hợp toàn diện: `npm run check-types` PASS (4/4), `npm run build --workspace web -- --webpack` PASS (60/60), Vitest 150 passed / 17 skipped (1115 passed / 65 skipped), `git diff --check` PASS. Chưa kiểm trên trình duyệt thật/preview deploy.

## Open Questions

- Chọn `places.types` hay `places.primaryType`: xem SKU và độ phủ dữ liệu ở Hà Giang trước khi chốt.
- Luồng chỉnh sửa hành trình (trip-edit) hiện tính lại với rest STANDARD (đã ghi ở các vòng trước). Chưa thuộc phạm vi story này, nhưng cần kiểm khi tìm lại gợi ý theo AC-8.

## Handoff Notes

- Lý do lệch chi phí đã xác minh bằng phép tính: 37.164.420 / 10 = 3.716.442đ/người, trừ 600.000đ xe khách hai chiều còn khoảng 3,12 triệu vé máy bay Google Flights. Thẻ đã ghim là (2.500.000 + 300.000) × 2 × 10 = 56.000.000đ. Chưa đối chiếu bằng tool trace của chính cuộc chat đó.
- Slot `EVENING` đã có sẵn ở `activityAnchors` (đêm = điểm dừng cuối của ngày, trừ ngày cuối). Story này là làm rõ và hiển thị nó, không phải tính năng mới từ đầu.

# Spec: Bài học từ chuyến d1ada90d — Lịch linh động không chặn cứng, mốc nghỉ đêm, chặng lên Hà Giang & chống hỏi lặp điểm xuất phát

Trạng thái: **đã triển khai** (hoàn tất Q1–Q12 & D1–D7 ngày 2026-11-25; đã cập nhật [GLOSSARY.md](../../GLOSSARY.md), ghi [ADR-57](../decisions.md) và cập nhật [ai-progress.md](../ai-progress.md)).
Phạm vi: `/assistant` (`tripsage-chat`, `tripsage-conversation-state`, `tripsage-chat-client`), lõi `trip-planner` & `trip-origin`, tìm điểm xuất phát (`origin-search`), gợi ý hoạt động (`tripsage-activities`), timeline hiển thị (`day-timeline`, `tripsage-plan-panel`, `trips-view`).
Nguồn:
- Hội thoại live `d1ada90d-d88c-4f22-8488-954aa3825f1f`: nhóm 4 người, xe máy, `28/12/2026–01/01/2027` (5 ngày, 11 điểm, 930 km), nêu xuất phát từ `bến xe Giáp Bát (Hà Nội)`.
- 6 ảnh chụp thực tế màn hình trò chuyện và panel lịch trình của chủ dự án ngày 2026-11-25.
- 3 vòng phỏng vấn `/grill-with-docs` (Q1–Q12) đã được chủ dự án xác nhận ngày 2026-11-25.
- Nền: [GLOSSARY.md](../../GLOSSARY.md), [ADR-55 / ADR-56](../decisions.md), [trip-review-lessons-c6be04d7-spec.md](trip-review-lessons-c6be04d7-spec.md).

---

## Problem Statement

Khi thử nghiệm thực tế trên hội thoại `d1ada90d-d88c-4f22-8488-954aa3825f1f`, dù các tính năng từ chuyến `c6be04d7` đã chạy, trải nghiệm lập lịch và đọc timeline vẫn vướng 6 lỗi lớn:

1. **Hạn về `18:00` chặn cứng nút Lưu chuyến & AI gạ "thêm 1 ngày":**
   - Người dùng đã chốt đi **5 ngày**. Máy chủ tự áp hạn về mặc định `18:00`, đánh `VIOLATION` (`RETURN_DEADLINE_MISSED`) trên Ngày 5 (dù Ngày 5 có `0 điểm dừng`, chỉ chạy về từ Sông Nho Quế `433,8 km · ~10h51`), hiện `Kiểm tra 4/5`, khóa nút `Lưu chuyến`, và AI nhắn yêu cầu sửa hoặc *"thêm 1 ngày"*.
   - Nguyên tắc sản phẩm được chốt ở Q1 & Q6: **kể cả khi chính người dùng đặt khung giờ muốn về, nếu dự kiến về muộn hơn chỉ ghi lưu ý rõ và hỏi xem có muốn điều chỉnh hay không — cấm tuyệt đối chặn cứng hoặc khóa Lưu chuyến**.

2. **Tiêu đề ngày & điểm đầu/cuối chặng lệch với khu nghỉ đêm tối hôm trước:**
   - Ngày 4 kết thúc tham quan ở **Sông Nho Quế** (`11:45–14:45`) và có dòng `Nhận phòng · Mèo Vạc`, nhưng sang Ngày 5 tiêu đề lại hiện **`Sông Nho Quế → Hà Nội (bến xe Mỹ Đình)`**.
   - Tương tự, tối Ngày 1 nghỉ tại TP Hà Giang nhưng tiêu đề Ngày 2 lại hiện **`Núi Cấm → Sủng Là (Nhà của Pao)`** (dù Ngày 2 có 4 điểm và không ngủ trên đỉnh Núi Cấm).

3. **Gắn nhầm `"bến xe Mỹ Đình"` cho chuyến tự lái & thiếu tách bạch chặng lên Hà Giang + chuẩn bị tại điểm đến:**
   - Khách đi **xe máy** vẫn thấy tiêu đề Ngày 1 là **`Hà Nội (bến xe Mỹ Đình) → Núi Cấm`**, gây hiểu nhầm có xe khách chạy thẳng từ Mỹ Đình tới Núi Cấm.
   - Đồng thời, trên panel lịch trình của `/assistant`, Ngày 1 nhảy thẳng vào `#1 Núi Cấm (14:55)` mà **không tách rõ phần di chuyển từ điểm xuất phát lên TP Hà Giang** (thời gian đi/tới, cách di chuyển) và **phần chuẩn bị khi tới nơi** (nhận phòng khách sạn, gửi/cất đồ, nhận & kiểm tra xe thuê, nghỉ chân — mang tính linh động, không fix cứng phút).

4. **Ngày 4 đi xuyên trưa không có giờ nghỉ trưa (`11:45–14:45` ở Sông Nho Quế):**
   - Điểm #2 ở Mèo Vạc kết thúc lúc `11:05`, chạy `12,5 km` (`~31 phút` + `5 phút` chụp ảnh) tới `Sông Nho Quế` lúc `11:45`, tham quan `180 phút` tới `14:45` rồi check-in nghỉ tối — **mất trắng bữa trưa cả ngày**.
   - Nguyên tắc được chốt ở Q4 & Q9: **vẫn phải có thời gian nghỉ trưa** ở các ngày tham quan qua trưa, **nhưng không chặn cứng giờ trưa cố định hay xóa điểm** — cho phép ăn sớm/muộn linh động kèm dòng lưu ý ngắn.

5. **Hiển thị ảnh từng điểm ở Ngày 2 & lặp gợi ý ăn tối ở Ngày 4:**
   - Trên Ngày 2 (có `+15 phút chụp ảnh`), các điểm ngắm cảnh ngắn bị gộp trong nhóm chụp ảnh nên các điểm sau chỉ hiện dòng chữ, mất khung ảnh riêng; nhiều điểm mới (`hg-seed-*`) cũng chưa có ảnh DB riêng.
   - Trên Ngày 4, mục `Ăn tối gần chỗ nghỉ · gợi ý` in trùng 2 dòng giống hệt nhau: **`Nhà của Đức · 2,9 km`**.

6. **AI hỏi lặp điểm xuất phát 2 lần (`(A) Bến Xe Giáp Bát`) rồi lại dừng thêm lượt chốt ngày:**
   - Người dùng đã nói rõ ngay tin đầu: *"từ bến xe giáp bát (hà nội)"* và *"đi 5 ngày"*.
   - AI bắt chọn nút **`(A) Bến Xe Giáp Bát`** **tới 2 lượt liên tiếp** với lý do *"có vài kết quả gần giống nhau"*, xong lại mở thêm 1 lượt chỉ để hỏi xác nhận ngày `28/12/2026` trước khi chịu lập lịch; và ở màn hình Ngày 1 sau đó tiêu đề còn bị trôi thành `Hà Nội (bến xe Mỹ Đình)`.

---

## Nguyên nhân gốc (đã kiểm chứng trên dữ liệu và code)

### R1 — Hạn về ngày cuối biến mặc định hệ thống thành lỗi chặn lưu & thiếu khả năng thu gọn đêm cuối

- `apps/web/src/modules/tripsage-chat/tripsage-chat-context.ts`: `DEFAULT_RETURN_DEADLINE_MINUTE = 1080` (`18:00`) và `resolveEffectiveJourney` tự điền `returnDepartureMinute = departureMinute` (`07:00`) làm mặc định ngầm.
- `apps/web/src/modules/trip-origin/journey-planner.ts`: `planJourney` kiểm tra `returnEnd > returnDeadlineMinute` và đánh `VIOLATION` (`RETURN_DEADLINE_MISSED`).
- `apps/web/src/modules/assistant-planning/planning-engine.ts` (`scheduleSelection`) và `apps/web/src/modules/trip-origin/journey-save-validation.ts` (`journeyValidationResult`) đẩy `VIOLATION` này vào `TRAVEL_TIME`, khiến `status = "NO_FEASIBLE_ITINERARY"`, `eligibleForFinalConfirmation = false` và `tripsage-chat-save.ts` chặn nút Lưu.
- `apps/web/src/modules/tripsage-chat/tripsage-chat-tools.ts`: `repairOvertimeItinerary` chỉ biết bỏ điểm hoặc rút thời lượng trên các ngày bị đánh dấu `badDays`; khi Ngày 5 là `RETURN_ONLY` (`0 điểm dừng`), vòng sửa bất lực, còn ghi chú `droppedStops` và chỉ dẫn trong `tripsage-chat-service.ts` khiến AI gợi ý *"muốn giữ thì thêm 1 ngày"*.

### R2 — Chặn đường và nhãn ngày dùng điểm tham quan thô thay cho Khu vực nghỉ đêm (`Overnight anchor`)

- `apps/web/src/components/trip-timeline/day-timeline.tsx` (`resolveDayRouteLabel`) và `apps/web/src/components/tripsage-chat/tripsage-plan-panel.tsx` nối trực tiếp `legs[0].from → legs.at(-1).to` trên danh sách `journeyPlan.legs` (chỉ có endpoint `ORIGIN` hoặc `ATTRACTION`).
- `apps/web/src/components/trip-timeline/evening-plan.ts` và `apps/web/src/lib/traveler-display-clean.ts` đã có logic `resolveOvernightAreaLabel` và bảng tâm thị trấn `OVERNIGHT_TOWN_CENTERS`, nhưng chưa tham gia vào định tuyến cuối ngày/đầu ngày sau hay nhãn đầu ngày.

### R3 — Nhãn điểm tập kết `"bến xe Mỹ Đình"` dùng chung mọi phương tiện & thiếu thẻ chặng lên Hà Giang trên panel trợ lý

- `apps/web/src/modules/tripsage-chat/trip-hubs.ts`: `HA_NOI` luôn mang tên `"Hà Nội (bến xe Mỹ Đình)"`, kể cả khi phương tiện là `Xe máy` hoặc `Ô tô` tự lái.
- `apps/web/src/components/trip-timeline/day-timeline.tsx` đã có slot `departureCard` và `returnCard` (dùng bởi `trips-view.tsx`), nhưng `apps/web/src/components/tripsage-chat/tripsage-plan-panel.tsx` đang **không truyền** `departureCard` và `returnCard`, khiến Ngày 1 trên `/assistant` không có thẻ di chuyển Hà Nội → TP Hà Giang lẫn bước chuẩn bị khi tới nơi, còn Ngày 5 `0 điểm dừng` chỉ hiện `"Ngày này chưa có điểm dừng."`.

### R4 — Quy tắc `takesLunchAfter` bỏ lọt điểm dài vắt ngang khung trưa

- `apps/web/src/modules/trip-planner/planner-engine.ts`: `LUNCH = { fromMinute: 675, toMinute: 840, byMinute: 720, minutes: 60 }` và `takesLunchAfter(departureMinute, nextDriveMinutes)` chỉ trả `true` khi `departureMinute >= 675` (đến `840`) hoặc `departureMinute + nextDriveMinutes > 720` (`12:00`).
- Khi Điểm #2 rời lúc `11:05` (`665`), chạy `31 phút` tới Sông Nho Quế (`11:36 <= 12:00`, chưa cộng `+5 phút` chụp ảnh), hàm trả `false`. Sông Nho Quế kéo dài `180 phút` (`11:45–14:45`) lấn hết cửa sổ trưa; sau đó `order === candidates.length - 1` và `departure > 840` nên mất luôn bữa trưa.
- `apps/web/src/components/trip-planner/planner-presentation.tsx` (`lunchBreakAfter`) dùng lại đúng điều kiện `takesLunchAfter`, nên mọi lớp timeline đều chịu chung điều kiện cứng này.

### R5 — Nhóm chụp ảnh ẩn ảnh điểm sau, thiếu ảnh fallback & lặp gợi ý buổi tối

- `apps/web/src/components/trip-timeline/day-timeline.tsx`: khi `groupConsecutivePhotoStops` gom các điểm chụp ảnh vào `dt-photo-group`, chỉ phần tử đầu hiện `<StopPhoto />`, các điểm đứng sau trong `.dt-photo-group-list` chỉ còn văn bản không ảnh.
- Trong DB DEV, 10 điểm seed mới (`hg-seed-*`) chưa có `ContentMedia` riêng (`media = 0`).
- Gợi ý buổi tối lặp `Nhà của Đức · 2,9 km`: `apps/web/src/modules/tripsage-chat/tripsage-activities.ts` (`nearbyActivitySuggestions`) chỉ khử trùng theo `used.has(place.placeId)` mà không khử trùng theo tên chuẩn hóa/vùng; đồng thời `apps/web/src/components/tripsage-chat/tripsage-conversation-state.ts` nối `[...suggestions, ...parsed.data.suggestions]` qua các lượt mà không khử trùng theo `slotId + kind + key`.

### R6 — Nominatim trả nhiều node cùng 1 điểm & `permitsOriginConfirmation` bỏ sót nhãn ngắn

- `apps/web/src/modules/trip-origin/origin-search-provider.ts` (`searchNominatim`): chỉ khử trùng khi `latitude === latitude && longitude === longitude`, nên cùng một bến xe có thể trả 2–3 node OSM cách vài chục mét (`(A) Bến Xe Giáp Bát, ...`, `Bến Xe Giáp Bát, ...`), khiến `findOrigin` thấy `candidates.length > 1` và không tự xác nhận ở Lượt 1.
- `apps/web/src/modules/tripsage-chat/tripsage-chat-origin.ts`: `labelSegments` tách theo `[,()-]+` và lọc `seg.length >= 4`, làm rớt ký tự phân biệt ngắn như `A` trong `(A)`. Khi người dùng bấm nút `(A) Bến Xe Giáp Bát` nhưng chuỗi ứng viên đầy đủ còn địa chỉ phía sau (hoặc bị cắt ở 120 ký tự trong `tripsage-chat-service.ts`), `uniqueSegments` bị rỗng → `permitsOriginConfirmation` trả `false` → `confirmOrigin` từ chối → AI gọi lại `findOrigin` lặp thêm một vòng y hệt.
- Sau khi xác nhận nơi xuất phát khi đã đủ số ngày (`5 ngày`), AI vẫn không lập bản lịch nháp ngay mà tốn thêm một lượt hỏi xác nhận ngày dự kiến.

---

## Solution

1. **Linh động giờ về & giữ đúng số ngày người dùng chọn (`D1`):** Hạ cấp `RETURN_DEADLINE_MISSED` từ `VIOLATION` chặn lưu xuống cảnh báo tư vấn; ưu tiên tối ưu đêm áp chót gọn về hướng đường về nếu giữ đủ điểm; AI giải thích rõ và hỏi nhẹ phương án điều chỉnh thay vì ép thêm ngày hoặc khóa lưu.
2. **Neo định tuyến & nhãn ngày theo `Khu vực nghỉ đêm` (`D2`):** Dùng tâm khu vực nghỉ đêm cố định (`OVERNIGHT_TOWN_CENTERS`) làm mốc về tối cuối ngày và mốc xuất phát sáng hôm sau / ngày về; tiêu đề ngày hiện `<Khu xuất phát> → <Vùng tham quan / Điểm về>`.
3. **Tách nhãn xe khách khỏi tự lái & tách rõ Chặng lên Hà Giang + Chuẩn bị tại Hà Giang (`D3`):** Chỉ gắn `"bến xe Mỹ Đình"` cho chặng tiếp cận xe khách; hiện thẻ Ngày 1 (cả `/assistant` lẫn Chuyến đã lưu) tách bạch thời gian di chuyển, phương tiện/cách đi, và bước chuẩn bị tại điểm đến (nhận phòng/cất đồ/nhận xe thuê/nghỉ chân) theo cơ chế co giãn linh động, không chặn cứng.
4. **Nghỉ trưa linh động (`D4`):** Đảm bảo mọi ngày tham quan qua trưa đều có slot `Nghỉ trưa` (kể cả trước điểm dài vắt qua trưa hoặc ăn sớm/muộn linh động), kèm dòng lưu ý ngắn khi lệch khung quen thuộc và tuyệt đối không đánh lỗi chặn hay bỏ điểm.
5. **Ảnh riêng cho mọi điểm dừng & khử trùng gợi ý (`D5`):** Hiển thị ảnh cho từng điểm dừng kể cả khi từng thuộc nhóm chụp ảnh, rà ảnh dự phòng theo điểm/vùng cho điểm mới, và khử trùng gợi ý ăn tối/buổi tối ở cả máy chủ lẫn client state.
6. **Xác nhận điểm xuất phát 1 lần & lập lịch ngay sau khi đủ `Minimum useful brief` (`D6`):** Gộp kết quả Nominatim trùng thực thể/gần nhau, sửa `permitsOriginConfirmation` nhận đúng nút/ký hiệu ngắn, khóa chống lặp `findOrigin`, lập ngay bản nháp khi đã có nơi đi + số ngày, và bảo vệ điểm xuất phát cụ thể không bị trôi về hub mặc định.

---

## User Stories

1. Là du khách đã chốt 5 ngày, tôi muốn dù ngày về có thể muộn hơn 18:00 (hoặc muộn hơn giờ tôi mong muốn), hệ thống vẫn cho tôi xem và **lưu chuyến**, chỉ gắn lưu ý rõ giờ dự kiến về và gợi ý cách chỉnh nếu tôi muốn.
2. Là du khách tối Ngày 4 nhận phòng ở Mèo Vạc (tối Ngày 1 ở TP Hà Giang), tôi muốn tiêu đề và chặng sáng Ngày 5 ghi xuất phát từ **Mèo Vạc → Hà Nội** (và Ngày 2 từ **TP Hà Giang → …**) với số km khớp thực tế thay vì ghi từ Sông Nho Quế hay đỉnh Núi Cấm.
3. Là người tự chạy xe máy từ Hà Nội, tôi không muốn thấy chữ `(bến xe Mỹ Đình)` làm tưởng nhầm xe khách, và tôi muốn thấy rõ **thời gian chạy xe lên TP Hà Giang**, **cách đi**, cùng **bước chuẩn bị khi tới Hà Giang** (về khách sạn cất đồ, nghỉ chân hoặc thuê/nhận xe) tách riêng trước điểm tham quan đầu tiên.
4. Là du khách có ngày tham quan dài như Sông Nho Quế 3 tiếng, tôi muốn lịch **luôn chừa thời gian nghỉ trưa** (linh động ăn sớm hoặc muộn một chút kèm lưu ý) thay vì đi thông từ 11:05 tới 14:45 không nghỉ ăn, và không bị đánh lỗi hay mất điểm vì chuyện lệch giờ trưa.
5. Là du khách xem Ngày 2 và Ngày 4, tôi muốn **mỗi điểm dừng đều có ảnh hiển thị**, và không bị lặp cùng một quán ăn (`Nhà của Đức · 2,9 km`) 2 lần trong danh sách tối nay.
6. Là du khách đã viết rõ `"từ bến xe Giáp Bát (Hà Nội), đi 5 ngày"`, tôi muốn trợ lý chốt ngay trong 1 lần (không bắt bấm `(A) Bến Xe Giáp Bát` tới 2 lần rồi lại hỏi thêm 1 lượt ngày đi nữa mới lập lịch), và giữ đúng Bến xe Giáp Bát chứ không trôi về Mỹ Đình.

---

## Implementation Decisions

### D1 — Giờ về ngày cuối là lưu ý tư vấn, không bao giờ chặn lưu ⚖️ (đổi bất biến Validator + ADR-57)

- **Thay đổi trong Validator / `journey-planner.ts` / `planning-engine.ts` / `journey-save-validation.ts`:**
  - Khi `returnEnd > requirement.journey.returnDeadlineMinute` (áp dụng cho cả mặc định `18:00` lẫn giờ về do người dùng tự đặt):
    - **Không** đặt `TRAVEL_TIME` thành `VIOLATION` và **không** khóa `eligibleForFinalConfirmation` / nút `Lưu chuyến`.
    - Phát sinh mục lưu ý thuộc `warnings` (ví dụ giữ mã dễ phân biệt `RETURN_DEADLINE_ADVISORY` hoặc `RETURN_DEADLINE_MISSED` nằm trong `warnings`, kèm giờ dự kiến về `HH:MM` và giờ mong muốn `HH:MM`, nêu rõ *"chuyến vẫn lưu được"*).
  - Trong `tripsage-chat-save.ts` và giao diện tab `Kiểm tra`: hiển thị cảnh báo giờ về như một **lưu ý tư vấn rõ ràng** (có thể mở giải thích nguyên nhân + gợi ý chỉnh nhẹ), không xếp vào danh sách lỗi bắt buộc phải sửa mới được lưu.
- **Tối ưu trước khi chấp nhận về muộn:**
  - Trong `balanceJourneyDays` / `arrangeTripRoute`, ưu tiên chọn cụm đêm áp chót gần đường về (TP Hà Giang / Quản Bạ / Yên Minh / Du Già tùy quỹ thời gian) khi giữ nguyên được các điểm người dùng chọn trong đúng `durationDays`.
  - Trong `repairOvertimeItinerary`: giữ nguyên số ngày `durationDays` người dùng đã chốt; không gọi quá giờ về là lỗi để xóa bớt điểm nếu ngày tham quan khác đã hợp lệ.
- **Giọng điệu trợ lý (`tripsage-chat-service.ts`, `tripsage-chat-tools.ts`):**
  - Không tự nhận "AI xếp sai" hay gạ *"thêm 1 ngày"* làm phương án chính khi người dùng đã chốt số ngày.
  - Chỉ viết 1 câu ngắn kèm nút trả lời nhanh khi có lưu ý về muộn: nêu giờ dự kiến về tới nơi so với giờ mong muốn, nói rõ vẫn lưu được, và hỏi muốn **`Giữ lịch này`**, **`Đi sớm hơn ngày cuối`** hay **`Bớt 1 điểm gần cuối`**.

### D2 — Neo định tuyến & tiêu đề ngày theo `Khu vực nghỉ đêm` ⚖️ (cập nhật `GLOSSARY.md` + ADR-57)

- **Chặng cuối ngày & chặng sáng hôm sau / ngày về (`journey-planner.ts`, `planning-engine.ts`):**
  - Tọa độ neo của một đêm nghỉ có điểm dừng cuối là `lastStop` (hoặc khu vực `overnightAreas` đã chốt) được lấy từ **`OVERNIGHT_TOWN_CENTERS`** qua `resolveOvernightAreaLabel(lastStop.area, lastStop.name, { latitude, longitude, chosenLodgingName })`.
  - Nếu `day < totalDays`:
    - Cuối ngày `day`, khi `lastStop` cách tâm khu nghỉ đêm `> 1 km`, chặng di chuyển cuối ngày tới khu nghỉ đêm (`lastStop → overnightCenter`) được định tuyến qua `RouteProvider.coordinateRoute` và hiện rõ ở cuối ngày (đồng bộ với thẻ `Nhận phòng · <Khu vực nghỉ đêm>`).
    - Sáng ngày `day + 1` bắt đầu đo đường từ **tâm khu vực nghỉ đêm của tối `day`** tới điểm đầu ngày `day + 1` (và ngày cuối/ngày về `RETURN` đo từ tâm khu vực nghỉ đêm cuối tới `ORIGIN`), trừ khi điểm cuối ngày trước đã nằm ngay trong thị trấn đó (`<= 1 km`).
  - **Bảo toàn bất biến dữ liệu & `Chosen lodging`:**
    - `OVERNIGHT_TOWN_CENTERS` là tập tọa độ thị trấn chuẩn cố định của hệ thống; nếu tuyến qua tâm thị trấn thiếu dữ liệu từ `RouteProvider` (`status !== "VERIFIED"`), vẫn đánh `INSUFFICIENT_DATA` / `"Chưa có dữ liệu tuyến"` chứ không tự bịa số hay giả PASS.
    - Nút chọn khách sạn/homestay từ Google Maps (`Chỗ nghỉ đã chọn`) giữ đúng định nghĩa trong [GLOSSARY.md](../../GLOSSARY.md): chỉ lưu lựa chọn và hiện khoảng cách tham khảo từ khu vực nghỉ đêm tới khách sạn đó, **không** đổi mốc giờ hay kết quả kiểm tra của lịch.
- **Tiêu đề tuyến đầu ngày (`resolveDayRouteLabel` trong `day-timeline.tsx` & `tripsage-plan-panel.tsx`):**
  - Ngày 1: `<Nơi xuất phát sạch (không gắn bến xe nếu tự lái)> → <Vùng trọng tâm / TP Hà Giang>`.
  - Ngày `2..N` có tham quan: `<Khu vực nghỉ đêm tối N-1> → <Khu vực trọng tâm của ngày N>` (ví dụ `TP Hà Giang → Sủng Là · Đồng Văn` hoặc `Yên Minh → Đồng Văn · Mèo Vạc`).
  - Ngày về (`RETURN_ONLY` hoặc cuối ngày về): `<Khu vực nghỉ đêm cuối> → <Điểm kết thúc / Hà Nội>`.

### D3 — Tách tên `"bến xe Mỹ Đình"` & Tách rõ "Chặng lên Hà Giang" + "Chuẩn bị tại Hà Giang" (linh động)

- **Quy tắc đặt tên điểm tập kết / xuất phát (`trip-hubs.ts`, `tripsage-chat-origin.ts`, `tripsage-plan-panel.tsx`, `traveler-trip-title.ts`):**
  - Nhãn **`bến xe Mỹ Đình`** chỉ dùng bên trong **chặng tiếp cận bằng xe khách (`Access leg`)** khi người dùng thực sự đi xe khách tại Mỹ Đình.
  - Khi người dùng **tự lái xe máy / ô tô từ Hà Nội** (`hub:HA_NOI` không kèm `accessLeg` xe khách), nhãn hiển thị tại điểm xuất phát và tiêu đề Ngày 1 là **`Hà Nội`** (giữ tên cụ thể nếu người dùng tự chọn điểm khác như **`Bến xe Giáp Bát`**, **`Cầu Giấy`**, tuyệt đối không tự đổi sang `"bến xe Mỹ Đình"`).
- **Hiển thị đầy đủ thẻ xuất phát & chuyển tiếp ở Ngày 1 (`tripsage-plan-panel.tsx` & `trips-view.tsx`):**
  - Khắc phục việc `tripsage-plan-panel.tsx` đang bỏ trống `departureCard` và `returnCard`: dựng thẻ **Chặng lên Hà Giang** đầu Ngày 1 (và **Chặng về** ở Ngày cuối / tab Ngày về) thống nhất giữa panel `/assistant` và trang chuyến đã lưu, gồm 3 phần:
    1. **Thời gian di chuyển:** Giờ khởi hành → dự kiến tới đầu TP Hà Giang (hoặc điểm tập kết), tổng `km`, thời lượng chạy + nghỉ dọc đường (kèm nhắc nghỉ ăn trưa dọc đường nếu cả buổi sáng–trưa chạy đường dài chưa tới điểm tham quan).
    2. **Cách di chuyển (`Di chuyển như nào`):** Tự chạy xe máy/ô tô từ điểm xuất phát lên TP Hà Giang, hoặc tách riêng chặng xe khách/máy bay ra điểm tập kết rồi thuê/nhận xe.
    3. **Chuẩn bị tại Hà Giang (`Chuẩn bị như nào` — LINH ĐỘNG, KHÔNG FIX CỨNG):** Thẻ bước chuyển tiếp ngay trước Điểm dừng #1 nêu rõ các việc thực tế khi vừa tới TP Hà Giang: *nhận phòng / gửi-cất hành lý ở khách sạn, nhận & kiểm tra xe thuê (nếu tới bằng xe khách/bay), nghỉ ngơi lấy sức trước khi bắt đầu tham quan*.
  - **Cơ chế giờ linh động cho bước chuẩn bị:** Nếu sau khi tới đầu Hà Giang/điểm đón mà khoảng thời gian tới giờ mở cửa của Điểm dừng #1 còn dư rộng (ví dụ tới TP Hà Giang sớm/còn rộng trước `18:30`), lịch có thể gợi ý khoảng chuyển tiếp nhẹ nhàng giữa `outboundLeg.endMinute` và `stop[0].arrivalMinute` (nằm sau chặng đi theo hợp đồng `fixedArrivals`), tự co giãn về `0` khi lịch sát giờ mở/đóng cửa, **tuyệt đối không tạo quy tắc chặn cứng hay bỏ điểm** chỉ vì bước chuẩn bị.

### D4 — Nghỉ trưa linh động (luôn có bữa trưa nhưng không chặn cứng)

- **Quy tắc đặt bữa trưa (`planner-engine.ts`, `tripsage-timeline.ts`, `planner-presentation.tsx`):**
  - Cập nhật `takesLunchAfter` (và cấu trúc ghi chú bữa trưa của ngày):
    1. Khi một ngày đã tham quan từ trước trưa (`cursor` hoặc điểm trước kết thúc trước `14:00`) và chưa có bữa trưa, nếu tiếp tục sang điểm kế tiếp (gồm thời gian di chuyển + đệm chụp ảnh + thời lượng tham quan điểm kế) khiến **giờ rời điểm kế vượt qua `12:30` (`750`)** → ưu tiên chèn **`Nghỉ trưa` (mặc định `lunchMinutes = 60`, hoặc theo `dayRhythm.lunchMinutes`) TRƯỚC điểm đó**.
    2. Nếu bị giới hạn giờ mở cửa khiến không kịp ăn trước điểm đó nhưng vẫn xong trước `15:00`, hệ thống lùi `Nghỉ trưa` ngay **SAU** điểm đó (hoặc trước điểm cuối cùng) để mọi ngày hoạt động qua khung trưa đều có slot `Nghỉ trưa`.
    3. Chỉ các ngày buổi chiều mới tới nơi (ví dụ Điểm #1 bắt đầu từ `>= 13:30–14:00` sau chặng dài từ Hà Nội) mới không ép slot nghỉ trưa vào giữa các điểm tham quan, mà ghi nhắc nghỉ ăn trưa dọc đường trên thẻ chặng đi.
  - **Không chặn cứng & có dòng lưu ý:**
    - Khung giờ nghỉ trưa hợp lệ được nới linh động (cho phép sớm từ `10:45` hoặc muộn tới `14:30`); **tuyệt đối không** đánh `VIOLATION` hay bỏ điểm chỉ vì giờ nghỉ trưa sớm/muộn.
    - Nếu giờ nghỉ trưa thực tế nằm ngoài khung quen thuộc `11:15–13:30`, timeline gắn dòng lưu ý ngắn ngay trên dòng nghỉ trưa (ví dụ *"Nghỉ trưa sớm để kịp đi điểm dài"* hoặc *"Nghỉ trưa muộn hơn khung quen thuộc"*).

### D5 — Ảnh cho từng điểm dừng & Khử trùng gợi ý buổi tối

- **Ảnh điểm dừng (`day-timeline.tsx`, `destination-visuals.ts`):**
  - Bỏ hành vi ẩn ảnh của các điểm đứng sau trong `dt-photo-group`: mọi điểm dừng trong lịch (kể cả các điểm ngắm cảnh ngắn) đều có khung ảnh `<StopPhoto />` riêng; nếu có gom tóm tắt thời gian chụp ảnh dọc đường thì vẫn đảm bảo không điểm nào bị mất ảnh thẻ khi hiển thị.
  - Bổ sung nhánh/ánh xạ ảnh đại diện trong `getDestinationVisual` (chỉ dùng tài nguyên hợp lệ trong `/public/images` hoặc media đã xác minh, ưu tiên đúng loại hình/địa danh) và đảm bảo `onError` luôn rơi về fallback hiển thị được, không để ô ảnh trắng.
- **Khử trùng gợi ý ăn tối / buổi tối (`tripsage-activities.ts`, `tripsage-conversation-state.ts`):**
  - Trong `nearbyActivitySuggestions`: bên cạnh `placeId`, khử trùng thêm theo khóa tên địa điểm đã chuẩn hóa (`foldName(cleanPlaceDisplayName(place.name))`) trong cùng slot (hoặc cùng khoảng cách `<= 0,2 km`) để hai pin Google Maps cùng một quán như `Nhà của Đức` không hiện 2 lần.
  - Trong `extractConversationState`: khi nhận thêm `data-suggestions` từ các lượt sau, hợp nhất/cập nhật theo `(slotId, kind, placeId || normalizedTitle)` thay vì nối mảng thô làm nhân đôi gợi ý cũ.

### D6 — Sửa vòng hỏi lặp điểm xuất phát & lập lịch ngay sau khi chốt nơi xuất phát

- **Gộp ứng viên Nominatim trùng thực thể (`origin-search-provider.ts`, `tripsage-chat-tools.ts`):**
  - Làm sạch tiền tố kỹ thuật OSM như `(A) `, `(B) ` khi so sánh tên chính (trừ khi thật sự cần phân biệt 2 địa điểm ở xa nhau).
  - Nếu nhiều kết quả Nominatim cho cùng truy vấn có tên chính trùng nhau và nằm trong **bán kính `<= 2 km`** của nhau (ví dụ các cổng/khu của cùng `Bến xe Giáp Bát`) → gộp về **1 ứng viên đại diện** có nhãn rõ ràng nhất (ưu tiên tên không có tiền tố thừa).
  - Khi còn 1 ứng viên đại diện duy nhất khớp với nơi người dùng vừa nêu trực tiếp (ví dụ `"từ bến xe Giáp Bát (Hà Nội)"`), `findOrigin` xác nhận ngay ở Lượt 1.
- **Khớp chuẩn nút chọn & khóa vòng lặp (`tripsage-chat-origin.ts`, `tripsage-chat-tools.ts`, `tripsage-chat-service.ts`):**
  - Sửa `permitsOriginConfirmation` / `labelSegments`: khớp được nhãn rút gọn hiển thị trên nút (`<= 120` ký tự hoặc bỏ phần tỉnh/mã bưu chính phía sau) và giữ cả đoạn phân biệt ngắn (kể cả 1–3 ký tự như `A` trong `(A)`) khi các ứng viên cùng tiền tố.
  - Nếu người dùng vừa bấm chọn đúng nhãn từ `originCandidates` của lượt trước, AI dùng `confirmOrigin` ngay — công cụ `findOrigin` không được ép trả về lại chính bộ ứng viên cũ theo vòng lặp vô hạn.
  - Điểm xuất phát cụ thể đã xác nhận (như `Bến xe Giáp Bát`) **được khóa ưu tiên**, không tự trôi về hub mặc định `Hà Nội (bến xe Mỹ Đình)` trong các lượt chỉnh tiếp theo trừ khi người dùng chủ động đổi nơi đi hoặc chọn xe khách từ Mỹ Đình.
- **Lập lịch ngay khi đủ `Minimum useful brief` (`tripsage-chat-service.ts`, `tripsage-chat-tools.ts`):**
  - Khi người dùng đã cung cấp **số ngày** + đã **xác nhận điểm xuất phát** (dù chưa nêu ngày đi chính xác), ngay trong chính lượt xác nhận điểm xuất phát đó AI gọi `listDestinations` + `proposeItinerary` với ngày gợi ý gần nhất (`assumedFields: ["startDate"]`) và nút `'Đổi ngày đi'`, thay vì dừng thêm một lượt chỉ để hỏi *"ngày XX/YY có hợp không?"*.

### D7 — Cập nhật tài liệu thuật ngữ & ADR trước khi viết code

- **[GLOSSARY.md](../../GLOSSARY.md):**
  - Cập nhật `Overnight anchor (khu vực nghỉ đêm)` (bổ sung vai trò làm mốc kết thúc/xuất phát chặng liên ngày tại tâm khu vực nghỉ đêm cố định; vẫn tách biệt với `Chosen lodging` là chỗ nghỉ gợi ý chưa kiểm tra).
  - Cập nhật `Return leg (chặng về)` (xuất phát từ khu vực nghỉ đêm cuối / điểm cuối nếu cùng khu vực).
  - Bổ sung định nghĩa thuần miền cho:
    - `Day route header (nhãn tuyến đầu ngày)`
    - `Arrival preparation step (bước chuẩn bị tại điểm đến)`
    - `Advisory notice (lưu ý linh động)` — phân biệt rõ với `Itinerary validation (kiểm tra tính hợp lệ)` chặn lưu.
- **[docs/decisions.md](../decisions.md):**
  - Ghi `ADR-57` (theo [decision-template.md](../templates/decision-template.md)) trước khi bắt đầu code D1–D6.

---

## Bất biến giữ nguyên & thay đổi đã chốt

- **Thay đổi đã chốt (qua Q6 & ADR-57):** Quá `returnDeadlineMinute` (hạn về ngày cuối) và giờ nghỉ trưa lệch khung không phải `VIOLATION` chặn lưu; cả hai là **lưu ý linh động (`advisory`)** và không được phép chặn nút `Lưu chuyến` hay tự ý xóa điểm của người dùng.
- **Giữ nguyên bất biến Validator đối với an toàn & tính khả thi thật:**
  - `CLOSED` / `OUTSIDE_OPENING_HOURS` (điểm đóng cửa), `VISIT_TOO_SHORT` (trừ trường hợp người dùng tự chọn có lưu ý hợp lệ), `TRANSFER_TOO_SHORT` (không đủ thời gian chạy xe thực), `SCHEDULE_CONFLICT` (trùng/chồng giờ tham quan), và `INSUFFICIENT_DATA` (thiếu dữ liệu định tuyến thật hoặc thiếu giờ mở cửa) **vẫn giữ nguyên**; thiếu dữ liệu không bao giờ thành PASS.
- **Lưu chuyến vẫn dùng `fixedArrivals` (`validateJourneyTiming`):** mọi khoảng đệm chuẩn bị, chụp ảnh hay nghỉ đều nằm ngoài `leg.durationSeconds` và giữa `leg.endMinute` → `arrivalMinute`.
- **Route Handler mỏng; bí mật Stadia/Google/OpenAI chỉ nằm ở máy chủ; không tự đặt phòng/đặt xe.**

---

## Testing Decisions

- **D1 (Hạn về không chặn cứng):**
  - Test `journey-planner`, `planning-engine` và `journey-save-validation`: lịch chạy 5 ngày có chặng về từ Mèo Vạc tới Hà Nội vượt `18:00` (hoặc vượt `returnDeadlineMinute` do người dùng đặt) → `TRAVEL_TIME` không còn `VIOLATION`, `eligibleForFinalConfirmation = true`, **lưu chuyến thành công**, và `warnings` chứa lưu ý giờ về dự kiến vs giờ mong muốn.
  - Test với hội thoại mẫu 5 ngày kiểu `d1ada90d`: ưu tiên kéo đêm 4 gọn hơn khi có phương án giữ đủ điểm mà không yêu cầu thêm ngày làm mặc định.
- **D2 (Mốc khu vực nghỉ đêm & tiêu đề ngày):**
  - Ngày 4 có `Sông Nho Quế` + khu nghỉ đêm `Mèo Vạc` (`OVERNIGHT_TOWN_CENTERS`): có chặng cuối ngày về khu nghỉ `Mèo Vạc`, ngày 5 xuất phát từ `Mèo Vạc → Hà Nội`, số `km` khớp chặng từ `Mèo Vạc`; tiêu đề Ngày 2 dùng `TP Hà Giang → <Khu vực trọng tâm Ngày 2>` chứ không ghi `Núi Cấm → Sủng Là`.
  - Chọn hoặc bỏ chọn 1 khách sạn Google Maps (`chosenLodgings`) không làm thay đổi giờ tham quan hay trạng thái `PASS` của lịch.
- **D3 (Tách `"bến xe Mỹ Đình"` & Chặng lên Hà Giang + Chuẩn bị tại Hà Giang):**
  - Chuyến tự lái xe máy từ Hà Nội không bao giờ hiển thị chữ `"bến xe Mỹ Đình"` trên tiêu đề Ngày 1, `tripsage-plan-panel` hay `trips-view`.
  - Trên `tripsage-plan-panel` và `trips-view`, Ngày 1 hiển thị tách biệt `departureCard` (**Chặng lên Hà Giang**: thời gian đi→tới TP Hà Giang, cách đi) và bước **Chuẩn bị tại Hà Giang** (nhận phòng/cất đồ/thuê xe, ghi rõ tính linh động); kiểm tra không bao giờ đánh `VIOLATION` hoặc xóa Điểm #1 khi ngày đầu hẹp giờ.
- **D4 (Nghỉ trưa linh động):**
  - Ca hồi quy từ Ngày 4 của `d1ada90d`: điểm #2 xong lúc `11:05`, đi `31 phút + 5 phút chụp ảnh` tới Sông Nho Quế (`180 phút`) → **luôn có slot `Nghỉ trưa`** (không bị mất trưa như `11:45–14:45`), giờ ăn trưa linh động (sớm trước Sông Nho Quế hoặc muộn hợp lý kèm dòng lưu ý), không phát sinh `VIOLATION`.
- **D5 (Ảnh mọi điểm dừng & khử trùng gợi ý):**
  - Mọi điểm dừng trong `DayTimeline` (kể cả khi nhiều điểm chụp ảnh nối tiếp nhau) đều render khung ảnh riêng.
  - `nearbyActivitySuggestions` và `extractConversationState` khử trùng 2 Google Places cùng tên `"Nhà của Đức"` (chỉ giữ 1 dòng trong `Ăn tối gần chỗ nghỉ`), và khi `data-suggestions` phát nhiều lượt cho cùng slot không bị lặp lại.
- **D6 (Chống hỏi lặp điểm xuất phát & giữ điểm đã chốt):**
  - `searchNominatim` / `findOrigin` gộp các kết quả `"Bến xe Giáp Bát"` cùng khu (`<= 2 km`) thành 1 ứng viên sạch, xác nhận ngay ở Lượt 1 khi người dùng đã nêu `"từ bến xe Giáp Bát (Hà Nội)"`.
  - Trường hợp có nhiều ứng viên với tiền tố `(A) `, `(B) `, bấm nút `(A) ...` xác nhận ngay trong `confirmOrigin` ở lượt kế tiếp, không lặp lại `findOrigin`.
  - Khi người dùng đã chọn `Bến xe Giáp Bát` và nêu `5 ngày`, lập ngay bản lịch nháp ở lượt kế, và điểm xuất phát không bị rơi về `Hà Nội (bến xe Mỹ Đình)`.

---

## Out of Scope

- Đặt phòng khách sạn, đặt vé xe khách/máy bay hay giữ chỗ thuê xe máy thật.
- Lưu sở thích cá nhân dài hạn ngoài phạm vi chuyến đi hiện tại.
- Tối ưu đa mục tiêu bằng bộ giải chính xác (MILP): vẫn dùng heuristic có kiểm chứng định tuyến thật.
- Tự động đổi giờ hoặc thêm ngày trái ý người dùng khi không có sự đồng ý.

---

## Thứ tự triển khai đề xuất (chỉ làm sau khi duyệt spec & ghi ADR-57)

1. **Tài liệu nền:** Cập nhật `GLOSSARY.md` + ghi `ADR-57` vào `docs/decisions.md`.
2. **D6 (Tìm & xác nhận điểm xuất phát + lập lịch sớm):** `origin-search-provider.ts`, `tripsage-chat-origin.ts`, `tripsage-chat-tools.ts`, `tripsage-chat-service.ts` + tests.
3. **D1 & D4 (Giờ về không chặn cứng + Nghỉ trưa linh động):** `planner-engine.ts`, `journey-planner.ts`, `planning-engine.ts`, `journey-save-validation.ts`, `tripsage-chat-save.ts`, `tripsage-chat-tools.ts`, `tripsage-timeline.ts`, `planner-presentation.tsx` + tests.
4. **D2 (Mốc khu vực nghỉ đêm cố định & tiêu đề ngày):** `journey-planner.ts`, `planning-engine.ts`, `day-timeline.tsx`, `tripsage-plan-panel.tsx`, `trips-view.tsx` + tests.
5. **D3 & D5 (Tách Mỹ Đình/Giáp Bát, thẻ Chặng lên Hà Giang + Chuẩn bị linh động, ảnh từng điểm & khử trùng gợi ý tối):** `trip-hubs.ts`, `tripsage-plan-panel.tsx`, `day-timeline.tsx`, `destination-visuals.ts`, `tripsage-activities.ts`, `tripsage-conversation-state.ts`, `trips-view.tsx` + tests.
6. **Kiểm tra cuối & nghiệm thu:** `tsc --noEmit`, full `vitest`, build kiểm tra, `git diff --check`, cập nhật trạng thái spec & `docs/ai-progress.md`.

---

## Quyết định đã duyệt trong phỏng vấn Q1–Q12 (ghi vào ADR-57 khi bắt đầu làm)

1. ⚖️ **Bỏ chặn cứng `RETURN_DEADLINE_MISSED` (Q1, Q6):** cả giờ về mặc định `18:00` lẫn giờ về người dùng tự đặt đều chỉ tạo lưu ý kèm lựa chọn tinh chỉnh, cấm khóa Lưu chuyến.
2. ⚖️ **Neo chặng cuối ngày & sáng hôm sau theo `OVERNIGHT_TOWN_CENTERS` + đổi tiêu đề ngày theo khu vực nghỉ đêm (Q2, Q7:A, Q11):** giữ `Chosen lodging` là gợi ý không làm nhảy kiểm tra lịch.
3. **Tách `"bến xe Mỹ Đình"` khỏi chuyến tự lái & thêm thẻ Ngày 1 tách Chặng lên Hà Giang + bước Chuẩn bị tại Hà Giang linh động (Q3, Q8, Q10):** tuyệt đối không fix cứng khung phút cho bước chuẩn bị.
4. **Nghỉ trưa linh động (Q4, Q9):** luôn có `Nghỉ trưa` khi tham quan qua trưa (ưu tiên chèn trước điểm dài vượt `12:30`), cho phép sớm/muộn kèm lưu ý, không chặn cứng.
5. **Hiện ảnh mọi điểm dừng + khử trùng gợi ý tối (Q5):** không ẩn ảnh ở điểm bị gộp và khử trùng tên quán/state.
6. **Gộp ứng viên điểm xuất phát trùng thực thể, sửa khớp nhãn ngắn `(A)`, khóa điểm xuất phát đã chốt và lập lịch ngay sau khi chốt nơi đi (Q12).**

---

## Ghi chú triển khai (2026-11-25)

- **Chuỗi commit trên nhánh `master`:**
  - `c30c286` (`docs: cập nhật GLOSSARY, ghi ADR-57 và spec d1ada90d`) — thuật ngữ D7 (`Return leg`, `Day route header`, `Arrival preparation step`, `Advisory notice`, `Overnight anchor`) và `ADR-57`.
  - `7de08d3` (`feat(chat): khử trùng điểm xuất phát, sửa khớp nhãn ngắn và lập lịch ngay khi chốt nơi đi (D6)`) — `ORIGIN_DUPLICATE_RADIUS_KM = 2`, `cleanOriginCandidateLabel`, `deduplicateOriginResults`, `shouldPreserveConfirmedSpecificOrigin`, chống lặp `findOrigin`.
  - `26f482e` (`feat(planner): bỏ chặn cứng giờ về và bổ sung nghỉ trưa linh động (D1, D4)`) — chuyển `RETURN_DEADLINE_MISSED` thành advisory không chặn xác nhận/lưu/sửa; giữ `Nghỉ trưa` linh động (sớm trước điểm dài hoặc muộn cuối trưa) kèm test hồi quy `journey-d1-d4-adr57.vitest.test.ts`.
  - `32239d2` (`feat(planner): neo chặng và tiêu đề ngày theo khu vực nghỉ đêm (D2)`) — `resolveOvernightAnchorTown` (`overnight-anchor.ts`), `overnightStays` trong `journeyPlanSchema`, neo chặng sáng/về (`RETURN_ONLY`) theo `OVERNIGHT_TOWN_CENTERS`, cập nhật `resolveDayRouteLabel` & card `Nhận phòng · <Khu vực>`, giữ `chosenLodgings` không làm đổi định tuyến/kiểm tra (`journey-d2-overnight-anchor.vitest.test.ts`).
  - `d8f1238` (`feat(ui): tách chặng chuẩn bị Hà Giang, làm sạch nhãn tự lái, ảnh từng điểm và khử trùng gợi ý (D3, D5)`) — `formatTravelerOriginLabel`, `ItineraryOriginDepartureCard` (phần *Chặng lên Hà Giang* + *Chuẩn bị tại TP Hà Giang* badge `linh động`), thumbnail cho mọi điểm trong `dt-photo-group`, mở rộng `getDestinationVisual`, và `dedupeTimelineSuggestions` xuyên lượt (`tripsage-d3-d5-adr57.vitest.test.ts`).
  - `be19eb7` (`fix(planner): tôn trọng tên khu vực nghỉ đêm hợp lệ và đồng bộ test tone ADR-57`) — ưu tiên khu vực nghỉ đêm hợp lệ theo `area` của điểm đến và đồng bộ `area` lúc Lưu chuyến + `tripsage-chat-tone.vitest.test.ts`.
- **Kiểm tra sau commit code cuối (`be19eb7`):**
  - `npx tsc --noEmit -p .`: pass (0 lỗi).
  - `npx vitest run --config vitest.config.mts src`: `484 passed | 40 skipped | 1 failed (525 files)` (`4904 passed | 237 skipped | 1 todo | 1 failed (5143 tests)`); lỗi duy nhất là lỗi CSS pre-existing ở `src/components/tripsage-chat/tripsage-cost-card.vitest.test.ts` (Bug 3 `--tv-ink-3`), còn 40 file skip là DB/live/env-gated.
  - `npx varlock run -- cmd /c "set NODE_ENV=production&& npm run build"`: Next.js compile (`18.1s`) và TypeScript (`63s`) pass; bước prerender `/dashboard` & `/_global-error` lỗi pre-existing `useContext` khi chạy cục bộ dưới `varlock` + `NODE_ENV` từ `.env`.

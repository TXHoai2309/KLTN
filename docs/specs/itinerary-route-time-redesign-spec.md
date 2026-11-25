# Spec: Lịch trình đi đúng tuyến, dàn đều cả ngày và nhiều trải nghiệm hơn

Trạng thái: **đã duyệt và đã triển khai** (2026-11-24 duyệt, 2026-11-25 triển khai, chưa commit), ADR-55. Xem "Ghi chú triển khai" ở cuối.
Phạm vi: lập lịch trên `/assistant` (luồng tripsage-chat → `scheduleSelection` → `planJourney`) và lõi `trip-planner` dùng chung. Trang `/trips/new` là quyết định riêng (xem "Quyết định cần duyệt").
Nền: phân tích [17-itinerary-planning-redesign.md](../analysis/17-itinerary-planning-redesign.md); dữ liệu [17-destination-seed-2026-11-24.sql](../analysis/17-destination-seed-2026-11-24.sql); ADR-42, ADR-46 §2, ADR-48, ADR-51, ADR-53.
Ca tham chiếu: hội thoại `fdf35a74-25b4-4283-b313-d096c17373f0` (5 ngày, xe máy, xuất phát TP Hà Giang).

## Problem Statement

Lịch do trợ lý lập không giống cách một khách du lịch thật đi Hà Giang:

- **Ngược đường.** Ngày 2 đi Yên Minh → Dinh Vương → quay lại Sủng Là → Đồng Văn. Ngày 3–4 đi Nho Quế → Mèo Vạc → ngược lên Pả Vi. Chuỗi 15 điểm dài khoảng 224 km đường chim bay, trong khi xếp lại cùng 15 điểm chỉ còn khoảng 176 km.
- **Dồn buổi sáng, chiều trống.** Bốn trên năm ngày kết thúc tham quan lúc 09:11, 12:41, 13:00 và 11:42. Riêng ngày 1, dù xuất phát ngay TP Hà Giang, chỉ có 2 điểm và xong lúc 9h sáng.
- **Ít điểm, thiếu trải nghiệm trên đường.** Mỗi ngày bị chặn theo số điểm (2/3/4). Khi lịch lỗi, hệ thống chỉ biết bớt điểm. Không có thời gian dừng chụp ảnh ở các dốc, đèo, vốn là trải nghiệm chính khi đi xe máy.
- **Giờ cứng nhắc.** Giờ được cộng chính xác từng phút (di chuyển + tham quan). Xe luôn chạy từ 06:00. Khi lịch lỗi, thời lượng tham quan bị rút về mức tối thiểu ở tất cả các ngày (Sủng Là và Mèo Vạc 60 → 30 phút).
- **Dữ liệu mỏng.** Production chỉ có 22 điểm công khai: 5 điểm còn tiền tố `[Tam]`, cả 22 điểm có `isOutdoor = false`, cùng một khu vực "khu vực hà giang", và không có điểm dừng chụp ảnh ven đường nào.

Nguyên nhân gốc, đã kiểm trên code và dữ liệu thật:

1. AI tự quyết thứ tự điểm mà không có toạ độ. Bộ tối ưu tuyến chỉ chạy dự phòng.
2. Bộ tối ưu có sẵn quy đổi điểm sở thích thành 5 km.
3. Tối ưu thời tiết được phép đổi chỗ nguyên hai ngày.
4. Mỗi ngày bị giới hạn theo số điểm và xếp sớm nhất có thể.
5. Thời lượng bị rút ở mọi ngày khi có lỗi.
6. Không có cơ chế thêm điểm vào ngày còn trống.

## Solution

- **Server sở hữu tuyến đường.** AI chỉ chọn danh sách điểm muốn đi. Server dựng vòng đi từ nơi xuất phát rồi về, gỡ chỗ ngược đường (2-opt, Or-opt), chia ngày theo thời gian và để mỗi đêm kết thúc gần một thị trấn có chỗ ngủ.
- **Ngày là quỹ thời gian, không phải số khe.**
  - Rời chỗ ngủ khoảng 07:30, tới thị trấn ngủ trước khi trời tối.
  - Mỗi chặng có khoảng đệm dừng chụp ảnh.
  - Luôn có giờ ăn trưa quanh 12:00.
  - Thời lượng tham quan co giãn theo quỹ ngày.
  - Giờ hiển thị làm tròn: "khoảng 9:15".
- **Lấp đầy ngày bằng điểm đáng đi.** Ngày còn trống thì tự chèn điểm có giá trị cao nhất trên mỗi phút đi thêm (ưu tiên điểm hot và điểm ngắm ven đường). Khi phải bớt điểm, bỏ điểm kém giá trị nhất, không bỏ "điểm cuối ngày".
- **Bỏ giới hạn nhịp đi 2/3/4 điểm.** ⚖️ Người thích đi chậm chỉ đổi độ thoáng của ngày (kết thúc sớm hơn, đệm dài hơn), không bị cắt số điểm.
- **Bổ sung dữ liệu:**
  - Thêm 10 điểm, trong đó có các điểm dừng chụp ảnh trên đường đèo và chợ phiên Chủ nhật.
  - Sửa 22 điểm cũ: bỏ `[Tam]`, bật `isOutdoor` cho điểm ngoài trời, điền thời lượng còn thiếu, mở rộng giờ cho điểm ngắm ven đường.
- **Validator giữ nguyên quy tắc.** Mô hình mới chỉ *thêm khoảng trống* vào lịch, nên mọi kiểm tra hiện có vẫn áp dụng như cũ.

## User Stories

### Tuyến đường

1. Là du khách, tôi muốn lịch đi một vòng liền mạch, không quay đầu về chỗ vừa qua, để không mất thời gian chạy xe vô ích.
2. Là du khách, tôi muốn các điểm gần nhau nằm cùng một ngày, theo đúng thứ tự trên đường đi, để chặng di chuyển ngắn nhất.
3. Là du khách, tôi muốn mỗi tối kết thúc gần một thị trấn có chỗ ngủ (Yên Minh, Đồng Văn, Mèo Vạc, Du Già…), để dễ tìm nhà nghỉ và không phải chạy đêm.
4. Là du khách, khi tôi yêu cầu nghỉ đêm ở một nơi, tôi muốn yêu cầu đó luôn được giữ khi lịch được xếp lại.
5. Là du khách, khi tôi bắt buộc một điểm, tôi muốn điểm đó luôn có trong lịch dù server xếp lại thứ tự.
6. Là du khách, tôi muốn việc tránh thời tiết xấu không làm lịch đi ngược đường.

### Thời gian trong ngày

7. Là du khách, tôi muốn ăn sáng rồi đi lúc khoảng 7:30, thay vì lên đường lúc 6:00.
8. Là du khách, tôi muốn buổi chiều cũng có điểm tham quan, để không phí nửa ngày.
9. Là du khách đi xe máy, tôi muốn có thời gian dừng chụp ảnh dọc đường, có gợi ý dốc/đèo nên dừng, để tận hưởng cung đường.
10. Là du khách, tôi muốn lịch luôn có bữa trưa quanh 12:00, tốt nhất ở thị trấn hoặc phố cổ.
11. Là du khách, tôi muốn điểm ngắm cảnh được xếp vào giờ đẹp (sáng sớm hoặc chiều muộn) khi có thể.
12. Là du khách, tôi muốn tới chỗ ngủ trước khi trời tối.
13. Là du khách, tôi muốn giờ hiển thị dạng "khoảng 9:15", để hiểu đây là ước tính, không phải giờ phải có mặt đúng từng phút.
14. Là du khách, khi một ngày còn trống, tôi muốn thấy khối "Thời gian tự do" kèm gợi ý quanh đó, thay vì một khoảng trống.
15. Là du khách, khi một ngày quá dày, tôi muốn chỉ ngày đó bị rút gọn, các ngày khác giữ nguyên thời lượng.

### Số điểm và trải nghiệm

16. Là du khách, tôi muốn lịch có đủ các điểm nổi tiếng (Lũng Cú, Mã Pì Lèng, Nho Quế, Dinh Vương, phố cổ Đồng Văn, Thẩm Mã, Cổng trời Quản Bạ) khi số ngày đủ.
17. Là du khách, tôi muốn số điểm mỗi ngày do thời gian quyết định, không bị chặn ở 2, 3 hay 4 điểm.
18. Là du khách, khi phải bỏ bớt điểm, tôi muốn điểm bị bỏ là điểm kém nổi bật nhất, và được báo tên.
19. Là du khách thích đi chậm, tôi muốn nói "đi thong thả" để ngày kết thúc sớm hơn và có nhiều thời gian nghỉ hơn.
20. Là du khách, tôi muốn được gợi ý chợ phiên khi lịch rơi vào sáng Chủ nhật.

### Dữ liệu

21. Là du khách, tôi muốn không thấy tên điểm có tiền tố "[Tam]".
22. Là quản trị viên, tôi muốn các điểm mới thêm bằng SQL được đánh dấu "chưa xác minh vị trí", kèm nguồn toạ độ, để kiểm tra lại sau.

## Implementation Decisions

### Vai trò AI và server ⚖️

- `proposeItinerary.selection.days` vẫn giữ nguyên dạng dữ liệu nhưng chỉ còn là **gợi ý**. Server dùng *tập điểm* (và các ràng buộc) để tự xếp thứ tự và chia ngày. Cách AI chia ngày chỉ dùng làm tiêu chí hoà điểm.
- Giữ nguyên vai trò của `mustIncludeDestinationIds`, `overnightAreas` (ADR-53), `visitMinutes` (ADR-48/51) và các điểm khoá khi chỉnh sửa theo phạm vi.
- Sửa theo phạm vi (`scope.affectedDays`): chỉ xếp lại trong các ngày bị ảnh hưởng, ngày khác giữ nguyên.
- `listDestinations` trả thêm `routeOrder` (thứ tự trên vòng cung, do server tính) để AI giới thiệu đúng thứ tự. Không trả toạ độ thô.
- Prompt (`tripsage-chat-service.ts`):
  - Bỏ câu "mỗi ngày không vượt nhịp đi (thong thả 2, vừa 3, nhiều 4 điểm)".
  - Thay `repairHint` "bớt 1-2 điểm" bằng hướng dẫn nêu lý do và đề xuất thêm ngày hoặc đổi điểm.

### Xếp tuyến (lõi `planner-order.ts`)

- **Chi phí ước lượng (không gọi API):** `phút(a,b) = haversine × hệ số quanh co ÷ tốc độ trần` (`MAX_AVERAGE_KMH`).
  - Hệ số khởi điểm 1,5.
  - Khi đã có chặng route thật trong cùng lượt, hiệu chỉnh hệ số bằng trung vị của tỉ số giữa thời gian thật và thời gian ước lượng.
- **Dựng vòng:** đi từ nơi xuất phát qua mọi điểm rồi về, bằng cheapest insertion, sau đó cải thiện bằng 2-opt và Or-opt (dời đoạn 1–3 điểm). Dùng lại và mở rộng `untangleRoundTrip`.
- **Bỏ trọng số sở thích khỏi chi phí tuyến.** Sở thích chỉ dùng khi chọn điểm (mục "Lấp đầy ngày").
- **Chiều đi:** chọn theo tổng phạt khung giờ (chợ phiên, giờ đẹp, ràng buộc nghỉ đêm). Hoà thì lấy chiều có điểm đầu gần nơi xuất phát hơn.
- **Không có nơi xuất phát đã xác nhận:** dùng điểm tập kết giả định (ADR-44) như hiện nay.
- **Kiểm bằng route thật:** gọi provider cho các chặng liền kề như hiện nay. Nếu một chặng thật lớn hơn 2 lần ước lượng, thay số thật vào ma trận và chạy lại Or-opt, tối đa 2 vòng, có cache theo cặp trong lượt (dùng lại cơ chế `once` của `planJourneyFittingStops`).

### Chia ngày (mở rộng `balanceJourneyDays`)

- Quy hoạch động trên chuỗi đã xếp, không giới hạn số điểm mỗi ngày.
- Chi phí mỗi ngày gồm:
  - vi phạm (giữ thang 100/10 như hiện nay);
  - vượt quỹ thời gian;
  - chiều trống (`idleCost`, đã có);
  - **khoảng cách từ điểm cuối ngày tới thị trấn ngủ gần nhất**: phạt nếu vượt 20 phút ước lượng.
- Thị trấn ngủ là danh sách hằng có toạ độ: TP Hà Giang, Tam Sơn (Quản Bạ), Yên Minh, Đồng Văn, Mèo Vạc, Du Già.
  - `shortcut: hằng trong code, chuyển thành dữ liệu khi admin cần quản lý`.
  - Toạ độ lấy từ tâm thị trấn và phải ghi nguồn.
- Ràng buộc `overnightAreas` là ràng buộc cứng của bước này.
- `planJourney` vẫn được thử các phương án dời ranh giới ngày. Trên `/assistant`, bật `preferFullDays` để hoà điểm theo độ trống của ngày (hiện chỉ luồng form bật).

### Mô hình thời gian (`schedulePlannerDays`) ⚖️

| Thành phần | Quy tắc |
|---|---|
| Rời chỗ ngủ (ngày ≥ 2) | `MORNING_DEPARTURE_MINUTE` 360 → **450** (07:30) |
| Ngày 1 | Giờ khởi hành của người dùng (giữ nguyên) |
| Chặng | Route thật + nghỉ dọc đường theo `rest-policy` (giữ nguyên) |
| Đệm cảnh quan | Xe máy `min(25, làm tròn 5'(0,2 × phút chạy))`, ô tô hệ số 0,15; chặng dưới 10 phút không có đệm |
| Thời lượng | Xếp theo `suggested`; thừa quỹ thì kéo dài điểm giá trị cao tới `max = round(1,5 × suggested)`; thiếu quỹ thì rút **chỉ trong ngày đó**, không dưới `min` |
| Ăn trưa | Một khối `dayRhythm.lunchMinutes ?? 60`, đặt ở lần chuyển điểm gần 12:00 nhất trong khung 11:15–13:30 (bỏ điều kiện "phải còn điểm sau"). Nếu điểm quanh trưa là phố cổ/thị trấn/chợ thì đặt ngay sau điểm đó |
| Giờ đẹp (mềm) | Điểm `isOutdoor` hoặc có `bestVisitTime`: thưởng khi vào 07:30–10:00 hoặc 15:00–17:30, phạt sau hoàng hôn (`sun-times`) |
| Kết thúc ngày | Tới thị trấn ngủ trước `min(hoàng hôn + 30', 18:30)`; khung tham quan của Validator giữ 08:00–18:00 |
| Làm tròn | Giờ đến làm tròn **lên** bội 5 phút |
| Giờ trống | Từ 45 phút trở lên thì hiện khối "Thời gian tự do" kèm gợi ý `dN-free` (ADR-45/46) |

- **Vị trí của đệm và làm tròn:** cả hai nằm *sau* `leg.endMinute` và *trước* `arrivalMinute`. `validateJourneyTiming` so khớp `leg.endMinute = start + duration + rest` một cách chính xác, nên không được cộng đệm vào chặng.
- **Hiển thị đệm:** hiện thành dòng "Dừng chụp ảnh dọc đường" trên timeline. Nếu có điểm ngắm (danh mục) cách chặng dưới 10 phút đi vòng thì ghi tên điểm đó.
- **Rút gọn khi lịch lỗi:** thay phần rút toàn cục ở `tripsage-chat-tools.ts:1101` bằng rút theo ngày. `FLEX_SCHEDULE` nêu rõ những ngày bị rút.

### Bỏ giới hạn nhịp đi ⚖️

- Bỏ việc dùng `PACE_STOP_LIMIT` làm giới hạn số điểm ở `selectPlannerDays`, `balancePlannerDays`, `planJourney`, `balanceJourneyDays` và `assertPlanningSelection` (lỗi `PACE_LIMIT`).
- Giới hạn còn lại:
  - tối đa 28 điểm mỗi lịch (giữ nguyên);
  - quỹ thời gian mỗi ngày;
  - tổng thời lượng tham quan mỗi ngày không quá 600 phút (giữ nguyên).
- Trường `pace` vẫn còn trong schema để tương thích dữ liệu cũ, nhưng đổi nghĩa:
  - `RELAXED`: kết thúc ngày 17:00, đệm ×1,5, ưu tiên kéo dài tham quan;
  - `MODERATE` và `PACKED`: như mặc định.
- Trên `/assistant` không hỏi nhịp đi. Chỉ ghi `RELAXED` khi người dùng tự nói muốn đi chậm.
- Cập nhật các chip đang nhắc "Giảm còn 3 điểm/ngày" (`tripsage-chat-service.ts:718`).

### Lấp đầy ngày (thay vòng "bớt điểm cuối")

1. Sau bước chia ngày, với mỗi ngày còn ít nhất 40 phút trống, xét các điểm chưa dùng đang mở cửa vào ngày đó.
2. Chi phí chèn là số phút đi vòng (ước lượng) + `suggested` + đệm, lấy vị trí rẻ nhất trong ngày.
3. Giá trị = `3 × nổi bật + khớp sở thích + 1 nếu là điểm ngắm ven chặng (đi vòng < 10')`.
4. Chèn điểm có `giá trị / phút thêm` cao nhất, lặp tới khi không còn điểm nào vừa quỹ ngày, giờ mở cửa và hạn về.
5. Kiểm bằng route thật một lần. Nếu vượt quỹ thì bỏ điểm có tỉ số thấp nhất, trừ điểm bắt buộc và điểm nghỉ đêm (ADR-53).
6. `STOPS_DROPPED` nêu tên các điểm bị bỏ.
7. **Điểm nổi bật:** mở rộng `FEATURED_NAMES` với Thẩm Mã, Cổng trời, Lô Lô Chải, Pả Vi và Du Già. Cột `priority` là quyết định sau.
8. **Lịch người dùng đã chỉnh:** chỉ lấp các ngày người dùng không khoá. Không tự thêm vào ngày người dùng vừa bỏ bớt điểm.

### Tối ưu thời tiết (`planner-weather-preference.ts`)

- Hoán vị nguyên ngày chỉ được giữ nếu chi phí tuyến ước lượng tăng không quá 5%.
- Hoán vị trong ngày được sắp theo quãng đường trước, phạt thời tiết sau.
- Giữ giới hạn đi vòng hiện có (20%, 30 phút mỗi ngày).

### Dữ liệu

- Áp dụng [17-destination-seed-2026-11-24.sql](../analysis/17-destination-seed-2026-11-24.sql), một transaction, chạy lại được:
  - **A1** bỏ `[Tam]` ở 5 điểm.
  - **A2** bật `isOutdoor` cho 10 điểm.
  - **A3** điền thời lượng cho Pả Vi Thượng (45/20). Cao nguyên đá Đồng Văn cố ý để trống vì là cả một vùng, không phải một điểm dừng.
  - **A4** mở 06:00–18:30 cho 5 điểm ngắm ven đường.
  - **B** thêm 10 điểm (`VISIBLE`, `locationVerified = false`, `locationEvidence` ghi nguồn OpenStreetMap), mỗi điểm đủ 7 `opening_day`. Hai chợ phiên chỉ mở Chủ nhật 06:00–12:00.
- Khu vực (`area`): chạy script có sẵn `apps/web/scripts/fix-content-data-2026-11.ts` (nhóm B3) thay vì lặp lại trong SQL.
- Chạy trên DB dev trước, rồi production. URL DB production do chủ dự án cung cấp; `apps/web/.env` hiện trỏ tới DB dev.

### Bất biến giữ nguyên

- Constraint Validator: mọi quy tắc hiện có (khung tham quan 08:00–18:00, giờ mở cửa, thời lượng tối thiểu, thời gian di chuyển, chặng/nghỉ khớp chính xác, hạn về).
- Lưu chuyến chạy lại `planJourney` với `fixedArrivals`: giờ đến đã đề xuất phải được giữ nguyên, đệm không được tính lại.
- Thiếu dữ liệu không bao giờ được coi là đạt. Điểm ngoài danh mục (Google Places) vẫn là `INSUFFICIENT_DATA`.
- Khoá định tuyến Stadia chỉ ở server.
- AI không tự đặt giờ, toạ độ hay giá trong lời văn.

## Testing Decisions

- **Đơn vị, lõi `trip-planner`** (vitest, không gọi mạng):
  - Xếp tuyến: một bộ điểm cố định trên vòng Hà Giang (toạ độ production) cho ra thứ tự không có góc rẽ > 120° kèm quãng lùi > 5 km. Tổng quãng đường ước lượng không vượt 1,05 lần kết quả 2-opt chuẩn.
  - Chia ngày: điểm cuối của các ngày không phải ngày về nằm trong 20 phút ước lượng quanh một thị trấn ngủ. Ràng buộc nghỉ đêm luôn được giữ.
  - Mô hình thời gian: ngày ≥ 2 rời lúc 07:30; trưa nằm trong 11:15–13:30; giờ đến là bội 5; đệm nằm giữa `leg.endMinute` và `arrivalMinute`; rút gọn chỉ ở ngày lỗi.
  - Lấp đầy: ngày trống được chèn điểm theo tỉ số giá trị/phút; khi vượt thì bỏ điểm tỉ số thấp nhất; điểm bắt buộc không bao giờ bị bỏ.
  - Chợ phiên chỉ được xếp vào Chủ nhật.
- **Validator và lưu chuyến:** lịch mới PASS `validatePlannerDays` và `validateJourneyTiming`. `journey-save-validation` với `fixedArrivals` tái hiện đúng giờ đến (test hồi quy riêng).
- **Hồi quy:** cập nhật các test đang ghim giới hạn 2/3/4 (`PACE_LIMIT`, `planner-day-balance`, `tripsage-fewer-turns`, chip "Giảm còn 3 điểm/ngày") theo quyết định mới, không xoá test im lặng.
- **Nghiệm thu với ca tham chiếu** (5 ngày, xe máy, TP Hà Giang, dữ liệu sau SQL):
  1. Không có đoạn ngược đường.
  2. Mọi ngày tham quan (trừ ngày về) kết thúc sau 15:30, hoặc có khối "Thời gian tự do".
  3. Có ít nhất 18 điểm, gồm đủ 7 điểm hot.
  4. Đêm 1–4 kết thúc gần thị trấn ngủ.
  5. Validator PASS và lưu được.
- **Kiểm thủ công trên `/assistant`:** chụp timeline trước và sau trên cùng câu yêu cầu; xem map không còn đường vẽ ngược.

## Out of Scope

- Ma trận thời gian di chuyển (`sources_to_targets`) từ provider. Spec này dùng ước lượng cộng kiểm tra chặng liền kề.
- Đặt phòng, giá phòng, chọn chỗ ngủ cụ thể. Spec này chỉ đặt ranh giới ngày gần thị trấn.
- Cột `priority` / trang admin quản lý điểm nổi bật (quyết định sau).
- Ảnh, nguồn tài liệu và mô tả biên tập cho các điểm mới.
- Các điểm còn thiếu toạ độ kiểm tra được: Hẻm Tu Sản, Cột mốc Km0, Bảo tàng tỉnh, chợ Lũng Phìn, nhà cổ Lao Xa.
- Đổi khung tham quan 08:00–18:00 của Validator.

## Quyết định cần duyệt (ghi ADR trước khi làm)

1. ⚖️ Server quyết thứ tự và cách chia ngày. Cách AI chia ngày chỉ còn là gợi ý.
2. ⚖️ Bỏ giới hạn 2/3/4 điểm mỗi ngày. `pace` chỉ đổi độ thoáng của ngày. Thay ADR-46 §2.
3. ⚖️ Rời chỗ ngủ 07:30 thay 06:00. Thay phần "06:00" được duyệt ngày 2026-11-07.
4. ⚖️ Thêm đệm cảnh quan vào mỗi chặng, và luôn có khối ăn trưa. Thay quy tắc trưa có điều kiện được duyệt ngày 2026-11-07.
5. ⚖️ Trang `/trips/new` có áp dụng cùng lúc không. Khuyến nghị: có, vì dùng chung lõi.
6. Duyệt số liệu ước lượng trong SQL (thời lượng, giờ chợ, toạ độ OpenStreetMap) trước khi chạy trên production.

## Further Notes

- Thứ tự làm đề xuất:
  0. Chạy SQL trên DB dev.
  1. Xếp tuyến và chia ngày.
  2. Mô hình thời gian.
  3. Bỏ nhịp đi và lấp đầy ngày.
  4. Siết tối ưu thời tiết.
  5. Hiển thị timeline ("khoảng", "Dừng chụp ảnh dọc đường", "Thời gian tự do").
- Rủi ro chính là tương thích với lưu chuyến: đệm và làm tròn phải nằm ngoài chặng, và `fixedArrivals` phải giữ nguyên giờ.
- Mã Pì Lèng trong DB lệch khoảng 1,2 km so với điểm ngắm trên OpenStreetMap (23.2406, 105.4121); nên kiểm tra lại.
- Lịch kỳ vọng minh hoạ (chưa tính bằng code):
  - **N1** TP Hà Giang → Bắc Sum → Cổng trời/Núi Đôi → Lùng Khúy → Lùng Tám → Yên Minh
  - **N2** Thẩm Mã → Phố Cáo → Chín Khoanh → Sủng Là → Dinh Vương → Phố Bảng → Đồng Văn
  - **N3** Lũng Cú → Lô Lô Chải → Mã Pì Lèng → Pả Vi → Mèo Vạc
  - **N4** Nho Quế → chợ Mèo Vạc (Chủ nhật) → Du Già, thác Du Già
  - **N5** về TP Hà Giang → Hạ Thành/Núi Cấm

## Ghi chú triển khai (2026-11-25)

- **Khác spec:**
  - Ước lượng đường **không bao giờ bỏ** điểm AI đã chọn. Chỉ tuyến thật mới cho biết điểm không vừa, nên việc bỏ điểm (điểm kém giá trị nhất) nằm ở vòng sửa sau khi định tuyến.
  - Khi đề xuất lại đúng tập điểm đang hiển thị, máy chủ giữ nguyên cách sắp của người dùng.
  - Khi có ràng buộc nghỉ đêm (ADR-53), bộ sắp riêng của ADR-53 vẫn được dùng.
- **Chưa làm:**
  - Hiệu chỉnh hệ số quanh co theo chặng đã định tuyến: đang dùng hằng 1,5 (1,3 cho chặng thẳng trên 60 km).
  - Chạy lại Or-opt khi một chặng thật dài gấp đôi ước lượng.
- **Thị trấn ngủ:** dùng `OVERNIGHT_TOWN_CENTERS` có sẵn (thêm Lũng Cú, Hoàng Su Phì, Bắc Mê so với danh sách trong spec).
- **SQL:** đã chạy trên DB development; chưa chạy trên production.

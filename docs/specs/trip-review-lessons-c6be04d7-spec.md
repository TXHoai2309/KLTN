# Spec: Bài học từ chuyến c6be04d7 — đường thật, chi phí do máy chủ tính, ngày cả chuyến

Trạng thái: **đã triển khai** (2026-11-25, chủ dự án phê duyệt 6/6 quyết định trong [ADR-56](../decisions.md); phần DB mới chỉ chạy trên Neon DEV, chưa chạy trên Production).
Phạm vi: `/assistant` (tripsage-chat), lõi `trip-planner`, bảng chi phí `tripsage-cost`, hiển thị ảnh điểm đến.
Nguồn:
- Hội thoại production `c6be04d7-06f7-44da-bdf4-d867d40ef786`: đoàn 10 người từ TP.HCM, 5 ngày tham quan bằng xe máy, ngày đi 20/12, ngày về 26/12, đã lưu chuyến.
- Bản đánh giá của ChatGPT (31 trang): "Đánh giá hành trình Hà Giang.pdf".
- Nền: [ADR-55](../decisions.md), [itinerary-route-time-redesign-spec.md](itinerary-route-time-redesign-spec.md).

## Problem Statement

Lịch cuối của chuyến (tin #17 và #19) qua đủ 5/5 mục kiểm tra, nhưng người xem thấy:

- **Thời lượng tham quan quá ngắn:**
  - Hang Lùng Khúy 45 phút, Lùng Tám 30, Cổng trời 30, Rừng thông 15, Thác Du Già 30, sông Nho Quế 90.
  - Ngày 2 có 8 điểm, trong khi ngày 1 kết thúc lúc 14:20 và ngày 4 lúc 14:30.
- **Chi phí lệch và thiếu:**
  - Giá vé trong lời chat khác bảng chi phí 1.296.000đ.
  - Lưu trú tính 4 đêm, trong khi cần 5.
  - Ăn uống không tính 2 ngày di chuyển.
  - "Mỗi người mỗi ngày" chia cho 5 ngày tham quan thay vì 7 ngày cả chuyến.
  - Đơn giá nhảy giữa các lượt:
    - Phòng: 500k → 450k.
    - Ăn: 3 bữa × 120k → 150k/ngày.
    - Thuê xe: 10 xe → 5 xe.
- **Ngày chuyến đi lẫn lộn:**
  - Người dùng nói "7 ngày" và "20/12–27/12" (tức 8 ngày).
  - Trợ lý đổi qua lại 21–26 + 27, rồi "ngày 26 chưa gán hoạt động".
  - Tiêu đề hội thoại ghi 21/12, tức ngày bắt đầu tham quan.
- **Ảnh sai:** các điểm mới (Núi Cấm, Bắc Sum, Lùng Khúy, Thẩm Mã, Phố Cáo, Chín Khoanh, Thác Du Già…) đều hiện chung một ảnh nhà cổ.
- **Điểm na ná nhau:** Pả Vi Hạ và Pả Vi Thượng; ba điểm dốc và làng (Thẩm Mã, Phố Cáo, Chín Khoanh) trong khoảng 30 phút.
- **Phạm vi kiểm tra không rõ:** "Kiểm tra 5/5" dễ bị hiểu là đã kiểm tra cả chặng máy bay và xe khách.
- **Ngày đi và ngày về không có lịch theo giờ** (góp ý của chủ dự án, 2026-11-25). Tab "Ngày đi 20/12" chỉ có hai dòng:
  - "Máy bay … đi 05:40, 2 giờ 10 phút"
  - "Xe khách … đi 10:00, 6 giờ 30 phút"

  Phần tóm tắt ghi "khoảng 8 giờ 40 phút". Thẻ thiếu giờ tới nơi, thời gian chờ nối chuyến và đoạn từ sân bay ra bến xe; người đi phải tự cộng mới biết 16:30 tới Hà Giang. Ngày về cũng vậy: "xe 00:00", "bay 10:00".
- **Giữa hai điểm dừng không có khoảng cách và thời gian chạy xe.** Panel lịch trình chỉ ghi "Di chuyển bằng xe máy" ở đầu ngày, rồi hai mốc 08:00 và 08:40 đứng liền nhau. Người đi không biết đoạn Núi Đôi → Hang Lùng Khúy dài bao nhiêu km và chạy mất bao lâu, dù dữ liệu tuyến thật đã có.

## Nguyên nhân gốc (đã kiểm chứng trên dữ liệu và code)

### R1 — Ước lượng đường núi chỉ bằng một nửa thực tế

- So 23 chặng của lịch: ước lượng (đường thẳng × 1,5, tối đa 40 km/h) tổng 365 phút, tuyến thật Stadia tổng 737 phút. Thời gian thật gấp ước lượng 1,89 lần (trung vị).
- Mười chặng lệch từ 2 lần trở lên:

| Chặng | Đường thẳng → đường thật | Ước lượng → thật |
|---|---|---|
| Lùng Tám → Yên Minh | 11,6 → 49 km | 26' → 91' |
| Lùng Khúy → Lùng Tám | 6,2 → 25,7 km | 14' → 53' |
| Pả Vi Hạ → Pả Vi Thượng | 2,4 → 15,7 km | 5' → 34' |
| Lũng Cú → Phố cổ Đồng Văn | 10,5 → 25,6 km | 24' → 51' |

- Chuỗi hệ quả:
  1. Bộ lấp giờ trống của ADR-55 (`arrangeTripRoute`) thấy dư giờ và thêm điểm (cảnh báo `STOPS_ADDED`).
  2. Khi định tuyến thật thì lịch quá giờ.
  3. Lần thử lại rút **mọi** điểm của ngày bị nêu về mức tối thiểu và dùng nghỉ dọc đường rút gọn (cảnh báo `FLEX_SCHEDULE`).
  4. Kết quả: lượt tham quan ngắn, còn các ngày không đều nhau.

### R2 — Thứ tự xử lý khi quá giờ sai

Khi lịch có vi phạm, `proposeItinerary` rút thời lượng trước rồi mới bỏ điểm. Điểm do máy chủ tự thêm cũng không được bỏ trước điểm người dùng hay AI đã chọn.

### R3 — Bảng chi phí: số lượng do AI tự điền

- Trong `estimateCosts`, chỉ có tiền xăng và chặng tiếp cận do máy chủ tính (`computed: true`).
- Số đêm, số ngày ăn, số xe và đơn giá lưu trú, ăn uống, thuê xe đều là `lines` do AI gửi lên, nên mỗi lượt có thể khác nhau.

### R4 — Bảng chi phí không tính lại khi chặng tiếp cận đổi

- Tin #19 gửi chặng tiếp cận mới `al-c1837410-48e`: vé 1.558.221đ/người, tổng 37.664.420đ.
- Nhưng lượt đó không gửi bảng chi phí mới. Bảng vẫn là bản của tin #17, gắn chặng cũ `al-255df48d-1a1` (vé 1.623.021đ, tổng 38.960.420đ).
- Bảng chi phí có lưu `accessLegId`, nên hệ thống phát hiện được bảng đã cũ nhưng không phát hiện.

### R5 — Không có khái niệm ngày cả chuyến

- `tripInfo` chỉ có `startDate` và `durationDays` của phần tham quan.
- Ngày đi và ngày về của chặng tiếp cận, cùng số đêm lưu trú thật, không được lưu ở đâu. Hệ quả: tính sai số đêm và số ngày ăn, tiêu đề sai ngày, và không phát hiện được mâu thuẫn "7 ngày" với "20–27/12".

### R6 — Ảnh dự phòng là ảnh của điểm khác

`getDestinationVisual` (`lib/destination-visuals.ts`) trả về `ha-giang-stone-village-plum.webp` (ảnh làng đá/nhà cổ) cho mọi tên không khớp. 10 điểm mới thêm (seed ADR-55) chưa có ảnh nên đều nhận ảnh này.

### R7 — Giá trị điểm không giảm khi trùng loại

`stopValue` cho mỗi điểm cùng một mức giá trị bất kể điểm ngay trước có cùng loại và ở gần hay không.

### R8 — Ngày đi/về chỉ là danh sách chặng, không phải lịch

- `tripsage-access-leg-card.tsx` hiển thị mỗi chặng bằng `departTime` và `durationMinutes`. Tổng `outboundMinutes`/`returnMinutes` chỉ là tổng thời lượng các chặng, không có giờ tới và thời gian chờ.
- Dữ liệu chặng tiếp cận không có đoạn nối giữa sân bay và bến xe (Nội Bài ↔ Mỹ Đình), cũng không có thời gian có mặt trước giờ bay.

### R9 — Thẻ điểm dừng không mang dữ liệu chặng

- `DayTimelineStop` (`components/trip-timeline/day-timeline.tsx`) không có trường nào cho chặng từ điểm trước.
- Trong khi đó, lịch đã có sẵn `stop.inbound.distanceMeters` và `durationSeconds` (tuyến Stadia), cùng `journeyPlan.legs[].restMinutes`.
- Timeline trong khung chat có dòng "Di chuyển khoảng X phút" nhưng không có số km. Panel lịch trình và trang chuyến đi thì không có dòng nào.

## Solution

1. **Thời gian di chuyển thật cho danh mục:** lưu sẵn thời gian và quãng đường Stadia giữa mọi cặp điểm trong danh mục. Bộ sắp tuyến, chia ngày và lấp giờ dùng số thật; chỉ cặp chưa có mới dùng ước lượng, kèm hệ số đã hiệu chỉnh.
2. **Thứ tự khi quá giờ:** bỏ điểm do máy chủ tự thêm trước, rồi bỏ điểm kém giá trị nhất, chỉ rút thời lượng ở bước cuối và rút vừa đủ.
3. **Chi phí do máy chủ tính số lượng:** số đêm, số ngày ăn, số xe tính từ cấu trúc chuyến. AI chỉ chọn hạng dịch vụ. Bảng tự tính lại mỗi khi lịch hoặc chặng tiếp cận đổi.
4. **Ngày cả chuyến:** lưu riêng ngày đi và ngày về của cả chuyến. Khi người dùng nói mâu thuẫn thì hỏi đúng một lần. Tiêu đề và thẻ tóm tắt hiển thị cả chuyến.
5. **Ảnh trung tính** khi điểm chưa có ảnh.
6. **Đa dạng điểm:** giảm giá trị khi điểm trùng loại và ở gần; gộp các dốc/đèo chụp ảnh thành một mục "dừng chụp ảnh dọc đường".
7. **Thời lượng theo hoạt động và quy mô đoàn**, và ghi rõ phạm vi kiểm tra.
8. **Ngày đi/về thành lịch theo giờ:** mỗi chặng có giờ đi → giờ tới, các khoảng chờ và đoạn nối (ra sân bay, ra bến xe) là dòng riêng. Có tổng thời gian từ lúc rời nhà đến lúc tới nơi.
9. **Chặng giữa hai điểm dừng:** giữa mỗi cặp điểm có một dòng "🛵 12 km · khoảng 25 phút · +5 phút dừng chụp ảnh", trên cả timeline trong chat, panel lịch trình và trang chuyến đi.

## User Stories

### Thời gian và tuyến

1. Là du khách, tôi muốn thời gian chạy xe trong lịch gần với thực tế đường đèo, để không phải cắt ngắn tham quan.
2. Là du khách, tôi muốn mỗi điểm có đủ thời gian trải nghiệm (đi bộ vào hang, đi thuyền), không bị rút về mức tối thiểu chỉ vì lịch bị nhồi.
3. Là du khách, khi lịch quá giờ, tôi muốn hệ thống bỏ bớt điểm phụ do nó tự thêm trước, rồi mới đụng tới các điểm tôi đã chọn.
4. Là du khách, tôi muốn các ngày tương đối đều: không ngày nào 8 điểm trong khi ngày khác xong lúc 14:00.
5. Là du khách đi đoàn đông, tôi muốn thời gian ở mỗi điểm tính thêm cho việc tập trung và chờ nhau.
6. Là du khách, tôi muốn các dốc/đèo chụp ảnh liền nhau hiện thành một lần dừng chụp ảnh, không phải ba điểm tham quan riêng.
7. Là du khách, tôi không muốn hai điểm gần như giống nhau (Pả Vi Hạ và Pả Vi Thượng) chiếm hai suất trong cùng một ngày khi còn điểm khác đáng đi hơn.

### Chi phí

8. Là du khách, tôi muốn số đêm lưu trú đúng với số đêm tôi thật sự ngủ ở Hà Giang, kể cả đêm vừa tới.
9. Là du khách, tôi muốn chi phí ăn uống tính cho cả các ngày di chuyển.
10. Là du khách, tôi muốn số xe thuê, đơn giá phòng và đơn giá ăn không đổi giữa các lượt khi tôi không yêu cầu đổi.
11. Là du khách, tôi muốn bảng chi phí khớp với giá vé trợ lý vừa nói, kể cả khi chặng máy bay/xe khách vừa được cập nhật.
12. Là du khách, tôi muốn "mỗi người mỗi ngày" tính trên cả chuyến, có ghi rõ phạm vi.

### Ngày chuyến đi

13. Là du khách, khi tôi nói "7 ngày" nhưng khoảng ngày lại là 8 ngày, tôi muốn trợ lý hỏi tôi một lần, không tự chọn rồi đổi qua lại.
14. Là du khách, tôi muốn tiêu đề và thẻ tóm tắt ghi cả chuyến (20–26/12 · 7 ngày), có tách ngày tham quan và ngày di chuyển.

### Hiển thị

15. Là du khách, tôi muốn điểm chưa có ảnh hiện ảnh trung tính hoặc chữ "Chưa có ảnh", không phải ảnh của nơi khác.
16. Là du khách, tôi muốn tab kiểm tra ghi rõ "Đã kiểm tra phần tham quan ở Hà Giang", và chặng máy bay/xe khách là chưa kiểm tra.
17. Là du khách đi máy bay, tôi muốn được cảnh báo khi thời gian nối chuyến (xe tới bến → ra sân bay → trước giờ bay) quá sát.
18. Là du khách, trong ngày đi và ngày về, tôi muốn thấy lịch theo giờ: 05:40 cất cánh → 07:50 tới Nội Bài → ra bến xe → chờ → 10:00 xe khách → 16:30 tới TP Hà Giang.
19. Là du khách, tôi muốn thấy thời gian chờ giữa các chặng và tổng thời gian từ lúc rời nhà đến lúc tới nơi, không chỉ tổng thời gian ngồi trên máy bay và xe.
20. Là du khách, giữa hai điểm dừng, tôi muốn biết quãng đường bao nhiêu km và chạy xe mất bao lâu, để ước lượng sức và chuẩn bị.
21. Là du khách, tôi muốn biết thời gian dừng chụp ảnh hay nghỉ dọc đường đã được tính trong chặng đó hay chưa.

## Implementation Decisions

### D1 — Bảng thời gian di chuyển giữa các điểm ⚖️ (schema)

- **Bảng mới** `destination_travel_time` (Prisma migration):
  - Khoá chính: (`fromDestinationId`, `toDestinationId`, `transport`).
  - Cột: `durationSeconds`, `distanceMeters`, `provider`, `fromRevision`, `toRevision`, `computedAt`.
  - Một dòng chỉ còn hiệu lực khi toạ độ hai đầu chưa đổi (so revision).
- **Script nạp** (chạy tay, có `--dry-run`):
  - Gọi `RouteProvider.route` cho mọi cặp điểm `VISIBLE` theo hai chiều và hai loại phương tiện.
  - Với 32 điểm là khoảng 32 × 31 × 2 ≈ 2.000 lần gọi, giới hạn 3 lần gọi cùng lúc như `resolveBoundedRoutes`.
  - Khoá Stadia chỉ dùng ở máy chủ.
- **Đọc bảng:**
  - `arrangeTripRoute`, `orderRoundTrip` và `fitDays` đọc bảng này qua một `RouteProvider` đọc từ DB.
  - Cặp chưa có dữ liệu: dùng ước lượng với hệ số đã hiệu chỉnh (D2).
  - Lịch cuối vẫn được định tuyến thật như hiện nay. Bảng chỉ thay ước lượng, không thay bằng chứng của Validator.
- **Đọc trực tiếp từ bảng mà không gọi lại Stadia khi lập lịch:** để quyết định sau (cần cân nhắc dữ liệu cũ so với tuyến hiện hành).

### D2 — Hiệu chỉnh hệ số khi thiếu dữ liệu

- Trong một lượt, khi đã có chặng thật, hệ số = trung vị của (thời gian thật / thời gian ước lượng với hệ số 1) của các chặng đó. Giới hạn trong khoảng [1,5; 3,5].
- Mặc định khi chưa có chặng thật nào: **2,0**, thay cho 1,5. Con số dựa trên trung vị 1,89 đo được ở chuyến này.

### D3 — Thứ tự xử lý khi lịch quá giờ (`proposeItinerary`)

1. Bỏ các điểm do máy chủ thêm (`addedStops`) của ngày bị nêu, điểm có tỉ số giá trị/phút thấp nhất trước, mỗi vòng một điểm.
2. Bỏ điểm kém giá trị nhất mà không phải điểm bắt buộc hay điểm nghỉ đêm (đã có từ ADR-55).
3. Chỉ khi vẫn còn vi phạm: rút thời lượng **vừa đủ**. Mỗi bước giảm 15 phút cho điểm dài nhất của ngày đó, không dưới mức tối thiểu. Không còn "rút tất cả về tối thiểu".
4. Nghỉ dọc đường rút gọn (`COMPACT`) chỉ dùng sau bước 3.

Cảnh báo `STOPS_DROPPED` tách hai danh sách: "điểm gợi ý thêm đã bỏ" và "điểm bạn chọn đã bỏ".

### D4 — Lấp giờ trống chừa biên an toàn

`arrangeTripRoute` chỉ thêm một điểm khi sau khi thêm, ngày đó vẫn còn ít nhất 45 phút trống theo ước lượng. Phần biên này bù cho sai số còn lại của ước lượng.

### D5 — Bảng chi phí do máy chủ tính số lượng ⚖️ (đổi tool)

- **`estimateCosts` đổi đầu vào:**
  - AI chỉ chọn **hạng** (`lodgingTier`: tiết kiệm/vừa/tốt, `mealTier`, `rental`: xe máy tự lái/xe 16 chỗ/ô tô…) và có thể thêm dòng "khác" kèm lý do.
  - Đơn giá lấy từ `PRICE_REFERENCE` (có ngày tham chiếu).
- **Số lượng do máy chủ tính từ chuyến đi:**
  - **Số đêm lưu trú** = số đêm đoàn ở Hà Giang, gồm đêm tới nếu chặng tiếp cận tới nơi trong ngày trước ngày tham quan đầu tiên. Không tính đêm đoàn đang trên xe đêm.
  - **Số ngày ăn** = số ngày cả chuyến (D7), với ngày di chuyển tính theo số bữa thật sự diễn ra trên đường. Đơn vị là bữa.
  - **Số xe:** xe máy = làm tròn lên (số người / 2); xe 16 chỗ = làm tròn lên (số người / 15); ô tô theo số chỗ.
  - **Số ngày thuê xe** = số ngày tham quan.
  - **Mỗi người mỗi ngày** = tổng / (số người × số ngày cả chuyến). Nhãn ghi "trên cả chuyến N ngày".
- **Dòng do AI tự thêm** vẫn được phép, nhưng hiện là "ước tính của trợ lý" và không được trùng các hạng mục máy chủ đã tính.

### D6 — Bảng chi phí luôn khớp lịch và chặng tiếp cận

- Máy chủ tự tính lại bảng chi phí (không cần AI gọi) cuối mỗi lượt có `data-itinerary` mới hoặc `data-access-leg` mới khác `accessLegId` của bảng hiện hành. Hạng dịch vụ giữ như lần trước.
- **Phía giao diện:** nếu `cost.accessLegId` khác chặng tiếp cận đang hiện thì đánh dấu bảng là "Cần tính lại" thay vì hiện số cũ như số đúng. Đây là lưới an toàn khi việc tính lại ở máy chủ thất bại.

### D7 — Ngày cả chuyến ⚖️ (đổi `tripInfo`)

- **Trường mới** trong `tripInfo`: `tripStartDate`, `tripEndDate` (ngày đi và ngày về của cả chuyến, kể cả ngày di chuyển). Giữ `startDate` và `durationDays` cho phần tham quan.
- **Suy ra khi có chặng tiếp cận:** ngày đi = ngày khởi hành chặng đi, ngày về = ngày tới nơi của chặng về. Đây là bất biến: phần tham quan nằm trong khoảng này.
- **Mâu thuẫn** (số ngày người dùng nói ≠ số ngày theo khoảng ngày): không tự chọn. Hỏi đúng một lần với 2 nút, ví dụ "7 ngày: 20–26/12" và "8 ngày: 20–27/12", rồi ghi bằng `recordTripInfo`.
- **Tiêu đề hội thoại và thẻ tóm tắt** dùng ngày cả chuyến, ví dụ "TP Hồ Chí Minh → HG · 10 người · 20–26/12". Thẻ tách "Tham quan 21–25/12 · Di chuyển 20 và 26/12".

### D8 — Ảnh dự phòng trung tính

- `getDestinationVisual`: bỏ nhánh mặc định trả ảnh làng đá. Tên không khớp nhánh nào thì trả ảnh chung trung tính của Hà Giang (ảnh phong cảnh, không gắn với một điểm cụ thể) kèm `alt` "Chưa có ảnh của <tên điểm>".
- Hoặc trả `null` để component hiện ô "Chưa có ảnh". Quyết định khi làm, theo những component đang gọi hàm này: `trips-view`, `day-timeline`, `add-visit-drawer`, `edit-trip-client`, `companion-*`.
- Thêm nhánh đúng loại cho các điểm seed: hang → ảnh hang, dốc/đèo → ảnh đường đèo, thác → ảnh thác. Chỉ dùng ảnh đã có trong `/public/images`.

### D9 — Đa dạng điểm và gộp điểm chụp ảnh

- **Giảm giá trị khi trùng loại:** trong `arrangeTripRoute`, giá trị của một điểm giảm một nửa nếu đã có điểm cùng `category` trong vòng 15 phút đi xe (theo D1/D2) trong cùng ngày.
- **Gộp điểm chụp ảnh:** các điểm có thời lượng ≤ 20 phút và loại "điểm ngắm cảnh" liền nhau trên cùng chặng được timeline gộp thành một mục "Dừng chụp ảnh: Thẩm Mã, Chín Khoanh". Đây chỉ là cách hiển thị: các lượt tham quan và mốc giờ đã kiểm tra không đổi.

### D10 — Thời lượng theo hoạt động và quy mô đoàn

- **Dữ liệu (SQL, cần duyệt số):**
  - Hang Lùng Khúy 120/75 (gồm đi bộ vào cửa hang).
  - Sông Nho Quế 180/120 (gồm đi thuyền).
  - Làng dệt lanh Lùng Tám 60/45.
  - Ghi chú vào `visitNotes`.
- **Hệ số đoàn:** đoàn từ 6 người trở lên thì thời lượng gợi ý +15 % (làm tròn 5 phút) cho điểm có `suggestedDurationMinutes` ≥ 45. Không áp cho điểm dừng chụp ảnh. Tối thiểu (`minimumDurationMinutes`) và Validator giữ nguyên.

### D11 — Phạm vi kiểm tra và nối chuyến

- **Tab kiểm tra** ghi: "Đã kiểm tra phần tham quan ở Hà Giang (giờ mở cửa, thời lượng, thời gian chạy xe, chồng lấn). Chặng máy bay và xe khách chưa được kiểm tra."
- **Chặng tiếp cận** thêm cảnh báo (không chặn lưu) khi:
  - thời gian từ lúc xe tới bến đến giờ bay ít hơn (thời gian ra sân bay ước tính + 120 phút); hoặc
  - xe khởi hành trước khi lượt tham quan cuối kết thúc.
- **Tổng thời gian đi** hiển thị cả thời gian chờ giữa các chặng, không chỉ cộng thời gian di chuyển.

### D12 — Lịch theo giờ cho ngày đi và ngày về

- **Lịch từ dữ liệu có sẵn:** từ `departTime` và `durationMinutes` của từng chặng, tính giờ tới (`departTime + durationMinutes`, cộng ngày nếu qua 24:00). Mỗi chặng thành một dòng "05:40 → 07:50 · Máy bay Hồ Chí Minh → Hà Nội · 2 giờ 10 phút".
- **Dòng chờ và nối chuyến:** giữa hai chặng liền nhau có một dòng "07:50 → 10:00 · Chờ và di chuyển từ sân bay Nội Bài ra bến xe (2 giờ 10 phút)". Nếu chặng sau khởi hành trước giờ tới của chặng trước thì dòng này hiện cảnh báo "không kịp nối chuyến".
- **Đoạn nối sân bay ↔ bến xe:** dùng thời gian tham khảo ghi trong `PRICE_REFERENCE` (ví dụ Nội Bài ↔ Mỹ Đình khoảng 60 phút), hiện là "ước tính" và nằm trong khoảng chờ. Không tạo chặng giả có giá.
- **Có mặt trước giờ bay:** trước chặng máy bay có một dòng "Có mặt sân bay trước 2 giờ". Chặng trước tới nơi muộn hơn giờ phải có mặt thì cảnh báo (nối với D11).
- **Tổng hai con số:** thay "khoảng 8 giờ 40 phút" bằng "Tổng 10 giờ 50 phút từ lúc cất cánh (trong đó 8 giờ 40 phút di chuyển)".
- **Phạm vi:** chỉ là cách hiển thị, tính từ dữ liệu đã có trong `data-access-leg`, không đổi schema. Áp cho `tripsage-access-leg-card.tsx` trong panel lịch, tab ngày đi/về và trang chuyến đi đã lưu.

### D13 — Dòng chặng giữa hai điểm dừng

- **Dữ liệu:** thêm vào `DayTimelineStop` một trường không bắt buộc `travelFromPrevious: { distanceMeters: number | null; durationMinutes: number | null; restMinutes: number | null; photoMinutes: number | null; verified: boolean } | null`.
- **Nguồn:**
  - `distanceMeters` và `durationSeconds` lấy từ `stop.inbound`.
  - `restMinutes` lấy từ `journeyPlan.legs` (chặng `TRANSFER` tới điểm đó).
  - `photoMinutes` = `scenicBufferMinutes(...)` (ADR-55).
  - Chặng đầu ngày 2 trở đi là chặng từ nơi nghỉ đêm (điểm cuối ngày trước).
- **Hiển thị:** một dòng mảnh nằm giữa hai thẻ điểm dừng, trên trục thời gian: "🛵 12,4 km · khoảng 25 phút" (ô tô dùng 🚗).
  - Có nghỉ dọc đường thì thêm "· nghỉ 15 phút".
  - Có thời gian dừng chụp ảnh thì thêm "· +5 phút chụp ảnh".
  - Tuyến chưa xác minh (`INSUFFICIENT_DATA`) thì ghi "Chưa có dữ liệu tuyến", không ghi số.
- **Không tự bịa số:** chỉ hiện km và thời gian khi chặng có `status = VERIFIED`. Không dùng ước lượng đường thẳng cho dòng này.
- **Đồng bộ:**
  - Timeline trong chat (`buildDayTimeline`, dòng `DRIVE`) thêm số km vào nhãn, ví dụ "Di chuyển 12,4 km, khoảng 25 phút, thêm ~5 phút dừng chụp ảnh".
  - Trang chuyến đã lưu lấy cùng số liệu từ lịch đã lưu.
- **Tổng theo ngày:** đầu mỗi ngày giữ dòng "Di chuyển bằng xe máy" nhưng thêm tổng ngày: "· 87 km · khoảng 3 giờ 30 phút lái xe" (`day.distanceMeters`, `day.travelSeconds`; ẩn nếu `null`).

### Bất biến giữ nguyên

- Validator không đổi quy tắc. Thiếu dữ liệu không bao giờ là đạt.
- Không tự đặt chỗ. Giá vẫn là tham khảo, có nguồn và ngày tra.
- Lưu chuyến vẫn dùng `fixedArrivals`.

## Testing Decisions

- **Hồi quy với ca thật:** fixture từ chuyến `c6be04d7` (toạ độ, thời gian Stadia của 23 chặng). Sau D1–D4:
  - không còn `FLEX_SCHEDULE`;
  - không lượt tham quan nào dưới mức gợi ý trừ khi người dùng tự chọn;
  - chênh lệch giờ kết thúc giữa các ngày tham quan (trừ ngày về) không quá 2 giờ.
- **Thứ tự xử lý khi quá giờ (D3):** một ngày quá giờ có một điểm do máy chủ thêm thì điểm đó bị bỏ trước, thời lượng các điểm khác giữ nguyên.
- **Chi phí (D5–D6):**
  - Chuyến 10 người, chặng đi tới 16:30 ngày 20/12, tham quan 21–25, xe đêm 00:00 ngày 26 cho ra **5 đêm**, **5 xe**, ăn uống tính cả 20 và 26/12, "mỗi người mỗi ngày" chia cho 7.
  - Đổi chặng tiếp cận ở lượt sau thì bảng chi phí tự tính lại, giá vé khớp chặng mới, `accessLegId` khớp.
- **Ngày cả chuyến (D7):** câu "7 ngày… đi từ 20/12 – 27/12" sinh đúng một câu hỏi với 2 nút. Tiêu đề hiện 20–26/12 sau khi chốt.
- **Ảnh (D8):** tên không khớp không bao giờ trả ảnh của một điểm khác.
- **Đa dạng (D9):** Pả Vi Hạ và Pả Vi Thượng không cùng được thêm vào một ngày khi còn điểm khác đáng đi hơn.
- **Ngày đi/về (D12):** chặng tiếp cận của chuyến này (bay 05:40 / 130 phút, xe 10:00 / 390 phút) cho ra các dòng 05:40→07:50, chờ 07:50→10:00, 10:00→16:30, tổng "10 giờ 50 phút (8 giờ 40 phút di chuyển)". Chiều về: xe 00:00→06:30, chờ, bay 10:00→12:10. Chặng sau khởi hành trước giờ tới của chặng trước thì hiện cảnh báo.
- **Chặng giữa điểm (D13):** một ngày có `inbound` VERIFIED hiện đúng km (1 chữ số thập phân), phút, nghỉ và thời gian dừng chụp ảnh giữa mỗi cặp điểm. Chặng `INSUFFICIENT_DATA` hiện "Chưa có dữ liệu tuyến". Số liệu giống nhau giữa timeline chat, panel lịch trình và trang chuyến đã lưu.

## Out of Scope

- Đặt phòng, đặt vé, kiểm tra còn ghế/còn phòng.
- Tối ưu tuyến tuyệt đối (giải chính xác): vẫn là heuristic có kiểm chứng.
- Phân loại hoạt động "tham quan / trải nghiệm / nghỉ dưỡng / khám phá" đầy đủ. Ghi nhận là hướng sau (P2 trong bản đánh giá).
- Phương án dự phòng khi trễ phương tiện.

## Quyết định cần duyệt

1. ⚖️ Thêm bảng `destination_travel_time` và script nạp (D1).
2. ⚖️ Đổi đầu vào `estimateCosts`: AI chỉ chọn hạng, máy chủ tính số lượng (D5); tự tính lại chi phí khi lịch hoặc chặng đổi (D6).
3. ⚖️ Thêm `tripStartDate` và `tripEndDate` vào `tripInfo`; hỏi một lần khi ngày mâu thuẫn (D7).
4. Số liệu thời lượng mới trong D10 và hệ số +15 % cho đoàn từ 6 người.
5. Thứ tự ưu tiên làm: D1–D4 → D5–D6 → D7 → D12–D13 (chỉ hiển thị, có thể làm sớm) → D8–D11.
6. Thời gian tham khảo cho đoạn nối sân bay ↔ bến xe (D12) và quy tắc có mặt trước giờ bay 2 giờ.

## Further Notes

- **ChatGPT đánh giá chưa đúng ở 3 chỗ:**
  - Ngân sách 65 triệu là do người dùng yêu cầu (tin #12), không phải hệ thống tự nâng.
  - Trợ lý đã hỏi xe máy hay xe 16 chỗ hay ô tô (tin #15), không phải mặc định.
  - Tối ưu tuyến đã có số liệu so sánh: cùng tập điểm, 224 km theo thứ tự của AI và 176 km sau tối ưu (`planner-route.vitest.test.ts`).
- **Câu hỏi hội đồng nên chuẩn bị** (theo bản đánh giá): tính khả thi được kiểm định thế nào, tối ưu tuyến ra sao, ngân sách không đủ thì sao, AI có bịa giá không, khác gì hỏi ChatGPT trực tiếp. Các mục D1–D11 cho câu trả lời có số liệu.

## Ghi chú triển khai

- **Phần làm khác hoặc giới hạn dữ liệu thực tế:**
  - **D1 / Production DB:** Migration `destination_travel_time` (`20261125121200_destination_travel_time`) và script `apps/web/scripts/populate-destination-travel-time.mts` (nạp `684/684` cặp trên DEV) chỉ mới chạy trên Neon DEV; Production DB chưa chạy migration, chưa chạy script nạp và chưa chạy SQL D10 (chờ chủ dự án duyệt thực thi trực tiếp).
  - **D10 SQL trên DEV:** Trong `docs/analysis/18-destination-durations-2026-11-25.sql`, DB DEV chỉ có bản ghi `"Hang Lùng Khúy"` (`hg-seed-hang-lung-khuy`, đã cập nhật `120/75` và chạy lại idempotent), trong khi hai id production `"Sông Nho Quế"` (`cmvtdsbz1000108jumr696xmd`) và `"Làng dệt lanh Lùng Tám"` (`cmvor08h1000207ldzmta1v09`) không tồn tại trong snapshot DEV (sẽ được cập nhật khi chạy SQL lên Production; bản ghi `[TEST] Hẻm Tu Sản & Sông Nho Quế` trên DEV được giữ nguyên không đụng tới).
  - **D8 ảnh theo loại điểm seed:** Vì thư mục `apps/web/public/images` chưa có tệp ảnh hang động hay thác nước chụp riêng, nhóm hang động và thác nước tái sử dụng ảnh có sẵn phù hợp trong `/public/images` (`ha-giang-destination-card.webp`, `ha-giang-terraces-mist-huts.webp`, `ha-giang-hero.webp`, `ha-giang-culture-card.webp`), còn mọi tên không khớp nhánh nào trả ảnh phong cảnh trung tính `/images/ha-giang-highland-poster.webp` kèm `alt` `"Chưa có ảnh của <tên điểm>"` (tuyệt đối không trả ảnh làng đá).
  - **D2 + `arrangeTripRoute` ngoại tỉnh (`coordinateRoute`):** Khi `arrangeTripRoute` đánh giá chia ngày (`fitDays`), chặng từ điểm xuất phát ngoài Hà Giang tới điểm đầu và về được ưu tiên gọi `routes.coordinateRoute` (memoize trong phiên `arrangeTripRoute`) rồi mới fallback về `estimateSeconds(..., 2.0)` khi thiếu định tuyến thật, để ước tính đèo núi `2.0` không làm gãy chặng cao tốc đồng bằng khi test hoặc chạy với định tuyến thật.
- **Chưa làm (thuộc Out of Scope của spec):** Không có hạng mục nào trong D1–D13 bị bỏ lại; các mục đặt vé/đặt phòng/P2 phân loại chi tiết vẫn giữ ngoài phạm vi.

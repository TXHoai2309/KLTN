# 17 — Phân tích lại lập lịch: tuyến đường, thời gian, dữ liệu điểm đến

- **Ngày:** 2026-11-24
- **Trạng thái:** Phân tích, **chưa sửa code**. Các mục đánh dấu ⚖️ là thay đổi quy tắc sản phẩm, cần chủ dự án duyệt và ghi ADR trước khi làm.
- **Ca tham chiếu:** hội thoại `fdf35a74-25b4-4283-b313-d096c17373f0` (5 ngày, xe máy, xuất phát TP Hà Giang, nhịp PACKED), bản lịch cuối ở tin nhắn #17.
- **Dữ liệu SQL đi kèm:** [17-destination-seed-2026-11-24.sql](17-destination-seed-2026-11-24.sql) (bản nháp, chưa chạy).

## 0. Nhìn bằng mắt khách du lịch

Người đi Hà Giang 5 ngày bằng xe máy mong:

1. **Đi một vòng, không quay đầu.** Vòng cung kinh điển: TP Hà Giang → Quản Bạ → Yên Minh → Đồng Văn (Lũng Cú) → Mã Pì Lèng → Mèo Vạc → Du Già → về. Đêm ngủ ở thị trấn (Quản Bạ/Yên Minh, Đồng Văn, Mèo Vạc, Du Già), không ngủ "tại điểm tham quan cuối".
2. **Cả ngày là trải nghiệm**, không phải "4 điểm rồi nghỉ". Đường đèo chính là điểm đến: dừng chụp ảnh ở dốc Bắc Sum, Thẩm Mã, Chín Khoanh, Mã Pì Lèng.
3. **Nhịp tự nhiên.** Ăn sáng rồi đi lúc 7:00–7:30. Đi đúng giờ đẹp: Mã Pì Lèng buổi sáng, chợ phiên sáng Chủ nhật. Ăn trưa ở thị trấn. Tới chỗ ngủ trước khi trời tối (đường núi ban đêm nguy hiểm). Giờ hiển thị là "khoảng 9:15", không phải "9:07".
4. **Không bỏ điểm hot.** Lũng Cú, Mã Pì Lèng, Nho Quế, Dinh Vương, phố cổ Đồng Văn, Thẩm Mã, Cổng trời Quản Bạ.

Ca tham chiếu không đạt cả bốn ý:

| Ngày | Lịch hiện tại | Hết giờ tham quan | Vấn đề |
|---|---|---|---|
| 1 | Quản Bạ, Núi Đôi | **09:11** | Trống cả ngày dù xuất phát ngay TP Hà Giang |
| 2 | Yên Minh → **Vương → Sủng Là** → Đồng Văn | 12:41 | Zíc zắc; chiều trống |
| 3 | Lũng Cú → Lô Lô Chải → Mã Pì Lèng → Nho Quế | 16:01 | Ổn |
| 4 | Mèo Vạc → **Pả Vi** (ngược lên) → Du Già | 13:00 | Ngược đường; chiều trống |
| 5 | Lùng Tám → Hạ Thành | 11:42 | Lùng Tám để dồn vào ngày về |

Theo đường chim bay, chuỗi 15 điểm dài khoảng 224 km. Chạy 2-opt trên đúng 15 điểm đó còn khoảng 176 km, tức thừa khoảng 21%.

## 1. Sắp xếp đường đi

### 1.1 Hiện trạng (vì sao ngược đường)

| # | Nguyên nhân | Vị trí |
|---|---|---|
| R1 | Trên `/assistant`, **AI tự quyết thứ tự và chia ngày**. Server giữ nguyên thứ tự đó. | `proposeItinerary` → `scheduleSelection` → `planJourney` (chỉ dời ranh giới ngày, không đổi thứ tự) |
| R2 | AI **không có toạ độ**. `listDestinations` chỉ trả tên, khu vực, loại, thời lượng. Cả 22 điểm cùng khu vực "khu vực hà giang". | `tripsage-chat-tools.ts:708` |
| R3 | Bộ tối ưu tuyến có sẵn (`orderPlannerCandidates` + 2-opt) **chỉ chạy dự phòng** khi AI gửi sai 2 lần. | `tripsage-chat-tools.ts:1270` |
| R4 | Ngay trong bộ tối ưu có sẵn, **điểm sở thích bị quy đổi thành 5 km/điểm** khi chọn điểm kế tiếp. Điểm hợp sở thích được kéo lên trước bất kể xa gần, còn thưởng "cùng khu" (2 km) thì vô dụng vì mọi điểm cùng khu. | `planner-order.ts:46` |
| R5 | Tối ưu thời tiết **có thể đổi chỗ nguyên hai ngày** (ngày i ↔ ngày j). Hoán vị trong ngày được xếp theo "điểm ngoài trời đi trước" rồi mới tính quãng đường. Giới hạn đi vòng 20% / 30 phút mỗi ngày vẫn cho phép zíc zắc. | `planner-weather-preference.ts:159, 239` |
| R6 | Chỗ ngủ được coi là **điểm tham quan cuối ngày**, nên ranh giới ngày không bám thị trấn có chỗ ngủ. | `scheduleJourneyEvidence` (`MORNING_DEPARTURE_MINUTE` tính từ điểm cuối) |

### 1.2 Đề xuất: server sở hữu thứ tự, AI chỉ chọn "danh sách muốn đi"

Về mặt bài toán, đây là **Orienteering Problem nhiều ngày có khung giờ** (TOPTW): chọn và xếp điểm để tối đa giá trị trải nghiệm trong quỹ thời gian từng ngày, có điểm xuất phát/về cố định và chỗ ngủ ở thị trấn. Không cần giải tối ưu tuyệt đối. Một heuristic nhiều tầng, chạy dưới 50 ms, là đủ với vài chục điểm.

**Bước A — Chi phí ước lượng (không gọi API):**
`phút(a,b) = haversine(a,b) × hệ số quanh co ÷ tốc độ trần`

- Tốc độ trần: xe máy 40, ô tô 50 km/h (đã có trong `MAX_AVERAGE_KMH`).
- Hệ số quanh co: khởi điểm 1,5 cho vùng núi. Hiệu chỉnh từ các chặng đã có route thật trong cùng lượt (trung vị của tỉ số giữa thời gian thật và thời gian ước lượng).

**Bước B — Xếp tuyến vòng trên toàn chuỗi:**

1. Dựng vòng Origin → mọi điểm → Origin bằng *cheapest insertion*, ổn định hơn nearest neighbour.
2. Cải thiện bằng **2-opt + Or-opt**: dời 1–3 điểm liền nhau sang vị trí khác. Dùng lại `untangleRoundTrip`, bổ sung Or-opt.
3. **Bỏ trọng số sở thích khỏi hàm chi phí tuyến.** Sở thích chỉ dùng ở bước *chọn* điểm (mục 2.3), không dùng ở bước *xếp*.
4. Chọn chiều đi (thuận hay ngược vòng) theo tổng phạt khung giờ (chợ phiên Chủ nhật, điểm ngắm giờ đẹp, ràng buộc nghỉ đêm), hoà thì giữ chiều kinh điển (điểm đầu gần origin hơn).

**Bước C — Chia ngày theo thời gian, ranh giới ở thị trấn:**

- Quy hoạch động trên chuỗi đã xếp, mở rộng từ `balanceJourneyDays` có sẵn.
- Chi phí mỗi ngày gồm: phạt vượt quỹ thời gian, phạt "chiều trống" (đã có `idleCost`), và **phạt khi điểm cuối ngày cách thị trấn ngủ quá 20 phút**.
- Thị trấn ngủ là danh sách hằng có toạ độ: TP Hà Giang, Quản Bạ (Tam Sơn), Yên Minh, Đồng Văn, Mèo Vạc, Du Già. Nên đưa thành dữ liệu sau.
- Ràng buộc `overnightAreas` (ADR-53) trở thành ràng buộc cứng của bước này.

**Bước D — Xác minh bằng route thật:** gọi Stadia cho các chặng liền kề như hiện nay. Nếu một chặng có thời gian thật lớn hơn 2 lần ước lượng (không có đường thẳng, phải vòng thung lũng), thay số thật vào ma trận rồi chạy lại Or-opt một vòng (giới hạn 1–2 vòng, có cache theo cặp).

**Bước E — Siết tối ưu thời tiết:**

- Bỏ hoán vị nguyên ngày khi làm vỡ vòng: chỉ cho phép nếu chuỗi sau khi đổi không tăng chi phí tuyến quá 5%.
- Hoán vị trong ngày: sắp theo quãng đường trước, phạt thời tiết sau.

**Vai trò AI sau khi đổi:**

- AI gửi danh sách điểm muốn đi, theo ngày như cũ nhưng **phân ngày chỉ là gợi ý**. Server tự xếp và chia lại.
- Điểm bắt buộc, nghỉ đêm và điểm khoá vẫn được giữ.
- `listDestinations` trả thêm `routeOrder` (thứ tự trên vòng cung) hoặc `lat/lng` làm tròn 3 chữ số để AI viết lời giới thiệu đúng.
- Prompt bỏ câu "mỗi ngày không vượt nhịp đi 2/3/4" và câu gợi ý sửa lỗi "bớt 1–2 điểm".

## 2. Thời gian linh hoạt (bỏ giới hạn nhịp đi) ⚖️

### 2.1 Hiện trạng (vì sao dồn buổi sáng, ít điểm)

| # | Nguyên nhân | Vị trí |
|---|---|---|
| T1 | **Giới hạn theo SỐ điểm** (2/3/4). Vượt là bị từ chối (`PACE_LIMIT`). Điểm 30–60 phút thì 4 điểm xong trước trưa. | `planner-engine.ts:17`, `planning-engine.ts:49` |
| T2 | **Xếp càng sớm càng tốt.** Xe chạy lúc 06:00 nên điểm đầu luôn tới đúng 08:00, các điểm sau nối liền nhau. Không có bước dàn đều sáng/chiều hay đặt giờ đẹp. | `planner-engine.ts:72` |
| T3 | **Nghỉ trưa có điều kiện hẹp:** chỉ khi một điểm kết thúc trong 11:30–14:00 *và* còn điểm sau. | `planner-engine.ts:97` |
| T4 | **Rút thời lượng cho mọi ngày** khi có bất kỳ vi phạm nào (`FLEX_SCHEDULE`). Ca tham chiếu: Sủng Là và Mèo Vạc 60 → 30 phút, Núi Đôi 45 → 20 phút. | `tripsage-chat-tools.ts:1101` |
| T5 | **Hệ thống chỉ biết bớt điểm:** vòng sửa xoá *điểm cuối* của ngày lỗi (không phải điểm kém giá trị nhất), và gợi ý gửi AI là "bớt 1–2 điểm". Không có chiều ngược lại "ngày còn trống thì thêm điểm". | `tripsage-chat-tools.ts:1120`, `:1262` |
| T6 | **Giờ tính đến từng phút.** Thời gian di chuyển + nghỉ dọc đường + tham quan được cộng chính xác, không có khoảng đệm cho dừng chụp ảnh hay đi chậm. | toàn bộ `schedulePlannerDays` |

### 2.2 Mô hình thời gian đề xuất

Mỗi ngày là một **quỹ thời gian**, không phải số khe:

```
[rời chỗ ngủ ~07:30] → chặng + đệm cảnh quan → tham quan → … → ăn trưa ~12:00 (ở thị trấn/điểm có quán)
→ … → tới thị trấn ngủ trước min(hoàng hôn + 30', 18:30)
```

| Thành phần | Quy tắc đề xuất | Ghi chú |
|---|---|---|
| Rời chỗ ngủ | 07:30 (thay 06:00); ngày 1 theo giờ khởi hành người dùng | ⚖️ đổi `MORNING_DEPARTURE_MINUTE` |
| Thời gian chạy xe | Route thật (đã giới hạn 40/50 km/h) + nghỉ dọc đường (`rest-policy`, giữ nguyên) | |
| **Đệm cảnh quan** | Chặng đi xe máy: `min(25, round5(0,2 × phút chạy))`; ô tô: 0,15. Hiện thành dòng "Dừng chụp ảnh dọc đường" có gợi ý điểm (dốc/đèo nằm gần chặng). | Mới. Nằm *giữa* giờ kết thúc chặng và giờ đến điểm, nên Validator chấp nhận (chỉ kiểm tra đến ≥ rời + di chuyển) |
| Thời lượng tham quan | Khoảng `[min, suggested, max]`, với `max = round(1,5 × suggested)`. Xếp theo `suggested`. Thừa giờ thì kéo dài điểm giá trị cao tới `max`; thiếu giờ thì rút **chỉ trong ngày đó** về `min`. | Thay T4 |
| Ăn trưa | Luôn có một khối 60 phút (hoặc `dayRhythm.lunchMinutes`) đặt ở lần chuyển điểm gần 12:00 nhất trong khung 11:15–13:30. Nếu điểm đó là phố cổ/thị trấn/chợ thì gộp vào điểm. | Thay T3 |
| Giờ đẹp (mềm) | Điểm ngắm có `bestVisitTime` hoặc `isOutdoor`: thưởng khi vào 07:30–10:00 hoặc 15:00–17:30, phạt sau hoàng hôn (đã có `sun-times`). | Dùng lại `planner-weather-preference` |
| Kết thúc ngày | Tới thị trấn ngủ trước `min(hoàng hôn + 30', 18:30)`. Validator vẫn giữ khung tham quan 08:00–18:00. | ⚖️ |
| Làm tròn hiển thị | Giờ đến làm tròn **lên** bội 5 phút. Giao diện hiện "khoảng 9:15". | Làm tròn lên nên vẫn qua Validator |
| Giờ trống còn lại | Từ 45 phút trở lên thì hiện "Thời gian tự do" cùng gợi ý quanh đó (ADR-45/46 `dN-free` đã có). | |

**Nhịp đi:** bỏ giới hạn số điểm. Nếu muốn giữ lựa chọn cho người thích thong thả thì chỉ đổi *độ dày* của lịch, không đổi số điểm:

| Lựa chọn | Kết thúc ngày | Hệ số đệm | Kéo dài tham quan |
|---|---|---|---|
| Thong thả | 17:00 | ×1,5 | ưu tiên kéo dài |
| Mặc định | 18:00 | ×1,0 | cân bằng |

Khuyến nghị: trên `/assistant` bỏ hẳn câu hỏi nhịp đi, chỉ đổi khi người dùng tự nói ("đi chậm thôi"). Trang `/trips/new` cũng đang dùng `pace` nên cần chủ dự án quyết có đổi cùng lúc không ⚖️.

### 2.3 Lấp đầy ngày bằng điểm giá trị cao (thay T5)

Sau Bước B–C, lặp lại cho tới khi không còn chèn được:

1. Với mỗi ngày còn ≥ 40 phút trống, xét các điểm **chưa dùng** đang mở cửa vào ngày đó.
2. Chi phí chèn = `đi vòng thêm (ước lượng) + thời lượng suggested + đệm`, lấy vị trí rẻ nhất trong ngày.
3. Giá trị = `nổi bật (hot) × 3 + khớp sở thích + 1 nếu là điểm chụp ảnh ven chặng (đi vòng < 10')`.
4. Chèn điểm có `giá trị / phút thêm` cao nhất, miễn còn vừa quỹ ngày, giờ mở cửa và hạn về.
5. Xác minh route thật một lần. Nếu vượt giờ thì bỏ điểm có *tỉ số thấp nhất* (không phải "điểm cuối"), trừ điểm bắt buộc và điểm nghỉ đêm.

"Hot" hiện là danh sách tên cứng `FEATURED_NAMES` (6 tên). Có hai cách:

- (a) mở rộng danh sách tên: nhanh, không cần migration;
- (b) thêm cột `priority SMALLINT` (1–5) cho `destination` bằng migration và cho admin quản lý ⚖️.

Khuyến nghị: (a) trước, (b) sau.

### 2.4 Tương thích Validator và lưu chuyến

- Validator (`planner-validator.ts`) **giữ nguyên quy tắc.** Mô hình mới chỉ *thêm khoảng trống* (đệm, trưa, làm tròn lên). Mọi kiểm tra đều là bất đẳng thức "đến ≥ rời + di chuyển" và "tham quan ≥ min", nên vẫn qua.
- `validateJourneyTiming` so khớp `leg.endMinute` **chính xác** với `start + duration + rest`. Vì vậy đệm cảnh quan không được nhét vào chặng; nó phải nằm sau `leg.endMinute`, trước `arrivalMinute`.
- Lưu chuyến (`journey-save-validation.ts`) chạy lại `planJourney` với `fixedArrivals`. Giờ đến đã lưu được giữ nguyên, nên đệm không bị tính lại. **Cần test riêng.**
- Kéo dài tham quan (`visitDurationMinutes > suggested`): Validator chỉ đòi `departure − arrival = visitDurationMinutes` và `≥ min`, nên hợp lệ.

## 3. Thứ tự sửa "một lần" (đề xuất)

| Đợt | Nội dung | File chính | Cần duyệt |
|---|---|---|---|
| 0 | Chạy SQL dữ liệu (mục 4) trên DB dev, rồi production | `17-destination-seed-2026-11-24.sql` | Duyệt số liệu ước lượng |
| 1 | Server xếp tuyến: ma trận ước lượng, cheapest insertion, 2-opt/Or-opt, chia ngày theo thời gian, ranh giới ở thị trấn; áp cho cả lịch AI chọn | `planner-order.ts`, `journey-planner.ts` (`balanceJourneyDays`), `planning-engine.ts` (`scheduleSelection`) | ADR: AI không còn quyết thứ tự |
| 2 | Mô hình thời gian: 07:30, đệm cảnh quan, khối trưa, kéo dài/rút gọn theo ngày, làm tròn 5' | `planner-engine.ts` (`schedulePlannerDays`), `tripsage-chat-tools.ts` (bỏ rút toàn cục) | ADR: đổi giờ đi, đệm |
| 3 | Bỏ giới hạn 2/3/4; lấp ngày theo giá trị/phút; bỏ "bớt điểm cuối" | `planner-engine.ts`, `planning-engine.ts:49`, `tripsage-chat-tools.ts:1120/1262`, prompt `tripsage-chat-service.ts:78` | ADR: bỏ nhịp đi (thay ADR-46 §2) |
| 4 | Siết tối ưu thời tiết | `planner-weather-preference.ts` | — |
| 5 | Giao diện: "khoảng 9:15", dòng "Dừng chụp ảnh dọc đường", "Thời gian tự do" | `trip-timeline/*`, `tripsage-timeline.ts` | — |

**Tiêu chí nghiệm thu** (chạy lại đúng ca tham chiếu: 5 ngày, xe máy, từ TP Hà Giang):

1. Không có cặp điểm liền nhau nào đi ngược về phía điểm trước đó: góc rẽ > 120° và quãng đi lùi > 5 km là lỗi.
2. Tổng quãng đường ước lượng không vượt quá 1,05 lần kết quả 2-opt trên cùng tập điểm.
3. Mọi ngày tham quan (trừ ngày về) kết thúc sau 15:30, hoặc có khối "Thời gian tự do" kèm gợi ý.
4. Có ít nhất 18 điểm tham quan trong 5 ngày (sau khi bổ sung dữ liệu), gồm đủ 7 điểm hot.
5. Đêm 1–4 kết thúc trong bán kính 20 phút quanh một thị trấn ngủ.
6. Validator vẫn PASS, và lưu chuyến tái hiện đúng giờ.

Lịch kỳ vọng (minh hoạ, chưa tính bằng code):

- **N1** TP Hà Giang → dốc Bắc Sum → Cổng trời Quản Bạ / Núi Đôi → hang Lùng Khúy → Lùng Tám → rừng thông Yên Minh (ngủ Yên Minh)
- **N2** Thẩm Mã → Phố Cáo → Chín Khoanh → Sủng Là → Dinh Vương → Phố Bảng → phố cổ Đồng Văn (ngủ Đồng Văn)
- **N3** Lũng Cú → Lô Lô Chải → về Đồng Văn → Mã Pì Lèng → Pả Vi → Mèo Vạc (ngủ Mèo Vạc)
- **N4** Nho Quế (thuyền) → chợ Mèo Vạc (nếu Chủ nhật) → Du Già, thác Du Già (ngủ Du Già)
- **N5** Du Già → về TP Hà Giang → Hạ Thành / Núi Cấm

## 4. Rà soát dữ liệu điểm đến

Nguồn: production qua `/api/destinations` và `/api/destinations/{id}` (2026-11-24). `apps/web/.env` trỏ tới DB **dev** (`ep-purple-pond-…`, 11 dòng, có điểm `[TEST]`), không phải production.

### 4.1 Hiện trạng production (22 điểm công khai)

| Nhóm | Điểm | Ghi chú |
|---|---|---|
| Trên vòng cung, dùng được (17) | Cổng trời Quản Bạ, Núi Đôi, Nặm Đăm, Lùng Tám, Rừng thông Yên Minh, Sủng Là, Dinh Vương, Phố cổ Đồng Văn, Lũng Cú, Lô Lô Chải, Mã Pì Lèng, Pả Vi Hạ, Nho Quế, Mèo Vạc, Khâu Vai, Du Già, Hạ Thành | 5 điểm còn tiền tố `[Tam]` |
| Xa vòng (3) | Hoàng Su Phì, Chiêu Lầu Thi (tây), Căng Bắc Mê (nam) | Chỉ hợp lịch dài/chuyên biệt |
| Không lập lịch được (2) | Cao nguyên đá Đồng Văn (là cả vùng), Pả Vi Thượng | Thiếu thời lượng |

Các vấn đề chung:

- `isOutdoor = false` cho cả 22 điểm, nên tối ưu thời tiết/hoàng hôn không bao giờ coi điểm nào là ngoài trời.
- Mọi điểm cùng `area = "khu vực hà giang"`. Script `fix-content-data-2026-11.ts` (B3) sửa được nhưng mới chạy dry-run.
- Giờ mở cửa gần như cùng một mẫu 07:00–17:00 (theo audit 2026-11-22).
- Thiếu hẳn nhóm **điểm dừng chụp ảnh trên đường đèo**. Với khách đi xe máy, đây là trải nghiệm chính.

### 4.2 Bổ sung (trong file SQL)

| Điểm | Toạ độ (OSM) | Thời lượng (gợi ý/tối thiểu, phút) | Giờ |
|---|---|---|---|
| Dốc Bắc Sum | 22.9882, 104.9359 | 20/10 | 06:00–18:30 |
| Hang Lùng Khúy | 23.0788, 105.0199 | 75/45 | 07:00–17:00 |
| Dốc Thẩm Mã | 23.1690, 105.1942 | 20/10 | 06:00–18:30 |
| Làng Phố Cáo | 23.2008, 105.1759 | 45/20 | 06:00–18:30 |
| Dốc Chín Khoanh | 23.2099, 105.1952 | 15/10 | 06:00–18:30 |
| Phố cổ Phố Bảng | 23.2531, 105.1851 (tâm xã, **xấp xỉ**) | 45/30 | 06:00–18:30 |
| Chợ phiên Đồng Văn | 23.2769, 105.3610 | 60/30 | Chủ nhật 06:00–12:00 |
| Chợ phiên Mèo Vạc | 23.1644, 105.4088 | 45/30 | Chủ nhật 06:00–12:00 |
| Thác Du Già | 22.9255, 105.1977 | 60/30 | 07:00–17:00 |
| Núi Cấm (TP Hà Giang) | 22.8240, 104.9782 | 45/30 | 06:00–18:30 |

Sửa điểm cũ: bỏ `[Tam]`, bật `isOutdoor` cho 10 điểm ngoài trời, điền thời lượng cho Pả Vi Thượng, mở rộng giờ cho 5 điểm ngắm ven đường lên 06:00–18:30.

Chưa chèn vì thiếu toạ độ đã kiểm tra: Hẻm Tu Sản, Cột mốc Km0, Bảo tàng tỉnh, chợ Lũng Phìn, nhà cổ Lao Xa. Ngoài ra Mã Pì Lèng trong DB lệch khoảng 1,2 km so với điểm ngắm trên OSM.

**Giới hạn:** toạ độ lấy từ OpenStreetMap, không phải thực địa. Thời lượng, giờ chợ và giờ mở là ước lượng. Các điểm mới chưa có ảnh và nguồn tài liệu, nên thẻ điểm đến sẽ không có ảnh.

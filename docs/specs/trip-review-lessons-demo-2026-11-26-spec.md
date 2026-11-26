# Spec: Bài học từ buổi chạy thử demo 2026-11-26 — Sửa lịch bằng AI, ràng buộc nghỉ đêm tự sinh, chi phí luôn hiện & lỗi hiển thị timeline

Trạng thái: **đã triển khai** (2026-11-26; chủ dự án duyệt 2026-11-26: "duyệt spec … sửa hết"). Q1–Q6 đã áp dụng theo phương án mặc định ở mục "Quyết định đã chốt".
Phạm vi: `/assistant` (`tripsage-chat-tools`, `tripsage-chat-service`), trang sửa chuyến `/trips/[id]/edit` (`lib/trip-edit-client.ts`), trang chi tiết chuyến (`trips-view`, `day-timeline`, `suggestion-markers`, `lib/overnight-anchor.ts`), lưu chuyến (`trip-save`).
Nguồn:
- Nhật ký lỗi [trip-review-lessons-demo-2026-11-26.md](trip-review-lessons-demo-2026-11-26.md) (B1–B13), chạy trên production `kltn-rho.vercel.app` bằng tài khoản demo cho giảng viên phản biện.
- Production deployment `dpl_HVi5TJGeXvEyd9FnoqBjn8RJ4jro` = commit `0d8da68` (HEAD `master` hiện tại) ⇒ mọi lỗi dưới đây có trên code hiện tại.
- Đọc lại các commit ngày 2026-11-25: `1ef0d61` (ADR-55), `050c942`…`1506fde` (spec c6be04d7, ADR-56), `c30c286`…`0d8da68` (spec d1ada90d, ADR-57), cùng thay đổi chưa commit trong working tree (xem mục "Bối cảnh").
- Nền: [ADR-47, ADR-53, ADR-55, ADR-56, ADR-57](../decisions.md), [trip-review-lessons-d1ada90d-spec.md](trip-review-lessons-d1ada90d-spec.md).

---

## Bối cảnh: hôm qua (2026-11-25) đã sửa gì

| Commit | Nội dung | Liên quan lỗi hôm nay |
|---|---|---|
| `1ef0d61` ADR-55 | Server tự xếp tuyến (`arrangeTripRoute`: 2-opt/Or-opt, lấp giờ trống theo giá trị), chia ngày theo thời gian, bỏ giới hạn số điểm theo nhịp. Bộ xếp **bị bỏ qua khi có `overnightAreas`** (ADR-53) hoặc khi đề xuất lại đúng các điểm đã hiện. | B1, B2 |
| `050c942` | Cache thời gian tuyến (`destination_travel_time`), sửa quá giờ theo thứ tự D3, đệm an toàn 45 phút. | B4 (cần kiểm) |
| `b39150b` | Máy chủ tự tính chi phí theo hạng, tự tính lại khi đổi lịch/chặng tiếp cận. | D4 |
| `cc07dc6`, `8bdcac2`, `fc57c3f` | Lịch tiếp cận theo giờ, km/thời gian từng chặng, ngày cả chuyến, ảnh dự phòng, gộp điểm chụp ảnh. | — |
| `2b6cf99` ADR-56 | Hàng chờ tin nhắn khi trợ lý đang trả lời. | — |
| `26f482e` D1, D4 (ADR-57) | `RETURN_DEADLINE_MISSED` thành cảnh báo không chặn lưu: thêm **`validation.advisories`** (`trip-validation.ts`, `edit-journey-server.ts`); nghỉ trưa linh động. | **B8 (hồi quy)** |
| `32239d2`, `be19eb7` D2 | `overnight-anchor.ts`, `journeyPlan.overnightStays`, neo chặng về/sáng hôm sau theo tâm thị trấn, tiêu đề ngày theo khu vực nghỉ đêm. | B3, B5 |
| `d8f1238` D3, D5 | Tách "Chặng lên Hà Giang" / "Chuẩn bị tại TP Hà Giang", ảnh từng điểm, khử trùng gợi ý tối. | B5, B6 |
| `7de08d3` D6 | Khử trùng điểm xuất phát, lập lịch ngay khi chốt nơi đi. | — |
| `6d3f205` | Bố cục tiêu đề ngày, chống treo stream, nút so sánh cách đi. | — |

Đang làm dở, **chưa commit** (không thuộc spec này, giữ nguyên): `resolveUniqueOriginMatch` + làm sạch nhãn khi tự xác nhận điểm xuất phát (`tripsage-chat-origin.ts`, `origin-search-contract.ts`, `tripsage-chat-tools.ts`); đẩy phần đuôi văn bản (`flush-tail-*`) ra stream và khôi phục lượt trả lời sau khi rớt kết nối (`tripsage-chat-service.ts`, `tripsage-streamed-text.tsx`, `tripsage-chat-client.tsx`).

---

## Problem Statement

Chạy thử như khách thật trên production cho thấy các luồng demo chính chạy tốt (hỏi thời tiết, lập lịch 5 ngày đạt 5/5, hỏi văn hóa có trích nguồn, ước tính chi phí, lưu chuyến, khám phá điểm đến), nhưng còn các lỗi làm hỏng trải nghiệm:

1. **Sửa lịch bằng AI trên chuyến đã lưu không dùng được (B8):** lời tư vấn hiện đủ nhưng luôn kết bằng "Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi." và không có thẻ phương án để áp dụng. Tái hiện 3/3 lần.
2. **Sửa lịch bằng lời trong chat làm lịch tệ đi (B1, B2):** khách gõ "cho ngày cuối đi sớm hơn, thêm sông Nho Quế" ⇒ bot tự đặt ràng buộc "nghỉ TP Hà Giang đêm 3" mà khách không nói, lịch rơi từ 8 xuống 5 điểm, Nho Quế không được thêm; bấm "Thêm 1 ngày" ⇒ ngày 5 trống, điểm không được bổ sung lại.
3. **Chi phí không hiện trên trang chuyến nếu chưa ghim (B9):** người dùng tưởng là lỗi.
4. **Timeline trang chuyến hiển thị sai/thiếu (B3, B4, B5, B6, B10):** nhãn nhận phòng lệch khu nghỉ; khoảng 20 phút không giải thích; tiêu đề Ngày 1 lấy điểm của Ngày 2; không có gợi ý chỗ nghỉ/ăn tối; màn hẹp dòng "Ăn sáng" vỡ thành mỗi dòng một ký tự.
5. **Nút gợi ý chat chưa chuẩn (B11, B12, B13):** nhắc "lịch" khi chưa có lịch; gợi ý địa điểm ngoài Hà Giang; định dạng danh sách không đồng nhất.

---

## Nguyên nhân gốc

### R1 — `validation.advisories` mới thêm bị schema `.strict()` phía client từ chối ⇒ B8 (đã kiểm chứng)

- Bắt stream thật của `POST /api/trips/cmwwzo14a000108jvryf9zvs8/edits/ai` (2026-11-26): server gửi đủ chunk `data-trip-assistant-result` (`status: "ADVISED"`, 3 `suggestions`) rồi `finish`. Vercel log: `kind: "ADVISED"`, 31–45 giây, không lỗi.
- `data.validation` có khóa `["timeReference","groups","canConfirm","advisories"]`. `advisories` được thêm ở `26f482e` (chuyến về 19:18 > hạn 18:00 ⇒ cảnh báo `RETURN_DEADLINE_MISSED`).
- `lib/trip-edit-client.ts` — `aiValidationSchema` (`.strict()`, chỉ 3 khóa) ⇒ `aiEditResponseSchema.safeParse` thất bại ⇒ `streamAiTripEdit` (dòng 760–775) **bỏ qua im lặng** và trả `INTERRUPTED`. `satisfies z.ZodType<TripValidation>` không bắt được vì `advisories` là trường tùy chọn.
- Mọi chuyến có cảnh báo (về muộn, …) đều hỏng sửa lịch bằng AI. `aiValidationSchema` còn dùng ở `PROPOSED` và trong `adviceSuggestionCardSchema` ⇒ cùng rủi ro.

### R2 — Model tự ghi `overnightAreas` qua `recordTripInfo`; khi có ràng buộc này bộ xếp ADR-55 bị tắt ⇒ B1, B2 (đã đọc code, chưa chạy lại)

- `tripsage-chat-tools.ts:383, 724-729`: `recordTripInfo` nhận `overnightAreas` thẳng từ model, **không kiểm tra người dùng có nói**. Trích xuất tất định từ lời người dùng (`:1406`, `mergeOvernightAreaConstraints`) là nguồn đúng theo ADR-53.
- Prompt (`tripsage-chat-service.ts:59`) mô tả chip giải quyết "Nghỉ X đêm 1 / Thêm 1 ngày / Bỏ yêu cầu nghỉ X" ⇒ model đã dùng cơ chế này để "rút chặng về", sinh ràng buộc giả "nghỉ TP Hà Giang đêm 3".
- `tripsage-chat-tools.ts:1494`: khi `effectiveOvernightAreas.length > 0` thì **không gọi `arrangeTripRoute`** ⇒ không xếp vòng, không lấp giờ trống ⇒ lịch còn 5 điểm; thêm ngày cũng không bổ sung điểm (B2).

### R3 — Hai nguồn "khu vực nghỉ đêm" trên cùng một mốc nhận phòng ⇒ B3

- Tiêu đề `Nhận phòng · ${eveningPlan.overnightArea}` (`components/trip-timeline/suggestion-markers.ts:202`) lấy khu vực từ kế hoạch buổi tối (gần điểm cuối ngày: Phố Bảng).
- Dòng `Về khu vực ${stay.area}` (`lib/overnight-anchor.ts:144-168`) lấy `journeyPlan.overnightStays` (D2: Yên Minh), cũng là nguồn cho tiêu đề ngày hôm sau.

### R4 — Tiêu đề ngày lấy đích của chặng OUTBOUND dù điểm đó thuộc ngày sau ⇒ B5

- `resolveDayRouteLabel` (`components/trip-timeline/day-timeline.tsx`): Ngày 1 không có điểm, leg `OUTBOUND` của ngày 1 có `to = ATTRACTION(Dốc Bắc Sum)` (điểm đầu Ngày 2) ⇒ tiêu đề `Hà Nội → Dốc Bắc Sum`. `prevOvernight` chỉ áp cho `dayIndex > 1`.

### R5 — Lưới 2 cột ở màn hẹp không đặt `.dt-break-line` vào cột 2 ⇒ B10 (đã đọc code)

- `components/trip-timeline/day-timeline.css` khối `@container dt-day (max-width: 480px)` (~735) và khối tương tự (~875): `.dt-break-item` thành `20px minmax(0,1fr)`; con thứ 3 `p.dt-break-line` (ăn sáng, `day-timeline.tsx:755-765, 909-920`) tự chảy vào cột 20px.

### R6 — Chi phí chỉ hiện qua cơ chế ghim (ADR-47) ⇒ B9 (theo thiết kế)

- Lưu từ chat chỉ gửi `pinnedItems` người dùng đã ghim (`tripsage-save-section.tsx:242` → `tripsage-chat-save.ts:226` → `trip-save-service.ts:270`); trang chuyến chỉ render chi phí trong `TripPinnedSection` (`trips-view.tsx:866, 1297`).

### Nguyên nhân đã điều tra & xác nhận trong quá trình triển khai (D6)

- **B4 (đã xác nhận từ code):** Trên `trips-view.tsx`, `rawGap = visit.startMinute - inboundTransferLeg.endMinute` không trừ khung `Nghỉ trưa` (`60 phút`) diễn ra giữa hai điểm (`inboundTransferLeg.startMinute` = giờ rời điểm trước `13:00`, nên `endMinute = 15:04` chưa tính nghỉ trưa `13:00–14:00`). Khi điểm #5 bắt đầu lúc `16:25` (`14:00 + 109p lái + 15p nghỉ + 20p chụp ảnh = 16:24`, làm tròn lên 5p = `16:25`), `rawGap` bằng `81 phút` vượt ngưỡng `moderateScenic + 10 = 30`, khiến `photoMinutes` rơi về `0` và dòng `+20 phút chụp ảnh` biến mất. Ngoài ra `companion-group-view.tsx` trước đây không truyền `photoMinutes` và chưa có hiển thị `chờ mở cửa N phút` khi có khoảng chờ mở cửa `>= 5` phút.
- **B6 (đã xác nhận từ code):** Ba nguyên nhân kết hợp:
  1. `activityAnchors` (`tripsage-activities.ts`) chỉ tạo mốc `dN-overnight` khi ngày đó có `last = day.stops.at(-1)`. Ở lịch 5 ngày từ Hà Nội, Ngày 1 là `OUTBOUND_ONLY` (0 điểm tham quan) ⇒ `last` là `undefined` ⇒ bỏ qua hoàn toàn `d1-overnight`, làm Ngày 1 hiện `"Chưa tìm được gợi ý buổi tối"`.
  2. `addSuggestions` (`tripsage-chat-tools.ts`) kiểm khoảng cách `LODGING` (`<= 5 km`) chỉ theo điểm dừng cuối ngày (`lastStop`) và chỉ nới theo `tripInfo.overnightAreas` (ràng buộc người dùng đặt), chưa tính theo `journeyPlan.overnightStays` (tâm thị trấn D2) và báo `NO_ANCHOR` cho Ngày 1 trống điểm ⇒ từ chối gợi ý homestay ở TP Hà Giang / Yên Minh / Đồng Văn / Mèo Vạc khi điểm dừng cuối nằm cách tâm thị trấn > 5 km.
  3. Khi ngày đi và nơi xuất phát đã xác nhận (`e6beafeb`), ghi chú `proposeItinerary` hướng model gọi `searchHotels` (thẻ khách sạn riêng, không gắn `LODGING` vào timeline) thay vì tự động tra chỗ nghỉ theo từng đêm trên máy chủ. Đã bổ sung `nearbyLodgingSuggestions` chạy song song trong `emitNearbyActivities` bám đúng `overnightStays` / `TP Hà Giang` cho mọi đêm `1..N-1`.

---

## Solution

Sửa ngay hồi quy chặn demo (B8), chặn ràng buộc nghỉ đêm không do người dùng nêu (B1–B2), cho chi phí luôn hiện trên trang chuyến (B9), làm đúng các nhãn/khoảng thời gian/bố cục trên timeline (B3–B6, B10), và chỉnh nhẹ nút gợi ý chat (B11–B13). Không đổi bất biến Validator.

---

## User Stories

1. Là người dùng đã lưu chuyến, khi nhờ trợ lý trong trang sửa chuyến tìm cách về sớm hơn, tôi thấy các thẻ phương án và áp dụng được một thẻ — kể cả khi chuyến đang có cảnh báo về muộn.
2. Là người dùng trong chat, khi nói "cho ngày cuối đi sớm hơn", tôi không bị gán yêu cầu nghỉ đêm mà tôi không nói, và lịch không bị mất điểm ở các ngày khác.
3. Là người dùng, khi thêm 1 ngày, lịch dùng hết số ngày mới và xếp lại các điểm tôi đã đòi.
4. Là người dùng, mở trang chuyến đã lưu là thấy chi phí ước tính mà không phải nhớ bấm ghim.
5. Là người dùng, mỗi ngày trên timeline có tên khu nghỉ, tiêu đề ngày và giờ giấc nhất quán; xem trên điện thoại không bị vỡ chữ.
6. Là người dùng hỏi khám phá, các nút gợi ý luôn phù hợp với ngữ cảnh (chưa có lịch thì không nhắc "lịch") và nằm trong phạm vi Hà Giang.

---

## Implementation Decisions

### D1 — Sửa hồi quy sửa lịch bằng AI (B8) — ưu tiên 1

1. `lib/trip-edit-client.ts`: thêm `advisories` (tùy chọn, đúng kiểu `ValidationAdvisory` của `trip-validation.ts`) vào `aiValidationSchema`; rà toàn bộ schema client của `/edits/ai` và `/edits/preview` với kiểu server sửa trong 3 ngày qua (`26f482e`, `32239d2`, `cc07dc6`, `050c942`).
2. Ưu tiên **dùng chung schema** với server (export từ module `trip-validation` / `trip-edit`) thay vì sao chép, để trường mới không làm vỡ client lần nữa.
3. Không còn nuốt lỗi im lặng: khi `data-trip-assistant-result` không parse được, trả một kết quả lỗi riêng (ví dụ `FAILED`/`AI_INVALID_RESPONSE` với thông báo "Phản hồi không hợp lệ, hãy thử lại") và ghi `console.warn` tên trường lỗi (không ghi dữ liệu nhạy cảm); không hiển thị là "mất kết nối".
4. Kiểm tra cùng lỗi ở `/assistant` (chat lập lịch) có schema client `.strict()` nào chưa có `advisories` không.

### D2 — Chỉ người dùng mới tạo được ràng buộc nghỉ đêm; ràng buộc không tắt bộ xếp tuyến (B1, B2)

1. `recordTripInfo.overnightAreas` (`tripsage-chat-tools.ts:724`): chỉ chấp nhận ràng buộc khi lời người dùng (tin nhắn gần nhất hoặc lịch sử) khớp trích xuất tất định (`extractOvernightAreaConstraints` hoặc tương đương) **hoặc** người dùng vừa bấm chip nghỉ đêm; gửi `[]` để bỏ luôn được phép. Ràng buộc model tự nghĩ ra bị bỏ và tool trả ghi chú cho model.
2. Prompt (`tripsage-chat-service.ts:59`): nói rõ yêu cầu "về sớm / đi sớm hơn ngày cuối" ⇒ dùng `departureMinute` ngày cuối, bớt/đổi điểm ngày cuối, hoặc dời điểm xa sang ngày trước — **không** dùng `overnightAreas`.
3. Có `overnightAreas` vẫn chạy `arrangeTripRoute` nhưng giữ điểm cuối các ngày bị ràng buộc (hoặc lấp giờ trống sau `arrangeSelectionForOvernightAreas`), để lịch không mất điểm khi có ràng buộc thật. Cần thử trên ca ADR-53 gốc (`66a36527`) để không hồi quy.
4. "Thêm 1 ngày": khi số ngày tăng, dựng lại lịch dùng hết ngày (không đánh dấu `reshuffleOfShown`), ưu tiên `mustIncludeDestinationIds` và điểm vừa bị rơi do chặng dài.
5. Yêu cầu thêm điểm (Nho Quế) mà không xếp được phải nói rõ lý do (đã có ở prompt) — thêm test.

### D3 — Một nguồn khu vực nghỉ đêm cho timeline (B3, B5)

1. Mốc nhận phòng: tiêu đề `Nhận phòng · X` dùng cùng khu vực với `overnightStays` (D2) khi có; chỉ dùng `eveningPlan.overnightArea` khi không có `overnightStays`. Gợi ý chỗ nghỉ/ăn tối bám cùng khu vực đó.
2. `resolveDayRouteLabel`: nếu đích của leg là điểm không thuộc ngày đó (ngày chỉ có chặng lên Hà Giang), dùng khu vực nghỉ đêm của ngày (`overnightStays[day]` hoặc "TP Hà Giang") ⇒ `Hà Nội → TP Hà Giang`.
3. Áp dụng đồng nhất cho `trips-view`, `tripsage-plan-panel`, `companion-group-view` (như D2 của ADR-57).

### D4 — Chi phí ước tính luôn hiện trên trang chuyến (B9) — chủ dự án đã quyết 2026-11-26

Thay một phần ADR-47 **chỉ cho chi phí** (vé máy bay / chỗ ở / quán ăn vẫn ghim tùy chọn). Hướng đề xuất (cần chốt câu hỏi Q1–Q5 bên dưới):
1. Lưu từ chat: luôn kèm bản ước tính chi phí mới nhất của hội thoại (khớp `accessLegId` và lịch hiện tại) như một `COST` item, kể cả khi người dùng chưa bấm ghim.
2. Trang chuyến: hiển thị mục **"Chi phí ước tính"** riêng (tách khỏi "Mục đã ghim"), có dòng "Ước tính tại ngày …, chưa phải báo giá".
3. Không có ước tính (lưu từ form, chuyến cũ): hiện trạng thái rỗng có nút "Tính chi phí" (Q3).
4. Ghi ADR-58 (hoặc sửa ADR-47) trước khi làm.

### D5 — Bố cục timeline màn hẹp (B10)

Thêm `.dt-break-line` (và kiểm `dt-leg-item`, nghỉ trưa, nghỉ đêm, mốc nhận phòng) vào nhóm `grid-column: 2` ở cả hai khối responsive của `day-timeline.css`. Kiểm ở 375px, 480px, 550px.

### D6 — Khoảng thời gian và gợi ý chỗ nghỉ (B4, B6) — điều tra rồi sửa

1. B4: mọi phút giữa hai mốc phải được giải thích trên dòng chặng (lái xe + nghỉ + chụp ảnh + chờ mở cửa). Nếu là đệm chụp ảnh, hiện `+N phút chụp ảnh` cả khi có "nghỉ".
2. B6: tìm vì sao gợi ý chỗ nghỉ / ăn tối rỗng ở lịch 5 ngày; gợi ý phải bám khu vực nghỉ đêm của D3.

### D7 — Nút gợi ý trong chat khám phá (B11, B12, B13) — ưu tiên thấp

1. Không sinh chip có hành động trên lịch ("Bỏ … khỏi lịch", "Giữ … trong lịch") khi hội thoại chưa có bản lịch.
2. Không sinh chip cho điểm đến ngoài Hà Giang; thay bằng chip Hà Giang tương ứng.
3. B13: hướng dẫn định dạng danh sách nhất quán trong prompt (hoặc bỏ qua nếu tốn công — chỉ là thẩm mỹ).

---

## Bất biến giữ nguyên

- Validator quyết định; thiếu dữ liệu kiểm tra không phải là đạt. Cảnh báo về muộn vẫn **không** chặn lưu (ADR-57).
- Ràng buộc nghỉ đêm do người dùng nêu (ADR-53) vẫn được giữ qua các lượt chỉnh.
- Chi phí là ước tính, không phải đặt chỗ hay báo giá; chia sẻ cho nhóm đồng hành vẫn theo ADR-47 (chỉ dòng lưu trú + ăn uống).
- Hợp đồng `SUCCESS / FAILED / UNKNOWN` và idempotency khi lưu không đổi (thêm `COST` vào payload lưu phải đổi chữ ký idempotency một cách tất định).

---

## Testing Decisions

- **B8:** test `streamAiTripEdit` với chunk `data-trip-assistant-result` có `validation.advisories` (ADVISED + suggestions, PROPOSED) ⇒ `RESULT`; chunk sai schema ⇒ lỗi riêng, không phải `INTERRUPTED`. Test hợp đồng: schema client chấp nhận đầu ra thật của `edit-journey-server` cho chuyến về muộn.
- **B1/B2:** test tool `recordTripInfo` từ chối `overnightAreas` không có trong lời người dùng; test hồi quy dựng lại ca hôm nay (4N3Đ xe máy, Hà Nội, Lũng Cú + Mã Pì Lèng → "đi sớm hơn ngày cuối, thêm Nho Quế") ⇒ không có `overnightAreas`, số điểm không giảm ngoài ngày cuối; "Thêm 1 ngày" ⇒ ngày mới có điểm. Giữ test ADR-53 gốc xanh.
- **B3/B5:** test `resolveDayRouteLabel` cho ngày chỉ có chặng lên ⇒ `Hà Nội → TP Hà Giang`; test marker nhận phòng dùng khu vực `overnightStays`.
- **B9:** test lưu từ chat kèm `COST` khi chưa ghim; test trang chuyến render mục chi phí; test chuyến không có ước tính.
- **B10:** test CSS/markup (như các test `trips-*.vitest.test.ts`) hoặc kiểm tay ở 375/480px bằng trình duyệt.
- Chạy `tsc --noEmit`, `vitest run src`, `git diff --check`; smoke lại trên tài khoản demo đúng các câu ở nhật ký lỗi.

---

## Out of Scope

- Thay đổi đang làm dở chưa commit (xác nhận điểm xuất phát, khôi phục stream chat) — tiếp tục ở việc riêng.
- B7 (ngày cuối 421 km xe máy) — quyết định sản phẩm, chưa đổi.
- Hiệu chỉnh hệ số quanh co đường, Or-opt chạy lại theo chặng thật (đã ghi known issue ADR-55).
- Lỗi có sẵn `tripsage-cost-card.vitest.test.ts` (Bug 3 CSS).

---

## Thứ tự triển khai đề xuất

1. **D1 (B8)** — nhỏ, chặn demo, là hồi quy ⇒ làm trước, deploy sớm.
2. **D5 (B10)** — sửa CSS nhỏ.
3. **D3 (B3, B5)**.
4. **D2 (B1, B2)** — cần thận trọng với ADR-53/55, có test hồi quy.
5. **D4 (B9)** — sau khi chốt Q1–Q5 và ghi ADR.
6. **D6 (B4, B6)** — điều tra rồi sửa.
7. **D7 (B11–B13)**.

---

## Câu hỏi cần chủ dự án chốt

- **Q1 (D4):** Chi phí khi lưu lấy bản ước tính mới nhất trong chat, hay server tính lại từ lịch đã lưu?
- **Q2 (D4):** Sửa lịch ở `/trips/[id]/edit` thì chi phí tự tính lại, hay chỉ gắn nhãn "Cần tính lại"?
- **Q3 (D4):** Chuyến không có ước tính (lưu từ form, chuyến cũ) hiện gì — trống kèm nút "Tính chi phí", hay ẩn mục?
- **Q4 (D4):** Có backfill chi phí cho chuyến đã lưu trước đây không?
- **Q5 (D4):** Người dùng đã ghim chi phí thủ công thì giữ bản ghim hay ghi đè bằng bản mới nhất khi lưu?
- **Q6 (D2):** Khi có ràng buộc nghỉ đêm thật, có cho bộ xếp ADR-55 lấp giờ trống ở các ngày không bị ràng buộc không?

## Quyết định đã chốt (2026-11-26, phương án mặc định khi duyệt spec)

- **Q1:** Lấy bản ước tính chi phí **mới nhất của hội thoại** (đã khớp `accessLegId` và lịch hiện tại) kèm vào lưu dưới dạng item `COST`; không tính lại phía server lúc lưu.
- **Q2:** Sửa lịch ở `/trips/[id]/edit` **không** tự tính lại; mục chi phí gắn nhãn "Cần tính lại" (dùng lại cơ chế nhãn sẵn có) khi lịch đã lưu khác lịch lúc ước tính.
- **Q3:** Chuyến không có ước tính: hiện mục "Chi phí ước tính" với dòng trạng thái rỗng "Chưa có ước tính chi phí" và liên kết "Hỏi trợ lý" sẵn có; không thêm luồng tính mới.
- **Q4:** Không backfill chuyến cũ.
- **Q5:** Bản mới nhất thay bản cũ (giữ quy tắc ADR-47 "một ước tính chi phí mới thay ước tính cũ").
- **Q6:** Có — khi có ràng buộc nghỉ đêm thật, vẫn chạy bộ xếp ADR-55 để lấp giờ trống, nhưng không được dời điểm cuối của ngày bị ràng buộc.

---

## Ghi chú triển khai (2026-11-26)

| Hạng mục | Lỗi | Commit | Tóm tắt triển khai & lựa chọn tối giản |
|---|---|---|---|
| **D1** | B8 | `29a095c` | Xuất dùng chung `tripValidationSchema` (có `advisories` tùy chọn) từ `trip-validation.ts`, thay toàn bộ bản sao `.strict()` ở `trip-edit-client.ts`, `in-trip-client.ts` và `in-trip-actions.ts`; `streamAiTripEdit` không nuốt lỗi parse `data-trip-assistant-result` (trả `FAILED/AI_INVALID_RESPONSE` + `console.warn` chỉ tên đường dẫn trường). Đã rà `/assistant` (dùng chung `plannerResultSchema` / `journeyPlanSchema` sẵn có `overnightStays`). |
| **D5** | B10 | `ef549cd` | Thêm `.dt-break-item > .dt-break-line` vào `grid-column: 2` ở cả `@container dt-day (max-width: 480px)` và `@media (max-width: 768px)` (giới hạn con trực tiếp `>` để không đẩy `p.dt-break-line` bên trong `.dt-lunch-wrap` sang cột 2 ảo); bổ sung quy tắc 2 cột cho `.dt-day--compact` dưới `@container (max-width: 480px)`. |
| **D3** | B3, B5 | `1a45ca4` | Một nguồn khu vực nghỉ đêm duy nhất (`overnightStays`) cho `buildDayEveningPlan`, `buildDaySuggestionMarkers`, `resolvePreviousOvernightArea`, `resolveEveningAnchorPoint` và cả 3 màn (`trips-view`, `tripsage-plan-panel`, `companion-group-view`); `resolveDayRouteLabel` dùng `overnightArea ?? "TP Hà Giang"` khi đích `OUTBOUND` thuộc ngày sau (`Hà Nội → TP Hà Giang`). |
| **D2** | B1, B2, Q6 | `97a3b84` | Thêm `filterEvidencedOvernightConstraints` trong `tripsage-overnight.ts` để `recordTripInfo` từ chối mọi `overnightAreas` không khớp lời người dùng / chip nghỉ đêm (vẫn cho `[]`); cập nhật prompt `tripsage-chat-service.ts`; mở rộng `arrangeTripRoute` với `lockedDayEndIndices` (Q6) và `prioritizeIds`; bỏ `reshuffleOfShown` và khôi phục `mustIncludeDestinationIds` khi `durationDays` tăng ("Thêm 1 ngày"); báo `unscheduledRequiredStops` nếu điểm bắt buộc không xếp được. |
| **D4** | B9, Q1–Q5 | `57d7fe7` | Ghi **ADR-58** trong `docs/decisions.md` trước khi code. `mergeLatestCostForSave` tự đính kèm bản ước tính chi phí mới nhất khớp `accessLegId` và số ngày (thay bản cũ, đổi `Idempotency-Key` tất định). Lưu tùy chọn `visitFingerprint` trong `trip_pinned_item.payload` (không đổi schema DB) để `/trips/[id]` hiện mục riêng **"Chi phí ước tính"** (`TripCostEstimateSection`), tách khỏi "Mục đã ghim", gắn nhãn **"Cần tính lại"** khi lịch đã sửa (Q2), và hiện trạng thái rỗng + liên kết **"Hỏi trợ lý"** khi chưa có ước tính (Q3). |
| **D6** | B4, B6 | `43bb468` | Thêm `resolveLegGapBreakdown` + `waitMinutes` trong `day-timeline.tsx` và áp dụng đồng nhất cho cả 3 view (`trips-view`, `tripsage-plan-panel`, `companion-group-view`) trừ đúng thời gian nghỉ trưa trước chặng. Bổ sung mốc `d1-overnight` (TP Hà Giang) cho ngày `OUTBOUND_ONLY`, `nearbyLodgingSuggestions` chạy song song theo `overnightStays`, và chấp nhận `addSuggestions` quanh tâm khu vực nghỉ đêm D2. |
| **D7** | B11, B12, B13 | `689d207` | Thêm `isItineraryActionChipWithoutPlan` và `isOutOfScopeDestinationChip` trong `tripsage-chat-context.ts`, chặn tại `suggestReplies`, bổ sung lớp lọc dự phòng trong `reconcileQuickRepliesWithQuestion`, và hướng dẫn định dạng danh sách đồng nhất (B13) trong `PERSONA_INSTRUCTIONS`. |

> **Lưu ý về thay đổi chưa commit sẵn có:** Các thay đổi đang làm dở trong working tree (`AGENTS.md`, `tripsage-chat-origin.ts`, `origin-search-contract.ts`, `tripsage-streamed-text.tsx`, `tripsage-chat-client.tsx`, `tripsage-chat-service.ts`, `tripsage-chat-tools.ts` cùng test của chúng) được giữ nguyên tuyệt đối; ở 3 file phải sửa chung (`tripsage-chat-tools.ts`, `tripsage-chat-service.ts`, `tripsage-chat-client.tsx`), chỉ stage đúng các hunk thuộc spec này.

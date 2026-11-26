# Ghi nhận lỗi: chạy thử demo trên production 2026-11-26

Trạng thái: **ghi nhận lỗi — chờ chủ dự án duyệt hướng sửa** (chưa phải spec đã duyệt, chưa triển khai).
Phạm vi nghi vấn: `/assistant` (`tripsage-chat`, sửa lịch / ràng buộc nghỉ đêm), lõi `trip-planner` (`overnight-anchor`, dựng ngày), timeline (`day-timeline`, `trips-view`).
Môi trường: production `kltn-rho.vercel.app`, deployment `dpl_HVi5TJGeXvEyd9FnoqBjn8RJ4jro` = commit `0d8da68` (đúng HEAD `master`; chỉ khác phần thay đổi chưa commit).
Spec sửa lỗi: [trip-review-lessons-demo-2026-11-26-spec.md](trip-review-lessons-demo-2026-11-26-spec.md).
Tài khoản: tài khoản demo tạo cho giảng viên phản biện.

Nguồn:
- Hội thoại `cbc85367-1281-4a90-bd14-ba3b3f443403` (lỗi B1–B2). **Đã xóa** khỏi tài khoản demo theo yêu cầu chủ dự án; nội dung dưới đây là bản ghi lại.
- Hội thoại `e6beafeb-ce49-406e-b4f5-903df3f0e1f6` và chuyến đã lưu `/trips/cmwwzo14a000108jvryf9zvs8` (lỗi B3–B7): 4 người, xe máy, bến xe Mỹ Đình, 20–24/12/2026, 13 điểm, 938 km.

---

## B1 — Yêu cầu "về sớm hơn" bằng lời bị hiểu thành ràng buộc nghỉ đêm, lịch rơi điểm (nghiêm trọng)

Tái hiện (hội thoại `cbc85367`):
1. "nhóm 4 người, xe máy, Hà Nội, 4 ngày 3 đêm từ 20/12, phải có Lũng Cú và Mã Pì Lèng, nhịp vừa phải" → v1: 8 điểm, 5/5 đạt, về Hà Nội ~21:59.
2. Bấm xác nhận `Hà Nội (bến xe Mỹ Đình)` → v2 giống v1.
3. Gõ: "Về tới Hà Nội gần 22h thì muộn quá… cho ngày cuối đi sớm hơn… thêm sông Nho Quế được không?"

Thực tế → v3: **8 → 5 điểm**, Sông Nho Quế không được thêm, vẫn về 20:43. AI nói đã "thử chuyển đêm 3 về TP Hà Giang" — người dùng **không hề yêu cầu** nghỉ TP Hà Giang. Nút gợi ý: `Nghỉ TP Hà Giang đêm 2` / `Thêm 1 ngày` / `Bỏ yêu cầu nghỉ TP Hà Giang`.

Kỳ vọng: "đi sớm hơn ngày cuối" chỉ dời giờ xuất phát / bớt điểm ngày cuối; không tự tạo ràng buộc nghỉ đêm (ADR-53) mà người dùng không nêu; không rơi điểm đã chọn ở các ngày khác; yêu cầu thêm điểm phải được xếp hoặc giải thích rõ vì sao không xếp được.

Ghi chú: trong hội thoại `e6beafeb`, bấm **nút** `Đi sớm hơn ngày cuối` lại chạy đúng (chuyển Nho Quế sang ngày 4, giữ 14 điểm). Khác biệt nằm ở đường **gõ tự do** → nghi phần trích ràng buộc nghỉ đêm từ lời người dùng.

## B2 — "Thêm 1 ngày" sinh ngày trống, không phân bổ lại điểm (nghiêm trọng)

Tiếp B1, bấm `Thêm 1 ngày` → v4: 20–24/12, 5 ngày nhưng **vẫn 5 điểm**, Ngày 5 = 0 điểm, Nho Quế vẫn không có; AI tiếp tục hỏi về "yêu cầu nghỉ đêm ngày 3" tự đặt ra.

Kỳ vọng: thêm ngày phải dựng lại lịch dùng hết số ngày (bổ sung lại điểm bị rơi ở v3, ưu tiên điểm người dùng đã đòi như Nho Quế), và bỏ ràng buộc nghỉ đêm không do người dùng đặt.

## B3 — Ngày 2: nhãn nhận phòng lệch khu nghỉ

`/trips/cmwwzo14a000108jvryf9zvs8`, Ngày 2: dòng `Nhận phòng · Phố Bảng` nhưng ngay dưới là `Về khu vực Yên Minh: 18 km · khoảng 31 phút`, và tiêu đề Ngày 3 là `Yên Minh → …`. Kỳ vọng: nhãn nhận phòng dùng cùng khu nghỉ đêm (overnight anchor) với dòng "Về khu vực" và tiêu đề ngày sau.

## B4 — Ngày 2: khoảng trống thời gian không giải thích

Nghỉ trưa `13:00–14:00`, chặng tiếp `60 km · khoảng 1 giờ 49 phút · nghỉ 15 phút` → lẽ ra tới ~16:04, nhưng điểm #5 bắt đầu `16:25` (~20 phút hụt). Cần xác định là buffer chụp ảnh không hiển thị, làm tròn, hay lỗi cộng giờ; nếu là buffer thì phải hiện trên dòng di chuyển như các chặng khác.

## B5 — Tiêu đề Ngày 1 lấy điểm của Ngày 2

Ngày 1 có 0 điểm tham quan nhưng tiêu đề là `Hà Nội → Dốc Bắc Sum` (Dốc Bắc Sum là điểm #1 Ngày 2). Kỳ vọng: ngày chỉ có chặng lên Hà Giang ghi `Hà Nội → TP Hà Giang` (khu nghỉ đêm 1).

## B6 — Không có gợi ý chỗ nghỉ / ăn tối

Cả 4 đêm đều `Chưa chọn chỗ nghỉ`, không có gợi ý homestay (trong khi hội thoại `cbc85367` cùng ngày có gợi ý `Siu Homestay`, `Trutina's Home`). Ngày 1 còn `Chưa tìm được gợi ý buổi tối` dù nghỉ ở TP Hà Giang. Cần kiểm tra vì sao tra cứu chỗ nghỉ/ăn tối rỗng ở lượt dựng lịch 5 ngày.

## B7 — Ngày cuối 421 km xe máy (cân nhắc sản phẩm, chưa chắc là lỗi)

Ngày 5 chạy Mèo Vạc → Hà Nội `421,5 km · 10 giờ 33 phút`, về 19:18. Hệ thống đã cảnh báo đúng ADR-57 (không chặn lưu). Có thể cân nhắc gợi ý đêm cuối ở gần TP Hà Giang hoặc xe khách chiều về — cần chủ dự án quyết, không tự đổi.

## B8 — Sửa lịch bằng AI (trang `/trips/[id]/edit`) luôn báo "Kết nối bị ngắt", không hiện thẻ phương án (nghiêm trọng)

Tái hiện: chuyến `cmwwzo14a000108jvryf9zvs8` → Chỉnh sửa hành trình → Trợ lý AI, gõ "Ngày 5 chạy một mạch từ Mèo Vạc về Hà Nội hơn 400 km xe máy thì mệt quá. Có cách nào để ngày cuối đỡ vất hơn không bạn?". Lặp lại 2/2 lần (kể cả bấm `Thử lại`).

Thực tế: lời AI hiện đầy đủ và hợp lý (3 phương án, đều PASS, có giờ về 14:53 / 17:48), nhưng cuối tin hiện `Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi.` và **không có thẻ phương án** để chọn, dù AI nói "chọn một thẻ phương án bên dưới". Request `POST /api/trips/[id]/edits/ai` trả 200 rồi `net::ERR_ABORTED` (do client tự `reader.cancel()`).

Bằng chứng phía server (Vercel runtime log, deployment `dpl_HVi5TJGeXvEyd9FnoqBjn8RJ4jro`, branch `master`): cả hai lượt kết thúc bình thường `{"stage":"AGENT","outcome":"MODEL","kind":"ADVISED","rounds":5|9,"elapsedMs":31000|44989}`, không có log lỗi.

**Đã xác nhận (bắt stream thật lần 3):** chunk `data-trip-assistant-result` về đủ (`ADVISED`, 3 suggestions) nhưng `validation` có thêm khóa `advisories` (thêm ở commit `26f482e`, D1/ADR-57) mà `aiValidationSchema` phía client `.strict()` chưa có ⇒ parse thất bại ⇒ `INTERRUPTED`. Đây là hồi quy. Ghi chú ban đầu: `streamAiTripEdit` trong `apps/web/src/lib/trip-edit-client.ts:760-775` parse chunk `data-trip-assistant-result` bằng `aiEditResponseSchema` (mọi lớp đều `.strict()`); nếu không khớp thì **bỏ qua im lặng** và trả `INTERRUPTED`. Khả năng cao payload `ADVISED.suggestions[*]` (candidate / journeySummary / legs …) có trường server mới thêm mà schema client chưa có, ví dụ `overnightStays` (thêm vào `journeyPlanSchema` ở D2/ADR-57). `satisfies z.ZodType<…>` không bắt được trường thừa phía server.

Hướng sửa đề xuất: (1) ghi log/telemetry khi `safeParse` thất bại thay vì nuốt lỗi; (2) đồng bộ schema client với kiểu server (hoặc dùng chung schema); (3) thêm test hồi quy dựng phản hồi `ADVISED` có `suggestions` từ dữ liệu chuyến có `overnightStays`.

## B9 — Chi phí phải luôn hiện ở trang chi tiết chuyến, không phụ thuộc việc ghim

Hiện tại (theo ADR-47): chi phí ước tính chỉ hiện trên `/trips/[id]` (khối "Mục đã ghim") khi người dùng bấm `Ghim vào chuyến đi` trên thẻ chi phí trong chat; lưu chuyến không tự ghim. Chủ dự án thử nghiệm không thấy chi phí và tưởng là lỗi.

**Quyết định của chủ dự án (2026-11-26):** chi phí ước tính của chuyến **luôn hiện** ở trang chi tiết, không cần ghim. Điều này thay một phần ADR-47 ("Pin everything automatically at save: rejected") **riêng cho chi phí**; vé máy bay / chỗ ở / quán ăn vẫn giữ cơ chế ghim tùy chọn. Cần ghi ADR mới (hoặc sửa ADR-47) khi triển khai.

Điểm chạm (đã khảo sát, chưa sửa):
- Luồng lưu từ chat: `tripsage-save-section.tsx:242` chỉ gửi `pinnedItems` người dùng đã ghim → `tripsage-chat-save.ts:226` → `trip-save-client.ts:72` → `trip-save-service.ts:270` (tạo `trip_pinned_item`).
- Trang chi tiết: `trips-view.tsx:866, 1297` chỉ render chi phí trong `TripPinnedSection`, và chỉ khi có pin.
- Ghim sau khi lưu: `POST /api/trips/[id]/pins` (thẻ chi phí mới thay thẻ cũ).

Câu hỏi cần chốt khi viết spec: (a) lấy bản ước tính chi phí mới nhất của hội thoại tự kèm khi lưu, hay tính lại phía server từ lịch đã lưu; (b) khi sửa lịch ở `/trips/[id]/edit` thì chi phí có tự tính lại không, hay ghi "Cần tính lại"; (c) chuyến không có ước tính nào (lưu từ form) thì hiện gì; (d) vị trí hiển thị — tách khỏi "Mục đã ghim" thành mục "Chi phí ước tính" riêng; (e) chuyến đã lưu trước đây có cần backfill không.

## B10 — Màn hẹp: dòng "Ăn sáng" bị dồn vào cột 20px, mỗi dòng một ký tự (giao diện)

Tái hiện: `/trips/cmwwzo14a000108jvryf9zvs8`, khung trình duyệt hẹp (~550px, panel bên cạnh app desktop; tương tự trên điện thoại), Ngày 2–4. Dưới mốc `07:00 · 30 phút`, chữ "☕ Ăn sáng 07:00 – 07:30, khởi hành 07:30" hiện dọc, mỗi ký tự một dòng, trong cột hẹp bên trái (ảnh chụp của chủ dự án 2026-11-26).

Nguyên nhân (đã xác định từ code, chưa sửa): `components/trip-timeline/day-timeline.css` — ở `@container dt-day (max-width: 480px)` (dòng ~735) và khối tương tự (dòng ~875), `.dt-break-item` đổi sang lưới 2 cột `20px minmax(0, 1fr)`. Hàng ăn sáng (`day-timeline.tsx:909-920`) có 3 con: `<span>` mốc, `.dt-visit-time`, `p.dt-break-line`. Danh sách phần tử được gán `grid-column: 2` không có `.dt-break-line`, nên nó tự chảy sang hàng mới ở **cột 1 (20px)**. Cùng markup ở `day-timeline.tsx:755-765` cũng bị.

Hướng sửa: thêm `.dt-break-line` (và kiểm các hàng `dt-break-item` khác: chặng di chuyển `dt-leg-item`, nghỉ trưa, nghỉ đêm) vào nhóm `grid-column: 2` trong cả hai khối responsive; kiểm lại ở 375px và 480px.

## Thử luồng khám phá điểm đến (hội thoại `6e56fb64-1ea8-4a4d-badf-70f0c3658087`)

Đã hỏi 4 lượt như khách: điểm núi non nổi bật; vé / giờ mở cửa / bậc thang Cột cờ Lũng Cú (mẹ yếu chân); ruộng bậc thang Hoàng Su Phì tháng 12 + đặc sản; so với Sa Pa + chợ phiên. Kết quả tốt: trả lời đúng trọng tâm, có trích nguồn RAG, trung thực khi thiếu dữ liệu (không bịa giá vé, số bậc), nhớ ngữ cảnh "mẹ yếu chân" sang lượt sau, nói đúng mùa lúa đã qua vào tháng 12. Không có lỗi console. Chỉ có các điểm nhỏ:

### B11 — Nút gợi ý nhắc tới "lịch" khi chưa có lịch (nhỏ)

Lượt hỏi về Lũng Cú (chưa hề lập lịch) hiện nút `Giữ Cột cờ, không leo lên đỉnh` và `Bỏ Cột cờ khỏi lịch`. Kỳ vọng: khi hội thoại chưa có bản lịch, nút gợi ý không được giả định có lịch (ví dụ đổi thành `Gợi ý điểm ngắm cảnh nhẹ hơn` / `Lên lịch có Lũng Cú, không leo đỉnh`).

### B12 — Nút gợi ý dẫn ra ngoài phạm vi Hà Giang (nhỏ)

Lượt so sánh với Sa Pa hiện nút `Ưu tiên nhẹ nhàng ở Sa Pa`. Bấm vào thì bot xử lý ổn (khuyên Sa Pa rồi mời quay lại Hà Giang), nhưng ứng dụng chỉ phục vụ Hà Giang nên nút này là ngõ cụt. Kỳ vọng: không sinh nút gợi ý cho địa điểm ngoài phạm vi; thay bằng `Lên lịch Hà Giang nhẹ nhàng`.

### B13 — Định dạng danh sách không đồng nhất (rất nhỏ)

Lượt đầu, trong 4 gạch đầu dòng chỉ `Dốc Thẩm Mã` và `Đèo Mã Pì Lèng` được in đậm, `Cổng trời Quản Bạ và Núi Đôi` và `Cột cờ Lũng Cú…` thì không.

---

## Việc tiếp theo

1. Tái hiện B1–B2 trên bản `master` cục bộ (có thể đã khác production).
2. Chủ dự án duyệt hướng sửa từng mục, rồi chuyển thành spec chính thức / test hồi quy.

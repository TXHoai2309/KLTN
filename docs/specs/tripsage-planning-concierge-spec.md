# Spec: Trợ lý lập hành trình AI kiểu "người dẫn tour" (`/assistant/plan`)

Trạng thái: đã triển khai (tickets 01–04, 2026-11-21); phần giao diện tab riêng và thẻ điểm xuất phát được thay bởi [unified-assistant-chat-spec.md](unified-assistant-chat-spec.md) (ADR-43). Thay thế [tripsage-ai-led-intake-spec.md](tripsage-ai-led-intake-spec.md) (giữ phần lõi, nới mặc định theo Q19). Quyết định kiến trúc: [ADR-42](../decisions.md#adr-42--planning-concierge-on-assistantplan-2026-11-21). Ticket: `.scratch/tripsage-planning-concierge/issues/01–04`.
Phạm vi trang: chỉ `/assistant/plan`. `/trips/new`, chat hỏi đáp `/assistant` và luồng chỉnh sửa chuyến đã lưu giữ nguyên.

## Problem Statement

Trang lập hành trình AI hiện là "form kèm chatbot": một hộp thoại bắt điền đủ phương tiện, số ngày, ngày đi, sở thích, điểm xuất phát rồi AI mới chọn điểm. Câu trả lời ngắn, cứng, chữ thô, giới hạn 60 giây. Lịch chỉ có các lượt tham quan: không thấy giờ nghỉ trưa, nghỉ đêm ở đâu, tối chơi gì, hết bao nhiêu tiền. Khách ở xa (miền Nam) không lập được lịch vì chặng lái xe kéo qua nửa đêm (`OVERNIGHT_DRIVING_UNSUPPORTED`).

## Solution

AI dẫn dắt như một người dẫn tour: hỏi theo cụm, gợi ý sẵn, ra lịch đầu tiên trong tối đa 2 lượt người dùng nhắn, rồi tinh chỉnh dần. Lịch hiện thành **timeline trong ngày** (khởi hành, chặng đi, tham quan, nghỉ trưa, nghỉ đêm) kèm **gợi ý kèm lịch** (ăn ở đâu, tối chơi gì gần chỗ nghỉ, chỗ nghỉ), **bảng chi phí ước tính**, và **chặng tiếp cận** cho khách ở xa đến **điểm tập kết**. Lõi KLTN giữ nguyên quyền quyết định: scheduler, Validator, routing, Save idempotent.

## User Stories

1. Là du khách, tôi muốn mở trang là thấy lời chào và một câu hỏi gộp (đi từ đâu, khi nào, mấy ngày, xe gì) có gợi ý sẵn, để trả lời một lần.
2. Là du khách, tôi muốn bấm nút trả lời nhanh (`4 ngày 3 đêm`, `Xe máy tự lái`…) thay vì gõ.
3. Là du khách, tôi muốn có lịch đầu tiên sau tối đa 2 lượt nhắn; phần chưa hỏi AI tạm chọn mặc định và nói rõ.
4. Là du khách, tôi muốn sau khi thấy lịch AI mới hỏi thêm (đi mấy người, nhịp, ngân sách, ăn uống, chỗ nghỉ) và mỗi câu trả lời cập nhật lịch.
5. Là du khách, tôi muốn chọn điểm xuất phát trong thẻ bản đồ ngay trong chat, hoặc bấm "Bắt đầu từ TP Hà Giang"/"Bắt đầu từ Hà Nội".
6. Là du khách, tôi muốn câu trả lời trình bày đẹp (tiêu đề, in đậm, danh sách, bảng), giọng tự nhiên.
7. Là du khách, tôi muốn thấy timeline từng ngày có giờ nghỉ trưa cụ thể (ví dụ 12:10–13:10) và nơi nghỉ đêm.
8. Là du khách, tôi muốn nhắn "nghỉ trưa 90 phút" hoặc "mỗi ngày dừng tham quan trước 17h" và lịch được xếp lại, vẫn qua kiểm tra.
9. Là du khách, tôi muốn gợi ý quán ăn trưa gần điểm trước đó, chỗ nghỉ đêm (2–3 lựa chọn) và chỗ chơi buổi tối đi bộ được quanh nơi nghỉ.
10. Là du khách, tôi muốn AI không gợi ý chạy xe xa sau khi trời tối.
11. Là du khách, tôi muốn AI kể về văn hóa, ẩm thực địa phương từ tài liệu đã duyệt.
12. Là du khách, tôi muốn một bảng chi phí ước tính (đi lại, lưu trú, ăn uống, vé, khác), tổng và mỗi người mỗi ngày, kèm giả định.
13. Là du khách, tôi muốn tiền xăng được tính theo quãng đường thật của lịch và tôi sửa được giá xăng giả định.
14. Là du khách ở xa, tôi muốn AI đề xuất bay/xe khách tới điểm tập kết rồi thuê xe, có giờ và giá ước tính, khi lái thẳng từ nhà không khả thi.
15. Là du khách, tôi muốn "4 ngày 3 đêm" được tính từ điểm tập kết; chặng tiếp cận hiện riêng "Trước chuyến đi"/"Sau chuyến đi".
16. Là du khách, tôi muốn mọi gợi ý, chỗ nghỉ, giá đều ghi rõ "gợi ý, chưa kiểm tra"/"ước tính", không phải đặt chỗ.
17. Là du khách, tôi muốn lịch chỉ được lưu khi tôi bấm Lưu; gợi ý và bảng chi phí không được lưu ở giai đoạn này.
18. Là chủ dự án, tôi muốn mô hình không bao giờ nhận tọa độ, không tự đặt điểm xuất phát, ngày quá khứ hay số ngày ngoài 1–14.
19. Là chủ dự án, tôi muốn Validator vẫn là nơi duy nhất quyết PASS/VIOLATION/INSUFFICIENT_DATA; gợi ý và chặng tiếp cận không bao giờ được coi là PASS.

## Implementation Decisions

### Hội thoại (Ticket 01)
- **Bỏ hộp thoại** "Thông tin chuyến đi" và nút "Sửa thông tin". Thanh tóm tắt chỉ đọc, đánh dấu giá trị *mặc định*.
- **Tool `recordTripInfo`** ghi phương tiện, số ngày, ngày đi, sở thích, nhịp, số người, độ dài nghỉ trưa, giờ kết thúc tham quan, nơi ở của khách (thành phố). Schema chặt dùng lại hợp đồng yêu cầu chuyến đi. Kết quả cập nhật ngữ cảnh *trong cùng lượt* (để lập lịch ngay) và đi về trình duyệt qua phần dữ liệu `data-trip-info`; trình duyệt gửi lại mỗi lượt, server parse lại chặt.
- **Mặc định (Q19):** cụm 1 (phương tiện, số ngày, ngày đi) chỉ ghi khi người dùng nói hoặc đồng ý gợi ý. Cụm 2 (sở thích, nhịp, số người, nghỉ trưa, giờ kết thúc) server tự dùng mặc định nếu chưa có (sở thích cảnh đẹp + khám phá, nhịp vừa, 2 người, nghỉ trưa 60', kết thúc 18:00) và báo là mặc định. Không bao giờ tự đặt: điểm xuất phát, ngày quá khứ, số ngày ngoài 1–14.
- **Gợi ý số ngày mặc định:** 4 ngày 3 đêm, phương án hai 5 ngày 4 đêm.
- **Tool `requestOrigin`** mở thẻ điểm xuất phát trong chat (picker hiện có + giờ đi/hạn về điền sẵn) với hai nút điểm tập kết. Chỉ khi chưa có điểm xuất phát đã xác nhận.
- **Tool `suggestReplies`** (≤ 4 câu ngắn) hiện nút trả lời nhanh dưới tin nhắn mới nhất; bấm = gửi đúng chữ đó.
- **Model:** `gpt-6.1-terra`, reasoning `medium` (`forceReasoning`), `store:false`, bỏ trần token đầu ra; tối đa 12 bước, 280 giây mỗi lượt, route `maxDuration = 300`. Bước cuối chỉ ra văn bản.
- **Trình bày:** chữ của model render markdown an toàn (GFM: tiêu đề, đậm, danh sách, bảng; không HTML thô, không ảnh, link chỉ hiện chữ). Timeline, gợi ý, chi phí, thẻ điểm xuất phát là thẻ có cấu trúc do server dựng.
- **Sửa lỗi review:** bỏ việc số ngày lấy theo `selection.days.length` (B.1); client không import module server (B.2); đổi số ngày/ngày đi/phương tiện/điểm xuất phát thì lịch cũ không còn được gửi làm "lịch hiện tại" (B.3).

### Timeline và gợi ý (Ticket 02)
- **Nhịp ngày:** `lunchMinutes` 60–120, `dayEndMinute` 15:00–18:00 truyền vào scheduler. Cả hai chỉ làm lịch thận trọng hơn nên Validator và kiểm tra lại khi Save không đổi.
- **Timeline** do server dựng từ kết quả lập lịch (`data-timeline`): khởi hành, chặng đi/nghỉ dọc đường, tham quan, nghỉ trưa (giờ thật), nghỉ đêm tại khu của điểm cuối ngày (ADR-33), chặng về. Mỗi mục có `slotId` ổn định.
- **Tool `addSuggestions`** gắn gợi ý vào `slotId` của timeline mới nhất: loại `MEAL`, `EVENING`, `LODGING`, `TIP`. Địa điểm cụ thể phải là `placeId` mà `searchPlaces` trả trong cùng lượt. `EVENING` và `LODGING` phải trong 2 km (buổi tối) / 5 km (chỗ nghỉ) quanh điểm cuối ngày, server kiểm bằng tọa độ của nó. Gợi ý không đổi giờ, không thành lượt tham quan.
- **`searchPlaces`** nhận thêm `nearDestinationId` (tọa độ lấy từ DB) để tìm quanh một điểm.
- **Tool `lookupLocalKnowledge`** truy vấn kho tài liệu RAG đã duyệt (cùng retriever của Q&A), trả đoạn trích như dữ liệu.
- **Web** tối đa 1 lần `webSearch` mỗi lượt, chỉ khi người dùng hỏi giá/tin hiện tại.

### Chi phí (Ticket 03)
- **Tool `estimateCosts`** luôn bật: model đưa các khoản lưu trú, ăn uống, vé, khác (+ thuê xe, chặng tiếp cận); **server tự tính tiền xăng** = quãng đường của lịch mới nhất × mức tiêu hao (xe máy 2,5 L/100 km, ô tô 8 L/100 km) × giá xăng giả định (người dùng sửa được), rồi cộng tổng, mỗi người mỗi ngày, so ngân sách nếu có. Phần dữ liệu `data-cost` thay `data-budget`.
- **Bảng giá tham khảo:** mức giá mặc định trong code kèm ngày cập nhật; tài liệu RAG "Bảng giá tham khảo" (admin tải lên, mẫu ở `docs/fixtures/price-reference-ha-giang.md`) để AI tra. Cờ `TRIPSAGE_FEATURE_BUDGET` không còn cần cho trang này.

### Đi từ xa (Ticket 04)
- **Điểm tập kết** cố định: Hà Nội (bến xe Mỹ Đình) và TP Hà Giang (bến xe phía Nam). Tọa độ trong code, model chỉ biết id và tên.
- **Tool `planAccessLeg`**: model đề xuất các chặng (máy bay, xe khách giường nằm, tàu) từ thành phố của khách đến điểm tập kết và chiều về, giờ và giá ước tính; server kiểm biên và dựng `data-access-leg` ("Trước chuyến đi"/"Sau chuyến đi"). Không qua Validator, không lưu. Nếu Duffel đã cấu hình, model có thể dùng `searchFlights`.
- Khi lập lịch trả `OVERNIGHT_DRIVING_UNSUPPORTED` hoặc chặng đi đầu > 10 giờ, kết quả tool gợi ý dùng điểm tập kết; AI giải thích và hỏi người dùng.
- Số ngày tính từ điểm tập kết. Chi phí chặng tiếp cận vào nhóm "đi lại".

### Bất biến giữ nguyên
Validator quyết định duy nhất; thiếu dữ liệu không phải PASS; điểm đến DB + Google Places chưa kiểm tra; Save qua `POST /api/trips` với idempotency; mô hình không nhận tọa độ; đầu ra công cụ thô không ra trình duyệt; xác thực, same-origin, admission giữ nguyên.

## Testing Decisions
- Kiểm hành vi qua ranh giới: route chat với mô hình giả theo kịch bản, các hàm thuần (timeline, chi phí, chặng tiếp cận, kiểm tra gợi ý), test nguồn client.
- Tình huống chính: `recordTripInfo` từ chối giá trị cấm và áp mặc định cụm 2; lập lịch cùng lượt sau khi ghi; số ngày không đổi theo selection; timeline có nghỉ trưa đúng độ dài và nghỉ đêm; gợi ý với `placeId` lạ hoặc quá xa bị loại; tiền xăng tính đúng; chặng tiếp cận ngoài biên bị loại; dữ liệu stream đều qua schema.
- Kiểm tra hoàn tất mỗi giai đoạn: typecheck, vitest module chat/thành phần chat/planner liên quan, `git diff --check`.

## Out of Scope
- Lưu gợi ý, chỗ nghỉ, bảng chi phí, chặng tiếp cận vào chuyến đã lưu (story riêng sau).
- Đặt phòng, đặt vé, thanh toán.
- Đổi Validator, hợp đồng Save, `/trips/new`, `/assistant`, luồng chỉnh sửa chuyến đã lưu.
- Thêm loại điểm đến mới (chỗ nghỉ, quán ăn) vào danh mục.

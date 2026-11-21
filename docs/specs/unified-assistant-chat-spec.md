# Spec: Một trợ lý duy nhất ở `/assistant` — hỏi đáp và lập hành trình chỉ bằng chat

Trạng thái: đã grill với chủ dự án ngày 2026-11-21 (Q26–Q34 đồng ý; nối tiếp Q1–Q25 của [tripsage-planning-concierge-spec.md](tripsage-planning-concierge-spec.md)). Quyết định kiến trúc: [ADR-43](../decisions.md#adr-43--one-assistant-chat-at-assistant-chat-only-origin-confirmation-saved-planning-conversations-2026-11-21). Ticket: `.scratch/unified-assistant-chat/issues/01–05`. **Chưa code**: chủ dự án chỉ duyệt tài liệu.

## Problem Statement

Sau khi triển khai planning concierge, người dùng thấy hai trợ lý tách rời: tab "Trò chuyện và hỏi đáp" (có lịch sử ở cột trái, chạy hỏi đáp và trợ lý lập lịch V2 cũ) và tab "Lập hành trình AI" (tripsage, không lưu lịch sử). Trong tab lập lịch, thẻ điểm xuất phát vẫn là một form đầy đủ (tiêu đề, mô tả, ô tìm, bản đồ, ô giờ), hỏi trùng câu AI vừa hỏi và đẩy nút trả lời nhanh khỏi màn hình. Trải nghiệm vì thế "kì": người dùng phải chọn đúng tab, chuyển ngữ cảnh khi đang hỏi về một địa điểm, và điền form giữa cuộc trò chuyện.

## Solution

Chỉ còn một khung chat ở `/assistant`. Với người đã đăng nhập, mọi tin nhắn do trợ lý tripsage trả lời: hỏi đáp có trích tên nguồn tài liệu, và lập hành trình chỉ bằng hội thoại — không form, không bản đồ chọn điểm. Điểm xuất phát được tìm từ tên người dùng gõ và xác nhận bằng một câu trả lời trong chat. Mỗi lịch trình kèm timeline, gợi ý, bảng chi phí và một bản đồ thu gọn (bấm mới mở). Hội thoại được lưu ở cột trái như hỏi đáp hiện nay. Khách chưa đăng nhập giữ nguyên hỏi đáp. Lõi KLTN không đổi: scheduler, Validator, routing, Save idempotent.

## User Stories

1. Là du khách đã đăng nhập, tôi muốn chỉ có một khung chat, để không phải chọn tab hỏi đáp hay lập lịch.
2. Là du khách, tôi muốn hỏi về một địa điểm rồi nói "lên lịch đi", và AI hỏi lại một câu tự nhiên xác nhận tôi muốn đi Hà Giang, kèm luôn địa điểm vừa hỏi.
3. Là du khách, tôi muốn địa điểm tôi vừa hỏi tự được đưa vào lịch như một điểm bắt buộc.
4. Là du khách, tôi muốn khi tôi mở đầu bằng "đi Hà Giang 4 ngày" thì AI lập lịch luôn, không hỏi lại ý định.
5. Là du khách, tôi muốn khi tôi hỏi mơ hồ ("Hà Giang có gì chơi?") thì AI trả lời rồi mới mời lên lịch.
6. Là du khách, tôi muốn gõ "đi từ Hà Nội" và AI nói lại chính xác nơi nó hiểu (ví dụ Bến xe Mỹ Đình, Hà Nội) để tôi trả lời "đúng".
7. Là du khách, tôi muốn khi tên nơi đi mơ hồ, AI đưa 2–3 lựa chọn thành nút trả lời nhanh.
8. Là du khách, tôi muốn không phải điền ô giờ: AI dùng 07:00 / 18:00 mặc định và tôi nhắn để đổi.
9. Là du khách, tôi muốn mỗi lịch trình có bản đồ lộ trình thu gọn, bấm mới mở, để khung chat gọn.
10. Là du khách, tôi muốn câu hỏi đáp có chip tên tài liệu nguồn, để biết thông tin đến từ đâu.
11. Là du khách, tôi muốn hội thoại có lập lịch hiện ở cột trái và mở lại được, kể cả thẻ lịch trình và chi phí.
12. Là du khách, tôi muốn xoá từng hội thoại hoặc xoá hết như hỏi đáp hiện nay.
13. Là du khách chưa đăng nhập, tôi muốn vẫn hỏi đáp được; khi tôi đòi lập lịch thì được mời đăng nhập và giữ nguyên câu tôi vừa gõ.
14. Là du khách, tôi muốn hội thoại V2 cũ ở cột trái vẫn mở xem được (chỉ đọc).
15. Là du khách, tôi muốn giọng AI tự nhiên, có hồn như người dẫn tour, ở cả hỏi đáp lẫn lập lịch.
16. Là chủ dự án, tôi muốn mô hình không bao giờ nhận hay tự đặt tọa độ, kể cả khi xác nhận điểm xuất phát bằng chat.
17. Là chủ dự án, tôi muốn lịch chỉ thành chuyến đi khi người dùng bấm Lưu, và Validator vẫn là nơi duy nhất quyết định PASS.
18. Là chủ dự án, tôi muốn trợ lý V2 cũ được xoá trong một commit riêng sau nghiệm thu, để quay lui dễ.

## Implementation Decisions

### Một trợ lý (Q26, Q34)
- `/assistant` là lối vào duy nhất. Bỏ `AssistantModeTabs`. `/assistant/plan` và `/assistant?mode=plan` chuyển hướng về `/assistant` (bỏ rewrite trong `next.config.ts`).
- Người đã đăng nhập: tin nhắn đi tới route chat tripsage (`/api/ai/chat`). Khách: giữ đường hỏi đáp hiện tại (`/api/ai/ask`) và lời mời đăng nhập khi đòi lập lịch (hand-off ADR-35 giữ nguyên).
- Cờ `TRIPSAGE_CHAT_ENABLED` quyết định người đã đăng nhập dùng tripsage hay vẫn dùng đường cũ (rollback không cần deploy code).

### Ý định lập lịch (Q27)
- Prompt quy định ba trường hợp: mở đầu nói thẳng → lập lịch ngay; đang hỏi đáp rồi chuyển → xác nhận bằng một câu tự nhiên nêu những gì đã hiểu; câu mơ hồ → trả lời rồi mời.
- **Điểm bắt buộc**: `recordTripInfo` thêm `mustIncludeDestinationIds` (id từ `listDestinations`, tối đa 4). `proposeItinerary` từ chối selection thiếu các id này (dùng lại `requiredDestinationIds` của `PlanningNeeds`).

### Điểm xuất phát chỉ qua chat (Q28)
- Tool mới `findOrigin(query)`: server gọi dịch vụ tìm điểm xuất phát sẵn có (`originSearchDependencies`, kiểm tra lãnh thổ Việt Nam). Kết quả lưu trong registry của lượt (tọa độ ở server); mô hình chỉ nhận `candidateId` và nhãn. Phát `data-origin-candidates` (≤ 3 nhãn) để client hiện nút trả lời nhanh.
- Tool mới `confirmOrigin(candidateId)`: chỉ hợp lệ khi tin nhắn mới nhất của người dùng là câu đồng ý hoặc trùng nhãn nút (kiểm bằng hàm thuần, như `permitsRemember`), và `candidateId` thuộc kết quả `findOrigin` của lượt trước được trình duyệt gửi lại. Server dựng `OriginSelection` với `confirmed: true` từ tọa độ của chính nó và phát `data-journey`; trình duyệt giữ và gửi lại như `journey` hiện nay.
- Hai lượt: lượt 1 tìm và hỏi lại; lượt 2 người dùng đồng ý → xác nhận. Ứng viên lượt 1 đi về trình duyệt dưới dạng phần dữ liệu có chữ ký HMAC phía server (giống cách giữ an toàn dữ liệu do trình duyệt gửi lại), để lượt 2 không tin tọa độ từ trình duyệt.
- Điểm tập kết (Hà Nội, TP Hà Giang) là ứng viên cố định, không cần tìm.
- Gỡ `TripsageOriginCard` và `TripJourneyEditor` khỏi chat. Bộ chọn bản đồ vẫn dùng ở `/trips/new`.

### Giờ đi/về (Q29)
- `recordTripInfo` thêm `departureMinute`, `returnDeadlineMinute` (0–1439). Server hợp nhất vào `journey` khi lập lịch; mặc định 07:00 / 18:00 được áp và đánh dấu "mặc định" như cụm 2.

### Bản đồ thu gọn (Q30)
- `TripsageItineraryView` bọc bản đồ trong khối mặc định đóng "🗺️ Xem bản đồ lộ trình"; bản đồ chỉ mount khi mở (không tải SDK bản đồ khi chưa cần). Chỉ để xem.

### Lưu hội thoại (Q31, Q34)
- Bảng mới `assistant_conversation` (id, userId, title, createdAt, updatedAt) và `assistant_message` (id, conversationId, role, parts JSON đã qua schema, createdAt), cascade theo user và conversation. Migration Prisma mới.
- Chỉ lưu các phần đã qua schema: text, `data-itinerary`, `data-timeline`, `data-suggestions`, `data-cost`, `data-access-leg`, `data-trip-info`, `data-sources`. Không lưu đầu ra tool thô, tọa độ ứng viên hay ngữ cảnh hệ thống.
- Ghi theo hợp đồng `SUCCESS/FAILED/UNKNOWN` + idempotency (khoá = id tin nhắn). Tin nhắn người dùng ghi trước khi gọi model; tin nhắn trợ lý ghi khi stream kết thúc.
- Cột trái liệt kê chung hội thoại hỏi đáp cũ, hội thoại V2 cũ (chỉ đọc) và hội thoại mới; tiêu đề tự đặt, xoá từng cái / xoá hết, cùng chủ sở hữu và thời hạn dọn dẹp như hội thoại hỏi đáp.

### Hỏi đáp trong chat chung (Q32)
- Tripsage trả lời câu hỏi bằng `lookupLocalKnowledge`; công cụ phát `data-sources` gồm tên tài liệu (không URL nội bộ) để client hiện chip nguồn. Phần không có nguồn được nói rõ là hiểu biết chung, như nhãn "Kiến thức mở rộng".

### Trợ lý V2 cũ (Q33)
- Sau nghiệm thu bản mới: xoá `/api/ai/planning`, client và runtime V2 trong một commit riêng. Hội thoại V2 đã lưu mở được ở chế độ chỉ đọc.

### Giữ nguyên
Validator quyết định duy nhất; thiếu dữ liệu không phải PASS; Save qua `POST /api/trips` với idempotency; gợi ý, chi phí, chặng tiếp cận không lưu cùng chuyến đi; mô hình không nhận tọa độ; xác thực, same-origin, admission, abuse limit của khách giữ nguyên.

## Testing Decisions
- Kiểm hành vi qua ranh giới: route chat với mô hình giả theo kịch bản; route lưu hội thoại; hàm thuần nhận diện câu đồng ý; test nguồn client.
- Tình huống chính: ba trường hợp ý định (qua prompt + kịch bản mô hình giả, chỉ kiểm phần do code đảm bảo: điểm bắt buộc); `findOrigin` không lộ tọa độ cho mô hình; `confirmOrigin` từ chối khi người dùng chưa đồng ý, khi `candidateId` lạ hoặc chữ ký sai; giờ mặc định áp đúng; bản đồ không mount khi đóng; hội thoại lưu/đọc/xoá đúng chủ, idempotent, không lưu tool output thô; khách không gọi được tripsage; cờ tắt thì về đường cũ.
- Kiểm tra hoàn tất mỗi ticket: typecheck, vitest liên quan, `git diff --check`, trạng thái migration.

## Out of Scope
- Đổi Validator, Save, `/trips/new`, luồng chỉnh sửa chuyến đã lưu.
- Cho khách lập lịch.
- Lưu gợi ý/chi phí/chặng tiếp cận vào chuyến đi.
- Bản đồ để chọn điểm trong chat.

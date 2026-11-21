# 02: Hết lỗi 400 khi nhắn "hi", "hello", "tôi muốn thay đổi"

**What to build:** Trong một cuộc trò chuyện đã có lịch, các tin nhắn ngắn như "hi", "hello", "tôi muốn thay đổi" hiện nhận về thông báo đỏ "Nội dung yêu cầu chưa hợp lệ" (HTTP 400 từ bước phân tích request của route chat, trước khi tới model). Sau ticket này mọi tin nhắn văn bản hợp lệ trong giới hạn ký tự đều tới model: lời chào được đáp tự nhiên và nhắc tới chuyến đi đang lập; "tôi muốn thay đổi" được hỏi "bạn muốn đổi gì?" kèm nút ngày đi / số ngày / điểm đến / nơi xuất phát.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 7–9, mục "Lỗi 400 với tin nhắn ngắn").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Chẩn đoán trước: tái hiện bằng test (route chat, body giống client gửi khi đã có lịch: journey, trip info, itinerary, access leg, conversation id, message id) và ghi lại điều kiện nào ném lỗi đầu vào không hợp lệ.
- [x] Sửa ở gốc (parser request hoặc client gửi request), không nới ranh giới: same-origin, JSON, giới hạn kích thước body, auth, giới hạn message id vẫn giữ.
- [x] Test hồi quy: "hi", "hello", "tôi muốn thay đổi" trong cuộc trò chuyện đã có lịch trả stream thành công, không 400.
- [x] Chỉ dẫn hệ thống có hướng dẫn cho lời chào và yêu cầu đổi mơ hồ (một câu hỏi + `suggestReplies`).
- [x] Các test ranh giới hiện có của route chat vẫn qua.
- [x] Typecheck, vitest tripsage-chat, `git diff --check` sạch.

## Ghi chú hoàn thành

- **Nguyên nhân gốc (đã tái hiện FAIL 400 trước khi sửa):**
  1. `parseTripsageChatMessages` trong `tripsage-chat-service.ts` áp giới hạn `MAX_TEXT = 2_000` ký tự cho cả tin nhắn `role: "assistant"` lẫn `role: "user"`, và `MAX_TOTAL = 20_000` cho tổng văn bản mọi lượt. Vì model không bị giới hạn output token (ADR-42), câu trả lời giới thiệu lịch trình thường vượt 2.000 ký tự, khiến mọi tin ngắn kế tiếp ("hi", "hello", "tôi muốn thay đổi") bị ném HTTP 400 trước khi tới model.
  2. `buildTripsageChatBody` gửi nguyên mảng `messages` của `useChat` (bao gồm toàn bộ part `data-itinerary` chứa polyline lộ trình, `data-timeline`, `data-suggestions`, `tool-*`, `step-start`), dù server chỉ đọc part `text` và đã nhận `currentItinerary` riêng; hậu quả là vượt giới hạn `parts.max(50)` hoặc giới hạn body `128 KB` của `readBoundedJsonBody`.
  3. `tripsageItinerarySummarySchema` giới hạn `stop.id` tối đa 120 ký tự, dễ lỗi khi có địa điểm ngoài (`ext:<place_id>`).
- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-context.ts`: thêm `compactChatMessagesForRequest` trong `buildTripsageChatBody` để chỉ gửi part `text` (giữ nguyên các phần tử không phải UIMessage), bỏ tin assistant rỗng và giữ tối đa 40 tin gần nhất; nới `stop.id` lên 320 ký tự cho `ext:<place_id>`.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts`: tách `MAX_USER_TEXT = 2_000` (giữ nguyên) và `MAX_ASSISTANT_TEXT = 30_000` (khớp `storedAssistantPartSchema`), nới `parts.max(200)`, cắt dần lịch sử cũ khi vượt ngân sách ngữ cảnh model 24.000 ký tự thay vì trả 400 (luôn giữ tin user mới nhất), và thêm chỉ dẫn giọng văn cho lời chào và yêu cầu thay đổi mơ hồ.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-short-message.vitest.test.ts`: 4 test hồi quy tái hiện đầy đủ các kịch bản 400 và giữ nguyên các ranh giới bảo mật (user > 2000 ký tự, raw body > 128 KB).
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`: PASS.
  - `npx vitest run src/modules/tripsage-chat`: 28/28 files, 325/325 tests PASS.
  - `git diff --check`: PASS.
- **Việc chưa làm:** Kiểm thử hồi quy trên trình duyệt với model thật (ticket 13).

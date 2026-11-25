# Spec: Gõ và xếp hàng câu hỏi khi trợ lý đang trả lời

Trạng thái: **đã triển khai** (2026-11-25, phỏng vấn thiết kế Q1–Q14, chủ dự án phê duyệt 2026-11-25).
Phạm vi: `/assistant` cho người đã đăng nhập, gồm cả máy tính và điện thoại vì dùng chung một form. Component: `apps/web/src/components/tripsage-chat/tripsage-chat-client.tsx`.
Thuật ngữ: **Queued message (tin nhắn chờ gửi)** trong [GLOSSARY.md](../../GLOSSARY.md).

## Problem Statement

Khi trợ lý đang trả lời (lập lịch có thể mất vài chục giây), ô nhập bị khoá hẳn: không gõ được, nút Gửi bị thay bằng nút Dừng. Người đi chợt nhớ thêm ý ("à, nhà mình có trẻ nhỏ", "thêm Lũng Cú nhé") phải ngồi chờ, hoặc bấm Dừng làm mất câu trả lời đang tới. Các trợ lý chat quen thuộc (ví dụ Claude Code) cho gõ tiếp và xếp hàng câu hỏi.

Hiện trạng trong code:

- `busy = chatStatus === "submitted" || "streaming"`.
- `locked = busy || saveLocked || loadingConversation || recovering`.
- Textarea có `disabled={locked}`.
- `send()` và `submit()` dừng ngay khi `locked`.
- Khi `busy`, chỉ còn nút Dừng.

## Solution

Trong lúc trợ lý đang trả lời, ô nhập vẫn gõ được. Gửi lúc này nghĩa là đưa câu vào **tin nhắn chờ gửi**, hiện trong một khối nhỏ trên ô nhập. Khi câu trả lời hiện tại kết thúc bình thường và không còn trạng thái khoá nào, mọi câu chờ được gộp thành **một** tin và tự gửi. Nếu bấm Dừng hoặc câu trả lời bị lỗi, các câu chờ quay lại ô nhập để người đi tự quyết.

## User Stories

1. Là du khách, khi trợ lý đang trả lời, tôi muốn vẫn gõ được câu tiếp theo, để không quên ý mình vừa nghĩ ra.
2. Là du khách, tôi muốn bấm Enter hoặc nút Gửi để đưa câu vào hàng chờ, mà không làm dừng câu trả lời đang tới.
3. Là du khách, tôi muốn thấy các câu đang chờ trong một khối "Đang chờ gửi" ngay trên ô nhập, để biết trợ lý chưa nhận chúng.
4. Là du khách, tôi muốn bỏ một câu đang chờ bằng nút ✕.
5. Là du khách, tôi muốn các câu chờ được gộp thành một tin và tự gửi ngay khi câu trả lời hiện tại xong, để trợ lý thấy đủ ý trong một lần.
6. Là du khách, khi tôi bấm Dừng, tôi muốn các câu chờ quay lại ô nhập để sửa rồi tự gửi, không bị gửi ngoài ý muốn.
7. Là du khách, khi câu trả lời bị lỗi, tôi muốn các câu chờ quay lại ô nhập và vẫn có nút "Thử lại" như hiện nay.
8. Là du khách, tôi muốn nút Dừng luôn có mặt khi trợ lý đang trả lời, kể cả lúc ô nhập có chữ.
9. Là du khách, tôi muốn các nút trả lời nhanh của câu trước vẫn bị khoá trong lúc trợ lý đang trả lời, vì chúng có thể đã lỗi thời.
10. Là du khách, khi tổng các câu chờ vượt 1000 ký tự, tôi muốn được báo bằng bộ đếm thay vì bị cắt chữ.
11. Là du khách, khi trang đang lưu chuyến đi, đang tải hoặc đang khôi phục cuộc trò chuyện, tôi chấp nhận ô nhập vẫn khoá như hiện nay.
12. Là du khách, khi tôi đổi cuộc trò chuyện hoặc tải lại trang, tôi chấp nhận các câu chờ mất đi thay vì bị gửi nhầm sang cuộc khác.

## Implementation Decisions

### Trạng thái

- Thêm state `queued: string[]` trong `TripsageChatClient`, chỉ sống trong bộ nhớ của phiên đang mở. Không ghi `localStorage` hay máy chủ.
- Tách cờ khoá:
  - `inputLocked = saveLocked || loadingConversation || recovering`: chỉ cờ này khoá textarea.
  - `locked` (có `busy`) giữ nguyên cho các nút trả lời nhanh, chip và các hành động khác (Q6, Q7).
- Đổi cuộc trò chuyện (chọn trong lịch sử, "Đoạn chat mới") hoặc tải lại trang sẽ xoá `queued` (Q8).

### Gửi khi đang trả lời

- `submit()`:
  - Nếu `busy` và không `inputLocked`: thêm `draft.trim()` vào `queued`, xoá ô nhập.
  - Nếu không `busy`: gửi như hiện nay.
- **Giới hạn** (Q11): chỉ thêm khi `[...queued, text].join("\n").length <= MAX_LENGTH` (1000). Nếu vượt thì giữ chữ trong ô nhập và hiện bộ đếm "x/1000" ở trạng thái cảnh báo. Không cắt và không tách thành nhiều tin.
- **Thanh nút khi `busy`** (Q3):
  - Nút Dừng luôn hiện.
  - Nút Gửi hiện thêm khi ô nhập có chữ; `aria-label` là "Thêm vào hàng chờ".
  - Khi không `busy`, thanh nút giữ như hiện nay.

### Tự gửi

- Khi `chatStatus` chuyển về `ready` sau một lượt kết thúc bình thường (không lỗi, không bị dừng), `queued` không rỗng và không `locked`: gửi `queued.join("\n")` qua đúng đường `send()` hiện có, rồi xoá `queued` (Q1, Q12).
- Nếu lúc đó còn `saveLocked`, `loadingConversation` hoặc `recovering` thì đợi tới khi hết khoá rồi mới gửi. Trong lúc đợi, khối chờ vẫn hiện.
- Chỉ gửi một lần cho mỗi lượt kết thúc: dùng cờ hoặc ref để không gửi trùng khi component render lại.

### Dừng và lỗi

- **Bấm Dừng** (Q4): gọi `stop()`. Nếu `queued` không rỗng, chuyển các câu chờ về ô nhập và không tự gửi.
- **Câu trả lời lỗi** (Q5, gồm cả lỗi stream): giữ thông báo lỗi và nút "Thử lại" như cũ. Các câu chờ cũng chuyển về ô nhập và không tự gửi.
- **Ghép vào ô nhập** (Q14): `[...queued, draft.trim()].filter(Boolean).join("\n")`, các câu chờ đứng trước phần đang gõ dở. Không cắt bớt. Nếu vượt 1000 ký tự thì bộ đếm cảnh báo và nút Gửi bị tắt cho tới khi người đi bớt chữ.

### Hiển thị

- Khối "Đang chờ gửi" nằm ngay trên `.assistant-composer`, liệt kê từng câu (một dòng, quá dài thì cắt bằng dấu "…"), mỗi câu có nút ✕ (`aria-label`: "Bỏ câu chờ: …") (Q2, Q13). Không sửa trực tiếp.
- Khối có `aria-live="polite"` để trình đọc màn hình báo khi một câu được thêm.
- Câu chờ không xuất hiện trong khung hội thoại cho tới khi được gửi.
- Màu dùng các token `--tv-*` hiện có, cả chế độ sáng và tối.

## Testing Decisions

Test vitest cho `tripsage-chat-client` theo cách các test component hiện có đang làm:

- **Gõ khi đang trả lời:** textarea không còn `disabled` khi `busy`; bấm Enter thì câu vào hàng chờ, ô nhập được xoá, không gọi `sendMessage`.
- **Kết thúc bình thường:** gọi `sendMessage` đúng một lần với các câu chờ nối bằng `"\n"`, rồi khối chờ biến mất.
- **Có khoá khác:** khi lượt kết thúc mà vẫn `saveLocked`, chưa gửi; hết khoá thì mới gửi.
- **Bấm Dừng:** không gửi, ô nhập chứa các câu chờ rồi tới phần đang gõ dở, theo đúng thứ tự.
- **Lỗi stream:** giống bấm Dừng, và nút "Thử lại" vẫn còn.
- **Giới hạn 1000 ký tự:** câu làm tổng vượt 1000 không vào hàng chờ và bộ đếm hiện.
- **Nút ✕:** bỏ đúng câu được chọn.
- **Nút trả lời nhanh:** vẫn `disabled` khi `busy`.
- **Đổi cuộc trò chuyện:** hàng chờ bị xoá.

## Out of Scope

- Chat cho khách chưa đăng nhập (`assistant-v2-guest-chat.tsx`) và `assistant-v2-chat.tsx`.
- Sửa trực tiếp một câu đang chờ; gửi từng câu chờ thành lượt riêng.
- Giữ hàng chờ qua lần tải lại trang hoặc khi đổi cuộc trò chuyện.
- Hàng chờ phía máy chủ; thay đổi API `/api/ai/chat`.

## Further Notes

- Không lập ADR: thay đổi nằm trong giao diện, dễ làm lại, không có đánh đổi kiến trúc.
- Gộp nhiều câu thành một tin giúp tránh việc mỗi câu lập lại toàn bộ lịch (tốn lượt gọi mô hình, và lịch trung gian bị câu sau đè ngay).

## Ghi chú triển khai

- Đã triển khai đầy đủ đúng theo Q1–Q14 trong `apps/web/src/components/tripsage-chat/tripsage-chat-client.tsx` và `apps/web/src/components/assistant/assistant.css`.
- Tách phần logic thuần quản lý hàng chờ ra `apps/web/src/components/tripsage-chat/tripsage-chat-queue.ts` (client-safe thuần) để kiểm thử đơn vị độc lập trong `apps/web/src/components/tripsage-chat/tripsage-queued-message.vitest.test.ts` mà không sai khác hành vi UI.
- Không có phần bị bỏ qua hoặc làm khác với spec; dùng chung một form nên áp dụng đồng nhất cho cả máy tính và điện thoại.

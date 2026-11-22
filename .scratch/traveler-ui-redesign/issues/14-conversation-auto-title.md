# 14: Tên cuộc chat tự đặt và dấu cuộc chat đã ra chuyến đi

**What to build:** Thanh bên của trợ lý hiển thị tên cuộc chat lấy từ nội dung đã chốt ("Đà Nẵng → HG · 4 người · 12/12"), chỉ khi người dùng chưa tự đổi tên; cuộc chat đã lưu ra chuyến đi có chấm 6px `--tv-accent`. Kiểm schema `AssistantConversation` trước: nếu chưa phân biệt được tên tự đặt với tên người dùng đặt thì thêm cờ bằng Prisma migration.

**Blocked by:** 02

**Status:** verified-offline

**Nguồn:** [slim B11, BR-7, Data Contract](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md)

- [x] Ghi kết quả kiểm schema vào ticket; nếu có migration thì có file migration và đã kiểm migration state.
- [x] Tên chỉ cập nhật khi có dữ liệu đã chốt mới, không đè tên người dùng đã đặt.
- [x] Unit test cho hàm đặt tên (thiếu ngày, thiếu homeCity, chuyến từ điểm tập kết).
- [x] Cập nhật tên dùng hợp đồng ghi hiện có; không báo thành công trước khi DB xác nhận.

## Bằng chứng

- **Kiểm schema:** `packages/db/prisma/schema/assistant-conversation.prisma` trước đây chỉ có `title` (không có cờ phân biệt tên tự đặt / tên người dùng đặt và không có cột liên kết chuyến đã lưu).
- **Migration:** thêm `titleCustomized Boolean @default(false)` và `savedTripId String?` vào `AssistantConversation`, tạo migration `packages/db/prisma/migrations/20261123022000_assistant_conversation_auto_title/migration.sql` (ghi nhận trong **ADR-50**). Chạy `npx prisma validate` (PASS), `npx prisma generate` (PASS), `npx prisma migrate status` (55 migrations, ghi nhận migration mới ở trạng thái chưa deploy lên DB prod — không tự chạy migrate lên prod).
- Tạo `apps/web/src/modules/tripsage-chat/conversation-auto-title.ts` (`buildConversationAutoTitle`, `autoTitleFromAssistantParts`) chỉ dùng dữ liệu đã chốt (bỏ qua `assumedFields`).
- Nối cập nhật tên tự động trong `recordAssistantMessage` (chỉ khi `!titleCustomized`, gửi `data-conversation` sau khi DB xác nhận `SUCCESS`), thêm `updateMeta` idempotent (`executeIdempotentWrite`) cho đổi tên thủ công (`titleCustomized: true`) và gắn `savedTripId` (kiểm quyền sở hữu chuyến).
- Nối chấm 6px `--tv-accent` (`.assistant-sidebar-saved-dot`) trên `AssistantSidebar` khi có `savedTripId`, và bật đổi tên cho hội thoại `ASSISTANT` trên `TripsageChatClient` (chỉ cập nhật UI sau khi DB trả `SUCCESS`).
- Lệnh kiểm tra:
  - `npx vitest run src/modules/tripsage-chat/conversation-auto-title.vitest.test.ts src/modules/tripsage-chat/assistant-conversation.vitest.test.ts src/components/tripsage-chat src/components/traveler-ui`: PASS (15 files, 77/77 tests).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.
- Chưa chạy migration trên DB thật (chỉ đọc DB prod) và chưa kiểm trên trình duyệt.

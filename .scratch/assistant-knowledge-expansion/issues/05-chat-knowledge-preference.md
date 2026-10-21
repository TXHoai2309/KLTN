# 05: Nhớ Mở rộng kiến thức theo từng cuộc chat

**What to build:** Người dùng bật mở rộng ở một cuộc chat, mở lại cuộc chat đó vẫn thấy lựa chọn đúng; chat khác và chat mới không tự bật theo. Lựa chọn hiện tại và mode của từng câu trả lời cũ được hiển thị nhất quán.

**Blocked by:** 04 — Bật Mở rộng kiến thức và nhận câu trả lời có nguồn gốc rõ ràng.

**Status:** DONE

- [x] Chat đã tồn tại lưu lựa chọn riêng theo chủ sở hữu; refresh hoặc mở lại phục hồi lựa chọn từ dữ liệu đã xác nhận, không suy ra từ một chat khác hay từ câu trả lời model.
- [x] Chat mới chưa được tạo giữ lựa chọn trong phiên soạn và lưu cùng lần tạo chat thành công đầu tiên; bắt đầu chat mới luôn mặc định tắt.
- [x] Chat lịch sử chưa có thiết lập được hiểu là tắt. Mode trên các lượt cũ vẫn giữ nguyên độc lập với tùy chọn hiện tại.
- [x] Bật/tắt không thay đổi Destination context hoặc tự tạo/xóa cuộc chat. Tài khoản khác, Guest khác và Admin không đọc hay đổi lựa chọn của chat không thuộc mình.
- [x] Lưu lựa chọn tuân theo SUCCESS/FAILED/UNKNOWN và idempotency; UI không coi trạng thái chưa xác nhận là đã lưu và không đổi mode của một ask đang chờ phục hồi.
- [x] Giữ các setting thay đổi trong lúc request đang chạy tách khỏi snapshot request đó; phiên bản/đồng bộ hiện có phải ngăn một phản hồi cũ ghi đè lựa chọn mới.
- [x] Nếu cần đổi schema, chuẩn bị migration Prisma có tính tương thích với dữ liệu cũ; không dùng db:push hoặc tự chạy migration Production trong ticket này.
- [x] Kiểm thử UI/API/persistence với refresh, mở lại, đổi chat, new chat, lỗi ghi, UNKNOWN và hai thao tác cập nhật lệch thứ tự; giữ kiểm thử sở hữu và lịch sử cũ.

## Verification Evidence
- Schema & Migration:
  - Added additive column `knowledgeMode String @default("SOURCE_ONLY") @db.VarChar(16)` to `packages/db/prisma/schema/qa-conversation.prisma`.
  - Generated additive migration: `packages/db/prisma/migrations/20261021183000_add_qa_conversation_knowledge_mode/migration.sql` with column default and check constraint `qa_conversation_knowledge_mode_check`.
  - Ran `prisma generate`. Did NOT run `db:push` or apply migration to live Production.
- Conversation Preference Storage & API:
  - `qa-contract.ts`: `qaUpdateConversationSchema`, `qaConversationDetailMetadataSchema`, and `qaConversationSummarySchema` with optional/default `knowledgeMode`.
  - `qa-conversation-store.ts`:
    - `reserve`: stores `knowledgeMode` on conversation creation.
    - `complete`: synchronizes latest turn mode into conversation preference.
    - `get`: returns conversation detail with owner's `knowledgeMode`.
    - `list`: includes `knowledgeMode` in conversation summaries.
    - `update`: updates `knowledgeMode` and/or `title` under strict owner authorization (`"principalKind" = ${p.kind} AND "principalId" = ${p.id}`).
  - `qa-http.ts`: `renameConversation` handles `PATCH /api/ai/conversations/[id]` accepting `{ knowledgeMode, title }` with same-origin and ownership enforcement.
  - `assistant-conversation-client.ts`: added `updateConversationPreference`.
- Controller & Client UI:
  - `newConversation`: resets composer toggle to `"SOURCE_ONLY"`.
  - `loadConversation`: accepts `preferenceMode` from server detail and restores mode for existing chat.
  - When switching toggle in existing chat, persists preference via `updateConversationPreference`.
  - In-flight snapshot isolation: changing mode while request is in-flight preserves user's current composer setting upon response completion, while stored historical turn retains its original mode.
  - UNKNOWN retry preserves frozen original payload (including original mode) and key.
- Tests:
  - `apps/web/src/modules/ai/qa-chat-preference.vitest.test.ts` (7 tests passed).
  - 166 tests passed across all 12 QA vitest suites. Typecheck passed with 0 errors.

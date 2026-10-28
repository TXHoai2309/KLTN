# 07: Gửi tin văn bản/link và đọc lịch sử nhóm

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** IMPLEMENTED LOCALLY; vertical FE/integration VERIFIED

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q4, Q8, Q9; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Tin nhóm có thứ tự/cursor nhất quán, phân trang, kiểm tra membership hiện hành và ghi idempotent; quản lý authorship/system-kind, không tạo cuộc hội thoại AI hoặc DM.

**FE part:** Tab trò chuyện, transcript/composer dùng chung cho trang nhóm, tác giả/thời gian/trạng thái gửi, link an toàn, lịch sử tải thêm và empty/error states.

- [x] Chỉ host/member hợp lệ đọc/gửi trong đúng nhóm; actor gửi lấy từ session, không từ body. Người ngoài không biết nội dung qua ID hoặc phân trang.
- [x] Thành viên mới đọc được toàn bộ lịch sử theo Q9; trang giới thiệu đã thông báo quy tắc trước join.
- [x] Chỉ văn bản/link; escape nội dung, không render HTML tùy ý hoặc thêm ảnh/tệp/voice/call/đã xem/đang nhập.
- [x] Tin chỉ được gọi đã gửi khi DB xác nhận. Retry cùng payload/key không tạo hai tin; input giữ được khi chưa xác nhận/thất bại.
- [x] Có thứ tự đọc không bỏ sót tin do hai transaction commit lệch nhau; trang lịch sử dài giữ được vị trí khi tải thêm.
- [x] Có kiểm tra service/route/DB cho membership, gửi đồng thời và replay, cùng UI gửi/đọc/trạng thái/lịch sử.

**Demo / verification:** Hai thành viên trao đổi tin/link; tài khoản thứ ba join sau và đọc được các tin cũ.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC07-chat-r1. GET/POST /api/trip-companions/:id/messages. POST strict body {text:string}, trimmed 1–4000 chars (technical bound), Idempotency-Key; result {publicationId,messageId,sequence:string}. Authorship from current trusted session; body author/kind rejected. Shared companion-chat-contract.ts exports send/message/result/history/query schemas and CompanionMessage/CompanionHistory; companion-chat-fixtures.ts has client-safe message/history examples. GET query before (exclusive decimal bigint string) and limit raw string 1–100/default30; response {publicationId,items,olderCursor,highWaterCursor,canSend}. Page messages are ascending for rendering; request olderCursor as before to fetch prior history. New members can read all prior pages; current group permission/account required each request and before send replay. Text/links remain plain strings, render as escaped text and safe HTTP(S) links in FE, never HTML. Public APIs have no chat projection. Ordering proof: every sender holds Trip then publication UPDATE locks until commit, increments transactional per-group bigint counter and inserts message/result in same transaction. A later sender cannot allocate/commit a higher position until prior transaction commits/rolls back. RepeatableRead history reads committed counter and messages <= that cut. Thus commit-late writes cannot appear behind a consumed cursor; timestamps/cuid are not ordering. Rollback consumes no committed sequence. SAME payload/key replay yields same IDs/sequence; UNKNOWN retains exact payload/key. PostgreSQL 39 PASS (4 new chat concurrency/history/replay/lost-ack/rollback/held-commit cases + prior35), 20 scoped migrations/0 pending/cleanup PASS; schema/HTTP/Trip regression 22 PASS after fixing regex-to-BigInt parser pipeline (invalid decimals now fail validation, no exception). Prisma generation and root types recorded by runner. Migration 20261028134000_companion_chat adds counter/messages/constraints and extends service/DB deletion guard to retained host-only messages; no TTL. Development scoped rollout verified by endpoint+SQL identity; current redacted ledger receipt in .cache/trip-companions-be. FE/integration OPEN; final broad build remains separate.

**FE evidence:** Đã hoàn thành và kiểm chứng:
- `apps/web/src/modules/trip-companions/companion-client.ts`: Thêm `fetchCompanionMessages(publicationId, query)` (gọi `GET /api/trip-companions/:id/messages`) và `sendCompanionMessage(publicationId, text, idempotencyKey)` (gửi `POST /api/trip-companions/:id/messages` qua `sendIdempotentMutation`).
- `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Prefetch `initialHistory` server-side với `getCompanionHistory(reqHeaders, id, {}, tripReadDependencies)` và truyền vào `CompanionGroupView`.
- `apps/web/src/components/trip-companions/companion-group-view.tsx`:
  - Tab "Trò chuyện nhóm" (`tab=chat`, testid `group-tab-chat`, icon `MessageSquare`).
  - Transcript hiển thị avatar, tên người gửi, thời gian gửi `formatMessageTimeVi`, bubble tin nhắn với hàm escape & link parser an toàn `renderSafeMessageContent` (`target="_blank"`, `rel="noopener noreferrer"`, không HTML injection).
  - Phân loại tin nhắn hệ thống (`kind === "SYSTEM"`): hỗ trợ `ITINERARY_CHANGED` với nút hành động "Xem lịch trình chi tiết" chuyển tức thì sang tab lịch trình, và `COMPANION_CANCELED`.
  - Nút phân trang tin nhắn cũ hơn ("Tải tin nhắn cũ hơn" / `handleLoadOlder`) qua `olderCursor`.
  - Khung soạn tin (`companion-chat-input`, `companion-chat-send-btn`) tạo khóa idempotency tự động; xử lý an toàn kết quả `UNKNOWN` với nút thử lại cùng key và nội dung.
  - Khung thông báo chỉ đọc (`data-testid="companion-chat-readonly-banner"`) và ẩn khung soạn tin khi `canSend === false`.
- `apps/web/src/app/trip-companions/companion.css`: Bổ sung toàn bộ styles responsive cho chat layout, bubble, link, avatar, system pill, older button, read-only banner, composer.
- Unit tests: `companion-client.vitest.test.ts` (37 tests PASS), `companion-group.vitest.test.ts` (11 tests PASS).

**Integration evidence:**
- PostgreSQL disposable integration suite: 11 files / 58 tests PASS (bao gồm 4 test PostgreSQL chat concurrency/replay/history/ordering).
- Root typecheck (`npm run check-types`): 4/4 packages PASS.
- Production web build (`npm run build --workspace web`): 53 routes compiled cleanly.
- `git diff --check`: 0 errors.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

# 09: Dấu chưa đọc và quay lại nhóm có tin mới

**What to build:** Tài khoản nhận biết nhóm nào có tin chưa đọc trong Tôi tham gia, mở đúng cuộc trò chuyện và cập nhật dấu đã đọc của riêng mình.

**Blocked by:** TC-08 — Cập nhật tin mới và phục hồi mất kết nối

**Status:** IMPLEMENTED LOCALLY; vertical FE/integration VERIFIED

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Dấu mốc đọc theo actor/nhóm cho cả host, chỉ tăng theo cursor hợp lệ, số chưa đọc/summary từ dữ liệu authoritative và theo quyền hiện hành.

**FE part:** Badge có ngữ cảnh, lối mở chat từ Tôi tham gia/navigation phù hợp, cập nhật tổng hợp khoảng 15 giây khi web đang hiện và không tạo global inbox mới.

- [x] Read marker của người này không đổi trạng thái người khác; không lùi cursor, nhận cursor giả tương lai hoặc ghi marker cho nhóm không có quyền.
- [x] Số chưa đọc phản ánh tin thực, không dùng tổng số thành viên hoặc số chỗ; member mới đọc toàn bộ lịch sử nhưng không bị gán read receipt công khai.
- [x] Mở đúng nhóm/tab và cập nhật marker theo phần đã hiển thị; không báo tất cả tin đã đọc chỉ vì background fetch.
- [x] Logout/leave/kick làm mất summary riêng; trạng thái cũ không xuất hiện cho tài khoản khác.
- [x] Có kiểm tra marker concurrency/authorization và UI badge/live status; không hứa thông báo khi web đã đóng, không có read receipt 'ai đã xem'.

**Demo / verification:** Một người gửi trong nhóm khác; người còn lại thấy badge đúng nhóm, mở chat và dấu chưa đọc được cập nhật chỉ cho tài khoản đó.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC09-unread-r1. POST /api/trip-companions/:id/read strict {sequence:decimal-string} + Idempotency-Key; shared companionReadInputSchema/companionReadResultSchema. Result {publicationId,sequence} is monotonic at commit; stale successful replay does not rewind stored cursor, FE merges monotonically/refetches summary. Current host/member checked before replay and again after account/Trip/publication locks. Sequence0 allowed; positive cursor must exist committed in this group and cannot exceed messageSequence. GET /api/trip-companions/unread uses after publication-ID and raw limit1–50/default50, stable ID keyset; companionUnreadQuerySchema/companionUnreadSchema / CompanionUnread, fixture companionUnreadFixture. Summary items {publicationId,unreadCount,lastReadCursor,highWaterCursor,canSend}, nextCursor. Counts only actual messages above own marker, excluding own USER sends; independent actor scopes include host/current members across dates. GET never writes markers. Only explicitly displayed messages should be marked by FE; current membership/account enforcement removes left/barred/locked/private account data on next request; no public read-receipt API. PostgreSQL43 PASS (2 new marker/concurrency/permission tests + earlier41),21 migrations/0 pending/cleanup PASS; chat/read schema4 PASS; generation PASS. BigInt constructors retain exact values under existing ES2017 target; root typecheck result in runner/final receipt. Development independently verified and marker migration deployed through Prisma with scoped pending check, current receipt under .cache/trip-companions-be. FE badge/timer/browser integration OPEN.

**FE evidence:** Implemented `fetchCompanionUnread` and `markCompanionRead` in `companion-client.ts`. In `companion-discovery-view.tsx`, ~15s polling active when visible displays `.companion-unread-badge` (`data-testid="companion-unread-badge-{id}"`) on cards with unseen messages, and links CTA directly to `/trip-companions/{id}/group?tab=chat`. In `companion-group-view.tsx`, strictly marks displayed messages as read monotonically on chat tab (`activeTab === "chat"`), displays unread pill on chat tab button when on other tabs, and clears upon opening chat. `group/page.tsx` parses `searchParams.tab`. 46 unit tests in `companion-client.vitest.test.ts`, 13 tests in `companion-group.vitest.test.ts`, 8 tests in `companion-discovery.vitest.test.ts` PASS.

**Integration evidence:** Disposable PostgreSQL 11 files / 58 tests PASS (including 3 unread tests in `companion-unread.postgres.integration.vitest.test.ts`). `npm run check-types` 4/4 packages PASS. `npm run build --workspace web` compiled 53 static/dynamic routes cleanly. `git diff --check` reported 0 whitespace errors.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

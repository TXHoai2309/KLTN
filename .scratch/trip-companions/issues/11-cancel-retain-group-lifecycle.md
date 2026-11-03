# 11: Hủy chuyến, giữ lịch sử và chat sau hoàn tất

**What to build:** Host hủy chuyến đồng hành, người trong nhóm đọc lại lịch/chat nhưng không gửi thêm; chuyến hoàn tất bình thường vẫn chat không giới hạn.

**Blocked by:** TC-05 — Quản lý số chỗ, đóng tuyển và gỡ công khai; TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** IMPLEMENTED LOCALLY

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q12, Q13; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Trạng thái hủy của phần đồng hành, notice và chặn tuyển/gửi tin nguyên tử; giữ lịch sử/membership/deletion guard, ưu tiên hủy hơn hoàn tất mà không giả lập bằng Trip completion.

**FE part:** Hành động hủy trong quản lý, thông báo hậu quả, badge và composer chỉ đọc khi hủy; trạng thái hoàn tất giải thích nhóm vẫn hoạt động.

- [x] Đóng tuyển/gỡ bài không bị biến thành hủy hoặc giải tán; hủy là terminal cho nhóm hiện tại, không tự khôi phục hoặc chuyển sang Trip khác.
- [x] Sau hủy không join/gửi tin người dùng, kể cả từ UI/cursor cũ; hiện hành member vẫn đọc lịch sử, Q6 tiếp tục áp dụng lịch đã lưu và hệ thống có thể phản ánh thay đổi.
- [x] Hoàn tất theo ngày/cờ hiện có không tự khóa chat, đặt TTL 7 ngày hoặc xóa dữ liệu; hủy vẫn giữ chat chỉ đọc.
- [x] Trip từng có thành viên vẫn bị chặn xóa kể cả sau leave/kick/hủy; cancellation và group notice nhất quán khi retry/race với gửi tin.
- [x] Có kiểm tra role/lifecycle/transaction và UI host/member; báo rõ loại hoàn tất/hủy, không mở rộng sang xóa vĩnh viễn hoặc chuyển chủ.

**Demo / verification:** Host hủy làm composer của hai thành viên chuyển chỉ đọc; một Trip khác hoàn tất vẫn gửi tin được.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC11-cancel-r1. POST /api/trip-companions/:id/cancel accepts only {confirm:true} and Idempotency-Key, returns shared {publicationId}; cancelCompanion service is owner-only with current account/ownership checks before replay and under the same Trip/publication locks as join/send. Terminal canceledAt, recruitment stop, one SYSTEM COMPANION_CANCELED notice, sequence increment and replay result commit atomically. Same/different-key repeats never duplicate notice. No undo or transfer endpoint; database terminal-state trigger rejects clearing/changing canceledAt. Group/management adds optional canceledAt and canSend; history/delta/unread canSend=false after cancel, current valid relations retain history/latest saved itinerary; later authoritative Trip saves may still append SYSTEM notices. USER send/reconcile recheck cancellation before replay and after locks; join/public discovery/detail cannot admit canceled posts. /mine returns CANCELED label. Host removal still revokes members after cancellation; delete history guard persists. Calendar/manual completion alone never gates chat or adds TTL. Client-safe canceled-group/system-message fixtures exported; companionManageResultSchema added for PATCH result. PostgreSQL58 PASS in11 suites, including cancel/join/send race, rollback/replay, terminal DB guard, latest itinerary notice after cancel, normal chat years after completion, observed user/SYSTEM late-commit ordering and account/date/clock/completion lock waits. 23 actual scoped migrations/0 pending/cleanup PASS. Strict backend types PASS (63 entries, unchanged strict ES2017 target); focused fixtures/Trip regressions pass. Development independently verified and final migration applied through guarded Prisma deploy:42 applied/0 pending/0 unfinished,50 constraints/9 indexes/2 companion triggers inspected. No business-data/Production/provider write, FE code modification or application release. Broad regression and combined build results/limits are in final verification receipt; vertical FE/browser acceptance remains separate.

**FE evidence:** TC-11 Frontend IMPLEMENTED LOCALLY. Implemented `cancelCompanionTrip(publicationId, idempotencyKey)` in `companion-client.ts` with 2 unit tests in `companion-client.vitest.test.ts`. Implemented terminal cancellation Danger Zone and confirmation modal in `companion-management-view.tsx` with date-stamped cancellation banner and disabled inputs/actions when `canceledAt` is present; added 2 unit tests in `companion-management.vitest.test.ts`. Implemented `companion-group-canceled-banner` (with date of cancellation) and `companion-group-completed-banner` (with trip completion note explaining chat remains active) in `companion-group-view.tsx`, auto-reloading group state upon receiving `COMPANION_CANCELED` delta notice; added 2 unit tests in `companion-group.vitest.test.ts`. Vitest focused suite: 11 files / 163 tests PASS.

**Integration evidence:** Full vertical integration verified. PostgreSQL disposable test suite (`apps/web/scripts/test-trip-companions-postgres.mjs`): 11 files / 58 tests PASS (including `companion-cancel.postgres.integration.vitest.test.ts`, `companion-chat.postgres.integration.vitest.test.ts`, `companion-notice.postgres.integration.vitest.test.ts`), 23 migrations applied, 0 pending, container cleaned up. Strict repo typecheck (`npm run check-types`): 4/4 packages PASS. Web build (`npm run build --workspace web`): 53 routes PASS. Git whitespace check: 0 errors.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

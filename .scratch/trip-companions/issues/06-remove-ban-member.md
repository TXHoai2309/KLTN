# 06: Chủ chuyến loại và chặn thành viên

**What to build:** Host xem danh sách thành viên, loại một người và chặn tài khoản đó tham gia lại; nhóm còn lại tiếp tục hoạt động.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** IMPLEMENTED LOCALLY

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q10, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Thao tác host-only nguyên tử trên membership/chỗ, cấm target host, lưu trạng thái chặn bền và áp dụng ở join/reader/writer. Không thêm quyền Admin đọc riêng.

**FE part:** Danh sách thành viên theo quyền, hành động loại/chặn chỉ cho host, giải thích hậu quả và view mất quyền ở tài khoản bị loại.

- [x] Chỉ host loại/chặn thành viên khác; người ngoài, member và Admin không sở hữu không có quyền đặc biệt.
- [x] Tài khoản bị loại mất quyền nhóm và không tạo membership khác hoặc dùng retry/rejoin để vượt chặn.
- [x] Trả chỗ đúng một lần và giữ lịch sử quan hệ/tin nhóm; host không tự loại mình hoặc chuyển chủ qua thao tác này.
- [x] Join/loại đồng thời và retry UNKNOWN giữ được trạng thái đúng, không âm thầm tự gỡ chặn.
- [x] Có kiểm tra hai/ba actor qua service/route và UI phản ánh mất quyền; không mở rộng sang CMS báo cáo, DM hoặc gỡ chặn chưa được yêu cầu.

**Demo / verification:** Host loại một thành viên; người đó không đọc/nhắn/join lại được; người khác vẫn dùng nhóm.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC06-members-r1. GET /api/trip-companions/:id/members returns companionMembersSchema / CompanionMembers from companion-members-contract.ts, fixture companionMembersFixture. It contains host and current ACTIVE members only, with group-safe userId/displayName/avatar and joinedAt; no email/contact/account status. Current host/member required; outsider/foreign Admin/left/barred/locked denied. POST /api/trip-companions/:id/members/:userId/ban uses {confirm:true}, target path ID, Idempotency-Key; result {publicationId}. Service getCompanionMembers/banCompanionMember in companion-members-service.ts. Host-only permanent BANNED on existing relationship (including a previously LEFT relation), no unban route; host target 409, missing relation 404. Join checks BANNED both before replay and after row locks, so an original successful join key cannot bypass removal. Capacity counts ACTIVE only, removal returns place once; current group/member readers deny the barred account. Other members retain access and relation/history never deleted. Migration 20261028133000_companion_ban adds state. PostgreSQL 35 PASS (3 new ban/rejoin-race/authorization + 32 earlier), 19 scoped migrations/0 pending/cleanup PASS; root typecheck 4/4, schema/HTTP fixture suite 4 PASS, Prisma generation PASS. Global diff check detected trailing EOF blank lines in concurrently edited FE client/test files; BE leaves those files untouched and records combined whitespace OPEN until FE resolves. Development rollout uses independently verified target and scoped Prisma deploy (current ledger in ignored receipt). No Production or business-data mutations. FE/integration OPEN.

**FE evidence:** Implemented companion member listing and ban functionality. `companion-client.ts`: `fetchCompanionMembers(publicationId)` and `banCompanionMember(publicationId, userId, idempotencyKey)` with `sendIdempotentMutation` sending `{ confirm: true }` and `Idempotency-Key` header to `POST /api/trip-companions/:id/members/:userId/ban`. `companion-group-view.tsx`: In "Thành viên" tab, render host card and active members list with avatars, names, and join dates; for Host viewer, show "Loại khỏi nhóm" button on members (not on host card). Modal confirmation dialog clearly explains 3 permanent consequences (permanent ban, returning 1 place, preserving discussion history). Handles `UNKNOWN` retry with same key, and `SUCCESS` removes member from local state and decrements displayed count. Server Component `/trip-companions/[id]/group/page.tsx` prefetches `initialMembers` and securely handles 403 by redirecting to public introduction. Unit tests in `companion-group.vitest.test.ts` (6/6 pass) and `companion-client.vitest.test.ts` (33/33 pass).

**Integration evidence:** Verified with real PostgreSQL disposable integration test suite `scripts/test-trip-companions-postgres.mjs`: 11/11 files (58/58 tests) PASS, including `companion-ban.postgres.integration.vitest.test.ts` (3 tests), 23 migrations, 0 pending. Root typecheck `npm run check-types` 4/4 packages PASS. Web production build `npm run build --workspace web` compiled 53 static/dynamic pages successfully. `git diff --check` PASS (0 errors).



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

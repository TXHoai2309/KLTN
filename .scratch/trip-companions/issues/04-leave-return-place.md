# 04: Tự rời nhóm và trả chỗ

**What to build:** Thành viên tự rời nhóm, mất quyền nhóm và trả chỗ; có thể tham gia lại khi vẫn đủ điều kiện.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** IMPLEMENTED LOCALLY; verified across BE, FE, and integration

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q5, Q7, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Rời idempotent, thu hồi membership ở mọi reader/writer, trả chỗ nguyên tử, giữ lịch sử quan hệ và không biến hết chỗ thành cờ đóng tuyển của host.

**FE part:** Hành động rời có giải thích hậu quả, trạng thái ghi/UNKNOWN, xóa dữ liệu riêng khỏi view khi mất quyền, đồng bộ Tôi tham gia/số chỗ và quay về giới thiệu phù hợp.

- [x] Rời thành công thu hồi quyền đọc lịch riêng và mọi quyền nhóm ở request kế tiếp; không chỉ ẩn nút trên client.
- [x] Chỗ được trả đúng một lần; chỉ nhận người mới nếu bài còn public, host chưa đóng tuyển và chưa đến ngày đi.
- [x] Tự rời có thể vào lại khi còn đủ điều kiện; trạng thái bị chặn không được lợi dụng cùng luồng này để vào lại.
- [x] Không xóa lịch sử tham gia hoặc nội dung nhóm; khi chat được bổ sung, tin đã gửi vẫn thuộc lịch sử nhóm.
- [x] Host không tự rời như thành viên; không tạo thao tác đổi chủ chuyến. Bao phủ race join/leave, retry và UI clear-on-revocation.

**Demo / verification:** Một thành viên rời làm chỗ trống tăng một; mất quyền lịch riêng; vào lại được khi vẫn còn mở.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC04-leave-r1. POST /api/trip-companions/:id/leave uses shared strict {confirm:true}, Idempotency-Key, and {publicationId} confirmed result. companion-group-service.ts exports leaveCompanion; existing joinCompanion now reactivates the same LEFT row under locks. Historical everHadMembers and joinedAt remain intact. Host leave => COMPANION_HOST_CANNOT_LEAVE/409; no prior member/current barred relation => 403, Guest 401. ACTIVE -> LEFT once; current group readers/joined list revoke on next request, places count only ACTIVE rows. Leave allowed after departure; rejoin still requires future/open/available. Same-key replay never removes a later rejoin or reactivates a departed membership; reread group after replay. Migration 20261028131000_companion_leave adds LEFT. Evidence: disposable PostgreSQL 29 PASS (3 new leave/rejoin/race + prior 26), 17 migrations/0 pending/cleanup PASS; group schema/HTTP boundary 2 PASS and prior focused 70 PASS; Prisma generation PASS, root types recorded by current runner; diff check PASS. FE/integration OPEN; no FE wait before TC-05.

**FE evidence:** `companion-client.ts` (`leaveCompanionTrip`), `companion-group-view.tsx` (nút rời nhóm dành riêng cho Member, ẩn đối với Host; modal xác nhận giải thích đầy đủ mất quyền, hoàn trả chỗ, lưu trữ thảo luận; xử lý UNKNOWN retry an toàn; sau khi rời điều hướng về `/trip-companions/:id` xóa sạch dữ liệu private).

**Integration evidence:** Focused Vitest 12 files / 143 passed, 50 skipped; PostgreSQL disposable integration tests `test-trip-companions-postgres.mjs` 11/11 files (50/50 tests) PASS bao gồm `companion-leave.postgres.integration.vitest.test.ts` (3 tests); typecheck 4/4 packages PASS; production build compiled successfully; `git diff --check` PASS.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

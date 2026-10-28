# 05: Quản lý số chỗ, đóng tuyển và gỡ công khai

**What to build:** Host chỉnh phần giới thiệu/số chỗ, đóng hoặc mở lại tuyển người, gỡ hoặc công khai lại bài mà vẫn giữ nhóm.

**Blocked by:** TC-03 — Tham gia ngay và mở lịch của nhóm

**Status:** IMPLEMENTED LOCALLY

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q5, Q7, Q12, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Mutation host-only, capacity không dưới số đang tham gia, tách visibility/manual recruitment/full/điều kiện ngày, bảo toàn một bài/một nhóm và kiểm tra đồng thời với join.

**FE part:** Khu vực quản lý host với số liệu đúng, form sửa, hành động đóng/mở/gỡ/đăng lại, lý do không thể mở và phản hồi ghi xác nhận.

- [x] Không giảm số chỗ dưới số tài khoản đang tham gia; tăng/giảm cạnh tranh với join không làm quá chỗ.
- [x] Đóng tuyển và gỡ công khai dừng người mới vào; thành viên hiện hành giữ quyền nhóm, không tạo nhóm khác khi mở/đăng lại.
- [x] Chỉ mở/đăng lại trước ngày đi và khi chuyến chưa hoàn tất/hủy, đáp ứng các điều kiện nguồn.
- [x] Đủ chỗ là trạng thái từ số thành viên, không tự ghi thành đóng tuyển thủ công. Host và thành viên thấy đúng quyền/hành động.
- [x] Mutation có quyền, idempotency, xung đột và UI pending/FAILED/UNKNOWN được kiểm tra; không dùng một công tắc cho cả đóng tuyển và hủy.

**Demo / verification:** Host đóng tuyển rồi gỡ bài; thành viên vẫn xem nhóm nhưng người mới không join được; host mở lại khi còn đủ điều kiện.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC05-management-r1. GET/PATCH /api/trip-companions/:id/management owner-only. Shared companion-management-contract.ts exports companionManageInputSchema, companionManageSchema / CompanionManage; companion-management-fixtures.ts exports companionManageFixture. GET returns private tripId, current draft/Trip/imageOptions, visibility PUBLIC/WITHDRAWN, recruitmentOpen, managementRevision, activeMemberCount and canReopen. PATCH body is full CompanionDraft plus {confirm:true,baseRevision:number,visibility,recruitmentOpen}; key hash includes full validated payload and target. SUCCESS {publicationId,managementRevision}; reread GET after replay. Same group lock order; revision mismatch 409 COMPANION_REVISION_CONFLICT; capacity below ACTIVE count 409 COMPANION_CAPACITY_TOO_SMALL; invalid image 422. Re-publication/re-opening require future date and no manual completion. Close/withdraw never revoke members or create a new group. Additive optional recruitmentStatus on PublicCompanion: OPEN/FULL/CLOSED/DEPARTED/COMPLETED/WITHDRAWN; existing clients importing shared schema remain compatible, fixtures updated. Public collection/detail excludes withdrawn; closed/full public posts remain discoverable. DELTA to TC02 r1: /mine now includes own past/completed/withdrawn posts for management; /joined retains current groups across dates. Filters/cursor/envelopes unchanged. Migration 20261028132000_companion_recruitment adds visibility/recruitmentOpen/revision. Tests: PostgreSQL 32 PASS (3 new management/capacity-race/revision + 29 prior), 18 scoped migrations/0 pending/cleanup PASS; 49 focused schema/service/HTTP PASS; root types 4/4, Prisma generation and whitespace PASS. Development independently verified by configured endpoint plus SQL identity; scoped 03/04/05 migrations deployed using Prisma migrate deploy, 37 applied/0 pending/0 unfinished, 25 constraints/5 indexes/1 history guard trigger inspected. No Production or business-data write. Receipt .cache/trip-companions-be/development-migration.json (ignored, no credentials). Final build/integration remains separate while FE is active.

**FE evidence:** Implemented companion management page and client functions. `companion-client.ts`: `fetchCompanionManagement(id)` and `updateCompanionManagement(id, input, idempotencyKey)` using `sendIdempotentMutation` with PATCH method, `confirm: true`, `baseRevision`, `visibility`, `recruitmentOpen`, and `draft` payload. `companion-management-view.tsx`: Host-only management view with separation banner from trip edit, status cards (visibility toggle, recruitment toggle with `canReopen` validation, active members / capacity indicator), capacity minimum enforcement (cannot be less than `activeMemberCount`), revision conflict handling (HTTP 409 `COMPANION_REVISION_CONFLICT`), capacity violation handling (HTTP 409 `COMPANION_CAPACITY_TOO_SMALL`), image grid selection, and `UNKNOWN` retry support. Route `/trip-companions/[id]/manage`: Server Component with server-side authorization check redirecting 401 to login, 403 to public detail, 404 on not found. Group view link "Quản lý tuyển" added for host. Discovery mine tab added "Quản lý" buttons and status badge indicators. `companion-management.vitest.test.ts` (4/4 tests pass) and `companion-client.vitest.test.ts` (29/29 tests pass).

**Integration evidence:** Verified with real PostgreSQL integration test suite `scripts/test-trip-companions-postgres.mjs`: 11/11 files (50/50 tests) PASS, 23 migrations, 0 pending. Root typecheck `npm run check-types` 4/4 packages PASS. Web build `npm run build --workspace web` compiled 54 pages (including `/trip-companions/[id]/manage`) successfully. `git diff --check` PASS (0 errors).



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

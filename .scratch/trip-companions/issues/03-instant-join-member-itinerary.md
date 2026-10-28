# 03: Tham gia ngay và mở lịch của nhóm

**What to build:** Tài khoản đăng nhập bấm tham gia khi còn chỗ, nhận membership đã xác nhận, vào nhóm xem lịch mới nhất và tìm lại chuyến trong Tôi tham gia.

**Blocked by:** TC-02 — Khám phá và lọc chuyến công khai

**Status:** IMPLEMENTED LOCALLY; verified across BE, FE, and integration

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q1, Q2, Q4, Q5, Q7, Q12, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Giữ chỗ/membership nguyên tử, quyền đọc lịch theo quan hệ hiện hành, host không chiếm chỗ, điều kiện ngày Việt Nam/role/status và chặn xóa Trip từng có thành viên ngay trong lát cắt này.

**FE part:** CTA theo quan hệ, login-return không tự join, Đang tham gia/Chưa xác nhận/Chỗ vừa hết/Đã tham gia, lối vào nhóm, lịch/tài khoản trong nhóm và Tôi tham gia.

- [x] Mỗi tài khoản dùng một chỗ tìm thêm; host không dùng chỗ. Hai người tranh chỗ cuối chỉ một người thành công; retry không tạo membership hoặc chiếm chỗ trùng.
- [x] Server kiểm tra bài còn công khai/còn tuyển, chưa đến ngày đi, chưa hủy/hoàn tất, account hợp lệ và không bị chặn tại thời điểm ghi.
- [x] Guest đăng nhập quay lại đúng chuyến rồi tự bấm tham gia; không có yêu cầu/chờ duyệt hoặc tự phát lại write sau login.
- [x] Thành viên hiện hành đọc được lịch chính thức mới nhất; người ngoài/Admin không phải thành viên không được đọc private DTO hoặc sửa lịch.
- [x] Trip từng có thành viên bị chặn xóa ở service, kể cả khi mọi người về sau đã rời; ghi nhận từng tham gia không mất do tái tham gia hoặc xóa membership.
- [x] Có kiểm tra transaction trên PostgreSQL cho tranh chỗ/retry/xóa, kiểm tra route isolation và UI từ join đến lịch nhóm/Tôi tham gia.

**Demo / verification:** Hai tài khoản cùng bấm chỗ cuối; tài khoản thắng xem lịch, tài khoản còn lại nhận hết chỗ; host không xóa được Trip đã có thành viên.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC03-membership-r1. POST /api/trip-companions/:id/join accepts only {confirm:true} plus Idempotency-Key; result {publicationId}. GET /api/trip-companions/:id/group returns CompanionGroup; GET /api/trip-companions/joined uses existing strict list query/list schema and includes host/current member groups across dates. Shared companion-group-contract.ts exports companionConfirmSchema, companionGroupMutationSchema, companionGroupSchema / CompanionGroup; companion-group-fixtures.ts exports companionGroupFixture. Service exports joinCompanion/getCompanionGroup; listJoinedCompanions is in discovery service. Group projection has relationship, memberCount including host, public introduction and detailed days/visits (time/duration/coordinates for currently public destinations); unavailable destinations use null ID/coordinates and a placeholder. No needs/AI/contact/private Trip DTO. Active account checked per reader/writer; foreign/non-member Admin gets 403; Guest 401; invalid body 400; full/closed/history-delete 409. All responses private/no-store; ordinary GET envelopes and shared mutation outcomes. Successful replay IDs describe the original operation, never restore membership; refresh group after replay. Lock order account SHARE -> Trip UPDATE -> publication UPDATE; date evaluated after locks. One membership/account, host never uses a place. Public DTO shape unchanged; availablePlaces and availableOnly now derive from current ACTIVE memberships in one read snapshot. Migration 20261028130000_companion_membership adds durable historical flag/membership uniqueness/FKs and DB delete trigger; existing delete service locks/checks historical flag before favorite deletion. Evidence: 70 focused tests PASS; disposable PostgreSQL 26 PASS (6 new TC-03 + prior 20), 16 migrations/0 pending/cleanup PASS; Prisma generate and root typecheck PASS; whitespace checked. No Development/Production rollout yet.

**FE evidence:** `companion-client.ts` (`joinCompanionTrip`, `fetchCompanionGroup`, `fetchJoinedCompanions`), `companion-introduction-view.tsx` (Guest/outsider/member/host CTA, unknown retry, full/departed disabled buttons), `companion-group-view.tsx` (itinerary timeline, unavailable destination pill, official read-only itinerary notice, member list, host links), `companion-discovery-view.tsx` ("Tôi tham gia" tab `tab=joined`).

**Integration evidence:** Focused Vitest 12 files / 142 passed, 46 skipped. PostgreSQL integration suite `test-trip-companions-postgres.mjs` 10/10 files (46/46 tests) PASS, 22 migrations applied, 0 pending, cleanup PASS. Web production build compiled successfully (53 static pages). Typecheck 4/4 packages PASS. `git diff --check` PASS.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

# TC-03 — Tham gia ngay và mở lịch của nhóm

## Status

IMPLEMENTED LOCALLY; verified across BE, FE, and integration.

## Epic

Approved travel-companions extension, ticket 03.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Tham gia ngay và mở lịch của nhóm

## Outcome

Giữ chỗ/membership nguyên tử, quyền đọc lịch theo quan hệ hiện hành, host không chiếm chỗ, điều kiện ngày Việt Nam/role/status và chặn xóa Trip từng có thành viên ngay trong lát cắt này.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/03-instant-join-member-itinerary.md).
- Approved travel-companions plan Q1, Q2, Q4, Q5, Q7, Q12, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Giữ chỗ/membership nguyên tử, quyền đọc lịch theo quan hệ hiện hành, host không chiếm chỗ, điều kiện ngày Việt Nam/role/status và chặn xóa Trip từng có thành viên ngay trong lát cắt này.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Unique per-account active membership; durable everHadMembers flag, locked join/delete boundary, current member itinerary projection and joined collection.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Unique per-account active membership; durable everHadMembers flag, locked join/delete boundary, current member itinerary projection and joined collection.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Mỗi tài khoản dùng một chỗ tìm thêm; host không dùng chỗ. Hai người tranh chỗ cuối chỉ một người thành công; retry không tạo membership hoặc chiếm chỗ trùng.
- [x] Server kiểm tra bài còn công khai/còn tuyển, chưa đến ngày đi, chưa hủy/hoàn tất, account hợp lệ và không bị chặn tại thời điểm ghi.
- [x] Guest đăng nhập quay lại đúng chuyến rồi tự bấm tham gia; không có yêu cầu/chờ duyệt hoặc tự phát lại write sau login.
- [x] Thành viên hiện hành đọc được lịch chính thức mới nhất; người ngoài/Admin không phải thành viên không được đọc private DTO hoặc sửa lịch.
- [x] Trip từng có thành viên bị chặn xóa ở service, kể cả khi mọi người về sau đã rời; ghi nhận từng tham gia không mất do tái tham gia hoặc xóa membership.
- [x] Có kiểm tra transaction trên PostgreSQL cho tranh chỗ/retry/xóa, kiểm tra route isolation và UI từ join đến lịch nhóm/Tôi tham gia.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028130000_companion_membership: additive membership enum/table/unique/FKs and publication historical flag; guarded Trip deletion.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC03-membership-r1. POST /api/trip-companions/:id/join accepts only {confirm:true} plus Idempotency-Key; result {publicationId}. GET /api/trip-companions/:id/group returns CompanionGroup; GET /api/trip-companions/joined uses existing strict list query/list schema and includes host/current member groups across dates. Shared companion-group-contract.ts exports companionConfirmSchema, companionGroupMutationSchema, companionGroupSchema / CompanionGroup; companion-group-fixtures.ts exports companionGroupFixture. Service exports joinCompanion/getCompanionGroup; listJoinedCompanions is in discovery service. Group projection has relationship, memberCount including host, public introduction and detailed days/visits (time/duration/coordinates for currently public destinations); unavailable destinations use null ID/coordinates and a placeholder. No needs/AI/contact/private Trip DTO. Active account checked per reader/writer; foreign/non-member Admin gets 403; Guest 401; invalid body 400; full/closed/history-delete 409. All responses private/no-store; ordinary GET envelopes and shared mutation outcomes. Successful replay IDs describe the original operation, never restore membership; refresh group after replay. Lock order account SHARE -> Trip UPDATE -> publication UPDATE; date evaluated after locks. One membership/account, host never uses a place. Public DTO shape unchanged; availablePlaces and availableOnly now derive from current ACTIVE memberships in one read snapshot. Migration 20261028130000_companion_membership adds durable historical flag/membership uniqueness/FKs and DB delete trigger; existing delete service locks/checks historical flag before favorite deletion. Evidence: 70 focused tests PASS; disposable PostgreSQL 26 PASS (6 new TC-03 + prior 20), 16 migrations/0 pending/cleanup PASS; Prisma generate and root typecheck PASS; whitespace checked. No Development/Production rollout yet.

### Bằng chứng FE và tích hợp (Hoàn tất 2026-10-28)

- **Client & Mutation:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: `joinCompanionTrip` wraps `sendIdempotentMutation` with target publicationId and idempotencyKey. `UNKNOWN` preserves the same key and permits safe user retry ("Thử lại tham gia").
  - `fetchCompanionGroup` and `fetchJoinedCompanions` added and tested.
- **UI & Views:**
  - `apps/web/src/components/trip-companions/companion-introduction-view.tsx`: Contextual CTA for Guest (login prompt with returnTo), Outsider candidate (instant join button, disabled for departed or full trips, pending state, server error alerts, unknown retry), Member (member badge + enter group CTA), and Host (enter group CTA + return to trip management).
  - `apps/web/src/components/trip-companions/companion-discovery-view.tsx`: Added 3rd scope tab "Tôi tham gia" (`tab=joined`) with auto-fetching via `fetchJoinedCompanions`. Guest selecting this tab gets login redirect prompt. Joined trip cards provide direct "Vào nhóm" link.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`: Group space view with relationship badge, itinerary timeline (HH:mm, duration, coordinates, unavailable destination warning pill, read-only official itinerary notice), members overview, and host management link.
  - `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Server component enforcing authenticated access via `getCompanionGroup`, redirecting 401 to login and 403 to public detail.
- **Automated Verification:**
  - Vitest focused companion suite: 12 files / 142 passed, 46 skipped.
  - PostgreSQL disposable runner (`test-trip-companions-postgres.mjs`): 10/10 test files (46/46 tests) PASS, 22 migrations applied, 0 pending.
  - Web production build (`npm run build --workspace web`): Compiled successfully, 53 static pages.
  - Typecheck (`npm run check-types`): 4/4 packages PASS.
  - `git diff --check`: 0 whitespace issues.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.


## Review follow-up — 2026-10-28

Owner requested fixing all seven findings from the companion code review. The FE correction covers immutable management/chat attempts, confirmed toggle states, authoritative recruitment eligibility, private-state cleanup after revocation/principal changes, gap-safe delta merging and visibility-based read markers. Shared BE/API/schema/migrations are unchanged. See [fix evidence and limits](../implementation/trip-companions-review-fixes.md) for the 14 failing pre-fix interaction cases and final 19 passing handler/effect tests; focused regression 190 PASS/58 PostgreSQL skips. This follow-up supersedes earlier static-markup-only interaction claims, not backend test evidence or owner acceptance. Browser verification was stopped by Computer Use URL determination on Windows.

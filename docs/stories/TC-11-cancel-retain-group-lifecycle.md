# TC-11 — Hủy chuyến, giữ lịch sử và chat sau hoàn tất

## Status

IMPLEMENTED LOCALLY

## Epic

Approved travel-companions extension, ticket 11.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Hủy chuyến, giữ lịch sử và chat sau hoàn tất

## Outcome

Trạng thái hủy của phần đồng hành, notice và chặn tuyển/gửi tin nguyên tử; giữ lịch sử/membership/deletion guard, ưu tiên hủy hơn hoàn tất mà không giả lập bằng Trip completion.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/11-cancel-retain-group-lifecycle.md).
- Approved travel-companions plan Q12, Q13; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Trạng thái hủy của phần đồng hành, notice và chặn tuyển/gửi tin nguyên tử; giữ lịch sử/membership/deletion guard, ưu tiên hủy hơn hoàn tất mà không giả lập bằng Trip completion.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Terminal companion cancellation appends one SYSTEM notice, blocks future joins/user sends and retains current membership itinerary/history reads and historical delete guard. Normal calendar/manual completion never stops chat; canceled groups remain read-only even after future Trip edits/system notices.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Terminal companion cancellation appends one SYSTEM notice, blocks future joins/user sends and retains current membership itinerary/history reads and historical delete guard. Normal calendar/manual completion never stops chat; canceled groups remain read-only even after future Trip edits/system notices.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Đóng tuyển/gỡ bài không bị biến thành hủy hoặc giải tán; hủy là terminal cho nhóm hiện tại, không tự khôi phục hoặc chuyển sang Trip khác.
- [x] Sau hủy không join/gửi tin người dùng, kể cả từ UI/cursor cũ; hiện hành member vẫn đọc lịch sử, Q6 tiếp tục áp dụng lịch đã lưu và hệ thống có thể phản ánh thay đổi.
- [x] Hoàn tất theo ngày/cờ hiện có không tự khóa chat, đặt TTL 7 ngày hoặc xóa dữ liệu; hủy vẫn giữ chat chỉ đọc.
- [x] Trip từng có thành viên vẫn bị chặn xóa kể cả sau leave/kick/hủy; cancellation và group notice nhất quán khi retry/race với gửi tin.
- [x] Có kiểm tra role/lifecycle/transaction và UI host/member; báo rõ loại hoàn tất/hủy, không mở rộng sang xóa vĩnh viễn hoặc chuyển chủ.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028141000_companion_cancel adds canceledAt and terminal-state constraints/trigger.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC11-cancel-r1. POST /api/trip-companions/:id/cancel accepts only {confirm:true} and Idempotency-Key, returns shared {publicationId}; cancelCompanion service is owner-only with current account/ownership checks before replay and under the same Trip/publication locks as join/send. Terminal canceledAt, recruitment stop, one SYSTEM COMPANION_CANCELED notice, sequence increment and replay result commit atomically. Same/different-key repeats never duplicate notice. No undo or transfer endpoint; database terminal-state trigger rejects clearing/changing canceledAt. Group/management adds optional canceledAt and canSend; history/delta/unread canSend=false after cancel, current valid relations retain history/latest saved itinerary; later authoritative Trip saves may still append SYSTEM notices. USER send/reconcile recheck cancellation before replay and after locks; join/public discovery/detail cannot admit canceled posts. /mine returns CANCELED label. Host removal still revokes members after cancellation; delete history guard persists. Calendar/manual completion alone never gates chat or adds TTL. Client-safe canceled-group/system-message fixtures exported; companionManageResultSchema added for PATCH result. PostgreSQL58 PASS in11 suites, including cancel/join/send race, rollback/replay, terminal DB guard, latest itinerary notice after cancel, normal chat years after completion, observed user/SYSTEM late-commit ordering and account/date/clock/completion lock waits. 23 actual scoped migrations/0 pending/cleanup PASS. Strict backend types PASS (63 entries, unchanged strict ES2017 target); focused fixtures/Trip regressions pass. Development independently verified and final migration applied through guarded Prisma deploy:42 applied/0 pending/0 unfinished,50 constraints/9 indexes/2 companion triggers inspected. No business-data/Production/provider write, FE code modification or application release. Broad regression and combined build results/limits are in final verification receipt; vertical FE/browser acceptance remains separate.

### Frontend Acceptance Evidence (TC-11)
- `apps/web/src/modules/trip-companions/companion-client.ts`:
  - Implemented `cancelCompanionTrip(publicationId, idempotencyKey)` with strict mutation contract handling `SUCCESS`, `UNKNOWN`, and `FAILED` with idempotency retry semantics.
  - Added 2 unit tests in `companion-client.vitest.test.ts` verifying SUCCESS and UNKNOWN/retry flows.
- `apps/web/src/app/trip-companions/companion.css`:
  - Added `.companion-danger-zone` styles and preserved `.companion-danger-button` aesthetic tokens.
- `apps/web/src/components/trip-companions/companion-management-view.tsx`:
  - Implemented terminal cancellation flow in Danger Zone with "Hủy chuyến đồng hành" button (`data-testid="companion-open-cancel-modal-btn"`).
  - Implemented confirmation modal explaining permanent consequences and terminal state with "Xác nhận hủy chuyến" button (`data-testid="companion-confirm-cancel-btn"`).
  - Implemented `companion-management-canceled-banner` with date of cancellation and disabled editing/publishing/recruitment controls when `management.canceledAt` is present.
  - Added 2 unit tests in `companion-management.vitest.test.ts`.
- `apps/web/src/components/trip-companions/companion-group-view.tsx`:
  - Rendered `companion-group-canceled-banner` (`data-testid="companion-group-canceled-banner"`) when `currentGroup.canceledAt` is set, clearly explaining read-only archival of saved itinerary and conversation.
  - Rendered `companion-group-completed-banner` (`data-testid="companion-group-completed-banner"`) when the trip has completed normally based on dates, explaining that group chat and space remain active.
  - Handled `COMPANION_CANCELED` system notice in delta polling to automatically refresh group metadata and transition UI seamlessly.
  - Composer correctly falls back to `companion-chat-readonly-banner` when `!chatHistory.canSend`.
  - Added 2 unit tests in `companion-group.vitest.test.ts`.
- Verification summary:
  - Vitest focused companion suite: 11 test files / 163 tests PASS.
  - PostgreSQL container integration suite (`apps/web/scripts/test-trip-companions-postgres.mjs`): 11 files / 58 tests PASS (including cancel/chat/itinerary tests), 23 migrations, 0 pending, container cleaned up.
  - Strict typecheck: `npm run check-types` 4/4 packages PASS.
  - Production build: `npm run build --workspace web` (53 routes) PASS.
  - Git whitespace inspection: `git diff --check` PASS (0 errors).

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.

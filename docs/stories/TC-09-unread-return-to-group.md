# TC-09 — Dấu chưa đọc và quay lại nhóm có tin mới

## Status

IMPLEMENTED LOCALLY; verified on FE and PostgreSQL integration.

## Epic

Approved travel-companions extension, ticket 09.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Dấu chưa đọc và quay lại nhóm có tin mới

## Outcome

Dấu mốc đọc theo actor/nhóm cho cả host, chỉ tăng theo cursor hợp lệ, số chưa đọc/summary từ dữ liệu authoritative và theo quyền hiện hành.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/09-unread-return-to-group.md).
- Approved travel-companions plan Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Dấu mốc đọc theo actor/nhóm cho cả host, chỉ tăng theo cursor hợp lệ, số chưa đọc/summary từ dữ liệu authoritative và theo quyền hiện hành.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Per-account/group monotonic read sequence including host, with validated committed cursor and current permission. Bounded actor-scoped unread summaries exclude own USER messages; background reads never update a marker.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Per-account/group monotonic read sequence including host, with validated committed cursor and current permission. Bounded actor-scoped unread summaries exclude own USER messages; background reads never update a marker.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Read marker của người này không đổi trạng thái người khác; không lùi cursor, nhận cursor giả tương lai hoặc ghi marker cho nhóm không có quyền.
- [x] Số chưa đọc phản ánh tin thực, không dùng tổng số thành viên hoặc số chỗ; member mới đọc toàn bộ lịch sử nhưng không bị gán read receipt công khai.
- [x] Mở đúng nhóm/tab và cập nhật marker theo phần đã hiển thị; không báo tất cả tin đã đọc chỉ vì background fetch.
- [x] Logout/leave/kick làm mất summary riêng; trạng thái cũ không xuất hiện cho tài khoản khác.
- [x] Có kiểm tra marker concurrency/authorization và UI badge/live status; không hứa thông báo khi web đã đóng, không có read receipt 'ai đã xem'.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028135000_companion_read_marker adds read-marker table/unique/FKs/nonnegative cursor.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC09-unread-r1. POST /api/trip-companions/:id/read strict {sequence:decimal-string} + Idempotency-Key; shared companionReadInputSchema/companionReadResultSchema. Result {publicationId,sequence} is monotonic at commit; stale successful replay does not rewind stored cursor, FE merges monotonically/refetches summary. Current host/member checked before replay and again after account/Trip/publication locks. Sequence0 allowed; positive cursor must exist committed in this group and cannot exceed messageSequence. GET /api/trip-companions/unread uses after publication-ID and raw limit1–50/default50, stable ID keyset; companionUnreadQuerySchema/companionUnreadSchema / CompanionUnread, fixture companionUnreadFixture. Summary items {publicationId,unreadCount,lastReadCursor,highWaterCursor,canSend}, nextCursor. Counts only actual messages above own marker, excluding own USER sends; independent actor scopes include host/current members across dates. GET never writes markers. Only explicitly displayed messages should be marked by FE; current membership/account enforcement removes left/barred/locked/private account data on next request; no public read-receipt API. PostgreSQL43 PASS (2 new marker/concurrency/permission tests + earlier41),21 migrations/0 pending/cleanup PASS; chat/read schema4 PASS; generation PASS. BigInt constructors retain exact values under existing ES2017 target; root typecheck result in runner/final receipt. Development independently verified and marker migration deployed through Prisma with scoped pending check, current receipt under .cache/trip-companions-be.

### Frontend & Vertical Integration Evidence (2026-10-28):
- **Client Methods (`companion-client.ts`)**: Added `fetchCompanionUnread(query)` and `markCompanionRead(publicationId, sequence, idempotencyKey)` with `companionReadInputSchema`, `companionReadResultSchema`, `companionUnreadSchema` verification and typed outcomes.
- **Discovery Cards (`companion-discovery-view.tsx`)**: Polling `fetchCompanionUnread()` every ~15s when page is visible and catching up on `visibilitychange` (`visible`) / `online`. Displays `.companion-unread-badge` (`data-testid="companion-unread-badge-{id}"`) with count on cards having unseen messages, and links CTA directly to `/trip-companions/{id}/group?tab=chat`.
- **Group Chat & Markers (`companion-group-view.tsx`)**: Strictly marks read ONLY for explicitly displayed messages when user is on the chat tab (`activeTab === "chat"`), advancing marker monotonically via `markCompanionRead`. On other tabs (itinerary/members), polls unread summaries without writing markers and displays `.companion-tab-unread-pill` (`data-testid="group-chat-unread-badge"`) on the chat tab button. Switching to chat immediately clears pill and marks displayed messages read.
- **Group Page Deep Link (`group/page.tsx`)**: Reads `searchParams.tab` to respect `?tab=chat` deep links from discovery cards.
- **Aesthetics & CSS (`companion.css`)**: Added `.companion-unread-badge` and `.companion-tab-unread-pill` with clean badge typography and contrast.
- **Unit & Integration Tests**: 46 tests in `companion-client.vitest.test.ts`, 13 tests in `companion-group.vitest.test.ts`, 8 tests in `companion-discovery.vitest.test.ts`. 11 focused test files (156 tests) PASS. Real disposable PostgreSQL 11 files (58 tests) PASS.
- **Workspace Typecheck & Build**: `npm run check-types` 4/4 packages PASS. `npm run build --workspace web` compiled 53 static/dynamic routes cleanly. `git diff --check` reported 0 whitespace errors.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.


## Review follow-up — 2026-10-28

Owner requested fixing all seven findings from the companion code review. The FE correction covers immutable management/chat attempts, confirmed toggle states, authoritative recruitment eligibility, private-state cleanup after revocation/principal changes, gap-safe delta merging and visibility-based read markers. Shared BE/API/schema/migrations are unchanged. See [fix evidence and limits](../implementation/trip-companions-review-fixes.md) for the 14 failing pre-fix interaction cases and final 19 passing handler/effect tests; focused regression 190 PASS/58 PostgreSQL skips. This follow-up supersedes earlier static-markup-only interaction claims, not backend test evidence or owner acceptance. Browser verification was stopped by Computer Use URL determination on Windows.

## Performance follow-up — 2026-10-28

Owner requested API/page loading optimization from the local interaction log. Selected-tab loading, per-render read deduplication, idle polling/unread query elimination and client request coalescing preserve this story's authorization, cursor and confirmed-write contract. See the [audit, paired read-only measurements and verification limits](../performance/companion-loading-2026-10-28.md). Focused tests: 204 PASS; actual disposable PostgreSQL: 58/58 PASS; root types and isolated production build PASS. No new product requirement or deployed-environment acceptance is implied.

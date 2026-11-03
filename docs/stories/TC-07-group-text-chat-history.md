# TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

## Status

IMPLEMENTED LOCALLY; FE and vertical integration VERIFIED.

## Epic

Approved travel-companions extension, ticket 07.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Gửi tin văn bản/link và đọc lịch sử nhóm

## Outcome

Tin nhóm có thứ tự/cursor nhất quán, phân trang, kiểm tra membership hiện hành và ghi idempotent; quản lý authorship/system-kind, không tạo cuộc hội thoại AI hoặc DM.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/07-group-text-chat-history.md).
- Approved travel-companions plan Q4, Q8, Q9; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Tin nhóm có thứ tự/cursor nhất quán, phân trang, kiểm tra membership hiện hành và ghi idempotent; quản lý authorship/system-kind, không tạo cuộc hội thoại AI hoặc DM.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Text-only user messages with trusted authorship, idempotent send and full paginated history for current members. Per-publication transactional messageSequence allocated only while holding Trip/publication row locks; committed sequence is a safe high-water cut and rollback consumes no committed position.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Text-only user messages with trusted authorship, idempotent send and full paginated history for current members. Per-publication transactional messageSequence allocated only while holding Trip/publication row locks; committed sequence is a safe high-water cut and rollback consumes no committed position.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Chỉ host/member hợp lệ đọc/gửi trong đúng nhóm; actor gửi lấy từ session, không từ body. Người ngoài không biết nội dung qua ID hoặc phân trang.
- [x] Thành viên mới đọc được toàn bộ lịch sử theo Q9; trang giới thiệu đã thông báo quy tắc trước join.
- [x] Chỉ văn bản/link; escape nội dung, không render HTML tùy ý hoặc thêm ảnh/tệp/voice/call/đã xem/đang nhập.
- [x] Tin chỉ được gọi đã gửi khi DB xác nhận. Retry cùng payload/key không tạo hai tin; input giữ được khi chưa xác nhận/thất bại.
- [x] Có thứ tự đọc không bỏ sót tin do hai transaction commit lệch nhau; trang lịch sử dài giữ được vị trí khi tải thêm.
- [x] Có kiểm tra service/route/DB cho membership, gửi đồng thời và replay, cùng UI gửi/đọc/trạng thái/lịch sử.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028134000_companion_chat adds message counter/table/unique/FKs and guards historical messages from Trip deletion.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC07-chat-r1. GET/POST /api/trip-companions/:id/messages. POST strict body {text:string}, trimmed 1–4000 chars (technical bound), Idempotency-Key; result {publicationId,messageId,sequence:string}. Authorship from current trusted session; body author/kind rejected. Shared companion-chat-contract.ts exports send/message/result/history/query schemas and CompanionMessage/CompanionHistory; companion-chat-fixtures.ts has client-safe message/history examples. GET query before (exclusive decimal bigint string) and limit raw string 1–100/default30; response {publicationId,items,olderCursor,highWaterCursor,canSend}. Page messages are ascending for rendering; request olderCursor as before to fetch prior history. New members can read all prior pages; current group permission/account required each request and before send replay. Text/links remain plain strings, render as escaped text and safe HTTP(S) links in FE, never HTML. Public APIs have no chat projection. Ordering proof: every sender holds Trip then publication UPDATE locks until commit, increments transactional per-group bigint counter and inserts message/result in same transaction. A later sender cannot allocate/commit a higher position until prior transaction commits/rolls back. RepeatableRead history reads committed counter and messages <= that cut. Thus commit-late writes cannot appear behind a consumed cursor; timestamps/cuid are not ordering. Rollback consumes no committed sequence. SAME payload/key replay yields same IDs/sequence; UNKNOWN retains exact payload/key. PostgreSQL 39 PASS (4 new chat concurrency/history/replay/lost-ack/rollback/held-commit cases + prior35), 20 scoped migrations/0 pending/cleanup PASS; schema/HTTP/Trip regression 22 PASS after fixing regex-to-BigInt parser pipeline (invalid decimals now fail validation, no exception). Prisma generation and root types recorded by runner. Migration 20261028134000_companion_chat adds counter/messages/constraints and extends service/DB deletion guard to retained host-only messages; no TTL. Development scoped rollout verified by endpoint+SQL identity; current redacted ledger receipt in .cache/trip-companions-be. FE/integration OPEN; final broad build remains separate.

### Frontend & Vertical Integration Evidence (2026-10-28)

- **Frontend Implementation:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`:
    - `fetchCompanionMessages(publicationId, query)` calls `GET /api/trip-companions/:id/messages` with optional `before` and `limit`.
    - `sendCompanionMessage(publicationId, text, idempotencyKey)` sends idempotent mutation to `POST /api/trip-companions/:id/messages` using `sendIdempotentMutation`.
  - `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Prefetches `initialHistory` server-side via `getCompanionHistory(reqHeaders, id, {}, tripReadDependencies)` and passes to `CompanionGroupView`.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Tab 3: "Trò chuyện nhóm" (`tab=chat`, icon `MessageSquare`, testid `group-tab-chat`).
    - Transcript rendering: displays sender names, avatar initials, timestamps `formatMessageTimeVi(createdAt)`, bubbles, and safe HTTP/HTTPS link parsing via `renderSafeMessageContent(text)` with `target="_blank"` and `rel="noopener noreferrer"`. No arbitrary HTML injection.
    - System notices for `kind === "SYSTEM"` (`ITINERARY_CHANGED` with "Xem lịch trình chi tiết" action button, and `COMPANION_CANCELED`).
    - History pagination using `olderCursor` via `handleLoadOlder` ("Tải tin nhắn cũ hơn").
    - Message composer: textarea + send button (`companion-chat-input`, `companion-chat-send-btn`) with automatic idempotency key generation.
    - Safe `UNKNOWN` handling with retry button preserving identical key and payload.
    - Read-only banner (`data-testid="companion-chat-readonly-banner"`) and suppression of composer when `canSend === false`.
  - `apps/web/src/app/trip-companions/companion.css`: Full responsive CSS for chat container, cards, bubbles, avatars, links, system notices, composer, and buttons.
- **Verification:**
  - `companion-client.vitest.test.ts`: 37/37 tests PASS (added tests for `fetchCompanionMessages` and `sendCompanionMessage`).
  - `companion-group.vitest.test.ts`: 11/11 tests PASS (added tests for chat tab, safe links, system notices, and read-only banner).
  - Vitest suite: 6 test files, 80 tests PASS.
  - PostgreSQL disposable integration test: 11 files, 58 tests PASS (including 4 PostgreSQL chat integration tests).
  - `npm run check-types`: 4/4 packages PASS.
  - `npm run build --workspace web`: 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

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

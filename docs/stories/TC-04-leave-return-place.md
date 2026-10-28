# TC-04 — Tự rời nhóm và trả chỗ

## Status

IMPLEMENTED LOCALLY; verified across BE, FE, and integration.

## Epic

Approved travel-companions extension, ticket 04.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Tự rời nhóm và trả chỗ

## Outcome

Rời idempotent, thu hồi membership ở mọi reader/writer, trả chỗ nguyên tử, giữ lịch sử quan hệ và không biến hết chỗ thành cờ đóng tuyển của host.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/04-leave-return-place.md).
- Approved travel-companions plan Q5, Q7, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Rời idempotent, thu hồi membership ở mọi reader/writer, trả chỗ nguyên tử, giữ lịch sử quan hệ và không biến hết chỗ thành cờ đóng tuyển của host.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Membership state LEFT; leave/rejoin under the same account/Trip/publication lock order. Preserve historical flag and original relationship row; leave revokes current readers immediately on next request and returns exactly one place.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Membership state LEFT; leave/rejoin under the same account/Trip/publication lock order. Preserve historical flag and original relationship row; leave revokes current readers immediately on next request and returns exactly one place.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Rời thành công thu hồi quyền đọc lịch riêng và mọi quyền nhóm ở request kế tiếp; không chỉ ẩn nút trên client.
- [x] Chỗ được trả đúng một lần; chỉ nhận người mới nếu bài còn public, host chưa đóng tuyển và chưa đến ngày đi.
- [x] Tự rời có thể vào lại khi còn đủ điều kiện; trạng thái bị chặn không được lợi dụng cùng luồng này để vào lại.
- [x] Không xóa lịch sử tham gia hoặc nội dung nhóm; khi chat được bổ sung, tin đã gửi vẫn thuộc lịch sử nhóm.
- [x] Host không tự rời như thành viên; không tạo thao tác đổi chủ chuyến. Bao phủ race join/leave, retry và UI clear-on-revocation.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028131000_companion_leave adds LEFT to membership state.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC04-leave-r1. POST /api/trip-companions/:id/leave uses shared strict {confirm:true}, Idempotency-Key, and {publicationId} confirmed result. companion-group-service.ts exports leaveCompanion; existing joinCompanion now reactivates the same LEFT row under locks. Historical everHadMembers and joinedAt remain intact. Host leave => COMPANION_HOST_CANNOT_LEAVE/409; no prior member/current barred relation => 403, Guest 401. ACTIVE -> LEFT once; current group readers/joined list revoke on next request, places count only ACTIVE rows. Leave allowed after departure; rejoin still requires future/open/available. Same-key replay never removes a later rejoin or reactivates a departed membership; reread group after replay. Migration 20261028131000_companion_leave adds LEFT. Evidence: disposable PostgreSQL 29 PASS (3 new leave/rejoin/race + prior 26), 17 migrations/0 pending/cleanup PASS; group schema/HTTP boundary 2 PASS and prior focused 70 PASS; Prisma generation PASS, root types recorded by current runner; diff check PASS.

### Bằng chứng FE và tích hợp (Hoàn tất 2026-10-28)

- **Client & Mutation:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: Hàm `leaveCompanionTrip` gửi mutation `{ confirm: true }` với `Idempotency-Key` tới `POST /api/trip-companions/:id/leave`. Phân biệt `SUCCESS`, `UNKNOWN` (giữ nguyên key để thử lại an toàn) và `FAILED`.
- **UI & Views:**
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Ẩn nút rời khỏi giao diện của Host. Chỉ hiển thị nút "Rời nhóm chuyến đi" cho Member.
    - Modal xác nhận rời nhóm (`data-testid="companion-confirm-leave-btn"`) giải thích chi tiết: mất quyền xem lịch trình/thảo luận, trả 1 chỗ tìm thêm, và tin nhắn đã gửi vẫn được bảo toàn trong lịch sử nhóm.
    - Điều hướng về `/trip-companions/:id` sau khi rời thành công, xóa sạch dữ liệu private khỏi view. Cho phép tham gia lại nếu chuyến còn mở tuyển và còn chỗ.
  - `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Bắt lỗi 403 khi bị thu hồi quyền và tự động redirect về trang công khai `/trip-companions/:id`.
- **Automated Verification:**
  - Unit tests: `companion-group.vitest.test.ts` (5 tests) PASS, `companion-client.vitest.test.ts` (27 tests) PASS.
  - PostgreSQL disposable integration tests: 11/11 files (50/50 tests) PASS, bao gồm `companion-leave.postgres.integration.vitest.test.ts` (3 tests).
  - Web production build: 53 static pages compiled successfully.
  - Typecheck: 4/4 packages PASS.
  - `git diff --check`: 0 lỗi.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.

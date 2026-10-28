# TC-05 — Quản lý số chỗ, đóng tuyển và gỡ công khai

## Status

IMPLEMENTED LOCALLY; verified across BE, FE, and integration.

## Epic

Approved travel-companions extension, ticket 05.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Quản lý số chỗ, đóng tuyển và gỡ công khai

## Outcome

Mutation host-only, capacity không dưới số đang tham gia, tách visibility/manual recruitment/full/điều kiện ngày, bảo toàn một bài/một nhóm và kiểm tra đồng thời với join.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/05-manage-recruitment-capacity.md).
- Approved travel-companions plan Q5, Q7, Q12, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Mutation host-only, capacity không dưới số đang tham gia, tách visibility/manual recruitment/full/điều kiện ngày, bảo toàn một bài/một nhóm và kiểm tra đồng thời với join.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Distinct publication visibility PUBLIC/WITHDRAWN and manual recruitmentOpen. Owner management read/update with immutable identity, capacity lower bound from current members and join race serialization. Public discovery/read honors withdrawal; hosted management collection includes own past/withdrawn posts.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Distinct publication visibility PUBLIC/WITHDRAWN and manual recruitmentOpen. Owner management read/update with immutable identity, capacity lower bound from current members and join race serialization. Public discovery/read honors withdrawal; hosted management collection includes own past/withdrawn posts.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Không giảm số chỗ dưới số tài khoản đang tham gia; tăng/giảm cạnh tranh với join không làm quá chỗ.
- [x] Đóng tuyển và gỡ công khai dừng người mới vào; thành viên hiện hành giữ quyền nhóm, không tạo nhóm khác khi mở/đăng lại.
- [x] Chỉ mở/đăng lại trước ngày đi và khi chuyến chưa hoàn tất/hủy, đáp ứng các điều kiện nguồn.
- [x] Đủ chỗ là trạng thái từ số thành viên, không tự ghi thành đóng tuyển thủ công. Host và thành viên thấy đúng quyền/hành động.
- [x] Mutation có quyền, idempotency, xung đột và UI pending/FAILED/UNKNOWN được kiểm tra; không dùng một công tắc cho cả đóng tuyển và hủy.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028132000_companion_recruitment adds visibility/recruitmentOpen.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC05-management-r1. GET/PATCH /api/trip-companions/:id/management owner-only. Shared companion-management-contract.ts exports companionManageInputSchema, companionManageSchema / CompanionManage; companion-management-fixtures.ts exports companionManageFixture. GET returns private tripId, current draft/Trip/imageOptions, visibility PUBLIC/WITHDRAWN, recruitmentOpen, managementRevision, activeMemberCount and canReopen. PATCH body is full CompanionDraft plus {confirm:true,baseRevision:number,visibility,recruitmentOpen}; key hash includes full validated payload and target. SUCCESS {publicationId,managementRevision}; reread GET after replay. Same group lock order; revision mismatch 409 COMPANION_REVISION_CONFLICT; capacity below ACTIVE count 409 COMPANION_CAPACITY_TOO_SMALL; invalid image 422. Re-publication/re-opening require future date and no manual completion. Close/withdraw never revoke members or create a new group. Additive optional recruitmentStatus on PublicCompanion: OPEN/FULL/CLOSED/DEPARTED/COMPLETED/WITHDRAWN; existing clients importing shared schema remain compatible, fixtures updated. Public collection/detail excludes withdrawn; closed/full public posts remain discoverable. DELTA to TC02 r1: /mine now includes own past/completed/withdrawn posts for management; /joined retains current groups across dates. Filters/cursor/envelopes unchanged. Migration 20261028132000_companion_recruitment adds visibility/recruitmentOpen/revision. Tests: PostgreSQL 32 PASS (3 new management/capacity-race/revision + 29 prior), 18 scoped migrations/0 pending/cleanup PASS; 49 focused schema/service/HTTP PASS; root types 4/4, Prisma generation and whitespace PASS.

### Bằng chứng FE và tích hợp (Hoàn tất 2026-10-28)

- **Client & Mutation:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: `fetchCompanionManagement` và `updateCompanionManagement` gửi mutation PATCH với `Idempotency-Key` và payload validated theo `companionManageInputSchema`. Phân biệt `SUCCESS`, `UNKNOWN` (cho phép thử lại an toàn cùng key) và `FAILED`.
- **UI & Views:**
  - `apps/web/src/components/trip-companions/companion-management-view.tsx` & `/trip-companions/[id]/manage`:
    - Giao diện quản lý toàn diện dành riêng cho chủ chuyến: tiêu đề (1–200 ký tự), giới thiệu (1–4000 ký tự), số chỗ tìm thêm (kiểm tra chặn giảm dưới số thành viên đã tham gia), và lưới chọn ảnh điểm đến.
    - Phân tách rõ ràng giữa quản lý bài tuyển và chỉnh sửa lịch trình gốc (banner hướng dẫn kèm liên kết trực tiếp tới `/trips/:tripId/edit`).
    - Các nút điều khiển trạng thái riêng biệt: Đóng / Mở tuyển và Gỡ bài / Công khai lại. Vô hiệu hóa kèm thông báo giải thích từ server khi chuyến đi đã qua ngày khởi hành hoặc đã kết thúc (`!canReopen`).
    - Xử lý lỗi máy chủ: `COMPANION_REVISION_CONFLICT` (thông báo xung đột phiên bản, yêu cầu tải lại) và `COMPANION_CAPACITY_TOO_SMALL`.
  - `companion-discovery-view.tsx`: Bổ sung nút "Quản lý" tại tab "Chuyến tôi đăng" (`tab=mine`); hiển thị badge `recruitmentStatus` trên thẻ bài đăng cho các trạng thái không phải OPEN.
  - `companion-group-view.tsx`: Bổ sung liên kết "Quản lý tuyển" cho Host tại action bar của header nhóm.
- **Automated Verification:**
  - Unit tests: `companion-management.vitest.test.ts` (4 tests) PASS, `companion-client.vitest.test.ts` (29 tests) PASS.
  - Focused Vitest: 13 files / 151 passed, 58 skipped.
  - PostgreSQL disposable integration tests: 11/11 files (50/50 tests) PASS, bao gồm `companion-management.postgres.integration.vitest.test.ts` (3 tests).
  - Web production build: 53 static pages compiled successfully, route `/trip-companions/[id]/manage` được nhận diện đầy đủ.
  - Typecheck: 4/4 packages PASS.
  - `git diff --check`: 0 lỗi.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.


## Review follow-up — 2026-10-28

Owner requested fixing all seven findings from the companion code review. The FE correction covers immutable management/chat attempts, confirmed toggle states, authoritative recruitment eligibility, private-state cleanup after revocation/principal changes, gap-safe delta merging and visibility-based read markers. Shared BE/API/schema/migrations are unchanged. See [fix evidence and limits](../implementation/trip-companions-review-fixes.md) for the 14 failing pre-fix interaction cases and final 19 passing handler/effect tests; focused regression 190 PASS/58 PostgreSQL skips. This follow-up supersedes earlier static-markup-only interaction claims, not backend test evidence or owner acceptance. Browser verification was stopped by Computer Use URL determination on Windows.

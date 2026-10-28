# TC-06 — Chủ chuyến loại và chặn thành viên

## Status

IMPLEMENTED LOCALLY; verified across BE, FE, and integration.

## Epic

Approved travel-companions extension, ticket 06.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Chủ chuyến loại và chặn thành viên

## Outcome

Thao tác host-only nguyên tử trên membership/chỗ, cấm target host, lưu trạng thái chặn bền và áp dụng ở join/reader/writer. Không thêm quyền Admin đọc riêng.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/06-remove-ban-member.md).
- Approved travel-companions plan Q10, Q11; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Thao tác host-only nguyên tử trên membership/chỗ, cấm target host, lưu trạng thái chặn bền và áp dụng ở join/reader/writer. Không thêm quyền Admin đọc riêng.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Permanent BANNED state on the existing membership row; host removal/ban returns a place once and denies all current group reads/rejoin including old-key replay. Active-member reader exposes only group-safe identity, never account contacts.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Permanent BANNED state on the existing membership row; host removal/ban returns a place once and denies all current group reads/rejoin including old-key replay. Active-member reader exposes only group-safe identity, never account contacts.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Chỉ host loại/chặn thành viên khác; người ngoài, member và Admin không sở hữu không có quyền đặc biệt.
- [x] Tài khoản bị loại mất quyền nhóm và không tạo membership khác hoặc dùng retry/rejoin để vượt chặn.
- [x] Trả chỗ đúng một lần và giữ lịch sử quan hệ/tin nhóm; host không tự loại mình hoặc chuyển chủ qua thao tác này.
- [x] Join/loại đồng thời và retry UNKNOWN giữ được trạng thái đúng, không âm thầm tự gỡ chặn.
- [x] Có kiểm tra hai/ba actor qua service/route và UI phản ánh mất quyền; không mở rộng sang CMS báo cáo, DM hoặc gỡ chặn chưa được yêu cầu.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028133000_companion_ban adds BANNED membership state.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC06-members-r1. GET /api/trip-companions/:id/members returns companionMembersSchema / CompanionMembers from companion-members-contract.ts, fixture companionMembersFixture. It contains host and current ACTIVE members only, with group-safe userId/displayName/avatar and joinedAt; no email/contact/account status. Current host/member required; outsider/foreign Admin/left/barred/locked denied. POST /api/trip-companions/:id/members/:userId/ban uses {confirm:true}, target path ID, Idempotency-Key; result {publicationId}. Service getCompanionMembers/banCompanionMember in companion-members-service.ts. Host-only permanent BANNED on existing relationship (including a previously LEFT relation), no unban route; host target 409, missing relation 404. Join checks BANNED both before replay and after row locks, so an original successful join key cannot bypass removal. Capacity counts ACTIVE only, removal returns place once; current group/member readers deny the barred account. Other members retain access and relation/history never deleted. Migration 20261028133000_companion_ban adds state. PostgreSQL 35 PASS (3 new ban/rejoin-race/authorization + 32 earlier), 19 scoped migrations/0 pending/cleanup PASS; root typecheck 4/4, schema/HTTP fixture suite 4 PASS, Prisma generation PASS.

### Bằng chứng FE và tích hợp (Hoàn tất 2026-10-28)

- **Client & Mutations (`companion-client.ts`):**
  - Thêm `fetchCompanionMembers(publicationId)` đọc `GET /api/trip-companions/:id/members`, parse theo `companionMembersSchema`.
  - Thêm `banCompanionMember(publicationId, userId, idempotencyKey)` gửi `POST /api/trip-companions/:id/members/:userId/ban` với `{ confirm: true }` và `Idempotency-Key`. Parse kết quả qua `companionGroupMutationSchema`.
  - Phân nhánh rõ ràng `SUCCESS`, `UNKNOWN` (cho phép thử lại an toàn cùng key) và `FAILED`.
- **Giao diện không gian nhóm (`companion-group-view.tsx` & `/trip-companions/[id]/group`):**
  - Server Component prefetch `initialMembers` qua `getCompanionMembers` để render tức thì danh sách thành viên trên trang `/trip-companions/:id/group`.
  - Tab "Thành viên":
    - Thẻ chủ chuyến (Host Card) hiển thị huy hiệu "Chủ chuyến", tên, avatar đại diện.
    - Danh sách thành viên tham gia (`companion-member-list`): hiển thị tên, avatar, ngày tham gia (`Tham gia: dd/mm/yyyy`).
    - Nút "Loại khỏi nhóm" (`companion-ban-button`) chỉ hiển thị cho Chủ chuyến trên thẻ của thành viên (hoàn toàn không hiển thị trên thẻ chủ chuyến).
    - Thành viên thông thường chỉ thấy thông tin danh sách và nút "Rời nhóm chuyến đi", không thấy nút loại/chặn.
    - Modal xác nhận loại thành viên (`companion-ban-modal`): giải thích minh bạch 3 hậu quả (chặn vĩnh viễn không thể xin vào lại, hoàn trả 1 chỗ tìm thêm, bảo toàn lịch sử tin nhắn đã gửi).
    - Hỗ trợ nút "Thử lại loại thành viên" khi gặp `UNKNOWN` với cùng idempotency key.
    - Cập nhật số lượng thành viên tức thì khi hoàn tất loại thành viên.
- **Kiểm chứng tự động:**
  - Unit tests: `companion-group.vitest.test.ts` (6 tests) PASS, `companion-client.vitest.test.ts` (33 tests) PASS.
  - Focused Vitest: 11 files / 136 passed, 58 skipped.
  - PostgreSQL disposable integration runner: 11/11 files (58/58 tests) PASS, bao gồm `companion-ban.postgres.integration.vitest.test.ts` (3 tests) trên container PostgreSQL 16 thật với 23 migrations applied, 0 pending, dọn dẹp container thành công.
  - Root typecheck: `npm run check-types` — 4/4 packages PASS.
  - Production build: `npm run build --workspace web` — Compiled successfully, 53 static/dynamic routes prerendered.
  - `git diff --check`: 0 lỗi.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.

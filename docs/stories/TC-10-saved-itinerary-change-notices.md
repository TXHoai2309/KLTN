# TC-10 — Đổi lịch đã lưu và thông báo nhất quán trong nhóm

## Status

IMPLEMENTED LOCALLY; verified on FE and PostgreSQL integration.

## Epic

Approved travel-companions extension, ticket 10.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Đổi lịch đã lưu và thông báo nhất quán trong nhóm

## Outcome

Tích hợp Trip edit/confirmed-save transaction với group revision/system message, giữ owner/Validator/confirmation và chống event trùng khi replay. Cập nhật public projection an toàn.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/10-saved-itinerary-change-notices.md).
- Approved travel-companions plan Q1, Q6, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Tích hợp Trip edit/confirmed-save transaction với group revision/system message, giữ owner/Validator/confirmation và chống event trùng khi replay. Cập nhật public projection an toàn.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Atomic officially saved itinerary revision and SYSTEM notice through the existing confirmed applyEdit MANUAL/AI/IN_TRIP persistence seam. Compare semantic date/destination/time snapshots; unchanged content has no group event. Shared message counter/locks order both user and system messages. Preserve existing owner, Validator, confirmation and completed-visit checks.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Atomic officially saved itinerary revision and SYSTEM notice through the existing confirmed applyEdit MANUAL/AI/IN_TRIP persistence seam. Compare semantic date/destination/time snapshots; unchanged content has no group event. Shared message counter/locks order both user and system messages. Preserve existing owner, Validator, confirmation and completed-visit checks.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Chỉ lịch chính thức đã lưu thành công làm đổi revision và tạo notice; preview, FAILED, hủy chỉnh hoặc proposal AI chưa lưu không phát tin đã đổi.
- [x] Trip update/revision/notice nhất quán trong một transaction; replay không thêm notice trùng hoặc ghi lịch hai lần.
- [x] Thành viên đọc lịch mới nhất mà vẫn không có quyền edit; không thêm xác nhận toàn nhóm hoặc ghi đè kiểm tra Validator.
- [x] Đổi ngày ảnh hưởng điều kiện nhận người theo ngày Việt Nam và public allowlist; không lộ yêu cầu cá nhân/AI history vào notice công khai.
- [x] Có kiểm tra transaction rollback/replay và UI xem lịch từ notice; completed visits vẫn theo quy tắc Trip hiện tại.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

20261028140000_companion_itinerary_revision adds group revision, SYSTEM message kind, nullable author and validated notice JSON shape.

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC10-notice-r1. Existing confirmed applyEdit persistence seam now calls recordCompanionItineraryChange from companion-itinerary-notice.ts inside the same Trip CAS/itinerary/idempotency transaction, after final day/visit writes. Source audit found this is the authoritative existing-trip MANUAL/AI/IN_TRIP write seam; new Trip Save has no publication yet, completion only updates its own timestamp. Current editor intentionally keeps Trip date/duration/transport immutable; this ticket does not add a metadata-edit bypass. Semantic comparison ignores regenerated visit IDs and checks dates/destinations/time-duration: unchanged content, preview, canceled/unconfirmed or FAILED proposals create no notice. Publication itineraryRevision and shared messageSequence increment atomically with SYSTEM message, so rollback/replay cannot leave a new schedule without its notice or duplicate it. Existing owner, Validator, explicit confirmation and completed-visit checks remain intact. No new UI endpoint; history/delta now accept additive SYSTEM union {author:null,notice:{type:ITINERARY_CHANGED,revision,changes:{dates,destinations,times}}}; text is generic and omits contact/AI/hidden destination names. Group reader adds optional itineraryRevision; unread includes SYSTEM notices for host/member. Shared companionSystemNoticeSchema and CompanionMessage union remain client-safe; FE must branch by kind and reread /group for latest itinerary. Migration 20261028140000_companion_itinerary_revision adds revision, SYSTEM kind, nullable author and notice/authorship constraint. Evidence: PostgreSQL46 PASS (3 actual confirmed MANUAL/IN_TRIP/no-op/rollback/replay cases + earlier43),22 scoped migrations/0 pending/cleanup PASS; affected apply-edit/US32/US33/US37/schema regression65 PASS. Strict backend source typecheck separated from stale concurrent Next generated artifacts; final combined build/root check still OPEN. Development scoped migration deploy verified separately; no Production/provider/FE changes.

### Frontend & Vertical Integration Evidence (2026-10-28):
- **Notice Rendering (`companion-group-view.tsx`)**: SYSTEM message pills distinguish system notices from user messages. For `ITINERARY_CHANGED`, renders change tags (`.companion-notice-tag`: Đổi ngày, Đổi điểm, Đổi giờ) derived from `notice.changes` and an action button "Xem lịch trình chi tiết" (`data-testid="companion-chat-view-itinerary-btn"`).
- **Dynamic Itinerary Refetch (`companion-group-view.tsx`)**: Clicking "Xem lịch trình chi tiết" or receiving delta items with `ITINERARY_CHANGED` re-fetches `/api/trip-companions/:id/group` via `fetchCompanionGroup`, seamlessly updating `currentGroup.itinerary` and `currentGroup.itineraryRevision` without a hard reload.
- **Revision Badge & Verification (`companion.css`, `companion-group.vitest.test.ts`)**: The itinerary banner displays the authoritative version badge `(Bản cập nhật #{revision})`. 14 unit tests in `companion-group.vitest.test.ts` verify notice text, tags, and revision rendering.
- **Tests & Builds**: Vitest focused suite (11 files / 157 tests PASS). PostgreSQL integration suite (11 files / 58 tests PASS, including 4 notice/revision tests in `companion-notice.postgres.integration.vitest.test.ts`). Root typecheck (`npm run check-types`) 4/4 packages PASS. Next.js production build (`npm run build --workspace web`) 53 routes compiled cleanly. `git diff --check` reported 0 whitespace errors.

## Open Questions

None blocking; Q1–Q17 already approved.

## Handoff Notes

BE READY FOR FE only after evidence. FE/integration remain OPEN until their own receipts. No automatic chat dispatch or owner ACCEPTED status.


### Final backend receipt — 2026-10-28

All backend milestones through TC-11 are ready. Final actual PostgreSQL 58/58; focused regression 340 PASS/59 opt-in skips; shared idempotency 4/4, strict backend types (63 entries), root types (4/4), 53-page production build and localhost no-store/auth smoke (13/13) PASS. Development 42 applied/0 pending/0 unfinished. Wider regression has five failures in thirteen unchanged HEAD baseline files; exact failures, source comparison, migrations/checksums, commands and limits are in [final verification](../implementation/trip-companions-backend-verification.md). Prior step receipts remain historical; received FE receipts are preserved, and BE does not certify remaining FE/browser/owner acceptance. No Production/provider/business-data write, FE source edit, commit/push/merge/application deployment or chat dispatch.

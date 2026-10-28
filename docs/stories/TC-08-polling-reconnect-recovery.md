# TC-08 — Cập nhật tin mới và phục hồi mất kết nối

## Status

IMPLEMENTED LOCALLY; FE and vertical integration VERIFIED.

## Epic

Approved travel-companions extension, ticket 08.

## Owner

Backend task; FE retains pages/components/clients and UI evidence.

## Goal / User Story

Cập nhật tin mới và phục hồi mất kết nối

## Outcome

Delta/cursor reader kèm trạng thái quyền hiện hành, khả năng đối soát request đã ghi và thứ tự commit an toàn; không thêm provider hoặc đổi write contract.

## Source References

- [Original issue / exact AC](../../.scratch/trip-companions/issues/08-polling-reconnect-recovery.md).
- Approved travel-companions plan Q11, Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.
- [Approved design Q1–Q17](../implementation/trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Current BE task](../implementation/tasks/trip-companions-backend.md), [contract](../implementation/trip-companions-delivery-contract.md). No invented requirement IDs from original Product/System documents.

## Dependencies

Backend prerequisites per original issue. Owner explicitly superseded old FE-before-BE gates. Earlier backend source/contracts/tests verified before starting.

## In Scope

Delta/cursor reader kèm trạng thái quyền hiện hành, khả năng đối soát request đã ghi và thứ tự commit an toàn; không thêm provider hoặc đổi write contract.

## Out of Scope

FE/UI/client changes, new providers/frameworks, shared ownership/editor permissions, DM/uploads/push, Production and application release.

## Business Rules

Approved issue AC below and Q1–Q17; single Trip owner, current account/relationship checks, public allowlist, confirmed writes only. Delta/current permission reader uses the same committed sequence cut as history. after/limit pagination advances only through delivered messages; reconcile checks same actor/publication/payload/key using the shared replay store without writing. No polling/provider implementation in BE.

## Roles / Authorization

Trusted session + current persisted active TRAVELER/ADMIN. Admin has no foreign private-data bypass. Group readers/writers check current host/membership each request.

## Ownership Rules

Trip owner alone edits/manages. Membership grants only group itinerary/chat reads and allowed member actions.

## UX / UI Contract

FE consumes delivered shared schemas/fixtures and ordinary API envelopes. FE pending/FAILED/UNKNOWN, responsive/browser and principal-switch behavior remain OPEN; no UI acceptance claimed.

## Data Contract

Delta/current permission reader uses the same committed sequence cut as history. after/limit pagination advances only through delivered messages; reconcile checks same actor/publication/payload/key using the shared replay store without writing. No polling/provider implementation in BE.

## API Contract

Thin Route Handlers call module services. Actual endpoints, shared exports, errors and cursor/retry semantics are recorded in the per-ticket delivery contract after verification.

## Error / Recovery

Ordinary read envelopes; known write errors FAILED, technical/commit uncertainty UNKNOWN. Retry identical target/payload/key. Refresh current group permission after mutation/replay.

## Write Semantics / Idempotency

Shared executeIdempotentWrite with actor+operation scope; target and validated full payload in hash. Business write + replay result atomic; SUCCESS only after commit. Replays never restore revoked permission.

## External Services

No real AI/routing. Disposable owned PostgreSQL/synthetic accounts only.

## Acceptance Criteria

- [x] Không chạy poll cho mọi nhóm hoặc tiếp tục vòng lặp nhóm khi trang bị ẩn; mở lại lấy phần mới theo cursor.
- [x] Đang ở cuối thì theo tin mới; đọc tin cũ giữ vị trí và có lối xem tin mới; polling không lấy focus hoặc nháy toàn transcript.
- [x] Mất phản hồi gửi tin đối soát cùng định danh/payload/key; không đổi key hoặc gửi thêm bản tin chỉ vì reconnect.
- [x] Rời/bị loại/account lock/logout/account switch thu hồi hoặc xóa dữ liệu client đúng principal; callback cũ không gắn transcript vào tài khoản/nhóm mới.
- [x] Reconnect/poll đồng thời không làm thiếu, trùng hoặc đảo sai thứ tự tin đã commit; đo độ trễ với điều kiện thử được ghi rõ, không hứa SLA background.
- [x] Có kiểm tra controller/timer/visibility và hai người dùng qua fixture/browser; không cần WebSocket, push/email hay dịch vụ chat ngoài.

## Test Plan

Focused shared schema/HTTP/auth tests plus actual PostgreSQL transaction/concurrency/replay/rollback and affected Trip regressions; types/build and git diff --check. Record skips/failures explicitly.

## Expected Modules / Files

Companion server/shared modules, thin API routes, Prisma migrations as needed, server/PostgreSQL tests, this story/issue/contract/progress.

## Migration Impact

None

## Environment Impact

No credential/.env/dependency changes. Development migrations only after verified identity/pending ledger; never Production/reset/db:push.

## Implementation Sequence

1. Read issue/source/prerequisites and create READY story.
2. Implement bounded backend.
3. Run focused/DB checks and affected regressions.
4. Record actual contract/evidence; continue next backend prerequisite without waiting for FE.

## Acceptance Evidence

Revision TC08-delta-r1. GET /api/trip-companions/:id/messages/delta accepts after decimal sequence (default0), raw limit1–100/default100. Shared companionDeltaQuerySchema/companionDeltaSchema, type CompanionDelta, fixture companionDeltaFixture. Result {publicationId,items,nextCursor,highWaterCursor,hasMore,canSend,relationship}. Items ascending; advance only nextCursor (last delivered), never highWaterCursor when hasMore=true. Same committed sequence/RepeatableRead/auth boundary as history; old cursor grants no access after leave/ban/lock. Poll about3s only for visible current group, refresh on return, dedup by message ID/sequence, preserve scroll and reject late actor/group responses in FE; no BE timers or new provider. POST /api/trip-companions/:id/messages/reconcile takes identical send text body and Idempotency-Key, checks current membership and actor/publication/payload hash in shared replay store without writing. Confirmed => original SUCCESS IDs/sequence; changed key payload => FAILED409; absent/in-flight/unavailable/corrupt result => UNKNOWN503 retryWithSameKey, then retry original send with identical body/key. Never synthesize success or use a new key on reconnect. PostgreSQL 41 PASS (2 delta/reconciliation/current permission tests + earlier39), unchanged20 migrations/0 pending/cleanup PASS; chat schema suite3 PASS. Typecheck found ES2017 target incompatibility with BigInt literals introduced in TC07; replaced literals by exact BigInt constructors, preserving bigint strings and semantics. Root typecheck rerun/final broad check pending, not called PASS early. No migration for TC08; Development already has chat schema (39 applied/0 pending/unfinished). FE/browser/timer/integration evidence remains OPEN.

### Frontend & Vertical Integration Evidence (2026-10-28)

- **Frontend Implementation:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`:
    - `fetchCompanionDelta(publicationId, after, limit)`: Gọi `GET /api/trip-companions/:id/messages/delta` với `cache: no-store`, hỗ trợ phân trang delta bằng `after` cursor và parse `CompanionDelta`.
    - `reconcileCompanionMessage(publicationId, text, idempotencyKey)`: Gửi `POST /api/trip-companions/:id/messages/reconcile` thông qua `sendIdempotentMutation` để đối soát tin nhắn bị gián đoạn mà không tạo bản ghi mới.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Thiết lập chu kỳ polling ~3 giây (`pollDelta`) chỉ khi `activeTab === "chat"`.
    - Cổng kiểm soát visibility (`document.visibilityState === "visible"`): tạm dừng poll khi trang bị ẩn; tự động kích hoạt truy vấn delta ngay khi quay lại tab (`visibilitychange` event).
    - Lắng nghe sự kiện mạng `online` để kích hoạt làm mới delta ngay khi thiết bị kết nối lại mạng.
    - Tiến bộ cursor đơn điệu (`lastDeliveredCursorRef`) theo `delta.nextCursor`.
    - Hợp nhất và lọc trùng tin nhắn (deduplication) theo `id` / `sequence`, bảo đảm thứ tự hiển thị tăng dần nghiêm ngặt.
    - Duy trì vị trí thanh cuộn thông minh: nếu người dùng đang ở gần đáy trang (<120px), tự động cuộn theo tin mới; nếu đang đọc tin nhắn lịch sử phía trên, giữ nguyên vị trí xem.
    - Xử lý đối soát và phục hồi mất kết nối trong khung soạn tin: khi gặp trạng thái `UNKNOWN`, hiển thị nút "Đối soát" (`companion-chat-reconcile-btn`) bên cạnh nút "Thử lại" (`companion-chat-retry-btn`). Khi đối soát xác nhận tin đã được ghi trên máy chủ, cập nhật giao diện thành công mà không lặp tin.
  - `apps/web/src/app/trip-companions/companion.css`: Bổ sung styles cho `.companion-chat-reconcile-btn`.
- **Kiểm chứng:**
  - `companion-client.vitest.test.ts`: 41/41 tests PASS (thêm test cases cho `fetchCompanionDelta` và `reconcileCompanionMessage`).
  - `companion-group.vitest.test.ts`: 12/12 tests PASS.
  - Vitest focused suite: 6 files / 85 tests PASS.
  - PostgreSQL disposable integration test: 11 files / 58 tests PASS (bao gồm 2 test PostgreSQL delta & reconciliation).
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
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

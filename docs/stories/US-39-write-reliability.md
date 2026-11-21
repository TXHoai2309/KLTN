# US-39 — Write Reliability, UNKNOWN Recovery & Idempotency

## Status

IMPLEMENTED — browser success path proven; browser-level lost-response interception remains NOT PROVEN

## Epic

MVP reliability and data integrity

## Owner

KLTN team

## Goal / User Story

Là người dùng, tôi muốn các thao tác lưu và cập nhật phản ánh đúng trạng thái thực tế để tránh mất dữ liệu hoặc tạo dữ liệu trùng khi xảy ra lỗi.

## Outcome

Các mutation trong phạm vi dùng contract chung `SUCCESS` / `FAILED` / `UNKNOWN`; thao tác chưa xác định giữ nguyên request identity để đối chiếu lại, và backend dùng transaction, idempotency record cùng unique constraint để chống side effect trùng.

## Source References

- `docs/product/product-spec.md`: nguyên tắc thay đổi dữ liệu, trạng thái ghi và NT-249.
- `docs/architecture/technical-architecture.md`: Next.js full-stack, thin Route Handler, Prisma transaction và idempotent write.
- `docs/decisions.md`: ADR-08/ADR-09 về mutation envelope và idempotency.
- `docs/stories/US-30-confirm-save-valid-trip.md`
- `docs/stories/US-31-my-trips-detail.md`
- `docs/stories/US-34-favorite-saved-trip.md`
- `docs/stories/US-39-rag-document-delete-restore.md` là story RAG khác; file này không ghi đè story đó.
- Product/System source documents đầy đủ không tồn tại trong working tree; đối chiếu dùng baseline đã chuẩn hóa trong `docs/`.

## Dependencies

- `IdempotencyRecord` và unique key `(scope, key)`.
- `executeIdempotentWrite`, `preflightIdempotentReplay`, `sendIdempotentMutation`.
- Trip persistence và Validator US-29/US-30.
- Favorite uniqueness theo actor và target.

## In Scope

- Chuẩn hóa cách client phân biệt response chắc chắn và response không thể xác nhận.
- UNKNOWN recovery bằng cùng `Idempotency-Key`, operation và payload.
- Trip save replay/concurrency/lost-acknowledgement evidence.
- Favorite replay/concurrency và confirmed-state UI.
- Trip Edit/In-trip/Trip Management audit.
- RAG bulk public-QA mutation chuyển sang shared idempotent write.
- Operation-specific response validation cho RAG upload/bulk update.
- Nội dung UNKNOWN và recovery CTA rõ ràng trong Trip/Favorite/RAG UI.

## Out of Scope

- Mutation framework, global mutation store hoặc state-machine library mới.
- Message broker, distributed transaction hoặc exactly-once cho external services.
- Persistent draft subsystem.
- Thay đổi Validator, Trip/Favorite business rules hoặc vòng đời RAG.
- Migration/schema mới.
- Commit, push, reset database hoặc deploy.

## Business Rules

- Chỉ `SUCCESS` hợp lệ từ backend mới được đổi confirmed UI state.
- Lỗi validation/quyền/idempotency conflict đã xác định là `FAILED`.
- Network loss, JSON bị cắt, envelope/payload không hợp lệ hoặc `SUCCESS` đi cùng HTTP error là `UNKNOWN`.
- UNKNOWN không được tạo key mới hoặc thay payload; người dùng chủ động chọn “Kiểm tra lại kết quả”.
- Same key + same actor/operation/payload trả kết quả gốc; same key + khác payload trả conflict.
- Không suy luận idempotency record là absent khi lookup DB lỗi.

## Roles / Authorization

- Actor luôn lấy từ authenticated session và role hiện hành trong database.
- Traveler sở hữu private Trip/Favorite của chính mình.
- Admin mutation yêu cầu permission `admin` trước idempotency lookup/write.
- Replay được scope bằng JSON `[actorId, operation]`; actor khác không đọc chéo kết quả.

## Ownership Rules

- Trip owner không nhận từ client.
- Favorite Trip chỉ tham chiếu Trip thuộc actor hiện hành.
- Trip management/edit recheck ownership tại server/transaction boundary.
- RAG bulk mutation dùng persisted Admin actor làm idempotency scope.

## UX / UI Contract

- `PENDING`: disable duplicate submit và hiển thị trạng thái đang xử lý.
- `SUCCESS`: chỉ hiển thị sau confirmed backend response.
- `FAILED`: giữ form/proposal trong phiên, không báo success.
- `UNKNOWN`: hiển thị “Chưa xác định được kết quả lưu”, giải thích request có thể đã được xử lý và CTA “Kiểm tra lại kết quả”.
- Favorite heart giữ confirmed state khi UNKNOWN.
- Trip proposal và idempotency key được giữ trong component/session hiện tại; không lưu dữ liệu nhạy cảm vào localStorage.
- Không redesign; dùng Button/toast/status region hiện có, tương thích light/dark và layout hiện tại.

## Data Contract

- Không thay đổi Prisma schema.
- `IdempotencyRecord` giữ `scope`, `key`, canonical request hash và serialized confirmed response.
- Trip/ItineraryDay/ItineraryVisit được tạo cùng transaction với idempotency result.
- Favorite unique constraints là tầng bảo vệ cuối cho concurrent add.

## API Contract

Mutation envelope hiện tại được giữ nguyên:

- `SUCCESS`: `{ success: true, operationStatus: "SUCCESS", data }`.
- `FAILED`: `{ success: false, operationStatus: "FAILED", error }`.
- `UNKNOWN`: `{ success: false, operationStatus: "UNKNOWN", error, retryWithSameKey: true }`.
- Confirmed replay trả header `Idempotency-Replayed: true`.

RAG bulk mutation:

- `POST /api/admin/rag-documents/bulk-public-qa`
- Header bắt buộc: `Idempotency-Key`.
- Body: `{ action: "ENABLE_ALL_INDEXED" }` hoặc selected-action contract hiện có.
- Operation scope: `rag:bulk-public-qa`.
- Success data: `{ updatedCount: number, ids: string[] }`.

## Error / Recovery

- Client giữ nguyên key/body khi `UNKNOWN` và gửi lại chính request đó.
- Backend authenticate/authorize, so sánh canonical hash và trả confirmed stored response nếu đã commit.
- Lookup error tiếp tục là UNKNOWN, không chạy write mới dựa trên phỏng đoán.
- UNKNOWN kéo dài không auto-retry vô hạn; UI chờ thao tác người dùng.
- External storage/index provider vẫn chỉ có mức bảo đảm do module hiện có cung cấp; không tuyên bố exactly-once ngoài DB.

## Write Semantics / Idempotency

- Scope: authenticated actor + stable operation name.
- Hash: canonical JSON của validated business input.
- Business write và successful response record nằm trong cùng Prisma transaction.
- Concurrent same-key requests dựa vào DB unique constraint; loser đọc lại confirmed result.
- Failed/rolled-back transaction không để partial business rows hoặc confirmed idempotency response.
- Recovery là replay logical operation cũ, không phải mutation mới.

## Mutation Inventory

| Operation | Endpoint/client/service evidence | SUCCESS | FAILED | UNKNOWN/replay | No duplicate | FE state |
|---|---|---|---|---|---|---|
| Save Trip | `/api/trips`, `trip-save-client`, `trip-save-service` | PASS | PASS | PASS | PASS — PostgreSQL concurrent same-key | PASS |
| Trip completion/delete | `/api/trips/[id]`, `trip-management-client/service` | PASS | PASS | PASS | PASS | PASS |
| Manual/AI/In-trip apply | `/api/trips/[id]/edits/apply`, `apply-edit`, session reducers | PASS | PASS | PASS | PASS — revision + replay tests | PASS |
| Favorite Destination/Culture/Trip | `/api/favorites/...`, FavoriteButton, favorites services | PASS | PASS | PASS | PASS — unique constraint + PostgreSQL race | PASS |
| Account update | `/api/account`, account client/service | PASS | PASS | PASS | PASS | PASS |
| Admin Destination/Culture | Admin clients/services using shared helper | PASS | PASS | PASS | PASS | PASS in covered tests |
| RAG finalize/review/delete/restore/index | RAG modules and shared helper | PASS | PASS | PASS | PASS for DB lifecycle | PASS in covered tests |
| RAG bulk public QA | `/api/admin/rag-documents/bulk-public-qa` | PASS | PASS | PASS | PASS — new atomic idempotent write | PASS |
| External blob/index side effects | storage/index provider | PARTIAL | PARTIAL | PARTIAL | NOT PROVEN exactly-once | PARTIAL |

## External Services

- RAG Blob storage and embedding/index provider are not transactionally coupled to PostgreSQL.
- US-39 reuses existing operation/job identity and does not add a queue or distributed transaction.
- Exactly-once external side effects remain explicitly NOT PROVEN.

## Acceptance Criteria

- [x] Shared `SUCCESS` / `FAILED` / `UNKNOWN` contract is retained and hardened.
- [x] Malformed/truncated/network-lost responses cannot produce confirmed success.
- [x] UNKNOWN recovery retains the same key and payload.
- [x] Same key/same payload replays the confirmed result.
- [x] Same key/different payload returns conflict.
- [x] Concurrent Trip save creates one Trip graph.
- [x] Concurrent Favorite add creates one relation and never copies a Trip.
- [x] Trip Edit/Management replay does not repeat the business update.
- [x] RAG bulk update uses shared mutation envelope and idempotent transaction.
- [x] FAILED/UNKNOWN keep confirmed UI state and recoverable input in the current session.
- [x] Authenticated browser E2E proves a confirmed write and subsequent read with disposable Development data.
- [ ] Browser-level lost-response interception is fully evidenced.
- [ ] Exactly-once behavior for external Blob/index side effects is evidenced; this is not claimed by US-39.

## Test Plan

- Shared client: valid SUCCESS/FAILED/UNKNOWN, network loss, truncated JSON, malformed envelope, non-2xx SUCCESS and blank error contract.
- Idempotency: replay, payload conflict, actor/operation isolation, lookup failure and invalid input.
- Trip: Validator gate, transaction rollback, concurrent same-key save, replay after discarded acknowledgement and descendant counts.
- Favorite: duplicate-safe add/remove, ownership, confirmed-state reducer and PostgreSQL unique race.
- Trip Edit: replay, revision conflict, failed apply rollback and UNKNOWN candidate retention.
- RAG: finalize lifecycle, bulk transaction/replay/conflict, route envelope and operation-specific success validation.
- Full root tests, typecheck, production build and whitespace check.
- Browser: save, known failure, Favorite and Edit against disposable/local test data where a supported authenticated browser is available.

## Expected Modules / Files

- `apps/web/src/lib/mutation-client.ts`
- `apps/web/src/lib/mutation-client.vitest.test.ts`
- `apps/web/src/modules/trip-save/*`
- `apps/web/src/modules/trip-read/trip-management.postgres.integration.vitest.test.ts`
- `apps/web/src/components/favorite-button.tsx`
- `apps/web/src/components/favorite-mutation-logic.ts`
- `apps/web/src/modules/rag-document/rag-service.ts`
- `apps/web/src/app/api/admin/rag-documents/bulk-public-qa/route.ts`
- `apps/web/src/app/admin/rag/rag-review-ui.tsx`
- `apps/web/src/app/admin/rag/upload/rag-upload-form.tsx`

## Migration Impact

None. Existing `IdempotencyRecord`, Trip and Favorite constraints are sufficient.

## Environment Impact

- No new environment variables or dependencies.
- PostgreSQL integration tests are opt-in and verify the approved development endpoint before exact-ID fixture writes.
- No database reset or `db push`.

## Implementation Sequence

1. Audit shared mutation infrastructure and MVP mutation inventory.
2. Add RED tests for malformed shared responses and missing RAG bulk idempotency.
3. Harden shared client and make RAG bulk write atomic/idempotent.
4. Align UNKNOWN UI copy/recovery CTA and validate operation-specific success data.
5. Add PostgreSQL concurrency/lost-acknowledgement evidence.
6. Run targeted/full verification and browser evidence.
7. Update this story and `docs/ai-progress.md` with only observed results.

## Acceptance Evidence

- Targeted Vitest: 34 files PASS, 281 tests PASS, one opt-in PostgreSQL file skipped in that command.
- Legacy targeted suites: idempotency 4/4, RAG 64/64, account 18/18, favorite 27/27 PASS.
- PostgreSQL Trip fixture: concurrent same-key + replay; count `Trip 0→1`, total Day `16→17`, total Visit `36→37`; exact fixture cleanup completed.
- PostgreSQL Favorite fixture: Trip/Day/Visit counts unchanged through add/replay/race/remove; one Favorite relation under race; exact fixture cleanup completed.
- Full root test suite: PASS (Vitest and legacy Node suites through the existing Turbo script).
- Root typecheck: PASS (4/4 workspace tasks).
- Production web build: PASS through `npm run build --workspace web` (Next.js 16.3.8, 53/53 pages). The root Turbo wrapper printed its one successful build task but retained an idle process handle in the execution host, so a clean root-wrapper exit is not claimed.
- Authenticated browser smoke at `localhost:3010`: the existing Development Traveler fixture logged in, added `[TEST] Cổng trời Quản Bạ & Núi Đôi` to Favorites, observed the confirmed success state, and read the same item from `/favorites`. The exact relation was then removed by actor email + destination ID; reloading `/favorites` proved the original empty state was restored.
- Browser-level commit-then-drop-response interception: NOT PROVEN. The shared-client malformed/network tests plus PostgreSQL discarded-acknowledgement replay test cover this fault below the browser without adding a production-only fault endpoint.

## Open Questions

- Authenticated success-path browser evidence is available through the in-app Chromium browser. Direct Cốc Cốc/Chrome/Edge coverage is not claimed.
- A browser-level commit-then-drop-response harness is not currently present; automated client + PostgreSQL service evidence covers the fault without adding a production backdoor. This remains explicitly NOT PROVEN at the browser layer.

## Handoff Notes

- Do not overwrite `US-39-rag-document-delete-restore.md`.
- Retry UNKNOWN only through the retained logical operation; changing input requires resolving or abandoning the old operation first.
- Do not infer external exactly-once guarantees from the database transaction.

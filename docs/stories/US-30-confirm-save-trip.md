# US-30 — Xác nhận và lưu hành trình hợp lệ

## Status

IMPLEMENTED — 2026-10-20 extension: real Save CTA, pending, global toast, navigation to `/trips` and reload persistence PASS in browser. Controlled browser FAILED/UNKNOWN remains NOT PROVEN; service/client tests cover the write contract. See latest evidence below; earlier sections retain historical evidence.

## Goal / User Story

Traveler xác nhận phương án hợp lệ và lưu Trip thuộc tài khoản của mình đúng một lần.

## Source References

- `docs/product/product-spec.md`, `docs/architecture/technical-architecture.md`, `docs/flow/user-flow.md`, `docs/design/ui-baseline.md`.
- `docs/stories/US-29A*`, `US-29B*`, `US-29C*`, `US-30-db-migration-fix.md`.
- Yêu cầu audit-and-fix US-30/31 ngày 2026-10-19.

## Dependencies and Current Baseline

US-28 planner thực tế đã có: `/trips/new` đi từ nhập/xác nhận nhu cầu tới `TripPlannerFlow`, `POST /api/trip-proposals` và `TripPlannerScreen`. US-29 validator bốn nhóm đã có. Trước đợt sửa này, `TripSavePanel` và `POST /api/trips` đã tồn tại nhưng panel chưa được gắn vào màn hình proposal. Prisma Trip/Day/Visit và migration đã có; không cần schema mới.

## In Scope

- Ghép phương án có thời gian thực từ planner vào save contract, không chế Destination ID hoặc thời gian.
- Preview validator trên dữ liệu công khai/hiện hành và bốn nhóm trước thao tác lưu.
- Dùng lại `TripSavePanel`, shared idempotency và API save; sau `SUCCESS` lấy ID thật, phát global toast và điều hướng `/trips`.
- Xác minh schema, migration, DB, test và UI; không thay đổi auth hoặc theme.

## Out of Scope

Draft/edit/replanning/in-trip assistant, favorites, sharing, tạo data demo/production, migration mới, US-34.

## Business Rules

- `toSaveProposal` chỉ chuyển planner result đủ điều kiện xác nhận, có ngày đi, tất cả stop `PLANNED` và giờ đến có thật; Zod kiểm tra cấu trúc ngày/thứ tự/thời lượng.
- Preview `POST /api/trips/validate` yêu cầu traveler capability, tìm Destination `VISIBLE` ở server, lấy route Stadia và gọi chung `validateItinerary`; không ghi DB. Route không có/timeout là `INSUFFICIENT_DATA`.
- Save `POST /api/trips` yêu cầu `{ confirm: true, proposal }` cùng `Idempotency-Key`; actor từ session, revalidate bốn nhóm bằng business data hiện hành và route snapshot, recheck trong transaction trước khi tạo Trip/Days/Visits.
- Chỉ `canConfirm=true` (cả bốn group `SATISFIED`) được lưu. `VIOLATION`/`INSUFFICIENT_DATA` chặn cả UI lẫn server. Idempotency replay cùng key/payload không tạo bản thứ hai.
- Preview chỉ hỗ trợ quyết định UI; save không tin `canConfirm` từ client. Thành công chỉ được hiển thị sau response `SUCCESS` có tripId.

## Roles / Ownership

Guest 401; actor có traveler capability theo RBAC V2 là TRAVELER hoặc ADMIN. Trip owner là actor ID từ session, không phải client-provided userId. Role khác 403. Đây là convention hiện hành; tài liệu US-30 cũ ghi Admin 403 đã lỗi thời.

## Data / API Contract

- Prisma `Trip` (owner, startDate, durationDays, transport, timestamps), `ItineraryDay` (trip, dayIndex, localDate), `ItineraryVisit` (day, destination, startMinute, plannedDurationMinutes, order).
- `POST /api/trips/validate`: JSON `{ proposal }` → shared read envelope `{ success: true, data: { validation } }`, `Cache-Control: private, no-store`; technical/invalid/auth errors qua shared handler.
- `POST /api/trips`: JSON `{ confirm: true, proposal }`, `Idempotency-Key` → shared mutation envelope `SUCCESS/FAILED/UNKNOWN`. `FAILED` do revalidation có fresh validation; `UNKNOWN` không được suy đoán thành công và retry phải dùng lại key/payload.

## UX / UI Contract

`TripPlannerScreen` hiển thị ngày/stop, preliminary checks, rồi `TripConfirmationSection`. Section gọi read-only preview, có loading/error/retry, hiển thị `TripValidationPanel` bốn nhóm và dùng `TripSavePanel` hiện có. Button chỉ enable khi bốn nhóm đáp ứng. `TripSavePanel` giữ proposal và idempotency key cho retry `UNKNOWN`; các nút quay lại/tạo lại bị khóa trong lúc `pending`, `unknown` hoặc `success` để không hủy phiên lưu chưa rõ kết quả. Khi `SUCCESS`, toast toàn cục được phát trước `router.replace('/trips/{tripId}')`; vì Toaster nằm ngoài planner subtree, phản hồi thành công vẫn hiện trên Trip Detail sau khi planner unmount. Planner vẫn cho quay lại hoặc tạo lại khi save thất bại.

## Error / Recovery

Input cấu trúc sai 400; destination ẩn/không tồn tại 422; validator không đạt 422; lỗi DB outcome không chắc chắn là `UNKNOWN`. Không trả raw Stadia error cho FE. Preview lỗi có nút kiểm tra lại. Không có success giả khi `FAILED`/`UNKNOWN`.

## Migration / Environment Impact

Không có migration mới trong đợt sửa 2026-10-19. Read-only audit: 23 migration disk/DB đều finished, không rolled back; `20261015000000_us30_trip_save` đã applied 2026-10-15T09:32:51.735Z. Development DB có `trip`, `itinerary_day`, `itinerary_visit` với bốn FK và bảy index gồm PK. Audit-and-fix này chạy bốn lượt save độc lập từ ba Destination `[TEST]` đang VISIBLE: hai lượt tái hiện trước sửa và hai lượt xác minh sau sửa. Bốn Trip đều cùng owner phiên Traveler, mỗi Trip có đúng 1 Day/3 Visit và thứ tự 1,2,3; DB hiện có 6 Trip/7 Day/19 Visit, không có Trip của owner hiện tại thiếu Day/Visit. Không reset, xóa hoặc sửa bản ghi cũ. Đây không phải production dataset acceptance.

## Acceptance Criteria

- [x] Planner proposal có cấu trúc nối với preview bốn nhóm và Save UI; component/unit tests dùng planner service thật với fixture.
- [x] Save service test chứng minh server visibility, ownership, validator gate, transaction, idempotent replay, FAILED/UNKNOWN.
- [x] Guest read Trip API trả 401 trên localhost:3010; migrated development DB và ba bảng được xác minh read-only.
- [x] Traveler qua form thủ công thực sự tạo proposal từ Destination `[TEST]` có Stadia routes; bốn nhóm preview SATISFIED; pending → SUCCESS → toast rõ ràng → detail ID thật. My Trips hiển thị Trip ngay và vẫn còn sau reload.
- [x] Cùng key/payload được replay bằng save service trên development DB thật: `SUCCESS`, `replayed:true`, cùng tripId, Trip count 2→2. HTTP retry bằng cùng browser request chưa được chạy.
- [x] Session Traveler hiện tại mở Trip cũ thuộc owner khác: API trả `TRIP_NOT_FOUND`, giống ID không tồn tại; UI hiển thị cùng not-found. Chưa đăng nhập phiên Traveler B để đảo chiều kiểm tra.
- [x] Negative server integration trên development DB: duration violation và unavailable route đều `TRIP_VALIDATION_FAILED`, Trip count 2→2. UI negative proposal chưa được chạy live.
- [x] Figma MH-08 (`57:573`) đã được inspect để đối chiếu trạng thái sẵn sàng lưu và hành vi sau save; không claim pixel-perfect parity.

## Test Plan / Acceptance Evidence (completion audit 2026-10-19)

- Root cause reproduced on two independent valid saves: `TripSavePanel` set its local success message and immediately called `onSaved`; `router.replace` unmounted the planner, so the success message disappeared before the user could see it. Navigation and persistence themselves worked. No stale-list/cache defect reproduced, so no speculative revalidation or client cache layer was added.
- TDD: the new navigation test failed before `completeTripSave` existed, then passed after notification-before-navigation was implemented. Focused US-29/30/31 command: **115/115 PASS** across 13 files.
- Browser on `localhost:3010`: after the fix, pending state was visible; a real save returned `cmvf41a2n0011a0k5yih8lne6`, navigated to that exact detail route, and the destination DOM still contained `Đã lưu chuyến đi thành công.`. My Trips showed five owner Trips immediately; reload still showed five. The four audit-created IDs are persisted with the same owner and complete 1 Day/3 Visit trees.
- `npm run check-types`: **4/4 tasks PASS**. `npm run build`: **1/1 task PASS**, including `/trips`, `/trips/[id]`, `/trips/new` and Trip APIs. `git diff --check`: PASS.
- Root `npm test`: **FAILED outside this change** with 2603 passed, 6 failed, 134 skipped, 1 todo. Failures remain in US-35/36/37 authorization/source audits, AI edit authorization and preference-extraction environment; the legacy phase does not run after Vitest fails.
- Controlled browser FAILED/UNKNOWN, same-key HTTP replay and reverse ownership from a second authenticated Traveler remain NOT PROVEN. Service/HTTP tests cover these contracts. Production dataset acceptance is NOT PROVEN.

## Files Changed in This Completion Audit

- `apps/web/src/components/trip-planner/trip-planner-screen.tsx` and `planner-ui.vitest.test.ts`: global success toast before exact Trip Detail navigation, with regression coverage.
- `docs/stories/US-30-confirm-save-trip.md` and `docs/ai-progress.md`: current evidence and limitations.
- US-31 list/detail files are documented in the US-31 story; no API write, schema or migration file changed.

## Approved extension — 2026-10-20 (current behavior)

Source: user task attachment `dd773ed8-494a-4aa9-b36b-3774956d1208`. Delete/manual completion are explicitly approved extensions, not claims about the original Product baseline. Original Product/System DOCX files are unavailable in this checkout; condensed product/architecture/stories were reviewed.

### Audit and implementation

- Before: `PlannerActions` made regeneration primary; `onRegenerate` invokes `POST /api/trip-proposals`, never persistence. Existing `TripSavePanel`/`POST /api/trips` already perform canonical server validation and transactional idempotent creation.
- Missing opening hours legitimately prevents confirmation. The planner also has an accessibility check; its `eligibleForFinalConfirmation` gate remains intact. No required check was bypassed or data invented.
- End of proposal now has secondary **Chỉnh sửa nhu cầu**, secondary **Tạo lại lịch trình**, and one primary **Lưu chuyến đi**. Invalid/relative/loading previews expose disabled Save with guidance; regeneration remains available for invalid proposals.
- Save uses existing `submitTripSave`, not regeneration. A synchronous ref blocks duplicate clicks; pending shows spinner/Đang lưu… and locks secondary actions. Missing start date disables Save even for direct component usage.
- Only confirmed SUCCESS with a real Trip ID triggers global Sonner `Đã lưu chuyến đi thành công.` then `router.replace('/trips')`. Existing dynamic owner-scoped list reads supply fresh data. No timeout, provider/store, localStorage Trip or cache library was added.
- FAILED preserves proposal. UNKNOWN preserves the identical proposal/key and offers **Kiểm tra lại kết quả lưu**. The existing repeated POST first reconciles the actor-scoped persisted idempotency record; it does not create another logical save request.

### Evidence

- RED → GREEN: label and `/trips` navigation assertions failed before implementation; missing-date disabled assertion failed before its guard. Planner/save/Validator tests pass in the targeted run.
- Browser at `localhost:3010`, existing authenticated traveler-capable session: an initial proposal missing opening hours kept Save disabled. Selecting the existing nature preference yielded real `[TEST]` destinations with all checks satisfied. Pending was observed, followed by `/trips`, success toast after planner unmount, immediate row and persisted row after reload.
- Browser-created disposable Trip: `cmvgvphwq000400k5bpact9xi`, 21/10/2026, 1 Day/3 Visits. Mark/reload/unmark subsequently passed; user explicitly approved its deletion at browser action time. It was deleted; pre-existing Trip count returned to seven.
- PostgreSQL integration separately creates two disposable TRAVELER users, one explicit test Destination, and saves using the real service/Validator/DB. Same key replay creates exactly one Trip; list/detail agree. Fixture cleanup completed.
- NOT PROVEN: injected network FAILED/UNKNOWN through browser, and two separate signed-in browser accounts. Service/client/HTTP tests exercise these contracts; these do not substitute for E2E evidence.

### Changed save files

`apps/web/src/components/trip-planner/{planner-presentation.tsx,planner-ui.vitest.test.ts,trip-confirmation-section.tsx,trip-planner-screen.tsx}`;
`apps/web/src/modules/trip-save/{trip-save-panel.tsx,trip-save-panel.vitest.test.ts}`;
`apps/web/src/modules/trip-validation/trip-validation-panel.tsx`.
The management schema/API/UI/test files and exact verification commands are recorded in the US-31 extension below.

## 2026-10-21 — duybinh / ThaiAnh integration and UNKNOWN recovery

- Owner authorized completing the existing merge of ThaiAnh b61228c into duybinh 7493da1, selecting ThaiAnh Trip UI and Save preview while retaining duybinh US-37 and revision/draft fixes. Confirmed Save uses toast then /trips; the obsolete parent onSaved detail redirect is removed.
- Save state now reaches TripRequirementForm through TripPlannerFlow. A synchronous ref guards navigation and mutations; tabs are disabled and other panels inert during pending/UNKNOWN/success. FAILED releases the lock. Delayed analyze/evaluate responses cannot clear the mounted Save panel while locked.
- Offline browser regression mounts production form, Planner, confirmation and Save components. Only initial field values, review confirmation, map/navigation adapters and HTTP are synthetic. Two observed RED failures (unlocked pending tabs and late evaluation discarding Save) became GREEN. Checks cover pending/UNKNOWN, blocked input, identical retry key/payload, confirmed /trips navigation, known FAILED recovery, late evaluation, and 360/1440 Light/Dark.
- Command: node apps/web/scripts/test-trip-save-recovery.mjs (from repository root; or node scripts/test-trip-save-recovery.mjs from apps/web). Playwright resolves from the desktop bundled runtime, as in existing browser scripts. No live Blob, DB, provider or authenticated browser action is implied.
- Related focused Vitest: 176 PASS / 1 opt-in PostgreSQL SKIP. Legacy: 336 PASS. Typecheck: all four workspaces PASS. Prisma 7.10 validate/generate PASS with Node 22; Node 24 had a native Windows UV_HANDLE_CLOSING failure. Incoming migration SQL reviewed; no database migration or live ledger inspection in this session.
- Detailed full-suite/build/environment limitations and final Git handoff are recorded in the matching ai-progress entry below. No product acceptance gate was waived.
- Final production build PASS. Final full Vitest outside sandbox with unchanged configuration: 2680 PASS / 6 documented baseline FAIL / 135 pending / 1 todo; overall not green. Browser recovery including the delayed-evaluate race PASS. Dev restored at port 3010, health200. See ai-progress for sandbox/native diagnostics.

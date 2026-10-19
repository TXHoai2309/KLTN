# US-30 — Xác nhận và lưu hành trình hợp lệ

## Status

IMPLEMENTED IN CODE; authenticated development-DB valid-save path PASS, strict full acceptance remains NOT PROVEN (audit 2026-10-19).

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
- Dùng lại `TripSavePanel`, shared idempotency và API save; điều hướng tới detail bằng ID thật sau `SUCCESS`.
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

`TripPlannerScreen` hiển thị ngày/stop, preliminary checks, rồi `TripConfirmationSection`. Section gọi read-only preview, có loading/error/retry, hiển thị `TripValidationPanel` bốn nhóm và dùng `TripSavePanel` hiện có. Button chỉ enable khi bốn nhóm đáp ứng. `TripSavePanel` giữ proposal và idempotency key cho retry `UNKNOWN`; các nút quay lại/tạo lại bị khóa trong lúc `pending`, `unknown` hoặc `success` để không hủy phiên lưu chưa rõ kết quả. `SUCCESS` dùng `router.replace` tới `/trips/{tripId}` để Back không trở lại proposal vừa lưu. Planner vẫn cho quay lại hoặc tạo lại khi save thất bại.

## Error / Recovery

Input cấu trúc sai 400; destination ẩn/không tồn tại 422; validator không đạt 422; lỗi DB outcome không chắc chắn là `UNKNOWN`. Không trả raw Stadia error cho FE. Preview lỗi có nút kiểm tra lại. Không có success giả khi `FAILED`/`UNKNOWN`.

## Migration / Environment Impact

Không có migration mới trong đợt sửa 2026-10-19. Read-only audit: 23 migration disk/DB đều finished, không rolled back; `20261015000000_us30_trip_save` đã applied 2026-10-15T09:32:51.735Z. Development DB có `trip`, `itinerary_day`, `itinerary_visit` với bốn FK và bảy index gồm PK. Trước E2E có 1 Trip/2 Day/4 Visit. Inventory chỉ đọc: 9 Destination `VISIBLE`, 7 có minimum duration, 6 có ít nhất một khoảng OPEN và 6 có trạng thái cả bảy ngày không UNKNOWN. E2E được người dùng yêu cầu đã tạo **một Trip development** `cmvetgw4s0001a0k5cytvczml` từ ba Destination `[TEST]` đang VISIBLE; sau E2E DB có 2 Trip, Trip mới có 1 Day/3 Visit. Không reset hay sửa bản ghi cũ. Đây không phải production dataset acceptance.

## Acceptance Criteria

- [x] Planner proposal có cấu trúc nối với preview bốn nhóm và Save UI; component/unit tests dùng planner service thật với fixture.
- [x] Save service test chứng minh server visibility, ownership, validator gate, transaction, idempotent replay, FAILED/UNKNOWN.
- [x] Guest read Trip API trả 401 trên localhost:3010; migrated development DB và ba bảng được xác minh read-only.
- [x] Traveler qua form thủ công thực sự tạo proposal từ Destination `[TEST]` có Stadia routes; bốn nhóm preview SATISFIED; click save → detail ID thật; DB thêm chính xác 1 Trip/1 Day/3 Visit và My Trips liệt kê Trip mới.
- [x] Cùng key/payload được replay bằng save service trên development DB thật: `SUCCESS`, `replayed:true`, cùng tripId, Trip count 2→2. HTTP retry bằng cùng browser request chưa được chạy.
- [x] Session Traveler hiện tại mở Trip cũ thuộc owner khác: API trả `TRIP_NOT_FOUND`, giống ID không tồn tại; UI hiển thị cùng not-found. Chưa đăng nhập phiên Traveler B để đảo chiều kiểm tra.
- [x] Negative server integration trên development DB: duration violation và unavailable route đều `TRIP_VALIDATION_FAILED`, Trip count 2→2. UI negative proposal chưa được chạy live.
- [ ] Pixel matching MH-07/08/09: BLOCKED vì Figma file kết nối chỉ lộ `01 – Components`.

## Test Plan / Acceptance Evidence (2026-10-19)

TDD adapter/service/HTTP/client/UI RED→GREEN; có test khóa hai planner actions khi kết quả lưu chưa rõ. Focused US-29/30/31 Vitest 115/115 PASS; root `npm run env:generate`, `npm run db:generate`, `npm run check-types`, `npm run build`, `npx prisma migrate status`, legacy tests chạy riêng và `git diff --check` PASS. Root `npm test` chưa PASS: full Vitest 2602 passed, 6 failed, 134 skipped, 1 todo; sáu thất bại nằm ở US-35/36/37 in-trip, AI edit và preference-extraction env, không ở các file US-29/30/31 đang sửa. Vì Vitest fail, legacy phase của root script không chạy; nó được chạy riêng và PASS.

Browser 3010 Guest tới `/trips` chuyển `/login`. Sau khi người dùng đăng nhập Traveler, `/trips/new` manual form → review → real proposal ngày 20/10/2026 → bốn nhóm SATISFIED → save → `/trips/cmvetgw4s0001a0k5cytvczml` → My Trips và detail PASS. Nhánh AI cũng được chạy riêng: từ câu tiếng Việt, provider nhận diện đúng ngày, thời lượng, ô tô và thiên nhiên; review vẫn yêu cầu xác nhận. Không bấm lưu lần thứ hai. Read-only DB query xác nhận owner có giá trị, 1 Day/3 Visit đúng order 1,2,3. Existing Trip không bị sửa. Dữ liệu Destination đều mang nhãn `[TEST]`, nên production dataset và Figma parity vẫn chưa được chứng minh. Live negative UI, HTTP duplicate retry, Traveler B session và ONGOING/COMPLETED browser cases vẫn NOT PROVEN.

## Files Changed in This Audit

`trip-save-adapter.ts`/test, `trip-confirmation-section.tsx`, `trip-planner-screen.tsx`/CSS/UI test, `POST /api/trips/validate` route, `trip-save-service.ts`/HTTP/client và tests, comment trong `trip-save-panel.tsx`, story này và `docs/ai-progress.md`. US-31 runtime code không cần đổi.

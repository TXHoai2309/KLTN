# US-30 — Xác nhận và lưu hành trình hợp lệ

## Status

IMPLEMENTED IN CODE — development DB migration and proposal-screen integration remain NOT PROVEN.

## Goal / User Story

Traveler xác nhận phương án hợp lệ và lưu Trip thuộc tài khoản của mình đúng một lần.

## Source References

- `docs/product/product-spec.md`: start date trước save; bốn nhóm Validator.
- `docs/flow/user-flow.md`: xác nhận rồi ghi DB, chỉ báo thành công sau ghi.
- `docs/stories/US-29C-conflict-validator-aggregation.md` và hai story US-29A/B.
- Task 4 của người dùng quy định ownership, transaction và `SUCCESS/FAILED/UNKNOWN`.

## Dependencies

US-29C hoàn thành trước save service. Repo chưa có Trip/Day/Visit schema hoặc proposal screen; người dùng trước đó chọn chỉ làm save API + component, không dựng planner giả.

## In Scope

- Prisma Trip/ItineraryDay/ItineraryVisit tối thiểu và migration.
- `POST /api/trips`, xác thực Traveler, xác nhận tường minh, server revalidation và transactional create.
- Reuse `Idempotency-Key`, `preflightIdempotentReplay`, `executeIdempotentWrite`, shared mutation envelope.
- Component save dùng lại được với pending, SUCCESS, FAILED, UNKNOWN, giữ proposal trong session.

## Out of Scope

Draft persistence, edit trip, in-trip assistant, favorites, sharing, planner/proposal generation, US-31.

## Business Rules

- Server lấy owner từ session, query Destination `VISIBLE` và dữ liệu nghiệp vụ hiện thời. Không nhận `ownerId` hoặc tin `validatorPassed` của client.
- Chỉ ghi khi confirm tường minh, start date hợp lệ và bốn group `SATISFIED`. Vi phạm hoặc thiếu dữ liệu trả validation mới, không ghi.
- Route snapshot được lấy ngoài transaction; business data được đọc lại trong transaction. Dữ liệu đổi khiến kết quả khác thì thất bại và không ghi.
- Trip, days, visits và idempotency result cùng một Prisma transaction. UNKNOWN retry bằng cùng key và payload.

## Roles / Ownership

Guest 401, Admin 403; Traveler là owner từ authenticated session. Recheck role bên trong transaction.

## Data / API Contract

`POST /api/trips` JSON `{ confirm: true, proposal: { startDate, durationDays, transport, days: [{ dayIndex, visits: [{ destinationId, startMinute, plannedDurationMinutes, order }] }] } }`, `Idempotency-Key` bắt buộc. Shared mutation envelope: `SUCCESS` trả tripId + validation; `FAILED` có reason và fresh validation khi revalidation không pass; `UNKNOWN` giữ cùng key để reconcile.

## UX / UI Contract

Component nhận proposal và validation, enable “Xác nhận và lưu” chỉ khi `canConfirm=true`, chỉ báo “Lưu thành công” sau `SUCCESS`. Không có màn hình proposal thực để gắn component tại branch này; end-to-end navigation là NOT PROVEN.

## Error / Recovery

Invalid structure là 400; destination ẩn/không tồn tại là 422; validation không đạt là 422; DB outcome không chắc chắn là UNKNOWN. Không lộ lỗi provider thô.

## Migration / Environment Impact

Migration Prisma tạo ba model và relation tối thiểu. Review SQL và báo rõ có apply development DB hay chưa; không dùng `db:push`.

## Acceptance Criteria

- [x] Bốn group SATISFIED + confirm tạo một Trip và nested days/visits trong service test; real DB write NOT PROVEN.
- [x] Mỗi group vi phạm hoặc thiếu dữ liệu chặn save trong service test.
- [x] Không confirm, Guest/Admin, hidden Destination đều không tạo Trip trong contract/service tests.
- [x] Same key/payload không tạo bản thứ hai; FAILED/UNKNOWN không hiển thị success trong service/client tests.

## Test Plan

Vitest service/API/client tests cho 12 case task; kiểm tra transaction, migration, full tests, typecheck, build, `git diff --check`.

## Implementation Sequence

1. Reuse contract và Validator của US-29C.
2. TDD save service với fake DB transaction và outcome.
3. Schema + Prisma migration, thin route, reusable client component.
4. Verify và ghi acceptance evidence.

## Acceptance Evidence

US-30 focused Vitest: 17/17 PASS (service 10, HTTP 2, client 3, panel 2). Entire US-29A/B/C + US-30 selection: 66/66 PASS. `npm run env:generate`, `npm run db:generate`, `npx prisma validate`, `npm run check-types`, `npm run build` PASS. Root `npm run test` reached legacy Culture tests and failed on an existing assertion that header navigation contains `to: "/culture", label: "Văn hóa"`; neither file was changed here. `git diff --check` PASS for tracked diff.

Migration SQL was reviewed against the three Prisma models: one enum, three tables, four indexes and four expected foreign keys; no speculative tables. `npx prisma migrate status` reports **not applied** and exits 1 because the DB has migration `20261014120000_add_destination_editorial` absent locally. No migration was applied to the development DB; actual PostgreSQL atomicity and live authenticated save remain NOT PROVEN until histories are reconciled. The reusable component is not mounted because the current `/trips/new` only reviews trip requirements, not a generated itinerary.

# US-29A — Kiểm tra giờ hoạt động và thời lượng tham quan tối thiểu

## Status

IMPLEMENTED — Task 1 only; repository-wide verification remains blocked by pre-existing workspace state.

## Epic

Trip planning / deterministic Constraint Validator.

## Goal / User Story

Là Du khách, tôi muốn biết từng lượt tham quan có phù hợp giờ hoạt động và thời lượng tối thiểu của điểm đến hay không, để không xác nhận một lịch trình dựa trên dữ liệu thiếu hoặc vi phạm rõ ràng.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, “Deterministic Constraint Validator”, Asia/Ho_Chi_Minh.
- `docs/flow/user-flow.md` — “Itinerary generation and validation”.
- `docs/architecture/technical-architecture.md` — business rules in modules; AI separate from Validator.
- `docs/stories/US-07-admin-destinations.md` — independent suggested/minimum minutes and seven-day OPEN/CLOSED/UNKNOWN schedule.
- `docs/stories/US-24-trip-requirement-form.md` and `US-26-review-confirm-trip-needs.md` — trip date conventions; these do not implement an itinerary.
- Current US-29A task instruction supplies the interval and boundary examples. Product/System DOCX files were not found in this checkout; requirement IDs are not invented.

## Dependencies / Current State

- `Destination` persists nullable `minimumDurationMinutes` separately from `suggestedDurationMinutes`.
- `OpeningDay` uses `OPEN`, `CLOSED`, `UNKNOWN`; `OpeningInterval` stores local minutes from midnight, with closing at 1440 allowed and overnight intervals disallowed.
- `isValidCalendarDate` and the weekday list exist. No itinerary visit model, Validator status type or validator module currently exists.

## In Scope

- Two pure checks, one for a single visit against a single day's opening intervals and one for planned versus minimum duration.
- Return `status`, `affectedVisitId`, `reason` only. Product status vocabulary is `PASS`, `VIOLATION`, `INSUFFICIENT_DATA`; labels are Đáp ứng, Vi phạm, Chưa đủ dữ liệu để kiểm tra.
- Unit tests for boundaries, multiple windows, all-day closure, missing data, duration equality and suggested/minimum separation.

## Out of Scope

Google Routes, travel time, schedule conflicts, aggregate validator, rule engine, Trip persistence, Trip UI, planner integration, API, schema and migration.

## Business Rules

- A visit passes opening hours only if its local start and end both lie within the **same** interval. Equality at opening and closing passes. Windows are not merged.
- `CLOSED` means an explicit full-day closure and is a violation. `UNKNOWN`, missing day or missing usable intervals mean insufficient data.
- Planned duration passes when it is at least `minimumDurationMinutes`. Missing minimum is insufficient even when suggested duration is present.
- The visit date is a Vietnam-local `YYYY-MM-DD` calendar date. Times are integer minutes from that day's midnight; no current clock or implicit default hours enter the checks.
- Invalid or absent visit time/duration is insufficient data, never a pass. This module does not decide final itinerary confirmation.

## Roles / Authorization / Ownership

N/A for pure functions. A future service must enforce Traveler ownership and destination eligibility before using these outcomes.

## UX / UI Contract

N/A; no UI change in Task 1.

## Data Contract

Input: visit ID, Vietnam-local date and start/end minutes for hours; opening day records with status and minute intervals. Duration check takes visit ID, planned minutes and nullable minimum minutes. Output: status, affectedVisitId, reason code. No persisted result.

## API Contract

N/A; no route in Task 1.

## Error / Recovery

Missing/unknown source data is `INSUFFICIENT_DATA`, distinct from an explicit `CLOSED` or out-of-window `VIOLATION`. Malformed visit timing is also insufficient and cannot grant a pass.

## Write Semantics / Idempotency

N/A; no writes.

## External Services

N/A.

## Acceptance Criteria

- [x] Entire visit fits one window, including equal opening/closing boundaries: `PASS`.
- [x] Starting early, ending late or spanning a midday gap: `VIOLATION`.
- [x] Second of multiple windows can independently satisfy the visit.
- [x] Explicit `CLOSED` is `VIOLATION`; `UNKNOWN`/missing hours are `INSUFFICIENT_DATA`.
- [x] Planned duration greater than or equal to minimum: `PASS`; shorter: `VIOLATION`.
- [x] Missing minimum remains `INSUFFICIENT_DATA` even when suggested duration is present.
- [x] Deterministic unit tests run; full suite, typecheck and build were attempted and their existing blockers are recorded below.

## Test Plan

Vitest pure unit tests with no DB, clock, network or secret. Cover all 14 required cases plus date/visit-data edge cases and status/reason shape. Run focused suite, full suite, typecheck, build and `git diff --check`.

## Expected Modules / Files

`apps/web/src/modules/trip-validation/visit-constraints.ts` and matching `*.vitest.test.ts`; this story and `docs/ai-progress.md`.

## Migration / Environment Impact

None.

## Implementation Sequence

1. Write failing contract/rule tests.
2. Implement the two small pure functions using existing date and destination conventions.
3. Refactor, run requested checks and record evidence.

## Acceptance Evidence

TDD: the first syntax-correct attempt failed because the module did not exist; a minimal stub then produced 17 expected failing tests. The implementation made all 17 pass, and an additional exact-window/24:00 test was added. The final focused count is 18/18. Related Trip requirement and validation selection passes 255/255 across 13 Vitest files. The project TypeScript scan reports no `trip-validation` diagnostics.

Root `npm run test` fails elsewhere: 21 Vitest files fail to load or run, including absent `fast-xml-parser` and other declared but uninstalled packages; summary was 49 files passed, 719 tests passed, 9 tests failed. Root `npm run check-types` fails on absent Tiptap/RAG dependencies and stale generated Prisma Client members; root `npm run build` fails on 17 unrelated module-resolution errors (starting with Tiptap). These commands were not called PASS. No schema, package, API, DB or UI code was changed for this task.

Root `git diff --check` exits 1 solely on the pre-existing conflict markers in `docs/ai-progress.md` (lines 570–573, 911–912 and 1606). It cannot pass until that unrelated merge is resolved.

## Open Questions / Blockers

- No current itinerary visit type or calling service exists; integration remains a later story.
- The working tree has an unrelated unresolved merge in `docs/ai-progress.md`. The US-29A progress entry is appended after its existing content without discarding either side; the document still needs its original merge resolved by the owner.

## Handoff Notes

No commit or push.

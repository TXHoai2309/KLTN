# US-08 — Quản trị viên ẩn/hiển thị điểm đến

## Status

ACCEPTED

## Goal / dependencies / source references

Sprint 2, owner Tô Xuân Hoài, priority Cao. Control destination publication on TXH; clean baseline `0f8e152` (accepted US-07). Dependencies: US-06 trusted authorization, US-07 Destination/UI and shared idempotent writes. Approved US-08 task, Product admin destination rules QTN-91..95 and existing-destination trip eligibility; System Specification admin visibility/write behavior; MH-12/MH-13 management context. No additional Figma screen assumed.

## Domain / authorization

HIDDEN remains accessible to Admin, excluded from normal public content and new itinerary candidates. VISIBLE is eligible for both. New records remain HIDDEN. Only exact trusted ADMIN may set either state; Guest401, Traveler403, missing/malformed ID404. No client role/header/query authority. Same-state setting is safe. Hiding changes visibility only (normal updatedAt metadata may change); preserves fields, days/intervals and historical references.

## API / write contract

PATCH `/api/admin/destinations/[id]/visibility`, strict JSON `{visibility:"HIDDEN"|"VISIBLE"}`, same origin, no query, required Idempotency-Key, private/no-store. Full explicit Destination DTO on confirmed SUCCESS. Generic US-07 PATCH still rejects visibility. Service checks Admin before mutation and inside transaction; update and response record commit atomically. Scope trusted actor + `destination:set-visibility`, hash includes ID and target. Same key/input replays; changed ID/target409 FAILED. Unexpected outcome UNKNOWN, retain identical input/key; reread before explicit retry. A reread alone is not confirmation of the original write.

## UI / eligibility boundary

List/card and existing edit status use a controlled visibility switch with adjacent confirmed-state text, pending lock, no optimistic state, and bottom-right success/error/warning. The action column contains only Chỉnh sửa. Hide has lightweight accessible confirmation, cancel writes nothing. UNKNOWN persists with explicit identical retry; edit details are independent and locked while visibility is pending/uncertain to avoid mixing operations.

One canonical VISIBLE persistence filter/predicate defines public and new-itinerary eligibility; nonexistent IDs cannot qualify. Tests prove fixture query/result exclusion. Public UI/API integration remains US-10. Planner integration remains future Trip story. No fake public/planner UI or claim of generated itinerary runtime.

## Migration / out of scope

Schema change: NO. Migration: NOT REQUIRED. Production migration: NOT RUN. No public discovery/search/filter/map/detail, Trip Planner, Culture/Favorite, delete/import/taxonomy/hour/duration/schema redesign or deployment.

## Acceptance criteria / test strategy

| Task | Criteria | Status |
| --- | --- | --- |
|125 BE/API|Admin-only explicit strict endpoint; transitions/same-state; invalid/extra400, missing404; replay/conflict; atomicity/no false success/preserved data|PASS|
|126 FE|List/card/edit explicit action; pending/double-click lock; confirmed badge/toast; FAILED retains state; UNKNOWN retains key/target/reconciliation; accessible hide cancel;360/768/1280|PASS|
|127 TEST|Canonical public/candidate excludes hidden/missing; field/schedule preservation; role/forgery/idempotency/UI regressions; development toggles and DB persistence/cleanup|PASS|

Run env generation, destination/authorization/account/auth tests, typecheck/build, diff-check. Runtime: development-only disposable destination, Admin show/hide/reload/DB read, cancel, Guest/Traveler denial, live replay/conflict, preservation and scoped cleanup. ACCEPTED requires actual development Admin toggle proof.

## Runtime / final evidence

2026-10-04, localhost:3001 with verified Neon development `ep-purple-pond-b3xujb8o`:

- Actual existing Admin session toggled one disposable destination HIDDEN → VISIBLE → HIDDEN from list, then repeated both transitions from edit. Direct DB reads and reload confirmed both states; confirmed edit toasts were observed. Pending text/disabled actions and detail fieldset lock observed; fieldset re-enabled after SUCCESS. Four confirmed toggles produced exactly four stored visibility responses: initial double-click and hide cancel added no write.
- Hide dialog focused Hủy, Enter cancelled without mutation, Escape dismissed and restored focus to the trigger; Enter submitted explicit show/hide actions. List/card/edit reviewed at360/768/1280px with no horizontal overflow. Native dialog adds no dependency. Temporary viewport reset; existing Admin identity/theme and the preexisting manual destination unchanged.
- Live stored response replay returned SUCCESS/replayed with zero transaction callbacks; changed target/key conflict409/FAILED with zero callbacks. Service replay used the stored trusted Admin ID in the test resolver plus the real persisted-role guard/database; this is not claimed as a second browser HTTP replay.
- Live Guest visibility PATCH401/FAILED, disposable Traveler PATCH403/FAILED and list403, including forged Admin headers/body; no protected DTO. Two isolated Traveler probe accounts were removed after use with account/session cleanup verified; final probe also checked verification cleanup.
- Canonical predicate/query fixtures returned visible A only, excluding hidden B and nonexistent ID; both public and new-itinerary rules tested. Development selector returned the test ID when VISIBLE and none when HIDDEN, always excluding a missing ID. Public UI/API integration remains US-10; Planner integration remains future Trip story. No public discovery or generated itinerary runtime claimed.
- Snapshot comparison after toggles preserved every non-visibility/non-updatedAt field and all seven OpeningDays/two intervals, including child IDs. Same-state setter is a no-op; deterministic transaction rollback and in-transaction role revocation tests pass. Trip/Culture/Favorite historical relations do not exist yet; mutation has no delete/rewrite path and does not claim live tests on those future relations.
- UNKNOWN/no false success: deterministic lost/malformed/mismatched DTO transport tests and UI contracts prove retained target/key, explicit reread then identical retry, no optimistic badge. No actual browser network interruption is claimed.
- Cleanup verified zero disposable Destination/OpeningDay/idempotency rows (intervals cascade with days); removed temporary smoke script and local snapshot. Browser list refreshed and contained no disposable item. Screenshots outside repository: `D:/KLTN/us08-evidence/`.
- Final validation: env:generate PASS; destination43/43, authorization21/21, account18/18, auth33/33 PASS; production build PASS with the new dynamic visibility endpoint; check-types PASS. A parallel typecheck initially raced Next's regenerated route types; sequential rerun after build passed without application changes. Tracked/new-file whitespace checks PASS; changed/new secret-pattern scan found zero matches.
- Schema change: NO. Migration: NOT REQUIRED. Production migration: NOT RUN. No unresolved US-08 blocker, commit or push.

## 2026-10-04 — Visibility switch UI follow-up

- US-08 remains ACCEPTED. Shared presentation-only `DestinationVisibilitySwitch` renders confirmed OFF/ON plus Đang ẩn/Đang hiển thị in the desktop status column, mobile card and edit status. Actions contain only Chỉnh sửa; create status remains read-only. Track42×24px, thumb18px,44px tap target, moss-green ON/gray OFF,180ms transition and reduced-motion support.
- Native button with role=switch, aria-checked/label/busy, clear focus ring and Enter/Space. Existing controller/API/authorization/idempotency/eligibility/schema/migration and hide confirmation copy unchanged. SUCCESS alone changes confirmed state; FAILED/UNKNOWN retain it and reuse existing explicit reconciliation/retry. Pending disables switches and edit detail saves; no optimistic toggle.
- Actual development Admin browser smoke: list double-click OFF→ON produced one stored operation, reload retained ON. Space/Enter opened hide confirmation; Hủy and Escape kept ON with no write and restored trigger focus. Confirmed hide retained ON during pending, then OFF; reload retained OFF. Edit Space showed and Enter confirmed hide, with disabled detail fields while pending and re-enabled fields after success. Show and hide success toasts observed. Four confirmed toggles produced exactly4 records; core fields and all7 OpeningDays/child IDs preserved.
- List/mobile and edit checked at360/768/1280px; document scroll width equalled client width at all sizes. Shared switch did not overlap Chỉnh sửa. Actual UI/keyboard smoke complements SSR/source contract tests; FAILED/UNKNOWN remain deterministic transport/UI-contract evidence, not a claimed browser network interruption.
- Scoped cleanup verified zero disposable destination/children/4 response records; temporary script/snapshot removed. Browser list no longer contained the test item. Existing manual destination/Admin/theme preserved; viewport reset. Screenshots outside repository at `D:/KLTN/us08-switch-evidence/`.
- Validation: destination45/45 PASS; check-types/build PASS; tracked/new-file diff-check PASS; secret-pattern matches0. Backend/client contract/schema hashes match the pre-polish snapshot. No new migration, dependency, commit or push.

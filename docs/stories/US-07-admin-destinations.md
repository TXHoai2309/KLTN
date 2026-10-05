# US-07 — Quản trị viên tạo và cập nhật thông tin điểm đến

## Status

ACCEPTED

## Goal / Owner

Admin creates and updates Destination foundation data. Sprint 2; Dev A / Tô Xuân Hoài. Clean TXH baseline `fe043b7`.

## Product references

Approved US-07 task; MH-12/MH-13, YCCN-76..81; Product admin destination and opening/minimum-duration requirements; System Specification admin destination behavior. Existing Product/technical docs and accepted US-06 authorization. No new taxonomy or Figma frame inferred.

## Scope

Destination persistence, seven-day hours, admin list/detail/create/full editable-field replacement, production admin UI, tests, development migration and scoped smoke. No US-08 visibility mutation, public discovery/search/map/detail, Culture/Favorite, seed/import, delete UI, media, planner, AI or Validator implementation.

## Data / validation contract

- Stable cuid ID. Name trim/NFC 1..200; description trim/NFC 1..10000; area/category 1..100, trim/NFC/collapse whitespace/lowercase vi-VN. Strings chosen because no closed taxonomy is approved; new dataset categories need no migration.
- Canonical coordinates are finite Double latitude [-90,90], longitude [-180,180]. No duplicate geometry column. PostGIS remains available for future derived spatial queries.
- Two independent nullable Int minute durations, each 1..10080 when supplied; NULL means unknown. No copying/fallback or minimum<=suggested requirement.
- Visibility enum HIDDEN/VISIBLE; create always HIDDEN; US-07 request excludes visibility, ID, timestamps and role. Visibility is read-only in forms; explicit publication belongs to US-08.

## Opening-hour contract

- Exactly seven unique enum weekdays MONDAY..SUNDAY; per day status OPEN/CLOSED/UNKNOWN. Default create schedule has seven UNKNOWN days.
- OPEN has >=1 interval; CLOSED/UNKNOWN have zero, with distinct persisted statuses. Maximum 24 intervals per day to bound requests.
- DTO uses HH:mm; persistence uses integer local minutes since midnight, Asia/Ho_Chi_Minh. Open 00:00..23:59, close may additionally be 24:00 (end of same day). No fake DateTime. Start<end; sorted by start; no overlap; touching intervals allowed. Overnight rejected.
- Destination + all days/intervals + idempotency result commit atomically. Update replaces the complete validated editable payload and seven-day schedule.

## Authorization / API

Canonical requireActor(...,"admin") before reads/writes; Guest 401, Traveler 403, Admin allowed. Pages redirect Guest with returnTo, render AccessDenied for Traveler before domain data. Missing destination 404.

- GET `/api/admin/destinations?page=1`: admin list, both visibility states, pages of 25, `{items,page,hasMore}`; no search/filter/public API.
- GET `/api/admin/destinations/[id]`: full explicit DTO including seven days and timestamps.
- POST collection / PATCH ID: strict complete editable DTO, same-origin JSON and required Idempotency-Key. Unknown query/body fields rejected; private no-store responses.

## UI / write semantics

List heading/CTA/columns from MH-12, loading/empty/error and responsive cards. Create/edit MH-13: basic/location/separate durations/full weekly editor/read-only visibility. Labels, field errors, keyboard, saving lock, confirmed success, retained FAILED/UNKNOWN draft.

SUCCESS only confirmed transaction response. Synchronous submit guard; same logical retry retains canonical payload/key. UNKNOWN freezes editing/cancel that could abandon the operation, permits explicit GET reconciliation (list for create, detail for edit) and explicit identical retry; GET never declares save success. No automatic write retries. After FAILED editing resumes. Cancel before uncertainty writes nothing.

## Migration impact

One additive migration `20261004070249_add_destination_domain` with Destination, OpeningDay, OpeningInterval, enums, FKs/uniques/indexes and numeric/time checks. Applied only to verified development endpoint `ep-purple-pond-b3xujb8o`; all five ledger entries finished, migrate status up to date. PostGIS/vector and all four auth tables verified present. Pooled migration connection initially timed out on the advisory lock; released only the executing connection's own Prisma lock and used a temporary process-only direct connection to the same endpoint. No persistent env/config change, production, db push or historical migration edit.

## Acceptance / test plan

Tasks 117..124: schema/migration ledger, independent durations, all opening-hour states and invalid schedules, canonical DTO, exact authorization, strict visibility boundary, missing IDs, atomic rollback, create/update replay/conflict, UI/transport states, development Admin browser create/edit and DB round-trip/cleanup. Run dedicated destination tests and all requested regressions/typecheck/build/diff-check. ACCEPTED requires actual development Admin create/edit proof.

## Cross-dev handoff

Destination.id is the future Culture relation target; no Culture relation added. Public stories reuse name/description/area/category/coordinates/durations/visibility but must implement their public filtering separately. EN-02 uses exact editable DTO fields, integer minutes/null, seven enum weekdays and distinct hours statuses/HH:mm intervals. Canonical coordinates only. Reuse Sprint 1 authorization/idempotency.

## Runtime evidence

2026-10-04, actual browser against localhost:3001 and Neon development:

- Guest direct list redirected to `/login?returnTo=%2Fadmin%2Fdestinations`, without admin data. Disposable Traveler signed up through the real UI; direct list/new/edit all rendered AccessDenied without destination data. Live list/detail/create/update API probes returned Guest 401 and Traveler 403, no protected DTO; denied writes were FAILED even with forged Admin body/header.
- Existing development Admin created one disposable destination using real form/POST. Double-click yielded one Destination, seven OpeningDays, two intervals and one successful response record. Default visibility HIDDEN. Monday OPEN 07:00–11:30 / 13:30–17:00, Tuesday CLOSED, Wednesday/rest UNKNOWN; suggested 90 and minimum 30 were independent.
- Admin edited name/description/area/category/coordinates, minimum 45 (suggested stayed 90), Monday second interval 14:00–18:00. Real PATCH succeeded; list, reloaded edit and direct DB read matched exact saved values. Taxonomy persisted normalized `mèo vạc` / `văn hóa`; visibility remained HIDDEN. Cancelled draft did not persist.
- Browser invalid latitude 91, duration 0 and overlapping intervals showed errors without another write. OPEN without an interval is prevented by the editor and rejected by deterministic server contract tests; invalid times/overnight/duplicate or missing weekdays/status inconsistencies are also fixture-tested.
- Live service replays of both committed browser operations returned stored SUCCESS with zero transaction callbacks; changed payload returned FAILED/409. Still one destination/two response records. Injected known failure after schedule deletion rolled back all seven days and produced no successful response record.
- Lost/malformed response UNKNOWN behavior is tested with deterministic client transport fixtures, not claimed as an actual browser network interruption. UNKNOWN retains payload/key, freezes editing and requires reread before identical retry; GET never confirms a write. Save notices require confirmed response, cannot be forged by `saved=1`; submission remains locked through successful navigation.
- Desktop table and 360px cards/form were tested with no horizontal page overflow. Name-to-description Tab focus worked; labels/errors and explicit status text are present. Saved screenshots are outside the repo at `D:/KLTN/us07-evidence/` (create/edit success, mobile list/edit, Traveler denial).
- Scoped cleanup removed only the disposable destination, children, two response records and two disposable Traveler accounts with linked accounts/sessions. Verified zero remaining test records; Admin identity/name/role was not modified. Temporary audit/migration/round-trip/HTTP scripts removed. No seed/import data, secrets, commit or push.

## Final AC matrix

| Task | Result | Evidence |
| --- | --- | --- |
| 117 Destination domain | PASS | Generated Prisma client, additive development migration, tables/enums/checks/ledger verified |
| 118 Opening hours | PASS | All status/interval/weekday validation fixtures; persisted seven days and two intervals; live atomic rollback |
| 119 Independent durations | PASS | Four null/present combinations and invalid values tested; runtime 90/30 -> 90/45 |
| 120 Admin API | PASS | Actual create/update/detail/list; Guest401/Traveler403; fixtures cover404, forged fields and both visibility states |
| 121 List UI | PASS | Real empty/loaded/success states and responsive browser proof; bounded loading/error/retry code verified by tests/review |
| 122 Create/edit UI | PASS | Actual weekly editor, validation, persisted reload, cancel, keyboard and360px smoke |
| 123 FE/API flow | PASS | Real POST/PATCH -> DB -> GET, confirmed DTO only, replay/UNKNOWN safeguards |
| 124 Regression matrix | PASS | Destination27/27, authorization21/21, account18/18, auth33/33 |

Final env generation, Prisma format/generate, development migration status, typecheck/build and diff-check results are also recorded in `docs/ai-progress.md`. No future visibility/public/Culture/Favorite/import story is claimed implemented.

## 2026-10-04 — UI/UX refinement

- User images are mood/layout references only. Reused the account/auth moss-green palette, subtle background, moderate card radii and input/focus language; header, menu and shared theme implementation untouched. No thumbnail/search/filter/sort/publication functionality inferred from reference images.
- List now has a balanced header, clear create/edit actions, icon/text visibility badges, table on desktop and cards on tablet/mobile, refined empty/loading/error and existing pagination.
- Create/edit sections have short descriptions, two-column desktop layout and one-column mobile, plus sticky save/cancel controls. Opening editor extracted with seven accessible explicit state selectors, minute-resolution native time inputs, add/remove controls and explicit 24:00 end-of-day checkbox. Native input/change events synchronize the same HH:mm DTO; timezone/status/duration rules unchanged.
- Existing Sonner handles success/error/warning at bottom-right. Field errors remain associated with inputs; missing numeric input gets safe Vietnamese copy. UNKNOWN also retains a persistent warning and same draft/key/reconciliation behavior. Success notice still originates only from a confirmed write, never a URL flag.
- Actual Admin browser checked list/new/edit, persisted values, validation toast/latitude/overlap, keyboard time editing/Tab, add/remove,24:00,CLOSED/UNKNOWN and cancel. List/form no horizontal overflow at360/768/1280px, light/dark reviewed. Fixed grid-constrained form background height so the background covers long content; viewport override reset.
- Browser automation's native-time fill changed the DOM value without firing React input state; verified this difference with DOM property/attribute, then used real keyboard events for overlap proof. Two smoke saves sent the original unchanged editable values and confirmed the success toast; normal updatedAt/idempotency results remain, no new destination/user or destructive cleanup. Subsequent interval/status drafts were cancelled and reload still showed original07:00–11:00 /13:00–17:00. No backend/API/auth/schema/migration/idempotency implementation changes.
- Destination30/30 (including new UI/24:00/accessibility/feedback regressions), auth33/33, typecheck and production build PASS; diff-check PASS. No package added, commit or push. Screenshots: `D:/KLTN/us07-ui-evidence/`.

## 2026-10-04 — Header-only polish

- Shared DestinationPageHeader now renders compact, aligned title/subtitle for list/create/edit with the requested copy. Removed uppercase eyebrow and large header icon plus their unused CSS.
- List CTA sits on the right on desktop/tablet and below text at360px. Create/edit reuse a bordered arrow-left secondary link to /admin/destinations with hover/focus styles; saving/UNKNOWN still hide it.
- Actual logged-in Admin browser smoke checked all three pages at360/768/1280px: no horizontal overflow, headers aligned with content, direct create/edit back links returned to the list; keyboard Enter activated create back. No save or mutation performed, no test data created. Temporary viewport reset, existing theme preserved. Screenshots outside repository: D:/KLTN/us07-header-evidence/.
- Validation: destination32/32 PASS (two additional FE header contract tests), check-types PASS, production build PASS, tracked/untracked diff-check PASS. Backend/API/schema/migration/authorization/core validation/idempotency/form fields/hours/toast/save behavior unchanged. No commit/push.

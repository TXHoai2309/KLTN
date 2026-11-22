# Ticket 01 — Backend verification, 2026-11-04

> Historical milestone receipt. Current behavior/status: [BE 06–10](06-10-backend-verification.md). The temporary new-save gate has been replaced by authoritative journey Save.

BE scope was explicitly authorized with “bắt đầu code be”. This receipt covers
ticket 01 only. BE verified; FE/integration pending. Tickets 02–10 have no new
implementation evidence from this receipt and are not DONE.

## Delivered boundary

- `POST /api/trip-origins/validate`: Traveler/Admin authentication before body
  work; matching Origin / same-site fetch metadata, JSON, 4096-byte bounded
  stream, strict allowlist, private-no-store success and failure. Request:
  `{ origin: { label, latitude, longitude, source, confirmed } }`. Generic success
  data is `{ revision: "origin-v1", origin, coverage }`. Coverage contains status,
  dataset ID/revision, attribution/license/source links. It certifies supported
  coverage only, never route availability, itinerary eligibility or persistence.
- Client-safe `trip-origin-contract.ts`: normalized NFC/trimmed label, finite
  coordinates, `MANUAL | NOMINATIM`, explicit confirmation. A selection edit
  clears confirmation. An omitted journey stays omitted for existing callers;
  a supplied object normalizes unknown origin/clocks to null. `journey: null`
  also means unknown. No default city, coordinates, departure time or return time.
- Additive `requirement.journey` / `proposal.journey`:
  `{ origin, departureMinute, returnDeadlineMinute, returnDepartureMinute }`.
  Clocks are integer Vietnam-local minutes 0–1439, timezone
  `Asia/Ho_Chi_Minh`, on first/final trip dates respectively. No overnight clock
  arithmetic is certified here. Return-only departure is conditional and remains
  required before Save if the final day has no visits.
- Requirement evaluate/check HTTP and the planner's service gate run server
  coverage checks. Manual input and a claimed Nominatim selection obey the same
  polygon test; a client country/coverage claim grants no exception.
- Shared review preserves journey across unrelated edits, clearing/restoring
  review fields and canonical confirmation; `updateDraftJourney` invalidates
  the review snapshot. Both proposal adapters preserve the additive field.
- Existing visit constraints continue to produce their actual findings. New-trip
  preview adds `JOURNEY_ROUTES_NOT_VALIDATED`, sets travel-time insufficient
  unless already violated, and cannot confirm. Form/Assistant planner results
  keep `eligibleForFinalConfirmation=false` until authoritative origin routing
  and persistence are delivered. Existing warnings disclose omitted journeys.
- New Save is intentionally blocked: incomplete journey gives
  `TRIP_JOURNEY_REQUIRED` (422); complete supported journey gives
  `TRIP_JOURNEY_VALIDATION_PENDING` (422). No new Trip or idempotency SUCCESS
  is written. This is the ticket-01 rollout gate, not completed journey Save.
  Tickets 03–06 must replace it with fresh full validation plus persistence.
- Historical committed `trip:create` receipts still replay before the new gate.
  Same key/different payload remains FAILED; unreadable receipt remains UNKNOWN
  with identical-key/payload retry. Historical replay is not a newly certified
  journey. Save/preview HTTP now establish auth before parsing bounded bodies.

## Coverage evidence

Full polygon, metadata, hash, license review, attribution and limitations:
[`data/README.md`](../../apps/web/src/modules/trip-origin/data/README.md).
Pinned geoBoundaries commit `9469f09`, boundary `VNM-ADM0-46766057`, CC BY 4.0,
represented year 2016. Tests cover mainland cities, Phú Quốc, neighbouring
countries inside Vietnam's bounding rectangle, sea, invalid values and an
uncertain boundary point. Holes and MultiPolygon components are respected.
Points within 0.001 degrees of a polygon edge fail closed to UNKNOWN.
This generalized dataset may omit small islands or current coastline details;
it is not a legal-territory or route-availability certification.

## Checks and receipts

- Focused Vitest command:
  `npx vitest run --config vitest.config.mts src/modules/trip-origin/trip-origin.vitest.test.ts src/modules/trip-requirement src/modules/trip-planner src/modules/trip-save src/modules/assistant-planning/planning-engine.vitest.test.ts`
  from `apps/web`: **443 PASS, 3 opt-in PostgreSQL cases skipped**, 27 files pass.
  PostgreSQL
  inventory cases are opt-in and skipped; unit/service mocks do not prove DB
  transactions. The old visit-only Save expectations were updated to the new
  gate, retaining actual visit-preview findings and historical receipt tests.
  A date-sensitive existing Assistant assertion now uses its injected fixture
  time rather than the wall clock.
- Root `npm run check-types`: four tasks PASS. Initial test mock type mismatch
  was corrected using `vi.spyOn(...).mockRejectedValue(...)`.
- `npm run build -w web`: PASS, 55 pages generated; production route includes
  `/api/trip-origins/validate`. No UI files or provider settings changed.
- `node .scratch/trip-origin/smoke-01.mjs`: production HTTP Guest smoke PASS;
  origin validation, new Save and validation preview all return
  `401 / UNAUTHENTICATED / private, no-store` for malformed JSON. No cookies,
  business writes or external provider calls; spawned server stopped in finally.
  Separate sandbox/host loopback attempts first failed EACCES/ETIMEDOUT; running
  the server and requests together in the same permitted environment succeeded.
- Full web Vitest was attempted: **not PASS**. 127 failed files / 203 passed /
  2 skipped; 75 assertion failures / 2510 passed / 11 skipped / 1 todo.
  114 suite setup failures include missing Vitest SSR temporary files (ENOENT),
  plus mock/authorization/source-audit failures outside this slice. Build and
  the full run initially overlapped; no claim is made that all failures are
  pre-existing or caused by resource contention. The focused suite was rerun
  separately. This run cannot certify full-repository regression acceptance.
- `git diff --check`: PASS. No schema/migration/generation, DB mutation,
  credential/environment edit, real routing/Nominatim request, commit, push,
  merge or deploy. The public coverage dataset was downloaded once with pinned
  provenance. Existing glossary/design/progress work was preserved.

## FE handoff and remaining work

Import contracts and synthetic fixtures from `modules/trip-origin`; server-only
coverage data/service must never enter a client import graph. Frontend needs to
bind journey through its form/controller, call origin validation, display dataset
attribution, require explicit pin confirmation, reset it on query/selection edit,
invalidate stale proposal/review and render unknown clocks. No local storage or
public URL should receive precise origin. The legacy readiness wire enum remains
unchanged; use `missingJourneyFields(requirement.journey)` for journey details.
The old UI readiness copy needs a preliminary/missing-journey branch; its current
date-only wording is not frontend acceptance.

No saved-trip/member/public DTO or DB projection was expanded: there is no
persisted origin to expose. Search, rest/routing/scheduling, origin persistence,
Assistant V2 structured operation, saved journey changes/legacy opt-in and live
integration remain tickets 02–10. Ordinary saved visit edits still use their
separate strict candidate contract; adding journey support does not opt them in.
No browser/manual-picker, authenticated deployed HTTP, PostgreSQL/concurrency,
shared migration or owner acceptance is claimed by this ticket-01 receipt.

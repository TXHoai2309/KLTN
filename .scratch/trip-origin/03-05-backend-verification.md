# Backend tickets 03–05 — 2026-11-04

> Historical milestone receipt. Current behavior/status: [BE 06–10](06-10-backend-verification.md). The temporary new-save gate has been replaced by authoritative journey Save.

**BE verified; FE/integration pending**, not vertical completion. New official
Save is still gated pending ticket 06. Assistant structured origin operation is
ticket 07; it is not claimed from form-planner delivery.

## Shared contract / boundaries

Existing `POST /api/trip-proposals` and `createPlannerService.propose` accept
the additive `requirement.journey` from origin-v1. Auth/normalization/server
coverage remain the existing boundaries. No new fake Destination or separate
planner was introduced: shared `schedulePlannerDays`, `validatePlannerDays`,
ordering heuristic and `requestStadiaRoute` are extended by the journey module.
Existing callers omitting journey retain their preliminary visit-only contract
and no final eligibility. A supplied incomplete journey gives qualified
preliminary output, never defaults unknown origin/clocks.

New optional `PlannerResult.journeyPlan`: policy `roadside-rest-v1`, ordered
`legs`, totals. Leg kind OUTBOUND/TRANSFER/RETURN, trip day, discriminated
endpoint reference `{kind: ORIGIN}` or `{kind: ATTRACTION,destinationId}`, route
status/reason/provider/seconds/metres/optional normalized geometry, nullable
start/end/rest minutes. Origin is not a destination ID. Coordinates remain in
the owner-private requirement, not a fabricated attraction. Complete route
totals separate drivingSeconds/restMinutes/distanceMeters; missing evidence
keeps affected totals null. Day travelSeconds/distanceMeters include each
boundary leg only once. Display elapsed travel as driving + rest; do not
label provider driving seconds as total including rest.

Day DTO optionally carries journeyDayKind VISITS/OUTBOUND_ONLY/RETURN_ONLY/EMPTY.
The existing five check keys, Vietnamese statuses, private envelope and phase
remain. New findings include JOURNEY_INPUT_MISSING, JOURNEY_ROUTE_UNKNOWN,
JOURNEY_REST_UNKNOWN, JOURNEY_CLOCK_UNKNOWN, RETURN_DEADLINE_MISSED,
OVERNIGHT_DRIVING_UNSUPPORTED, JOURNEY_REST_MISMATCH,
JOURNEY_TRAVEL_TIME_MISMATCH and JOURNEY_ARRIVAL_TOO_EARLY. Missing data is
INSUFFICIENT_DATA; an evidenced missed deadline/overnight is VIOLATION.
`eligibleForFinalConfirmation` remains false until fresh Save/persistence lands.

Fixtures: client-safe `journey-planning-fixtures.ts` supplies schema-checked
synthetic complete/missing one-day proposals. Service/HTTP behavior tests provide
multi-day and boundary-day expected outputs. No production runtime imports
fixture modules. No API response contains routing credentials/provider errors.

## 03 — one-day journey

Origin → first visit, directed adjacent visits, last visit → origin share a
single <=10-second deadline and at most three in flight. Boundary routing uses
the existing Stadia adapter with CAR/auto and MOTORCYCLE/motorcycle; both metrics
are mandatory. Coordinate endpoint adapter does not pretend origin is a
PlannerCandidate. Every exception/malformed/timeout path fails closed.

System rest uses exact driving seconds to avoid per-leg threshold rounding:
car 120 minutes / motorcycle 90, each break 15 minutes. Exact-threshold arrival
does not add final rest; subsequent driving retains that threshold until rest
or a >=15-minute visit resets it. Short visits retain accumulation. Independent
deterministic validation recomputes rest and checks schedule against evidence.
Rest is disclosed as planning allowance, not provider evidence or safety advice.
Sightseeing remains 08:00–18:00, verified openings/minimum duration. Boundary
travel may occur outside sightseeing hours; arrival >=1440 is unsupported.
Return starts after the last visit and includes rest before checking deadline.
No stop/day/mode/must-visit is removed to make a failed schedule pass.

## 04 — multi-day

Outbound on day 1, return on final day, existing attraction-to-attraction
cross-day transfer starts from the previous day's final attraction at the
existing 08:00 planning anchor. New-day driving accumulation resets. At most
28 attractions / 29 directed routes, at most three in flight, one whole-chain
deadline. Existing 27-pair resolver now shares the same worker primitive.
Origin influences bounded geographic ranking/orientation only; geographic
heuristics never become road metrics or clocks. No claimed global optimum.

## 05 — travel-only days

First outbound-only day uses the next day's first attraction as routing anchor,
without a day-1 visit or repeated origin transfer next morning. Final return-only
day uses the immediately previous day's final attraction and explicitly selected
returnDepartureMinute; missing clock remains unknown, never 08:00. A final day
with visits ignores that optional clock and returns after its final visit.
An arbitrary interior/multiple-empty boundary day is EMPTY, not valid travel-only.
All-travel/no-visits receives a truthful no-sightseeing finding; missing route
alone never proves infeasibility.

Form planning evaluates at most four bounded boundary partitions of the SAME
selected directed chain, only with verified route data: original, outbound-only,
return-only, both. It preserves selected IDs/order/day count/transport and pace
cap, makes no additional provider calls, and selects an alternative only if
actual constraints improve. Failure to find a partition does not prove every
possible itinerary impossible. The lower-level seam defaults to preserving the
given days for scoped callers. No lodging/visit/overnight coordinate invented.
Warning explicitly discloses that lodging entry/exit legs are not included.

## Verification / limits

- Journey behavior tests: one-day 16, multi-day 7, travel-only 6 (final results
  in handoffs). Boundaries/rest accumulation, exact clocks/deadlines, route data
  missing/malformed/timeout, independent rest mismatch, actual Stadia HTTP
  adapter mocked response (both modes), three-concurrent/29-pair budget,
  cross-day reset, no duplicate anchors, missing return clock, empty days,
  preserved IDs/days and existing form-planner HTTP covered.
- Regression command includes origin, requirement, planner, save and Assistant
  deterministic suites; actual count recorded in ticket handoffs.
- No new schema/migration in 03–05. Ticket 02 admission migration remains
  disposable-only. No official journey Save, shared DB writes, public-provider
  call, UI edits/browser acceptance, commit/push/merge/deploy.
- Typecheck/build and whitespace results are recorded at handoff. Full web
  suite limitations from ticket 01 remain; no full-green claim.
- FE still renders boundary/day timeline, travel/rest/totals, route geometry,
  conditional return clock and missing/violation states. Assistant V2 origin
  session/refinement/QA contract is ticket 07, persistence/privacy is 06.

# Backend tickets 06–10 — 2026-11-04

Local backend delivery, **FE/integration and final vertical acceptance pending**.
This current receipt supersedes the temporary new-save rollout gate described in
ticket 01 and the preliminary-only delivery notes in tickets 03–05. No shared
database migration or deployment is authorized/performed by these receipts.

## 06 — canonical Save / private read

`journey-save-v1`. Existing POST `/api/trips` keeps `{confirm:true,proposal}` and
the existing mutation envelope. Proposal includes origin-v1 journey. Service
checks confirmation/schema, auth, exact date, complete confirmed supported origin,
conditional return-only clock, <=28 nonduplicate attractions and fresh canonical
destination/opening/minimum data. It fetches all routes with the shared bounded
provider outside the transaction, validates the actual submitted visit clocks,
then rereads current data/rechecks role and constraints transactionally. Changed
coordinates invalidate server route snapshots. No client eligible/metrics/geometry
grants Save authority. Required distance/time missing never passes.

Nullable `Trip.journeySnapshot` JSONB stores only the validated owner-private
`{revision:"journey-save-v1",journey,plan,visitFingerprint}`. Additive migration
`20261104130000_trip_journey_snapshot`; no fabricated legacy backfill. Origin-v1
normalization/clocks/timezone remain. `plan.policy=roadside-rest-v1`; authoritative
provider projection, separate driving/rest/distance and boundary anchors retained.
Only successfully confirmed valid Trip is stored, not invalid long-lived draft.

GET `/api/trips/[id]` owner detail adds `journey` (null for legacy) and
`baseRevision`. Active-member detail omits both journey and owner revision;
public/member/summary DTOs never spread raw snapshot, precise origin, boundary
geometry or associated totals. Unrelated Admin has no private-read bypass.
If an ordinary/in-trip visit edit changes the recorded visit fingerprint, owner
read preserves origin/clocks but returns **plan:null** to withhold obsolete route
legs/totals. This is a stale-evidence disclosure seam, not a newly recomputed
whole journey; FE must explain that journey routes need revalidation. Ordinary
edit/in-trip rules themselves are not silently redefined by this feature.

Fresh proposal may advertise final eligibility when every shared check passes
and date/journey are complete. Official Save still fetches current evidence and
requires the separate user confirmation. Historical confirmed receipt replay runs
before new journey gates; exact key/payload reconciliation/conflict preserved.
Unexpected transaction diagnostics no longer log raw error/query parameters,
which may contain a private origin. SUCCESS only after DB commit; receipt lookup
uncertain -> UNKNOWN with same-key/payload retry. Known 400/422/409/ownership
failures map to FAILED through existing delivery helpers.

## 07 — Assistant V2 structured origin

Existing POST `/api/ai/planning`, action ASSISTANT_V2, new operation **ORIGIN**:
`{action,operation:"ORIGIN",sessionId,stateToken,journey}`. Journey is origin-v1
or null to clear. Distinct from in-trip LOCATION; it cannot accept a GPS/current
location payload, and in-trip sessions reject ORIGIN as unsupported. Existing
auth, key, encrypted actor/session/version capsule and shared head CAS govern it.

Planning session coverage-checks the selection and either reviews incomplete
minimum needs, generates from sufficient minimum needs, or refines the current
proposal through existing canonical review/generate/publication services. It
retains must-visits, mode/day constraints, versions and canonical proposal on
failure/rejection; uncertain publication freezes new origin mutation. It never
auto-saves. Changed journey participates in refinement comparison and proposal
fingerprint; needs/checkpoint/capsule/proposal adapters retain it. Name text/model
understanding alone cannot generate coordinates; FE must use the shared picker
and send the structured reviewed selection. Natural text geocoding/auto-pin or
in-trip GPS reuse is not implemented.

Assistant `scheduleSelection` calls the SAME journey scheduler/route policy as
form; whole-brief generation can use bounded boundary partitions, scoped edits
retain day membership and existing dependency-day acceptance. Generated selection
is synchronized to the actual scheduled day partition. QA retains journey,
needs, canonical generated proposal and workspace version. Same engine evidence
produces matching form/Assistant days/checks/legs. Existing explicit SAVE operation
calls canonical fresh validation/Save and its exact pending-intent lifecycle.
The backend operation is ready; full-page/popup picker wiring remains FE work.

## 08 — owned journey preview / confirm apply

`journey-edit-v1`, client-safe `journey-edit-contract.ts`:

- POST `/api/trips/[id]/journey/preview`:
  `{baseRevision,journey}`. Read-only; authenticates before bounded JSON and
  ownership. Response `{baseRevision,candidate,journeyPlan,validation?,check?,
  eligibleForConfirmation}`. Unresolved clocks yield **candidate:null**, never a
  fabricated applicable 00:00. Candidate is existing TripProposal + journey.
- POST `/api/trips/[id]/journey/apply`:
  `{baseRevision,confirmed:true,candidate}`, Idempotency-Key required.
  Existing mutation envelope. SUCCESS data tripId/baseRevision/validation;
  read back owner detail for canonical snapshot. Preview/cancel does not write.

Both APIs enforce owner-only access, same-origin, private-no-store, JSON and
64,000-byte input. Date/count/mode, visit IDs per day/order and planned durations
are preserved; this seam changes journey plus resulting clocks, not unrelated
visit selection/day scopes. Fresh server route/Validator work runs before the
transaction; role, revision, destination data, cutoff and checks rerun at commit.
Trip row lock plus CAS closes concurrent apply/completion/revision races. Existing
companion time-change notice is emitted transactionally without origin details.

Cutoff is the EXISTING saved departure date+clock in Asia/Ho_Chi_Minh, not the
new proposed clock; at or after cutoff and manual completion block. Malformed
snapshot fails closed. AppError codes: JOURNEY_CHANGE_CLOSED (409),
TRIP_REVISION_CONFLICT (409), JOURNEY_SCOPE_CHANGED (422), TRIP_DATA_CHANGED (409),
TRIP_VALIDATION_FAILED (422), TRIP_JOURNEY_REQUIRED / coverage errors (422),
JOURNEY_ROUTING_UNAVAILABLE (503), ownership 404; HTTP INVALID_JOURNEY_EDIT (400),
origin/content/body errors as other private APIs. Unexpected apply -> UNKNOWN.
Historical committed same-key apply may replay after cutoff; it performs no new
change. Different-key stale candidate conflicts and cannot apply twice.

## 09 — legacy ordinary edits and explicit opt-in

Legacy null snapshot is readable with owner journey:null. Existing ordinary
visit edit contracts/services keep their prior rules; no origin requirement is
added. `getTripForEdit` adds optional journeyDisclosure:
ORIGIN_LEGS_NOT_INCLUDED or SAVED_JOURNEY_PRESENT. Assistant saved-trip strict
schema accepts this additive field, never raw origin. FE should show the legacy
limitation. Legacy opt-in uses the SAME journey preview/apply boundary above,
full input/whole-journey checks and **00:00 Vietnam start-date cutoff** until a
departure clock exists. Preview/cancel leave null. Apply/readback/exact retry
work without inventing a historical departure clock.

## 10 — backend integration evidence and remaining acceptance

Local automated backend evidence is delivered; **vertical/browser/live acceptance
remains pending**, not DONE. Complete commands/results in ticket handoffs and
final progress entry:

- Expanded origin/Assistant V2/planning/requirement/planner/save/read/edit suites:
  **1084 PASS in 86 files / 29 opt-in/live cases skipped**. Origin DB suites run
  separately below. In-trip mock initially lacked queryRaw and
  companion delegate required by existing apply service; fixed the harness, not
  product authorization. Old Assistant Save fixtures now supply confirmed journey
  and coordinate route evidence instead of asserting visit-only eligibility.
- Search actual PostgreSQL: **5 PASS**, scoped migration1/zero pending;
  three independent OS worker admission, worker death, four-second reopen,
  cache/expiry and upstream timeout/immediate retry on another connection. Provider
  is mocked; no public service load or calls. Owned container cleanup PASS.
- Save/edit/legacy/privacy actual PostgreSQL: **10 PASS**, 25 actual relevant
  migrations including both new origin migrations, zero pending/failed ledger.
  Concurrent same-key Save and apply, exact conflict/replay, owner/member/public
  canaries, stale canonical minimum rollback, cutoff crossing during route work,
  manual completion/scope/role guards, legacy null/read/opt-in/cancel, actual
  ordinary legacy visit preview/apply/replay and stale-plan withholding.
- Actual PostgreSQL lost-ack test commits a Trip/receipt, then simulates lost
  transaction acknowledgement and unavailable receipt lookup -> UNKNOWN; exact
  retry reads the original SUCCESS without route calls or duplicate Trip.
  No mock-only claim substitutes for that DB transaction evidence.
- Root typecheck and isolated production build/smoke results in final entry.
  Full-repository Vitest was attempted earlier and not green (see ticket01).
  No full-green claim; no deployed authenticated or external AI/routing acceptance.

Final root `npm run check-types`: 4 tasks PASS. Isolated webpack production
build PASS, 56 pages generated; existing Varlock warning. Production Guest smoke
against the built app: origin validate/search, Trip Save/validate, journey
preview/apply and Assistant planning all return 401/UNAUTHENTICATED/private-no-store
before malformed body parse; server cleaned up. `git diff --check`, new-file
whitespace, handoff links and pinned coverage hash PASS. No FE/component/CSS or
actual environment-value file edits detected. Final integration-test callback
type was corrected after a typecheck failure; product sources were already built.

Frontend acceptance still needs manual/search picker, confirmation invalidation,
clocks/review/disclosure, daily/whole-trip timeline/maps, Assistant full-page and
floating operation transport, saved preview/cancel/apply/UNKNOWN recovery,
legacy opt-in, responsiveness/keyboard and live authenticated browser journeys.
Production search requires an operator-owned NOMINATIM_CONTACT and deployed
search tables; empty contact intentionally returns unavailable. Both migrations
are created and exercised only in owned disposable PostgreSQL, **not applied to
Development/Production**. No deployment, push/merge, real provider call, credential
or actual `.env` change. Do not deploy partially without the new columns/tables.

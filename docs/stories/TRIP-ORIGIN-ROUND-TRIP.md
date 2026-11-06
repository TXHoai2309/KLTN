# Trip origin and return journey

## Status

IN PROGRESS — Backend authorized 2026-11-04 by “bắt đầu code be”. Approved
Q1–Q22 and ten local tickets retain their product scope and vertical blockers.
BE tickets 01–09 and the backend integration portion of 10 have local receipts;
FE/browser/live vertical acceptance remains pending.
No story acceptance or full-feature completion follows from this milestone.

Current contracts and limits: [BE 06–10 receipt](../../.scratch/trip-origin/06-10-backend-verification.md).
The earlier temporary new-save gate was replaced by authoritative journey
Save/persistence; both new migrations remain unapplied to shared databases.

Backend may proceed under the existing authorization; shared migration apply,
push/merge/deploy still require separate instructions. See the
[local index](../../.scratch/trip-origin/README.md), [ticket 01 handoff](../../.scratch/trip-origin/issues/01-manual-origin-and-times.md)
and [verification/limits](../../.scratch/trip-origin/01-backend-verification.md).

## Design closure and implementation boundary

Product interview decisions Q1–Q22 are settled. Q22: return starts after the final visit, or at the selected time on a return-only day from a disclosed last-attraction anchor. Ordinary EDIT currently has no equivalent status guard; getMyTrip admits active members. Journey routing/persistence/lifecycle remain planned changes. Ticket 01 adds contracts, manual coverage validation and new-save gates only. Do not mark this story IMPLEMENTED/ACCEPTED from backend milestone evidence.

## Goal / User Story

As a Traveler/Admin planning my own Hà Giang trip, I want to choose my actual departure location and outbound/return times so that the itinerary fits travel to Hà Giang, sightseeing and returning home within my chosen days.

## Sources and dependencies

- [Approved interview Q1–Q22](../implementation/trip-origin-design.md).
- [Product planning, Validator and save invariants](../product/product-spec.md).
- [User flows](../flow/user-flow.md), [technical architecture](../architecture/technical-architecture.md).
- [US-28 current origin limitation](US-28-trip-planner.md); existing official Trip Save/Edit and Assistant V2 runtime.
- Existing MapLibre pin picker; server-side Stadia routing. Named-location search is a new dependency, not an existing capability.
- Current HTTP planning serves V2; implement against repository truth and document stale V1 rollout descriptions where relevant.

## Approved scope

- Search for an origin and explicitly confirm its coordinates on a map; manual map-pin/coordinate input must remain usable if search fails. A default viewport is never an origin selection.
- Capture departure time on Day 1 and latest return time on the final day, in Vietnam local time. Return endpoint is the same confirmed origin.
- Total duration includes outbound travel, sightseeing and return. One supported car/motorcycle mode applies throughout.
- Calculate origin → first attraction and last attraction → origin using authoritative routing, and include both in scheduling, checks and displayed travel totals.
- Sightseeing retains the 08:00–18:00 planning window and verified destination opening hours. Travel may occur outside that window within the user's selected calendar day. Overnight driving into another date is unsupported in this slice.
- First/final days may contain travel only. Distinguish valid travel-only days from empty days caused by missing data. A trip with no time for sightseeing is not a feasible sightseeing itinerary.
- Incomplete origin/time data permits a clearly qualified preliminary proposal, but blocks new official save. Routing failures produce INSUFFICIENT_DATA, not PASS or invented metrics.
- Apply consistently to the structured form, active Assistant V2, proposal conversion, authoritative save/edit and saved-trip reads.
- Changing origin/times recalculates the affected schedule and checks. Existing saved data remains canonical until explicit confirmation and confirmed database write.
- Existing trips remain readable with a missing-origin disclosure. No fabricated backfill or automatic itinerary change.
- Automatically calculate roadside rest as a separately disclosed planning allowance; do not require user-entered rest. Q18: 15 minutes per 120 minutes driving for car / 90 for motorcycle, only before reaching the endpoint; visits of at least 15 minutes reset accumulated driving time. Never replace unknown routing with a computed rest total.
- Only the owner receives precise origin data or origin-leg geometry; companion public/member projections must not automatically disclose it.
- Origin coverage is Vietnam-only for search and manual selection. Changing saved origin/times is allowed only before departure and before manual completion; enforce on the server. Q21: use Vietnam departure date/time, or 00:00 of the start date for legacy missing-clock trips; preserve existing date-based status labels.
- Q19: a travel-only first day uses the first subsequent attraction as an explicitly disclosed routing anchor, not a lodging location or a Day1 visit.
- Q20: legacy Trips may retain ordinary visit edits under existing checks with a missing-journey disclosure. Opting into journey planning requires complete data, whole-journey validation and Q17/Q21 lifecycle guards.
- Q22: a final day with visits returns immediately after the final visit; a return-only day uses the explicit Q13 departure time and prior final attraction as the disclosed routing anchor. Do not count that return leg twice.

## Out of scope

- Bus/flight transfers, rentals and mixed-mode transport.
- Attractions outside Hà Giang, overnight driving, invented lodging stops, lodging bookings and complex route optimization.
- Automatic extra days, silently dropping must-visit destinations, bypassing Validator, automatic Save, shared Trip editing or Admin private-read bypass.

## Authorization and writes

Origin search and personal planning require the existing Traveler/Admin capability. Establish auth before body/provider work. Server modules enforce ownership independently of UI or IDs. Search is read-only; applicable Trip writes retain SUCCESS/FAILED/UNKNOWN and identical-payload/key reconciliation. Revalidate both origin legs against current canonical destinations before accepting save/apply. Keep all provider credentials server-side and out of errors, logs and DTOs.

## Acceptance criteria

- [ ] A chosen origin has a reviewed label and valid coordinates; changing search text cannot silently preserve a stale confirmed location.
- [ ] Departure/return times survive form review, planning, Assistant refinement, proposal conversion, persistence and saved-trip reads without defaults replacing unknown values.
- [ ] Equal attraction selections with different origins or departure times can produce different route orientation/arrival times based on real route evidence.
- [ ] The final visit leaves sufficient time to return by the selected deadline; a one-day trip respects both outbound and return constraints.
- [ ] Missing/rejected/timed-out routing cannot pass checks or permit official save; direct HTTP requests cannot bypass origin/time validation.
- [ ] Travel-only first/final days are represented and validated, while all-travel/no-sightseeing and overnight-driving cases receive truthful outcomes.
- [ ] Explicit must-visits, opening hours, visit minimums and unrelated edit scope remain enforced; infeasibility proposes a user decision instead of silently changing constraints.
- [ ] UNKNOWN retries preserve the exact confirmed origin/time payload and key; changed payload/key conflicts do not duplicate Trips.
- [ ] Existing Trips read without origin fields, show missing information and are not changed by merely opening them.
- [ ] Form and Assistant support map/search unavailable, no results, stale responses, keyboard use and narrow screens.
- [ ] Rest-policy boundary cases and accumulated driving match Q18; rest is displayed separately and included in deadline/overnight checks, never silently removed to make a schedule pass.
- [ ] Travel-only departure/arrival anchors and return timing follow Q13/Q19/Q22; no invented lodging, duplicate transfer or fictitious visit is created.
- [ ] Owner/member/Guest/Admin tests prove no structured origin/address/geometry disclosure beyond the owner; all API paths enforce origin-change lifecycle guards.
- [ ] Vietnam coverage is validated for both search and manual coordinates using reviewed coverage evidence, not just a bounding rectangle or provider search filter.
- [ ] Prisma additive migration, migration-state inspection, relevant tests/typecheck/build, browser checks and git diff --check are recorded before implementation completion.

## Search provider decision

2026-11-06: the owner replaced public Nominatim with Stadia Geocoding so origin search can suggest while typing (public Nominatim forbids autocomplete and failed live). The section below is the superseded earlier selection. The `origin_search_*` tables and Nominatim adapter are no longer used by runtime; results still carry `source: "NOMINATIM"` because that is the stored enum. No search cache or shared rate limit applies now, so Stadia quota needs watching.

## Selected search provider and dependencies (superseded)

Owner selected MapLibre + public Nominatim for explicit origin searches, keeping Stadia routing. Implement the official Nominatim policy: application-wide admission across instances, cache, identifying headers, OpenStreetMap attribution, configurable provider endpoint, ODbL obligations and no personal/confidential query data. No autocomplete. Keep manual map-pin input available when search is unavailable. Google APIs and a Stadia upgrade are outside the selected plan. Shared admission/cache, application identification and live verification remain planned dependencies; no subscription/provider configuration/credentials have been changed.

## Verification so far

Repository/source investigation and documentation whitespace checks are complete. Implementation was briefly started due to a misunderstanding, then all application/schema/config/migration edits were removed when the owner clarified plan-only scope. Generated environment types and Prisma client were restored from the unchanged schemas. No migration was applied, no product database writes were executed, and no test/build/browser acceptance or deployment is claimed. Only glossary/design/story/progress documentation remains changed.

## Backend milestone — 2026-11-04

Ticket 01 supplies the additive client-safe origin/time contract, server polygon coverage checks, manual validation HTTP, review/proposal preservation and fail-closed new-save gates. New official Save remains unavailable until journey routing and persistence are delivered in later tickets. Historical committed saves can reconcile through the existing receipt. No schema/migration/DB write or FE implementation in this milestone. See linked ticket/receipt for checks, full-suite failures, coverage limitations and remaining work. Earlier plan-only verification above records history, not the current coding authorization.

## Current backend continuation — 2026-11-04

Backend delivery now covers search/shared admission, shared routing/rest and boundary-only days, canonical fresh Save/private read, Assistant V2 structured origin, owned saved journey preview/apply and legacy explicit opt-in. Current evidence/limits: [06–10 receipt](../../.scratch/trip-origin/06-10-backend-verification.md). The previous ticket-01 temporary Save gate is superseded. Two additive migrations have only disposable PostgreSQL evidence, not shared apply. All unchecked acceptance criteria retain their vertical status pending FE/browser/live integration; this is not story acceptance.

## Development migration follow-up — 2026-11-05

The owner authorized Development migrations. Prisma migrate deploy applied
`20261104110000_origin_search` and `20261104130000_trip_journey_snapshot` to
the verified Development database; both are recorded as finished. An empty,
untracked migration directory had to be removed after Prisma reported P3015.
Searching Hà Nội in the local app still returned unavailable after migration;
a separate direct provider connection was reset. Live search remains unverified.
Production was not migrated at that time.

## Form scheduling fit — 2026-11-06

Form proposals with an origin now search all day boundaries of the same chain, then drop trailing auto-selected stops with a `JOURNEY_STOPS_REDUCED` warning when no boundary fits. Assistant planning gets the boundary search only and never drops a stop. Unverified routes never trigger a drop. Verified by unit tests with synthetic routes, not live Stadia or a browser.

## Production migration — 2026-11-06

After the deployed trip detail page failed, the owner authorized Production. `prisma migrate status` showed `20261104110000_origin_search` and `20261104130000_trip_journey_snapshot` pending on the Production database; `prisma migrate deploy` applied both.

## Scheduling rules — 2026-11-07

Owner asked to apply these immediately, using the values proposed in session. They are planning allowances, not verified road facts, and can be revisited.

- Route durations are capped to an average of 50 km/h by car and 40 km/h by motorcycle, in `createStadiaRoutesProvider`, so planning, Assistant and Save validation agree. Provider times gave 76-91 km/h on these roads.
- Journey schedules leave 60 minutes for lunch when a visit ends 11:30-14:00 and another visit follows that day.
- A day driving over 8 hours by car or 6 by motorcycle gets a non-blocking `LONG_DRIVING_DAY` warning.
- Well-known destinations are kept first when there are more places than slots and dropped last when trimming. This is a name list in code until Admin has a field for it.
- Saved trips show the destination's own photo, falling back to the scenic picture when the link is broken. Ordinary trip edits still validate against uncapped provider times.

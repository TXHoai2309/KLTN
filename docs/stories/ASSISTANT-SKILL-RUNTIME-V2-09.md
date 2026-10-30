# V2-09 — Trip Structure & Overnight Reasoning

## Status and scope

IMPLEMENTED with controlled tests and live-provider acceptance against the Development DB,
2026-10-30 (see "Live closure"). No commit of this slice, no push, no deployment. V2-10 is
not started.

V2-08 left "2 ngày 1 đêm" understood as `durationDays = 2` only; the night was dropped and
the proposal never said where day 1 ends, where the traveller pauses, or how day 2 continues.

Sources: [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
[V2-08](ASSISTANT-SKILL-RUNTIME-V2-08.md), [ADR-33](../decisions.md).

## Definitions

- **Trip structure:** days plus the nights the user stated, kept as separate facts.
- **`overnightCount`:** nights the user explicitly said they will stay. Never derived from
  `durationDays`. `null`/absent means "not stated" and behaves exactly as before.
- **Overnight anchor:** the *area* in which a night between two itinerary days falls. It is
  the `area` of the last stop of that day (derived) or an area the user chose (explicit).
  It is an annotation, not a stop: it never adds to the stop count and is not a visit.
- **Lodging suggestion vs booking:** the assistant may suggest an *area* to pause in. It never
  names a hotel/homestay, a price, availability, or offers to book. No lodging data exists.

## Findings that shaped the design

- Cross-day continuity already exists: `plannerRoutePairs` flattens all days, so the leg from
  the last stop of day N to the first stop of day N+1 is already charged to the morning of
  day N+1 and the proposal already warns `ORIGIN_AND_LODGING_UNKNOWN`. No routing change.
- The only grounded locality is `destination.area` (string). An explicit area counts only if
  some eligible destination belongs to it; otherwise the assistant says so and offers known
  areas instead of inventing one.
- `trip.durationDays` is the only persisted duration. Nights live in `PlanningNeeds`
  (`tripStructure`), not in `requirement`: no form, Save, DB or migration change.
- The model call uses OpenAI strict `json_schema`: new understanding fields are required and
  nullable; the lenient local default is stripped from the schema sent to the model.

## What changed

- `PlanningNeeds.tripStructure = { overnightCount, overnightAreas?[{ afterDay, area }] }` and
  `overnightCount` / `overnightArea` in the V2 understanding (V1 forces both to null).
- `assessTripShape`: more nights than days → one controlled clarification, never a silent fix.
  Latest explicit value wins; an inconsistent correction leaves the last valid value.
- Explicit area: resolved to the canonical `area` of real destinations; which night is asked
  only when several nights exist and none was named; unknown areas are refused honestly.
- Planner: the preference is applied by **code**, not by prompt. `arrangeOvernightAreas`
  reorders inside the day or swaps the day-end stop with a stop of that area from another
  day (stop counts, the set of stops and pace limits unchanged); the Validator then judges
  the result as usual. The model never sees the preference (live: telling it "end day 1 in X"
  made it over-pack a day, `PACE_LIMIT`). If no selected stop belongs to the area the
  proposal carries `overnightUnmet` and says so. No extra model call.
- A night area that could not be built (refinement failed or was rejected) is not adopted:
  the committed setting stays, the reply says so, and later rebuilds are not poisoned.
- Refinement: only a changed overnight *area* rebuilds the itinerary; changing the count alone
  is recorded without rebuilding.
- Guidance: `analyzeCurrentProposal(proposal, tripStructure)` derives `overnights`
  (area, next-day leg minutes, source USER/DERIVED) and `LATE_ARRIVAL_TO_OVERNIGHT` (in
  addition to `LATE_FINISH`). Proposal and guidance wording state "N ngày M đêm", the area to
  pause in, and that it is an area suggestion, not a booking. The wording gate rejects lodging
  names/prices/availability claims and requires naming an unmet area.
- Survives capsule transfer (`tripStructure` is part of `PlanningNeeds`).

## Verification

`planning-trip-structure.vitest.test.ts`, `planning-guidance.analysis.vitest.test.ts` and
existing suites: parsing (`2 ngày 1 đêm`, `3N2Đ`), days-only unchanged, inconsistency,
correction, cross-worker, regenerate, explicit/unknown/ambiguous area, retry with repair
note, honest unmet preference, advice read-only (version/needs unchanged, no generation),
homestay request stays on the QA/unsupported side, strict-schema contract.

## Not done / accepted limits

- Dev `[TEST]` fixtures decide which areas exist (areas are lowercase labels such as
  "đồng văn", "mèo vạc", plus a generic "khu vực hà giang"); a night in an area with no
  selected stop is reported as unmet. Not changed.
- Nights are planning state only: after Save the chosen areas are not persisted with the trip
  and in-trip/saved-trip views do not show them (no schema change by design).
- Changing the night area rebuilds the whole itinerary (existing refine action); a
  scope-limited replan of days N and N+1 is deferred.
- The arranger only uses stops the model already selected; it never adds a stop from the area.
- "Quay đầu" is never claimed; only the measured next-day leg minutes are stated.
- Deferred: accommodation research, booking, prices, weather, transport-night semantics,
  persisted overnight on the Trip (V2-10+).

## Live closure (2026-10-30)

Real model, Stadia routing and the Development DB (endpoint identity checked) through
`apps/web/scripts/assistant-v2-09-live.mjs`; one disposable owned user (deleted afterwards).
Read-only SELECT first: visible destination areas are `khu vực hà giang` (3), `đồng văn` (3),
`mèo vạc` (2), `quản bạ` (1). Final run: 12/12 steps passed.

- "lên hành trình đi Hà Giang 2 ngày 1 đêm bằng xe máy": 2 days, 1 night, motorcycle in one
  turn, no repeated question, proposal states "2 ngày 1 đêm" and suggests pausing in đồng văn.
- "đêm đầu nên nghỉ đâu?": read-only guidance naming the area, no hotel; version and proposal unchanged.
- "tôi muốn ngủ mèo vạc": rebuilt; day 1 ends at Đèo Mã Pí Lèng, source USER.
- "lập lại lịch" keeps nights and area; an area with no selectable stop ("khu vực hà giang") is
  reported as unmet and a following rebuild still works.
- "tôi muốn ngủ Sapa" asks once with the known areas; "2 ngày 5 đêm" clarifies; "2 ngày" unchanged;
  "tìm homestay" is unsupported; a night bus is not counted as a stay-night.

Defects found live and fixed: (1) prompting the model with the night area made it over-pack a
day (`PACE_LIMIT`) - now applied by code and hidden from the model; (2) an unbuildable area stayed
in needs and failed every later rebuild - now not adopted; (3) "khu vực khu vực" wording.
Limits: model-call counts and the raw classifier output are not exposed by the API (outcomes only);
three earlier live runs failed A4/A8 before these fixes.

# US-13 — Người dùng xem chi tiết điểm đến

## Status

ACCEPTED — tasks153–156 re-evaluated after real MapLibre/Stadia Detail smoke (2026-10-05)

## Goal / owner / baseline

Sprint2, Tô Xuân Hoài, priority Cao. Public destination detail for Guest, Traveler and Admin. Clean TXH baseline `3e54807`; committed US-07 `0f8e152` and accepted/committed US-08 verified before editing.

## Source references / dependencies

User-approved US-13 tasks153–156; Product sections4 (public role matrix),5.4.2,6.5.4/MH-03, NT-23..25; System Specification3.4/3.5. Repository Destination schema and accepted US-07/08 are implementation truth. Figma frames unavailable: layout follows this task's approved direction and existing typography/theme, no inferred Figma evidence.

US-09 Culture/domain/relation, US-10 Explore, US-12 Maps, source/provenance and Favorite/AI integrations are absent from this baseline. Do not copy another branch or fabricate their schema/media/content. Culture retrieval is BLOCKED BY US-09; Map integration awaits US-12. These mandatory dependencies prevent full story acceptance.

## Public contract

- Page `/destinations/[id]`; GET `/api/destinations/[id]`, no login or role exception. Server component and thin HTTP adapter reuse one service and canonical `visibleDestinationWhere`. Uncached dynamic reads and API `Cache-Control: no-store` observe later hiding on refresh/new read.
- Public allowlist: id/name/description/area/category/latitude/longitude/suggestedDurationMinutes/openingDays/relatedCulture. No visibility/timestamps/minimumDuration/admin metadata or mutation DTO. Minimum is validator data, not the suggested duration; never substitute either field. `relatedCulture: []` is explicitly empty until the canonical relation lands, not evidence of integrated Culture. Source info omitted because there is no source model.
- VISIBLE query alone selects public content. If it has no match, an ID-only existence read distinguishes404 DESTINATION_NOT_FOUND from410 DESTINATION_UNAVAILABLE. Hidden data is never selected/serialized as public detail; even Admin uses public semantics. Database/system failures remain500 and page load error, never unavailable. Malformed IDs follow existing404 validation; API query parameters rejected400.
- Weekly canonical seven days: OPEN intervals sorted, HH:mm including24:00; CLOSED → Đóng cửa cả ngày; UNKNOWN → Chưa có dữ liệu. Local timezone Asia/Ho_Chi_Minh. Suggested duration formats45 phút/1 giờ/1 giờ30 phút/2 giờ; NULL remains Chưa có dữ liệu.
- Factual location shows area/coordinates only. No invented address, reverse-geocoding, map, media or source. Culture section has truthful empty state. Back navigation goes to existing `/`; no dead Explore/Favorite/AI controls.

## UI / errors / scope

Consumer-facing text/gradient hero, tags, visit/location/culture cards, weekly hours, shared site header/theme, responsive light/dark. Loading segment, distinct not-found/unavailable and client error boundary with retry. Private data is not supplied to those states. No admin UI/API/authorization/visibility-write/schema/migration modification. No discovery/search/filter/map stack/Culture management/Favorite/AI/Trip/media scope expansion.

## AC matrix / evidence

| Task | Status | Evidence |
| --- | --- | --- |
|153 public read API|PASS|Strict allowlist/canonical query,200/404/410/500 tests; live Guest/Traveler API and SSR reads|
|154 detail screen|PASS|Actual Admin-public valid/loading/missing/unavailable browser; SSR error state/real retry contract; light/dark,360/768/1280|
|155 location/hours/duration/Culture|PASS|Canonical US-09 summaries/source + shared MapLibre/Stadia own-coordinate map; real browser and regression tests|
|156 availability|PASS|Live visible and missing; accepted US-08 hide → refresh unavailable/no field leak; injected DB failure500 fixture|

Schema change NO. Destination migration NOT REQUIRED. Production untouched. Earlier baseline/dependency notes below are historical; current acceptance evidence follows.

## Runtime evidence — 2026-10-04

- Verified Neon development endpoint `ep-purple-pond-b3xujb8o`; disposable fixture only. Created HIDDEN fixture with factual text, normalized area/category,23.164/105.409,90 suggested/45 minimum, Monday07:00–11:00 and13:00–24:00, Tuesday CLOSED and five UNKNOWN days. Existing Admin used accepted US-08 browser switch to publish, later confirm hide. No production/schema/migration/other record edits.
- Guest live HTTP public API200 with exact strict DTO and public SSR exact values, no authentication or redirect. Authenticated disposable Traveler session verified through Better Auth; same API200/SSR exact data. Both repeated after hiding: API410 with no data/details and SSR unavailable without fixture name/description. These are live HTTP/SSR probes, not separate Guest/Traveler browser sessions. Existing Admin browser viewed the same public detail; no Admin bypass for HIDDEN after refresh. Direct browser navigation to JSON API was blocked by the browser client, so no independent Admin-browser API status is claimed; deterministic role-invariant adapter tests plus actual Admin page prove public semantics.
- Actual Admin browser showed title/description/taxonomy/coordinates/1 giờ30 phút, seven weekdays, two intervals including24:00, Đóng cửa cả ngày and Chưa có dữ liệu. Loading segment was observed during navigation. Missing valid-form ID rendered Không tìm thấy điểm đến. Hidden-after-refresh rendered Điểm đến không còn khả dụng with no private text. Live missing/malformed API404 and missing SSR confirmed. DB500/error retry are deterministic fixture/source-contract proof; no development outage was induced.
- Light/dark screenshots inspected; list of detail sections readable at360/768/1280. Document scroll width equalled client width (345/753/1265 after scrollbar) at every size. Existing theme restored to Dark, viewport reset; shared navbar untouched. Evidence outside repository: `D:/KLTN/us13-evidence/`.
- Cleanup verified zero disposable Destination/OpeningDays/intervals (cascaded)/two visibility response records; both scoped Traveler users/accounts/sessions/verification removed. Temporary smoke script removed. Existing Admin identity and preexisting manual destination unchanged.

## Validation / limitations

- env:generate PASS; destination59/59 (45 existing +14 public), authorization21/21, account18/18, auth33/33 PASS; check-types PASS; production build PASS including both dynamic public routes; tracked/new-file diff-check PASS. Secret-pattern matches0. Existing US-08 source assertion was made newline-independent after committed files checked out CRLF; no behavior changed.
- No source/provenance/media model, Culture relation, Explore route, Maps provider, Favorite or AI integration exists. `relatedCulture: []` is not integrated retrieval evidence. Map is factual coordinates only; no map runtime claimed. Merge canonical US-09 before Culture integration; integrate US-12 Maps when available and US-10 navigation separately. No invented branch names or source links. Status must remain partial until mandatory dependency is implemented and tested.
- Schema changed NO; migration NOT REQUIRED; no db push/production/commit/push. Final status/stat reviewed; changes limited to US-13 files, test command, newline-tolerant existing test and documentation.

## 2026-10-05 — US-09 Culture dependency integrated

The US-09 canonical schema/relation and eligibility filter now replace the former empty relatedCulture boundary. Task155 Culture portion PASS: bounded related visible summaries/source fields, hidden/unrelated exclusion and hide/show with preserved links are proven by deterministic tests, actual Admin public browser and Guest/Traveler live HTTP reads. Disposable fixtures cleaned, existing data unchanged. Summary cards have no dead Culture-detail links and external sources are validated http/https with safe attributes.

153/154/156 remain PASS;155 factual location/hours/duration/Culture PASS. Maps provider remains absent and awaits US-12; do not interpret Culture integration as Map runtime or full acceptance of that dependency. Earlier evidence above describes the historical pre-US-09 baseline. No Explore/full Culture detail/Favorite/AI integration claimed.

## Historical — initial US-12 Google prototype (superseded below)

Location now mounts the same Client DestinationMap/official singleton Google Maps loader as Explore, using exact own latitude/longitude and one marker. Existing information/hours/Culture and unavailable boundary preserved. Deterministic SSR/provider/marker/lifecycle tests pass; actual Admin hide → refresh unavailable with no map/location DOM, show → information/Culture restored. Missing-key provider error is readable and does not break detail. Detail360/768/1280 has no overflow in this error state. Disposable fixtures/relations/responses cleaned, existing data unchanged.

Real Google tiles/marker runtime still awaits operator browser-key configuration; this addition does not mark that dependency or US-13 fully ACCEPTED. US-12 search/filter task149 separately awaits US-10/US-11.

## 2026-10-05 — final dependency / acceptance re-evaluation

Current Culture dependency resolved by canonical US-09; current map dependency resolved by shared MapLibre GL JS6.12 + Stadia infrastructure. Google prototype/key/billing wait above is superseded, not current implementation. No Destination/API/Culture business logic changed for provider replacement.

| Task | Final | Re-evaluated evidence |
| --- | --- | --- |
|153|PASS|Destination61 tests rerun: public VISIBLE/strict DTO/no role exception,404/410/500; unchanged live Guest/Traveler API evidence|
|154|PASS|Actual Admin-public and Guest Detail render; light/dark and360/768/1280 without overflow; existing loading/error paths preserved|
|155|PASS|Real own-coordinate23.16/105.4 marker and Stadia basemap, seven UNKNOWN days/1 giờ; canonical related Culture summary retained. Existing interval/CLOSED/duration/null/source/visibility tests rerun|
|156|PASS|Guest HIDDEN unavailable with zero map/private name/coordinate DOM, missing distinct not-found; previous hide/show and deterministic500 evidence retained|

Guest real map marker activated by Enter, popup focuses normal detail CTA, Enter opens canonical Detail with Culture intact. Admin public Explore also excludes hidden marker; no bypass. Full Culture detail/Favorite/AI/provenance absent models are still future scope; source rendered only when real Culture source exists. US-12 task149 search/filter dependency remains blocked independently and is not required to falsely implement extra US-13 behavior.

Required regression suites/typecheck/build and clean scoped fixtures verified in ai-progress. With location/map and canonical Culture now genuinely integrated and tasks153–156 rechecked, US-13 is ACCEPTED for its approved functional scope. No commit/push/schema/migration.

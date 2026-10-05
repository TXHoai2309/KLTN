# US-12 — Khám phá điểm đến trên bản đồ

## Status

PARTIALLY ACCEPTED — implemented map scope verified; task149 BLOCKED BY US-11

## Baseline / references / scope

Clean TXH `4a2a007 feat(culture): add culture content management`, verified before edits. Approved tasks146–152 and minimum US-13 map integration; Product public exploration/MH-03 and consistent list/map requirements, System Specification public availability rules. Accepted US-07 coordinates, US-08 eligibility and US-09 Culture relation remain canonical. No Figma frame inferred.

At this story's baseline there was no `/explore`, public collection API, search/filter service, or US-10 implementation. The minimal unfiltered Explore boundary was added here and US-10 later extended it with Culture summaries. US-11 still owns canonical search/filter behavior and runtime evidence; task149 cannot PASS until that work is accepted.

No schema/migration, directions/routing/geolocation, public Culture detail, AI, Favorites, media, production or deployment change. Schema changed NO; migration required NO; Production migration NOT RUN.

## Provider / env / safety

Approved technical provider replacement from the existing dirty TXH working tree at `4a2a007`; no reset/revert. Google Maps runtime could not be activated because billing setup was unavailable. Map rendering now uses **MapLibre GL JS 6.12 via npm + Stadia Maps**. This changes provider implementation, not product scope. Google Routes remains a separate planned server-side routing decision, out of scope.

Removed Google JS loader/renderer, Advanced Markers, Maps JS dependencies, browser key/Map ID schema/example fields and Google-specific mocks. API, VISIBLE eligibility, result projection, pagination, List/Map URL state and Detail/Culture boundary preserved. Shared npm loader/config/renderer/session and Client DestinationMap run browser APIs only in effects. Official MapLibre CSS is imported by layout.

Canonical styles: `https://tiles.stadiamaps.com/styles/alidade_smooth.json` and `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json`. No appended key. [Stadia authentication](https://docs.stadiamaps.com/authentication/) permits localhost/127.0.0.1 development without credentials. Production requires a Stadia account/property with registered stable Vercel/custom domain; previews need matching property configuration. Production configuration was not performed.

MapLibre 6 module worker needs its sibling shared module. Next rewrites bundled chunk URLs, so dev/build copies these official npm assets into ignored public/maplibre and sets a same-origin worker URL. No CDN script/custom script tag. Asset HEAD preflight with bounded timeout prevents a missing asset poisoning MapLibre's cached worker promise, allowing retry after recovery. An experimental v5 compatibility attempt was discarded after audit found a critical advisory; final dependency is patched v6.

## Public data / eligibility / state

GET `/api/destinations?page=1`, optional view=list/map; no login. Server Explore and thin handler share `listPublicLocations`. Canonical visibleDestinationWhere at persistence for all roles. Explicit id/name/area/category/latitude/longitude select; omits visibility/timestamps/minimum/admin metadata. Pages25, stable name/id order,26-row lookahead, page1..10000, no-store. Pagination applies to both views; UI says how many destinations are on the current page.

Coordinates finite and in [-90,90]/[-180,180]. Corrupt legacy axes normalize to null in list DTO; projection excludes a record unless both axes valid, shows missing-coordinate count and keeps List usable. Current DB requires valid non-null coordinates, so corrupt/missing cases use deterministic fixtures rather than violating database checks. Hidden data never leaves query; Admin receives no public exception.

`/explore?view=list|map&page=...` uses one immutable `data.items` for cards and markers. Native history view updates integrate with Next searchParams/back/forward without dataset fetch; refresh retains mode. Changing page fetches the same public collection boundary. Toggle copies every current query field, so future filter state is not discarded. Today unsupported keyword/area/category query is explicitly400/data error rather than silently returning an unfiltered map. No search/filter controls or false synchronization evidence.

## Markers / UI / Detail

One MapLibre Marker per eligible destination, native keyboard button with accessible name. Popup uses textContent for name/area/category and focused normal `Xem chi tiết` anchor to `/destinations/<id>`; no HTML injection/full detail modal. Detail has one exact own-coordinate marker, no popup self-link; information/hours/Culture stay intact. Hidden/missing server states never mount map or expose coordinates.

All provider coordinates are `[longitude, latitude]`. Zero markers retain Hà Giang default viewport (22.8233/104.9836, zoom9), one marker uses zoom12, multiple use padded fitBounds/maxZoom12; global maxZoom15. NavigationControl only; no GPS/directions/fullscreen. Empty/invalid coordinates have truthful text and List access.

Provider loading waits for `load`; asset/style/tile error or15s readiness timeout displays `Bản đồ hiện không khả dụng`, retains List and current data, and supports fresh initialization via retry. Late ready cannot overwrite failure/unmount. Cleanup removes markers/popups/listeners/map. Theme changes select stable light/dark styles and dispose the previous map before creating its replacement.

## Automated evidence

Map tests cover canonical visibility/allowlist for all roles, hide/show, invalid projection, longitude-first positions, zero/one/multiple bounds, CTA/focus, query/view retention, SSR loading/empty/data error, shared Detail boundary, lifecycle style/load/mount failure/timeout/unmount/no late success, clean retry and missing worker preflight recovery. No unit tests call Stadia.

Final validation: map23/23, Destination61/61, Culture26/26, authorization21/21, account18/18, auth36/36 PASS; env generation/typecheck/build/diff-check PASS. Audit retains10 preexisting high,0 critical/no MapLibre advisory. No schema change/migration/production/commit/push.

## Runtime / cleanup — 2026-10-05

Real localhost:3001 Stadia styles/vector tiles and MapLibre WebGL, no key. Development endpoint verified `ep-purple-pond-b3xujb8o`; scoped disposable A/B VISIBLE, C HIDDEN, seven UNKNOWN weekdays and VISIBLE related Culture A. Existing manual Destination untouched. Admin public Explore has three markers (existing + A/B), no C; List has identical names/count. List→Map, refresh and Detail→Back retain Map URL. Marker click opens concise popup, focuses CTA, navigates canonical Detail with exact23.16/105.4 marker and Culture summary intact.

Light/dark basemaps rendered; theme swaps and responsive360/768/1280 showed exactly one canvas, three Explore/one Detail markers, no horizontal overflow, useful360/440px height. Navigation zoom and actual pointer drag pan tested (marker screen position moved with basemap). Native marker/popup CTA keyboard access inspected. Real mobile touch hardware was not available; cooperative gestures remain configured.

Provider failure smoke temporarily removed only generated local worker asset: HEAD404, explicit map error while destination count/List control retained. Restored asset and clicked retry on the same page without refresh: real tiles recovered, one canvas/three markers. No provider credentials or Stadia outage induced. Initial runtime found the worker bundling and cached rejection issues and drove the minimal provider fixes above. Fixture schedule omission initially caused Detail validation error; only disposable fixture corrected, no business contract weakened.

Evidence screenshots outside Git: `D:/KLTN/us12-evidence/stadia-*`. Scoped cleanup verified zero fixtures/Culture/join/children and existing Destination snapshot unchanged; temporary runtime script removed. Guest browser then showed only the original public Destination on real Stadia. Guest browser after completed logout renders the same marker set; Enter on marker focuses popup CTA and Enter opens Detail/Culture. HIDDEN Detail has zero canvas/private name/coordinates; missing shows a distinct not-found. Previous live Guest/Traveler API visibility/DTO/no-store checks remain applicable because provider-neutral server code is unchanged.

## Task matrix

| Task | Status | Evidence / remaining |
| --- | --- | --- |
|146 map/markers|PASS|Real Stadia/MapLibre WebGL, visible markers, viewport/themes/responsive|
|147 public location data|PASS|Unchanged canonical visible query/public allowlist; live Guest/Traveler API + Admin public view|
|148 List/Map|PASS|Same page dataset, real mode toggle/refresh/Back|
|149 search/filter sync|BLOCKED|US-11 search/filter is pending; query preserved, unsupported filters rejected|
|150 marker → detail|PASS|Real popup CTA → own-coordinate Detail map + Culture|
|151 loading/error/retry|PASS|Real loading/worker404/error/retry recovery; deterministic style/tile error and timeout|
|152 regression|PASS for implemented scope|Required suites/build + real provider smoke; task149 dependency excluded explicitly|

US-12 remains PARTIALLY ACCEPTED because149 is blocked; no invented search/filter behavior.

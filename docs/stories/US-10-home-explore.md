# US-10 — Trang chủ và danh sách nội dung khám phá

## Status

ACCEPTED — tasks136–140 passed with development runtime evidence (2026-10-05).

## Baseline / references / scope

Branch `TXH`, baseline `b2061c8 feat(map): add destination exploration map`. Product Document §§4–7, 12–13; MH-01/MH-02; NT-17, NT-20–22, NT-24–25. System Specification §§2, 3.4–3.5, 14; public exploration flow. Existing accepted US-07/08/09/12/13 contracts are reused. Figma remains the UI/interaction baseline where available; no frame was used to change business behavior.

Home is a static Vietnamese product entry with a primary `/explore` CTA and links to implemented discovery modes. Explore lists public Destinations and Culture summaries independently. This story does not implement US-11 search/filter or US-14 Culture detail, nor Trip/AI/Favorites/media, new schema, migration, or production changes.

## Public contracts / visibility

- `GET /api/destinations?page=1` reuses the US-12 `listPublicLocations` service and canonical `visibleDestinationWhere`; there is no duplicate Destination endpoint. It returns the existing explicit location DTO, stable name/id order, pages of 25 with lookahead, and `Cache-Control: no-store`.
- `GET /api/culture?page=1` is a thin Route Handler over `listPublicCulture`. The dedicated strict DTO contains only `id`, `title`, bounded `excerpt`, nullable safe `sourceTitle`/`sourceUrl`, and `relatedDestinations[{id,name}]`. No visibility, timestamps, or admin metadata. Only `visibleCultureWhere` Culture rows and related Destinations matching canonical `visibleDestinationWhere` are selected. Unsafe legacy links become null.
- Culture excerpt is deterministic NFC text, whitespace-collapsed, and bounded to 280 UTF-16 units without splitting grapheme clusters. Content is rendered as text; no full detail/dead link is introduced.
- Both public queries are role-neutral and uncached. Guest, Traveler, and Admin receive the same VISIBLE-only semantics. Hidden linked Destinations are omitted from Culture summaries while a visible Culture can remain public.
- Destination pagination remains `page`; Culture UI state uses independent `culturePage`, preserving the other section's page and `view`. The Culture API itself accepts its own `page` parameter.

## UI states / accessibility

- Home is static, so it has no fabricated data skeleton or API error. Its links point only to implemented Explore routes.
- Explore streams independent server sections with separate loading fallbacks, errors/retry, and exact empty states: `Chưa có điểm đến công khai.` and `Chưa có nội dung văn hóa công khai.` A failure/invalid page in one section leaves the other available.
- Destination List/Map, URL state, marker dataset, provider loading/error/retry, and Detail CTA remain the canonical US-12 implementation. Culture has summary cards, optional real source links (`http/https`, `noopener noreferrer`), and links only to visible Destination details; no Culture detail route is implied.
- Semantic headings/lists, labelled sections, status/alert states, descriptive links, keyboard-operable navigation/map controls, and visible focus styling are retained. Home and Explore use responsive light/dark styles.

## AC matrix

| Task | Status | Evidence |
| --- | --- | --- |
|136 public APIs|PASS|Existing Destination API reused; new strict Culture public DTO, allowlists, canonical visibility and no-store runtime checks|
|137 Home|PASS|Static Vietnamese product home; real Explore CTA works with Enter; no starter/demo/unsupported actions|
|138 Explore lists|PASS|Independent Destination and Culture sections; source/related summaries; List/Map unchanged; Culture has no dead detail link|
|139 loading/empty/error/responsive|PASS|Browser observed both loading states, both page-2 empty states, independent invalid-page errors, Map worker error/retry; Home/Explore 360/768/1280 no horizontal overflow|
|140 public visibility|PASS|Automated allowlist/cross-visibility tests; no-cookie Guest and authenticated Traveler API checks; Admin public Explore plus real Admin hide/show/refresh for Destination and Culture|

## Runtime evidence — 2026-10-05

- Verified development database endpoint `ep-purple-pond-b3xujb8o`. Created scoped disposable fixtures: visible/hidden Destinations, visible/hidden Culture and a visible Culture linked to both Destinations. Added temporary Better Auth Traveler with a random in-memory password; signup returned role `TRAVELER`.
- No-cookie Guest requests to `/api/destinations` and `/api/culture` returned 200/no-store, included visible fixtures, excluded hidden fixtures, and returned no Admin fields. Public Culture included only the visible linked Destination. Authenticated Traveler Home/Explore/API requests returned the same public semantics. Existing Admin browser loaded public Explore and Admin visibility pages.
- Through Admin UI, hiding visible Destination A and refreshing removed it from the public List, Map markers, and Culture related links. Showing it restored each. Hiding visible Culture A and refreshing removed its card; showing it restored the card. Culture-Destination relations remained intact. Direct Guest navigation to hidden Destination B rendered unavailable content without the fixture name, coordinates, or map.
- Home primary CTA opened `/explore` with keyboard Enter. Explore Map marker → popup CTA → US-13 detail worked with Enter; detail retained coordinates, linked Culture, hours, and Back returned to Map mode. Removing the generated MapLibre worker produced the existing local Map error while Culture remained usable; restoring the asset and using Retry on the same page recovered Map without F5.
- Browser observed both independent loading fallbacks; page 2 returned both exact empty states, and invalid Destination/Culture page values showed separate errors while the other section still loaded. Deterministic service tests cover each underlying database-error partial failure; no database outage was induced.
- Home and loaded Explore at viewport widths 360, 768, and 1280 had no horizontal overflow. Light and dark rendering were inspected; keyboard map popup/CTA navigation passed. Screenshots are stored outside the repository at `D:/KLTN/us10-evidence/`.
- Cleanup removed the fixtures, opening-hour children, joins, temporary Traveler/account/session, and four fixture-scoped idempotency records. Recomputed snapshots confirmed pre-existing Destinations, Culture, relations, users, and Admin name/role were unchanged. The temporary smoke script was deleted.

## Validation / dependencies

`npm run env:generate`, `npm run test:explore --workspace web` (14/14), `test:map` (23/23), `test:destination` (61/61), `test:culture` (26/26), `test:authorization` (21/21), `test:account` (18/18), `test:auth-ui` (36/36), `npm run check-types`, `npm run build`, and `git diff --check` pass. Total automated tests in these suites: 199.

Schema changed: NO. Migration: NOT REQUIRED. Production untouched. No commit or push.

US-11 owns keyword search and filters; this story adds no search/filter controls. US-14 owns public Culture detail; Culture cards remain summary-only. US-12 task149 remains BLOCKED pending US-11 and is not marked PASS by US-10. US-13 remains ACCEPTED and its detail behavior was regression-smoked.

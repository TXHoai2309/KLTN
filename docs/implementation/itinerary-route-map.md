# Planner road lines and whole-trip map — 2026-10-25

The owner supplied an existing marker-only map and requested road-shaped lines
between stops plus a view of all trip days. This explicitly replaces US-28's
earlier markers-only presentation choice. The earlier route-coherence correction
in this working tree is preserved. Concurrent Home changes are unrelated and
were not edited by this task.

## Implementation and boundaries

`planner-route-geometry.ts` validates/limits the existing provider geometry to
512 sampled provider points, retaining endpoints and rounding to six decimals.
The authenticated, private/no-store Planner response gains optional normalized
geometry on verified legs. Older metric-only results remain valid. An invalid or
absent shape does not certify a route or substitute for missing duration/distance.
No raw provider response, encoded shape, URL/key, new request, routing retry,
matrix, database write or schema migration is introduced.

`itinerary-map-model.ts` owns the day/whole-trip projection. Each actual inbound
shape stays a separate feature, so missing legs never acquire a guessed straight
connection. Day maps include the actual previous endpoint as point 0. Whole-trip
markers are globally numbered; route day is the receiving stop's day.

`ItineraryMap` owns the native pressed scope buttons, refit, labeled legend,
missing-shape message and existing preview. Marker selection resolves its day in
`TripPlannerScreen`. `mountItineraryMap` fits both road geometry and markers,
recreates layers on style load and disposes listeners/ResizeObserver. CSS day
tokens are the shared color source for lines, legend and markers. Root marker
position/transform stays entirely with MapLibre; visual tests caught and corrected
a CSS positioning conflict before handoff.

The existing Trip UI refinement contract remains the canonical owner for date,
form, scrolling, toast, validation and Save behavior. No second map component,
notification system, design identity, routing provider or app route was added.

## Verification

- Planner, routing, Validator, Save, UI, map projection and renderer: **256 PASS,
  three gated PostgreSQL SKIP**. New cases cover geometry normalization and bounds,
  single-call credential isolation, optional/malformed shapes, missing-evidence
  rejection, cross-day transfer, global numbering, disconnected legs, theme
  restoration, fitting and cleanup.
- `scripts/itinerary-routes-fixture.mts` mounts the production screen and real
  MapLibre on loopback 3016 with explicitly synthetic data/shapes and local styles.
  `scripts/test-itinerary-routes.mjs` covers 14 screenshots at 1440/768/390/360px,
  light/dark, keyboard scope switch, marker/day synchronization, source colors,
  one canvas, refit, no extra proposal request on scope change, endpoint/marker
  alignment, missing shapes/routes, empty state and map-error retry. External
  browser traffic is blocked. This is separate from live routing evidence.
- Two direct read-only calls through the actual current server adapter, one per
  CAR/MOTORCYCLE, for Quản Bạ → Dinh họ Vương returned 77,911 m / 3,249.208 s and
  4,111 geometry points each; the presentation projection contains 512 points.
  These snapshots prove geometry availability, not traffic/weather/safety or
  regional profile quality. No credentials/raw provider payload were recorded.
- Root typecheck and isolated-output production build pass. Build uses local
  placeholder build configuration, separate `.cache/performance-next`, and
  disabled AI gates; it does not share the running development output.
- Taste source lint: zero FAIL/WARN for the changed map component/renderer.
  Rendered inspection uses the existing palette/type. Floating map-marker shadows
  (`button-fx`) and the intentionally clipped, horizontally scrollable day tabs
  (`edge-text`) are explicit existing-design allowances. Existing date/count
  contrast, metadata density and third-party control-font warnings are retained.
- Premium strict audit of the existing trip scope reports three baseline findings:
  personalization textarea resize evidence, confirmation's native date vs typed
  owner, and pre-existing WebKit-only scrollbar styling. None is introduced by
  the map extension; the unrelated contracts were not rewritten to hide them.

Ignored receipts are under `apps/web/.cache/itinerary-routes/`: test/browser JSON,
screenshots, taste and premium audits, sanitized live-routing receipt and build
logs. Full real-auth browser, actual tile authorization and real database Save
acceptance are not claimed. No commit, push, merge or deployment.

## Reproduce

From `apps/web`, start the loopback fixture using the existing test-only
`server-only` stub registration described in `trip-planning-ui-refinement.md`,
substituting `./scripts/itinerary-routes-fixture.mts` as the imported script. Set
`PLAYWRIGHT_MODULE_DIR` to the installed Playwright package directory, then run
`node scripts/test-itinerary-routes.mjs`. The production app remains at port 3010;
3016 is only an isolated development/test fixture.

### Visual review of the final captures

The map remains subordinate to the itinerary and answers where the selected day
or whole trip travels. The new scope/refit controls share the existing panel
edges and keep 44px targets. Color is used on route data, markers and the matching
legend rather than extra chrome. Counts reconcile: seven globally numbered stops
and six separate inbound legs; each day legend retains its own stop count. Missing
geometry leaves visible disconnected markers and explicit text. Phone layouts
keep the existing itinerary/map switch; source colors, legend wrapping and retry
were inspected in the final captures. The existing fixed Save dock, metadata
contrast and clipped scrollable day tabs remain baseline layout debt rather than
an unrelated redesign. No fabricated basemap or tourism evidence is inferred from
the explicitly synthetic screenshot fixture.

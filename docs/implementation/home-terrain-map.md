# Landing Hà Giang terrain model — 2026-10-26

## Owner-approved scope

Integrate the reviewed isolated Hà Giang prototype into Home. Keep the standalone
preview separate. Default to the supplied reference: top view, relief setting
2.2, satellite texture with district colors and boundaries, visible roads and
landmarks, automatic rotation. Keep only the `3D` / `Từ trên cao` view controls.
Preserve every road; increase contrast/width rather than reducing the network.
Hovering a district lifts its surface, border and pins as one geographic group.
Public Explore articles open a small preview and canonical `Xem chi tiết` link.

## Implementation and boundaries

- `HomeTerrainMap` is the Home-only client owner, replacing Home's iframe/list
  presentation. Explore, Detail and itinerary map implementations are unchanged.
- The existing request-fresh `listPublicHomeDestinations` query and public media
  projection supply article metadata and bounded descriptions. No extra endpoint,
  database read, schema change, migration, routing call or provider migration.
- Static OSM landmarks contain geographic names/coordinates only. Their asset
  has no saved CMS IDs, Cloudinary URLs or local article links. Name matching uses
  exact normalized names and explicit aliases. Ambiguous matches never guess.
  Unmatched current public articles with coordinates inside Hà Giang get their own
  pins. A hidden/unavailable article disappears from the next Home projection;
  a static geographic landmark may remain without any article preview/link.
- Canvas road texture retains all 417 source fragments / 31,933 coordinates.
  Dark casing, wider bright cores and road-reference labels improve visibility.
  Lines are draped with the terrain, not presented as computed travel routes.
- Measured terrain triangles are partitioned into district meshes using a
  rasterized ownership mask. Hover lifts the district by 0.24 scene units, with
  a smooth return. Borders, signs and pins share its transform. Approximation at
  mesh boundaries remains limited by historical/simplified source polygons.
- Npm Three.js 0.186.1 is dynamically imported only near the map viewport.
  Static imagery/elevation/geography fetches are cancellable, with a 25s deadline,
  visible error/retry, stable map footprint, and the existing Explore fallback.
  Cleanup cancels the frame, observers and listeners and releases GPU resources.
  Theme changes reuse the same renderer.
- Rotation pauses on hover, focus, touch manipulation, an open preview, hidden
  document and off-screen map. `prefers-reduced-motion` disables automatic motion
  and makes lift/view changes immediate. Arrow keys change camera orientation;
  all pins are native buttons. Escape closes a preview and restores pin focus.
  Mobile retains document scrolling; no scroll-wheel interception.

## Sources and licensing

All runtime assets are in `apps/web/public/terrain/ha-giang/` (approximately 6 MB,
loaded after scrolling near the map). Runtime does not contact a tile provider.

- Satellite: **EOxCloudless 2016**, EOX IT Services GmbH, contains modified
  Copernicus Sentinel data 2016 & 2017, **CC BY 4.0**. A 4096 × 4096 WMS crop was
  fetched for bbox `104.35923359595375,22.167286806940638,105.57960822823719,23.39097449667571`.
  [Source and terms](https://cloudless.eox.at/documentation/faq).
- Elevation: [Mapzen Terrain Tiles / AWS Open Data](https://registry.opendata.aws/terrain-tiles/),
  USGS SRTM/GMTED2010. 25 Terrarium z10 tiles, bilinearly sampled to 641 × 641.
  [Attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
  Heights are exaggerated for display, not measurements for route safety.
- Boundaries: [geoBoundaries gbOpen](https://www.geoboundaries.org/api.html),
  VNM ADM1 represented 2008 (public-domain source), ADM2 represented 2020,
  OCHA ROAP / Government of Viet Nam, **CC BY 3.0 IGO**. Historical regions follow
  the owner's image, not current administrative units.
- Roads/rivers/landmarks: **© OpenStreetMap contributors, ODbL 1.0**, delivered
  by OpenFreeMap / OpenMapTiles. Snapshot tile source:
  `https://tiles.openfreemap.org/planet/20261018_080001_pt/{z}/{x}/{y}.pbf`.
  64 z11 tiles and 76 local z14 POI tiles, under 1.5 MB total download with at
  most four concurrent requests. [OSM licence](https://www.openstreetmap.org/copyright),
  [OpenFreeMap usage](https://openfreemap.org/quick_start/).
- Three.js: MIT, npm dependency; no external script or vendored executable.

Owner follow-up removes the two instructional captions and collapses EOX, OSM,
OpenFreeMap/OpenMapTiles, geoBoundaries and USGS/Mapzen credits into a small
native information disclosure inside the map. The map has no prices, hours, traffic claims, route
optimization, geolocation, or access to private destinations.

## Verification

Focused model and existing Home/public-query tests cover article binding,
ambiguous titles, invalid/out-of-province coordinates, live visibility changes,
boundary holes/multipolygons, full road counts, asset integrity and the default
configuration. Repository typecheck/build and whitespace checks are recorded in
the story/progress handoff. Source taste lint is applied to the new files.

The integrated scene's live visual/hover/mobile acceptance is not certified:
the browser tool returned **Local browser use is disabled in Work settings**.
No alternative UI driver was used to bypass that setting. The earlier standalone
prototype screenshots are not evidence for this new integrated renderer.

## Viewport containment follow-up

The owner's desktop screenshot showed that the original 760/830px stage was
too tall. It now uses `clamp(380px,62svh,600px)` on desktop and
`clamp(410px,66svh,520px)` on mobile. Camera fitting uses an enclosing province
sphere, reserving space for controls and the raised boundary through a full
rotation. The article preview is height-bounded with its own overflow. A numeric
Three.js projection regression covers five map sizes, 24 azimuths, three pitches
and points across the bounding sphere; focused total is now 14 passing tests.
This verifies projected containment, not a rendered-browser screenshot.

## Mobile scale and empty-side-space follow-up

The owner's next desktop/mobile screenshots showed that the sphere fit made the
province too small. That fit is superseded by a perspective fit of the actual
province outline, extruded through the maximum DEM elevation and full hover lift.
The distance is recalculated for the current orbit direction, including view
transitions and dragging, so a portrait phone does not reserve room for a future
horizontal orientation. A projection offset centers the map in the usable space
below the controls instead of reserving the upper clearance again at the bottom.

The centered terrain frame is now at most 900px wide, retaining the existing
viewport-bounded heights. No additional controls or content were introduced.
The projection regression uses the actual geographic outline at six viewport
sizes, 48 azimuths and three pitches. It checks both containment and at least
94% use of one available axis; default phone views must cover over 70% of the
frame width. This guards against the previous undersized-but-contained result.
Browser inspection remains unavailable because local browser use is disabled;
these are numerical projection checks, not rendered visual acceptance.

## District disclosure and compact section follow-up

The owner requested removing persistent destination clutter over district names.
Pins now start hidden and appear only in the active district. Pointer hover
raises and reveals that district; moving onto one of its pin labels retains it.
On touch, a tap selects the region and keeps its pins available; a blank tap or
new camera gesture clears selection. Native district-name buttons support Tab
and Enter to reach the region's pins. Opening an article retains its region for
the preview/focus-return round trip. No article eligibility/link rule changed.

District names remain visible and take precedence over pin names and road signs.
Pin names try the opposite side before collapsing if they collide. Camera
fitting now minimizes the projected outline span and centers that span, rather
than requiring it to be symmetric around the geographic bounding-box center.

The latest owner screenshot showed the concurrently added map/copy layout was
too wide. Its existing two-column layout is retained, with equal columns and a
40px gap. The outer section keeps its shared 1540px cap and 36px desktop inset
to align with neighboring sections; only the map column is capped at 680px and
the copy at 520px. Canvas height is 460–580px on
desktop and 410–500px on phones. The two view buttons return to the upper-right
overlay, eliminating the separate bottom control row. The stage has its own
stacking context so controls remain above map labels. Existing source disclosure
and compact article preview remain within the frame. These final dimensions
supersede the earlier frame sizing notes.

Regression covers pointer/touch/keyboard disclosure, preview retention, and real
outline/elevation projections through 48 azimuths and three pitches at seven
sizes. Browser rendering remains unverified because local browser use is disabled.

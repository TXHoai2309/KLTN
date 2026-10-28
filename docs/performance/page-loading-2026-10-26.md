# Page loading follow-up — 2026-10-26

Owner requested smoother page loading after the visual work. Changes are local on
`master`; no commit, push, merge, deployment, schema or environment change.

## Reproduced causes and changes

The terrain redesign had restored a blocking destination read in Home, despite
the earlier streaming fix. The actual-page stream test held that read pending:
before the fix, the response contained no hero. Home now starts the same public
service after `connection()` and passes one promise to two Suspense consumers:
the terrain map and the existing empty/error cards. The static hero, copy and
other sections stream independently. The loading map reserves the final map's
existing responsive stage dimensions. Visibility/media eligibility, freshness,
empty/error handling and the scroll-reveal owner remain unchanged.

The root-layout Assistant provider also statically imported the entire chat panel
on every route, even with no panel session. It now uses `React.lazy` and Suspense
only after the first open. A small loading header can be minimized while its code
loads. The panel remains mounted when minimized or hidden during client navigation,
preserving the previous session/context lifetime. Closing the loading header
restores focus after the launcher becomes visible. This does not change AI calls,
history, authorization, ownership or write semantics.

The global-font hypothesis was not established with per-face browser usage data;
no font, image, video, persistent-cache or database policy was changed.

## Local measurements

[Before](evidence/page-load-2026-10-26-before.json) and
[after](evidence/page-load-2026-10-26-after.json): isolated Next 16.3.8 production
build output, Node 24.22.1 server, same local environment, anonymous GETs on port
3098. Three sequential requests per route. No network/CPU throttling, forced Neon
cold start or concurrent-load test. The first sample is retained in each receipt.

| Home boundary, ms | Before samples | After samples |
| --- | --- | --- |
| Hero HTML received, first request | 953.3 | 1074.5 |
| Hero HTML received, next two | 266.4 / 230.3 | 45.4 / 33.6 |
| Full HTML completed, first request | 968.0 | 1728.4 |
| Full HTML completed, next two | 271.5 / 241.5 | 202.7 / 165.6 |

The two warm hero samples have a midpoint of 248.4 → 39.5 ms. This supports the
specific removal of database waiting from the shell, also covered deterministically
by the deferred-read test. It is not browser paint, full asset readiness, field LCP,
INP, p95 or a cold-start improvement. The first-request variability remains visible.

| Route | HTML-referenced JS bytes before → after | Sum of individually gzipped scripts before → after |
| --- | ---: | ---: |
| Home | 1,469,505 → 994,229 | 436,174 → 319,030 |
| Explore | 1,481,389 → 1,398,905 | 439,521 → 413,504 |
| Login | 1,505,833 → 1,421,322 | 441,671 → 415,254 |

These are unique script URLs emitted in the completed HTML, fetched and measured
by the probe. They are not all JavaScript eventually downloaded by a browser:
Flight hydration, prefetch and later interactions can request more chunks. Home's
larger difference includes its newly streamed boundary; do not describe it as an
equivalent reduction in total browser traffic. The shared Assistant panel is absent
from the emitted scripts on all three tested routes after the change. Gzip sizes
are computed locally, not observed network transfer sizes.

## Reproduction and regression evidence

From the repository root, with the isolated production server running:

```powershell
node scripts/performance/page-load-readonly.mjs http://localhost:3098 docs/performance/evidence/page-load-2026-10-26-after.json --assert
```

The probe only accepts loopback origins and fetches three fixed public pages and
same-origin Next static assets. It retains no cookies, response bodies, credentials
or private account data. `--assert` rejects an eagerly included Assistant panel.
The initial marker was refined to exclude the newly introduced loading header;
the final marker identifies the actual panel backdrop implementation.

The actual Home stream regression failed before the change with an empty response
while the database was pending, then passed. It also checks static sections and
the map loading state arrive before data, while the existing tests verify fresh
subsequent reads, request-boundary control flow and the real database failure state.

- Focused Vitest: 6 files, 48 tests PASS, including Home, public Home service,
  terrain projection, gallery, Assistant panel and development integration.
- Root typecheck: 4 tasks PASS; final isolated production build PASS, 47 generated
  pages, including its own final TypeScript check. No dependency/schema change.
- `node --check` for the probe and `git diff --check` PASS.
- Browser smoke: Home renders; offscreen terrain has no canvas until scrolled to;
  after scrolling it mounts one canvas and reports `aria-busy=false`. Explore Map
  and List show the current public destinations, and the published Đồng Văn Detail
  opens with its exact return link. No overflow was observed in the current viewport.
- Assistant: first open shows its loading header and then the actual panel;
  minimize/reopen and Home → Explore navigation preserve the mounted panel. No
  warnings/errors were captured in the checked browser log window.

The local production Assistant runtime remains unavailable under its existing
configuration, and the panel displays the existing retry state. No live question,
model request, authenticated browser, full offline suite, mobile throttling,
field Web Vitals or production acceptance was performed. No runtime gate was
enabled to bypass that limitation. Existing data and all private-resource contracts
remain unchanged.

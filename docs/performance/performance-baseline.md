# KLTN performance baseline — 2026-10-18

Additional highest-priority Neon workstream now has12 paired read-flow results,
connection/pool/plan decomposition and explicit blocked metrics:
[Neon database report](neon-database-optimization.md). The original baseline
below remains historical and is not silently replaced by a later measurement.

Audit started on clean TXH/origin/TXH `433f264`. Owner explicitly selected direct
TXH edits, no push/deploy. During collection TXH advanced externally to `bf08f63`
(Assistant CSS). Its duplicate unclosed `.assistant-bottom-dock` block prevented
a build. Three duplicate lines were removed as a prerequisite repair, preserving
the new styling. Production observations remain pinned to deployed `433f264`;
The concurrent workflow then committed that exact repair as `a18e8be`.
Local A/B uses this same repaired styling on BOTH sides. Do not compare
Production and localhost numbers as an optimization result.

## Method and confidence

- Production HTTP: sequential Guest GET, 19 routes ×3 samples +1 discovery,
  500ms pause, no cookies, manual redirects, 20s deadline. This is a bounded
  synthetic audit, not a concurrency/load test. TTFB includes client network;
  streamed response completion is measured separately. HTTP200 shells do not
  prove private content access. Raw sanitized [measurements](evidence/http-production-before.json).
- Nearest-rank p50/p95; with n3/n5, p95 is the sample maximum. No claim of
  population p95 or statistical significance. First observed request is not
  guaranteed cold Vercel/Neon compute; neither cache was flushed/restarted.
- Independent Chromium: five core routes ×390/1440px ×first/repeat loads,
  load+2.5s viewport observation, reduced motion. Mobile4Mbps/80ms/CPU4x,
  desktop20Mbps/20ms/CPU1x. All non-GET/HEAD aborted, no credentials. LCP is an
  observed synthetic candidate; CLS is observation-window accumulated shift,
  not full-session Web Vital. No representative interaction => INP UNMEASURED.
  [Raw browser/resource measurements](evidence/browser-production-before.json).
  Initial Production harness used Playwright routing, which disables HTTP cache;
  its repeat samples were relabeled, not presented as genuine warm-cache samples.
  Corrected local A/B uses CDP interception, clears cache before cold, and confirms
  50 cached resources on each warm Home load. Local widths390/768/1440 are identical
  between variants. No Production cache-warm claim is made from the initial run.
  CDP completed bytes include cross-origin transfers; Resource Timing bytes can
  be0 without Timing-Allow-Origin. Video streaming may remain incomplete at
  sample end; zero completed video bytes does not mean zero video traffic.
- Actual PrismaNeon, pinned Production identity verified via Neon API, enforced
  `default_transaction_read_only=on`, max2 connections, statement10s/lock2s.
  Five sequential reads per flow; no parameters, credentials or source prose
  in [query counts/timings and EXPLAIN](evidence/database-before.json).
  Initial instrumentation failed on PostgreSQL `name` decoding; explicit text
  casts fixed the benchmark, not application code. Failed attempt is not PASS.
- No new AI requests in this audit. Read existing Vercel logs, whitelist numeric
  diagnostics and replace correlation IDs with run labels. Latest50 entries in
  15m contain one complete and one partial request; not an error-rate sample.
  [Sanitized stage events](evidence/ai-production-observed.json).

## Access / monitoring

| Source | Observation | Limitation |
| --- | --- | --- |
| Vercel metadata/function logs | Read access works, deployed433f264 READY | latest50 diagnostic events only; no continuous trace export |
| Function duration p95 API | `payment_required`, Observability Plus required | no field API p50/p95 |
| Speed Insights LCP p75 API | query succeeds, summary/data empty | no real-user LCP/INP/CLS population |
| Vercel billing usage last1d | unavailable for account/date range | unavailable is not zero cost |
| Neon identity/compute metadata | API200, active0.25–2CU, suspend timeout0 | instantaneous configuration, not utilization time series |
| Neon consumption API last24h | HTTP403 | no measured CU/network billing impact |
| Neon SQL | READ ONLY; visible3; pgvector0.8.6; pg_stat_statements absent | no historical per-query aggregates |
| Existing authenticated browser | browser tool initialization fails (`kernel assets`, path missing) | Traveler/Admin live measurements BLOCKED; no auth/session export attempted |
| Preview of changes | no push/deploy authorized | changed-code Preview verification BLOCKED |

[Neon metadata receipt](evidence/neon-monitoring.json). Provider responses remain
in ignored `.cache/perf-*private*`; only whitelisted aggregates are published.
Metadata lists deployment region iad1 while observed logs say hkg1. Those are
different observations; actual DB hop cannot be inferred confidently from them.

## TOP_SLOWEST_ROUTES

Production Guest, n3, milliseconds. Sorted by completion p50; streaming explains
why destination TTFB is far below completion.

| Route | TTFB p50 | Completion p50 |
| --- | ---: | ---: |
| Destination Đồng Văn |411|3093|
| Destination Khâu Vai |334|2690|
| Destination Căng Bắc Mê |349|2690|
| Explore Map |329|1530|
| Landing |1063|1328|
| Explore List |335|807|
| Assistant shell |556|563|

## TOP_SLOWEST_APIS

Public `/api/destinations`:741ms completion p50, n3. `/api/health`:300ms.
Guest-denied `/api/ai/conversations`:382ms, `/api/favorites`:319ms,
`/api/admin/destinations`:314ms, `/api/trips`:309ms; all401. These are auth-denial
timings, **not authorized workload benchmarks**. Across57 observations:0 server
5xx/transport errors; intentional401/307 are preserved, not counted as outages.

## FRONTEND_BOTTLENECKS

- Cold mobile Landing LCP7824ms (TTFB3040ms), desktop3044ms; one sample per
  condition, not field percentiles. Poster682840B is fetched at full dimensions.
  Lossless WebP experiment458612B, identical decoded pixels (32.84% less).
- Every core route loads roughly248–350KB encoded fonts (21–26 resources),
  57–68KB CSS; unused/preloaded font faces are a plausible contributor. No font
  removal without per-face coverage and Vietnamese/editorial regression proof.
- Desktop Explore Map ~882KB JS vs List433KB. MapLibre is already dynamic;
  Home map already waits for IntersectionObserver. No evidence justifies loading
  maps sooner or disabling provider/error boundaries. Desktop3 markers confirmed.
  Mobile viewport observation ended with0 Explore markers: readiness unverified,
  not a map PASS. Destination had1 marker.
- Observed desktop Assistant CLS0.361, mobile destination0.174. Layout attribution
  is not yet captured; do not assign this to fonts/auth without trace evidence.
- Video file11194423B, autoplay; observation does not measure whole playback.
  Do not extrapolate total playback cost from partial completed-resource bytes.

## DATABASE_BOTTLENECKS

Actual adapter n5: unfiltered public list p50/p95=135/425ms,3 SQL; filtered
124/147ms,3 SQL; Home202/208ms,4 SQL. Relation media adds a SQL beyond each
Prisma findMany. Home additionally fetches descriptions after list+filter options.
For an unfiltered full public list, category/area options can be derived from
the same visible rows. Home needs no filter-options query and can select its
bounded description in the first read. Existing query plan uses visibility index;
visible-list execution0.048ms, filter options0.062ms. These simple SQL statements
do not explain hundreds of milliseconds adapter/network time. No index/schema
change justified. Instantaneous pg_stat_activity:1 active/4 idle, not saturation.

## AI_STAGE_LATENCY

Existing traffic, complete run1: total36007ms. Principal resolution1350ms;
admission7600ms; embedding267ms (provider264ms); post-embedding retrieval1617ms;
initial eligibility894ms; assessment4398ms; post-assessment recheck896ms;
generation8044ms; verification6316ms; final eligibility about1509ms;
persistence3016ms. Partial run2 persistence3091ms; total33864ms, earlier stages
missing. Deltas are wall intervals, not CPU/query-only attribution. Provider
stages account for ~19s; admission/eligibility/persistence are material too.
SQL/lock/network decomposition for those writes is NOT available, and no write
benchmark was run. Existing read-only/memory-persistence smoke from timeout
task is historical evidence, not a new audit or durable-DB latency comparison.

## Safety / missing coverage

Production mutations/model requests/routing requests/import/reindex/schema/auth
changes:0 by audit scripts. Authenticated CMS CRUD, Traveler Planner/Trip Save/Edit,
role-to-role runtime cache isolation and representative INP remain unmeasured.
Offline regressions can verify contracts, not substitute for live acceptance.

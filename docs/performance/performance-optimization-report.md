# KLTN performance optimization report — 2026-10-18

**PRODUCTION_RELEASE_READINESS=NO_GO / AUDIT=PARTIAL.** Safe local improvements
have before/after evidence. Authenticated and changed-code Preview acceptance
remain blocked, so this is a review package, not a Production performance PASS.
Changes remain uncommitted on TXH; this audit did not push, merge or deploy.

Owner's additional highest-priority Neon workstream is recorded in
[database optimization report](neon-database-optimization.md) and
[12-flow before/after table](neon-read-comparison.md). It adds public editorial
projection optimization, driver/pool/connection probes and final regression
evidence. Earlier measurements below remain dated historical results; the Neon
report distinguishes current paired results from these initial runs.

Started at433f264. Concurrent work advanced TXH to
`a18e8be261ea18eadf3d7558e8f7255a09899f29` via Assistant styling+CSS syntax repair.
Those commits are preserved; they are not performance changes authored/released
by this audit. Public Production measurements are from433f264. Local A/B has
the same repaired Assistant CSS on both sides. [Baseline](performance-baseline.md)
and [prioritized bottlenecks](performance-bottlenecks.md) document confidence.

## FIXED_ISSUES / BEFORE_AFTER_METRICS

Actual same-process PrismaNeon read-only paired comparison,5 samples/flow,
alternating old/new order, same Production3-destination cohort and max2 pool.
Canonical public-list/Home DTO hashes match, including media/description content.

| Metric | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Home SQL statements/read |4|2|50% fewer statements; first select now includes description |
| Home adapter flow p50 |222ms|157ms|65ms /29.3% lower in this paired sample |
| Home sample p95 (=maximum,n5) |466ms|213ms|not population p95 |
| Public unfiltered SQL/read |3|2|33.3% fewer; filter options derived from complete visible rows |
| Public unfiltered p50 |143ms|147ms|2.8% higher; **no median latency win claimed** |
| Public unfiltered sample maximum |593ms|316ms|small sample; no tail-SLO claim |
| Filtered SQL/read |3|3|global options retained, including when no results |
| Hero poster encoded bytes |682840|458612|224228B /32.84% saved; pixel-identical1200×700 |

[Paired DB evidence](evidence/database-after-paired.json),
[lossless pixel receipt](evidence/poster-lossless.json).
No cross-request cache/invalidation change. No database schema/index change.
CMS/public visibility and media provenance retain their existing canonical gates.

Local optimized Next production builds, exact same Chromium profiles, fresh
browser context per width, verified50 cache hits on each warm load. One
observation per condition; correlated network/host variation remains. These
figures cannot be substituted for field LCP/INP or a Production release result.

| Home condition | LCP before→after ms | TTFB before→after ms | Completed network bytes before→after |
| --- | ---: | ---: | ---: |
|390px cold|4976→3352|940→866|1442294→1219971|
|390px warm|832→644|340→244|42654→40787|
|768px cold|900→1064|242→341|1438069→1211504|
|768px warm|608→428|408→215|40071→33453|
|1440px cold|956→888|279→229|1433853→1216983|
|1440px warm|436→432|280→245|33483→40807|

Tablet cold LCP regressed in this single sample; no all-device speedup claim.
The robust asset result is identical pixels and fewer bytes. No repeated tuning
or selective sample deletion to manufacture an LCP PASS. CLS remains below0.001
for these Home observations; overflow=false across all six after conditions.
[Before](evidence/browser-local-before.json) / [after](evidence/browser-local-after.json).

Post-fix controlled theme click/Escape probes expose an unresolved mobile issue:
CPU4x maximum event duration864ms initially and496ms in a second instrumented run;
second run input delay30ms, processing15.5ms, presentation450.5ms. Tablet56/56ms,
desktop104/88ms. Retained [initial](evidence/interaction-local-initial.json) and
[breakdown](evidence/interaction-local-after.json). This is a synthetic interaction
sample, not field INP or a before/after optimization claim. Render/paint cause
still needs a trace. It is an explicit remaining performance risk.

## TOP_SLOWEST_ROUTES / TOP_SLOWEST_APIS

Guest Production completion p50: Destination detail2.69–3.09s, Explore Map1.53s,
Landing1.33s, Explore List0.81s. Public Destination API0.74s. Private API401
responses are denial timing only; actual authorized CMS/Favorites/Trips workloads
were not measured.57 GET observations,0 observed5xx/transport errors. n3 is not
a reliable production error-rate estimate. Full route table/raw metrics in baseline.

## FRONTEND_BOTTLENECKS / DATABASE_BOTTLENECKS

Poster bytes and redundant Home/list queries addressed above. Global font transfer
248–350KB and map JS remain material. Maps are already dynamic and Home is
intersection-lazy. No font/MapLibre autoplay policy change made without attribution.
Short Production observations exposed layout shifts (Assistant desktop0.361,
Destination mobile0.174), but no root cause/field CLS conclusion is established.
Visible-destination SQL itself0.048ms; existing index is used. No evidence for
an index change or connection saturation. Connection/transaction latency in AI
needs more tracing before altering its safety-critical operations.

## AI_STAGE_LATENCY

No AI model/effort/token/timeout change or new paid request. Existing Production
trace: principal1.35s, admission7.60s, embedding0.267s, retrieval after embedding
1.617s, initial eligibility0.894s, assessment4.398s, subsequent recheck0.896s,
generation8.044s, verifier6.316s, final eligibility~1.509s, persistence3.016s,
total36.007s. Another partial trace has persistence3.091s. These are wall-stage
intervals, not SQL/provider-CPU decomposition. Existing safety checks stay intact.
No SQL/lock cause is asserted without a trace; historical timeout smoke remains
separate from this audit. [Sanitized observed events](evidence/ai-production-observed.json).

## VERCEL_USAGE_IMPACT / NEON_USAGE_IMPACT

- Vercel:224228 fewer poster bytes per uncached fetch. At1000 uncached views this
  is224228000B (~213.8MiB) **arithmetic projection**, not measured billing savings.
  No paid image optimization service was enabled. Original PNG retained for
  rollback. Function-duration p95 requires paid Observability Plus; billing query
  unavailable; Speed Insights empty. No dollar/function-time saving asserted.
- Neon:2 fewer SQL statements per Home read and1 fewer per unfiltered list read;
  request count and data freshness unchanged. Backend read-flow measurements above
  do not determine compute-unit billing. Consumption API403; no measured CU/$
  reduction. Min/max0.25–2CU and suspend setting remain unchanged.
- OpenAI/Routes:0 new calls /0 added audit inference cost. Existing traffic was
  observed only. No higher token budget, extra retry or parallel model dispatch.

## REGRESSION_RESULTS

| Gate | Result / evidence |
| --- | --- |
| Focused Home/media/visibility tests |53 PASS (3 files); global options, allowlist, provenance retained |
| New Home regression |5 PASS: one read, explicit DTO, update/create/hide/show fixtures, denied media/invalid coordinate/130-character excerpt, error propagation |
| Full root `npm test` |2333 Vitest PASS,134 SKIP;336 legacy PASS,0 fail. Native PostgreSQL integrations remain gated, not PASS |
| Root `npm run check-types` |PASS,4 tasks |
| Performance script `tsc` |PASS after correcting typed observations; catches instrumentation separately |
| Benchmark/asset Node tests |5 PASS; bounds/redaction/percentile/canonical-hash/pixel equality |
| Next16.3.8 production build |PASS in isolated output with child-only DB read-only / provider keys empty; route/function output retained |
| Guest local browser |PASS scoped:18 page/interaction observations +4 protected API401 checks;390/768/1440; Home/theme keyboard, Explore3 markers, Detail1 marker, no overflow/map error |
| Role cache isolation |No cross-request cache introduced. Canonical visibility/media offline tests PASS; authenticated end-to-end cache isolation BLOCKED without valid sessions |
| CMS create/edit/hide |In-memory publication/update fixtures PASS. Real test-environment Admin mutation flow BLOCKED, no database fixtures created |
| US28 / Trip Save/Edit / AI-RAG |Existing full offline mock regressions PASS; no live routing/model/Trip writes. No live acceptance claim |
| Changed-code Preview |BLOCKED: owner explicitly says no push/deploy |
| Premium static audit |34 existing errors/unresolved findings in tracked-source snapshot,0 findings in changed UI files. Whole-app design audit NOT PASS |
| `git diff --check` / secret check |PASS; no credentials or unrelated source changes in performance patch |

[Browser regression receipt](evidence/browser-regression.json),
[static findings](evidence/premium-static-audit.json),
[validation summary](evidence/validation.json). Verbose test/build/provider logs
stay in ignored cache. Early build/output-path and instrumentation failures are
documented; invalid samples are excluded, not misrepresented as passes.

## Changed files / review boundary

- `apps/web/src/modules/destination/public-home-destinations.ts` and new regression:
  one public Home read, exact canonical projection/description semantics.
- `public-destination-list.ts`, `destination-search.test.ts`: skip redundant
  unfiltered options lookup; filtered behavior unchanged.
- `apps/web/src/app/page.tsx`, `home-hero-video.tsx`, new lossless poster `.webp`:
  integrate read and smaller identical poster; retain original asset.
- `apps/web/next.config.ts` / `tsconfig.json`: opt-in isolated local benchmark
  build directory/types only; default Production output remains`.next`.
- `scripts/performance/`: bounded HTTP/browser/Neon/Prisma read-only tooling,
  controlled interaction probe, offline metric/asset tests, separate script
  typecheck and reproduction guide.
- Three performance reports, sanitized raw evidence and append-only progress.

Schema/migrations, Auth/RBAC/ownership, US28 provider, AI grounding/semantic/citation/
eligibility/abuse/idempotency, backup/snapshot/migration receipts: unchanged.

## REMAINING_RISKS / next approval gates

1. Review TXH patch; provide permission for a Preview deployment when ready.
2. Verify authorized Traveler/Admin sessions on that Preview: CMS add/edit/hide,
   public freshness for all roles, Planner candidates, Trip Save/Edit and ownership.
   Use a disposable test database/provider mocks, never Production mutation probes.
3. Re-run equivalent browser samples with enough repetitions/field telemetry;
   inspect tablet cold result, layout attribution and representative INP.
4. Decompose AI admission/persistence using safe spans in test environment before
   changing any lock/budget; independently verify actual service/DB placement.
5. Address or explicitly disposition existing static UI findings with their owners.

Only after these gates should a Production rollout be proposed. This audit stops
with local measured improvements and a reviewable TXH patch; no automatic release.

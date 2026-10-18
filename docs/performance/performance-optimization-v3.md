# Performance optimization V3 — Singapore rollout

Updated 2026-10-18T11:14:04.409Z. BASELINE_HEAD=a18e8be261ea18eadf3d7558e8f7255a09899f29; FINAL_HEAD=a18e8be261ea18eadf3d7558e8f7255a09899f29. Branch master (owner's latest explicit instruction supersedes direct-TXH preference). READY_FOR_OWNER_AUTHORIZED_MASTER_ROLLOUT;PRODUCTION_UNCHANGED_UNTIL_PUSH.

## Outcome and release boundary

Two controlled Previews are READY. Production rollout is pending the task commit/push; no claim of Production improvement is made yet.

The owner explicitly requested pushing master and testing maps on the single authorized Production domain. Preview tile401 is a documented environment restriction, not a PASS or a fixed app bug. Actual Production control uses native browser Origin/Referer and returns tile200 with3 markers. No origin spoofing, public provider key, cache/RBAC/readiness bypass or paid plan change. Original broad smoke status covered DOM/Auth only; the strict tile gate in [map evidence](evidence/performance-v3-map-before.json) supersedes any marker-only map conclusion.

## Root causes and changes

1. **Region placement — measured:** baseline Production and control Preview have180 deployed lambda artifacts in iad1; Neon Production is aws-ap-southeast-1. Same-code sin1 Preview materially lowers total HTTP duration in controlled public A/B. This establishes deployment-placement impact; pure Vercel-to-Neon network time and Function-only duration remain NOT_MEASURED. No inference that the Neon plan itself causes slowness.
2. **Extra public reads — inherited and preserved:** Home originally fetched global options and descriptions redundantly (4→2 SQL), unfiltered Explore fetched redundant taxonomy (3→2), editorial fetched unused areas/cultureLinks (10→8; detail18→16).12 paired Production-read-only DTO hashes match. [V2 query evidence](evidence/neon-read-flows-paired.json) remains unchanged.
3. **Poster payload:** lossless WebP458612B replaces PNG682840B, same1200×700 decoded pixels.224228B/32.84% reduction; original PNG/video retained. No design, media feature, model or routing change.
4. **Preview maps:** real tile requests401 while style/sprite200. Production tile200. Domain-authentication failure is demonstrated; exact Stadia account allowlist cannot be inspected (no management credential; CUA initialization fails). Owner confirms a single configured domain. Do not label this Neon, CSP, MapLibre or region failure.
5. **Private history:** real persisted authorization + repository list measures21 queries even with an empty fixture; transactions/retention cleanup are intentional safety boundaries. No speculative removal. Preview HTTP history503 occurs at the unchanged runtime gate, before provider work; it is excluded from successful history latency.

### Configuration and rollback

[Region receipt](evidence/vercel-region-validation.json): root vercel.json regions=[sin1]. Fetched Vercel schema supports root regions and rejects service-level regions. Existing services.web/root/framework/build/install commands and rewrites are identical. No route preferredRegion override found. Both Preview deployments:180 Node24 lambda.deployedTo entries, iad1 vs sin1. Build-region iad1 and CDN PoP are not Function evidence. Project default remains iad1, overridden by checked-in root config. One region only; no resource/plan/driver/pool/schema/index change.

Rollback target: dpl_6xThmeh8Ra279G7tgf5H8sZ7RouK, https://kltn-35aec67pp-to-xuan-hoai-s-projects.vercel.app, commit a18e8be261ea18eadf3d7558e8f7255a09899f29. Before rollout leave alias unchanged. After a bad rollout, use vercel rollback with that exact deployment; restore prior absence of root regions for subsequent builds. Rollback changes auto-assignment behavior and requires explicit promotion to resume it. No database rollback/import/reindex is required. Existing backup/snapshot/migration receipts are untouched. Original tracked binary patch and49 untracked files were preserved in ignored .cache/performance-v3-preserved before V3 edits.

## Controlled public A/B

[Raw240 observations](evidence/performance-v3-before-after.json).30 observations/workload/region; sequential, alternating order,750ms pause; same application code, project Preview environment and stable9-Destination Development cohort. Each API has a single matching canonical DTO hash across both variants. HTML contains different build artifacts and is not compared as a DTO. Preview origin protection uses scoped short-lived OIDC. No paid provider calls. First observed requests are retained; platform/compute cold start was not forced or measured. p95 is a sample percentile, not a real-user distribution.

| Workload | iad1 p50 / p95 ms | sin1 p50 / p95 ms | Median reduction |
| --- | ---: | ---: | ---: |
| /api/destinations | 771.9 / 1287.2 | 177.1 / 790.5 | 77.1% |
| /api/destinations?q=%C4%90%E1%BB%93ng%20V%C4%83n | 783.9 / 943.6 | 168.0 / 347.9 | 78.6% |
| /destinations/cmv97lcrq0016z09ws0o74lqp | 2409.1 / 2538.4 | 359.4 / 517.5 | 85.1% |
| / | 1240.3 / 1355.7 | 340.7 / 472.5 | 72.5% |

TTFB is also recorded in raw data; streamed headers/HTML completion/browser LCP are different boundaries. Function-only duration, Vercel DB checkout/query/Prisma CPU/serialization breakdown, wake-up, and field Web Vitals are NOT_MEASURED. CDN request logs expose edgeNetworkRegion but no Function/SQL duration; premium duration/billing telemetry remains inaccessible. No invented attribution or dollar savings.

## Authenticated reads and isolation

[300 authorized API samples](evidence/performance-v3-authenticated-comparison.json): real Better Auth sign-in and persisted Traveler/Admin guards;30 samples/case/region. Private no-store confirmed. sin1 window preceded iad1 window, so time/session/cache/load effects are not fully controlled; lower confidence than alternating public A/B. Fresh empty personal lists cannot prove large-history/pagination performance or nonempty ownership isolation. Denied Guest401 and Traveler→Admin403 are separately checked, never treated as successful read timing.

| Role/API | iad1 p50 / p95 ms | sin1 p50 / p95 ms | Median reduction |
| --- | ---: | ---: | ---: |
| TRAVELER /api/favorites | 1660.3 / 1784.1 | 171.3 / 316.5 | 89.7% |
| TRAVELER /api/trips | 1424.0 / 1621.6 | 161.3 / 310.3 | 88.7% |
| ADMIN /api/favorites | 1721.1 / 1852.8 | 169.2 / 388.5 | 90.2% |
| ADMIN /api/trips | 1487.1 / 1682.3 | 160.8 / 310.7 | 89.2% |
| ADMIN /api/admin/destinations | 1957.1 / 2104.5 | 173.6 / 303.8 | 91.1% |

[Dashboard120 alternating GETs](evidence/performance-v3-dashboard.json):30 per role/region; both users always see their own synthetic name and never the other. Traveler p50 1026.7→193.5ms; Admin 1007.1→184.5ms.

[Actual local Prisma/Neon spans](evidence/performance-v3-private-neon.json),5 samples/case,Development only. Real Better Auth and requireActor are used; no fake session resolver/principal. Driver wait includes wire and decoding; pool checkout overlaps other spans. Separate serialization bytes/ms are retained; actual server-only SQL and Prisma-only CPU remain NOT_MEASURED. These are after-only, not improvements.

| Role/workload | SQL count | local service+JSON p50 / p95 ms |
| --- | ---: | ---: |
| TRAVELER favorites | 7 | 738.6 / 1012.5 |
| TRAVELER my-trips | 5 | 358.7 / 372.8 |
| TRAVELER dashboard-authorization | 3 | 371.6 / 495.5 |
| TRAVELER ai-history-repository-only | 21 | 1663.3 / 2249.1 |
| ADMIN favorites | 7 | 448.0 / 757.2 |
| ADMIN my-trips | 5 | 334.1 / 341.5 |
| ADMIN dashboard-authorization | 3 | 208.3 / 213.5 |
| ADMIN cms-admin | 4 | 278.7 / 292.6 |
| ADMIN ai-history-repository-only | 21 | 1835.2 / 2617.6 |

History repository measurement runs only for new test principals and permits their owned retention cleanup/locks. It does not bypass or certify the disabled Preview HTTP gate. No Production history was requested, because GET history may scrub expired content.

[CMS fixture](evidence/performance-v3-cms-freshness.json): seven checks PASS—hidden create, show next read, edit next read, two publications, rollback, hide next read. One new synthetic Destination only; no existing content/media/rights edited and no uploads. Publication state is verified by real Admin API; public list/Home freshness is checked. Existing media-revoke/source-rights/visibility-race behavior is covered by focused/full offline tests, not an unperformed live media mutation. [Cleanup](evidence/performance-v3-fixture-cleanup.json):2 users,1 Destination and their prefixed idempotency records all0 remaining. First cleanup was correctly refused by editorial FK RESTRICT; helper now removes only owned test editorial then parent in a transaction. No schema/FK policy change.

## Frontend and cache

[Before](evidence/performance-v3-browser-home-before.json) / [after](evidence/performance-v3-browser-home-after.json): same throttled Chromium conditions; actual warm-cache hits; widths390/768/1440. One sample/condition, synthetic observed LCP/CLS only. Values below do not establish population/field improvement, and high mobile LCP remains a risk.

| Width/cache | observed LCP ms before→after | observed CLS before→after |
| --- | ---: | ---: |
| 390 browser-cold | 4568.0 → 3252.0 | 0.000482 → 0.000482 |
| 390 browser-warm | 1580.0 → 1464.0 | 0.000482 → 0.000482 |
| 768 browser-cold | 2488.0 → 1012.0 | 0.000250 → 0.000250 |
| 768 browser-warm | 2152.0 → 368.0 | 0.001954 → 0.000250 |
| 1440 browser-cold | 1980.0 → 976.0 | 0.000429 → 0.000429 |
| 1440 browser-warm | 2044.0 → 432.0 | 0.000429 → 0.000429 |

Guest maps/Detail DOM markers and layout fit all3 widths. Tile success is a separate gate as described above. JS/CSS/image/video resource counts/bytes are in browser raw evidence; cross-origin Resource Timing can be0 without TAO. Completed CDP bytes omit unfinished video streaming. No representative interaction/field INP measurement.

Request-fresh public reads retained; no persistent cache/Cache Components/Redis added. No invalidation lag introduced. Auth, session, Admin, Favorites, Trips, history and RAG eligibility stay private/uncached. CMS create/edit/hide/show/publish/rollback do not depend on cache invalidation. Code queries still recheck current visibility/media/source rights.

## AI/RAG and regression

No new paid inference, embedding, routing or reindex. Live cap0; incremental OpenAI cost USD0; normal audit Neon/Vercel/tile usage is not zero or financially measured. gpt-6.1-sol medium and embedding model unchanged; verifier25s within provider40s / response58s / Vercel60s / frontend70s / lease90s. Semantic verification, eligibility rechecks, citations, grounding, abuse limits, idempotency and UNKNOWN persistence semantics unchanged.27 focused tests include old10s timeout→503 control, successful11.5s verifier under25s, network/upstream/abort/deadline distinctions and unknown persistence. This proves the mocked regression, not live Production model latency or zero future503s. Historical AI stage timings stay historical in V1/V2; no reuse as new sin1 timings.

- Full Vitest2337 PASS,134 gated integration SKIP; legacy336 PASS.
- Focused27 PASS; benchmark7 PASS; root typecheck PASS (same-source Turborepo cache), benchmark TypeScript PASS.
- Two actual Preview Linux/Node24 production builds PASS. git diff --check PASS.
- Guest/Traveler/Admin read/API/SSR regressions PASS within tested cohort. Trip Planner UI opens; existing US24–28/Save/Edit/ownership suites PASS offline. No new live saved Trip or routing request;134 PostgreSQL-gated cases are not passed off as run.
- Auth/schema/AI/map/trip runtime source unchanged. React checklist reviewed for changed Home/poster usage; no new client waterfall/hooks/design change.

## Production evidence and remaining limits

PRODUCTION_DEPLOYMENT_ID=PENDING. PRODUCTION_SMOKE={"http":"PENDING","browser":"PENDING"}. Exact final alias/Function evidence is in [region validation](evidence/vercel-region-validation.json). [Production baseline](evidence/performance-v3-production-before.json) uses21 bounded public GETs,n3/workload,0 errors,3 Destinations; this small-sample p95 is the maximum. After-rollout metrics are pending, not inferred from Preview.

Remaining: authorized Production private accounts, nonempty large personal datasets, Preview history runtime opt-in with its exact allowed target/abuse readiness, live model phases/tokens/cost, field INP/LCP/p95, true cold starts, Function/SQL-only spans, fleet-wide pool saturation, paid telemetry/Neon consumption and native PostgreSQL-gated integration coverage. No plan/compute/index/driver/model changes are justified by these gaps.

## Files and required fields

Runtime/config: vercel.json; apps/web/next.config.ts and tsconfig.json (local benchmark output isolation); app/page.tsx; components/home-hero-video.tsx; public/images/ha-giang-highland-poster.webp; modules/destination/public-home-destinations.ts and public-destination-list.ts; modules/destination-editorial/editorial-service.ts. Regression files: Home/editorial performance Vitest and destination-search.test.ts. Tools/reports: scripts/performance/*, docs/performance/*, docs/ai-progress.md. No package/schema/migration/Auth/AI/US-28 runtime edit.

All requested machine-readable fields (BASELINE_HEAD,FINAL_HEAD,WORKTREE_STATUS,regions,Neon/SQL/HTTP/frontend/AI/Auth metrics,tests,rollback,REDIS_ADDED,release status) are under acceptance in [performance-v3-before-after.json](evidence/performance-v3-before-after.json). Post-release generated evidence can remain a documented working-tree delta after the shipped code commit, avoiding a second Production rebuild solely to update its own deployment ID.

References: [Vercel regions](https://vercel.com/docs/functions/configuring-functions/region), [Services schema](https://vercel.com/docs/services/config-reference), [Stadia domain auth](https://docs.stadiamaps.com/authentication/), [management access is separate from routing keys](https://docs.stadiamaps.com/client-api/).

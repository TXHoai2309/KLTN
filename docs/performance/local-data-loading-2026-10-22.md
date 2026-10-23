# Local data loading follow-up — 2026-10-22

Owner reported that loading remained slow on most pages after the API correction.
This extends [the earlier API work](local-api-latency-2026-10-22.md) without
changing data freshness, permissions or persistence rules.

## Verified causes and changes

1. **Shared UserMenu hydration mismatch.** The browser console showed a pending
   server Skeleton becoming a resolved Guest Suspense branch during first client
   render. React reported hydration failure and regenerated the affected tree.
   UserMenu now uses the same initial shell until its mount effect. Guest and
   cached Traveler/Admin session fixtures reproduce the mismatch before the fix.
   A fresh browser load after the correction reports zero new hydration errors.
   Session verification, errors/retry, logout confirmation and server authorization
   remain unchanged. No cookie/session result cache is enabled.
2. **Development connection recreation.** Re-evaluating the actual services module
   created a new Prisma/Neon pool each time. A development-only process reference
   now retains the client for the identical DATABASE_URL. Configuration changes
   select a new client; production retains its existing module lifetime. Auth is
   constructed with the selected client; no query results are retained.
3. **Explore loading flash.** An API loading notification erased the same query's
   already rendered server data. The page now passes its canonical request key;
   matching server content stays visible during the existing no-store freshness
   read. New-query data is never borrowed from the old query. Source identity and
   retry counters prevent late old responses from replacing newer server results.
   Completed client errors remain errors. The client revalidation still runs on
   mount, filter changes, server-result changes and Retry, including Back restores;
   this is not a reduction in that freshness request's HTTP count.
4. **Home waits for below-fold data.** The whole page awaited the Destination map
   read before returning the static hero. The request starts after the existing
   connection boundary, while only its map region awaits it inside Suspense.
   The existing MapSkeleton and responsive map dimensions form the loading state.
   Empty/database-failure CTAs and all final map content remain the same. The
   scroll-reveal attribute belongs to the stable wrapper outside Suspense so the
   ancestor effect cannot mutate a late map's attributes before hydration.

## Measurements

Only local dev and the configured Development Neon endpoint were exercised.
No Production, account, Favorite, Trip, schema or content writes were made.

- Initial Guest baseline: health repeats 24/24/42 ms; no-session auth repeats
  33/67/33 ms; Destination API repeats 330/269/473 ms. This establishes a DB-bound
  component of the wait, rather than blaming every request on compilation.
- Five alternating evaluations of actual before/after services source, with a
  real SELECT 1 after each simulated dev reload:

  | Variant | SELECT plus module initialization, ms | Clients created |
  | --- | --- | --- |
  | Before | 420, 265, 266, 270, 256 | 5 |
  | After | 252, 81, 78, 64, 73 | 1 |

  The first after sample still opens a connection. This isolates development
  module reload behavior; it is not a normal warm API or Production benchmark,
  and does not establish how often real Next modules are re-evaluated.
- A later normal Guest Destination API sample was 543/167/268/189 ms. Samples
  are small and not paired with identical traffic conditions. No field p95,
  universal sub-250ms target or all-route speedup is established.
- Streamed Home requests after the change:

  | Sample | Headers | First hero bytes | Data-backed map bytes | Complete response |
  | --- | --- | --- | --- | --- |
  | First, includes dev compilation | 1391 | 1392 | 1847 | 1850 |
  | Repeat 1 | 250 | 252 | 329 | 330 |
  | Repeat 2 | 224 | 227 | 341 | 342 |
  | Repeat 3 | 201 | 203 | 318 | 319 |

  All values are ms. These are server stream observations, not browser paint or
  LCP. Earlier Home full-response samples still included 1286 and 2122 ms;
  retain these tails, rather than claiming remote variability disappeared.

Sanitized receipts, source snapshots, read-only reload benchmark and logs are in
ignored `.cache/data-latency/`. The benchmark closes all clients in finally.
No live connection strings, response bodies or session material are serialized
into its receipts.

## Verification and boundaries

- Reproduced failing regressions before implementation: repeated dev client
  creation; Explore drops matching server data on loading; UserMenu first-render
  mismatch for Guest/Traveler/Admin; Home shell blocked by a deferred DB result.
- Focused Home/Explore/UserMenu/client-lifetime suite: 18 passed, including public
  Home projection/freshness tests. Broader Destination/Editorial/Favorite/runtime
  suite: 528 passed, 20 opt-in PostgreSQL tests skipped. These counts overlap.
- Legacy search 33/33, auth UI 36/36 and Explore 14/14 passed. Root typecheck
  (4 tasks), production web build with separate ignored output and whitespace
  checks passed. No schema/migration change requires a database migration.
- Real browser: fresh filtered Explore load has zero new hydration errors;
  search → detail → Back preserves the exact filter URL and three matching
  results. Streamed Home renders its final nine-Destination region and has zero
  new hydration errors after the wrapper correction. At 597px client width,
  scrollWidth is 597px and the map card height is 362px with existing styles.
- Premium static audit remains at the same 36 existing project findings. No
  unrelated forms, design tokens or UI contract rewrite is included.
- Full disposable PostgreSQL and authenticated browser acceptance are not claimed;
  the new database-lifetime test covers configuration switching without changing
  any live configuration. No paid provider call, dependency, driver/pool-size,
  environment-file, architecture platform, commit, push, merge or deployment change.

Remaining latency includes uncached data queries, connection establishment,
network round trips and Next dev compilation. The changes remove verified wasted
work and avoid blocking useful page content; they do not promise an absolute
latency bound across every page or realistic production concurrency.

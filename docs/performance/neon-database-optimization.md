# Neon database priority workstream — 2026-10-18

**NEON_PERFORMANCE_OPTIMIZED=PARTIAL.** Twelve read flows have controlled paired
before/after evidence and identical canonical DTO hashes. Several query counts
and medians improve; some sample maxima regress. Authenticated workloads,
Vercel runtime attribution and billing remain unmeasured. This is not a complete
Production end-to-end performance PASS.

Changes are on TXH HEAD `a18e8be` + uncommitted performance patch. Owner selected
direct TXH work, no push/merge/deploy. The Production domain was independently
observed at `a18e8be` during this continuation; that external deployment is not
an audit action. Earlier baseline at433f264 remains historical and is not mixed
with the new local paired experiment. No schema/index/Production data/Auth write,
paid inference/routing request, reindex/import or compute/plan change.

## Measurement design and bounds

- Pin Neon project/Production branch/endpoint using existing verification API;
  use the actual PrismaNeon7.10 adapter/Neon driver1.1.0 with a max2 pool, TLS and
  server-enforced `default_transaction_read_only=on`, statement5s/lock2s.
-12 service/repository flows,5 observations/variant, alternating old/new order,
  same host/cohort of3 visible Destinations. No simultaneous synthetic users or
  load test. The before implementation freezes the original query shapes; public
  detail before uses the original full editorial context. Nonchanged flows serve
  as controls. Raw finite results, including slower after samples, are retained.
- Query count comes from actual Prisma query events. Pool acquisition and driver
  query waits are measured separately in a benchmark-only observer. Callback and
  promise overloads are preserved/tested; overlapping waits use interval union,
  so parallel work is not counted twice as elapsed duration. Driver spans include
  wire latency and driver decoding; they are **not PostgreSQL execution time**.
- Serialization is measured around JSON.stringify of the full returned DTO.
  Total here is local service+serialization, not HTTP/browser/Vercel total.
  Separate numeric columns are not additive when their spans overlap. Difference
  between total and driver wait is not automatically Prisma CPU.
- No SQL, parameters, vectors, RAG text, private records, cookies or credentials
  leave memory. Canonical hashes ignore object insertion order, preserve array
  order, and prove equality for the actual bounded cohort. They do not certify
  all future data, so offline invalidation/visibility/media/error tests also run.
- Plans: one bounded replay per collected SELECT in each flow, max16/flow;
  EXPLAIN ANALYZE BUFFERS executes reads only. Relation/row/count/cost structure
  and planning/execution milliseconds are retained; literals/filters are omitted.
  Replayed plan timing is not substituted for original request server execution.
- RAG uses one **existing eligible stored1536-vector as an embedding fixture**;
  the real retrieval SQL/eligibility/tokenization path runs, no OpenAI request.
  This measures database retrieval only, not relevance or model quality.

## Required stage attribution

| Stage | Observed method / result | What is NOT measured |
| --- | --- | --- |
| Vercel Function starts handling | Existing QA diagnostics have relative request start; metadata/logs readable | platform queue/cold-start absolute time: NOT_MEASURED |
| Session authentication | source audit of uncached Better Auth + persisted role/status guard; Guest401 remains | valid Traveler/Admin duration: NOT_MEASURED |
| New Neon connection |3 clients each WS/TCP ×direct/pooled, SELECT1 probes | Vercel-to-Neon creation: NOT_MEASURED |
| Warm pool acquisition | observer records checkout wait; detail has internal relation fan-out | cross-instance global pool saturation: NOT_MEASURED |
| PostgreSQL execution | separate EXPLAIN replay of fixed/actual SELECT statements | original request DB_QUERY_MS: NOT_MEASURED |
| Driver query roundtrip | measured client.query wait including network/decoder | pure network-only delta: NOT_MEASURED |
| Prisma processing | returned service timing/query events available | Prisma-only materialization CPU: NOT_MEASURED |
| Serialization | exact JSON.stringify wall time in paired run | Vercel response compression/serialization: NOT_MEASURED |
| Response transmission | earlier HTTP header/body and browser timing measured | changed-code Vercel response transfer: NOT_MEASURED |
| Total | local service+serialization paired metrics | authorized end-to-end API duration: NOT_MEASURED |

No missing metric is filled from an unrelated row, SQL plan, denied API request,
or subtraction of overlapping timers. Full mandatory-column
[CSV](evidence/neon-read-comparison.csv), [JSON](evidence/neon-read-comparison.json)
and [readable table](neon-read-comparison.md) cover12 measured flows +5 blocked.

## Infrastructure and connection lifecycle

[Current Neon metadata](evidence/neon-infrastructure-current.json) confirms
`aws-ap-southeast-1` (Singapore), active compute0.25–2CU, suspend timeout0.
No compute wake-up was observed/forced; this setting/sample does not prove all
historical cold starts absent. No plan-related root cause is inferred.
Consumption history returns403; `pg_stat_statements` was absent in the earlier
extension inventory. Historical slow-query and compute CPU time series remain
NOT_MEASURED. No extension/monitoring product was installed or enabled.

[Vercel project and deployment artifact](evidence/vercel-neon-placement.json):
project default and180 Node24 function artifacts report `iad1`, including Home,
Explore, Destination and QA. This is stronger than the previous project-only
metadata. Previous433f264 function logs recordedhkg1; current10m log window was
empty, so actual traffic/failover reconciliation remains unknown. Singapore vs
deployediad1 is a **placement concern worth a Preview region A/B**, not a measured
network savings estimate. No region config change or new deployment was made.

App `services.ts` creates a module-level client/adapter, not one per page/query;
the adapter owns a Neon Pool and disconnects only when explicitly disposed.
Runtime application code does not disconnect after every read. Separate Function
instances can still each own a pool; this local audit cannot establish fleet-wide
connection pressure. Do not introduce a shared private/session result cache as
connection reuse. No driver/global singleton/pool-size/transport change adopted.

### Cold-client vs warm connection probe (local host only)

| Transport / endpoint | Connect p50 / sample p95,n3 | Warm SELECT1 p50 / sample p95,n6 |
| --- | ---: | ---: |
| TCP TLS pooled |363.35 /781.03ms|56.95 /59.21ms|
| TCP TLS direct |365.56 /717.73ms|54.28 /91.07ms|
| Neon WebSocket pooled |195.00 /203.97ms|62.72 /73.71ms|
| Neon WebSocket direct |295.46 /303.04ms|66.05 /146.91ms|

[Raw probe](evidence/neon-connections.json). Only one probe connection active at
a time. New client is not necessarily cold Neon compute/PgBouncer backend. The
initial TCP benchmark startup-options attempt returned08P01; benchmark was fixed
to BEGIN READ ONLY + SET LOCAL + verified transaction_read_only, then ROLLBACK.
This was instrumentation compatibility, not evidence of a Production app error.
Tiny samples do not justify migrating production transport or disabling pooling.

## Query findings and implemented fix

Public detail before:18 Prisma SQL events, of which10 in published editorial.
`readEditorialContext` reused `destinationSelect` for Admin DTO validation; that
included `areas` and `cultureLinks`. EditorialContext does not consume either.
The public-only context now excludes those two relations, retaining scalar,
opening schedule, media/source fields and canonical DTO validation. Admin's full
context remains unchanged. Result: detail16 queries, editorial8.

Visibility checks before and after materialization remain, as do current
media/source rights, strict layout parsing and resolveEditorial. No parallel
reordering of authorization/publication reads, cache, fallback or hidden-state
shortcut. Failures still return the existing null editorial fallback.

Earlier Home/list improvements remain: Home4→2 SQL by reading descriptions with
the initial public projection; unfiltered list3→2 SQL by deriving filter options
from the complete visible set. Filtered searches keep their global-options query.
No pagination/limit change that would make filter options incomplete.

### Paired results (n5; milliseconds)

| Flow | SQL before→after | p50 before→after | sample p95 before→after | Median change |
| --- | ---: | ---: | ---: | ---: |
| Landing |4→2|209.38→149.58|393.37→349.28|28.56% lower|
| Explore list |3→2|133.70→133.55|140.93→378.57|0.11% lower; maximum regressed|
| Explore map dataset |3→2|141.91→135.26|473.07→209.91|4.69% lower|
| Explore keyword |3→3|134.65→134.58|267.66→418.30|unchanged code; maximum regressed|
| Explore category |3→3|135.93→137.09|264.45→188.57|0.85% higher; unchanged code|
| Destination1 |18→16|841.95→777.43|901.37→1378.55|7.66% lower; maximum regressed|
| Destination2 |18→16|1061.88→830.57|1433.10→1574.48|21.78% lower; maximum regressed|
| Destination3 |18→16|900.14→786.98|1092.95→830.54|12.57% lower|
| Published editorial |10→8|528.57→510.35|961.21→821.90|3.45% lower|
| Planner candidate read |4→4|260.62→262.69|271.30→351.97|0.80% higher; unchanged code|
| Planner candidate recheck |5→5|329.33→308.35|345.33→336.06|unchanged code; variation only|
| RAG retrieval fixture |4→4|387.32→390.65|644.56→445.03|0.86% higher; unchanged code|

All12 hashes match. Sample p95 is maximum, not population p95; negative/control
results retained. Do not attribute unchanged-code changes to the fix. Results are
not averaged into a misleading all-route speedup.

### Query plans and saturation

Initial70 safe plan replays: non-RAG statements at most0.141ms in that run;
RAG vector retrieval1.450ms and keyword search33.871ms. Tiny relations/137 vectors
make sequential scans potentially appropriate; no demonstrated missing index or
large spill. Driver waits hundreds of ms dominate these tested scalar/relation
reads. Do not equate local network samples with Vercel's network path.

Warm client checkout p50 for detail185–192ms after vs~256–264ms in the separate
baseline run reflects relation fan-out/wait under benchmark poolmax2, not confirmed
cross-request production saturation. Observed waiting queue reached4 during nested
reads. Counts/rows/plan nodes are retained. No increase to runtime poolmax, compute
or connection limits, and no speculative HNSW/full-text index migration.

## Public cache / invalidation decision

### Private/query source inspection (not runtime measurements)

| Requested workload | Current implementation evidence | Performance boundary |
| --- | --- | --- |
| Favorites | `favorite/favorite-service.ts:getFavorites` guards actor, owner WHERE, explicit destination/culture/media select, one nested findMany | no valid user session; row count/fan-out and query duration NOT_MEASURED |
| My Trips | `trip-read/trip-read-service.ts:listMyTrips` owner WHERE, summary-only select with owned favorite relation | source is batched, not proof of no driver N+1 on real cohort; pagination need not inferred from empty fixtures |
| Trip Planner | canonical bounded64 visible candidates + nested media/opening schedule; eligible snapshot recheck |4/5 measured SQL, no proposal/routing calls |
| Dashboard | request-local session with disableCookieCache/disableRefresh, then persisted user role/status check | authorization reads are deliberate; no shared session cache shortcut |
| CMS Admin | `destination-service.ts:listDestinations` guard then25-row page+lookahead explicit summary select; Admin detail keeps full edit data | authenticated query/serialization/network timings BLOCKED |
| AI history | `qa-conversation-store.ts` principal ownership/expiry boundaries and bounded list/turn cursor reads | private principal cannot be invented or reused from another user's ID |
| RAG retrieval | bounded read transaction, exact current publication joins and eligibility, hybrid vector/keyword branches | actual SQL measured with stored-vector fixture only; no generation/persistence |

No private Production content was enumerated to obtain a benchmark actor. Existing
Auth/ownership tests are meaningful offline regressions, not replacements for
those missing runtime measurements.

Evaluated Next16 Data Cache/use-cache, tag revalidation, per-query caches and
request deduplication. Next config has no Cache Components enabled; adopting a
new persistent cache requires a coordinated design, not a wrapper around Prisma.
Existing public APIs are no-store; dynamic Home uses connection(). This patch
keeps request-fresh reads. Deduplicating/removing queries has zero stale window.

| Mutation boundary | Invalidation requirement if cache is adopted | Current patch |
| --- | --- | --- |
| Destination create/update (legacy and V3) | expire public list/filter/detail and affected editorial tags after confirmed commit | no persistent cache; next read observes DB |
| Visibility hide/show | immediate expire list/map/detail/planner-public content; no stale-while-revalidate hidden result | canonical visibility read/recheck retained |
| Media upload/finalize/remove/rights | expire cover/list/detail/editorial projection after confirmed commit | shared media eligibility, fresh reads |
| Sources/profile change | expire public detail/editorial and affected linked content | rights and parser retained |
| Editorial PUBLISH/ROLLBACK | expire published detail only; drafts remain private | fresh published read; draft never used |
| Import/direct approved SQL | explicit owner-controlled invalidation receipt required | audit does not import/write/cache |

Every boundary would need SUCCESS-only commit hooks, idempotent replay handling,
UNKNOWN reconciliation and tests before a persistent cache could ship. No such
cache is added now, so there is no new invalidation failure mode. Existing
Favorite, Trip, Session, Admin, conversation history remain uncached/private.
Offline tests exercise next-read create/edit/hide/show/publication/media-revoke
and a final visibility race; authenticated live cache-isolation/CMS mutation tests
remain BLOCKED without valid sessions/test environment. No fake login principal.

## Regression, usage and next conditions

See [Neon validation](evidence/neon-validation.json) for final actual counts and
commands. Existing full RAG/Auth/ownership/abuse/idempotency suites run unchanged.
No production writes were used to test private endpoints. Local browser retains
public map/detail readiness and Guest401 boundaries, not authorized workload PASS.

Measured per-request work falls2 SQL on Home/detail/editorial and1 on unfiltered
lists. No extra runtime query/retry/cache service/token cost. Project CPU/time and
network billing deltas are NOT_MEASURED (provider subscription restrictions); it
would be false to claim measured CU/$ savings or zero incremental audit usage.
Finite read-only audit queries themselves consume normal database/provider usage.

Remaining conditions: test changed code on authorized Preview, attach safe
per-request spans there for function/session/checkout/SQL/materialization/response,
run authenticated read-only workloads for5 blocked roles/routes, and compare a
Singapore-region Preview against current artifacts. Only then propose rollout.
No Production region, compute, schema/index, cache or authentication change is
authorized by this local measurement alone.

Primary references: [Prisma query event duration](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference),
[Neon driver/pooling](https://docs.prisma.io/docs/orm/v6/overview/databases/neon),
[Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region),
[Next16 cache revalidation](https://nextjs.org/docs/app/getting-started/revalidating).

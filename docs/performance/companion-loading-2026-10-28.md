# Companion API and page loading audit — 2026-10-28

Owner requested an audit and optimization from the supplied local development log.
Work is local on `TXH`, alongside existing uncommitted companion implementation.
No commit, push, merge, deployment, environment, dependency or product schema change.

## What the log establishes

| Workload | Observations | Median | Maximum |
| --- | ---: | ---: | ---: |
| Companion group page | 23 | 2,900 ms | 7,600 ms |
| Public introduction | 40 | 1,121 ms | 2,700 ms |
| Group API | 25 | 1,021 ms | 3,100 ms |
| Unread API | 86 | 686 ms | 3,000 ms |
| Message delta API | 49 | 622 ms | 2,200 ms |

Wrapped log lines were rejoined before extracting route/status/duration. These
figures mix cold compilation, HMR failures, navigation, warm requests and different
principals. They are diagnostic context, not a controlled before/after benchmark.
The single management-page request spent 10.3 of 11.9 seconds in Next compilation.
The repeated `Cell ... no longer exists` panic and Gzip listener warnings are real
log observations; this audit did not reproduce their multi-hour trigger or establish
that the listener warning causes application latency.

## Changes and evidence

- Group page: fetch only the selected chat/member tab. The initial itinerary no
  longer waits for two unused authenticated transactional reads. Fetch the actor
  and group concurrently, then fetch independent host/selected-tab data concurrently.
- Introduction: determine membership through `requireGroup`, without fetching
  the complete private itinerary, destination media and member count just to get
  its relationship. Existing server authorization remains authoritative.
- Introduction, group and management: React `cache` shares the service result
  between metadata and page **within one server render**. There is no persistent
  cache of account status, membership or private results across requests. This is
  the documented [metadata pattern](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).
- Idle delta: after current account/membership checks, skip the message query
  when the consumed cursor equals the committed high-water cursor. Future cursors
  still fail; new committed messages retain the original bounded query/snapshot.
- Unread: omit aggregation for groups whose read marker already covers their
  committed cut. Groups without a marker or with pending messages still count
  actual messages, excluding the current author's messages as before.
- Group client: coalesce overlapping unread requests. Use the freshly rendered
  group on initial mount; later timer/visibility/online events still revalidate it.
  Hidden-tab polling, principal cleanup and revoked-access handling are retained.
- MapLibre: prepare both official worker/shared sourcemaps with their modules.
  The two URLs from the log now return 200 instead of rendering Next's 404 page.
  These maps total about 2.75 MB and are requested by debugging tools; this is not
  a claim that the visible map or normal production assets load faster.
- Add `npm run dev:webpack --workspace web` as an opt-in development fallback.
  [Next supports this flag](https://nextjs.org/docs/app/api-reference/cli/next).
  The default Turbopack path/version is unchanged. Webpack bypasses the failing
  engine; it is not a proven root fix for the reported panic or a faster compiler.

## Paired service measurements

[Before](evidence/companion-reads-2026-10-28-before.json) and
[after](evidence/companion-reads-2026-10-28-after.json) use the same existing
Development group and a host session supplied by the harness. The actual services,
persisted account/relationship checks and configured Prisma Neon adapter run against
the verified Development endpoint. PostgreSQL `default_transaction_read_only=on`
is required and checked before reading application rows. No business data is written.
Only timings and Prisma query-event counts are output, without IDs or row contents.

Three sequential samples per workload, Node 22.19.0, no throttling/concurrent load
or forced cold start. **These exclude Better Auth session resolution, HTTP,
React rendering, browser assets/paint and production conditions.** The page-data
workload mirrors the before/after itinerary page service calls; it does not measure
the page response or include metadata duplication. The group-service-only row is
a control: its implementation was unchanged, so timing variance is not a gain.

| Workload | Before samples, ms | After samples, ms | Median before → after | Prisma query events before → after |
| --- | --- | --- | --- | --- |
| Itinerary page data chain | 1741 / 1735 / 1811 | 820 / 868 / 729 | **1741 → 820 (−53%)** | 27 → 14 |
| Idle message delta | 435 / 423 / 410 | 293 / 285 / 307 | **423 → 293 (−31%)** | 6 → 4 |
| Unread summary | 332 / 340 / 346 | 532 / 293 / 300 | **340 → 300 (−12%)** | 5 → 4 |
| Group service control | 725 / 894 / 669 | 634 / 633 / 633 | 725 → 633; variance | 11 → 11 |

The unread change's first sample was slower. The query reduction is deterministic;
these three samples are not an SLA, p95 or general endpoint speedup.

Reproduce current services from `apps/web`:

```powershell
node --import tsx scripts/benchmark-companion-reads.mts after
```

The `before` mode replays the original page call chain; to reproduce original
delta/unread SQL behavior too, the corresponding original service source is needed.
The existing paired receipts preserve the actual pre-change observation.

## Production-build HTTP and browser smoke

The isolated `.cache/performance-next` build ran on Node 24.22.1 at loopback port
3098, using the unchanged local Development configuration. The server's initial
startup/read warmup is outside the following three-sample observation window.
This is a local production-mode build, not a deployed Production environment.

[HTTP receipt](evidence/companion-http-2026-10-28-after.json):

| Guest workload | Complete response samples, ms |
| --- | --- |
| Discovery HTML shell | 12 / 6 / 8 |
| Public introduction HTML | 896 / 363 / 311 |
| Public companion API | 530 / 515 / 561 |
| Destination API | 110 / 94 / 115 |
| Explore HTML | 133 / 111 / 112 |

Discovery HTML is only the shell; its list still needs the client API request.
Streaming header times and complete HTML differ. These are not browser paint
times and must not be compared directly with the supplied development log.
The list/intro render in the in-app browser, including the map and correct Guest
login action; no warning/error entries appeared in the inspected console window.
No authenticated browser journey or browser Web Vitals measurement was performed.
Five private API reads (group, management, members, messages, delta) return 401
and `Cache-Control: private, no-store`. Both MapLibre sourcemaps return 200.

The Webpack fallback was smoke-tested on isolated loopback port 3097:
discovery and Destination API returned 200. Cold compilation took 27.0/9.3 seconds;
the next requests took 311/257 ms. Varlock emits an existing dynamic dependency
warning under Webpack. No Turbopack panic occurs on this path because it uses
Webpack; no multi-hour HMR stability certification is claimed.

## Verification and limits

- Before fixes: four page/polling assertions failed, plus two client interaction
  assertions reproducing a redundant mount fetch and three overlapping requests.
  After fixes: all pass. Regression tests cover selected-tab reads, lightweight
  introduction membership, consumed/pending cursors, account lock and membership
  revocation, conditional unread aggregation, interval refresh and event coalescing.
- Focused companion/header/page suite: **204 PASS**, with 58 opt-in PostgreSQL
  cases skipped in that command and run separately below.
- Actual owned disposable PostgreSQL: **58/58 PASS**, 23 scoped migrations,
  zero pending, owned-container cleanup PASS. Cursor/replay/concurrency/unread
  and access-revocation tests execute against real PostgreSQL.
- Root typecheck: four package tasks PASS. Isolated Next production build PASS,
  53 generated pages. `git diff --check` and map-script syntax check PASS.
- No full repository suite, live AI/routing/write journey, authenticated HTTP
  before/after, mobile/CPU/network throttling, field LCP/INP, deployed environment
  or long-running HMR stress test. Existing uncommitted changes are retained.

The remaining group read still loads its itinerary graph (11 Prisma query events),
and warm public companion API reads remain around 0.5 seconds here. Session/database
network latency and cold development compilation still matter. Join/send/read-marker
write transactions, locks, confirmed outcomes and idempotency were not shortened
by skipping authorization or weakening consistency.

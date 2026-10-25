# Destination detail loading follow-up — 2026-10-23

Owner reports that data loading is still slow on most pages and asks to continue.
This follows the [shared loading fixes](local-data-loading-2026-10-22.md) and
[API batching/history work](local-api-latency-2026-10-22.md). Changes remain local
on master; no commit, push, merge or deployment.

## Finding and change

The public detail page awaited the complete canonical Destination read before
starting the published Editorial read. Each read already has its own persistence
visibility boundary. On the measured cohort, their SQL roundtrips dominate the
service time; the serial orchestration added their waits together.

The page now starts both reads together and awaits their combined result before
rendering. Canonical detail still controls missing, unavailable and database error
outcomes. Editorial independently validates the ID, checks canonical VISIBLE and
not-deleted predicates before reading a publication, validates only published
JSON, reads current media/source context and rechecks visibility after that read.
Its existing null fallback remains. No public DTO, API cache policy, publication,
rights, auth, query projection or schema is changed. This deliberately revisits
the earlier serial orchestration choice after measuring safe independent reads;
it does not reorder checks *inside* either service.

The successful published-detail path still performs 16 SQL queries. It saves
elapsed waiting, not query count. An unavailable ID can now incur an additional
ID-only Editorial eligibility read; it never starts reading that ID's publication
or context. Malformed IDs perform no Editorial queries. Peak in-request database
concurrency increases, so these local samples do not establish throughput under
many concurrent users. Pool configuration is unchanged.

## Measurements

Local HTTP, same first visible Destination, response body fully consumed:

| Sample set | API detail total, ms | Page total, ms |
| --- | --- | --- |
| Initial baseline, first request | 1801 | 2392 |
| Initial baseline, next four | 342 / 205 / 228 / 225 | 865 / 836 / 787 / 796 |
| Baseline confirmation, first request | 449 | 1042 |
| Baseline confirmation, next four | 235 / 257 / 335 / 408 | 877 / 870 / 834 / 848 |
| Changed page, first request | 454 | 558 |
| Changed page, next four | 251 / 235 / 264 / 296 | 476 / 498 / 544 / 548 |

Warm-page median in the adjacent confirmation/after sets: 859 → 521 ms (about
39% lower). These are tiny local Next-dev samples, not Production p95, LCP, or
an all-pages guarantee. First compilation/connection and the earlier slow tails
are retained above. API detail is unchanged and serves as a control.

The ignored diagnostic HTTP loop used a 700 ms warm-page threshold to distinguish
this reproduced delay: `node .cache/data-latency/detail-http.mjs before-confirm`
failed; `node .cache/data-latency/detail-http.mjs after` passed. This diagnostic
threshold is not a product SLA.

Independent paired service probe: same pinned Development endpoint, server-enforced
read-only connections, three public destinations, four alternating pairs each.
Both variants execute the actual existing service functions. Default PrismaNeon
pool settings stay identical, and every complete canonical DTO hash matches for
each destination across all eight observations.

| Cohort | Sequential samples, ms | Overlapped samples, ms | Median before → after |
| --- | --- | --- | --- |
| 1 | 825 / 705 / 606 / 611 | 404 / 418 / 411 / 395 | 658 → 407.5 |
| 2 | 650 / 673 / 656 / 686 | 458 / 456 / 455 / 402 | 664.5 → 455.5 |
| 3 | 1079 / 751 / 729 / 680 | 446 / 413 / 399 / 407 | 740 → 410 |

Receipt `.cache/data-latency/detail-service-paired.json` retains driver wait,
checkout wait, per-service time, query count and public DTO hashes. Driver wait
uses interval union to avoid double-counting parallel spans; it includes network
and decoding, not isolated PostgreSQL execution. SQL/parameters/response bodies
and credentials are not serialized. All probe clients disconnect in finally.

The first read-only probe attempt through the pooled hostname returned 08P01
because PgBouncer rejects startup options. The probe consequently uses the same
pinned Development branch's direct hostname to enforce read-only startup options.
This is benchmark configuration only. HTTP measurements above use the actual app
configuration; the paired service probe does not claim to measure that pooled
endpoint. No writes, fixtures or provider requests are used.

Reproduce the service comparison from the repository root:

```powershell
npx tsx --tsconfig scripts/performance/tsconfig.json scripts/performance/destination-detail-latency.ts
```

## Verification

- Before implementation, the actual-page deferred-read regression failed because
  Editorial had not started while canonical detail was pending; malformed-ID
  Editorial test also failed. Both pass after the change.
- Focused page/Editorial boundary suite: 10 passed. Full Editorial plus media
  eligibility and actual-page suite: 348 passed, six opt-in PostgreSQL tests
  skipped. Counts overlap. All AI/provider transport in that suite is mocked.
- Legacy Destination suite: 70 passed, including Guest/Traveler/Admin public
  allowlists, hide/show, no hidden-data leak, schedules, missing/unavailable/error
  behavior and related Culture eligibility.
- Root typecheck: four tasks passed. Performance-script typecheck passed.
- Real browser: filtered Explore → published Đồng Văn detail renders the complete
  article, current media, map and sources; return action preserves the exact
  `q=Lũng` filter and three results. No new console warnings/errors were captured.
- Production web build passed with separate ignored performance output; final
  whitespace/scope check passed. No migration is required because the schema is
  unchanged. No secret-file or runtime debug-log additions are included.

Production, authenticated browser, full disposable PostgreSQL and concurrent-load
acceptance remain unmeasured. No persistent data/session cache, driver switch,
credentials, environment-file, dependency or infrastructure change is included.

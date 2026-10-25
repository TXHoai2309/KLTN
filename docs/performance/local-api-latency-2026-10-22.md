# Local API latency correction — 2026-10-22

Scope: owner-requested correction to slow local API calls, within existing US-15
Favorite and US-21 history behavior. No deployment or change to product rules.

## Findings and implementation

- Supplied dev log: 266 single-target Favorite status reads; 25 history list
  requests with a 3,600 ms sample median and 7,600 ms maximum. Most time is labeled
  application code, so compilation alone does not explain the symptom.
- The history store performed the principal's retention cleanup twice per list.
  It also sampled a remote database clock at transaction start and discarded it
  before sampling again after the principal lock. Remove the repeated cleanup and
  unused timestamps. One owner-scoped EXISTS query under the existing lock checks
  whether maintenance is due before executing its four maintenance statements.
- Cleanup still commits independently before the protected read. Due work is
  performed immediately with existing batch limits. Expiry is sampled after lock
  acquisition; ownership, revocation, persisted account status and read predicates
  remain enforced. The cleanup scheduler obtains its needed timestamp explicitly.
- Assistant initial loading and debounced search now have one effect. A stable
  callback and AbortController prevent obsolete list responses from replacing
  newer results or crossing identity changes. No request-result cache is added.
- FavoriteButton batches simultaneous status reads by identity and target type.
  GET `/api/favorites/status/batch?targetType=destinations&targetIds=id1,id2`
  (also `culture`) accepts at most 50 IDs with strict bounded validation. The
  module authenticates once and queries only the actor's requested relations.
  Response: `{success:true,data:FavoriteResult[]}`, `private, no-store` on success
  and failure. It exposes no target metadata or visibility permission. Trips keep
  their existing single-target ownership boundary.
- The one-tick client queue deduplicates targets, separates identities, cancels
  unused requests and retains no results. A missing/malformed/failed response
  remains unknown. Existing mutation idempotency and confirmed-write UI remain.
  Session object reference changes alone no longer reload every mounted card.

## Measurements and limits

All timings are local Next dev against configured Development Neon in Singapore.
Fixtures are newly created and disposable; no paid model/routing request was made.
These tiny samples are not field p95 or an isolated production experiment.

| Workload | Before | After |
| --- | --- | --- |
| Empty Guest history, four sequential requests | 1320, 1335, 1344, 1562 ms | 890, 819, 840, 1027 ms after all clock corrections |
| Nine Favorite statuses, four alternating paired samples | 1370, 415, 439, 436 ms; 9 requests/sample | 498, 310, 339, 311 ms; 1 request/sample |

Before the final clock correction, history samples also included
`942,913,909,897`, `1147,902,943,1464` and `1253,1034,949,996` ms. Retain these
outliers: remote network/connection variability remains. The diagnostic's strict
default **every warm request below 1000 ms** assertion is still not satisfied by
the final sample (1027 ms). No guarantee that all APIs stay below one second, no
production improvement claim and no large-history/large-Favorites load claim.

Sanitized local receipts are in ignored `.cache/api-latency/`: `before.json`,
`after-history.json`, `final-history.json`, `idle-history.json`,
`final-clock-history.json`, `favorite-paired.json`, build logs and audit output.
The original before fixture and every HTTP benchmark Guest are revoked; the
synthetic Traveler used for paired HTTP measurements is removed in `finally`.

## Verification

- Focused Assistant/Favorite/history/HTTP/cleanup suite: 269 passed; 37 disposable
  loopback PostgreSQL tests skipped because Docker engine is unavailable.
- Real Development Neon regression, isolated to a newly generated Guest:
  empty, expired, deleted, failed-content, abandoned-processing, expiry crossing
  a held principal lock, and revoked identity. All owned rows are removed in
  `finally`. This does not substitute for the complete gated PostgreSQL suite.
- Root typecheck, performance-script typecheck, production web build in separate
  ignored output, legacy Favorite tests and `git diff --check`: see final handoff.
- Browser Guest Assistant: initial empty state, search/no-results and clear/loading
  behavior exercised without submitting an AI question. Authenticated nine-card
  batching is verified by scheduler tests plus real authenticated HTTP comparison;
  it is not claimed as an authenticated browser mutation test.
- Premium static UI audit: 36 existing project findings (missing UX contract/map,
  existing form/native-input/scrollbar findings). No layout/token/controls redesign
  was performed to resolve unrelated audit scope.

No dependency, schema, migration, pool-size/driver, auth-cache, provider policy,
environment file, production setting, commit, push, merge or deployment change.
Pre-existing Explore/Admin/launcher edits are preserved.

## Reproduction

From repository root with the existing local dev server on port 3010:

```powershell
node scripts/performance/qa-history-latency.mjs http://localhost:3010 .cache/api-latency/recheck.json
npx tsx --tsconfig scripts/performance/tsconfig.json scripts/performance/favorite-status-latency.ts
```

The first command records all samples before asserting its optional millisecond
budget (third argument, default 1000). A failure reports the remaining latency
tail. The second validates the pinned Development database before creating its
real Better Auth fixture, alternates the two HTTP read paths and cleans up only
that account. Never copy its credentials into command arguments or logs.

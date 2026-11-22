# Ticket 02 backend — 2026-11-04

> Historical milestone receipt. Current behavior/status: [BE 06–10](06-10-backend-verification.md). The temporary new-save gate has been replaced by authoritative journey Save.

**BE verified; FE/integration pending.** `origin-search-v1`, additive to
`origin-v1`. Not vertical DONE/ACCEPTED. No live public-provider request claimed.

## Delivered contract

`POST /api/trip-origins/search` accepts only `{ query: string }`, NFC/trim,
2–160 characters. No notes, trip needs, address object, personal contact fields
or arbitrary provider options. Obvious email/phone/URL/control-character input
is rejected. This cannot classify all possible personal data: FE must explicitly
ask for a public place name and disclose that the query goes to Nominatim.
Auth Traveler/Admin precedes body reads, matching Origin/fetch metadata, JSON,
2048-byte bounded input and private-no-store on every response.

Success generic data: `{ revision: "origin-search-v1", status: "RESULTS" |
"NO_RESULTS", results, cached, attribution }`. Each result is the strict origin
selection shape with `source: "NOMINATIM"`, **confirmed: false**, sanitized label
and coordinates, rechecked against the same Vietnam polygon as manual input.
Attribution is `© OpenStreetMap contributors`, copyright link, `ODbL-1.0`.
Returned values are plain text; FE must not interpret labels as HTML.

Errors: 401 UNAUTHENTICATED; 403 FORBIDDEN_ORIGIN / role/account denial;
400 INVALID_ORIGIN_QUERY; 415 INVALID_CONTENT_TYPE; 413 ORIGIN_INPUT_TOO_LARGE;
429 ORIGIN_SEARCH_BUSY with Retry-After=4 and retryAfterSeconds detail;
503 ORIGIN_SEARCH_UNAVAILABLE. Search is read-only for the Trip domain and does
not use the Trip SUCCESS/FAILED/UNKNOWN write envelope. No provider/DB exception,
endpoint/contact/configuration or raw response leaks through errors.

Client-safe schemas and fixtures: `origin-search-contract.ts`,
`origin-search-fixtures.ts`. Loading is client request-in-flight state, not a
server response. There is no automatic retry, autocomplete, reverse lookup,
periodic query or fetch on pin movement. FE still implements explicit submit,
stale-response/cancel handling, attribution and manual fallback.

## Admission, cache and provider

Prisma additive migration `20261104110000_origin_search` adds only
`origin_search_admission` and `origin_search_cache`, TIMESTAMPTZ clocks.
Atomic autocommit UPDATE reserves a global **four-second window** before any
external call. Three seconds are available for I/O, followed by a one-second
cooldown. Claim duration is measured from before DB I/O on a monotonic clock,
so a slow/delayed reservation response consumes its window; an expired claim
never starts a call. Worker death/abort does not release admission early.
The stricter admission policy gives at most one active upstream call and spaces
admitted calls farther apart than the public maximum of one request/second.
DB calls have bounded waits, whole service budget five seconds. No provider I/O
is performed in a DB transaction. No process-local limiter pretends to be shared.

Cache keys hash normalized public query + endpoint + contract/coverage revision;
raw queries are not persisted. Cache stores only projected results, including
empty results, for one day. Reads revalidate payload/coverage. Endpoint changes
namespace cache; expired rows are lazily removed in bounded batches of 100.
Cached provider coordinates/labels are still OSM-derived data: attribution/ODbL
applies, and cache is not a private Trip origin projection or public API.

`NOMINATIM_CONTACT` (operator-owned public URL/email) is optional and blank by
default; absent/invalid identification disables upstream. Optional
`NOMINATIM_SEARCH_ENDPOINT` defaults to the selected public service and is
server-side config, HTTPS, no URL credentials/query/hash. No actual operator
contact or credentials were invented/changed. App identification is sent via
User-Agent; only bounded explicit place query, VN filter and format/limit are
sent. Response bytes <=64 KiB, redirects denied, cancellation/timeout bounded,
errors sanitized. The public provider was selected knowingly by the owner in
Q12; restrictions verified against the [official policy](https://operations.osmfoundation.org/policies/nominatim/).
Moderate use only, attribution, no private query data, no autocomplete; service
access can be withdrawn. A configurable endpoint and manual picker remain.

## Evidence

- `origin-search.vitest.test.ts`: **15 PASS**, provider/service/HTTP behavior,
  config, request filtering, attribution, cache/no-results/busy/errors, stalled
  DB, delayed claim, noncooperative provider, timeout/abort and no retry.
- Scoped regression suite before final DB-budget test: **457 PASS / 7 skipped**;
  the final search suite above includes its additional test. Skipped cases are
  opt-in DB cases, run independently where applicable.
- `node apps/web/scripts/test-origin-search-postgres.mjs`: **4 PASS**, actual
  PostgreSQL 16 disposable, one scoped Prisma migration deployed, status up to
  date / zero pending; three independent OS workers, committed admission after
  worker death, reopen after four seconds, shared cache/no-results/expiry and
  cleanup. Initial worker test loader failed (CJS top-level await); changed only
  the worker harness to `.mts` with test-only server marker alias and reran PASS.
  Container ownership verified; cleanup PASS. This is scoped migration evidence,
  not evidence that all historical migrations or shared deployment are healthy.
- Root `npm run check-types`: four tasks PASS. Initial BigInt literal test type
  error fixed to match repository ES2017 target.
- Final isolated production webpack build: PASS, output
  `apps/web/.cache/performance-next`, includes both origin API routes. Existing
  Varlock dynamic dependency warning remains. A normal Turbopack rerun failed
  during loader process startup; sandbox webpack then failed font DNS/output
  EPERM. Isolated build with network/filesystem access succeeded. Earlier ticket
  01 build PASS remains historical evidence, not a claim these failures vanished.
- Prisma client and Varlock types regenerated from additive schema/config;
  no shared migration apply, no Development/Production DB access, no actual
  contact/configuration/credential write, no Nominatim load test/live call.
- Full-repository Vitest is not green; see ticket 01 full-run limits. No UI or
  browser acceptance, authenticated deployed search, rollout or deploy claimed.

## Remaining / next

Deploy the additive migration and configure valid operator identification only
under separately authorized shared deployment. FE connects explicit search,
manual fallback, attribution, query-change confirmation invalidation and stale
responses; browser integration remains pending. New Save gate from ticket 01
remains. Next BE frontier: ticket 03 one-day origin endpoints/rest/scheduling.

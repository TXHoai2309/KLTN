# Bounded performance audit

Run from repository root. Node22+, existing dependencies, Chromium/Playwright
required for browser scripts. No dependency/lockfile or account-plan change.
Browser module argument may be an installed `playwright` package or an absolute
module directory supplied by the local tooling runtime. Never pass credentials
in arguments. Secret-file arguments are **paths only**, to Git-ignored files.

```powershell
node scripts/performance/http-baseline.mjs https://kltn-rho.vercel.app docs/performance/evidence/http-production-before.json 3
node scripts/performance/browser-baseline.mjs https://kltn-rho.vercel.app docs/performance/evidence/browser-production-before.json <playwright-module>
npx tsx --tsconfig apps/web/tsconfig.json scripts/performance/database-readonly.ts apps/web/.env docs/performance/evidence/database-after-paired.json after
node scripts/performance/neon-monitoring-readonly.mjs apps/web/.env
node scripts/performance/local-readonly.mjs build apps/web/.env
node scripts/performance/local-readonly.mjs start apps/web/.env 3098
# In another terminal, while the test server runs:
node scripts/performance/browser-baseline.mjs http://localhost:3098 docs/performance/evidence/browser-local-after.json <playwright-module> home
node scripts/performance/browser-regression.mjs http://localhost:3098 <playwright-module>
node scripts/performance/interaction-readonly.mjs <playwright-module>
node --test scripts/performance/*.test.mjs
npx tsc --noEmit --project scripts/performance/tsconfig.json
# Neon priority extension: credential FILE PATH, never connection string:
node scripts/performance/neon-connections-readonly.mjs apps/web/.env
npx tsx --tsconfig scripts/performance/tsconfig.json scripts/performance/neon-read-flows.ts apps/web/.env docs/performance/evidence/neon-read-flows-paired.json paired
node scripts/performance/neon-report.mjs
```

- HTTP:1 discovery +19 routes×1..5 samples, sequential500ms pauses,20s deadline;
  no redirects followed, no cookies or response bodies retained. Do not repeat
  during real traffic incidents or interpret tiny-sample p95 as field p95.
- Browser core:20 navigations, home:6. No credentials; non-GET/HEAD refused.
  Corrected harness uses CDP Fetch so caching works. Browser cold clears browser
  cache, never Vercel/Neon. Warm records actual cache-hit count. Core mode does
  not create an Assistant identity or measure successful AI answers.
- Regression: loopback only;390/768/1440, bounded marker wait20s; Guest protected
  pages and401 API boundaries. No claim of authenticated CRUD/Planner acceptance.
- Interaction probe: loopback Home theme click/Escape only;3 widths, mobileCPU4x,
  Event Timing duration/input/processing/presentation delay. No field INP claim
  and no claim of improvement without an interaction baseline.
- DB: explicit pinned SYNC_* inputs plus Neon identity verification, TLS, actual
  PrismaNeon adapter max2 and server-enforced read-only/statement10s/lock2s.
  Paired mode alternates frozen old query flow and new service,5 samples each,
  and hashes canonical DTOs (object key order ignored, array order preserved).
  SQL plans are fixed SELECTs; never query text/source bodies/auth metadata.
- Local build/start: child-only Production DB read-only setting, synthetic auth
  secret, provider keys empty, runtime closed. `.cache/performance-next` output
  selected by local-only `KLTN_PERF_BUILD=1` prevents clashes with `next dev`.
  No Vercel env change. Normal build retains `.next`. No script can deploy.
- No script calls paid OpenAI/Routes, indexes/imports or changes schema/data.
  Neon API script uses GET only. Existing Production AI diagnostics were read
  via Vercel CLI; sanitized numeric events are in the evidence directory.
- Neon extension:12 service/repository flows×5 samples per variant, alternating
  old/new. Max2 pool, verified read-only, bounded EXPLAIN SELECT replay once per
  flow, max16 statements. `server-only` is mapped to the same empty stub used by
  the offline suite only for this local benchmark; no application authorization
  entry point/private principal is bypassed. RAG uses an existing eligible vector
  as an embedding fixture in memory, never an OpenAI request. Private workloads
  stay BLOCKED. Do not interpret this as a Production API/load or semantic test.
- `neon-spans.mjs` observes connection/query overloads only inside the benchmark;
  it never ships in runtime. Raw SQL/values remain in memory for EXPLAIN replay;
  output contains numeric spans and structural plans only. Plans omit filters.
- Connection probes use3 fresh clients×3 SELECT1 each for2 transports/2 endpoints,
  one active at a time. BEGIN READ ONLY + SET LOCAL, verify, ROLLBACK. They measure
  local-to-Neon, not the Vercel hop or a forced compute cold start.

PostgreSQL `name` casting, CLI-mode shadowing and object-key-sensitive hashing
were corrected in instrumentation. Invalid intermediate results remain in ignored
cache and are excluded from accepted paired evidence. The asset test validates
pixel equality and writes a lossless receipt; it does not encode/change assets.

Reproduction requires access to the same target, dependency versions, exact source
revision/patch and benchmark conditions; numbers will vary with network and load.

## V3 controlled Preview comparison

`preview-region-benchmark.mjs BEFORE_PREVIEW AFTER_PREVIEW IGNORED_PREVIEW_ENV OUTPUT`
runs exactly 30 sequential GETs per variant for four public workloads, alternating
order and pausing750ms/request. Exact project Preview hostnames only; no writes,
redirect following, model calls or secret-bearing output. It stops after two
unexpected responses. JSON DTO hashes must match; HTML build bytes are not DTOs.
Use `vercel inspect --json` to prove each deployment's lambda `deployedTo` region
before measuring. Do not infer Function region from `x-vercel-id` or build logs.

`preview-test-accounts.ts create|cleanup` provisions real Better Auth fixtures on
the pinned DEVELOPMENT endpoint only. Admin role assignment is test setup on the
new synthetic user, matching existing integration tests; application guards remain
unchanged. Private credentials/IDs stay in `.cache/`. `cleanup` removes only those
receipt-owned synthetic accounts, Destination IDs and prefixed idempotency records.
Never point it at Production. Cleanup must wait for any UNKNOWN write to reconcile.

`preview-browser-smoke.mjs PREVIEW IGNORED_PREVIEW_ENV PLAYWRIGHT_MODULE OUTPUT`
uses those real accounts and tests Guest/Traveler/Admin boundaries,30 samples of
authorized Favorite/Trip/Admin reads, protected pages and390/768/1440 public maps.
Only real sign-in POST is allowed; all other browser writes are blocked. Its
Playwright interception disables HTTP cache, so it is not a warm-cache/Web Vitals
benchmark. Preview AI readiness stays closed; history503 is explicitly BLOCKED,
never counted as a successful authorized history read.

`preview-dashboard-benchmark.mjs BEFORE_PREVIEW AFTER_PREVIEW IGNORED_PREVIEW_ENV OUTPUT`
alternates30 GETs/role/region and checks that each dashboard contains its synthetic
user's name and never the other fixture's name. Bodies/cookies are never persisted.

`private-neon-read-flows.ts` measures five service/repository workloads with real
Better Auth sign-in/persisted authorization on DEVELOPMENT. Fresh empty personal
cohorts do not establish large-history performance. History's owned retention
cleanup/locks are intentionally allowed only for these test principals. Direct
repository timing does not prove the disabled Preview history HTTP gate works.

`preview-cms-freshness.mjs PREVIEW IGNORED_PREVIEW_ENV OUTPUT` creates one synthetic
Destination only after the exact Development fixture Admin successfully signs in.
It checks next-read create/edit/hide/show, publication and rollback without uploads
or paid AI. Run after benchmarks so its temporary public fixture cannot change the
measured cohort. Do not rerun UNKNOWN operations with a new key. Hide/cleanup only
the receipt-owned fixture; existing content and permissions are never edited.

`browser-baseline.mjs ORIGIN OUTPUT PLAYWRIGHT_MODULE home IGNORED_PREVIEW_ENV`
adds origin-scoped development OIDC for protected Previews via CDP, preserving
browser caching. The optional credential is never sent to external asset origins.
Use one browser/benchmark at a time; keep all samples including regressions.

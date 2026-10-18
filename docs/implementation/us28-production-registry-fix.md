# US-28 Production routing registry fix — 2026-10-18

US28_PRODUCTION_ACCEPTANCE=PARTIAL. Production release decision: **NO_GO**.
The code fix is committed locally on TXH. No push, branch promotion or Production
deployment was performed because the required Preview map gate is not met.

## Revision and scope

- HEAD_BEFORE: `70a810f5e088cbfad68be790a7e5ce88db150ee3`.
- HEAD_AFTER: code commit `f1d414ce1cdb0542b85684f803cf9794b66ceccc` on TXH; the following documentation commit
  contains this report and evidence, without further runtime changes.
- Fetched `origin/master`, `origin/TXH`, `origin/dev` before work and again before
  committing: all three were at HEAD_BEFORE. Initial working tree was clean.
- No Production schema/data/Auth changes, imports, reindexing, Trip creation,
  credential/config changes, Redis, model calls or routing-provider migration.
  Prior snapshots and migration receipts are preserved.

## ROOT_CAUSE / REGISTRY_BEFORE / REGISTRY_AFTER

At HEAD_BEFORE, `destination-routing-registry.ts:4–6` registered only Development.
`planner-runtime.ts:11–12` converted an unsupported registry into
`Promise.resolve([])`, bypassing the database query and returning a misleading
missing-candidate proposal. A second issue was matching only the first hostname
label: a spoofed hostname or HTTPS URL could match the Development entry.

The baseline regression run, before implementation changes, recorded 4 failed /
8 passed tests: Production direct/pooled recognition failed, and fake-host and
wrong-protocol rejection failed. The actual old registry is also loaded from Git
in the read-only integration script, rather than inferred from an env variable.

Current implementation:

- `apps/web/src/modules/destination/destination-routing-registry.ts:6–24` admits
  only reviewed endpoint/database pairs on their exact canonical `c-4` Neon
  hostnames, direct or pooled, PostgreSQL protocol, standard port and required
  TLS mode. Malformed/unknown inputs remain unverified.
- Development keeps only its own exclusion `cmv7kc5eu0003209w9ggzpolq`.
  Production has a separately reviewed empty exclusion list: that hidden
  Development duplicate is absent from Production; no exclusion was copied.
- `apps/web/src/modules/trip-planner/planner-registry.ts:8–16` rejects unsupported
  configuration with controlled HTTP 503 `PLANNER_NOT_CONFIGURED`, behind the
  existing persisted-role HTTP boundary and before DB/provider work. This avoids
  the service's deliberate masking of raw DB exceptions.
- `planner-runtime.ts:11–13` uses the guard and actual repository. Auth, snapshot
  rechecks, admission limits, retry keys and persistence semantics are retained.
- `planner-candidates.ts:26–45` returns bounded eligibility inventory from the
  **same single query**. Hidden/invalid coordinates remain excluded; no extra
  count query, relaxed filter or internal record payload is exposed.
- `planner-service.ts:45–70` distinguishes `NO_PUBLIC_DESTINATIONS`,
  `NO_SCHEDULABLE_CANDIDATES`, `INVALID_DESTINATION_COORDINATES`,
  `REGISTRY_EXCLUDES_CANDIDATES`, missing-duration warnings and existing check
  failures. The generic compatibility reason `NO_ELIGIBLE_CANDIDATES` remains.
- The bounded client recognizes only the safe configuration code; server messages
  are not reflected. Configuration failure offers administrator guidance without
  a pointless same-key retry. Ordinary technical failures retain retry behavior.

## NEON_PRODUCTION_VERIFIED / candidate and business-data inventory

Neon API independently verified project `summer-unit-95870477`, Production branch
`br-cold-dew-b3h270wp`, endpoint `ep-blue-art-b3v3vr4h` and database `neondb`, and
cross-checked the endpoint host against the supplied connection. Development was
separately verified as `br-aged-hat-b3o6hg9p` / `ep-purple-pond-b3xujb8o`.
Native PostgreSQL inventory ran in `REPEATABLE READ READ ONLY`, then ROLLBACK.
The Prisma integration also enforced and checked `transaction_read_only=on`.
No credentials are in the evidence.

| Production Destination | ID | Visibility / coordinates | Suggested / minimum (minutes) | Hours | Revision | Eligibility |
|---|---|---|---|---|---|---|
| Cao nguyên đá Đồng Văn | cmv97lcrq0016z09ws0o74lqp | VISIBLE; 23.192222, 105.196944 | null / null | 7 UNKNOWN days; no intervals | 5 | Public candidate; cannot select without duration |
| Di tích lịch sử Căng Bắc Mê | cmv9fcwo1000be89w3yxz3mqu | VISIBLE; 22.7308573, 105.3745508 | 60 / 45 | 7 UNKNOWN days; no intervals | 6 | Selectable preliminary stop; opening check insufficient |
| Chợ tình Khâu Vai | cmvanjc6p000f7w9wyuydna52 | VISIBLE; 23.0936183, 105.4917456 | null / null | 7 UNKNOWN days; no intervals | 7 | Public candidate; cannot select without duration |

- PRODUCTION_CANDIDATE_COUNT: **0 before / 3 after** registry correction.
- ELIGIBLE_CANDIDATE_COUNT: **1 duration-selectable / 0 fully verifiable** for the
  dated, one-day, no-mobility-constraint test requirement. These are distinct from
  the three visibility/coordinate candidates, not three accepted itineraries.
- EXCLUDED_DESTINATIONS: registry 0; hidden 0; invalid coordinates 0 in Production.
  Two records are excluded by the duration selection rule.
- MISSING_BUSINESS_DATA: approved durations for Đồng Văn and Khâu Vai; verified
  opening schedules for all three. Do not populate them with synthetic values.
- Final actual Production repository → engine → validator → revision recheck,
  for CAR and MOTORCYCLE: one Căng Bắc Mê stop of 60 minutes,
  `OPENING_UNKNOWN`, `INSUFFICIENT_DATA`, final confirmation false. Zero routing
  calls: one stop has no directed pair. This is a service integration, **not** an
  authenticated Production HTTP/browser test.

Evidence: [inventory](us28-production-registry-evidence/production-inventory.json),
[final read-only integration](us28-production-registry-evidence/production-planner-readonly.json).

## STADIA_ROUTING_STATUS / API and UI flow

`trip-validation/stadia-route.ts:19–20,60–61` and
`trip-planner/planner-routes.ts:8,24–27` are unchanged: CAR→auto,
MOTORCYCLE→motorcycle, no vehicle/provider fallback, 10-second global deadline,
at most 27 directed pairs/3 concurrent requests. Missing metrics remain nullable;
Haversine is selection-only. US-29B/30 duration-only semantics are unchanged.
Vercel project metadata confirms `STADIA_MAPS_API_KEY` present as Sensitive in
Preview and Production; only names/targets/types were retained. Browser tiles
continue to use hostname authentication, without a frontend routing key.

US24_TO_US28_FLOW / PLANNER_API_STATUS:

- Real Preview Traveler and Admin sign in with newly created Development-only
  Better Auth TEST accounts. Persisted CMS role checks return Traveler 403 / Admin
  200. These were not Production accounts or substituted auth dependencies.
- Both roles completed manual US-24 form → US-26 review → real US-27 check
  (`confirmable=true`) → explicit Planner CTA → real POST `/api/trip-proposals`.
  Request and response requirement snapshots match; CAR and MOTORCYCLE proposals
  each returned HTTP 200, `PROPOSAL_READY`, all five checks PASS, a verified Stadia
  leg of 599.412 seconds / 13,944 metres. These are measured fixture-route values,
  not estimates generated by the test or an assertion that vehicle profiles are
  interchangeable. Shared adapter profile mapping has separate mock coverage.
- Positive Preview proposals used one owned TEST Destination and the existing
  `test_planner_nha_vuong` Development fixture selected by the nearest-neighbor
  policy. Both are synthetic business evidence, not official Production tourism
  data. Existing fixture records were read without modification or deletion.
- Regenerate sends a new key with unchanged requirement. Back preserves review;
  editing duration 1→2 invalidates confirmation and requires another server
  check; no automatic proposal follows the edit. Same-key retry, ambiguous-network
  recovery and snapshot fencing are covered by focused mock tests.
- Guest gets 401. A real signed-in TEST user temporarily locked on Development
  gets 403 before request parsing/provider work, then is restored and cleaned.
- Planner start is overflow-free at 390 / 768 / 1440px. Positive proposal screenshots
  are included. US-25 NLP is optional and covered offline; no paid model call ran.

## PREVIEW_E2E_RESULTS / PRODUCTION_SMOKE_RESULTS

Preview `kltn-d45lpbxy4-to-xuan-hoai-s-projects.vercel.app` is READY with 180
functions deployed to `sin1`. It contains the registry/guard/client fix uploaded
from the working tree; its Git metadata still names the starting revision.
The later single-query inventory reason-code refinement was verified by final
unit/HTTP/read-only Production tests and build, and is not claimed as covered by
that earlier full browser run. A final committed-code Preview is inspected in the
separate final deployment evidence.

- Main browser groups: **9 PASS / 1 FAIL**. Failure: Preview tiles return HTTP 401,
  so MapLibre cannot retain/show the expected two proposal markers. This gate is
  **BLOCKED**, not PASS based on a canvas or successful style request.
- Additional boundary browser groups: **3 PASS / 0 FAIL**, zero provider calls.
- Earlier browser attempts are retained: outdated hidden-form selector, Chromium
  response-body capture eviction, and an overly strict fixture-only assertion were
  harness issues. They do not count as application passes. Capture now retains
  actual HTTP response bytes before UI navigation, and candidate IDs are checked
  against the read-only Development inventory. At most five one-pair live routing
  calls were possible across the proposal attempts; no load/quota benchmark,
  automatic retry or OpenAI request occurred. Dollar cost was not measured.
- Production Guest control: `/trips/new` HTTP 200; proposal POST HTTP 401
  `UNAUTHENTICATED`, `private, no-store`. Existing Production Explore MapLibre has
  three actual markers and successful tile requests (HTTP 200). This control
  does not replace authenticated Planner E2E.
- Production owner session could not be accessed: CUA initialization failed with
  Windows `os error 3`. No new Production account/session was manufactured.
- Both owned TEST users and both owned TEST Destinations were removed from
  Development; verification counts are zero. No Production Trip or data write.

Evidence: [browser groups](us28-production-registry-evidence/preview-browser.json),
[boundaries](us28-production-registry-evidence/preview-boundaries.json),
[cleanup](us28-production-registry-evidence/fixture-cleanup.json),
[Production map control](us28-production-registry-evidence/production-map-control.json),
[Production Guest smoke](us28-production-registry-evidence/production-guest-smoke.json).

## TEST_RESULTS / US30_REGRESSION

| Check | Executed result |
|---|---|
| Before-fix registry regression | Expected RED: 4 failed / 8 passed |
| Final US24–28, registry, engine/validator, Stadia, Auth, US29B/30, UI | 477 passed / 11 skipped; 28 files passed |
| Full Vitest | 2,358 passed / 134 skipped; 162 files passed / 15 skipped |
| Legacy | 336 passed / 0 failed |
| Typecheck | PASS |
| Final Production-mode build | PASS; 45 static pages generated |
| Diff whitespace / secret-value review | PASS; only safe evidence retained |
| Native disposable PostgreSQL suites | NOT_RUN here; required disposable test inputs unavailable; skips are not passes |

New tests cover Production direct/pooled identity, independent exclusions,
Development preservation, malformed/unknown/spoofed/protocol/port/path inputs,
controlled HTTP errors after auth, eligible mock rows, hidden/invalid filtering,
empty versus incomplete data, missing hours/durations, single-query inventory and
safe client/UI configuration feedback. Existing tests retain failed-provider,
nullable metrics, deadlines, concurrency, idempotency and snapshot-change checks.

US30_REGRESSION: all focused save/client/HTTP/panel tests pass; save/edit modules,
routing semantics and persistence are unmodified. The current US-28 UI has **no
official Save CTA connected**; its existing regression explicitly asserts this.
It is a preliminary proposal, not a saved Trip. No live Production save was tested.
Raw log summaries and SHA-256 digests:
[test evidence](us28-production-registry-evidence/test-results.json).

## Files changed

- Runtime: `destination/destination-routing-registry.ts`,
  `trip-planner/planner-registry.ts`, `planner-runtime.ts`, `planner-candidates.ts`,
  `planner-service.ts`, `lib/trip-planner-client.ts`,
  `components/trip-planner/trip-planner-screen.tsx` (all under `apps/web/src/`).
- Tests: new registry and Planner registry regressions; updated Maps URL resolver
  fake-host fixture and Planner configuration-error UI test.
- Audit helpers: `scripts/us28-production-inventory.mjs`,
  `us28-production-planner-check.ts`, `us28-preview-fixtures.ts`,
  `us28-review-evidence.mjs`; two `apps/web/scripts/us28-*-browser.mjs` helpers.
- This report/evidence, US-28 story verification note and `docs/ai-progress.md`.

## DEPLOYMENT_STATUS / remaining gates and rollback

Production remains READY at `dpl_3fHprHBSja6Pu5HWUUBHduXLyDwc`, commit
`70a810f5e088cbfad68be790a7e5ce88db150ee3`; its registry is still the old version.
No push to TXH/dev/master and no Production deployment was performed. The owner's
single-domain Stadia configuration is respected; no hostname spoofing, browser
key, tile proxy or replacement basemap was introduced to force a pass.

Before release: authorize a test hostname/stable Preview domain in Stadia (or
obtain an explicit owner-approved replacement for this gate); rerun final-code
Preview E2E including visible markers/tiles and required disposable integration
suites; provide an accessible existing Production test session. Only then promote
the reviewed commit through TXH/dev/master without force-push and confirm READY,
exact commit and `sin1` before read-only authenticated Production smoke.
Rollback target is the current READY deployment above, using Vercel rollback
within the same verified project/team; no database rollback is required because
this patch has no schema/data migration. Roll back if the scoped read-only smoke
changes authorization, leaks hidden records, reports false readiness or regresses
planner technical-error handling.

| Acceptance gate | Final status | Direct evidence / limitation |
|---|---|---|
| CODE_READY | PASS (scoped code/repository checks) | Regression, HTTP guard, actual read-only Production pipeline, typecheck/build |
| NEON_PRODUCTION_VERIFIED | PASS | Independent Neon API + read-only PostgreSQL |
| PRODUCTION_RUNTIME_READY | NOT_DEPLOYED | Conditional release gate not met; existing Production still old code |
| DATA_READY | FAIL / business-data missing | Two missing durations, all three opening schedules unknown |
| Preview form/auth/proposal/Stadia | PASS for tested fixture flow | Real sessions, HTTP and live provider; final diagnostics additionally tested offline/read-only |
| Preview MapLibre | BLOCKED | Actual tile 401 and missing proposal markers |
| Production authenticated Planner | BLOCKED | Existing owner browser session inaccessible; fix not deployed |
| END_TO_END_ACCEPTED | PARTIAL | No complete final Preview/Production map + planner acceptance |
| US28_PRODUCTION_ACCEPTANCE | PARTIAL — NO_GO | No Full PASS or automatic release |

Existing bounded heuristic policy and process-local idempotency are unchanged:
results can be recomputed after process restart, cross-instance routing or TTL
expiry. No distributed exactly-once/provider-cost guarantee is asserted. Missing
official story acceptance/policy calibration remains as documented in US-28.

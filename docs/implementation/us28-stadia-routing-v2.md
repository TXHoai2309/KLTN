# US-28 Stadia Standard Routing V2 — verification

2026-10-18. Routing migration implemented and Development-integrated. Production
release remains conditional; full-repository legacy gate is not green.

## 1. Git baseline

Branch `feat/admin-user-management-be`. Task supplied c5ede13; actual local start
was `86bb9422e552c50226882dc4b602f8865e9c8112` (hero update), with a clean tree.
Origin initially reported c5ede13, then advanced to 86bb942 while work ran. Use the
newer actual baseline; no reset/stash/rebase/history rewrite or unrelated edit.
Routing changes are a separate commit; final commit identity is in the handoff.

## 2. Source scope

Changed planner runtime/routes/TravelLeg contract/validator/warning, one presentation
component's provider text, fixture and provider/engine/auth/UI tests; shared
trip-validation/stadia-route; Trip Save regression tests only; Varlock schema/example,
existing offline fixture and two browser harnesses; current docs and evidence.
Landing, CMS/Auth/RBAC implementation, RAG, Destination/Editorial, Trip persistence,
map renderer/CSS and Prisma schema/migrations are unchanged. Generated ignored
`env.ts` was regenerated using the repo command, not manually authored.

## 3. Architecture before and after

Before: US-28 → Google computeRoutes; US-29B/30 → Stadia. Now: US-28 adapter →
shared server-only requestStadiaRoute; US-29B/30 getTravelRoute → the same function.
MapLibre remains the browser renderer, with marker-only Planner presentation.
No provider response or route shape is added to Planner API/DTO.

## 4. Shared implementation

Exactly one HTTP implementation in trip-validation/stadia-route.ts sends POST to
https://api.stadiamaps.com/route/v1, server Authorization: Stadia-Auth, no query key,
redirect:error, cache:no-store. `requestStadiaRoute` has safe detailed failures;
`getTravelRoute` preserves US-29B/30's existing ok/unavailable result and unsupported
transport rejection. No new package, retry, fallback or cross-request route cache.
References: [routing](https://docs.stadiamaps.com/routing/standard-routing/),
[authentication](https://docs.stadiamaps.com/authentication/).

## 5. Transport

Both adapters use toStadiaCosting: CAR → auto, MOTORCYCLE → motorcycle. Other values
never dispatch; unavailable motorcycle never substitutes car. The old
TWO_WHEELER_CAUTION warning code becomes provider-neutral MOTORCYCLE_CAUTION.

## 6. Metrics and coordinates

Request points are latitude/longitude as {lat,lon}; MapLibre stays longitude-first.
Reject non-finite/out-of-range points before fetch. `trip.summary.time` stays seconds;
`length` requested in kilometers becomes meters by ×1000, without rounding.
US-28 Zod requires finite nonnegative duration ≤604800 and distance ≤10000000.
Absent/invalid distance is null in the normalization candidate and fails validation;
it is never filled with zero or Haversine. US-29B/30 keep optional distance.

## 7. Timeout, abort and cost

Preserve ≤27 directed pairs, ≤3 in flight, one ≤10-second global deadline. Caller
abort propagates to the shared AbortController, real fetch and response reader.
Per-request timeout is also bounded by 10 seconds. Stalled fetch/body are bounded
even for an uncooperative injected dependency; late responses are cancelled.
Timers/listeners/read locks are cleaned; no unhandled provider rejection or retry.
Read at most 512 KiB with fatal UTF-8/JSON parsing. HTTP failures cancel bodies.
Missing key → NOT_CONFIGURED; abort → TIMEOUT; unsupported mode → UNSUPPORTED_MODE;
missing route → NO_ROUTE; HTTP/network → UNAVAILABLE; malformed/absent/over-limit
required metrics → INVALID_RESPONSE. No raw error/provider metadata is exposed.

## 8. TravelLeg compatibility

New VERIFIED legs use STADIA_MAPS. Planner results are process-local, preliminary
snapshots, not stored historical Trips. Prisma Trip/Day/Visit store no provider
field; saved reads do not parse travelLegSchema. No legacy Trip rewrite/DB migration
is required. Strict new-leg schema rejects the old Google discriminator.

## 9. Planner and Validator

Pace/day/stop/window/date/selection logic is unchanged: 1–14 days, RELAXED/MODERATE/
PACKED, ≤28 stops, ≤4/day, 08:00–18:00 preliminary window, Asia/Ho_Chi_Minh, real
eligible visible candidates only. Haversine remains ranking only. Validator now
also validates inbound TravelLeg shape before crediting routing; forged VERIFIED
with missing distance cannot PASS. Missing routes make dependent clocks unknown;
missing date/hours/minimum/mobility data cannot become confirmation eligibility.

## 10. US-29B regression

Existing 13 route/travel-time tests PASS: mapping, normalization, optional polyline6
GeoJSON, unavailable behavior and deterministic comparison. Existing getTravelRoute
output semantics remain; optional distance does not become mandatory for this check.

## 11. US-30 and saved Trips

Trip Save implementation is unchanged: current session/persisted role, fresh route
outside transaction, current business-data recheck inside transaction, atomic owned
Trip/idempotency. Added regression invokes actual shared motorcycle adapter and
replays without another provider call. Real Development browser saves a two-stop
Trip with fresh Stadia evidence, replays one ID, reads detail, favorites and denies
cross-user access. Existing proposal UI still has no mounted save panel; API save
plus actual saved-detail UI is reported explicitly, not an invented save button.

## 12. API security

POST /api/trip-proposals envelope/path/shape unchanged. Guest401, locked403,
unsupported/forged persisted role403 and deleted401 are verified before body/provider.
ADMIN inheritance and ownership remain. Same-origin/JSON/key/size validation and
process-local single-flight admission unchanged. Unit responses contain no fixture
credential; actual built static scan: 158 files, zero actual Stadia key hits.
No NEXT_PUBLIC routing key, DB schema change, Production data/env write or quota reset.

## 13. Browser evidence

[Real results](us28-stadia-v2-evidence/browser-results.json): 6/6 groups PASS on
localhost:3010 with real Chrome, Better Auth, verified Neon Development and live
Stadia: CAR, MOTORCYCLE/Admin, back/edit/relative days, regenerate UI, fresh save/
replay/read/favorite/ownership, Guest/locked/forged-role admission. Synthetic temporary
visit durations/hours were clearly labeled TEST; coordinates came from two existing
verified Destinations. This is integration evidence, not real-corpus hours/duration
acceptance. All owned users/destinations/Trips/favorites/idempotency cleaned.

First/second browser attempts encountered Chrome response-body eviction; test
transport now buffers the unchanged real server response (no mocked result).
A later marker assertion needed waiting for asynchronous mount. Historical failed
attempt JSON is retained. First cleanup used an incorrect test-harness column;
exact owned two users/two Destinations were subsequently removed after identity
verification, and subsequent cleanup passed.

[Desktop light](us28-stadia-v2-evidence/desktop-light.png) and
[390px dark](us28-stadia-v2-evidence/mobile-dark.png) were inspected. Marker DOM and
renderer interaction are verified; these screenshots capture the map loading state,
not proof that external tiles finished loading. Production tile/domain readiness is
not claimed. No layout/CSS redesign or fake road line was introduced.

Offline browser fixture independently tests missing key, unavailable routing and
empty data without DB/provider. Its evidence is explicitly synthetic, not full-stack: **5/5 PASS** for missing key, unavailable route, empty source, technical Retry and 14-day keyboard/mobile behavior.
See [offline results](us28-stadia-v2-evidence/offline-browser-results.json).

## 14. Test counts

- TDD first new adapter run: 39 FAIL / 1 PASS before provider implementation.
- Initial relevant selection: 212 PASS / 11 gated SKIP.
- Final planner/US29B/US30/UI/MapLibre/Varlock: 192 PASS / 3 gated SKIP.
- Full Vitest: **1992 PASS / 0 FAIL / 134 gated SKIP**, 128 passed/15 gated files.
- Final legacy: **335 PASS / 1 FAIL / 0 SKIP**. Stopped chained Search/Favorite/RAG/
  idempotency suites were run separately: 120 PASS. SKIP is never counted as PASS.
- Disposable PostgreSQL planner repository: **3/3 PASS**, owned container removed.
- Disposable PostgreSQL RBAC ownership/writes: **8/8 PASS**, owned container removed.
- Actual browser: **6/6 PASS**, cleanup true; offline synthetic browser: **5/5 PASS**.

Legacy failure: public-culture-list.test.tsx expects /home-hero-visual/ in Landing.
The same regex is absent from HEAD86bb942; both Landing and this test are untouched.
[Baseline evidence](us28-stadia-v2-evidence/legacy-baseline.json). It is unrelated
baseline debt, not a green whole-repository release result.

## 15. Types, build, environment generation and diff

Root check-types PASS, including final rerun. Root production build PASS (1m10.525s).
Env generation PASS. git diff --check PASS after staging new files as well.
No migration command was run against Development or Production; existing CMS V2
migration remains present. Docker test databases use actual relevant migrations only.

## 16. Remaining Google references

No Google provider/key/endpoint/header in active US-28 runtime. Negative regression
fixtures deliberately reject GOOGLE_ROUTES/DRIVE/TWO_WHEELER. UI test asserts Google
attribution is absent. Old ADR-07, dated progress/delivery evidence and historical
US-12/13 remain historical, superseded by ADR-18. Google Maps URLs for content/admin
location lookup are a separate product feature and remain unchanged.

## 17. Environment

Installed Varlock auto-load explicitly deletes @internal keys. Stadia declaration
is now optional sensitive runtime configuration; the production build and isolated
schema-load tests prove injection without public exposure. Actual secret file is
untouched. Vercel kltn metadata confirms sensitive STADIA_MAPS_API_KEY entries in
both Preview and Production; no value was printed or replaced. Presence is not
proof of live credential validity or allowed tile hostnames. Dashboard access and
Preview/Production hostname registration remain unverified.

## 18. Live provider

Development identity verified by server metadata: summer-unit-95870477 /
br-aged-hat-b3o6hg9p / ep-purple-pond-b3xujb8o / neondb. Configured key was already
present. A small finite number of browser-generated single-pair calls exercised
both profiles, including fresh save validation; no load test or automatic provider
retry. Final run's three workflow generations plus regenerate and save each require
one pair. No calls/data writes went to Production, and no real Destination was edited.

## 19. Production readiness and blockers

Code/type/build and Development integration verified. **Production readiness is
conditional, not an unconditional GO.** Resolve baseline Landing legacy gate;
verify Stadia allowed tile hostnames/account/quota; review/register Production's
verified Destination routing registry (currently only Development is admitted),
complete real corpus durations/hours and the existing distributed cost-admission/
process-local idempotency decision before broader multi-instance exposure.
Retain CMS V2's separately controlled migration/rollout plan. No direct Production
migration, deployment, environment change, merge or hidden feature activation.

## 20. Commit, push and PR

The owner authorizes one separate routing commit and ordinary feature-branch push
when scoped checks pass. Actual PR #7 became merged/closed externally at
2026-10-18 00:45 Asia/Saigon, merging baseline86bb942 into master. It cannot remain
an open Draft or review the new routing commit. No PR was reopened, duplicated or
made ready; no master/dev push or merge is authorized by this routing work.
The final handoff records actual commit/push status. Historical acceptance and
Production limitations remain visible even after feature-branch push.

### Reproducing browser checks

Run `node apps/web/scripts/us28-stadia-browser-e2e.mjs` only with the configured
local app and verified Development environment; it owns its fixtures and performs
a bounded live-provider smoke, not a load test. Optional US28_BROWSER_ORIGIN
accepts only localhost:3010–3019. No external or Production origin.

For the offline fixture, bundle `apps/web/scripts/trip-planner-fixture.mts` for Node
with esbuild, web tsconfig and the test-only server-only-stub alias; preserve the
original import.meta.url for asset paths. Write its bundle under ignored
node_modules/.cache and run on loopback3012, then run
`node apps/web/scripts/us28-offline-browser.mjs`. Production never uses this alias.
The fixture is synthetic, has no auth/database and is not live evidence. Stop the
owned fixture process afterwards.

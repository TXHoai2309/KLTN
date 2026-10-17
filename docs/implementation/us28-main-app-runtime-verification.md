# US28 — Main application runtime audit (2026-10-13)

> Historical runtime audit. Current provider and live Development evidence are in
> [the 2026-10-18 Stadia migration report](us28-stadia-routing-v2.md).

Baseline: TXH `b91f9c797546cf3aed4fb09a8fa643345cd6c660`. Working tree was clean before this documentation-only audit. No application implementation needed changing.

US28_MAIN_APP_INTEGRATION: VERIFIED in source and production build. Header links to `/trips/new`; its server page authorizes Traveler then renders TripRequirementForm under the main layout. Successful review passes the checked snapshot/draft to TripPlannerFlow. Explicit generation uses `/api/trip-proposals` in the same Next.js app. Timeline, MapLibre, preview, routing adapter and validators are unchanged.

PORT_3010_STATUS: `npm run dev --workspace web` launches Next.js16.3.8 with `--port3010`; runtime reported Ready at `http://localhost:3010`. Browser `/trips/new` redirected an unauthenticated session to `/login?returnTo=%2Ftrips%2Fnew`. Same-origin unauthenticated POST probes for evaluate/analyze/check/proposals each returned401 `UNAUTHENTICATED`. No auth bypass, session creation, data writes or live routing request was performed. The main server was briefly stopped for production build and restarted afterwards.

REVIEW_TO_PLANNER_FLOW: Source chain is US24 form/evaluate → optional US25 analyze/apply → US26 review → US27 clarification/authoritative check → confirmed snapshot → US28 explicit generation/timeline. All four API paths are relative/same-origin. Deterministic regression selection verifies requirements/extraction/review/clarification/Planner contracts and boundaries. Optional US25 is not required when a user fills the form manually. A real authenticated Traveler journey on3010 remains unverified in this turn; no session was available and login may write session data, which this task forbids.

FIXTURE_ISOLATION: The previously agent-owned3012 fixture process was stopped and its browser tab closed. No3012 reference exists in `apps/web/src`, no Header link or runtime import uses it. The test script binds127.0.0.1, rejects NODE_ENV=production and injects synthetic repository/routes only. It remains an internal test utility; the Owner-facing instructions now prioritize3010. No separate frontend or simulated main-app mode was created.

BLOCKERS: None for application integration or port selection. Full live US24–28 acceptance needs an existing/authorized Traveler session, independently verified Development target/corpus and permission for provider calls; no live Google Routes or DB writes were allowed here. This audit does not certify Development identity, real provider behavior or mark US28 ACCEPTED. Existing distributed cost-admission/policy/live acceptance limitations remain in [the delivery report](us28-planner-verification.md).

TEST_RESULTS:

- Focused US28 + US24–27 selection:431 PASS,0 FAIL,3 PG SKIP (83 new focused tests plus348 regression tests). The previously executed disposable PostgreSQL3/3 result is historical evidence; DB integration was intentionally not rerun because this turn forbids DB writes.
- Legacy regression:328 PASS,0 FAIL,0 SKIP, including Culture37 PASS.
- Forced monorepo typecheck: PASS, all four configured packages executed without cached results. Production build: PASS, with `/trips/new`, `/api/trip-requirements/analyze`, `/evaluate`, `/check` and `/api/trip-proposals` present in the route table.
- `git diff --check`: PASS. Application source/fixture/navigation unchanged; documentation only.
- No production API, feature, schema, credentials, navigation or validator change. Only documentation/progress updates; no push/deploy.

Owner entrypoint: `http://localhost:3010/trips/new`. This preserves the main app's login/Traveler boundary; do not use3012 to access US28 as an end user.

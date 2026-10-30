# Assistant V2 Default Enablement

> Historical. The runtime switch and V1 were removed by [ADR-35](../decisions.md); the variable below is ignored and V1 is no longer a rollback.

Status: verification in progress, 2026-10-29. No commit, push or deployment.

## Scope and source

Owner-authorized minimal enablement follows the V2-07A READY_FOR_V2_DEFAULT gate,
ADR-31's preserved rollback contract and the existing production API integration.
No runtime/business refactor, capability, public contract, UI, schema, provider,
routing or RAG change is included.

## Runtime configuration

| Configuration | Selected runtime |
| --- | --- |
| Unset | V2 |
| `ASSISTANT_RUNTIME_VERSION=v2` | V2 |
| `ASSISTANT_RUNTIME_VERSION=v1` | V1 |
| Empty, wrong-case or invalid | V1 (safe controlled fallback) |

The shared server selector is used by planning dispatch, bootstrap metadata and
owned in-trip page selection. Routes are not hard-coded to V2. Legacy V1 request
compatibility and V1 code/tests remain. QA's existing independent runtime,
environment/abuse acceptance and database allowlist gates are unchanged.

Schema/example defaults are V2. An existing explicit deployment value `v1`
continues to select V1; change it to `v2` for intended enablement. Exact kill
switch: `ASSISTANT_RUNTIME_VERSION=v1`, then restart/redeploy configuration.
No code/schema revert is required. Unsetting now restores V2, not V1.

No new migration is introduced. Deployments enabling V2 need the already-existing
V2-07A session-head migration and shared database/auth secret across workers.

## Verification receipts

The default/endpoint tests first failed three assertions under the old unset→V1
behavior, then the selector/schema/example were changed. Gate tests include
unset dispatch for Traveler/Admin, exact V1/V2 selection, invalid-value safe V1
behavior, authentication, same-origin/schema checks and rollback without V2 calls.

Production Webpack build passed with49/49 pages. The expanded1745-test run has
1581 passes and51 known failures; exact baseline comparison and live smoke
receipts are being finalized in `.cache/v2-default/`.

Acceptance uses disposable accounts on verified Development DB, isolated port3011
and the repository's existing separate output-directory convention. Port3010's
pre-existing server is not stopped. The test launcher removes the runtime variable
after reading existing local configuration, so default smoke is not an explicit
V2 override. The real ignored `.env` and production settings are not edited.

## GPS limitation retained

Actual granted GPS remains unverified because IAB reached the existing watchdog
timeout without a position/grant control. Denied/unavailable/granted normalization
are controlled-test evidence; manual fallback passed live in V2-07A. No new GPS
claim or implementation change is made by default enablement.

## Deployment action

Once verification is READY, deploy through the normal authorized workflow and
set `ASSISTANT_RUNTIME_VERSION=v2` wherever an old explicit `v1` pin exists.
An unset deployment uses V2 by default. This task performs neither deployment
nor environment updates on the production host. V1 remains a supported rollback
runtime and is not deprecated or removed.

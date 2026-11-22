# V2-07A — Rollout Hardening & Final Readiness

Status: DONE (2026-10-29). Recommendation: READY_FOR_V2_DEFAULT. Source and local
environment default remain V1; no deployment/push was performed. The actual IAB
GPS grant exception is documented below under the ticket's section21 allowance.
The final closure section supersedes intermediate verification notes.

## Cross-worker root cause and state inventory

The V2-07 HTTP adapter stored live session closures behind a process-local handle.
Worker B could not find a handle created by worker A (reproduced with two HTTP
service instances: `ASSISTANT_SESSION_EXPIRED`). The workspace in DB did not
contain enough state to reconstruct the pending interaction.

| State | Authority and reconstruction requirement |
| --- | --- |
| Planning needs | Committed workspace needs are in DB; intake and tentative clarification needs must survive the next request. |
| Canonical preliminary proposal | Fingerprint/version are in DB; the unconfirmed candidate is transient and must survive for refinement/confirmation. |
| Proposal version/fingerprint | Existing workspace publication and Trip revision remain authoritative; domain services recheck before writes. |
| Pending clarification | Transient original edit, choices and scope are required to interpret the next reply. |
| Pending confirmation | Transient candidate, Validator result and base revision are required; confirmation must revalidate against DB. |
| UNKNOWN | Must survive requests to prevent another mutation; in-trip reconciliation retains the identical original payload/key. |
| Active referent/QA head | Conversational convenience, required for correct follow-up resolution; fresh visible candidates and owned QA services remain authoritative. |

## Selected minimal solution

The server encrypts and authenticates a bounded, expiring state capsule using
AES-256-GCM and a purpose-derived key from the existing server auth secret.
The client retains it only in component memory and sends it on the next request.
It is not accepted as raw client state. Every worker authenticates, decrypts,
validates the schema and actor/session binding, then rechecks domain ownership.

A small Prisma table holds only actor, subject, monotonically advancing version,
request hashes, expiry and a compare-and-set processing lease. It stores no
proposal, prompt, dialogue text or coordinates. Concurrent/stale capsules cannot
authorize a second action. A lost process/ambiguous transport response fails
closed and requires reopening authoritative data; an expired lease is never
stolen to repeat a potentially committed write. Existing domain idempotency and
Validator boundaries remain responsible for writes. Local bounded replay is an
optimization only, and rechecks authorization.

Reload intentionally discards the capsule and requires reopening/regeneration;
it cannot infer a pending proposal. All workers must share the DB and auth secret.
Secret rotation invalidates existing capsules. Rollback requires only the V1
feature gate; the additive session-head table is unused by V1.

Migration: `20261029030000_assistant_v2_session_head` applied successfully to the
verified Development endpoint `ep-purple-pond-b3xujb8o` (34 migrations total).
The pending-migration audit confirmed that only this migration was pending.
Live cross-process intake, refinement, clarification and confirmation subsequently passed.

## Verification so far (2026-10-29)

- Initial red HTTP worker A/B test reproduced the original same-worker failure.
- Updated HTTP ownership/replay/lifecycle suite: 9 passed.
- Cross-worker HTTP continuation, stale version, other actor and tampered capsule assertions: passed.
- Planning session suite: 18 passed, including fresh-session duration/transport continuation and UNKNOWN mutation blocking.
- In-trip session suite: 29 passed, including fresh-session clarification and pending confirmation, one confirmed write and unchanged other days.
- Complete focused V2 run: 166 passed, zero failures (`.cache/v207a/focused.json`).
- Subsequent generic replacement fixture added: in-trip suite 30 passed, zero failures (`.cache/v207a/in-trip.json`), including Lô Lô Chải and an unrelated destination name, unchanged days, Validator/routing and no write before confirmation.
- Provider/action metrics instrumented; `tsc --noEmit` and `git diff --check` passed. Metrics count actual provider attempts (including embeddings), engine invocations, retrievals and registered action dispatches; they do not log prompts, actor IDs, capsules or GPS.
- Windows sandbox TEMP caused multi-file runner ENOENT errors. Explicit workspace TEMP/TMP resolved the focused run. The broad regression run was interrupted after memory allocation failures in PowerShell; the historical 51 failures have not yet been reverified for this patch.
- Lô Lô Chải/data trace, RAG evidence trace, actual browser GPS, complete 20-case classification and post-change rollback remain pending. Prior V2-07 receipts are historical evidence and are not counted as V2-07A completion.

## Development data audit

Read-only receipt: `.cache/v207a/data-audit.json` (2026-10-29).
All 11 destination records (including hidden records) were inspected; no Lô Lô
Chải record/alias exists. Nine records are visible. The resolver cannot return a
candidate absent from inventory; this precedes scheduling and Validator work.
The synthetic replacement tests demonstrate the existing generic edit boundary;
they do not establish successful live replacement in this Development corpus.

There are 19 RAG document records, five approved public indexed publications.
The published Đồng Văn dossier has 51 chunks, eight mentioning the Vương complex
or related query terms. They contain sightseeing, fees and source links, but no
construction-year fact. Other matching chunks concern Khâu Vai, including its
separate 1919 claim. No indexed construction-year evidence was found. Keep
`INSUFFICIENT_SOURCE`; do not turn an unrelated date into an answer. Source
documents that have never been indexed still need independent evidence review;
their absence from retrieval is not proof of a valid fact awaiting publication.

## Earlier environment limits (subsequently resolved)

Live requests initially failed with localhost network sandbox `EACCES`. A server
started with elevated network permissions reached compilation of the auth route,
but the live script still failed before producing turn receipts. During this
attempt PowerShell emitted `System.OutOfMemoryException` and “Releasing the
double mapped memory failed”. The broad regression was stopped to reduce load.
These initial attempts did not establish live continuation or rollback. Later
receipts below supersede them. Production build and cleanup subsequently passed.

## Completion gates

Complete the user's V2-07A acceptance matrix, real DB/provider/browser checks,
full V2 and relevant regression suites, typecheck, production build and diff
validation. Compare failures against the documented 51 historical failures.
Do not change the runtime default before the final readiness decision.

## Resumed verification receipts

The earlier resource limit was worked around by bounded heaps, serial workers,
workspace TEMP/TMP and a Webpack production build. The production build passed,
including TypeScript and 49/49 generated pages (`.cache/v207a/build-webpack.log`).
The existing Varlock dynamic-access warning is retained; no gate was relaxed.

Expanded regression ran 1,741 tests: 1,575 passed and 53 failed. Two additional
stale expectations were repaired without changing production behavior: the
QA bootstrap expectation omitted V2-07's additive `runtimeVersion`, and the
AI-edit Admin test contradicted the accepted 2026-10-17 RBAC V2 inheritance.
The latter now tests an owned proposal for both Traveler and Admin. Targeted
rerun including all V2 suites: 186/186 passed. Exact assertion comparison confirms
the remaining51 are the same baseline failures, no additions/removals or suite
load errors (`.cache/v207a/comparison-final.json`).

Real production processes A and B were run sequentially against the same Dev DB
and server secret. A received `2 ngày` and returned ASK_TRANSPORT; after process
termination B accepted the carried capsule, received `ô tô`, published one
proposal and then refined it for culture. Provider metrics: intake2/full
generation0, proposal3/full generation1, refinement3/full generation1. The
three calls are intent understanding, the existing selection model and V2
language composition. V1 composition is not invoked. No duplicate generation
was observed. The bounded replacement separately uses2 provider calls and0
full planning generations (understanding plus bounded edit analysis).

Browser all-in-one 3-day/motorcycle/culture/moderate/exact-date input immediately
produced a validated6-stop proposal without asking captured facts again. A
temporary explicitly labeled `[TEST] Lô Lô Chải — V207A disposable fixture` was
provisioned in Development for positive replacement acceptance. Its coordinates
and opening hours are synthetic test inputs, not approved tourist information.
The browser replaced Dinh on day2, preserved day1/day3, routed with Stadia and
showed passing Validator checks. Workspace version3 and Trip count0 confirm one
publication and no auto-save. The isolated generic fixture test also covers an
unrelated destination name. Fixture cleanup is required after the live run.

The browser Dinh construction-year QA completed as INSUFFICIENT_SOURCE with0
citations, planning version remained3 and no Trip was created. Metrics show4
provider calls,1 retrieval and0 full planning generations. The user then
explicitly clicked Save, and the canonical Trip detail displayed the saved
6-stop plan. Receipts: browser-replacement.txt/.jpg, browser-qa.txt,
browser-db-before-save.json and browser-db-after-qa.json under `.cache/v207a`.

All20 corpus cases have an explicit comparison classification in
`../implementation/assistant-v2-evaluation-classification.json`:5 V2 better,
0 V1 better,6 equivalent on stated safety dimensions,8 not comparable,1 blocked
by actual GPS grant in this browser environment. Historical paired comparisons,
positive live fixture acceptance and controlled checks are labeled separately.

## Final closure

- **Cross-worker live PASS:** A received duration, B received transport and
  refined the resulting proposal. Independently, a real saved-trip clarification
  was created on A; a new process B accepted its choice and produced a validated
  pending proposal with DB unchanged; a new production process C accepted
  explicit confirmation and returned DB-confirmed SUCCESS. Day1/day3 remained
  byte-equal. Controlled UNKNOWN restore/reconciliation verifies the original
  payload/key and one write. Foreign/tampered/stale capsule checks pass.
- **Replacement PASS with declared test data:** real model/browser replacement
  of Dinh by the disposable labeled Lo Lo Chai fixture, unchanged outside days,
  real Stadia/Validator, one publication and no Save. The fixture does not certify
  real visitor information; ordinary inventory still needs approved content.
  Generic regression with a different destination name also passes.
- **QA gap correctly closed as data dependency:** real persisted
  INSUFFICIENT_SOURCE,0 citations,1 retrieval, no proposal generation/version
  change. No source was fabricated or published to make the answer pass.
- **GPS environment exception:** an actual browser click called geolocation,
  received no position and reached the existing watchdog timeout. No usable
  permission-grant control was exposed by the IAB capabilities (visibility and
  viewport only). A timeout is not evidence of permission denied or granted.
  The app automatically opened manual selection; a public-place coordinate
  fixture normalized successfully, displayed `Thủ công` and continued to a safe
  clarification without writing. Granted, denied and unavailable outcomes pass
  controlled tests; actual granted/denied remain unverified on this host. This
  is documented under section21, never reported as live granted PASS. No GPS
  implementation or OS privacy setting was changed. Future-day API edits
  continued without LOCATION calls or compulsory GPS.
- **Metrics:** intake2 provider calls/0 generations; full proposal3/1;
  preference refinement3/1; surgical replacement2/0; source-gap QA4/0 with1
  retrieval; explicit apply0/0. `planningGenerationCount` counts full engine
  generations; bounded replanning is identified separately by its action. Calls
  for understanding, existing selection and language composition are intentional.
  Surgical/QA/apply paths avoid an extra planning generation/composer. No
  duplicate full planning generation or V1 composition was observed.
- **Rollback PASS:** configuration only V2→V1, stale V2 request409, legacy
  START200, canonical Trip page200, DB snapshot unchanged by rollback. Browser
  V1 detail displays5 remaining stops (previously6), and legacy in-trip UI shows
  the updated owned Trip. No migration rollback or code revert.
- **Checks PASS:** full V2 suite169 tests, plus QA bootstrap/AI-edit HTTP tests:
  186/186. Expanded1741-test run plus exact targeted reruns leaves the same51
  baseline failures, zero new failures and zero suite load errors. Production
  Webpack build49/49 pages PASS. Final `tsc --noEmit` PASS after removing one
  malformed generated development validator cache left by switching bundlers;
  production route validators and all source files remain checked.
- **Cleanup PASS:** both newly created acceptance users, their QA/workspaces,
  saved Trip, session heads/idempotency records and temporary destination were
  removed with exact owner/fixture identity guards. No remaining fixture heads
  or destination; private cookie/capsule manifests replaced by cleaned markers.
  The local acceptance server was stopped after verifying V1 rollback.

Final recommendation: **READY_FOR_V2_DEFAULT**, with the explicitly documented
GPS environment exception and ordinary source/destination data dependencies.
No unresolved code correctness failure was found. This recommendation does not
change the deployment default; before opting in, apply the additive migration
and use the same existing auth secret and database on every worker. Keep V1
supported for rollback.

Final receipts in ignored `.cache/v207a`: focused-final.json,
regression-final.json, comparison-final.json, build-webpack.log,
tsc-clean-generated.log, live-clarification.json,
live-pending-confirmation.json, live-cross-worker-apply.json, live-rollback.json,
browser-gps-timeout.txt/.jpg, browser-manual-fallback.txt/.jpg,
browser-rollback-v1.txt/.jpg, browser-rollback-intrip-v1.txt/.jpg and cleanup.json.

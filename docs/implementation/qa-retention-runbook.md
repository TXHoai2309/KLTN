# US-21 retention runner deployment gate

This is a deployment candidate, not a deployed scheduler. Production Q&A remains
unavailable. No cleanup is executed against Neon in this implementation session.

The protected `GET /api/internal/qa-cleanup` endpoint is a thin adapter to the
conversation cleanup and abuse-metadata cleanup services. It returns only
`processed` and `hasMore`, sets `Cache-Control: no-store`, and never emits private
content or exception messages. It requires `QA_CLEANUP_ENABLED=true` and a
server-only `CRON_SECRET` of at least 32 characters. The scheduler must send
`Authorization: Bearer <CRON_SECRET>`. Missing or wrong credentials fail before
any database call. Never expose either secret through `NEXT_PUBLIC_`.

The candidate cron fragment is [qa-cleanup-cron.candidate.json](qa-cleanup-cron.candidate.json).
It must be reviewed against the deployed Vercel multi-service configuration and
merged into the real configuration only when the owner authorizes deployment.
The candidate target is every five minutes. Current Vercel documentation permits at most 100 Cron jobs on all plans. Hobby permits daily execution with up to 59 minutes of timing imprecision and therefore cannot support this cadence. Pro/Enterprise permit minute-level schedules. Cron jobs are included in the plan while their Function invocations incur the applicable Function usage. Owner must verify plan pricing/usage allowances before adoption. Verify the target URL reaches the `web` service
through the existing rewrite; verify platform schedule eligibility and execution
limits before activation. Preview/manual invocation and Production Cron operation
are separate acceptance evidence. No real `vercel.json` change is made here.

Verified 2026-10-11 against [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and
[Pro plan pricing](https://vercel.com/docs/plans/pro-plan): Pro has a USD20/month
platform fee including one deploying seat and USD20 usage credit; additional
deploying seats are USD20/month each. Function usage above allowances is extra.
Five-minute cadence is 288 invocations/day, approximately 8,640 per 30 days,
before authenticated manual backlog runs. Database usage is separately billable.
Vercel does not automatically retry failed Cron invocations. Configure monitoring
and a bounded catch-up procedure; duplicate/overlapping invocations are safe under
the existing locks but consume usage. No paid plan or service is purchased here.

Each invocation uses a 20-second cooperative work budget, at most 25 selected
principals, and at most 25 expired conversation markers plus 25 deleted-content
turns, 25 abandoned turns and 25 legacy failed-content turns per principal.
Individual transactions have a 10-second timeout. The budget is checked between
transactions; a final transaction may run past the budget. Abuse metadata pruning
runs once afterwards. The route allows 60 seconds. Selection queries may scan
more rows than their result limits; validate indexes and database latency on the
release environment. The default service cleanup batch is 100, with a maximum
of 500. A post-batch database existence check sets `hasMore=true` while any eligible work remains; run again until an
empty batch, and alert on repeated `hasMore`, non-2xx status or missing invocations.
Never use an unbounded loop inside one serverless invocation.

Conversation expiry is seven days for Guest and thirty days for authenticated
principals, extended only by confirmed completion. Reads, replay, failures,
unauthorized requests and invalid requests do not extend it. History/replay and
completion reject deleted/expired conversations under the same principal lock as
deletion. Periodic cleanup first hides the conversation and then scrubs turn
content in bounded batches; subsequent batches include deleted conversations
with remaining content. Explicit deletion and Guest revocation scrub all related
content atomically; their work scales with that principal's retained history.
No separate message table or shared idempotency content cache is used: the turn
response JSON and provenance are the complete retained answer content.

New terminal failures discard question, response and provenance immediately;
only non-content request digest/key/error metadata remains. This satisfies the
maximum 24-hour failed-content requirement without waiting for a scheduler.
Legacy failed-content rows still respect their original `contentExpiresAt` and
are scrubbed at that boundary by cleanup. Abandoned processing leases are fenced
and scrubbed when cleanup observes lease expiry plus 24 hours. Physical deletion
of idle conversation or legacy/abandoned content still requires a deployed,
healthy scheduler and sufficient batch capacity. Clock-based access denial is
not proof of a physical deletion SLA.

Guest identity records and turn/conversation tombstones remain as minimal dedup
metadata. Deleting Guest identities concurrently with bootstrap previously risked
orphaning active content; the runner no longer deletes them. They contain no
question or answer. Monitor metadata growth and approve any future tombstone
compaction policy separately so old keys cannot recreate private conversations.

Before public release, the owner must accept the scheduler plan/cost, configure
its secret and enable flag, verify actual authenticated invocations, evaluate
worst-case backlog/drain latency and explicit-delete load, set alerts and a
failure/recovery procedure, and verify physical retention deadlines on a verified
test environment. The candidate five-minute cadence cannot by itself guarantee
an exact physical expiry deadline; scheduling delay, skipped runs or backlog must
be covered by an approved operational policy. Do not report automatic cleanup
or runtime acceptance from disposable database tests.

## 2026-10-11 — Release-candidate scheduler verification

Vercel Cron invokes the Production deployment; the candidate schedule will not
run on Preview. Preview can test the protected route with a manual authenticated
request and an isolated database. An automated Preview schedule would require a
separately selected external scheduler or owner-approved custom setup. Before a
manual call, inspect eligible cleanup backlog read-only; this route sweeps all
eligible QA principals in its configured database, not a caller-selected test
identity.

The current Vercel documentation confirms a maximum of 100 Cron jobs per project.
Hobby permits daily jobs with up to 59 minutes of scheduling imprecision, so the
five-minute candidate requires Pro or Enterprise. Five-minute cadence is 288
Function invocations/day (approximately 8,640 per 30 days); Cron itself is
included, while Function and database use follow their separate plan allowances
and pricing. Pro currently has a USD20/month platform fee with USD20 usage credit
and one deploying seat. The owner must verify the actual team plan, seat count,
usage and cost before enabling it.

Cron delivery is best-effort, may miss or duplicate a scheduled run, and Vercel
does not retry a failed invocation. Therefore, five-minute cadence is an
operational target, not a hard 24-hour physical-deletion SLA. No schedule is
configured in `vercel.json`; `QA_CLEANUP_ENABLED` remains false by default. A hard
retention deadline needs an owner-selected durable scheduling/recovery design,
capacity proof and alert/catch-up procedure before release.

## 2026-10-11 — Scheduler-independent runner hardening

Migration `20261011123000_add_qa_cleanup_state` adds one durable runner-state row
and indexes the eligible-expiry scans. Every invocation claims a 90-second DB
lease using an atomic conditional update. The cleanup work itself is capped at
20 seconds on the route, at most 25 principals per invocation, and bounded row
batches; transactions retain their 10-second timeout. Concurrent calls return
HTTP 202 with `lockAcquired=false` and the last persisted metrics. A crashed
worker's lease expires for recovery. Repeated runs drain residual work according
to `eligibleBacklogCount`/`hasMore`.

Successful invocations persist and return `lastSuccessfulSweep`,
`eligibleBacklogCount`, `oldestOverdueItem`, and cumulative `failureCount`, in
addition to `processed` and `hasMore`. Failed invocations clear their own lease,
record `lastFailedAt`, and increment the counter before returning a sanitized
500 response. The next successful response exposes the updated counter. The
route still requires `QA_CLEANUP_ENABLED=true` and a server-only `CRON_SECRET`
of at least 32 characters; manual execution uses that same authenticated route.
It does not accept a principal selector and can sweep the entire configured
database, so an operator must verify the exact target and inspect backlog
read-only before invoking it.

Two scheduler choices remain for owner approval:

1. **Vercel Cron:** use the checked-in candidate fragment and five-minute
   cadence only after verifying the project plan, function/database allowance,
   target rewrite, and Production-only delivery behavior. Vercel Cron does not
   run on Preview, may miss or duplicate invocations, and does not retry failed
   invocations. This is a recovery-oriented target, not a hard physical deletion
   guarantee. A separate monitor must alert on non-2xx responses, no acquired
   sweep, a rising `failureCount`, stale `lastSuccessfulSweep`, and increasing
   oldest-item age/backlog. Proposed operational warning/page points are 10/30
   minutes since last success and 12/18 hours since the oldest eligible item;
   the owner must approve thresholds against the selected retention SLA.
2. **External managed scheduler:** choose a service that can call the same
   authenticated endpoint on a verified environment, retry transient failures
   with bounded exponential backoff, expose delivery history, and alert on
   repeated failure or missed heartbeat. Keep the DB lease as the cross-instance
   overlap fence. The owner must select the provider, region/network path, retry
   policy, secret storage/rotation, monitoring destination and cost before
   configuration. No service, account or Production schedule is selected or
   configured by this work.

Vercel's five-minute estimate remains 288 invocations/day (about 8,640 per
30-day month); current Pro platform fee is USD20/month with one deploying seat
and USD20 usage credit, with additional seats and usage potentially adding cost.
The actual team plan and billable database/function use must be checked before
owner approval. Cron alone cannot prove a hard physical-deletion SLA; if the
owner requires a firm 24-hour physical bound, select a retrying/monitored
scheduler, provision worst-case backlog capacity, observe it on Preview or an
isolated Development database, and demonstrate drain time before release.

Physical deletion remains distinct from logical expiry: reads, replay and turn
completion reject expired records synchronously, while the scheduled runner
fences/tombstones and scrubs retained content in bounded batches. Explicit
delete and Guest revoke scrub content synchronously and are now safe to retry by
the same owner-scoped conversation ID or the same possession-verified Guest
cookie. They do not add `Idempotency-Key` to Task 191; their target identity
already defines an idempotent deletion operation. Turn keys and minimal
tombstones remain without a compaction horizon.

The runner is vendor-independent at the application boundary: a scheduler only
needs to send an authenticated request and monitor the bounded response. The
fourth QA migration is additive and has only been installed by the disposable
PostgreSQL harness in this work; no Neon migration or cleanup call was made.

## Controlled Development/Preview Q&A gate

`qaRuntimeEnabled()` now categorically returns false on `VERCEL_ENV=production`.
Local development requires `QA_RUNTIME_ENABLED=true`; Vercel Preview requires
`QA_PREVIEW_RUNTIME_ENABLED=true` with `NODE_ENV=production` and
`VERCEL_ENV=preview`. Both paths also require
`QA_ABUSE_PROTECTION_ACCEPTED=true`, `DATABASE_URL` to match the exact configured
`QA_RUNTIME_ALLOWED_DATABASE_HOST` and `QA_RUNTIME_ALLOWED_DATABASE_NAME`, and
an owner-reviewed non-production target. Missing or mismatched values keep all
QA routes unavailable before auth, database or provider work. An exact target
match is a deployment check, not proof that the selected Neon branch is safe;
the owner must verify the branch identity independently. Production remains
hard-disabled even if all flags are accidentally enabled.

Citation metadata has a separate allowlist: `QA_PUBLIC_SOURCE_IDS` names the
RagDocument IDs whose stored source title and projected locator metadata the
owner explicitly approves for public display. The default empty value excludes
all evidence and therefore cannot produce a factual sourced answer. IDs must be
reviewed against the Development corpus before the first real Q&A request. This
configuration avoids a new approval column/migration and does not invent a title
or public URL; unsafe path/URL metadata is still rejected.

### Owner checklist before Development smoke

1. In read-only mode, verify the Neon **Development** branch host/name, current
   migration state, extensions, RAG publication state, owner-reviewed source
   metadata and cleanup backlog. Confirm no Production/shared branch is targeted.
2. Create/verify a Neon Development snapshot/restore point. Review all four
   additive QA migrations, generated Prisma schema and the disposable PostgreSQL
   execution. Record an owner-approved maintenance window and recovery contact.
3. Apply migrations only through the approved migration workflow after owner
   authorization. Prefer a forward corrective migration if a post-apply issue is
   found; disabling runtime flags does not roll back schema. Restore the isolated
   Development snapshot only under the database owner's recovery procedure.
4. Set the exact database host/name allowlist, abuse-acceptance flag, Preview or
   local opt-in and only the source IDs approved for citation. Keep every
   Production QA flag false. Verify provider credentials are server-only and
   bounded to the intended OpenAI project/spend policy.
5. Record smoke evidence for Guest bootstrap/first answer, authenticated first
   answer, authorized multi-turn retrieval, a real citation with source and
   locator, insufficient source, disable-then-ask, same `Idempotency-Key` ask
   replay, provider failure/timeout, explicit deletion and expiry cleanup. Check
   request counts, duplicate turns, DB completion state and sanitized logs.
   Distinguish the disposable transport test from these real Development runs.

No migration, cleanup request, Neon write, OpenAI request or Preview deployment
was performed during this hardening session. Until the checklist is completed,
the runtime gate remains off and `READY_FOR_MVP_ACCEPTANCE` remains `NO`.

## 2026-10-11 — Owner-approved GitHub Actions scheduler

The owner selected GitHub Actions (not Vercel Cron) to avoid a Vercel plan
upgrade. The cleanup workflow is `.github/workflows/us21-qa-retention-cleanup.yml`
with `17 * * * *` UTC schedule and a confirmed manual-dispatch path. A separate
`.github/workflows/us21-qa-retention-heartbeat.yml` runs at `47 * * * *` UTC and
checks the latest scheduled cleanup run on `master`. A run older than 75 minutes,
an unsuccessful latest scheduled run, or a missing run fails the watchdog. The
workflow run is the heartbeat record; configure GitHub Actions failure
notifications to the approved operations destination before activation.

Git remote HEAD currently points to `master`. GitHub schedule events run only
when the workflow file exists on the default branch; scheduled events may be
delayed or dropped under load. Therefore both workflows in the feature branch
are inert until the owner publishes them on `master`. The watcher is subject to
the same scheduling limits and is not an independent guarantee. GitHub
documents scheduled workflows as default-branch-only and best-effort under
load: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[scheduled workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

### Required owner configuration before publication/activation

1. Review the feature diff and publish the workflows to `master` through the
   normal owner-approved review process. This session does not merge or publish.
2. Create the GitHub Environment `qa-cleanup-production`, restrict it to
   `master`, and configure environment variable `QA_CLEANUP_ORIGIN` as an HTTPS
   origin (no path/query), `QA_CLEANUP_ALLOWED_HOST` as that exact DNS host,
   and environment secret `CRON_SECRET` with the same random value used by the
   approved target application's cleanup route (at least 32 characters).
   The workflow does not accept an endpoint through dispatch input. The script
   pins the path to `/api/internal/qa-cleanup`, rejects redirects and IP hosts,
   and requires exact host equality before attaching the secret header.
3. On the target application deployment, configure server-only
   `QA_CLEANUP_ALLOWED_DATABASE_HOST` and `QA_CLEANUP_ALLOWED_DATABASE_NAME` to
   exactly match that deployment's `DATABASE_URL`. The cleanup route now
   requires this explicit PostgreSQL host/database match as well as
   `QA_CLEANUP_ENABLED=true`, so empty or mismatched target pins fail before any
   cleanup database call. Independently verify the cleanup endpoint's deployment
   and database target, applied schema state, snapshot/recovery path, backlog
   and batch capacity. Keep `QA_CLEANUP_ENABLED=false` until that target is
   separately authorized.
   Never point this Production Environment at shared Development. No Neon
   Development writes or sweeps are authorized by the scheduler decision.
4. Route failed cleanup/watchdog workflow notifications to an owner-approved
   operations destination and test the notification path. The repository
   environment and notification configuration are not changed in this work.
5. Before routine activation, manually dispatch on `master` only with
   `confirm_production_cleanup=true`, against the already owner-approved target.
   Dispatch has no target/URL parameter. Confirm a valid response, zero backlog
   (the job drains at most eight bounded sweeps), no secret/content in logs, and
   a fresh scheduled heartbeat after the next `17` minute tick. Do not use a
   manual call to test against a database containing unrelated/shared users.

The runner has a ten-minute workflow ceiling, 45-second cleanup request timeout, three
attempts with 1/2-second backoff for network/429/5xx failures, and no redirects.
It accepts only HTTP 200 with the exact metadata-only cleanup result schema and
an acquired database lease. Each request is bounded by the cleanup route; at
most eight requests are drained per workflow. A busy lease, malformed response,
zero progress with backlog, remaining backlog, or exhausted retry fails the
workflow. `processed`, backlog count, and last success are the only returned
cleanup metrics written to Actions logs. The manual and scheduled workflow
share a concurrency group, while the existing 90-second database lease fences
other instances.

### Physical retention and recovery boundary

Logical expiry continues to deny history, replay and completion synchronously.
This hourly scheduler only advances physical cleanup. An hourly schedule plus
bounded retries/drains is a recovery-oriented operational target, not a hard
24-hour physical deletion guarantee. GitHub can delay/drop scheduled events;
the watchdog can also be delayed/dropped, and failure notifications require
owner configuration. The owner must define the required physical SLA, observe
worst-case eligible backlog and drain time on an authorized isolated target,
and decide whether a second independent monitor is required. Manual recovery
uses the same protected workflow and exact owner-configured endpoint; do not
call the cleanup endpoint with arbitrary URLs or against shared Development.

### Approval decisions and provider boundary cross-reference

Decision B retains the server-side `QA_PUBLIC_SOURCE_IDS` allowlist. An
allowlisted source permits only its safety-checked title and supported
PDF/DOCX locator projection; unsafe fields exclude the evidence. `sourceUrl`
remains null until a separate valid public URL approval/configuration exists.
Source status/current publication are checked during retrieval and fenced at
completion. There is no new approval schema/migration. See the US-21 story for
citation field policy and Tasks 192/193/197.

Decision C keeps the stateless Chat Completions adapter and explicitly sets
`store:false`. Only approved retrieved text (maximum four chunks and 3,000
evidence tokens), the current question, and two prior questions used to resolve
follow-up intent are included in the request. Prior assistant answers/citations,
internal identifiers, source metadata, whole raw documents, Blob URLs and
detected credential/private-reference strings are excluded. Provider request
timeout and best-effort abort remain bounded; the final eligibility fence is
still required. Once evidence has been sent, it cannot be recalled. Application
7/30-day retention is distinct from provider-side data controls. OpenAI's
`store` parameter is documented for whether an output is stored for model
distillation/evals; it is not a promise of zero provider retention. The owner
must review the OpenAI project data controls and applicable terms before using
any real corpus. See [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat).

The Vercel Cron candidate fragment is superseded by the approved GitHub Actions
design and remains an inert, unreferenced artifact. No scheduler has been
published/configured, no GitHub secret or variable was added, and `QA_CLEANUP_ENABLED`
remains off unless changed under a separate owner-authorized environment gate.

### 2026-10-11 offline validation

The bounded runner/watchdog tests passed 7/7, workflow YAML structural checks
passed, the full Vitest run passed 524/524 with zero skipped/todo, and disposable
PostgreSQL/pgvector cleanup tests passed 54/54 with zero skipped and clean
teardown. A subsequent test-fixture-only adjustment was verified by 60/60
focused Vitest assertions. Legacy tests, typecheck, production build and Prisma
validation passed. actionlint is unavailable. These results verify code and
test behavior only: they do not establish scheduler delivery, a hard physical
retention SLA, or runtime acceptance. Keep publication, GitHub Environment
configuration, heartbeat notification routing, exact-target preflight and any
live cleanup run behind the owner deployment gate.

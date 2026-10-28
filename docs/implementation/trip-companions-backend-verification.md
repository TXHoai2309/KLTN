# Travel companions — final backend verification, 2026-10-28

Backend scope **COMPLETE / BE READY FOR FE through TC-11** under the owner's
updated execution instruction. This does not mark pending FE/vertical/browser
acceptance complete. Existing local FE receipts recorded during this task remain
their own evidence, preserved in the [delivery contract](trip-companions-delivery-contract.md).

## Implemented scope and evidence map

| Ticket | Backend behavior | Actual PostgreSQL suite / final cases |
| --- | --- | --- |
| TC-01 + milestone 0 | Publish/replay/public projection and trusted owner-only viewer context | `companion.postgres.integration.vitest.test.ts` — 11 |
| TC-02 | Public/own collection, strict combined filters, stable pagination and public content eligibility | `companion-discovery.postgres.integration.vitest.test.ts` — 9 |
| TC-03 | Atomic membership/capacity, member itinerary/current groups, durable Trip deletion guard | `companion-membership.postgres.integration.vitest.test.ts` — 11 |
| TC-04 | Leave/rejoin, one returned place, immediate next-request revocation, retained history | `companion-leave.postgres.integration.vitest.test.ts` — 3 |
| TC-05 | Host draft/capacity/revision, manual recruitment and visibility, serialized join/capacity races | `companion-management.postgres.integration.vitest.test.ts` — 4 |
| TC-06 | Current-member reader and host-only permanent removal/ban; old-key join cannot restore access | `companion-ban.postgres.integration.vitest.test.ts` — 3 |
| TC-07 | Trusted plain-text user messages, idempotent send, full paginated history and commit-safe sequence | `companion-chat.postgres.integration.vitest.test.ts` — 4 |
| TC-08 | Delta/current permission and same-payload/key replay reconciliation | `companion-delta.postgres.integration.vitest.test.ts` — 2 |
| TC-09 | Host/member read markers and bounded per-actor/group unread summary | `companion-unread.postgres.integration.vitest.test.ts` — 3 |
| TC-10 | Official saved itinerary/revision/SYSTEM notice in one transaction, no preview/no-op/replay duplicate | `companion-notice.postgres.integration.vitest.test.ts` — 4 |
| TC-11 | Terminal cancellation notice, join/send gate, retained history/live itinerary; normal completion keeps chat | `companion-cancel.postgres.integration.vitest.test.ts` — 4 |

Suites live under `apps/web/src/modules/trip-companions/`. **58/58 actual DB
tests PASS**, eleven files, not mocked writes. User and SYSTEM delayed-commit
tests observe real `pg_stat_activity` lock waits and prove that later senders
cannot allocate a position behind a reader's committed cut. Additional lock-wait
tests cover Vietnam midnight, date/completion updates and account lock. Atomic
rollback and lost commit acknowledgement retain identical keys/payloads.

Shared exports/fixtures and exact endpoint contracts are in each ticket's
[delivery handoff](trip-companions-delivery-contract.md). Route Handlers remain
thin; existing private Trip endpoints remain owner-only. No Admin bypass,
shared editing, provider, DM, upload, notification service or TTL was added.

## Final checks and resolved failures

- Focused regression: **35 files / 344 tests PASS, 59 opt-in skips**. The skipped
  cases are 58 companion DB tests separately run above plus one unrelated Trip
  management DB opt-in test. No skip is counted as a pass in that run.
- Root `npm run check-types`: **4/4 packages PASS** on the final source snapshot.
- Strict backend source checker: **63 entries PASS**, preserving strict ES2017
  settings and actual Next ambient types; it excludes concurrently generated
  Next/FE build artifacts, not imported server dependencies.
- Shared idempotency: **4/4 PASS**.
- Final production build with separate output: **PASS**, Next 16.3.8,
  **53/53 pages**, all new API routes registered. This rerun includes the final
  post-generation cache revision and User SHARE lock before authoritative edit
  reauthorization. No application deployment occurred.
- Read-only / unauthenticated localhost HTTP smoke: **13/13 PASS**. Public
  discovery returns 200; unknown query override returns 400; private readers and
  join/cancel/send return 401 without session. Every tested response has ordinary
  JSON envelope and no-store. No authenticated business-data write was attempted.
- Final tracked/new-file whitespace, local handoff links, scoped source/SQL
  secret scan and file-ownership inspection: **PASS**.

Resolved during implementation: invalid bigint cursor parsing initially threw
instead of returning validation failure; the parser now uses a guarded pipeline.
Bigint literals incompatible with the repository's ES2017 target were replaced
with exact constructors. Stale Next route type snapshots initially failed the
combined typecheck; current generated output/build and root typecheck now pass.
A concurrent FE adapter snapshot failed once; its current isolated 29 tests and
the final 340-test combined selection pass, with no FE edit authored by BE.

Actual HTTP smoke initially found `Unknown argument canceledAt`: the dev singleton
was created between changing schema revision and regenerating Prisma. After
generation, bumping `databaseSchemaRevision` to `trip-companions-complete-v3`
recreated the runtime client. Public collection then returned 200 and all thirteen
smokes passed. No database reset, credential change or server restart was needed.

## Wider regression limits — not all green

A wider selection across all Trip Edit/In-trip tests returned **758 PASS,
5 FAIL, 59 SKIPPED, 1 TODO** across 79 files. These failures remain unresolved:

| Unchanged test | Failure |
| --- | --- |
| `trip-edit/ai-edit-http.vitest.test.ts` | Legacy assertion rejects all Admins, contrary to current Admin-inherits-Traveler policy |
| `in-trip/us36-test.vitest.test.ts` | Same legacy Admin rejection expectation |
| `in-trip/in-trip-validation.vitest.test.ts` | Same expectation inside auth-boundary case |
| `in-trip/replan-http.vitest.test.ts` | Same expectation inside auth-boundary case |
| `in-trip/us35-location-source-audit.vitest.test.ts` | Existing URL/navigation source guard matches existing In-trip UI |

The thirteen relevant tests, handlers, In-trip component and authorization files
have **identical normalized Git blobs to HEAD**; the ignored receipt is
`.cache/trip-companions-be/legacy-baseline-comparison.json`. This comparison
supports their classification as existing unrelated failures; it is not a claim
that the full unrelated suite passed or a fresh full clean-checkout run occurred.
No authorization rule was weakened, test assertion removed or unrelated
Assistant/In-trip UI modified to make this task green.

## Schema and Development rollout

Eight additive migrations were authored/reviewed in bounded ticket steps, with
Prisma Client regenerated, then tested using Prisma migrate deploy/status on an owned PostgreSQL16 loopback
container. The **23 unchanged relevant migrations** have **0 pending** and the
container/config copies were cleaned. Unrelated vector/PostGIS/AI migration
history is excluded from that scoped fixture; no full migration-drift claim.

Development was independently verified against the repository's configured
Development endpoint and SQL server identity. Guarded direct-connection Prisma
deploy refused unrelated pending or unfinished migrations and checked scoped
checksums. Final Development ledger: **42 applied, 0 pending, 0 unfinished**;
**50 constraints, 9 indexes and 2 companion triggers** inspected. No Production
operation, env/credential modification or Development business-data write.

| Migration | SHA-256 |
| --- | --- |
| `20261028130000_companion_membership` | `72d2c726206318f531aaed58290ea421514253e35f799c25cc48d0e8ad68c6b7` |
| `20261028131000_companion_leave` | `fb50724b1a401d8febe5bf726124f81ce1fdc89956fdf44088962625e2983e92` |
| `20261028132000_companion_recruitment` | `518b4a8f7531528bfaa180d24ffc9a3a5205b14a61d15336343e1eb27106a652` |
| `20261028133000_companion_ban` | `6c6dfe6ec900aa6e5dbd59d0652263ec80bc7829cebfaa4e718c081ae722eb9c` |
| `20261028134000_companion_chat` | `113899a2f14bf31e7e668df532c5c53ae9d664be24c2f401708acac6c9f9c9bb` |
| `20261028135000_companion_read_marker` | `97ac2707a4ae73b174d8cc62cca96ab205cda0b3ef4280e7d0906ad6bb2c5233` |
| `20261028140000_companion_itinerary_revision` | `0370ee33a9b08ff34ac3798b623fa1a4c83e6a322ef7ad009cd5c0bfdcc29c9b` |
| `20261028141000_companion_cancel` | `fc41c14c191941308f18c7103a5a791c55000c9d90a5ee29806eb903fc5cbb13` |

Source-controlled operational helpers:
`scripts/check-trip-companions-backend.mjs` and
`scripts/trip-companions-development-migration.mjs`. Redacted catalog/deploy/HTTP
receipts are ignored under `.cache/trip-companions-be/`; no credentials included.

## Reproduction

Repository root:

```powershell
npm run db:generate
node scripts/check-trip-companions-backend.mjs
npm run check-types
npm run test:idempotency --workspace web
$env:KLTN_PERF_BUILD='1'
npm run build --workspace web
git diff --check
```

From `apps/web`, final focused regression and disposable DB run:

```powershell
node scripts/test-trip-companions-postgres.mjs
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/modules/trip-read src/modules/trip-save src/modules/trip-validation src/modules/trip-edit/apply-edit.vitest.test.ts src/modules/trip-edit/us32-test.vitest.test.ts src/modules/trip-edit/us33-test.vitest.test.ts src/modules/trip-edit/trip-edit-service.vitest.test.ts src/modules/trip-edit/trip-edit-http.vitest.test.ts src/modules/trip-edit/trip-edit-page-service.vitest.test.ts src/modules/in-trip/us37-test.vitest.test.ts src/modules/destination/destination-media-eligibility.vitest.test.ts src/server/auth/require-traveler.vitest.test.ts src/server/database-reload.vitest.test.ts
```

Wider selection that exposes the five existing failures:

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/modules/trip-read src/modules/trip-save src/modules/trip-validation src/modules/trip-edit src/modules/in-trip src/server/auth/require-traveler.vitest.test.ts src/server/database-reload.vitest.test.ts
```

No new authenticated multi-user browser/visual acceptance is claimed. FE retains
client adapters, current principal/group response guards, polling/visibility,
scroll/recovery/unread rendering and responsive/browser verification. No commit,
push, merge, application release, chat dispatch or automation was performed.


## Development migration recheck — 2026-10-28

Owner requested running migrations on Development after the FE review fixes. Executed the guarded Development script in preflight and `--apply` modes; endpoint/database and SQL identity matched the Development baseline. All eight reviewed companion migration SQL checksums matched this report. The database was already current: **42 applied, 0 pending, 0 unfinished**, with 50 companion constraints, 9 indexes and 2 triggers. No migration needed application in this run; no schema/business-data/Production change. Fresh ignored receipt: `.cache/trip-companions-be/development-migration.json`, checked at `2026-10-28T09:08:29.104Z`.

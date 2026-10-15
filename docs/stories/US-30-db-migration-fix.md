# US-30 — Reconcile development DB migration history

## Status

IMPLEMENTED — preserve-data branch; no reset of the Neon development database.

## Epic

Trip persistence foundation.

## Owner

N/A

## Goal / User Story

Restore a trustworthy Prisma migration history and apply the existing US-30 Trip migration to the development DB without losing existing data.

## Outcome

`trip`, `itinerary_day`, and `itinerary_visit` exist with expected constraints, indexes and Prisma migration records; US-30/31 can use a real development DB.

## Source References

- `docs/stories/US-30-confirm-save-trip.md` and `US-31-my-trips-detail.md`.
- `docs/implementation/environment-deployment.md`: local app targets Neon development; migrations, never `db:push`.
- Current user instruction: preserve-data branch, evidence before `migrate resolve`, no direct `_prisma_migrations` edits, no commit/push.

## Dependencies

`DATABASE_URL` is declared in `apps/web/.env.schema` and `.env.example`; Varlock/Prisma resolved it at runtime with `NODE_ENV=development`. No credential value is read from or copied out of local env files. The current working tree contains uncommitted US-31 work and must be preserved.

## In Scope

- Audit disk and DB migration histories, applied checksum, table state and actual SQL.
- Restore the exact editorial migration/model from Git history if its checksum matches the DB, then apply the existing US-30 migration through Prisma.
- Verify table structure, constraints, indexes, schema validation, generated client and relevant tests/build.

## Out of Scope

DB reset, `db:push`, manual writes to `_prisma_migrations`, deletion/rewrite of applied SQL, production DB, unrelated schema redesign, commit/push.

## Business Rules

The DB has two `destination_editorial` rows, so preserve data. A migration marked applied in the DB must have its exact SQL on disk. Never mark another migration applied with `migrate resolve` merely to silence status; only apply pending US-30 SQL through Prisma.

## Roles / Authorization

N/A — database maintenance task; no application authorization change.

## Ownership Rules

N/A.

## UX / UI Contract

N/A.

## Data Contract

Existing US-30 schema: `Trip`, `ItineraryDay`, `ItineraryVisit`, with owner, day and destination foreign keys. Existing editorial schema/table is restored solely to align Prisma with the already-applied migration.

## API Contract

N/A — no API change.

## Error / Recovery

Stop without DB mutation if checksum/schema evidence disagrees or if Prisma proposes a reset. Report migration state and any failed command.

## Write Semantics / Idempotency

N/A — no product write action. Prisma migration transaction/history is the database workflow.

## External Services

Neon PostgreSQL development target via the local Varlock/Prisma datasource.

## Acceptance Criteria

- [x] Disk and DB migration histories are reconciled using exact historical SQL, with no reset or manual migration-table edit.
- [x] US-30 migration is applied once and `prisma migrate status` is clean.
- [x] Trip tables, four foreign keys and four secondary indexes/unique constraints exist.
- [x] Generated Prisma client, US-30/31 tests, full tests, typecheck, build and diff check are reported accurately, including the unrelated full-test failure.

## Test Plan

Read-only SQL introspection before and after; Prisma validate/status, migration workflow, `npm run db:generate`, focused US-30/31 Vitest, `npm run test`, `npm run check-types`, `npm run build`, `git diff --check`.

## Expected Modules / Files

Restore `packages/db/prisma/migrations/20261014120000_add_destination_editorial/migration.sql` and `packages/db/prisma/schema/destination-editorial.prisma` from Git commit `5dad753`; add the historical `Destination.editorial` relation to `destination.prisma`; update this story and `docs/ai-progress.md`. US-30 migration and Trip models already exist and remain unchanged.

## Migration Impact

The editorial migration was already applied in DB; its exact historical disk SQL has SHA-256 `3a724d9fd6619004a45cd706d8b05e0404f4bea526d668b0bcf64c1319d8bd7b`, matching DB `_prisma_migrations.checksum`. The existing US-30 migration `20261015000000_us30_trip_save` was pending at audit and was applied with `npx prisma migrate dev`.

## Environment Impact

Use local development datasource only. Do not log credentials. If `DATABASE_URL` is unavailable, stop as BLOCKED.

## Implementation Sequence

1. Audit disk/DB and checksum; inspect current tables and row count.
2. Restore exact historical editorial SQL/model/relation; validate schema and migration status.
3. Apply only pending US-30 migration with Prisma preserve-data workflow.
4. Query tables/FK/index and run requested checks; document evidence.

## Acceptance Evidence

Pre-change DB: 18 finished migrations, none rolled back. Disk: 17 common migrations plus US-30, but missing editorial. Last common migration: `20261012150000_admin_content_profiles`. The editorial table existed with 2 rows; `trip`, `itinerary_day`, `itinerary_visit` were absent. Historical editorial SQL in Git had the exact DB checksum. The historical migration/model/relation were restored. Prisma schema validation passed, `migrate status` then found only US-30 pending, and read-only `migrate diff` showed exactly the US-30 enum, tables, indexes and foreign keys with no drop. No `migrate resolve` was needed.

| Migration with initial mismatch | Disk at audit | DB at audit | Resolution |
| --- | --- | --- | --- |
| `20261014120000_add_destination_editorial` | Missing | Finished; checksum matched Git history | Restored exact historical SQL/model on disk; preserved 2 rows |
| `20261015000000_us30_trip_save` | Present | Missing | Applied with `prisma migrate dev` |

### Disk versus development DB after reconciliation

The query was `SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at;`. Every row below has `rolled_back_at = NULL`; timestamps are UTC. Disk includes `migration.sql` for every row.

| Disk migration | DB `finished_at` | State |
| --- | --- | --- |
| `20261001115741_init_auth` | 2026-10-01 11:57:42.561 | Applied |
| `20261001120226_enable_postgis_pgvector` | 2026-10-01 12:08:21.247 | Applied |
| `20261001130000_add_idempotency_record` | 2026-10-01 15:08:04.022 | Applied |
| `20261001143000_add_user_role` | 2026-10-01 15:43:49.345 | Applied |
| `20261004070249_add_destination_domain` | 2026-10-04 07:11:51.240 | Applied |
| `20261005021531_add_culture_content_domain` | 2026-10-05 02:16:41.413 | Applied |
| `20261005120000_add_favorites` | 2026-10-05 10:33:52.306 | Applied |
| `20261006150000_upgrade_favorite_target_contract` | 2026-10-06 04:21:18.489 | Applied |
| `20261008120000_add_rag_document` | 2026-10-09 08:35:45.131 | Applied |
| `20261009120000_add_rag_index_generations` | 2026-10-09 16:24:02.327 | Applied |
| `20261010120000_add_rag_index_jobs` | 2026-10-10 13:26:23.278 | Applied |
| `20261011120000_add_qa_guest_identity` | 2026-10-11 10:56:10.191 | Applied |
| `20261011121000_add_qa_conversations` | 2026-10-11 10:56:11.203 | Applied |
| `20261011122000_add_qa_abuse_guard` | 2026-10-11 10:56:11.824 | Applied |
| `20261011123000_add_qa_cleanup_state` | 2026-10-11 10:56:12.502 | Applied |
| `20261012120000_add_qa_destination_context` | 2026-10-12 02:30:20.393 | Applied |
| `20261012150000_admin_content_profiles` | 2026-10-12 04:53:31.752 | Applied |
| `20261014120000_add_destination_editorial` | 2026-10-15 02:44:14.192 | Applied; exact disk SQL restored |
| `20261015000000_us30_trip_save` | 2026-10-15 09:32:51.735 | Applied this task |

### US-30 SQL and DB catalog evidence

The existing migration creates enum `TripTransport` (`MOTORCYCLE`, `CAR`); tables `trip`, `itinerary_day`, `itinerary_visit`; their three primary keys; and four additional indexes/unique constraints: `trip_userId_createdAt_idx`, `itinerary_day_tripId_dayIndex_key`, `itinerary_visit_destinationId_idx`, `itinerary_visit_dayId_order_key`. Catalog queries verified all three tables and all seven indexes. Four foreign keys exist: `trip.userId` → `user.id` CASCADE, `itinerary_day.tripId` → `trip.id` CASCADE, `itinerary_visit.dayId` → `itinerary_day.id` CASCADE, and `itinerary_visit.destinationId` → `destination.id` RESTRICT. The pre-existing `destination_editorial` row count remained 2 after migration. `npx prisma migrate status`: 19 migrations found; database schema up to date.

### Verification result

- `npx prisma validate`: PASS.
- `npx prisma migrate dev`: PASS; applied only `20261015000000_us30_trip_save`.
- `npm run db:generate`: PASS.
- Focused US-30/31 Vitest: 7 files, 37/37 PASS. The expected simulated database outage emits stderr in one test.
- `npm test`: FAIL in the legacy Culture page test at `apps/web/src/app/culture/culture-page.test.tsx:37`: it expects a `/culture` header link absent from the current header. This test failure is unrelated to the migration.
- `npm run check-types`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS (Git printed a line-ending warning for an existing US-31 route file).

Live authenticated Trip save/read through the app remains NOT PROVEN; focused tests use fixtures/mocks. This task did not reset DB, run `db:push`, issue `migrate resolve`, edit `_prisma_migrations` directly, delete migrations, commit or push.

## Open Questions

None for the preserve-data path while checksum and schema continue to match. Any unexpected Prisma reset/drift prompt stops the operation.

## Handoff Notes

No commit/push. Existing US-31 uncommitted files are outside this fix and must stay intact.

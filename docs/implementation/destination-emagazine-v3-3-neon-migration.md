# Destination V3.3 — Neon Development migration

Completed 2026-10-15 (Asia/Saigon) in `D:/KLTN/KLTN`, branch TXH, HEAD `b79ebe2b06ebd05c0b0f5ff320d5f671076e7002`. All existing V3.3 source changes remain local and preserved.

```ini
TASK=V3_3_NEON_MIGRATION
BRANCH=TXH
DATABASE=neondb
ENDPOINT=ep-purple-pond-b3xujb8o
OWNER_DEV_ATTESTATION=YES
BACKUP=WAIVED_BY_OWNER

MIGRATION_NAME=20261014120000_add_destination_editorial
MIGRATION_STATUS=APPLIED
MIGRATION_LEDGER=PASS; 18 finished; zero pending, unfinished or checksum conflicts
EDITORIAL_TABLE=EXISTS; zero rows
SCHEMA_VERIFICATION=PASS; 12 columns, PK/FK/CHECK, 6 NOT NULL constraints, valid unique index, empty Prisma diff
EXISTING_DATA_INTEGRITY=PASS; counts and complete-row hashes unchanged
PRISMA_CLIENT=PASS; current application Neon client reads all Editorial columns
LOCALHOST_3010=RUNNING; health/public detail 200; Editorial API correctly requires Admin login

READY_FOR_MANUAL_TEST=YES

BLOCKERS=NONE_FOR_MIGRATION_OR_LOCAL_RUNTIME
COMMIT=NO
PUSH=NO
DEPLOY=NO
```

## Authorization and gates

The owner explicitly attested that the current datasource is Neon Development and waived backup/recovery-branch creation. This supersedes the recovery-point/Console blockers recorded on 2026-10-14. No backup/recovery branch was created. No datasource substitution, credential change or environment-file edit occurred.

Loaded the DB workspace's existing Varlock configuration; its schema imports the web workspace's NODE_ENV/DATABASE settings. Verified URL endpoint/database and database-reported `neon.endpoint_id`/`current_database()` before any write, then repeated the checks immediately before migration. No Production indication was found.

Before execution: 17 migrations completed with matching local checksums, no unfinished/rolled-back entry, and only the approved Editorial migration pending. The table did not exist. Read-only Prisma diff contained only the new table and FK. Reviewed SQL was create-only and matched the tested file; raw SHA-256 `3a724d9fd6619004a45cd706d8b05e0404f4bea526d668b0bcf64c1319d8bd7b` was pinned and rechecked immediately before execution. The SQL file was not modified.

Ran the existing package script `npm run db:migrate:deploy` in `packages/db`, which invokes `prisma migrate deploy` with the repository `prisma.config.ts` and Varlock. Exit 0; Prisma reported the one approved migration applied successfully. No reset, db push, migrate dev/resolve, manual ledger edit, rollback/DROP or old-data SQL write was used.

## Verification

- The new ledger entry is finished and its checksum matches the exact migration file. All 18 entries are complete; no pending migration remains.
- All 12 columns match expected types, nullability/defaults, 64-character fingerprint width and timestamp precision 3. Draft/published/previousPublished JSONB fields remain independent and nullable.
- PK, Destination RESTRICT/CASCADE FK and revision/schema-version CHECK are validated. PostgreSQL 18.6 additionally lists six NOT NULL entries in `pg_constraint`; the read-only checker was corrected to account for those entries after an initial count assertion. The migration was not rerun or altered.
- The unique primary index is valid; a read-only EXPLAIN confirms its use for Destination ID lookup. No orphan Editorial row exists. FK rejection behavior had already passed on disposable PostgreSQL; no live insert/delete probe was performed.
- Prisma datasource-to-schema diff reports no difference. The existing generated client already includes the model, so regeneration was unnecessary. The application's actual `createPrismaClient`/Neon adapter verified the same endpoint/database and selected all Editorial columns inside a read-only transaction, returning zero rows. No P2021/missing-table error remains in that client path.

Counts and hashes of complete, ordered row representations match before migration, after migration and the independent final verification:

| Table | Before | After | Row hashes |
| --- | ---: | ---: | --- |
| destination | 2 | 2 | identical |
| content_media | 0 | 0 | identical |
| opening_day | 14 | 14 | identical |
| opening_interval | 2 | 2 | identical |
| favorite | 1 | 1 | identical |
| rag_document | 8 | 8 | identical |

Only the additive schema and Prisma migration ledger changed. No Neon test fixture or application record was created/updated/deleted.

## Local application and manual acceptance

Port 3010 was free. Started only the main checkout's normal `npm run dev --workspace web` as a hidden background process; no existing process was stopped. Next.js 16.3.8 loaded the existing Varlock configuration and became Ready. Listener PID at verification: 29040; owned npm parent: 29368. Left it running for the owner's manual test.

GET-only HTTP smoke: health 200, public destination list 200, existing public Detail 200 with standard fallback, Editorial API 401 `UNAUTHENTICATED`/`private, no-store`, and Admin Editorial page redirects to login (streamed response may have HTTP 200). No authorization bypass or fake session was used. Authenticated Editorial HTTP reads/writes are intentionally left for the owner; API 401 alone is not claimed as an authenticated database read. The direct application-client query above independently proves table recognition.

Existing generated env types remain valid because no env schema changed. Full Vitest/browser/build QA was not rerun for this migration-only task; the prior final-acceptance evidence remains recorded separately. `git diff --check` and new-document whitespace checks passed. HEAD and index remain unchanged; no commit, push or application deployment.

Provider configuration was inspected as booleans only: OpenAI key present, `OPENAI_EDITORIAL_MODEL` absent, Cloudinary credentials incomplete. Deterministic/manual layout can be tested now; live AI layout and Cloudinary upload need their missing configuration. No provider call, credential disclosure or provider configuration change occurred. No Luna model identifier was guessed or set.

Provider follow-up later on 2026-10-15 supersedes that runtime diagnosis: the owner
had filled the values in `.env`, but the new variables' `@internal` annotations
prevented Varlock injection. Removed those annotations for Cloudinary's four
settings and Editorial model while retaining credential sensitivity. Real `.env`
files were not edited. After env codegen/restart, actual configuration functions
report Cloudinary accepted / Editorial AI configured. The earlier runtime-only
absence check did not establish that the owner's input was missing. No real
provider call was used to verify credentials or model availability.

Local ignored evidence: `D:/KLTN/KLTN/apps/web/.cache/editorial-neon-migration/` contains `before.json`, `before-schema-diff.sql`, sanitized `prisma-deploy.log`, `after.json`, `after-schema-diff.log`, `verification.json`, `localhost-smoke.json` and Next startup logs. The read-only before/after evidence contains metadata/counts/hashes, not a recoverable database backup.

**READY_FOR_MANUAL_TEST=YES**

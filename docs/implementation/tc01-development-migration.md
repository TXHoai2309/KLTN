# TC-01 Development migration — 2026-10-28

The owner reported that opening “Tìm bạn đồng hành” on localhost showed the generic Trips error boundary. The running Next development log identified the cause: Prisma `tripCompanionPublication.findUnique()` failed because `public.trip_companion_publication` did not exist. The schema had previously been verified only on disposable PostgreSQL.

## Target and execution

- Loaded the existing local environment in memory, without displaying or modifying credentials or environment files.
- Verified the configured Development endpoint/database against the repository's environment baseline and independently checked the server's Neon endpoint identity over SQL. Production was excluded.
- Confirmed the only pending migration was `20261028120000_trip_companion_publication`, with no unfinished ledger entries. Reviewed the additive table, indexes, constraints and foreign keys before execution.
- Applied the existing migration with Prisma `migrate deploy` using the direct Development connection. No reset, `db:push`, application release or business-data mutation was performed by this repair.

## Verification

- Migration SQL SHA-256: `f214e2bcc242b184635fc01dced9c2c6fdfce6c9c75aa63e0bd7fde674302e2a`.
- Development ledger: **34 applied, 0 pending, 0 unfinished** after execution.
- Confirmed `trip_companion_publication` exists, all seven expected columns are present and its primary key, unique `tripId` index and image index exist.
- Observed the existing authenticated Chrome tab at `/trips/[id]/publication`: the publication form loaded with the saved Trip context. A subsequent observation showed the completed Guest preview and “Xác nhận công khai” control. No publish click was performed by this repair.
- Local receipts: ignored `.cache/tc01-development-migration/result.json` and redacted Prisma deployment log in the same folder. No secret-bearing receipt is added to source control.

This verifies recovery from the missing-table failure and successful form/preview rendering on the running Development application. It does not claim a complete browser acceptance matrix, a new confirmed publication, schema drift analysis or Production rollout. Application source and migration SQL were unchanged, so the earlier code test/typecheck/build results were not rerun for this operational repair. TC-02 remains outside this task.

# Trip management extension

User-approved scope: attachment dd773ed8-494a-4aa9-b36b-3774956d1208. Execute inline; no commit, push, reset, production access or invented business data.

## Task 1: Save CTA and navigation
- RED: confirmed save navigates to /trips; primary label is Lưu chuyến đi; invalid proposal retains secondary actions and disabled save.
- Implement using existing validator, mutation key, global Sonner. Lock repeat clicks synchronously and keep UNKNOWN identity.
- Run planner/save tests (expected passing after implementation).

## Task 2: Delete owned trip
- RED: owner-only service/HTTP, transaction rollback, Favorite cleanup, replay, missing/foreign/Guest, strict input; UI changes only after SUCCESS.
- Add DELETE on existing route and minimal mutation module/client actions. Preserve Day/Visit cascade, Destination and idempotency records.
- Run mutation/read/UI tests.

## Task 3: Manual completion
- RED: manual override and unmark calendar fallback, ownership/replay, dates/visits unchanged, list/detail consistency.
- Verify development migration ledger/drift; add nullable timestamp with additive migration; no reset.
- PATCH completion through shared write contract. Update list grouping after confirmed SUCCESS and refresh; accessible dialog and theme tokens.
- Run targeted and full/legacy suites, db generate/migration checks, typecheck/build/diff; browser evidence at 3010, only disposable test writes.

## Interfaces and decisions
- Tasks 2/3 share one trip mutation service/HTTP/client; operation names and payload hashes are distinct.
- Date-derived status helper remains unchanged; list/detail share explicit effective-status helper.
- Current RBAC inheritance remains: Admin has traveler capability on own records, never foreign ownership bypass.
- Product DOCX originals unavailable locally; condensed product/system story references and explicit extension govern.
- Preflight audit: existing save revalidates canonical data twice; regeneration is separate; missing opening hours legitimately blocks save. No delete/completion support. Favorite RESTRICT and Day/Visit CASCADE require transactional Favorite cleanup.

## Execution evidence
- Initial tree clean, branch ThaiAnh, HEAD 456a908. No existing user changes to overwrite.
- Task 1 complete: label/navigation tests RED (2 failures) then GREEN; missing-date component RED then GREEN. Browser real Save pending → toast → /trips, persisted after reload.
- Ruling: DB had 25 applied migrations vs 23 on disk. User explicitly approved restoring the two original soft-delete migrations/schema from Git (2eb8757 and 4e0e0de). Checksums match DB allowing LF/CRLF; Prisma diff became empty before completion. New additive migration applied with migrate deploy. No reset/resolve/ledger writes.
- Task 2 complete: mutation tests RED missing module → GREEN; transactional service and live PostgreSQL fixture pass. Browser delete of new disposable cmvgvphwq000400k5bpact9xi explicitly confirmed at action time; cancel retained row, SUCCESS removed it, detail/edit/in-trip/API no longer readable.
- Task 3 complete: manual override/fallback/replay tests GREEN; live fixture preserves itinerary/date, list/detail agree. Browser mark/reload/unmark moves groups only after SUCCESS.
- Verification: targeted 184 passed + 1 opt-in skipped; opt-in PostgreSQL integration 1/1 passed separately; full Vitest 2626 passed, six known baseline failures, 135 skipped, one todo. Legacy tests pass. Typecheck/build pass. Final checks recorded in stories.
- Final review: fresh read-only reviewer found no critical/important issues. Requested documentation and temporary-script cleanup completed. No deferred code findings.

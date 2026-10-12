# Admin forms MVP upgrade — implementation evidence

2026-10-12, TXH. AF-1–AF-6 implemented under owner authorization. [Shared contract](admin-content-contract.md) supersedes the previous audit plan's DOCX checkpoint and string-array taxonomy proposal. Research/pilot artifacts were preserved.

## Delivered

- AF-1: Destination/Culture shared contracts; optional profile preserves old API clients.
- AF-2: additive profile columns, shared structured Area (LOCALITY/REGION) and Community, many-to-many links. Culture remains independent with 0..N destinations.
- AF-3: multiple sources, provenance, three UNKNOWN-default independent rights (website/index/OpenAI). APPROVED requires evidence and server-attributed reviewer/time. Strict payload, transactional ownership/reference validation.
- AF-4: ordered URL gallery, unique cover, alt/caption/author/source/website rights. No public upload infrastructure is introduced. Private RAG storage remains separate.
- AF-5: Culture basic/geography/community/content/media/optional destination/source review/visibility sections. Body entered once; legacy source controls appear only for existing records.
- AF-6: Destination basic/geography/location pin/durations/hours/additional visit data/media/culture/source review/visibility. Existing MapLibre preview plus explicit Google Maps comparison; no inferred coordinates. Coordinate edits clear old verification/evidence. Old API coordinate updates also clear confirmation. Existing idempotency and separate visibility operations remain.
- Website detail reads the same domain profiles. Only website-approved sources/media are public; proof, reviewer, storage references and RAG/OpenAI rights stay private.
- AF-7: CONTRACT/SCHEMA BOUNDARY ONLY. Revision and optional RagDomainOrigin reserve canonical hash/revocation metadata. No domain export, approval, indexing, allowlist or runtime bridge is enabled. Separate integration must enforce approved immutable versions, changed/hidden/revoked snapshot invalidation and retrieval rechecks. RAG snapshot revocation enforcement is not claimed implemented here.

## Migration and owner action

20261012150000_admin_content_profiles: schema-to-schema Prisma diff, additive only; no destructive/drop/rename operation or approval backfill. Safe nullable/empty/UNKNOWN defaults preserve existing IDs, prose, schedules, visibility and links. SQL adds owner XOR, rights evidence/reviewer/time, unique covers, Area kind, verified location/ticket evidence, positive revisions and hash constraints.

Actual pre-migration Destination (seven UNKNOWN opening days) and independent Culture fixtures are inserted before this migration on an owned disposable PostgreSQL database and read back afterward.

Neon was neither queried nor modified in this task. The owner's prior 16/16 report remains; this is one new migration awaiting approval. Confirm Development target and backup before applying. Prepared owner-only command from repository root:

    npm run db:migrate:deploy --workspace @KLTN/db

No credential/storage upgrade is required for the URL MVP. Actual source/media rights remain subject to owner review. AF-7 live bridge requires separate implementation.

## AF-8 validation

- Prisma generate/validate: PASS.
- Full Vitest plus actual PostgreSQL/pgvector migrations: 654/654 PASS, 43 files, skipped 0, using node apps/web/scripts/test-qa-postgres.mjs --full. Count includes Task 203 concurrently integrated by another dev; that work was preserved, not authored by this task.
- New contracts: 13/13 PASS. New Admin PostgreSQL integration: 6/6 PASS within full run. Migration compatibility, independent/multi-area/community culture, reviewer proof, create/edit/cover replacement, old-client preservation, idempotent replay, invalid-link rollback, owner/rights constraints, public isolation, rights revocation and visibility.
- Existing Destination: 63/63 PASS; Culture: 37/37 PASS. US-21/US-22 deterministic compatibility covered by full run; no live acceptance/closure claim.
- Offline Chromium browser: PASS via test-admin-profiles-ui.mjs. Synthetic intercepted APIs only. Create/edit legacy; taxonomy double-submit/UNKNOWN same-key reconciliation and parent-save guard; independent culture; multiple areas/communities; rights proof validation; media/source defaults; pin preview mock; coordinate verification invalidation; same payload/key form retry; 360/1440 light/dark no overflow. Screenshots under ignored apps/web/.cache/admin-profiles-ui; mobile screenshot manually reviewed. No live authentication/Neon/provider test.
- Root npm run check-types: four configured tasks PASS. Web production build PASS, static generation 30/30; no deployment.
- Scoped premium UI audit: zero findings. Existing unrelated global UI debt is outside scope.
- Security: authorization/role, forged metadata, strict input, URL safety, ownership and public proof isolation covered by tests. Changed-file secret-pattern scan: 46 files, zero findings, no env/credentials staged. This is a scoped scan, not a complete security assessment/dependency audit.
- git diff --check: PASS.

## Commits and preserved state

- d49a97e: AF-1–AF-4 contracts/schema/services.
- 1e06727: AF-5 Culture/shared editor.
- 0adaef1: AF-6 Destination/public reuse/browser evidence.
- AF-8 follow-up: final SQL checks, public isolation integration, formatting and this execution record.

No Neon writes/migrations, OpenAI live, RAG upload/index/allowlist change, push or Production deployment. US-22 stays IMPLEMENTED — LIVE ACCEPTANCE PENDING. Pending DESIGN/progress/US-22 story edits, pilot documents, other dev commits and worktrees remain preserved.

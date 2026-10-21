# US-39 — Soft-delete and restore RAG documents

## Status

IMPLEMENTED — local code and verification complete. PostgreSQL race and authenticated browser acceptance remain unverified because no disposable database/Admin session was available and the local Docker engine is not running.

## Epic

Admin RAG management

## Owner

Product owner

## Goal / User Story

As an Admin, I want to soft-delete an RAG document and restore it when needed so that obsolete sources stop appearing in management and retrieval while their history remains recoverable.

## Outcome

Admins can move documents out of the active RAG list, exclude them from all new retrieval, and restore them to the terminal `DISABLED` state without losing source files, metadata, versions, chunks, embeddings, or job history.

## Source References

- Product Specification: [Roles and access](../product/product-spec.md#roles-and-access), [RAG answers](../product/product-spec.md#rag-answers), [Admin content](../product/product-spec.md#admin-content), and [Write semantics and recovery](../product/product-spec.md#write-semantics-and-recovery)
- Technical Architecture: [API and error contract](../architecture/technical-architecture.md#api-and-error-contract), [Idempotency contract](../architecture/technical-architecture.md#idempotency-contract), and [Database](../architecture/technical-architecture.md#database)
- User Flow: [Admin content management](../flow/user-flow.md#admin-destination-culture-and-rag-management) and [Write recovery](../flow/user-flow.md#write-recovery)
- Repository story contracts: [US-17](US-17-rag-upload.md), [US-18](US-18-rag-review-approval.md), [US-19](US-19-rag-indexing.md), [US-20](US-20-rag-disable.md), [US-21](US-21-rag-qa.md)
- Repository invariants: [Product Specification](../product/product-spec.md), [User Flow](../flow/user-flow.md), [Decisions](../decisions.md)
- UI reference: existing `/admin/rag` list, document detail, and Admin design system

## Dependencies

- Builds on US-17 through US-21 RAG upload, review, indexing, disable, and retrieval behavior.
- Uses the shared `Idempotency-Key` and `SUCCESS` / `FAILED` / `UNKNOWN` write contract.

## In Scope

- Add nullable `deletedAt` to `RagDocument` through a Prisma migration.
- Add Admin-only soft-delete and restore writes.
- Exclude soft-deleted documents from the default Admin list and all public RAG retrieval/evidence eligibility checks.
- Add an Admin “Đã xóa” list view and restore action.
- Keep deleted-document details and original-file access available to Admin in read-only mode.
- Preserve all original Blob data, metadata, content versions, index generations, chunks, embeddings, publications, and job history.
- Revoke public-Q&A approval on delete and restore as `DISABLED` without public approval.
- Prevent queued, running, resumed, or retried index jobs from publishing a generation for a deleted document.
- Add a responsive, accessible delete confirmation and success/error/unknown feedback consistent with the existing Admin design system.
- Add focused service, API, retrieval, job-race, and UI tests; record verification in this story and `docs/ai-progress.md`.

## Out of Scope

- Permanent deletion/purge of database rows, Blob files, versions, chunks, embeddings, publications, or job history.
- Re-enabling a restored document, re-indexing its old content, or re-granting public-Q&A approval.
- Deleting related Destination or Culture content.
- Non-Admin deletion or restoration, bulk delete/restore, new telemetry, or unrelated RAG redesign.
- Applying the migration to any shared or production database, deploying, committing, or pushing.

## Business Rules

- Soft-delete is reversible and is represented only by a non-null `deletedAt` marker; it does not overwrite the current lifecycle status.
- Any lifecycle status may be soft-deleted without first being disabled.
- Soft-delete clears `publicQaApproved` and immediately excludes the document from new retrieval, including the evidence recheck performed before answering.
- Soft-deleted records retain all file, metadata, version, indexing, and job history. Their Admin detail and original private file remain readable.
- Restoring clears `deletedAt`, sets status to `DISABLED`, and leaves `publicQaApproved` false. `DISABLED` remains terminal; to use content again, an Admin uploads and reviews a new document.
- A deleted document cannot admit, resume, or retry indexing work, and no worker may publish a new generation after deletion.
- A restore does not republish any historical index generation.

## Roles / Authorization

- Only an authenticated Admin may list deleted documents, open their detail/original file, soft-delete, or restore.
- Every write rechecks the persisted Admin role inside the transaction.
- Knowing a document ID or URL does not grant access.

## Ownership Rules

- RAG documents remain Admin-managed records with the original `uploadedById` unchanged.
- The soft-delete marker does not transfer or alter ownership.
- Existing restrictive foreign-key relationships and historical records remain intact.

## UX / UI Contract

- The default `/admin/rag` view shows only non-deleted documents. A “Đã xóa” view exposes deleted documents and a “Khôi phục” action.
- Place “Xóa” next to “Mở chi tiết” on desktop. On mobile, expose row actions through a compact keyboard-operable action menu.
- Before deletion, show an accessible confirmation dialog with the exact filename, Cancel, and destructive Delete controls. Disable dialog actions and show a loading label/spinner during the write.
- On confirmed `SUCCESS`, remove the row from the current list immediately and show a success toast.
- On `FAILED`, retain the row and show an error toast.
- On `UNKNOWN`, retain the row, show an uncertainty toast, preserve the original request and key, and let Admin retry that same request safely.
- Restore requires no confirmation. Show loading while restoring; on `SUCCESS`, remove the row from the deleted list immediately and show a success toast. On `FAILED` or `UNKNOWN`, retain the row and show the corresponding feedback; retry `UNKNOWN` with the same request and key.
- Deleted-document detail is read-only, clearly states that it is deleted and not used for retrieval, and links back to the deleted list. Admin can still open the original file.
- Preserve the existing palette, type, spacing, dark-mode tokens, and focus treatment. All controls are keyboard operable, have accessible names, visible focus, and touch targets suitable for mobile.

## Data Contract

- `RagDocument.deletedAt`: nullable timestamp, set once on the first delete and cleared on restore.
- Deletion sets `publicQaApproved=false`; it does not change `status`, relations, or stored content.
- Restoration sets `deletedAt=null`, `status=DISABLED`, and `publicQaApproved=false`.
- New list responses may include `deletedAt` and an explicit deleted-view mode. Do not expose `storagePath`.

## API Contract

- `GET /api/admin/rag-documents` returns active documents only by default.
- `GET /api/admin/rag-documents?view=deleted` returns only soft-deleted documents.
- `DELETE /api/admin/rag-documents/[id]` accepts an empty JSON object and required `Idempotency-Key`; returns the existing mutation envelope.
- `POST /api/admin/rag-documents/[id]/restore` accepts an empty JSON object and required `Idempotency-Key`; returns the existing mutation envelope.
- Both writes require same-origin JSON requests and Admin authorization. Malformed IDs, keys, and bodies follow existing RAG/API error conventions.
- Index admission/resume/retry must reject deleted documents; index-progress and read-only detail may continue showing retained history.

## Error / Recovery

- `FAILED` guarantees no requested mutation was committed; retain the row and permit a new attempt.
- `UNKNOWN` does not imply success or failure; retry the identical method, body, document ID, and `Idempotency-Key` to resolve the outcome.
- A retry with the same key and same payload replays the original success. Reuse of a key with a different payload returns the shared idempotency conflict.
- Invalid/missing documents return the normal not-found/eligibility failure and never authorize by identifier alone.
- If the database is unavailable or a transaction outcome cannot be determined, return the shared `UNKNOWN` envelope.

## Write Semantics / Idempotency

- Use the shared idempotent transaction helper and `SUCCESS` / `FAILED` / `UNKNOWN` contract.
- Scope keys by actor, document, and operation (`delete` versus `restore`). Hash the stable document/action payload.
- Soft-delete marker, approval revocation, active-job cancellation requests, and persisted success response commit atomically.
- Restore marker/status/approval updates and persisted success response commit atomically.
- UI keeps the key and exact payload after `UNKNOWN`; a new logical attempt receives a new key after a definite `FAILED`.
- Lock the document before related index jobs, matching index worker/finalizer lock ordering.

## External Services

- Keep private Blob objects unchanged. No external Blob deletion or new provider/telemetry calls.

## Acceptance Criteria

- [x] Given a non-deleted document in any lifecycle status, when an Admin confirms delete, then `deletedAt` is set, public-Q&A approval is revoked, all source/index history remains, and the row disappears from the active list.
- [x] Given an unauthenticated user or non-Admin, when they list deleted documents or call delete/restore, then the server denies the request.
- [x] Given a soft-deleted document, when public retrieval or evidence eligibility is evaluated, then it is excluded even if an old publication and embeddings remain.
- [x] Given an index job is queued/running or later explicitly retried, when its document is deleted, then the job cannot publish a generation; its historical record remains.
- [x] Given an Admin opens a soft-deleted document, when the detail loads, then its metadata and original file remain readable but lifecycle/index/public-Q&A writes are unavailable.
- [x] Given a deleted document in the “Đã xóa” view, when Admin restores it, then `deletedAt` is cleared, status is `DISABLED`, public-Q&A approval remains false, and the row leaves the deleted view.
- [x] Given delete or restore returns `SUCCESS`, `FAILED`, or `UNKNOWN`, when the UI handles the result, then it follows the feedback, row-retention, and same-key retry behavior in the UX contract.
- [x] Given desktop or mobile viewport and keyboard-only use, when Admin operates delete/restore, then actions remain discoverable, responsive, named, focus-visible, and operable.
- [x] Given a migration is deployed, when the schema is validated, then existing documents default to `deletedAt=null` without data loss.

## Test Plan

- Unit tests: active/deleted list filtering, soft-delete in every status, approval revocation, restore to terminal `DISABLED`, Admin authorization, same-key replay, request-key conflict, failed/unknown UI state handling.
- Route tests: DELETE/restore methods, same-origin and JSON validation, required idempotency key, and response envelope.
- Retrieval tests: deleted document excluded from initial vector/keyword search and final evidence recheck.
- Index tests: queued/running cancellation behavior, deleted-document admission/retry rejection, and PostgreSQL race proving deletion and finalization serialize without post-delete publication.
- UI tests: confirmation content, loading, toast outcomes, immediate list updates, deleted view/restore, read-only deleted detail, and accessible responsive actions.
- Verification: focused RAG document/retrieval/index suites, web typecheck, relevant build, migration/schema validation, `git diff --check`, and review of every changed path against this story.

## Expected Modules / Files

- Prisma RAG document schema and additive migration.
- `apps/web/src/modules/rag-document/` service, HTTP contracts, and focused tests.
- `apps/web/src/modules/rag-index/` job admission/cancellation/retry/finalization rules and tests.
- `apps/web/src/modules/ai/qa-retrieval.ts` and retrieval tests.
- `apps/web/src/app/api/admin/rag-documents/` list, delete, and restore routes.
- `apps/web/src/app/admin/rag/` list/detail UI and responsive styles.
- `docs/stories/US-39-rag-document-delete-restore.md`, `docs/ai-progress.md`, and domain glossary.

## Migration Impact

- Add nullable `deletedAt TIMESTAMPTZ(3)` and an index suitable for active/deleted Admin list queries. Existing records remain active (`NULL`).
- Generate and validate Prisma Client. Do not apply the migration to a shared database as part of this implementation.

## Environment Impact

- None. No new secrets, environment variables, external service, or telemetry.

## Implementation Sequence

1. Add schema marker and migration; regenerate Prisma Client and verify schema.
2. Add Admin service/API writes, list views, deleted read-only detail, and service/route tests.
3. Add retrieval exclusion and indexing cancellation/admission/retry/finalization guards with unit and PostgreSQL race coverage.
4. Add active/deleted list UI, responsive actions, accessible dialog, feedback, and UI tests.
5. Run focused regression/typecheck/build/migration checks, inspect the full diff, and record evidence.

## Acceptance Evidence

- `npm run db:generate --workspace @KLTN/db` passed with a temporary loopback URL; Prisma Client 7.10.0 generated from the nullable `deletedAt` schema. The additive migration adds the nullable `TIMESTAMPTZ(3)` column and index; it was not applied to a shared database.
- `npm run test:rag --workspace web`: 64/64 passed, including all lifecycle statuses, Admin-only access, retention, restore-to-DISABLED, active/deleted list filtering, same-key replay, and deleted badge rendering.
- RAG DELETE/restore route Vitest: 5/5 passed. It covers methods, same-origin JSON, required idempotency key, private response headers, mutation envelopes, and UNKNOWN retry signaling.
- Retrieval/indexing Vitest: 61 passed, 3 skipped. Tests cover SQL retrieval/evidence exclusions, deleted-worker cancellation, and publication guards.
- PostgreSQL integration coverage was added for the delete/finalization race and for the new migration column/index. The Vitest gate skipped all 17 PostgreSQL cases because no disposable database URL was configured. The owned-container test runner could not start because the local Docker Engine is not running.
- `npm run check-types --workspace web`, Next.js production build using process-local placeholder configuration, `node --check` for both PostgreSQL test runners, and `git diff --check` passed. The Web package has no lint script.
- Impeccable detector reported 0 anti-patterns and 15 advisory notes while scanning source/CSS only. Advisory notes include established Admin shadows, pill radii and existing RAG status colors; no parsed-page contrast/layout check ran. The installed CLI does not expose a `polish` command. Source review confirmed native dialog semantics, focus restoration, 44px targets, mobile disclosure controls, dark tokens, and reduced-motion handling.
- No authenticated browser interaction, live PostgreSQL race, shared database migration, deployment, commit, or push was performed.

## Open Questions

- None. Requirement decisions were confirmed by the product owner on 2026-10-20.

## Handoff Notes

- The existing `DISABLED` state remains terminal. Restored records are retained for review/history only; reuse requires a new upload and approval flow.

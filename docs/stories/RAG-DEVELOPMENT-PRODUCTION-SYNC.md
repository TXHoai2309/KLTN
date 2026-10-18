# RAG Development → Production corpus migration

Owner scope: migration instruction + explicit direct-apply authorization, 2026-10-18.
Reuse real embeddings/private originals/exact provenance, publicQaApproved=false.
No Assistant gate/schema/Auth changes, fixtures, OpenAI requests, push/merge/deploy.

References: product RAG lifecycle/grounding contract, US-19 integrity, US-21 public
source/ownership, US-23 acceptance and prior Assistant readiness audit. Current
checked-out schema is implementation truth.

Status: RAG_PRODUCTION_SYNC=PASS for exact corpus migration. Owner waived fresh
backup for exactly three documents after SNAPSHOTS_LIMIT_EXCEEDED.
CURRENT_PRODUCTION_BACKUP=WAIVED_BY_OWNER;
RECOVERY_POINT_AFTER_DESTINATION_IMPORT=NOT_AVAILABLE. Old snapshot/receipts kept.
Default backup gate remains; explicit waiver is exact scope/hash/target bound.

Fresh identity/schema/23 migrations/Blob/137-vector preflight passed. Manifest:
ff1f1fcc64e6421b6f2a6b9fbc4a87344795b3abbeb95db7c9e66a1c92f1d519.
Atomic SERIALIZABLE COMMIT_CONFIRMED: 286 inserts, 0 updates/deletes; 3 documents/
versions/generations/publications, 137 chunks/embeddings. Independent read-only
post-import and post-replay verification PASS; actual vectors/hash/FKs/originals
match. 31 protected-table fingerprints match. Exact replay 0/0/0 writes.
Public approvals=0; three RIGHTS_REVIEW_REQUIRED. No jobs/origins/fixture/Auth
writes/Blob copies/provider calls. No restore-after-commit claim.

Migration tests39/39 and RAG56/56, no skips/failures; root typecheck/build PASS
(cached offline). PGlite tests do not establish native Neon concurrency. Historical
broader Vitest timeout + isolated rerun retained, full repo suite not run.

CMS browser BLOCKED by disabled Work Browser use. Guest list/detail/file GETs401;
Admin list/detail/download and deployed Blob credential UNVERIFIED. Assistant
stays closed; rights/provider/runtime release need separate approval. No commit,
push, merge or deploy.

[Migration report and evidence](../implementation/rag-development-production-sync.md).

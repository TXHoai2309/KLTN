# Destination Development to Production data sync

Status: DATA_TRANSFER_COMPLETE; PRODUCTION_SMOKE_PARTIAL (2026-10-18 Asia/Saigon).

Owner request: Neon Development to Production Destination data migration,
including inventory, dry-run, mandatory completed backup, safe transfer,
verification and public Production smoke. This is a one-time data operation,
not a schema change or web deployment.

References: [product contract](../product/product-spec.md),
[architecture](../architecture/technical-architecture.md),
[flows](../flow/user-flow.md), actual Prisma schemas/migrations, owner request
sections IV-XV. Existing visibility, ownership, rights and publication rules apply.

## Authorized scope

- Preserve real Destination IDs, all current fields, HIDDEN/VISIBLE state,
  hours, Destination-owned sources/media, required Areas/joins and editorials.
- Preserve rights and actor provenance without promoting approval/publication.
- Inventory Culture/RAG dependencies; defer unresolved external relations.
- Exclude User, Session, Account, AdminAuditEvent, Favorite, Trip/ItineraryVisit,
  RAG documents/vectors, QA conversations and user histories from transfer.
- Use a separate worktree from master. No routing changes, schema migrations,
  merge, push or web deployment are part of this operation.

## Acceptance gates

- [x] Isolated worktree from origin/master; original checkout preserved.
- [x] Explicit SYNC_SOURCE_DATABASE_URL and SYNC_TARGET_DATABASE_URL now exist
  in the original checkout's ignored apps/web/.env; local URL validation passes.
- [x] Preliminary identity guard refuses missing API access and unsafe URLs.
- [x] Neon API/Console verifies project, branches, endpoints and database.
- [x] Read-only SQL inventories, healthy migration ledger and schema parity.
- [x] Real/fixture classification, manifest, dependencies, rights/media/editorial
  validation and zero unresolved conflicts produce a passing full dry-run.
- [x] Completed Production backup has a verified identifier, time and restore plan.
- [x] Dedicated transfer modes implement bounded transactions, advisory locking,
  exact IDs, no overwrite/deletes and deterministic replay; fixture tests pass.
- [x] Eligible transfer, record hashes, relationships and replay verified.
- [x] Before/after fingerprints prove excluded Production data is unchanged.
- [ ] Public API/browser/CMS read-only smoke verifies resulting content; actual
  tile tests required before claiming Stadia success.

## Current implementation boundary

Owner supplied API access and explicitly selected only the three VISIBLE records,
excluding the fixture and HIDDEN duplicate. Dedicated dry-run/apply/verify/report
entry implemented. Snapshot snap-snowy-rain-b33t352d completed and verified.
Committed 3 Destinations,21 days,12 sources,13 media,3 editorials; no updates/deletes.
Canonical comparison, all38 live FKs and actual zero-insert replay PASS. Excluded
tables' before/after fingerprints match.16 unit +3 unique PostgreSQL tests PASS.

Remaining acceptance: Landing still serves prerendered fallback; browser map
shows unavailable while its sidebar has all3 rows. Tiles/hostname auth, responsive
matrix and authenticated CMS/Planner remain unverified. Cloudinary Production
cloud identity is redacted by Vercel; existing selected URLs all return200.
No web deploy or application/routing code change is authorized by this task.
DATA_TRANSFER=PASS; DESTINATION_PRODUCTION_SYNC=PARTIAL, not full release PASS.

Evidence and all 22 report items:
[implementation report](../implementation/destination-development-production-sync.md).

## Final acceptance follow-up (2026-10-18)

CMS read-only accepted with owner session; full matrix and evidence are in
[final acceptance](../implementation/destination-production-final-acceptance.md).
Home fix is implemented/tested locally, pending authorized deployment. Production
origin tile authorization remains401; local map has all3 markers. Production
planner registry and Cloudinary cloud identity remain unresolved. No import,
schema/Auth mutation, merge/push/deploy. Overall state remains PARTIAL / NO_GO.

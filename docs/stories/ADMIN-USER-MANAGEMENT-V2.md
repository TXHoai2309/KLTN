# Admin User Management V2

IMPLEMENTED AND CMS-VERIFIED — owner approved backend/API/schema/auth/audit integration of Phase 1
at e20f444f. Current task supersedes the proposed SUSPENDED/lastLoginAt fields and
self-demotion exception in the Phase 2 draft contract. Keep ACTIVE/LOCKED only,
lastLoginAt=null (no reliable login telemetry), self-lock/demotion/revoke denied.
RBAC V2 inheritance and all private-data ownership invariants remain in force.

Required: eight Admin-only APIs, real default HTTP datasource, current persisted
status/role guards, server login prevention, transactional session revocation,
race-safe active-last-Admin protection, atomic audit/idempotency, unchanged Phase 1
layout with resilient async/dialog states, real PostgreSQL and browser evidence.
No Production migration, push, merge, deployment or unrelated module redesign.

See [Phase 2 contract](../implementation/admin-user-management-phase2-api-contract.md)
and the final acceptance report for implementation, migration and verification.

Final evidence: migration deploy twice on a new isolated PostgreSQL DB,8/8 real
CMS/Better Auth groups, Development migration/backfill/preservation and23 healthy
migrations,8/8 RBAC PG regression,9/9 real browser groups,1961 Vitest PASS/134 gated
SKIP, typecheck/build/diff PASS. Final legacy335 PASS/1 unrelated Landing assertion
FAIL; global release gate is not green. All fixtures/test DBs were removed.
See [acceptance report](../implementation/admin-user-management-v2.md).

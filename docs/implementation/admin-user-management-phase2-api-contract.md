# Admin User Management V2 — implemented API contract

Owner-approved Phase 2 implementation, 2026-10-17. Supersedes the Phase 1 proposal
(including SUSPENDED, speculative lastLoginAt and self-demotion exception).
See [story](../stories/ADMIN-USER-MANAGEMENT-V2.md) and
[acceptance report](admin-user-management-v2.md) for actual verification/limits.

## Schema and trust

User keeps ADMIN/TRAVELER. Adds status ACTIVE/LOCKED (existing users default ACTIVE),
lockedAt and lockReason (500 characters maximum). No lastLoginAt column: DTO returns
null because reliable login telemetry is absent. Never use User.updatedAt for login.
AdminAuditEvent persists actor/target FKs with Restrict deletion, event type,
timestamptz timestamp, optional reason and server-owned JSON details. Composite
indexes support target/time/ID pagination, actor/time and User role/status filters.
Migration: `20261017210000_admin_user_management`; Prisma migrate ledger, never push.

## Shared HTTP boundary

All eight APIs require current persisted ACTIVE ADMIN via requireActor. Better Auth
supplies identity; forged headers/body/old cookie role do not grant permission.
Guest 401; unsupported/Traveler/locked actor 403 (revoked sessions normally 401);
missing target 404; protected no-op/self/last-Admin conflicts 409. Responses are
`Cache-Control: private, no-store`. Unknown/duplicate query keys are rejected.

Reads: `{ success:true, data:T }`; failures use the project's error envelope.
Writes: `{ success:true, operationStatus:"SUCCESS", data:T }` only after committed
DB + audit + idempotency result. FAILED uses known status/code/message; UNKNOWN
uses 503 and retryWithSameKey=true. Mutation bodies are strict Zod objects, bounded
4KB JSON, same-origin/fetch-site protected, with required Idempotency-Key. Never
accept actorId, bypass flags, unrecognized role/status or client-created audit data.

## Endpoints

| Endpoint | Input | data |
| --- | --- | --- |
| GET /api/admin/users | search, role, status, sortBy, sortOrder, page, pageSize | UserPage |
| GET /api/admin/users/statistics | no query | totalUsers, travelerCount, adminCount, lockedCount |
| GET /api/admin/users/[id] | no query | UserDetail |
| GET /api/admin/users/[id]/audit-logs | page, pageSize | items, page, pageSize, hasMore |
| PATCH /api/admin/users/[id]/role | { role: ADMIN or TRAVELER } | userId, action, revokedSessionsCount |
| POST /api/admin/users/[id]/lock | { reason?: string } | userId, action, revokedSessionsCount |
| POST /api/admin/users/[id]/unlock | {} | userId, action, revokedSessionsCount |
| POST /api/admin/users/[id]/revoke-sessions | {} | userId, action, revokedSessionsCount |

List defaults: search empty, role/status ALL, sortBy createdAt, sortOrder desc,
page=1, pageSize=6 matching Phase 1. PageSize 1..50, page 1..1,000,000, search at most
200 characters, NFC normalized and case-insensitive on name/email. Supported status
filters are ACTIVE/LOCKED/ALL only. DB-side count/filter/order/skip/take, ID tie-break,
RepeatableRead snapshot and page clamp prevent out-of-range empty pages. Empty
results have page=1, totalPages=1. No whole-user-table fetch/client filtering.

UserSummary: id/name/email/image/role/status/emailVerified, ISO createdAt/updatedAt,
lastLoginAt=null and exact active sessionCount. UserPage: items,total,page,pageSize,
totalPages,hasMore,isMockData=false. No password/account credentials are selected.

UserDetail adds lockReason/lockedAt and at most twenty recent activeSessions:
id,createdAt,expiresAt,userAgent (bounded 200 characters). SessionCount counts all
sessions where expiresAt > one request reference time; expired sessions are
excluded. Snapshot consistency applies to metadata/count/rows. Never return tokens
or full IP. UI states the twenty-session limit when there are more.

Audit defaults page=1/pageSize=20, max50, ordered timestamp desc then ID asc; it
returns actor ID/name/email, target ID/name, type, timestamp, optional reason and
safe details. No endpoint creates an audit record directly. ROLE_CHANGED stores
oldRole/newRole; lock/unlock stores oldStatus/newStatus and revokedSessionsCount;
SESSION_REVOKED stores the actual active deleted count. Audit reads never change
stored logs. No account deletion feature exists.

## Transaction and permission invariants

A global transaction advisory lock serializes CMS role/status/session mutations.
After acquiring it, re-authenticate/recheck current persisted actor role/status,
lock the target row FOR UPDATE and count ACTIVE ADMINs before reducing privileges.
The current Admin cannot self-change role, self-lock or self-revoke through CMS.
Concurrent mutual demotions cannot remove the last active Admin. Locked Admins do
not count as available administrators. New intent with unchanged role/status or
zero active sessions returns409 and creates no audit. Identical successful replay
returns the original outcome without repeating mutation/audit. Different payload
under the same key conflicts through the shared idempotency contract.

Role changes deliberately keep existing sessions. RBAC V2 reads DB role on the
next request, so ADMIN -> TRAVELER loses Admin APIs immediately and retains owned
Traveler capabilities. UI refetches after success; denied stale Admin access
navigates to dashboard, or login on401. No client role/session forgery.

Lock updates LOCKED/lockedAt/reason and deletes all stored sessions in the same
transaction; reported count includes sessions active at that operation. Supported
Better Auth 1.7.5 databaseHooks.session.create.before rejects non-ACTIVE users.
The versioned PostgreSQL session INSERT/UPDATE trigger holds a shared User row
lock and checks ACTIVE, closing the hook's check/insert race with account lock.
Cookie cache is explicitly disabled. Shared guards and the separate AI principal
resolver also check persisted status; AI principal transaction admission checks
ACTIVE without changing RAG/history business logic or ownership.

Unlock clears lockedAt/reason and sets ACTIVE without restoring sessions. A new
normal login is required. Revoke deletes active Session rows only, does not lock
User or modify Account/credentials, and records the exact count. A new concurrent
login after revoke's linearization remains allowed because the account is active.

## Frontend integration and recovery

[Runtime data-source entry](../../apps/web/src/modules/admin-users/admin-user-data-source.ts)
defaults to HttpAdminUserDataSource in both Development and Production. Fixture data
is isolated in admin-user-fixtures.ts and imported only by explicit test/demo code.
The original list/detail, badges, statistics, Session Overview and Audit Timeline
are retained. No Phase 1 banner or simulated successful mutation remains.

Reads distinguish loading, error+Retry, missing user and no-results. Search is
IME-aware/debounced with stale-response rejection and immediate clear. Pagination
uses the backend's clamped page. List/role/status/statistics/detail/session/audit
refetch after confirmed success. Audit has bounded Load more with ID deduplication.

Native CMS modal dialogs reuse the Destination/Editorial modal owner and Phase 1
surface styles. Each has unique accessible IDs, Cancel initial focus, Tab boundary
handling, Escape/backdrop cancellation and focus restoration. Revoke has explicit
confirmation. Pending guards prevent duplicate submits and dismissal. Failure
keeps the dialog open with text and error toast. SUCCESS alone closes/refetches.
UNKNOWN freezes input and retains the immutable payload/key; retry first rereads
current state, then reconciles the identical write through the DB idempotency
record. Read state alone never proves that the original operation succeeded.

## Rollout and rollback

Run isolated PostgreSQL migrations twice and integration tests before applying to
the verified Development project/branch/endpoint/database. Compare existing user
roles and row counts before/after; inspect migrate status. Deploy the migration
before application code. No Production migration/deployment is performed here.
Rollback application code only after reviewing lock behavior; retain additive
columns, audit records and session guard trigger. Do not drop audit/history or
restore revoked sessions as rollback. Production promotion requires its own
migration/backup/deployment approval and smoke checks.


## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native select in UserManagementClient | Existing Phase 1 filters; this contract | Native operating-system popup | Real browser role/status filters at desktop/mobile |
| Form | UserMutationDialog and shared Zod inputs | This contract; admin-user-schema.ts | Role, lock/unlock, revoke | PostgreSQL validation and browser dialogs |
| Dialog | CmsDialog using Destination/Editorial native modal pattern | DESIGN.md; this contract | Pending/UNKNOWN cannot dismiss | Browser Tab/Escape/focus/failed submit |
| CRUD | HttpAdminUserDataSource and AdminUser services | This contract | Stay on selected screen; refetch after SUCCESS | Real E2E + DB/audit assertions |
| Toast | Existing Sonner provider | Project shared runtime | Success after commit; failure with inline text | Real failure/UNKNOWN browser cases |
| Pagination | Server query and existing list footer | This contract | Clamped offset page; audit Load more | Real backend filters/page/count |

Phase 1 local filter state remains transient within the CMS screen; this integration
retains that established behavior rather than introducing a new URL-state system.

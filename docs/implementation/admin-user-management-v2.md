# Admin User Management V2 — implementation and acceptance

Date: 2026-10-17. **CMS scope implemented and verified end to end. Repository-wide
release gate remains non-green because of one unrelated Landing/Explore legacy
assertion.** No Production migration or deployment is claimed.

## 1. Branch and baseline

- Before: `feat/admin-user-management-fe`, HEAD
  `e20f444fbb8bf6ce863e2c5d3b8c923d4ec33d59`; fetched remote FE branch matches.
- Implementation baseline: `feat/admin-user-management-be`, initially the same HEAD.
  The owner subsequently authorized a scoped CMS commit and push on this branch.
- Initial untracked video directory preserved. Landing Page source/CSS and media
  changed concurrently during this task; these are excluded from CMS work.
- No reset, stash, unrelated overwrite, merge or deployment. Commit/push authorization
  applies only to this CMS scope; concurrent Landing work stays outside the commit.

## 2. Schema and migration

`20261017210000_admin_user_management` adds UserStatus ACTIVE/LOCKED, status default
ACTIVE, nullable lockedAt and bounded lockReason; keeps role enum and credentials.
Adds AdminAuditEvent with ROLE_CHANGED/USER_LOCKED/USER_UNLOCKED/SESSION_REVOKED,
actor/target references with ON DELETE RESTRICT, timestamp/reason/safe JSON details,
target/timestamp/ID and actor/timestamp indexes; User role/status index.

It also installs a PostgreSQL session INSERT/UPDATE trigger that locks the related
User FOR SHARE and requires ACTIVE. Schema changes use Prisma migrations/ledger;
no `db:push`. No speculative lastLoginAt field or SUSPENDED status was added.

Docker Engine was unavailable. A first isolated-schema attempt could not resolve
the public vector type under Prisma's schema search path; that schema was removed.
The fallback used a **new separate PostgreSQL database** on the authorized
Development branch, with actual migration files and independent ledger. Migrate
deploy PASS twice: first application, then no repeated application. The CMS's eight
real PostgreSQL/Better Auth groups passed before touching the application schema.

Before application migration, server-reported metadata was verified exactly:

- Project `summer-unit-95870477`.
- Branch `br-aged-hat-b3o6hg9p`.
- Endpoint `ep-purple-pond-b3xujb8o` (approved Development pooled hostname).
- Application database `neondb`.

Development deploy and migrate status PASS, **23 applied migrations**, no failed
ledger entries. All existing users backfilled ACTIVE with null lock metadata.
Before/after counts preserved: 9 Users, 33 Sessions, 9 Accounts, 0 Trips, 1 Favorite;
the hash of sorted User ID/role pairs was identical. See
[migration evidence](admin-users-v2-evidence/migration-development.json).

## 3. APIs and real data

All reads use the shared success/data envelope and private,no-store; mutations use
the project's SUCCESS/FAILED/UNKNOWN/idempotency contract. Thin Route Handlers call
the Admin Users HTTP/service boundary, enforcing current persisted ACTIVE ADMIN.

| API | Behavior |
| --- | --- |
| GET /api/admin/users | DB search, role/status filter, stable sort, bounded page/count and clamping |
| GET /api/admin/users/statistics | Real grouped totals by role/status |
| GET /api/admin/users/[id] | Allowlisted account metadata and active session overview |
| GET /api/admin/users/[id]/audit-logs | Bounded, ordered, paginated persisted audit |
| PATCH /api/admin/users/[id]/role | Strict ADMIN/TRAVELER change, self/last-Admin protection |
| POST /api/admin/users/[id]/lock | Lock metadata, revoke sessions and atomic audit |
| POST /api/admin/users/[id]/unlock | ACTIVE and clear lock metadata; no restored session |
| POST /api/admin/users/[id]/revoke-sessions | Delete active sessions, report actual count and audit |

Queries are strict, reject duplicate/unknown parameters, and cap pageSize at 50.
NFC case-insensitive name/email search stays in PostgreSQL. List and detail use
RepeatableRead snapshots for count/metadata/session consistency. Active session
counts exclude expired rows. Detail shows at most 20 recent active sessions and
states that limit when needed; no password/hash/token/full-IP is selected or
returned. lastLoginAt is explicitly null and shown as unrecorded.

Writes validate bounded JSON, same-origin/fetch-site, idempotency key, strict body
keys and supported values. Actor identity is never accepted from client input.
Guest401, Traveler/unsupported role403, missing target404, protected conflicts409.
See the [implemented API contract](admin-user-management-phase2-api-contract.md).

## 4. Account lock and Better Auth

The installed **Better Auth 1.7.5** source/types were inspected for the supported
`databaseHooks.session.create.before` hook. The hook reads current persisted status
and throws ACCOUNT_LOCKED for non-ACTIVE accounts. It applies to current password
login and signup session creation; no password authentication was forked. Cookie
cache is explicitly disabled. No unsupported hook or speculative provider path is
claimed; email/password is the configured authentication method.

The database trigger closes the hook's check/insert race: session insertion takes
a shared User row lock; CMS lock takes FOR UPDATE, updates status and deletes
sessions in the same transaction. A concurrent insert either commits before lock
and is deleted, or observes LOCKED and fails. Real PostgreSQL lock/insert testing
passed. Lock removes all stored target sessions; the reported count is those active
at the operation's reference time. Existing cookies cannot authenticate afterwards.
Unlock creates/restores no sessions; real normal login succeeds only after unlock.

`requireActor`/`requireTraveler` check persisted account status. The separate AI
principal resolver and transactional User-principal admission also require ACTIVE;
these are the only AI-related edits. RAG retrieval, models, citations, source
eligibility/publicQaApproved, history ownership, abuse protection and runtime gates
are unchanged. Admin keeps RBAC V2 Traveler inheritance and own-data isolation.

## 5. Last Admin protection, sessions and audit

CMS mutations acquire a global transaction advisory lock, then recheck current
actor identity/role/status and lock the target row. Active Admin counts are checked
before reducing availability. Locked Admins do not count. Self role change, lock
and revoke are rejected in CMS. Real concurrent mutual demotion leaves one ACTIVE
ADMIN; the losing operation cannot use its stale Admin permission.

Role change deliberately retains sessions: the next Admin API request reads DB
role and returns403 after demotion, while owned Traveler/account access remains.
Explicit revoke deletes only active Session rows and never modifies Account,
password or status; a later normal login is allowed. All-device old-cookie denial
was verified. Repeated new no-op requests return409 without new audit; exact
successful replay returns the original response without repeat writes/logs.

Mutation, one semantic audit event and successful idempotency result commit in the
same transaction. Audit actor is server-verified. Details record old/new role or
status and revocation counts without secrets. A deliberately failed audit insert
rolled back role change and idempotency claim, returning UNKNOWN. Actual lost
browser acknowledgement was reconciled with the same payload/key, creating one
audit event only. Lock's session revocation is recorded in its USER_LOCKED event;
explicit revoke uses SESSION_REVOKED.

## 6. Frontend integration

DefaultAdminUserDataSource now instantiates **HttpAdminUserDataSource** in both
Development and Production. The old fixtures/data-source class live in a separate
explicit test/demo module and are not imported by runtime. List, statistics,
detail, lock/unlock, change-role, session overview and audit timeline use real APIs.

The Phase1 layout/styles/typography/dark-light identity remain. Phase1-only banners
and simulated actions are removed. Reads distinguish loading/error+Retry, no-results
and missing account. Search handles composition/debounce/stale responses; clearing
is immediate. Confirmed success alone triggers success toast and refetches current
detail/list/statistics/sessions/audit. Failure keeps the modal open with inline text.
Audit supports bounded Load more with deduplication.

Confirmations reuse the existing native modal pattern and Phase1 surface classes.
Lock, role and revoke dialogs have unique accessible IDs, Cancel initial focus,
Tab boundaries, inert background, Escape/backdrop cancellation and restored focus.
Focus stays in the modal when submitting disables its focused control. Pending
guards prevent duplicate submissions. UNKNOWN freezes input and dismissal, retains
the immutable payload/key, rereads current state, then reconciles the original
write. Read state alone is never called confirmed success.

Real long names/emails exposed a root-grid min-content overflow on 390px; scoped
min-width/wrapping fixes retain the layout and restore document-width bounds.
No Landing/Header redesign or unrelated media changes were made by this task.

## 7. Verification — actual counts

| Check | Result |
| --- | --- |
| Focused CMS/auth/read/save suites (initial) | 73 PASS, 16 gated SKIP |
| Final CMS/fixture rerun | 21 PASS, 0 FAIL, 0 SKIP |
| Final full Vitest | **1,961 PASS,134 gated SKIP**,127 files PASS/15 gated files |
| Legacy, final repository state | **335 PASS,1 FAIL**, no legacy SKIP; remaining chained suites run separately |
| Earlier full legacy before concurrent Landing edits | 336 PASS |
| CMS real isolated PostgreSQL + Better Auth | **8/8 PASS**, final 35.88s |
| RBAC V2 real Development PostgreSQL | **8/8 PASS**, ownership and Traveler inheritance preserved |
| Real Chromium/Better Auth/Neon browser | **9/9 groups PASS**, own fixtures only |
| Root typecheck | PASS |
| Root production build | PASS, 2m9.491s |
| git diff --check | PASS (Git LF/CRLF notices only) |
| Scoped CMS strict UI audit | 0 errors/0 findings |

The final legacy failure is `Home is product UI; Explore streams independently...`
in `public-culture-list.test.tsx`: it asserts `/home-hero-visual/` in Landing source
being changed concurrently. Neither the Landing files nor that test were changed
by CMS work. Search/Favorites/RAG/idempotency suites stopped by the chain were then
run separately: 120 PASS. This is **not** a full-repository PASS and is not hidden by
changing the unrelated expectation.

Gated tests are never counted as PASS. Existing broader Docker PostgreSQL runners
were not run because Engine was unavailable; the new disposable Development DB
covered CMS's migration/auth/concurrency cases. QA/RAG PostgreSQL harness setup now
includes the new auth migration because persisted-status admission requires it.
Global UI static audit still reports broader existing ownership/heuristic findings;
the CMS-scoped contract/audit is separate, not a whole-app compliance claim.

## 8. Real browser cases and evidence

[Final results](admin-users-v2-evidence/browser-results.json) verify real UI/API/DB:

1. Better Auth Admin login, real rows/statistics and no fixture/banner.
2. Search/filter/server page navigation and real detail.
3. Promote/demote via dialogs; an existing target cookie gains/loses Admin access
   according to DB role; Traveler cannot open CMS and keeps self-account access.
4. Lost acknowledgement after a real committed role mutation: UNKNOWN, immutable
   retry, exactly one persisted audit. Only the response was fault-injected.
5. Lock revokes devices; actual password login is denied; unlock allows fresh
   login and never revives the old cookie.
6. Revoke confirmation invalidates actual cookies, refreshes session count and
   persisted audit timeline; audit page size/hasMore checked.
7. Self-lock409 keeps dialog open; Tab/Escape/focus restoration verified.
8. 1440px light/dark and 390px mobile, no horizontal overflow, real no-results.
9. Guest/Traveler denial and DTO credential/IP leak prevention.

Screenshots inspected: [desktop light](admin-users-v2-evidence/desktop-list-light.png),
[desktop dark](admin-users-v2-evidence/desktop-list-dark.png),
[mobile dark](admin-users-v2-evidence/mobile-list-dark.png).

Initial browser attempts exposed two harness pagination assumptions and actual
dialog accessible-name/focus/mobile-overflow issues. They were fixed and rerun.
The [first](admin-users-v2-evidence/browser-first-attempt.json) and
[second](admin-users-v2-evidence/browser-second-attempt.json) failed attempts remain
available; their failure screenshots are historical, not final PASS screenshots.
No mocked component harness is represented as full-stack acceptance.

## 9. Cleanup and environment boundaries

All browser User/Account/Session/audit/idempotency fixtures were removed by exact
owned IDs and unique email prefix. Each browser attempt's cleanup passed.
The separate test DB and earlier failed test schema were removed. PgBouncer kept
idle test backends, so cleanup used DROP DATABASE WITH FORCE only for the validated
random owned DB name, never neondb. Final [cleanup evidence](admin-users-v2-evidence/cleanup.json):
zero test databases, zero test schemas, zero browser fixture users; 9 application
users and 23 applied migrations. No existing user was changed to test a mutation.

No Production connection/migration/environment/secret update, provider call, quota
reset or deployment. Culture/ticket-price flags remain false; Trip/Favorite
ownership is unchanged. No unrelated video/image artifact is part of CMS scope.

## 10. Remaining limits and deployment readiness

- Code/schema/API/frontend CMS acceptance is verified on Development. Production
  rollout still needs its separately approved migration/backup/deployment and smoke.
- Resolve the unrelated Landing/Explore legacy mismatch before calling the full
  repository release gate green. No CMS-only fix can honestly mark it PASS.
- 134 full-suite gated tests and broader Docker PG regression remain unverified;
  the two actually run PostgreSQL groups above are reported separately.
- Last login telemetry is intentionally absent. Session detail is capped at 20;
  counts remain exact. Audit uses offset pages and frontend ID deduplication.
- UNKNOWN recovery is retained in the current browser runtime/dialog; after a full
  browser restart, inspect current detail/audit before initiating any new intent.
  Server no-op and idempotency rules still prevent retry audit duplication.

Rollback preserves additive schema/audit and revoked sessions; do not drop those
records as an application rollback. See rollout details in the API contract.

Key files: `packages/db/prisma/schema/auth.prisma`, versioned migration,
`packages/auth/src/index.ts`, shared authorization guard, the two AI account-admission
checks, `modules/admin-users/*`, eight `app/api/admin/users` handlers, existing
`app/admin/users/*` screens, three new migration/test/browser scripts, QA/RAG test
schema setup, story/product/architecture/design/API/report/progress documentation.

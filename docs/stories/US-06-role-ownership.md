# US-06 — Kiểm soát quyền theo vai trò và quyền sở hữu dữ liệu

## Status

ACCEPTED — runtime role browser smoke confirmed by the user; ownership accepted through deterministic fixture tests because production Trip/Favorite resources do not exist yet.

## Goal / User Story

Là người dùng, tôi muốn hệ thống kiểm soát quyền truy cập theo vai trò và quyền sở hữu dữ liệu để không thể truy cập chức năng hoặc dữ liệu không được phép.

## Source References

- Approved US-06 task: contract, backend role/ownership checks, protected endpoints, denied UI and tests.
- Product Document §4.2, §4.4.6, §9.3, §11.3; System Specification §2.3 and §9.5: exact roles, self ownership, no permission through URL/ID, no shared trip ownership.
- [Product contract](../product/product-spec.md), [technical architecture](../architecture/technical-architecture.md), [US-05](US-05-account-profile.md).
- No requirement ID or new Figma frame was supplied; no IDs inferred. Reuse existing UI.

## Contract / Permission Matrix

| Capability | Guest | Traveler | Admin | Implementation boundary |
| --- | --- | --- | --- | --- |
| Public exploration/culture Q&A | Allowed | Allowed | Allowed | Product policy; domain features not implemented |
| Public home/health and authentication entry | Allowed | Allowed | Allowed | Existing routes unchanged |
| Own account and authenticated dashboard shell | Denied | Allowed | Allowed | Existing pages/API guarded |
| Own favorites/trips/itineraries/in-trip support | Denied | Own only | Denied | Shared Traveler role/ownership primitives; no domain tables/routes yet |
| Destination/culture/RAG administration | Denied | Denied | Allowed | Shared Admin permission; no content management endpoints yet |
| Another user's private account/Traveler data | Denied | Denied | Denied | Self account query; scoped ownership lookup; no Admin bypass |
| Logout | No-op if already signed out | Current session only | Current session only | Existing strict US-03 boundary unchanged |

Admin does not inherit Traveler permissions. Guest has no persisted account. Public signup still assigns TRAVELER; client-supplied identity/role never authorizes a request.

## In Scope / Existing Audit

- Shared exact permission policy, trusted-session/current-DB-role guard, owner comparison and actor-scoped Traveler reader.
- Apply account guard in its module (GET/PATCH already delegate there); account page uses the same module boundary. Dashboard validates current role and bypasses cookie cache. Development demo Server Action independently requires Traveler permission.
- Auth provider catch-all remains provider-owned; strict logout keeps its existing exact-session revocation and no-op semantics. Health remains public.
- Account ID is always trusted session ID. Query selectors are rejected; body is strict name-only. `/account/:id` and `/api/account/:id` do not exist.
- Explicit denied page and account mutation feedback for 401/403/404. Guest redirects retain existing returnTo; role denial does not trigger login loops or automatic write retries.

## Out of Scope

New Trip/Favorite/content models or endpoints, Admin user management, role editing, global middleware/proxy, Better Auth plugin/config changes, schema/migrations, seed, commits/push.

## Backend / Ownership Integration Contract

- `requireActor` accepts headers and trusted server dependencies, validates session, reads only current User ID/role from DB, then enforces exact permission. Unknown roles fail closed. No global authorization result cache.
- `requirePermission`: missing identity -> 401 `UNAUTHENTICATED`; incompatible role -> 403 `FORBIDDEN`.
- `requireOwnership` receives a persisted owner ID, never a request body owner. Missing/non-owned resource -> identical 404 `NOT_FOUND` without existence/owner details; Admin has no bypass.
- `readOwnedTravelerResource` denies Guest/Admin before invoking the DB callback; callback must query with both supplied resource ID and trusted actor userId. Future modules map this scope to their own ownership column. For writes use the transaction reader and retain the same scope in the update/delete predicate; do not check outside a transaction then write by ID alone.
- Ownership fixture tests demonstrate this contract; there is no claimed live Trip/Favorite authorization integration before those modules exist.
- Account remains a self lookup and never accepts a target user ID; no cross-account DTO is returned. Applicable account writes preserve existing transaction/idempotency outcomes. Permission denial maps to known FAILED, never SUCCESS/UNKNOWN.

## Acceptance Criteria / Test Plan

- All 12 Guest/Traveler/Admin x public/account/Traveler/Admin permission combinations match the matrix.
- Fresh persisted role wins over forged headers and stale session role; missing/revoked session, deleted user and unknown role fail closed.
- Altered resource ID cannot reveal another Traveler's resource; non-owned/missing cases produce identical 404. Guest/Admin never invoke Traveler data callback.
- Own account remains available to both roles; forged role/id/userId/email fields cannot select or mutate another account.
- Protected HTTP responses retain shared 401/403/404 envelopes; denied writes are FAILED without protected data.
- Server Action has an independent role guard; page/API boundaries remain enforced without relying on hidden buttons. UI shows denied feedback; returnTo and auth submission regressions remain covered.
- Run env generation, authorization/account/auth tests, typecheck, build and diff-check. Tests use in-memory fixtures, no database test records.

## Migration / Environment Impact

None. No schema, migration, env value or provider changes.

## Final AC Matrix

| AC | Result | Evidence |
| --- | --- | --- |
| Guest private-route boundary | PASS | User-confirmed `/account` -> `/login?returnTo=%2Faccount`; no private account data rendered |
| Traveler self account | PASS | User-confirmed `/account` ALLOW; self-only account service tests |
| Traveler-only action | PASS | User-confirmed Traveler auth-context demo action ALLOW |
| Admin self account | PASS | User-confirmed `/account` ALLOW self-service |
| Admin has no Traveler inheritance | PASS | User-confirmed Admin Traveler-only demo action DENY; exact permission matrix tests |
| Current role/session authority | PASS | Deterministic forged/stale role, revoked/deleted session and unknown-role tests |
| Ownership / changed resource ID | PASS | Deterministic actor-scoped fixture tests; non-owned/missing 404, no Admin bypass or forbidden callback |
| Protected API / forged account selector | PASS | Previous live Guest API smoke and deterministic strict self-account tests |
| Denied UI / auth regression | PASS | Runtime role smoke, feedback/source assertions and existing auth suite |

## Protected Route / API Audit

- `/account`: server page calls guarded account module; Guest redirects with canonical returnTo before private DTO rendering; authenticated role denial uses the denied view.
- GET/PATCH `/api/account`: thin adapters delegate to guarded self-only service. Query identity selectors are rejected, PATCH body is name-only, and private responses are no-store. Denied writes map to FAILED.
- `/dashboard`: uncached trusted session and current persisted role guard; both valid signed-in roles allowed.
- Development auth-context demo Server Action: independently requires exact Traveler permission on the server; Admin denied. Harness is unavailable in production.
- Better Auth catch-all retains provider-owned authentication; logout retains strict current-session revocation/no-op behavior; home/health remain public.
- Trip/Favorite/Admin-content endpoints are not implemented. Their future stories must reuse canonical `apps/web/src/server/authorization` policy, guard and ownership primitives, with ownership-scoped persistence before private data is returned, mutated or supplied to AI.

## Acceptance Evidence

- Baseline: clean `TXH`, US-05 already committed (`a357228`). No prior uncommitted work overwritten.
- Authorization suite 21/21 PASS: complete matrix, persisted role rather than forged/cached role, session/deleted-user/unknown-role denial, ownership scope, altered IDs, Admin without Traveler privilege, no forbidden callback, account self-only and HTTP/error mapping.
- Existing account tests 18/18 and auth tests 33/33 PASS. Auth demo source assertion was updated to its new shared guard; original no-client-role/no-replay expectations remain.
- Live development HTTP smoke without credentials: GET `/api/account` -> 401 `UNAUTHENTICATED`; GET with `?userId=other-user` -> 400 `INVALID_ACCOUNT_QUERY`; `/api/account/other-user` -> 404; same-origin JSON Guest PATCH -> 401 with `operationStatus: FAILED`. No response included account data. No test DB writes succeeded or fixture records were created.
- Env generation, typecheck, production build and tracked/new-file whitespace checks PASS. Initial typecheck caught optional HTTP status in the feedback helper; corrected and both typecheck/build rerun successfully.
- Final runtime browser evidence (user-confirmed): Guest `/account` redirected to `/login?returnTo=%2Faccount` without rendering private account data; Traveler `/account` and Traveler-only auth-context demo action ALLOW; Admin `/account` ALLOW self-service but Traveler-only demo action DENY. Admin does not inherit Traveler permission. The agent did not independently repeat this browser smoke in the final documentation pass.
- Ownership is accepted through deterministic fixture tests because Trip/Favorite production resources do not exist yet. These tests are not represented as live production-resource smoke.
- Final acceptance validation rerun: env generation PASS; authorization 21/21, account 18/18, auth 33/33 PASS; check-types PASS (Turbo cache hit); build PASS; diff-check PASS. Only this story and progress documentation edited in the final acceptance pass.
- No schema/migration, provider config, credentials, database fixture cleanup, commit or push.

## Open Questions / Handoff

None for the existing endpoints. Future Trip/Favorite/Admin-content stories must reuse the canonical authorization/ownership module and integrate the ownership scope before returning, modifying or supplying private data to AI. This story does not authorize implementing those stories early.

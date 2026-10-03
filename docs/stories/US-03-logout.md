# US-03 — Đăng xuất

## Status

ACCEPTED

## Epic

Authentication / User Access

## Owner

Tô Xuân Hoài

## Goal / User Story

Là người dùng đã đăng nhập, tôi muốn đăng xuất để kết thúc phiên sử dụng tài khoản của mình.

## Outcome

Better Auth kết thúc phiên hiện tại, xóa cookie phiên của browser hiện tại, và UI chỉ điều hướng sau khi nhận xác nhận thành công. User và credential Account vẫn được giữ nguyên; phiên khác của cùng tài khoản không bị ảnh hưởng.

## Source References

- **Product Document:** §4.4–4.5 (Traveler/Admin roles); §9.3 (authentication and authorization); §13.6 (authentication acceptance).
- **System Specification:** §2.2 (authentication) and §2.3 (authorization/session behavior).
- **Related accepted implementation contract:** [US-02 login](US-02-login.md), Session Contract and API Contract.
- **Requirement IDs:** No logout-specific requirement ID was confirmed in the available auth story/source references; none is inferred here.
- **Figma:** No logout-specific frame is required; retain the existing header/menu interaction.

## Dependencies

- Existing Better Auth email/password and `POST /api/auth/[...all]` catch-all route.
- Existing Prisma `User`, `Account`, and `Session` models.
- Existing client `authClient.useSession()` state and server `auth.api.getSession()` boundary.
- Existing protected `/dashboard` route and safe `returnTo` login helper.

## In Scope

- Audit Better Auth's current sign-out endpoint, database session invalidation, and cookie handling.
- Harden `UserMenu` pending, duplicate-submit, success-navigation, and generic failure behavior.
- Add an application-owned `POST /api/session/logout` wrapper that confirms current-session revocation before forwarding Better Auth cookie headers.
- Verify browser/session invalidation, protected route denial, retained User/Account, and independent sessions in development.
- Record acceptance evidence and update AI progress.

## Out of Scope

- Logout-all-devices, User/Account deletion, role changes, domain-data cleanup, schema/migration changes, or UI redesign outside `UserMenu`.
- Password reset, account deletion, or Admin feature authorization.

## Business Rules

- Sign out only the Better Auth session represented by the current request cookie.
- A confirmed success ends the current session and clears its cookie; do not delete the User, credential Account, or other sessions.
- Only navigate after the application endpoint confirms the current Session row is absent. Better Auth's success response alone is not sufficient.
- If the current Session remains after Better Auth sign-out, delete only that Session by ID using Prisma and verify absence again.
- Never forward Better Auth's cookie-clearing headers before the Session absence postcondition is confirmed.
- On a confirmed revoke failure or uncertain database/provider result, keep the current route and show generic retry feedback.
- The client session remains sourced from `authClient.useSession()`; do not add parallel auth state.
- Prevent concurrent sign-out attempts synchronously, including repeated keyboard activation.

## Roles / Authorization

- Any authenticated Traveler or Admin can end their current session.
- Public access after sign-out is unauthenticated. Protected access is decided by server-side `auth.api.getSession()`; client UI state is not an authorization boundary.
- Logout does not change `User.role`.

## Data Contract

- Successful sign-out deletes/revokes only the current `Session` record.
- `User` and credential `Account` rows remain unchanged.
- Other valid `Session` rows for the same User remain usable.
- Never expose or log session tokens/cookies/passwords.

## API Contract

- UI calls `POST /api/session/logout` with same-origin credentials.
- The application endpoint uses `auth.api.getSession`, the installed Better Auth HTTP handler, and Prisma, then returns `{ success: true, operationStatus: "SUCCESS" }` only after verifying the current Session row is absent.
- The endpoint returns generic `FAILED` or `UNKNOWN` feedback without cookie-clearing headers if revocation is not confirmed. Infrastructure uncertainty is `UNKNOWN` and retryable.
- Already unauthenticated requests are idempotent successful no-ops; they do not call signOut or inspect/delete any other Session.
- The UI accepts only HTTP success with the explicit `SUCCESS` envelope; it does not navigate on failure/unknown.

## Session Contract

- `auth.api.getSession({ headers })` identifies the current session; its `session.id` is used for all database postcondition checks and fallback deletion.
- Better Auth sign-out uses its installed HTTP handler; response `Set-Cookie` headers are held by the application route until Prisma confirms the current Session is absent. Router dispatch avoids the `nextCookies` plugin mutating Next's cookie store early.
- If Better Auth leaves the Session row, Prisma deletes by that session ID and verifies absence. No operation is scoped by `userId`.
- After success, the client uses a same-tab full navigation to `/` so the custom endpoint cannot leave Better Auth's client session store stale.
- Server-rendered `/dashboard` checks the request session on access and redirects unauthenticated users using `buildAuthLoginHref("/dashboard")`.
- Logging out session A must not revoke session B for the same User.

## Error / Recovery

- **SUCCESS:** The current Session is absent after verification and Better Auth provided cookie-clearing headers; the route forwards those headers and the UI replaces navigation to `/`.
- **FAILED:** A database verification confirms the current Session still exists after the fallback operation; return a generic failure with no cookie clearing.
- **UNKNOWN:** Session resolution, provider operation, delete, or verification is uncertain; return a generic retryable response with no cookie clearing. The UI stays on the current route and does not claim logout.
- **Already unauthenticated:** Return idempotent `SUCCESS` as a no-op with no cookie headers and no database mutation.
- The user can retry from the same menu after the pending attempt settles. Do not automatically repeat the request.

## Acceptance Criteria

- [x] **AC-01:** A logged-in Traveler signed out through the real menu; the browser returned to `/` and showed Sign In.
- [x] **AC-02:** Direct `/dashboard` access redirected to `/login?returnTo=%2Fdashboard`.
- [x] **AC-03:** Server-side postcondition confirms the current Session is absent before cookie headers are returned; the development Session count dropped from two to one. No token/cookie value was recorded.
- [x] **AC-04:** After session A logout, the development User remained `TRAVELER` with exactly one credential Account; only A was removed.
- [x] **AC-05:** An independent HTTP cookie jar for session B remained authenticated after browser session A logged out; one Session remained. Session B's test cookie was never printed.
- [x] **AC-06:** A real double-click left one pending menu action (disabled item and pending label), then navigated once. The synchronous ref guard blocks the second handler before it can call Better Auth.
- [x] **AC-07:** Focused strict-logout tests cover confirmed success, Prisma fallback, fallback failure, query uncertainty, current-session-only behavior, and already-unauthenticated no-op. Client tests verify explicit response parsing and no navigation unless confirmed. Browser-level network fault injection was unavailable in the connected browser controls.
- [x] **AC-08:** Refresh after the protected-route redirect stayed on the safe login URL; browser Back returned to the unauthenticated home page, not the protected dashboard.
- [ ] **AC-09 (optional):** If a safe development Admin test account exists, logout removes only its current session and preserves the `ADMIN` role.
- [x] **AC-10:** Provider-reported success alone cannot produce logout success; cookie-clearing headers are forwarded only after the current Session is absent.

## Test Plan

- Inspect the installed Better Auth sign-out route implementation and its HTTP method/session/cookie behavior.
- Run focused tests for provider success, provider-success/session-retained fallback, fallback/query failures, A/B session isolation, already-unauthenticated semantics, and client confirmation/navigation.
- Run the auth-specific UI regression test.
- Use the local browser and development database with a disposable test Traveler: sign in, open `/dashboard`, sign out, confirm unauthenticated UI, refresh/open `/dashboard`, then verify User/Account/session counts.
- When feasible, use two independent browser cookie jars for the multiple-session case.
- Exercise repeated activation and safe error handling without recording credentials or session tokens.
- Run the real browser through the application-owned logout endpoint and verify Session A is absent while Session B remains valid.
- Run `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check`.

## Expected Files

- `apps/web/src/app/api/session/logout/route.ts`
- `apps/web/src/modules/auth/strict-logout.ts`
- `apps/web/src/modules/auth/strict-logout.test.ts`
- `apps/web/src/components/user-menu.tsx`
- `apps/web/src/lib/sign-out-confirmation.ts`
- `apps/web/src/lib/auth-ui-safety.test.tsx`
- `apps/web/package.json`
- `docs/stories/US-03-logout.md`
- `docs/ai-progress.md`

## Migration Impact

None. Existing Better Auth Session schema is sufficient.

## Environment Impact

None. Use only the existing development configuration; do not add credentials or environment variables.

## Implementation Sequence

1. Audit current UserMenu, catch-all route, Better Auth sign-out implementation, and dashboard server guard.
2. Add the strict server wrapper and focused revocation tests.
3. Update the existing client menu to call the wrapper while preserving pending/error and synchronous duplicate protection.
4. Perform local browser and development session lifecycle checks; clean up only disposable test records created by this story.
5. Run validation commands and record evidence. Keep status `IN PROGRESS` if a required acceptance case remains unproven.

## Acceptance Evidence

- **Root cause:** Better Auth 1.7.5 catches internal session lookup/deletion errors, clears the cookie, and can still return { success: true }. Its response alone did not prove that the current database Session had been revoked. The nextCookies plugin also applies headers when `auth.api.signOut` is called directly in a Next request scope.
- **Strict endpoint:** POST /api/session/logout resolves the session with `auth.api.getSession`, calls Better Auth's installed HTTP handler so the nextCookies hook does not mutate Next's cookie store early, and checks that exact Session ID in Prisma. If it remains, Prisma deletes only that ID and verifies again. It forwards the provider Set-Cookie headers only when the session is absent and the provider returned success. Confirmed persistence returns FAILED; infrastructure/query ambiguity returns retryable UNKNOWN with no cookie clearing. An unauthenticated request is a successful no-op.
- **Focused tests:** npm run test:auth-ui --workspace web passed 16/16, including T1–T6, a confirmed-still-present failure case, provider uncertainty, response validation, UI synchronous duplicate locking, and success-only navigation.
- **Development runtime:** Verified the configured endpoint ID matched the approved Neon development endpoint. Real browser signup created one Traveler User, one credential Account, and Session A. A separate Better Auth sign-in created Session B and verified it authenticated. The updated UserMenu showed its pending disabled state and navigated to `/` with Sign In visible after the strict route responded. Prisma confirmed A absent, B still present/authenticated, and one User plus one credential Account remained. Direct `/dashboard` access redirected to `/login?returnTo=%2Fdashboard`.
- **Cleanup:** Deleted the exact disposable User and verified zero matching User, Account, Session, and Verification rows. The temporary B-cookie state file and temporary smoke script were removed. No token, cookie, or password was emitted.
- **Optional Admin:** Not exercised; no safe development Admin account was available. Logout logic does not branch on role.
- **Scope:** No schema, migration, Better Auth version/config, unrelated auth flow, or environment value changed.
- **Validation:** `npm run env:generate`, `npm run test:auth-ui --workspace web` (16/16), `npm run check-types`, `npm run build`, and `git diff --check` all passed.

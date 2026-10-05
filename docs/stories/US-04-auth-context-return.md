# US-04 — Khôi phục ngữ cảnh sau xác thực

## Status

IN PROGRESS

## 2026-10-04 — Shared UserMenu navigation follow-up

- Manual US-13 test exposed a producer gap: Guest UserMenu used bare `/login`, so the existing login success resolver correctly chose its default `/dashboard` instead of the originating public page.
- Guest link now captures reactive pathname/query through shared `buildCurrentPageLoginHref`. Every target passes the unchanged canonical resolver; auth-page `/login` targets use plain `/login` to avoid a return loop. No destination-specific routing, external URL allowance, auth/session/role/API or pending-write behavior change. Local Suspense contains useSearchParams without forcing the shared header/page into a loading gate. Return types retain the literal login URL shape for Next typed routes.
- Added three tests for destination/shared-page capture, query roundtrip, login loop, unsafe fallback and default dashboard. Existing tests still verify successful Sign In/Sign Up call the resolver. Auth36/36, account18/18, destination59/59, check-types/build PASS; tracked/new-file whitespace checks PASS.
- Actual browser Guest opened a scoped VISIBLE destination with `?view=detail&from=menu`; rendered Sign In href and click produced `/login?returnTo=%2Fdestinations%2Fauth-navigation-smoke-20261004%3Fview%3Ddetail%26from%3Dmenu`. User entered development credentials; after SUCCESS, browser URL was exactly `/destinations/auth-navigation-smoke-20261004?view=detail&from=menu`, with the valid detail and authenticated UserMenu visible, not dashboard. Proof screenshot: `D:/KLTN/auth-navigation-evidence/login-return-success.png`. Scoped development destination/children cleaned with zero residue verified; temporary script removed. No existing destination or Admin profile edits. This follow-up does not change the prior story acceptance status; no commit/push.

## Epic

Authentication / User Access

## Goal / User Story

Là Khách vãng lai, tôi muốn quay lại đúng ngữ cảnh trước đó sau khi đăng nhập hoặc đăng ký để tiếp tục thao tác đang thực hiện.

## Product / Requirement References

- **Product Document:** §7.11 (`LD-08`), §4.4–4.5 (Guest, Traveler, Admin), §9.3 (authentication and authorization).
- **System Specification:** §2.2 (authentication) and §2.3 (authorization).
- **Requirement IDs:** `YCCN-03` (preserve Traveler context), `YCCN-04` (do not replay a pre-auth write), `NT-12` (return without replay), and `NT-13` (Admin does not inherit Traveler-only access).
- **Flow/screen:** `LD-08`, `MH-06`.

## Dependencies

- Better Auth email/password flow and trusted server session.
- `resolveAuthReturnTo`, `buildAuthLoginHref`, and `buildAuthModeHref` from US-01/US-02.
- US-03 confirmed logout behavior for cleanup of the disposable runtime account.

## Existing Implementation Audit

- `resolveAuthReturnTo` already rejects unsafe/external path forms and defaults invalid or repeated `returnTo` values to `/dashboard`.
- `buildAuthLoginHref` and `buildAuthModeHref` preserve a safe internal pathname, query string, and hash.
- `/login` parses mode and `returnTo`; Sign In and Sign Up navigate to the resolved context only from their confirmed Better Auth success callbacks. Mode switching retains the same context prop.
- `/dashboard` redirects guests to login with `/dashboard` as return context.
- The repository did not have a Traveler-only action producer, route/query/hash restore test coverage, or a no-replay test.

## In Scope

- Define and test the safe navigation-context contract.
- Add one minimal development-only route that captures its current location before requesting auth.
- Verify role through the trusted server session for the simulated Traveler-only action.
- Demonstrate that returning from auth leaves the action untouched until the user clicks again.
- Record focused tests and runtime acceptance evidence.

## Out of Scope

- A real Favorite, Trip, or other business mutation.
- Persisting a pending action or its request data.
- Changing Better Auth, auth/session schema, Product Document, UI design, or business modules.
- Granting Traveler permission to Admin.

## Context Contract

Only the internal pathname, query string, and hash needed for navigation may be carried in the `returnTo` query parameter. No form values, password/credential, request body, mutation payload, or pending action is captured. Sensitive credential/action-like query parameter names are rejected by the canonical resolver. No localStorage, sessionStorage, cookie, database, or global pending-write state is added.

## Security Rules

- Every captured/restored context passes through `resolveAuthReturnTo`.
- External, protocol-relative, malformed, repeated, control-character, and encoded path-separator inputs fall back to `/dashboard`.
- The current demo uses browser pathname/search/hash only; it never serializes a form or POST body.
- The demo route returns 404 in production.

## Role Rules

- Guest: may capture the current route and navigate to login.
- `TRAVELER`: may explicitly confirm the simulated action through a server action.
- `ADMIN` or no valid session: server rejects the simulated Traveler-only action. The action obtains role from Better Auth's server-resolved session, never from URL or client request data.
- No role is changed or inferred from authentication alone.

## Data Contract

- No business record is created by the demo.
- Better Auth remains the only identity/session store.
- The demo action accepts no parameters and reads only the trusted session role.
- No migration or schema change.

## Navigation Contract

- Guest action click → `/login?returnTo=<safe current pathname/query/hash>`.
- Sign In ↔ Sign Up mode changes retain `returnTo`; a refreshed deep-link auth page reads it again from the URL.
- Confirmed Sign In/Sign Up → exact safe pathname/query/hash.
- Auth failure remains on the auth surface; no pre-auth action runs.

## Write / Replay Semantics

The pre-auth click only navigates. Restoring the route does not invoke the demo server action. A Traveler must click again; only that new click reaches the server-side role check and displays the confirmation message. The simulated action does not persist data. No Favorite/Trip business endpoint exists in this story, so there is no real write or idempotency key to create.

## Error / Recovery

- Invalid return context → `/dashboard` fallback.
- Invalid/expired session on the simulated action → capture current route and request login again.
- Admin → safe forbidden feedback; do not route as a Traveler or change role.
- Auth provider failure → existing safe auth error handling; leave `returnTo` intact and do not run the action.
- Unexpected demo action error → generic UI feedback without exposing provider/session details.

## Acceptance Criteria

1. **AC-01 Capture context:** a guest action captures the current safe pathname/query/hash.
2. **AC-02 Sign in restore:** successful Traveler sign-in returns to the exact context.
3. **AC-03 Sign up restore:** successful Traveler signup returns to the exact context.
4. **AC-04 Mode switch:** Sign In → Sign Up → Sign In retains the same context.
5. **AC-05 Refresh/deep link:** a refreshed `/login?returnTo=...` retains the context.
6. **AC-06 Invalid context:** unsafe, malformed, encoded-separator, or repeated return target falls back to `/dashboard`.
7. **AC-07 No replay:** auth return does not call the simulated action; a second explicit click does.
8. **AC-08 No payload persistence:** no pending write/action/body is serialized or stored in browser/database state.
9. **AC-09 Traveler:** trusted `TRAVELER` role can explicitly confirm the simulated action.
10. **AC-10 Admin:** trusted `ADMIN` role is rejected; deterministic role test is accepted when no safe runtime Admin account is available.
11. **AC-11 Failed auth:** existing sign-in/signup failure handlers remain on auth with `returnTo` intact.
12. **AC-12 Missing/expired session:** protected action is not confirmed; the guest path captures context and requests authentication again.

## Test Plan

- `npm run test:auth-ui --workspace web`: canonical path/query/hash builder and resolver, unsafe/repeated inputs, mode/deep-link refresh, login page parsing, confirmed-success navigation, auth-failure context, no replay/persistence, and trusted role checks.
- Browser smoke against Neon development: demo context → login → mode switch → signup/sign-in → exact route/hash restore → verify no action until second click → logout and cleanup.
- `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check`.

## Expected Files

- `apps/web/src/lib/auth-return-to.ts`
- `apps/web/src/lib/auth-context-demo.ts`
- `apps/web/src/app/auth-context-demo/{page.tsx,auth-context-demo.tsx,actions.ts}`
- `apps/web/src/lib/auth-context-return.test.ts`
- `apps/web/package.json`
- `docs/stories/US-04-auth-context-return.md`
- `docs/ai-progress.md`

## Migration Impact

None. Existing schema remains unchanged.

## Environment Impact

None. Smoke test uses the existing development environment and a disposable Traveler only.

## Acceptance Evidence

- **Focused evidence:** AC-01–AC-06 have capture/resolver/mode/deep-link tests; AC-07 has source checks plus a deterministic counter proving the simulated action stays at zero through auth return and increments only after a Traveler click; AC-08 has source checks and the existing POST-form test; AC-09/AC-10/AC-12 have trusted-role/session checks; AC-11 has failure-path source checks. The auth suite passes 25/25.
- **Build checks:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` pass.
- **Browser correction and smoke:** The earlier browser-block report was incorrect: the existing tab was an unsupported `data:` connection-error document; a normal HTTP tab worked. A disposable Traveler signed up and signed in via Enter, returned to the exact demo pathname/query/hash, saw no confirmation until a second explicit click, and logged out. Two logout → fresh demo navigations worked in the testing browser. Development DB verification found one Traveler, one credential Account, and zero remaining Sessions after logout; scoped cleanup confirmed zero User/Account/Session/Verification rows. The temporary script was removed.
- **Reported Chrome freeze:** User evidence showed a completed document with loaded chunks, repeated HMR connections, and no hydration/session-fetch trace. Installed Next 16.3.8's one-shot React debug stream can be lost on the initial HMR connection; reconnect does not replay it, leaving Flight decoding pending before auth requests begin. Disabled `experimental.reactDebugChannel`, preserving HMR. Actual installed-framework regression tests prove the lost-stream wait/no-replay mechanism. Cold guest demo navigation worked after the change, and the user confirmed the previously failing logout → paste URL flow now works without F5. Full story status remains `IN PROGRESS` pending the rest of its acceptance review; this fix does not claim every story scenario was re-run.
- Runtime Admin behavior is not proven; trusted-session role helper tests confirm `ADMIN` is rejected.

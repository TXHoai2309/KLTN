# US-02 — Đăng nhập hệ thống

## Status

IN PROGRESS

## Epic

Authentication / User Access

## Owner

N/A

## Goal / User Story

Là Du khách hoặc Quản trị viên, tôi muốn đăng nhập vào hệ thống để sử dụng các chức năng phù hợp với vai trò của mình.

## Outcome

Better Auth xác thực credentials của tài khoản hiện có, tạo session cho đúng User và cung cấp identity/role từ dữ liệu đáng tin cậy. Đăng nhập chỉ thiết lập identity/session; quyền truy cập từng chức năng vẫn do server kiểm tra.

## Source References

- **Product Document:** §4.4–4.5 (Du khách and Quản trị viên); §7.11 (`LD-08`); §8.6 (`MH-06`); §9.3 (authentication and authorization); §13.6 (authentication acceptance).
- **System Specification:** §2.2 (authentication) and §2.3 (authorization).
- **Requirement IDs:** `YCCN-01` (valid account login), `YCCN-02` (role-aware access), `YCCN-03` (preserve Traveler context), `YCCN-04` (do not replay pre-auth writes), `NT-09` (Traveler login), `NT-10` (Admin login/admin functionality), `NT-12` (return without replay), and `NT-13` (Admin does not implicitly receive Traveler-only access).
- **Flow/screen:** `LD-08`, `MH-06`.
- **Figma:** The local Figma file has no confirmed frame locator available in this contract. Consult `MH-06` during the UI task; this story does not invent visual details.

## Dependencies

- Existing Better Auth email/password setup and `/api/auth/[...all]` handler.
- Existing Prisma `User`, `Account`, and `Session` models, including server-owned `User.role`.
- US-01's `returnTo` resolver and the available Traveler/Admin test accounts.
- Admin content functionality is not present in this repository. This story verifies Admin authentication and role preservation; it does not create an Admin landing page or feature.

## In Scope

- Audit and harden the existing Better Auth email/password sign-in path rather than add a parallel auth endpoint.
- Authenticate an existing `TRAVELER` or `ADMIN` account and establish a Better Auth session.
- Preserve role from the trusted User/session data; do not accept role or authorization input from the client.
- Define login validation, provider failure, session, and safe return-context behavior.
- Verify that login does not create another User or credential Account and that invalid credentials do not establish a valid session.

## Out of Scope

- Password reset/forgot password, MFA, OAuth/social login, profile editing, or registration behavior owned by US-01.
- Implementing logout behavior (logout is inspected only to describe the existing session lifecycle).
- Role management, permission editor, Admin creation/bootstrap, or Admin content features.
- Traveler business features, custom `/api/login`, custom auth response envelopes, or unrelated dashboard/UI redesign.

## Business Rules

- A valid email/password pair authenticates the existing account. Login must not create a new User or credential Account.
- Better Auth is the authentication boundary. Do not add a custom `/api/login` flow or wrap its response in the shared generic API envelope.
- `role`, permissions, Admin flags, and authorization scope are never accepted as client authority. Role is read from the authenticated User/session.
- Successful authentication does not itself authorize every feature. Authorization and ownership remain server-enforced.
- An authentication started from a Traveler-only context may return to its safe internal path when available. Preserve navigation context only; never preserve or automatically replay a pending write.
- An Admin can authenticate and retain the `ADMIN` role. Admin does not implicitly gain Traveler-only privileges. No Admin route exists in the current repository; do not invent `/admin` in this story.

## Roles / Authorization

- **TRAVELER:** may authenticate; role-aware server authorization may grant Traveler-authorized and public functionality.
- **ADMIN:** may authenticate; role-aware server authorization may grant Admin-authorized and public functionality, but not Traveler-only functionality by implication.
- The current dashboard checks for a session only. No role-specific Admin/Traveler feature guard or Admin landing route was found. Future feature stories must enforce their own authorization on the server.
- A role shown in client session state is for UI use only; it is not a substitute for server authorization.

## Ownership Rules

N/A. Login creates no domain-owned record. It establishes an identity/session; ownership checks belong to the relevant business feature.

## UX / UI Contract

- Use the existing sign-in mode in the `MH-06` auth surface. The current `SignInForm` validates email format and requires a password of at least 8 characters in the client form. This is the current UX rule; Better Auth's sign-in endpoint accepts a string password and verifies it against the stored credential. Signup's password rule must not be described as a server-side login rule.
- The sign-in form sends only email/password, validates required fields, valid email format, and the existing minimum-eight-character client password rule. It shows pending state while signing in and allows a retry after failure.
- Map Better Auth's `INVALID_EMAIL_OR_PASSWORD` to one safe credentials-level message. Show a generic message for other provider/network failures, and do not expose provider/database internals.
- Show success only from Better Auth's success callback; keep the existing safe `returnTo` navigation behavior.
- `/login` opens Sign In. The user can switch to Sign Up and back without losing `returnTo`.
- Keep the form usable at widths of 360px and above without horizontal scrolling. No exact Figma frame styling is prescribed here.
- Keep the form usable at widths of 360px and above without horizontal scrolling. No exact Figma frame styling is prescribed here.

## Data Contract

- Sign-in looks up the existing User by email (Better Auth lowercases the lookup email) and verifies the existing `credential` Account password. A successful login does not create or modify the User or credential Account.
- On successful credential verification, Better Auth creates a new `Session` row for that User. The current Prisma session fields are `id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, and `userId`; `token` is unique and `userId` is indexed.
- Better Auth's additional `User.role` field is `TRAVELER | ADMIN`, default `TRAVELER`; the server config marks it `input: false`. The returned role must reflect the stored account, not request data.
- Passwords and password hashes are never returned to application UI or recorded in story/test output. Session token values and secrets are not logged or documented.
- No schema or migration change is expected.

## API Contract

- Current UI calls `authClient.signIn.email({ email, password })`.
- Better Auth handles `POST /api/auth/sign-in/email` through the existing `apps/web/src/app/api/auth/[...all]/route.ts` adapter. The current application request contains only:

  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```

- Better Auth's endpoint also supports provider options such as `callbackURL` and `rememberMe`, but this form sends neither. `returnTo` is resolved and used for client navigation after confirmed success; do not add `callbackUrl`, `next`, or `redirectTo` parameters.
- The client uses `authClient.useSession()` for current client session state. Server-rendered protected pages use `auth.api.getSession({ headers })`; `/dashboard` redirects unauthenticated visitors with `buildAuthLoginHref`.
- Consume Better Auth's result directly. Do not use `{ success: true, data: ... }` or add a custom login response protocol.

## Session Contract

- Better Auth verifies the credential Account, creates a database-backed session, and sets its session cookie on successful sign-in. The cookie is provider-managed, `HttpOnly`, and uses `SameSite=Lax`; `Secure` follows the configured base URL/protocol. Do not expose its value.
- The repository does not configure session lifetime. In installed Better Auth `1.7.5`, the provider default is 7 days; the provider also uses its default 24-hour session update age. Treat these as provider defaults, not project-owned policy.
- The browser reads current session state through Better Auth (`authClient.useSession()`); server code reads it from request headers via `auth.api.getSession`. A missing, invalid, revoked, or expired session resolves as unauthenticated.
- The existing UserMenu calls `authClient.signOut()`. Better Auth deletes the current session record and clears its cookie; the current UI navigates to `/` on sign-out success. Logout changes are out of scope.
- The protected `/dashboard` page redirects when `getSession` returns no authenticated User. No existing Admin-only route is present.

## Error / Recovery

Application-visible outcomes (not new Better Auth provider codes):

- **`SUCCESS`:** Better Auth confirms sign-in and the session is available for the existing User.
- **`VALIDATION_ERROR`:** Local form validation rejects a malformed email or missing/short password; show field feedback and do not submit.
- **`INVALID_CREDENTIALS`:** Better Auth rejects a nonexistent email or wrong password with the same generic invalid-email/password outcome; no valid session is established. Avoid account enumeration.
- **`AUTHENTICATION_FAILED`:** Another known authentication/session-creation failure; do not report success, and show safe user-facing feedback.
- **`UNAUTHENTICATED_SESSION`:** A missing, invalid, revoked, or expired session grants no protected access; redirect to login or require authentication.
- **`UNKNOWN` (transport uncertainty only):** If the request was sent but the client cannot determine whether Better Auth completed it, do not claim success or definitive failure. Re-read session state on the next load before asking the user to retry. This is not a shared mutation `operationStatus` response; no custom provider error code is added.

Do not reveal whether an email exists more than necessary. The current sign-in form displays Better Auth's error message/status text; Tasks 3–5 must verify that credential failures remain generic and unexpected failures do not expose internals.

## Write Semantics / Idempotency

Login creates a session but does not use the generic `idempotency_record` mutation helper. It must not create another User or Account. Each independent successful sign-in may establish its own session. On an uncertain transport result, do not automatically replay sign-in; reconcile current session state first. No business write is replayed after authentication, and login has no business mutation payload to retain.

## External Services

Better Auth and the existing Prisma/Neon database. No new external service is introduced.

## Acceptance Criteria

- [x] **AC-01:** Given valid credentials for an existing `TRAVELER`, when submitted through the sign-in form, then Better Auth authenticates that existing User and establishes a valid session.
- [ ] **AC-02:** Given valid credentials for an existing `ADMIN`, when submitted through the sign-in form, then Better Auth authenticates that existing User and the resulting trusted session retains `role = ADMIN`.
- [x] **AC-03:** Given a successful login, then exactly the existing User and credential Account are used; login creates no duplicate User or Account and creates a session for that User.
- [x] **AC-04:** Given an unauthenticated client with a wrong password or unregistered email, then authentication fails with a generic credential outcome and no new valid session is established.
- [x] **AC-05:** Given missing or malformed input, then client validation prevents submission and shows usable field feedback.
- [x] **AC-06:** Given a crafted sign-in request containing `role`, permissions, an Admin flag, or authorization scope, then those fields do not set the authenticated role or grant access.
- [x] **AC-07:** Given a valid `returnTo`, then confirmed login returns to that safe internal path/query/hash; missing, malformed, repeated, or external values fall back to `/dashboard`.
- [x] **AC-08:** Given login from a Traveler-only context, then authentication preserves safe navigation context only and does not replay the original write.
- [x] **AC-09:** Given an Admin session, then it does not implicitly authorize a Traveler-only feature; protected features enforce role authorization on the server. This contract does not add a feature route or guard where none exists.
- [x] **AC-10:** Given a missing, invalid, revoked, or expired session, then protected access is denied and `/dashboard` redirects to the safe login route.
- [x] **AC-11:** Given an uncertain transport outcome, then the UI does not claim confirmed success/failure or automatically replay the request before checking session state.
- [x] **AC-12:** Given supported widths of 360px and above, then the sign-in UI supports loading, validation/error, and success states without horizontal scrolling.

## Test Plan

- Verify existing Traveler and Admin credentials; inspect that the matching existing User and Account remain singular and that a valid Session is associated with the existing User.
- Verify wrong password and unknown email produce the generic credential failure and no new valid Session; verify malformed email and short/missing password validation.
- Verify crafted role/permission input cannot alter trusted role, and Admin role is present in the authenticated User/session.
- Verify valid and invalid `returnTo`, invalid/expired session behavior, no pre-auth write replay, and login UI at 360px+.
- Check session cookie creation, database Session row, and logout invalidation using the provider's existing flow. Remove test credentials and session data after runtime tests.
- No auth-specific permanent test runner was found during the US-01 contract review; use the repository's available checks and disposable smoke scripts only if needed, then remove them.

## Expected Modules / Files

- Existing sign-in form and mode: `apps/web/src/components/sign-in-form.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/auth-mode-switcher.tsx`.
- Existing Better Auth client/server and route boundary: `apps/web/src/lib/auth-client.ts`, `apps/web/src/lib/auth-return-to.ts`, `apps/web/src/services.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`, `packages/auth/src/index.ts`.
- Session/role schema: `packages/db/prisma/schema/auth.prisma`.
- No separate login route, Admin landing page, or new auth module is expected.

## Migration Impact

None expected. The User role and Better Auth Session models already exist.

## Environment Impact

None expected.

## Implementation Sequence

1. **Task 1 — [CONTRACT] Chốt dữ liệu đăng nhập, session và response sau xác thực:** this story records the audited contract; no application implementation is part of Task 1.
2. **Task 2 — [BE/API] Implement đăng nhập và tạo session:** audit/harden the existing Better Auth email sign-in endpoint and session behavior; do not add a custom login endpoint.
3. **Task 3 — [FE] Xây dựng giao diện đăng nhập, loading và thông báo lỗi:** audit/harden the existing sign-in form and states against `MH-06`; do not redesign unrelated UI.
4. **Task 4 — [FE/API] Kết nối giao diện đăng nhập với Better Auth:** verify the existing `authClient.signIn.email` integration, safe return context, and confirmed-success navigation.
5. **Task 5 — [TEST] Kiểm thử đăng nhập thành công, sai thông tin và session không hợp lệ:** verify role, identity/account reuse, session lifecycle, failure states, safe return, and responsive behavior.

Significant sign-in functionality already exists from the Better Auth foundation and US-01 work. Tasks 2–5 should audit and harden it; rewrite only if verification identifies a specific defect.

## Acceptance Evidence

Tasks 2–5 evidence is recorded below. Overall status remains `IN PROGRESS` because AC-02 has no safe development Admin credentials for runtime verification.

## Task 3 Sign-In UI Evidence

- **Existing behavior retained:** Kept the current auth card, layout, email/password-only request, Better Auth success callback, `returnTo` resolution, pending button label/disable behavior, and accessible password visibility toggle.
- **Validation and errors:** Empty email/password show required-field messages; malformed email and passwords shorter than eight characters show field-specific Vietnamese feedback. `INVALID_EMAIL_OR_PASSWORD` maps to “Email hoặc mật khẩu không chính xác.”; all other provider errors and rejected network requests map to “Không thể đăng nhập lúc này. Vui lòng thử lại.” Raw provider text is not displayed. Editing either field clears the form-level error.
- **Loading and accessibility:** Submit is disabled while the request is pending and shows “Đang đăng nhập…” with `aria-busy`. Task 5 found that Enter could still submit in parallel; a synchronous guard now blocks that path. Field errors are linked with `aria-describedby` and announced; the form-level error uses `role="alert"`. Email/password labels, types, autocomplete, and keyboard-operable show/hide control are retained.
- **Mode and return context:** Direct `/login` now starts in Sign In. The existing switch still exposes Sign Up; `returnTo` is passed unchanged to either mode.
- **Browser smoke:** On `/login?returnTo=%2Fdashboard%3Ffrom%3Dregister`, direct navigation showed Sign In. Empty submit displayed separate required messages and made no request; malformed email and a short password displayed the expected field messages. A valid-format attempt with a fabricated, unregistered email returned Better Auth's 401 `INVALID_EMAIL_OR_PASSWORD` and showed only the safe credentials message. The request displayed the disabled “Đang đăng nhập…” button while pending. Editing after the error cleared it, left retry enabled, and a second failed attempt preserved the entered fields. No signup was submitted, so the probe did not create a User or Session.
- **Generic failure and recovery:** With the local dev server stopped after the page loaded, submitting the same fabricated credentials displayed “Không thể đăng nhập lúc này. Vui lòng thử lại.” in the form and preserved the return URL. Restarting after that interruption exposed partial `.next/dev` output briefly (including an initial auth-route 404 and incomplete generated types). After a clean warm start, `GET /api/auth/get-session` returned 200 and retrying the same fabricated credentials returned 401 with the safe credentials message. No backend source was changed; Task 4 can recheck a normal fresh dev startup.
- **Mode, password, and accessibility:** Sign In → Sign Up → Sign In worked, and the full `returnTo` query remained unchanged. The show/hide button changed input type `password` → `text` → `password` while keeping the field value present; Enter activated it by keyboard. Email/password labels, `type`, `autocomplete`, required semantics, field-error descriptions, `role="alert"`, and `aria-busy`/disabled pending semantics were inspected.
- **Responsive:** At 360px, document width and scroll width were both 360px, the card was 332px wide, and both fields were 288px wide. At 768px, card/field widths were 480px/398px with no horizontal overflow. At 1280px, card/field widths were 460px/368px with no horizontal overflow. The generic form error fit within the 360px content width without horizontal scrolling.
- **Scope:** No signup logic, Better Auth server/backend behavior, database schema, migration, environment configuration, or unrelated module changed. At the Task 3 handoff, the story remained `IN PROGRESS` for Tasks 4–5.

## Task 2 Backend Evidence

- **Backend audit:** The existing Better Auth config enables email/password; the existing catch-all Route Handler delegates to Better Auth. Installed Better Auth 1.7.5 looks up the existing User and credential Account, verifies the password, and creates a Session only after successful verification. No User or credential Account is created or changed by the sign-in path. No new endpoint, response envelope, custom session system, schema change, or migration was needed.
- **Trusted role:** `User.role` remains server-owned (`input: false` in Better Auth; `TRAVELER | ADMIN` in Prisma). The installed sign-in request schema has only email/password plus provider options; runtime login with crafted `role: "ADMIN"`, `admin: true`, and permissions left the stored and resolved Traveler role unchanged. Session role resolved from stored User data through both `get-session` and server `auth.api.getSession`.
- **Traveler runtime smoke on Neon development:** A disposable account was created through Better Auth, its signup session was signed out, then valid credentials were sent through the installed Better Auth handler. Login set the provider session cookie; `get-session` and server `getSession` resolved the same `TRAVELER` User. The existing User count and credential Account count remained one. A second independent successful login produced a second active Session for the same User; both sessions are permitted by current provider behavior.
- **Failures:** Wrong password and unknown email both returned HTTP 401 with the same `INVALID_EMAIL_OR_PASSWORD` code; malformed email returned HTTP 400. Wrong credentials did not create a new session or change User/Account counts; unknown email created no User. Better Auth's inspected server source uses the same generic credential error for missing User and incorrect password.
- **Invalid/revoked session:** A fabricated invalid cookie resolved to unauthenticated through both the Better Auth `get-session` handler and server `auth.api.getSession`. A valid temporary session was then deleted from the development DB; its previously issued cookie also resolved unauthenticated through both lookups. Dashboard's existing server guard redirects when `getSession` returns no User.
- **Identity/session behavior:** Login left the existing User email and role and credential Account count unchanged. It adds independent Session rows; it does not enforce a one-session-per-account rule. The repository does not override session lifetime; installed Better Auth 1.7.5 supplies its 7-day default and 24-hour update age.
- **Admin:** No safe configured development Admin credentials were available. The server path is role-neutral: it looks up the stored User's credential Account and returns that User/session, while the role is loaded from the User. Admin runtime login remains pending Task 5 evidence; no user was promoted or created for this test.
- **Cleanup:** The disposable Traveler User and its cascading Account/Session rows, plus matching Verification rows, were removed and cleanup was verified. No Admin session was created. The temporary smoke script was removed.
- **Code/migration:** No concrete backend gap was found; no application code, Prisma schema, migration, bootstrap behavior, or environment value was changed. Task 2 reuses the existing Better Auth flow.
- **Remaining at Task 2 handoff:** Tasks 3–5 remained; the runtime smoke called the Better Auth handler directly and did not exercise the browser form. Admin runtime evidence is pending due to unavailable safe credentials.

## Task 4 Better Auth Integration Evidence

- **Request path:** `SignInForm` calls the canonical `authClient.signIn.email({ email, password })`. The frontend Better Auth client infers server-owned additional fields; the sign-in payload contains no role, Admin flag, permission, or authorization scope. Better Auth sends the request through `POST /api/auth/sign-in/email`, handled by the existing `toNextJsHandler(auth)` route; `services.ts` supplies the Better Auth server and Prisma client. No custom `/api/login` route or project API envelope is involved.
- **Success and session:** Navigation and the success toast remain inside Better Auth's confirmed `onSuccess` callback. No cookie or User/Account is manually created or changed. A disposable Traveler registered and signed in through the UI; `/dashboard` rendered the authenticated name. On Neon development, the matching User had `role = TRAVELER`, one credential Account, and one Session after successful login. The role came from the stored User and server configuration (`input: false`), not form or route state.
- **Unknown transport recovery:** Found that a rejected sign-in request previously showed retry copy without checking whether the session had been established. The catch path now calls the canonical `authClient.getSession()` before deciding what to show: an authenticated session follows the safe `returnTo`; a confirmed unauthenticated result gets the generic retry message; a failed session lookup gets a separate safe “cannot determine session” message asking the user to open `/dashboard` to check the session before retrying. It does not automatically repeat sign-in or expose provider details.
- **Credential failure:** Wrong password through the real form stayed on `/login` and showed only “Email hoặc mật khẩu không chính xác.”. Opening `/dashboard` afterward redirected to `/login?returnTo=%2Fdashboard`, confirming the failed sign-in did not grant protected access. No User or credential Account was created by login.
- **Return context:** A successful login with `/login?returnTo=%2Fdashboard` navigated to `/dashboard`. An external `returnTo=https://example.com` also ended at `/dashboard`. Direct checks of the existing resolver passed 11 cases: safe path/query/hash; external and protocol-relative URLs; `javascript:` and `data:`; raw backslash; encoded slash/backslash; malformed percent escape; and duplicate `returnTo` values. Sign In → Sign Up → Sign In preserved the valid `returnTo` query.
- **Loading and duplicate submit:** The pending button remains disabled and marked `aria-busy`; the installed TanStack Form checks `canSubmit` against `isSubmitting` before invoking the form submit callback, preventing a concurrent Enter submit from taking a second sign-in path. Login has no idempotency record and no automatic replay.
- **Already-authenticated `/login`:** The current page renders the sign-in form and has no server session redirect. This was observed while the temporary session was active and confirmed by `login/page.tsx`; no broad redirect was added because US-02 does not require one.
- **Role and routes:** The Traveler role was confirmed from the development User row and sign-in request shape. No Admin landing route exists, and no safe development Admin credentials were available; no Admin was created or modified. Admin runtime authentication remains for Task 5.
- **No write replay:** Repository search found no auth-context storage of a pending write, POST replay, or retry-on-login. `returnTo` carries navigation context only.
- **Development startup:** The normal dev server was already running on port 3001. `GET /login` and anonymous `GET /api/auth/get-session` both returned 200, and the real sign-in route returned the expected safe invalid-credential outcome. The transient cold-start 404 from the earlier interrupted server was not reproduced; this task did not interrupt the existing process.
- **Cleanup and scope:** The smoke used only the verified Neon development endpoint. Sign-out removed the active Session; a scoped cleanup removed the disposable User, Account, Session, and any matching Verification rows and verified all counts were zero. Temporary scripts were deleted. No schema, migration, environment value, Better Auth server configuration, registration logic, Admin behavior, or unrelated module changed.
- **Validation:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. Overall story remains `IN PROGRESS`; Task 5 remains.

## Task 5 Final Acceptance Evidence

- **Status:** Tasks 1–5 verification is complete, but the story remains `IN PROGRESS`; AC-02 is not proven because the development database has no Admin and the initial Admin environment variables are not configured. No account was promoted, created as Admin, or reset to obtain test credentials.
- **Traveler login and identity:** Neon development was verified against the supplied endpoint before database access. A controlled Traveler registered through the real UI, then logged in through the real sign-in form. The dashboard recognized that User; the database showed one `TRAVELER` User, one credential Account, and a Session for that User. Successful login did not add a User or credential Account.
- **Credential failures and validation:** Wrong password and unknown email both displayed exactly “Email hoặc mật khẩu không chính xác.” with no provider/database detail. With the client unauthenticated, neither created a Session; the unknown email created no User or Account. Empty fields, malformed email, and a password shorter than eight characters showed field feedback and prevented submission. Enter triggered the same validation.
- **Trusted role:** A temporary same-origin request form sent `role: ADMIN`, `role: TRAVELER`, `admin: true`, permissions, and authorization scope with valid Traveler credentials. Better Auth returned HTTP 200 and a session role of `TRAVELER`; the stored role and single credential Account were unchanged. The temporary page was removed.
- **Sessions:** The valid sign-in session allowed `/dashboard`; sign-out removed the current Session and a subsequent dashboard request redirected to `/login?returnTo=%2Fdashboard`. A fake session cookie resolved to no session. For expiry, only Sessions belonging to the controlled temporary Traveler were moved into the past; the browser was redirected from `/dashboard` to login. Multiple successful logins coexisted as independent Sessions. The `/login` page did not invalidate an existing Session or alter the User/Account.
- **Concurrent submit bug fixed:** Runtime testing showed Enter could submit again while the button was pending and created an extra Session. `sign-in-form.tsx` now guards the submit handler synchronously. Repeating the pending click + Enter test showed a disabled “Đang đăng nhập…” button with `aria-busy=true`, blocked the second click, and increased the Session count by exactly one for the first request.
- **Return context and replay:** A successful login preserved `/dashboard?tab=plan#section`; external, protocol-relative, and nested-encoded separator targets fell back to `/dashboard`. Sixteen direct resolver cases passed, including malformed, repeated, script/data, and encoded slash/backslash values. Sign In → Sign Up → Sign In preserved `returnTo`. Repository search found no pending write storage or automatic POST replay; the repository has no Traveler write feature to exercise.
- **UNKNOWN:** Network-level response-loss injection could not run against the shared server because the temporary proxy did not hydrate the Next page and was stopped. A deterministic harness tested the actual `recoverSignInAfterTransportFailure` helper used by the form: existing session → authenticated, confirmed absence → unauthenticated, lookup error/throw → unknown; the helper looked up once and has no sign-in retry path. The UI maps unknown to safe guidance and never routes as success.
- **Admin authorization scope:** No Admin session was available, and the repository has no Traveler-only business route or role-inheritance guard. No role-based access is inferred from a client value. End-to-end authorization for such a feature remains with its future feature story; no route was fabricated.
- **Responsive/accessibility:** At 360px, document width stayed 360px; the card, inputs, submit button, and password toggle measured 332px, 288px, 288px, and 36px. Required/error text fit without horizontal scrolling; email/password labels, types, autocomplete, `aria-invalid`, `aria-describedby`, alert roles, keyboard password toggle, Enter handling, and pending semantics were checked. The in-app viewport stayed at 360px when asked for larger sizes; unchanged CSS retains the Task 3 measurements at 768px (480px card/398px fields) and 1280px (460px/368px), both without overflow.
- **Temporary proxy incident:** The unhydrated local proxy caused one browser submission to fall back to GET, briefly placing only the generated disposable test credential in a local URL/tool trace. The proxy was stopped and removed, its tab was closed, and all associated development test rows were deleted. No production database or external destination was involved; no environment secret or credential was added to repository files.
- **Cleanup:** Scoped cleanup on the verified development endpoint deleted 7 Sessions, 1 Account, 1 User, and 0 Verification rows. A follow-up query confirmed zero Users remain under the test prefix. All temporary scripts and the temporary role-tampering page were removed.
- **Code changes:** Added the small sign-in recovery helper, added a synchronous submit guard, and hardened `returnTo` against nested encoded path separators and malformed nested percent escapes found by the resolver regression cases. No schema, migration, environment value, Better Auth server config, or unrelated module changed.
- **Remaining blocker:** AC-02 only. No safe configured Admin credentials or existing development Admin were available, so Admin login and trusted `ADMIN` session role remain unproven.
- **Validation:** `npm run env:generate`, `npm run check-types`, and `npm run build` passed. `git diff --check` passed with only expected LF-to-CRLF normalization warnings. No environment/generated files or temporary test scripts remain; no commit or push was made.

## Open Questions

- No Admin landing/feature route currently exists. `NT-10`'s Admin-feature access portion must be verified by the relevant Admin feature story; this story verifies Admin authentication and role preservation only.
- No Admin credentials are configured for development and the database currently has no Admin. Do not reset or create an arbitrary Admin to close AC-02; use the project's approved bootstrap credentials when available.
- The local Figma source has no confirmed frame locator available here. No visual details are inferred from it.

## Handoff Notes

Tasks 1–5 verification is complete. Overall story status is `IN PROGRESS` because AC-02 lacks safe Admin credentials for runtime verification; all other criteria have evidence recorded above. No commit or push was made.

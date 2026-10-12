# AI and developer progress

Append a new entry for each meaningful work session. Keep prior entries as handoff history; correct them only when documenting why a previous statement was wrong. Do not include secrets, connection strings, or credentials.

## 2026-10-02 — EN-01 foundation handoff

- **Branch:** `TXH` observed at documentation baseline creation. Team roles are `TXH` feature work → `dev` integration/testing → `master` production/stable; branch promotion is manual.
- **Task:** Establish the project handoff baseline and record EN-01 as complete.
- **Completed foundation:**
  - Next.js full-stack App Router with a Vercel web service and a thin `/api/health` Route Handler.
  - Turborepo/npm workspace packages: `apps/web`, `packages/auth`, `packages/db`, `packages/config`, and `packages/ui`.
  - Better Auth email/password, Traveler/Admin role storage, public signup locked to Traveler, and a server-side Admin bootstrap command.
  - Prisma/Neon PostgreSQL auth models and migrations; PostGIS and pgvector extensions are enabled.
  - Shared success/error API response, `AppError`, error handlers, and mutation `SUCCESS` / `FAILED` / `UNKNOWN` contract with idempotency storage and replay/conflict protection.
  - Varlock schema/example/local-env convention and Vercel deployment configuration.
- **Implementation boundary:** The inspected repository has only basic home/login/dashboard/auth and health behavior plus a `system` module. Destination, culture/RAG, favorites, trip planning, Constraint Validator, in-trip, and admin-content business modules are not implemented. OpenAI and Google Routes integrations are not present in code; PostGIS/pgvector domain use is also pending.
- **Environment topology:** Local → Neon development; Vercel Preview → Neon development; Vercel Production → Neon production. Preview variables must work for preview/feature branches. No endpoint, secret, or credential is recorded here.
- **Handoff note:** This entry records the existing EN-01 foundation. The later developer-documentation baseline is recorded in the next entry.
- **Database/migrations:** Existing repository migrations cover auth, PostGIS/pgvector extensions, idempotency records, and user roles. No schema change was made for this documentation task.
- **Validation:** Documentation task validation is recorded in the task handoff; rerun typecheck/build and `git diff --check` after future implementation changes.
- **Known issue:** The supplied local Figma `.fig` file was not inspectable in this environment. UI details must be consulted in Figma separately.
- **Next:** Prepare the US-01 contract before implementation. Do not start US-01 implementation from this handoff alone.

## 2026-10-02 — Developer documentation baseline

- **Branch:** `TXH`
- **Story/task:** Project documentation and governance handoff.
- **Completed:** Added root agent rules, source hierarchy, condensed product contract, current architecture, target flows, UI baseline caveat, EN-01 acceptance, workflow/environment guides, story lifecycle/templates, roadmap, changelog, and this progress file. Updated README to remove the separate web/server and `db:push`-as-main-workflow guidance.
- **Files changed:** `AGENTS.md`, `README.md`, and files under `docs/`.
- **DB/migration changes:** None.
- **Validation performed:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. Required documentation files and relative Markdown links were checked; a credential-pattern scan of the documentation changes found no matches.
- **Deployment/smoke result:** Not applicable; no application behavior changed.
- **Known issues:** Local Figma `.fig` file remains uninspected; Figma must be consulted separately for UI details.
- **Decisions:** Kept the old NestJS Architecture statements historical and clearly separated repository implementation from future product requirements.
- **Next step:** Prepare and review the US-01 story contract before implementing business behavior.

## 2026-10-02 — US-01 signup contract (Task 82)

- **Story:** Created `docs/stories/US-01-register-traveler.md`; status `READY`.
- **Key decisions:** Use the existing Better Auth signup request (`name`, `email`, `password`); public signup assigns `TRAVELER` server-side; duplicate safety relies on Better Auth/database identity constraints, not the generic idempotency wrapper; success requires provider confirmation; return to safe internal context without replaying the triggering write.
- **Implementation status:** Documentation contract only; no application code implemented.
- **Next:** Task 83 — review/harden/complete the existing Better Auth Traveler signup foundation.

## 2026-10-02 — US-01 signup backend (Task 83)

- **Story:** Updated `docs/stories/US-01-register-traveler.md` to `IN PROGRESS`; Tasks 84–86 remain.
- **Backend change:** Added server-side minimum name-length validation through Better Auth `user.validateUserInfo` for email/password user creation. Kept the existing `role: input:false`, `TRAVELER` defaults, unique email constraint, and Better Auth signup route.
- **Runtime verification:** Neon development smoke passed for valid signup (one Traveler User, credential Account, usable session), crafted Admin input (role stayed `TRAVELER`), exact and case-variant duplicates (HTTP 422; no duplicate), one-character name (HTTP 403; no User), invalid email/password and missing name (HTTP 400; no User). All temporary User/Account/Session rows were cleaned up.
- **Migrations:** None; existing schema constraints were sufficient.
- **Implementation scope:** No frontend, return-context, or other business module changes. Temporary smoke script removed.
- **Next:** Task 84 — build the signup UI and client validation.

## 2026-10-02 — US-01 signup form (Task 84)

- **Story:** Added Task 84 evidence to `docs/stories/US-01-register-traveler.md`; status remains `IN PROGRESS`.
- **Frontend:** Updated `apps/web/src/components/sign-up-form.tsx` with explicit field types/autocomplete, accessible inline validation errors, `noValidate` custom validation, pending button state, and safe provider error mapping. Existing Better Auth request, confirmed-success toast, and `/dashboard` navigation remain unchanged.
- **Validation/UI check:** In the local browser, empty submit, one-character name, invalid email, and short password each showed the expected field guidance; invalid submissions disabled the button and did not invoke signup. No valid signup was submitted during this form-only check.
- **Responsive/Figma:** CSS sizing review indicates the 360px layout has 312px form content width, full-width `min-w-0` inputs, wrapping errors, and a full-width submit button. The embedded browser did not offer a 360px viewport override, so pixel-level 360px runtime verification remains pending. Exact Figma comparison remains unavailable because the local `.fig` source is unreadable.
- **Validation commands:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. `git status --short` also showed the pre-existing README and Task 83 auth-config changes; these were left untouched.
- **Next:** Task 85 — auth/context integration. Do not implement return-context behavior as part of Task 84.

## 2026-10-02 — US-01 auth context (Task 85)

- **Story:** Added Task 85 evidence to `docs/stories/US-01-register-traveler.md`; status remains `IN PROGRESS`, with Task 86 pending.
- **Implementation:** Added the canonical `returnTo` resolver/login-href helper, made `/login` resolve and pass safe context to its mode switcher, routed confirmed signup and sign-in success to that target, and made the protected `/dashboard` route include its internal path when redirecting to login.
- **Contract/security:** `returnTo` preserves internal path/query/hash and rejects external, protocol-relative, malformed, duplicate, and backslash/encoded-slash values. Invalid or missing targets resolve to `/dashboard`. The original write payload/action is not stored or replayed.
- **Producer search:** No Traveler-only feature/action or role guard exists yet. `/dashboard` is the only existing generic session-protected route and now supplies `returnTo=/dashboard`; future Traveler-only producers should use `buildAuthLoginHref` with navigation context only.
- **Verification:** One-off resolver assertions and local browser checks passed for path/query/hash preservation, malicious-target fallback, dashboard redirect, both auth-mode switches, and validation errors retaining the query. No valid signup/sign-in was submitted; no test user or DB data was created. No repository test runner exists, so no permanent test framework was added.
- **Validation commands:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. Git status contains this task's app/story/progress changes plus pre-existing README and Task 83 auth changes; no environment/schema/migration files changed. A secret-pattern scan of the task files found no matches.
- **Scope:** No Better Auth server config, role logic, schema, migrations, environment values, README, or business modules were changed. Pre-existing user changes remain untouched.
- **Next:** Task 86 — verify the end-to-end US-01 signup/session/failure matrix, including runtime success and duplicate behavior, and confirm no original write is replayed.

## 2026-10-02 — US-01 final acceptance (Task 86)

- **Story:** Completed AC-01 through AC-10 and set `docs/stories/US-01-register-traveler.md` to `ACCEPTED`.
- **Database target:** Verified the effective database endpoint against the user-provided Neon development endpoint ID before mutations. No connection string, password, or session token was printed.
- **Runtime auth:** Public signup created one `TRAVELER` User, one credential Account, and one Session; `get-session` resolved the returned cookie. Crafted Admin fields stayed `TRAVELER`. Invalid server inputs created no users. Exact and case-variant duplicates returned the known duplicate code and preserved one identity/account; the UI showed safe duplicate copy.
- **UI acceptance:** Real UI double-click signup created one User/Account/Session and navigated only after success to the internal `returnTo` path, query, and hash. The dashboard confirmed the authenticated user. At exact 360px and desktop 1280px, there was no horizontal overflow. Validation, keyboard Enter, accessible labels/errors/autocomplete, and pending-submit guards were checked.
- **Recovery and replay:** Success toast/navigation remain inside Better Auth `onSuccess`; the duplicate failure UI showed safe error copy without success. A forced response-drop scenario was not completed because the temporary proxy page did not hydrate the form at its alternate origin; no signup request or data resulted. Duplicate-safe retry and source control flow were checked. Repository search found no auth write-payload persistence or automatic POST replay.
- **Cleanup / scope:** All generated test User, Account, Session, and Verification rows were removed and verified absent. Temporary smoke scripts were removed. Task 86 changed documentation only; no application code, schema, migration, or environment values changed.
- **Validation:** `npm run env:generate` passed (both app/db env files generated); `npm run check-types` passed in all four packages; `npm run build` passed for Next.js 16.3.8; and `git diff --check` passed. Git reported only existing LF-to-CRLF normalization warnings.
- **Git:** No commit or push was performed; pre-existing Task 83–85 and README working-tree changes remain untouched.

## 2026-10-02 — US-01 auth UI refinement

- **Task:** Restyle the existing signup/sign-in screens to follow the supplied Hà Giang reference while keeping the accepted Better Auth, validation, role, session, duplicate-account, and `returnTo` behavior.
- **UI:** Added a shared responsive auth shell/card and CSS-only mountain placeholder because the app has no suitable local landscape asset. Added a scoped Vietnamese auth header, field icons, inline validation styling, green submit/loading states, and password visibility controls. The `/login` shell omits the unavailable Explore route.
- **Runtime review:** Desktop signup/sign-in and exact 360px signup/sign-in were opened in the local browser; mobile document width matched 360px. Validation, password visibility, pending labels, provider failure feedback, and mode switching with nested `returnTo` were checked. A disposable development signup created exactly one `TRAVELER` User, Account, and Session; dashboard showed that user; sign-out reduced Session count to zero; and sign-in with the same credentials succeeded and created one Session.
- **Cleanup:** The temporary User, Account, Session, and any matching Verification rows were deleted from the verified development endpoint; follow-up counts were all zero. The temporary smoke script was removed.
- **Scope:** No auth backend, schema, migration, environment configuration, or business module was changed. No commit or push was made.
- **Validation:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. `returnTo=https://google.com` was verified to resolve to `/dashboard`.

## 2026-10-02 — US-02 login contract (Task 1)

- **Story:** Created `docs/stories/US-02-login.md`; status `READY` for the authentication contract. Tasks 2–5 remain.
- **Audit:** Confirmed the existing UI calls `authClient.signIn.email({ email, password })` through Better Auth's catch-all route; server session reads use `auth.api.getSession`; client session reads use `authClient.useSession`; logout delegates to Better Auth. No custom `/api/login`, Admin landing route, or role-specific business guard exists.
- **Contract:** Recorded current client email/password validation, trusted `TRAVELER | ADMIN` session role, existing User/Account reuse, database-backed cookie session (installed Better Auth 1.7.5 defaults), safe `returnTo`, failure/uncertain transport outcomes, and Admin/Traveler authorization distinction. Admin-feature access remains for the relevant future Admin story.
- **Implementation status:** Task 1 is documentation-only. No application code, schema, migration, environment value, or secret was changed. Sign-in already exists from the auth foundation/US-01 work; later Tasks 2–5 should audit/harden it rather than rewrite it.
- **Validation:** `npm run env:generate`, `npm run check-types`, and `npm run build` passed. `git diff --check` passed with only Git's LF-to-CRLF normalization warning. `git status --short` showed only `docs/ai-progress.md` and the new `docs/stories/US-02-login.md`; generated env files were unchanged.
- **Next:** Review the US-02 contract before starting Task 2. No Task 2 implementation was started.

## 2026-10-02 — US-02 login backend (Task 2)

- **Story:** Updated `docs/stories/US-02-login.md` with Task 2 audit and runtime evidence; status `IN PROGRESS` because Tasks 3–5 remain.
- **Backend result:** Existing Better Auth email/password sign-in, catch-all route, Prisma session persistence, cookie binding, server `getSession`, trusted User role, invalid-session handling, and multi-session behavior satisfy the backend contract. No concrete gap was found; no application-code/schema/migration/bootstrap changes were needed.
- **Development smoke:** Database target was verified as Neon development without printing connection data. A disposable Traveler authenticated successfully; forged role/admin fields had no effect; User/credential Account remained singular; a valid DB-backed session resolved role `TRAVELER`. A second login created another valid session for the same account. Wrong password and unknown email returned the same generic credential code; malformed email was rejected. Invalid and deleted-session cookies resolved unauthenticated.
- **Admin evidence:** No safe configured development Admin credentials were available, so runtime Admin login remains pending Task 5. No Admin user or role was created/changed.
- **Cleanup/scope:** Temporary Traveler, associated Account/Session/Verification rows, and temporary smoke script were removed. Only documentation changes remain for this task; no secrets, credentials, tokens, environment values, or migration changes were added.
- **Validation:** `npm run env:generate`, `npm run check-types`, and `npm run build` passed. `git diff --check` passed with Git's LF-to-CRLF normalization warning. Final status contains only the US-02 story/progress documentation; generated env files and the temporary smoke script are absent.
- **Next:** Task 3 — [FE] Xây dựng giao diện đăng nhập, loading và thông báo lỗi. Do not start Tasks 4–5 as part of this handoff.

## 2026-10-03 — US-02 sign-in UI (Task 3)

- **Story:** Added Task 3 frontend evidence to `docs/stories/US-02-login.md`. Overall status remains `IN PROGRESS`; Tasks 4–5 remain.
- **Frontend:** Updated `apps/web/src/components/sign-in-form.tsx`, `apps/web/src/app/login/auth-mode-switcher.tsx`, and `apps/web/src/index.css`. The existing card and form stack remain; `/login` now starts in Sign In, required/email/minimum-eight-character feedback is explicit, credential and generic failures use safe form-level copy, editing clears the error, and the reserved feedback region reduces layout movement. Better Auth success navigation and `returnTo` handling remain unchanged.
- **Browser smoke:** Empty, malformed email, and short password validation passed. A fabricated unregistered credential returned 401 and showed only “Email hoặc mật khẩu không chính xác.”; loading disabled the button and showed “Đang đăng nhập…”. Stopping the already loaded local server exercised the generic network error. Once the server restarted and the auth route was warm, retrying the same fabricated pair returned 401 again. Sign In ↔ Sign Up preserved the full `returnTo`; the password toggle worked by click and Enter and retained its value.
- **Responsive/accessibility:** At 360px, page width/scroll width were 360/360 and card/field widths were 332/288px. At 768px they were 480/398px; at 1280px they were 460/368px. No horizontal overflow. Labels, input types/autocomplete, field error descriptions, alert announcement, native buttons, and pending `aria-busy`/disabled state were checked.
- **Development note:** Interrupting the dev server for the network test left partial ignored `.next/dev` output; an immediate typecheck failed on those generated files and the first cold auth request returned 404. A clean warm start regenerated them; `/api/auth/get-session` returned 200 and the sign-in retry returned the expected 401. No backend code was changed. Task 4 should verify the auth route on a normal fresh development startup.
- **Validation:** `npm run env:generate` passed; `npm run check-types` passed after Next generated fresh development types; `npm run build` compiled, typechecked, prerendered all static pages, and reported success. `git diff --check` passed with Git's expected LF-to-CRLF notices. Final status contains the three Task 3 frontend files and the US-02 story/progress docs; env files are unchanged.
- **Scope:** No signup logic, Better Auth server behavior, database/schema/migration, environment values, or unrelated modules were changed. No commit or push.
- **Next:** Task 4 — verify the existing frontend/Better Auth integration and safe return/session behavior. Do not start Task 5 from this handoff.

## 2026-10-03 — US-02 Better Auth integration (Task 4)

- **Story:** Added Task 4 evidence to `docs/stories/US-02-login.md`. US-02 remains `IN PROGRESS`; Task 5 is next.
- **Integration audit:** Confirmed the form uses the canonical `authClient.signIn.email({ email, password })` client path through Better Auth's existing `/api/auth/[...all]` handler. It sends no role or authorization fields. Success navigation remains inside Better Auth's confirmed success callback; server-side dashboard identity and role come from the authenticated session/User.
- **Gap fixed:** The prior rejected-request catch showed retryable generic copy without reconciling the session. It now calls `authClient.getSession()` first. A resolved session navigates to the sanitized `returnTo`; a confirmed absent session gets generic safe retry copy; a failed session lookup gets a separate safe unknown-state message asking the user to open `/dashboard` to check the session. No automatic sign-in retry or cookie manipulation was added.
- **Development runtime:** Verified the configured Neon endpoint ID against the user-provided development endpoint without printing connection data. Through the real UI, created a disposable Traveler, confirmed `/dashboard` rendered the authenticated identity, and confirmed the stored role was `TRAVELER`, one credential Account, and one Session after login. Wrong password displayed only the generic credential message and a subsequent dashboard visit redirected to the safe login route. Valid `/dashboard` return and external URL fallback both navigated to `/dashboard`; Sign In ↔ Sign Up preserved `returnTo`.
- **ReturnTo / role / replay:** Eleven direct resolver assertions passed for safe path/query/hash and external, protocol-relative, script/data, raw/encoded slash/backslash, malformed, and duplicate values. The sign-in request contains only email/password; role remains stored/server-owned. Repository search found no pending business-write storage or POST replay on auth return. `/login` currently renders its form for an authenticated user; no unsupported broad redirect was added.
- **Session and cleanup:** UI sign-out removed the active Session. A scoped DB inspection/cleanup removed the disposable User, Account, Session, and matching Verification rows and verified zero remained. Temporary TSX scripts were deleted. No Admin was created; safe development Admin credentials remain unavailable for Task 5.
- **Startup:** Port 3001 already had a live normal dev server. `/login` and anonymous `/api/auth/get-session` returned 200, and the real invalid-credential path showed the expected safe error. The earlier interrupted cold-start 404 did not recur; this task did not stop/restart the pre-existing server.
- **Validation:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. No schema, migration, env value, Better Auth server configuration, unrelated module, commit, or push was changed.
- **Next:** Task 5 — final login acceptance tests for valid/invalid credentials, session lifecycle, role, and safe return behavior. Do not begin additional stories from this handoff.

## 2026-10-03 — US-02 final acceptance (Task 5)

- **Story:** Recorded final Task 5 evidence in `docs/stories/US-02-login.md`. US-02 remains `IN PROGRESS` because AC-02 Admin login could not be runtime-proven safely.
- **Traveler/authentication:** On the verified Neon development endpoint, a disposable Traveler registered and then logged in through the real UI. The dashboard recognized the User; the database retained one User and one credential Account and associated successful sign-ins with Sessions. Wrong password and unknown email showed the same generic Vietnamese error and established no Session; the unknown email created no User or Account.
- **Validation/role:** Empty/malformed email and short/missing password produced field feedback and prevented auth submission; Enter triggered validation. A same-origin forged request with Admin/permission/scope fields returned a trusted `TRAVELER` session and left the stored role unchanged.
- **Session lifecycle:** Sign-out deleted the active Session and protected dashboard access redirected to login. A fake session cookie and an expired controlled Session resolved unauthenticated. Multiple independent logins coexisted; opening `/login` did not invalidate the active session or alter role/account data.
- **Bug fixed:** Pending-button state alone did not prevent Enter from launching a parallel login and creating an extra Session. Added a synchronous form-submit guard; the repeated pending click + Enter run then created exactly one Session. No one-session policy was introduced.
- **Return/UNKNOWN/replay:** Safe query/hash `returnTo` was preserved; external, protocol-relative, and nested-encoded separator inputs fell back to `/dashboard`. Sixteen resolver cases passed. Repository search found no pending-write storage or automatic POST replay. A focused harness passed four branches of the actual session-recovery helper; network-level response-loss injection was not viable because the temporary proxy did not hydrate Next, so it was stopped and removed.
- **Admin and feature boundary:** No `INITIAL_ADMIN_*` values or development Admin row were present. No Admin was created/reset. AC-02 remains unproven. No Traveler-only business route exists, so end-to-end Admin-versus-Traveler feature authorization is deferred to that feature story (no route was invented).
- **Responsive/accessibility:** Current direct browser check at 360px showed no horizontal overflow, fitting fields and buttons, associated labels, correct input types/autocomplete, linked/announced errors, keyboard password toggle, Enter validation, and pending `aria-busy`/disabled state. Larger viewport control stayed at 360px; the unchanged UI retains Task 3's documented 768px and 1280px measurements.
- **Cleanup and proxy note:** A temporary proxy fallback placed only the generated disposable test credential in a local URL/tool trace. It was not a real account secret and was not stored in source/docs; the proxy/tab were stopped/removed. Scoped development cleanup deleted 7 Sessions, 1 Account, 1 User, and 0 Verification rows; a follow-up query confirmed zero test-prefix Users.
- **Files:** Updated `apps/web/src/components/sign-in-form.tsx` with the synchronous guard and recovery helper use; added `apps/web/src/lib/sign-in-recovery.ts`; hardened nested encoded path separator rejection in `apps/web/src/lib/auth-return-to.ts`; updated the US-02 story and this progress record. No schema, migration, env value, Better Auth server config, or unrelated module changed.
- **Validation:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. Git reported only expected LF-to-CRLF normalization warnings. `git status --short` contains the earlier Task 3 UI files plus the Task 5 auth helper, resolver, and story/progress changes; no generated env files or temporary test scripts remain. No commit or push.
- **Remaining:** AC-02 is the only acceptance blocker; obtain approved development Admin credentials through the configured bootstrap process, then verify login/session role before marking US-02 `ACCEPTED`.

## 2026-10-04 — US-03 strict logout completion

- **Story:** Completed US-03 strict revocation and retained status ACCEPTED; optional Admin smoke remains untested because no safe development Admin credentials were available.
- **Root cause:** Better Auth 1.7.5 catches internal Session lookup/delete errors, clears its cookie, and can still return { success: true }. The original client trusted that response without a database postcondition.
- **Backend:** Added POST /api/session/logout and the Auth module's strict logout service. It captures the server-resolved Session ID, invokes Better Auth's HTTP handler, verifies that exact row, falls back to db.session.delete({ where: { id } }) if needed, and verifies absence again. Cookie headers are forwarded only after confirmed absence. A row confirmed to remain returns FAILED; provider/database ambiguity returns retryable UNKNOWN with no cookie clearing. Already-unauthenticated is a successful no-op. The HTTP handler is used because the nextCookies plugin can otherwise apply Set-Cookie inside the Next request scope before the postcondition is checked.
- **Frontend:** UserMenu calls the strict endpoint, keeps its pending and synchronous duplicate-submit guard, exposes generic accessible retry feedback, and uses window.location.replace("/") only for the explicit SUCCESS envelope. The full navigation refreshes Better Auth client session state.
- **Focused tests:** npm run test:auth-ui --workspace web passed 16/16: T1 provider success; T2 Prisma fallback after Better Auth leaves the row; T3 failed fallback/no cookie clear; T4 verification-query uncertainty/no cookie clear; T5 Session A only; T6 already unauthenticated no-op; confirmed persistent-row failure; provider exception and UI confirmation/duplicate/navigation checks.
- **Neon development smoke:** Verified the configured endpoint ID matched Neon development. Real browser signup created one Traveler User, one credential Account, and Session A. An independent Better Auth sign-in produced authenticated Session B. UserMenu showed pending disabled state, strict logout navigated to `/` with Sign In, and DB verification confirmed A absent while B remained present/authenticated with one User and one credential Account. Direct `/dashboard` redirected to `/login?returnTo=%2Fdashboard`.
- **Cleanup:** Deleted the exact test User and verified zero matching User, Account, Session, and Verification rows. The temporary runtime smoke script and B-cookie state file were removed. No token, cookie, or password was emitted.
- **Files:** Added the strict logout route, Auth module service and focused tests. Updated UserMenu, client response helper, auth UI test command/tests, this story, and this progress entry. No schema/migration, Better Auth version/config, unrelated auth behavior, or environment value changed.
- **Validation:** `npm run env:generate`, `npm run test:auth-ui --workspace web` (16/16), `npm run check-types`, `npm run build`, and `git diff --check` passed on the final implementation. Git emitted only expected LF-to-CRLF normalization warnings.
- **Git:** All US-03 changes are recorded in one commit. No push.

## 2026-10-04 — US-04 auth context return (implementation pending browser acceptance)

- **Story:** Added `docs/stories/US-04-auth-context-return.md`; status remains `IN PROGRESS` because the required browser runtime proof of exact query/hash restoration and no-replay is incomplete.
- **Audit:** Reused the existing safe `returnTo` resolver/builder, login mode href, login page parsing, and confirmed-success navigation. No second context store or auth/session system was introduced. Existing returnTo had no focused coverage for pathname + query + hash, repeated values, deep-link refresh, no replay, or role check.
- **Implementation:** Added a development-only `/auth-context-demo` harness. It captures only `window.location` pathname/search/hash, sends guests to the existing login flow, and does nothing when auth returns. The simulated action requires a new explicit click, accepts no client role/payload, and resolves the role from the Better Auth server session. `TRAVELER` can confirm the simulation; `ADMIN` and unauthenticated users are denied. No business data is written. Production requests to the harness return 404.
- **Security hardening:** The canonical returnTo resolver now rejects credential and pending-action-like query parameter names, including nested-encoded names, in addition to its existing external/malformed/path-separator protections.
- **Tests:** Added `auth-context-return.test.ts` for full path/query/hash capture and restore, invalid/repeated returnTo, auth mode/deep-link refresh, success/failure navigation contracts, no persistence/replay, and trusted Traveler/Admin checks. Wired it into `test:auth-ui`.
- **Runtime:** Confirmed the configured database endpoint matches the supplied Neon development endpoint without outputting its connection string. The app server started successfully. Browser automation then blocked navigation to `http://localhost:3001/auth-context-demo?...` under browser security policy. Per that policy, no alternate HTTP/browser route was used. No signup/login was submitted, and no test data was written; the dev server was stopped.
- **Environment/schema:** `npm run env:generate` passed. No schema, migration, database config, Better Auth config, or env values changed.
- **Validation:** `npm run env:generate` passed; `npm run test:auth-ui --workspace web` passed 25/25; `npm run check-types` passed; `npm run build` passed; and `git diff --check` passed (Git emitted only expected LF-to-CRLF normalization warnings).
- **Remaining:** Browser smoke and safe development cleanup are not applicable until the blocked browser interaction is available. Do not mark US-04 `ACCEPTED` until exact route/query/hash restore and no-replay are runtime-proven.

## 2026-10-04 — Auth/session loading freeze recovery

- **Finding:** Header UserMenu and US-04 demo share Better Auth's session atom and both gate UI on `isPending`. Requests had no bounded completion. Installed better-fetch skips its timeout when Better Auth supplies a signal; unresolved transport/body therefore leaves session pending indefinitely. The available development log did not capture the reported request, so its underlying server/network trigger is not established.
- **Fix:** Added a 15-second auth transport deadline with a separate AbortController and bounded response-body consumption. Timeout does not abort Better Auth's caller signal, allowing the real session atom's error branch to settle pending state. Wired this transport into the existing auth client and strict logout fetch; no automatic credential/logout retries. Session errors now expose explicit refetch controls in UserMenu and the demo. Logout still only navigates after the strict SUCCESS envelope and keeps its synchronous guard/finally release.
- **Regression evidence:** Real Better Auth session-atom test covers a never-resolving request, settled error state, and successful explicit retry without reload. Additional tests cover caller-signal separation, logout timeout/no automatic retry, stalled response body, successful JSON/header preservation, and caller cancellation. Auth suite passes 30/30; typecheck passes.
- **Scope at that pass:** No auth provider, schema, DB configuration, server revocation logic, or environment value changed. Existing US-04 changes remained uncommitted. Browser runtime had not yet been verified; the browser-block explanation was corrected in the subsequent investigation below.
- **Validation:** `npm run env:generate`, auth tests (30/30), `npm run check-types`, `npm run build`, and `git diff --check` passed. The existing user-run development server was not restarted or stopped. No commit or push.

## 2026-10-04 — Auth freeze: development hydration dependency identified

- **Evidence:** On the affected Chrome document, `document.readyState` was complete and application chunks were loaded, but no demo hydration/session request traces appeared. HMR repeatedly reconnected. The pending UI was server-rendered HTML, rather than proof of an outstanding auth API request.
- **Mechanism:** Installed Next 16.3.8 awaits the initial Flight payload before calling `hydrateRoot`. Its enabled-by-default React debug channel supplies Flight debug dependencies through HMR. The server consumes/deletes the initial channel when a client connects; a lost send is not replayed on reconnect. Tests against the actual installed server transport and Flight decoder confirm this can keep decoding pending after the HTML stream ends. The trace fits the user's initial socket failure and reconnects; earlier timeout handling only addressed unresolved auth requests after hydration.
- **Fix:** Set `experimental.reactDebugChannel: false` in `apps/web/next.config.ts`, removing this development debug transport from application startup while retaining HMR, React Compiler, and auth/security behavior. Next automatically reloaded its config. Removed temporary console diagnostics. Added `auth-hydration.test.ts` and a configuration regression assertion to the auth test command.
- **Runtime:** Corrected the earlier browser-policy diagnosis: the old tab was a `data:` connection-error document; HTTP navigation works. A disposable Traveler completed signup, exact route/query/hash restoration, a second explicit demo click, sign-in via Enter, and strict logout. Two baseline logout → new demo navigations worked in the testing browser, so the Chrome failure was not falsely claimed reproduced there. After the config fix, cold guest demo navigation became interactive and captured the exact return context. The user independently confirmed the previously failing Chrome logout → paste URL flow works without F5.
- **Cleanup:** Development endpoint was verified. Test data had exactly one Traveler User and one credential Account, with zero Sessions after logout; deleting the exact disposable User and matching Verification identifiers left zero matching User/Account/Session/Verification rows. Removed the cleanup and diagnosis scripts; no credentials, tokens, or cookies were logged.
- **Scope:** No schema/migration, database configuration, Better Auth server config, auth role policy, or business module changed. Existing US-04 work remains uncommitted; its broader acceptance review remains separate from this confirmed freeze correction. No commit or push.
- **Final checks:** `npm run env:generate`, auth tests (33/33), `npm run check-types`, `npm run build`, and `git diff --check` passed. `git status --short` shows the existing US-04/auth recovery work plus the Next config and regression test changes; no temporary scripts or env files are listed.

## 2026-10-04 — US-05 self-service account profile

- **Baseline/scope:** Started on clean TXH after the committed US-04/auth fix. Added real `/account`, strict self-only GET/PATCH, name-only editing, persisted UI and existing Better Auth session refresh. Email/role/date are read-only; no email/password/avatar/Admin-management story or auth architecture/schema/env change.
- **Provider audit/decision:** Installed Better Auth 1.7.5 updateUser accepts broader input and returns `{ status: true }`. Chose application-owned DTO and validation using the existing trusted provider session, Prisma and shared idempotent mutation envelopes. No new auth store; existing cookie-cache-bypassing session refetch synchronizes UserMenu.
- **Security/write:** DTO has exactly name/email/role/createdAt. Strict body rejects identity/role/emailVerified/provider fields; server targets session User ID. Same-origin JSON PATCH and no-store responses. Writes and indefinitely retained response records commit atomically; UNKNOWN preserves draft/key and requires reread before retry, never false success.
- **Runtime:** Verified Neon development endpoint. Disposable Traveler registered and returned to account; real view/edit/cancel/one-character validation/double-click save, menu synchronization, persisted reload, keyboard focus/Tab/Enter, controlled revocation with retained failure draft, active strict logout, account guest redirect and relogin return all passed. Live guest GET/PATCH each returned 401 without account data. Final widths 360/768/1280 had no horizontal overflow.
- **Bugs found in smoke:** Initial Edit/Submit DOM reuse caused an unintended same-name write; distinct keys, preventDefault and view-mode submission guard fix it. Reloaded new code, verified Edit/Cancel/validation made no additional mutations, and final double-click save added exactly one response record. Limited the long-name menu trigger to avoid mobile header overflow. All earlier test-only records were cleaned too.
- **Admin/status:** No safe configured Admin credentials; deterministic Admin/self-ownership coverage passes but AC-02 runtime is NOT PROVEN. US-05 remains IN PROGRESS rather than claiming every acceptance criterion is complete.
- **Cleanup/evidence:** Scoped cleanup verified zero disposable User/Account/Session/Verification/IdempotencyRecord rows; removed temporary script. Screenshots of view/edit/saving/success/validation/failure/mobile/tablet are outside the repo at `D:/KLTN/us05-evidence/`. No password/token/cookie emitted or stored in artifacts/source. No commit/push.
- **Final validation:** `npm run env:generate`, `npm run test:account --workspace web` (18/18), `npm run test:auth-ui --workspace web` (33/33), `npm run check-types`, `npm run build`, and `git diff --check` passed. Production build lists `/account` and `/api/account` as dynamic routes. Working tree contains only account implementation/menu/test-command/story/progress changes; no env/schema/migration or temporary runtime file.

## 2026-10-04 — US-05 final acceptance

- **Admin evidence:** The user confirmed development Admin runtime smoke PASS: `/account` displayed the correct own name/email/role; editing own name succeeded and persisted after save; role remained ADMIN and email unchanged. The original Admin name was restored afterward, as confirmed by the user. The agent did not independently repeat this Admin smoke or infer the original name.
- **Acceptance:** AC-02 is PASS and US-05 is ACCEPTED. This final evidence closes the Admin runtime gap recorded in the earlier implementation entry; all AC-01–AC-15 are now PASS.
- **Cleanup:** A read-only audit against the verified Neon development endpoint found zero US-05 disposable Users, linked Accounts/Sessions, matching Verification identifiers and matching idempotency response records. The temporary audit script was removed. No new runtime test data or database writes were introduced in this acceptance pass.
- **Scope:** Only this progress document and the US-05 story were edited for final acceptance. Existing uncommitted application changes were preserved; no application fix, schema/migration or secret change. No commit/push.
- **Acceptance validation:** Reran `npm run env:generate` PASS, `npm run test:account --workspace web` 18/18 PASS, `npm run test:auth-ui --workspace web` 33/33 PASS, `npm run check-types` PASS, `npm run build` PASS and `git diff --check` PASS. Status contains the existing US-05 implementation and its two documentation files; no temporary script or env file remains.

## 2026-10-04 — US-06 role and ownership authorization

- **Baseline/contract:** Clean TXH at committed US-05 `a357228`. Verified Product §4.2/4.4.6/9.3/11.3 and System Specification §2.3/9.5. Guest public only; Traveler personal capabilities for own data; Admin public/content administration without Traveler inheritance or private-user bypass. Both signed-in roles may manage their own account and open the dashboard shell.
- **Implementation:** Added shared exact permission policy and trusted-session/current-DB-role guard, owner comparison and actor-scoped Traveler resource reader. Account module GET/PATCH now use the guard; account page delegates to that module; dashboard bypasses cookie cache and validates current persisted role. Demo Server Action independently requires Traveler. Provider auth, public health and strict current-session logout retain existing boundaries.
- **Ownership boundary:** Current account never accepts a target identity. Shared future Traveler reader constrains lookup by resource ID and trusted userId, rejects Guest/Admin before reader invocation, and masks missing/non-owned rows with identical 404. Future domain modules must use a transaction-scoped reader and equally scoped write predicate; no Trip/Favorite/Admin-content endpoint/model was added or claimed integrated.
- **UI:** Added denied view with a home link and explicit 401/403/404 account mutation feedback, preserving draft, returnTo and submission/idempotency behavior.
- **Validation:** Env generation PASS; authorization 21/21, account 18/18 and auth 33/33 PASS; typecheck/build PASS after correcting optional HTTP status handling; tracked and new-file whitespace checks PASS. Existing auth source assertion now follows the shared guard without weakening role/no-replay expectations.
- **HTTP smoke:** Live development Guest GET account 401, forged target query 400, altered account path 404, Guest same-origin JSON PATCH 401/FAILED, no protected DTO. Role/ownership tests use in-memory fixtures; authenticated Admin/Traveler browser smoke was not repeated or claimed. No database test records, temporary scripts, env/schema/provider changes, commit or push.
- **Handoff:** US-06 IMPLEMENTED awaiting user acceptance. Full permission matrix and evidence are in `docs/stories/US-06-role-ownership.md`.

## 2026-10-04 — US-06 final acceptance

- **Runtime evidence (user-confirmed):** Guest `/account` -> `/login?returnTo=%2Faccount`, with no private account data rendered. Traveler `/account` ALLOW and Traveler-only auth-context demo action ALLOW. Admin `/account` ALLOW self-service, but Traveler-only demo action DENY. This confirms Admin does not inherit Traveler permission; the agent did not independently rerun this browser smoke in the final documentation pass.
- **Acceptance:** US-06 is ACCEPTED. Final AC matrix covers Guest boundary, both roles' self account, exact Traveler permission, trusted current role/session, ownership, protected APIs and denied UI/auth regression.
- **Ownership:** Accepted by deterministic fixture tests because Trip/Favorite production resources do not exist yet. Scoped reads, changed IDs, missing/non-owned identical 404 and no Admin bypass/forbidden callback are proven by fixtures, not claimed as live domain-resource smoke.
- **Route/API audit:** Account page and GET/PATCH use the guarded self-only module; dashboard validates uncached session/current persisted role; demo Server Action independently checks Traveler. Account query/body selectors cannot choose another user; private responses are no-store and denied writes are FAILED. Provider auth, strict current-session logout and public home/health retain their existing boundaries.
- **Future integration:** Trip/Favorite/Admin-content stories must reuse canonical `apps/web/src/server/authorization` policy/guard/ownership primitives and scope persistence before private data is returned, changed or supplied to AI. No future domain endpoint is claimed implemented.
- **Scope:** Only story/progress documentation changed in this acceptance pass. Existing uncommitted US-06 application changes preserved; no new bug, application edit, schema/env/provider change, test DB write, commit or push.
- **Final checks:** Reran env generation PASS, authorization 21/21 PASS, account 18/18 PASS, auth 33/33 PASS, check-types PASS (Turbo cache hit), build PASS and diff-check PASS. Git status/stat reviewed; no temporary script or env file listed.

## 2026-10-04 — US-07 admin destination foundation / final acceptance

- **Baseline/scope:** Clean TXH at `fe043b7`. Implemented tasks117..124: Destination persistence, seven-day hours, admin list/create/edit and real guarded APIs. No public discovery, publication toggle, Culture/Favorite, seed/import, delete endpoint, media, AI or Validator implementation. Story is ACCEPTED with actual development Admin browser create/edit proof.
- **Contract:** Stable cuid, open normalized area/category strings (no invented taxonomy), canonical latitude/longitude (no duplicate geometry), independent nullable integer-minute durations, HIDDEN default/read-only visibility. Seven unique weekdays with distinct OPEN/CLOSED/UNKNOWN; multiple sorted non-overlapping local-minute intervals, no overnight. Database numeric/time checks and FK/unique indexes; semantic weekly checks in shared strict contract. Imports must reuse it.
- **Architecture/auth/API:** Thin collection GET/POST and ID GET/PATCH under `/api/admin/destinations`; exact canonical Admin guard at page/handler/service with current persisted role and transaction recheck. Explicit DTOs, no-store, same-origin JSON, required idempotency keys, full editable replacement, visibility/identity/timestamps/role rejected. Added Admin menu entry and real responsive list/forms with safe loading, validation, cancel and write states.
- **Migration:** Exactly one additive `20261004070249_add_destination_domain` applied to verified Neon development `ep-purple-pond-b3xujb8o`. Initial pooled advisory-lock timeout recovered by releasing only the executing connection's own lock and temporary direct connection to the same endpoint; no persistent env/config change or destructive operation. All5 ledger entries applied; schema up to date, expected3 tables/enums/checks present, PostGIS/vector and auth tables intact. No pending migration, production or db push.
- **Browser/runtime:** Guest redirected to login with admin returnTo and no domain data. Disposable Traveler list/new/edit AccessDenied; live four APIs Guest401/Traveler403 with no DTO and denied writes FAILED, including forged Admin body/header. Existing Admin real POST/double-click produced one HIDDEN destination, seven days, two intervals (Monday OPEN2, Tuesday CLOSED, Wednesday/rest UNKNOWN), independent90/30 durations. Real PATCH changed text/taxonomy/coordinates, minimum45 and one interval while suggested90/visibility stayed unchanged; edit reload and direct DB read matched. Invalid latitude/duration/overlap did not write; cancel did not persist. 360px list/form had no horizontal overflow and keyboard Tab worked.
- **Write proof:** Live replay of stored create/update returned SUCCESS without transaction callback (0); altered payload FAILED409, still one destination/two response records. Live injected error after schedule deletion rolled back all days and response record. Transport UNKNOWN/malformed response and no-false-success proven by deterministic fixtures rather than a claimed browser network interruption. UNKNOWN preserves identical payload/key and explicit reread/retry. Final review removed URL-derived success notice and keeps submit locked during success navigation; focused regression verifies one-time confirmed-write notice.
- **Cleanup:** Verified zero disposable destination/children/response records and both test Travelers/accounts/sessions. Existing Admin identity/name/role not edited. All four temporary scripts deleted; screenshots outside repo at `D:/KLTN/us07-evidence/`. No credentials/tokens/cookies/connection strings stored in source or evidence.
- **Final checks:** env:generate PASS; auth33/33, account18/18, authorization21/21, destination27/27 PASS; Prisma format/generate PASS; development migrate status up to date; check-types PASS; production build PASS (three Admin pages/two API patterns dynamic); tracked and untracked whitespace checks PASS. Final status/stat reviewed; only US-07 files/menu/test command/docs/migration/schema changed. No commit/push.
- **Handoff:** See US-07 story for final AC117..124 matrix and exact EN-02 field names/units/schedule contract. Destination.id is future Culture relation target; public stories must add their own visibility filtering; US-08 owns explicit publication mutation. No other developer story implemented.

## 2026-10-04 — US-07 UI/UX refinement

- **Scope:** Updated only destination FE components/CSS, destination UI regression tests and story/progress docs on existing US-07 working tree. User reference images treated as inspiration. Existing header/menu, backend/contracts/guards/schema/migration/idempotency unchanged; no additional story/search/filter/media feature or dependency.
- **UI:** Brand-aligned moss-green light/dark surfaces, better hierarchy/list card/status/action/empty/loading/error, tablet/mobile cards and full-width responsive forms. Five section headers, sticky save/cancel, native minute time inputs with explicit24:00 option and accessible independent OPEN/CLOSED/UNKNOWN selectors. Field errors remain near inputs; Sonner success/error/warning uses bottom-right; UNKNOWN persistent warning and identical draft/key retry remain intact.
- **Browser:** Existing Admin checked actual list/create/edit and persisted DTO, success/validation toast, latitude/overlap rejection, keyboard Tab/native time,24:00/add/remove/status/cancel and360/768/1280px no overflow. Native automation fill did not emit React time-input updates; traced DOM property vs attribute and used actual keyboard events for validation. Two saves confirmed original unchanged editable values (normal timestamp/idempotency changes retained); no new destination/user. Cancelled drafts did not change schedule. Fixed background height for long form within root grid. Restored dark appearance and reset temporary viewport.
- **Validation:** Destination30/30 and auth33/33 PASS, check-types PASS, production build PASS, tracked/new-file diff-check PASS. Evidence outside repo at `D:/KLTN/us07-ui-evidence/`. No package installation, secret, temporary script, commit or push. US-07 remains ACCEPTED with the prior domain runtime evidence and this UI follow-up.

## 2026-10-04 — Header-only polish

- Shared DestinationPageHeader now renders compact, aligned title/subtitle for list/create/edit with the requested copy. Removed uppercase eyebrow and large header icon plus their unused CSS.
- List CTA sits on the right on desktop/tablet and below text at360px. Create/edit reuse a bordered arrow-left secondary link to /admin/destinations with hover/focus styles; saving/UNKNOWN still hide it.
- Actual logged-in Admin browser smoke checked all three pages at360/768/1280px: no horizontal overflow, headers aligned with content, direct create/edit back links returned to the list; keyboard Enter activated create back. No save or mutation performed, no test data created. Temporary viewport reset, existing theme preserved. Screenshots outside repository: D:/KLTN/us07-header-evidence/.
- Validation: destination32/32 PASS (two additional FE header contract tests), check-types PASS, production build PASS, tracked/untracked diff-check PASS. Backend/API/schema/migration/authorization/core validation/idempotency/form fields/hours/toast/save behavior unchanged. No commit/push.

## 2026-10-04 — US-08 destination visibility / final acceptance

- **Baseline/scope:** Clean TXH at 0f8e152, accepted US-07. Implemented tasks125–127 only; explicit visibility API, list/card/edit actions, canonical eligibility and tests. No public discovery/planner/Culture/Favorite/delete feature, package or schema/migration change.
- **Contract/security:** Strict same-origin JSON PATCH /api/admin/destinations/[id]/visibility, required Idempotency-Key/private no-store, exact persisted Admin guard before write and inside transaction. Separate destination:set-visibility scope, ID+target hash, atomic update/response; generic detail PATCH cannot publish. Same state skips update; fields/schedule remain intact.
- **Eligibility:** destination-eligibility.ts provides the one VISIBLE filter, persisted-record predicates and existing-ID selector for both public content and new itinerary candidates. Visible A/hidden B/missing fixture query passes; development selector confirmed include/exclude as state changed. US-10 and future Trip integration remain unimplemented.
- **UI/browser:** Existing Admin real list double-click show then confirm hide, then edit Enter show/hide; persisted reload/DB results and edit success toasts observed. Hide cancel writes nothing; Escape restores trigger focus. Shared page controller locks duplicated desktop/mobile actions and edit detail saves, no optimistic state; UNKNOWN preserves target/key with explicit reread/retry. Native dialog, labels/focus/pending and360/768/1280 no overflow verified. Existing Admin/manual destination/theme unchanged, viewport reset.
- **Write/runtime:** Four confirmed toggles -> exactly4 records (no extra double-click/cancel). Live stored replay SUCCESS with0 transaction callbacks, different target409 with0 callbacks; replay service uses stored Admin ID via test resolver and real DB role guard, not claimed as browser HTTP replay. Live Guest401/FAILED and disposable Traveler403/FAILED/list403, no protected DTO. Snapshot preserved fields and7 days/2 intervals including child IDs. Future historical Trip relations absent; no delete/rewrite path. UNKNOWN network-loss/mismatched DTO is deterministic transport/UI-contract proof, not a claimed browser interruption.
- **Cleanup:** Disposable destination/children/4 visibility records and both probe Travelers/accounts/sessions removed; final verification cleanup checked. Zero scoped residue, temporary script/snapshot removed; browser list refreshed without test item. Screenshots outside repository at D:/KLTN/us08-evidence/. No credentials/tokens/connection strings in source or artifacts.
- **Validation/acceptance:** US-08 ACCEPTED, tasks125/126/127 PASS. env:generate PASS; destination43/43, authorization21/21, account18/18, auth33/33 PASS; build PASS including dynamic visibility route; check-types PASS after sequential rerun resolved a race with Next route-type generation during parallel build. Tracked/new diff-check PASS, secret-pattern matches0. Schema change NO; Migration NOT REQUIRED; Production migration NOT RUN. No blocker, commit or push.

## 2026-10-04 — US-08 visibility switch polish

- Shared controlled DestinationVisibilitySwitch replaces list/card/edit visibility buttons. Desktop status column and mobile status pair OFF/ON with text; action column keeps only Chỉnh sửa. Native role/aria/Enter/Space/focus,42×24px track/18px thumb/44px tap target and reduced-motion support. Existing mutation controller, confirmation, SUCCESS/FAILED/UNKNOWN and retry locks retained; API/auth/idempotency/eligibility/schema/migration unchanged.
- Actual Admin development browser: double-click show → one write, persisted ON reload; Hủy/Escape → no write/focus restored; confirmed hide and OFF reload; edit Space show/Enter hide. Confirmed state retained while pending; switches/detail fields disabled then restored. Four toggles →4 stored responses; fields/7 days/child IDs preserved. List/mobile/edit360/768/1280 no horizontal overflow. FAILED/UNKNOWN are deterministic transport/source-contract evidence, not a claimed browser outage.
- Disposable destination/children/4 responses cleaned with zero residue verified; script/snapshot removed, final browser list clean. Existing Admin/manual destination/theme unchanged, viewport reset. Evidence outside repo: D:/KLTN/us08-switch-evidence/.
- Destination45/45, check-types, production build and tracked/new-file diff-check PASS; secret scan0. Backend/client contract/schema hashes unchanged from pre-polish snapshot. US-08 remains ACCEPTED. No new dependency/migration/commit/push.

## 2026-10-04 — US-13 public destination detail

- **Baseline:** Clean TXH `3e54807`, committed accepted US-07/08 checked before editing. Audited schema/module/routes and source documents; Culture/Explore/Maps/provenance/Favorite/AI integrations absent. Implemented available tasks153–156, no competing domain/schema or story expansion.
- **Implementation:** Public `/destinations/[id]` and GET `/api/destinations/[id]` share one module service. Canonical US-08 VISIBLE predicate at persistence; ID-only existence distinguishes410 unavailable/404 missing. Dynamic/no-store, identical public semantics for all roles, generic500 separate. Explicit strict DTO: factual fields, nullable suggested duration, canonical seven-day schedule, currently empty relatedCulture; omits visibility/timestamps/minimum/source fabrication. Consumer hero/cards, factual location, readable local hours, duration format, loading/not-found/unavailable/error retry, theme/responsive. No fake image/map/Favorite/AI controls.
- **Runtime:** Verified Neon development only. Disposable Destination published/hidden by actual Admin US-08 browser. Guest and authenticated disposable Traveler live HTTP API200/public SSR exact data, then410/unavailable with no name/description leak; missing/malformed404. Admin actual public page valid then hidden-after-refresh unavailable, missing and loading observed. Browser JSON navigation blocked by client; no Admin-browser API status claimed. DB failure/error retry proved deterministically, no live outage induced. Light/dark inspected,360/768/1280 scrollwidth=clientwidth. Existing theme restored/viewport reset.
- **Cleanup:** Scoped Destination/children/two visibility responses and both Traveler users/accounts/sessions/verification removed, zero residue verified; script removed. Existing Admin/manual destination unchanged. Screenshots outside repo at D:/KLTN/us13-evidence/.
- **Validation:** env:generate PASS; destination59/59 (14 new public cases), authorization21/21, account18/18, auth33/33 PASS; check-types/production build/tracked and new diff-check PASS, secret scan0. Existing source assertion corrected for CRLF checkout; no US-08 behavior changes. Schema NO, migration NOT REQUIRED, Production untouched, no commit/push.
- **Acceptance:** US-13 PARTIALLY ACCEPTED / BLOCKED BY US-09.153/154/156 PASS;155 location/hours/duration PASS but Culture retrieval blocked because no canonical relation. Await merged US-09 before integration; Map awaits US-12, Explore navigation US-10, sources await real source model. Never claim full ACCEPTED or fabricated Culture/map evidence.

## 2026-10-04 — Shared UserMenu login-context fix

- Root cause: bare `/login` Guest link discarded the originating public location; SignInForm/login already honored safe returnTo. Shared current-page helper and reactive pathname/query capture now supply encoded returnTo, use unchanged resolver safeguards, and avoid `/login` loops. No Destination-specific logic, provider/session/role/auth API/US-13 API change. Existing uncommitted US-13 work preserved.
- Three new regression cases; auth36/36, account18/18, destination59/59, production build and check-types PASS. Initial typed-route validation caught a broad string return type; narrowed helper return types to the literal login URL shape, then both reruns passed. No cast or weakened URL validation.
- Browser Guest VISIBLE detail→Sign In produced the exact encoded pathname/query login link. After user credential entry and SUCCESS, actual URL was `/destinations/auth-navigation-smoke-20261004?view=detail&from=menu`, with valid detail/authenticated UserMenu visible and no dashboard redirect. Screenshot outside repo: D:/KLTN/auth-navigation-evidence/login-return-success.png. Scoped development fixture/children cleaned with zero residue verified, script removed; existing Admin profile/manual destination unchanged. Tracked/new-file diff-check PASS. No commit/push.

## 2026-10-05 — US-09 Culture management / final acceptance

- **Baseline/scope:** Clean TXH at `a006fe4`. US-09 ACCEPTED, tasks128–135 PASS. Canonical Culture/source/Destination links, Admin list/create/edit/visibility and minimal US-13 relatedCulture integration. No public Culture detail, discovery, map, media, crawling/import, AI/RAG, delete or production deployment.
- **Persistence:** CultureContent holds title/content, optional sourceTitle/sourceUrl, HIDDEN/VISIBLE default HIDDEN and timestamps. Explicit CultureDestination composite PK and restrictive FKs support zero/multiple links without changing Destination or losing links on hide. Source name, URL or absent source accepted; no fabricated provenance or source fetch. Strict normalized input preserves case; executable/credential URLs and client-owned visibility/role/identity rejected.
- **Migration:** Additive `20261005021531_add_culture_content_domain` generated, SQL reviewed and applied only to verified Neon development `ep-purple-pond-b3xujb8o`. Tables/enum/default/PK/FKs/indexes verified; six finished ledger entries, schema up to date. Existing auth/Destination/hours/idempotency intact. Schema YES; Production migration NOT RUN. No config/historical migration/db push change.
- **API/security:** Six thin Admin handlers (collection GET/POST, detail GET/PATCH, visibility PATCH, searchable destination lookup GET), canonical exact Admin boundary and persisted-role transaction recheck, private/no-store and same-origin JSON. Live Guest401/Traveler403 including forged roles, no DTO, denied writes FAILED. Guest page login returnTo and Traveler AccessDenied verified. Mutation/content/source/link/success record atomic; actor/operation/target-aware shared idempotency, no TTL.
- **UI/runtime:** Actual development Admin real create double-click made one HIDDEN Culture with source name/one link; edit Enter persisted changed title/content/source URL/two links (including hidden Destination), preserving visibility. List show, confirmed hide, edit Space re-show persisted; Hủy/Escape wrote nothing and restored focus. Five confirmed responses total. Invalid title/URL prevented writes; cancelled drafts did not persist. Responsive loaded list/form/public360/768/1280 had no overflow, light/dark and keyboard/pending locks inspected; original theme/viewport restored.
- **Public integration:** Canonical VISIBLE filter through actual join, bounded20 summaries with explicit public fields/excerpt/source. Actual Admin public browser and live Guest/Traveler HTTP/SSR include only visible related A, exclude hidden related B and visible unrelated C; hide A empties summary, re-show restores it with both joins retained. Hidden Destination410/no private data. No dead Culture links. US-13 Culture dependency resolved; Maps still awaits US-12.
- **Write proof:** All five committed responses replayed through actual DB service with trusted stored Admin ID/test session resolver: SUCCESS with zero additional transaction callbacks; changed input409 FAILED/zero callbacks, one Culture. This is service replay, not browser HTTP replay. Injected known error after real SQL content/source/link replacement rolled back fields/links/response. UNKNOWN/lost response is deterministic transport/UI-contract evidence, no live outage claimed.
- **Cleanup:** Zero disposable A/B/C/joins/five responses/two Destinations/hours and probe Traveler/account/session/verification residue verified. Existing Admin identity/name/email/role/updatedAt and manual Destination snapshot unchanged. All temporary scripts and snapshot deleted; screenshots outside repo at `D:/KLTN/us09-evidence/`. No secrets or screenshots included in repository.
- **Validation:** env:generate, Prisma format/generate/migrate status PASS; Culture26/26, Destination61/61, authorization21/21, account18/18, auth36/36 PASS. Initial generated-route and typed fixture issues repaired; final sequential check-types and production build PASS. Tracked/new-file whitespace and secret scans PASS; status/stat reviewed. No US-09 blocker, commit or push.

## Historical — 2026-10-05 US-12 Google prototype (superseded by provider migration below)

- **Baseline/dependencies:** Clean TXH `4a2a007` verified. No canonical US-10 Explore/US-11 search/filter implementation or tests existed. Added one minimum unfiltered Explore boundary;149 BLOCKED, no fabricated filter synchronization or full story acceptance. User is adding the browser key locally and will report when ready; do not expose/request it in chat.
- **Implementation:** Official Google JS singleton setOptions/importLibrary, Advanced Markers, shared cancellable provider lifecycle/renderer/Client DestinationMap for Explore and US-13. Real tilesloaded required for ready; script/auth/15s timeout errors preserve List/detail; marker textContent/info focus/real detail anchor, sensible fitBounds/single zoom/max zoom, cleanup, no routing/GPS/iframe. Reused optional public browser key; added optional public Map ID (production needs own ID; DEMO_MAP_ID development only), schema/example/generated env. No actual credentials/config values committed.
- **Data/state:** Public collection GET/api/destinations and server Explore share canonical VISIBLE persistence/explicit six-field DTO/25-item pagination/no-store, identical public semantics across roles. Invalid legacy axes normalize null, projection excludes and reports count. List/map same current-page data; native history mode retains query without refetch, refresh/back supported. Unsupported US-11 query rejects explicitly rather than pretending to filter. Header minimal Explore link/responsive wrapping; no auth/business mutation/schema changes.
- **Runtime so far:** Verified development endpoint; disposable A/B visible valid, C hidden and Culture A. Live Guest/Traveler API inclusion/exclusion/allowlist/no-store and existing Admin public list PASS; probe credentials only in memory, accounts/sessions cleaned. Actual missing-key provider error and usable List, query retention/Back/error tested. Admin confirmed fixture hide then Detail refresh unavailable/no location/map, show restored detail/Culture (provider still unavailable). List360 and Detail360/768/1280 no overflow; real Google map/marker/CTA/back/responsive smoke remains PENDING, not claimed PASS.
- **Cleanup:** Zero A/B/C/children/Culture/join/two scoped visibility responses and probe Traveler/account/session/verification verified. Existing users/Admin and Destination snapshot unchanged. Runtime script/snapshot removed; evidence outside repo `D:/KLTN/us12-evidence/`. Recreate scoped fixtures only for the pending real-provider run, then cleanup again.
- **Validation:** env generation PASS, map21/21, Destination61/61, Culture26/26, authorization21/21, account18/18, auth36/36 PASS; check-types and production build PASS. Initial temporary script type errors fixed before successful rerun, script removed. No schema/migration/production/commit/push. Status remains partial until runtime proof, and cannot ACCEPT US-12 while149 blocked.
- **Final audit:** Reran typecheck/build after deleting the temporary script: PASS. Tracked and14 new-file diff/whitespace checks PASS;25 changed files, no secret-pattern match, temp script or screenshot in repository. Tracked diff59 insertions/6 deletions before this audit line; final status reviewed. Cleanup browser shows only the preexisting public destination; tab retained for pending Maps smoke, temporary fixture tabs closed and viewport reset. Existing Admin session retained.

## 2026-10-05 — US-12 MapLibre/Stadia provider migration / final evidence

- **Starting audit:** TXH HEAD4a2a007, intentionally dirty US-12 working tree. Kept neutral public collection/service/projection/List-Map state/Explore/Detail-Culture boundaries; no reset/revert/checkout/merge. Replaced only Google renderer/config/mock artifacts. Removed Google loader/renderer and @googlemaps/js-api-loader/@types/google.maps; removed browser Google key/Map ID schema/example fields. Added maplibre-gl6.12, canonical Stadia styles, npm dynamic loader/renderer, official CSS. Google Routes stays separate/planned/server-side.
- **Provider integration fix:** Runtime exposed v6 worker sibling path failure under Next chunk rewriting. dev/build prepare two official npm worker assets at ignored public/maplibre, same-origin URL; Turbo caches these outputs too. A missing worker poisons v6 cached initialization, so bounded no-store HEAD preflight precedes initialization. Temporary v5 test was removed after critical advisory; final v6 has no MapLibre advisory in audit. No CDN/custom script tag/frontend credential/new provider.
- **Real runtime:** localhost:3001, no key. Stadia/WebGL visible with A/B and existing manual marker; C hidden absent. Actual List↔Map/refresh/Detail→Back retains mode, same dataset/count. Admin popup click→canonical Detail exact23.16/105.4 map + Culture. Guest after completed logout renders same map, Enter marker→focused CTA→Enter Detail/Culture. HIDDEN unavailable renders no private name/coords/canvas; missing remains distinct. Zero-result page renders real Hà Giang default viewport with no markers; single Detail centers location, multiple Explore fits bounds.
- **Theme/responsive:** Real light/dark Stadia basemaps; exactly one canvas after swaps. Explore360/768/1280 scrollWidth equals viewport; Detail scrollWidth≤viewport, map heights360/440px. Zoom control and actual pointer drag pan exercised (marker transform moved with viewport), marker/CTA keyboard tested. No physical mobile touch test claimed. Screenshots outside Git at D:/KLTN/us12-evidence/stadia-*.
- **Failure/retry:** Temporarily moved only generated worker asset, real HEAD404→explicit provider error without losing destination count/List. Restored asset; same-page Retry (no F5)→real Stadia tiles, one canvas/three markers. Deterministic style/tile failure/timeout/unmount/no-late-success remain covered. No Stadia auth failure or outage induced. Initial fixture missing seven days caused validation error, corrected only disposable fixture, preserving contract.
- **Cleanup:** Zero scoped A/B/C/Culture/join/children after cleanup; existing Destination snapshot unchanged. No new users/accounts/sessions created during this provider run; existing Admin identity/name/email/role not edited. Admin browser session logged out for Guest smoke. Temporary runtime script removed and generated worker restored; no production/schema/migration. Test snapshots/screenshots outside repository.
- **Validation:** env:generate PASS; map23/23, Destination61/61, Culture26/26, authorization21/21, account18/18, auth36/36 PASS (185 tests). check-types PASS. Final build/diff/secret audit below. npm audit exit1:10 preexisting high across Prisma/tooling transitive dependencies,0 critical and no MapLibre finding; no unrelated force/downgrade fix.
- **Acceptance:** US-12 PARTIALLY ACCEPTED:146/147/148/150/151 PASS,152 PASS for implemented scope;149 BLOCKED US-10/11, no invented filter controls. US-13 tasks153–156 re-evaluated with regression/runtime evidence:all PASS, Culture+Map resolved, ACCEPTED approved functional scope. Production Stadia property/domain/preview auth remains deployment setup, not configured by this task. No commit/push.
- **Final audit after cleanup:** env generation/typecheck/production build PASS; git diff --check and whitespace checks over all28 tracked/new changed files PASS. Secret-pattern review found only the preexisting commented `<user>:<password>@<neon-host>` template placeholder, no actual credential. No temporary smoke script/backup/vendor bundle staged, Google renderer artifact or Prisma schema/migration change. Final tracked diff13 files286 insertions/25 deletions before this audit line; untracked feature files preserved. Browser shows only original public Destination on real Stadia map after cleanup, viewport reset and original dark theme retained.

## 2026-10-05 — US-10 Home and public Explore accepted

- **Baseline/scope:** `TXH`, `b2061c8 feat(map): add destination exploration map`. Reused the US-12 Destination list/map dataset, pagination, view URL state, Stadia/MapLibre renderer, and US-13 Detail. No schema or migration. Home now has Vietnamese product copy and a real `/explore` CTA. Explore now renders independent streamed public Destination and Culture summary sections; no search/filter, Culture detail, Trip/AI, Favorite, or media story was pulled forward.
- **API/data:** Existing `GET /api/destinations` and `listPublicLocations` remain canonical. Added thin public `GET /api/culture` over `listPublicCulture`, using canonical Culture and Destination VISIBLE filters, strict public-only fields, deterministic pages of25, lookahead and `no-store`. Excerpts are normalized, grapheme-safe, ≤280 units; unsafe legacy source URL is suppressed. Hidden related Destinations do not appear in public Culture summaries. Destination page and Culture `culturePage` are independent.
- **UI/states:** Static Home has implemented discovery links only. Explore streams Destination and Culture independently, with separate loading/error/retry/empty states. Culture cards link to visible Destination details and safe available sources without implying a full Culture detail route. US-12 List/Map and marker Detail transition remain intact.
- **Runtime/security:** Verified Neon development endpoint `ep-purple-pond-b3xujb8o`. Guest no-cookie API and authenticated disposable Traveler API returned identical VISIBLE-only contracts; signup role was TRAVELER. Admin browser hid/showed a Destination and Culture: each disappeared/reappeared on public refresh, hidden Destination marker and Culture relation were removed while hidden, and relations returned on show. Guest direct hidden detail had no private text/location/map. Marker→popup→Detail worked by keyboard. Both loading states, page-2 empty states, independent invalid-page errors and Map worker failure/retry on the same page were observed. Home/Explore were checked at360/768/1280 with no horizontal overflow. Screenshots/evidence are outside Git at `D:/KLTN/us10-evidence/`.
- **Cleanup:** Removed two Destination fixtures, three Culture fixtures, six links, opening-hour children, disposable Traveler/account/session and four idempotency records scoped to the fixture IDs. Snapshot comparison confirmed pre-existing Destination/Culture/relations/users and Admin name/role unchanged. Temporary smoke script and snapshot removed; no production access, migration, or commit/push. The browser Admin session was signed out during Guest smoke; log in again in the browser if Admin UI is needed.
- **Acceptance at that time:** US-10 tasks136–140 PASS; story status ACCEPTED. US-12 task149 was still BLOCKED pending US-11 on 2026-10-05; it later passed manual verification on 2026-10-07 (see US-12 story and Sprint 2 closure below). US-13 remains ACCEPTED.
- **Validation:** `npm run env:generate`; US-10 14/14, map23/23, Destination61/61, Culture26/26, authorization21/21, account18/18 and auth36/36 (199 total) PASS; `npm run check-types`, `npm run build` and `git diff --check` PASS. No schema change/migration, no secrets or test fixtures retained.

## 2026-10-05 — US-11 Destination search and filters implemented

- **Baseline:** Clean `ThaiAnh`, HEAD `9457e27`. Created the US-11 story contract before code; reused accepted US-10 list/Culture, existing public detail and Map wiring. No architecture/auth/schema/dependency declaration/lockfile change or commit/push.
- **API:** `GET /api/destinations?q=&category=&region=` now returns shared success `{items, filters:{categories,regions}}`, no-store. q is case-insensitive literal substring of name OR description (accents significant; SQL pattern characters escaped). category exact; region maps to area exact; AND between groups, NFC/trim/whitespace normalization and existing taxonomy lowercase convention. Blank absent, unknown well-formed taxonomy empty200, duplicates/unknown/oversized input400, technical error sanitized500. Item AND option queries always VISIBLE. Options derive from all public records independently of current filters. Name/id ASC; per current task, Destination paging replaced by complete MVP matches; independent Culture paging retained.
- **UI/state:** Shared Input/Button, native selects and labelled Search/Clear form; URL q/category/region drives fetch. Native history preserves Detail→Back; AbortController and post-abort guard prevent stale success/error. Loading, valid-empty, error/retry and unsaved-form Clear are distinct. Invalid direct URL remains an error after hydration and Clear repairs it. Existing view/Culture state is preserved; valid mode/Culture changes do not refetch destinations. No new Map/detail feature.
- **Evidence:** US-11 29, US-10 Explore14, Map23, Destination61, Culture26, authorization21, account18 and auth36 =228/228 PASS. env generation, Prisma client generation, Next typegen, final check-types/build/diff check PASS. Initial stale generated/dependency artifacts and test-shim typing issue resolved before final checks; direct test-first failures were expected. Superpowers read-only review found three issues, corrected with regression evidence.
- **Runtime:** Guest on localhost production build + existing development DB: Enter submits three filters, loading→one public result, existing Detail→Back keeps exact URL/form values. Unsaved Clear resets controls; nonmatch empty and invalid-URL recovery work. Actual smoke server disconnect→technical error, restart→Retry success without F5. Explore360/768/1280 had no overflow;44px controls. Final screenshot outside Git `D:/KLTN/us11-evidence/explore-360.jpg`; viewport reset. No test DB writes, new users or production access.
- **Limits:** Thirty warmed HTTP requests on only1 existing public record measured p95=84ms/max86ms,30/30≤2s. Representative30–50 dataset, cold/deployed/concurrent p95 remain NOT PROVEN; no fabricated production records. BLOCKED: FIGMA exact Explore/Search frames/tokens (prior remote access denied; local thumbnail insufficient); current tokens/styles reused without pixel-perfect claim. Functional scope verified; full acceptance pending design/data/performance evidence. This turn does not mark separate US-12 acceptance complete. Exact changed paths/check commands and limits recorded in `docs/stories/US-11-destination-search-filter.md`.

## 2026-10-05 — US-11 UI aligned with inspected Figma

- Inspected desktop Explore6:47 and Destination Card4:145 through successful design-context/screenshots; read exact Input/Button/Badge tokens and mobile111:3/shared states111:243. Earlier FIGMA access blocker superseded for these references; local binary export versus current remote version is not independently proven.
- Presentation only: scoped Explore fonts (Be Vietnam Pro/Noto Serif), off-white/green/border tokens, 48px Search Input, region/category chip disclosures with native radio choices and keyboard focus restoration, contextual Clear, one shared-Card-based DestinationCard with canonical Link, 1/2/3-column grid and matching skeletons. URL/API/service/visibility/auth/schema/dependencies unchanged during this UI task.
- Public DTO has no photo/excerpt: retained neutral component media slot with explicit no-photo feedback, no fabricated dataset/assets/summary. Full Header/Culture/Map/Detail redesign excluded. Accent small-text color adjusted minimally from Figma4.46:1 to4.55:1 for contrast.
- Tests31 search +14 Explore +23 Map =68/68 PASS; final typecheck/build/diff PASS, no lint script. Browser verified combined filters, Enter submit, native radio keyboard operation, detail→Back exact state, nonmatch/Clear, distinct loading, real production network failure→same-page Retry.360/390/768/1024/1440 no horizontal overflow; viewport reset. Evidence outside Git at D:/KLTN/us11-ui-evidence/. Full file/command list and NOT PROVEN limits in the US-11 story.
- No DB writes, migration, commit or push. Production dataset30–50 and deployed performance acceptance remain pending; exact full-screen visual parity is not claimed.

## 2026-10-05 — US-16 Favorites list and management

- Audited clean HEAD343628a: no Favorite persistence/API/UI, no public Culture detail. Read required baselines, completed domain stories, actual Product/System DOCX requirements and shared authorization/idempotency. Completed READY story before code; implemented Destination + Culture scope only, no Trip/add flow/dependency changes.
- Inspected Figma MH-10 node7:158 design context and screenshot directly. /favorites reuses shared Header and UI Button/Card/Empty/Skeleton, scoped Noto Serif/Be Vietnam Pro, matching pills/card shell/native accent strips. Culture adapts same card. Header visual treatment preserved; no full pixel-perfect claim.
- Added minimal Favorite FK relation (exactly one Destination/Culture), unique user/target and owner scope. GET /api/favorites returns private no-store destinations/cultureContents. Hidden targets remain title-only UNAVAILABLE/null href; no hidden body selected. DELETE /api/favorites/[favoriteId] validates same-origin/key, Traveler role (also inside transaction), owner-constrained deleteMany; shared idempotency records confirmed relation removal atomically. Missing/foreign both404; no target deletion.
- /favorites has two local groups, loading/independent empty/read error+Retry, per-card pending/failed/unknown. Only confirmed SUCCESS removes card. Both groups remain mounted so UNKNOWN key survives switching; retries same key/ID through existing mutation client. Shared UserMenu exposes Favorites to Traveler. Minimal original /culture/[id] shell checks server public visibility, escapes body and validates source URL; no snapshot or full unrelated detail story.
- Reviewed SQL migration20261005120000_add_favorites and verified accepted Neon development endpoint/NODE_ENV before applying with Prisma migrate dev. Status7 migrations/up to date. No db:push or production DB changes.
- Checks: env:generate/db:generate PASS; new15 deterministic tests +1 guarded real DB integration PASS; regressions auth36/account18/authorization21/Destination61/Culture26/Explore14/search31/Map23 PASS — **246 total**. Final root types/build/diff PASS. Independent review found no critical/important bugs. Exact paths/commands/initial failures are recorded in docs/stories/US-16-favorites-list.md.
- Runtime: actual dev3001 and local production build3002 HTTP Guest401/Admin403, own groups200, hidden title-only, foreign delete404 and hidden Culture body absent. Browser original Destination/Culture navigation, Space/Enter switching, loading, per-card pending, FAILED retained card, offline UNKNOWN retained across groups then retry SUCCESS, read-only proxy500→safe error→Retry recovery and both independent empty messages verified.360/390/768/1024/1440 measured no horizontal overflow. Initial disposable Destination fixture lacked required seven-day schedule; corrected fixture only, then original detail passed.
- Cleanup: scoped fixture accounts/sessions/users/relations/targets/idempotency records and secret manifest removed; fixture account logged out; temporary runtime harness removed; viewport restored and test tabs/owned3002 server/3004 fault proxy closed. User dev server3001 preserved. Screenshots remain outside Git at D:/KLTN/us16-ui-evidence/.
- Limits: add-favorite flow remains absent/outside US-16; production user-data cycle, separate Edge/assistive-technology checks and exact shared Header visual parity NOT PROVEN. Local .fig versus remote version equivalence not independently proven. No commit or push.

## 2026-10-05 — US-14/US-15 story contracts

- **Branch:** duybinh. Documentation-only task; no commit, push, merge, or branch change.
- **Story/task:** Created DRAFT contracts for US-14 public Culture browse/detail/source/related Destinations and US-15 Traveler Favorite add/remove for Destination/Culture.
- **Completed:** Audited current Prisma schema, apps/web modules/routes, public Destination page, Culture public summary, Source representation, Favorite absence, Route Handler session helper, shared HTTP/idempotency helpers, and Node/tsx test framework. Recorded exact implemented/unimplemented dependencies, bounded scope, Vietnamese UX/error states, Given/When/Then acceptance criteria, and required Open Questions (a)–(g); US-15 also records the necessary initial Favorite-state read question.
- **Files changed:** docs/stories/US-14.md; docs/stories/US-15.md; docs/ai-progress.md.
- **DB/migration changes:** None. Schema and migration state were inspected only; no Prisma migration, db:push, seed, or development/production data write was performed.
- **Validation performed:** git diff --check PASS. npm run check-types was attempted and failed in existing web Prisma generated-client typing (Destination/CultureContent models missing from generated client). npm run build was attempted and failed before Next compilation at Varlock environment validation. Relevant workspace suites passed outside sandbox: npm run test:culture -w web 26/26, npm run test:destination -w web 61/61, npm run test:authorization -w web 21/21. Initial sandbox test attempts hit spawn EPERM; rerun with approved elevated execution passed.
- **Deployment/smoke result:** Not applicable; no application code or database state changed. No production access.
- **Known issues:** Stories remain DRAFT until Source model/RAG relationship, Culture visibility contract, Favorite Admin policy, Favorite trip boundary, Favorite list scope, destination route, Figma frames, and US-15 initial favorite-state read path are confirmed. check-types/build remain unresolved for the pre-existing environment/generated-client issues above.
- **Decisions:** Kept Guest/Traveler/Admin public-read parity; Traveler-only Favorite with Admin default 403; no duplicate user+target; remove preserves target; hidden target remains in Favorite but unavailable; no Guest write replay; writes use shared SUCCESS/FAILED/UNKNOWN and same-key/same-payload retry. No unresolved question was silently decided.
- **Next step:** Resolve story Open Questions and approve the contracts before implementation; then implement only the accepted story scope with Prisma migration review if Favorite/source modeling requires it.

## 2026-10-05 — US-14 P1 schema guard audit

- **Branch:** duybinh. No commit, push, merge, or branch change.
- **Story/task:** P1 Prisma schema + migration pre-check for US-14.
- **Completed:** Executed Step 0 and stopped duplicate model creation. Existing Destination, CultureContent, inline Culture source metadata, and CultureDestination were verified. US-09 is ACCEPTED and explicitly chose sourceTitle/sourceUrl on CultureContent with no separate source lifecycle/RAG relation.
- **Files changed:** docs/stories/US-14.md; docs/ai-progress.md. No Prisma schema, migration, seed, or application code was changed.
- **DB/migration changes:** None. Existing migration 20261005021531_add_culture_content_domain remains the canonical development migration for CultureContent/CultureDestination; no new migration was generated or applied, and production was not touched.
- **Validation performed:** npm run db:generate was attempted in sandbox and outside sandbox; sandbox hit Varlock spawn EPERM, elevated retry reached a Windows Node/Prisma assertion failure (exit -1073740791) and generated files remained unchanged. npm run check-types failed on the pre-existing generated Prisma client missing Destination/CultureContent types. npm run build failed at the same Varlock/Node runtime boundary before Next compilation. git diff --check was run; new story files had no trailing whitespace.
- **Deployment/smoke result:** Not applicable; Step 0 prevented schema change and no database write/migration/seed was performed.
- **Known issues:** The requested P1 ContentStatus/slug/summary/body/coverImageUrl/CultureSource/CultureContentDestination shape conflicts with existing accepted schema and source decision. It requires an explicit story/architecture decision before any additive migration. Prisma generate/build/typecheck remain environment/generated-client blockers.
- **Decisions:** No parallel Destination, CultureContent, CultureSource, or join model was created. US-14 Data Contract and Migration Impact now name the real current fields and explain why migration is NO for this task.
- **Next step:** Confirm whether US-09 inline source/schema is the final baseline. Only after an approved override should a separate schema story define migration, SQL review, seed, and runtime acceptance.

## 2026-10-05 — US-14 public Culture API

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US14-BE — public list/detail API for Culture content, dependent on the existing US-09 schema baseline.
- **Completed:** Added thin `GET /api/culture` and `GET /api/culture/[idOrSlug]` handlers for public Guest/Traveler/Admin reads. Added Zod query/identifier/response contracts and a Culture service with canonical VISIBLE Culture/Destination filters, Vietnamese validation errors, stable `updatedAt DESC, id ASC` ordering, `page/pageSize` pagination (default 1/12, maximum 50), case-insensitive q search, destinationId filtering, safe inline-source projection, and the shared API envelope. Hidden/missing Culture detail uses the same `404 CULTURE_CONTENT_UNAVAILABLE` response; hidden Destination relations are excluded. Current accepted schema has no slug/summary/cover/source table, so the compatibility projection uses `slug=id`, content excerpt as summary, `coverImageUrl=null`, and inline source metadata.
- **Files changed:** `apps/web/src/modules/culture/culture.schema.ts`, `culture.types.ts`, `culture.service.ts`, `culture.service.test.ts`; `apps/web/src/app/api/culture/route.ts`; `apps/web/src/app/api/culture/[idOrSlug]/route.ts`; `apps/web/package.json`; `docs/stories/US-14.md`; `docs/ai-progress.md`. Existing P0 `docs/stories/US-15.md` was preserved and not modified by this task.
- **DB/migration changes:** None. P1 Step 0 remains authoritative: no duplicate model, migration, seed, `db:push`, or production database access.
- **Validation performed:** `npm run test:culture -w web` PASS 31/31; `npm run test:explore -w web` PASS 14/14; `git diff --check` PASS. `npm run check-types` remains blocked by the pre-existing generated Prisma client missing `Destination`/`CultureContent` models, affecting existing and new Prisma-typed code. `npm run build` remains blocked before Next compilation by the existing Varlock/Node Windows assertion (`UV_HANDLE_CLOSING`, exit `-1073740791`).
- **Deployment/smoke result:** Existing local dev server on port 3001 responded `400 VALIDATION_ERROR` for `pageSize=51` and `404 CULTURE_CONTENT_UNAVAILABLE` for an invalid detail identifier. List curl returned `500 INTERNAL_SERVER_ERROR` because the current runtime DB/generated client could not query; seeded-development list/hidden/destination-hidden behavior is therefore not claimed as live acceptance.
- **Known issues:** US-14 remains DRAFT. No UI was implemented. Runtime acceptance with seed data is pending repair/regeneration of the Prisma client and a usable development DB connection. Existing schema differences and story Open Questions remain unresolved.
- **Decisions:** Chose `page/pageSize` rather than cursor pagination; reject out-of-range/unknown/repeated query parameters; choose `destinationId` rather than `destinationSlug` because the canonical Destination model has no slug; preserve US-09 inline source metadata; keep Route Handlers session-free and public; use `no-store`.
- **Next step:** Repair the pre-existing Prisma generated-client/runtime blocker or provide a working Neon development runtime, then rerun seeded curl acceptance. Resolve US-14 Open Questions before FE implementation or changing the canonical schema.

## 2026-10-05 — US-14 culture browse UI

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US14-FE1 — public `/culture` browse page and navigation entry, dependent on US14-BE.
- **Completed:** Added a Server Component page that awaits Next 16 `searchParams`, calls `listPublicCulture(query, db)` directly, and keeps query state shareable through `q`, `destination`, and `page`. Added a small Client Component for URL-preserving search/filter, responsive public cards linking to `/culture/[slug]`, cover-image fallback/error handling, pagination, Vietnamese empty states for unfiltered/filtered results, skeleton loading, retryable `error.tsx`, and a `Văn hóa` header link. No Culture detail, Favorite, or Destination page work was added.
- **Files changed:** `apps/web/src/app/culture/page.tsx`, `culture-filter-bar.tsx`, `culture-cover.tsx`, `culture.css`, `loading.tsx`, `error.tsx`, `culture-page.test.tsx`; `apps/web/src/components/header.tsx`; `apps/web/package.json`; `docs/stories/US-14.md`; `docs/ai-progress.md`.
- **DB/migration changes:** None. No schema, migration, seed, `db:push`, or production database access.
- **Validation performed:** `npm run test:culture -w web` PASS 33/33; `npm run test:explore -w web` PASS 14/14; `git diff --check` PASS and new-file whitespace audit PASS. `npm run check-types` remains blocked only by the pre-existing generated Prisma client missing `Destination`/`CultureContent` models; no new typed-route/filter error remains. `npm run build` remains blocked before Next compilation by the existing Varlock/Node Windows assertion (`UV_HANDLE_CLOSING`, exit `-1073740791`).
- **Deployment/smoke result:** Existing dev server returned HTTP 200 for `/culture` and rendered the Vietnamese header, filter shell, and streamed loading skeleton. The list server component then failed at `cultureContent.findMany` because the current runtime Prisma client has no generated Culture model, so no seeded cards/search result was claimed. Query `/culture?q=le&page=2` reached the same server path. CUA browser smoke could not start because the computer-use kernel assets were unavailable.
- **Known issues:** Figma frame/image was not supplied or inspectable; the UI is explicitly a simple component-based layout pending Figma comparison. Seeded list/card and 360px browser acceptance remain pending the Prisma generated-client/runtime repair.
- **Decisions:** Chose page pagination to match US14-BE; used free-form canonical Destination ID for `destination` because no public destination selector/slug contract exists, and recorded that as Open Question (h). Kept all data loading server-side and no login boundary.
- **Next step:** Repair/regenerate the Prisma client and provide a working development runtime, then verify seeded PUBLISHED cards, search/filter, pagination, empty/error/retry and 360px keyboard/responsive behavior; resolve the destination-filter UX and Figma Open Questions before detail UI.

## 2026-10-06 — US-14 Culture detail UI

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US14-FE2 — public Culture detail page, dependent on US14-BE and US14-FE1.
- **Completed:** Added Server Component `/culture/[slug]` using the existing `getPublicCulture` service directly, Next 16 Promise `params`/`searchParams`, dynamic `generateMetadata`, Vietnamese unavailable/not-found and technical-error states, loading skeleton, safe plain-text paragraph rendering, Asia/Ho_Chi_Minh updated time, responsive cover fallback and back-link query preservation. Added empty DOM slots for Source, related Destinations and Favorite only; no feature logic or UI for those out-of-scope sections.
- **Files changed:** `apps/web/src/app/culture/[slug]/page.tsx`, `culture-detail-cover.tsx`, `culture-detail-slots.tsx`, `culture-detail.css`, `loading.tsx`, `not-found.tsx`, `error.tsx`; `apps/web/src/app/culture/culture-detail.test.tsx`; `apps/web/package.json`; `docs/stories/US-14.md`; `docs/ai-progress.md`.
- **DB/migration changes:** None. No schema, migration, seed, `db:push`, or database write. Existing accepted inline source/visibility schema remains unchanged.
- **Validation performed:** `npm run test:culture -w web` PASS 35/35 and `npm run test:explore -w web` PASS 14/14 after elevated reruns (sandbox-only attempts hit `spawn EPERM`); `git diff --check` PASS. `npm run check-types` remains blocked by the pre-existing generated Prisma client missing `Destination`/`CultureContent` models. Root `npm run build` (Turbo, including `web`) was rerun with elevated execution and failed before Next compilation at the existing Varlock/Node Windows assertion (`UV_HANDLE_CLOSING`, exit `3221226505`).
- **Deployment/smoke result:** Seeded browser/detail smoke is not claimed. Existing local runtime can render the route shell, but the current generated Prisma runtime cannot query `cultureContent`; CUA browser initialization also remains unavailable. No production access.
- **Known issues:** Story remains DRAFT. Figma frame/image was not supplied or inspectable, so the detail layout is explicitly not Figma-verified. Seeded Published/hidden/missing detail and 360px browser acceptance remain pending Prisma client/runtime and CUA repair. Open Question (i) records that the body is currently rendered as plain text; no Markdown-to-HTML conversion was introduced.
- **Decisions:** Hidden and missing Culture detail both call `notFound()` and render the same friendly “Nội dung không khả dụng” page, matching the public API contract and preventing private-data disclosure. Metadata also uses generic unavailable text on unavailable/technical lookup. Source, related Destination and Favorite remain structural slots only.
- **Next step:** Repair/regenerate the Prisma client and provide a working Neon development runtime, then rerun seeded detail/browser acceptance for Published, hidden, missing, back-link query context and 360px overflow/keyboard behavior; resolve remaining US-14 Open Questions before Source/related UI work.

## 2026-10-06 — US15-DB preflight blocked by missing applied migration

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-DB — Favorite relational model and migration for Destination/Culture content.
- **Completed:** Audited Neon `development` read-only and found an existing `favorite` table plus applied migration `20261005120000_add_favorites` that is absent from the local migration directory. Recorded the exact current shape: `destinationId`/`cultureId`, User CASCADE FK, target RESTRICT FKs, two user+target unique indexes, and a CHECK requiring exactly one target. Updated US-15 Data Contract, Migration Impact, Acceptance Evidence, and Open Questions with the mismatch and safe recovery requirement.
- **Files changed:** `docs/stories/US-15.md`, `docs/ai-progress.md`. A temporary Prisma model/relation patch was reverted; no application/schema/migration file was retained for this blocked task.
- **DB/migration changes:** None applied. `migrate dev --create-only --name add_favorite` reached Neon through the repository environment wrapper, then stopped on drift and the missing applied migration; no reset, `db:push`, direct SQL mutation, or production access was performed.
- **Validation performed:** Read-only database metadata audit completed; `git diff --check` PASS and story/progress whitespace audit PASS. `npm run db:generate` failed at the existing Windows Node/Prisma assertion (`UV_HANDLE_CLOSING`, exit `3221226505`); `npm run check-types` failed on the pre-existing generated Prisma client missing Destination/CultureContent types; `npm run build` failed before Next compilation at the same assertion. Favorite runtime constraint tests were not run because the requested migration was not applied.
- **Deployment/smoke result:** Not applicable; the requested contract was not applied because reconciling an applied-but-missing migration cannot be done safely by inference.
- **Known issues:** Local Prisma schema has no Favorite model while Neon development already has a different Favorite shape. The exact missing migration file/checksum cannot be recovered from the current checkout, so Prisma refuses to generate the requested migration without a destructive reset/reconciliation decision.
- **Decisions:** Do not create a parallel model, silently accept `cultureId`, edit `_prisma_migrations`, reset the public schema, or use `db:push`. Keep US-15 DRAFT until the migration source is restored or a controlled reconciliation plan is explicitly approved.
- **Next step:** Restore the exact `20261005120000_add_favorites` migration from the authoritative source (or approve a reviewed reconciliation plan), then re-run Prisma migration generation/review and the requested constraint/cascade checks on `development`.

## 2026-10-06 — US-14 Culture sources and related destinations UI

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US14-FE3 — public Culture detail source references and related public Destinations.
- **Completed:** Completed the existing FE3 implementation by rendering a truthful source section (including the Vietnamese no-source message), stable `sortOrder`, optional publisher/citation display, HTTP(S)-only external links with `target="_blank"` and `rel="noopener noreferrer"`, and a related Destinations section using the existing `/destinations/[id]` route. Hidden Destinations remain excluded by the public service; an empty related list hides the section. Added trim/safety handling for source URLs and long text wrapping.
- **Files changed:** `apps/web/src/app/culture/[slug]/culture-source-utils.ts`, `culture-sources.tsx`, `related-destinations.tsx`, `culture-detail-slots.tsx`, `culture-detail.css`, `apps/web/src/app/culture/culture-detail.test.tsx`, `docs/stories/US-14.md`, `docs/ai-progress.md`.
- **DB/migration changes:** None. Reused the accepted US-09 inline `sourceTitle/sourceUrl` projection; no Source model, RAG relation, Destination route, Favorite control, or schema change was added.
- **Validation performed:** `npm run test:culture -w web` PASS 37/37; `git diff --check` PASS. `npm run check-types` and `npm run build` remain unresolved due the pre-existing generated Prisma client missing Destination/CultureContent and the Windows Varlock/Node assertion before Next compilation.
- **Deployment/smoke result:** Seeded browser verification was not claimable because the Prisma runtime/client blocker prevents querying Culture data and CUA browser assets are unavailable. Figma frame/image was not supplied, so the simple component layout is not Figma-verified.
- **Known issues:** The accepted schema exposes only inline source title/URL; publisher/citation are not currently persisted, so no values were invented. Runtime cases for source/no-source/multiple-or-empty related Destinations and 360px browser overflow remain pending environment repair.
- **Decisions:** Keep the Sources section visible when empty; hide Related Destinations when empty; link public related Destinations to `/destinations/[id]`; reject unsafe source schemes at render boundary; keep US-14 DRAFT because broader seeded/browser and type/build evidence is incomplete.
- **Next step:** Repair/regenerate the Prisma client and provide a usable development runtime, then run seeded browser/curl checks for the three FE3 data cases and 360px keyboard/overflow behavior.

## 2026-10-06 — US15-BE preflight blocked by US15-DB

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-BE — Traveler Favorite add/remove/status API with shared idempotency.
- **Completed:** Audited the existing server boundary and confirmed reusable `requireActor`, Better Auth session resolution, shared API envelopes, `requireIdempotencyKey`, and `executeIdempotentWrite`. Confirmed the repository has no generated Prisma Favorite model and no local Favorite schema while Neon `development` has an incompatible applied Favorite shape.
- **Files changed:** `docs/stories/US-15.md`, `docs/ai-progress.md`. No Route Handler, module, auth helper, or application code was added.
- **DB/migration changes:** None. No endpoint or SQL was executed; no Favorite model was created in parallel and no `cultureId`/`cultureContentId` assumption was introduced.
- **Validation performed:** `git diff --check` remains required after this documentation append. Existing `npm run db:generate`, `npm run check-types`, and `npm run build` results remain blocked by the generated Prisma client/Windows Node assertion documented in the previous US15-DB entry; Favorite curl/runtime tests were not run because the dependency is not resolved.
- **Deployment/smoke result:** Not applicable; no API was implemented and no database write was performed.
- **Known issues:** US15-BE cannot safely compile or run until the applied-but-missing Favorite migration is restored or a reviewed reconciliation is approved. The route target segment convention and session-role-vs-persisted-role helper choice are recorded as Open Questions.
- **Decisions:** Do not create a fake Favorite service against the incompatible database table, do not bypass server authorization/idempotency, and do not add a Favorite list endpoint outside scope. Keep US-15 DRAFT.
- **Next step:** Resolve US15-DB migration history and confirm the two recorded BE contract choices, then implement only the thin routes and `apps/web/src/modules/favorites/` service against the generated Prisma contract.

## 2026-10-06 — US15-DB continuation re-audit remains blocked

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-DB continuation — re-check the Favorite migration blocker before any schema write.
- **Completed:** Re-read Neon `development` metadata. The database still has `favorite(id, userId, destinationId, cultureId, createdAt)`, User CASCADE FK, Destination/Culture RESTRICT FKs, unique indexes for user+target, and `favorite_exactly_one_target_check`; `_prisma_migrations` still contains applied `20261005120000_add_favorites` with no matching local migration file. Read-only `prisma migrate status` was also run; it cannot restore the missing migration source.
- **Files changed:** `docs/stories/US-15.md`, `docs/ai-progress.md`. No Prisma schema/model or application code was added.
- **DB/migration changes:** None. No `migrate dev`, `migrate deploy`, `db:push`, reset, direct SQL write, or `_prisma_migrations` edit was performed.
- **Validation performed:** Read-only metadata audit completed; no Favorite migration was generated because the applied-but-missing migration makes reconciliation unsafe. Existing `db:generate`, `check-types`, and `build` blockers remain unchanged from prior entries.
- **Deployment/smoke result:** Not applicable; the requested contract is still not applied and constraint runtime tests were not run against the incompatible table shape.
- **Known issues:** The exact applied migration SQL/checksum cannot be reconstructed safely from current schema metadata. The requested `targetType`/`cultureContentId` model therefore remains unimplemented.
- **Decisions:** Continue to avoid parallel models, guessed migration files, direct database repair, schema reset, and `db:push`.
- **Next step:** Restore the authoritative `20261005120000_add_favorites/migration.sql` (or approve a reviewed reconciliation plan), then add the requested Prisma model and additive migration with SQL CHECK review.

## 2026-10-06 — US15-DB migration source recovery attempt

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-DB — recover the applied Favorite migration so the requested model/migration can continue.
- **Completed:** Searched the workspace and Git branches/history/reflog for `20261005120000_add_favorites`, `favorite_exactly_one_target_check`, and the applied Favorite migration content. No authoritative migration file was found.
- **Files changed:** `docs/stories/US-15.md`, `docs/ai-progress.md` only. No schema, migration, application code, or generated client changes.
- **DB/migration changes:** None. Neon metadata was read-only; no guessed migration, direct SQL, `_prisma_migrations` edit, reset, or `db:push` was performed.
- **Validation performed:** Workspace/Git source search completed; exact migration checksum remains unavailable. Existing `db:generate`, `check-types`, and `build` failures remain documented.
- **Deployment/smoke result:** Not applicable; the requested Favorite contract was not applied.
- **Known issues:** Restoring only a guessed file could create a checksum mismatch or corrupt migration history. The requested schema still differs from the existing applied table (`cultureId` versus `cultureContentId`, no `targetType`).
- **Decisions:** Stop before database mutation. Require the authoritative migration file/backup, or an explicit approved reconciliation procedure, before continuing.
- **Next step:** Provide the original migration file or approve a documented reconciliation plan covering migration ledger recovery, existing-row mapping, `targetType` backfill, `cultureId` rename, and SQL CHECK review.

## 2026-10-06 — US15-BE Traveler Favorite API

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-BE — add/remove/status Favorite for Traveler, dependent on the applied US15-DB contract.
- **Implemented:** Added `requireTraveler` with server-side Better Auth session role check plus persisted User role re-check; added Zod target parsing and `apps/web/src/modules/favorites/` service/HTTP/server modules; added `PUT|DELETE /api/favorites/[targetType]/[targetId]` and `GET /api/favorites/status`.
- **Contract choice:** URL target types are `destinations` and `culture`, mapped internally to `DESTINATION` and `CULTURE_CONTENT`. Writes use `favorite:add`/`favorite:remove`, mandatory `Idempotency-Key`, `createMany({ skipDuplicates: true })` for add, target-scoped `deleteMany` for remove, and shared SUCCESS/FAILED/UNKNOWN response mapping. No Favorite list endpoint was added.
- **Security/visibility:** Guest receives 401 `UNAUTHENTICATED`; Admin/non-Traveler receives 403 `FORBIDDEN`; auth runs before idempotency/target persistence. Add accepts only VISIBLE Destination/Culture targets and returns 404 `FAVORITE_TARGET_UNAVAILABLE` otherwise. Remove can clear a hidden target and never deletes the target. Status is private/no-store.
- **Compatibility:** Renamed the existing one-segment US-16 route folder from `[favoriteId]` to `[targetType]` without changing its URL to avoid a Next dynamic-route collision. Removed the duplicate legacy Culture `[id]` route because canonical `[slug]` already handles `/culture/{id}`; no destination page was created.
- **Validation:** `npm run test:favorite -w web` PASS 20/20; `npm run test:authorization -w web` PASS 21/21; `npm run test:culture -w web` PASS 37/37; `npm run test:destination -w web` PASS 61/61; `npm run test:explore -w web` PASS 14/14; `npm run check-types -w web` PASS; `git diff --check` PASS. Real development cookie smoke covered Guest 401, Admin 403, Traveler add/duplicate/replay/key conflict/missing key/hidden target/remove/status, plus concurrent add with one resulting row. Disposable users and rows were cleaned up.
- **Build limit:** `npm run build -w web` still stops at the Windows Node/Varlock runtime assertion `UV_HANDLE_CLOSING` before Next compilation; no application compile error was observed in that run. `db:generate` has the same environment limitation from the DB task. This is recorded as unresolved build evidence, not marked as passing.
- **Next step:** US15-FE should wire the status/add/remove contracts into Destination/Culture detail buttons and retain SUCCESS-only UI transitions. Repair the local Node/Varlock runtime before final story acceptance/build evidence.

## 2026-10-06 — US15-DB Favorite target contract applied

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US15-DB — Favorite relation for Destination/Culture content.
- **Completed:** Updated `packages/db/prisma/schema/favorite.prisma` with `FavoriteTargetType { DESTINATION CULTURE_CONTENT }`, nullable `destinationId`/`cultureContentId`, User CASCADE and target RESTRICT relations, two user+target unique constraints, and `(userId, createdAt)` index. Existing reverse relations on User, Destination, and CultureContent are used; no TRIP field was added.
- **Migration:** Added `packages/db/prisma/migrations/20261006150000_upgrade_favorite_target_contract/migration.sql`. It creates the enum, drops/recreates the old target check and culture unique index, renames `cultureId` to `cultureContentId`, backfills `targetType`, rejects invalid existing rows before NOT NULL, restores the exact-one CHECK, unique/index constraints, and the CultureContent FK. The previously applied migration was not edited.
- **Database:** `npx varlock run -- npx prisma migrate deploy` applied the new migration on Neon `development`. Read-only metadata verified the columns, enum, User CASCADE FK, Destination/Culture RESTRICT FKs, unique indexes, createdAt index, exact-one CHECK, and zero remaining fixture rows.
- **Constraint evidence:** Disposable development fixtures verified duplicate Favorite rejection, both-target CHECK rejection, neither-target CHECK rejection, and User-delete cascade. Fixtures were cleaned up. No production database was accessed.
- **Compatibility updates:** Updated the existing US-16 Favorite service/tests/integration fixture references from `culture`/`cultureId` to `cultureContent`/`cultureContentId` and `targetType` so they match the generated contract once Prisma client generation is available. US15-BE add/remove/status routes and UI were not implemented.
- **Validation:** `npm run test:favorite -w web` PASS (15/15 unit/client tests). `npx varlock run -- npx prisma validate` reported the schema valid. `git diff --check` PASS before documentation edits. `npm run db:generate` still fails at the Windows Node/Prisma runtime assertion `UV_HANDLE_CLOSING` (exit `3221226505`); `npm run check-types` therefore reports stale generated Prisma types and `npm run build` stops at the same runtime assertion before Next compilation.
- **Known limits:** `prisma migrate dev --create-only` could not run in the non-interactive environment, so the additive SQL was produced from a read-only Prisma diff and manually reviewed before `migrate deploy`. The story remains DRAFT because US15-BE/FE and final generated-client/build evidence are incomplete. Existing merge conflict markers elsewhere in `docs/ai-progress.md` were not rewritten.
- **Next step:** Repair the local Node/Prisma runtime or regenerate the client in a compatible environment, rerun `npm run db:generate`, `npm run check-types`, and `npm run build`, then implement US15-BE against this schema.

## 2026-10-06 — US15-FE1 Favorite button

- **Branch:** `duybinh`; no commit, push, merge, or branch change. Figma for the Favorite control was not supplied.
- **Story/task:** US15-FE1 — shared Favorite UI, initial status, Guest auth return, and detail-page wiring. FE2 mutation was intentionally not implemented.
- **Implemented:** Added `apps/web/src/components/favorite-button.tsx` as a client component using `@KLTN/ui` Button and lucide `Heart`. Props are `targetType`, `targetId`, optional `initialIsFavorite`, optional `onToggle(nextIsFavorite, context)`. It exposes `aria-pressed`, Vietnamese labels, a disabled spinner state, loading skeleton, unknown status with retry, and confirmed-state-only callback handling.
- **Auth/state:** Traveler without an initial value reads `GET /api/favorites/status`; a status failure remains unknown and never assumes not-favorite. Guest navigation uses the existing safe internal `returnTo` resolver with pathname/query/hash and does not replay after login. Existing sign-in/sign-up forms already preserve safe `returnTo`. Admin is hidden by policy rather than showing a control that always returns 403.
- **Integration:** Mounted Culture Favorite at `apps/web/src/app/culture/[slug]/culture-detail-slots.tsx` with `targetType="culture"`, and Destination Favorite at the existing `apps/web/src/app/destinations/[id]/destination-detail.tsx` with `targetType="destinations"`. No destination page was created. Unavailable detail states do not render the control. FE2 should plug into the documented `onToggle` contract and keep PUT/DELETE/idempotency there.
- **Validation:** `npm run test:favorite -w web` PASS 23/23; `npm run test:culture -w web` PASS 37/37; `npm run test:destination -w web` PASS 61/61; monorepo `npm run check-types` PASS. A first Destination regression exposed SSR useRouter without an App Router context; replaced it with event-only `window.location.assign` through the safe login helper, then added a hydration mount gate after browser smoke exposed skeleton/button mismatch. Final localhost browser smoke showed Culture/Destination buttons, Guest login `returnTo`, no console hydration error after the fix, and the narrow responsive layout; `git diff --check` passed.
- **Build limit:** `npm run build -w web` was retried outside the sandbox and still stops at Windows Node/Varlock `UV_HANDLE_CLOSING` before Next compilation (exit `3221226505`). No application compile error was observed in the build run.
- **Next step:** Implement US15-FE2 mutation client using the `onToggle` hook, shared idempotency key/recovery contract, and confirmed SUCCESS-only state updates.

## 2026-10-06 — US15-FE2 Favorite mutation client

- **Branch:** `duybinh`; no commit, push, merge, or branch change. Figma Favorite control was not supplied.
- **Story/task:** US15-FE2 — connect the shared FavoriteButton to Traveler add/remove APIs and apply only confirmed server state.
- **Implemented:** `apps/web/src/components/favorite-button.tsx` now uses the shared `sendIdempotentMutation` and `createIdempotencyKey`. The action is derived from confirmed state (`PUT` add / `DELETE` remove) and the parsed server `data.isFavorite` is the only source allowed to update UI state.
- **Idempotency/recovery:** One `{key, method, url}` attempt is held in a ref until SUCCESS or FAILED. UNKNOWN keeps the attempt and retries the identical request/key; FAILED clears it so a later new intent gets a new key. Pending state plus an in-flight ref blocks double-click/parallel writes. Stale responses are ignored after unmount or target change.
- **Errors/accessibility:** 401 clears the attempt and follows the Guest safe login flow without replay; 403 shows a permission message; `FAVORITE_TARGET_UNAVAILABLE` shows unavailable-content feedback; other FAILED responses use `error.message`. SUCCESS/FAILED/UNKNOWN use Sonner plus `aria-live`; pending uses `disabled` and `aria-busy`.
- **Compatibility:** The existing `onToggle` prop remains available as an override and receives the generated key/method; its result is normalized to the same confirmed mutation contract. No `router.refresh()` was needed because detail pages have no server-dependent favorite summary.
- **Validation:** `npm run test:favorite -w web` PASS 24/24; monorepo `npm run check-types` PASS after parsing/validating the mutation DTO. Source contract now covers helper reuse, PUT/DELETE mapping, same-key UNKNOWN retry, 401/403/404 handling, single-flight guard, toast/aria feedback and confirmed-only state update. `git diff --check` to be rerun after final docs patch.
- **Manual/browser evidence:** Guest detail smoke confirmed the Favorite control routes to `/login?returnTo=...` without replay and the console stayed clean. No Traveler session was available in the browser, so real add/remove and network-loss UI smoke are not claimed; the confirmed-state, same-key retry and single-flight paths are covered by source contract plus BE/integration evidence.
- **Build:** `npm run build -w web` PASS — Next compiled successfully, TypeScript passed, 21/21 static pages generated, and route optimization completed.
- **Remaining acceptance gap:** A real Traveler browser session was not available, so add/remove and network-loss browser smoke is not claimed. No Favorite list/trip endpoint is added by this task.

## 2026-10-06 — US14-TEST Vitest and Culture coverage

- **Branch:** `duybinh`; no commit, push, merge, or branch change.
- **Story/task:** US14-TEST — deterministic service/Route Handler tests, source URL helper coverage, test-runner decision and manual UI checklist.
- **ADR-14:** Added `docs/decisions.md` entry with status `Proposed — awaiting product/technical owner approval`. The proposal adds Vitest to `apps/web`, a strict Node config with `@/`/`@KLTN/ui` aliases, root/Turbo `test` entry points, database injection/mocking, and no Playwright; existing `tsx --test` suites remain in `test:legacy`.
- **Implementation:** Added `apps/web/vitest.config.mts`, Vitest devDependency, `apps/web` `test`/`test:legacy` scripts, root `npm run test`, and Turbo `test` task. Added `apps/web/src/modules/culture/us14-culture.vitest.test.ts` with seven tests covering PUBLISHED-only list, q/destination filters, pagination/validation/empty success, strict detail/source/related projection, hidden/missing parity, direct GET Route Handlers with fake Requests and mocked `@/services`, envelope shape, and HTTP(S)-only source URL sorting. Culture service already accepted an injected database parameter, so no behavior-changing refactor was needed.
- **Automated validation:** Root `npm run test` PASS: Vitest 7/7 plus legacy suites 265/265, 272 total; `npm run check-types` PASS; `npm run build` PASS (Next compile, TypeScript, 21/21 static pages); final `git diff --check` PASS with only Git LF→CRLF warnings.
- **Manual UI evidence:** Localhost seed smoke checked Culture loading/list, search-empty, invalid-filter error, detail source + related destination link, and Enter-key search. No-source, many/empty-related, hidden/missing detail, technical-error/retry, and 360px overflow cases lacked suitable browser fixture/viewport setup and remain explicitly unchecked in US-14; automated tests cover the applicable service/UI contracts.
- **Security/scope:** No Neon connection, secret, schema/migration, or Playwright was added. Vitest tests use fakes/mocks only. `npm install` reported existing audit output (10 high severity vulnerabilities); no unrelated `npm audit fix` was run.
- **Next step:** Owner reviews/approves ADR-14 and the ACCEPTED US-14/US-15 evidence; run remaining manual fixture/360px/Traveler browser checks if required before marking either story IMPLEMENTED.

## 2026-10-07 — US15-TEST Favorite service, route and client contract tests

- **Branch:** `duybinh`; no commit, push, merge, or branch change. Figma for the Favorite control was not supplied.
- **Story/task:** US15-TEST — deterministic tests for Favorite auth, visibility, duplicate/idempotency, ownership, UNKNOWN recovery and FavoriteButton client state.
- **Implemented:** Added `apps/web/src/modules/favorites/us15-favorites.vitest.test.ts` with fake/in-memory database and mocked `favoritesDependencies`; direct Route Handler calls cover Guest 401 and Admin 403 before DB/idempotency, Traveler add, PUBLISHED-only target, hidden/missing 404, duplicate different keys, concurrent add one row, replay/key reuse/missing key, remove hidden target without deleting it, user ownership isolation, and UNKNOWN 503 followed by same-key retry.
- **Client logic:** Added `apps/web/src/components/favorite-mutation-logic.ts` and wired it into `FavoriteButton`; `apps/web/src/components/us15-favorite-client.vitest.test.ts` covers FAILED/UNKNOWN state retention, SUCCESS-only update, identical UNKNOWN retry request/key, PUT/DELETE derivation, single-flight guard, Guest login/no-write decision and safe internal `returnTo`. No jsdom or Playwright was added.
- **Validation:** Root `npm run test` via Turbo PASS — Vitest 18/18 plus legacy 265/265, 283 total. Root `npm run check-types` PASS (Turbo 4 tasks). Root `npm run build` PASS — Next compile, TypeScript, static generation 21/21 and route optimization. `git diff --check` PASS with only Git LF→CRLF warnings.
- **Database evidence:** No live DB was used in CI; US15-DB Neon development evidence remains the source for unique, exact-one CHECK, FK behavior and User cascade. The new fake DB models unique/rollback behavior for stable automation.
- **Limits/status:** Traveler browser add/remove and network-loss smoke still lacks a real Traveler session; it is not claimed as complete. US-14 and US-15 are marked ACCEPTED for owner review, not IMPLEMENTED. No Favorite list/trip endpoint was added.

## 2026-10-07 — US-11 Task 144 browser-history regression

- **Fix:** Explore committed search/filter and List/Map changes use Next App Router `router.push(..., { scroll: false })`, preserving normal history entries and URL-backed state. Retry on an unchanged URL still retries the current API read. Destination detail remains a canonical Next `<Link>`; no return URL, storage, schema, or migration was added.
- **Root-cause confidence:** The reported “Back returns to `/`” could not be reproduced on this branch before the fix in the local Chrome smoke. The implementation mixed native `window.history.pushState` with App Router detail navigation; that was the primary history-stack risk, so committed Explore navigation was made consistent with the router. The original intermittent trigger is not independently proven.
- **Browser:** Home → Explore → q=Manual → region=đồng văn → category=văn hóa → detail → browser Back once returned `/explore?q=Manual&category=v%C4%83n+h%C3%B3a&region=%C4%91%E1%BB%93ng+v%C4%83n`; input, both filter chips and matching result were restored. Forward returned to the same detail, then Back restored Explore. Reload restored the URL and form. List/Map preserved q/category/region and `culturePage=1`; Culture remained visible and independent.
- **Checks:** `npm run test:search --workspace web` 32/32, `npm run test:explore --workspace web` 14/14, `npm run test:map --workspace web` 24/24, `npm run test:destination --workspace web` 61/61, `npm run check-types`, `npm run build` and `git diff --check` PASS.
- No production writes, schema changes, migrations, commit or push.

## 2026-10-07 — US-16 direct Header link

- Added `Yêu thích` to the shared main Header navigation at `/favorites`.
- Kept the existing Traveler-only UserMenu entry and server-side authorization unchanged; the page remains protected for Guest/Admin users.
- Validation: targeted TypeScript check and Favorite regression tests run after the navigation change; `git diff --check` required.

## 2026-10-07 — Sprint 2 documentation closure

- **Functional closure:** US-07 DONE; US-08 DONE; US-09 ACCEPTED; US-10 ACCEPTED; US-11 IMPLEMENTED / functional acceptance passed; US-12 ACCEPTED / DONE including task149; US-13 ACCEPTED; US-14 ACCEPTED; US-15 ACCEPTED; US-16 IMPLEMENTED with scoped behavior accepted.
- **US-11/US-12:** Search, filters, List/Map state preservation and Detail → browser Back are functionally verified. US-12 task149 manual evidence is recorded in its story. Performance against a representative 30–50 Destination dataset is not claimed.
- **EN-02:** No EN-02 story exists in this repository. The real Hà Giang dataset (30–50 Destinations with metadata/coordinates/hours/duration and 20–50 Culture/RAG documents, import/seed and QA/versioning) is CARRIED OVER / DEFERRED TO SPRINT 3. Sprint 2 prioritized closing Explore/Map/Culture/Favorites; this dataset is a dependency for RAG/Trip Planning and representative performance validation. The external backlog must move EN-02 to Sprint 3.
- **Evidence limits:** EN-02-dependent search/filter performance, RAG/Trip acceptance on a real dataset, and the still-unchecked browser/manual/accessibility/other-browser cases are not marked PASS. Historical blockers and results remain chronological and are superseded only where a later entry records successful validation.
- **ADR-14:** Remains Proposed — awaiting explicit product/technical owner approval. Vitest is present in the merged repository; implementation does not itself constitute approval of the ADR.

## 2026-10-08 — US-21 Task 191 RAG multi-turn contract

- **Owner/scope:** Tô Xuân Hoài; branch `TXH`, baseline HEAD `94d685bb1dc0daccfb9d4a08041dbff5da023c96`, initially clean worktree. Design rounds 1–3 and owner product decisions authorize contract, deterministic tests and documentation only. Task 191 is implemented for owner review; US-21 remains IN PROGRESS.
- **Contract:** Added pure `apps/web/src/modules/ai/qa-contract.ts` with strict first/follow-up requests, NFC/trim and JavaScript UTF-16 question bounds, GENERAL-only context, scalar Idempotency-Key validation and a 16 KiB HTTP-boundary requirement. Follow-up IDs are references; omitted context inherits the server-owned context, while explicit changes require a new conversation at runtime.
- **Response/citations:** Four COMPLETED content outcomes, shared-compatible SUCCESS/FAILED/UNKNOWN envelopes, constant server-controlled insufficient-source message, bounded clarification syntax, public metadata-only citations and deterministic duplicate/dangling/unreferenced citation checks. HTTP 202/admission success is excluded from the active response contract. URL syntax does not establish public access; Zod does not prove source authenticity or semantic grounding.
- **Future runtime invariants:** Server-managed PostgreSQL/Neon history interprets questions but is never factual evidence; every factual turn must use currently eligible INDEXED evidence, excluding DISABLED records. Ownership applies each turn; Guest identity is server-established, login does not migrate Guest history and logout isolates user history. Guest/user retention is 7/30 days, with rolling last-authorized-activity expiry explicitly an assumption; failed turns expire within 24 hours. Delete/cleanup must remove related records and cached idempotency content and prevent in-flight resurrection.
- **Tests:** Added `apps/web/src/modules/ai/qa-contract.vitest.test.ts`, 99 deterministic fixture tests. Focused tests PASS 99/99; root `npm run test` PASS including 117/117 Vitest tests and existing legacy suites; root `npm run check-types` PASS (four Turbo tasks); root `npm run build` PASS (Next compile, TypeScript, 21/21 static pages). Final `git diff --check` and untracked-file whitespace review PASS.
- **Documentation/backlog:** Added `docs/stories/US-21-rag-qa.md` covering active contracts, trust boundaries, lifecycle/errors/retention and US-17–23 dependencies. Proposed gaps, without invented IDs: conversation/history/delete; anonymous Guest bootstrap/isolation; lifecycle/concurrency/idempotency/recovery; multi-turn authorization/security tests; retention cleanup including cached responses.
- **Scope/limits:** No API route, conversation persistence, OpenAI/retrieval integration, Neon write, anonymous session, worker, UI, dependency/configuration, shared helper, schema or migration change; no commit/push/merge. Pure tests establish structural/reference invariants only. Owner review is required; stop after Task 191, without starting Task 192.

## 2026-10-08 — US-21 Task 195 shared Assistant frontend

- **Owner/baseline:** Tô Xuân Hoài authorized implementation after two design rounds. Branch TXH, HEAD and origin/TXH `1770a1a12781e06dbc813a15ea004af15ff12226`, clean worktree before. Figma reviewed: desktop 6:169, mobile 111:69, required states 111:208. Owner approved GENERAL, minimal Header wrapping, no bottom navigation and citation integration slot.
- **Delivered:** `/assistant` page, shared surface-independent controller/transport interface, reusable chat/turn/answer presentation and separate page shell. Production has no transport and displays unavailable with disabled composer; no Q&A request/mock fallback. Header adds Trợ lý AI and retains all existing entries/auth/theme. No popup/global provider.
- **Semantics:** Unchanged Task 191 schema validates requests/responses. Pending remains unconfirmed; only validated completed outcomes update head/IDs. Four outcomes render distinctly; parts retain citationIds for Task 196; text is escaped. Single-flight and conversation/turn deduplication prevent duplicate UI. UNKNOWN/network/malformed retain exact serialized body/key despite edited draft. Owner-approved abandon confirmation states cancellation/deletion are not implied and recovery may be lost, then invalidates generation; late/other-identity responses are excluded.
- **Demo:** `node apps/web/scripts/assistant-demo.mjs` from root, open http://127.0.0.1:3002. Separate development entry uses the same core and deterministic fake transport, marked DEMO / DỮ LIỆU MÔ PHỎNG. Existing esbuild bundles in memory; loopback-only server, no dependency/config/package change, no API/DB/provider. Production NODE_ENV is rejected. Restart after source edits.
- **Isolation:** Production-page esbuild import-graph test excludes development/tests and fixture markers. Real Next production JS/HTML/JSON scan under .next/static and .next/server found no fake transport, demo entry, fixture marker or synthetic source alias. Production route list has /assistant and no demo or Q&A API. Built-page browser smoke confirms disabled unavailable state.
- **Validation:** Focused 32/32 PASS; root tests PASS (149/149 Vitest plus legacy suites), root typecheck PASS (four tasks), build PASS (22/22 static pages), final tracked/untracked diff whitespace review PASS. Browser demo covers first/follow-up, pending, all outcomes, FAILED, UNKNOWN exact retry with edited draft, malformed retry, confirmation cancel/accept, focus, Shift+Enter, rapid Enter, 2000-unit question and non-forced message scroll. Demo/production at 360/390/768/1440 px have no horizontal overflow; demo light/dark and production Header/active link/disabled controls checked.
- **Limits/handoff:** Reduced 360x450 viewport keeps focused composer visible, but physical mobile keyboard, native IME, screen-reader audio, long-answer browser fixture, other browsers and complete Sprint 2 visual regression are not verified. Refresh loses in-memory attempts/history. Task 196 citation interactions, real transport/API, Guest bootstrap, conversation/history/recovery/retention, destination/culture popups and US-22/23 runtime remain future work. US-21 stays IN PROGRESS; Task 195 ready for owner review. No Task 191 contract/config/shared helper/dependency/schema/migration/environment change, OpenAI/Neon write, commit/push/merge. Stop after Task 195.

## 2026-10-08 — Task 195 owner review fix 1

- **Baseline/scope:** TXH at reviewed commit `a142de4170533df21668b42a57d258e31ac83f64`, clean before fix. Only controller, chat, focused regression tests and story/progress documentation changed.
- **Turn reconciliation:** Removed acceptance of an old confirmed turn for a new key, even with identical question text. Check requested parent against current head and returned turnId. Protocol-invalid replay preserves pending uncertainty, original payload/key and confirmed history/head. Same-key retry accepts the previously committed but locally unconfirmed result once; legitimate new turn advances head. Single-flight unchanged.
- **DOM IDs:** React useId gives each chat instance composer/help/dialog IDs with consistent label/ARIA references and deterministic SSR tree IDs. No UI/CSS/navigation or transport isolation change.
- **Validation:** Focused PASS 35/35; root regression PASS (152/152 Vitest plus legacy suites); root typecheck PASS (four tasks); build PASS (22/22 static pages). Tests distinguish same-intent retry, new-key old-parent/older-turn replay rejection including retries, legitimate head advance, and multiple-instance SSR unique/local references. Browser hydration not separately exercised for this fix.
- **Handoff:** No Task 191 contract, API, DB/migrations, provider call or Task 196 work. No commit/push. Wait for owner review.

## 2026-10-08 — Task 195 visual refinement

- **Baseline:** Owner authorized visual refinement against supplied mockup; TXH `904f32dd2e35936cc2256b9163fa0e96c32724f6`, clean before. No product/runtime extension.
- **Presentation:** Cream/forest-green/sage palette, centered 1320px 70/30 desktop grid, icons, centered empty state, dedicated decorative mountain SVG component, read-only context badge and principles rows. Composer send button beside input; scoped responsive/dark styles. No external fonts/images or dependencies added.
- **Demo/isolation:** Toolbar presentation uses development-only CSS; removed former inline styles from runner HTML. In-memory bundling/loopback server and production guard unchanged. Actual production build and import graph contain no demo/fake transport/fixtures/toolbar; production unavailable/disabled checked. Controller/qa-contract/demo transport untouched; useId and ARIA references preserved.
- **Validation:** Focused 36/36 PASS, root tests PASS (153/153 Vitest plus legacy), typecheck four tasks PASS, build 22/22 pages PASS. Cold graph test initially exceeded 5s after icon imports; allowed 15s for that bundling test only, no assertion weakening. Browser demo/production have no horizontal overflow at 1440/360/390/768; 1440x900 composer fully visible. Empty, sending/completed demo, reset, mobile input focus, light/dark checked. Production theme interaction and console checked; no blanket hydration claim.
- **Artifacts/limits:** Screenshots outside repository in `C:/Users/User/.codex/visualizations/2026/10/07/01a11545-f06e-70a3-af2e-b94559e851dc/task195-refinement/`. Mountain SVG simpler than mockup; no pixel-perfect, physical keyboard, native IME or screen-reader acceptance. No API/DB/schema/env/navigation change, Task 196, commit or push. Wait for owner review.

- **Owner typography feedback:** Replaced system-serif headings and tightened spacing with existing Be Vietnam Pro/Arial sans-serif and normal spacing. Demo browser screenshot confirms Vietnamese title diacritics display together. Conversation history is still unimplemented; no history UI/persistence added in response to the owner's question.

## 2026-10-08 — US-21 Task196 citation presentation

- **Owner/baseline:** Design rounds approved; Task195 visual approved. Phase A verified TXH/remote `904f32dd2e35936cc2256b9163fa0e96c32724f6`, exactly nine visual files, tests/typecheck/build/diff and scope. Local visual-only commit `f2731307fd46b59224ed6bc3978fadbfbcbcf7c3`; no push. Task196 starts from that clean commit.
- **Presentation:** Shared default renderer with native disclosures, per-turn first-occurrence numbering, independent reused sources, supplied title/locators, safe separate external links and null/invalid URL no-anchor behavior. Custom CitationSlot API retained; no flattening/sourceId merging. Citation CSS has page-independent light/dark fallbacks and wraps narrow/long metadata.
- **Scroll/security:** View-only open/focus guard stops forced tail following and preserves existing new-message affordance; controller/useId/contract untouched. URL syntax checked with Task191 schema; no private URLs fabricated, HTML injection, fetch/preview/download. Frontend does not establish public eligibility/provenance/semantic grounding.
- **Demo:** Development-only deterministic source fixtures and renderer sandbox, marked simulation. Invalid URL checked directly in sandbox; not smuggled through successful transport parsing. Existing failure/UNKNOWN/outcome controls and cached same-key result preserved. Production remains unavailable/disabled, graph and real build scan exclude mocks.
- **Validation:** Focused citation 22/22, Task195 36/36, root 175/175 Vitest plus legacy suites, typecheck four tasks, fresh build 22/22 pages. Initial CSS-in-TSX test load failed existing PostCSS config; resolved by stylesheet import through assistant.css without test/config changes. Initial React onToggleCapture typing corrected to a native captured toggle listener. Final checks pass.
- **Browser:** 1440/360/390/768 and 320/420 standalone renderer containers; light/dark, long titles, 50 sources, keyboard toggling, Tab link focus and independent disclosures. No horizontal overflow observed. New response while reading source held scrollTop=61 and showed new-message button. Native collapse anchoring can adjust position, without explicit tail jump. Screenshots in task196 visualization folder outside repository.
- **Limits/handoff:** No screen-reader audio, physical mobile, blanket hydration/pixel-perfect claim. Backend RAG/API, history, popup hosts and eligibility runtime still absent; US-21 IN PROGRESS. No provider/Neon write, migration, dependency/env/context change or other tasks. Task196 not committed/pushed; stop for owner review.

## 2026-10-08 — Owner-authorized /assistant local demo integration

- **Baseline/scope:** TXH/local/origin `09d85286d46cd56f4c3b1de159e90bd9f847e61f`, initially clean. Owner requested testing on localhost:3001/assistant rather than requiring the standalone 3002 demo. No real AI/API task.
- **Implementation:** Server page conditionally imports development client host only for literal NODE_ENV=development. Host creates one existing deterministic demo transport and renders shared AssistantChat. MULTI sources default, collapsed scenario/source/delay controls and visible simulation notices. Production uses unchanged unavailable chat. No layout/theme/citation/controller/contract duplication.
- **Isolation/compatibility:** Explicit production compilation in import-graph test excludes development inputs. Fresh actual Next production JS/HTML/JSON scan excludes host/transport/fixtures/control markers; built browser confirms disabled composer/no demo DOM. Future Task194 adapter connects through the existing transport interface and client host boundary; no endpoint invented now.
- **Validation:** Focused integration 10/10, Task195 36/36, citation 22/22; root 185/185 Vitest plus legacy, typecheck four tasks, fresh build 22/22 pages. Browser real app input/send/Enter/Shift+Enter, citations, follow-up/reset and UNKNOWN replay checked. Expanded controls and conversation wrap at 360/390/768/1440; light/dark checked without horizontal overflow. Screenshots outside repo in assistant-dev-integration visualization folder.
- **Limits/handoff:** Mock responses are synthetic, not factual travel guidance; in-memory session is lost on reload. No real API, persistence, history/popups, OpenAI/DB write, schema/env/dependency change or other tasks. US-21 remains IN PROGRESS. No blanket hydration/screen-reader/physical device acceptance claim. No commit/push/merge; owner review required.

## 2026-10-08 — US-19 combined Task181 extraction / Task182 chunking

- **Owner/baseline:** Tô Xuân Hoài authorized implementation after review PASS WITH CONDITIONS. TXH/local/origin `ed4442280e00ce730440e3f7e7267b04599156af`, initially clean. ThaiAnh `4c6df6128c1923369e652eb332eb1b475b50c3fa` remained read-only reference; no merge/cherry-pick/migration/Blob runtime access. US-19 remains IN PROGRESS; no production upload processing activated.
- **Task181:** Pure/reusable Node modules take file bytes plus format. Typed controlled extraction states, byte/content hashes, versioned normalization, stable segments/origins and coverage warnings. Strict UTF-8/NFC TXT with original lines; physical PDF pages, textless-page warnings/no OCR/password classification/resource cleanup; bounded OOXML body/runs/inherited outline headings/tables, no invented DOCX pages. Excluded text-bearing regions/relationships warned. No raw exceptions/text logging, file fetching or status writes.
- **Task181 safety/evidence:** 39 extraction tests PASS using real parseable synthetic PDF/OOXML (not mere signature fixtures), Vietnamese text, images/mixed pages, actual Standard R2 password fixture, corrupt files, unsafe entities/DTD/namespaces/style cycles/checksums, entry/depth/input/text/segment budgets and actual ZIP expansion including descriptor ZIP/lying headers. fflate wraps callback exceptions; ProcessingError is preserved so resource failures retain RESOURCE_LIMIT instead of being misclassified.
- **Task182:** 22 chunk tests PASS. Defaults1600/200 UTF-16, validated limits, paragraph/section/sentence/word/grapheme boundaries, progress/no cross-section overlap, preserved repeated paragraphs, exact normalized source slices and contributing origins including noncontiguous PDF pages. Canonical SHA-256 separates bytes/content/text/chunk identity; versions/options/index/provenance participate. Empty and over-budget results are explicit and contain no partial chunks.
- **Dependencies/compatibility:** Exact pdfjs-dist4.10.38 (engineNode>=20), fflate0.8.3, fast-xml-parser5.11.2. Node22.19.0 import + actual synthetic Unicode PDF extraction PASS. Isolated Next16.3.8/Turbopack server prerender probe initially reproduced PDF_PARSER_FAILED under bundling, passed after externalizing only pdfjs-dist. Added serverExternalPackages with other config preserved. Probe outside repo at D:/KLTN/rag-processing-next-compat-0c2a5eb34b4141fc8fca39347897fe7f; no product route/API created.
- **Validation:** 63 focused tests (39extraction/22chunk/2isolation), root248/248 Vitest plus existing legacy suites PASS; root check-types four tasks PASS; fresh `npm run build -- --force` PASS, 22/22 static pages. Actual production-mode client graphs exclude processing/parsers/fixtures; processing graph excludes DB/Blob/OpenAI/UI. Fresh production artifact marker scan PASS. No old assertions weakened. A final typecheck encountered malformed generated dev types after config reload; only those generated files removed, native next typegen regenerated types, and final typecheck/build PASS.
- **Audit/scope:** npm audit exits1 with ten HIGH existing Prisma/shadcn-chain package findings; baseline lockfile audit has identical affected packages. No old resolved package version changed; no finding for the three new direct parser dependencies in this run. Audit is NOT CLEAN; no automatic unrelated upgrades. git diff --check/scope/secret-pattern scan PASS. Changes only rag-processing modules/tests/fixture generators, US-19 story, progress, web package/lockfile and justified Next externalization.
- **Limits/handoff:** Budgets20MiB input/500PDF pages/100ksegments/5million UTF-16/10kchunks/2048ZIP entries/32MiB selected XML total/16MiB per part/depth128. No hard timeout or heap guarantee; workers/cancellation and incomplete-coverage indexing policy belong to Task185. PDF reading order remains heuristic; unsupported DOCX content warned. Live Vercel worker packaging, real dataset performance, US-17/18 migration/Blob integration not proven. Task183 embedding/184 persistence/185 orchestration and approved-state/runtime provenance remain future work. No Assistant/QA contract/API/DB/env change, OpenAI/Neon write, commit/push/merge. Owner review required.


## 2026-10-09 — TXH selective US17/US18 integration (owner-authorized)

- Source ownership: selectively imported US17/18 from ThaiAnh commit `4c6df6128c1923369e652eb332eb1b475b50c3fa` onto TXH baseline `256584d831c72858f07e3231ce88dfb5b568f871`. No branch merge/cherry-pick; Favorites, Assistant, Task191/181/182 and Next config preserved. Historical evidence above belongs to the original ThaiAnh sessions; it is not evidence of current live acceptance.
- DOCX mandatory correction: upload-only validator independently validates central/local ZIP metadata, entry bounds/paths/duplicates, supported stored/deflate archives (including checked data descriptors), actual decompression counts and CRC32 for the three required XML parts. OOXML root namespaces, content type and internal officeDocument relationship/body are verified. DTD/custom entities, invalid numeric entities, deep XML and corrupt XML fail closed. No external fetch or embedded execution; no extractDocument call.
- Limits: original upload remains 20 MiB inclusive. Required XML parts retain 1 MiB each; aggregate ceiling is 3 MiB for those three parts. Explicit structural bounds: 2048 ZIP entries, XML depth128; ZIP64, encrypted/multi-disk/unsupported forms rejected. Not a full OOXML conformance, malware scan or hard heap/time guarantee. PDF remains marker validation; accepted upload does not prove extractability.
- Replay mandatory correction: current actor and syntax/owned path validated first, then shared preflight uses the exact existing identity/hash/resolution functions. Confirmed replay/conflict requires no Blob read; lookup failure is UNKNOWN, never ABSENT. New writes still validate Blob outside executeIdempotentWrite's atomic transaction. No global change to write semantics.
- UI: synchronous single-flight refs, aborted/stale-read guard and unmount generation checks preserve confirmed state; keyed detail identity isolates old mutations. UNKNOWN retries retain identical payload/key; known failed retry releases uncertainty. No indexing or disable action.
- Validation in this integration: US17 15/15 + US18 11/11, DOCX security8/8, finalize replay9/9 and shared helper4/4 PASS. Independent python-docx-produced document outside repository also accepted. Task181/18263/63 PASS; root Vitest248/248 and all legacy suites317/317 PASS on the successful root run. First root run reported248 passed then native Windows process exit3221225477 during shutdown; unchanged retry completed normally. No assertions/config weakened.
- Prisma7.10.0 schema validate/client generation and env codegen PASS; additive canonical rag_document SQL preserved exactly. Typecheck and fresh production build PASS. Blob SDK pinned2.8.1; all pre-existing lockfile package versions preserved. Before/after npm audit advisory objects identical:10HIGH/0CRITICAL, no new advisories, audit is not clean. No audit fix.
- Browser evidence: actual React components in an isolated synthetic harness outside repo, mocked fetch only and Link shim (not the authenticated Next app).13 controlled checks cover upload/review SUCCESS/FAILED/UNKNOWN, identical retry, double-submit, old mutation isolation, empty/error. Desktop1440 and mobile360 light/dark component checks; no horizontal overflow observed. This does not prove auth routing, DB persistence, real Blob/CORS or full-app visual acceptance. Evidence at D:/KLTN/us19-smoke-20261009/ui/. No harness/mock imports in product.
- Gate A: code checks pass with noted native runner instability. Gate B Development migration NOT RUN/not authorized. Gate C real private Blob NOT RUN/not authorized. Gate D controlled component checks only; live Admin end-to-end NOT RUN. Figma frame matching remains unproven.
- Handoff: canonical RagDocument source now available for future Task184 FK design, but no vectors/schema184 or processing orchestration added. Task183/184/185 not started. Approval still checks original accessibility, not immutable approved bytes; that future boundary remains to be reviewed. No DB writes, real Blob records, Production access, OpenAI calls, commit/push/merge. Owner review required.

## 2026-10-09 — US-19 combined Task183 embeddings / Task184 versioned persistence

- **Owner/baseline:** Tô Xuân Hoài authorized implementation on TXH at `ff638e40ef93197c704cba3c16a0391634b25f74`; local and `origin/TXH` still match that baseline. Work remains local/uncommitted. US-19 remains IN PROGRESS. No Task185 orchestration, API, Admin UI, status transition, commit or push.
- **Task183:** Added exact `cl100k_base` token counting using pinned `js-tiktoken@1.0.21`, fixed OpenAI `text-embedding-3-small` / 1536-dimension provider, server-only HTTP adapter and deterministic fixture provider. Task182 chunk text is passed unchanged after hash/order validation. Limits: 8192 tokens/input, 32 chunks and 16000 tokens/request, sequential concurrency 1, 10000 chunks/200000 tokens/job, at most 3 attempts/batch and 939 attempts/job. The cost preflight reserves all three attempts at $0.02/1M tokens against a $0.01/job cap, so that stricter cap can reject jobs below the nominal 200000-token ceiling. Retryable network, timeout, 408/429/5xx use bounded exponential jitter and bounded Retry-After. Responses require exact count, indexes, dimensions, finite components and nonzero norm. Structured errors omit source text, credentials and provider bodies. No live OpenAI requests.
- **Task184:** Added versioned `RagContentVersion`, `RagIndexGeneration`, `RagChunk`, `RagChunkEmbedding` and `RagIndexPublication`, with an additive migration `20261009120000_add_rag_index_generations`. Original/content hashes and parser versions, chunker/options/chunk hashes, model/tokenizer provenance, expected totals and input/vector hashes are retained. Vectors use `vector(1536)` via parameterized SQL at the server-only store. Unique identity/replay checks, resumable chunk/vector writes, generation locks, completeness checks and a one-row document publication pointer preserve old generations. Disabled documents cannot publish or be selected; metadata reads require INDEXED plus READY. Store never writes RagDocument.status and no retrieval/public route is wired.
- **Validation:** Focused Task183/184 plus Task181/182 regression 78/78 PASS; full web Vitest 263/263 PASS; all configured legacy suites PASS. Root typecheck four tasks PASS. Prisma 7.10.0 validate/generate PASS; `npm run build` PASS with TypeScript and 26/26 static pages. Production client graph and built static chunks contain no tokenizer, provider, persistence, vector or fake fixture marker. `git diff --check` and credential/connection-string pattern scan PASS. No lint script is configured.
- **Dependency audit:** `npm audit` exits 1 for the existing 10 HIGH / 0 CRITICAL advisories. Final advisory IDs match the pre-change audit; no new advisories from `js-tiktoken@1.0.21` / `base64-js@1.5.1`. No `npm audit fix` was run.
- **Database boundary:** Applied all ten historical/current migrations to a disposable loopback PostgreSQL 16.9 container with PostGIS 3.5.2 and pgvector 0.8.6; Prisma migration status and schema diff were clean. The real store/generated client passed synthetic persistence, vector round-trip, constraint, rollback, replay and concurrency checks through test-only `PrismaPg`; production `PrismaNeon` transport was not exercised locally. The container was removed. The additive migration is NOT APPLIED to shared Neon; no Neon connection/read/write occurred. No Blob writes or production access.
- **Review correction:** Isolated PostgreSQL exposed concurrent generation `upsert` P2002 for the losing caller. Both content-version and generation creation now recover only by reading back the same unique identity and validating it; regression coverage passes. No other blocking findings.
- **Handoff:** Gate A code validation is complete. Gate B remains the owner-verified prerequisite from the previous package; this migration still requires separate authorization and is unapplied. Gate C live Blob and provider verification remain NOT RUN; Gate D remains partial. Owner review required before Task185 planning.

## 2026-10-09 — US-19 Task184 real PostgreSQL concurrency closure

- Added opt-in `apps/web/src/modules/rag-index/rag-index-store.postgres.integration.vitest.test.ts` and runner `apps/web/scripts/test-rag-index-postgres.mjs`; command: `npm run test:rag-index:postgres --workspace apps/web`. It creates a fresh, uniquely named Docker container from `pgvector/pgvector:0.8.6-pg16`, binds an ephemeral port to loopback, creates synthetic credentials, checks `current_database()` before schema setup, applies the actual RagDocument and Task184 migration SQL, and stops only its own ownership-labeled container. It never falls back to `DATABASE_URL`. Direct Vitest execution without `US19_TASK184_TEST_DATABASE_URL` and the explicit disposable confirmation reports SKIPPED.
- The regression invokes the real `createRagIndexStore` and generated Prisma Client through test-only `@prisma/adapter-pg`. PostgreSQL 16.15 / pgvector 0.8.6 passed twice on the final test version. Barrier-started requests created identical content-version and generation identities concurrently; instrumentation confirmed real P2002 errors for both unique constraints and successful subsequent read-backs. Since the store performs those calls outside `$transaction`, PostgreSQL's successful read after a real uniqueness error confirms recovery is outside an aborted transaction. Persisted identity/provenance matches, mismatched stored provenance conflicts, replays return the same records, and no duplicate identities or orphan rows remain. No live OpenAI request was made.
- The earlier isolated PostgreSQL run remains separate evidence: all ten migrations were applied to a disposable PostgreSQL 16.9 / PostGIS 3.5.2 / pgvector 0.8.6 database; schema diff, vector round-trip, rollback, concurrency and atomic publication passed. The checked-in runner intentionally applies only the two RagDocument/Task184 SQL migrations needed by this focused regression.
- Neon Development read-only recheck matched owner-verified project `summer-unit-95870477`, branch `development` (`br-aged-hat-b3o6hg9p`), endpoint `ep-purple-pond-b3xujb8o`, and database `neondb`. Nine migrations completed; zero failed/incomplete; only `20261009120000_add_rag_index_generations` is pending. Ledger checksums match after CRLF→LF normalization; seven raw checkout hashes differ because `core.autocrlf=true`; historical migration files remain unchanged. Neon has pgvector 0.8.6 and PostGIS 3.6.4. Production PrismaNeon read-only identity/count/metadata queries passed; RagDocument count was zero. No Neon writes occurred and migration #10 remains unapplied.
- Full web Vitest passed 263 tests with the opt-in integration test explicitly skipped in the normal suite; legacy suites, Prisma validate/generate, root typecheck and production build passed. The dependency audit remains 10 HIGH / 0 CRITICAL with no new advisory IDs after adding test-only adapter/driver dependencies. `git diff --check` is required after documentation edits.
- Limitations as of that 2026-10-09 handoff: PrismaNeon vector WRITE NOT_RUN; live private Blob Gate C NOT_RUN; live Admin browser Gate D PARTIAL; Task185 not yet implemented. The later owner-confirmed Task184 closure and 2026-10-10 Task185 entry supersede that snapshot. US-19 remains IN PROGRESS.

## 2026-10-10 — US-19 Task185 indexing orchestration (local owner review)

- **Historical-state correction:** The 2026-10-09 Task183/184 and US17/18 handoff entries above are preserved as dated evidence. Their statements that commits/schema were uncommitted or migrations were pending describe the state at that earlier time and are superseded by the owner-confirmed TXH baseline `8d077f91561fb6a1356e86ec6ccbe78538c24537` and Neon Development post-apply verification. All ten migrations through Task184 were applied to Development; the Task184 PrismaNeon vector write smoke and synthetic cleanup passed. This Task185 migration is new and remains unapplied.
- **Baseline/scope:** Started at TXH HEAD and `origin/TXH` `8d077f91561fb6a1356e86ec6ccbe78538c24537` with a clean worktree. Changes are local and uncommitted. No API route, Admin UI, public retrieval, migration apply, Neon write, Blob operation, live OpenAI request, commit, push or merge.
- **Design and persistence:** Added additive `RagIndexJob` schema/migration `20261010120000_add_rag_index_jobs`; `RagDocumentStatus` stays unchanged. Admin enqueue/cancel/explicit retry use the persisted role guard and shared idempotent-write helper. Enqueue locks the document row and rejects non-APPROVED/INDEXED documents and queued/running/UNKNOWN jobs. Worker claims use PostgreSQL `FOR UPDATE SKIP LOCKED`, expiring leases and fencing tokens. Safe stale phases requeue; a pending provider batch with uncertain output becomes UNKNOWN.
- **Pipeline/safety:** The server-only worker reads only the registered private Blob path, verifies registered file type/MIME/size and exact-byte hash, then reuses Task181 extraction, Task182 chunking, Task183 token/cost preflight and Task184 versioned vector store. Extraction warnings fail closed and persist warning codes only. Provider batches are marked pending before external calls and vector writes clear that marker atomically; automatic provider retry is disabled in the worker. Explicit Admin retry uses a new idempotency key and reruns cost preflight. Publication pointer, document INDEXED state and job completion are one transaction after READY completeness; previous publication remains active until commit.
- **Tests/checks:** Focused Task185/service and Task181–184 unit tests passed 24/24. Full web Vitest passed 272 tests with four opt-in PostgreSQL cases skipped. All configured legacy suites passed. The first combined `npm test --workspace apps/web` wrapper printed all Vitest tests as passing, then exited with Windows native code `3221225477`; running Vitest alone subsequently exited 0, and the legacy suite passed separately. Prisma validation/client generation and root typecheck passed; the production build compiled and generated 26/26 static pages. The opt-in real PostgreSQL runner was invoked but skipped because Docker Engine is unavailable, so cross-process claims and Task185 PostgreSQL atomic finalization remain unverified.
- **Isolation/audit:** Existing processing-isolation tests passed; source and built-client scans found no Task185 worker/job/provider markers in app routes, components or production client assets. No dependency versions or `package-lock.json` changed; current audit reports 10 HIGH / 0 CRITICAL, matching the baseline dependency graph, with no new advisories. No automatic audit fix was run.
- **Deployment gates:** No durable worker/queue is configured. Vercel request-scoped work remains bounded by function duration and is not durable; Task185 does not invoke it from a route or `after()`. Do not enable live indexing until the migration is separately approved/applied, a durable worker is deployed and observed, and Blob/PDF.js runtime packaging and controlled server credentials are verified. Gate C remains NOT_RUN; Gate D remains PARTIAL; US-19 remains IN PROGRESS.
- **Owner review:** Required before any migration apply or live worker deployment. No Task186 or Task183/184 follow-up was started.

## 2026-10-10 — US-19 Task185 owner review correction

- **PDF warning policy:** Review confirmed the Task181 PDF extractor always emits `PDF_READING_ORDER_HEURISTIC`. Rejecting all warnings would reject every PDF. The repository's product/system requirements do not mandate that. Treat this warning as informational, persist its code on the job, and continue. `PAGE_WITHOUT_TEXT` and `UNSUPPORTED_DOCX_REGION` remain fail-closed; `NO_EXTRACTABLE_TEXT`, corrupt, and password-protected documents are rejected. No partial-coverage exception was added.
- **Worker corrections:** Warning codes are persisted under the active lease. Lease-renewal database uncertainty now remains `UNKNOWN`; runtime abort is checked after generation verification and before publication. Private Blob reads cancel the active stream when their `AbortSignal` fires. Added synthetic PDF/DOCX worker regressions and an opt-in PostgreSQL PDF pipeline assertion for persisted heuristic provenance.
- **Validation:** Focused worker/extraction/store tests pass; full web Vitest PASS (280 tests, four opt-in PostgreSQL cases skipped); all configured legacy suites PASS; Prisma validate/generate, root typecheck, production build and `git diff --check` PASS. The initial full Vitest attempt failed because the new Blob stream test loaded Vercel Blob before its mock under the repository's `isolate:false` test mode; the test now resets/reimports the module, and the final full Vitest run passed. The first legacy run also tried to load that Vitest file through its `*.test.ts` glob; moving it under `rag-index` fixed the overlap, and the final legacy run passed.
- **PostgreSQL blocker:** `docker version` reports client 29.6.2, but `docker info` cannot reach the `desktop-linux` Engine at `npipe:////./pipe/dockerDesktopLinuxEngine`. `npm run test:rag-index:postgres --workspace apps/web` returned SKIPPED; no container/database was created and no alternative context or Neon target was used. Real Task185 concurrency, fencing, rollback and atomic-publication evidence remains unavailable.
- **Deployment:** Worker core exists but no durable runtime is configured. Proposed MVP is a separately deployed server-only process on an owner-approved always-on container host, polling the PostgreSQL job ledger with bounded concurrency and graceful shutdown. Keep live execution disabled until PostgreSQL integration, migration approval/application, private Blob/PDF.js runtime checks, credentials, logs/metrics and cost limits are verified. No host/queue was provisioned. US-19 remains IN PROGRESS; no commit/push/migration apply.

## 2026-10-10 — US19 Task185–187 direct API MVP owner-review closure

- Owner explicitly approved request-scoped API execution for this MVP; separate
  durable-worker hosting is no longer a prerequisite. Preserve ledger, leases,
  fencing, provider UNKNOWN safety and atomic publication. Current implementation
  is local on feat/us19-direct-index-api-progress, baseline 23a399ed47eeca804b6aa44675ed71d2930292cc,
  in an isolated worktree. Existing TXH changes remain untouched.
- Historical closure evidence: Task185 PostgreSQL 14/14 passed twice; migration#11
  applied by owner to Development; subsequent read-only schema verification passed.
  This run independently reads neondb/public, 11 completed / zero pending/failed,
  checksums matching raw or historical LF, vector0.8.6 and PostGIS3.6.4. No writes.
- Added thin POST/GET service boundary, exact shared idempotency scope, explicit
  targeted QUEUED/expired resume, known-failure retry, persisted progress snapshot,
  cooperative request abort and no-store responses. No background work or new schema.
- Admin UI: serial polling, stale/unmount guards, same-key UNKNOWN reconciliation,
  new-key known retry, count-based embedding progress, conservative stage evidence,
  COMPLETED document refresh, shared controls and mobile/dark/accessibility checks.
- Root npm test:303 Vitest PASS,15 opt-in skips in regular runs, all legacy suites PASS.
  Explicit isolated PostgreSQL:15/15 PASS,0 skipped, cleanup PASS. Browser component
  harness PASS; env generation, Prisma validation/generation, typecheck, build PASS.
  No live OpenAI/Blob calls, Neon writes, migration apply, deployment or publication.
- Task185–187 code/offline verification complete; live owner acceptance pending.
  See current US19 closure and decisions for duration/packaging/UNKNOWN limitations.
  US19 remains IN_PROGRESS; do not mark ACCEPTED/DONE from offline evidence alone.
- Final packaging review found PDF.js worker absent from the index route's output
  trace. Added narrow route-only tracing for the installed legacy pdf.worker.mjs;
  no parser rewrite/dependency update. Verify the final trace before handoff.
- Premium UI strict audit:22 existing findings outside touched RAG UI, documented
  without unrelated changes. Component browser coverage additionally passes stale
  response isolation and keyboard activation; live authenticated E2E is pending.

## 2026-10-10 — Final publication gate follow-up

- Native failure was observed after passing assertions in the old Windows nested
  npm/cmd launch path. Exact faulting native module is unknown; no matching Event
  Viewer record was available. Minimal runner change invokes the same Vitest CLI,
  config and suites directly via process.execPath/shell:false with exit diagnostics.
  No assertion/pool/cleanup was disabled. Final standard PostgreSQL command passed
  twice:15/15,0 skips,child and outer exit0,container/volume cleanup PASS.
- Changed scope now17 paths (13 modified,4 added), adding only the existing
  PostgreSQL runner to the prior16. DESIGN.md remains doc-only Admin RAG context.
- Vercel whoami refreshed expired local credential normally; identity/project/team
  API reads now200. Fluid Compute true,Hobby default300s,Node24.x,regioniad1;
  no branch/shared env overrides. Preview has only DATABASE_URL/BETTER_AUTH_SECRET.
  Preview OpenAI/Blob secrets absent; sensitive DATABASE_URL target cannot be read.
- READY_TO_PUBLISH_FOR_TEST=NO until owner confirms Development target and supplies
  Preview-only provider secrets. See story gate follow-up for exact owner checklist.
  No publication,live calls,migration apply or shared DB writes. US19 IN_PROGRESS.

## 2026-10-11 — US17 Preview 404 adapter fix awaiting owner review

- Baseline: feat/us19-direct-index-api-progress at 90a77e11e13529d4b875a95955ee305db7048b7b. Five scoped paths; no commit/push/deploy.
- Confirmed offline: @vercel/blob 2.8.1 returns HTTP200/stream/size0 when Content-Length is absent. The adapter incorrectly interpreted zero metadata as NOT_FOUND. Real SDK/undici MockAgent test has networking disabled. Synthetic upload-ticket/PUT/finalize regression reproduces the old 404 and now confirms UPLOADED; review/index reader reuses the exact private pathname.
- Fix: classify null/NOT_FOUND, unexpected bodyless response and access/network failure separately; count actual bytes, retain 20 MiB/content/MIME checks, reject truly empty files and cancel failed reads. No public storage, weakened auth or verification bypass.
- Owner object pathname has the expected shape; live finalize payload unavailable. Store metadata verifies private kltn-blob/project connection. Local read-only head/get probe is blocked by environment-scoped OIDC authorization; the Preview Sensitive read-write token is not retrievable. Do not claim live pathname equality, token equality, response headers or final incident resolution.
- Validation: 47 focused tests/exit0; full root and legacy tests PASS; typecheck PASS; fresh production build PASS (26/26 pages); diff check PASS. One initial focused invocation printed passing assertions but exited1; rerun explicitly verified child exit0 and full root run exited0.
- No Neon writes, real uploads or OpenAI calls. Owner must approve publication and retest Preview. US19 remains IN_PROGRESS; no DONE/ACCEPTED claim.


## 2026-10-11 — PDF NUL persistence fix awaiting owner review

- Baseline: 63a4b9cb15c810fe8df9975682615e6f045fe8bc on feat/us19-direct-index-api-progress. No publication in this run.
- Development audit used guarded TLS endpoint/database and an explicitly READ ONLY PrismaNeon transaction. The failed PDF remains APPROVED; its job is FAILED/PERSISTING_CHUNKS, attempt1, generation BUILDING/expected3, actual chunks0. Local owner test PDF SHA-256 matches its saved content version. No live retry or document mutation.
- Exact local PDF extraction reproduced three chunks, with three U+0000 characters in chunk0. Against disposable PostgreSQL16.15/pgvector0.8.6, ragChunk.createMany throws Prisma P2039/SQLSTATE22021 (NUL encoding), rolls back all chunks and makes zero fake-provider calls. refs/locators are valid JSON; the failure is PostgreSQL text encoding, not the heuristic warning.
- Preview request logs around the failure were read safely. They contain four PDF.js canvas/polyfill warnings, but no original persistence exception: the old worker swallowed it into INDEXING_FAILED. Exact-file reproduction plus matching bytes provides root-cause evidence; no claim of a captured live SQL exception.
- PDF extraction now removes NUL placeholders before segment collection, hashes and refs/locators, consistent with installed PDF.js viewer text-copy cleanup. Original bytes/hash stay unchanged; PDF extractor identity is bumped to pdfjs-4.10.38-lines-nul-v2. TXT/DOCX normalization, coverage gates, authorization, leases, idempotency and atomic publication remain unchanged. NUL-only PDF pages still fail the existing incomplete-coverage gate.
- Persistence rejects unsupported NUL text before starting a transaction (UNSUPPORTED_CHUNK_TEXT). Unexpected chunk-write exceptions map to CHUNK_PERSISTENCE_FAILED; server logs contain only constant phase/failure code and allowlisted Prisma code, never exception messages/meta, text, credentials or URLs. Existing domain/abort error codes remain intact.
- The exact owner PDF completed offline after the fix:3 chunks/3 fake embeddings/READY publication/INDEXED document/COMPLETED job. No owner document is added to the repository. Permanent regression uses a synthetic three-page PDF with NUL placeholders and verifies canonical JSON, text/hash, version identity and complete atomic publication. The test-only generator supports multiple physical text lines.
- Final validation and runner caveats are recorded in the owner handoff. Intermediate fixture count assertions were corrected by adjusting synthetic content, not weakening assertions; one disposable Docker initialization failed before tests and cleaned up. Those attempts are not counted as integration PASS.
- No schema/migration/dependency/route/UI changes, live OpenAI/Blob calls, Neon writes, commit/push/deploy. Owner must review and approve Preview publication before manual live retry. Task185–187 remain unaccepted; US19 IN_PROGRESS.

- Final checks:91/91 focused PASS; root314 Vitest PASS (16 disposable PostgreSQL cases intentionally skipped in ordinary runs),317 legacy PASS; explicit isolated PostgreSQL16/16 PASS,zero skips,exit0,owned container/volume cleanup PASS. Fresh production build26/26 pages and final TypeScript PASS. git diff --check PASS. Twelve scoped modified files; zero staged. Exact-owner-file offline success and synthetic regression both verified; Preview retest is pending owner-approved publication.

## 2026-10-11 — US-19 final owner acceptance and task closure

- **Owner decision:** Tô Xuân Hoài accepts Next.js/Vercel Preview request-scoped
  indexing MVP:Task185 DONE (BE/API and INDEXED publication),Task186 DONE (FE
  Index/Re-index,status/progress),Task187 DONE_WITH_NOTES (success/failure/Retry).
  US19_MVP_ACCEPTANCE=ACCEPTED. This supersedes earlier pending acceptance
  statements without rewriting historical checkpoints.
- **Baseline:** feature branch feat/us19-direct-index-api-progress at published
  7d366e2cb22fb249bda08a1a39ae2bab207c4691; local/remote match,initial worktree
  clean. Scope is only US19 story and this appended progress checkpoint.
- **Live evidence:** TXT INDEXED/READY,3/3 chunks+embeddings; initial Index and new
  Re-index job COMPLETED. Re-index at10:50:43 UTC+7 reuses the complete generation
  and its original three embeddings without duplicates. DOCX INDEXED/READY,6/6
  chunks+embeddings,eligible for retrieval selection. PDF NUL failure followed by
  same-job attempt2 COMPLETED; NUL-v2 generation READY,3/3 chunks+embeddings,
  INDEXED retained after reload. Old v1 BUILDING generation has0 chunks and is
  unpublished. Reading-order heuristic remains a warning. Failure history comes
  from prior audit/reproduction; no historical FAILED job is invented.
- **Development audit evidence:** owner-verified project/branch/endpoint and
  neondb/public,secure WSS and sslmode=require,explicit READ ONLY transactions;
  11 completed migrations. All12 vectors1536-dimensional with positive norm;
  text/input hashes,token totals(TXT1654,DOCX1701,PDF2124) and pointers consistent.
  No duplicate chunks/embeddings or incomplete publication. No new database
  connection or live test is performed in this documentation-only run.
- **Offline-only evidence:** UNKNOWN,timeout,concurrency,fencing,rollback and
  atomic-finalization cases PASS; not directly live-accepted. Published baseline
  checks:91 focused,314 Vitest,317 legacy PASS; explicit PostgreSQL16/16,0 skipped,
  exit0,cleanup PASS; typecheck/build26/26/diff PASS. Prior results are retained
  evidence,not tests rerun during this closure.
- **Accepted limits:** bounded request execution(route300s/cooperative240s),no
  deployed durable background worker; technical UI codes/copy remain. Retrieval
  and chatbot Q&A are not accepted. Indexed files are test data,not authoritative
  sources. See US19 final entry for exact identities and live/offline evidence.
- **Backlog/publication:** backlog external; supply only three approved status
  lines for owner update,no parallel backlog. Owner authorizes scoped docs
  commit/push; no TXH/dev/master integration or Production deployment. No runtime,
  schema,migration changes,Neon writes,OpenAI/Blob calls. Validate scoped diff and
  secret check; typecheck/build/test reruns are unnecessary for this docs-only edit.
- **Next:** owner-controlled TXH integration review; do not broaden acceptance
  to retrieval/Q&A or start another task.

## 2026-10-08 — US-18 review and approval (Task 2)

- **Branch:** `ThaiAnh`; preserved existing uncommitted US-16/US-17 changes. No commit or push.
- **Story:** Added `docs/stories/US-18-rag-review-approval.md` from MH-16/MH-18, YCCN-88/91/92, QTN-97/98 and NT-170–173. Status: implemented in code; live acceptance pending.
- **Backend:** Admin-only list/detail services and thin read routes; private original endpoint reused. One server transition function accepts `START_REVIEW` or `APPROVE`, uses status-conditional DB update and shared idempotent write. Approval checks private Blob accessibility before transaction. JSON excludes storage path; UPLOADED/REVIEWING/APPROVED remain ineligible for retrieval.
- **Frontend:** Admin list and detail pages with current Admin tokens, loading/empty/error states, responsive layout, light/dark styles and success-only status updates; upload success links to detail and Admin menu links to list.
- **Verification:** `npm run test:rag --workspace=web` 26/26 PASS; root `npm run test`, `npm run check-types`, `npm run build`, `git diff --check` PASS. The initial TDD run failed as expected on missing helper. Build registered all new pages/routes.
- **NOT PROVEN/BLOCKED:** US-17 migration was not applied here; private Blob token/live Admin session unavailable, so live database, file HEAD/download and visual 360px/light/dark checks are not proven. Exact Figma MH-16/MH-18 frames unavailable: **BLOCKED: FIGMA**. No US-19 indexing or US-20 disable work was started.


## 2026-10-08 — US-16 Light/Dark theme adaptation

- **Scope:** Updated only `apps/web/src/app/favorites/favorites.css` plus this progress log and the US-16 story addendum. Reused the global `next-themes` class provider and the existing Explore Light/Dark palette; retained the Figma Light values and all Favorites behavior. No API, service, schema, migration, auth, or dependency changes.
- **Validation:** `npm run test:favorite --workspace web` PASS (24/24); `git diff --check` PASS with a Git LF→CRLF notice. Next CSS compilation PASS (`Compiled successfully`). Build and typecheck remain blocked during TypeScript validation by unresolved `vitest` imports and stale generated Prisma Client types (`cultureContent`/`targetType` missing); after Next regenerated route types, these were the remaining errors.
- **Visual limit:** Local `/favorites` redirects to login because the browser has no Traveler session. Dark/light visual states, live OS theme changes, hydration/flash, and 360/390/768/1024/1440px browser checks remain NOT VERIFIED. Figma MH-10 node `7:158` was inspected; no screenshots of the local Favorites page are claimed.
- No commit or push.


## 2026-10-08 — US-17 Task 1 RAG document upload foundation

- **Scope:** Implemented only RagDocument status/metadata, private file upload/finalization/read, and Admin upload UI. No review/index/retrieval or US-18–20. Preserved three pre-existing uncommitted US-16 files and did not commit/push.
- **DB:** Added minimal `RagDocument` enum/model and additive SQL migration with unique `storagePath`. Prisma schema validated and client generated. SQL reviewed; migration **not applied** because a verified development DB target was unavailable.
- **Storage/API:** Added private Vercel Blob signed PUT URL limited to one actor-scoped path, supported MIME and 20 MiB; finalization reads and validates stored bytes on server before atomic DB + idempotency-result write. Private original-read route streams to Admin. Shared API/authorization/idempotency contracts are reused. `@vercel/blob` and `fflate` are the two necessary dependencies; no serverless 20 MiB request body.
- **UI:** Added `/admin/rag/upload` and Admin menu entry, source metadata form, file summary, idle/invalid/uploading/success/failed/unknown states. Reused Admin theme and `@KLTN/ui` Button/Input/Attachment. Unknown finalization retries the same payload/key.
- **Tests/checks:** Red run initially failed on missing RAG modules; `npm run test:rag --workspace web` PASS 15/15; root `npm run test`, `npm run env:generate`, `npm run db:generate`, `npx varlock run -- npx prisma validate`, `npm run check-types`, `npm run build`, `git diff --check` PASS in this workspace.
- **Evidence limits:** No `BLOB_READ_WRITE_TOKEN` configured locally, so private Blob and Neon end-to-end upload are NOT PROVEN. No Admin browser session was available for light/dark/360px visual verification. Connected Figma file exposes only Components, no MH-17 frame; Admin baseline used. Production RAG corpus not supplied.


## 2026-10-10 — US-20 Task 3 RAG disable and retrieval eligibility

- **Branch/audit:** `ThaiAnh` was clean before this task; commit `4c6df61` contains US-17/US-18. `master` remains foundation-only. No US-19 story, indexing module, vector query or real retrieval module was found in current source.
- **Implementation:** Reused `POST /api/admin/rag-documents/:id/actions` and shared idempotent write; added server action `DISABLE` for UPLOADED, REVIEWING, APPROVED and INDEXED. DISABLED is terminal. Existing status-conditional update prevents stale writes; no row, metadata or original file deletion. Admin detail shows a destructive action with confirmation, then a clear DISABLED state only after SUCCESS; Admin list retains the document.
- **Eligibility:** Retained one canonical predicate `status === INDEXED` for response eligibility. Tests cover all five statuses and the INDEXED → DISABLED change. No fake retrieval/indexing was added.
- **Verification:** TDD red run had 5 failing cases; `npm run test:rag --workspace=web` PASS 34/34 after implementation. Root `npm run test`, `npm run check-types`, `npm run build`, `git diff --check` PASS. No schema/migration/dependency/env change; no commit or push.
- **Limits:** NT-252 end-to-end retrieval and QTN-107 history-source exclusion are **BLOCKED BY US-19** because no retrieval query exists. No Admin browser session/live RAG records or inspectable Figma MH-16/MH-18 frame, so light/dark, 360px and real database/Blob UI flow are NOT PROVEN.


## 2026-10-11 — ThaiAnh into TXH integration review

- Owner-authorized temporary branch: integrate/thaianh-into-txh-20261011, based on TXH a7c8f1a8dc3e52a3d160fd3f5ec6a6f14771af97. Source ThaiAnh a7a26a026b8940eb5c0e639544fc48b169a0d016 has two exclusive commits; target has 21. Merge base94d685bb1dc0daccfb9d4a08041dbff5da023c96. Fifteen conflicts reviewed individually; this is not a source-directory replacement.
- Preserved TXH private Blob stream/byte-count/cancellation/error fixes,20MiB limit,DOCX security validator,upload replay and Admin auth,UI single-flight/UNKNOWN/identity guards,US19 accepted request-scoped pipeline and PDF NUL v2,Prisma relations,migration history and pinned dependencies. Task191 contract and Task195/196 Assistant source unchanged. No Task192–194 or Worker WIP integrated.
- Integrated US20 DISABLE from all four active document states,terminal DISABLED,Admin confirmation and retained list/detail/original file. Status-conditional mutation and shared idempotency remain intact. The indexing completion refresh uses confirmed state and cannot overwrite a confirmed DISABLED with an older INDEXED response.
- Real disposable PostgreSQL race test now invokes the actual DISABLE service,holds its conditional update and observes finalizer lock waiting. Committed DISABLE prevents publication and rejects Retry/Re-index;same-key disable replay succeeds and eligible publication metadata is null. Cancellation,atomic publication,rollback,reindex preservation and PDF regressions retained. No runtime indexing code was changed.
- Source Favorites light/dark CSS and US16 addendum also integrated;existing layout/auth/business logic preserved. Source-only progress entries retained as historical evidence. Moved index-panel CSS import to the Admin detail page so the source SSR badge test can execute without a Node CSS loader;the page still loads both review/index styles.
- Validation:US17/18/20 legacy52/52;root314 Vitest PASS and326 legacy PASS. The regular run intentionally skips16 PostgreSQL cases;two explicit disposable PostgreSQL runs each16/16 PASS,zero skipped,Vitest/outer exit0,container/volume cleanup PASS. Initial strengthened test run exposed a wrong test API name;corrected to the real getPublishedGenerationMetadata method without weakening the assertion. Typecheck and Prisma validate PASS;fresh production build and diff check PASS. No secret matches in added lines;protected source/dependency/schema checks unchanged.
- No new migration or migration apply;no Neon connection/writes,live OpenAI/Blob calls,push or deployment. Worker stash36584c230110a4aad7879f64ee587a4b0c5249bd remains intact and unrestored. Local merge commit/optional TXH fast-forward only after final gates. Owner must approve push. US20 live Admin/browser/retrieval acceptance is not claimed;US19 MVP acceptance unchanged.

## 2026-10-11 — US21 accelerated192/193/194/197 offline batch

- Baseline/local/originTXH8263c94e13cda29cde9f9556d186acc79e75ad44; separate managed
  worktree `C:/Users/User/.codex/worktrees/us21-rag-qa-batch/KLTN`, feature branch
  `feat/us21-rag-qa-batch`. Main TXH clean and unchanged; Worker stash
  36584c230110a4aad7879f64ee587a4b0c5249bd intact. No commit/push/merge/deploy.
- Implemented actual pgvector question retrieval, conservative extractive OpenAI
  generation, strict/thin HTTP API, DB-backed Guest identity and durable authorized
  multi-turn history/reservation/recovery/cleanup. Reuses unchanged Task191 and
  Task195/196 core/layout/citations; real transport is separate from marked demo.
- Exact READY publication+INDEXED/model1536 eligibility rechecked before/after model
  and under completion document locks. Backend citation registry/opaque aliases,
  metadata-only null URLs, rejected fabricated/unsupported claims and private prose/
  metadata; no free-knowledge fallback. Exact matching is not perfect semantics.
- Two additive Guest/conversation migrations tested only on disposable PostgreSQL.
  Atomic completed result+head commit, same-key replay, principal/key digest, lease
  fences, bounded recovery/rate settings, ownership FK, deletion/expiry scrub and
  non-content tombstones; no content in shared indefinite idempotency cache.
- Final full isolated Vitest459/459,zero skips,26 suites;37 real pgvector/PostgreSQL
  tests(US21:21,US19:16),child/outer exit0,container/volume cleanupPASS. Legacy326
  PASS. Root typecheck/Prisma validate/generate/fresh build28/28/diff/secret-pattern/
  production import-and-artifact isolation PASS. Intermediate failed assertions and
  two Windows native3221225477 exits are recorded in the story, not counted asPASS;
  final successful run changed no assertion/pool/cleanup. Native root cause unknown.
- Browser smoke of built production:unavailable,disabled composer/Send,no demo;
  actual built ask503 AI_UNAVAILABLE/no-store. Live conversational browser/provider
  acceptance is NOT RUN. Offline dummy ignored config avoids live credentials.
- All four tasks PARTIAL pending owner review/corpus relevance+coverage evaluation,
  public source policy calibration, Guest bootstrap abuse controls and deployed
  retention cleanup schedule. Production hard unavailable regardless of local flag.
  Runtime history/read/delete API exists; no dedicated history/deletion UI added.
  No Neon connection/write,migration apply,live OpenAI/Blob call or production data.
- Full requested field report,exact31-path manifest,provisional limits,retention/
  recovery/migration assumptions and acceptance gaps:US21 dated batch handoff.
  READY_FOR_OWNER_RUNTIME_ACCEPTANCE=NO for Preview/Production;offline code review
  ready. Owner must review blockers before requesting environment/runtime work.

## 2026-10-11 — US21 accelerated closure hardening

- Append-only closure on feat/us21-rag-qa-batch,HEAD8263c94e13cda29cde9f9556d186acc79e75ad44.
  Main TXH clean;Worker stash36584c230110a4aad7879f64ee587a4b0c5249bd untouched.
 44 changed paths (initial31+13 new),three additive QA migrations,disposable only.
- Added shared PostgreSQL Guest bootstrap/network/global ask/token/concurrency
  guards,HMAC network identity,fail-closed trusted ingress configuration and tests.
  Cookie identity remains server-created/digest-only,HttpOnly/Strict/Secure.
  Replays do not charge;recovered attempts charge full provisional23K token budget.
- Retention uses DB clock/test injection,bounded cleanup/time budget,residual-work
  checks,expired Guest access scrubbing and shared locks. Terminal failures discard
  content immediately. Fixed identity-deletion orphan race and stale bootstrap
  readiness;bounded real transport handles timeout without changing retry payload.
  Protected scheduler endpoint,candidate cron and plan/cost/deployment runbook added;
  actual scheduler NOT_CONFIGURED and physical retention SLA remains unverified.
- Repeatable evaluation26technicalcases matched,zero citation/history failures;
  concrete instruction bypass fixed before provider. Two relevance/coverage probes
  document remaining semantic limits. REAL_CORPUS_EVALUATION=NOT_EVALUATED;verified
  Hà Giang provenance/rights corpus absent. No arbitrary quality PASS threshold.
- Final full disposable runner492/492 PASS,30 suites,zero skipped/todo,child/outer
  exit0,51 actual PostgreSQL/pgvector cases(US21:35,US19:16),ownedcontainer+volume
  cleanupPASS. Focused294/294 PASS;legacy all11groups PASS;root typecheck4/4,
  Prisma validate/generate/offline QA DDL consistency,fresh build29/29,diff/untracked
  whitespace/secret scan PASS. First closure run had2 invalid-expiry fixture failures
  (fixed without changing CHECK);second had native threaded-worker3221225477 exit
  after492assertions (notPASS). Final Windows forked-worker run exited0;native root
  cause unknown. Premium UI audit retains22 unchanged findings and exits2.
- Production opt-in remains unavailable:actual built session/ask503AI_UNAVAILABLE,
  cleanup503disabled,no-store,no demo artifacts. Development browser failure smoke
  disabled composer/no demo;successful Next.js real-corpus answer browser NOT_RUN.
  Disposable vertical slice joins server Guest bootstrap,abuse,real HTTP transport,
  actual pgvector,DTO and atomic completion with injected provider transports only.
- TASK192_STATUS=PARTIAL;TASK193_STATUS=PARTIAL;TASK194_STATUS=PARTIAL;
  TASK197_STATUS=PARTIAL. Code review ready;READY_FOR_OWNER_ACCEPTANCE=NO for MVP
  runtime signoff. RemainingP0 deployed retention scheduling/SLA;remainingP1 corpus/
  semantic quality,policy/cost/latency/delete-load calibration andmanualacceptance.
  Full requested field report and prioritized evidence appended to US21 story.
  No Neon writes/migration apply,live OpenAI/Blob,contract change,commit/push/merge/
  deploy,stash apply/pop/drop or public activation.

## 2026-10-11 — US-21 independent release-candidate gate review

- Reconfirmed feature branch `feat/us21-rag-qa-batch` at
  `8263c94e13cda29cde9f9556d186acc79e75ad44`, 44 changed paths (4 modified,
  40 untracked), three additive migrations; root TXH checkout is clean at the
  same HEAD. Reviewed all changed paths and migrations. No code was changed and
  no tests were rerun; 492/492 Vitest and 51/51 disposable PostgreSQL are cited
  only as prior-run evidence.
- Release P0 remains scheduler/capacity/physical-retention guarantee: cleanup is
  disabled and candidate Cron is not configured. Verified current Vercel docs:
  Hobby is daily/±59 minutes; Pro/Enterprise support minute cadence; Cron is
  best-effort and Production-only, with missed/duplicate deliveries. Five-minute
  candidate is 288 invocations/day and uses Function allowance. Pro currently
  costs USD20/month including USD20 usage credit; owner must verify actual plan,
  function/database usage and accept that Vercel Cron alone has no hard 24-hour
  physical deletion SLA. Preview manual invocation must target isolated data.
- Independent P1 review: expiry time is sampled with PostgreSQL transaction-start
  `CURRENT_TIMESTAMP` before advisory principal lock; lock contention across the
  expiry boundary can permit a late replay/completion and retention renewal. Also,
  citation title/DOCX section projection relies on a denylist and permits some
  local URI/POSIX path strings; source metadata has no separate public permission
  flag. Both require owner/runtime follow-up; neither was changed in this review.
- P1: explicit conversation deletion and Guest session revocation do not have a
  same-key result-reconciliation path. If the DB commit succeeds but the response
  is lost, a retry reports NOT_FOUND/UNAUTHENTICATED even though deletion committed.
- P1: source disable during an in-flight generation prevents final completion but
  cannot retract evidence already sent to the provider; current race evidence
  proves response/persistence fencing only. Owner must accept request-start
  eligibility or select a different privacy boundary.
- P2: content is scrubbed but minimal tombstone identity/key/hash metadata remains
  without a compaction horizon. Semantic quality and real Hà Giang corpus remain
  `NOT_EVALUATED`; no rights/provenance-verified source set was supplied.
- P2: head/active/parent turn pointers are service-enforced but not FK-constrained;
  the history anchor also does not assert that its head belongs to the selected
  conversation. No client-controlled path was found, but DB-level defense is absent.
- P1: the current real-corpus manifest schema records expected source IDs/claims,
  but no gold evidence span/locator or real-corpus evaluator exists yet; it cannot
  produce evidence-recall/citation-locator quality results.
- Prepared Neon/OpenAI runtime acceptance steps in the appended US-21 story entry.
  Preview runtime is still disabled by the current development-only feature gate.
  `TASK192/193/194/197=PARTIAL`; `READY_TO_COMMIT_FEATURE=NO_PENDING_OWNER_REVIEW`,
  `READY_FOR_PREVIEW=NO`, `READY_FOR_MVP_ACCEPTANCE=NO`. No status promotion,
migration apply, live provider/database call, commit/push/merge/deploy, or Worker
stash action.

## 2026-10-11 — US-21 final hardening execution

- Continued directly from the existing implementation on
  `feat/us21-rag-qa-batch`, HEAD `8263c94e13cda29cde9f9556d186acc79e75ad44`.
  Feature worktree has 49 changed paths (4 modified, 45 untracked); TXH root
  checkout is clean at the same HEAD. No commit/push/merge/deploy or stash action.
- Fixed the reviewed post-lock expiry race by sampling `clock_timestamp()` after
  acquiring the principal lock. A deterministic disposable-Postgres test proves
  the exact-boundary same-key replay is denied and content is scrubbed without
  retention extension.
- Added a fail-closed server source-ID allowlist for citation title/locator
  projection and path/URL rejection for file URIs, POSIX/Windows/UNC paths,
  private Blob references and signed/internal URLs. No new approval column or
  Task 191 contract change. Empty allowlist exposes no evidence.
- Made conversation delete safely repeatable for the same owner and session
  revoke retryable with the same possession-verified Guest cookie after revoke.
  Foreign owners still receive NOT_FOUND; no content response is cached and no
  `Idempotency-Key` extension is needed because resource ID/token scopes the same
  deletion action. Added provider-in-flight eligibility polling with best-effort
  abort; final locked eligibility still fences response/commit. Evidence already
  sent to the provider cannot be recalled, and this limitation is documented.
- Added additive migration `20261011123000_add_qa_cleanup_state`: distributed
  90-second runner lease, bounded execution metrics (`lastSuccessfulSweep`,
  backlog, oldest overdue and failure count), failure counter and cleanup scan
  indexes. Protected route supports manual or scheduled execution. All four QA
  migrations were installed only in the disposable loopback PG runner; none was
  applied to Neon.
- Development/Preview gate now requires explicit opt-in, abuse-control acceptance
  and exact allowed database host/name; Production is hard-denied. Citation
  source IDs require explicit owner configuration. Defaults leave QA off.
- Validation after the initial race-fixture correction: focused hardening
  79/79; disposable PostgreSQL/pgvector 54/54 with zero skips and owned-container
  cleanup PASS; full Vitest 517/517 across 32 suites, zero skips/todo, child/outer
  exit 0; all 11 legacy test groups exit 0; root typecheck 4/4; Prisma generate
  and validate; fresh build with 29 routes/pages; production/demo isolation;
  `git diff --check`, 49-path whitespace and secret scans all PASS. First full
  attempt exposed an incorrect test key/overbroad lock observer in the new test;
  fixed the fixture and matched the exact PostgreSQL lock hash before rerunning.
- Cleanup scheduler remains NOT_CONFIGURED. Vercel five-minute Cron is a
  Pro/Enterprise candidate, Production-only and best-effort with no retry; an
  external retrying/monitored scheduler remains an owner-selected alternative.
  The 90-second DB lease makes code vendor-independent but cannot create a hard
  physical-retention SLA by itself. No plan/provider was selected or configured.
- Synthetic technical evaluation remains 26/26 matched, with zero tested
  metadata-authenticity/history-isolation failures and two observed semantic
  limitations. No rights/provenance-verified Hà Giang corpus was supplied;
  real-corpus and semantic-quality results remain NOT_EVALUATED. No Neon write,
  migration apply, cleanup sweep, browser live-answer test or OpenAI/Blob live
  call occurred.
- `TASK192_STATUS=PARTIAL; TASK193_STATUS=PARTIAL; TASK194_STATUS=PARTIAL;
  TASK197_STATUS=PARTIAL`. Code review is ready; MVP runtime signoff is not.
  `READY_TO_COMMIT_FEATURE=NO_PENDING_OWNER_REVIEW`;
  `READY_FOR_PREVIEW=NO_UNTIL_OWNER_MIGRATION_AND_ENV_CONFIGURATION`;
  `READY_FOR_MVP_ACCEPTANCE=NO`. Full field report and Development migration/
smoke checklist are appended to `docs/stories/US-21-rag-qa.md` and
`docs/implementation/qa-retention-runbook.md`.

## 2026-10-11 — Final validation after runtime-target guard tightening

The non-production gate was tightened to require a PostgreSQL URL scheme as
well as exact configured host/database matching. Its focused gate tests passed
2/2. After that last code change, full isolated Vitest again passed 517/517
across 32 suites with zero skipped/todo, and the disposable PostgreSQL/pgvector
runner reported clean container/volume teardown. Legacy tests, root typecheck,
Prisma generation/validation and a fresh TypeScript-checked production build all
exited 0. The final 49-path whitespace/secret scans and `git diff --check` passed.
No runtime flag, migration, scheduler, Neon data, provider, Git history or task
status was changed as part of this verification.

## 2026-10-11 — US-21 owner decisions A/B/C implemented offline

- Owner approved GitHub Actions cleanup scheduling (`17 * * * *` UTC), an
  explicit server source-ID allowlist with field-level safe citation projection,
  and minimal approved provider evidence with best-effort abort/final eligibility
  fence. Recorded trade-offs and deployment gates in the US-21 story and cleanup
  runbook; Tasks 192/193/194/197 remain PARTIAL.
- Added a fixed-path HTTPS GitHub Actions runner with exact host match, secret
  only from a GitHub Environment, no URL dispatch input, no redirects, 10-second
  timeout, three bounded retry attempts and an eight-sweep cap. Manual dispatch
  requires explicit confirmation. A second scheduled workflow checks GitHub's
  scheduled-run history for a missing/stale (>75-minute) or failed cleanup
  heartbeat. Both workflows are restricted to the remotely confirmed default
  branch `master`; nothing was published or activated. Notification routing,
  environment variables/secrets, and `QA_CLEANUP_ENABLED` are owner gates.
- Tightened provider payload to four current approved chunks / 3,000 evidence
  tokens and two prior questions, added `store:false`, and reject unsafe private
  references/credential patterns before transport. Added payload inspection and
  deterministic scheduler/watchdog tests. No provider or database live calls.
- GitHub Actions schedules are default-branch-only and may be delayed/dropped;
  the same-platform watchdog improves missed-run detection but cannot guarantee
  delivery or a hard physical-retention SLA. No Development cleanup is run.
  Vercel candidate is superseded. No migration, commit, push, merge, deploy or
  Worker stash operation.
- Validation after this batch is recorded in the story: rerun focused suites,
  full Vitest, disposable PostgreSQL/pgvector, legacy, typecheck, build, Prisma,
  workflow static checks, diff/secret scans and production/demo isolation.

### 2026-10-11 — US-21 A/B/C final offline verification

- Full Vitest: 524/524 across 33 files, zero skipped/todo. After the synthetic
  credential marker was shortened to remove a scanner false positive, affected
  focused suites passed 60/60; scheduler/watchdog Node tests passed 7/7.
- Disposable PostgreSQL/pgvector: 54/54, zero skipped, teardown passed. Legacy
  test groups, root typecheck, production build, Prisma validate/generate and
  static workflow checks passed. actionlint was unavailable; YAML parsing and
  structural workflow assertions passed.
- Changed-path secret scan: zero matches across 55 paths; git diff --check
  passed. Four tracked modifications, 51 untracked paths, no staged files, four
  existing additive QA migrations, feature branch HEAD unchanged. No live
  provider/Blob calls, Neon writes, migration applies, cleanup invocation,
  workflow publication, or deployment.
- Cleanup remains disabled pending owner-controlled GitHub Environment and
  exact database target configuration. GitHub Actions scheduling is best
  effort, so hard physical deletion within 24 hours is not established. Real
  Ha Giang corpus evaluation and provider data-control review remain outstanding.
  Tasks 192/193/194/197 remain PARTIAL; no task was marked DONE.


## 2026-10-11 — US-21 local Varlock configuration and Neon preflight

- Removed only the offline DATABASE_URL override from ignored apps/web/.env.local; preserved its other assignments and the owner-restored .env. Actual Next development env loading now matches the expected Neon hostname/database.
- Exposed ten server QA runtime/cleanup keys and VERCEL_ENV/VERCEL by removing @internal; kept default sensitivity and NODE_ENV as the only public key. Existing HMAC/cron credentials remain sensitive. Codegen passed; generated env.ts remains ignored. QA/Preview/cleanup and abuse-acceptance flags remain disabled. Missing allowlist, HMAC, local identity, target pins and cron secret are not reported as configured.
- Effective-config READ ONLY transactions confirmed all expected Neon IDs, 11 complete/checksum-matching ledger entries, four QA migrations pending, vector 0.8.6/PostGIS 3.6.4, three INDEXED plus one DISABLED READY publication, and absent QA schema. Current branch name still requires owner Console confirmation; no management API credentials were available.
- Focused gates/Task191 contract/HTTP tests: 134/134, zero skipped; root typecheck and fresh offline production build exited 0. Client secret-value scan: 0 matches across 107 assets; public generated schema remains NODE_ENV-only. Diff/check scans passed. Full test suites were not rerun for this configuration-only change.
- Migration approval remains conditional on current branch-name verification and backup/restore readiness. Live smoke remains blocked by pending migrations, missing runtime configuration and source/corpus approvals. Tasks 192/193/194/197 remain PARTIAL. No commit, push, deployment, database write, live OpenAI/Blob call, cleanup or Worker stash operation.


## 2026-10-11 — Owner-authorized US-21 Development migrations applied

Owner explicitly approved Development writes for project summer-unit-95870477, branch development / br-aged-hat-b3o6hg9p, endpoint ep-purple-pond-b3xujb8o, database neondb, and confirmed backup-dev-pre-us21-20261011. Branch name and backup verification are owner-provided; server identity independently matched project/branch/endpoint/database IDs through effective Varlock runtime configuration before writing. Effective runtime was not the offline sentinel.

Immediate gates passed: feature HEAD 53506f67064dbc4eeda6693f3527c79e9d755a00; four migration SQL files match checkpoint; 11 complete checksum-matching ledger entries with no failed/rolled-back entries; exactly four QA migrations pending and no existing QA table collisions. The requested db:migrate script maps to forbidden migrate dev, so the existing db:migrate:deploy workspace script was used from repository root: npm run db:migrate:deploy -w @KLTN/db. Prisma Migrate Deploy exited 0 and applied only 20261011120000_add_qa_guest_identity, 20261011121000_add_qa_conversations, 20261011122000_add_qa_abuse_guard, and 20261011123000_add_qa_cleanup_state.

Post-migration read-only verification: 15 completed migrations, zero failed/rolled-back entries, all ledger checksums match; six QA tables, validated constraints, composite ownership FK, idempotency and active-turn uniqueness indexes present; all six QA tables empty. Prisma migrate diff against repository schema reported no difference, exit 0. Non-QA table column/default/constraint/index catalog fingerprints and row-content/count fingerprints were identical before/after (excluding migration ledger and extension-owned spatial_ref_sys data). pgvector 0.8.6 and PostGIS 3.6.4 passed vector-distance and SRID queries. Documents remain three INDEXED and one DISABLED; publications remain three INDEXED/READY and one DISABLED/READY, with unchanged content fingerprints.

No Production or backup target was contacted for writes. No cleanup, RAG content changes, provider/Blob calls, runtime activation, commit/push/deploy or Worker stash operation. Existing local configuration and earlier candidate-file deletion were preserved. Migration and diff child processes exited 0; their stdin Node wrapper retained Varlock handles after completion and was stopped only after verification output; a final independent read-only QA-count/publication verification exited 0. No offline suite rerun was needed for this migration-only execution. Live smoke still requires approved source allowlist/provider sharing, network HMAC, local identity, runtime target pins and deliberate local runtime gate configuration. Tasks 192/193/194/197 remain PARTIAL.


## 2026-10-11 — US-21 local live readiness prepared (no live execution)

Read current QA runtime gates, Guest/Better Auth boundary, allowlist, provider configuration and /assistant HTTP transport. Only ignored apps/web/.env.local configuration was changed: set exact Development hostname/database pins, local runtime/abuse gate true, Preview/cleanup false, empty unapproved source allowlist; generated a cryptographically random local HMAC and stable local network quota identity without displaying either. Existing DATABASE_URL/.env and Better Auth assignments retained. No project/branch/endpoint env pins exist in current code; read-only server IDs were verified against approved target.

Actual Next/Varlock development loading and gate execution confirmed local=true, Production=false, Preview=false, cleanup=false, secret exposure server-only, OpenAI credential present and Better Auth localhost:3001/minimum-length configuration valid. Ledger remains 15 completed, zero incomplete. Three INDEXED US19 TEST sources have READY publications and matching embedding/chunk counts, but ownership/public-display/provider-sharing approvals are not established; none allowlisted.

Created docs/fixtures/us21-local-live-qa-test.txt, clearly TEST/SYNTHETIC with fictional QA-SAOTIM-21 record, and docs/implementation/us21-local-live-readiness.md with exact env requirements, upload/review/approve/index steps, correct RagDocument.id allowlist semantics, TXT citation limitations, and first turn/citation/Traveler/follow-up/insufficient/replay/delete/revoke/disable cases. These are prepared artifacts, not uploaded/indexed/real-corpus evidence. Runtime source approval and live authorization remain owner gates. No server started (real UI bootstrap itself writes), no Neon write, migration, cleanup, OpenAI/Blob call, Production activation, commit/push/deploy or Worker stash action. No application code change; no full regression rerun. Tasks remain PARTIAL.


## 2026-10-11 — Owner-approved live acceptance attempted; stopped before review/index

Authorization: owner approved only docs/fixtures/us21-local-live-qa-test.txt for Development Blob/Neon writes and real OpenAI indexing/generation, at most five generation questions. Full fixture review passed: original generated TEST/SYNTHETIC QA record, no personal data, secrets, private information, third-party content or purported real Ha Giang facts. Owner authorization covers public safe metadata and minimal evidence sharing for this fixture only. Expected evidence: confirmation code QA-SAOTIM-21; three steps (doc tai lieu, doi chieu ma xac nhan, ghi ket qua kiem thu); purple label; no actual travel prices/hours. Proposed five questions: confirmation code; same-conversation follow-up asking steps; actual ticket price absent from source; confirmation code plus unsupported price (record actual PARTIAL/clarification outcome); independent label-color check. None sent.

Final write gate passed using effective Next/Varlock configuration and read-only Neon server settings: project summer-unit-95870477, branch br-aged-hat-b3o6hg9p (development per owner), endpoint ep-purple-pond-b3xujb8o, neondb; six QA tables; exact checkpoint/feature branch; port 3001 free before starting. Local runtime enabled, Preview/Production/cleanup disabled. No migration rerun. Owner logged into existing Admin account in in-app browser; no credentials or cookies copied into chat/scripts.

Started npm run dev -w web from feature worktree. Standard upload UI/API successfully uploaded exactly one fixture and finalized document cmv3q1hth00010k9wf74kmio7. Public title: US21 TEST SYNTHETIC - Ho so QA Sao Tim; sourceUrl null; no invented author/locality; topic marks owner-approved technical TEST/SYNTHETIC acceptance. No storage path/URL recorded in this report. Upload-url API HTTP 200 (3.8s server latency); finalize API HTTP 200 (3.7s); Blob PUT duration not captured.

Live blocker: Next 16.3.8 Turbopack returned HTML 404 for existing nested /api/admin/rag-documents/{id}/actions and /index routes. UI START_REVIEW attempt reported UNKNOWN; no repeated write retry was made. Existing production-build manifest includes these routes, while development did not compile them on request. Tried runtime-only npm run dev -w web -- --webpack, without editing code. Webpack served index progress HTTP 200 for authenticated UI / 401 JSON for unauthenticated diagnostic, but page rendering was blocked by Varlock sensitive-config scan: Config item BETTER_AUTH_URL, patched ServerResponse.write, on document detail HTML. Its effective value is the noncredential localhost origin, but remains sensitive by schema default. This is a guard-triggered runtime failure, not evidence that API keys/passwords leaked; no guard disabled or metadata classification changed. Browser received connection reset. Per stop gate, halted writes and stopped the local server. Screenshot of completed upload was not saved before the navigation failure; read-only DB confirmation provides authoritative persistence evidence.

Post-stop read-only reconciliation exited 0: exact target still matched; document UPLOADED, zero fixture jobs/generations/publications/chunks, zero QA turns. Existing documents remain three INDEXED and one DISABLED. No existing source was changed or allowlisted. Allowlist stays empty until this exact fixture is APPROVED/INDEXED/current READY. No OpenAI calls occurred: generation questions 0/5, token usage 0. Upload persistence PASS; review approval, indexing, real HTTP chat, citation authenticity and conversation persistence NOT_EXECUTED/BLOCKED. REAL_HA_GIANG_CORPUS_EVALUATION=NOT_EVALUATED.

FIXTURE_REVIEW=PASS; FIXTURE_APPROVED=OWNER_AUTHORIZED_FOR_TEST; UPLOAD_STATUS=PASS; APPROVAL_STATUS=BLOCKED_UPLOADED; INDEX_STATUS=NOT_STARTED; CHUNKS=0; EMBEDDINGS=0; SOURCE_ALLOWLIST=EMPTY; REAL_HTTP_TRANSPORT=IMPLEMENTED_NOT_LIVE_VERIFIED; OPENAI_LIVE_CALLS=0; QUESTIONS_EXECUTED=0/5; FIRST_TURN=NOT_RUN; FOLLOW_UP=NOT_RUN; INSUFFICIENT_SOURCE=NOT_RUN; CITATION_VALIDATION=NOT_RUN; CONVERSATION_PERSISTENCE=NOT_RUN; TOTAL_TOKEN_USAGE=0; LATENCY=UPLOAD_URL_3.8S_FINALIZE_3.7S; SECURITY_FINDINGS=VARLOCK_BETTER_AUTH_URL_GUARD_BLOCK; TASK192_STATUS=PARTIAL; TASK193_STATUS=PARTIAL; TASK194_STATUS=PARTIAL; TASK197_STATUS=PARTIAL; READY_FOR_OWNER_BROWSER_ACCEPTANCE=NO; BLOCKERS=LOCAL_NESTED_ROUTE_404_AND_VARLOCK_ORIGIN_CLASSIFICATION.

Next work must resolve local route discovery and narrowly classify the known public Better Auth origin without weakening credential sensitivity, then reconcile/resume the existing document review/index (never reupload a duplicate), allowlist the exact returned document ID, and run at most five generation questions under the existing authorization. No disable/delete/revoke/cleanup, Production/backup writes, scheduler activation, migration, contract change, code edit, commit/push/merge/deploy or Worker stash action.


## 2026-10-11 — Local route/Varlock remediation and approved fixture indexing

Continued the owner-approved single-fixture live test; no second upload. Verified effective BETTER_AUTH_URL is only the public origin http://localhost:3001: HTTP(S), root path, no username/password/query/fragment and not equal to any credential. Changed only its apps/web/.env.schema decorator to @public @type=url; BETTER_AUTH_SECRET, DATABASE_URL, OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, QA_NETWORK_HMAC_SECRET and CRON_SECRET remain sensitive. Varlock codegen succeeded.

Exact endpoint behavior: frontend calls POST /api/admin/rag-documents/{id}/actions and GET/POST /api/admin/rag-documents/{id}/index; there is no /actions/index endpoint. Route files exist and are present in production build manifest. Turbopack's dev manifest omitted nested /actions and /index routes and returned HTML 404; Webpack dev registered both (authenticated GET/POST requests returned 200). Webpack no longer reports BETTER_AUTH_URL from the sensitive-response scan. This is a Turbopack development route-registration issue, not a wrong client URL or route handler authorization failure.

Using the already logged-in Admin and standard UI, the existing document cmv3q1hth00010k9wf74kmio7 moved UPLOADED -> REVIEWING -> APPROVED -> INDEXED. The US-19 indexing action made an authorized real OpenAI Embeddings call for this fixture; job succeeded on attempt 1. Read-only Development verification confirmed status INDEXED, current publication READY (generation cmv3wvev70005v89wg0fvv4ty), one expected chunk/one embedding, openai/text-embedding-3-small/1536, safe owner-approved TEST/SYNTHETIC title and null sourceUrl. Existing sources were not changed: counts are now four INDEXED (three prior + fixture), one DISABLED. The exact returned RagDocument.id alone is present in ignored QA_PUBLIC_SOURCE_IDS. Database server identifiers and local gate rechecked; Preview and cleanup remain disabled.

A guard interaction remains when requesting the Admin detail page while the raw allowlist ID is configured: Varlock flags QA_PUBLIC_SOURCE_IDS because that same ID appears in the /admin/rag/{id} request/page context. It remains sensitive/server-only; no public exposure or guard exception was added. Navigate to /assistant to avoid the internal admin-ID path. The assistant page loaded on Webpack and authenticated as ADMIN; its real HTTP transport path was selected. However, browser actions could edit the draft and clear it using “Cuộc hội thoại mới” but submit did not start a turn or produce POST /api/ai/ask. No Generation API calls or QA turns occurred; OpenAI generation remains 0/5 and generation token use is 0. Do not retry blindly. This local browser-submit behavior needs owner interaction/debugging before live questions.

Validation after schema change: Varlock codegen PASS; focused tests 78/78 across runtime gate, HTTP transport, Assistant development integration, QA HTTP and RAG index/action services; web typecheck PASS; fresh Next production build PASS and included nested actions/index routes; diff check PASS, secret-value scans found no matches, .env files remain ignored. Prisma client generation also succeeded. Full regression and PostgreSQL suite not repeated.

FIXTURE_REVIEW=PASS; FIXTURE_APPROVED=OWNER_AUTHORIZED; UPLOAD_STATUS=PASS; APPROVAL_STATUS=PASS; INDEX_STATUS=PASS; CHUNKS=1; EMBEDDINGS=1; SOURCE_ALLOWLIST=EXACT_FIXTURE_ID_ONLY; REAL_HTTP_TRANSPORT=SELECTED; OPENAI_EMBEDDING_CALL=PASS; OPENAI_GENERATION_CALLS=0/5; QUESTIONS_EXECUTED=0/5; FIRST_TURN=NOT_RUN; FOLLOW_UP=NOT_RUN; CITATION=NOT_RUN; CONVERSATION_PERSISTENCE=NOT_RUN; READY_FOR_OWNER_BROWSER_TEST=PARTIAL; BLOCKERS=TURBOPACK_DEV_ROUTE_REGISTRATION (use webpack) + ADMIN DETAIL ALLOWLIST-ID GUARD MATCH + CHAT SUBMIT DOES NOT DISPATCH.

Webpack development server is left running on localhost:3001 with /assistant open and the Admin session intact for owner browser acceptance. No question, deletion, disable, cleanup, migrations, Production/backup write, commit/push/merge/deploy, or Worker stash operation. Tasks 192/193/194/197 remain PARTIAL.

## 2026-10-11 — US-21 Assistant send/session lifecycle fix

- **Root cause:** `AuthenticatedRuntimeChat` first rendered `AssistantChat` without transport under key `USER:<id>`. Successful bootstrap returned the same `USER:<id>` identity, so React reused the child. Its one-time `useState` initializer left `AssistantController.transport` null while the changed prop enabled the composer. `submit()` returned false before transport dispatch, explaining the missing `/api/ai/ask`.
- **Cancellation:** the bootstrap effect aborts on cleanup when its component/boundary unmounts; development Strict Mode can exercise this path. This accounts for canceled session requests but is separate from the stale controller. The final browser bootstrap succeeded (auth/session HTTP 200 and Admin/composer readiness).
- **Fix/evidence:** use distinct `bootstrap:` and `ready:` child keys to recreate the controller with `AssistantHttpTransport`. A deterministic regression test failed under the old equal-key behavior and passes with the fix. Focused suite 83/83, typecheck and production build pass. Local browser re-opened `/assistant`; no ask was sent, OpenAI generation remains 0/5.
- **Scope:** Task 191 contract and Task 195/196 UI semantics unchanged. No fixture upload/index, allowlist change, migration, cleanup, Neon mutation for this debug, provider generation, Production action, commit/push/deploy or Worker stash action. First live ask remains owner-controlled.

### 2026-10-11 — UNKNOWN with no recorded ask: fetch receiver regression

Trace: submit creates the immutable attempt and sets pending sending; controller send calls AssistantHttpTransport.send; read called the native fetch reference as this.fetcher. That supplies the transport object as the native function receiver. A receiver-sensitive browser-fetch mock throws Illegal invocation at this point, before creating a request; transport catch maps it to networkAmbiguity and controller maps that to UNKNOWN. The new pending state proves the prior null-transport submit guard was passed. No wrong URL was found (/api/ai/ask); server-side HMAC/session checks cannot explain a fetch call failing before HTTP dispatch. Aborted signals remain separately tested and unchanged.

Minimal fix: wrap the default fetch dependency with (input, init) => globalThis.fetch(input, init). Keep request URL/body/key, cookies, timeout, abort behavior, Task 191 contract and security unchanged. New deterministic test uses a mocked session 200 with validated USER identity, distinct bootstrap/ready keys, then submit through the real controller and HTTP transport; asserts session -> POST /api/ai/ask, exact key/body, accepted receiver and confirmed FAILED fixture response instead of network UNKNOWN. It failed with the old receiver and passes after the wrapper. This is a deterministic transport/lifecycle test, not a mounted-browser or live provider acceptance test.

Read-only Development target gate matched the approved endpoint, neondb and effective runtime pins. BEGIN READ ONLY returned transaction_read_only=on, zero qa_turn and zero qa_conversation records. Available dev logs show session 200 and no ask. Initial connection attempt with PostgreSQL startup options failed with redacted diagnostics; the subsequent ordinary connection plus explicit read-only transaction completed successfully. No question/content/key/session secrets were read into output. Temporary read-only script was removed. Direct Chrome headless receiver probe was rejected by execution policy before running; no direct exception capture in the existing user tab is claimed.

Validation: focused suite 84/84 PASS (six files), web typecheck PASS, production build PASS; diff/secret checks recorded below in the current session report. Webpack development server restarted on localhost:3001. No live ask/retry, OpenAI/Blob, upload/index, allowlist change, migration/cleanup, database mutation, commit/push/deploy or Worker stash action. Tasks remain PARTIAL. Dispatch is ready for an owner-controlled live check; real browser/provider acceptance remains unexecuted.

### 2026-10-11 — AI_INVALID_RESPONSE diagnosis after owner live asks

Observed dev logs contain two POST /api/ai/ask responses: HTTP 502, 11.4s and 6.9s. Read-only Development verification (approved endpoint/neondb/effective runtime host pin, BEGIN READ ONLY) found two USER/GUEST-owned conversations in aggregate, no active turn/completed head, and two first turns FAILED with errorCode AI_INVALID_RESPONSE, created at 2026-10-11T15:10:37.069Z and 15:11:15.398Z. No principal IDs, keys, credentials or private question/response content were printed. Failed-turn policy correctly scrubbed question/response/provenance; therefore the latest row cannot independently be correlated with the literal question hi. Owner reports that question. Quota counters ask-global=2 and tokens-global=46000 are reserved ceilings, not actual provider usage or confirmation of a generation call.

Trace: qaHttpError maps an AppError AI_INVALID_RESPONSE to HTTP 502 / FAILED with sanitized message. This code can originate in invalid query embeddings (EmbeddingError INVALID_PROVIDER_RESPONSE), retrieval eligibility checks, generation preflight, provider envelope/JSON/schema, outcome consistency, exact sentence/citation grounding, public safety, final response validation or atomic completion eligibility fences. A generic DB completion failure maps UNKNOWN, not this error. HTTP/auth bootstrap failure and previous pre-fetch receiver issue do not explain persisted FAILED turns. Current logs/failed rows retain no stage diagnostics, provider request IDs, finish reason or usage. No provider call or retrieved evidence count for the historical asks can be confirmed from the available evidence. Do not infer calls or token usage from latency/quota.

Current fixture read-only state remains INDEXED/current READY, one published chunk. Offline tests against that in-memory chunk confirm instructionDetected=false and safe text metadata. With question hi and a mock provider, valid empty-parts CLARIFICATION_REQUIRED and INSUFFICIENT_SOURCE both pass generation validation. Existing tests confirm empty evidence returns the contract INSUFFICIENT_SOURCE without a generation fetch; retrieval itself still requires a query embedding. These checks do not reproduce or prove the historical model output or historical source eligibility. Greeting hi is syntactically valid; there is no deterministic greeting branch, and with retrieved evidence the model decides insufficiency/clarification under the existing prompt. No greeting special case or guard relaxation was introduced.

ROOT_CAUSE=UNRESOLVED_INSUFFICIENT_STAGE_EVIDENCE. FIX_APPLIED=NO; no proven implementation bug and no justified red regression case. Next diagnostic step requires content-free stage classification (embedding validation; evidence count; provider HTTP/finish/refusal/output schema; outcome consistency; grounding/citation; final eligibility) plus optional sanitized provider request ID/usage for a future separately authorized ask. Do not log prompt, evidence text, output text, identities, keys, cookie/HMAC or credentials. No automatic live replay was performed. Focused existing suite 161/161 PASS across eight files; typecheck PASS. Build/diff/secret checks recorded in the session report. Tasks remain PARTIAL; not ready to declare the next ask fixed.

No new live ask, embedding/generation/Blob call, upload/index, migration, cleanup, allowlist change, Neon mutation, commit/push/deploy or Worker stash operation. Temporary read-only/offline diagnostic script removed. Only this append-only documentation evidence was added in this diagnosis.

### 2026-10-11 — Development-only AI_INVALID_RESPONSE stage diagnostics prepared

Implemented request-scoped AsyncLocalStorage diagnostics with random server correlation UUIDs, wired only into qaHttp.ask in local development. Production/Preview forced off; Task 191 public body/status/headers, immutable idempotency key and existing security/grounding checks unchanged. Instrumented actual request/principal/admission/query-embedding/retrieval/eligibility/generation/preflight/provider/envelope/JSON/schema/outcome/citation/grounding/public-safety/atomic-completion order. Every known AI_INVALID_RESPONSE throw/mapping site has a specific category/origin. Provider fetch invocation is distinct from remote acceptance/billing. Projected generation HTTP/request-ID/finish/token metadata is available when supplied; embedding HTTP/request ID is available, embedding usage is not exposed by the existing adapter. Missing data remains absent/unknown.

Security projection allows only internal stage/category/code enums, random correlation ID, chunk counts, bounded numeric usage/status, bounded req_ request ID and known finish reasons. Schema issues contain safe code/path only; unknown field names become FIELD. No raw prompt/question/answer/chunk/provider response/error message, identity, cookie/key/HMAC, credential or URL is logged. Diagnostic sink failures do not alter operation behavior; concurrent requests have separate context. Origin tagging uses WeakMap, never database/persistence/public response. See docs/implementation/us21-stage-diagnostics.md for complete rejection-condition inventory, metadata semantics, removal guidance and the one-attempt plan.

Read-only Development endpoint/neondb/runtime host gate PASS; two conversations and two FAILED/AI_INVALID_RESPONSE turns remain, scrubbed=true. Available logs still provide only the earlier two asks/502; no historical stage or generation usage can be recovered. No scrubbed content inspected. Historical root cause remains NOT_IDENTIFIED. No speculative functional fix was made.

Deterministic validation: 17 new diagnostics cases plus existing focused modules/UI regressions, 178/178 PASS across nine files. Empty evidence -> INSUFFICIENT_SOURCE with no generation dispatch; valid evidence -> generation/persistence; unavailable, malformed JSON/schema, outcome inconsistency, citation reference, grounding, invalid embedding, lost eligibility and DB persistence failure each assert exact internal failure origin/public code. Tests also assert content secrecy, schema-path/provider-metadata projection, Production/Preview silence, concurrent isolation and nonthrowing sink behavior. Typecheck PASS. Production build and diff/secret checks recorded in session report. No PostgreSQL integration rerun: no schema or write-policy change, and no live test writes authorized for diagnostics.

One owner-triggered new-conversation question prepared: Ma xac nhan cua ho so QA Sao Tim la gi? Expected approved synthetic evidence sentence: Ma xac nhan cua ho so QA Sao Tim la QA-SAOTIM-21. Do not replay either failed historical key; controller creates the new intent key. Stop after one submit, then inspect US21_QA_DIAGNOSTIC events for its correlation ID and provider usage separately if owner dashboard access is available. Earlier two POSTs are conservatively charged to the five-question budget: 3 remaining before this diagnostic attempt, 2 after it regardless of outcome. Prior generation invocation/billing NOT_CONFIRMED, never claimed zero. No new live provider call, question/retry, fixture upload/index, migration/cleanup, allowlist/env change, Neon mutation, commit/push/deploy, worktree deletion or Worker stash operation. Tasks remain PARTIAL.

### 2026-10-11 — Wrong DEMO transport: wrong local server resolved

Root cause proved by port/process ancestry and both repository page sources: localhost:3001 listener PID 33144 and its Next parent PID 32988 ran from D:\KLTN\KLTN, under the main-repo Turbo dev tree, not the US-21 feature worktree and not Webpack. Main-repo /assistant imports AssistantDevelopmentChat unconditionally in development; it has no real-QA selection branch. The prior feature dev exec had exited. Therefore this owner question executed demo and provides no live retrieval/generation evidence. It is not another POST/ask and does not consume a third live-ask budget slot.

Effective feature-worktree Varlock statuses were read without printing values: QA_RUNTIME_ENABLED=true, abuse accepted, approved endpoint/neondb and runtime pins matched, HMAC/local-network identity/OpenAI present, exact existing fixture-only allowlist, Preview and cleanup disabled. Keys are in ignored .env.local; .env contains no QA keys. Required QA variables are server-exposed, not @internal, and retain sensitive defaults. No env or allowlist modification was needed. Feature /assistant prioritizes AssistantRuntimeChat when development QA flag is true; false selects clearly marked demo. Missing/incorrect backend security configuration closes the real session/API gate; the runtime component never falls back to demo responses. Production selects unavailable and never imports development demo. No application-source mode-selection fix was necessary.

Stopped only the verified main-repo Next dev process serving the conflicting port, then started npm run dev -w web -- --webpack from the feature worktree. Browser verification on /assistant: no DEMO banner or mock controls, existing Admin session, session HTTP 200, text field settable, new-conversation enabled, no turn/pending question. Send is disabled solely because draft is empty. Ready identity uses the real HTTP transport via the existing distinct bootstrap/ready key; no ask was submitted. No cookie/session credential was read or copied.

Added assistant-runtime-mode.vitest.test.ts: builds/executes the actual page selection without mounting or making requests, verifies development true -> AssistantRuntimeChat, false -> AssistantDevelopmentChat, production regardless of QA flag -> unavailable AssistantChat, no demo/fixture dependency in production, and server gate rejects missing pins/database, wrong target, unaccepted abuse or Preview/Production. Development bundles may contain demo definitions; selection tests assert the returned real component, not an unsupported claim that every development bundle excludes demo code. Demo fixture behavior cannot participate in that real execution path.

Validation: focused session/controller/transport/mode/API/runtime suite 89/89 PASS; typecheck PASS. Production build and final diff/secret checks recorded in session report. No application source or ignored env changed; only regression test and append-only docs added. Local Webpack server restored for the owner's single supported diagnostic question. Two historical real POSTs still count against five-question budget; three live-ask slots remain, not a claim of zero historical provider charges. No live ask/provider call, upload/index, migration, cleanup, disable/delete, allowlist change, commit/push/deploy, worktree deletion or Worker stash action. Tasks remain PARTIAL.

### 2026-10-11 — Existing 502 diagnostics and Guest chat lifecycle

Read existing Webpack logs and approved Development database using a target-pinned READ ONLY transaction; no new ask or provider call. Correlation bef508d1-6c53-4487-8e05-17d07571957b: embedding HTTP 200, retrieval 1, eligible evidence 1, generation HTTP 200, finish stop, usage 501 prompt + 18 completion = 519 tokens. Last validated stage GENERATION_OUTPUT_SCHEMA; rejection GENERATION_OUTCOME / OUTCOME_CONSISTENCY, public AI_INVALID_RESPONSE / HTTP 502. Existing combined guard does not identify whether unanswered/status or answerParts/status violated consistency. No raw response was retained or recovered. Strict rejection remains unchanged; split the same predicates only to emit safe custom issue paths unanswered or answerParts. Three diagnostic regression cases were red before this change and green afterward. No proven provider adapter, citation, grounding or persistence defect for this request; rejection precedes citation/grounding and successful completion.

Separate correlation 1f3c94a1-280b-4445-b40d-4a8d4e00f0a0 failed QUESTION_EMBEDDING_STARTED / PROVIDER_FAILURE, AI_UNAVAILABLE, embedding dispatched, generation not dispatched. Browser cancellation does not prove zero provider cost. Four recorded turns are FAILED, all Guest-owned; latest errors AI_INVALID_RESPONSE and AI_UNAVAILABLE. Failed question/response/provenance content is scrubbed; conversations are neither deleted nor expired and have no active turn. Scrubbed content was not recovered.

Proven lifecycle defect: installed Better Auth sets isPending=(current.data===null) during refetch. Settled Guest sessions have null data, so focus/online/session refetch temporarily produces unresolved. Previous AssistantRuntimeChat replaced the keyed authenticated subtree, disposing its memory-only controller and aborting in-flight transport, then rebuilt an empty controller when Guest settled. Transient authenticated-session errors also cleared that subtree. Red tests reproduced both boundary changes. Preserve a confirmed principal boundary during transient refetch/error, disable submit/keyboard/retry until auth and server bootstrap revalidate, and retain the same ready identity key. Confirmed login/logout/account switch or unauthorized response still clears the old identity. Guest cookie identity rotation changes the key. No persistent client cache, automatic POST replay, new idempotency key, restored scrubbed history, or retention change.

This lifecycle defect can occur without HMR. Exact React remount and auth transition of the owner's historical request were not instrumented; timing of session rebootstrap corroborates the path but does not establish exclusive causation. RSC GET and hot-update requests alone are not proof of a reset. No router.refresh/navigation exists in the assistant path. Full page reload/HMR remount can still clear memory-only chat; durable history restoration is not added in this scoped fix.

Validation: 180/180 focused tests across 11 files PASS, including controller UNKNOWN/error handling, HTTP/session key, boundary transitions, real/demo/production selection, server-rendered disabled composer, strict generation and diagnostics. Typecheck PASS; production build PASS; diff check PASS. Full suite and live ask not run. Production/Preview remain disabled, no env/allowlist change. Local feature Webpack restarted on port 3001 after build. Current IAB tab is no longer available, so no fresh browser lifecycle replay is claimed. Conservatively account four admitted attempts against five-question budget: one remaining, earlier provider usage still incomplete. Next supported owner question can diagnose the exact inconsistent field; successful answer remains unverified. Tasks stay PARTIAL. No commit/push/deploy, migrations, cleanup, document change, worktree removal or stash operation.

### 2026-10-11 — Final outcome consistency investigation (offline only)

ROOT_CAUSE=UNRESOLVED for historical correlation bef508d1-6c53-4487-8e05-17d07571957b. Existing evidence proves GENERATION_OUTCOME / OUTCOME_CONSISTENCY after provider HTTP 200, finish_reason=stop, 501+18 tokens and one eligible chunk. It does not identify the rejected field or retain a generation body. Completion token count is not proof of truncation. No historical body recovery, provider call, new ask/retry or database access occurred in this investigation.

Inspected actual prompt, JSON schema, Chat Completions envelope extraction, service mapping, diagnostic projection and Task191 discriminated response schema. Adapter parses message.content once and does not rewrite status/unanswered/parts; NFC/trim of answer text happens after outcome validation. ANSWERED requires nonempty cited parts and no unanswered aspects. PARTIAL requires nonempty cited parts and missing-information notice (provider unanswered=true maps to the existing safe constant notice). INSUFFICIENT_SOURCE and CLARIFICATION_REQUIRED require empty parts/citations and existing notices. Provider unanswered is internal, not a Task191 public field. Two strict predicates enforce unanswered === (status === PARTIAL) and nonempty parts exactly for factual outcomes. Provider JSON schema enforces shape and enum but does not encode these cross-field predicates; system instructions are compatible. No contradictory instruction or reproducible application mapping defect found. No prompt, schema, production code, grounding guard or citation rule changed in this task.

Expanded fake-provider HTTP/service/retrieval/adapter tests: all four valid outcomes produce Task191 SUCCESS only after mock persistence; each status with wrong unanswered and each status with contradictory parts produces HTTP502 at the same historical stage, safe diagnostic field path, failed persistence and no complete call. Valid outputs survive mapping with exact cited fixture text. finish_reason=length is rejected at GENERATION_ENVELOPE, malformed JSON at GENERATION_JSON; existing invalid citation, grounding, provider unavailable and persistence tests remain green. Empty retrieval invokes only the fake embedding request, never generation. Tests invoke handlers directly using Request objects and mocked fetch/store/database; no HTTP request is sent to localhost or an external service.

Guest regressions: UNKNOWN retains its exact pending object/key across repeated same-owner boundary refresh and send count stays one. Offline hook harness executes actual AssistantChat form/Enter/retry handlers: available=false blocks each path; true permits one fake send; subsequent revalidation does not retry UNKNOWN. Existing FAILED-preservation, unauthorized/login/logout boundary, readiness key, disabled-composer, controller disposal and production/demo isolation regressions pass. This is deterministic helper/hook coverage, not a real React/browser remount observation. Retention code unchanged: store checks deletion/expiry before replay/completion; mocked expired/deleted admission blocks retrieval/generation/completion. No persistent client history cache or scrubbed content recovery added. Database retention integration was not rerun because this task prohibits database writes.

Validation: 296/296 tests PASS across 12 focused files, zero skipped; typecheck PASS; production build PASS; diff check PASS; changed/untracked-file credential-pattern scan zero hits. No red application regression/fix pair is claimed: new tests passed against current implementation. Previous session's lifecycle and safe diagnostic fixes remain unchanged. Full suite/live browser/live acceptance not run. Production/Preview remain disabled. Remaining authorized live budget=1, unchanged. Diagnostics are ready for the owner's decision, but successful final live output is not guaranteed and historical field-level cause remains unavailable. Tasks remain PARTIAL. No commit/push/deploy, env/allowlist/document changes, migrations, cleanup, database writes, Worker stash or worktree operations.

### 2026-10-12 — US-21 final acceptance checkpoint on TXH

TXH is at merge commit `46a86723694aa3aea9a5758531391b2ee4ec6c03`. Read-only Neon Development verification: 15/15 migrations complete, zero failed/incomplete, PostGIS and pgvector available; allowlisted TEST/SYNTHETIC fixture INDEXED/READY with one chunk and embedding. No migration, cleanup, document, or turn-content mutation. The browser's `POST /api/ai/session` may create or reuse a Guest identity row; that row-level side effect was not separately verified. No change to US-19/20 implementation or Task191 contract.

Validation: full Vitest with disposable PostgreSQL/pgvector coverage 573/573, zero skipped; Task185 database cases 15/15; legacy script exit 0; typecheck 4/4; Prisma validate PASS; production build PASS; merge diff check PASS. High-confidence credential scan found no live credentials; DB URL hits were dummy gate-test fixtures or the loopback disposable-test harness. Generated client assets (107 files) contain none of the configured credential values or QA fixture ID. No new provider or Blob call. The prior live-question budget is exhausted per current owner instruction; another provider call requires separate approval.

Reused owner-provided live evidence: embedding HTTP 200, pgvector retrieval, one ANSWERED citation to the synthetic QA fixture, and one INSUFFICIENT_SOURCE HTTP 200. No follow-up was live-accepted. Local browser showed the real non-demo runtime and HTTP 200 auth/session bootstrap, but the fresh anonymous composer remained disabled; no ask was sent. Guest refresh is covered deterministically but browser acceptance remains PARTIAL.

The historical `AI_INVALID_RESPONSE` / `OUTCOME_CONSISTENCY` HTTP 502 remains OPEN because the offending model field was not retained; strict validation is unchanged. Hà Giang real-corpus evaluation is NOT_EVALUATED. Hourly cleanup and heartbeat workflows exist in this local TXH branch and run only on `master`; TXH is three commits ahead of `origin/TXH`, so scheduler activation and the retention SLA are not verified. Production cleanup remains disabled. TASK192/193/194/197 remain PARTIAL; US-21 is not ready to close. No commit, push, deploy, or Worker-stash operation.

### 2026-10-12 — US-21 fast-track closeout

US-21 closure is BLOCKED by outstanding acceptance, not by the offline test gate: 286/286 targeted tests passed, root typecheck passed (4/4), and production build passed (29/29 pages). Reused the existing 573/573 full Vitest/disposable PostgreSQL evidence on the same unchanged application commit; no migration, cleanup, Neon access/write, or live provider call was made. Docs remain append-only. Tasks 192/193/194/197 remain PARTIAL: real Hà Giang corpus evaluation, authenticated live follow-up, stable Guest/browser runtime acceptance, deployed retention SLA, and historical `AI_INVALID_RESPONSE` correlation `bef508d1-6c53-4487-8e05-17d07571957b` remain open. No claim that the transient navigation issue or historical 502 is fixed.

Created actionable follow-ups: GitHub #1 Guest/browser readiness; #2 authenticated multi-turn/idempotency; #3 historical AI_INVALID_RESPONSE; #4 verified Hà Giang corpus evaluation; #5 retention scheduler/SLA; #6 separate GPT-6 Luna configuration evaluation. References: https://github.com/TXHoai2309/KLTN/issues/1 through /issues/6. These do not lower the US-21 acceptance criteria. No task marked Completed; no push, deployment, feature-worktree removal/branch deletion, or Worker-stash operation while closure remains blocked.

### 2026-10-12 — US-22 destination context implemented offline on TXH

Tasks 198–202 IMPLEMENTED; combined live acceptance pending. Started clean at eae6d9301183c734d819fd0f43966e854b3e3020, matching origin/TXH. Reviewed original Product Document §§6.6/10.10/11.22/13.10 and System Specification §§3.4/5.1–5.6. Story contract: docs/stories/US-22-destination-context.md. ID-only DESTINATION extends GENERAL; client metadata and TRIP rejected. Server resolves current VISIBLE destination with safe minimal name projection. Conversation stores immutable context reference; follow-ups inherit it. Explicit mismatch rejects; UI switch/clear starts a new conversation. Owned replay, history and completion recheck context; completion holds a destination share lock. Existing principal/auth, abuse, idempotency, lease/fence, retention and Task191 strict outcomes remain.

Verified name guides retrieval intent, never supplies factual evidence. Existing RAG has no destination relation; bounded name filter plus exact-name complete sentence grounding conservatively excludes unrelated sentences. INDEXED/READY/current publication/server allowlist, source citations and extractive validation remain strict. Alias/pronoun-only source recall and actual Hà Giang corpus quality require live evaluation; synthetic tests prove behavior only. Generation model unchanged; issue #6 stays separate.

Destination Detail links to /assistant?destinationId=...; server verifies it and supplies bounded public choices. Context name wraps on mobile; native picker/clear are disabled during unresolved attempts. Explicit choices update only the public URL reference; cached page trees use server-projected choices, and passive browsing sets no global context. No localStorage/history-content cache. React StrictMode browser fixture verified first/follow-up, switch, clear, passive browsing/back, URL reload, UNKNOWN/abandon, auth revalidation and editable failure. 360x800 scroll width 345px; desktop 1440x1000 checked. This is mocked transport browser evidence, not live Guest/Next/Neon/provider acceptance or durable chat history restoration.

Validation: final full Vitest with disposable PostgreSQL16.15/pgvector0.8.6 605/605, 40 files, zero skipped; Task185 15/15. Includes real Guest/Traveler/Admin context inheritance, SQL constraint, scoped retrieval, concurrent keys, cross-owner denials and hidden context replay/history/completion. Legacy suite exit0; root typecheck4/4; production build29/29; Prisma generate/validate PASS. Scoped strict UI audit zero findings; DESIGN lint zero errors/four existing orphan-token warnings. Initial unconfigured global UI audit22 findings retained as evidence/debt, not global PASS. Diff/secret checks recorded at commit handoff.

Migration 20261012120000_add_qa_destination_context tested only on disposable PostgreSQL (containers/volumes removed). No Development/Production migration, Neon access or cleanup, OpenAI live call, real Development POST/ask, env/allowlist change, push or deployment. Owner-approved migration and existing runtime readiness/source configuration are prerequisites for combined live acceptance. US-21 remains unaccepted and issues #1–6 open. No Worker stash or unrelated worktree operation. Commit authorized by this task after validation; see final handoff SHA.

### 2026-10-12 — US-23 Task 203 internal source sufficiency policy

Baseline cc119925bd75aaabd6ba3c13a8cbedb8048ff1cf; isolated branch hoai/us23-task203-source-sufficiency. Owner authorized a remote feature branch and later merge into local TXH. Audited actual HTTP/principal/reservation/context/embedding/pgvector/prompt/generation/citation/persistence flow. Existing INDEXED/READY/current publication, embedding provenance, public allowlist, scoped sentences, exact snapshot/hash recheck and completion locks are reused. No schema or migration change. Detailed contract and audit: docs/stories/US-23-source-sufficiency.md.

Added independently testable server-only source policy with explicit retrieval failure, eligibility, no candidates/scoped sentences, unrelated topic, missing evidence, partial/complete reviewed aspect coverage and conflict/uncertainty decisions. Semantic review binds to the current question/context/evidence revision/text; history cannot become evidence. Similarity can exclude only, never certify coverage; no new default threshold or change to existing 0.25 retrieval heuristic. Service passes only an internal decision after successful retrieval/recheck. Generation reuses existing insufficient response for a definite internal INSUFFICIENT decision, with no provider dispatch. Public citation/API/UI/prompt shape, auth, retention, model and runtime settings are unchanged.

Important boundary: no generic semantic reviewer exists in the active runtime. Nonempty eligible retrieval is UNCERTAIN/UNASSESSED, not certified sufficient. Complete/partial/unrelated semantic tests use explicitly reviewed synthetic facets; they are not real-corpus quality evidence or automatic semantic detection. Existing US-21 irrelevant-extract and incomplete-ANSWERED characterization probes still hold. Task 203 implements the decision policy/integration, not all of US-23's unsupported-answer prevention. Owner review and real-corpus calibration remain pending; Task 204–207 untouched, no backlog Completed/ACCEPTED update.

Validation: final focused 120/120 (four files; source-policy 27 cases); related offline regression 554 passed/62 initially skipped (before one additional focused client-boundary case); disposable PostgreSQL16.15/pgvector0.8.6 subsequently 62/62, zero skipped, including Task185 15/15 and current-publication/Disable/context/ownership/completion races; owned container/volume cleanup PASS. RAG lifecycle legacy 52/52. Root typecheck force-run 4/4, zero cached. Production Webpack build PASS29/29 using dummy loopback configuration and disabled QA/cleanup, with existing Varlock dynamic-dependency warning. First worktree gates failed because generated env/client were absent, shared package links pointed to concurrent TXH schema work, and Next cross-drive dependency paths failed; local ignored codegen/package links and a local Next package copy fixed the environment, without changing product source. Lint unavailable: npm run lint --workspace web fails Missing script; no linter config exists. Diff/credential checks run at commit handoff. No live OpenAI/Blob/Neon/production DB, deployment, migration, env/allowlist change or Worker stash operation.


### 2026-10-12 — US-23 Task203 runtime closure + Tasks204–207 offline implementation

Baseline e2e3aeac6e6e9e5899a4b03427878cfdcc26a839; isolated existing branch
hoai/us23-task203-source-sufficiency. Owner explicitly authorized closing the
runtime gap before automatically continuing the integrated batch. Historical
Task203 note above is superseded: the runtime now creates a real structured
semantic assessment from current eligible/scoped retrieval, validates quoted
support/reference/shape, creates its own snapshot binding and invokes the existing
policy. PhaseA focused161/161, disposable PostgreSQL62/62, web typecheck and build
29/29 passed before PhaseB. No fixture semantic review in production.

Task204: completed insufficient/clarification/partial/answered results reuse the
public contract and confirmed persistence; technical 503/502/500 and UNKNOWN stay
separate. Task206: grounding enforced in generation adapter and service, every
returned sentence/citation must be reviewed current support, all supported aspects
must be represented; partial cannot label itself complete or omit supported facets.
Valid uncertain/nonexhaustive/conflicting review fails closed without factual
generation. Malformed/unavailable assessment is technical failure. Watcher includes
assessment; no change to US19 approval/publication or US22 scope/ownership rules.

Two bounded structured provider calls maximum per attempt (assessment15s default,
generation25s), no automatic retry; existing input8000/output2000/64KiB response
bounds each. Conservative admission reservation33000 replaces23000 to cover the
extra call; replay remains uncharged and recovered/failed attempts charged. No new
similarity floor; existing candidate0.25 is unchanged and not a semantic guarantee.

Task205: exact requested notice with adjustment guidance in shared AssistantAnswer,
no fabricated facts/citations. Stored public message literal remains compatible.
Partial visibly separates supported content and missing data; technical errors keep
existing edit/new-intent path. Browser offline fixture checked desktop and390x844,
no horizontal overflow, distinct failure, edit/resubmit and follow-up continuity.

Task207: actual assessment+generation adapters through HTTP/service verify factual
and nonfactual outcomes, citations and persistence, malformed/forged references,
unsupported/irrelevant exact quotations, incomplete ANSWERED, omitted supported
facets (including PARTIAL), conflict/uncertainty, provider failures/timeouts,
revocation, history contamination and Destination scope. Existing retrieval/service
suites cover real embedding error mapping and database/timeout boundaries. Former
irrelevant-exact-sentence and incomplete-ANSWERED characterization probes now
have rejecting regression expectations (2/2), not claims of real-corpus quality.

Validation: final focused11 files243/243; final full
Vitest43 files669/669 including assessment32 and UI3, zero skips, using disposable
PostgreSQL16.15/pgvector0.8.6 (Task18515/15; DB suites62/62). Harness owned container
and volume cleanup PASS. Legacy regression suite exited0 across all11 scripts;
subsequent lint command fails Missing script and is NOT_AVAILABLE (no config), not
PASS. Root typecheck force-run4/4 uncached and web typecheck PASS. Production local
Webpack build29/29 with dummy loopback configuration and QA/cleanup disabled;
existing Varlock dynamic-dependency warning remains. Scoped strict UI audit reused docs/design/us22-premium-ui.json: zero findings;
ignored JSON evidence temp/us23-ui-audit.json. DESIGN lint zero errors/four existing
orphan-token warnings. Final source/document diff check and scoped credential/file
review at selective commit handoff.

US23 IMPLEMENTATION_READY for live acceptance; NOT ACCEPTED. Semantic relevance,
exhaustive facet discovery and conflict classification remain probabilistic; server
traceability does not independently prove semantic truth. Real approved Hà Giang
corpus coverage/recall, provider runtime/schema behavior, latency/cost, live Guest/
Destination/ownership/idempotency and deployment readiness still require owner
acceptance. Existing extractive sentence and exact destination-name limitations
remain. No schema/migration, live OpenAI/Neon/Blob/production DB, flags/env/allowlist,
push, deployment, local/remote merge or main TXH/unrelated dirty-file change in this
batch. Selective local feature commit only; SHA supplied in final handoff.

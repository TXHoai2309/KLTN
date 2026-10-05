# US-01 — Đăng ký tài khoản Du khách

## Status

ACCEPTED

## Epic

Authentication / User Access

Task ID: 82

## Owner

Tô Xuân Hoài

## Sprint

Sprint 1

## Goal / User Story

Là Khách vãng lai, tôi muốn đăng ký tài khoản Du khách để có thể sử dụng các chức năng cá nhân của hệ thống.

## Outcome

Khách vãng lai đăng ký qua Better Auth. Chỉ khi kết quả tạo tài khoản được xác nhận, UI mới báo thành công và cho phép người dùng tiếp tục với phiên Du khách.

## Source References

- **Product Document:** §4.4–4.5 (Du khách and Quản trị viên roles); §7.11 (`LD-08`); §8.6 (`MH-06`); §9.3 (authentication and authorization requirements); §12 (responsive web); §13.6 (authentication acceptance).
- **System Specification:** §2.2 (user authentication) and §2.3 (authorization rules).
- **Requirement IDs:** `YCCN-03`, `YCCN-04`, `YCCN-06A`, `YCCN-06B`, `YCCN-06C`, `YCCN-06D`; acceptance `NT-11`, `NT-12`, `NT-16A`, `NT-16B`, `NT-16C`, `NT-16D`.
- **Flow/screen:** `LD-08`, `MH-06`.
- **Figma:** No exact Figma page/frame locator is confirmed in this contract. Consult the `MH-06` design in Figma during Task 84; this story does not prescribe visual styling.

## Dependencies

- Existing Better Auth email/password setup, Prisma auth tables, and server-owned `User.role`.
- Tasks 83–86 below complete and verify the remaining implementation and acceptance evidence.

## In Scope

- Define the public signup request, current validation policy, provider result mapping, and user-visible errors.
- Create a `TRAVELER` account using the existing Better Auth flow; prevent public role elevation.
- Prevent duplicate users on repeated submissions and handle the auth-context return without replaying a write.
- Preserve safe form input and provide actionable failure feedback.

## Out of Scope

- Admin self-registration or Admin bootstrap.
- Social/OAuth signup unless required elsewhere.
- Email verification workflow, forgot/reset password, profile editing, avatar, MFA, or advanced account settings.
- Implementing Traveler business features or redesigning unrelated login behavior.

## Business Rules

- A Guest may self-register a Traveler account. Public signup never creates an Admin; Admin does not implicitly receive Traveler permissions.
- Validate signup data before account creation. The form's current name/password length rules are implementation policy for this story, not lengths prescribed by Product Document or System Specification.
- A duplicate signup identity creates no second `User` or credential `Account`.
- Show signup success only after Better Auth confirms account creation. A failed or uncertain result is not success.
- After signup from a Traveler-only context, return to that safe internal context when possible. The user must initiate/confirm the original action again; authentication must not replay its write.

## Roles / Authorization

- Guest: may submit public signup.
- Successful public signup: `TRAVELER` only.
- `role` and Admin/permission flags are server-owned and are not accepted as client authority. A crafted `role: "ADMIN"` or equivalent field must never elevate the account.
- Current config uses Better Auth `user.additionalFields.role` with `defaultValue: "TRAVELER"` and `input: false`; Prisma `User.role` is `TRAVELER | ADMIN` with default `TRAVELER`.

## Ownership Rules

N/A. This story creates the account identity only; ownership rules for Traveler business records belong to their own stories.

## UX / UI Contract

- Use the existing `MH-06` sign-in/sign-up surface. Keep visual details aligned with Figma when Task 84 implements the UI.
- Keep name/email values where safe after validation or request errors; keep password masked and never log or persist it in plaintext from application code.
- Disable submit while the request is pending. The current form already disables the button while `isSubmitting`.
- Show a suitable message for validation, duplicate identity, known failure, and uncertain completion. Do not expose database/provider internals.
- Only show success after confirmed signup. Current no-context destination is `/dashboard`.
- Task 85 uses one `returnTo` query parameter for a safe internal return context. When absent or invalid, successful signup/sign-in uses `/dashboard`. A future Traveler-only feature must preserve navigation context only; the user must initiate its write again after returning.
- Keep the form usable from 360px and wider without horizontal scrolling.

## Data Contract

- Fresh signup creates one Prisma `User` with `role = TRAVELER`, one Better Auth credential `Account`, and an authenticated session when auto-sign-in is enabled.
- `User.email` is unique. Better Auth 1.7.5 lowercases email before its existing-user lookup and account creation. The signup component adds no trim/lowercase step; no additional normalization rule is specified here.
- Better Auth hashes the password before storing the credential account. Plaintext passwords must not be stored or logged by application code.
- `User.role`, `Account`, and `Session` already exist. No schema or migration change is part of this story.

## API Contract

- Do not add a custom `/api/register` endpoint or a second response envelope.
- UI calls `authClient.signUp.email(...)`; Better Auth handles the request through the existing `/api/auth/[...all]` Route Handler (`POST /api/auth/sign-up/email`).
- Application-level request:

  ```json
  {
    "name": "string",
    "email": "string",
    "password": "string"
  }
  ```

- The client must not send or control `role`, Admin flags, or permissions. Better Auth's `input: false` additional field is the server-side boundary.
- Consume Better Auth's provider result directly; map it to the application-visible outcomes below without adding a generic mutation `operationStatus` wrapper.

## Error / Recovery

Application-visible outcomes:

- **`SUCCESS`:** Better Auth confirms account creation; a `TRAVELER` user is available to the UI and the current auto-sign-in behavior establishes a session.
- **`VALIDATION_ERROR`:** Local or server/auth validation fails; no account is created. Show the relevant field guidance.
- **`IDENTITY_ALREADY_EXISTS`:** The normalized signup email already belongs to an account; no duplicate user is created. Offer a suitable sign-in path without exposing provider internals.
- **`SIGN_UP_FAILED`:** Another known provider/auth failure; do not say an account was created.
- **`UNKNOWN` / technical uncertainty:** The request may have reached the server but the client cannot confirm the result. Never show success. The current signup component has no separate `UNKNOWN` state; Tasks 83 and 86 must verify provider/network behavior and ensure uncertain retries cannot create duplicates. Do not invent a second auth response protocol in this story.

Task 84 maps known signup provider codes to user-facing messages without exposing provider internals. Task 86 still verifies failure and uncertain-result behavior.

## Write Semantics / Idempotency

Signup is a write, but it does not use the generic `idempotency_record` wrapper. Duplicate safety comes from Better Auth's existing-email check plus the database unique constraint on `User.email`; a retry after an uncertain response must never create a second user. The UI also prevents repeated submit while the request is pending. Task 86 verifies sequential/repeated signup and the database result.

## External Services

Better Auth and the existing Prisma/Neon database. No new external service is introduced.

## Acceptance Criteria

- [x] **AC-01:** Given a Guest with valid signup data, when they submit it, then the existing Better Auth email signup flow receives `name`, `email`, and `password`.
- [x] **AC-02:** Given successful signup, then exactly one `User` with `role = TRAVELER` and its credential `Account` are created.
- [x] **AC-03:** Given a crafted request containing `role: "ADMIN"` or an Admin flag, then public signup cannot elevate the user to Admin.
- [x] **AC-04:** Given missing/invalid required input, including a name shorter than the current two-character form minimum, then server/auth validation prevents account creation and the UI gives actionable feedback.
- [x] **AC-05:** Given an email already registered (including a case variant), then signup creates no second `User`/credential `Account` and offers a suitable message.
- [x] **AC-06:** Given a failed or uncertain provider result, then the UI does not report signup success before account creation is confirmed.
- [x] **AC-07:** Given successful signup, then the new Traveler has a usable authenticated session, matching the current Better Auth auto-sign-in configuration.
- [x] **AC-08:** Given signup starts from a Traveler-only context, then after successful authentication the user can return to that safe internal context when possible, without automatic replay of the original write.
- [x] **AC-09:** Given repeated or double submission, then pending UI state prevents concurrent user submits and auth/database identity constraints prevent duplicate accounts.
- [x] **AC-10:** Given supported viewport widths of 360px and above, then the signup UI remains usable without horizontal scrolling.

## Test Plan

Task 86 verified successful signup, role and session, crafted role input, invalid fields, duplicate/case-variant email, safe provider failure, repeated submission, return context, no-write-replay behavior, responsive UI, and the resulting User/Account/Session rows. No auth-specific test file was found during this contract review; lightweight temporary smoke scripts were removed after use.

## Task 83 Backend Evidence

- **Server validation:** Added Better Auth `user.validateUserInfo` for email/password user creation. Names shorter than the existing two-character form minimum are rejected before persistence with provider error `INVALID_NAME` (HTTP 403). Better Auth 1.7.5 itself requires a name string, validates email format, requires a non-empty password of 8–128 characters, and lowercases email before lookup/create.
- **Traveler-only role:** Existing `role` configuration remains `input: false` with default `TRAVELER`; Prisma also defaults role to `TRAVELER`. Runtime signup with `role: "ADMIN"`, `admin: true`, and a permissions field was accepted but stored as `TRAVELER`.
- **Duplicate identity:** Exact and case-variant resubmissions both returned HTTP 422 and left exactly one User. No custom idempotency wrapper was added.
- **Runtime verification on Neon development:** Valid signup produced exactly one Traveler User, one credential Account, and one Session; the returned cookie successfully resolved through Better Auth `get-session`. Invalid name returned HTTP 403 with no User. Invalid email, a seven-character password, and missing name returned HTTP 400 and created no User.
- **Cleanup / schema:** Temporary smoke identities and their Account/Session rows were deleted and verified absent. No Prisma schema or migration change was needed. The smoke script was temporary and removed.
- **Remaining at Task 83 handoff:** Tasks 84–86 were still open. Task 83 did not add a separate `UNKNOWN` auth response contract or implement return-context navigation.

## Task 84 Frontend Evidence

- **Existing behavior retained:** The page already provided name, email, and password fields; Zod submit validation; the Better Auth email signup call; a pending submit state; success toast/navigation to `/dashboard`; and a switch to sign-in.
- **Frontend changes:** Added explicit text/email/password types and name/email/new-password autocomplete; associated field errors with inputs using `aria-invalid`, `aria-describedby`, and alert semantics; opted out of browser-native validation so the existing Zod messages are shown consistently; and exposed pending state with a disabled button, `aria-busy`, and “Creating account...” text.
- **Validation:** Name remains required with a two-character minimum, email must be valid, and password remains required with an eight-character minimum. This is UX validation only; Task 83 server validation remains authoritative.
- **Provider errors:** Duplicate identity, invalid name, invalid email, and short password codes map to safe user-facing copy. Other errors map to a generic message; provider/database messages are no longer displayed directly.
- **UI verification:** In the local browser, empty submit displayed all three field errors and disabled submit; a one-character name, invalid email, and short password each displayed their corresponding field error without invoking signup. Pressing Enter in the password field triggered the same local validation. The existing success callback and loading guard were reviewed in code; a valid signup was not submitted during this form-only check.
- **Responsive review at Task 84 handoff:** CSS sizing suggested the existing `w-full max-w-md p-6` form and `w-full min-w-0` inputs fit a 360px layout, but that browser session lacked an exact viewport override. Task 86 later completed the exact 360px runtime verification below.
- **Visual baseline:** The signup page was inspected in the browser and retains the existing app visual language. The local Figma file remains unreadable here, so exact Figma comparison is unavailable.
- **Scope at Task 84 handoff:** No role/auth-server behavior, endpoint, redirect, return-context, schema, migration, or unrelated UI was changed. Story then remained `IN PROGRESS`; Tasks 85 and 86 remained.

## Task 85 Auth Context Evidence

- **Contract:** `returnTo` is the sole auth return-context query parameter. The login page resolves it on the server and passes the safe internal target to both auth modes. It preserves an internal path, query, and hash; missing or invalid input falls back to `/dashboard`.
- **Open-redirect protection:** The canonical resolver rejects external/absolute and protocol-relative URLs, non-rooted paths, raw or encoded backslash tricks, encoded leading slashes, control characters, malformed percent/UTF-8 escapes, invalid URLs, and repeated `returnTo` parameters. It checks the parsed origin against a fixed internal sentinel before returning a path.
- **Auth outcomes:** Successful signup and sign-in both revalidate the destination with the same resolver before `router.push`. Signup still uses `authClient.signUp.email`; sign-in still uses `authClient.signIn.email`. Both use `/dashboard` when no safe return target is present.
- **Mode switching and errors:** The login page keeps the resolved `returnTo` in its client mode-switcher prop, so switching Sign In ↔ Sign Up does not change the URL or lose the target. Client validation errors do not navigate away.
- **Write invariant:** Only the internal navigation target is retained. No write payload, pending action, browser storage, POST retry, or auto-submit is added. Returning to a feature never replays its original write; the user must initiate it again.
- **Producer search:** No Traveler-only feature, role guard, or pending-write producer exists in the current repository. The generic session guard on `/dashboard` now uses the helper to redirect to `/login?returnTo=%2Fdashboard`. Future Traveler-only producers should use `buildAuthLoginHref` with the current internal pathname/query/hash and must not pass pending mutation data.
- **Verification:** One-off assertions passed for fallback, internal path/query/hash, external/protocol-relative targets, `javascript:`, `data:`, `ftp:`, raw/encoded backslashes, encoded leading slashes, malformed escapes/UTF-8, repeated parameters, and login URL encoding. Browser verification confirmed `/dashboard` redirects to the encoded login target; nested query/hash survived both auth-mode switches; and signup/sign-in validation failures retained the query. No valid signup/sign-in request was submitted and no test user/data was created.
- **Tests/framework at Task 85 handoff:** No existing unit-test runner was configured; no new test framework or permanent test user was added. Task 86 was still responsible for the final end-to-end signup/session/failure matrix.

## Task 86 Final Acceptance Evidence

- **Environment:** Before database writes, the effective `DATABASE_URL` hostname matched the user-provided Neon development endpoint ID `ep-purple-pond-b3xujb8o`; the full connection string was not printed. Runtime requests used the existing local Better Auth route.
- **Successful signup/session:** Direct public signup returned HTTP 200 and created exactly one matching `User` (`TRAVELER`), one `credential` `Account`, and one `Session`. The returned cookie resolved through `GET /api/auth/get-session`. A real UI signup also displayed the confirmed-success toast and loaded the session-protected dashboard.
- **Privilege boundary:** A crafted public request including `role: "ADMIN"`, `admin: true`, and permissions was accepted by Better Auth but persisted as `TRAVELER` with one credential account.
- **Validation and duplicate identity:** Empty UI submit showed all three associated field errors; one-character name, malformed email, and short password were rejected in the UI, and Enter triggered the same validation. Direct requests with one-character name (HTTP 403), malformed email, short password, or missing name (HTTP 400) created no User. Exact and case-variant duplicate requests both returned HTTP 422 with `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`; the database retained one User and one credential Account. The duplicate UI displayed the safe sign-in/different-email message and no success toast or provider/database internals.
- **Double submit and return context:** A real UI double-click created exactly one `TRAVELER` User, one credential Account, and one Session. The form's pending state disables submit and marks it busy. With `returnTo=/dashboard?tab=plan#section`, confirmed signup navigated to that exact internal dashboard URL and displayed the authenticated user's name. A helper regression check passed for three valid internal targets and eleven malformed, external, or repeated targets falling back to `/dashboard`.
- **No write replay / uncertainty handling:** Repository search found no auth-triggered pending mutation, browser-storage write payload, POST replay, or auto-submit mechanism. Signup success toast/navigation are inside Better Auth's `onSuccess`; the runtime duplicate failure showed only safe error copy and no success. A forced response-drop scenario was not completed: the temporary proxy page did not hydrate the auth form at its alternate origin, so no signup request was sent through it. No test data resulted from that attempt. The success/error control flow and duplicate-safe retry behavior were verified directly.
- **Responsive/accessibility:** At exact `innerWidth = 360`, document width remained 360 with no horizontal overflow; the form, inputs, validation text, and submit button fit. Desktop sanity check at 1280px also had no overflow. Runtime DOM inspection confirmed associated labels, text/email/password types, name/email/new-password autocomplete, `aria-invalid`/`aria-describedby` errors, alert semantics, and keyboard Enter validation. The pending state is exposed with a disabled button and `aria-busy`.
- **Cleanup:** All generated development test users were deleted with their Account, Session, and Verification rows. Post-cleanup counts for each test identity were zero. Temporary smoke scripts were removed. No schema, migration, environment, or application-code changes were made for Task 86.
- **Task 86 result:** AC-01 through AC-10 are accepted. Story status is `ACCEPTED`.

## Expected Modules / Files

- Existing signup/auth boundary: `apps/web/src/components/sign-up-form.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/services.ts`, `packages/auth/src/index.ts`, and `packages/db/prisma/schema/auth.prisma`.
- No redundant registration route or business module is expected.

## Migration Impact

None expected. The `User.role` enum/default and unique `User.email` already exist.

## Environment Impact

None.

## Implementation Sequence

1. **Task 83 — [BE/API] Implement đăng ký tài khoản và gán vai trò Traveler mặc định:** review/harden existing Better Auth behavior; keep role server-owned; align server validation with this contract; verify duplicate identity safety.
2. **Task 84 — [FE] Xây dựng giao diện đăng ký và validation form:** implement field UX, client validation, accessible field errors, responsive states, and safe user-facing provider errors using the existing auth surface.
3. **Task 85 — [FE/API] Kết nối giao diện đăng ký với luồng xác thực:** complete auth/context integration, use a safe internal return context when available, and use `/dashboard` otherwise; never replay the original write.
4. **Task 86 — [TEST] Kiểm thử đăng ký thành công và các trường hợp thất bại:** verify AC-01–AC-10, including session, no role escalation, no duplicates, and uncertain transport behavior.

## Acceptance Evidence

Task 83–86 evidence is recorded below. Aggregate acceptance is `ACCEPTED`.

## Open Questions

No blocking product or contract question remains. The local Figma file was not available for a frame-by-frame visual comparison, which is not part of the documented US-01 acceptance criteria. No feature-specific write replay could be exercised because the repository has no Traveler write-producing feature yet; the auth return path persists navigation context only.

## Handoff Notes

Task 82 creates this contract only. The repository already contains part of the Better Auth foundation; Task 83 should review/harden/complete it rather than introduce a redundant registration API. No application code is implemented by this story task.

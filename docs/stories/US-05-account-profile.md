# US-05 — Xem và cập nhật thông tin tài khoản

## Status

ACCEPTED — all acceptance criteria PASS, including development Admin runtime smoke confirmed by the user on 2026-10-04.

## Epic

Authentication / Account Profile

## Goal / User Story

Là người dùng đã đăng nhập, tôi muốn xem và cập nhật thông tin tài khoản để quản lý thông tin cá nhân của mình.

## Source References

- Approved US-05 task contract and supplied account mockup: view/edit/pending/success states, name-only self-service, and AC-01–AC-15.
- Product Document §4.4–4.5 and §9.3: identities/roles and authentication; System Specification §2.2–2.3: trusted authentication/authorization boundary, as referenced by US-01–US-04. No account-specific requirement ID is inferred.
- [Product contract](../product/product-spec.md): server authorization, confirmed writes and retry rules, responsive 360px, business timezone.
- [Technical architecture](../architecture/technical-architecture.md), [US-01](US-01-register-traveler.md), [US-02](US-02-login.md), [US-03](US-03-logout.md), [US-04](US-04-auth-context-return.md).
- Current Prisma `User` model is implementation truth for existing fields. The supplied image is the UI reference; no Figma frame ID was provided.

## Existing Implementation Audit

- Prisma has `id`, `name`, `email`, `emailVerified`, `image`, `role`, `createdAt`, `updatedAt`, with `TRAVELER`/`ADMIN` and server-owned role.
- Better Auth 1.7.5 `/update-user` accepts a record body, extracts `name`/`image`/additional fields, uses trusted session user ID, writes through its adapter, refreshes its cookie, and returns `{ status: true }`. It does not implement this story's strict name-only request, 2..100 trimmed validation, persisted four-field DTO, or shared mutation outcomes/idempotency.
- Chosen application-owned API reuses Better Auth for identity and the existing database/idempotency/HTTP helpers for account writes. No second authentication system or schema change.
- Client session atom's `refetch({ query: { disableCookieCache: true } })` refreshes the existing Better Auth state shared with UserMenu. Server session reads disable cookie cache and refresh; Prisma reads produce the persisted account DTO.
- Existing strict logout endpoint and canonical `buildAuthLoginHref` are reused. Existing dev hydration fix remains in place.

## In Scope

- Production `/account` screen, self GET/PATCH, name validation, view/edit/cancel/save/error/UNKNOWN recovery, menu link/name synchronization, responsive keyboard usability, tests, scoped development smoke and cleanup.

## Out of Scope

- Email/password changes, verification flow, avatar upload, role updates, Admin user management, `/account/:userId`, schema/migrations, provider/version/config changes, global navigation redesign, commits/push.

## Field Contract

| Field | Display | Editable |
| --- | --- | --- |
| `name` | Họ và tên | Only after explicit Edit |
| `email` | Email | No: complete email-change/verification/re-auth flow is out of scope |
| `role` | Du khách / Quản trị viên | No: server-owned authorization field |
| `createdAt` | Ngày tạo tài khoản, vi-VN in Asia/Ho_Chi_Minh | No |

`id`, `updatedAt`, `emailVerified`, `image`, Account/Session/provider data, passwords/hashes/tokens/cookies/secrets are excluded from the account DTO.

## Authorization / Ownership

- Both Traveler and Admin access only the User identified by the trusted Better Auth session.
- Strict body rejects every field except name, including combined role/id/userId/emailVerified attempts. Query parameters cannot select an account.
- PATCH requires same-origin Origin and JSON; responses use `private, no-store`. No client ID/role establishes identity or permissions.
- Guest/new request with revoked session cannot render `/account`; redirects to `/login?returnTo=%2Faccount`. GET/PATCH deny missing/revoked sessions.

## API Contract

- GET `/api/account` → standard `{ success: true, data: { name, email, role, createdAt } }`.
- PATCH `/api/account`, JSON `{ name }`, required `Idempotency-Key` → shared mutation envelope with the same four-field persisted DTO.
- 401 unauthenticated; 400 invalid/extra fields or unsupported query/JSON; 403 wrong/missing Origin; 415 non-JSON; 409 key reused for different validated payload; uncertain persistence uses shared UNKNOWN/503.
- Route parses/maps only. Account module owns validation, identity and self-only Prisma selection/update. Explicit output projection excludes secrets even if an adapter returns extra fields.

## UI Contract

- Real authenticated `/account`: title/subtitle, initials summary, name/email/role/date, detail card. Default is view mode with read-only inputs.
- Edit opens only name and focuses it. Email helper explains read-only; role is an input, never a role dropdown.
- Cancel restores persisted state and makes no PATCH. After UNKNOWN it first re-reads persisted account with GET.
- Saving disables name/Save/Cancel, shows spinner and “Đang lưu...”; synchronous lock rejects duplicate submits. Edit/Save have different React keys and Edit cancels default browser action, preventing a click from becoming a submit while controls switch.
- SUCCESS displays returned persisted data in view mode and “Cập nhật thông tin thành công.” Existing Better Auth session refetch updates UserMenu without F5; menu refresh runs independently of the completed DB save and exposes a retry warning if it fails.
- Menu adds “Thông tin tài khoản”. A long-name menu button is width-limited on mobile; header layout otherwise remains unchanged. Account logout uses US-03's strict endpoint and confirmed-response helper.

## Validation

- Shared client/server schema: string, trim, required, 2..100 characters. Server rejects unknown fields. Invalid input never reaches the DB mutation.
- Associated label, error description, `aria-invalid`, role alert/status, focus outlines, keyboard submission, and reduced-motion loading style.

## Mutation Semantics

- Existing idempotency helper scopes by authenticated actor + `account:update-name`, hashes validated name, and atomically commits the User update plus successful response record. No TTL or cleanup job.
- Same key/same payload replays SUCCESS without writing again; same key/different payload returns FAILED/409.
- FE keeps key/name for UNKNOWN, reports uncertainty, and requires a successful fresh GET before attempting retry. Same draft retries the same key/payload; a changed draft after reconciliation is a new logical write. GET alone never announces save success.
- Timeout/unreadable/invalid DTO responses are UNKNOWN. No automatic mutation retries or optimistic success. Ordinary FAILED remains editable with the draft intact.

## Error / Recovery

- Generic errors exclude DB/provider/stack details. Save failure stays in edit mode, preserves draft and reopens controls.
- Session-refetch failure cannot turn a confirmed DB write into an unconfirmed write; a separate “Đồng bộ lại” control refreshes Better Auth.
- Revoked-session failure requires login for a successful subsequent write; normal account navigation uses existing canonical returnTo.

## Acceptance Criteria / Evidence

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 Traveler own data | PASS | Real development signup → account, correct name/email/Traveler/date; explicit DTO unit test |
| AC-02 Admin own data | PASS | User-confirmed development Admin smoke: `/account` shows own name/email/ADMIN role; own name saves and persists; role remains ADMIN and email unchanged; original name restored afterward |
| AC-03 Guest redirect | PASS | Initial guest route and post-logout route → exact account returnTo |
| AC-04 Default view | PASS | Name read-only; edit actions; screenshot |
| AC-05 Explicit Edit | PASS | Editable focused name, no automatic final-code mutation |
| AC-06 Read-only fields | PASS | Email/role read-only in browser/source tests, strict backend contract |
| AC-07 Cancel | PASS | Draft discarded; persisted name unchanged; mutation-record count unchanged |
| AC-08 Persisted success | PASS | Real save, success banner, view mode, reload and DB verification |
| AC-09 Header synchronization | PASS | UserMenu changes to persisted name before reload using Better Auth refetch |
| AC-10 Invalid names | PASS | Browser one-character validation; empty/short/long/non-string service tests; no additional mutation |
| AC-11 Forged fields/ownership | PASS | Deterministic strict-schema tests reject role/id/userId/email/emailVerified/provider fields; writes target trusted self only |
| AC-12 Duplicate submission | PASS | Real double-click Save gives one additional idempotency record; subsequent Enter gives no second write; synchronous click/Enter guard and replay/conflict tests |
| AC-13 Failure/draft/retry | PASS | Real session revocation → FAILED banner, retained draft, controls enabled; lost/unreadable response unit tests remain UNKNOWN |
| AC-14 Revoked/private boundary | PASS | Revoked session save denied and fresh route redirected without private screen; live unauthenticated GET/PATCH each 401, no DTO |
| AC-15 Responsive/keyboard | PASS | 360/768/1280 widths have equal scrollWidth/clientWidth (345/345 with scrollbar, 768/768, 1280/1280); edit focus, Enter validation/save and Tab to email |

## Test Plan

- `npm run test:account --workspace web`: session/DTO/validation/self ownership/forged fields/idempotency/client outcomes/duplicate lock/cancel/returnTo/session refresh/CSRF boundary.
- Existing auth suite, env generation, typecheck, production build, diff-check.
- Browser Traveler smoke on verified Neon development: register/account → edit/cancel/invalid/save/duplicate → UserMenu/reload → controlled session revocation/failure → strict logout → login/account restoration. Admin only when safe credentials are supplied.

## Expected Files

- `apps/web/src/modules/account/{account-contract.ts,account-service.ts,account-server.ts,account.test.ts}`
- `apps/web/src/app/api/account/route.ts`
- `apps/web/src/app/account/{page.tsx,account-profile.tsx,account.css}`
- `apps/web/src/lib/account-client.ts`
- `apps/web/src/components/user-menu.tsx`, `apps/web/package.json`
- This story and `docs/ai-progress.md`.

## Migration Impact

None. Existing User and IdempotencyRecord models suffice; no migration created/applied.

## Environment Impact

None. Existing development endpoint verified before test data creation. No secrets/public variables changed.

## Acceptance Evidence

- Final Admin runtime evidence (user-confirmed, 2026-10-04): development Admin opened `/account`, saw the correct own name/email/role, successfully edited own name and verified persistence after save. Role remained ADMIN and email did not change. The original Admin name was restored after smoke. This confirmation closes AC-02; it is not a claim of an independently repeated Admin smoke by the agent.
- Development endpoint matched `ep-purple-pond-b3xujb8o`. One disposable Traveler User and one credential Account were retained through repeated login/logout; role/emailVerified/email were not changed by profile writes. Normal logout left zero Sessions.
- During early UI smoke, React reused Edit as Submit and created two same-name writes before the fix. Final-code Edit/Cancel and one-character validation added no records. The intended valid double-click save increased records from two to three, exactly one new mutation, and stored the expected new name. These early test artifacts were also cleaned; they are not presented as final-code duplicate behavior.
- Revoked-session failures did not change persisted name or add idempotency records. Relogin returned to the protected account with the persisted value.
- Screenshots are outside the repository at `D:/KLTN/us05-evidence/`: `view.jpg`, `edit.jpg`, `saving-attempt.jpg`, `success.jpg`, `validation.jpg`, `error.jpg`, `mobile.jpg`, `tablet.jpg`. They show only the disposable identity, never password/token/cookie.
- Transactional scoped cleanup deleted the disposable User (cascading Account/Session), related Verification rows and account-operation test idempotency records. Counts for all five were verified zero. Temporary runtime script removed; no cookie/credential file or debug endpoint created.
- Final validation: env generation PASS; account tests 18/18 PASS; auth tests 33/33 PASS; typecheck PASS; production build PASS (dynamic `/account` and `/api/account`); diff-check PASS. No commit/push.

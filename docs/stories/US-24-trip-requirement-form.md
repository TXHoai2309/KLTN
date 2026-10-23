# US-24 — Chốt hợp đồng nhu cầu chuyến đi

## Status

DRAFT — CONTRACT, START, FORM, VALIDATE and TEST slices implemented; owner confirmation is still required for every `PROPOSED — pending owner` value and Open Question.

## Epic

Trip planning.

## Owner

N/A — pending owner assignment.

## Goal / User Story

Là Du khách, tôi muốn một cấu trúc dữ liệu nhu cầu chuyến đi thống nhất để form, server và planner dùng cùng một hợp đồng, tránh mỗi tầng hiểu khác nhau.

## Outcome

Một Zod schema/types dùng được ở client/server/test, readiness domain/guard dùng chung, API đánh giá không ghi DB và form Traveler tại `/trips/new` hiển thị kết quả chuẩn hóa/readiness; chưa có persistence hoặc planner.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, “Write semantics”.
- `docs/flow/user-flow.md` — “Trip requirement capture”, “Auth transition”, “Write recovery”.
- `docs/source-baselines.md` — Product/System là nguồn nghiệp vụ; repository là nguồn implementation.
- Product Document/System Specification `.docx`: **chưa tìm thấy trong workspace**, nên chưa đối chiếu được section/ID YCCN/QTN và không bổ sung ID ngoài condensed contract.
- Figma: chưa có frame form chuyến đi được cung cấp/đối chiếu; UI để các task sau.
- Current task instruction: proposed field set, limits and normalization rules for US24-CONTRACT.
- Current task instruction: US24-START readiness rule, server guard, evaluate API and status component.
- Current task instruction: US24-FORM form fields, server-evaluation flow, access states and responsive/accessibility requirements. Figma form frame was not supplied; implementation uses existing `/favorites` tokens.

## Dependencies

Đã có:

- Better Auth session and server authorization primitives; `requireTraveler` exists for future API and `requireActor(..., "traveler")` exists for protected pages.
- Shared API envelope/error helpers: `apiSuccess`, `handleApiError`, `AppError`; future validation response must use `VALIDATION_ERROR` with `details.fieldErrors`.
- Destination contract at `apps/web/src/modules/destination/destination-contract.ts`; `area` and `category` are normalized free-form taxonomy strings, not a closed enum list. No canonical mapping from trip interests to Destination category exists.
- Vitest config at `apps/web/vitest.config.mts`, with `@/` and `@KLTN/ui` aliases and `*.vitest.test.ts` inclusion.
- Shared `@KLTN/ui` primitives, React, Zod, Sonner and Lucide are available for later FE tasks.

Chưa có:

- No `Trip`, `TripRequirement`, itinerary or planner model/persistence.
- No confirmation/save flow or itinerary generation; `/trips/new` only evaluates the in-memory form state.
- No trip persistence or migration; this task intentionally adds none.
- No AI extraction, planner mapping or final-save service.

## Task Breakdown

- [x] [CONTRACT] — schema, types, constants, labels and contract tests.
- [x] [BE/FE] ngày bắt đầu — Asia/Ho_Chi_Minh readiness, server guard, no-write evaluate API and unmounted status component.
- [x] [FE] form — Traveler form and interaction states.
- [x] [FE] validate — required-field client gate, contract-backed optional errors and accessible error summary.
- [x] [TEST] — deterministic contract/API/form/source-contract matrix and manual UI checklist documented; browser evidence remains explicitly tracked below.

## In Scope

- `tripRequirementInputSchema` and inferred/input types.
- Canonical values for transport, companions, interests, pace and mobility constraints.
- Vietnamese option labels/descriptions and validation-message map.
- NFC + trim normalization, empty-string-to-null normalization, enum-list deduplication/canonical ordering, strict object keys and calendar-date validation.
- Contract-only tests without Neon, secrets, DOM or network.
- Readiness evaluation with injectable `now`, final-confirmation guard and no-write evaluate API.
- Pure FE status description/component mounted by the review state and without a confirmation/save button.
- Client required-field validation delegates optional-field rules to `tripRequirementInputSchema`; server remains authoritative and always re-validates.
- Accessible validation summary, per-field alerts/`aria-describedby`, blur/submit timing, first-error focus and no-network client rejection for missing required fields.
- Contract documentation and Open Questions.

## Out of Scope

- Final confirmation/save, itinerary/planner, AI/natural-language extraction, Destination mapping, Trip model, database, migration, local/session storage and analytics.
- `/trips/new` is an in-memory evaluate/review flow only; no persistence or final action is exposed.

## Business Rules

- Supported transport is exactly `MOTORCYCLE` or `CAR`; there is no default.
- A valid preliminary proposal requires valid `durationDays` and `transport`.
- Official confirmation/save additionally requires a valid `startDate`; this task does not implement confirmation or save.
- `startDate` is nullable for preliminary proposals and must be a strict calendar date when supplied.
- Companion rules: `SOLO` means group size 1; `COUPLE` means 2; `FAMILY`, `FRIENDS` and `OTHER` require at least 2; all group sizes are 1..20.
- Interests and mobility flags are unique after normalization and returned in canonical declaration order.
- Missing/empty optional string values normalize to `null`; optional enum lists normalize to `[]`.
- Mobility note is trimmed/NFC-normalized and capped at 500 characters.
- The contract schema itself does not enforce past/future policy; US24-START applies the proposed readiness rule that Vietnam-local “today” is accepted and a past start date is not eligible for final confirmation.
- A missing start date is valid for a preliminary proposal and sets `usesRelativeDays: true`; it is never eligible for final confirmation.
- A future save story must call `assertStartDateForFinalConfirmation` on the server immediately before final confirmation/save; client readiness is not sufficient.

## Roles / Authorization

The product contract defines trips and planning as Traveler capabilities; the proposed future page/API behavior is Traveler-only. Guest should transition through `buildAuthLoginHref(returnTo)` without replaying an action, and Admin must not inherit Traveler access. No authorization code is added in this contract task; the final decision is recorded below pending owner confirmation.

## Ownership Rules

N/A for this contract. Future Trip/itinerary records must be scoped by trusted Traveler `userId`; no client-provided owner identity is part of this payload.

## UX / UI Contract

The Traveler-only `/trips/new` page uses a server guard matching `/favorites`: Guest is redirected to `/login?returnTo=%2Ftrips%2Fnew`, Admin sees `AccessDenied`, and Traveler sees the form. The client form has seven groups (date, duration, transport, companions, interests, pace and mobility constraints), uses contract option labels/descriptions, sends only in-memory state to the no-write evaluate API, then shows the normalized “Nhu cầu của bạn” summary and `TripReadinessStatus`. No data is written to localStorage/sessionStorage/URL. Required validation runs on submit and after blur/touched changes; errors render beside fields with `role="alert"`, `aria-invalid`, `aria-describedby`, a polite live summary and links to each field, then focus the first error in display order. A blank form is rejected before `fetch`; editing a touched field revalidates it and removes its error once valid. Server 400 `fieldErrors` uses the same mechanism and wins over client messages. 401/403/technical/network states preserve input. The page is organized as a sequential tab flow: “Mô tả” → “Bổ sung” → “Kiểm tra” → “Đề xuất”; later tabs stay locked until their preceding state exists, and successful AI analysis advances to “Bổ sung” after applying only verified extracted values to empty form fields. Unmentioned/ambiguous fields remain for manual entry, and the existing transport safety rules remain unchanged. A manual path can skip AI without hiding the deterministic form. The result view has only “Chỉnh sửa” and the neutral note “Bước lập hành trình sẽ được thêm ở chức năng tiếp theo.” — no save/confirm/create button. Controls have at least 44px targets, fieldsets/legends, visible focus, reduced-motion handling and responsive one-column behavior. Figma was not supplied; existing `/favorites` tokens are used.

## Data Contract

All values below are `PROPOSED — pending owner` because the source DOCX is unavailable in the workspace and no accepted US-24 contract existed before this task.

| Field | Type / canonical output | Required? | Limits / normalization | Source |
| --- | --- | --- | --- | --- |
| `startDate` | `string \| null`, `YYYY-MM-DD` | Optional for proposal; required for official confirmation/save | NFC + trim; empty becomes `null`; strict format and real calendar date; past/future policy unresolved | Product condensed contract + task proposal |
| `durationDays` | integer | Yes | 1..14 | Task proposal |
| `transport` | `MOTORCYCLE \| CAR` | Yes | No default; other values rejected | Product condensed contract + task proposal |
| `companions` | `{ type, groupSize } \| null` | Optional | groupSize integer 1..20; SOLO=1, COUPLE=2, others >=2 | Task proposal |
| `interests` | canonical enum array | Optional; output `[]` when absent | Unique, canonical order, max 8 | Task proposal; mapping to Destination category deferred |
| `pace` | `RELAXED \| MODERATE \| PACKED \| null` | Optional | No default | Task proposal |
| `mobilityConstraints` | `{ flags, note } \| null` | Optional | Unique canonical flags max 6; note trimmed/NFC, empty -> null, max 500 chars | Task proposal |

### Eligibility levels

After parsing/normalization:

1. **Đủ điều kiện tạo ĐỀ XUẤT SƠ BỘ:** `durationDays` and `transport` are valid.
2. **Đủ để XÁC NHẬN & LƯU CHÍNH THỨC:** level 1 plus a valid `startDate`.
3. **Chưa đủ:** missing/invalid required level-1 data, or a level-1 payload without `startDate` when an official confirmation/save is requested.

US-24 does not persist this data. The requirement exists only in active in-memory/state for the future interaction; it must not be written to DB, localStorage, sessionStorage or URL/query.

### Normalization and strictness

- Strings are NFC-normalized and trimmed; empty strings become `null` where the field is nullable.
- Enum arrays deduplicate and sort by the exported canonical value order.
- All objects are strict; unknown keys are rejected.
- JSON numbers must be actual finite integer numbers where required. Numeric strings, decimals, scientific-notation strings and full-width digits are rejected by the schema boundary.

## API Contract

`POST /api/trip-requirements/evaluate` is a Traveler-only, no-write evaluation endpoint. The thin Route Handler delegates to `trip-requirement-http.ts` and injected `tripRequirementDependencies`.

- Order: `requireTraveler` first, then bounded JSON read, schema parse, readiness evaluation.
- Body limit: 8KB. Malformed JSON or oversized body returns `400 VALIDATION_ERROR` with `details.fieldErrors._form`.
- Invalid schema returns `400 VALIDATION_ERROR` with dot-path `details.fieldErrors`; missing `startDate` is not a validation error.
- Success returns `apiSuccess({ requirement, readiness })` where `requirement` is normalized and `readiness` includes `preliminary`, `finalConfirmation`, `missing`, `startDateIssue` and `usesRelativeDays`.
- All responses set `Cache-Control: private, no-store`.
- The handler does not log request body or persist anything.

Future Route Handlers must parse/validate this schema after establishing the auth boundary, then use the shared envelope. A validation failure must map to:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Thông tin nhu cầu chuyến đi chưa hợp lệ.",
    "details": {
      "fieldErrors": {
        "durationDays": "Số ngày chuyến đi phải từ 1 đến 14 ngày."
      }
    }
  }
}
```

The field-error key is the dot-separated Zod path, for example `companions.groupSize`, `mobilityConstraints.flags` or `_form`.

## Error / Recovery

- Contract parsing and evaluate API return `VALIDATION_ERROR` (400) and `details.fieldErrors`; auth remains 401/403.
- Client form maps `details.fieldErrors` to matching controls and preserves all user input on 400/401/403/5xx/network errors; 401 redirects without replay and the user must re-enter the form.
- Invalid/ambiguous transport must require a new user choice; it must never silently default to another mode.
- Mobility constraint content is sensitive health-related information: do not log it, put it in URL/query/returnTo, storage or analytics.
- Final-confirmation callers receive `422 TRIP_START_DATE_REQUIRED` for missing/invalid start date and `422 TRIP_START_DATE_IN_PAST` for a past date from the shared guard.

## Write Semantics / Idempotency

N/A: this task does not write a database or external state. If a later task adds any write, it must use the shared `SUCCESS` / `FAILED` / `UNKNOWN` contract and same-key retry for `UNKNOWN`.

## External Services

N/A.

## Acceptance Criteria

- [x] Given a complete payload, when it is parsed, then one normalized `TripRequirementInput` is returned with canonical enum arrays and Vietnamese-safe string normalization.
- [x] Given missing `durationDays` or `transport`, when the payload is parsed, then validation fails and field-level errors can be mapped.
- [x] Given unsupported transport, unknown keys, invalid calendar dates or invalid companion cross-fields, when the payload is parsed, then validation fails without coercion.
- [x] Given an optional empty string, when it is normalized, then it becomes `null` instead of being sent as meaningful content.
- [x] Given these contract/start/form/validate tasks, when the repository is checked, then no Trip schema, migration, save flow, planner or persistence is added; `/trips/new` remains an in-memory evaluate/review page.
- [x] Given valid Traveler input, when `POST /api/trip-requirements/evaluate` is called, then it returns normalized requirement data and readiness with `private, no-store` and does not write DB state.
- [x] Given a missing start date, when readiness is evaluated, then preliminary readiness may be true, final confirmation is false and `usesRelativeDays` is true.
- [x] Given a past start date or an invalid/missing start date, when the final-confirmation guard is called server-side, then it throws the specified 422 AppError code.
- [x] Given Guest/Admin or invalid/oversized/malformed input, when the evaluate endpoint is called, then it returns 401/403/400 respectively and auth rejection occurs before body read.
- [x] Given the FE status component receives each readiness branch, when it renders, then text/icon/ARIA status is distinct and no confirmation/save control is rendered.
- [x] Given a Traveler opens `/trips/new`, when the page loads, then the seven form groups are visible and neither local/session storage nor URL state is used.
- [x] Given the form is submitted, when the evaluate API returns 200, then the normalized summary and readiness status are shown; when it returns validation/auth/technical errors, field feedback or the corresponding safe recovery message is shown without clearing input.
- [x] Given the form submit is pending, when the user clicks again, then the shared submission lock keeps one request in flight and the button is disabled with `aria-busy="true"`.
- [x] Given a Guest or Admin opens the page, when the server authorization check runs, then Guest is redirected with the internal `/trips/new` return target and Admin sees `AccessDenied`.
- [x] Given duration/transport are missing or malformed, when the Traveler submits, then the client shows both required Vietnamese errors in order, focuses duration, and does not call the API.
- [x] Given a touched field becomes valid, when its value changes, then its client error disappears; optional empty fields do not block submit, while malformed optional values use contract messages.
- [x] Given the server returns `400 VALIDATION_ERROR`, when the form receives `details.fieldErrors`, then the same summary/field/ARIA mechanism displays those server messages without clearing input.
- [x] Given complete, missing and invalid inputs, when the contract, evaluate API and form-logic suites run, then each group has deterministic coverage without DB, network or machine-clock dependency.
- [x] Given Guest/Admin, malformed/oversized/prototype-shaped input or an unexpected server error, when the evaluate API is exercised, then auth/body ordering, strict rejection, private cache and mobility-note log privacy are proven.
- [x] Given the page/form source is inspected by the source-contract test, when authorization, seven groups, ARIA fields and actions are checked, then the Traveler guard, safe redirect, `AccessDenied`, accessible fields and absence of fake save/confirm/storage are proven.
- [ ] Given a real browser/session is available, when the manual UI checklist is executed, then Guest/Admin/submit/network/keyboard/screen-reader/responsive/Back-Forward behavior is confirmed.
- [ ] Given owner decisions are still pending, when US-24 advances beyond CONTRACT, then proposed values are reviewed before being treated as locked product rules.

## Test Plan

- `trip-requirement-contract.vitest.test.ts` covers full valid normalization, missing required fields, unsupported/empty transport, strict unknown keys, invalid calendar date and SOLO/group-size cross-validation.
- `us24-start.vitest.test.ts` covers Vietnam date boundaries, relative-day readiness, invalid/past/today dates, missing preliminary fields, exact guard errors, direct POST auth/body-order/size/JSON/validation/success behavior and all three FE status descriptions.
- `trip-requirement-form-logic.vitest.test.ts` covers minimal payload construction, empty-to-null conversion, numeric-string handling, field-error mapping, success/400/401/403/5xx/network decisions and pending-button state.
- `trip-requirement-form-logic.vitest.test.ts` also covers required duration/transport tables, exact Vietnamese messages, both-error focus order, optional contract errors and consistency with `tripRequirementInputSchema`.
- `us24-test.vitest.test.ts` adds the non-duplicative US24-TEST matrix: full seven-group contract/API/form case, missing payload/field combinations, invalid duration/transport/date/optional/strict/prototype-shaped inputs, malformed/oversized bodies, auth-before-body, private cache, mobility-note log privacy, Vietnam midnight/leap boundaries, source contracts, submission lock and stale-response sequence behavior.
- No Neon, network, secret, DOM environment or machine clock is used by automated tests; API tests inject `now` and authorization dependencies.

### Manual UI checklist / evidence (2026-10-09)

- [NOT PROVEN] Guest opens `/trips/new` → login → returns to `/trips/new` without auto-submitting.
- [NOT PROVEN] Admin sees `AccessDenied`.
- [NOT PROVEN] Blank form submit shows two errors, focuses duration and sends no request.
- [NOT PROVEN] Duration + transport only shows preliminary proposal and missing-start-date message.
- [NOT PROVEN] Complete seven-group input shows final-confirmation readiness.
- [NOT PROVEN] Network error preserves input and retry path works.
- [NOT PROVEN] 360/390/768/1280px viewports have no horizontal overflow.
- [NOT PROVEN] Full keyboard traversal and visible focus.
- [NOT PROVEN] Screen-reader announcement of error count/field errors.
- [NOT PROVEN] Back/Forward does not expose old unsent data; source test confirms no local/session storage.
- Reason: no browser/Traveler session was available in this run; automated source/logic/API evidence is recorded separately.

## Expected Modules / Files

- `apps/web/src/modules/trip-requirement/trip-requirement-contract.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-contract.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-readiness.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-http.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-server.ts`
- `apps/web/src/modules/trip-requirement/us24-start.vitest.test.ts`
- `apps/web/src/app/api/trip-requirements/evaluate/route.ts`
- `apps/web/src/app/trips/new/trip-readiness-status.tsx`
- `apps/web/src/app/trips/new/page.tsx`
- `apps/web/src/app/trips/new/layout.tsx`
- `apps/web/src/app/trips/new/loading.tsx`
- `apps/web/src/app/trips/new/error.tsx`
- `apps/web/src/app/trips/new/trip-form.css`
- `apps/web/src/app/trips/new/trip-requirement-form.tsx`
- `apps/web/src/modules/trip-requirement/trip-requirement-form-logic.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-form-logic.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us24-test.vitest.test.ts`
- `apps/web/src/components/header.tsx`
- `docs/stories/US-24-trip-requirement-form.md`
- `docs/ai-progress.md`

## Migration Impact

Không. No Prisma schema, migration or database write.

## Environment Impact

Không. No dependency, secret or environment variable added.

## Implementation Sequence

1. [x] CONTRACT — define and test the shared normalized contract.
2. [x] BE/FE ngày bắt đầu — owner-approved date policy and Asia/Ho_Chi_Minh “today” helper.
3. [x] FE form — Traveler-only form and states.
4. [x] FE validate — field mapping and accessible feedback.
5. [x] TEST — deterministic contract/API/form/source-contract coverage and manual checklist.

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Shared schema/types/constants/labels | PASS | `trip-requirement-contract.ts` exports the schema, inferred/input types, bounds, option metadata and error-message map. |
| Normalization and strict keys | PASS | Contract transforms NFC/trim/empty nullable text, canonicalizes enum arrays and uses strict objects. |
| Calendar date validation | PASS | Pure calendar check rejects dates such as `2026-02-30`; no `new Date(string)` comparison is used. |
| Contract/start/form/validate/test matrix | PASS | Existing contract 8/8, START 10/10, FORM/VALIDATE logic 11/11, new US24-TEST 29/29; full current Vitest suite 76/76 PASS across 7 files with injected dependencies/time. |
| No Trip schema/migration/save/planner scope leak | PASS | The form is an in-memory evaluate/review page only; no Trip persistence, migration, save button or planner was added. |
| Readiness and final-confirmation guard | PASS | Pure evaluator + Asia/Ho_Chi_Minh boundary tests; exact 422 AppError codes; JSDoc requires future save story to call the guard server-side. |
| Evaluate API and FE status component | PASS | Direct Route Handler tests pass auth-before-body, 8KB/malformed JSON, field errors, 200 readiness and private cache; `describeReadiness` covers 3 branches. |
| Traveler form and review flow | PASS | `/trips/new` adds the server auth guard, seven controlled field groups, contract-driven labels, server-evaluate summary/readiness, safe recovery and no-save review state. |
| Sequential tabbed `/trips/new` flow | IMPLEMENTED / NOT PROVEN in live browser | The client keeps the existing in-memory states mounted and exposes locked “Mô tả” → “Bổ sung” → “Kiểm tra” → “Đề xuất” tabs, horizontal reduced-motion-aware transitions, keyboard tab navigation and an explicit manual bypass. AI success uses the existing `applyExtractionToForm` seam; no API/schema/validator/business-rule change was made. Authenticated visual/responsive smoke is still NOT PROVEN because no Traveler session was available. |
| Form logic tests | PASS | `trip-requirement-form-logic.vitest.test.ts` covers payload conversion, field errors, response decisions and pending state. |
| Client required validation | PASS | Required duration/transport messages, ranges, ASCII-digit policy, optional contract errors, stable focus order and schema-consistency cases are automated; form wiring has no-fetch-on-invalid and ARIA summary behavior in source. |
| Security/source contracts | PASS | Automated checks cover Guest 401/Admin 403 before body read, private no-store, no sensitive mobility-note logging, strict/prototype-shaped keys, auth guard source, all seven field IDs/labels/ARIA and no fake save/confirm button or browser storage. |
| Responsive/browser evidence | NOT PROVEN | CSS includes 360px/390px/700px responsive rules, focus/reduced-motion/accessibility states; real viewport measurements and Traveler-cookie browser smoke were not available in this run. |
| Manual UI checklist | NOT PROVEN | Checklist is recorded above; no browser/Traveler session was available for Guest/Admin/submit/network/keyboard/screen-reader/viewport/Back-Forward checks. |
| Product/System DOCX alignment | NOT PROVEN | DOCX files were not found in the workspace; proposed values await owner review. |
| Owner decisions/Open Questions | NOT PROVEN | Status remains DRAFT until the listed decisions are resolved. |

### Validation commands

- `apps/web` contract test: PASS 8/8.
- Current full Vitest suite after TEST: PASS 76/76 (7 files; 29 new US24-TEST cases).
- Direct TypeScript check for `apps/web`: PASS after VALIDATE. Previously verified `packages/db` and `packages/ui` remain unchanged by this task.
- `npm run test`: **NOT RUN TO COMPLETION** — local npm shim stopped with `shim integrity check failed` before Turbo/test execution.
- `npm run check-types`: **NOT RUN TO COMPLETION** — local npm shim stopped with `shim integrity check failed` before Turbo/typecheck execution.
- `npm run build`: **NOT RUN TO COMPLETION** — local npm shim stopped with `shim integrity check failed` before Turbo/Next compilation.
- `git diff --check`: PASS after final documentation append.

## Open Questions

- `durationDays` 1..14: **PROPOSED — pending owner**; confirm whether the upper bound is 14.
- Exact value sets for transport, companions, interests, pace and mobility flags: **PROPOSED — pending owner**; DOCX/owner confirmation required.
- Is a past `startDate` allowed? **PROPOSED — không cho ngày quá khứ; hôm nay theo Asia/Ho_Chi_Minh được phép — pending owner.** The contract currently validates format/calendar only.
- Is there a maximum future distance for `startDate`? **PROPOSED — không áp giới hạn — pending owner.**
- Should companions distinguish adults/children? **PROPOSED — chưa phân biệt trong US-24-CONTRACT — pending owner.**
- Can Guest fill the form? **PROPOSED — Traveler-only theo product-spec — pending owner.**
- Future page route: **PROPOSED — `/trips/new` — pending owner.**
- Figma frame for the trip requirement form is missing; owner must provide/confirm the frame before UI work.
- Mapping `interests` to Destination `category` is unresolved; current Destination `category`/`area` are free-form normalized strings, and mapping belongs to planner story, not this contract.
- No Product/System DOCX was found in the workspace; owner must provide the authoritative files or section/requirement IDs before locking the contract.

## Handoff Notes

- CONTRACT/START/FORM/VALIDATE/TEST implementation slices are complete but the story remains intentionally DRAFT because owner decisions and manual browser evidence remain unresolved.
- The future story that confirms/saves an itinerary MUST call `assertStartDateForFinalConfirmation(input, now)` on the server immediately before the write; do not trust a client readiness flag.
- Do not add a Trip model, migration, planner or save/confirmation button in this story; the form page is intentionally in-memory and already covered by FORM/VALIDATE/TEST.
- The evaluate API is a no-write readiness check only; it does not make a proposal saved or confirmed.
- `/trips/new` keeps form state in React memory only. “Chỉnh sửa” returns to the same in-memory values; leaving the page loses them by design. The neutral next-step note is used instead of a dead “Lưu/Xác nhận/Tạo hành trình” control.
- `docs/ai-progress.md` contains pre-existing merge-conflict markers; this task must append progress without rewriting those markers.


## 2026-10-23 — Owner-approved Trip planning UI refinement

Owner approved Q1–Q5 and implementation of the six supplied `/trips/new` states.
Shared field editors, form/review/planner composition, narrow-screen layout,
labels/focus/instance IDs, option icons and status readability were refined within
the existing palette/fonts. Business input/check/confirmation/save rules and
story acceptance status remain unchanged. See
[design and verification record](../design/trip-planning-ui-refinement.md) for the
60-state browser matrix, 474 passing relevant tests / two unchanged theme-baseline
failures, scoped audits and live-acceptance limits.

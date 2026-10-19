# US-26 — Kiểm tra nhu cầu chuyến đi trước khi xác nhận

## Status

DRAFT — FE review/edit/check integration is implemented; owner decisions, browser evidence and final confirmation/save remain pending.

## Epic

Trip planning.

## Owner

Đào Duy Bình — pending owner acceptance.

## Goal / User Story

Là Du khách, tôi muốn kiểm tra toàn bộ nhu cầu chuyến đi và biết nguồn gốc từng giá trị trước khi tiếp tục, để dữ liệu AI không được coi là xác nhận ngoài ý muốn.

## Outcome

Một màn review dùng chung cho hai đường vào: kết quả AI của US-25 và kết quả chuẩn hóa từ form US-24. Màn hiển thị đủ bảy nhóm trường, nguồn gốc, trạng thái AI, trích đoạn/note, vấn đề cần xử lý và cho phép sửa từng trường trong bộ nhớ trang. Server có endpoint check authoritative trả dữ liệu chuẩn hóa, tất cả vấn đề và readiness; chưa có confirm/save hay persistence.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, “Write semantics and recovery”, “Deterministic Constraint Validator”.
- `docs/flow/user-flow.md` — “Trip requirement capture”, “Auth transition”, “Write recovery”.
- `docs/source-baselines.md` — Product/System là nguồn nghiệp vụ; repository là nguồn implementation; Figma chưa được cung cấp để kiểm tra.
- `docs/design/ui-baseline.md` — responsive từ 360px, trạng thái và accessibility.
- `docs/stories/US-24-trip-requirement-form.md` — canonical `TripRequirementInput`, readiness, form và `TripReadinessStatus`.
- `docs/stories/US-25-natural-language-trip-needs.md` — `ExtractionResult`, verified AI fields, source snippets và `apply-extraction`.
- `apps/web/src/app/trips/new/trip-field-editors.tsx` — shared US-24 controls reused by the review editor; labels/IDs/ARIA remain contract-compatible.
- Product Document/System Specification `.docx`: chưa có trong workspace, chưa đối chiếu được requirement ID.
- Figma review frame: chưa có; dùng token/CSS hiện có của `/trips/new`, không tuyên bố pixel-perfect.

## Dependencies

Đã kiểm tra trong repository và đang có:

- US-24: `trip-requirement-contract.ts`, `trip-requirement-readiness.ts`, `trip-requirement-form-logic.ts`, `POST /api/trip-requirements/evaluate`, `/trips/new`, `TripReadinessStatus` và `describeReadiness`.
- US-25: `preference-extraction-contract.ts`/`ExtractionResult`, `POST /api/trip-requirements/analyze`, `analyzeTripNeeds`, `apply-extraction`, `NaturalLanguageInput` và `ExtractionResultPanel`.
- Shared Zod contract, Vitest, `@KLTN/ui`, Lucide, auth guard và API envelope. US-26 không thêm dependency, API, DB hay server-only import vào model/client.
- `requireTraveler`, `readBoundedJsonBody`, `apiSuccess`/`handleApiError` và `tripRequirementDependencies` đã có; BE-CHECK tái sử dụng, không thêm DB/AI/idempotency.

## In Scope

- Isomorphic `TripRequirementReviewDraft`/`ReviewField` model và pure conversion/counting helpers.
- Fixed seven-field order: `startDate`, `durationDays`, `companions`, `interests`, `pace`, `transport`, `mobilityConstraints`.
- Mapping verified AI states to `AI`/`EMPTY`, preserving canonical `aiValue`, source text, server clarification messages and notes.
- Mapping valid/invalid in-memory US-24 form state to `USER`/`EMPTY`, canonical candidate shape and client-validation issues.
- `TripReviewScreen` used by both AI and form success paths, with read/display mode plus one-row-at-a-time editing.
- In-place editing for all seven review groups, with one row editable at a time, Esc/Hủy recovery, focus return and explicit AI-value restore.
- `applyFieldEdit`/`clearField`/`restoreAiValue` pure helpers that preserve AI provenance and reset confirmation to `NOT_CONFIRMED`.
- Shared field-editor components used by both US-24 form and review screen; existing US-24 validation messages and control IDs remain unchanged.
- Isomorphic `checkTripRequirement` authoritative domain check and `POST /api/trip-requirements/check`; request lỗi cấu trúc trả 400, dữ liệu nghiệp vụ không hợp lệ trả 200 kèm `issues` để review hiển thị một lượt.
- Browser-safe `checkTripRequirement` client adapter with strict response parsing, safe failure mapping, single-flight/stale-response guards and no persistence.
- In-memory confirmation snapshot after an authoritative `confirmable: true` response; the snapshot is not an official Trip confirmation/save.
- Chuẩn hóa bằng chính `tripRequirementInputSchema`, readiness bằng `evaluateTripRequirement`, và hai luật nhất quán PROPOSED cho children/pace-mobility.
- Contract-driven Vietnamese option labels, readiness reuse, focus handoff, safe text rendering and responsive `trip-` CSS.
- Keeping `apply-extraction` and “Điền gợi ý vào biểu mẫu” as an explicit handoff; it never evaluates, confirms or saves automatically.

## Out of Scope

- Clarification workflow do AI, final confirmation/save, Trip persistence, migration, planner, itinerary, destination selection, AI/provider calls and storage.
- Consistency/business rules beyond existing US-24 contract; these belong to US-27.
- Local/session/IndexedDB storage, URL/history state, cookie, analytics or logging of mobility notes/source text.

## Business Rules

- AI output is a proposal. Only verified `EXTRACTED` values become AI-origin review values; `AMBIGUOUS`, `UNSUPPORTED` and `MISSING` never become canonical values.
- A server-authored clarification message is displayed as-is; the review layer does not invent or rewrite its meaning.
- US-24 remains the canonical contract for labels/values and required fields. Unsupported transport never defaults to `MOTORCYCLE` or `CAR`.
- Review may show a preliminary candidate without `startDate`; `TripReadinessStatus` must state that relative days can be used and that the existing server guard still requires a valid start date before official confirmation/save.
- This screen can report a successful read-only check for the current page session, but does not create an itinerary, persist a Trip or report a write success.
- Only one row enters edit mode at a time. Saving is local to the in-memory draft; no confirmation or persistence is implied.
- A user edit is authoritative for the current draft, while `aiValue`/`sourceText` remain available as provenance. Restoring AI is an explicit action only and is available for `EXTRACTED` fields.
- Empty `startDate` is allowed in the review draft; malformed, non-calendar or past dates are rejected. Required duration/transport edits cannot be saved while invalid.
- BE-CHECK phân biệt thiếu `durationDays`/`transport` với giá trị sai, trả đủ lỗi theo thứ tự cố định; `WARNING` không chặn `confirmable`, `ERROR` chặn.
- `SOLO` + `YOUNG_CHILDREN` là `COMPANIONS_CONFLICT_CHILDREN` ERROR; `PACKED` + đi bộ xa/xe lăn là `PACE_MOBILITY_MISMATCH` WARNING. Đây là luật PROPOSED, chờ owner/DOCX duyệt.
- The review acknowledgement and check button only create an in-memory, server-checked snapshot. They do not create a Trip, save data or authorize planner work.
- Any successful edit, clear or explicit AI restore invalidates a previous snapshot and requires a new check.

## Roles / Authorization

The existing `/trips/new` Server Component guard remains Traveler-only: Guest follows the existing internal login return flow and Admin receives `AccessDenied`. US-26 adds no route or authorization boundary. The review model is isomorphic but is only reached through the guarded page.

## Ownership Rules

N/A: no persistence or ownership-bearing record is created. Future Trip save/check stories must use trusted server identity and revalidate the canonical candidate server-side.

## UX / UI Contract

- Heading: “Kiểm tra nhu cầu chuyến đi”; supporting copy: “AI chỉ gợi ý — hãy kiểm tra từng mục trước khi xác nhận.”
- The summary says `N/7 thông tin đã có, M mục cần xử lý` and announces changes with `aria-live="polite"`.
- Seven rows use the fixed order above. Each row shows Vietnamese field name, contract-driven Vietnamese value labels, origin text/icon (`AI gợi ý`, `Bạn nhập`, `Chưa có thông tin`) and AI status text where applicable.
- AI values show `Bạn viết: “…”` as plain text. Ambiguous/unsupported values show `Cần làm rõ`/`Chưa hỗ trợ` and the server clarification message. Missing required `durationDays`/`transport` show “Bắt buộc”.
- `TripReadinessStatus`/`describeReadiness` is reused. No confirmation/create/save button is rendered. The only actions are returning to the form and, for an AI draft, explicitly filling verified suggestions into the form.
- Each row has a `Sửa` action with `aria-expanded`; only one row is editable at a time. The editor exposes `Lưu thay đổi`, `Hủy`, Esc cancellation and `Khôi phục gợi ý AI` only for extracted AI values.
- The final block shows warnings, a required “Tôi đã kiểm tra các thông tin trên” checkbox and “Xác nhận nhu cầu”. The button is disabled with a text reason while unchecked, editing or checking. The check state is `NOT_CONFIRMED | CHECKING | CONFIRMED`, announces progress/results and never offers a “Tạo hành trình” action.
- A successful check displays the server-canonical normalized values, preserves the AI/user provenance badges, marks changed normalization, exposes warning messages and calls the optional `onConfirmed` callback with an in-memory snapshot. A non-confirmable 200 response keeps the draft unconfirmed, links to ordered issues and opens the first error row.
- Focus moves to the review heading when the review surface opens. Source/note text wraps at 360px; controls have at least 44px targets, visible focus and icon text is not color-only.
- Snapshot state remains in memory and is lost when leaving the page. No storage or URL state is used.

## Data Contract

`ReviewField<K>` contains:

| Field | Meaning |
| --- | --- |
| `key` | One of the seven fixed `ReviewFieldKey` values. |
| `origin` | `AI`, `USER` or `EMPTY`. |
| `value` | Canonical value or `null`; not assumed valid for final save until server validation. |
| `aiStatus` | `EXTRACTED`, `AMBIGUOUS`, `MISSING`, `UNSUPPORTED` or `null` for form-origin data. |
| `sourceText` | Original AI evidence text or `null`; rendered as text only. |
| `aiNote` | AI field note or `null`; no client-authored clarification. |
| `aiValue` | Canonical extracted value retained for future edit/recovery, or `null`. |
| `edited` | Whether the current review edit changed the value; successful user edits set `true`, explicit AI restore resets it to `false`. |
| `issues` | `{ code, field, severity, message }[]`; current entries come from server clarifications or US-24 client validation. |

`draftToCandidate` returns the seven-field candidate shape with `null` for empty fields and `[]` for empty interests. It is deliberately not a final `TripRequirementInput` and must be revalidated by US-26-BE-CHECK/confirmation in a later story.

`ConfirmedTripRequirement` contains `{ requirement, usesRelativeDays, eligibleForFinalConfirmation, warnings, checkedAt }`. `requirement` is the canonical server response; `eligibleForFinalConfirmation` is copied from server readiness; `checkedAt` is the browser check time. `origin`, `aiValue`, `sourceText` and `aiNote` are review-only provenance and never enter the check request.

## API Contract

`POST /api/trip-requirements/check` nhận một JSON object có cùng shape `TripRequirementInput` nhưng `unknown` ở boundary để phân biệt thiếu/sai. Response thành công luôn HTTP 200:

```json
{
  "success": true,
  "data": {
    "requirement": "TripRequirementInput | null",
    "issues": [{ "code": "...", "field": "...", "severity": "ERROR|WARNING", "message": "..." }],
    "confirmable": "boolean",
    "readiness": "TripRequirementReadiness | null",
    "usesRelativeDays": "boolean"
  }
}
```

Issue codes: `MISSING_REQUIRED`, `INVALID_VALUE`, `INVALID_BODY`, `START_DATE_INVALID`, `START_DATE_IN_PAST`, `COMPANIONS_CONFLICT_CHILDREN`, `PACE_MOBILITY_MISMATCH`. Field order is `durationDays`, `transport`, `startDate`, `companions`, `interests`, `pace`, `mobilityConstraints`, `_form`. Missing/invalid data is not a transport-level 400 because the review needs the complete issue list in one call. Malformed JSON, non-object/array/null body, wrong Content-Type or body over 8KB returns `400 VALIDATION_ERROR` with `details.fieldErrors._form`. Both success and error responses set `Cache-Control: private, no-store`. Auth remains Traveler-only and is checked before reading the body. US-24 `/evaluate` and US-25 `/analyze` contracts are unchanged.

## Error / Recovery

- Existing US-24/US-25 auth, validation, provider, network and retry behavior remains unchanged.
- Returning to the form keeps the in-memory form state. Explicit “Điền gợi ý vào biểu mẫu” reuses `applyExtractionToForm`; empty controls may receive verified values, conflicts remain pending, and the user can edit or dismiss them.
- Returning to the form maps the current reviewed draft back to the controlled form fields, so an explicitly edited value is not lost. The AI handoff button applies the reviewed draft only after the user chooses it.
- A failed field edit leaves the previous draft value unchanged and keeps the editor open with field-local `role="alert"` feedback. Hủy/Esc discards the raw editor value.
- The check endpoint does not log request content, does not call OpenAI, does not write DB and has no idempotency key. A future save/confirm flow must call it again on the server rather than trusting a previous client result.
- A malformed/unsafe extraction cannot enter this screen as a canonical extracted value because US-25 verification remains the boundary.
- The client adapter rejects malformed/extra-field success data as `INVALID_RESPONSE` and does not display raw response/provider content. 401 redirects to `/login?returnTo=%2Ftrips%2Fnew` without replay; 403 uses authorization feedback; 400/5xx/network retain the draft and expose retry. Abort, unmount and stale responses cannot change the screen.

## Write Semantics / Idempotency

N/A: không ghi DB. The read-only `/check` request is safe to repeat but can be cost-bearing only in future provider-backed variants; no idempotency key is needed here. The screen must never say that data was saved or that a Trip was created.

## External Services

N/A for this task. US-25 may already have obtained an `ExtractionResult`; US-26 does not call OpenAI or any provider.

## Acceptance Criteria

- [x] Given a verified US-25 result, when the review draft is built, then all seven fields appear in the fixed order with the correct origin/status/value/source/note mapping.
- [x] Given `AMBIGUOUS`, `UNSUPPORTED` or `MISSING`, when the review draft is built, then the value is empty; source/clarification data is retained without inventing a value.
- [x] Given a US-24 form state, when the review draft is built, then canonical user values are marked `USER`, empty fields are `EMPTY`, and client validation issues are attached without silently coercing unsupported transport.
- [x] Given a draft, when `draftToCandidate` and counting helpers run, then the candidate has the seven-field shape, empty interests are `[]`, values/counts/missing required fields are deterministic, and final validity is not claimed.
- [x] Given an AI result or successful form evaluation, when `/trips/new` enters review, then the same `TripReviewScreen` is shown and the existing form/analysis behavior remains available through explicit actions.
- [x] Given a review value/source/note, when it renders, then it is plain text with Vietnamese contract labels, origin/status text plus icon, and no `dangerouslySetInnerHTML` or browser persistence.
- [x] Given a review opens, when the client renders it, then focus moves to the heading, readiness is shown with `TripReadinessStatus`, and no save/create button is present; the only new action is the read-only check.
- [x] Given a 360px viewport, when long source/note text is rendered, then the review layout is intended to wrap without horizontal overflow through `trip-` CSS; live browser evidence remains pending.
- [x] Given any review row, when the user chooses “Sửa”, then only that row opens a shared field editor with `aria-expanded`, the current value, Lưu thay đổi and Hủy; other row edit buttons are disabled until it closes.
- [x] Given a valid edit, when the user saves it, then the draft uses canonical contract values, marks the field `USER`/`edited`, preserves AI provenance, recalculates readiness and resets confirmation to `NOT_CONFIRMED`.
- [x] Given an invalid edit, when the user saves it, then the draft is unchanged, the editor remains open, the error is adjacent and announced, and no server call occurs.
- [x] Given an extracted AI value, when the user explicitly restores it, then the value returns to `aiValue`; ambiguous/missing fields have no restore action.
- [x] Given Esc or Hủy, when editing is cancelled, then the raw value is discarded and focus returns to the row's Sửa button.
- [x] Given a Traveler submits a structurally valid candidate to `/api/trip-requirements/check`, when contract or consistency rules fail, then the server returns HTTP 200 with normalized `requirement` when parseable, all ordered `issues`, `confirmable`, `readiness` and `usesRelativeDays`.
- [x] Given duration/transport is missing or invalid, when the authoritative check runs, then missing and invalid cases have distinct codes and all field errors are returned without short-circuiting.
- [x] Given a warning-only pace/mobility mismatch, when the check runs, then the response remains `confirmable: true`; the proposed SOLO/children conflict is an ERROR.
- [x] Given Guest/Admin, malformed JSON, wrong Content-Type, non-object body or body over 8KB, when `/api/trip-requirements/check` is called, then it returns the appropriate 401/403/400 envelope before business checking, with private no-store headers.
- [x] Given hostile input keys such as `__proto__`/`constructor`, when the pure check runs, then it fails closed without throwing a raw exception or mutating input.
- [x] Given a review draft, when the user acknowledges and checks it, then only `draftToCandidate` data is sent to the same-origin `/check` endpoint; the UI enters `CHECKING`, prevents a second request and ignores stale/unmounted responses.
- [x] Given a 200 `confirmable: true` response, when the check completes, then the draft is synchronized to server-canonical values, the confirmation snapshot is `CONFIRMED`, warnings/readiness are shown, `checkedAt` is recorded and `onConfirmed` receives the snapshot.
- [x] Given a 200 `confirmable: false` response, when the check completes, then the snapshot remains unconfirmed, ordered errors are announced/linked, and the first error field opens for correction without losing the draft.
- [x] Given 401/403/400/5xx/network or malformed response data, when the check fails, then the draft is unchanged, no confirmation is claimed, and the appropriate login/authorization/technical retry feedback is shown.
- [x] Given a confirmed snapshot, when any field is successfully edited, cleared or restored, then confirmation is invalidated and the acknowledgement must be made again.
- [x] Given an AI value is wrong, empty, ambiguous or unsupported, when the user edits it, then the user value wins, AI provenance remains recoverable, unsupported transport stays empty until explicitly selected, and the authoritative candidate contains only the edited canonical value.
- [x] Given an invalid start date, when client review logic or `/check` evaluates it, then malformed/non-calendar/past dates are not confirmed; today, future and leap dates are accepted, empty date uses relative days, and the Asia/Ho_Chi_Minh midnight boundary is deterministic.
- [x] Given a valid draft, when the acknowledgement is checked and `/check` returns `confirmable: true`, then the snapshot is confirmed only after the server response, server normalization is reflected, warnings remain visible, and any later edit resets confirmation.
- [x] Given the deterministic US26 test suite runs, when it exercises review, `/check` and FE source/logic contracts, then it uses no DB/network/secret/OpenAI and covers full, missing and invalid data without bypassing `/check`.
- [ ] Given owner questions remain unresolved, when the story is reviewed, then no status beyond DRAFT is claimed.

## Test Plan

- `trip-requirement-review.vitest.test.ts` covers all four extraction statuses across all seven fields, server clarification preservation, form USER/EMPTY mapping, candidate/schema compatibility, counts/required fields, unsupported transport safety and source-contract restrictions.
- The same suite covers valid edits for all seven groups, AI provenance/restore, AI-empty/ambiguous fill, clear semantics, duration/transport/date/companions/note failures, list normalization, confirmation reset and shared-editor source contracts.
- `trip-requirement-check.vitest.test.ts` covers normalized complete/preliminary data, missing-vs-invalid required fields, all requested invalid field families, date timezone/leap boundaries, proposed consistency ERROR/WARNING rules, hostile/non-object input, auth/body-read ordering, 200 issue responses, 400 transport errors, cache headers, no logging and no persistence beyond auth.
- `trip-requirement-check-client.vitest.test.ts` covers strict success parsing, malformed/extra-field response rejection, safe 400/401/403/5xx mapping, network outcome, same-origin request shape without review provenance and mounted/latest-response fencing.
- Review confirmation tests cover server-normalized synchronization, warning snapshots, `CONFIRMED`/`NOT_CONFIRMED` transitions, invalidation and source-contract guards for AbortController, aria-busy, retry, no storage and no create/save action. Single-flight is also source-guarded in the screen (`isChecking`, abort and sequence fencing); live concurrent browser behavior remains manual evidence.
- `us26-test.vitest.test.ts` adds 21 deterministic integration-style tests reusing US-25 utterance fixtures. It covers wrong/empty/ambiguous/unsupported AI values, all seven edit groups, invalid-edit preservation, the start-date matrix and timezone boundary, final guard, warning/error confirmation, canonical-only `/check` payloads, confirmation invalidation and source safety. Existing tests were not duplicated or changed for this task; earlier intentional changes remain: `trip-requirement-review.vitest.test.ts` was extended for FE-API confirmation, and the US-24 source-contract test was updated for the shared-editor refactor.
- Existing US-24/US-25 Vitest suites remain in the relevant selection; no Neon, OpenAI, network, secret or DOM test is added.

## Manual Test Plan / Evidence

- [ ] AI success → review → edit → check/confirmation — NOT PROVEN (no browser/session).
- [ ] Form success → same review → edit → check/confirmation — NOT PROVEN (no browser/session).
- [ ] Wrong AI transport, past/empty start date, warning/error consistency, edit-after-confirmation invalidation — NOT PROVEN in a real browser; deterministic logic/API tests PASS.
- [ ] Network/5xx retry keeps draft; Guest login does not auto-confirm; Admin is denied — NOT PROVEN in a real browser/live route.
- [ ] DevTools confirms no log/URL/storage leakage; Back/Forward does not reveal old draft — NOT PROVEN.
- [ ] 360/390/768/1280px no horizontal overflow; keyboard, aria-live and focus return — NOT PROVEN (no browser session).
- [x] Automated substitute: 21 new US26-TEST cases plus the existing `/check`, client and review suites run without DB/network/secret/OpenAI; focused selection is 16 files and 226/226 tests.

## Expected Modules / Files

- `apps/web/src/modules/trip-requirement/trip-requirement-review.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-review.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check-http.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check.vitest.test.ts`
- `apps/web/src/app/api/trip-requirements/check/route.ts`
- `apps/web/src/app/trips/new/trip-review-screen.tsx`
- `apps/web/src/app/trips/new/trip-field-editors.tsx`
- `apps/web/src/app/trips/new/trip-requirement-form.tsx`
- `apps/web/src/app/trips/new/trip-form.css`
- `apps/web/src/lib/trip-requirement-check-client.ts`
- `apps/web/src/lib/trip-requirement-check-client.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us26-test.vitest.test.ts`
- `docs/stories/US-26-review-confirm-trip-needs.md`
- `docs/ai-progress.md`

## Migration Impact

Không. No Trip model, migration or DB changes.

## Environment Impact

Không. No new dependency, secret or environment variable.

## Implementation Sequence

1. [x] Verify US-24/US-25 dependencies and source contracts.
2. [x] Add isomorphic review model and conversion/counting helpers.
3. [x] Add read-only review screen and `trip-` responsive/accessibility styles.
4. [x] Route both AI and US-24 evaluate success into the unified review screen while preserving explicit form handoff.
5. [x] Refactor the seven US-24 field groups into shared editors without changing IDs/ARIA/messages.
6. [x] Add one-row-at-a-time in-place edit/save/cancel/restore behavior and pure contract-driven edit helpers.
7. [x] Add authoritative BE-CHECK domain/HTTP boundary without changing `/evaluate`.
8. [x] Add the browser check adapter, confirmation snapshot/invalidation and review confirmation UI without persistence.
9. [x] Add deterministic client/review confirmation tests and record evidence/progress.

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Dependency verification | PASS | US-24/US-25 files, functions and routes were confirmed in the repository before implementation. |
| Review model/status mapping | PASS | New test covers `EXTRACTED`, `AMBIGUOUS`, `MISSING`, `UNSUPPORTED` across all seven fields and fixed order. |
| Form mapping/candidate safety | PASS | New test covers USER/EMPTY mapping, candidate schema compatibility, counts, required missing list and unsupported transport fail-closed. |
| Unified AI/form screen | PASS | `TripRequirementForm` now enters `TripReviewScreen` from AI success or evaluate success; explicit `apply-extraction` handoff remains. |
| Accessibility/source safety | PASS | Source test checks plain text, no storage/dangerous HTML, heading focus code, `aria-live`, required acknowledgement and no save/create action. |
| Shared editor/refactor regression | PASS | US-24 source-contract now inspects the shared editor file; existing US-24 tests remain green after the refactor. |
| In-place edit behavior | PASS | Pure tests cover all seven fields, invalid edit preservation, date/time boundary behavior, AI restore/provenance, list normalization and `NOT_CONFIRMED`. |
| Authoritative BE-CHECK | PASS | Pure and HTTP tests cover normalized/partial/invalid candidates, missing-vs-invalid fields, proposed consistency rules, auth-before-body, 200 issues/400 request errors, cache and hostile input handling. |
| Client check/confirmation integration | PASS | Strict client adapter, canonical-only request, safe failure mapping, confirmation snapshot, warning display, server normalization sync, issue recovery and invalidation are covered by focused tests/source contracts. |
| US26-TEST deterministic coverage | PASS | Added 21 tests; full relevant US-24/US-25/US-26 selection is 16 files, 226/226. Wrong-AI, date-invalid, confirmation-valid, `/check` matrix, FE source and no-storage/no-OpenAI contracts are covered without DB/network/secret. |
| Relevant automated tests | PASS | Focused client/check/review selection remains 53/53; full US-24/US-25/US-26 selection is 16 files, 226/226; root checks are still environment-blocked. |
| Browser responsive/keyboard/session/check smoke | NOT PROVEN | No real browser/session was available for 360px overflow, focus traversal, Traveler check, retry, stale-response or live confirmation evidence. |
| Root test/typecheck/build | BLOCKED | `npm run test`, `npm run check-types` and `npm run build` each exit before project work with `shim integrity check failed`; no unrelated shim/RAG repair was made. |
| Server check/confirm/consistency/persistence | PASS / DEFERRED | `/check` is authoritative and tested; no Trip save is claimed. Future final confirmation/save must still re-check on the server and use the start-date guard immediately before persistence. |
| Product/System DOCX and Figma alignment | NOT PROVEN | DOCX and review Figma frame were not available in the workspace. |

## Open Questions

- **PROPOSED — pending owner:** Review-only may be shown without `startDate`; final confirmation/save must still require it through the US-24 server guard. Is this the intended distinction?
- **PROPOSED — pending owner:** Which consistency rules should US26-BE-CHECK enforce beyond the current US-24 schema, and what are their error codes/messages?
- **Decision for this task:** The current “Tôi đã kiểm tra” acknowledgement authorizes only a read-only `/check` request for this page session; future official confirmation/save semantics and any telemetry remain owner questions.
- **PROPOSED — pending owner:** Is in-memory-only review snapshot the accepted MVP behavior until Trip persistence exists?
- **PROPOSED — pending owner:** Which Figma frame/tokens define the final review layout and visual states?
- **PROPOSED — pending owner:** Should AI-origin values and user-origin values be merged into one draft when both are present, or remain separate entry paths as implemented here?
- **Decision for this task:** only one review row is editable at a time; multi-row editing is deferred unless the owner requests it.
- **Decision for this task:** review edits are kept in memory and mapped back to the form only through the explicit back/fill actions; no autosave or URL/storage snapshot is introduced.
- **Decision for this task:** use one acknowledgement + one “Xác nhận nhu cầu” check action. A successful response means “checked for this page session”, not “saved”; the next planner/save story must provide the real official action.
- **Decision for this task:** when no field error is returned but `confirmable` is false, retain the response issues/status and do not invent a value or silently mark the draft confirmed.

## Handoff Notes

- US26-BE-CHECK must revalidate `draftToCandidate` on the server against the US-24 contract and add the approved consistency rules; never trust client readiness or AI origin/status.
- `POST /api/trip-requirements/check` now provides that authoritative revalidation seam. US-27 must extend `CheckIssue`/`checkTripRequirement` for AI clarification and approved cross-field rules instead of creating a parallel validator.
- US-27/US-28 may consume the optional `onConfirmed` snapshot seam, but must not treat it as authorization or persisted state. Their server action must call `/check` logic again and discard any stale client snapshot.
- The future final-confirmation/save story must use the canonical `ConfirmedTripRequirement.requirement` only as display/input context, then revalidate and call `assertStartDateForFinalConfirmation` server-side immediately before official persistence.
- The future final-confirmation/save story must call `assertStartDateForFinalConfirmation` server-side immediately before any official save. It must not infer official confirmation from this read-only screen.
- US-28 must call `checkTripRequirement` again on the server and then `assertStartDateForFinalConfirmation` immediately before accepting a requirement for planner/itinerary work.
- US-27 owns clarification and consistency recovery; US-28 owns planner/itinerary/destination selection. No placeholder action was added for either story.
- `apply-extraction` remains the explicit bridge back to US-24 controls. It only applies verified extracted values according to its existing non-overwrite/conflict rules.

## 2026-10-17 — Vietnamese date display consistency

Owner-requested presentation update: shared StartDateEditor now uses a reusable typed `VietnameseDateInput` with `dd/mm/yyyy` guidance. Valid input becomes canonical ISO in the existing in-memory state and API payload; partial/invalid text is preserved for correction. The text control replaces the locale-dependent native date field; no authored calendar popup is introduced. AI extraction cards, review values and announcements, preliminary itinerary summaries and day tabs display the same Vietnamese date format. Existing business validation/optional preliminary date semantics remain unchanged.

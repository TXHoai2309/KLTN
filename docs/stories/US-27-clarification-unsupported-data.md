# US-27 — Làm rõ dữ liệu thiếu, mâu thuẫn hoặc ngoài phạm vi hỗ trợ

## Status

DRAFT — deterministic clarification rules, transport policy, server gate, additive API fields and review clarification panel are implemented; owner decisions, browser/live evidence and final acceptance remain pending.

Task **229 [TEST]** remains **Ongoing** per Bình's 2026-10-15 request: automated verification is recorded below, while the owner-run browser checklist and US-28 handoff acceptance remain pending. This does not promote the story to ACCEPTED.

## Epic

Trip planning.

## Owner

Đào Duy Bình — pending owner acceptance.

## Goal / User Story

Là Du khách, tôi muốn hệ thống chỉ ra rõ thông tin nào còn thiếu, mơ hồ, mâu thuẫn hoặc ngoài phạm vi hỗ trợ để tôi tự làm rõ trước khi hệ thống cho phép bước lập hành trình tiếp theo.

## Outcome

US-27 cung cấp bộ luật thuần dùng chung để tạo `ClarificationRequest`, tập trung policy phương tiện MVP, hạ trạng thái trích xuất khi source text chứa mâu thuẫn xác định được, bổ sung clarification requests vào response của US-25/US-26, hiển thị và xử lý yêu cầu làm rõ tại màn review, bảo đảm client không tự thay thế phương tiện, và một cổng server để US-28 không lập hành trình từ dữ liệu chưa rõ. US-27 không tạo planner, Trip persistence hay lời gọi AI mới.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, phương tiện chỉ xe máy/ô tô, “Deterministic Constraint Validator”, “Write semantics and recovery”.
- `docs/flow/user-flow.md` — “Trip requirement capture”, “Itinerary generation and validation”, “Write recovery”.
- `docs/source-baselines.md` — Product/System là nguồn nghiệp vụ; repository là nguồn implementation; Figma chưa được kiểm tra.
- `docs/architecture/technical-architecture.md` — Route Handler mỏng, module/service sở hữu business rules, AI tách khỏi validator.
- `docs/design/ui-baseline.md` — trạng thái thiếu dữ liệu không được coi là thành công; panel dùng token và responsive contract của `/trips/new`.
- `docs/stories/US-24-trip-requirement-form.md` — canonical seven-field `TripRequirementInput`, transport options, limits và readiness.
- `docs/stories/US-25-natural-language-trip-needs.md` — `ExtractionResult`, statuses, `clarifications`, `missingRequired`, source verification.
- `docs/stories/US-26-review-confirm-trip-needs.md` — `CheckResult`, issue codes, `/check`, warning/error consistency rules.
- Product/System DOCX: chưa có trong workspace, chưa đối chiếu DOCX hoặc requirement ID.
- Figma: chưa có frame US-27 riêng; FE-CLARIFY dùng token `/trips/new`, chưa có baseline Figma để đối chiếu.

## Dependencies

Đã kiểm tra thực tế trong repository:

- US-24 có `trip-requirement-contract.ts`, `trip-requirement-readiness.ts`, `trip-requirement-form-logic.ts`, `POST /api/trip-requirements/evaluate` và trang `/trips/new`.
- US-25 có `preference-extraction-contract.ts` với `ExtractionResult`, `clarifications`, `missingRequired`; `verifyProviderExtraction`/`verifyModelOutput`; `extractPreferences`; `POST /api/trip-requirements/analyze`; client `analyzeTripNeeds`.
- US-26 có `trip-requirement-check.ts` với `checkTripRequirement` và các issue codes; `POST /api/trip-requirements/check`; client `checkTripRequirement`; `trip-requirement-review.ts`; `trip-review-screen.tsx`; `trip-field-editors.tsx`.
- Shared `AppError`, envelope/error handlers, Traveler authorization and bounded JSON reader are available. Vitest is available; no new dependency is added.
- `docs/stories/US-27-clarification-unsupported-data.md` did not exist before this task and is created here.

## Task Breakdown

1. [CONTRACT] Chốt `ClarificationRequest`, reason/issue mapping, resolution options và luật downgrade thuần.
2. [BE] Tích hợp post-process sau verify US-25 và tạo cổng server `assertTripRequirementClear` cho US-28.
3. [BE/API] Bổ sung `clarificationRequests` cộng thêm vào `/analyze` và `/check`, giữ tương thích client cũ.
4. [BE-TRANSPORT] Tập trung bảng từ khóa phương tiện, post-process extraction và mã hóa check/gate.
5. [FE-CLARIFY] Hiển thị panel BLOCKING/ADVISORY trên review, xử lý tại chỗ bằng editor dùng chung, và chặn xác nhận.
6. [FE-NOSUBST] Khóa mọi đường client có thể tự chọn/thay thế transport; giữ source text và chỉ nhận mapping EXTRACTED hợp lệ từ helper dùng chung.
7. [TEST] Kiểm thử ma trận trạng thái, mâu thuẫn, transport policy, gate, auth/order, no-store, input lạ và không rò dữ liệu nhạy cảm; thêm logic panel/dedupe/cổng xác nhận và source-contract transport.
8. [TEST-US27] Bổ sung bộ test cross-layer cho bốn nhóm thiếu thời lượng, thiếu phương tiện, ngoài phạm vi/mơ hồ và mâu thuẫn, tái dùng fixture US-25.
9. [DOC] Cập nhật story/evidence, progress và handoff.

## In Scope

- Isomorphic `ClarificationRequest` type/schema, stable IDs, code-owned Vietnamese questions, hints and resolution options.
- Deterministic derivation from verified `ExtractionResult` statuses and US-25 clarification reasons.
- Deterministic downgrade of contradictory duration/date source text after US-25 verification, without changing the `ExtractionResult` shape or mutating input.
- Mapping of US-26 `CheckIssue` values to clarification requests.
- Server-only `assertTripRequirementClear(candidate, now)` gate for the future planner.
- Additive `clarificationRequests` in US-25 analyze and US-26 check success responses; old clients/responses default to `[]`.
- Isomorphic `trip-transport-policy.ts` là nguồn sự thật duy nhất cho bảng từ khóa **PROPOSED — pending owner**, phân loại source text và canonical assertion; prompt extraction dùng lại bảng này.
- Transport post-process chạy sau verify: chỉ giữ `EXTRACTED` khi source phân loại đúng canonical value; `UNSUPPORTED`/`AMBIGUOUS`/`CONFLICT` không được tự thay thế sang giá trị khác.
- US-26 check phát hành `TRANSPORT_UNSUPPORTED` cho giá trị transport có mặt nhưng ngoài enum; thiếu transport vẫn là `MISSING_REQUIRED`; gate dùng kết quả check này.
- Review clarification panel nhận dữ liệu từ `/analyze` và `/check`, dedupe theo `id`, ưu tiên response check, tự bỏ BLOCKING khi field hiện tại hợp lệ, và không gọi API mới.
- ENTER_VALUE mở đúng editor dùng chung trong hàng field; CHOOSE_ONE hiển thị radio không chọn sẵn; SKIP_ALLOWED chỉ dành cho ADVISORY.
- Client transport chỉ được nhận `MOTORCYCLE`/`CAR` từ lựa chọn rõ ràng của người dùng hoặc `resolveTransportCandidateFromExtraction` khi status là `EXTRACTED`, value thuộc enum và không bị downgrade; mọi trạng thái khác giữ trống.
- Khi extraction transport chưa được hỗ trợ/mơ hồ/mâu thuẫn/thiếu, UI hiển thị source text dạng plain text và thông điệp cố định yêu cầu người dùng tự chọn; không auto-focus radio đầu tiên, không có lời hứa thay thế.
- Advisory dismiss chỉ ở memory của màn review và được bỏ dismiss khi field tương ứng thay đổi; rời trang sẽ mất trạng thái.
- Nút xác nhận bị khóa khi còn BLOCKING, đang edit, đang check hoặc chưa tích “Tôi đã kiểm tra”.
- Nếu server trả transport khác với lựa chọn đã explicit chọn, review giữ draft của người dùng và coi kết quả là lỗi an toàn, không xác nhận/ghi đè thầm.
- Pure tests and route-level tests with fake dependencies only.

## Out of Scope

- Planner, itinerary, destination choice, Trip persistence or “Tạo hành trình” action.
- New OpenAI call, conversation loop, new transport type or alias-to-canonical mapping.
- Trip model, persistence, migration, storage, idempotency, rate limiting or analytics.
- New cross-field business laws beyond the already accepted US-24 contract and US-26 proposed consistency rules.

## Business Rules

### Clarification and gate matrix

| Situation | Request | Severity | Gate result |
| --- | --- | --- | --- |
| `durationDays` or `transport` extraction status is not `EXTRACTED` | `MISSING`, `AMBIGUOUS`, `UNSUPPORTED`, `OUT_OF_RANGE` or `CONFLICT` from status/reason | `BLOCKING` | Must be resolved before planner gate passes |
| Optional field status is `MISSING` | No request | N/A | Allowed; leave empty |
| Optional field is `AMBIGUOUS`/`UNSUPPORTED`/`CONFLICT` | Code-generated request | `ADVISORY`, except companion contract conflict | Allowed only when not a blocker; user may skip optional unsupported data |
| `companions` has the existing contract conflict, e.g. `SOLO` with children constraint | `companions:CONFLICT` | `BLOCKING` | Gate rejects |
| US-26 `COMPANIONS_CONFLICT_CHILDREN` | `companions:CONFLICT` | `BLOCKING` | Gate rejects |
| US-26 `PACE_MOBILITY_MISMATCH` warning | `pace:CONFLICT` | `ADVISORY` | Gate may pass; warning is retained |
| US-26 missing required issue | `field:MISSING` | `BLOCKING` | Gate rejects |
| US-26 invalid date/past date | `startDate:INVALID` | `BLOCKING` | Gate rejects |
| US-26 invalid bounded field | `INVALID` or `OUT_OF_RANGE` by field family | `BLOCKING` | Gate rejects |
| Unsupported transport | Only `MOTORCYCLE` and `CAR` options | `BLOCKING` | No default/selected value; user must choose |

### Deterministic source contradiction rules

- For an `EXTRACTED` duration, numeric day alternatives/ranges such as `2-3 ngày`, `3 hoặc 4 ngày`, or separate different day mentions are downgraded to `AMBIGUOUS` with `value: null` and `durationDays:AMBIGUOUS` request. `3 ngày 2 đêm`, a Vietnamese number word such as `ba ngày`, and `một tuần` are not treated as contradictory by this rule.
- For an `EXTRACTED` start date, multiple different valid absolute dates in `sourceText` downgrade the field to `AMBIGUOUS` with clarification reason `CONFLICT`. Equivalent representations of the same date are not a conflict.
- Only verified source text is inspected. No model output is generated or guessed by this module. Existing US-25 source/date verification runs first.
- Existing US-24/US-26 contract and consistency validation remains authoritative; US-27 maps it and does not replace it.
- The gate never considers warnings a blocker, but it rejects every `ERROR` or `BLOCKING` request. Empty `startDate` is allowed for a preliminary proposal; US-24 `assertStartDateForFinalConfirmation` remains mandatory immediately before official confirmation/save.

### Transport policy — PROPOSED, pending owner

`apps/web/src/modules/trip-requirement/trip-transport-policy.ts` is the only keyword table. Matching uses NFC, lowercase, accent removal, whitespace normalization and padded phrase boundaries; it does not convert aliases into canonical API values.

| Kind | Proposed source keywords |
| --- | --- |
| `MOTORCYCLE` | `xe máy`, `xe số`, `xe ga`, `mô tô`, `moto`, `motorbike`, `motorcycle`, `scooter` |
| `CAR` | `ô tô`, `oto`, `xe hơi`, `xe 4 chỗ`, `xe 7 chỗ`, `car` |
| `UNSUPPORTED` | `xe đạp`, `xe đạp điện`, `xe buýt`, `bus`, `xe khách`, `limousine`, `taxi`, `grab`, `be`, `xanh sm`, `tàu`, `tàu hỏa`, `tàu thủy`, `train`, `máy bay`, `flight`, `đi bộ`, `trekking-bộ`, `trekking`, `thuyền`, `xe ôm công nghệ` |
| `AMBIGUOUS` | `đi xe`, `tự lái`, `phương tiện cá nhân`, `thuê xe`, `xe riêng` |

Both supported kinds, or supported plus unsupported, are `CONFLICT`. No match is `NONE`; `NONE`/ambiguous source never certifies a model value. Mobility phrases such as `hạn chế đi bộ` are not treated as a transport choice, and control-like phrases such as `mặc định dùng ô tô` are conservative `AMBIGUOUS`. Because the existing `ExtractionResult` status union has no `CONFLICT` member, a transport conflict is represented as `status: AMBIGUOUS` plus clarification reason `CONFLICT`; the public contract is intentionally unchanged.

`assertSupportedTransportValue` accepts only canonical `MOTORCYCLE`/`CAR` and throws `TRANSPORT_UNSUPPORTED` (422) for aliases, unsupported strings or non-strings. US-26 uses the same policy message for present invalid transport values; it never selects a substitute.

## Roles / Authorization

The existing analyze/check route boundaries remain Traveler-only and execute authorization before Content-Type/body reads. Guest receives 401 and follows the existing login flow in the client; Admin receives 403. `assertTripRequirementClear` is a server module for future authorized planner handlers and never trusts client role/input.

## Ownership Rules

N/A: US-27 writes no database record. US-28 must use the trusted Traveler identity for any future planner/save operation and must revalidate the candidate server-side.

## UX / UI Contract

`trip-clarification-panel.tsx` is rendered at the top of the US-26 review screen. It has a heading, separate “Bắt buộc” and “Nên làm rõ” groups, text plus icons, a polite live count, plain-text `sourceText`, field navigation, and controls driven by `resolution`. The panel does not force focus when the review opens; it announces the summary through `aria-live` and keeps normal Tab order. ENTER_VALUE uses the shared row editor so IDs and validation remain single-sourced. CHOOSE_ONE has no selected/default option. At 360px all content wraps and controls remain at least 44px. No storage, HTML injection, OpenAI import or “Tạo hành trình” button is introduced.

## Data Contract

```ts
type ClarificationRequest = {
  id: `${field}:${kind}`;
  field: "startDate" | "durationDays" | "companions" | "interests" | "pace" | "transport" | "mobilityConstraints";
  kind: "MISSING" | "AMBIGUOUS" | "CONFLICT" | "UNSUPPORTED" | "OUT_OF_RANGE" | "INVALID";
  severity: "BLOCKING" | "ADVISORY";
  question: string; // code-owned Vietnamese text
  hint?: string;
  sourceText: string | null; // bounded original text, plain text only
  resolution:
    | { type: "ENTER_VALUE" }
    | { type: "CHOOSE_ONE"; options: Array<{ value: string; label: string }> }
    | { type: "SKIP_ALLOWED" };
};
```

The isomorphic Zod schema is `clarificationRequestSchema`/`clarificationRequestsSchema` in `trip-clarification-rules.ts`. IDs are stable and duplicate requests are removed. Requests sort `BLOCKING` first and then by the canonical seven-field order. `sourceText` is bounded and may be displayed as plain text; it is never copied to gate blocker details or logs. `ExtractionResult` is unchanged.

## API Contract

Existing envelopes and auth/status behavior remain unchanged. The success payloads are additive:

- `POST /api/trip-requirements/analyze`: `{ success: true, data: { result: ExtractionResult, clarificationRequests: ClarificationRequest[] } }`. Existing clients that receive the old `{ result }` shape parse a default empty array.
- `POST /api/trip-requirements/check`: `{ success: true, data: CheckResult & { clarificationRequests: ClarificationRequest[] } }`. Existing clients that receive the old check result parse a default empty array.
- Both responses remain `Cache-Control: private, no-store`; auth order and existing HTTP status/error envelopes do not change. Check business errors remain a 200 result with issues; malformed request boundary errors remain 400.
- The review consumes both response arrays as input; it does not trust client clarification state for final confirmation. After `/check`, the server response replaces same-ID local/analyze data. The existing `/check` call remains the only authoritative confirmation request.

The server planner gate is not an endpoint:

```ts
assertTripRequirementClear(candidate: unknown, now: Date): TripRequirementInput
```

It calls `checkTripRequirement`, throws `AppError("TRIP_REQUIREMENT_UNCLEAR", ..., 422)` with safe `details.blockers` containing only `id`, `field`, `kind`, `question` when a blocker/error remains, and returns the normalized requirement otherwise. A malformed non-object candidate uses an internal `_form` blocker only at this server-gate boundary; public seven-field clarification requests remain field-scoped.

## Error / Recovery

- No new provider or persistence error is introduced. API errors continue through `handleApiError` and no-store responses.
- A blocking request is a recoverable user clarification state, not success. The future UI must preserve input, let the user edit explicitly, and re-run the authoritative check.
- A warning/advisory does not silently become a pass in a future final validator; it remains visible to the caller.
- Unknown/null/array/hostile input is handled by the existing check result/gate and never exposes a raw exception, stack, source note or provider content.
- Mobility notes are not logged, stored, placed in URLs/history/cookies/analytics, or included in planner blocker details.
- Advisory dismissal and panel choices are in-memory React state only. A field edit clears dismissal for that field; leaving the page clears all dismissal. A field edit also invalidates a prior confirmation as defined by US-26.

## Write Semantics / Idempotency

N/A: không ghi DB. Analyze/check and the gate are read-only and have no idempotency key. Repeating them is data-safe but must not be described as saved or confirmed.

## External Services

N/A for US-27. Existing US-25 may call OpenAI before this post-verification downgrade; US-27 adds no provider call, prompt or adapter behavior.

## Acceptance Criteria

- [x] Given a verified extraction, when a required duration/transport status is missing, ambiguous, unsupported, out of range or conflicted, then a stable blocking request is returned with a code-owned Vietnamese question.
- [x] Given an optional field is missing, when clarification derivation runs, then no request is created; ambiguous/unsupported/conflicted optional values are advisory except the existing companion contract conflict.
- [x] Given transport needs clarification, when the request is returned, then it contains exactly the US-24 `MOTORCYCLE` and `CAR` options with no selected/default value.
- [x] Given verified source text contains contradictory numeric day choices or different absolute dates, when US-27 post-processing runs, then the affected field is downgraded without mutating input and source text is retained.
- [x] Given equivalent `3 ngày 2 đêm`, `ba ngày`, `một tuần` or repeated representations of one absolute date, when contradiction detection runs, then it does not create a false contradiction.
- [x] Given a US-26 check result, when mapping runs, then issue codes map to stable clarification kind/severity without duplicating check rules; warnings are advisory.
- [x] Given transport source text, when the policy classifies it, then supported/unsupported/ambiguous/conflict/none cases are deterministic, boundary-safe and never map an unsupported value to `MOTORCYCLE`/`CAR`.
- [x] Given verified extraction has an `EXTRACTED` transport, when its source is unsupported, ambiguous, absent, conflicting or disagrees with the model value, then the field is downgraded, source text is retained and the matching transport clarification is added; an exact source/value match remains extracted.
- [x] Given US-26 receives present `BICYCLE`/`car`/empty transport, when checking, then it emits `TRANSPORT_UNSUPPORTED` with the MVP policy message; missing/null transport remains `MISSING_REQUIRED`.
- [x] Given a transport clarification is returned, when the client renders resolution options, then options are exactly canonical `MOTORCYCLE` and `CAR`, without a selected/default value.
- [x] Given an extraction transport field, when client mapping runs, then only `EXTRACTED` + canonical + non-downgraded values become candidates; `UNSUPPORTED`/`AMBIGUOUS`/`CONFLICT`/`MISSING` remain empty and never become a replacement transport.
- [x] Given unresolved transport source text reaches the review/result UI, when it renders, then the plain “Bạn viết” source and fixed self-choice warning remain visible; after explicit choice the source and unresolved-AI note remain, with no AI restore action.
- [x] Given a user explicitly selected a transport and `/check` returns a different normalized transport, when the client handles the response, then it keeps the user choice and blocks confirmation with a safe warning rather than overwriting silently.
- [x] Given a clear preliminary candidate, when `assertTripRequirementClear` runs, then it returns normalized data even without `startDate`; given any error/blocker, it throws safe 422 `TRIP_REQUIREMENT_UNCLEAR` details.
- [x] Given `/analyze` or `/check` succeeds, when the response is returned, then `clarificationRequests` is additive, validated, no-store, and old clients tolerate its absence with `[]`.
- [x] Given Guest/Admin calls either protected endpoint, when the request is denied, then existing 401/403 behavior occurs before body access and no new module work is performed.
- [x] Given analyze/check requests reach the review, when the panel renders, then duplicate IDs are removed, BLOCKING precedes ADVISORY, server/check data wins, source text is plain text, and the Vietnamese counts use `N mục bắt buộc · M mục khuyến nghị`.
- [x] Given a BLOCKING request has a valid current field value, when merge runs, then it disappears; if that field is cleared/invalid again, it reappears. ADVISORY can be dismissed in memory and BLOCKING has no dismiss action.
- [x] Given CHOOSE_ONE is rendered, when no choice has been made, then no option is selected by default; saving a valid choice applies the shared US-26 draft edit and invalidates confirmation.
- [x] Given clarification BLOCKING requests, an active editor, an active check or a missing acknowledgement, when the review renders, then “Xác nhận nhu cầu” is disabled with a text reason; no new create/save action is rendered.
- [ ] Given a Traveler opens the review in a browser, when a BLOCKING item is resolved, then focus/keyboard flow and the “Đã làm rõ đủ thông tin bắt buộc” announcement are usable at 360px.
- [ ] Given US-28 plans or saves, when it receives a candidate, then the future handler calls `assertTripRequirementClear` server-side and `assertStartDateForFinalConfirmation` immediately before official confirmation/save.
- [ ] Given owner questions remain unresolved or live/browser evidence is unavailable, when the story is reviewed, then status remains DRAFT.

## Test Plan

- `trip-clarification-rules.vitest.test.ts`: all seven fields across extracted/missing/ambiguous/unsupported states, reason mapping, stable ordering/deduplication, transport options, contradiction false-positive cases, service post-process, check issue mapping, gate success/blockers, warnings, hostile input and safe details.
- `trip-transport-policy.vitest.test.ts`: keyword classification, Unicode/word boundaries, unsupported/ambiguous/conflict/none, canonical assertion, extraction downgrade, prompt-control fixtures, check mapping and source audit.
- Existing US-25 HTTP tests: additive analyze response and clarification requests for missing required fields; existing auth/body/error behavior remains covered.
- Existing US-26 HTTP/client tests: additive check response, mapped missing/range/warning requests, legacy client response default `[]`, cache/auth behavior unchanged.
- `trip-clarification-logic.vitest.test.ts`: merge/dedupe/order, server precedence, blocking resolution/reappearance, advisory dismissal, three US-26 confirmation gates and panel source contract.
- `us27-test.vitest.test.ts`: **13 cross-layer tests** using `__fixtures__/utterances.ts`: missing duration/transport through extraction, `/analyze`, `/check`, planner gate and FE merge; unsupported/ambiguous transport and model/source mismatch; duration/transport/date/companion conflicts; advisory-vs-blocking confirmation and unchanged final start-date guard.
- Task229 additive coverage in `us27-task229-recovery.vitest.test.ts`: **5 tests** for the missing HTTP-response → strict client parser → explicit review correction → authoritative `/check` → confirmation recovery sequence. Covers the four groups (unsupported and ambiguous separately), partial correction of two simultaneous blockers, source preservation and re-blocking after a later clear. The original suites and production code are unchanged.
- Owner-run instructions: [Task229 manual checklist](../implementation/us27-task229-manual-checklist.md) has concrete four-group steps plus 360px, focus/keyboard and aria-live/screen-reader checks. Every manual result starts NOT PROVEN; no browser PASS is claimed by the agent.
- Existing US-24/25/26 tests were not modified for US27-TEST; their existing auth/body-order, API envelope/no-store, legacy `clarificationRequests: []`, client stale/network, and source-contract coverage was reused rather than duplicated.
- Manual UI checklist (all NOT PROVEN in this environment):
  - [ ] Four groups from natural-language input → review → clarification → confirm.
  - [ ] Xe đạp/grab/“đi xe” leaves transport unselected; “xe máy hoặc ô tô” requires an explicit choice.
  - [ ] Contradictory duration is blocked; advisory can be dismissed; editing after confirmation requires re-check.
  - [ ] Guest redirects to login and does not auto-submit; Admin is denied.
  - [ ] No sensitive text appears in logs/URL/storage; 360/390/768/1280px has no horizontal overflow.
  - [ ] Keyboard, focus and `aria-live` announcements work; AI/network errors preserve the form.
  - [ ] Real OpenAI fixture/evaluation run is NOT PROVEN because no owner permission/credentials were supplied.
- Full relevant US-24/25/26/27 tests run without DB, network, secret, OpenAI or machine clock dependency.
- Live curl, browser UI, accessibility, planner call and real OpenAI behavior are manual/NOT PROVEN unless credentials and a browser session are supplied.

### Transport source audit

| Client touchpoint | Protection | Evidence |
| --- | --- | --- |
| US-24 `trip-requirement-form.tsx` + `trip-requirement-form-logic.ts` | Controlled radios start as `""`; `buildPayload` sends invalid/tampered transport as `null`; validator reports the raw invalid value; only radio `onChange` sets a value. | `trip-requirement-form-logic.vitest.test.ts`, source-contract test |
| US-25 `apply-extraction.ts` + `extraction-result-panel.tsx` | `applyExtractionToForm` uses only `resolveTransportCandidateFromExtraction`; unresolved extraction stays empty and shows source/fixed message. | `apply-extraction.vitest.test.ts`, source-contract test |
| US-25 `natural-language-input.tsx`/analyze client | Sends the user’s plain text only; it does not infer or prefill a transport value. Mapping begins only at the verified extraction seam. | Source audit; no transport assignment in the input/connect boundary |
| US-26 `trip-requirement-review.ts` + `trip-review-screen.tsx` | `draftFromExtraction` uses the same helper; invalid/AI-downgraded values have `value/aiValue: null`; editor does not auto-focus the first radio; server normalization mismatch keeps user draft and blocks confirmation. | `trip-requirement-review.vitest.test.ts`, source-contract test |
| US-26 `trip-requirement-check-client.ts` | Transports only the canonical candidate created by the review draft; it does not normalize or substitute client-side. | Existing check-client tests + source audit |
| US-27 `trip-clarification-panel.tsx` | CHOOSE_ONE starts with `selectedChoice = null`; no default option; resolution is applied only through an explicit user action and `applyFieldEdit`. | `trip-clarification-logic.vitest.test.ts`, source-contract test |
| Shared boundary `transport-safety.ts` | Returns only canonical `MOTORCYCLE`/`CAR` for `EXTRACTED` non-downgraded enum values; all other states return `null`. | `transport-safety.vitest.test.ts` |

The source-contract test also checks all listed files for literal fallback assignments, `??`/`||` canonical defaults, browser storage/HTML injection, replacement wording and transport radio browser defaults. Explicit enum values in fixtures/options represent contract or user/model data, not fallback mappings. The audit passed.

## Expected Modules / Files

- `apps/web/src/modules/trip-requirement/trip-clarification-rules.ts`
- `apps/web/src/modules/trip-requirement/trip-transport-policy.ts`
- `apps/web/src/modules/trip-requirement/trip-transport-policy.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-clarification-server.ts`
- `apps/web/src/modules/trip-requirement/trip-clarification-rules.vitest.test.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-service.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-http.ts`
- `apps/web/src/lib/preference-extraction-client.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check-http.ts`
- `apps/web/src/lib/trip-requirement-check-client.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-http.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-form-logic.ts` (removed implicit transport fallback)
- `apps/web/src/modules/trip-requirement/transport-safety.ts`
- `apps/web/src/modules/trip-requirement/transport-safety.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-review.ts` (partial field validation without selected transport)
- `apps/web/src/modules/preference-extraction/prompt-builder.ts` (reuses policy keyword table)
- `apps/web/src/lib/preference-extraction-client.vitest.test.ts`
- `apps/web/src/lib/trip-requirement-check-client.vitest.test.ts`
- `apps/web/src/app/trips/new/trip-clarification-panel.tsx`
- `apps/web/src/app/trips/new/trip-review-screen.tsx`
- `apps/web/src/app/trips/new/trip-field-editors.tsx`
- `apps/web/src/app/trips/new/extraction-result-panel.tsx`
- `apps/web/src/app/trips/new/us27-fe-nosubst-source.vitest.test.ts`
- `apps/web/src/app/trips/new/trip-form.css`
- `apps/web/src/modules/trip-requirement/trip-clarification-logic.ts`
- `apps/web/src/modules/trip-requirement/trip-clarification-logic.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us27-test.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us27-task229-recovery.vitest.test.ts` (Task229, new tests only)
- `docs/implementation/us27-task229-manual-checklist.md` (owner-run, initially NOT PROVEN)
- `apps/web/src/app/trips/new/trip-requirement-form.tsx`
- `docs/stories/US-27-clarification-unsupported-data.md`
- `docs/ai-progress.md`

## Migration Impact

Không. No Trip model, database write, migration or storage change.

## Environment Impact

Không. No dependency, secret or environment variable added.

## Implementation Sequence

1. [x] Verify actual US-24/25/26 dependencies and contracts.
2. [x] Add isomorphic clarification schema, reason/issue mapping and contradiction downgrade.
3. [x] Integrate one post-verification downgrade seam into US-25 extraction.
4. [x] Add server planner gate and additive analyze/check response fields plus legacy client defaults.
5. [x] Add deterministic clarification, transport-policy and source-audit tests, update evidence and handoff documentation.
6. [x] Add review clarification merge logic, panel, shared-editor integration and confirmation blocking.
7. [x] Add the shared client transport resolver, remove review radio auto-focus, preserve source text and guard server-normalization mismatches.
8. [x] Add the US27 cross-layer regression suite using the US25 fixture corpus; leave manual/browser/provider checks explicitly NOT PROVEN.

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Dependency verification | PASS | All required US-24/25/26 files, functions, issue codes and routes were found and read in the repository. |
| Clarification data contract and transport safety | PASS | Pure schema/rule tests validate stable IDs, code-owned questions, exact two transport options, no selected/default and no unsupported option. |
| Central transport policy and canonical assertion | PASS | `trip-transport-policy.ts` reuses US-24 values/options, owns one PROPOSED keyword table, normalizes boundaries, rejects non-canonical values with `TRANSPORT_UNSUPPORTED`, and is reused by the extraction prompt. |
| Transport extraction post-process | PASS | Policy tests cover unsupported, ambiguous, conflict, exact match, model mismatch, mobility-note false positives and prompt-control fixtures; source text is retained and no value is substituted. |
| US-26 transport issue mapping | PASS | Check emits `TRANSPORT_UNSUPPORTED` for present invalid transport, keeps missing/null as `MISSING_REQUIRED`, and maps unsupported clarification to a blocking choice of exactly the two canonical options. |
| Extraction status matrix | PASS | Tests cover all seven fields across extracted/missing/ambiguous/unsupported, required blocking, optional advisory/quiet missing and companion conflict. |
| Contradiction downgrade | PASS | Tests cover ranges/alternatives, multiple absolute dates, equivalent date representations, false-positive duration phrases, immutability and US-25 service seam. |
| Check mapping and server gate | PASS | Tests cover issue-to-kind mapping, stable blockers, missing/invalid/past/consistency errors, preliminary relative days, warning pass and safe malformed input. |
| Additive API/client contract | PASS | Analyze/check response tests assert `clarificationRequests`; clients default legacy missing field to `[]`; existing envelopes/cache/auth tests remain green. |
| Review clarification panel and confirmation gate | PASS (automated) | `trip-clarification-logic.vitest.test.ts` passes merge/dedupe/server precedence, blocking reappearance, advisory dismissal, CHOOSE_ONE no-default source contract; review receives analyze/check requests and uses `canConfirm`. Browser interaction/focus is NOT PROVEN. |
| No-substitution transport boundary | PASS (automated) | `transport-safety.vitest.test.ts`, apply/review regressions, buildPayload tamper test and `us27-fe-nosubst-source.vitest.test.ts` cover canonical-only extraction, unresolved fixture states, no radio default/auto-focus, source retention and server mismatch protection. |
| Four US27 focus groups across layers | PASS (automated) | `us27-test.vitest.test.ts` adds 13 tests covering missing duration, missing transport, unsupported/ambiguous transport and contradictions across extraction, analyze/check, gate and FE logic. |
| Automated relevant tests | PASS (2026-10-15, Task229) | Baseline **22 files, 348/348**; after the new recovery suite **23 files, 353/353**, zero failed/skipped. Original `us27-test.vitest.test.ts` remains **13/13**; new file **5/5**. Exact selection/command below; not a full-repository test result. |
| Task229 correction/recheck sequence | PASS (automated) | Five synthetic-provider cases pass through real HTTP response functions and strict client parsers, remain unconfirmed until every explicit correction is checked, retain source provenance and close both gates again after clearing a required field. No live browser/server session/provider was used. |
| Root check-types | FAILED outside Task229 (2026-10-15) | Root `npm run check-types` via installed Node22 reaches TypeScript. Final run reports only existing `cloudinary-provider.ts:2` TS2307 (missing `cloudinary`) and `:75` TS7006. No diagnostics remain in the new test file; this is not a project-wide typecheck PASS. Earlier shim failures are historical, not the current blocker. |
| Root full test/build | NOT RUN in Task229 | Only the requested US-24→27 Vitest selection and root typecheck ran. Prior full-test/build failures remain historical; no shim, dependency, unrelated RAG or production repair was attempted. |
| Live API/browser/planner/OpenAI evidence | NOT PROVEN | No Traveler session, live curl/browser, planner caller or real OpenAI request was used. |
| Manual UI/accessibility/provider checklist | NOT PROVEN | [Owner-run Task229 checklist](../implementation/us27-task229-manual-checklist.md) remains unticked. No Traveler browser interaction, 360px measurement, focus/screen-reader behavior or real-provider evaluation was performed for this task. |
| US-28 handoff | DEFERRED | Handoff is documented; US-28 must call both server gates before planning/official save. |

### Task229 — four-group coverage audit (2026-10-15)

The existing `us27-test.vitest.test.ts` already covers all four initial problem groups. No missing initial classifier/rule was invented, and none of its tests was edited. Added coverage closes the correction loop through both HTTP response contracts and both client parsers instead of repeating the existing keyword/status matrix.

| Group | Existing coverage in `us27-test.vitest.test.ts` | Additional coverage in the new file | Current result |
| --- | --- | --- | --- |
| Missing duration | Extraction/analyze blocker, check/gate rejection, FE merge resolution and invalid duration cases | Explicit duration edit survives actual check response/client parsing, then clear closes confirmation again | PASS automated; browser NOT PROVEN |
| Missing transport | Missing status/options without defaults, analyze request, required ordering, gate and no auto-fill | Explicit user transport choice through analyze/check parsers and confirmation, then re-block on clear | PASS automated; browser NOT PROVEN |
| Unsupported / ambiguous transport | Fixture corpus, source/model mismatch downgrade, no substitution, unsupported check/API/gate | Separate unsupported and ambiguous model-CAR cases retain unresolved value until explicit MOTORCYCLE choice survives `/check` | PASS automated; browser NOT PROVEN |
| Contradictory data | Duration/date/transport contradictions, analyze response, companion error and advisory warning behavior | Two simultaneous blockers: duration correction alone stays unconfirmed; only the second explicit correction permits a checked snapshot | PASS automated; browser NOT PROVEN |

Execution used the existing **Node v22.20.0** binary directly; no install, `nvm use`, shim modification, environment file or configuration change. Working directory for the following command is `apps/web`; `$taskNode` is the already-installed `C:/Users/duybi/AppData/Local/Author Software/nvm/installs/v22.20.0/node.exe`:

```powershell
& $taskNode ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-requirement src/modules/preference-extraction src/lib/preference-extraction-client.vitest.test.ts src/lib/trip-requirement-check-client.vitest.test.ts src/app/trips/new
```

Baseline exited 0 with 348 tests; the new file alone exited 0 with 5 tests; the final full relevant selection exited 0 with 353 tests. Existing expected auth/validation stderr logs did not fail tests. Test providers and auth/database objects are synthetic; no Neon/OpenAI/Google call or localhost server was used. A first typecheck found an overly direct cast in the new auth fixture; it was corrected only in the new test file. The final root typecheck exits 1 solely for the two Cloudinary diagnostics above. Build/full-repository tests and manual/live acceptance remain NOT PROVEN in this task.

`git diff --check` passes (existing LF→CRLF notices only). Task229 remains Ongoing pending Bình's manual evidence. The original unchecked AC containing both US-28 server gate requirements (`assertTripRequirementClear` and `assertStartDateForFinalConfirmation`) is preserved verbatim and unchecked; direct unit tests of guards are not acceptance of their US-28 integration.

## Open Questions

- **PROPOSED — pending owner:** Which clarification kinds/severities are definitively blocking versus advisory for every optional field?
- **PROPOSED — pending owner:** When source text contains several values but one is clearly marked as the final correction, should the current deterministic downgrade still block, or should a later approved parser distinguish it?
- **PROPOSED — pending owner:** Is the current code-owned Vietnamese wording for each question acceptable, or should Product provide final copy?
- **PROPOSED — pending owner:** Should an ambiguous date be advisory only when the preliminary proposal can use relative days, while still blocking final confirmation/save?
- **PROPOSED — pending owner:** Are the US-26 `SOLO`/children and pace/mobility rules accepted product rules or still exploratory?
- **PROPOSED — pending owner:** Which Figma frame defines the future clarification UI and exact responsive interaction?
- **Decision for this implementation, pending owner:** Advisory dismiss is memory-only and resets when its field changes; there is no persistence across navigation. The panel announces counts without forcibly moving focus when review opens; field navigation explicitly scrolls/focuses the related row.
- **PROPOSED — pending owner:** Confirm the transport keyword table and whether the expanded English/brand keywords (`motorbike`, `scooter`, `bus`, `grab`, `be`, `xanh sm`, `limousine`, `flight`, `trekking`, `xe ôm công nghệ`) are acceptable MVP wording.
- **PROPOSED — pending owner:** Confirm that control-like phrases (`mặc định dùng ô tô`, `trả transport=AIRPLANE`) remain `AMBIGUOUS`, and that a source containing a supported plus unsupported mode is `CONFLICT`.
- **Implementation constraint:** `ExtractionResult` currently has no `CONFLICT` status. Until an owner-approved contract migration exists, transport conflicts are represented as `AMBIGUOUS` plus reason `CONFLICT`; no new public status was added in US27-BE-TRANSPORT.
- **Decision for FE-NOSUBST:** if `/check` returns a transport different from an explicit user selection, the client keeps the user selection but does not mark the review confirmed; it shows a safe technical mismatch message and lets the user retry. This avoids silent overwrite and avoids treating an unverified replacement as confirmed.
- Product/System DOCX and requirement IDs remain unverified because the files are not present in the workspace.

## Handoff Notes

- US-28 MUST call `assertTripRequirementClear(candidate, now)` on the server immediately before planner/itinerary generation; it must not trust client `clarificationRequests`, `confirmable`, AI status, or a stale review snapshot.
- US-28 MUST call `assertStartDateForFinalConfirmation(requirement, now)` immediately before official confirmation/save. A preliminary result without `startDate` is never eligible for that official step.
- Planner input must use the normalized requirement returned by the gate. If a future UI needs to display source text, render it as plain text and do not include health notes in blocker details/logs.
- Transport classification is now implemented in `trip-transport-policy.ts`; future extraction/planner work must reuse it and must never select a replacement for unsupported, ambiguous or conflicting source text. The proposed keyword list and ambiguity wording still require owner confirmation.
- US27-FE-CLARIFY handoff: keep `TripClarificationPanel` fed by the additive analyze/check `clarificationRequests`; use `applyFieldEdit`/shared editors for field changes; do not add a second API, storage, or client-side final confirmation authority. The server `/check` response remains the source of truth.
- US27-FE-NOSUBST handoff: future client transport code must call `resolveTransportCandidateFromExtraction` for extraction mapping, preserve `sourceText` as plain text, require an explicit user action for a radio choice, and never add a fallback/default canonical transport. Unsupported/ambiguous/conflicting/missing source must remain unresolved until the user chooses.

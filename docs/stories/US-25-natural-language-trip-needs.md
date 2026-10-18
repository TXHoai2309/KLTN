# US-25 — Thiết kế hợp đồng trích xuất nhu cầu chuyến đi bằng ngôn ngữ tự nhiên

## Status

DRAFT — AI-DESIGN, US25-AI-IMPL, US25-API, US25-FE-INPUT, US25-FE-CONNECT and US25-TEST automated coverage are implemented; review UI/persistence and owner decisions remain pending.

## Epic

Trip planning / AI preference extraction.

## Owner

N/A — pending product/technical owner approval.

## Goal / User Story

Là Du khách, tôi muốn nhập nhu cầu chuyến đi bằng ngôn ngữ tự nhiên để hệ thống có thể trích xuất ứng viên rõ ràng, giữ lại điều mơ hồ và cho tôi sửa trước khi lập hành trình.

## Outcome

Một hợp đồng Zod 4 dùng chung cho server, client và test, server-core adapter/service kiểm chứng đầu ra, một endpoint Traveler-only không ghi DB và luồng UI trên `/trips/new`: người dùng có thể gửi văn bản, xem kết quả 7 nhóm trường, làm rõ và chủ động điền gợi ý vào form US-24. Model chỉ trả cấu trúc đóng; mỗi trường có thể là `EXTRACTED`, `AMBIGUOUS`, `MISSING` hoặc `UNSUPPORTED`. Chưa có review UI, xác nhận/lưu hay persistence; test không gọi OpenAI thật.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, “Deterministic Constraint Validator”, “Error and recovery semantics”.
- `docs/flow/user-flow.md` — “Trip requirement capture”, “Itinerary generation and validation”, “Auth transition”.
- `docs/decisions.md` — ADR-07 (AI tách khỏi Validator), ADR-11 (Varlock environment), ADR-14 (Vitest), ADR-16 (provider boundary).
- OpenAI Structured Outputs documentation, consulted 2026-10-09 and 2026-10-11: [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), [Chat Completions create](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), and [Responses migration notes](https://developers.openai.com/api/docs/guides/migrate-to-responses). These confirm the selected Chat Completions `response_format.json_schema`, strict closed objects, required fields, `store:false`, and `max_completion_tokens`. This is provider guidance, not a product approval.
- OpenAI model compatibility, consulted 2026-10-17: [Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model) requires removing `temperature` when reasoning effort is not `none`; [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) supports `none` and defaults to `medium`. The adapter selects `reasoning_effort: "none"` for this model family to retain `temperature: 0` and the existing extraction token limit. Other configured models keep their previous request behavior.
- Next 16 local Route Segment Config docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` and `maxDuration.md`) — used to set `runtime = "nodejs"` and `maxDuration = 20`; deployment-platform enforcement remains NOT PROVEN.
- Product Document/System Specification `.docx`: **NOT FOUND in workspace**, so detailed DOCX rules are not proven.
- Figma: Chưa có frame cho vùng nhập; US25-FE-INPUT uses the existing `/trips/new` tokens and responsive conventions.

## Dependencies

Đã có:

- `apps/web/src/modules/trip-requirement/trip-requirement-contract.ts` from US24-CONTRACT: `TripRequirementInput`, transport/enum values, limits, date validation and normalization.
- `apps/web/src/modules/trip-requirement/trip-requirement-readiness.ts` and `POST /api/trip-requirements/evaluate` from US24-START; the readiness/guard remains deterministic and server-authoritative.
- `/trips/new` and `trip-requirement-form-logic.ts` from US24-FORM/VALIDATE; US25-FE-INPUT and US25-FE-CONNECT add a sibling input/result flow above the existing form without changing its deterministic evaluate path.
- Vitest 5 + strict Node config from ADR-14; Zod 4.5.4 is already an app/root dependency.
- Shared authorization/API envelope primitives exist for future server integration.

- `apps/web/src/modules/preference-extraction/preference-extraction-server.ts` provides server-only default dependencies including the shared authorization dependency; `POST /api/trip-requirements/analyze` now uses that boundary.

Chưa có:

- No OpenAI SDK, rate-limit service, Trip/planner integration or review UI; the US25-API route is present and deliberately has no DB/storage side effect.
- US25-AI-IMPL now has a direct-fetch provider adapter, prompt builder, verification wrapper, dependency-injected extraction service and server defaults. `OPENAI_API_KEY` and `OPENAI_PREFERENCE_MODEL` are read only by the server adapter; the model variable remains intentionally blank.

## Task Breakdown

- [x] [CONTRACT] — model/output/result schemas, status invariants, JSON Schema export and US-24 verification helper.
- [x] [ADR] — ADR-16 provider boundary, model configuration, retry/timeout and privacy proposal.
- [x] [ENV] — optional `OPENAI_PREFERENCE_MODEL` declaration, example and deployment documentation.
- [x] [TEST] — contract invariants, strict-schema shape, verification and input-limit tests.
- [x] [BE] — US25-AI-IMPL server extraction core: provider adapter, prompt builder, safe verification, dependency-injected service and error mapping. No Route Handler was added in that implementation task.
- [x] [API] — US25-API Traveler-only analyze route, bounded strict JSON body, same-origin checks, safe error mapping/logging and Node runtime configuration.
- [x] [FE] — US25-FE-INPUT local natural-language textarea, examples, character validation/accessibility and API-ready status seam; no API call.
- [x] [FE] — US25-FE-CONNECT browser API client, single-flight/cancel/stale-response handling, result panel and explicit non-overwriting form suggestions.
- [x] [TEST] — US25-TEST fixture corpus, fake-pipeline safety tests, FE invariant/source tests and opt-in real-provider evaluation script.
- [ ] [FE] — future review/clarification UI; must show extracted values, source snippets and clarifications before planner use.

## In Scope

- Isomorphic `preference-extraction-contract.ts`.
- Strict raw model schema generated through Zod 4 `z.toJSONSchema`.
- Server-verified `extractionResultSchema`, status/value/source invariants, clarification shape and pure verification helper.
- Proposed Vietnamese extraction rules, input bounds, privacy boundary and environment declaration.
- Server-only direct-fetch Chat Completions adapter, prompt delimiter boundary, source/date anti-fabrication verification, safe error mapping and injected clocks/fetcher.
- Traveler-only `POST /api/trip-requirements/analyze` with an 8KB bounded body reader, strict `{ text }` request, no-store response, same-origin/fetch-site checks and injectable HTTP dependencies.
- `/trips/new` natural-language input block with local normalization/length state, example chips, privacy notice and discriminated status props; it does not call the API or store drafts.
- Browser API client for the analyze endpoint with schema validation, safe response decisions and no automatic retry.
- Connected single-flight UI with cancellation, stale-response protection, 401/403/400/AI/network feedback and a read-only 7-field result panel.
- Explicit `Điền vào biểu mẫu` flow that applies only verified `EXTRACTED` values to empty US-24 fields; conflicting values remain pending until the user chooses them, with per-field “Dùng gợi ý này/Bỏ gợi ý”.
- A synthetic fixture corpus with full/missing/ambiguous/unsupported/companions/mobility/pace-noise/injection groups, deterministic fake-provider coverage, and a manual-only opt-in evaluation script that writes aggregate results outside Git.
- Deterministic Vitest contract tests.

## Out of Scope

- Review/confirmation/save, planner, storage and rate-limit enforcement remain out of scope. The result panel is read-only and only provides an explicit US-24 form-fill handoff.
- Full clarification workflow, destination mapping, RAG, analytics, database/storage and final itinerary generation.
- OpenAI production accuracy and model-level prompt-injection resistance; automated tests prove only prompt delimiting and server fail-closed verification.
- Relative-date calculation, itinerary generation or Constraint Validator decisions.

## Business Rules

- The model proposes candidate values; US-24 verifies the canonical values and server code owns clarifications.
- `EXTRACTED` means non-null verified value plus an original source snippet; `MISSING` means both value and snippet are null; `AMBIGUOUS`/`UNSUPPORTED` mean null value plus a source snippet.
- No unmentioned field receives a default. Unknown transport is not silently mapped to motorcycle/car.
- Missing `durationDays` or `transport` means no preliminary proposal; missing `startDate` can still use relative Day 1/Day 2 labels but cannot pass final confirmation/save.
- Natural-language extraction never certifies opening hours, route time, destination eligibility or final itinerary validity; those remain deterministic/future planner concerns.

## Roles / Authorization

The analyze endpoint requires `requireTraveler` before reading/validating the body or invoking the provider. Guest receives `401 UNAUTHENTICATED`; Admin receives `403 FORBIDDEN`; the role is read from the server session and persisted-role guard, never from request input. No `userId`, role or target is accepted in the body.

## Ownership Rules

N/A: no persisted record or external write. Future trip/planner work must scope any saved data to the trusted Traveler `userId`.

## UX / UI Contract

`/trips/new` keeps the US-24 form visible and places “Mô tả nhu cầu bằng lời” above it. The textarea is independent: example chips only fill the textarea, and using either input path does not clear or block the other. The component accepts a discriminated `status` (`idle | invalid | analyzing | success | failure`) plus `onAnalyze`/`onCancel`; the parent owns the API call and keeps the US-24 form usable throughout.

The textarea counts normalized Unicode code points against the shared 5–1000 contract, shows the exact shared schema message, and intentionally allows typing past the maximum so the user sees a clear error instead of silent truncation. It sends the normalized value to the same-origin client adapter only after the user presses the button. No localStorage/sessionStorage/URL/history state is used. The privacy note says the text is sent to an AI service for analysis and is not saved in the application system; it makes no provider-retention promise.

While analyzing, the button is disabled, `aria-busy` is true and “Hủy” aborts the request. A second request cannot run for the same block; an aborted/stale response cannot update the UI. `401` redirects to `/login?returnTo=%2Ftrips%2Fnew` without replay and tells the user to enter the text again; `403`, validation, AI and network errors preserve both the natural-language text and all US-24 fields. Retry is explicit. A successful result focuses its heading and exposes all seven fields, status text/icons, source snippets, clarifications, `N/7`, and missing required fields.

`Điền vào biểu mẫu` is explicit and never evaluates, confirms or saves automatically. `applyExtractionToForm` uses only verified `EXTRACTED` values and only fills empty US-24 fields. A conflict is shown as a pending suggestion with “Dùng gợi ý này” and “Bỏ gợi ý”; user edits remove the applied label. The result panel is replaceable by the future review story and does not claim that AI output is confirmed.

## Data Contract

### Input boundary

`preferenceInputSchema` normalizes NFC, removes control characters and trims. The proposed limit is 5–1000 Unicode code points after normalization. It is a boundary only; it does not infer dates, duration or transport and raw text is not returned in `meta`.

### Field extraction

Each `fields` key is a `FieldExtraction`:

```ts
{
  status: "EXTRACTED" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED",
  value: CanonicalUS24Value | null,
  sourceText: string | null, // original supporting snippet, <= 200 code points
  note: string | null
}
```

The `modelOutputSchema` uses raw values (`string`, `number`, string arrays and strict nested raw objects), with all keys required and optional business values represented as `null`. It does not hard-code enum/range checks so phrases such as an unsupported transport can be retained as a candidate for deterministic rejection. `extractionResultSchema` uses the verified US-24 types and rejects/rewrites invalid values to `AMBIGUOUS` or `UNSUPPORTED`.

The result envelope is:

```ts
{
  fields: {
    startDate, durationDays, transport, companions,
    interests, pace, mobilityConstraints
  },
  clarifications: Array<{
    field: "startDate" | "durationDays" | "transport" | "companions" | "interests" | "pace" | "mobilityConstraints",
    reason: "AMBIGUOUS_TRANSPORT" | "UNSUPPORTED_TRANSPORT" | "AMBIGUOUS_DATE" |
      "AMBIGUOUS_DURATION" | "OUT_OF_RANGE" | "CONFLICT" | "OTHER",
    message: string,
    sourceText: string
  }>,
  missingRequired: Array<"durationDays" | "transport">,
  meta: { model: string; latencyMs: number; inputLength: number }
}
```

`clarifications` and `meta` are server-generated. Metadata contains no raw preference text. `missingRequired` is the preliminary-proposal gate; `startDate` is assessed separately by US24-START readiness/final-confirmation guard.

### Browser analyze client contract

`apps/web/src/lib/preference-extraction-client.ts` sends `POST /api/trip-requirements/analyze` with same-origin credentials and JSON `{ text }`, validates `data.result` with `extractionResultSchema`, and returns a pure `SUCCESS | FAILED | NETWORK_ERROR` union. It does not retry, expose raw response text, or decide a successful state from HTTP status alone. The parent component owns single-flight and retry/cancel semantics.

### Proposed extraction rules — owner pending

These are **PROPOSED — pending owner** because the authoritative DOCX is unavailable:

- `durationDays`: `3 ngày 2 đêm` → `3`; `ba ngày` → `3`; `một tuần` → `7`; `2-3 ngày` → `AMBIGUOUS`; `cuối tuần` → `AMBIGUOUS` (do not guess 2); outside US-24 1..14 → `UNSUPPORTED` + `OUT_OF_RANGE` clarification.
- `startDate`: accept only a complete absolute date, or a day/month form only when a future owner-approved rule makes it unambiguous. `ngày mai`, `cuối tuần này`, `đầu tháng sau`, `15/10` remain `AMBIGUOUS` with `value:null` and source text. The model must not calculate a date.
- `transport`: `xe máy`, `moto`, `phượt xe số`, `xe ga` → `MOTORCYCLE`; `ô tô`, `xe hơi`, `xe 4 chỗ`, `thuê xe tự lái 4 bánh`, `car` → `CAR`; `xe đạp`, `taxi`, `grab`, `xe khách`, `máy bay`, `đi bộ` → `UNSUPPORTED`; `đi xe`, `tự lái`, `phương tiện cá nhân` → `AMBIGUOUS`.
- `companions`: `một mình` → `SOLO,1`; `đi với vợ/chồng/người yêu` → `COUPLE,2`; `gia đình 4 người` → `FAMILY,4`; `nhóm bạn 6 người` → `FRIENDS,6`; conflicts such as `cặp đôi 5 người` → `CONFLICT` and no value.
- `interests`: map explicit Vietnamese/English phrases to the US-24 enum only. Unmapped phrases are omitted from `value` and recorded in `note`; never invent an enum.
- `pace`: `thong thả`, `chill`, `nghỉ ngơi` → `RELAXED`; `vừa phải` → `MODERATE`; `đi nhiều`, `dày`, `tối đa điểm` → `PACKED`; absent → `MISSING`.
- `mobilityConstraints`: explicit statements such as `đi bộ nhiều không được`, `ông bà lớn tuổi`, `có em bé`, `say xe` map to the corresponding US-24 flags. A free note is kept only when explicitly stated, shortened to `MAX_NOTE_LENGTH`, and never inferred as a medical condition.
- Unmentioned values are `MISSING`. Vietnamese with/without accents, mild typos, abbreviations such as `2n1đ` and mixed English are best-effort inputs; other languages are attempted best-effort and must not cause a hard contract failure solely because of language.

## API Contract

`POST /api/trip-requirements/analyze` is a Traveler-only, non-persisting endpoint. Authentication is checked before Origin, Content-Type, body reading or provider work. Requests must be same-origin: `Origin` must equal the request origin and, when `Sec-Fetch-Site` is present, it must be `same-origin` or `same-site`. The body is JSON, read as a bounded stream with an 8KB byte limit, and must match the strict schema `{ text: string }`; unknown keys, non-object JSON and malformed JSON return `400 VALIDATION_ERROR` with `details.fieldErrors` using `text` and/or `_form`. `preferenceInputSchema` then applies the 5–1000 Unicode code-point contract; an empty/short/long text returns `fieldErrors.text`.

Success is `200 { success: true, data: { result: ExtractionResult } }` with `Cache-Control: private, no-store`. A result where nothing is recognized is still a successful response with all applicable fields `MISSING` and `missingRequired` populated. The response exposes only the verified `ExtractionResult`; `meta` contains `model`, `latencyMs` and `inputLength`, never raw text or provider response details.

```json
{ "text": "Ngày 15/10/2026, đi xe máy 3 ngày" }
```

The public failure envelope is `{ "success": false, "error": { "code", "message", "details?" } }`. Expected codes are `UNAUTHENTICATED` (401), `FORBIDDEN`/`INVALID_ORIGIN` (403), `VALIDATION_ERROR` (400), `AI_UNAVAILABLE` (503), `AI_INVALID_RESPONSE` (502) and the generic safe `INTERNAL_SERVER_ERROR` (500). Validation details use `{ fieldErrors: { text?: string, _form?: string } }`; no provider message or stack is returned.

The internal service `extractPreferences(rawText, { llm, now, nowMs })` validates/normalizes input, calls the injected `StructuredLlmClient`, then returns only `ExtractionResult`. Provider failures map to `AI_UNAVAILABLE` (503) or `AI_INVALID_RESPONSE` (502), with a safe Vietnamese message and no provider message/stack/raw response. `OPENAI_PREFERENCE_MODEL` remains required by the server adapter; no default model is invented.

The production adapter uses Chat Completions `POST https://api.openai.com/v1/chat/completions` with system/user messages, `response_format.type=json_schema`, `json_schema.name=trip_preference_extraction`, `strict=true`, the Zod-generated `modelOutputJsonSchema`, `temperature: 0`, `max_completion_tokens`, `store:false`, `redirect:"error"` and no user identifier. It returns `{ rawText, model }` to the service; it does not expose raw provider errors.

## Error / Recovery

- Contract/schema failure: deterministic validation failure before any provider call.
- Guest/Admin authorization failure: `401 UNAUTHENTICATED`/`403 FORBIDDEN`; denied requests do not read the body or call the provider.
- Invalid Origin/fetch-site or Content-Type: safe `403 INVALID_ORIGIN` or `400 VALIDATION_ERROR`; all responses are private and no-store.
- Invalid model JSON/schema and refusal/incomplete/blocked output map to `AI_INVALID_RESPONSE` (502); timeout/network/408/429/5xx are safe provider failures, with at most one retry for the listed transport/HTTP conditions.
- Source text that is not contained in the normalized input becomes `MISSING`; relative/ambiguous dates do not become calculated dates; past absolute dates are `UNSUPPORTED` using Asia/Ho_Chi_Minh.
- Ambiguous/unsupported fields are recoverable user clarification states, not provider success or final itinerary validation.
- Relative dates stay unresolved in this task; the future UX must ask the user to choose a concrete date unless a separate approved server rule resolves them.
- Repeating an analyze request is data-safe because it writes no DB, but it can incur provider cost; no idempotency key is used. No rate-limit infrastructure is added (G4); abuse/cost control remains an owner decision. No per-process single-flight limiter is claimed.
- Logs contain only a public/internal error code, latency and Unicode input length; raw text, prompts, provider output and stack details are not logged.

## Write Semantics / Idempotency

N/A: không ghi DB. This task calls an external provider only through the injected/server adapter, but writes no database, cache or storage state. Any later write must use the shared `SUCCESS` / `FAILED` / `UNKNOWN` contract and identical retry payload/key rules.

## External Services

OpenAI is the server-side external service boundary under ADR-16. The adapter is implemented with direct `fetch`; automated tests inject a fake fetcher and make no network call. `OPENAI_API_KEY` and `OPENAI_PREFERENCE_MODEL` must never be exposed to the browser.

## Acceptance Criteria

- [x] Given US24 dependencies, when the repository is inspected, then the canonical contract/readiness/evaluate/form modules are present and no Trip persistence exists; the public analyze route is limited to the US25-API boundary.
- [x] Given a raw model-shaped object, when `modelOutputSchema` parses it, then all fields are required, objects are closed, optional values use `null`, and raw values are not trapped by US-24 enums.
- [x] Given a result-shaped object, when `extractionResultSchema` parses it, then status/value/sourceText invariants and `missingRequired` cross-field consistency are enforced.
- [x] Given a raw output with an invalid US-24 value, when `verifyModelOutput` runs, then it returns `AMBIGUOUS`/`UNSUPPORTED` with no invented enum and server-generated clarification.
- [x] Given the model schema, when Zod 4 JSON Schema is generated, then the exported schema is checked for strict closed objects, complete `required` lists and only the selected Structured Outputs subset.
- [x] Given a malformed input/extra key/invalid status, when the contract tests run, then parsing fails without server/provider/network access.
- [x] Given committed environment files, when they are inspected, then `OPENAI_PREFERENCE_MODEL` is optional, blank and server-internal; no secret is added.
- [x] Given an injected/fake provider configuration, when the server core runs, then it validates input, builds a bounded prompt, sends a strict schema request, verifies source/date/US-24 rules and returns only the verified result.
- [x] Given a Traveler request to `POST /api/trip-requirements/analyze`, when the body is valid, then the Node route returns a no-store `ExtractionResult`; missing recognition remains a `200` result rather than an invented value.
- [x] Given Guest/Admin, invalid JSON/body size/unknown keys/wrong Content-Type/origin or provider failure, when the analyze handler runs, then it returns the safe envelope/status and does not invoke the provider for pre-provider failures.
- [x] Given a Traveler on `/trips/new`, when the page renders, then the natural-language block appears above the independent US-24 form with a labeled textarea, code-point counter, examples, privacy note and API-ready status seam.
- [x] Given short/long text or a pending status, when the Traveler views the analyze control, then it is disabled with a written reason; valid text enables it without submitting the US-24 form.
- [x] Given an example chip, when the Traveler clicks it, then only the textarea is filled and no API request is made; no draft is written to browser storage, URL or history.
- [x] Given valid natural-language text, when the Traveler presses “Phân tích nhu cầu”, then the client sends one same-origin request, shows pending/cancel state, validates the response schema and focuses the result heading after success.
- [x] Given a stale response, cancellation, double click or component unmount, when the response resolves, then it cannot overwrite current state or start a second request.
- [x] Given `401`, `403`, `400`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE` or a network error, when the analyze request fails, then the UI preserves both inputs, gives the specified Vietnamese feedback and exposes explicit retry where appropriate; `401` does not replay.
- [x] Given a verified result, when the panel renders, then all seven groups show Vietnamese labels, text status/icon, value/source/note where present, `N/7`, clarifications and missing required fields without trusting raw HTML.
- [x] Given the Traveler clicks “Điền vào biểu mẫu”, when a verified field is extracted, then only empty US-24 fields receive it; conflicts do not overwrite, can be explicitly chosen or dismissed, and no evaluate/confirm/save is triggered.
- [x] Given the fixture corpus, when fake pipeline tests run, then every requested group has at least two synthetic Vietnamese cases and expected status/value is checked through the server verifier and FE apply path.
- [x] Given unsafe model output (invalid enum/range/date, fabricated source, status/value mismatch, extra/prototype key, malformed/Markdown/free text), when verification runs, then it fails closed or returns only safe US-24 values/statuses and never readiness/final-confirmation fields.
- [x] Given a fixture with missing duration/transport, when FE apply and US-24 validation run, then the remaining required field errors are preserved in deterministic order and user-entered values are never overwritten.
- [x] Given no OpenAI credentials, when `npm run eval:preference` is invoked manually, then it exits with a clear skip message without importing/calling the provider; with explicit credentials it writes only aggregate metrics outside Git and does not print raw responses.
- [x] Given provider refusal, malformed/oversized output, timeout, network, 4xx, 429 or 5xx, when deterministic tests run, then the error is classified safely, only allowed retries occur and no provider content/key is logged.
- [ ] Given an owner-approved model/rate-limit/deployment configuration, when the analyze endpoint is deployed with real credentials, then it calls OpenAI in production. Real OpenAI execution, abuse rate limiting and deployment maxDuration are NOT PROVEN here.

## Test Plan

- `preference-extraction-contract.vitest.test.ts`: strict JSON Schema shape, status/value/source invariants, extra/unknown status rejection, valid verification, invalid transport/range/conflict conversion and input constants/normalization.
- `preference-extraction-server.vitest.test.ts`: injected fake LLM/fetch tests for prompt injection, source/date verification, credentials/model preflight, strict request privacy, refusal/invalid/oversized output, timeout, 4xx/429/5xx/network retry policy, no logging and AppError mapping.
- `preference-extraction-http.vitest.test.ts`: direct handler tests for Traveler auth ordering, 8KB streaming body limit, strict request envelope, Unicode length, no-recognition success, error mapping, no-store headers, same-origin checks and safe logs.
- `natural-language-input-logic.vitest.test.ts`: code-point boundaries, NFC/control-character normalization, shared validation messages, button state and source-contract checks for the local-only component.
- `apps/web/src/lib/preference-extraction-client.vitest.test.ts`: success schema validation, safe HTTP error mapping, same-origin request shape, malformed response and no automatic retry.
- `apply-extraction.vitest.test.ts`: extracted-only mapping, number/array conversion, no overwrite, pending conflict choice, dismissal and removal after user edit.
- `us25-fe-connect-source.vitest.test.ts`: single-flight/abort/stale-response seams, no browser storage, no raw HTML and no implicit evaluate/save after analysis.
- `__fixtures__/utterances.ts` + `preference-extraction-fixtures.vitest.test.ts`: 44 synthetic Vietnamese utterances, every requested group, fake-pipeline expected status/value checks, malicious model-output cases, prompt injection boundary and FE apply/validate invariants.
- `scripts/eval-preference-extraction.ts`: manual-only real-provider evaluation with low limit/concurrency, aggregate field accuracy/hallucination/ambiguity/error/p50/p95 metrics and no raw response output; `npm run eval:preference` is never part of CI/test.
- Real-provider evaluation is cost-bearing and may send synthetic utterances to OpenAI; run only after explicit owner/user permission with non-sensitive data. Missing key/model causes a clean skip; no accuracy or model-level injection-resistance claim is made without a recorded run.
- No DB, Neon, OpenAI network, secret, DOM or machine clock is used; clocks, fetcher, model/key getters and sleep are injected.
- Live OpenAI credentials/session, abuse rate limit and real deployment remain NOT PROVEN.
- Browser viewport/accessibility smoke checks remain NOT PROVEN until a real browser session is available.
- Manual checklist (NOT PROVEN in this environment): Traveler enters valid text → result → `Điền vào biểu mẫu` → `Xem lại nhu cầu`; missing/ambiguous/unsupported text; wrong model/offline AI failure preserves both inputs; Guest/Admin; DevTools confirms no text in logs/URL/storage; 360/390/768/1280px no horizontal overflow; keyboard and aria-live/screen-reader behavior.

## Expected Modules / Files

- `apps/web/src/modules/preference-extraction/preference-extraction-contract.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-contract.vitest.test.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-client.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-errors.ts`
- `apps/web/src/modules/preference-extraction/openai-structured-client.ts`
- `apps/web/src/modules/preference-extraction/prompt-builder.ts`
- `apps/web/src/modules/preference-extraction/verify-extraction.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-service.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-server.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-server.vitest.test.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-http.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-http.vitest.test.ts`
- `apps/web/src/app/api/trip-requirements/analyze/route.ts`
- `apps/web/src/server/http/read-json-body.ts`
- `apps/web/src/modules/preference-extraction/natural-language-input-logic.ts`
- `apps/web/src/modules/preference-extraction/natural-language-input-logic.vitest.test.ts`
- `apps/web/src/app/trips/new/natural-language-input.tsx`
- `apps/web/src/app/trips/new/trip-form.css`
- `apps/web/src/app/trips/new/trip-requirement-form.tsx`
- `apps/web/src/lib/preference-extraction-client.ts`
- `apps/web/src/lib/preference-extraction-client.vitest.test.ts`
- `apps/web/src/modules/preference-extraction/apply-extraction.ts`
- `apps/web/src/modules/preference-extraction/apply-extraction.vitest.test.ts`
- `apps/web/src/app/trips/new/extraction-result-panel.tsx`
- `apps/web/src/app/trips/new/us25-fe-connect-source.vitest.test.ts`
- `apps/web/src/modules/preference-extraction/__fixtures__/utterances.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-fixtures.vitest.test.ts`
- `apps/web/scripts/eval-preference-extraction.ts` (manual-only; report outside Git)
- `docs/stories/US-25-natural-language-trip-needs.md`
- `docs/decisions.md` (ADR-16)
- `apps/web/.env.schema`
- `apps/web/.env.example`
- `apps/web/src/env.ts` (generated by Varlock)
- `docs/implementation/environment-deployment.md`
- `docs/ai-progress.md`

## Migration Impact

Không. No Prisma schema, migration, database table or persistence is added.

## Environment Impact

Declares optional server-only `OPENAI_PREFERENCE_MODEL`; no secret/value is committed. It must be injected into the application runtime (no Varlock `@internal` decorator). Model names are non-secret (`@sensitive=false`) since `meta.model` is already part of the response contract; the optional editorial model name is declared likewise to prevent value-match false positives. `scripts/sync-vercel-env.ts` already filters against `.env.schema` and skips empty values. `OPENAI_API_KEY` remains sensitive and server-only.

## Implementation Sequence

1. [x] Confirm US24 dependencies and current absence of provider integration.
2. [x] Define raw Structured Outputs/result schemas and pure US-24 verification.
3. [x] Record ADR-16 and proposed extraction/provider rules.
4. [x] Declare optional model environment key and align generated env types/docs.
5. [x] Add deterministic contract tests; run checks and record evidence.
6. [x] Implement the injectable server extraction core and deterministic provider/verification tests without adding a route or UI.
7. [x] Add the Traveler-only analyze route, shared bounded JSON reader, safe error boundary and direct handler tests.
8. [x] Add the local natural-language input block above `/trips/new` form with no API/storage side effects and source-contract tests.
9. [x] Connect the browser API, explicit result/apply panel, cancellation/single-flight and source/apply tests.
10. [x] Add the synthetic utterance corpus, fake model safety/FE invariant tests and 1000-code-point API gap coverage.
11. [x] Add the opt-in real-provider evaluation script; do not run without explicit key/owner permission.
12. [ ] Future FE story adds clarification/review UI only after owner decisions.

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| US24 dependencies verified | PASS | US24 contract, readiness, evaluate route and `/trips/new` form/logic exist in the repository; no Trip model/provider module found. |
| Isomorphic contract | PASS | `preference-extraction-contract.ts` imports Zod + US24 client-safe contract only; no `server-only`, auth, DB or SDK import. |
| Strict model schema | PASS | Zod 4 schema uses strict objects, required keys and nullable branches; `modelOutputJsonSchema` is generated via `z.toJSONSchema` and tested by `assertStrictModelJsonSchema`. |
| Server verification boundary | PASS | `verifyModelOutput` validates canonical values/ranges/cross-fields and maps invalid candidates to `AMBIGUOUS`/`UNSUPPORTED`. |
| Clarifications/meta privacy | PASS | Result schema requires server-shaped clarification records and metadata excludes raw text; no provider call or logging was added. |
| Env declaration | PASS | `.env.schema`, `.env.example` and deployment docs declare optional server-only `OPENAI_PREFERENCE_MODEL` with no default. The 2026-10-17 bug fix removes `@internal`, which excluded the configured model from runtime injection; regenerated ignored `src/env.ts` now includes the optional sensitive model. A real Varlock loader test with synthetic values verifies runtime key/model availability and the default provider getters with fake fetch. |
| Automated contract/tests | PASS | The relevant US24 + US25 Vitest selection is 152/152 across 12 files, including the browser client, apply logic, fixture corpus, safety and source-contract tests. |
| OpenAI documentation alignment | PASS | Official Structured Outputs, Chat Completions reference and Responses migration notes were consulted 2026-10-11 and recorded in Source References/ADR-16. |
| Server extraction core | PASS | Direct-fetch Chat Completions adapter, injected service, prompt builder, source/date verifier and safe provider-error mapping are implemented; no SDK, UI, migration or persistence was added. |
| Analyze API boundary | PASS | `preference-extraction-http.ts` and `/api/trip-requirements/analyze` enforce Traveler auth first, strict bounded JSON, same-origin/fetch-site policy, safe provider mapping, no-store and Node runtime. |
| Analyze API tests | PASS | Direct fake-dependency handler tests cover Guest/Admin ordering, full and all-missing success, Unicode length, malformed/oversized/strict body, provider mapping, cache headers and log redaction. |
| FE-INPUT local UI/logic | PASS | The local normalized textarea, 5–1000 code-point states, example chips, status seam, no-storage/no-fetch source checks and US-24 integration are implemented and logic tests pass. |
| FE-INPUT browser/accessibility/viewport smoke | NOT PROVEN | No real browser session was available to measure 360/390/768/1280px overflow or verify keyboard/screen-reader behavior end-to-end. |
| FE-CONNECT browser client/result/apply logic | PASS | `preference-extraction-client.ts`, single-flight/abort/stale-response handling, `extraction-result-panel.tsx` and `apply-extraction.ts` are implemented; focused tests pass and source checks reject storage/raw HTML/implicit evaluate/save. |
| FE-CONNECT live browser/OpenAI flow | NOT PROVEN | No Traveler session and OpenAI credentials were used; 401 redirect, live AI result rendering, retry/cancel with a real browser and viewport/accessibility smoke remain manual checks. |
| Tabbed handoff into US-24 details | IMPLEMENTED / NOT PROVEN in live browser | After a successful analyze response, the existing verified `applyExtractionToForm` path populates only empty fields with safe `EXTRACTED` values and advances to the unlocked “Bổ sung” tab. Missing, unmentioned, ambiguous or unsupported values stay available for manual entry; the natural-language textarea remains mounted in React state. No API, extraction contract or validation rule changed. Authenticated browser/responsive evidence remains NOT PROVEN. |
| US25-TEST fixture corpus | PASS | Added 44 synthetic, non-identifying utterances; all 9 requested groups have at least two cases, including full/missing/ambiguous/unsupported/companions/mobility/pace-noise/injection. |
| US25-TEST fake pipeline and unsafe model outputs | PASS | New fixture suite has 21 tests covering every fixture through `extractPreferences`, prompt delimiter handling, invalid enums/ranges/dates/interests, malformed output, status/value invariants, extra/prototype keys and no readiness leakage. |
| US25-TEST FE invariants/API gap | PASS | Fixture suite checks apply/validate/no-overwrite across the corpus and exact 1000-code-point API success/meta/no-store; prior API suites retain role/error/log/DB-scope coverage. |
| Real-provider evaluation/AI accuracy/injection resistance | NOT PROVEN | Added opt-in `npm run eval:preference`; it was not run because no explicit OpenAI key/model permission was available. Model-level accuracy and prompt-injection resistance require a permitted manual run. |
| Manual browser checklist | NOT PROVEN | No real Traveler/Admin browser session or DevTools/viewport/screen-reader run was available in this environment. |
| Provider safety tests | PASS | 21 US25-AI-IMPL tests cover missing credentials/model, strict request/privacy, retryable/non-retryable HTTP, refusal, bounded output, timeout, network retry, prompt delimiter injection, source fabrication, relative/past dates, prototype pollution and AppError mapping. |
| GPT-6 Luna request compatibility | PASS | 2026-10-17: a synthetic diagnostic reproduced HTTP 400 / `unsupported_value` / `temperature`; the corrected production adapter and extraction verifier returned duration 3 and MOTORCYCLE for a synthetic Vietnamese request in 2797ms. Added alias/snapshot request tests and safe server-only reason/status logging; broader related suites pass 488 tests across 38 files. This proves one provider smoke, not browser/production behavior or model accuracy across the corpus. |
| Real OpenAI call/rate limit/live deployment | NOT PROVEN | No key/model/session was used; no abuse rate-limit service was added and Vercel execution limits were not tested in deployment. |
| Owner decisions and DOCX alignment | NOT PROVEN | Product/System DOCX files were not found; all proposed extraction/provider values remain owner-pending. |

## Open Questions

- **PROPOSED — pending owner:** Is the duration upper bound exactly 14 days, matching US-24?
- **PROPOSED — pending owner:** Are the US-24 enum values and Vietnamese/English phrase mappings complete, especially interest taxonomy mapping?
- **PROPOSED — pending owner:** May a future server rule resolve relative dates (`ngày mai`, `15/10`, `cuối tuần này`)? This task does not calculate them.
- **PROPOSED — pending owner:** Which OpenAI model should `OPENAI_PREFERENCE_MODEL` select? No default is hardcoded.
- **PROPOSED — pending owner:** Are the 15s timeout, one retry only for network/408/429/5xx, low/deterministic sampling and bounded output tokens acceptable?
- **PROPOSED — pending owner:** What per-user/provider rate limit and cost budget is required? No rate-limit infrastructure exists; enabling calls without one risks abuse/cost.
- **PROPOSED — pending owner:** The current implementation selects direct server `fetch`; should a future change to the official `openai` SDK be approved, including its dependency/lockfile consequences?
- **PROPOSED — pending owner:** Should raw input be redacted/hashed in operational telemetry, or omitted entirely? This task omits it and stores nothing.
- **PROPOSED — pending owner:** Is the minimal same-origin policy (`Origin` required to match; optional `Sec-Fetch-Site` limited to `same-origin`/`same-site`) the accepted CSRF boundary for this non-persisting but costly POST?
- **NOT PROVEN:** `maxDuration = 20` seconds is set for Node runtime (15s adapter timeout + buffer), but the effective limit of the target deployment platform, including Vercel, was not exercised.
- **PROPOSED — pending owner:** What exact UI/Figma frame should review/clarification use in the future FE story?
- **NOT PROVEN:** Product Document/System Specification DOCX source files and precise requirement IDs are unavailable in this workspace.

## Handoff Notes

- Future BE must call `modelOutputSchema.parse` at the provider boundary, then `verifyModelOutput` and only expose `ExtractionResult`; it must not trust model enums, clarifications or `meta`.
- Future BE must keep OpenAI calls server-side, require a configured model, enforce timeout/retry/rate-limit/privacy decisions and distinguish provider failure from user ambiguity.
- The current analyze route is `POST /api/trip-requirements/analyze`; it requires `requireTraveler`, accepts only strict `{ text: string }`, returns verified `ExtractionResult`, and must remain non-persisting. The connected client uses one in-flight request, aborts on cancel, ignores stale responses and does not auto-retry.
- US25-FE-INPUT exports `NaturalLanguageInputStatus` and calls `onAnalyze(normalizedText)` only after local contract validation. US25-FE-CONNECT supplies the API/status implementation and result panel; the existing US-24 form remains the independent deterministic path.
- `ExtractionResultPanel` is a read-only handoff surface. `applyExtractionToForm` exposes verified suggestions and conflict actions but never calls evaluate, confirm or save. US26 owns review/clarification/presentation evolution; the final save story must still call `assertStartDateForFinalConfirmation` server-side.
- The future save story must continue to call `assertStartDateForFinalConfirmation` server-side immediately before official save; model extraction never bypasses US24-START.
- `docs/ai-progress.md` contains pre-existing merge-conflict markers. This task appends only and does not resolve/rewrite them.

## 2026-10-17 — Start-date normalization bug fix

A live synthetic matrix reproduced dates recognized by AI but dropped before form fill: the provider sometimes returned `24/12/2026` as its value while the verifier required ISO; dotted dates and Vietnamese dates without the optional word `ngày` were not parsed. `explicit-trip-date.ts` now shares full-date parsing between verification and contradiction checks. A model EXTRACTED date is normalized to YYYY-MM-DD only when its complete value and one unique valid source date agree; source membership, Vietnam past-date rejection and no-overwrite form behavior remain enforced. The prompt explicitly requests ISO values and original full-date source snippets. No relative-date/year inference or promotion of AMBIGUOUS/MISSING fields was added.

Acceptance evidence: live OpenAI plus extraction-to-form helper passed all 9 synthetic cases after the fix (5 full-date formats filled; missing-year, relative, impossible and past dates stayed empty). The focused suites passed 23 files / 365 tests, including 21 new handoff cases covering formats, trailing punctuation, leap day, conflicts, mismatched/fabricated values and existing user dates. Typecheck still reports only pre-existing Cloudinary TS2307/TS7006; actual browser rendering is NOT PROVEN.

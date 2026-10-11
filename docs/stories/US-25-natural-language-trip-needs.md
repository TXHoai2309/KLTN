# US-25 — Thiết kế hợp đồng trích xuất nhu cầu chuyến đi bằng ngôn ngữ tự nhiên

## Status

DRAFT — AI-DESIGN contract, ADR and environment declaration are implemented; provider/API/UI work is explicitly not started and owner decisions remain pending.

## Epic

Trip planning / AI preference extraction.

## Owner

N/A — pending product/technical owner approval.

## Goal / User Story

Là Du khách, tôi muốn nhập nhu cầu chuyến đi bằng ngôn ngữ tự nhiên để hệ thống có thể trích xuất ứng viên rõ ràng, giữ lại điều mơ hồ và cho tôi sửa trước khi lập hành trình.

## Outcome

Một hợp đồng Zod 4 dùng chung cho server, client và test: model chỉ trả cấu trúc đóng; mỗi trường có thể là `EXTRACTED`, `AMBIGUOUS`, `MISSING` hoặc `UNSUPPORTED`; server có helper kiểm chứng giá trị theo US-24. Chưa có lời gọi OpenAI, API route, UI hay persistence.

## Source References

- `docs/product/product-spec.md` — “Trip requirements and planning”, “Deterministic Constraint Validator”, “Error and recovery semantics”.
- `docs/flow/user-flow.md` — “Trip requirement capture”, “Itinerary generation and validation”, “Auth transition”.
- `docs/decisions.md` — ADR-07 (AI tách khỏi Validator), ADR-11 (Varlock environment), ADR-14 (Vitest).
- OpenAI Structured Outputs documentation, consulted 2026-10-09: [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs). It confirms closed objects with `additionalProperties: false`, required fields, and `null` for optional values. This is provider guidance, not a product approval.
- Product Document/System Specification `.docx`: **NOT FOUND in workspace**, so detailed DOCX rules are not proven.
- Figma: N/A for this contract-only task; no UI is added.

## Dependencies

Đã có:

- `apps/web/src/modules/trip-requirement/trip-requirement-contract.ts` from US24-CONTRACT: `TripRequirementInput`, transport/enum values, limits, date validation and normalization.
- `apps/web/src/modules/trip-requirement/trip-requirement-readiness.ts` and `POST /api/trip-requirements/evaluate` from US24-START; the readiness/guard remains deterministic and server-authoritative.
- `/trips/new` and `trip-requirement-form-logic.ts` from US24-FORM/VALIDATE; no natural-language input is wired to them by this story.
- Vitest 5 + strict Node config from ADR-14; Zod 4.5.4 is already an app/root dependency.
- Shared authorization/API envelope primitives exist for future server integration.

Chưa có:

- No OpenAI SDK, OpenAI service/module, provider adapter, API route, rate-limit service, Trip/planner integration or review UI.
- `OPENAI_API_KEY` is declared as an optional server-only key, but no US25 call uses it. `OPENAI_PREFERENCE_MODEL` is newly declared and intentionally blank.

## Task Breakdown

- [x] [CONTRACT] — model/output/result schemas, status invariants, JSON Schema export and US-24 verification helper.
- [x] [ADR] — ADR-15 provider boundary, model configuration, retry/timeout and privacy proposal.
- [x] [ENV] — optional `OPENAI_PREFERENCE_MODEL` declaration, example and deployment documentation.
- [x] [TEST] — contract invariants, strict-schema shape, verification and input-limit tests.
- [ ] [BE] — future server adapter/endpoint; must establish Traveler auth, call provider server-side and map `AI_UNAVAILABLE`/provider failures.
- [ ] [FE] — future natural-language input/review UI; must show extracted values, source snippets and clarifications before planner use.

## In Scope

- Isomorphic `preference-extraction-contract.ts`.
- Strict raw model schema generated through Zod 4 `z.toJSONSchema`.
- Server-verified `extractionResultSchema`, status/value/source invariants, clarification shape and pure verification helper.
- Proposed Vietnamese extraction rules, input bounds, privacy boundary and environment declaration.
- Deterministic Vitest contract tests.

## Out of Scope

- Calling OpenAI or any other provider; no API/Route Handler, prompt, SDK, network, secret or provider retry implementation.
- UI, form wiring, review/edit behavior, planner, destination mapping, RAG, analytics, rate limiting and database/storage.
- Relative-date calculation, itinerary generation or Constraint Validator decisions.

## Business Rules

- The model proposes candidate values; US-24 verifies the canonical values and server code owns clarifications.
- `EXTRACTED` means non-null verified value plus an original source snippet; `MISSING` means both value and snippet are null; `AMBIGUOUS`/`UNSUPPORTED` mean null value plus a source snippet.
- No unmentioned field receives a default. Unknown transport is not silently mapped to motorcycle/car.
- Missing `durationDays` or `transport` means no preliminary proposal; missing `startDate` can still use relative Day 1/Day 2 labels but cannot pass final confirmation/save.
- Natural-language extraction never certifies opening hours, route time, destination eligibility or final itinerary validity; those remain deterministic/future planner concerns.

## Roles / Authorization

This task adds no endpoint and performs no authorization. The future server adapter must require a Traveler session before provider access; Guest should use the existing safe auth transition and Admin must not inherit Traveler trip capability. The future server must not trust a client-provided user/role.

## Ownership Rules

N/A: no persisted record or external write. Future trip/planner work must scope any saved data to the trusted Traveler `userId`.

## UX / UI Contract

N/A — no UI is added. A future review UI must show extracted values, ambiguity/unsupported states and source snippets before planner use; it must not treat model output as confirmed or auto-save it.

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

N/A for US25-AI-DESIGN: no API or Route Handler is added. A future adapter must accept the bounded normalized input, keep provider calls server-side, return the verified result/envelope, and use the shared API error conventions. Missing `OPENAI_PREFERENCE_MODEL` must return `AI_UNAVAILABLE`; no default model is allowed until owner approval.

## Error / Recovery

- Contract/schema failure: deterministic validation failure before any provider call.
- Invalid model JSON/schema or provider timeout/network/5xx: future server adapter may retry at most once with the same input, then return a provider/`AI_UNAVAILABLE` outcome; it must not present unverified values as success.
- Ambiguous/unsupported fields are recoverable user clarification states, not provider success or final itinerary validation.
- Relative dates stay unresolved in this task; the future UX must ask the user to choose a concrete date unless a separate approved server rule resolves them.

## Write Semantics / Idempotency

N/A: không ghi DB. This task does not write external state or call a provider. Any later write must use the shared `SUCCESS` / `FAILED` / `UNKNOWN` contract and identical retry payload/key rules.

## External Services

OpenAI is the planned external service. No call is made in this task. The future adapter should use server-side direct `fetch` under ADR-15; `OPENAI_API_KEY` and `OPENAI_PREFERENCE_MODEL` must never be exposed to the browser.

## Acceptance Criteria

- [x] Given US24 dependencies, when the repository is inspected, then the canonical contract/readiness/evaluate/form modules are present and no Trip persistence or AI module exists.
- [x] Given a raw model-shaped object, when `modelOutputSchema` parses it, then all fields are required, objects are closed, optional values use `null`, and raw values are not trapped by US-24 enums.
- [x] Given a result-shaped object, when `extractionResultSchema` parses it, then status/value/sourceText invariants and `missingRequired` cross-field consistency are enforced.
- [x] Given a raw output with an invalid US-24 value, when `verifyModelOutput` runs, then it returns `AMBIGUOUS`/`UNSUPPORTED` with no invented enum and server-generated clarification.
- [x] Given the model schema, when Zod 4 JSON Schema is generated, then the exported schema is checked for strict closed objects, complete `required` lists and only the selected Structured Outputs subset.
- [x] Given a malformed input/extra key/invalid status, when the contract tests run, then parsing fails without server/provider/network access.
- [x] Given committed environment files, when they are inspected, then `OPENAI_PREFERENCE_MODEL` is optional, blank and server-internal; no secret is added.
- [ ] Given an owner-approved provider configuration, when a future adapter is implemented, then it calls OpenAI server-side with the generated schema, timeout/retry/rate-limit/privacy behavior; this is NOT IMPLEMENTED here.

## Test Plan

- `preference-extraction-contract.vitest.test.ts`: strict JSON Schema shape, status/value/source invariants, extra/unknown status rejection, valid verification, invalid transport/range/conflict conversion and input constants/normalization.
- No DB, Neon, OpenAI, network, secret, DOM or machine clock is used.
- Future provider adapter tests must inject `fetch`, timeout and model configuration and must not call OpenAI in CI.

## Expected Modules / Files

- `apps/web/src/modules/preference-extraction/preference-extraction-contract.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-contract.vitest.test.ts`
- `docs/stories/US-25-natural-language-trip-needs.md`
- `docs/decisions.md` (ADR-15)
- `apps/web/.env.schema`
- `apps/web/.env.example`
- `apps/web/src/env.ts` (generated by Varlock)
- `docs/implementation/environment-deployment.md`
- `docs/ai-progress.md`

## Migration Impact

Không. No Prisma schema, migration, database table or persistence is added.

## Environment Impact

Adds optional internal `OPENAI_PREFERENCE_MODEL`; no secret/value is committed. `scripts/sync-vercel-env.ts` already filters against `.env.schema` and skips empty values, so no code change is required there. `OPENAI_API_KEY` remains server-only and unused by this task.

## Implementation Sequence

1. [x] Confirm US24 dependencies and current absence of provider integration.
2. [x] Define raw Structured Outputs/result schemas and pure US-24 verification.
3. [x] Record ADR-15 and proposed extraction/provider rules.
4. [x] Declare optional model environment key and align generated env types/docs.
5. [x] Add deterministic contract tests; run checks and record evidence.
6. [ ] Future BE/FE stories consume this approved contract only after owner decisions.

## Acceptance Evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| US24 dependencies verified | PASS | US24 contract, readiness, evaluate route and `/trips/new` form/logic exist in the repository; no Trip model/provider module found. |
| Isomorphic contract | PASS | `preference-extraction-contract.ts` imports Zod + US24 client-safe contract only; no `server-only`, auth, DB or SDK import. |
| Strict model schema | PASS | Zod 4 schema uses strict objects, required keys and nullable branches; `modelOutputJsonSchema` is generated via `z.toJSONSchema` and tested by `assertStrictModelJsonSchema`. |
| Server verification boundary | PASS | `verifyModelOutput` validates canonical values/ranges/cross-fields and maps invalid candidates to `AMBIGUOUS`/`UNSUPPORTED`. |
| Clarifications/meta privacy | PASS | Result schema requires server-shaped clarification records and metadata excludes raw text; no provider call or logging was added. |
| Env declaration | PASS | `.env.schema`, `.env.example` and deployment docs declare optional internal `OPENAI_PREFERENCE_MODEL` with no value; Varlock codegen was run and leaves `src/env.ts` unchanged because optional `@internal` keys are not exposed there, matching existing `OPENAI_API_KEY` behavior. |
| Automated contract tests | PASS | US25 contract suite is 6/6; direct current web Vitest suite is 82/82 across 8 files. |
| OpenAI documentation alignment | PASS | Official Structured Outputs page was accessible and recorded in Source References/ADR-15. |
| OpenAI integration/API/UI/DB scope | PASS | No SDK, call, route, UI, migration or persistence added. |
| Owner decisions and DOCX alignment | NOT PROVEN | Product/System DOCX files were not found; all proposed extraction/provider values remain owner-pending. |

## Open Questions

- **PROPOSED — pending owner:** Is the duration upper bound exactly 14 days, matching US-24?
- **PROPOSED — pending owner:** Are the US-24 enum values and Vietnamese/English phrase mappings complete, especially interest taxonomy mapping?
- **PROPOSED — pending owner:** May a future server rule resolve relative dates (`ngày mai`, `15/10`, `cuối tuần này`)? This task does not calculate them.
- **PROPOSED — pending owner:** Which OpenAI model should `OPENAI_PREFERENCE_MODEL` select? No default is hardcoded.
- **PROPOSED — pending owner:** Are 15s timeout, one retry for network/5xx/invalid schema, low/deterministic sampling and bounded output tokens acceptable?
- **PROPOSED — pending owner:** What per-user/provider rate limit and cost budget is required? No rate-limit infrastructure exists; enabling calls without one risks abuse/cost.
- **PROPOSED — pending owner:** Should direct server `fetch` remain the provider boundary, or should the project approve the official `openai` SDK and its dependency/lockfile consequences?
- **PROPOSED — pending owner:** Should raw input be redacted/hashed in operational telemetry, or omitted entirely? This task omits it and stores nothing.
- **PROPOSED — pending owner:** What exact UI/Figma frame should review/clarification use in the future FE story?
- **NOT PROVEN:** Product Document/System Specification DOCX source files and precise requirement IDs are unavailable in this workspace.

## Handoff Notes

- Future BE must call `modelOutputSchema.parse` at the provider boundary, then `verifyModelOutput` and only expose `ExtractionResult`; it must not trust model enums, clarifications or `meta`.
- Future BE must keep OpenAI calls server-side, require a configured model, enforce timeout/retry/rate-limit/privacy decisions and distinguish provider failure from user ambiguity.
- Future FE must show source snippets for `AMBIGUOUS`/`UNSUPPORTED`, allow correction, and send the reviewed canonical `TripRequirementInput` to the existing US24 evaluation flow. It must not auto-confirm/save or map interests to destinations in this story.
- The future save story must continue to call `assertStartDateForFinalConfirmation` server-side immediately before official save; model extraction never bypasses US24-START.
- `docs/ai-progress.md` contains pre-existing merge-conflict markers. This task appends only and does not resolve/rewrite them.

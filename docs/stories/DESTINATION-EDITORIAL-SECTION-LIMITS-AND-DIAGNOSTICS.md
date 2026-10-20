# DESTINATION EDITORIAL — section capacity and diagnostics

## Status

COMPLETE — owner decisions recorded on 2026-10-20; Tasks 1–6 implemented and verified.

## Epic

Destination Editorial V4 / Layout DSL v2

## Owner

Product owner

## Goal / User Story

As an Admin creating or editing a Destination Editorial, I want longer source content to produce a valid, readable layout and failures to identify the failing stage, so that I can recover without mistaking a layout-generation failure for an expired Admin session.

## Outcome

Layout DSL v2 accepts up to 50 root sections while retaining the 50-node whole-tree ceiling. AI aims for 12–20 root nodes. The deterministic initial layout preserves all canonical description text while coalescing adjacent paragraph content only when needed to fit the whole-tree ceiling. Oversized AI proposals are rejected without replacing the current layout. The editor distinguishes data-loading errors from initial-layout-generation errors, while safe diagnostics are written to the browser console and API/server logs without sending client telemetry.

## Source References

- Owner-approved decisions from the 2026-10-20 grilling session in this task.
- [Destination E-Magazine V4](DESTINATION-EMAGAZINE-V4.md) — single AI proposal flow, Layout DSL v2, preservation, locks, Save/Publish, and invalid-output behavior.
- [Editorial AI empty-content fix](DESTINATION-EDITORIAL-AI-EMPTY-CONTENT-FIX.md) — canonical content and safe projection invariants.
- [Destination generative layout V4 architecture](../architecture/destination-generative-layout-v4.md) — current DSL bounds, canonical AST, provenance and quality gate.
- [Technical architecture](../architecture/technical-architecture.md) — Admin API, shared API error and mutation contracts.

## Dependencies

- Existing Destination Editorial V2 schema, canonical content AST, proposal repair/validation, Admin editor and API error handling.
- No database migration, external service, new environment variable or new dependency.

## In Scope

- Raise the maximum root `sections` array size from 25 to 50 consistently across every Layout DSL v2 path: provider JSON schema, runtime contract, AI proposal validation/repair, SAVE and PUBLISH validation.
- Keep the maximum number of nodes across the entire V2 tree at 50, inclusive of root and nested nodes. Keep the existing maximum nesting depth and other DSL bounds unchanged.
- Define section counts as root nodes in `layout.sections`; count every root node, including Hero, Intro, Map, Sources and other utility nodes.
- Change the AI layout target from 7–12 to 12–20 root nodes, using the same inclusive root-node counting rule.
- When deterministic initial/fallback layout construction would exceed the 50-node whole-tree limit, coalesce adjacent paragraph content as needed while preserving all canonical text, its order, and source/content references. Do not merge across intervening non-paragraph content.
- Reject an AI proposal that exceeds 50 total nodes with a specific, safe diagnostic and user-facing error. Do not merge or partially apply the proposal; retain the exact current layout.
- Add safe structured client diagnostics and API/server diagnostics for relevant Editorial failures. Keep client logs in the browser console; do not transmit client logs or add telemetry.
- Distinguish failure to fetch/parse Editorial data from failure to construct the initial layout in the Admin editor. Keep the existing visual system and recovery affordance; do not show an Admin-session error for a local layout-generation error.
- Include failure stage, safe error category/schema path, and expected/actual section or node counts when available.

## Out of Scope

- Any change to V1 layouts, V1 rendering, stored V1 data or migration/backfill.
- Any database/schema change, new endpoint, API response-envelope change, authorization change or new persistence behavior.
- Changing the 50-node whole-tree cap, nesting-depth limit, grid/media/content limits, quality-gate policy, editorial visibility rules, or publication permissions.
- Merging, truncating, dropping or rewriting AI-proposed nodes to make an oversized proposal fit.
- Changing provider/model, token/time limits, concurrency, rate limits or AI request semantics beyond the stated target and schema bound.
- Redesigning the Editorial editor or changing public Editorial rendering.
- Sending browser diagnostics to the server, adding third-party telemetry, or logging destination content, session data or credentials.

## Business Rules

- AI remains a layout proposer; it cannot invent or alter canonical facts. Existing provenance, content-preservation and quality gates remain authoritative.
- The target of 12–20 is an AI composition target, not permission to invent content or a hard minimum when the canonical source cannot support that many meaningful root nodes. The 50 section and 50 total-node values are hard maxima.
- Root section count includes every root node, including functional/utility nodes.
- The whole-tree node count includes every root and descendant node. A layout must satisfy both `sections.length <= 50` and `totalNodeCount <= 50`.
- The initial/fallback layout may coalesce only adjacent paragraph content when necessary to fit the total-node limit. Preserve canonical text exactly and in source order, and preserve its provenance/content references through the representation supported by the V2 contract.
- An AI proposal over the whole-tree limit is invalid. The user-visible proposal failure must leave the prior layout, unsaved edits and locks unchanged.
- SAVE and PUBLISH continue to validate the complete V2 layout against the same section and whole-tree limits. Invalid input must not persist or publish.
- No partial layout is treated as a successful generation, save or publish.

## Roles / Authorization

Admin-only access remains unchanged. Existing persisted-role checks and route authorization remain in place. This story adds no capability or access path.

## Ownership Rules

Destination Editorial ownership and destination-scoped content/media/source validation remain unchanged. Diagnostics must not expose the destination description, source text, media payloads, session/token, request headers or raw provider response. Do not add destination or actor identifiers to diagnostics where the existing safe diagnostic contract omits them.

## UX / UI Contract

- Keep the current Editorial editor layout, styling and existing retry affordance.
- A failed Editorial GET or invalid/missing response is shown as a data-loading/response error, with a retry that repeats the data request.
- A successful data load followed by failure in `autoLayoutV2` is shown as an initial-layout creation error, not as an Admin-session/authentication failure. Where the failure is a known section/node-limit error, explain that the content could not be arranged within the supported layout limit.
- An oversized AI proposal reports that the proposal exceeds the layout limit and that the existing layout was kept.
- Keep Save/Publish validation errors distinct from fetch and generation errors and do not clear the current editor state.
- Error feedback uses the existing design system and accessible error announcement behavior (for example, the existing alert/live-region pattern). No new page or dialog is required.

## Data Contract

No persisted data contract changes. Layout DSL v2 keeps its current shape and design tokens; only the maximum root section count changes. V1 and existing JSONB records remain readable without migration.

## API Contract

- Existing `GET /api/admin/destinations/[id]/editorial` and `POST /api/admin/destinations/[id]/editorial/propose` routes and response envelopes remain unchanged.
- Server-side V2 proposal, Save and Publish boundaries use the 50-root-section and 50-whole-tree-node maxima.
- Existing API error codes and operation/write semantics remain unchanged except where an existing safe error detail is needed to identify a limit failure. Do not add a new endpoint or return internal exceptions.
- API/server diagnostics use structured, safe fields with a correlation ID where the existing diagnostics provide one. Do not log request/response bodies, destination content, session/token, headers or raw exceptions.

## Error / Recovery

- **Data load/response failure:** show the load-specific error and retain a retry that repeats the GET. Do not classify client-side fallback-layout parsing as an authentication failure.
- **Initial/fallback layout failure:** show a generation-specific error; keep the loaded context and offer the existing retry/reload path. Do not claim the data failed to load.
- **AI proposal over 50 nodes:** return/show a specific limit failure; preserve the exact previous layout and all locks; do not auto-merge the proposal.
- **SAVE/PUBLISH over either limit:** reject through the existing validation path; do not write/publish and keep the current editable state.
- **Diagnostics failure:** never make logging success a prerequisite for displaying the user-facing error or preserving editor state.

## Write Semantics / Idempotency

No change. Existing Save/Publish idempotency keys, request hashes and `SUCCESS` / `FAILED` / `UNKNOWN` behavior remain intact. An invalid layout is a known validation failure and must not be persisted as success. This story adds no write operation.

## Logging Contract

- Client: emit a structured `console.error` diagnostic only for a failed Editorial operation. Include operation/stage, safe error category, safe schema path, and bounded expected/actual counts when available. Keep GET/DTO parsing and initial layout construction as distinct stages. No network forwarding or telemetry.
- Server: use the existing API/server logging boundary and Editorial diagnostic conventions for API failures. Include stage/phase, safe error category/schema path, correlation ID where available, and bounded expected/actual counts when available.
- Never log destination description or other Editorial prose, source text, session/token, authorization headers, cookies, raw provider response/body, or raw exception message. Do not log successful operations as errors.
- Diagnostics are supplementary: user-facing error mapping and editor state preservation must work if logging is unavailable.

## Acceptance Criteria

- [x] **AC-01:** Given a valid V2 layout with exactly 50 root nodes and no more than 50 total nodes, when it is parsed by the runtime contract, then it is accepted.
- [x] **AC-02:** Given a V2 layout with 51 root nodes, when it is validated through provider/schema, proposal, repair, Save or Publish paths, then it is rejected with a section-limit diagnostic and no write/publication occurs.
- [x] **AC-03:** Given a V2 layout with no more than 50 root nodes but 51 total nodes, when it is validated through every applicable V2 path, then it is rejected with a whole-tree node-limit diagnostic and no write/publication occurs.
- [x] **AC-04:** Given a deterministic initial/fallback layout whose raw paragraph nodes would exceed 50 total nodes, when it is constructed, then adjacent paragraph content is coalesced only as needed until the layout fits, with every canonical text unit preserved exactly, in order, and with provenance/content references preserved.
- [x] **AC-05:** Given an initial/fallback input that still cannot fit within 50 nodes after eligible adjacent paragraph coalescing, when construction completes, then it returns a clear bounded failure and does not return a partial layout.
- [x] **AC-06:** Given an AI proposal targeting 12–20 root nodes, when the provider output is valid and within both hard limits, then the existing proposal validation and quality gates determine whether it may be applied; the target does not bypass those gates.
- [x] **AC-07:** Given an AI proposal whose total node count exceeds 50, when it is validated/repaired, then it is rejected with a clear limit error, no proposal merging occurs, and the current layout, unsaved edits and locks remain unchanged.
- [x] **AC-08:** Given a source that cannot support 12 meaningful root nodes, when AI generates a layout, then it may return fewer nodes without inventing content, provided all existing quality and validity rules pass.
- [x] **AC-09:** Given Editorial data loading or response parsing fails, when the editor displays the failure, then it identifies a data-load/response problem and retry repeats the GET.
- [x] **AC-10:** Given Editorial data loads successfully but deterministic initial layout construction fails, when the editor displays the failure, then it identifies a layout-generation problem rather than an Admin-session/authentication problem.
- [x] **AC-11:** Given a client or API failure, when diagnostics are recorded, then they identify the relevant stage and safe error details/counts without destination prose, source text, session/token, request headers or raw provider payload.
- [x] **AC-12:** Given a client-side failure, when the diagnostic is emitted, then it remains in the browser console and is not transmitted to the server.
- [x] **AC-13:** Given a V1 Editorial or existing published V1 layout, when it is loaded/rendered, then its prior behavior is unchanged.
- [x] **AC-14:** Given any failed proposal, Save or Publish validation, when the result is shown, then the exact existing editable layout and its locks are retained.

## Implementation Task Breakdown

The tasks are ordered by dependency. Tasks 2 and 3 are independent vertical slices after Task 1 and may be implemented in either order. Each task has its own acceptance criteria and focused verification; Task 6 is the final cross-slice regression pass.

### Task 1 — Unify V2 section and node bounds — COMPLETE

- **Objective:** Establish one consistent hard-bound contract for every Layout DSL v2 acceptance boundary.
- **Related acceptance criteria:** AC-01, AC-02, AC-03, AC-13.
- **Expected files/modules:** `editorial-contract.ts`; provider schema in `editorial-ai.ts`; V2 validation/repair entry points in `editorial-proposal-repair.ts`; Save/Publish service or route boundary that consumes the shared contract; `docs/architecture/destination-generative-layout-v4.md`; adjacent contract/schema tests.
- **Changes:** Replace every V2 root-section cap of 25 with 50; retain whole-tree maximum 50; count all root utility nodes; ensure provider JSON Schema, runtime parsing, proposal/repair, Save and Publish share the same limits and produce distinct section-limit versus total-node-limit failures. Reject a raw AI tree over 50 nodes before repair can compact or otherwise alter it. Update the architecture bound to match. Leave depth and all other constraints unchanged.
- **Tests to add/run:** Contract boundary tests for root 50/51 and total nodes 50/51; provider-schema assertion for `maxItems: 50`; Save/Publish rejection tests proving no write/publication on either overflow; V1 regression test.
- **Verification:** Search every V2 path for stale 25-section limits; inspect root counting and recursive node counting; run focused contract, provider-schema and Save/Publish suites; confirm V1 behavior is unchanged.
- **Dependencies:** None; first task. Tasks 2–6 depend on its shared limits or tested validation boundary.

### Task 2 — Align AI target and reject oversized proposals — COMPLETE

- **Objective:** Make the AI target 12–20 root nodes and ensure an oversized AI proposal fails atomically without changing the current editor state.
- **Related acceptance criteria:** AC-06, AC-07, AC-08, AC-14.
- **Expected files/modules:** Prompt/schema/AI proposal handling in `editorial-ai.ts`; proposal repair/validation in `editorial-proposal-repair.ts`; proposal result/error mapping in `editorial-proposal-result.ts` and `editorial-ai-diagnostics.ts` as required; proposal and editor-state tests.
- **Changes:** Update target wording to count every root node, including utility nodes; enforce the Task 1 hard limits through repair; return a clear safe error for a proposal over 50 total nodes; do not merge or partially apply it; retain current layout, unsaved edits and locks. Treat 12–20 as a target, not a minimum that permits invented content.
- **Tests to add/run:** Valid in-bound proposal test; sparse-source test allowing fewer than 12 nodes without invented content; 51-node proposal rejection test; assert exact preservation of layout, edits and locks and absence of proposal coalescing.
- **Verification:** Inspect all prompt variants and proposal/repair return branches for a single 12–20 target and consistent limits; run focused generative, proposal-repair and editor-state suites.
- **Dependencies:** Depends on Task 1. Task 4 consumes its safe error category/count diagnostics; Task 6 covers end-to-end rejection.

### Task 3 — Preserve fallback content under the node ceiling — COMPLETE

- **Objective:** Keep deterministic initial/fallback layouts within 50 total nodes for long descriptions without losing canonical text or provenance.
- **Related acceptance criteria:** AC-04, AC-05, AC-10, AC-14.
- **Expected files/modules:** `editorial-engine.ts`; canonical paragraph/content-reference helpers in `editorial-content.ts`, `editorial-content-units.ts` or `editorial-ast.ts` only if needed; generative, verification and editor tests.
- **Changes:** When the generated initial/fallback tree would exceed 50 total nodes, coalesce adjacent paragraph content only as far as needed. Preserve every canonical text unit exactly, in source order, and preserve its content/provenance references. Do not merge across non-paragraph nodes. If eligible coalescing cannot produce a valid bounded layout, return a clear bounded error, never a partial layout.
- **Tests to add/run:** Over-limit fallback fixture; assert exact text, source order, canonical coverage and provenance/reference preservation after coalescing; assert non-adjacent paragraphs are not merged across other nodes; assert no partial result when the limit remains impossible; normal-sized fallback regression.
- **Verification:** Count the complete resulting tree recursively and confirm it is at most 50; compare canonical input units to output references/text; run focused fallback, AST/provenance and generative suites.
- **Dependencies:** Depends on Task 1. Task 4 uses its bounded error/count outcomes; Task 5 maps its client-visible generation error; Task 6 covers the full editor flow.

### Task 4 — Add safe API/server failure diagnostics — COMPLETE

- **Objective:** Make relevant Editorial API failures diagnosable in server logs without exposing content or credentials.
- **Related acceptance criteria:** AC-02, AC-03, AC-07, AC-11.
- **Expected files/modules:** `editorial-ai-diagnostics.ts`, `editorial-server.ts`, `editorial-http.ts`, and the existing Editorial GET/propose/Save/Publish route handlers only where needed to pass safe stage/error/count metadata; diagnostics/API tests.
- **Changes:** Use the existing logging and correlation conventions. Log structured stage/phase, safe error category/schema path, correlation ID when available, and bounded expected/actual section or node counts when available. Preserve existing response envelopes and write semantics. Never log request/response bodies, Editorial prose, source text, session/token, headers, raw provider payload or raw exceptions.
- **Tests to add/run:** Server-log shape tests for relevant GET/propose/Save/Publish failure classes and limit failures; sensitive-field exclusion assertions; API envelope and existing error-status regression tests.
- **Verification:** Capture representative failure logs and inspect fields; prove sensitive values are absent and logs do not contain full payloads; verify correlation IDs can connect client-visible safe errors with server events where supported.
- **Dependencies:** Depends on Tasks 1, 2 and 3 so diagnostics can describe the final limit and failure categories. Task 5 consumes the stable API error mapping; Task 6 verifies the joined flow.

### Task 5 — Separate editor error states and add client diagnostics — COMPLETE

- **Objective:** Show whether the editor failed while loading data or constructing the initial layout, and record safe client-only diagnostics.
- **Related acceptance criteria:** AC-09, AC-10, AC-11, AC-12.
- **Expected files/modules:** `editorial-editor.tsx`, `editorial-editor.css` only if existing error styling needs adjustment, and focused editor/UI tests.
- **Changes:** Keep GET/DTO response parsing and `autoLayoutV2` in distinct error stages; map failures to distinct user-facing errors and retry behavior; never display an Admin-session error for local initial-layout failure. Emit structured `console.error` diagnostics for failures with safe category/stage/path/counts; do not transmit logs or add telemetry; retain current layout/state on proposal failure and accessible existing error presentation.
- **Tests to add/run:** GET failure and malformed-response state tests; successful GET plus fallback-generation failure test; retry-target tests; safe console output assertions; assert no telemetry/network request is made for client logs; assert existing editor state is retained on proposal rejection.
- **Verification:** Exercise data-load, malformed-response and layout-generation failures separately; inspect browser console fields for redaction; confirm retry repeats the correct operation and no new network logging request occurs; verify the current design system/error announcement remains in use.
- **Dependencies:** Depends on Tasks 3 and 4 for fallback failure semantics and API error mapping. Task 6 is the final integrated regression pass.

### Task 6 — Run integrated acceptance and regression verification — COMPLETE

- **Objective:** Verify the completed slices together against the complete story without adding scope.
- **Related acceptance criteria:** AC-01–AC-14.
- **Expected files/modules:** Existing Editorial V2 contract, generative, proposal-repair, verification, Save/Publish and Admin editor test suites; no production code change is planned by this verification task.
- **Changes:** Add only missing cross-slice regression coverage where unit-level suites do not prove the end-to-end contract. Do not alter the approved limits or behavior while resolving unrelated failures.
- **Tests to add/run:** Focused Editorial suites; web typecheck and available lint/build checks; relevant full web test suite as appropriate. Include both valid/invalid V2 bounds, V1 regression, fallback preservation, oversized proposal state preservation, client/server diagnostics and retry behavior.
- **Verification:** Smoke the Admin editor at mobile and desktop widths for normal content, data-load failure and initial-layout failure; inspect server/client diagnostics for redaction and verify no telemetry request; confirm Save/Publish reject invalid layouts without mutation; run `git diff --check`; review the full diff for unrelated changes/secrets; report skipped or failing checks explicitly.
- **Dependencies:** Depends on Tasks 1–5. Completion is the final verification gate for this story.

## Test Plan

- Contract tests: 50 root accepted; 51 root rejected; total-node boundary 50 accepted/51 rejected; root count includes utility nodes; existing depth/other DSL boundaries unchanged.
- Provider schema tests: generated JSON Schema allows at most 50 root sections and retains all existing constraints.
- Proposal/repair tests: all repair paths use the same hard bound; oversized proposal returns a specific safe error and leaves current layout/locks unchanged; no proposal merge is performed.
- Deterministic layout tests: large canonical descriptions trigger only adjacent-paragraph coalescing; assert exact concatenated text, order, coverage and provenance/content references; assert no partial output if the limit remains impossible.
- Save/Publish tests: V2 inputs over either bound are rejected before persistence/publication; valid in-bound V2 and all V1 flows retain current behavior and write semantics.
- Client/editor tests: GET/DTO parse errors and initial-layout errors map to distinct states/messages; retry targets the correct stage; client errors log safe structured fields to console and never call a telemetry/network endpoint.
- API/server diagnostic tests: failure diagnostics contain stage, category/path, correlation ID and bounded counts where available; assert sensitive content, session/token, headers and raw provider payload are absent.
- Regression suites: relevant Editorial V2 contract, generative, proposal-repair, verification, Save/Publish and Admin editor suites; full web suite as appropriate to the implementation branch.

## Expected Modules / Files

- `apps/web/src/modules/destination-editorial/editorial-contract.ts` — runtime V2 root section bound and whole-tree checks.
- `docs/architecture/destination-generative-layout-v4.md` — keep documented root-section bound aligned with the approved V2 limit.
- `apps/web/src/modules/destination-editorial/editorial-ai.ts` — provider JSON Schema bound, target wording and AI proposal boundary.
- `apps/web/src/modules/destination-editorial/editorial-proposal-repair.ts` — consistent 50-section checks; oversized tree rejection without merging AI proposals.
- `apps/web/src/modules/destination-editorial/editorial-engine.ts` — deterministic initial/fallback paragraph coalescing with canonical preservation.
- `apps/web/src/modules/destination-editorial/editorial-ai-diagnostics.ts` and `editorial-server.ts` — safe structured API/server diagnostics, using existing logging conventions.
- `apps/web/src/modules/destination-editorial/editorial-http.ts` and/or the relevant Admin Editorial route handlers — preserve API envelope while exposing safe, specific error categories.
- `apps/web/src/app/admin/destinations/editorial-editor.tsx` and `editorial-editor.css` — distinguish data loading from initial layout generation failure within the existing visual system.
- Existing Editorial V2 test files adjacent to the modules above; add/extend focused tests for newly specified boundaries and diagnostics.
- This story document; update implementation evidence only when implementation occurs.

These are expected ownership areas, not a requirement to touch every listed file. Keep Route Handlers thin and place domain rules in Editorial modules.

## Migration Impact

None. No Prisma/database schema or stored JSON migration.

## Environment Impact

None. No new secrets, environment variables, provider configuration or telemetry service.

## Implementation Sequence

1. Task 1 — Unify V2 section and node bounds.
2. Tasks 2 and 3 — Implement AI proposal handling and deterministic fallback handling; these depend on Task 1 and are independent of each other.
3. Task 4 — Add safe API/server diagnostics after Tasks 1–3 establish the relevant failure outcomes.
4. Task 5 — Add client diagnostics and distinct editor errors after Tasks 3–4 establish the failure semantics.
5. Task 6 — Run integrated acceptance and regression verification after Tasks 1–5.

## Verification Plan

- Review every V2 path (provider schema, runtime contract, proposal repair, initial/fallback generation, editor state, Save and Publish) and confirm no stale 25-section cap remains.
- Confirm all counts use root `layout.sections` for sections and recursive full-tree traversal for node count; verify utility root nodes are included.
- Confirm no AI-proposal merge/rewrite path was introduced and fallback coalescing preserves exact canonical text/order/references.
- Confirm load and generation failures produce distinct user-visible errors and retry the appropriate operation.
- Inspect captured client/server diagnostics and prove no Editorial prose, source text, session/token, headers, raw exception or provider payload is present; verify there is no client telemetry request.
- Run focused Editorial tests, relevant web typecheck and lint/build commands available in the repository; report any skipped/failing command and the reason. Run `git diff --check` and inspect the final diff for unrelated changes/secrets.
- Smoke the Admin editor at desktop and mobile widths with a normal layout, an initial-layout-limit error and an API/data-load error; confirm existing editor state remains intact after rejected proposals/save/publish.
- Verify no migration, environment or API envelope change was introduced.

## Acceptance Evidence

All 14 acceptance criteria are covered by the completed implementation and verification:

- **AC-01–03:** Runtime contract, provider schema, proposal/repair, and Save/Publish suites exercise exact 50/51 root and whole-tree boundaries, including utility roots and safe limit diagnostics. Failed writes are rejected before persistence/publication.
- **AC-04–05:** `editorial-fallback-limits.vitest.test.ts` verifies exact canonical text coverage/order, provenance and `contentRef` preservation during only-adjacent paragraph coalescing; heading-heavy input returns a bounded `NODE_LIMIT` error with no partial layout.
- **AC-06–08:** Proposal integration checks the 12–20 root-node target while preserving existing quality gates; sparse input is accepted below 12 without invented content. Oversized AI trees are rejected before repair/application and leave prior layout/locks untouched.
- **AC-09–10:** `test-editorial-client-errors.mjs` exercised HTTP 401 and malformed DTO as data failures, and a valid response with an impossible 55-heading fallback as a generation failure, at 1440px and 390px. Keyboard retry repeated GET for data errors and reran only the local builder for layout failure. Both kept the existing `AdminAlert` role and had no horizontal overflow.
- **AC-11–12:** API/client diagnostic tests and the offline browser harness checked stages, allowlisted schema paths, bounded counts, and redaction. Browser requests remained on localhost and no telemetry request occurred.
- **AC-13–14:** Existing V1/editorial render and proposal state-preservation suites passed alongside the new V2 cases; no V1 schema/rendering or write semantics changed.

**Final verification:** `npx vitest run --config vitest.config.mts src/modules/destination-editorial` — 335 passed, 6 PostgreSQL integration tests skipped (database not configured), 24 test files; `npm run check-types --workspace web` — pass; `node scripts/test-editorial-client-errors.mjs` — pass; `npm run build --workspace web` — pass with ephemeral local placeholders for the repository-required auth/QA/Vercel metadata environment fields; `git diff --check` — pass (Git reports existing LF-to-CRLF conversion warnings only). No lint script is configured. No migration, persistent environment change, API envelope change, telemetry, commit, push or deployment.

## Open Questions

- None within the decisions recorded in this story.

## Handoff Notes

- Implement only after starting the story against this contract.
- The 12–20 value is an AI target, not a hard minimum; the approved hard limits are 50 root sections and 50 total nodes.
- No push, merge, deployment, production data operation, database migration or telemetry work is authorized by this story.

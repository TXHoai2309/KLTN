# TripSage feature groups

## P1 (2026-11-20)

- The authenticated chat HTTP boundary reads the three optional flags once per request. The same set controls tool registration and the system allow-list. With all three off, the prompt matches the baseline byte for byte and the fake model receives the original five tools.
- Flight and hotel limits count adapter lookups per turn. Hotel quota is checked and consumed after resolving a usable destination on the server. Missing providers return `PROVIDER_UNAVAILABLE` before destination reads. A failed read and a missing destination have separate results.
- Dates use KLTN calendar validation and the Vietnam day boundary. Budget arithmetic uses whole đồng or cents throughout. Shares round down to whole percentages and estimates without a stated cap return `withinCap: null`.
- The [ADR-36 amendment](../decisions.md#owner-approved-feature-groups-2026-11-20) records the approved five-group scope. P1 configures budget, flights and hotels. Provider integration is P2 and UI is P3. Long-term memory and ICS are pending.

### Red–green evidence

| Seam | Before the fix | After the fix |
|---|---|---|
| HTTP request to fake model | 9 passed, 2 failed. Enabled tools were absent. | 11 passed, including all eight flag combinations, the unchanged baseline prompt and group-local unavailability. |
| Lookup quota and unavailable states | 1 passed, 3 failed. Three concurrent hotel calls reached the adapter and provider/read failures looked like missing IDs. | 4 passed. Two hotel and flight adapter calls at most, with distinct failure results. |
| Date handling | 11 passed, 1 failed. A month of 13 threw a `RangeError`. | 12 passed with the quota cases, including invalid dates, leap day, Vietnam midnight and the 1–14 night bounds. |
| Budget | 2 passed, 5 failed. Excess precision was accepted and rounded shares summed to 100.1%. | 7 passed. Invalid amounts or caps return `INVALID_BUDGET` and shares total at most 100%. |

### Verification

- Scoped Vitest across `src/modules/tripsage-chat` and `src/components/tripsage-chat` passed 201 tests in 21 files, including 22 new cases. The original all-off allow-list assertions are retained.
- `varlock codegen` generated the ignored `apps/web/src/env.ts`. It reported three existing, undeclared environment variable names and printed no values.
- Provider and model checks use fakes. Full-repository tests, production build, browser acceptance and database checks are outside P1 verification.

## P2 (2026-11-20)

- Flight lookup uses Duffel v2. Hotel lookup uses Amadeus Hotel List v1 and Hotel Search v3. The tools have independent flags and credentials. Each resolver runs on the first invocation of its tool in a turn. Lookup has no booking, payment or search-result persistence.
- Duffel uses one offer-request POST. The documented `data` envelope and `return_offers` query parameter supersede the reference client's flat POST body. Prices retain the provider currency, and the five cheapest offers are ranked numerically within one currency. Connections are counted separately for each direction. [Duffel v2 Offer Requests](https://duffel.com/docs/api/offer-requests)
- Amadeus checks at most 20 nearby hotels and returns at most five offers. It prioritizes known distances or geographic proximity for selection. Missing distance units yield `distanceKm: null`. Missing `data` is an invalid response. HTTP 400 with business code `424` at the pricing endpoint represents no match. Each lookup allows at most two GETs and one OAuth POST within a single eight-second deadline. A rejected token is evicted for the next lookup. [Hotel List v1](https://raw.githubusercontent.com/amadeus4dev/amadeus-open-api-specification/main/spec/json/HotelList_v1_swagger_specification.json) · [Hotel Search v3](https://raw.githubusercontent.com/amadeus4dev/amadeus-open-api-specification/main/spec/json/HotelSearch_v3_swagger_specification.json)
- Tests use fake fetch and fake models. They verify bounded responses, cache behavior, group isolation, tool-output redaction and rejection of flight/hotel identifiers as itinerary stops. Real credentials, Vietnam coverage, prices and quotas remain unverified. UI, long-term memory and ICS remain subsequent work.

### Verification

- Before wiring, the Duffel test suite had no adapter to import, 9 Amadeus tests failed against the draft and all 5 new HTTP boundary cases failed. Both additional regressions for exact decimal ordering and incomplete sold-out rows also failed before their fixes.
- Final scoped Vitest passed 236 tests in 23 files, including 35 new cases. TypeScript and Git whitespace checks passed. The source scan found zero `DUFFEL_` or `AMADEUS_` occurrences in components or the 126 files with a `use client` directive.
- Varlock regenerated the ignored local types from the updated templates. Live API calls, database and browser checks were outside P2 verification.

## P3 (2026-11-20)

- Planning chat displays separate Vietnamese cards for budget, Duffel flights and Amadeus hotels, using the existing Assistant colors and spacing. The latest valid budget replaces the previous estimate. Flight and hotel results keep their stream order. Prices retain their currency and flight times retain the local airport clock.
- The service writes strict display parts only after a successful tool call. Empty flight and hotel lookups emit no card. The projection omits provider IDs, coordinates and credentials. Browser tool outputs still contain only the `ok` flag. Invalid card parts are skipped.
- The three cards were checked in the integrated browser using an offline fixture at 1280px and 360px. Document and card widths showed no horizontal overflow. Tab reached the transcript, and its accessibility tree exposed the card headings and lists. The fixture was removed before commit. The screenshots use fake data.
- TypeScript passed. Scoped Vitest passed 248 tests in 25 files, including 12 new cases covering display schemas, result projection, redaction, invalid parts and card markup. Client source and import checks passed. No live provider, production build, database or full-repository verification was run for P3.

## P4 (2026-11-21)

- `TRIPSAGE_FEATURE_MEMORY` powers the two memory tools and the signed-in Traveler's list and deletion UI. The model calls recall only when needed. It receives up to five relevant items as marked, untrusted data. Memory tool inputs and raw results stay out of the browser stream.
- The server accepts complete clauses from the latest user message for explicit memory requests or clear travel preferences and constraints. It rejects sensitive content before calling the embedding provider. Examples include passwords and credentials, phone and email, card/account numbers, ID documents, home addresses, health, religion and politics. The rules are heuristic and can reject some benign inputs.
- Exact cosine lookup uses the same OpenAI `text-embedding-3-small` 1536-dimensional vectors as [RAG](../../apps/web/src/modules/rag-processing/embedding-contract.ts). The initial similarity cutoff is 0.50 to avoid including weak matches. An owner-scoped exact scan covers at most 100 items and follows the existing RAG pattern without an approximate vector index.
- All reads and deletes are owner-scoped. Per-user database locking serializes memory mutations and protects the 100-item cap. A hash of normalized text deduplicates per user. The shared idempotency ledger records memory IDs or counts, and a save checks that the row exists after the commit before reporting success.
- Migration `20261121120000_traveler_memory` adds the memory table, type and owner indexes with cascade on account deletion. It relies on the existing pgvector extension and awaits operator deployment.

### Verification

- The initial service and API tests failed before the missing modules were implemented. The three chat integration tests failed before the flagged registry was wired. The added tests for preserving negation and recognizing address/birth-date patterns failed before those checks were added.
- Web typecheck passed. Scoped Vitest passed 295 tests in 29 files, including 47 new cases. The separate PostgreSQL test was skipped. A source scan found no embedding credential patterns in 127 client entry files or the TripSage UI and shared memory contract.
- Prisma validation and generation ran against a temporary config with an offline dummy URL. The generated client is ignored. PostgreSQL integration is opt-in and was skipped. No migration or live embedding call ran.
- The browser fixture timed out before the 360px check could be completed. The fixture was removed before commit.

### Deployment and opt-in test

From the repository root on PowerShell, with the intended Development database configured through the normal `packages/db` environment, run:

```powershell
Push-Location packages/db
npx.cmd prisma migrate deploy
npx.cmd prisma generate
Pop-Location
```

For integration verification, prepare a disposable loopback database with the repository migrations applied and the generated client above. Point these variables to that database only:

```powershell
$env:TRAVELER_MEMORY_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/DISPOSABLE_DB?sslmode=disable'
$env:TRAVELER_MEMORY_TEST_DISPOSABLE = 'OWNED_LOOPBACK_CONTAINER'
Push-Location apps/web
npx.cmd vitest run --config vitest.config.mts src/modules/tripsage-memory/traveler-memory.postgres.integration.vitest.test.ts
Pop-Location
```

## P5 (2026-11-21)

- `TRIPSAGE_FEATURE_CALENDAR` defaults to `false` and enables the saved-trip download link and GET route only for the exact value `true`. The chat prompt and model tool list stay the same.
- The route uses `getMyTrip` for authentication and the saved Trip view. The owner and active companion members get their existing views. Missing trips and out-of-scope trips have the same 404 response.
- Each timed stop yields one iCalendar event with a deterministic UID, UTC timestamps derived from Vietnam-local time, display name, public location, and applicable unchecked notices. The file excludes the trip origin and coordinates. `X-ICS-Skipped-Stops` counts omitted stops. If every stop lacks a usable time, the route returns 422 with the count so it never attaches an eventless iCalendar object.
- The download uses a fixed ASCII slug and the trip start date. It runs locally with no OAuth, external calendar API, dependencies, database writes or schema changes. [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html)

### Verification

- The first generator and route tests failed before the modules existed. The subsequent run reproduced the missing enabled UI link and public location fallback. The tests cover midnight and New Year rollover, UTF-8 folding, line injection, private fields, the unauthorized 404 response and a companion's limited view.
- On Node 24.22.1, the web typecheck passed. Scoped Vitest passed 1,279 tests in 117 files, with 80 PostgreSQL opt-in tests skipped in 18 files. `git diff --check` passed.
- The in-app browser showed the actual rendered trip view with fixture data at 1280px and 360px without horizontal overflow. At 360px Tab reached the download link. The temporary fixture was removed. Importing into an external calendar app was left for live acceptance.

## P6 (2026-11-21)

- Scope is `09f5f19..` on `feat/tripsage-chat-itinerary-port`. ADR-36 remains Proposed. The memory panel discloses that content to remember is sent to OpenAI to create an embedding and that the saved content can be deleted at any time. The disclosure assertion failed before the copy change.
- The production Next.js Varlock loader previously coerced `TRUE`, `1` and strings with leading or trailing spaces to `true`. The new loader test reproduced the fault. The five feature-group declarations now use raw strings with the same `false` defaults, so each request can apply the exact `true` comparison.
- `tripsage-feature-matrix.vitest.test.ts` exercises all 32 flag combinations against the chat HTTP seam with a fake model, verifies intended data parts and GET availability, compares the all-off and calendar-only prompt with the pre-feature hash, and checks invalid flag values, consecutive requests and missing provider credentials. The card, memory panel and calendar view tests provide the UI-off and rendering assertions.
- The opt-in memory PostgreSQL test asserts that deleting the owner removes that owner's rows and leaves another user's row intact. The test was read and skipped. No migrations were applied.
- Next dev webpack on an isolated copy used a Traveler fixture, a fake model, fake flight and hotel lookups, an in-memory store with fake embeddings, and a saved-trip fixture. Both widths produced all three card nodes and rendered the memory notice, single-delete confirmation, delete-all confirmation and empty state. Tab reached a memory delete control and the ICS link. The chat and saved-trip views had no horizontal overflow at 1280px or 360px. The desktop chat screenshot and both saved-trip screenshots show the tested controls. The mobile chat screenshot was obscured by the trip-info dialog, so mobile chat evidence relies on DOM, keyboard and width checks. No fixture was staged.
- All 11 legacy scripts ran directly. The result was 350 passes and 2 known failures, one each in `test:destination` and `test:explore`.
- The initial full run showed 4,090 passes, 53 failures, 233 skips and 1 todo out of 4,377. It reproduced the 51 failures in the eight QA/in-trip baseline files. Two cases outside the baseline timed out in `assistant-controller.vitest.test.ts` and `extraction.vitest.test.ts`. Each file passed on rerun. The two files also passed 73/73 together in a disposable detached worktree at `09f5f19`. The worktree was removed.

### Full suite comparison

| Run | Total | Passed | Failed | Skipped | Todo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recorded Google Maps baseline | 4,214 | 3,922 | 59 | 232 | 1 |
| P6 initial | 4,377 | 4,090 | 53 | 233 | 1 |
| P6 final | 4,417 | 4,132 | 51 | 233 | 1 |

The final run used Node 24.22.1 and `npx.cmd --offline vitest run --config vitest.config.mts` with JSON and dot reporters. The 51 failures are in `qa-diagnostics` (25), `qa-advanced-reasoning` (12), `qa-answer-quality-v2` (8), `qa-chat-preference` (2), `qa-conversation-reliability` (1), `in-trip-validation` (1), `replan-http` (1), and `us35-location-source-audit` (1). The known order-dependent `companion-discovery` issue did not reproduce. Neither initial timeout recurred. The 40 matrix cases and both memory panel tests passed. The standalone web typecheck passed. [Baseline run](google-maps-provider-switch-verification.md)

### Build and security

- `node scripts/prepare-map-assets.mjs` and `node scripts/build.mjs --webpack` ran in a disposable ignored copy of the project. The build used fake server credentials, a dummy loopback DB URL, mocked Google Fonts responses and a loopback-only TCP guard. The copy used its own generated Varlock types and resolved the two workspace package imports against the same Prisma Client. The first attempts hit a sandbox write error and then a missing or duplicate generated-client type in the staging copy. The production retry passed and generated 58/58 static pages. The existing Varlock dependency-expression warning appeared in the auth demo.
- `rg --text --hidden --no-ignore -l` scanned 272 files in the final client static directory. The five server identifier patterns, word-bounded to avoid matching the public Google Maps name, and all five unique fixture values each matched zero client files. Each fixture value matched a server file. The five group flag names were also absent from the client files.
- The branch diff from `09f5f19` was checked for secret-like strings and excluded paths. Matches were test placeholders, the prompt reference hash, defensive regex patterns and authorization construction. The env templates retain the five off defaults and blank private credentials. No actual env file, generated env types, AGENTS file, owner progress file, fixture or build output belongs to the commits.

## Mục sẵn sàng chép vào `docs/ai-progress.md`

```markdown
## 2026-11-21 — TripSage P6 feature-group acceptance

- Completed offline acceptance for budget, Duffel flights, Amadeus hotels, Traveler memory and saved-trip iCalendar export on `feat/tripsage-chat-itinerary-port`. ADR-36 remains Proposed. P6 fixed Varlock coercion so only the exact raw string `true` enables a group, and added a Vietnamese disclosure for OpenAI embedding and memory deletion.
- Verification on Node 24.22.1 passed web typecheck and all 40 feature-matrix cases. Full Vitest recorded 4,132 passed, 51 known QA/in-trip failures, 233 skipped and 1 todo. The companion-discovery ordering issue did not reproduce. Two initial timeout files passed on both the branch and detached baseline `09f5f19`, and neither failed in the final run. The 11 legacy scripts recorded 350 passes and the two existing destination/Explore failures.
- The offline production webpack build generated 58/58 static pages. The 272-file client scan found none of the five server credential identifiers or five distinct test values. The branch diff scan found no actual credentials or excluded files. The Next dev browser fixture exercised cards, memory deletion and the ICS control at 1280px and 360px. The mobile chat result is backed by DOM and keyboard checks because the screenshot was obscured.
- No migrations or live provider calls ran. Development migration deployment, disposable PostgreSQL assertions including account-deletion CASCADE, live provider and old-selector checks, memory threshold and filter evaluation, external ICS import and rollout approval remain pending. See the owner checklist in `docs/research/tripsage-port-handoff.md`.
```

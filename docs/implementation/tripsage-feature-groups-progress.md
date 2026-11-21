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

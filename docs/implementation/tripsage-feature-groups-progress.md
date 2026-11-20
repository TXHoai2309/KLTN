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

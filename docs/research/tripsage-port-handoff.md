# Handoff: tripsage chat port and optional feature groups (P6, 2026-11-21)

Branch `feat/tripsage-chat-itinerary-port` (not merged, not pushed). ADR-36 is still Proposed. Everything below is for the project owner.

## Deployment checklist for the project owner

1. Review ADR-36 and the live acceptance criteria before enabling the groups. Review Duffel, Amadeus, Google Maps Platform and Firecrawl terms for storage, caching, display, attribution, pricing and quotas. Review OpenAI handling of memory content and recall queries. Resolve the Google Places cache-retention work described below. [Google Places storage notes](google-places-storage-terms.md)
2. Confirm the Development target and back it up. From `packages/db`, check and deploy pending migrations, then regenerate Prisma Client using the normal deployment configuration. The chat migrations `20261114120000_external_place` and `20261114130000_trip_unchecked_checks` are required for external-place Save if pending. `20261121120000_traveler_memory` adds per-traveler pgvector storage and requires the existing pgvector extension. The deploy command applies all pending migrations. Production rollout requires a separate decision.

   ```powershell
   Push-Location packages/db
   npx.cmd prisma migrate status
   npx.cmd prisma migrate deploy
   npx.cmd prisma generate
   Pop-Location
   ```

3. Prepare a separate disposable PostgreSQL container on `127.0.0.1` with the required migrations. Use a loopback URL with `sslmode=disable` for each selected test, set its matching disposable marker, then run the files from `apps/web`. These tests have not been run during the port or P6.

   | File under `apps/web/src/modules` | Loopback URL variable | Disposable marker set to `OWNED_LOOPBACK_CONTAINER` |
   | --- | --- | --- |
   | `trip-read/external-place.postgres.integration.vitest.test.ts` | `EXTERNAL_PLACE_TEST_DATABASE_URL` | `EXTERNAL_PLACE_TEST_DISPOSABLE` |
   | `trip-read/trip-unchecked.postgres.integration.vitest.test.ts` | `UNCHECKED_TRIP_TEST_DATABASE_URL` | `UNCHECKED_TRIP_TEST_DISPOSABLE` |
   | `tripsage-memory/traveler-memory.postgres.integration.vitest.test.ts` | `TRAVELER_MEMORY_TEST_DATABASE_URL` | `TRAVELER_MEMORY_TEST_DISPOSABLE` |

   ```powershell
   Push-Location apps/web
   npx.cmd vitest run --config vitest.config.mts src/modules/trip-read/external-place.postgres.integration.vitest.test.ts src/modules/trip-read/trip-unchecked.postgres.integration.vitest.test.ts src/modules/tripsage-memory/traveler-memory.postgres.integration.vitest.test.ts
   Pop-Location
   ```

4. Configure the server credentials listed below in Development. If the local generated environment types predate P6, regenerate them with `npx.cmd --offline varlock codegen` from `apps/web`. Enable each feature independently and smoke-test real Duffel and Amadeus responses and missing-credential isolation. Verify coverage in Vietnam, reference prices and account quotas. Verify live OpenAI embedding, deletion and list/recall with consented examples. The cosine cutoff `0.50` has no live retrieval evaluation. The sensitive-data filter also blocks travel wording such as "dị ứng" and strings containing seven or more digits. Review false positives using consented examples before considering a filter or threshold change.
5. Verify the authenticated chat with live OpenAI, Google and Firecrawl in Development, including sources, external-place suggestions, unchecked confirmation, Save and the saved-trip warning. Run the live comparison with the old selector (`assistant-trip-planning-evaluation.json`). This comparison has no live results yet.
6. Download a sample saved trip and import the ICS into Google Calendar, Apple Calendar and Outlook. Compare dates and hours after import. The integration has no OAuth or calendar API.

## Open decisions

- 60-minute suggested stay for external places (one constant, labelled estimate).
- Wording of the unchecked confirmation sentence (product default, not legal text).
- Whether companions may see external places (now generic label only, never the unchecked list).
- Edit, AI edit, in-trip, replan and journey edit for Trips with external places (now fail closed with `EXTERNAL_PLACE_UNSUPPORTED`).
- 30-day cache cleanup job and refetch on read for `ExternalPlace` name/coordinates (read ignores stale values, but nothing NULLs them; terms compliance needs a job).
- Raise `maxRetries` above 0 (now 0 on purpose: one bounded attempt per step).
- Admission is in-memory (8 requests/min, 3 concurrent per process); not shared across instances.
- Add Google and Firecrawl keys to the Admin runtime-config (now env only).
- Whether unchecked may also cover KLTN places with missing data (now no).
- TDD was thinner than ideal in a few tickets (some seams were written with the code); tests exist but were not all red-first.
- Pre-existing, unfixed: 51 baseline Vitest failures (8 files), `test:destination` and `test:explore` legacy failures (no branch file touched), and an order-dependent `next/navigation` mock leak with `isolate:false` that fails `companion-discovery` when run after `trips-view.vitest.test.ts`.

## Flags and rollback

All six switches default to `false`. The five group switches preserve the raw server-side value and only enable the group when it is exactly `true`. They are read per request. The existing chat switch gates planning chat use. The calendar operates from the saved-trip page independently.

| Server flag | Default | Related server credential or setting |
| --- | --- | --- |
| `TRIPSAGE_CHAT_ENABLED` | `false` | Effective OpenAI runtime configuration (`OPENAI_API_KEY` env fallback), `GOOGLE_MAPS_API_KEY`, `FIRECRAWL_API_KEY` |
| `TRIPSAGE_FEATURE_BUDGET` | `false` | None |
| `TRIPSAGE_FEATURE_FLIGHTS` | `false` | `DUFFEL_ACCESS_TOKEN` |
| `TRIPSAGE_FEATURE_HOTELS` | `false` | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_ENV` (defaults to `test`) |
| `TRIPSAGE_FEATURE_MEMORY` | `false` | Effective OpenAI runtime configuration (`OPENAI_API_KEY` env fallback), deployed memory migration |
| `TRIPSAGE_FEATURE_CALENDAR` | `false` | None |

Keep credentials in server configuration. Flight and hotel offers are for lookup only, with no booking, payment, or persistence. To roll back, turn the affected switch off. Turn all five group switches off and the chat switch off for the original plan flow. Leave the additive migrations in place once trips or memory records exist. Dropping the new tables or columns would discard data. Provider selection now follows the shared Maps decision. [ADR-37](../decisions.md#adr-37--shared-google-mapsstadia-provider-switch-2026-11-18)

## Verification boundary

P1–P6 use offline evidence. The budget calculations and result cards use test data. Flight and hotel calls, OpenAI chat and embedding, Google Places/Routes, and Firecrawl use fakes in verification. P6 exercised result cards, memory deletion and the ICS link with a Next dev fixture. Real sign-in, the live chat and Save flow, external calendar imports, the three PostgreSQL suites above, and a deployed environment all still need owner verification. Phase-specific receipts and the mobile screenshot limitation are in the [feature group progress log](../implementation/tripsage-feature-groups-progress.md#p6-2026-11-21).

## Existing files changed by the original port (Ticket 12)

`planning-engine.ts` (external candidates admitted only if the chat merged them; no-journey branch untouched), `planning-admission.ts` (adds `retryAfterSeconds` to the 429), `planning-runtime.ts` (routes provider selector, Stadia by default), `trip-clarification-rules.ts` (export only), trip save/read/companion services (external visits, unchecked list), `trips/new/page.tsx` (flagged link), `trips/[id]/page.tsx`, `trips-view.tsx`, `planner-presentation.tsx` and css (external labels), env templates (blank keys), `package.json` (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`).

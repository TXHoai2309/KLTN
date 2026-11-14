# Handoff: tripsage chat port (Ticket 12, 2026-11-14)

Branch `feat/tripsage-chat-itinerary-port` (not merged, not pushed). ADR-36 is still Proposed. Everything below is for the project owner.

## Must be done by hand

1. Back up, then apply the two migrations on Development only, in order: in `packages/db` run `npx prisma migrate status`, then `npx prisma migrate deploy` (`20261114120000_external_place`, then `20261114130000_trip_unchecked_checks`, which only adds two nullable `trip` columns). Production is out of scope. Chat Save of an external place needs both.
2. Run the opt-in PostgreSQL tests on a disposable loopback container: `external-place.postgres.integration.vitest.test.ts` and `trip-unchecked.postgres.integration.vitest.test.ts` (env names in each file and in ai-progress Ticket 07 and 09). They prove the XOR CHECK and the unchecked columns; until then that acceptance criterion stays unticked.
3. Open the UI in a browser with the flag on: `/assistant/plan` (chat, status, itinerary map, sources, external suggestions, unchecked confirmation and Save states) and the trip page "Chưa kiểm" banner. No browser check was done.
4. Set server keys (never `NEXT_PUBLIC_`): `GOOGLE_MAPS_API_KEY` (Places, Place Details, Routes), `FIRECRAWL_API_KEY`. Without them the tools answer "unavailable" in Vietnamese.
5. Review Google Maps Platform and Firecrawl terms (storage, caching, scraping, pricing, quotas); see `google-places-storage-terms.md`.
6. Run the live comparison with the old selector (`assistant-trip-planning-evaluation.json`) with a real OpenAI key; not run, no numbers exist.

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

- Chat: `TRIPSAGE_CHAT_ENABLED=true` turns on `/assistant/plan`, `/api/ai/chat` and the link on `/trips/new`. Unset or anything else = off (404 / refused); the old form, Assistant V2 and `/api/ai/planning` are unchanged. Read per request, no rebuild.
- Routing: `PLANNER_ROUTING_PROVIDER=GOOGLE` selects Google Routes; empty or other = Stadia (default).
- Rollback: set the flag off. The migrations are additive (new table, nullable columns, a CHECK that every existing visit satisfies); do not drop them while Trips with external places exist.

## Existing files changed by the branch (beyond new files)

`planning-engine.ts` (external candidates admitted only if the chat merged them; no-journey branch untouched), `planning-admission.ts` (adds `retryAfterSeconds` to the 429), `planning-runtime.ts` (routes provider selector, Stadia by default), `trip-clarification-rules.ts` (export only), trip save/read/companion services (external visits, unchecked list), `trips/new/page.tsx` (flagged link), `trips/[id]/page.tsx`, `trips-view.tsx`, `planner-presentation.tsx` and css (external labels), env templates (blank keys), `package.json` (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`).

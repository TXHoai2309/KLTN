# Baseline before the tripsage chat port (2026-11-14)

Recorded on branch `feat/tripsage-chat-itinerary-port` before any port code (only the flag module and docs existed).

## Vitest (`apps/web`, `vitest run --config vitest.config.mts`)

858 files, 4008 tests: 3726 passed, 51 failed, 230 skipped. Exit 1 (not green before this work).

| Failing file | Failed tests |
|---|---|
| modules/ai/qa-advanced-reasoning.vitest.test.ts | 12 |
| modules/ai/qa-answer-quality-v2.vitest.test.ts | 8 |
| modules/ai/qa-chat-preference.vitest.test.ts | 2 |
| modules/ai/qa-conversation-reliability.vitest.test.ts | 1 |
| modules/ai/qa-diagnostics.vitest.test.ts | 25 |
| modules/in-trip/in-trip-validation.vitest.test.ts | 1 |
| modules/in-trip/replan-http.vitest.test.ts | 1 |
| modules/in-trip/us35-location-source-audit.vitest.test.ts | 1 |

Any failure outside this list after a ticket is a regression from this work.

## Typecheck (`tsc --noEmit`, `apps/web`)

11 errors, all about `journeySnapshot` missing on the generated Prisma client (stale client; the origin/journey migrations exist). Files: trip-edit-service, journey-edit-service, trip-read-service and the journey-save postgres test.

Fix applied locally: regenerating the Prisma client (`prisma generate`, no database write) brings typecheck to 0 errors. The generated client is not committed.

## Routing seam

`RouteProvider` in the trip-planner routing module is already the provider port; Stadia is one implementation. Ticket 06 adds a Google implementation behind configuration, so no prefactor was needed.

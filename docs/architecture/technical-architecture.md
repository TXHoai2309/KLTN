# Technical architecture

This document describes the architecture selected for KLTN and distinguishes code that exists from integrations still awaiting business stories. The active implementation is Next.js full-stack; the supplied old Architecture document's NestJS backend and deployment-TBD statements are historical and are not current implementation.

## System shape

```text
Browser
  └─ Next.js / React App Router (apps/web)
       ├─ UI and server-rendered pages
       ├─ Route Handlers (HTTP delivery)
       ├─ business modules/services (system, auth, account, destination)
       ├─ @KLTN/auth (Better Auth)
       └─ @KLTN/db (Prisma Client + Neon adapter)
            └─ Neon PostgreSQL
                 ├─ PostGIS extension
                 └─ pgvector extension

Selected integrations for future business stories:
  OpenAI · Google Maps Platform · Google Routes API

Deployment: Vercel web service
```

The repository is an npm/Turborepo monorepo: `apps/web`, `packages/auth`, `packages/db`, `packages/config`, and `packages/ui`.

## Current repository structure

- `apps/web/src/app/`: App Router pages and auth/health/account/admin-destination Route Handlers.
- `apps/web/src/app/api/auth/[...all]/route.ts`: exports GET and POST handlers from Better Auth's `toNextJsHandler`.
- `apps/web/src/app/api/health/route.ts`: small GET handler that calls the `system` service and maps through the shared API response/error helpers.
- `apps/web/src/modules/system/system.service.ts`: returns the service health value. Auth/logout, self-service account and admin destination modules are implemented; Culture, Favorite, Trip, RAG and Validator remain future stories.
- `apps/web/src/server/http/`: shared app error, response mapping, error handling, and idempotency logic.
- `apps/web/src/lib/`: client mutation contract/helpers and Better Auth client configuration.
- `apps/web/src/services.ts`: creates the Prisma client from server environment and passes it to Better Auth.
- `packages/auth/`: Better Auth/Prisma adapter configuration and initial-admin helper.
- `packages/db/`: Neon Prisma adapter, Prisma config, generated client, schema, migrations, and Varlock import.
- `packages/ui/`: shared React UI primitives/styles.

The UI currently includes a home shell, sign-in/sign-up, a user menu, a session-protected dashboard, self-service account and admin destination list/create/edit. Other product screens await their stories.

## Responsibility boundaries

### Route Handler

Parse and validate request inputs, establish the authentication boundary, call a module/service, then map its result or error into the shared response shape. Keep business rules and persistence orchestration out of `route.ts`. The auth catch-all is an adapter exception: it delegates request handling to Better Auth.

### Module/service

Own business rules, orchestration, authorization/ownership decisions, and calls to persistence or external services. Account and Destination services implement this boundary behind thin handlers.

### Database

Prisma/Neon owns persistence and database invariants. Current models cover Better Auth `User`, `Session`, `Account`, `Verification`, `IdempotencyRecord`, and Destination/OpeningDay/OpeningInterval. Trip/Culture/Favorite are not implemented. `User.role` is enum `TRAVELER | ADMIN`, defaulting to `TRAVELER`. PostGIS and pgvector are enabled; no geometry/embedding column has been added.

US-07 Destination persistence uses stable cuid IDs, normalized open-taxonomy area/category strings and canonical latitude/longitude Doubles. Visibility defaults HIDDEN; generic create/update cannot change it (US-08 boundary). Independent nullable suggested/minimum durations use integer minutes, NULL for missing data. Seven unique weekdays carry explicit OPEN/CLOSED/UNKNOWN status; local-time intervals store minutes since midnight (end may be 1440/24:00). Shared strict validation enforces exactly seven days, status/interval consistency, canonical order and non-overlap; database checks enforce coordinate/duration/time ranges with FK/unique constraints. Schedule replacement and idempotency response commit in one transaction. Imports must reuse the semantic contract rather than writing incomplete schedules. See [US-07](../stories/US-07-admin-destinations.md) for DTO and cross-dev handoff.

### Auth and authorization

Better Auth handles email/password and sessions. The role is configured as a non-input additional field; public signup cannot choose `ADMIN`. The server-side bootstrap uses Better Auth to create credentials and then assigns `ADMIN`. Shared `server/authorization` guards resolve an uncached trusted session and current persisted User role. Exact Traveler/Admin permissions have no inheritance; private resource readers must constrain persistence by trusted actor ownership. Account GET/PATCH and page are self-only; dashboard accepts both authenticated roles; the development demo action independently requires Traveler. Denials use 401/403, and non-owned/missing resources use the same 404. Future business modules must integrate the shared ownership scope; their endpoints do not exist yet. See [US-06](../stories/US-06-role-ownership.md) for the permission matrix and integration contract.

### AI, Validator, maps, and routing

The accepted product boundary is:

- AI/OpenAI: natural-language understanding, RAG answers, and proposals.
- Constraint Validator: deterministic checks and outcomes, independent from AI.
- Google Routes: actual route/travel duration for `DRIVE` and `TWO_WHEELER`.
- If mandatory route data is missing or not returned within at most 10 seconds, the travel-time check is `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`, never `PASS`; AI must not guess travel time. This is a behavior requirement, not an implementation in the current repository.
- PostGIS: stored spatial data and spatial queries.
- pgvector: embeddings and similarity retrieval.
- Google Maps Platform: browser map rendering.

These are selected project integrations, not present service implementations in the current repository snapshot. OpenAI and Routes secrets remain server-side. The browser Maps key may be `NEXT_PUBLIC_` with Google Cloud domain/API restrictions.

## API and error contract

Generic success is `{ "success": true, "data": ... }`. Generic failure is `{ "success": false, "error": { "code", "message", "details?" } }`. `AppError` maps to its code/message/status/details; an unhandled generic API error is logged and returns `INTERNAL_SERVER_ERROR` with HTTP 500. `/api/health` returns the generic success envelope around `{ status: "ok", service: "KLTN" }`.

Mutation responses additionally carry `operationStatus`:

- `SUCCESS`: `{ success: true, operationStatus: "SUCCESS", data }`; successful replay is marked by `Idempotency-Replayed: true`.
- `FAILED`: `{ success: false, operationStatus: "FAILED", error }`, using a known HTTP status (same-key/different-body is HTTP 409).
- `UNKNOWN`: `{ success: false, operationStatus: "UNKNOWN", error, retryWithSameKey: true }`, HTTP 503.

`handleMutationApiError` maps `AppError` to `FAILED` and unexpected errors to `UNKNOWN`. The client helper treats transport failure, unreadable JSON, or an invalid response as `UNKNOWN`.

## Idempotency contract

`executeIdempotentWrite` scopes a key by JSON `[actorId, operation]`; it hashes canonical JSON request data with SHA-256 (object keys sorted). A unique `(scope, key)` row stores the hash and serialized successful response. Same key and hash replays the stored `SUCCESS`; same key with a different hash returns `IDEMPOTENCY_KEY_REUSED`/409. Write and success response are committed in one database transaction. Known `AppError` failures roll back and are not persisted as success. Unexpected/uncertain outcomes return `UNKNOWN` and tell the caller to retry with the same key and payload. Records have no TTL or cleanup job. External side effects do not belong inside the transaction callback.

Account name and admin Destination writes use this shared primitive and client contract. Destination update hashes include the target ID; both services recheck trusted role inside the transaction. Future applicable mutations must use it and must not generate a new key when retrying an `UNKNOWN` result.

US-08 adds a separate Admin-only `PATCH /api/admin/destinations/[id]/visibility`, operation `destination:set-visibility`, hashing both ID and target visibility. It updates visibility only (normal updatedAt metadata), rechecks role in the transaction, and preserves schedules/history. Generic detail editing remains unable to publish. `modules/destination/destination-eligibility.ts` is the shared boundary for future public reads and new-itinerary candidates: `visibleDestinationWhere`, predicates on persisted records and `findEligibleDestinationIds` constrain existence plus VISIBLE at persistence. Public UI/API integration remains US-10; Planner integration remains a future Trip story. No public/planner endpoint or schema change is introduced by this boundary.

## Deployment and schema workflow

`vercel.json` configures one `apps/web` Next.js service, workspace install, and a build command that generates the Prisma client before the web build. The repo uses Prisma migration history for shared schema changes. See [environment and deployment](../implementation/environment-deployment.md). The old Architecture document's separate NestJS backend is not part of this topology.

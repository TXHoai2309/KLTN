# Technical architecture

This document describes the architecture selected for KLTN and distinguishes code that exists from integrations still awaiting business stories. The active implementation is Next.js full-stack; the supplied old Architecture document's NestJS backend and deployment-TBD statements are historical and are not current implementation.

## System shape

```text
Browser
  └─ Next.js / React App Router (apps/web)
       ├─ UI and server-rendered pages
       ├─ Route Handlers (HTTP delivery)
       ├─ business modules/services (current: system only)
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

- `apps/web/src/app/`: App Router pages, auth route, and health route.
- `apps/web/src/app/api/auth/[...all]/route.ts`: exports GET and POST handlers from Better Auth's `toNextJsHandler`.
- `apps/web/src/app/api/health/route.ts`: small GET handler that calls the `system` service and maps through the shared API response/error helpers.
- `apps/web/src/modules/system/system.service.ts`: currently returns the service health value. No destination, culture, favorite, trip, RAG, Validator, or admin content module exists yet.
- `apps/web/src/server/http/`: shared app error, response mapping, error handling, and idempotency logic.
- `apps/web/src/lib/`: client mutation contract/helpers and Better Auth client configuration.
- `apps/web/src/services.ts`: creates the Prisma client from server environment and passes it to Better Auth.
- `packages/auth/`: Better Auth/Prisma adapter configuration and initial-admin helper.
- `packages/db/`: Neon Prisma adapter, Prisma config, generated client, schema, migrations, and Varlock import.
- `packages/ui/`: shared React UI primitives/styles.

The UI currently includes a home shell, sign-in/sign-up, a user menu, and a session-protected dashboard. These do not constitute the full product UI described by Figma/Product Document.

## Responsibility boundaries

### Route Handler

Parse and validate request inputs, establish the authentication boundary, call a module/service, then map its result or error into the shared response shape. Keep business rules and persistence orchestration out of `route.ts`. The auth catch-all is an adapter exception: it delegates request handling to Better Auth.

### Module/service

Own business rules, orchestration, authorization/ownership decisions, and calls to persistence or external services. The `system` module demonstrates this boundary; business modules are future work.

### Database

Prisma/Neon owns persistence and database invariants. Current Prisma models cover Better Auth `User`, `Session`, `Account`, `Verification`, and `IdempotencyRecord`; there are no destination/trip/culture/favorite domain models. `User.role` is enum `TRAVELER | ADMIN`, defaulting to `TRAVELER`. Migrations enable PostGIS and pgvector, but no domain spatial or embedding schema is present.

### Auth and authorization

Better Auth handles email/password and sessions. The role is configured as a non-input additional field; public signup cannot choose `ADMIN`. The server-side bootstrap uses Better Auth to create credentials and then assigns `ADMIN`. The dashboard currently checks for a session and redirects unauthenticated visitors to `/login`. Business authorization and ownership checks still need to be implemented in future modules.

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

This is a shared primitive and client contract; no current business write endpoint uses it. Future applicable mutations must use it and must not generate a new key when retrying an `UNKNOWN` result.

## Deployment and schema workflow

`vercel.json` configures one `apps/web` Next.js service, workspace install, and a build command that generates the Prisma client before the web build. The repo uses Prisma migration history for shared schema changes. See [environment and deployment](../implementation/environment-deployment.md). The old Architecture document's separate NestJS backend is not part of this topology.

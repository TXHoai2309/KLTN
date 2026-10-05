# Technical architecture

This document describes the architecture selected for KLTN and distinguishes code that exists from integrations still awaiting business stories. The active implementation is Next.js full-stack; the supplied old Architecture document's NestJS backend and deployment-TBD statements are historical and are not current implementation.

## System shape

```text
Browser
  └─ Next.js / React App Router (apps/web)
       ├─ UI and server-rendered pages
       ├─ Route Handlers (HTTP delivery)
       ├─ business modules/services (system, auth, account, destination, culture)
       ├─ @KLTN/auth (Better Auth)
       └─ @KLTN/db (Prisma Client + Neon adapter)
            └─ Neon PostgreSQL
                 ├─ PostGIS extension
                 └─ pgvector extension

Selected integrations for future business stories:
  OpenAI · MapLibre GL JS / Stadia Maps · Google Routes API

Deployment: Vercel web service
```

The repository is an npm/Turborepo monorepo: `apps/web`, `packages/auth`, `packages/db`, `packages/config`, and `packages/ui`.

## Current repository structure

- `apps/web/src/app/`: App Router pages and auth/health/account/admin-destination/admin-culture Route Handlers.
- `apps/web/src/app/api/auth/[...all]/route.ts`: exports GET and POST handlers from Better Auth's `toNextJsHandler`.
- `apps/web/src/app/api/health/route.ts`: small GET handler that calls the `system` service and maps through the shared API response/error helpers.
- `apps/web/src/modules/system/system.service.ts`: returns the service health value. Auth/logout, self-service account and admin destination modules are implemented; Culture administration is implemented in US-09; Favorite, Trip, RAG and Validator remain future stories.
- `apps/web/src/server/http/`: shared app error, response mapping, error handling, and idempotency logic.
- `apps/web/src/lib/`: client mutation contract/helpers and Better Auth client configuration.
- `apps/web/src/services.ts`: creates the Prisma client from server environment and passes it to Better Auth.
- `packages/auth/`: Better Auth/Prisma adapter configuration and initial-admin helper.
- `packages/db/`: Neon Prisma adapter, Prisma config, generated client, schema, migrations, and Varlock import.
- `packages/ui/`: shared React UI primitives/styles.

The UI includes the product Home, sign-in/sign-up, user menu, protected dashboard, self-service account, Admin Destination/Culture management, public Destination detail, and public Explore Destination/Culture summaries. Explore uses independent server-rendered sections; canonical search/filter and full Culture detail await US-11/US-14.

## Responsibility boundaries

### Route Handler

Parse and validate request inputs, establish the authentication boundary, call a module/service, then map its result or error into the shared response shape. Keep business rules and persistence orchestration out of `route.ts`. The auth catch-all is an adapter exception: it delegates request handling to Better Auth.

### Module/service

Own business rules, orchestration, authorization/ownership decisions, and calls to persistence or external services. Account, Destination and Culture services implement this boundary behind thin handlers.

### Database

Prisma/Neon owns persistence and database invariants. Current models cover Better Auth `User`, `Session`, `Account`, `Verification`, `IdempotencyRecord`, Destination/OpeningDay/OpeningInterval and CultureContent/CultureDestination. Trip/Favorite are not implemented. `User.role` is enum `TRAVELER | ADMIN`, defaulting to `TRAVELER`. PostGIS and pgvector are enabled; no geometry/embedding column has been added.

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
- MapLibre GL JS: browser map rendering; Stadia Maps: official Alidade Smooth light/dark styles and basemap.

OpenAI/Routes/spatial/vector business integrations remain future service implementations. US-12 adds browser Maps infrastructure and the public Explore/Detail integration described below. OpenAI and Routes secrets remain server-side. Stadia localhost uses no key; production uses property/domain authentication. Google Routes remains a separate planned server integration.

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

US-08 adds a separate Admin-only `PATCH /api/admin/destinations/[id]/visibility`, operation `destination:set-visibility`, hashing both ID and target visibility. It updates visibility only (normal updatedAt metadata), rechecks role in the transaction, and preserves schedules/history. Generic detail editing remains unable to publish. `modules/destination/destination-eligibility.ts` is the shared boundary for public reads and new-itinerary candidates: `visibleDestinationWhere`, predicates on persisted records and `findEligibleDestinationIds` constrain existence plus VISIBLE at persistence. Public detail consumes it in US-13; discovery remains US-10 and Planner integration remains a future Trip story. The helper itself introduces no endpoint or schema change.

US-13 public detail now consumes this canonical filter through one `public-destination-service`, shared by the uncached `/destinations/[id]` server page and thin `GET /api/destinations/[id]`. A separate strict allowlist omits Admin metadata/minimum duration; VISIBLE content is selected at persistence, an ID-only existence query distinguishes unavailable410 from missing404, and system errors remain500. Admin has identical public semantics. Weekly hours and suggested duration reuse US-07 contract. US-09 supplies bounded related VISIBLE Culture summaries and safe source metadata through the canonical relation; US-12 reuses shared browser Maps at the own coordinate. Search/filter discovery remains US-10/11; no Planner endpoint/schema change.

## Deployment and schema workflow

`vercel.json` configures one `apps/web` Next.js service, workspace install, and a build command that generates the Prisma client before the web build. The repo uses Prisma migration history for shared schema changes. See [environment and deployment](../implementation/environment-deployment.md). The old Architecture document's separate NestJS backend is not part of this topology.

## US-09 Culture administration

CultureContent owns title/prose, nullable sourceTitle/sourceUrl metadata, HIDDEN/VISIBLE default HIDDEN and timestamps. No RAG/source lifecycle coupling. CultureDestination is the canonical many-to-many join with composite PK, reverse index and restrictive FKs; hiding preserves links. Additive migration20261005021531_add_culture_content_domain applied only on verified development.

Thin /api/admin/culture collection/detail/visibility and destination-lookup handlers reuse exact Admin authorization. Module services validate strict normalized input/all Destination IDs, preserve visibility during generic edits and recheck persisted role in transaction. Content/source/relation replacement and idempotency response commit together under culture:create/update/set-visibility. Admin pages reuse existing UI styling/switch presentation with separate Culture controllers. Public Destination selects at most20 linked Culture rows under canonical visibleCultureWhere, exposing summary allowlist only; source links are http/https and escaped/safe, no dead public Culture route. See [US-09](../stories/US-09-culture-management.md).

## US-12 shared browser Maps / minimum Explore boundary

`modules/map` owns npm MapLibre loading, official Stadia light/dark style selection, longitude-first marker/viewport projection, renderer and cancellable provider lifecycle. `components/map/DestinationMap` is the shared Client boundary for Explore/US-13. Browser APIs run only in effects. Loading waits for MapLibre `load`; error or 15s timeout retains List/information. Retry disposes the old map before initializing a new one; cleanup removes markers/popups/events and calls map.remove(). Theme changes cleanly replace the instance, with stable canonical style selection.

MapLibre 6's worker and sibling shared module are copied from the installed npm package into ignored public/maplibre by dev/build preparation, served together from the same origin (no CDN script). Asset HEAD preflight prevents poisoning the library's cached worker initialization when an asset is temporarily missing. Official CSS is imported by App Router layout. No browser Google key/Map ID or Maps JS dependency remains. Stadia domain auth is deployment configuration; Google Routes remains a separate server-side routing decision. No geolocation/routing/schema change.


## US-10 Home and public Explore

Home is static product UI with a real `/explore` CTA. Explore uses two independently streamed server sections so Destination and Culture can load, return empty results, or report an error separately. Destination List/Map still consume the shared `listPublicLocations` page from US-12; Culture summaries use the public-only `GET /api/culture` handler and `listPublicCulture`. Both use canonical persisted VISIBLE filters and strict public allowlists for every role, with `no-store` freshness. Culture relations select only VISIBLE Destinations and omit hidden links; source links are safe http/https. Destination `page` and UI `culturePage` state are independent. No Culture detail endpoint/page or US-11 search/filter implementation was added. See [US-10](../stories/US-10-home-explore.md).

US-12 task149 search/filter state remains blocked pending US-11; US-10 does not mark it PASS. See [US-12](../stories/US-12-destination-map.md).

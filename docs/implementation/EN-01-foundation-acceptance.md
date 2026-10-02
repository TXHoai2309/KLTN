# EN-01 — Foundation acceptance

## Scope

Establish the web application, shared packages, persistence/auth foundation, API conventions, and deployment setup that future business stories can reuse. EN-01 does not mean the full travel-assistant product is implemented.

## Implemented foundation

- Next.js App Router full-stack application in `apps/web`, managed with npm workspaces and Turborepo.
- Better Auth email/password with `TRAVELER`/`ADMIN` user role, server-owned role assignment, public-signup Traveler default, and a server-side initial Admin bootstrap command.
- Prisma Client with Neon adapter and schema/migration workflow.
- Auth persistence models and `idempotency_record` model/table.
- PostGIS and pgvector extension migration.
- Shared generic API success/failure envelope, `AppError`, generic/mutation error handlers, mutation response contract, client helper, and idempotent-write service.
- `/api/health` Route Handler backed by a small system service.
- Vercel web service configuration and environment schema/template convention.

## Evidence and current limits

Evidence lives in the repository: `apps/web/src/app/api/health/route.ts`, `apps/web/src/server/http/`, `apps/web/src/lib/mutation-*`, `packages/auth/`, `packages/db/prisma/schema/`, `packages/db/prisma/migrations/`, and `vercel.json`. Auth and Admin bootstrap were smoke-tested in the preceding implementation task. The API/mutation helper contract is present, but no business mutation route uses it yet.

There are no destination, culture, favorite, trip, itinerary, RAG, Constraint Validator, in-trip, or admin-content domain models/modules in this snapshot. PostGIS/pgvector extensions exist without those domain queries/models. OpenAI and Google Routes integrations are not implemented. Treat the business requirements as future stories.

## Conventions future stories may assume

- The application can construct a Neon-backed Prisma client from server configuration.
- Prisma schema history is migration-based; generate/review/apply migrations per environment.
- Better Auth email/password, roles, and Admin bootstrap exist; business role/ownership authorization still belongs in server modules.
- PostGIS and pgvector extensions are enabled in the database migration baseline.
- Shared generic API/error mapping exists. Mutation responses use `SUCCESS` / `FAILED` / `UNKNOWN`.
- Idempotency records successful responses indefinitely, replays same key/same payload, rejects same key/different payload, and returns uncertain outcomes for safe same-key retry.
- Vercel has a Next.js web service configuration; environment topology is documented separately.

Do not recreate these foundations in every story. Verify the relevant package API and migration state before relying on a detail.

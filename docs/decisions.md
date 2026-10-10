# Accepted decisions

This is a lightweight log of decisions that future stories may rely on. “Existing baseline” means the exact adoption date is not recorded. Product integrations listed as selected technology remain pending until implemented in the repository.

## ADR-01 — Next.js full-stack application

- **Status:** Accepted baseline
- **Decision:** Use Next.js with React/TypeScript, App Router, and Route Handlers as the web/API runtime.
- **Reason:** This is the current application and the deployment configuration points to `apps/web` as a Next.js service.
- **Consequence:** Do not add a separate NestJS/Hono backend to match the old Architecture document. Keep route handlers thin.
- **Date:** Existing baseline

## ADR-02 — Modular Monolith boundaries

- **Status:** Accepted baseline
- **Decision:** Keep related business modules in the full-stack application; Route Handlers deliver HTTP, modules/services own business behavior.
- **Reason:** Preserve clear ownership without adding a separate service tier for the MVP.
- **Consequence:** Put business validation and ownership checks on the server in a suitable module/service. Current business modules are still largely unbuilt.
- **Date:** Existing baseline

## ADR-03 — npm and Turborepo monorepo

- **Status:** Accepted baseline
- **Decision:** Use npm workspaces and Turborepo across `apps/web` and `packages/*`.
- **Reason:** Root manifests define npm workspaces and Turbo tasks.
- **Consequence:** Keep shared auth, database, config, and UI code in their packages; run workspace scripts through the root tooling where available.
- **Date:** Existing baseline

## ADR-04 — Better Auth and server-owned roles

- **Status:** Accepted baseline
- **Decision:** Use Better Auth email/password. Roles are `TRAVELER` and `ADMIN`; public signup defaults to `TRAVELER`, with `role` configured as a non-input additional field. Bootstrap Admin is a server-side command using environment credentials.
- **Reason:** Role assignment must not be controlled by signup clients.
- **Consequence:** Admin is not implicitly a Traveler. Every future protected feature still needs server authorization and ownership checks. The current repo has no complete business authorization module.
- **Date:** Existing baseline

## ADR-05 — Prisma with Neon PostgreSQL

- **Status:** Accepted baseline
- **Decision:** Use Prisma Client with the Neon serverless adapter and Neon PostgreSQL.
- **Reason:** The database package constructs the Prisma client with `PrismaNeon` and loads `DATABASE_URL` through Varlock.
- **Consequence:** Model domain persistence in Prisma and keep database-specific work behind the DB package/services.
- **Date:** Existing baseline

## ADR-06 — PostGIS and pgvector extensions

- **Status:** Accepted baseline; domain use pending
- **Decision:** Enable PostGIS for spatial storage/query needs and pgvector for RAG embeddings.
- **Reason:** These extensions are present in a migration and support the product architecture.
- **Consequence:** Extensions exist, but domain models and spatial/vector queries still need story-level implementation and acceptance tests.
- **Date:** Existing baseline

## ADR-07 — Separate AI, routing, and deterministic validation responsibilities

- **Status:** Accepted baseline; integrations pending
- **Decision:** OpenAI handles language understanding/proposals and RAG; Google Maps Platform renders maps; Google Routes API supplies route/travel-time data for `DRIVE` and `TWO_WHEELER`; a deterministic server-side Validator decides constraint outcomes.
- **Reason:** AI output is not a source of truth for deterministic business constraints.
- **Consequence:** Missing required routing/validator data is not a pass. API keys stay server-side except the restricted browser Maps key. No OpenAI or Routes service module is present yet.
- **Date:** Existing baseline

## ADR-08 — Shared HTTP response and error conventions

- **Status:** Implemented baseline
- **Decision:** Use shared `ApiSuccess`/`ApiFailure`, `AppError`, and error handlers. Mutation responses include `SUCCESS`, `FAILED`, or `UNKNOWN`.
- **Reason:** One response/error shape keeps future Route Handlers consistent.
- **Consequence:** Use `api-response.ts` and the shared handlers; do not invent endpoint-specific envelopes without a story decision. Only the health endpoint currently exercises the generic success/error convention.
- **Date:** Existing baseline

## ADR-09 — Confirmed write results and idempotent retry

- **Status:** Implemented shared primitive; business use pending
- **Decision:** Persist successful mutation responses with a scope, idempotency key, SHA-256 request hash, and JSON result in `idempotency_record`. Same key/same payload replays success; same key/different payload returns conflict. Records have no TTL or cleanup job in the MVP.
- **Reason:** A retry after an uncertain network outcome must not duplicate a write.
- **Consequence:** Retry `UNKNOWN` with the identical key and payload. Keep database writes and the record in the same transaction; do not perform external side effects in the transaction callback. No business write endpoint currently uses the primitive.
- **Date:** Existing baseline

## ADR-10 — Migration-based schema changes

- **Status:** Accepted baseline
- **Decision:** Use Prisma migrations for feature schema changes. `db:push` is not the main schema workflow.
- **Reason:** Migrations provide reviewable, repeatable schema history for shared environments.
- **Consequence:** Review generated SQL before deployment; use `migrate dev` on development and `migrate deploy` for production application.
- **Date:** Existing baseline

## ADR-11 — Varlock environment contract

- **Status:** Implemented baseline
- **Decision:** `apps/web/.env.schema` is the machine contract and codegen input; `.env.example` documents developer-facing values; `.env` is local-only and ignored.
- **Reason:** Separate validation/type generation from the developer setup template and actual credentials.
- **Consequence:** Keep schema and example keys aligned; never commit actual secrets or connection strings.
- **Date:** Existing baseline

## ADR-12 — Vercel deployment and environment topology

- **Status:** Accepted baseline
- **Decision:** Deploy the web app on Vercel. Local and Preview use Neon development; Production uses Neon production. Preview environment variables must support preview/feature branches.
- **Reason:** This is the current project deployment/environment baseline.
- **Consequence:** Configure preview and production secrets in Vercel; do not place credentials in repository docs. Promote branches deliberately.
- **Date:** Existing baseline

## ADR-13 — Team branch roles

- **Status:** Accepted baseline
- **Decision:** Each developer uses a separate personal/feature branch. `TXH` is the personal branch of Tô Xuân Hoài, `dev` is shared integration/testing, and `master` is production/stable. Other developers are not expected to work directly on `TXH`; no other personal branch names are prescribed here.
- **Reason:** This is the team workflow provided for this repository.
- **Consequence:** Promotion is manual and requires explicit approval. Do not auto-merge branches.
- **Date:** Existing baseline

## ADR-14 — Vitest unit/route test runner for web

- **Status:** Proposed — awaiting product/technical owner approval
- **Date:** 2026-10-06

## Context

US14-TEST needs a deterministic automated test entry point for Culture service, public Route Handler contracts, and pure UI safety helpers. The repository already contains useful `tsx --test` suites, but it has no package-level `test` task or unified runner, and there is no need for a browser E2E framework for this story. Tests must not connect to Neon or require secrets.

## Decision

Propose adding Vitest as a development dependency of `apps/web`, with a strict Node environment config and aliases for `@/` and `@KLTN/ui`. Add `apps/web` script `test`, a root `npm run test` delegating to `turbo run test`, and a Turbo `test` task. US14 Vitest tests use injected/mocked database objects and direct Route Handler calls with fake `Request` objects; they do not connect to Neon. Existing `tsx --test` scripts remain during this incremental adoption so unrelated suites are not silently dropped.

For UI, use pure helper/source-contract tests plus a manual checklist in US-14. Do not add Playwright or another heavy E2E framework unless a later decision explicitly requests it.

## Alternatives

- Keep only per-suite `tsx --test` scripts: no new dependency, but no unified Vitest entry point and weaker standardization for future tests.
- Add Jest: rejected because the repository is ESM/Next 16 and the requested scope does not need Jest-specific integrations.
- Add Playwright/Cypress: rejected for US14; manual UI checks are sufficient for the current public read flow and avoid browser-runtime/network complexity.
- Connect tests to Neon: rejected because tests would require secrets, network availability, and disposable-data cleanup.

## Consequences

- `npm run test` becomes a stable root/Turbo entry point for Vitest tests; existing legacy `tsx --test` commands remain explicit regression suites until a separate migration task is approved.
- Service code must accept its database dependency through parameters/factories; tests can assert visibility, projection, and error behavior with in-memory fakes.
- Route tests can call `GET` handlers directly while mocking the `db` module; no running server or database is required.
- Vitest adds a development dependency and lockfile changes. The proposal does not change production runtime or schema/migrations.
- Approval is still pending. If rejected, remove the Vitest config/script/dependency and retain the existing `tsx --test` suites; no product behavior depends on this choice.

## ADR-15 — US-19 Task185 durable indexing boundary

- **Status:** Accepted for Task185 implementation; live enablement pending worker deployment and owner review
- **Date:** 2026-10-10

### Context

Tasks181–184 provide bounded extraction, chunking, embedding and versioned
pgvector persistence, but no job lifecycle or worker runtime. The product only
allows retrieval from complete `INDEXED` documents; the current document enum has
no `INDEXING` state, and Vercel request-scoped background callbacks share the
function timeout rather than providing a durable queue.

### Decision

Task185 adds a durable job ledger and an independently invoked worker core. Job
admission uses persisted Admin authorization, the shared idempotency contract, and
a document-row lock to prevent multiple active jobs for one document across
processes. Worker claims use PostgreSQL row locks, expiring leases and fencing
tokens. Expired work before external embedding, or after embeddings are durably
saved, can be safely requeued. Expired work while a provider result may have been
charged but not durably saved becomes `UNKNOWN` and is not retried automatically.

The publication pointer, `RagDocument.status = INDEXED`, and job completion are
finalized atomically only after the generation is READY and complete. Existing
published generations remain active until that transaction commits. The PDF
reading-order heuristic is informational: retain its warning code in the job
record but do not block indexing solely for it. `PAGE_WITHOUT_TEXT` and
`UNSUPPORTED_DOCX_REGION` indicate potential omissions and fail closed;
`NO_EXTRACTABLE_TEXT` always rejects. Task185 adds no API route, upload/approval
hook, public retrieval path, or Vercel after-response worker trigger.

### Consequences

- An additive migration is required for the job table; it must be reviewed and
  separately applied to Development before any deployment uses the worker.
- Live indexing remains disabled until a durable worker runtime is deployed,
  configured, monitored, and given controlled Blob/OpenAI credentials. A timed
  Vercel request or `after()` callback is not that runtime.
- Admin admission can be wired by the later Admin task without trusting client
  paths or provider output. No Admin UI or endpoint is introduced by Task185.
- Worker execution, provider and storage remain injectable so local tests use
  synthetic documents and deterministic fake embeddings.

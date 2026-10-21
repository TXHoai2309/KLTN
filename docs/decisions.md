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

- **Status:** Responsibility boundary retained; provider choice superseded by ADR-17
- **Decision:** OpenAI handles language understanding/proposals and RAG; Google Maps Platform renders maps; Google Routes API supplies route/travel-time data for `DRIVE` and `TWO_WHEELER`; a deterministic server-side Validator decides constraint outcomes.
- **Reason:** AI output is not a source of truth for deterministic business constraints.
- **Consequence:** Missing required routing/validator data is not a pass. API keys stay server-side except the restricted browser Maps key. No OpenAI or Routes service module is present yet.
- **Date:** Existing baseline

## ADR-17 — US-29B MapLibre and Stadia routing provider (2026-10-14)

- **Status:** Accepted for US-29B by the current task instruction, replacing ADR-07's Google map/routing technology choice.
- **Decision:** Reuse MapLibre GL JS with Stadia Alidade Smooth/Dark vector styles for browser maps. Browser tiles use Stadia domain authentication; the server calls Stadia Standard Routing once per leg. Canonical `CAR` maps to `auto`, `MOTORCYCLE` maps to `motorcycle`. The server-only `STADIA_MAPS_API_KEY` never reaches the browser. A pure check compares the returned duration snapshot with the local visit gap.
- **Reason:** Keep map presentation separate from required travel-time evidence and deterministic validation while honoring the owner-selected provider.
- **Consequence:** No Google Maps or Google Routes implementation for US-29B. Route timeout/unavailability remains `INSUFFICIENT_DATA`, with no motorcycle-to-auto substitution. Production tile hostnames must be registered in the Stadia Dashboard; current itinerary persistence/UI are outside this decision.

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

## ADR-16 — Contract and provider boundary for natural-language trip preference extraction

- **Status:** Proposed — awaiting owner approval
- **Date:** 2026-10-09

## Context

US25-AI-DESIGN needs a stable, provider-facing output contract before any OpenAI call, Route Handler or review UI is implemented. US-24 already defines the canonical `TripRequirementInput`, including the supported transport values, bounds and cross-field rules. The extraction step must preserve ambiguity and unsupported values instead of silently guessing, and it must not become a second source of truth for deterministic validation.

## Decision

Propose a client-safe `preference-extraction-contract.ts` with two Zod 4 layers:

1. `modelOutputSchema` is the exact strict Structured Outputs shape. Every object is closed with `additionalProperties: false`; every property is required; optional business values are represented with `null`. Model values remain raw strings/numbers/string arrays so an unknown phrase can be returned for deterministic server verification rather than being forced into a closed enum.
2. `extractionResultSchema` is the server-verified result. A future adapter must parse the model shape, verify each extracted value with the US-24 contract, convert invalid values to `AMBIGUOUS` or `UNSUPPORTED`, and generate `clarifications` in code. The model cannot author clarifications or metadata.

The proposed provider call is a direct server-side `fetch` to the OpenAI endpoint using the JSON Schema generated by Zod 4. Do not add the `openai` package for this story. The model name must come from optional server-only `OPENAI_PREFERENCE_MODEL`; if it is missing, the future adapter returns `AI_UNAVAILABLE` and does not invent a default. Proposed operational limits are a 15-second timeout, at most one retry for network/408/429/5xx outcomes, low/deterministic sampling, and a bounded output-token setting. Input text is normalized/capped by the contract and is not stored. No raw preference text is included in result metadata.

## Alternatives

- Use the official `openai` SDK: it may provide provider-specific helpers and typed parsing, but adds a dependency/lockfile surface and couples the adapter to SDK/Zod helper behavior. Reconsider only with owner approval.
- Hardcode a model: rejected for this design because deployment/model choice and cost are not yet approved; an unset env must remain an explicit unavailable state.
- Let the model resolve relative dates or create `clarifications`: rejected because date policy and user-facing recovery must be deterministic/server-owned.

## Consequences

- The contract can be consumed by future server/client/tests without a server-only import, while only the future server adapter may call OpenAI.
- US-24 remains the authority for accepted values and readiness; model output is never a final confirmation or planner validation result.
- `OPENAI_PREFERENCE_MODEL` is a blank optional declaration in Varlock schema/example and is not synced to Vercel when empty. `OPENAI_API_KEY` remains server-only.
- There is no rate-limit infrastructure in the current repository. Enabling the future adapter without a per-user/provider rate limit creates cost and abuse risk; this remains an Open Question.
- No database, migration, storage, API route, UI or new dependency is introduced by US25-AI-DESIGN.

## Approval / review notes

- Current OpenAI Structured Outputs documentation confirms the required closed-object/required-field/null-for-optional pattern: https://developers.openai.com/api/docs/guides/structured-outputs
- The exact model, timeout/retry policy, sampling setting, max output-token limit, rate limit and relative-date handling remain proposed until the owner approves them.

## Implementation update — US25-AI-IMPL (2026-10-11)

- The server core uses direct `fetch` with the Chat Completions API at
  `POST /v1/chat/completions`, because the current official guide documents
  `response_format: { type: "json_schema", json_schema: { strict: true, ... } }`
  for this structured response use case. `store: false` is sent explicitly,
  `temperature: 0` is used for deterministic extraction, and the current
  `max_completion_tokens` field bounds output. References consulted on
  2026-10-11: [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat),
  [Chat Completions create](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
  and [Responses migration notes](https://developers.openai.com/api/docs/guides/migrate-to-responses).
- No OpenAI SDK or dependency is added. The adapter receives `fetch`, key/model
  getters, timeout, output limit, sleep and clock as injectable dependencies;
  production defaults read server-only `OPENAI_API_KEY` and
  `OPENAI_PREFERENCE_MODEL`.
- The adapter bounds response bytes, aborts after the proposed 15 seconds,
  retries at most once only for network/408/429/5xx outcomes, honors a capped
  `Retry-After`, and maps refusals/incomplete/blocked responses to a safe
  internal error. Provider request/response content and credentials are never
  logged.
- A pure prompt builder and verification wrapper enforce source-snippet
  containment, absolute-date matching and Asia/Ho_Chi_Minh past-date handling
  before calling the existing US-24 verifier. The result service has no DB,
  cache, storage, route or UI side effects.
- This implementation does not resolve the owner-pending model, rate limit,
  cost budget, DOCX alignment or future API/UI decisions. Real OpenAI execution
  is intentionally not performed in automated tests or this task.

## Implementation update — US25-API (2026-10-11)

- Added the Traveler-only `POST /api/trip-requirements/analyze` boundary. The
  route authenticates before reading request bytes, validates a strict JSON
  `{ text }` body capped at 8KB, returns only verified `ExtractionResult`, and
  never writes DB/cache/storage state.
- The route requires a matching `Origin`; an optional `Sec-Fetch-Site` must be
  `same-origin` or `same-site`. This follows the repository's existing
  cookie-authenticated POST policy and is recorded as an owner question for the
  future non-persisting but cost-bearing endpoint.
- The route explicitly selects the Node.js runtime and `maxDuration = 20`
  seconds for the adapter's 15-second timeout plus buffer. Next 16 local route
  segment documentation supports `runtime` and `maxDuration`; effective
  platform/Vercel enforcement remains unproven.
- No idempotency key or rate-limit infrastructure is added. Repeated calls are
  data-safe but may incur provider cost; rate limiting remains an open G4
  decision.
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

## 2026-10-10 — Owner-approved US19 direct request indexing MVP

The owner explicitly replaces the earlier separate durable-worker deployment
prerequisite for the current MVP. Keep the durable database ledger and existing
worker core, but invoke a single targeted job inside an awaited Node.js Admin
Route Handler. No separate service, queue, Redis, cron, after() or fire-and-forget
execution is introduced. The ledger persists; request execution itself is not durable.

POST requires persisted Admin authorization, Origin/JSON validation and the shared
idempotency contract. INDEX, RESUME and RETRY share the document's operation scope:
a committed replay does not invoke a provider; changing payload under the same key
conflicts. RESUME is an explicit new intent for QUEUED or expired work, scoped only
to this document/job. Existing expired provider-pending recovery remains UNKNOWN.
RETRY is restricted to known FAILED/TIMED_OUT/CANCELLED outcomes. UNKNOWN is an
operator reconciliation gate, with no automatic provider retry or public override.

The request has a cooperative 240-second abort budget; the route advertises
maxDuration=300. Vercel documents 300 seconds for Fluid Compute on Hobby
(https://vercel.com/docs/functions/limitations). Actual project Fluid Compute and
runtime packaging must be verified before live acceptance. The timer cannot
preempt synchronous parsing or a non-abortable database operation. Function kill,
network loss and disconnect cannot guarantee continued execution: rely on leases,
fencing, persisted provider-pending markers and explicit recovery, not background
promises. The 20 MiB upload limit is unchanged and is not a processing-time promise.

Atomic READY verification, publication, INDEXED and COMPLETED remain unchanged.
Progress is read from a consistent database snapshot. Admission SUCCESS and job
completion are separate; Admin UI polls, supports safe recovery and refreshes the
document only after observed COMPLETED. Offline code/test completion does not mean
live Blob/provider or owner acceptance. US19 remains IN_PROGRESS.

## 2026-10-15 — Destination image application-use eligibility

Owner explicitly approved removing Destination per-photo evidence/review steps. Successful new server-verified uploads may be used immediately in Destination and Editorial while legal websiteRights remains UNKNOWN and evidence/reviewer/time remain null. This supersedes the original image approval gate only; Culture, factual sources and RAG permissions are unchanged.

Use a server-owned versioned application-use marker in the existing storageReference JSON, bound to Destination and provider identity/URL. Mint only in verified upload finalization; strip client-minted/copy attempts and remove on URL/rights change or revocation. Consumers share persisted candidate filtering and exact owner/asset validation. Public use still requires VISIBLE Destination and, for magazine composition, published Editorial. No migration is required. Do not backfill untagged legacy UNKNOWN or rewrite existing Đồng Văn photos; their provenance/revocation history needs separate audit before any future activation. No fake legal evidence/APPROVED assignment, new approval loop, shared migration, commit/push/deploy or real-provider automated test.


## 2026-10-15 — Owner removes Destination Editorial AI request quotas

Owner explicitly supersedes the Editorial 3 requests/minute/Admin and 20 requests/rolling 24h/Admin policy in both Development and Production. No replacement fixed request quota is authorized. Scope is PROPOSE and ALTERNATIVE only; Better Auth, Traveler AI, RAG and Trip Planner rate limits remain unchanged.

Retain Admin authorization, one active Editorial action/Admin and four active actions/server process, with immediate release on completion/error. This is in-flight protection, not a time allowance; it is not a distributed cluster-wide cap. Retain existing provider deadlines and at most two model calls per Alternative action. Provider 429 and evidence-based Retry-After remain authoritative. Stop reading/writing the obsolete Editorial budget operation; retain historical records unchanged. No migration or shared data cleanup.


## 2026-10-17 — Owner-approved RBAC V2 capability inheritance

ADMIN inherits released Traveler capabilities while retaining Admin-only content
management. The persisted database role remains authoritative after Better Auth
identity verification. This explicitly supersedes the original US-06/product
non-inheritance rule, with no role switching, impersonation, ownership bypass or
hidden-feature activation. Private reads/writes remain scoped by the authenticated
user ID; Admin cannot access another user's Trips, Favorites or conversations.
See [RBAC V2](stories/RBAC-V2-admin-inherits-traveler.md) and its acceptance report.

## 2026-10-17 — Owner-approved Admin User Management CMS V2

The owner approves completing the existing Phase 1 CMS with real database-backed
administration, replacing its draft Phase 2 assumptions with ACTIVE/LOCKED only.
Use nullable lock metadata and persistent audit; do not invent last-login telemetry
or a SUSPENDED state. No account deletion or private Traveler-data bypass is added.

Persisted ACTIVE ADMIN authorization is mandatory. Deny self role change, lock,
unlock and session revocation in CMS; serialize CMS privilege/status mutations,
recheck the actor and preserve at least one ACTIVE ADMIN. Role change retains
sessions because current DB role controls every next protected request. Lock
revokes all stored sessions and prevents new authentication; unlock restores no
session. Explicit revoke removes active sessions without locking or changing
credentials. Record one semantic audit event atomically with the mutation and
idempotency result; lock includes its revocation count in USER_LOCKED details.

Use the installed Better Auth session-create extension with cookie cache disabled
and a PostgreSQL row-locking session-admission trigger to close sign-in/lock races.
Default runtime datasource is HTTP in both environments; retain the Phase 1 visual
system. Development migration/testing are authorized after exact environment
verification; Production migration/deployment are outside this task's authorization.
See the [implemented API contract](implementation/admin-user-management-phase2-api-contract.md)
and [acceptance report](implementation/admin-user-management-v2.md).

## ADR-18 — US-28 shares Stadia Standard Routing (2026-10-18)

Owner approves migrating US-28 from Google Routes to Stadia Standard Routing.
US-28, US-29B and US-30 share a consistent Stadia-based routing architecture.
MapLibre remains the map renderer. This supersedes ADR-07's routing choice for
US-28 only; old ADR text and dated delivery evidence remain historical.

Reuse one server-only HTTP boundary, canonical CAR/auto and MOTORCYCLE/motorcycle,
safe normalization/failure reasons, parent cancellation and per-request timeout.
Preserve US-28's 27-pair/three-concurrent/10-second budget. Duration plus distance
are mandatory for US-28 VERIFIED; US-29B/30 retain duration-only checks. Save must
fetch fresh routing and revalidate current data, never trust a proposal snapshot.
No Google fallback, guessed distance, provider response/geometry in Planner DTO,
new dependency, persistent route cache or DB migration. Optional sensitive Stadia
runtime config must not be annotated @internal; browser tiles keep domain auth.
No authorization, ownership, business scheduling, UI layout or Production change.

## ADR-19 — Opt-in knowledge expansion for public Q&A (2026-10-21)

- **Status:** Accepted and Implemented across Tickets 01–07 (2026-10-21). Offline tests, typechecks, and additive schema migration `20261021183000_add_qa_conversation_knowledge_mode` verified; database deployment and live production acceptance remain pending.
- **Context:** A production Hạ Thành question selected three Đồng Văn chunks and a Hạ Thành bibliography chunk despite an indexed Hạ Thành introduction. Separately, the owner wants more natural answers and an explicit way to supplement insufficient document evidence with model knowledge.
- **Decision:** Add a **Mở rộng kiến thức** switch: off preserves source-only Q&A; on permits document-first model supplementation and related Hà Giang travel background/advice. Model-added content uses a small **Kiến thức mở rộng** label and never borrows unsupported citations. Each chat remembers its choice when reopened; new chats start off and old answers retain their original mode. Unsupported time-sensitive facts remain explicitly unverified. Add AI question understanding before retrieval; use a normal two-AI-call path (understanding then composition), removing the separate assessor/eight-gate verifier, mandatory facet protocol and restrictive style prompts. Keep `gpt-6.1-sol` / medium. This explicitly supersedes the corresponding old public-Q&A policies, with source exclusivity relaxed only when opted in. It does not make model knowledge verified evidence or change the Planner/Constraint Validator or private-resource contracts.
- **Alternatives:** Retain source-only behavior for every question; enable model knowledge for every question. The owner selected explicit opt-in instead.
- **Consequences:** Request identity, history, answer provenance, citations and the composer represent the selected knowledge behavior consistently. The owner accepted removing independent semantic review in favor of document-first prompting and deterministic reference/mode/privacy checks. Local tickets 01 to 07 under `.scratch/assistant-knowledge-expansion/issues/` are fully implemented and verified with automated test suites. Additive schema migration `20261021183000_add_qa_conversation_knowledge_mode` is ready for deployment; existing production database behavior remains unchanged until migration deployment and live acceptance.

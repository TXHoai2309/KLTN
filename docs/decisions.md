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

- **Status:** Accepted role-assignment baseline; the original Admin non-inheritance consequence is superseded by owner-approved [RBAC V2 (2026-10-17)](stories/RBAC-V2-admin-inherits-traveler.md).
- **Decision:** Use Better Auth email/password. Roles are `TRAVELER` and `ADMIN`; public signup defaults to `TRAVELER`, with `role` configured as a non-input additional field. Bootstrap Admin is a server-side command using environment credentials.
- **Reason:** Role assignment must not be controlled by signup clients.
- **Consequence:** Server authorization and ownership checks remain mandatory. The original non-inheritance rule is historical: RBAC V2 grants ADMIN the Traveler capability for its own resources through the current shared authorization module, without an ownership bypass.
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

- **Status:** Accepted for US-29B (2026-10-14), replacing ADR-07's Google map/routing technology choice.
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

- **Status:** Accepted (2026-10-18).

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
## ADR-19 — VietMap replaces Stadia for basemap and routing (2026-10-23)

- **Status:** Accepted by the owner on 2026-10-23. Immediately supersedes ADR-17 and ADR-18; Stadia is removed, not kept as a fallback.
- **Contract:** [US-40](../stories/US-40-vietmap-provider-migration.md), [migration plan](../implementation/vietmap-migration-plan.md).

**Context.** ADR-17/18 used Stadia Alidade styles with domain-based browser authentication and Stadia Standard Routing behind a server-only `STADIA_MAPS_API_KEY`. Two problems became unacceptable: Production tile requests returned HTTP 401 because the deployed hostname was not authorized, and Stadia's route quality and label coverage for Vietnamese mountain roads are weaker than a Vietnam-specific dataset. The product is a Hà Giang itinerary assistant supporting only `CAR` and `MOTORCYCLE`, both of which VietMap serves with dedicated profiles.

**Decision.** Replace both Stadia roles with VietMap and delete Stadia entirely — no fallback provider, no dual-provider switch, no `STADIA_MAPS` value left in any contract.

1. **Rendering.** MapLibre GL JS stays the renderer. The browser loads VietMap vector `style.json` — `tm` for light, `dm` for dark — with a publishable, referer-restricted tile key. The VietMap Web SDK is not adopted.
2. **Publishable key.** `NEXT_PUBLIC_VIETMAP_MAP_KEY` is a publishable browser key, not a server secret; it is restricted by referer in the VietMap Console. This intentionally replaces ADR-17's "no frontend key" posture.
3. **Attribution.** VietMap styles carry no attribution, so every mount adds explicit `© VIETMAP` text in the compact attribution control.
4. **Routing boundary.** `CAR → car`, `MOTORCYCLE → motorcycle`, one server-only `GET /api/route/v4` per leg, no retry, no profile substitution, ≤10 s, bounded response bytes, `redirect: "error"`, `cache: "no-store"`.
5. **Normalisation.** `paths[0].time` (milliseconds) becomes `durationSeconds`; `paths[0].distance` (metres) stays `distanceMeters`; the travel-leg `provider` becomes the literal `VIETMAP`. Six failure reasons are unchanged. Geometry is normalised to GeoJSON `[lng, lat]` and validated per point, because VietMap's own documentation disagrees on whether `points_encoded=false` returns `[lat,lng]` or `[lon,lat]`.
6. **Response codes.** Route v4 answers HTTP 200 with a `code` field. `ZERO_RESULTS → NO_ROUTE`; `OVER_DAILY_LIMIT → UNAVAILABLE`; `INVALID_REQUEST` and `MAX_POINTS_EXCEED → INVALID_RESPONSE`; `ERROR_UNKNOWN` and non-2xx `→ UNAVAILABLE`; a malformed or oversized body `→ INVALID_RESPONSE`. Every path fails closed to `INSUFFICIENT_DATA`.
7. **Quota guard.** The existing 27-pair / three-concurrent / 10-second budget is kept unchanged; no second cap is added. The adapter owns an in-process circuit breaker that trips only on `OVER_DAILY_LIMIT`, holds for 15 minutes, and then returns `UNAVAILABLE` without contacting VietMap. `ZERO_RESULTS` never trips it and it never returns a cached route.
8. **Secrets.** The routing key is a query-string credential, so the adapter must never log the request URL, embed it in `AppError`, or return it to the client. Database schema is unchanged: route snapshots are still not persisted.
9. **Server-side truth.** Business layers keep calling `getTravelRoute()`; only the adapter knows VietMap.

**Alternatives.** Keep Stadia — rejected: Production tiles already fail and Vietnamese mountain coverage is weaker. VietMap Web SDK — rejected: MapLibre already owns markers, popups, pickers, workers, theme swap and tests, so switching SDK changes lifecycle for no product gain. Dual provider behind an environment switch — rejected by the owner; the migration must be complete. Proxying `style.json` through a same-origin Route Handler — rejected as ineffective, because the tile URLs inside the style still carry the key. DB-backed breaker — rejected: new table and infrastructure for a best-effort guard.

**Consequences.** A publishable browser key now exists where ADR-17 guaranteed none; every environment, including localhost, needs a valid VietMap key and an authorized referer. A wrong key or an unauthorized host produces a blank map rather than an explicit error, because the style endpoint returns 200 while tiles return 401; the existing `map.on("error")` fallback is the only signal. VietMap quota is transaction-based (25 tiles = 1 transaction; routing = ⌊points/5⌋+1), and the in-memory breaker protects a single serverless instance only, so it reduces but does not guarantee quota protection. Route v4 uses the call time as departure time when `time` is omitted, so the same leg may return a different duration at a different hour; the UI credit therefore must not claim traffic awareness and validator outcomes are not bit-for-bit reproducible across hours. There is no automated browser E2E for this migration: tile authorization is verified by a manual DevTools checklist plus the routing probe. Historical Stadia evidence documents remain untouched as history.

## ADR-20 — Streamlined trip planning flow: collapsible AI helper and manual bypass of review modal (2026-10-24)

- **Status:** Accepted by Product Owner (2026-10-24). Supersedes prior requirement that all form submissions must pass through `TripReviewDialog`.
- **Context:** The trip planning form at `/trips/new` had excessive visual complexity (~25 controls, ~2000px height) and imposed redundant cognitive load by forcing users who entered form values manually to re-review their own choices in a review dialog before proceeding to the itinerary proposal.
- **Decision:**
  1. **Two-action workflow:** The traveler only needs two mandatory inputs (duration and transport) before generating a proposed itinerary. All other fields are optional and grouped in collapsible sections.
  2. **Collapsible AI helper:** The natural-language AI helper is placed inside a closed-by-default `<details className="trip-ai-accordion">` immediately below the required fields block, reducing initial visual weight. On successful extraction, it auto-collapses while relevant populated optional fieldsets auto-expand.
  3. **Direct proposal for manual entry:** When submitting manual form inputs, the client invokes `/api/trip-requirements/check`. If confirmable, it immediately confirms the draft in memory and advances directly to the itinerary proposal step (`planner`), bypassing `TripReviewDialog`.
  4. **Strict modal retention for AI & errors:** `TripReviewDialog` is opened ONLY when:
     - The draft contains unreviewed AI-applied values (`status === "APPLIED"`), preserving the core invariant that AI output is never silently accepted without user confirmation.
     - The server check fails (`confirmable: false` or `clarificationRequests.length > 0`), opening directly focused on the first error field (`initialEditingKey`).
  5. **Departure date synchronization:** Users may generate preliminary proposals without a start date (displaying relative "Ngày 1, Ngày 2"). When a start date is chosen on the proposal screen, it is synchronized back to the form state. Official itinerary persistence remains gated on selecting a valid departure date.
- **Consequences:** Eliminates unnecessary review steps for manual entry while strictly preserving AI provenance review and server validation authority. Redundant `/evaluate` call removed in favor of single authoritative `/check`.

## ADR-21 — Google Maps for Destination Detail only (2026-10-25)

- **Status:** Accepted through the owner's explicit request to implement the scoped plan. Live Google tile and marker acceptance awaits resolution of a Google Maps `Permission Denied.` response observed on localhost.
- **Scope:** The default `/destinations/[id]` location section and published Editorial V1/V2 MAP blocks use Google Maps JavaScript API with one Advanced Marker at the Destination's own coordinates. Home retains its Google iframe; Explore, Admin pickers, trip maps, routing and other MapLibre consumers remain as they are. This is a narrow exception to ADR-19's map rendering decision, not a replacement of its routing boundary.
- **Configuration:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is a browser-visible key restricted to Maps JavaScript API and approved HTTP referrers. `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` is a browser-visible JavaScript map ID required for Advanced Markers. Billing and a production map ID are required for live use. Neither value is committed.
- **Behavior:** The map centers on `{lat: latitude, lng: longitude}` and shows one keyboard-accessible marker. Its InfoWindow contains the existing public name, area and category. Missing coordinates or browser configuration keep the Detail content usable and show the map's existing unavailable state. Google attribution remains native and visible. No Stadia or MapLibre runtime is loaded by the Detail map component.

## ADR-22 — Keyless Google iframe for Destination Detail (2026-10-26)

- **Status:** Accepted by the owner's request after the Google Maps JavaScript map returned `Permission Denied.` and the owner confirmed they have no Google Cloud access. Supersedes ADR-21 for the Detail map implementation.
- **Scope:** The default Detail location and published Editorial V1/V2 MAP blocks use an iframe centered on each Destination's own valid coordinates. Home and all other map consumers are unchanged.
- **Behavior:** The iframe uses the same keyless `maps.google.com/maps?q=...&output=embed` pattern already used on Home, with a coordinate query for Google's own location pin. It does not offer an application controlled marker or InfoWindow. A Google Maps URL opens the exact coordinates in a new tab. Missing coordinates show an explanatory state.
- **Limit:** The query iframe URL is a legacy behavior without a current Google developer API stability guarantee. Official Maps Embed API requires a key. Live browser rendering is a separate acceptance check; an iframe load event alone cannot prove tiles rendered.
- **Configuration:** Destination Detail no longer reads the Google Maps JavaScript key or Map ID. Their unused schema/example declarations are removed; local ignored `.env` values are not read or changed.
- **Link follow-up:** Coordinate-only Maps URLs show coordinate text without place details. The Detail link now uses an existing verified Google place URL when available; otherwise it opens a name/context search, labeled as a search. The iframe still anchors to the stored coordinates. A name search may show multiple results. Admin V3 currently accepts only Google links with explicit point coordinates and rejects `query_place_id` alone; a full verified place link can open a specific Google place card when its point also matches the intended Destination location.

## ADR-23 — Automatic private RAG indexing after Admin upload (2026-10-26)

- **Status:** Accepted by the product owner's explicit request in this task. Supersedes the manual `START_REVIEW`/`APPROVE` prerequisite for new uploads in US-17/18/19 and the request-scoped-only trigger in ADR-15. Historical records and their states remain intact.
- **Decision:** Admin upload finalization verifies the private file and atomically creates one `RagIndexJob` with the `UPLOADED` document. After commit, the server publishes the job ID to Vercel Queues; its callback invokes the existing leased/fenced worker. A lost queue acknowledgment returns `UNKNOWN`, and identical idempotency-key replay republishes the same job ID. Queue delivery is at least once; the DB job ledger is authoritative. Worker may move a new document directly from `UPLOADED` to `INDEXED` only after atomic READY publication. No synthetic `APPROVED` status is recorded.
- **Public gate:** Admin-uploaded content may be sent to OpenAI Embeddings before source review. New documents remain `publicQaApproved=false`. Admin must inspect the original file, source and index result, then explicitly confirm review for each document. Server accepts public approval only for active `INDEXED` documents with compatible `READY` generation. Bulk grants are disabled; revocation remains available.
- **Recovery/limits:** Existing `UNKNOWN` embedding checkpoint is never auto-retried. Failed, timed-out or cancelled jobs need explicit Admin retry. Queue and Vercel configuration require deployment validation; local tests do not prove live queue delivery, Blob or OpenAI behavior. No schema migration is needed.

## ADR-24 — Admin-triggered private RAG indexing (2026-10-27)

- **Status:** Accepted by the owner. Supersedes only ADR-23's automatic job creation and Vercel Queue dispatch. Its removal of pre-index review/approval and its separate public-use gate remain in force.
- **Decision:** Upload finalization verifies the private file and commits an `UPLOADED` document without a job. Admin explicitly clicks **Lập chỉ mục** to admit and execute a job through the existing request-scoped index endpoint and leased/fenced worker. No OpenAI embedding request is initiated by upload. Existing `QUEUED` jobs from the former flow are resumed by their job ID; no second job is created. The Queue callback, trigger and dependency are removed.
- **Recovery/limits:** The request has a 240-second cooperative budget and a 300-second route setting; it is not durable across interruption. The persisted job/progress is authoritative. Admin explicitly resumes or retries eligible work; an uncertain embedding outcome is never retried automatically. Index `READY`/`INDEXED` and individual Admin public approval remain separate. No DB schema change.

## ADR-25 — Admin-managed runtime provider configuration (2026-10-27)

- **Status:** Owner approved implementation of the [configuration CMS plan](implementation/admin-configuration-cms-plan.md). Code is local; database migration and live acceptance remain pending.
- **Decision:** Admin may replace OpenAI, Cloudinary and Stadia service credentials in an Admin-only CMS. Typed service settings are stored as authenticated-encrypted database overrides, scoped independently to Local, Preview and Production. A separate environment root key protects the database values. Runtime provider calls read the active scoped override on each operation, falling back to the existing environment value only when no override exists. An unreadable active override fails closed. Server-only status and audit APIs never return stored credentials.
- **Boundaries:** Database, Better Auth, Blob, cron, bootstrap and QA safety/abuse secrets stay in the deployment environment. QA defaults to the owner-selected `gpt-6.1-sol`/medium and Editorial defaults to `gpt-6-luna`; both can be changed through the later approved selector below. RAG embedding provenance is read-only. Browser Google iframe and Stadia tile-domain authentication do not gain a client API key.
- **Writes and rotation:** Admin writes are authorized against the current persisted role, idempotent and committed with a values-free audit event. A prior encryption root key may be supplied temporarily during rotation; an Admin rewrap action re-encrypts that environment's overrides before the old root key is removed. No provider key or root key is stored in documentation or committed files.
- **Model-selection follow-up (2026-10-28):** The owner approved independent model selectors for preference extraction, Editorial and QA. Their prior fixed model selections remain defaults. The UI shows the intersection of a reviewed compatible model set and the active OpenAI API key's `/v1/models` response. Each request uses parameters compatible with its selected model. The list does not by itself prove a successful structured-output call. RAG embedding model, QA grounding and Editorial validation remain unchanged.

## ADR-26 — Single skill-oriented Assistant runtime for V2 (2026-10-28)

- **Status:** Accepted for Assistant V2 design; implementation pending.
- **Date:** 2026-10-28

### Context

The current conversational planner is reliable at deterministic validation and persistence, but its dialogue is controlled by a fixed missing-field state machine and a language-only paraphraser. The owner wants Muse-like planning behavior now and additional capabilities such as place research and booking later, without replacing the existing KLTN planner/RAG/Trip business engine. TripSage demonstrates a useful single-runtime, server-first agent/tool pattern, while the KLTN repository already owns authorization, state, scheduling, routing, validation and idempotent persistence.

### Decision

Assistant V2 uses one server-side Assistant runtime with a skill registry and typed capability-action registry. Skills are operating policies loaded into the same runtime; they are not separate autonomous agents by default. The runtime must be skill-ready from the first vertical slice so later capabilities can be added without replacing the runtime.

V1 begins with the `travel-planning` skill only in executable scope. The locked skill taxonomy also reserves `place-research`, `itinerary-replanning`, `in-trip-assistance` and `ha-giang-qa` for later slices. `booking-assistance` is a future extension, not V1 scope.

### Alternatives

- Copy TripSage as a second application/runtime: rejected because it would duplicate or replace working KLTN domain logic and infrastructure.
- Multi-agent architecture with one agent per capability: rejected for the MVP because it multiplies model calls, state/handoff failure modes, latency and debugging surface.
- Keep the current fixed dialogue state machine and only rewrite prompts: rejected because the current next-step decision remains deterministic questionnaire sequencing.

### Consequences

The Assistant gains a stable extension seam for future skills while the current KLTN domain engine remains authoritative. Runtime tests must prove that only registered skills/actions can execute and that adding a skill does not grant new write authority implicitly. Streaming, multi-agent handoff and dynamic skill discovery are deferred.

## ADR-27 — Skills own workflow policy; capability actions own deterministic/retrieval/write work (2026-10-28)

- **Status:** Accepted for Assistant V2 design; implementation pending.
- **Date:** 2026-10-28

### Context

Treating every function as a skill would create many micro-skills and move deterministic rules into prompts. Treating every capability as only a tool would recreate the current problem where no reusable domain-level conversational policy exists.

### Decision

Create a skill only for reusable multi-step domain reasoning or conversational workflow. Use typed capability actions/services for narrow retrieval, deterministic calculation/validation, authorization and persistence.

The initial skill set is:

- `travel-planning` — executable first and the primary planning orchestrator.
- `place-research` — later reusable research/compare workflow.
- `itinerary-replanning` — later proposal-edit workflow.
- `in-trip-assistance` — later live-trip workflow using current location/remaining itinerary.
- `ha-giang-qa` — later skill wrapper around the existing grounded Q&A capability.

Destination search, RAG retrieval, route calculation, scheduling, itinerary validation, trip read/save and location resolution remain capability actions/services, not skills.

### Alternatives

- Make destination discovery, feasibility and routing separate skills: rejected because they are narrow service/deterministic responsibilities.
- Put all behavior into one `travel-planning` mega-skill: rejected because place research, in-trip behavior and future booking have reusable workflows and different action boundaries.

### Consequences

Skill files stay comparatively small and composable. Deterministic rules remain testable without a model. Future booking can be added as a skill plus approval-gated actions without changing the meaning of existing skills.

## ADR-28 — Minimum useful brief and progressive refinement replace mandatory optional-question sequencing in V2 (2026-10-28)

- **Status:** Accepted for Assistant V2; implementation pending. This supersedes the 2026-10-27 guided optional-question sequence only for V2 once the V2 path is enabled; V1 remains unchanged until migration.
- **Date:** 2026-10-28

### Context

The product flow already states that duration plus supported transport are enough for a preliminary proposal, while the current chat-first follow-up requires start date, all optional preference topics, recap and a separate generation confirmation before proposing an itinerary. In practice this makes the Assistant behave like a form wizard and delays useful output.

### Decision

For V2, duration plus supported transport form the minimum useful brief for a preliminary proposal. Unknown exact date and optional preferences do not block a draft. The Assistant asks a material question only when its answer can materially change the plan, is required for safety/authorization, or resolves an ambiguity that cannot be handled reversibly.

Exact departure date remains required before final confirmation and official Save. Unknown facts must remain unknown; progressive refinement is not permission to invent defaults. Needs recap is no longer a mandatory pre-generation checkpoint. The Assistant may recap when useful, before a consequential confirmation, or when it needs the user to verify a non-trivial interpretation.

### Alternatives

- Preserve the full guided optional sequence and only improve prose: rejected because the user still completes a questionnaire before receiving value.
- Generate from duration alone: rejected because supported transport materially affects the feasible plan and is already a locked minimum input.

### Consequences

The dialogue becomes draft-first and refinement-oriented. Existing save/date/Validator invariants remain intact. Tests must explicitly cover `2 days + car -> preliminary proposal` with no forced start-date/preferences/recap gate.

## ADR-29 — Assistant V2 orchestrates; existing KLTN planner and Validator retain authority (2026-10-28)

- **Status:** Accepted for Assistant V2 design; implementation pending.
- **Date:** 2026-10-28

### Context

The existing repository already validates AI-selected IDs, preserves mandatory/excluded destinations, resolves routes, schedules days, runs deterministic checks, limits repair attempts, rechecks selected destination data, and performs authoritative save validation. Replacing these with a model-driven TripSage planner would regress verified product invariants.

### Decision

Assistant V2 decides conversational workflow and requests typed actions. It does not decide `PASS`, fabricate route/opening evidence, authorize ownership, or persist a Trip directly. Preliminary proposal generation adapts to the existing planning engine; deterministic scheduling/routing/Validator and canonical save services retain authority.

For the first MVP, avoid a recursive free-form agent loop that invokes a second model-backed planner as an opaque nested tool repeatedly. The runtime may request one bounded planning action; the application owns its execution and returns the authoritative result for response composition.

### Alternatives

- Port TripSage's travel domain/planner wholesale: rejected because KLTN has stricter existing product invariants and data contracts.
- Let the agent call low-level scheduling/validation operations and assemble the itinerary itself: rejected for V1 because it expands the model's authority and duplicates the current planner.

### Consequences

The first V2 slice can reuse `generatePlanningProposal`, current candidate retrieval, route provider, scheduler, Validator, workspace versioning and save semantics. Later refactoring may expose finer-grained actions only when it preserves the same authority boundary.

## ADR-30 — Port TripSage runtime patterns first; defer AI SDK/provider migration (2026-10-28)

- **Status:** Accepted for Assistant V2 MVP design; implementation pending.
- **Date:** 2026-10-28

### Context

TripSage's useful patterns include typed tools, server-owned orchestration, schema validation, streaming and approval gates. KLTN currently has a bounded OpenAI JSON provider over Chat Completions and no AI SDK dependency. Adding an SDK/provider migration at the same time as the conversation architecture change would enlarge the first blast radius.

### Decision

V2 MVP ports the architectural patterns, not the TripSage application or provider stack. It introduces project-owned skill/action contracts, registry, runtime state and structured next-action decisions while continuing to use the existing bounded OpenAI provider where possible. The provider boundary must not prevent a later move to OpenAI Responses/function calling or an AI SDK tool loop.

Direct model-controlled multi-step tool calling, streaming/generative UI, Redis/QStash, TripSage Supabase/Auth/RAG and booking providers are outside the first MVP.

### Alternatives

- Add Vercel AI SDK and rewrite the provider immediately: deferred because it is not required to prove the new conversation behavior.
- Keep provider-specific logic embedded inside each skill: rejected because it would couple skill design to one model/API transport.

### Consequences

The first runnable slice has fewer dependency and provider changes. Later direct tool calling must use the runtime/action contracts rather than bypass them. Current OpenAI tool calling is compatible with application-owned function schemas when the provider migration is undertaken.

## ADR-31 — Feature-gated vertical migration with V1 preserved until V2 acceptance (2026-10-28)

- **Status:** Accepted for Assistant V2 design; implementation pending.
- **Date:** 2026-10-28

### Context

Conversational planning already has broad automated coverage, persistent dialogue/checkpoint state and owner-tested UI behavior. Replacing it in one change would make regressions difficult to isolate.

### Decision

Implement V2 as a feature-gated path alongside V1. The first tracer bullet handles only new-trip conversational planning through the `travel-planning` skill and reuses existing persistence/planning services. Existing saved-trip editing, official Save, Q&A, in-trip behavior and V1 remain unchanged until their dedicated V2 slices pass acceptance.

No database schema change, streaming conversion or provider migration is required for the first vertical slice. Remove or retire V1 questionnaire/canonical-paraphrase paths only after V2 behavior/evaluation is accepted.

### Alternatives

- In-place rewrite of the current planning module: rejected because rollback and before/after evaluation would be harder.
- Build the full five-skill runtime before exposing any behavior: rejected because it delays end-to-end learning and conflicts with the owner's run-first preference.

### Consequences

Each ticket can ship and be demonstrated independently. Temporary duplication is accepted during migration. Tests must cover both feature-flag states until V1 is retired.

## ADR-32 — Read-only planning guidance and explicit regenerate in the V2 runtime (2026-10-29)

- **Status:** Accepted for Assistant V2-08; implemented with controlled tests, live acceptance pending.
- **Date:** 2026-10-29

### Context

After a proposal, an advice request such as "gợi ý cho tôi nên đi như nào" had no intent. The classifier returned CLARIFY and the session answered with the fixed question "Bạn muốn điều chỉnh cụ thể điều gì trong đề xuất này?". The wording gate also rejected natural advice (times, unknown numbers, a second question).

### Decision

Add `ADVISE` and `REGENERATE` to the planning understanding/analysis intents, defined only in the V2 prompt (V1 normalizes both to NEEDS). Add one read-only `PLANNING_GUIDANCE` goal to `travel-planning`: it derives signals deterministically from the stored canonical proposal (`analyzeCurrentProposal`), never changes needs, version, proposal, pending clarification or UNKNOWN state, never generates, publishes, saves or applies, and may run while a clarification or UNKNOWN is pending. Its wording is gated by claims that would be false or unsupported (change/save/validity, atmosphere facts, numbers not in the plan), retried once with the rejection reason, then rendered deterministically. `PRESENT_PROPOSAL` leads with route rationale before the validation caveat; failed generation maps stable action error codes to what happened and what to do next. An explicit rebuild request regenerates from the known brief through the existing refine action.

No new agent, skill, schema, provider or capability is introduced.

### Alternatives

- New Planner/Advice agent or skill: rejected; the boundary is conversation policy inside the existing runtime.
- Phrase lists or regex for advice: rejected; paraphrases are the classifier's job and a list is brittle.
- Let the model answer freely with no gate: rejected; read-only advice must not claim changes, saves, validity or unsupported facts.
- Hide `[TEST]` destinations in the UI: rejected; the Dev data issue belongs to the data layer.

### Consequences

Guidance quality depends on the real classifier separating ADVISE from CLARIFY/NEEDS, which only a live run can show. Compound advice plus edit still executes the explicit edit first. Overnight structure, lodging and weather remain out of scope (V2-09).

## ADR-33 — Trip structure keeps days and nights separate; overnight is a planning annotation (2026-10-30)

- **Status:** Accepted for Assistant V2-09; implemented with controlled tests, live acceptance pending.
- **Date:** 2026-10-30

### Context

"2 ngày 1 đêm" was reduced to `durationDays = 2`. The trip requirement contract (US-24), the Save payload and `trip.durationDays` have no night or lodging concept, and no lodging data exists in the product.

### Decision

Add `tripStructure` (`overnightCount`, optional `overnightAreas`) to `PlanningNeeds` only, not to `requirement`, the Save payload or the database. Nights are never derived from days; more nights than days is clarified, not fixed. An overnight anchor is an *area* taken from a destination's `area` (derived from the day-end stop, or an area the user chose that some destination belongs to). It is not a stop and is never a lodging, price, availability or booking. A user's area choice is a preference applied by deterministic arrangement of the selected stops (not by prompting the model, which over-packed a day in live runs) and reported honestly when unmet; it is not a Validator rule. Existing cross-day routing is reused unchanged.

### Alternatives

- Add `overnightCount` to the trip requirement and database: rejected; it spreads into the form, Save validation and a migration for a planning-only concept.
- Derive nights as days minus one: rejected; "3 ngày 3 đêm" and night buses are real and explicit user facts win.
- Insert a lodging stop or waypoint into routing: rejected; it would count as a visit and needs lodging data that does not exist.

### Consequences

The chosen areas are lost when a trip is saved and are not shown in saved-trip or in-trip views. A night-area change rebuilds the itinerary. Lodging research and booking remain a separate future capability.

## ADR-34 — Safety gates differ from style gates; fixed replies belong to code (2026-10-30)

- **Status:** Accepted and implemented in Assistant V2-10; final evaluation (24 scenarios, 4 comparable V1 pairs all V2-better, fallback 16.7%) in `docs/implementation/assistant-v2-evaluation.md`.
- **Date:** 2026-10-30

### Context

Reply checks on model wording currently mix two different things. Some protect the traveler (never claim a proposal is saved or valid without evidence, never name lodging or prices, state an unmet night area, say "last known" while a write is uncertain). Others only enforce phrasing, such as requiring the literal words for "preliminary" and "insufficient data" or per-topic keywords. The style rails make a useful model reply get replaced by a fixed sentence and cause the repeated caveat. Separately, edit outcomes, factual-answer wrappers, failures and every saved-trip reply are already fixed sentences built by code.

### Decision

Keep the safety checks strict and remove or relax the phrasing rails. A reply that creates or changes a proposal must convey "not saved" in one short clause of any wording and name the concrete cause of an incomplete check; read-only turns carry no caveat unless the traveler asks about checks, the date or saving. Number claims are checked by unit (minutes, stops, days, nights, clock time) against facts of the same kind. Fixed replies stay code-built from verified facts and are rewritten to sound natural; no model call is added to them. Saved-trip replies keep three distinct states: proposal not applied, awaiting confirmation, applied only after the database confirmed the write.

### Alternatives

- Let the model write every reply with a large prompt: rejected; it moves business safety into prose and adds model calls to the most sensitive replies.
- Keep all gates and only edit prompts: rejected; the gates would keep rejecting natural wording.
- Track caveats already shown in conversation state: rejected; a stateless per-turn-type rule is simpler and needs no new capsule field.

### Consequences

Wording tests assert required facts and forbidden claims instead of exact sentences. A rejection counter per composed goal measures how often model wording is replaced by a fallback. Dropping literal phrases means read-only turns no longer remind the traveler that the plan is unsaved, which the caveat policy offsets on proposal-changing turns and on questions about saving.


## ADR-35 — One assistant chat; guests are Q&A-only; V1 retired (2026-10-30)

- **Status:** Accepted and implemented in [ASSISTANT-SKILL-RUNTIME-V1-RETIREMENT](stories/ASSISTANT-SKILL-RUNTIME-V1-RETIREMENT.md). Supersedes the rollback-switch clause of ADR-31 ("V1 preserved until V2 acceptance"); V2 was accepted by V2-10 (READY_TO_FREEZE_V2, ADR-34) and the live check in the retirement story.
- **Date:** 2026-10-30

### Context

ADR-31 kept the V1 chat and a server switch (`ASSISTANT_RUNTIME_VERSION`) as a rollback path while V2 was unproven. V2 is now accepted. Keeping both meant two chat experiences, two test suites, a V1 branch in the planning route, and a deployment setting that could silently send travelers back to the weaker form-like V1.

### Decision

There is one assistant chat for everyone. Signed-in travelers keep the full V2 experience. A Guest (no account, identified only by the guest cookie) uses the same chat in Guest mode: Q&A only, answered by the existing Q&A service under the existing abuse limits; a request to plan is answered with an invitation to sign in and the unsent text is kept through the existing planning auth hand-off. Saved-conversation links open in the same chat. V1 (the V1 chat client, the runtime switch, the V1 branch of the planning route, the V1 page fallbacks) is deleted and is not an available fallback. The server no longer reads `ASSISTANT_RUNTIME_VERSION`; a deployment that still sets it is unaffected. The planning route serves only the `ASSISTANT_V2` action and rejects any other action with `INVALID_INPUT`. The session bootstrap returns identity only. Guests never get planning, a V2 session, workspace saving or trip writes.

### Alternatives

- Keep the switch but default it to V2: rejected; it keeps the V1 code and the silent downgrade risk.
- Hide the chat from guests: rejected; guests lose public Q&A that works today.
- Let guests plan and claim the work on sign-in: rejected; it creates account-owned data for an unauthenticated principal.

### Consequences

Rollback is by reverting the single retirement commit, not by a setting. The Q&A service, `/api/ai/ask`, `/api/ai/conversations`, guest identity, abuse limits and the planning auth hand-off are unchanged. No schema change and no stored conversation is deleted. Where the chat cannot start (Q&A gate closed), `/assistant` shows an unavailable state instead of a local demo. Live evidence and its gaps are recorded in the retirement story.

## ADR-36 — Weather is an advisory, never a Constraint Validator input (2026-11-18)

- **Status:** Accepted at planning level by the owner ("đồng ý hết", 2026-11-18). Lifts the earlier exclusion of weather for the scoped features below. Not implemented; stories pending.
- **Date:** 2026-11-18

### Context

Weather was out of scope (`product/trip-origin-spec.md`). The owner approved destination forecasts, visit-time weather on itineraries, weather along route legs and sun times. Forecasts exist only for roughly the next 16 days and change between updates, and repo rules say missing required validation data is never a pass.

### Decision

Weather and sun times produce **weather advisories** and an after-sunset advisory shown on proposals and saved trips. They never change a Constraint Validator result and never block proposing or saving a trip. Days beyond the forecast horizon show "forecast not yet available" with no substitute values. Saved trips do not store a weather snapshot; the forecast is fetched (through a server cache) when viewed. Advisory thresholds (rain ≥ 70 % or ≥ 5 mm/h, visibility < 1 km, gusts ≥ 40 km/h) are owner-set and uncalibrated. Data comes from Open-Meteo (non-commercial, server-side, attributed) and a local sun-position library; no code, formula, data or UI is taken from SkyRadar.

### Alternatives

- Weather as a hard constraint: rejected; every trip beyond the forecast horizon would fail validation as missing data.
- Store a forecast snapshot with each saved trip: rejected; it goes stale and needs new tables.
- Fill missing days with climate averages: rejected; it presents estimates as forecasts.

### Consequences

The Validator and its tests are unchanged. A forecast provider outage degrades to an unavailable notice, not a failed trip. An "outdoor" flag on destinations is needed for the after-sunset advisory (migration and admin form). Cloud-sea likelihood, landslide risk from accumulated rain and official warnings remain future work.

### Addendum (2026-11-18): Assistant

The Assistant answers Weather questions for Guests and travelers, and a turn that creates or changes a proposal may add one line naming at most two of the heaviest advisories. Question understanding adds a `WEATHER` intent and a validated `weatherDate`; the server checks the date and re-reads the forecast, and neither model nor keyword code decides weather facts. Weather numbers and advisories are shown as a code-built card; the model writes only a short lead-in. The Assistant never says whether the traveler should or should not go. Weather questions count toward the existing Q&A abuse limits. Saved-trip weather questions (in-trip skill) were initially deferred here and are now enabled for the unified `Saved-trip assistant` under [ADR-38](#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19).

### Addendum (2026-11-18): Scheduling soft preference (planned, not implemented)

- **Status:** Accepted at planning level by the owner (2026-11-18, Q1–Q11 grill). Not implemented; awaiting story and coding authorization.
- **Decision:** Both the form planner and Assistant planner (including `journey` round-trips within origin/return bounds and scoped `affectedDays` edits) may use sun times (`isOutdoor` destinations scheduled before sunset, or earlier in the day when no `startDate` is set) and destination forecast advisories (reusing the exact ADR-36 rain/fog/wind thresholds) as **soft scheduling preferences** to reorder visits within a day or swap days, without changing Constraint Validator outcomes or blocking saves.
- **Guardrails:**
  1. **User constraints win:** Must-visit stops and explicit user time/day locks are preserved; the scheduler never silently drops a user-requested destination. (The Assistant may suggest an indoor alternative in prose when an entire day has severe advisories, leaving the choice to the user.)
  2. **Validation & route efficiency win:** Weather/sunset reordering is applied only if it introduces no new Constraint Validator `VIOLATION` and keeps added driving/riding time within `<= 20%` (capped at `+30 minutes/day`) of the distance-optimal baseline.
  3. **Graceful degradation:** Beyond the 16-day forecast horizon, without `startDate`, or when Open-Meteo fails/times out (~2.5s scheduling budget), forecast signals are skipped and planning proceeds normally (`suncalc` remains available whenever `startDate` is present).
  4. **Explainability:** When weather/sun-time preference actively changes the order or day assignment, a short note is shown in the proposal warnings / Assistant reply. Leg weather remains advisory-only after scheduling.

## ADR-23 — Travel companions preserve single Trip ownership (2026-10-28)

- **Status:** Accepted at planning level through the owner's Q17 confirmation, “Đồng ý chốt bản kế hoạch, chưa triển khai code”. Not implemented; no authorization to start coding.
- **Context:** The original MVP excluded trip collaboration and limited Trip access to the owner. The owner approved public companion discovery, immediate joining and group chat in the [design record](implementation/trip-companions-design.md), while Q1 preserves host-only edits and Q6 selects the latest officially saved itinerary for member reads.
- **Decision:** Retain one Trip owner and one authoritative saved itinerary. A linked publication exposes an explicit public allowlist, and current membership grants itinerary/group-chat reads through a distinct authorization boundary. Joining never transfers ownership or grants edit permission. Existing private Trip endpoints and Admin role isolation remain owner-scoped. The [product extension](product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28) is a scoped exception for publication/member reads/chat, not shared ownership or collaborative editing.
- **Alternatives:** Collaborative editing was rejected by Q1; a separately maintained group itinerary was rejected by Q6. Reusing the complete private Trip DTO as public content would cross the approved visibility boundary.
- **Consequences:** Future stories need server-side membership/capacity enforcement, bounded public/member projections, atomic itinerary revision/group notices, access revocation and a deletion guard for Trips that have had members. Group history survives recruitment closure/withdrawal, chat continues after completion and cancellation makes user chat read-only. This is a durable data/authorization boundary; migrations, APIs and UI implementation remain separate future work.

## ADR-36 — Port the tripsage-ai chat/agent to replace the planning chat (2026-11-14)

- **Status:** Proposed. The owner approved the feature-group scope amendment on 2026-11-20. P1–P5 are implemented behind flags. Local P6 verification does not approve the rollout. P4 database deployment and live acceptance are pending. Story [TRIPSAGE-CHAT-ITINERARY-PORT](stories/TRIPSAGE-CHAT-ITINERARY-PORT.md).
- **Date:** 2026-11-14

### Context

The owner wants the tripsage-ai chat block (UI, streaming route, tool-loop agent) to replace the current planning chat, with research from Google and the web. tripsage-ai has no scheduler, Constraint Validator or SUCCESS/FAILED/UNKNOWN contract; KLTN does. ADR-35 keeps one chat and guests Q&A-only.

### Decision

Copy-then-adapt the tripsage chat block under its MIT license (notice kept in `NOTICE`), behind a feature flag, for signed-in Travelers. Agent output goes through `PlanningSelection`, `scheduleSelection`, the Validator and the existing Save contract. The original Q24c decision excluded Amadeus. The 2026-11-20 amendment allows hotel lookups through Amadeus and adds flight lookups through Duffel.

### Invariants changed (each needs owner approval)

1. Place source: no longer limited to VISIBLE KLTN destinations; Google/web places allowed via a new `ExternalPlace` table (Prisma migration).
2. Routing provider: Stadia remains default; a Google adapter is added behind a config flag.
3. Dependencies and providers added: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, Google, web search, Firecrawl.
4. Save gate: a FAILED check still blocks Save, but "unchecked" items (validation data missing) no longer block. Save then needs explicit user confirmation and the Trip stores which checks were unchecked. Unchecked is never recorded as PASS. This relaxes the earlier "Save blocked unless PASS" and needs a Save-contract design and migration.

### Implementation status (updated 2026-11-14, still Proposed)

- Invariant #4 is implemented in code by Ticket 09 (design: [unchecked-save-design.md](research/unchecked-save-design.md)): FAILED and non-external missing data still block; unchecked data of external places is saved only with an explicit confirmation equal to the server's list, stored in `trip.uncheckedChecks` and never as PASS. Migrations `20261114120000_external_place` and `20261114130000_trip_unchecked_checks` are created but NOT applied to any database. This ADR stays Proposed until the owner approves it.

### Trạng thái thực thi (Ticket 12, 2026-11-14; ADR vẫn Proposed, chỉ chủ dự án duyệt)

- Đã code trên nhánh `feat/tripsage-chat-itinerary-port` (chưa merge/push), sau cờ `TRIPSAGE_CHAT_ENABLED`: chat stream, tool-loop 5 tool, cổng thông tin bắt buộc, Save idempotent, adapter Google Routes sau cờ, searchPlaces, webSearch/fetchPage (Firecrawl, SSRF guard), lịch có điểm ngoài danh mục (60 phút ước tính), Save có xác nhận mục chưa kiểm, lỗi/giới hạn tiếng Việt.
- Hai migration (`20261114120000_external_place`, `20261114130000_trip_unchecked_checks`) đã tạo, CHƯA áp lên DB nào; test PostgreSQL opt-in chưa chạy.
- Kiểm: tsc sạch, build production chạy được, Vitest đúng 51 test đỏ baseline (cộng 8 test lỗi do thứ tự mock, không do nhánh), quét bundle sạch. Chưa chạy: trình duyệt, OpenAI/Google/Firecrawl thật, so sánh selector cũ.
- Chi tiết và việc chủ dự án phải làm: [tripsage-port-handoff.md](research/tripsage-port-handoff.md).

### Owner-approved feature groups (2026-11-20)

The owner approved budget estimates, flight lookup, hotel lookup, long-term memory and ICS calendar export in planning chat. Each group has an independent server-side flag. Flights and hotels are for lookup and reference prices only, with no booking or payment.

P1 adds `TRIPSAGE_FEATURE_BUDGET`, `TRIPSAGE_FEATURE_FLIGHTS` and `TRIPSAGE_FEATURE_HOTELS`. Each is off by default and enabled only by the exact string `true`, read once per request. A disabled group contributes neither a registered tool nor system instructions. With all groups disabled the base prompt and tool set are preserved. The budget tool calculates estimates independently of the Constraint Validator. P3 adds result cards.

P6 verifies exact-string matching through the Next.js configuration loader. The five group declarations use strings so Varlock preserves the raw values. The group defaults remain `false`.

P2 uses Duffel for flights and Amadeus for hotels, matching the two TripSage domains. Each provider is resolved lazily for its tool and uses separate server credentials. Missing credentials or a provider failure affect only that search group. The tools return reference prices for lookup only. Booking, payment, persistence of search data and use of offers as itinerary candidates are out of scope.

**2026-11-22 amendment (SerpApi lookup replacement):** Amadeus Self-Service shut down on 2026-07-17 and invalidated existing keys, and Duffel live pricing requires an approved commercial account. Both providers are replaced by SerpApi (`google_hotels` for lodging reference prices and `google_flights` for reference flight prices), sharing server-only `SERPAPI_API_KEYS` with sequential key fallback on quota exhaustion. All TripSage P1/P2 invariants remain unchanged: lookup and reference prices only, behind `TRIPSAGE_FEATURE_FLIGHTS` / `TRIPSAGE_FEATURE_HOTELS`, with no booking, payment, persistence of search results, or use of lookup results as itinerary/Validator candidates. See [serpapi-travel-lookup-spec.md](specs/serpapi-travel-lookup-spec.md) (decisions D1–D10).

P4 adds a per-traveler memory behind `TRIPSAGE_FEATURE_MEMORY`, off by default. The model calls recall only when needed. The server does not inject memories automatically. A save requires an explicit request or a clear travel preference or constraint from the latest user message. The server filters sensitive data before embedding or storage. Saved items are preferences, constraints, or expressly requested notes. Travelers can list, delete one, or delete all of their own items. Recall remains untrusted data and does not change the Validator. The additive pgvector migration awaits owner deployment.

P5 adds a local iCalendar download for saved trips from the trip detail page. `TRIPSAGE_FEATURE_CALENDAR` is off by default and controls the download route and link. The existing saved-trip read grants access to the owner or active companion members and supplies each reader's existing view. The calendar exports timed stops, public location information and applicable unchecked notices. The trip origin and its coordinates are excluded. The export runs without OAuth, a calendar API, database writes, or model tools and instructions.

### Personal data

Memory sends accepted content to OpenAI to create an embedding. Recall also sends a query that passes the sensitive-data filter to OpenAI for embedding. The Vietnamese memory panel discloses the transfer for saved content and tells Travelers they can delete it at any time. Deleting one or all items removes KLTN memory records. The additive database migration defines `ON DELETE CASCADE` from the Traveler account, and its opt-in test asserts this behavior. Provider-side data handling remains subject to the deployment review.

The [feature group progress log](implementation/tripsage-feature-groups-progress.md) records implementation and verification by phase.

### Invariants kept

Validator separate from AI, missing data is never reported or stored as a pass, FAILED blocks Save, `executeIdempotentWrite` with SUCCESS/FAILED/UNKNOWN, Prisma migrations only, secrets server-side, thin Route Handlers, server-side ownership, guests Q&A-only.

### Alternatives

- Replace everything including Validator and Save (option A): rejected; breaks locked invariants.
- Replace only the AI proposal layer (option B): not chosen by the owner.
- Port streaming/UX only (option C): too small for the goal.

### Consequences

Old flow stays in code; rollback is turning the flag off. Open risks are in the story's Open Questions, notably external places lacking validation data.

## ADR-37 — Unified stateless client Edit draft and atomic edit apply (2026-11-18)

- **Status:** Accepted at design level by the owner (2026-11-18); implementation pending. Supersedes the separated manual/AI draft flow and 4-visits-per-day edit cap in `US-32` / `US-33`, and unifies saved-trip routing and `journeySnapshot` recalculation on `/trips/[id]/edit`.
- **Date:** 2026-11-18

### Context

The existing `/trips/[id]/edit` implementation had four structural gaps verified in repository inspection:
1. `AiEditPanel` (`/api/trips/[id]/edits/ai`) always read the persisted DB trip, supported only one primitive operation per turn, and maintained a separate diff/confirm/apply UI disconnected from `EditTripClient`'s manual candidate.
2. `edit-candidate.ts` enforced `MAX_EDIT_VISITS_PER_DAY = 4` from the preliminary planner despite `US-32` (`OQ-F`) and `tripProposalSchema` only bounding total trip visits at 50.
3. `/api/trips/[id]/edits/preview` and `/apply` called uncapped Stadia routing directly rather than the shared `PLANNER_ROUTING_PROVIDER` adapter, and `applyEdit` did not recalculate `journeySnapshot`, invalidating `journey.plan` on `/trips/[id]` while forcing origin/time edits into a separate modal that forbade visit changes.
4. `getTripForEdit` rejected trips containing `ExternalPlace` visits with HTTP 501 (`EXTERNAL_PLACE_UNSUPPORTED`), and `/trips/[id]/edit` lacked `COMPLETED`/`ONGOING` lifecycle protection and a `409` rebase workflow.

### Decision

1. **Unified stateless `Edit draft`:** Keep one canonical `Edit draft` (`bản nháp chỉnh sửa`) in browser memory (with in-session Undo/Redo and ephemeral AI conversation turns; no new database draft table). Both `/edits/ai` and `/edits/preview` accept the current client `Edit draft` plus `baseRevision` and return verified changes/validation without mutating PostgreSQL. AI acts on the draft (supporting multi-operation batch edits, chained time adjustments, destination suggestions, pre-departure origin/clock edits, and read-only `Planning guidance`), pouring accepted mutations onto the shared draft with 1-click Undo.
2. **Single atomic `/edits/apply` boundary:** Consolidate visit replacement, optional `journeySnapshot` update/recalculation, `uncheckedChecks` re-assessment and acknowledgement for existing `ExternalPlace` visits, companion itinerary notices, and CAS `updatedAt` advancement into one atomic idempotent write (revalidating outside the transaction).
3. **Consistent rules across Trip workflows:** Remove the `4`-visits/day edit cap (retaining max `50` visits total and at least `1` visit), enforce `COMPLETED` lock and `ONGOING` elapsed-visit preservation, route preview/apply through the configured `PLANNER_ROUTING_PROVIDER`, and support client `409` rebase onto the latest saved revision.

### Alternatives

- Keep manual and AI editing in two separate tabs/flows: rejected because travelers cannot iteratively combine manual tweaks and AI adjustments before saving once.
- Persist edit drafts in a new Prisma draft table: rejected because it adds schema/migration complexity and diverges from the product rule against long-lived unvalidated drafts.
- Keep `journeySnapshot` editing isolated in a modal on `/trips/[id]` and uncapped Stadia routing in `/edits/*`: rejected because visit edits invalidate `visitFingerprint` and produce conflicting travel times between Detail/Planner and Edit.

### Consequences

- Request/response schemas for `/edits/ai`, `/edits/preview`, and `/edits/apply` must be updated cleanly (including client `Edit draft` validation, `journey` fields, and `acknowledgedUnchecked`).
- `ONGOING` manual/AI edits share `preserveCompleted` invariants with `in-trip`, and `journey` changes remain blocked at/after Vietnam departure.
- Existing `US-32` / `US-33` unit and route test suites will be updated alongside implementation to verify the unified contract.

## ADR-38 — Unified Saved-trip Assistant and 2-step Grounded Advisory Pipeline (2026-11-19)

- **Status:** Accepted at design level by the owner (`Q1–Q10` grill, 2026-11-19); implementation pending coding authorization. Extends `ADR-37`, supersedes the separate legacy `US-35`/`US-36`/`US-37` `/trips/[id]/in-trip` UI and mechanical `buildGroundedAdvice` template, and lifts `ADR-36`'s saved-trip weather exclusion for the unified `Saved-trip assistant`.
- **Date:** 2026-11-19

### Context

Even after `ADR-37` unified manual editing and `AiEditBar` on `/trips/[id]/edit`, two gaps remained:
1. `/trips/[id]` still exposed two separate editing/assistant routes (`/trips/[id]/edit` and `/trips/[id]/in-trip`), where `/in-trip` ran legacy single-operation `US-35`/`36`/`37` replanning against the database (rejecting `ExternalPlace` with 501, ignoring `Trip origin` and weather, and forcing GPS for any same-day edit).
2. Inside `/trips/[id]/edit`, `AiEditBar` (`ai-workspace-plan.ts`) answered `ADVISED` turns with a deterministic string template (`buildGroundedAdvice`) rather than an LLM-composed reasoning response, could not simulate multi-option remedies for scenario questions (such as creating a morning `Schedule rest buffer` or handling delays), and could not answer local RAG/knowledge or trip-weather questions in the same thread.

### Decision

1. **One unified `Saved-trip assistant` workspace (`/trips/[id]/edit` & `/trips/[id]/in-trip`):** Merge the saved-trip AI assistant and manual edit workspace around the single client `Edit draft` (`ADR-37`). Both routes render the same unified workspace (with `/trips/[id]/in-trip` focusing the conversational AI Assistant panel by default so existing links remain valid). Desktop shows the conversational AI Assistant panel alongside the interactive Timeline and sticky `ItineraryMap`; Mobile (`360px+`) provides `Trợ lý AI` | `Lịch trình` | `Bản đồ` tabs with quick jump/undo banners.
2. **Full capability parity & conditional GPS:** The AI assistant operates on the cumulative in-session `Edit draft` (up to 16 recent conversation turns, Undo/Redo stack, `50`-visit trip cap, multi-op batch edits, `auto-shift`, pre-departure `Trip origin` and clocks, existing `ExternalPlace` + `uncheckedChecks`, `ONGOING` elapsed-visit lock, `COMPLETED` read-only lock, and `409` Rebase). GPS or manual current location is requested **only** when the trip is `ONGOING` and the traveler's request materially depends on current physical position. Trip frame fields (`startDate`, `durationDays`, `transport`) remain fixed.
3. **2-step Grounded Agent Pipeline for all 7 traveler question archetypes:**
   - **Step 1 (Intent & Server Dry-Run Simulation):** Classify the turn across 7 archetypes (holistic schedule evaluation, `Schedule rest buffer` / delay scenarios, smart `VISIBLE` KLTN catalog destination swap/addition suggestions up to 3 options, direct single/multi-op edits, compound evaluation + edit, local RAG + labeled `Kiến thức mở rộng` Q&A, and trip weather/sun-times/next-visit status). For scenario or advisory turns, the server dry-runs up to 2 candidate remedies against the routing provider (`PLANNER_ROUTING_PROVIDER`), `Constraint Validator`, `suncalc`, and live Open-Meteo forecasts.
   - **Step 2 (Grounded LLM Advisory Composer & Server-Packaged Action Cards):** The LLM composes natural Vietnamese advice strictly from the server-verified facts of Step 1 without mutating the `Edit draft` on read-only turns. Concrete remedies are attached as server-verified **`Actionable advice suggestion`** cards (`1-click apply to Edit draft` without a second LLM call). If the composer call fails or times out, the server falls back to the deterministic summary of verified facts.
4. **Scoped `ADR-36` weather integration for saved trips:** The `Saved-trip assistant` reads live destination forecasts and sun times for the trip's dates to advise on outdoor timing, rain/fog/wind advisories, and indoor/reschedule alternatives, while preserving `ADR-36`'s core rule that weather never alters `Constraint Validator` results and never issues absolute safety guarantees.

### Alternatives

- Keep `/trips/[id]/in-trip` on the legacy `US-35`/`36`/`37` session separately from `/trips/[id]/edit`: rejected because it duplicates saved-trip editing with weaker rules and incompatible draft state.
- Let the LLM directly output free-text itinerary advice and schedules without server dry-run validation: rejected because it can hallucinate travel times, opening hours, or false `PASS` states.
- Allow Google Places (`searchPlaces`) to add new `ExternalPlace` stops inside saved-trip editing: rejected by owner choice (`Q5 = A`) to preserve catalog opening-hour verification and avoid mandatory Google Places dependency in the core edit flow.

### Consequences

- `/api/trips/[id]/edits/ai` and the workspace AI panel expand to support the 2-step grounded advisory composer, dry-run candidate remedies (`Actionable advice suggestion` payloads), interleaved RAG/weather lookups, optional `ONGOING` location context, and a 16-turn session history cap.
- `/trips/[id]/in-trip` and `/trips/[id]` entry actions converge on the unified workspace without breaking existing URLs or test seams.

### UI & Workspace Architecture Update (2026-11-19)

- **Decision:** Replace the double-decker header toolbar + fixed 3-column desktop grid with an **`Assistant Sidebar Shell` + `AI-first Progressive Canvas`** matching the `/assistant` fullscreen layout (`calc(100svh - 65px)`):
  - **Left collapsible sidebar (`280px` on desktop, slide-over drawer on mobile):** holds trip identity/metadata, mode switcher (`Trợ lý AI`, `Lịch trình`, `Bản đồ & Kiểm tra`), optional right-side **Canvas** toggle, validation status chip, Undo/Redo, and the atomic `Lưu thay đổi` CTA. Opening the right-side Canvas automatically collapses the sidebar so at most two regions appear at once.
  - **AI-first flow & noise elimination:** Both `/trips/[id]/edit` and `/trips/[id]/in-trip` open in the zoomed-in `Trợ lý AI` view by default (`65–72ch` readable measure). Applying or saving edits keeps the chat stream stable and surfaces a concise inline/toast action (`Mở Canvas xem ngay` / `Hoàn tác`), while `aria-live` status announcements for verbose AI advisories stay visually `sr-only`.
  - **Progressive Disclosure on manual Timeline & Map controls:** Each `Scheduled visit` renders a compact single-row summary with a collapsible `<details>` disclosure for time/order adjustments (keeping 1-click error recovery immediately visible on violated rows), and Map validation renders as a compact status strip above the map.

## ADR-39 — Saved-trip assistant answers through a bounded tool-using reasoning loop (2026-11-21)

- **Status:** Accepted by the owner ("làm luôn cả 2 giai đoạn A và B", 2026-11-20) and implemented locally; live OpenAI evaluation not yet run. Amends `ADR-38` Step 1/Step 2 for `/api/trips/[id]/edits/ai`. Spec: [saved-trip-assistant-reasoning-spec.md](product/saved-trip-assistant-reasoning-spec.md).
- **Date:** 2026-11-21

### Context

Production replies on `/trips/[id]/edit` repeated the deterministic `buildGroundedAdvice` template (for example, a question about where and when the trip departs got the same summary as the previous turn). Three causes were found in code: (1) the composer fell back silently and logged nothing; (2) the route used the preference-extraction client, which sends `reasoning_effort: "none"`, `temperature: 0` and 1,200 completion tokens, so the model did not reason and `finish_reason: length` discarded answers; (3) a 15-topic classifier routed every turn into hand-written scenario branches, so any question without a branch fell to a fixed summary.

### Decision

1. Every Saved-trip assistant model call uses `gpt-6.1-terra` with `medium` reasoning (owner choice, same as Q&A and planning). There are no cost, token or turn caps; only a loop guard (12 rounds / 24 tool calls) and the route's Vercel `maxDuration` (300 s) remain.
2. After the deterministic gates (ownership, revision, `COMPLETED`, trip-frame requests, GPS-dependent `ONGOING` turns), one reasoning loop on the OpenAI Responses API answers the turn. The model reads the verified draft context and may call server tools: `simulate_changes` (verify → apply operations/origin clocks on a copy → routing + Constraint Validator), `search_destinations` (VISIBLE catalog only), `get_weather` (advisory only, `ADR-36`) and `lookup_local_knowledge` (existing RAG/`Kiến thức mở rộng` path).
3. The model only proposes. Its final JSON may reference simulation IDs created in the same turn; the server builds the `PROPOSED` candidate or the `Actionable advice suggestion` cards from those simulations, never from model text. Unknown IDs are ignored. The fact guard still rejects false PASS claims, leaked IDs, URLs and absolute weather-safety claims.
4. Any agent failure (provider error, loop guard, invalid final output, fact-guard rejection) returns the turn to the unchanged `ADR-38` pipeline, which now also uses Terra and logs why its composer fell back. Logs carry codes and timings only, never conversation text, locations or keys.
5. The loop is on by default; `TRIP_ASSISTANT_AGENT=off` restores the `ADR-38` pipeline without a deploy-time code change. The HTTP contract of `/api/trips/[id]/edits/ai` is unchanged.

### Alternatives

- Only fix the composer (Phase A): kept as the fallback path, but it cannot answer what-if/compare questions that no scenario branch covers.
- Keep the classifier as a fast path for direct edits: rejected by the owner's no-budget-limit choice; one path means less code.
- Migrate to an AI SDK: still deferred (`ADR-30`); a small fetch client was added beside the existing ones.

### Consequences

- `ADR-29` holds: tools are deterministic server functions, no nested model-backed planner, and the Validator alone decides PASS/VIOLATION/INSUFFICIENT_DATA.
- A turn may take several model rounds; latency is higher than the classifier path. The route declares `maxDuration = 300`.
- The catalog the model can search is the same 50 VISIBLE destinations the classifier already received (`MAX_EDIT_INTENT_DESTINATIONS`).
- The Responses request shape (stateless `store: false` with `include: ["reasoning.encrypted_content"]`, items echoed back) is covered only by fake-provider tests until a live run confirms it; a mismatch degrades to the `ADR-38` path and is visible in the `trip_assistant` logs.

## ADR-40 — Saved-trip assistant streams through the AI SDK and decides through tools (2026-11-21)

- **Status:** Accepted by the owner (design interview Q1–Q19, 2026-11-21) and implemented on `TXH` (2026-11-21), including live 5-turn OpenAI Responses verification on `gpt-6.1-terra`. Amends `ADR-39`. Spec: [saved-trip-assistant-natural-streaming-spec.md](product/saved-trip-assistant-natural-streaming-spec.md).
- **Date:** 2026-11-21

### Context

`ADR-39` made the Saved-trip assistant reason with tools, but each turn still ended in one JSON object (`reply`, `proposeSimulationId`, `suggestionSimulationIds`) returned after every model round finished. Travelers waited in silence for tens of seconds, could not stop a turn, and could not see what the assistant was doing. The owner asked for answers that read and arrive like a natural conversation. The repository already ships the Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) for the planning chat (`ADR-36`), with SSE streaming and stream-redaction tests.

### Decision

1. The reasoning loop moves from the hand-written Responses client to the AI SDK (`streamText`, UI message stream) on `gpt-6.1-terra` with `medium` reasoning.
2. The model writes its answer as free streamed text and expresses decisions by calling `apply_to_draft(simulationId)` or `show_options(simulationIds)`. The server still accepts only simulations created in the same turn and packages every candidate, diff, card and Validator result itself.
3. Internal IDs and URLs are removed from the text stream before it reaches the browser. A false PASS claim or an absolute weather-safety claim is not retracted; the server appends a Correction note stating the verified fact.
4. The same route answers with a UI message stream when the client asks for `text/event-stream` (progress parts per tool step, text, Correction note, and a final result part carrying the existing JSON payload), and with the existing JSON otherwise. The edit draft changes only when the final result part arrives.
5. Per-message "advice did not change the draft" badges are removed, consistent with the Caveat policy.

### Alternatives

- Extend the hand-written Responses client with SSE parsing and a custom event format: rejected; it duplicates what the AI SDK already does in this repository and keeps the unverified Responses item-echo logic.
- Buffer the full answer and run the fact guard before showing anything: rejected; it removes the benefit of streaming.
- Delete a streamed answer when the fact guard fails: rejected; text the traveler already read would disappear. A Correction note is honest and less confusing.

### Consequences

- `ADR-30` deferred migrating providers to the AI SDK; that deferral no longer applies to the Saved-trip assistant, which now uses the SDK already adopted for the planning chat. Q&A and other structured-output paths are unchanged.
- `trip-assistant-openai.ts`'s Responses client is retired. Its Chat Completions client remains the fallback pipeline's provider.
- Because `@ai-sdk/openai` 4.0.14 only auto-detects `o1`/`o3`/`o4-mini`/`gpt-5*` as reasoning models, `providerOptions.openai` explicitly passes `forceReasoning: true`, `reasoningEffort: "medium"`, `reasoningSummary: null`, and `store: false` so Responses API calls on `gpt-6.1-terra` send `reasoning.effort: "medium"` and `include: ["reasoning.encrypted_content"]` without emitting internal reasoning summaries. Live 5-turn verification confirmed `.responses("gpt-6.1-terra")` streams text and executes multi-round tool calls cleanly without falling back to `.chat()`.
- JSON clients and tests keep working through content negotiation. A turn is still bounded by the route's `maxDuration = 300`.

## ADR-41: Persistent trip-edit chat memory, `/trips/new` session draft, `/assistant` SSE & browser resume, and destination panel auto-switch

- **Status:** Accepted
- **Date:** 2026-11-21
- **Owner approval:** Explicit owner decisions on 4 UX/persistence updates (Option A, browser-only + SSE, Option 3B, Option 4A).

### Decision

1. **Floating destination assistant (`/destinations/[id]`):** Navigating to a different destination automatically switches the floating panel context and remounts the chat controller keyed by `${identity}:${contextKey}`, and starter prompts render the active destination's name instead of a hardcoded `"Hà Giang"`.
2. **`/assistant` browser resume & SSE streaming:**
   - Active signed-in V2 sessions remain in browser memory (module-level store keyed by identity, never persisting `stateToken` to storage or URLs) and sync `?session=<sessionId>` to the URL so navigating `/assistant` ↔ `/explore` reopens the exact active chat. Saved Q&A conversations also remember `lastConversationId` in `sessionStorage` per identity until "+ Đoạn chat mới" is clicked.
   - `POST /api/ai/planning` supports content-negotiated SSE (`Accept: text/event-stream`), emitting progress `step` events and progressive `delta` text chunks while keeping JSON responses unchanged for existing callers and tests.
3. **Saved-trip edit chat memory (`/trips/[id]/edit`):** Relaxes the "no DB table for edit chat" out-of-scope note in ADR-37/38/40 by adding `TripEditChatMessage` (`trip_edit_chat_message`, migration `20261121121000_trip_edit_chat_memory`) with `onDelete: Cascade` to `Trip`, owner-scoped `GET`/`POST`/`DELETE /api/trips/[id]/edits/ai/messages`, and server-side initial load. Unvalidated itinerary drafts are still never persisted to the database.
4. **Trip creation draft (`/trips/new`):** Relaxes the `US-24` / `BUG-03` no-draft rule to allow user-scoped temporary `sessionStorage` persistence (12h TTL) of form inputs/journey/confirmed planner step plus `?step=details|planner` URL sync. Drafts are cleared on successful trip save or explicit reset; invalid itineraries are still never persisted to the database.

## ADR-37 — Shared Google Maps/Stadia provider switch (2026-11-18)

- **Status:** Accepted by owner Q1–Q7, summary confirmation and subsequent implement request. Code/automated verification and live acceptance are separate; see [story](stories/MAPS-PROVIDER-SWITCH.md).
- **Decision:** Replace Stadia-dependent interactive rendering, routing and origin search with Google when `NEXT_PUBLIC_MAPS_PROVIDER=GOOGLE`; otherwise use the retained Stadia adapters. One build-time public selector replaces the routing-only selector. Rebuild/deploy to switch; no automatic provider/vehicle fallback, no Admin hot-switch. Google uses Maps JavaScript/Advanced Markers, Routes DRIVE/TWO_WHEELER and Vietnam-wide Places origin search.
- **Boundaries:** Preserve all product rules, server auth/ownership/privacy, deterministic Validator and SUCCESS/FAILED/UNKNOWN. Existing Google external-place functions and Home/Detail iframe remain independent. Browser Google key/Map ID are publishable restricted configuration, explicitly superseding the earlier no-browser-key posture for these maps; Routes/Places secrets stay server-side. Stadia Admin runtime overrides/domain auth remain in place; Google credentials are environment-managed in this scope.
- **History/rollback:** Persist actual source for new evidence, keep old source values readable and never infer old provenance from the current flag. Origin source is JSON, so no Prisma migration is required. Read saved routing snapshots instead of routing on Trip page reads; never fabricate VERIFIED straight-line evidence. Google geometry/Places pins are not displayed on Stadia after rollback; the saved itinerary remains readable, and restricted layers are unavailable. No mass rewrite/backfill or schema rollback.
- **Precedence:** This provider choice supersedes incompatible Stadia-only/VietMap-only directions in ADR-17/18/19 within the approved scope. Preserve those records as history. ADR-22 iframe behavior and the existing runtime credential security boundary remain; this decision adds no Google credential editor to Admin.
- **Limits:** No real Google credentials/Map ID are configured locally, so live rendering/routing/search, billing/quota and domain authorization remain unaccepted. Google retention/agreement and application Terms/Privacy are deployment gates; saving the existing journey snapshot does not certify permission for indefinite Google-content storage. Details and official documentation are in the [runbook](implementation/google-maps-provider-switch-runbook.md).

## ADR-42 — Planning concierge on `/assistant/plan` (2026-11-21)

- **Status:** Accepted by the owner (design interview Q1–Q25, 2026-11-21, "có… làm luôn"). Spec: [tripsage-planning-concierge-spec.md](specs/tripsage-planning-concierge-spec.md). Amends ADR-33, ADR-34 and the AI-led intake spec for `/assistant/plan` only.
- **Date:** 2026-11-21

### Context

The planning chat was a form dialog followed by a short, capped reply that showed only attraction visits. The owner wants a conversation that reads like a tour guide: grouped questions with suggested answers, a first itinerary within two user turns, a day timeline with lunch and overnight, suggestions for meals, evenings and lodging, a cost table, and a way for travelers from far away to reach Hà Giang. ADR-33/34 forbid naming lodging or prices, and a long drive from the south is rejected as `OVERNIGHT_DRIVING_UNSUPPORTED`.

### Decision

1. On `/assistant/plan` only, the assistant may name lodging and give prices, provided every lodging is a Google Places result labeled unchecked, every amount is labeled an estimate, and nothing is booked. ADR-34's other safety checks stay.
2. The planner owns every clock time and the Validator alone decides PASS/VIOLATION/INSUFFICIENT_DATA. The assistant adds a separate suggestion layer attached to timeline slots; suggestions never change a time, never become visits and are never PASS. Evening suggestions must be walkable (≤ 2 km) from the day's last stop.
3. Two scheduling preferences (lunch 60–120 min, latest visit end 15:00–18:00) may be set per trip. They only make a schedule more conservative, so the Validator and the Save re-check are unchanged.
4. A traveler far away gets an access leg (flight, sleeper bus, train) to a fixed trip hub (Hà Nội, TP Hà Giang). The access leg is estimated and shown but not validated; the validated trip starts at the hub, which becomes the saved origin. Trip days count from the hub.
5. Grouped questions: the first cluster (origin, date, days, vehicle) is recorded only when the traveler says or accepts it; second-cluster items (interests, pace, travelers, day rhythm) use visible server defaults without asking. Origin, past dates and day counts outside 1–14 are never defaulted.
6. The chat uses `gpt-6.1-terra` with medium reasoning and no output-token cap, like ADR-39/40, bounded by 12 steps and the route's 300 s.
7. Suggestions, lodging, the cost table and the access leg live only in the conversation; Save is unchanged and does not store them.

### Alternatives

- Add lodging, eateries and rest stops as Destinations: rejected; each Destination is a scheduled visit checked by the Validator (ADR-33), and the data would need manual upkeep.
- Let the model write the whole timeline: rejected; times would bypass the Validator.
- Validate multi-modal journeys (flight + drive): rejected; no reliable flight/bus timetable data, and the Validator would need a new mode.
- Store the extras on Save now: deferred; needs a migration, Save payload and saved-trip view changes.

### Consequences

- Reopening a saved trip does not show suggestions, costs or the access leg until a follow-up story stores them.
- Turns are slower and cost more (reasoning, more tool calls).
- Prices depend on a code default table and an Admin-uploaded price reference document whose date is shown; stale prices are possible and are labeled as estimates.

## ADR-43 — One assistant chat at `/assistant`; chat-only origin confirmation; saved planning conversations (2026-11-21)

- **Status:** Accepted by the owner (design interview Q26–Q34, 2026-11-21, "có" / "ok e làm đi"). Not implemented yet; the owner approved documents only. Spec: [unified-assistant-chat-spec.md](specs/unified-assistant-chat-spec.md). Amends ADR-35, ADR-36 and ADR-42.
- **Date:** 2026-11-21

### Context

ADR-42 delivered the planning concierge on a separate `/assistant/plan` tab. In use, the product had two assistants: "Trò chuyện và hỏi đáp" (Q&A plus the old V2 planner, with saved history) and "Lập hành trình AI" (tripsage, no history). The planning tab still embedded the full origin picker form. The owner wants a single chat where people ask, plan and refine with no form or picker, and a map only as an optional view.

### Decision

1. `/assistant` is the only assistant. For signed-in travelers, every message goes to the tripsage agent (Q&A and planning). Guests keep the existing Q&A path and sign-in hand-off (ADR-35). `/assistant/plan` redirects to `/assistant`. `TRIPSAGE_CHAT_ENABLED` switches signed-in travelers back to the old path without a code deploy.
2. Planning intent: a direct planning opener starts planning; a switch from Q&A is confirmed in one natural sentence and the destination just discussed becomes a required stop; a vague question is answered and followed by an offer.
3. **Origin confirmation in chat.** This supersedes the rule that only an explicit picker button confirms an origin. The server resolves the typed place through the existing origin search (Vietnam coverage check), keeps coordinates server-side, and the assistant restates the resolved label. The traveler's next message agreeing (or tapping that label as a quick reply) confirms it; the server, not the model, builds the confirmed `OriginSelection`. Candidates carried between turns are signed by the server so the browser cannot alter coordinates. The model never receives or supplies coordinates.
4. Departure and return clocks are recorded from chat, defaulting to 07:00 and 18:00 and shown as defaults.
5. Each itinerary shows a collapsed route map that mounts only when opened; it is view-only.
6. Conversations with the agent are stored per user (new tables and a Prisma migration), listed with existing Q&A history, with the same ownership, deletion and cleanup rules. Only schema-validated display parts are stored; raw tool output, origin candidates and system context are not. Writes follow the SUCCESS/FAILED/UNKNOWN idempotency contract.
7. Q&A answers from the agent cite reviewed document titles as source chips; unsupported content is stated as general knowledge.
8. After acceptance, the V2 planner (`/api/ai/planning` and its client/runtime) is deleted in a separate commit; stored V2 conversations stay readable.

### Alternatives

- Keep two tabs and only restyle the origin card: rejected by the owner; the split itself was the problem.
- Route each message by intent between Q&A and tripsage: rejected; two message formats in one thread and fragile intent guessing.
- Keep a map or search picker for the origin: rejected; the owner wants chat only. A typed place restated by the assistant and agreed by the traveler is an explicit confirmation.
- Keep planning chats unsaved: rejected; history in the sidebar is expected.

### Consequences

- A new migration and conversation store are required; the chat UI must render stored parts.
- Q&A for signed-in travelers moves from the citation-verified Q&A pipeline to the agent with source chips; answer style and grounding differ from the Q&A service.
- Origin resolution depends on the origin search provider; when it is unavailable, planning waits for a hub choice.
- Rollback before V2 deletion is the `TRIPSAGE_CHAT_ENABLED` flag; after it, reverting the deletion commit.

## ADR-44 — Assumed draft first, then ask (2026-11-22)

- **Status:** Accepted by the owner (design interview Q18–Q22, 2026-11-22, "có"). Not implemented yet. Spec: [assistant-answers-place-preview-spec.md](specs/assistant-answers-place-preview-spec.md). Amends ADR-43 §2 (case A) and the intake order of ADR-42.
- **Date:** 2026-11-22

### Context

ADR-42/43 made the assistant collect origin, dates/duration and transport before any itinerary appears. In use, the owner found the first turns slow and form-like compared with general assistants, which show a sample itinerary immediately and ask afterwards.

### Decision

1. When the traveler states a wish to plan without enough information, the assistant produces an **assumed draft** in the same turn: origin = fixed hub Hà Nội, 4 days 3 nights, motorbike, departure = the nearest reasonable Saturday from today (Vietnam time). Values the traveler did state are used instead of assumptions.
2. The assumed draft goes through the normal scheduler and Constraint Validator. Assumed values are marked as assumptions in trip info, the needs line and the reply.
3. Saving requires the traveler to confirm the origin and the departure date; a draft with assumed origin or date cannot be saved.
4. After the draft the assistant states its assumptions in one line and asks one question about the most important one (origin or date); other assumptions become quick replies.
5. Each scheduled visit may carry one line of "what to do here" taken from the destination catalog or reviewed documents; the model may rephrase but not add facts.

### Alternatives

- Keep asking first (ADR-43 case A): rejected by the owner as slow and rigid.
- Free-text sample itinerary written by the model: rejected; times must still come from the scheduler and be checked.
- Assume the traveler's home as origin: rejected; no location is known, and a fixed hub needs no geocoding.

### Consequences

- Trip info needs an "assumed" marker per field; save readiness must check it.
- The chat-only origin confirmation of ADR-43 still applies when the traveler changes the origin.
- More first-turn tool work (routing, planning) per new conversation; admission limits are unchanged.

## Owner decision 2026-11-22 — Longer provider timeouts and step cap for the assistant

Live Vercel runs hit the tight limits (routing legs reported `TIMEOUT` so the travel-time check stayed `INSUFFICIENT_DATA`, Google Places and web lookups timed out, turns ended at the step cap). The owner asked to raise them modestly:

- Routing: shared deadline and per-request timeout 10 s → 25 s (27-pair / three-concurrent budget unchanged; the Validator still never passes on missing route data). `/api/trip-proposals` `maxDuration` 30 → 60 s to keep margin.
- Google Places lookup 5 s → 12 s; web search/scrape 8 s → 15 s; SerpApi 8 s → 20 s.
- Assistant chat turn cap 12 → 16 steps (the 280 s turn budget is unchanged).

### Amendment 2026-11-22 (same day, owner)

The owner asked for more headroom still: routing shared deadline and per-request timeout 25 s → 40 s (`/api/trip-proposals` `maxDuration` 60 → 90 s); origin search timeouts raised to 8 s for Google, Stadia and Nominatim (was 4 s, 4 s, 3 s). The Nominatim minimum gap between two searches stays 4 s and is now independent of the 8 s I/O budget (the claim SQL returns `now + budget` as the lease), so a slower search does not lengthen "đang bận" for others.

## ADR-45 — Nearby activity suggestions are found by the server and saved with the trip (2026-11-22)

- **Status:** Accepted by the owner (design interview 2026-11-22: show all, about 4–5 per stop or night, saved with the trip, no validation). Implemented.
- **Date:** 2026-11-22

### Context

A plan lists only the few catalogue stops the scheduler can fit. Travelers want to know what else is worth doing around a stop and in the evening near their lodging. Asking the model to call Places for every stop made the chat slow and unreliable, and suggestions vanished when the trip was saved.

### Decision

1. After each `proposeItinerary` the **server** (not the model) looks up Google Places near every stop (radius 5 km, query for sightseeing and play) and near each overnight stay (radius 3 km, evening and café/market query), at most 16 lookups per plan, 4 at a time, within a 20 s budget; a failed lookup only means no suggestions for that slot. The itinerary's own stops are excluded and each place is shown once, nearest first, up to 5 per slot.
2. Results are `ACTIVITY` / `EVENING` planning suggestions: unchecked Google data, never a visit, no time, no Validator input, no cost.
3. On save the client sends them with the trip and the server stores them in `trip_nearby_suggestion` (cascade with the trip). Malformed entries are dropped, never block the save.
4. The saved trip page shows them per day under "Gợi ý vui chơi quanh đây".

### Alternatives

- Model-driven `searchPlaces` per stop: rejected (slow, flaky, uses the model's tool budget).
- Schedule them as extra visits: rejected; would need opening-hours and routing validation the data cannot support.
- Keep them only in the chat: rejected by the owner ("nên thêm vào chuyến đi để người dùng biết").

### Consequences

- One new table and migration (`20261122120000_trip_nearby_suggestion`); the migration is written but **not applied** to any shared database.
- Up to 16 Places requests per plan (cost) with a 30-minute per-instance memory cache; move to a shared cache if instances multiply.
- The browser supplies the place ids and names at save time, as it already does for chosen lodging; they are display-only and never trusted for validation.

## ADR-46 — One-turn origin confirmation, fuller default days, return clock and live petrol price (2026-11-22)

- **Status:** Accepted by the owner (2026-11-22, "đồng ý" to Q1–Q4 and "sao lại có suy nghĩ là giới hạn điểm vậy?"). Implemented. Amends ADR-43 §3 (two-turn confirmation of a searched origin) and ADR-44 (defaults).
- **Date:** 2026-11-22

### Decision

1. **Origin.** When the traveler's message names the one place the search returned ("tôi xuất phát từ Đà Nẵng", or just "Đà Nẵng"), the server confirms it in the same turn (`statesSoleOrigin`, applied inside `findOrigin`). Several candidates, a different place than the one named, a contrast ("nhưng", "hay") or a negation still use the two-turn path. The model never supplies coordinates; the candidate comes from the server's own search.
2. **Default pace.** The chat's default pace is `PACKED` ("Nhiều trải nghiệm", up to 4 stops a day) instead of `MODERATE`, so afternoons are not left empty by default. The 2/3/4 table is unchanged and the traveler can ask for a calmer pace; stops are still chosen by the planner and checked by the Validator.
3. **Return clock.** A final day with no visit (only the drive home) leaves at the day-1 departure clock (07:00) unless the traveler chose another. Before this, that day had no start time, so the travel-time check stayed `INSUFFICIENT_DATA` and the trip could not be saved. The default is shown with the other clock defaults.
4. **Petrol price.** The estimate reads the Petrolimex zone-2 price (E5 RON 92, else RON 95) from Petrolimex's public portal, cached six hours per instance; on any failure it keeps the fixed reference price. The approach is ported from the MIT-licensed VietFuelAPI (single source, no separate deployment). The undocumented endpoint and Petrolimex's terms for automated reads are not verified.
5. **Free afternoon and evening suggestions (ADR-45 extension).** The server also looks up places for the free afternoon (`dN-free`, 8 km, café/viewpoint query) and evenings (5 km, café/night market query), and a night may repeat a place already shown for a visit.

### Alternatives

- Keep two-turn origin confirmation: rejected, the traveler had already stated the place.
- Raise `MODERATE` to 4 for the whole system: rejected, it would also change the normal planner page.
- Ask for the return clock: rejected, one more question for a value that rarely matters.
- Deploy VietFuelAPI separately: rejected for now; its hosted address does not resolve and a second service is not needed for one price.

### Consequences

- Default plans are busier; tests that pinned `MODERATE` as the chat default were updated.
- Cost lines may cite the Petrolimex price with its date; the fixed 23.000đ reference (`PRICE_REFERENCE`) is now only a fallback and is out of date (about 18.940đ at the 2026-11-19 table).

## ADR-47 — Pinned items, shared projection and a calm "reconnecting" state (2026-11-22)

- **Status:** Accepted by the owner (2026-11-22: Q2 pin buttons per card, Q3 dated snapshots, Q4 share stays/meals and the lodging and food cost lines, Q5 trip detail redesign, Q6 reasoning effort is NOT lowered, Q7 audit, Q8 chat honesty rules). Implemented.
- **Date:** 2026-11-22

### Decision

1. **Pinned items.** A flight, a stay, a meal place or the cost estimate shown in the planning chat can be pinned to the trip ("Ghim vào chuyến đi"). Before the trip is saved the pins ride along with the save request (`pinnedItems`, lenient: a malformed pin is dropped, never fails the save). After saving, each pin is written at once with `POST /api/trips/[id]/pins` (idempotent, owner only, at most 24 per trip; a new cost estimate replaces the old one; an identical item is not stored twice).
2. **Snapshot, not a booking.** A pin is a dated snapshot of provider reference data (`trip_pinned_item.payload`, validated on write and on read). It is never Validator input, never a booking, and the card says the price is a reference on the lookup date.
3. **Sharing.** The companion group view receives `sharedPins`: stays, meals and only the lodging and food lines of the cost (with their own subtotal). Flights, fares, transport, other lines and the full total stay with the owner. Origin and clocks remain owner-private as before.
4. **Chat honesty.** The assistant may not say it saved, pinned or attached something unless this turn's tool result shows it; saving is the "Lưu hành trình" button and pinning is the pin buttons. A traveler who names where the group meets ("tập trung ở Hà Nội") has chosen the hub; it is not asked again.
5. **Dropped stream.** When the browser loses the stream but the server finishes and saves the turn, the chat shows "Đang hoàn tất câu trả lời" while it fetches the saved answer, and the red notice appears only if that fails for about a minute. Reply text types in steadily (reduced motion shows it at once).
6. **Fuel fallback.** The fixed reference price is the Petrolimex zone-2 E5 RON 92 price of 2026-11-19 (18.940đ/L) and is labelled with that date; a failed live read logs a reason code (`[tripsage-fuel] unavailable <reason>`).

### Alternatives

- Pin everything automatically at save: rejected, the traveler picks what matters (a list of every fare would bury the trip).
- Store prices without a date: rejected, a stale fare would look current.
- Share the whole cost: rejected by the owner (fares and the total are personal).
- Lower reasoning effort to speed up replies: rejected by the owner.

### Consequences

- New table `trip_pinned_item` (migration `20261122160000_trip_pinned_item`); production needs `prisma migrate deploy` before this build serves traffic.
- There is no unpin after saving yet; before saving a pin can be toggled off.
- The Petrolimex read from Vercel (Singapore region) is unproven; the logged reason will show whether it is blocked.

## ADR-48 — Flexible schedule: shorter roadside breaks, traveler-chosen visit length, one-turn origin confirmation (2026-11-22)

### Context

In conversation 2df60a2a a 5-day plan kept failing TRAVEL_TIME by a small margin, the traveler could not ask for a 30-minute visit, and the same origin had to be confirmed three to four times. The owner approved (2026-11-22) relaxing these, including shorter rest.

### Decision

- **Compact rest.** A new rest policy `roadside-rest-compact-v1` keeps the break thresholds (90 min motorbike, 120 min car) and shortens each break from 15 to 10 minutes. It is used only by the planning chat's single flexible retry, recorded in `journeyPlan.policy` and `requirement.restMode = "COMPACT"`, and the Validator checks the plan against the same policy. The default stays `roadside-rest-v1`.
- **Flexible retry.** When `proposeItinerary` returns a VIOLATION, the server retries once with compact rest and every visit at its catalogue minimum. The retry is kept only if it has fewer violations, and a `FLEX_SCHEDULE` warning tells the traveler.
- **Traveler-chosen visit length.** `proposeItinerary.visitMinutes` (15–600 per stop) is set only when the traveler says how long they want to stay. That length becomes the stop's duration and minimum for this plan, and a `USER_SHORT_VISIT` warning records any value below the catalogue minimum.
- **One-turn origin confirmation.** Naming the place or a plain agreement ("ok", "ok nhé", "xác nhận") confirms a single candidate or a fixed hub in the same turn. An origin that is already confirmed is never searched or asked again. A choice among 2–3 candidates still needs the traveler.

### Consequences

- The Validator stays deterministic: it does not guess. It now accepts two rest policies and a traveler-owned minimum per stop.
- The save carries `restMode` in the trip proposal, so save-time validation uses the policy the plan was scheduled with.
- The trip edit flow still recomputes with the standard policy, so a saved compact plan shows standard 15-minute breaks after an edit.
- Not verified live with a long Đà Nẵng → Hà Nội → Hà Giang chat.


## ADR-49 — Choose `places.types` over `places.primaryType` for lodging filtering (2026-11-23)

- **Status:** Accepted (Ticket 04, PARITY BR-8 & BR-10).
- **Date:** 2026-11-23

### Context

Nearby activity and evening suggestions (`ACTIVITY`, `FREE`, `EVENING`) included hotels, homestays, and resorts (e.g., Balana Hà Giang, H'mong Village Resort, Homestay Tommy house) because `GOOGLE_PLACES_FIELD_MASK` requested only `places.id,places.displayName,places.location`.

### Decision

Add `places.types` to `GOOGLE_PLACES_FIELD_MASK` (instead of `places.primaryType`) and combine type-based exclusion (`lodging`, `hotel`, `resort_hotel`, `guest_house`, `hostel`, `campground`, etc.) with a Vietnamese/English lodging-name fallback and generic-name exclusion (`"Khu Vui Chơi"`).

### Rationale & Cost Impact

- Google Places API (New) Text Search bills by the highest-tier SKU in `X-Goog-FieldMask`. `places.displayName` and `places.location` are already on the **Pro** SKU, and both `places.types` and `places.primaryType` are also on the **Pro** SKU (zero tier upgrade, zero increase in `ACTIVITY_MAX_ANCHORS = 16`).
- `places.types` returns all types for a place, catching lodging venues whose `primaryType` is generic (`point_of_interest`) or absent. `types` stays server-side and is never forwarded to the model.

## ADR-50 — `AssistantConversation.titleCustomized` & `savedTripId` (2026-11-23)

- **Status:** Accepted (Ticket 14, slim B11 & BR-7). Migration `20261123022000_assistant_conversation_auto_title` created and schema-validated; awaiting deployment (`prisma migrate deploy`) on target DB.
- **Date:** 2026-11-23

### Context

`AssistantConversation` previously stored only `title`, with no flag distinguishing user-renamed conversations from automatically titled ones, and no indicator of whether the conversation produced a saved trip.

### Decision

Add two additive columns to `assistant_conversation` via Prisma migration `20261123022000_assistant_conversation_auto_title`:
- `titleCustomized Boolean @default(false)`: auto-titling in `recordAssistantMessage` updates `title` strictly from confirmed trip info (`Đà Nẵng → HG · 4 người · 12/12`) only while `titleCustomized` is `false`; explicit user renames via idempotent `PATCH /api/ai/assistant-conversations/:id` set `titleCustomized = true`.
- `savedTripId String?`: recorded via idempotent `PATCH` (verifying owner-scoped trip existence) once a trip save confirms `SUCCESS`, powering the 6px `--tv-accent` sidebar indicator without introducing a cascading delete dependency on `Trip`.

## ADR-51 — Explicit traveler flexibility metadata (`userChosenDuration` & `dayRhythm`) for chat-to-save validation parity (2026-11-23)

- **Status:** Accepted and implemented (`af12416`, `0f54dcc`). Extends `ADR-48` and `ADR-42` §3.
- **Date:** 2026-11-23

### Context

In production conversation `cdccdd0e-aa56-4127-b040-ebcfffda46e8` (Turn 8), the traveler explicitly asked for a 30-minute stop at Đèo Mã Pì Lèng (catalogue minimum 60 minutes). `proposeItinerary` accepted `visitMinutes` in memory and reported `5/5 kiểm tra đạt` with a `USER_SHORT_VISIT` warning, but `POST /api/trips` rejected the save with HTTP `422 TRIP_VALIDATION_FAILED`: `trip-save-adapter` and `journey-save-validation` did not receive an explicit marker that the 30-minute visit was traveler-chosen, so save-time validation clamped `visitDuration` back up to `max(30, 60) = 60` minutes, shifting departure by +30 minutes and triggering cascading `VISIT_TOO_SHORT`, `TRANSFER_TOO_SHORT`, and `JOURNEY_ARRIVAL_TOO_EARLY` violations.

### Decision

1. **Explicit per-visit flag (`userChosenDuration?: boolean`):** `PlannerStop` (`planner-contract.ts`) and `TripProposalVisit` (`trip-proposal-contract.ts`) carry an explicit optional boolean `userChosenDuration`. It is set to `true` **only** when the traveler explicitly specified a visit duration (`visitMinutes[destinationId]`) and the duration satisfies the deterministic 15-minute hard floor (`>= 15` and `<= 600` minutes).
2. **Deterministic save-time parity:** Both `validateTripProposal` (`trip-save-adapter.ts`) and `validateJourneyForSave` (`journey-save-validation.ts`) read `visit.userChosenDuration === true` together with `proposal.restMode` and optional `proposal.dayRhythm` (`lunchBreakMinutes`, `latestVisitEndMinute`). When `userChosenDuration === true` and `visitDurationMinutes >= 15`, that stop's effective minimum for `MINIMUM_DURATION` and `visitDuration(candidate)` equals `visitDurationMinutes`, and a deterministic `USER_SHORT_VISIT` warning is preserved. When `userChosenDuration` is absent or `false`, the canonical catalogue minimum (`destination.minDurationMinutes`) remains strictly enforced — general rules are never relaxed and AI never bypasses the Validator.
3. **Actionable 422 feedback:** Save-time `422 TRIP_VALIDATION_FAILED` responses map concrete violated check groups/messages (`MINIMUM_DURATION`, `TRAVEL_TIME`, `OPENING_HOURS`, `SCHEDULE_CONFLICTS`, `MOBILITY`) into user-visible Vietnamese reasons in `TripsageSaveSection` / `TripsagePlanPanel` rather than showing a generic validation error.

### Consequences

- A schedule that passes `5/5` in chat with explicit `visitMinutes` and/or `restMode: "COMPACT"` passes the identical deterministic Constraint Validator at `POST /api/trips` without altering database schema (no Prisma migration required).
- Missing validation data (routing, opening hours, or catalogue records) remains strictly non-passing (`INSUFFICIENT_DATA` / `VIOLATION`).
- Subsequent edits on `/trips/[id]/edit` continue to validate against canonical catalogue minimums unless explicitly overridden.

## ADR-52 — Deterministic server-side access-leg pricing priority and cross-turn preservation (2026-11-23)

- **Status:** Accepted and implemented (`74a3618`). Extends `ADR-42` §4 and `ADR-47`.
- **Date:** 2026-11-23

### Context

In production conversation `eca7ea7f-fdff-4519-9778-c907d895831e`:
1. In v1, the model passed `priceVndPerPerson: 0` for `SLEEPER_BUS Hà Nội → TP Hà Giang` (which is present in `docs/fixtures/price-reference-ha-giang.md` at `250.000–400.000đ/lượt`), and `buildAccessLeg` marked it `MISSING` (`0đ`) instead of consulting the approved price reference. Meanwhile, `docs/fixtures/price-reference-ha-giang.md` is outside the Vercel serverless bundle and prod `rag_document` contains 0 price-reference documents.
2. In v2 (after editing Day 2 stops), the model rebuilt `planAccessLeg` with `priceVndPerPerson: 0` for the flight segment; because `data-flights` is not persisted and Turn 1 had recovered via DB polling, `flightLookups` was empty on Turn 2, causing v1's Google Flights fare (`1.164.181đ`) to be overwritten with `MISSING` while the saved trip (`cmwt3nfzl000107lbf8uetc0l`) received the inverted prices (flight missing, bus `325.000đ`).

### Decision

1. **Single canonical bundled price reference (`APPROVED_ACCESS_ROUTE_PRICES`):** Sync the approved transport corridors from `docs/fixtures/price-reference-ha-giang.md` (`updatedAt: "2026-11-21"`) directly in `tripsage-access-leg.ts` (and as the embedded fallback in `tripsage-price-reference.ts`) so Vercel prod, local dev, chat cost tables, ACCESS pins, and saved trips always read the exact same source without fabricating unlisted corridors.
2. **Strict 3-tier deterministic pricing priority in `buildAccessLeg`:**
   - **Priority 1:** Live Google Flights lookup matching route & dates (±1 day, verified against `originAirport`), OR a preserved `GOOGLE_FLIGHTS` segment from the previous access leg when `homeCity` and dates (±1 day) have not changed.
   - **Priority 2:** Approved price reference range for the exact `(mode, from, to)` corridor — deterministically uses the range midpoint (`ESTIMATE`), accepting a model-supplied number **only** if it falls inside `[minVnd, maxVnd]`.
   - **Priority 3:** `MISSING` (`priceVndPerPerson: 0`, `"chưa có giá"`) — never trusts unverified model-invented prices for unlisted corridors.
3. **Single price object across chat, cost table, pin, and saved trip:** Whenever `planAccessLeg` or `searchFlights` updates `latestAccessLeg` after `estimateCosts` ran in the same turn, the server re-emits `data-cost` with the exact same `latestAccessLeg` (`accessLegId`, `totalVnd`, `missingItems`), and `reconcileAccessPins` ensures the saved `ACCESS` pin carries the identical `AccessLegPart`.

### Consequences

- Unlisted corridors (such as `Đà Nẵng ⇄ Hà Nội` sleeper bus/train or `Đà Nẵng ⇄ Hà Nội` flight when Google Flights is unavailable) never show fabricated estimates and stay truthfully marked `"chưa có giá"` until the owner adds approved ranges to the reference table or uploads a reviewed RAG price-reference document.
- Rebuilding an itinerary (e.g., v1 → v2 stop edits) preserves looked-up Google Flights fares and approved bus fares across turns and reloads.

## ADR-53 — Traveler-stated overnight area constraints and day-boundary preservation (2026-11-23)

- **Status:** Accepted and implemented (`e0459cf`). Extends `ADR-42` and `ADR-48`.
- **Date:** 2026-11-23

### Context

In production conversation `66a36527-9de1-4420-a464-4106c09e83d9` (Turn L4), the traveler requested `"thêm đi thuyền sông Nho Quế vào ngày 2 nhé, và tối ngày 2 nghỉ ở Đồng Văn"`. Two root causes prevented the itinerary from honoring that request until Turn L10:
1. `TripsageTripInfo` had no structured field for per-night overnight area constraints (`afterDay`, `area`), so the requirement was neither persisted across edit turns nor enforced deterministically.
2. When the model passed Day 2 ending at `Phố cổ Đồng Văn` (`[["D5"], ["D14", "D13"], ["D11"]]`), `planJourney` ran with `allowBoundaryRepartition = true`, silently moving Day 2 stops across day boundaries; in the fallback call Day 2 ended at `Sông Nho Quế` (~21 km mountain road from Đồng Văn), causing `addSuggestions` to reject Đồng Văn homestays (`TOO_FAR_16KM_LIMIT_5KM`) and `estimateCosts` to hijack the closing question to bus tickets.

### Decision

1. **Structured `overnightAreas` constraint in `tripInfoSchema`:** Add optional `overnightAreas: Array<{ afterDay: number; area: string }>` (extracted deterministically from traveler messages and writable via `recordTripInfo`), persisted across subsequent itinerary edit turns until explicitly changed or removed (`"Bỏ yêu cầu nghỉ X"`).
2. **Deterministic arrangement & day-boundary preservation:** Before calling `scheduleSelection`, `arrangeSelectionForOvernightAreas` reorders stops inside day `N` (or brings an area-matching stop to the end of day `N`) so day `N` ends in area `X` or within `15 km` estimated mountain road distance (`haversine * 1.45 <= 15`, resolving areas through `resolveOvernightAreaLabel` + `OVERNIGHT_TOWN_CENTERS` because prod destinations store a placeholder `area = "khu vực hà giang"`). When explicit overnight constraints are active, `scheduleSelection` disables `allowBoundaryRepartition` so `planJourney` cannot silently move day `N`'s final stop. `addSuggestions` accepts `LODGING` in the requested overnight town center radius even when the last scenic stop is slightly outside the default 5 km lodging anchor radius.
3. **Truthful unmet handling without Validator bypass:** If an overnight constraint cannot be satisfied (e.g., trip shortened to 2 days so night 2 is the return day, or day `N` ends too far from `X`), `proposeItinerary` returns `unmetOvernightAreas` with a concrete reason and 2–3 resolution chips (e.g., `"Nghỉ Đồng Văn đêm 1"`, `"Thêm 1 ngày"`, `"Bỏ yêu cầu nghỉ Đồng Văn"`), and `suggestReplies` / `estimateCosts` enforce `UNMET_OVERNIGHT_PRIORITY` so the closing question stays focused on resolving the overnight conflict. The deterministic Constraint Validator still independently checks all 5 check groups and is never bypassed.

### Consequences

- Explicit overnight requests remain honored across L4-style additions and L7-style duration edits without any Prisma schema migration.
- `overnightAreaConstraintSchema` lives in `tripsage-chat-context.ts` so heavy scheduling helpers in `tripsage-overnight.ts` stay out of the browser bundle.

## ADR-54 — Inline confirmed `data-save-action` part for explicit chat save requests (2026-11-23)

- **Status:** Accepted and implemented (`743966b`). Extends `ADR-35`, `ADR-42`, and `ADR-43`.
- **Date:** 2026-11-23

### Context

In production conversation `66a36527-9de1-4420-a464-4106c09e83d9` (Turn L11: `"ok lưu lịch này giúp mình luôn nhé"`), the assistant refused with outdated pre-redesign UI instructions (`"Bạn bấm 'Lưu hành trình' ngay dưới thẻ lịch nhé"`), whereas the actual button is labeled **`Lưu chuyến`** at the top-right of the desktop plan panel header and the bottom footer of the mobile plan sheet.

### Decision

1. **Accurate persona copy:** Update `PERSONA_INSTRUCTIONS` to reference the exact button label **`Lưu chuyến`** and its real desktop (`góc phải đầu panel lịch`) and mobile (`chân sheet`) locations.
2. **Inline confirmed save action (`data-save-action`):** When the traveler explicitly asks to save an existing itinerary (excluding negations like `"không cần lưu"` / `"đừng lưu"` / `"do not save"`), the server emits a schema-validated, persisted `data-save-action` part (`{ eligible: boolean, reason?: string }`) during stream `flush()`. The assistant **never** auto-saves on the server.
3. **Reuse single confirmed save seam:** `TripsageChatClient` renders `TripsageSaveSection` inline on the latest save-action assistant message (`primaryLabel="Lưu chuyến"`), reusing the exact same confirmed `POST /api/trips` flow, `SUCCESS`/`FAILED`/`UNKNOWN` contract, deterministic `Idempotency-Key`, assumed-draft guard, stale-proposal lock (`STALE_ITINERARY_MESSAGE`), and `Đã lưu · Mở chuyến đi` restored state as `TripsagePlanPanel`.

### Consequences

- Travelers asking `"ok lưu lịch này giúp mình luôn nhé"` can click **`Lưu chuyến`** directly inside the reply (or in the panel header/mobile sheet) while preserving the locked product invariant that saving only happens on explicit user confirmation.
- Ineligible plans (unconfirmed assumed fields, stale itinerary after new requirements, or failed/unchecked checks) surface the exact blocking reason rather than silently failing or misleading the user.

## ADR-55 — Server-owned route order, time-budget days, no stop-count pace (2026-11-24)

- **Status:** Accepted by the owner (2026-11-24, "Duyệt hết, làm luôn"). Spec: [itinerary-route-time-redesign-spec.md](specs/itinerary-route-time-redesign-spec.md). Supersedes ADR-46 §2 (pace as a 2/3/4 stop cap) and the owner-approved 2026-11-07 rules for a 06:00 next-day departure and the conditional lunch break. Amends ADR-42 (the AI's day split).
- **Date:** 2026-11-24

### Context

Conversation `fdf35a74-25b4-4283-b313-d096c17373f0` produced a 5-day loop that doubled back (Yên Minh → Dinh Vương → Sủng Là → Đồng Văn), ended four of five days before 13:00, and used 15 of 22 public places. The AI chose the order without coordinates, each day was capped by a stop count, visits were scheduled as early as possible from a 06:00 departure, and the flexible retry shortened every day's visits. Analysis: [17-itinerary-planning-redesign.md](analysis/17-itinerary-planning-redesign.md).

### Decision

1. **Route order is the server's.** For a whole-plan proposal the server takes the AI's set of stops, orders it as a round trip from the confirmed origin (cheapest insertion, 2-opt, Or-opt on an estimated mountain-road time) and re-splits the days. The AI's day split is only a tie-breaker. Must-visit stops, overnight areas (ADR-53) and traveler visit lengths (ADR-48/51) still hold. Scoped edits keep the traveler's day membership.
2. **No stop-count pace.** `PACE_STOP_LIMIT` no longer caps stops per day; the day's time budget and the Validator do. `pace = RELAXED` now means a 17:00 day end and longer roadside buffers. The assistant does not ask for a pace.
3. **Next-day departure 07:30** (was 06:00).
4. **Roadside photo buffer and lunch.** Each same-trip drive of 10 minutes or more gets a buffer (motorbike 20 %, car 15 % of driving, at most 25 minutes, ×1.5 when relaxed) placed after the route leg ends and before the visit; arrivals are rounded up to 5 minutes. A lunch break is taken once a visit ends from 11:15 or the drive to the next stop passes 12:00. The route leg itself is unchanged, so the Validator's exact leg/rest checks are unchanged.
5. **Fill free time.** When the estimated plan leaves time, the server adds unused catalogue places with the best value per added minute (well-known places first, then roadside viewpoints and interests). When a day does not fit, the least valuable non-required stop is dropped, not the day's last stop. The flexible retry shortens visits only on the days the checks name.
6. **Data.** The destination seed in [17-destination-seed-2026-11-24.sql](analysis/17-destination-seed-2026-11-24.sql) is approved; coordinates come from OpenStreetMap and stay `locationVerified = false`.

### Alternatives

- Give the AI coordinates and keep it in charge of the order: rejected, an LLM does not reliably solve routing.
- Keep the 2/3/4 cap and raise it: rejected, a count says nothing about how long the stops and drives take.
- Put the photo buffer inside the route leg: rejected, the Validator checks leg end = start + driving + rest exactly.

### Consequences

- The scheduler needs no extra routing calls to order and fill: estimates are local; only the final chain is routed, as before.
- Tests that pinned the 2/3/4 cap, the 06:00 departure or the old lunch rule were updated.
- Save-time validation reuses the proposal's arrivals (`fixedArrivals`), so buffers are not recomputed at save.

## ADR-56: Queued assistant messages and trip-review fixes from c6be04d7

- Status: Accepted
- Date: 2026-11-25
- Specs: [assistant-queued-message-spec.md](specs/assistant-queued-message-spec.md), [trip-review-lessons-c6be04d7-spec.md](specs/trip-review-lessons-c6be04d7-spec.md)

### Context

Live review of conversation `c6be04d7` and assistant UX testing surfaced two approved sets of changes: allowing travelers to queue follow-up messages while the assistant is busy responding, and addressing 13 trip-planning accuracy, cost consistency, whole-trip date, visual fallback, duration, and timeline presentation gaps (D1–D13).

### Decision

Adopt both [assistant-queued-message-spec.md](specs/assistant-queued-message-spec.md) and the 6 owner-approved product/technical choices from [trip-review-lessons-c6be04d7-spec.md](specs/trip-review-lessons-c6be04d7-spec.md):

1. **Real travel-time cache table (`destination_travel_time`)**: Add table `destination_travel_time` keyed by `(fromDestinationId, toDestinationId, transport)` with Stadia duration, distance, provider, source/target destination revisions, and timestamp. Populate it via a manual script (never inside request handlers) with `--dry-run` and bounded concurrency (max 3), fallback to median winding-factor calibration (`2.0` default, `[1.5, 3.5]` clamped).
2. **Server-calculated cost inputs (`estimateCosts`) & auto-recompute**: Narrow AI inputs on `estimateCosts` to tier choices (`lodgingTier`, `mealTier`, `rental`) plus optional extras; compute nights, meal days/meals, vehicles, rental days, and whole-trip `perPersonPerDay` server-side. Automatically recompute costs when the itinerary or access leg changes.
3. **Whole-trip date boundaries (`tripStartDate`, `tripEndDate`)**: Add `tripStartDate` and `tripEndDate` to `tripInfoSchema`, derived from access-leg travel dates when available, with one clarifying two-choice prompt if sightseeing `durationDays` conflicts with the full travel span.
4. **Revised attraction durations (D10) & large-group adjustment**: Apply updated suggested/minimum durations for Hang Lùng Khúy (`120/75`), Sông Nho Quế (`180/120`), and Lùng Tám (`60/45`) via an idempotent SQL script in `docs/analysis/` (DEV first, PROD run separately after approval), and apply `+15%` suggested visit duration (rounded to 5 minutes) for groups of `>= 6` travelers on stops with `suggestedDurationMinutes >= 45` (excluding short photo stops and without relaxing minimum durations or Validator checks).
5. **Phased implementation order**: Land queued messages, D12–D13 display updates, D1–D4 routing/overtime fixes, D5–D6 cost computation, D7 whole-trip dates, and D8–D11 visuals/diversity/durations/validation scope as sequential commits.
6. **Airport transfer reference & check-in rule**: Record Nội Bài ↔ Mỹ Đình at 60 minutes reference transit time and standard 2-hour pre-flight airport arrival for outbound/return schedule breakdowns and connection warnings.

### Consequences

- Database schema gains `destination_travel_time` via Prisma migration plus manual DEV seeding before PROD rollout.
- Server cost logic becomes deterministic from itinerary and access-leg state, eliminating AI miscounts across travel days and vehicles.
- Existing `estimateCosts`, overtime trimming, estimation winding-factor, and timeline tests that pinned superseded defaults must be updated with comments explaining the spec change.

## ADR-57 — Flexible return deadline & lunch windows, fixed overnight town routing anchors, Day 1 arrival preparation & origin deduplication (2026-11-25)

- **Status:** Accepted
- **Date:** 2026-11-25
- **Spec:** [trip-review-lessons-d1ada90d-spec.md](specs/trip-review-lessons-d1ada90d-spec.md)

### Context

Live review of conversation `d1ada90d-d88c-4f22-8488-954aa3825f1f` (4 travelers, motorcycle, 5 days from Hanoi/Giáp Bát) and three rounds of design alignment (Q1–Q12) uncovered blocking UX and planning gaps:
1. System-default `18:00` (`DEFAULT_RETURN_DEADLINE_MINUTE`) and even traveler-stated return windows triggered hard `RETURN_DEADLINE_MISSED` `VIOLATION`s blocking trip saving and prompting the AI to suggest adding an unwanted 6th day.
2. Multi-day route headers and return routing used raw first/last sightseeing attractions (`Núi Cấm`, `Sông Nho Quế`) instead of resolved overnight areas (`TP Hà Giang`, `Mèo Vạc`).
3. Self-drive trips from Hanoi displayed `"Hà Nội (bến xe Mỹ Đình) → <attraction>"` and omitted the Day 1 outbound transit step plus flexible arrival preparation (`hotel drop-off/check-in, vehicle pickup, rest`).
4. `takesLunchAfter` only checked arrival time at the next stop, letting a 180-minute midday activity (`Sông Nho Quế` `11:45–14:45`) erase lunch completely.
5. Short scenic photo stops grouped into `dt-photo-group` hid photos on subsequent stops, and cross-turn/near-duplicate Google Maps evening suggestions repeated `"Nhà của Đức · 2,9 km"`.
6. Nominatim returned multiple nodes for one landmark (`(A) Bến Xe Giáp Bát`), while `labelSegments` dropped `< 4`-char tokens like `A`, causing repeated confirmation loops and extra date turns before drafting an itinerary.

### Decision

Adopt all approved decisions D1–D7 from [trip-review-lessons-d1ada90d-spec.md](specs/trip-review-lessons-d1ada90d-spec.md):

1. **Flexible return deadline (superseding `RETURN_DEADLINE_MISSED` as a hard save blocker):** Exceeding `returnDeadlineMinute` (whether system-default `18:00` or traveler-specified) emits an informational `warnings` advisory (`RETURN_DEADLINE_MISSED` / advisory message with predicted vs desired arrival clock and optional adjustments) without marking `TRAVEL_TIME` as `VIOLATION` or blocking trip saving (`eligibleForFinalConfirmation`). Planners still try pulling the penultimate overnight closer to the exit route when feasible within the user's chosen day count.
2. **Fixed overnight town anchors (`OVERNIGHT_TOWN_CENTERS`) & clean day route headers:** Route late-day return-to-town legs when the final stop sits `> 1 km` outside its resolved overnight town center, and anchor next-day departure / `RETURN` routing on that fixed town center rather than raw attractions or unverified Google hotel pins (`Chosen lodging` remains informational with zero impact on PASS/clocks). Render day headers as `<origin/overnight area> → <focus region/destination>`.
3. **Clean self-drive hub labels & flexible Day 1 arrival preparation:** Reserve `"bến xe Mỹ Đình"` strictly for bus access legs; display clean `"Hà Nội"` (or preserved specific origin like `Bến xe Giáp Bát`) for self-drive trips. Render explicit outbound transit + flexible arrival preparation cards on Day 1 (and return card on final day) across both `/assistant` and saved trips without enforcing rigid minute deductions or hard failures.
4. **Flexible mandatory lunch window:** Ensure days with pre-lunch sightseeing overlapping lunch past `12:30` always allocate a `Nghỉ trưa` break (preferring pre-activity lunch before long midday stops or flexible early/late placement with an informational note), never blocking save or dropping stops due to meal timing.
5. **Per-stop timeline visuals & evening deduplication:** Keep individual photo frames visible for every stop (never hiding photos in grouped lists), improve fallback visuals, and deduplicate evening/meal suggestions by normalized name/distance across server and client conversation state.
6. **Origin candidate deduplication & single-step drafting:** Merge nearby same-name Nominatim results (`<= 2 km`, stripping short platform prefixes when comparing canonical names), fix short distinguishing segment matching in `permitsOriginConfirmation`, preserve specific confirmed origins over fixed-hub fallback, and generate the initial draft immediately once origin + day count are known.

### Alternatives

- Keeping `RETURN_DEADLINE_MISSED` as a hard `VIOLATION` whenever the user typed a return time was rejected by the owner ("cấm được chặn cứng"); hard-enforcing arrival prep minutes was likewise rejected in favor of flexible advisory placement.
- Routing overnight transfers directly through unverified external hotel coordinates (`chosenLodgings`) was rejected to preserve deterministic Validator parity and prevent clicking a hotel suggestion from destabilizing verified status.

### Consequences

- Real-constraint Validator invariants (`CLOSED`/`OUTSIDE_OPENING_HOURS`, `VISIT_TOO_SHORT` unless user-chosen, `TRANSFER_TOO_SHORT`, `SCHEDULE_CONFLICT`, `INSUFFICIENT_DATA`) remain strictly enforced.
- `journeyPlan` and day timelines include verified overnight town-center legs (`coordinateRoute`), requiring `INSUFFICIENT_DATA` reporting if an overnight town-center leg lacks verified routing rather than fabricating estimates.
- Existing tests pinning `RETURN_DEADLINE_MISSED` as a `VIOLATION`, `"Hà Nội (bến xe Mỹ Đình)"` for self-drive titles/headers, hidden grouped photos, and two-turn origin loops will be updated alongside regression coverage from `d1ada90d`.

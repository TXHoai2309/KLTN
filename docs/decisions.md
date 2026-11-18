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
## ADR-23 — Travel companions preserve single Trip ownership (2026-10-28)

- **Status:** Accepted at planning level through the owner's Q17 confirmation, “Đồng ý chốt bản kế hoạch, chưa triển khai code”. Not implemented; no authorization to start coding.
- **Context:** The original MVP excluded trip collaboration and limited Trip access to the owner. The owner approved public companion discovery, immediate joining and group chat in the [design record](implementation/trip-companions-design.md), while Q1 preserves host-only edits and Q6 selects the latest officially saved itinerary for member reads.
- **Decision:** Retain one Trip owner and one authoritative saved itinerary. A linked publication exposes an explicit public allowlist, and current membership grants itinerary/group-chat reads through a distinct authorization boundary. Joining never transfers ownership or grants edit permission. Existing private Trip endpoints and Admin role isolation remain owner-scoped. The [product extension](product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28) is a scoped exception for publication/member reads/chat, not shared ownership or collaborative editing.
- **Alternatives:** Collaborative editing was rejected by Q1; a separately maintained group itinerary was rejected by Q6. Reusing the complete private Trip DTO as public content would cross the approved visibility boundary.
- **Consequences:** Future stories need server-side membership/capacity enforcement, bounded public/member projections, atomic itinerary revision/group notices, access revocation and a deletion guard for Trips that have had members. Group history survives recruitment closure/withdrawal, chat continues after completion and cancellation makes user chat read-only. This is a durable data/authorization boundary; migrations, APIs and UI implementation remain separate future work.

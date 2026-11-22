# V2-07 — Evaluation, Live Acceptance & Feature-gated Rollout

## Status

BLOCKED for full acceptance, 2026-10-29. Gated integration and verification are
implemented; exact positive replacement/QA examples lack eligible Development
data, and the complete paired provider-call benchmark remains incomplete.
Default remains V1. No deployment, commit, push, V1 retirement, new skill,
provider migration or database migration is included.
Automated tests and API receipts are not browser acceptance. Final gate outcomes
are recorded in the [evaluation report](../implementation/assistant-v2-evaluation.md).

Sources: root/app AGENTS, [documentation hierarchy](../source-baselines.md),
[product](../product/product-spec.md), [architecture](../architecture/technical-architecture.md),
[flows](../flow/user-flow.md), ADR-26–31 in [decisions](../decisions.md),
[V2 plan](../implementation/assistant-skill-runtime-v2-plan.md), V2-01 through V2-06
stories, both baseline audits, [original ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-07.md)
and the owner's expanded V2-07 execution request. The shipped Next version's
server/client and Route Handler guides were consulted. No new DOCX/Figma parity
claim is made; existing presentation components/styles are reused.

## Production integration and contract

`POST /api/ai/planning` retains the existing auth, same-origin, bounded JSON,
idempotency-key, admission and private/no-store boundaries. Existing V1 actions
retain their request/response contract and execution path. The additive
`action=ASSISTANT_V2` protocol has START, TURN, LOCATION, RECONCILE and explicit
SAVE operations. The existing handler selects the server gate before dispatch;
business logic remains in modules/services. V2 errors never silently replay a
consequential request through V1. `X-Assistant-Runtime` marks the executed path.

`POST /api/ai/session` adds optional runtimeVersion metadata for the authenticated
page/popup. Guests retain existing public QA/login behavior. The full Assistant,
floating panel and owned `/trips/[id]/in-trip` page use V2 only when selected.
Shared itinerary cards, validation, citation and manual map components retain the
existing visual system. The map picker loads only for an explicit manual-location
interaction. Destination-page context and a pre-login planning draft are retained;
login fills the draft without automatically replaying a write.

`ASSISTANT_RUNTIME_VERSION=v1|v2` is server-only, defaults to v1, and is declared
non-sensitive in the existing Varlock schema/example. Missing/invalid values
select V1. It does not turn on QA or bypass the current QA environment/abuse/DB
gates. Runtime choice is never sourced from localStorage or a client-supplied
version. Legacy V1 requests stay compatible even while the new UI negotiates V2.

## Transient interaction lifecycle and writes

The adapter binds a random handle to the freshly authenticated actor and explicit
Trip or new owned planning workspace. Every HTTP request reauthenticates; domain
services recheck ownership, persisted role, revision and eligibility. Captured
headers refresh on subsequent requests, including session rotation. Handles are
not authorization. Wrong actors and missing/expired handles fail closed.

The per-worker store has a 30-minute idle lifetime, at most 16 active sessions,
64 retained START results and 24 replay records per session. Current admission
limits are reused. Same-key starts/turns share a promise; changed payloads fail.
This is bounded HTTP interaction replay, not another durable idempotency store.
Trip writes still use the existing service/transaction/idempotency contract.

SAVE is a separate explicitly confirmed UI operation using the server's current
proposal, never a model action or client-authored candidate. Existing exact date,
fresh Validator, canonical fingerprint, authorization and confirmed DB write are
mandatory. Saved-trip apply continues through US-37. UNKNOWN retains its original
domain request/key and freezes mutation; read-only in-trip QA remains available.
Save reconciliation uses the existing persisted pending request, not a regenerated
candidate. No autonomous action loop or automatic consequential retry is added.

Reload starts a fresh interaction; it does not restore an unsaved proposal or
guess a pending confirmation. Worker/process loss or runtime rollback rejects old
handles. Reviewed needs and saved Trips remain in the DB and V1 can read them.
The V2 UI announces its transient state and expires old controls. The existing
V1 history UI remains available on rollback; V2 does not promise reload-durable
dialogue, saved proposals or page/popup in-memory handoff continuity.

**Historical V2-07 limitation, resolved by [V2-07A](ASSISTANT-SKILL-RUNTIME-V2-07A.md):** process-local handles required subsequent turns to
reach the same live worker to continue; another worker fails safely with409.
This is not evidence of multi-instance/serverless continuity. Do not enable a
general Vercel rollout without accepting or resolving that limitation and passing
the browser gates. This ticket introduces no persistence framework to conceal it.

## Bugs found through live/integration acceptance

1. Exact-date understanding clears departureWindow with undefined. V1 removes it
   at its HTTP JSON boundary; internal V2 initially passed it to strict idempotency
   and failed400. The understanding action now emits plain JSON needs before
   publication. Shared idempotency and V1 behavior remain unchanged.
2. Saved-trip START initially returned503 for an action-wrapped ownership404.
   The adapter now preserves the trusted AppError status/code on START as it does
   on turns. A foreign Trip still fails before private/model work.
3. REVIEW can commit before initial generation rejects (observed PACE_LIMIT).
   V2 now reads the authoritative workspace version and returns PROPOSAL_FAILED,
   preserving stated needs without automatic regeneration. Unknown publication
   remains uncertain/frozen. A later explicit request may retry a known failure.
4. A live wording response denied having an itinerary even though its card was
   generated. The presentation guard now rejects that denial and renders the
   existing safe fallback without repeating any business operation.
5. Eager manual-map import pulled browser/CSS dependencies into ordinary popup
   tests and planning startup. Lazy loading fixes that integration boundary
   without changing the Next/PostCSS config or suppressing assertions.
6. Browser screenshots exposed the V1 sidebar shell's horizontal layout being
   reused by V2. A dedicated conversation column fixes it; the 360px view was
   measured and inspected. Internal citations with null public URL now show
   their returned title/locators without invented links. V2 also displays the
   authoritative GPS/manual/unknown location source.

The old V2 provider-failure assertion now checks the explicit structured failure,
no generated candidate, one engine call and no publication/Save, instead of
requiring a thrown internal error. This follows the V2-07 controlled-error
requirement; it is separate from the untouched51 historical baseline failures.

## Evaluation and reproduction

The fixed [20-case corpus](../implementation/assistant-v2-evaluation-corpus.json)
defines user turns, behavior and dimensions. The report separates paired live
V1/V2 comparisons, real API/DB/RAG/routing evidence, deterministic service tests
and browser gates. Unrun comparisons are not assigned a winner or counted PASS.

An opt-in `scripts/assistant-v2-live.mjs --live` harness checks the configured and
actual approved Development endpoint before creating its own UUID account. It
uses the real production endpoint, models, corpus and route provider. It leaves
credentials only in ignored `.cache/v207-live/private-fixture.json`; reports do
not contain them. `--live --cleanup` removes only that exact UUID-owned fixture's
resources. The V2 gate must be enabled in the local process for that run. No
source approval, destination data or environment files are changed by the harness.

Current task-specific ignored receipts live in `.cache/v207/`; the tracked report
summarizes them without copying cookies/passwords/keys. Final test/build/diff and
live/browser results are recorded in the report and `docs/ai-progress.md`.

## Closure evidence and remaining gates

- Focused: 13 files, 162 PASS. Relevant regression: 80 files, 1117 PASS,
  51 failures, 16 skipped and 1 todo. Exact failure identities equal the
  pre-V2 baseline: zero added/removed and no suite-load errors.
- TypeScript, isolated production build and diff check PASS. No schema change.
- Real model, Dev DB, RAG and Stadia routing exercised. Browser minimum brief,
  all-in-one, culture/pace refinement, bounded remove, explicit Save and saved
  Trip proposal/confirmation/apply passed. Proposal did not write; unrelated
  days stayed equal. Reload removed stale confirmation and refused bare apply.
- Real manual map/location path passed; Validator rejected an infeasible
  travel-time proposal without applying. Actual permission-granted GPS remains
  unverified; granted/denied/unavailable normalization has controlled coverage.
- Same-endpoint live configuration rollback PASS: old V2 requests409, legacy
  V1 START200, bootstrap v1, saved Trip readable and browser back on V1.
- Live harness executed 8 API requests and its exact fixture cleanup passed.
  All four task-created accounts and owned resources were cleaned. Existing
  destinations, source approval and user data were not modified.
- Paired ranking covers 7 of 20 corpus cases: 5 V2-better, 0 V1-better,
  2 equivalent on measured dimensions; 13 remain unranked. Do not call this a
  complete 20-case paired benchmark or a complete provider-call measurement.

**KEEP_V1_DEFAULT.** The exact Lô Lô Chải replacement lacks an eligible record;
the Dinh construction-date question lacks sufficient approved evidence. A real
Đồng Văn answer/citation and an alternative bounded removal are separate positive
receipts, not substitutes for those exact positive examples. The live referent
edit rejected safely but did not demonstrate a successful positive edit. The
report also records generic clarification wording, incomplete paired metrics,
transient history and same-worker continuity as remaining acceptance limits.

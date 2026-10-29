# V2-04 — Surgical Itinerary Replanning

Continuation note: [V2-05](ASSISTANT-SKILL-RUNTIME-V2-05.md) now implements the
interleaved QA capability described as deferred in this historical V2-04 receipt.
QA interruptions preserve pending edits and UNKNOWN; V2-06 remains unstarted.

## Status and scope

IMPLEMENTED / scoped V2-04 DONE in the internal authenticated V2 new-trip session,
2026-10-28. Live-model quality and browser/product acceptance remain separate.
Production routing remains V1. V2-05 and V2-06 are not started. The owner request
supersedes the earlier V2-03 edit handoff only for the current unsaved proposal.
No saved-trip editing, GPS, QA integration, external place research, streaming,
booking, SDK migration, UI change or reload-persistent session is included.

Sources: [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
[ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-04.md),
[V2-03](ASSISTANT-SKILL-RUNTIME-V2-03.md),
[ADR-26–31](../decisions.md#adr-26--single-skill-oriented-assistant-runtime-for-v2-2026-10-28),
[product](../product/product-spec.md), [flows](../flow/user-flow.md),
[US-36](US-36-in-trip-replan.md), [US-37](US-37-confirm-in-trip-proposal.md).
The pasted task ends during section 35's acceptance checklist; its complete
sections 0–34 define the implemented requirements and verification below.

## Capability and bounded operations

`itinerary-replanning` is the second registered skill, with its own instructions
and only `replan-preliminary-proposal` in its action allowlist. `travel-planning`
owns planning conversation and delegates EDIT after a canonical proposal exists.
The generic runtime remains domain-independent; unknown skills/actions fail and
the existing action wrapper validates input and output schemas.

Supported: REMOVE, ADD, explicit REPLACE, semantic REPLACE, MOVE and explicitly
requested REPLAN_DAY. Compound edits are limited to four operations. All edits
are applied to a working selection/needs copy, followed by one validation and
one publication. Failure in a later operation cannot publish an earlier removal.
REPLAN_DAY uses the existing generator and `assertEditScope`; no other operation
calls the selection generator or regenerates the itinerary by default.

The internal bounded extraction schema extends the existing planning operation
contract for MOVE, optional position and semantic criteria. It uses the existing
JSON provider (Luna/high), not a regex parser or new provider stack. The existing
understanding layer still determines preference-versus-edit intent. Its internal
V2 policy handles MOVE as EDIT without changing the public V1 operation schema.

Deterministic REMOVE/ADD/REPLACE and exclusion/mandatory normalization reuse
`applyPlanningEdit` and `editNeeds`. Default insertion is the current planning
edit behavior; an explicit position is bounded and checked. MOVE adapts an ID
selection without changing the destination or other requirements. Existing
saved-trip MOVE code requires factual visit clocks, so it cannot accept null-date
preliminary visits without fabricated data; it remains unchanged.

## Canonical state and atomic publication

Every action checks actor-bound services, server-owned workspace version,
unsaved/non-pending status, proposal version and the existing requirement/day
fingerprint before extraction or mutation. The action derives selections from
that verified proposal, not a separately supplied selection. The session always
uses its most recently confirmed `generated` value. Authorization/ownership is
rechecked per turn and by the existing repository transaction.

Publication reuses V2-03's optional atomic `publishProposal` path. Needs,
fingerprint and version commit in the same idempotent, authorized transaction,
guarded by the previous fingerprint/version. Only after confirmation does the
session replace the proposal/evidence and workspace together. One logical or
compound edit increments the version once. No REVIEW clears the previous
fingerprint, and no Trip or Save operation runs.

Provider/data errors, invalid scopes, cancellation, no suitable alternative or
Validator VIOLATION preserve the current proposal. A rejected candidate is
separate from the canonical proposal. UNKNOWN publication preserves the last
known proposal, freezes later mutations and requires existing exact-payload/key
reconciliation; an in-process same-key replay returns the same result. This does
not add a durable transcript/proposal store or recovery endpoint.

## Resolution and constraints

The existing canonical-name normalizer/resolver was extracted without changing
V1 exact-before-substring behavior. There is no separate alias table in the
current inventory, and no new aliases are invented. Targets resolve within the
selected scope; unique existing occurrences supply their source day. Ambiguous
targets/destinations and missing targets/days preserve state and return the
existing `editClarificationSchema` reason codes. Choice continuations use the
existing `choiceIndex` and `editResolutionSchema`, bound to the pending proposal
version and newly resolved candidate/day set. Cancellation discards the pending
edit. No day is silently chosen for ADD/MOVE when missing.

Explicit replacement resolves the requested destination without candidate
ranking. Semantic replacement uses the existing eligible DB inventory, current
exclusions/required constraints, culture-category `interestScore` and existing
geographic `haversine` ordering against an explicitly named anchor. Coordinates
are a ranking heuristic, not road-distance or suitability evidence; the response
states that distinction, and the actual route is calculated separately. No
qualifying candidate means controlled rejection. Other explicit constraints
remain intact; an explicitly removed/replaced target follows existing removal
semantics, while unrelated mandatory/excluded IDs are retained.

## Scope, dependencies and Validator authority

The optional internal scope on existing `scheduleSelection` recalculates route
evidence and schedules only affected days and actual changed inbound-leg
dependencies. Unchanged days are cloned structurally with their original stop
order, snapshots, clocks and route evidence. A removed predecessor's stale
inbound leg cannot survive, including when empty early days make another stop
the first stop of the trip.

Discovery: existing `plannerRoutePairs` includes cross-day travel from the prior
day's last stop. Changing that stop may require the next nonempty day to receive
a different inbound leg. This is consistent with the locked explicit-acceptance
rule; V2-04 does not silently broaden scope. The action compares complete day
content outside the requested scope and returns OUT_OF_SCOPE clarification
before publication. Acceptance is limited to the named dependency days; a newly
discovered additional day requires another confirmation. Delta responses list
both requested days and accepted dependency days.

The existing Validator still scans the complete assembled candidate because its
cross-day checks share predecessor context; this cheap deterministic check is
not whole-trip route resolution or rescheduling. New destinations never inherit
old destination evidence. Fresh selected data is rechecked before publication.
VIOLATION cannot publish as current. Missing start date does not block an edit:
date-dependent checks remain INSUFFICIENT_DATA, and Save eligibility remains
false. Unknown route/accessibility evidence is never converted to PASS.

## Response and compatibility

Structured response plans report REPLAN_PROPOSAL, REPLAN_CLARIFY or REPLAN_FAILED,
edit types, affected/dependency days, removed/added/moved names, semantic-ranking
reason, actual validation status and `proposalChanged`. Bounded presentation
templates explain the delta without retelling the trip or claiming a saved Trip.
Clarification wording belongs to the response layer, not the patch engine.

V1 routes, public schemas, UI, Save, in-trip logic, routing provider and Validator
implementation are unchanged. Shared edits in this slice are the identical
resolver extraction, an internal-only MOVE intent instruction and optional scoped
scheduling. Calls without scope retain full existing scheduling behavior. V2-03
atomic publication is reused without another persistence change or migration.
No US-36/37 business rule was changed or superseded by this task.

## Verification

`planning-replanning.vitest.test.ts` exercises real understanding normalization,
destination resolution, edit normalization, route/scheduler/Validator and action
dispatch with provider, DB inventory, route and repository fixtures. Assertions
cover exact untouched-day equality; REMOVE/ADD/REPLACE/MOVE; semantic selection
and no candidate; target/destination/day clarification and cancellation;
cross-day acceptance; compound success/failure; stale version/fingerprint;
allowlist/input boundaries; data changes; unknown routes; rejected validation;
REPLAN_DAY scope enforcement; UNKNOWN and replay; one publication/version; no Save.
V2-01/02/03 tests remain included, with historical edit-handoff assertions replaced
by still-deferred QA assertions. Registry expectations now include the second skill.

Final commands/results are recorded in `docs/ai-progress.md`. Opt-in live model,
Stadia, PostgreSQL and browser acceptance were not run. Existing skipped live/DB
tests and the US-36 precision-policy todo remain outside this slice. No commit,
push, merge or deployment is performed.

| Check | Final result |
| --- | --- |
| V2-01/02/03/04 focused tests | 9 files, 85 PASS; includes 15 new V2-04 tests. |
| Planning/US-36/37 and related regressions, including all V2 tests | 42 files PASS, 3 opt-in files skipped; 527 PASS, 0 FAIL, 8 skipped, 1 existing todo. |
| Web `tsc --noEmit` | Exit 0, PASS. |
| Isolated production build | Exit 0, PASS; TypeScript and 49/49 static pages. |
| `git diff --check` and untracked-file whitespace check | PASS. |

Tests use the bundled Node and `../../node_modules/vitest/vitest.mjs run --config
vitest.config.mts --isolate` from `apps/web`. The 45-file final selection includes
the full V2/planning/runtime-config directories; planning client/chat/history and
assistant auth-boundary components; QA service/http/session-continuity/model;
US-35 integration, US-36, US-37 and replan clarification; Save/service HTTP;
planner engine/boundaries/Stadia; validation/travel-time; and edit candidate/
clarification tests. Production build uses `KLTN_PERF_BUILD=1`,
`scripts/prepare-map-assets.mjs` and `scripts/build.mjs` with bundled Node on PATH,
so output remains isolated from the development server.

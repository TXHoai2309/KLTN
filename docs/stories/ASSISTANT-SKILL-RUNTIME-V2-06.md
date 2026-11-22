# V2-06 — Saved-trip & In-trip Assistance

## Scope and status

IMPLEMENTED / scoped V2-06 DONE for an internal authenticated saved-trip session,
2026-10-28. Historical regression baseline debt remains explicitly open below.
Production routing remains off; V2-07 is not started. No browser/live-provider
acceptance, UI redesign, saved-proposal store, database migration, new GPS or
provider implementation is included. Historical US-35/36/37 DRAFT acceptance
checkboxes are not declared accepted by this implementation.

Sources: [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
[ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-06.md),
[V2-01](ASSISTANT-SKILL-RUNTIME-V2-01.md),
[V2-02](ASSISTANT-SKILL-RUNTIME-V2-02.md),
[V2-03](ASSISTANT-SKILL-RUNTIME-V2-03.md),
[V2-04](ASSISTANT-SKILL-RUNTIME-V2-04.md),
[V2-05](ASSISTANT-SKILL-RUNTIME-V2-05.md),
[US-35](US-35-current-manual-location.md), [US-36](US-36-in-trip-replan.md),
[US-37 validation/apply](US-37-in-trip-validate-confirm.md),
[US-37 confirmation](US-37-confirm-in-trip-proposal.md),
[product](../product/product-spec.md), [architecture](../architecture/technical-architecture.md),
[flows](../flow/user-flow.md) and [ADR/RBAC decisions](../decisions.md).
Existing Product/System source navigation is retained; no new DOCX/Figma
inspection or pixel-parity acceptance is claimed.

## One runtime and explicit saved-trip context

`in-trip-assistance` is the fourth registered skill. Its policy delegates narrow
actions to existing modules; it is not a new agent or a second replanning engine.
The generic runtime remains unchanged. `AssistantAgentContext` adds an optional
server-owned `savedTripId`; an in-trip action requires that ID, the actor and
actor-bound services to match, with no unsaved planning workspace in the context.
The caller must explicitly supply an active Trip ID. Conversation text never
selects an arbitrary saved trip.

Actions: `read-saved-trip`, `resolve-current-location`, `create-in-trip-proposal`,
`validate-in-trip-proposal`, `apply-in-trip-proposal`. Each has input/output schema
validation through the existing action wrapper and a skill allowlist. Other
skills cannot call these actions. The in-trip skill has no new-trip generation,
QA execution, generic database write or booking capability.

`startInTripV2Session` is the injected internal orchestration seam.
`startSavedTripAssistantV2` composes the existing database/auth, structured client,
Stadia route and eligible-candidate services lazily. Neither is imported by a
production route. QA uses the V2-05 `ha-giang-qa` skill and existing gated service.

## Saved-trip authority and concurrency

Every turn/action/replay reads through existing owner-scoped `getTripForEdit`.
It provides candidate, labels and the `Trip.updatedAt` revision from one snapshot.
`splitCompletedRemaining` uses the authoritative server clock to classify the
persisted schedule. A scheduled-complete visit is not a claim of physical arrival.
Hidden/deleted historical destinations retain their visits but receive the
existing unavailable label; replacements use the current eligible inventory.

The database remains canonical. Session state holds only transient proposal,
clarification, normalized location and pending confirmation/reconciliation data.
New requests supersede old pending proposals. Confirmation checks the current
revision; stale, superseded and competing-session proposals do not apply. Success
reads the updated database state rather than treating the session candidate as a
separate authoritative itinerary. No reload-persistence framework is introduced.

## US-35 location and materiality

The semantic router chooses only conversation intent/materiality/explicit day
scope; it does not emit edit operations, GPS coordinates, route times or validity.
Actual edit understanding still runs through US-36. Reading the next scheduled
visit and explicitly scoped future-day edits do not request GPS. The next-visit
response describes schedule order, not a recommendation based on unknown position.

A current-position-dependent request asks for location. `requestGps` is an
explicit invocation of existing `requestBrowserLocation` plus `location-flow`
transitions. It does not run on session start, call `watchPosition` or track in
the background. Denied/unavailable/timeout/unsupported results expose the existing
manual fallback. This server integration accepts normalized data from an explicit
gesture; it adds no browser transport or UI acceptance claim.

`provideLocation` uses the registered action and existing
`normalizeInTripLocation`. Manual location requires real finite coordinates and
an explicit timestamp; a place name/default viewport is insufficient. GPS source
is preserved separately from MANUAL and UNKNOWN. Normalization does not certify
presence, freshness, accuracy or regional eligibility; no new thresholds/geofence
are invented. Reacquiring location invalidates the previous proposal, preserving
the requested scope for a new proposal. Raw coordinates stay transient and do not
enter routing/classification prompts, QA, URLs, logs or storage.

### Necessary internal no-location adapter

Discovery: the existing US-36/37 contracts require location for all proposals,
although this task explicitly requires avoiding location when it is immaterial.
Reusing the saved AI-edit apply kind would bypass in-trip completion/time checks;
that is not used. Instead an optional server-only `allowLocationIndependent`
argument extends the same existing US-36/37 pipeline for **future-day-only edits**.

`assertLocationIndependentScope` requires identical trip metadata and structurally
identical days through today. No-location proposals cannot set a current-day
mandatory endpoint. The prompt omits location/proximity ranking instead of
fabricating coordinates. US-36 checks the actual candidate, US-37 preview checks
again, and apply checks the restriction before validation and inside the existing
transaction using the same authoritative reference clock. If the server day
changes before apply, a newly current-day edit is rejected. Today's edits require
a real normalized location and existing origin-route validation. Explicit day
scope is separately compared against the returned proposal before presentation.

The public V1 replan/preview/apply schemas still require location. Default service
calls retain their existing behavior; no request field can enable the internal
exception. All four Validator groups, completed preservation, current destination
eligibility, routing bounds and apply-time revalidation remain authoritative.

## US-36 proposal and clarification

The action calls `replanTrip`: latest owned revision, server completion partition,
eligible destination retrieval, existing structured analyzer, ID verification,
deterministic edit functions, mandatory endpoint and `preserveCompleted`.
ADD/REMOVE/REPLACE/MOVE/time/duration and remaining/day requests retain that
analyzer's supported operation semantics. There is no copy of the V2-04 parser or
patch engine. A proposed result is never an itinerary write.

NEEDS_CLARIFICATION retains the existing reason and choice/resolution schemas,
including AMBIGUOUS_DESTINATION and MISSING_DAY. The response layer shows the
existing Vietnamese question, not raw codes. One bound choice resumes the original
request on the same current revision, without asking unrelated preferences.

Discovery/fix: the existing verifier checked a selected day only against
`params.dayIndex`. REMOVE/REPLACE/time/duration operations deliberately have no day
parameter, making a valid MISSING_DAY continuation for those targets impossible.
The verifier now also matches the target's actual server-owned day for those
operations. A different target day still returns MISSING_DAY. Focused verifier
tests cover both outcomes; no occurrence or day is guessed.

## US-37 confirmation, apply and UNKNOWN

Every proposal runs `previewInTrip` before presentation. The response plan carries
PROPOSED, actual validation, affected days and the existing diff. Only all mandatory
groups SATISFIED and `canConfirm=true` allow confirmation. Violations/insufficiency
remain visible and cannot be overridden by LLM wording.

Explicit confirmation uses existing `planningReply` and the task's explicit
“Áp dụng đi”/“Chốt phương án này” wording. Casual “nghe ổn đấy” does not apply.
A bare agreement after a QA interruption re-shows the pending clarification or
proposal first, retaining replacement names, delta and affected-day scope.
Location, request, clarification or revision changes invalidate old confirmation.

`apply-in-trip-proposal` calls existing `applyEdit` with `kind=IN_TRIP`; it never
updates visits directly. Existing preflight replay, fresh Validator/time/completion
checks, ownership, transactional CAS, itinerary replacement and successful
idempotency record remain in charge. No second durable idempotency mechanism or
new audit sink is added. The operation remains `trip:apply-edit`; older draft
documentation's proposed operation/API names are historical, not new contracts.
Existing location exclusion from the durable request hash remains unchanged, but
the active UNKNOWN retry retains the entire normalized request and original key.

Only confirmed service/DB SUCCESS produces applied wording. FAILED/REJECTED and
UNKNOWN remain distinct structured states. UNKNOWN does not claim cancellation or
success, blocks new mutations and location changes, and retains the identical
request/key. `reconcile()` is an explicit caller/user retry through the existing
service; it never regenerates a proposal or automatically retries a consequential
write. A committed replay occurs before new time/version validation, so a lost
acknowledgement cannot duplicate the revision/write. Failed transactions preserve
the previous persisted itinerary; technical uncertainty remains UNKNOWN.

## QA and response policy

Factual questions route to V2-05 source-only QA with the existing citation bundle.
Pending in-trip clarification/proposal and UNKNOWN survive QA. A fresh unique QA
subject may supply an intent referent to US-36; ambiguity asks rather than guessing.
The response layer renders proposal delta, location source, actual checks,
confirmation requirement and business outcome. No final conversational sentence
was added to existing US-35/36/37 business services. It does not re-tell the trip or
claim an apply based on model output.

## Verification and limits

`in-trip-v2.vitest.test.ts` uses the real read/replan/ID-verifier/edit/Validator/
apply/idempotency services with fake DB transactions, structured provider and route
evidence. QA interleave uses the real QA service/grounding/citation path with fake
retrieval and generation. Assertions cover Traveler/Admin, required clarification
and location demos, next visit, GPS/manual fallback, invalid manual location,
future-only guard, exact completed/unaffected scope, explicit replacement, QA
referent, no auto-apply, fresh validation, stale/superseded/two-session proposals,
day-boundary rejection, rollback, committed UNKNOWN/replay, privacy, deleted
history/eligible replacements, actor/context/schema/allowlist and public V1
compatibility. The new verifier regression checks matching and mismatching days.

Final checks, using the bundled Node runtime from `apps/web`:

| Check | Completed result |
| --- | --- |
| `vitest run --config vitest.config.mts --isolate src/modules/assistant-agent-v2 src/modules/in-trip/replan-verify.vitest.test.ts` | 12 files / 155 PASS: all 132 V2 tests (28 V2-06) and 23 US-36 verifier tests. |
| Broad 70-file regression | 63 passed files, 3 failed files, 4 opt-in skipped files; 939 PASS / 3 baseline FAIL / 16 skipped / 1 existing todo. |
| Three-file pinned-HEAD in-trip baseline | 26 PASS / the same 3 FAIL. |
| Eight-file current in-trip/QA debt comparison | 145 PASS / 51 FAIL: exactly 3 in-trip baseline plus 48 previously verified QA baseline assertions; zero new failures. |
| `tsc --noEmit` | PASS, exit0 on final source. |
| `KLTN_PERF_BUILD=1`, `scripts/prepare-map-assets.mjs`, `scripts/build.mjs` | PASS, exit0; TypeScript and 49/49 static pages. |
| `git diff --check`, task/untracked whitespace and source/scope review | PASS. |

The broad selection includes all V2, in-trip and assistant-planning tests; owned
trip read, apply/edit service, Save, planner/route/Validator; QA service, HTTP,
session continuity, model, generation, retrieval, destination context, original
source projection and public safety; citation storage, runtime configuration,
Traveler guard/RBAC, planning client/chat flow. Opt-in live/provider/Postgres
checks remain skipped. Ignored final receipts are
`.cache/v206-baseline/regression-closure.json` and `.log`; the JSON contains the
exact 70 file paths and assertion outcomes. Earlier completed receipts are kept
separately and are not substituted for the final run.

Final commands/results are also recorded in `docs/ai-progress.md`. The broad suite is
not claimed fully green: three old in-trip failures reproduce on HEAD, alongside
the same 48 QA failures from V2-05. Exact comparison and causes are in the
[V2-06 baseline audit](../implementation/assistant-skill-runtime-v2-06-baseline.md).
No unrelated baseline tests or production behavior were changed to hide them.

No live GPS permission, browser/keyboard/360px, real model/RAG corpus, DB/Stadia,
deployment, commit, push or merge is claimed. No schema/dependency/environment-file
change is required. The Assistant's active transient location/proposal/pending
state is lost on reload; the canonical saved Trip remains in the database. V2-07
and production rollout remain outside this task.

Historical continuation, 2026-10-29: the separate
[V2-07 story](ASSISTANT-SKILL-RUNTIME-V2-07.md) now integrates this slice behind
a server-only gate and records real browser/API/DB/model/RAG/routing evidence.
Its [rollout review](../implementation/assistant-v2-evaluation.md) keeps V1 as
default and does not change the original V2-06 acceptance scope above.

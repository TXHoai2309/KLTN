# V2-03 — Progressive Refinement & Muse-style Conversation Behavior

Continuation note: [V2-04](ASSISTANT-SKILL-RUNTIME-V2-04.md) now implements the
unsaved-proposal scoped edit handoff described as deferred in this historical
V2-03 receipt. Its registry adds `itinerary-replanning`; QA and saved/in-trip
workflows remain deferred. V2-03 test coverage now checks the QA handoff, while
dedicated V2-04 tests cover surgical edits. [V2-05](ASSISTANT-SKILL-RUNTIME-V2-05.md)
subsequently implements interleaved QA; older handoff tests now assert unchanged
planning state on an unavailable QA service, with actual QA flows covered there.

## Status and approved scope

IMPLEMENTED / scoped V2-03 DONE — internal authenticated V2 session, 2026-10-28. V2-01 and V2-02
remain the foundation. This slice extends post-proposal conversation with
preference-driven refinement; it does not switch production routing or start
V2-04. Owner/product acceptance, live-model quality and browser acceptance are
separate from the automated evidence below.

## Sources and dependencies

- [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
  [V2-03 ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-03.md),
  [V2-01 story](ASSISTANT-SKILL-RUNTIME-V2-01.md) and
  [V2-02 story](ASSISTANT-SKILL-RUNTIME-V2-02.md).
- [ADR-26–31](../decisions.md#adr-26--single-skill-oriented-assistant-runtime-for-v2-2026-10-28):
  one runtime, workflow-policy skills, progressive refinement and existing
  deterministic engine authority. No ADR baseline was rewritten for this slice.
- [Product requirements/validation/writes](../product/product-spec.md),
  [architecture](../architecture/technical-architecture.md),
  [user flows](../flow/user-flow.md),
  [RBAC V2](RBAC-V2-admin-inherits-traveler.md) and
  [existing conversation story](ASSISTANT-CONVERSATIONAL-PLANNING.md).
- Product/System source navigation remains the same as V2-02. No new inspection
  of original DOCX or Figma sources is claimed; this task has no UI redesign.

## Progressive refinement and material questions

The session now follows explicit fact → existing understanding/normalization →
semantic needs comparison → planning implication → one refinement → authoritative
validation → response. It never walks a list of missing optional fields.

`assessPlanningRefinement` compares semantic requirement fields, partial companion
metadata and required/preferred/excluded destination IDs. It reports changed
fields, new facts, implication codes and whether regeneration is needed. Repeated
facts produce ACKNOWLEDGE_NO_CHANGE without regeneration. Multiple explicit facts
are applied together in one bounded refinement action. A correction replaces the
prior conflicting preference according to the existing normalizer, rather than
unioning incompatible answers.

Supported categories are interests, pace, companion type/count (including partial
facts), mobility constraints, must-visit/preferred stops and avoid/exclusion IDs.
The existing planning requirement/needs schemas and normalizers remain the source
of truth; no parallel regex preference parser is added.

A question is material only when the current explicit request cannot safely be
resolved: ambiguity, unresolved destination choices or an existing date-change
clarification. It is not material merely because another optional field is null.
Schema-valid partial companion type/count is retained without demanding the other
part. A genuine clarification targets the new ambiguous fact, not an unrelated
transport/date question. Bound destination choices reuse V1's `choiceIndex` and
the existing exact-name resolver; unknown/ambiguous names are never guessed.

## Input → implication policy

| New information | Supported planning strategy |
| --- | --- |
| Culture/history/village interest | Prioritize cultural depth over visual-only stops when trade-offs are necessary. |
| Nature correction | Shift selection toward the newly stated nature preference; do not retain a conflicting old culture-only preference. |
| Moderate pace | Avoid crowded/max-stop days and preserve visit time. |
| Relaxed/packed pace | Adjust desired density within existing scheduler/Validator limits. |
| Companions/count | Carry group context without inferring romance, ages or destination suitability. |
| Mobility limitation | Re-evaluate destinations through the existing engine; missing accessibility evidence remains insufficient. |
| Must visit / avoid | Enforce existing mandatory/exclusion semantics during regeneration. |

These are strategy implications, not assertions that a particular destination is
romantic, less crowded or accessible. The composer receives the structured
response plan, not a canonical sentence to paraphrase. It must explain supported
consequences for changed preferences, preserve provisional/validation status and
avoid an acknowledgement-only answer or an unnecessary follow-up question.

The response plan extends V2-02 with REFINE_PROPOSAL, ACKNOWLEDGE_NO_CHANGE and
REFINEMENT_FAILED, plus refinement changed-fields/new-facts/implications,
proposalChanged, outcome, partial companion context and optional bound destination
choices. The existing validation summary identifies the result being discussed;
for a rejected refinement it describes the rejected candidate, not a replacement
of the current proposal. The returned `refinementCandidate` is separate from
`generated`, which remains the sole confirmed current proposal.

Language composition still uses the existing bounded Luna/high provider or a
deterministic presentation fallback. Wording failure cannot repeat generation,
publication or Save. Reply guards reject unsupported factual/suitability claims,
false success, positive validity against insufficient/violating checks, missing
changed-preference consequences, and forced questions after successful refinement.

## Actions and proposal/version authority

`travel-planning` gains the registered `refine-preliminary-proposal` capability.
The generic runtime, loader, registry architecture and action factory are not
replaced. Input/output schemas and the skill allowlist remain mandatory.

The action checks actor-bound services, owned workspace version and the existing
proposal fingerprint. It derives the previous selection from the actual current
proposal, then calls `generatePlanningProposal` with all updated needs and that
previous selection. Retrieval, AI selection, route resolution, scheduling,
Validator and destination recheck are reused unchanged. There is no new agent
loop or surgical edit parameter.

The original REVIEW → GENERATE sequence is deliberately not used for post-proposal
refinement: REVIEW clears the current proposal hash before generation, which would
break failure preservation. Instead, candidate generation and validation occur
first. Only then does the existing repository publication method atomically replace
needs, fingerprint and version in one idempotent transaction. The narrow optional
refinement argument adds old-fingerprint, unsaved-state and version predicates,
retaining persisted authorization and ownership. The four-argument V1 publication
path is unchanged. This is the only persistence adaptation; no migration or new
stored proposal payload is introduced.

After confirmed publication, the previous proposal is superseded and the new
proposal/version becomes the only current one. Earlier returned values remain
detached snapshots; callers cannot mutate the session's canonical proposal.
Missing date is still allowed for refined preliminary proposals, with null dates,
OPENING_HOURS INSUFFICIENT_DATA and no final-confirmation eligibility where required.
Mobility without accessibility data likewise remains INSUFFICIENT_DATA.

## Failure, rejection and UNKNOWN

- Generation/provider/data failures preserve the prior confirmed proposal,
  fingerprint and persisted needs. `latestNeeds` retains resolved explicit user
  changes separately so they are not confused with the old proposal's needs.
- A candidate with VIOLATION, exhausted repair failure or no remaining stops is
  REJECTED without publication. Its real validation result is returned separately;
  the response cannot claim a valid/successful replacement.
- Cancellation of pending/failed preferences restores the current proposal's
  needs and clears pending ambiguity without a write or regeneration.
- Publication is a version/fingerprint compare-and-swap with shared idempotency.
  Stale/foreign/locked requests cannot replace the proposal. Identical committed
  repository calls replay before old-version rejection; changed same-key payloads
  fail through the existing idempotency contract.
- Lost/unavailable publication acknowledgement is UNKNOWN, not success/failure.
  The session returns the last-known proposal with `uncertain=true`, freezes new
  changes and preserves the same-key result. It does not assert that the old
  fingerprint is still authoritative. Reconciliation requires the existing exact
  publication payload/key; no automatic regeneration or new recovery framework
  is introduced in this ticket.

The internal session retains latest explicit needs, one current proposal and its
validation status. It remains transient across reload/process loss. Same-key
concurrent calls share the current in-process promise. None of these behaviors
persist unconfirmed itinerary schedules or grant Save authority.

## V1 isolation and deferred work

The V2-specific understanding policy is a server-only optional argument to the
existing analyzer. It is supplied only by the internal action; no field is added
to V1 request/dialogue schemas. The normal V1 analyzer invocation, questionnaire,
reply composer, routes and client controllers are unchanged. The additive
repository publication argument is used only by refinement and has tests proving
the old call retains the same query/data behavior.

Scoped day/stop edits such as “Ngày 2 bỏ A thay B” remain EDIT/HAND_OFF. No
`itinerary-replanning` skill, in-trip behavior, Q&A execution, research, booking,
weather, streaming, UI redesign, SDK/Responses migration or production switch is
implemented. V2-04 is not started.

## Required demo

The automated session demonstrates:

```text
Tôi muốn đi Hà Giang → asks duration
2 ngày → compact-route implication + asks transport
ô tô → preliminary proposal
Mình thích trải nghiệm văn hóa → cultural-priority consequence + refined proposal
Mình muốn nhịp vừa phải → preserve visit time/avoid packed days + refined proposal
```

No companion/count/mobility/must-visit checklist follows either refinement. Unknown
optional fields remain unknown. Tests mock provider JSON and candidate/route data,
but execute the actual understanding normalizer, planning engine, scheduler and
Validator. This is functional/contract evidence, not a live model-quality result.

## Tests and acceptance evidence

Final verification receipts:

| Check | Result |
| --- | --- |
| V2-01/02/03 focused suites | 8 files, 70 PASS; includes 20 new V2-03 tests. |
| Relevant V1/V2/planning/QA/US-35–37/Save/Validator selection | 40 files, 478 PASS, 0 FAIL, 8 opt-in skips, 1 existing US-36 todo. |
| Web `tsc --noEmit` | PASS, exit0. |
| Isolated production build | PASS, exit0; compile, TypeScript, 49/49 static pages. |
| `git diff --check`, task whitespace and scope/secret review | PASS. |

Acceptance reviewed: later explicit preferences refine the existing preliminary
proposal; no optional questionnaire; consequence-oriented wording; combined facts
and corrections; reused planner/routes/scheduler/Validator; one confirmed current
proposal; date-less refinement; no auto-save/surgical editing/production switch;
V1 regression preserved; passing tests/type/build/whitespace and updated docs.

Focused V2 suites include the existing V2-01/02 tests and two V2-03 suites:

- `planning-refinement.vitest.test.ts`: exact demo, combined facts/one refinement,
  corrections, no-change/no-questionnaire, partial companions and count, mobility,
  must-visit/avoid, ambiguity/choice resolution, surgical-edit handoff,
  previous-proposal preservation, empty/violating candidate rejection,
  stale/UNKNOWN handling, concurrent same-key calls, wording failure, and public
  V1 payload rejection of the internal understanding mode.
- `refinement-publication.vitest.test.ts`: real repository plus shared idempotency
  helper on transactional test doubles; atomic needs/hash/version update, identical
  replay, stale fingerprint/version rollback, persisted-role/ownership checks,
  transaction failure/retry, and unchanged four-argument V1 publication.

Reproduce with the bundled Node and target list in the
[V2-01 verification commands](ASSISTANT-SKILL-RUNTIME-V2-01.md#verification-commands-and-limits).
The V2 module target includes all new suites. Run web `tsc --noEmit`, isolated
production build with process-local KLTN_PERF_BUILD=1/PATH, and `git diff --check`.

No real DB/provider/browser acceptance, deployment, commit, push or merge is
claimed. Transactional test doubles are not a PostgreSQL migration/integration
receipt; the schema is unchanged and no live database mutation was needed.

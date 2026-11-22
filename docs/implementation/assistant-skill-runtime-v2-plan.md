# Assistant Skill Runtime V2 — settled MVP plan

## Status

Owner-directed design baseline, 2026-10-28. V2-01 through V2-06 are implemented;
V2-07 adds gated production-path integration and live evaluation. V2-07A passed
the readiness gate; the owner subsequently approved minimal V2 default
enablement, (historical: the V1 rollback variable was retired in the V1 retirement, see ADR-35).
See [enablement verification](assistant-v2-default-enablement.md). The goal remains to prove the planning
path first, then optimize language, streaming and capability breadth.

Execution update, 2026-10-28: the owner narrowed V2-01 to an internal runtime
foundation. That foundation is implemented with contract tests; the production
V2 conversational path and its first duration question are not integrated.
See [V2-01 scope and verification](../stories/ASSISTANT-SKILL-RUNTIME-V2-01.md).

V2-02 update: an internal authenticated session now runs new-trip → duration →
transport → existing-engine preliminary proposal, using deterministic readiness
and structured response plans. No production route/UI or V1 questionnaire was
changed. See [V2-02 scope, demo and limits](../stories/ASSISTANT-SKILL-RUNTIME-V2-02.md).

V2-03 update: later explicit preferences now produce strategy implications and
one bounded existing-engine refinement, without completing an optional-field
questionnaire. Confirmed publication replaces the canonical proposal atomically;
failure/rejection preserves the previous proposal. See
[V2-03 scope, version/failure semantics and evidence](../stories/ASSISTANT-SKILL-RUNTIME-V2-03.md).
V2-04 update: explicit edits on the current unsaved proposal now delegate to the
registered `itinerary-replanning` skill. It preserves unaffected days, recalculates
affected dependencies, asks before extending scope across days, and publishes
once after authoritative validation. See
[V2-04 scope and verification](../stories/ASSISTANT-SKILL-RUNTIME-V2-04.md).
V2-05 update: factual questions now use the registered read-only `ha-giang-qa`
skill and existing gated QA/RAG/citation/history pipeline. Planning version,
needs, proposal, pending clarification and UNKNOWN survive the interruption;
the next turn routes naturally back to planning or bounded editing. See
[V2-05 implementation, limits and baseline debt](../stories/ASSISTANT-SKILL-RUNTIME-V2-05.md).
V2-06 update: an explicit owned saved-trip session activates `in-trip-assistance`
and delegates location, clarification/replanning, preview and confirmed apply to
existing US-35/36/37 services. Latest DB state remains canonical; UNKNOWN retains
the exact apply request/key and allows read-only QA. Material current-day edits
require normalized location; the internal future-day-only adapter preserves all
days through today and still runs the existing Validator/apply checks. See
[V2-06 implementation and baseline debt](../stories/ASSISTANT-SKILL-RUNTIME-V2-06.md).
V2-07 continuation: the existing planning endpoint and Assistant UI can now
select V2 through a runtime switch (historical: V1 was the default then; V1 and the switch were retired, see ADR-35).
No deployment or V1 retirement occurs. See the
[integration story](../stories/ASSISTANT-SKILL-RUNTIME-V2-07.md) and
[evaluation/rollout gate](assistant-v2-evaluation.md) for actual live evidence,
baseline failures and remaining limitations. Earlier slice statements above
describe their original internal-only acceptance, before this integration.

## Why this change exists

The current Assistant planning engine is reliable at structured extraction, candidate eligibility, routing, scheduling, deterministic validation, proposal versioning and idempotent Save. Its conversational controller is intentionally stricter: it asks missing fields in a fixed sequence and then asks the model to paraphrase one canonical next sentence. That structure protects facts but produces a questionnaire-like experience.

V2 changes the conversation/orchestration layer without replacing the KLTN business engine.

## Sources and borrowed patterns

- Muse `travel-planning`: smallest useful brief, do not turn intake into a questionnaire, canonical itinerary/proposal ownership, progressive refinement and bounded replanning.
- Muse `places-search`: source pattern for the later `place-research` skill.
- TripSage AI: single server runtime, typed schema-validated tool/action definitions, server-owned orchestration, structured outputs and future approval/streaming seams.
- Existing KLTN: authoritative destination/RAG data, planning workspace, AI selection, scheduler, route provider, deterministic Validator, ownership, idempotent Save and in-trip rules.

The V2 MVP does not copy TripSage infrastructure (Supabase/Auth/RAG/Redis/QStash) and does not copy Muse skills verbatim.

## Locked architecture

### One runtime, skill-oriented

One Assistant runtime selects a skill and asks for a structured next action. Skills are policies, not autonomous agents.

Initial executable scope:

1. `travel-planning`

Reserved V2 skill taxonomy:

2. `place-research`
3. `itinerary-replanning`
4. `in-trip-assistance`
5. `ha-giang-qa`

Future:

6. `booking-assistance`

### Skill vs capability action

A skill owns reusable multi-step reasoning/conversation policy. A capability action owns application work with a typed contract.

Initial capability actions should cover only what the first vertical slice needs, for example:

- read current planning state;
- analyze/update user needs through the existing bounded understanding boundary;
- generate a preliminary proposal through the existing planning engine;
- return authoritative validation/proposal facts.

Do not expose Save as a model-executable action in the first slice. Existing explicit Save remains unchanged.

### Structured next-action decision

The V2 runtime should ask the model for a bounded decision rather than one canonical sentence. The minimum useful decision vocabulary for the first slice is:

- `ASK_MATERIAL_QUESTION`
- `GENERATE_PRELIMINARY_PROPOSAL`
- `CLARIFY`
- `HAND_OFF_TO_EXISTING_FLOW`

The decision includes a response plan: conversational goal, supported facts/implications, optional question topic, and whether a planning action is requested. Application code validates the decision before executing an action.

### Minimum useful brief

For preliminary planning:

- `durationDays` is required;
- supported `transport` is required;
- exact `startDate` is optional;
- interests/pace/companions/mobility/destination preferences are optional unless the current user request makes one material.

Unknown optional values remain unknown. There is no mandatory recap or separate “tạo đi” gate before a preliminary proposal.

Before official Save, the existing requirements remain:

- exact valid start date;
- authoritative fresh validation;
- explicit user Save confirmation;
- confirmed database write/idempotency semantics.

### Authority boundary

Model/skill may:

- interpret conversational intent;
- explain the planning consequence of a user fact;
- decide whether another material question is useful;
- request a bounded application action;
- compose natural Vietnamese from authoritative results.

Model/skill may not:

- invent destination IDs/facts/opening hours/routes;
- mark Validator checks PASS;
- bypass mandatory/excluded destination rules;
- decide ownership/authorization;
- claim Save succeeded before DB confirmation.

### Provider strategy for MVP

Keep the current bounded structured OpenAI provider for the first slice and introduce a provider-agnostic runtime/action seam. Do not require AI SDK, Responses tool calling, streaming or a multi-step model-controlled loop to prove V2.

A later provider ticket may move the runtime to Responses/function calling or AI SDK after the skill/action contracts are stable.

### Migration strategy

V2 is feature-gated and is now the accepted default. Explicit `v1` and invalid
configuration select the supported V1 rollback path; unset selects V2.

First vertical slice target:

1. User: “Tôi muốn lập hành trình đi Hà Giang.”
2. V2 asks for duration using the `travel-planning` policy.
3. User: “2 ngày.”
4. V2 explains that two days require a compact plan and asks transport.
5. User: “ô tô.”
6. Runtime determines the minimum useful brief is complete.
7. Existing planner generates and validates a preliminary proposal.
8. Assistant presents the proposal as preliminary and invites refinement.
9. It does **not** force start date, all optional preference topics, recap or another generation confirmation first.
10. Official Save still cannot occur without an exact date and the existing save checks.

## Response quality policy for the first slice

The first slice does not need Muse-level polish. It must prove these behaviors:

- create value before asking non-material optional questions;
- do not acknowledge fields mechanically when a planning implication can be stated;
- at most one material question in a turn;
- do not introduce unsupported local facts;
- do not promise successful planning/save before authoritative results;
- preserve the current Vietnamese UI vocabulary.

Example:

Bad: `Mình ghi nhận bạn đi 2 ngày nhé. Bạn đi phương tiện gì?`

Acceptable V2: `2 ngày thì mình sẽ giữ tuyến gọn để tránh phải chạy quá nhiều. Bạn đi ô tô hay xe máy?`

The wording can be optimized later; the workflow contract comes first.

## Non-goals of the first runnable MVP

- direct booking or payment;
- accommodation research;
- live weather;
- web place research;
- multi-agent delegation;
- dynamic skill discovery/scoring;
- SSE/generative tool UI;
- replacing RAG, Prisma/Neon, Better Auth or the planner/Validator;
- provider-wide migration;
- database schema changes solely for V2.

## Evaluation gates

The first runnable path is acceptable when automated tests demonstrate:

1. V1 behavior is unchanged with V2 disabled.
2. V2 activates only for the intended new-trip planning scope.
3. `duration + transport` permits a preliminary draft.
4. Missing date prevents final confirmation/Save but not preliminary generation.
5. Unknown optional preferences are not silently defaulted.
6. Planner/Validator output remains authoritative.
7. Unsupported agent decisions/actions are rejected safely.
8. Language failure falls back without repeating business work or changing persistence outcome.
9. No schema/migration/provider-infrastructure change is required for the slice.

## Deferred questions

These are intentionally not blockers for the first slice:

- when to migrate from structured next-action output to direct function/tool calling;
- whether to adopt Vercel AI SDK or call OpenAI Responses directly;
- how general skill selection scales beyond the explicit planning/edit handoff;
- streaming/generative UI;
- approval UX for future booking;
- dynamic capability discovery.

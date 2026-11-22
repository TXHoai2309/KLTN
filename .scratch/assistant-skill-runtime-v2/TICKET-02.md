# V2-02 — Generate a preliminary itinerary as soon as duration + transport are known

**Blocked by:** V2-01

**Execution:** Implemented as an internal authenticated session, without production
chat/UI routing changes. Scope, demo, readiness/validation semantics and evidence:
`docs/stories/ASSISTANT-SKILL-RUNTIME-V2-02.md`. V2-03 is not started.

## User-visible outcome

In V2, a traveler can say they want a Hà Giang trip, answer “2 ngày”, then “ô tô”, and receive a preliminary validated itinerary without being forced through start date, all optional preference topics, a recap, or another “tạo đi” confirmation.

## Scope

Extend the `travel-planning` skill/runtime with a deterministic planning-readiness assessment and one bounded “generate preliminary proposal” application action that adapts to the existing planner. The existing candidate retrieval, AI selection, routing, scheduler, Validator, proposal publication/versioning and authoritative result remain unchanged.

The reply should state at least one supported planning implication of the supplied inputs instead of mechanically acknowledging fields. Unknown optional values stay unknown.

## Acceptance criteria

- Duration and supported transport are the minimum useful brief for a draft.
- Missing exact date does not block preliminary generation.
- Missing exact date still prevents final confirmation/official Save through existing rules.
- No optional preference is silently defaulted just to satisfy the planner.
- Planner/Validator results shown to the user come from the existing authoritative pipeline.
- A language/provider failure cannot cause proposal generation to execute twice.
- Existing V1 behavior still passes when V2 is disabled.
- Regression test demonstrates the exact `2 days + car -> preliminary proposal` path.

## Non-goals

Changing the scheduler/Validator, low-level model-controlled tool loops, new routing provider work, Save flow changes, streaming.

## Codex prompt

Implement the next Assistant V2 tracer bullet from the settled plan. Add a deterministic readiness decision where duration plus supported transport permit a preliminary proposal. Wire one bounded V2 planning action to the existing planning engine; do not reimplement candidate selection, routing, scheduling or Validator logic. The model may decide conversational workflow but may not decide validity. Remove the V2 requirement for start date/preferences/recap/generation confirmation before a draft, while preserving the exact-date requirement for final confirmation/Save. Add focused regression tests including “2 ngày” + “ô tô” and provider/language fallback without duplicate business execution. Keep V1 behind the feature flag intact.

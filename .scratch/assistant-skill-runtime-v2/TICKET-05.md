# V2-05 — Answer grounded destination Q&A without losing the active planning session

**Blocked by:** V2-01

**Implementation:** Internal-session V2-05 implemented, 2026-10-28. See
[story and verification](../../docs/stories/ASSISTANT-SKILL-RUNTIME-V2-05.md).
Production routing and V2-06 remain deferred. Broader historical QA test failures
are recorded as reproduced baseline debt, not silently repaired in this slice.

## User-visible outcome

During a V2 planning conversation, the traveler can ask a genuine Hà Giang knowledge question, receive the existing grounded Q&A answer, then continue planning without losing the current needs/proposal context.

## Scope

Activate `ha-giang-qa` as a skill wrapper/router target around the existing Q&A capability. Keep Q&A read-only with respect to planning state.

## Acceptance criteria

- Genuine Q&A is routed to existing grounded Q&A behavior.
- Q&A does not mutate planning needs/proposal/save state.
- After Q&A, a planning follow-up resumes the same current planning context.
- Ambiguous confirmation after a Q&A interruption remains protected by current pending-context rules.
- Q&A failure does not corrupt or clear planning state.

## Non-goals

New RAG architecture, web research, place comparison, booking.

Implementation uses one runtime and the read-only `answer-ha-giang-question`
action around existing gated QA/RAG/citation/history services, with explicit
SOURCE_ONLY. Pending planning clarification and UNKNOWN survive QA. A unique
fresh entity can supply context for a subsequent bounded edit; ambiguity asks.
Compound factual-plus-edit requests answer the factual clause and explicitly
defer mutation to a separate edit turn. No autonomous compound orchestration.

## Codex prompt

Add `ha-giang-qa` to the V2 skill router by wrapping the existing grounded Q&A path rather than reimplementing RAG. Planning state must survive a Q&A interruption and Q&A must remain unable to mutate needs, proposals or Save state. Preserve current ambiguous-confirmation safeguards. Add tests for planning → Q&A → planning continuation and Q&A failure with unchanged planning state.

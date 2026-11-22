# V2-07 — Prove V2 quality/safety and gate rollout before retiring the V1 questionnaire path

**Blocked by:** V2-02, V2-03, V2-04, V2-05, V2-06

**Execution, 2026-10-29:** Gated integration and live verification implemented;
full acceptance BLOCKED, KEEP_V1_DEFAULT. See
[story](../../docs/stories/ASSISTANT-SKILL-RUNTIME-V2-07.md) and
[evaluation](../../docs/implementation/assistant-v2-evaluation.md) for exact
dataset/paired-evaluation limits, browser receipts, baseline failures and live
configuration rollback. No deployment or V1 retirement occurred.

## User-visible outcome

The project has reproducible evidence that V2 produces the intended draft-first conversation while preserving planner/Validator/Save safety, and the owner can switch the planning experience to V2 without deleting the known-good V1 path prematurely.

## Scope

Create a reproducible V1-vs-V2 conversational evaluation and rollout gate. Include the owner-provided Muse comparison shape as a behavior benchmark without requiring identical prose. Measure workflow behavior, not subjective eloquence alone.

Required evaluation scenarios include:

- new trip → duration → transport → preliminary proposal;
- deferred date;
- later cultural preference;
- proposal edit;
- Q&A interruption;
- in-trip clarification/confirmation;
- provider/language failure;
- stale proposal/action;
- final Save without date blocked;
- final Save with passing authoritative checks.

## Acceptance criteria

- Evaluation reports forced-question count before first draft, number of model/provider calls, proposal/Validator outcome and safety failures.
- V2 proves the minimum-useful-brief path and no silent optional defaults.
- No scenario reports Save/apply success before confirmed persistence.
- Feature gate has a documented rollback path.
- V1 remains available until owner acceptance.
- Only after acceptance is a separate cleanup proposed for questionnaire/canonical-paraphrase code.

## Non-goals

Deleting V1 in this ticket, booking, streaming, provider migration, perfect Muse-style prose.

## Codex prompt

Build the V2 rollout/evaluation gate, not new product capability. Add reproducible conversation scenarios that compare V1 and V2 on workflow behavior and safety: questions before first draft, model/provider calls, authoritative planning/Validator outcome, state preservation, stale/failure handling and confirmed Save semantics. Keep V1 rollback available. Do not delete the old questionnaire/canonical reply path in this ticket; report cleanup candidates only after the owner accepts the V2 evidence.

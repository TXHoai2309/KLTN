# V2-04 — Replan one proposal scope surgically and revalidate it

**Blocked by:** V2-02

**Implementation:** Internal-session V2-04 implemented, 2026-10-28. See
[story and verification](../../docs/stories/ASSISTANT-SKILL-RUNTIME-V2-04.md).
The owner's expanded V2-04 request includes MOVE and bounded semantic replacement;
V2-03 provides atomic publication. Production V2, V2-05 and V2-06 are deferred.

## User-visible outcome

A traveler can ask to remove, add, replace, or replan a specific day in the current unsaved proposal; V2 changes only the affected scope, revalidates the result, explains the delta, and preserves the previous proposal when the change fails or is rejected.

MOVE between days is also supported. Compound edits (up to four) publish once.
Semantic replacement searches only existing eligible DB candidates using explicit
criteria and current constraints; coordinate ranking never becomes route evidence.

## Scope

Activate the reserved `itinerary-replanning` skill using the same V2 runtime. Adapt existing edit-scope, exclusion, mandatory-destination, scheduling and Validator behavior instead of recreating it in prompts.

## Acceptance criteria

- The replanning skill can only operate on the current proposal/version.
- Unaffected days remain structurally unchanged unless an existing locked rule requires explicit cross-day timing acceptance.
- Removed/replaced destinations preserve current exclusion semantics.
- Mandatory destinations remain mandatory.
- Every accepted candidate is revalidated through existing deterministic checks.
- Failure/cancel preserves the previous proposal.
- Stale proposal/action state cannot mutate the current proposal.

Implementation uses the shared resolver, deterministic patch/needs normalization,
optional scoped scheduling, the authoritative Validator and V2-03 publication.
Cross-day dependencies require explicit acceptance before publication. Missing
date remains INSUFFICIENT_DATA; UNKNOWN freezes further mutation. No auto-save.

## Non-goals

Saved-trip editing, in-trip GPS logic, new persistence model, booking.

## Codex prompt

Add the `itinerary-replanning` skill as the second executable V2 skill. Route only proposal-edit intents to it and reuse the current deterministic edit-scope/exclusion/mandatory-destination/scheduling/Validator machinery. The skill should reason about the requested change and explain the result, but never fabricate validity or broaden the edit scope. Preserve the previous proposal on any failure/cancel/stale action. Add regression coverage for add/remove/replace/replan-day, unaffected-day scope and stale/failure behavior.

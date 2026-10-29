# V2-03 — Refine an existing preliminary proposal progressively from later preferences

**Blocked by:** V2-02

**Execution (2026-10-28):** Implemented for the internal authenticated V2 session.
See `docs/stories/ASSISTANT-SKILL-RUNTIME-V2-03.md` for material-question policy,
implications, canonical publication/failure semantics, tests and limitations.
No production routing switch or V2-04 implementation is included.

## User-visible outcome

After a preliminary proposal exists, a traveler can add a preference such as “Mình thích trải nghiệm văn hóa” and the Assistant explains the consequence and refreshes the proposal without restarting the missing-field questionnaire.

## Scope

Teach `travel-planning` to treat later optional inputs as progressive refinement. Reuse the existing needs understanding/update boundary and the authoritative proposal generation path. The response plan should distinguish supported implication text from factual destination claims.

## Acceptance criteria

- Existing proposal/context remains the basis for refinement.
- A later preference updates only the intended needs state; unknown unrelated fields remain unknown.
- The user is not forced back through unanswered optional topics before seeing the refreshed proposal.
- Replies avoid acknowledgement-only wording when a planning consequence can be stated safely.
- Unsupported local facts are not introduced.
- Failed refinement preserves the previous accepted proposal.
- Focused tests cover preference refinement, unrelated unknown fields, generation failure and previous-proposal preservation.

## Non-goals

Direct destination-replacement editing, in-trip changes, web research, booking.

## Codex prompt

Implement progressive refinement on the V2 `travel-planning` path. A preliminary proposal must remain usable while later optional preferences update needs and request a refreshed proposal. Reuse current understanding, generation, routing and Validator authorities. Do not reintroduce a fixed optional-question sequence. Make the response-plan layer explain a safe consequence such as preferring culturally relevant choices without inventing specific destination facts unless those facts are in authoritative results. On failure keep the previous proposal. Add focused tests and leave V1 unchanged behind the feature gate.

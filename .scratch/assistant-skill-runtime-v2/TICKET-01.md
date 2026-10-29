# V2-01 — Run the first `travel-planning` skill turn behind a feature gate

**Blocked by:** none

## Current execution scope — 2026-10-28

The owner's later V2-01 request limits this execution to an internal skill-runtime
foundation, with no production chat wiring or model call required. Implementation
and verification are recorded in
`docs/stories/ASSISTANT-SKILL-RUNTIME-V2-01.md`. The original user-visible first-turn
criteria below remain deferred integration targets, not delivered behavior.

## User-visible outcome

With V2 enabled for a new-trip planning conversation, “Tôi muốn lập hành trình đi Hà Giang” is handled by the new skill runtime and receives one natural material question about trip duration. With V2 disabled, the current V1 behavior is unchanged.

## Scope

Build the smallest server-owned V2 runtime that can:

- load the registered `travel-planning` skill policy;
- supply the current planning/conversation state;
- obtain and validate a structured next-action/response-plan result;
- compose one Vietnamese reply;
- reject unknown skills/actions safely;
- fall back without performing business work twice.

Use the existing bounded provider for this ticket. Do not add direct model tool calling, streaming or a new provider SDK.

## Acceptance criteria

- V2 is feature-gated and off-state behavior remains regression-equivalent to V1.
- The only executable V2 skill is `travel-planning`; the registry structure can add more later.
- The first turn asks at most one material question.
- The model does not receive authority to Save, validate constraints or fabricate destination facts.
- Invalid structured decisions produce a safe deterministic fallback.
- Unit/service tests cover flag off, flag on, invalid skill/action and provider failure.
- Typecheck and relevant Assistant tests pass.

## Non-goals

Proposal generation, preference refinement, replanning, in-trip behavior, Q&A routing, streaming and booking.

## Codex prompt

Read the repository instructions and the Assistant V2 plan/ADRs first. Implement only this tracer bullet. Preserve every existing planning/save/Validator invariant. Add a feature-gated single-runtime skill seam with one executable `travel-planning` skill and a bounded structured next-action contract. Reuse the existing OpenAI structured provider; do not introduce AI SDK, direct tool calling, streaming, schema migrations or new product behavior beyond the first material duration question. Add focused tests proving V1 is unchanged when disabled and safe fallback occurs for invalid/runtime/provider failures. Run the relevant test/typecheck/diff checks and update the story/progress evidence for exactly this ticket.

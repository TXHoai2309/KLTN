# V2-06 — Run in-trip assistance through the V2 skill runtime without weakening US-35/36/37

**Blocked by:** V2-01, V2-04

**Implementation:** Internal V2-06 implemented, 2026-10-28. See
[story, service reuse and verification](../../docs/stories/ASSISTANT-SKILL-RUNTIME-V2-06.md).
Production routing remains off; V2-07 is not started. Three existing in-trip
regression failures reproduce on pinned HEAD; the same 48 QA baseline failures
from V2-05 also remain. See the [baseline audit](../../docs/implementation/assistant-skill-runtime-v2-06-baseline.md).
This implementation does not claim the historical regression suite is fully green.

## User-visible outcome

For an already active/saved trip, V2 can interpret an in-trip change request using current/manual location and remaining itinerary, produce a validated proposal, require the existing explicit confirmation, and apply only after confirmed persistence.

## Scope

Activate `in-trip-assistance` using existing US-35 location, US-36 clarification/replanning and US-37 validation/confirmation contracts. The skill owns conversational interpretation only; existing deterministic and persistence boundaries stay authoritative.

## Acceptance criteria

- GPS denial/unavailability still supports the existing specific manual-location fallback.
- Completed visits cannot be altered.
- Existing clarification outcomes such as ambiguous destination or missing day remain authoritative.
- Proposed changes do not apply before explicit user confirmation.
- Validator and database confirmation remain mandatory before the user is told the change was applied.
- Existing in-trip regression tests continue to pass.

## Non-goals

Continuous background GPS, live weather, booking, a new saved-trip editor.

## Codex prompt

Integrate existing US-35/36/37 behavior into the V2 runtime as `in-trip-assistance`. Do not redesign the business flow. The skill interprets intent and writes natural responses; current location/manual fallback, completed-visit protection, clarification codes, Validator, explicit confirmation and confirmed database write remain authoritative. Add focused routing/runtime tests plus the existing in-trip regression suite. Do not add background tracking or new providers.

# Chat-first itinerary planning and destination choices

## Status and approval

IMPLEMENTED — 2026-10-27; final verification recorded separately. Browser/product acceptance is open. The owner tested the previous nine-ticket implementation and requested natural conversation instead of the automatically opened needs form. They approved Q1–Q3 and Q4–Q7 in [the design interview](../implementation/assistant-chat-first-planning-design.md).

This follow-up supersedes the Assistant's editable needs-card/create-button interaction in the previous planning story. It does not change the separate form planner, saved-Trip editing scope, eligibility, authorization, Validator authority or save/recovery invariants.

## Acceptance criteria

- [x] Ask one missing need at a time, use prior answers, allow optional skips, and review a detailed recap through chat. Confirmation starts generation without another form/button requirement.
- [x] Understanding receives the current question, recent conversation and current itinerary. Recognize brief answers and natural confirmations only in the applicable pending context.
- [x] Proactively offer up to three real eligible points for add/replace requests; choose by number, name or button. Do not invent choices to meet a count.
- [x] Bind add/remove/replace/replan-day to a specific action, day and current version. Preserve other days' stops and mandatory destinations; confirm any resulting changes to other days' arrival times separately.
- [x] Exclude removed/replaced points from regeneration unless explicitly requested again. Preserve a newly requested must-visit as mandatory.
- [x] Keep the prior proposal on failure. Cancellation restores prior needs/proposal as appropriate and persists any required needs rollback before reporting completion. An uncertain rollback retries the identical request/key.
- [x] Keep knowledge Q&A separate; ambiguous agreement after an interruption is clarified. Stale or canceled offers cannot trigger edits or saves.
- [x] Official Save remains a distinct confirmation and requires fresh authoritative checks and a confirmed database outcome.
- [x] Full Assistant/floating panel share the chat flow and active workspace. Reload/history invalidates old actionable offers and requires explicit regeneration; saved Trips keep their normal workflow.
- [x] Show planning replies once and interleave them with knowledge Q&A in the conversation transcript. Keep daily cards and the existing map.
- [ ] Owner accepts live desktop/mobile visuals, focus, touch and authenticated browser interaction.

## Implementation boundaries

Shared dialogue helpers in `modules/assistant-planning/planning-dialogue.ts` describe recaps, pending prompts, option selection, exclusion changes and cross-day timing differences. The understanding contract adds structured operations and semantic confirmation; server candidate eligibility and names remain authoritative. Direct selected-point edits use deterministic selection changes, then the existing scheduler/routes/Validator. Replanning a day checks its scope rather than trusting an instruction alone.

The client holds versioned pending offers and pre-change/staged proposal snapshots in memory. No generated schedule or pending option is added to durable history. Existing workspace needs JSON can include exclusions; no schema or migration was added by this follow-up. The canonical Save service and server ownership boundary remain in use.

## Evidence

### Owner test follow-up, 2026-10-27

- [x] A submitted planning message appears immediately and clears the composer before START/ANALYZE returns; completion replaces its pending exchange once. A newer draft survives completion and conversation attachment.
- [x] Missing departure date is asked explicitly. An unrelated model `dateDeferred` flag cannot skip the question. Explicit “chưa chốt ngày” still permits the approved preliminary proposal; official Save requires a date and passing checks.
- [x] Invalid/past extracted dates ask for clarification instead of causing an uncertain technical failure. Recaps omit unspecified optional fields; the understanding prompt prohibits inferred companions/interests from a request for more experiences.
- [x] Daily schedule precedes collapsible validation details. Duplicate issue messages are grouped with their affected destinations. Disabled Save explains its blocker.
- [x] Assistant uses the existing MapLibre/Stadia component in overview-only mode, per the owner's follow-up request. It shows the whole trip with no day selector/scope switch. The Trip page retains its existing controls.
- [x] Mobile composer provides a full-width text field. Browser fixture verifies desktop/mobile layout and complete-map markers; this is synthetic data, not live Stadia tile or authenticated product acceptance.
- [x] Following the owner's map comparison, each newly generated proposal opens its complete-itinerary map immediately. Manual collapse applies only to that proposal. A separate read-only check rendered real Stadia tiles and six real routing shapes for seven existing public Development points; this does not imply authenticated owner acceptance or official Trip Save.

See [verification](../implementation/assistant-chat-first-planning-verification.md) and the [manual checklist](../implementation/assistant-chat-first-planning-manual-test.md). The prior broad-suite baseline failures are documented in the previous nine-ticket verification; they are not represented as resolved by this follow-up.

# Conversational trip planning design interview

Status: IMPLEMENTED — 2026-10-27. The owner approved Q1–Q9, the nine-ticket breakdown and subsequent code execution. See the [story](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md) and [verification report](assistant-trip-planning-verification.md). Browser/product acceptance remains open; no ACCEPTED status is claimed.

## Owner-confirmed scope

The owner answered “Đồng ý cả 3” to the first interview round on 2026-10-27:

1. Create a new trip, revise its unsaved proposal through conversation and explicitly save within chat. Opening an already-saved trip for editing through the general Assistant is deferred.
2. AI participates in selecting eligible existing destinations and their visit order. Server scheduling, actual routing evidence and deterministic Constraint Validator retain authority over feasibility. This extends the current deterministic selection engine; merely connecting chat to that engine would not fulfill the approved scope.
3. Use the existing Assistant on both the full page and floating panel. The panel offers daily summaries; an expanded view offers itinerary/map details while preserving the conversation. Show extracted needs for review before generating an itinerary.

The owner answered “Có” to round two and explicitly requested planning followed by `to-tickets`, with no application code implementation:

4. Show an editable needs summary and an explicit **Tạo hành trình** action. Ask for missing duration/transport; a missing departure date permits preliminary relative-day proposals only.
5. Attempt at most two automatic repair passes for actionable validation failures, validating every candidate and retaining confirmed user requirements. Missing opening-hours evidence and routing-service failures must not trigger futile repair loops or guessed facts. Unresolved failures become an explanation and a request to adjust needs.
6. Keep the active proposal across minimize/expand and client navigation. Reload/reopening a historical chat requires explicit **Tạo lại từ nhu cầu này** before obtaining a new actionable proposal. Saved trips remain accessible; historical messages are not authoritative saveable proposals.

The owner answered “Có đồng ý” to round three:

7. Explicit must-visit destinations are mandatory; suggestions remain preferences. Ambiguous names require disambiguation. Repair cannot silently drop mandatory destinations; an impossible combination requires an explanation and a user decision.
8. Retain the existing scope of travel between sightseeing destinations. Home/hotel departure legs, accommodation selection and overnight logistics are not added. Disclose omitted legs in the preview.
9. Permit knowledge Q&A during planning without losing needs or changing the proposal. Only an explicit edit request changes it; unclear ask-versus-edit intent requires clarification.

The initial planning-only boundary was explicitly superseded when the owner requested implementation of all nine tickets followed by `code-review` and `diagnosing-bugs`. The approved tickets are published locally under `.scratch/assistant-trip-planning/issues/`, one numbered Markdown file each. No external tracker publication was requested.

## Verified repository baseline

- `apps/web/src/modules/ai/qa-contract.ts`: current Q&A context supports GENERAL and DESTINATION, without planning artifacts.
- `apps/web/src/modules/preference-extraction/preference-extraction-service.ts`: verified natural-language extraction exists, but does not itself merge needs across conversation turns.
- `apps/web/src/modules/trip-planner/planner-service.ts`: current destination selection and scheduling are deterministic; proposal cache is process-local and temporary.
- `apps/web/src/modules/trip-save/trip-save-service.ts`: validation preview and authoritative save already exist, including confirmed-write/idempotency behavior.
- `apps/web/src/modules/trip-edit/ai-edit-service.ts` and US-33: AI editing operates on saved trips; unsaved planner proposal editing requires an additional integration boundary.
- `apps/web/src/components/assistant/global-assistant.tsx`: current launcher exclusions include `/trips/new`; the approved shared entry experience needs an explicit route-visibility decision during implementation design.

## Retained product constraints

See [product contract](../product/product-spec.md), [user flows](../flow/user-flow.md), US-24–30 and US-33. No baseline exception was approved in round one.

- Minimum preliminary inputs are duration and supported transport. AI-extracted values require review before planner use.
- Require a start date and all mandatory checks PASS before official confirmation/save. Missing evidence is never a pass.
- AI may not invent eligible destinations, opening hours or verified travel durations.
- Server authorization and ownership remain authoritative; Admin inherits Traveler capabilities only on their own resources.
- Invalid itineraries must not become durable drafts. Round two establishes a temporary active proposal and explicit regeneration on historical reopening; durable history projection and recovery details must preserve this distinction.
- Confirmed database writes alone permit a saved-success message. UNKNOWN retries preserve the same payload and key.

## Proposed complete flow

1. A planning request enters the existing Assistant. Guest Q&A remains public; creating a personal planning session requires authentication. Preserve a minimal originating request where possible, then require an explicit continuation after login; never replay a write or attach private data from another principal.
2. Accumulate structured needs from user turns, preserving provenance and explicit corrections. Resolve ambiguous destination names against eligible records. Ask only for missing/blocking information; do not require optional fields just to proceed.
3. Show the editable needs summary. **Tạo hành trình** freezes a reviewed requirement version; later changes invalidate that confirmation for the affected requirements.
4. AI proposes destination IDs and day/order from the eligible candidate set. Deterministic code validates structure, mandatory-stop inclusion and duration/transport limits, then schedules and validates using real data. Reuse existing scheduling/routing/validation boundaries rather than introducing a competing planner. Keep the existing form planner behavior intact.
5. Present daily itinerary cards and individual validation results. Relative-day proposals can be viewed, but missing dates/evidence do not enable Save. For actionable violations, allow at most two repair passes after the initial proposal; stop for missing evidence/provider failures. Do not claim global infeasibility merely because a bounded search failed.
6. Explicit edits create a new proposal version and revalidate; superseded responses cannot replace it. Show what changed. Broad requests such as **đi nhẹ hơn** clarify changes to reviewed needs when necessary. Q&A leaves the planning version unchanged. Mandatory destinations cannot be removed without explicit user authorization.
7. **Lưu chuyến đi** is an explicit UI action on the current proposal. Reuse authoritative save validation and idempotency. Changing the start date recomputes date-sensitive checks before save. SUCCESS exposes the real owned Trip link within chat; FAILED preserves input; UNKNOWN preserves the exact request/key and offers reconciliation rather than a second save.
8. Both Assistant surfaces use the same active session and versioned actions. Expanded view shows daily/whole-trip map detail from verified geometry; missing geometry must not be replaced with a misleading road route. No automatic model request occurs merely on open/minimize/expand.
9. Reload/history reopening restores reviewed needs and safe outcome summaries, not an actionable historical itinerary. Explicit regeneration obtains new data. A confirmed saved trip is reopened through its owned Trip link.

## Proposed technical boundaries and recovery

- One active planning workspace per conversation for the first version. Starting another plan explicitly replaces the temporary workspace; saved trips remain intact. Asking to edit an already-saved trip directs the user to the existing Trip workflow rather than silently entering the new draft flow.
- Version requirements, proposals and pending actions. Bind every response to principal, conversation and version. A late generation/edit response is ignored after supersession; minimizing does not cancel or duplicate work. UI abandonment does not claim server cancellation.
- Persist only the minimum reviewed-needs projection, action/outcome metadata and owned saved-trip reference needed for recovery. Do not persist visit schedules for invalid/unconfirmed proposals in chat messages, JSON artifacts, logs or analytics. Avoid retaining raw mobility/source text beyond the existing approved privacy contract. Any additive schema changes must use Prisma migrations and preserve historical Q&A reads.
- UNKNOWN save recovery retains a durable actor-scoped identity and reconciles the original idempotency result. Only an explicitly confirmed Save that has just passed fresh authoritative validation may temporarily store its canonical save request; unconfirmed or invalid proposal schedules are never persisted as drafts. Explicit reconciliation replays/revalidates that identical intent and removes its request on terminal success/failure. No fresh-key duplicate save is enabled while the result is uncertain. Development integration verifies this protocol.
- The Q&A knowledge-expansion switch remains a Q&A capability; it never permits invented planning facts or overrides destination eligibility/Validator checks.
- Reuse current configured AI provider boundaries; no new model/provider migration is included. Bound time, candidate count and repair calls; report provider errors separately from validation failures. Routing's existing mandatory timeout contract remains in force.
- Retain current launcher route exclusions (including the separate form planner) for the first version; shared chat planning works wherever the launcher already appears and on the full Assistant page. The panel/full-page handoff preserves active state within the client session without duplicate sends.
- Responsive from 360px, keyboard-accessible actions, readable validation labels and explicit loading/error states are acceptance criteria. Inspect applicable design guidance and available UI references during implementation; this plan does not claim a Figma layout was inspected.

## Approved ticket breakdown — implemented

Every ticket includes its relevant server boundary, UI behavior and tests. No standalone schema/API/UI layer tickets are proposed. A ticket without an edge must not wait merely because its number is later. Shared-boundary extraction, when needed, belongs at the beginning of the slice that first needs it and must retain existing behavior.

| Ticket | Delivers | Blocked by |
| --- | --- | --- |
| 01 — Start a planning conversation and review needs | On the full Assistant page, an authenticated user explicitly enters planning, describes a trip and receives an editable needs card. Missing duration/transport blocks generation. Existing Q&A remains usable. | None |
| 02 — Refine needs and resolve named destinations | Follow-up corrections update the needs card, ambiguous place names offer real eligible choices, mandatory stops differ from preferences, and Q&A does not mutate planning state. | 01 |
| 03 — Generate a real AI-selected itinerary | From reviewed needs, AI selects eligible stops/day/order; server scheduling/routing/Validator produce daily cards with clear outcomes and scope limitations. No-date proposals remain preliminary. | 02 |
| 04 — Repair actionable validation failures | Initial failures trigger at most two bounded repair passes, retain mandatory needs and expose final checks and adjustment count. Missing evidence/provider errors stop the loop. | 03 |
| 05 — Revise an unsaved proposal conversationally | Add/remove/replace/move visits and lighter-day requests produce a separate revised proposal, a visible change summary and revalidation. Stale responses and unauthorized mandatory-stop removal are rejected. | 03 |
| 06 — Save the current proposal from chat | Date entry/revalidation, explicit confirmation and canonical saving yield an owned Trip link. Duplicate clicks and UNKNOWN retries use one immutable operation; FAILED retains the proposal. | 03 |
| 07 — Reopen history and reconcile interrupted saves | Reopened chats recover reviewed needs and saved-trip outcomes; old proposals require regeneration. Reload during an uncertain save reconciles its original action without duplicate creation or durable invalid drafts. | 06 |
| 08 — Plan in the floating panel and expanded map view | The shared active planning workspace works in the existing floating entry and full Assistant, with compact day cards, expanded itinerary/map, minimize/navigation continuity and mobile/keyboard behavior. | 03 |
| 09 — Verify the complete demo and RQ2 evaluation | Exercise the integrated chat-to-save flow, both surfaces, identity isolation and recovery. Produce a reproducible evaluation with initial/post-repair outcomes, all-request denominator, missing-data/no-itinerary cases and attempt counts. | 04, 05, 07, 08 |

### Per-ticket verification focus

- **01:** Guest/auth return without auto-action; Traveler/Admin own-capability checks; missing/ambiguous transport; no accidental write or Q&A regression.
- **02:** Multi-turn explicit correction, duplicate/ambiguous/hidden place names, must-visit versus suggested choices, mixed Q&A, injection text treated as data.
- **03:** Reject unknown/ineligible/duplicate IDs and malformed days/order; do not silently truncate must-visit choices; real deterministic checks; no origin/lodging claim; fake-provider integration and preserved legacy planner regression.
- **04:** Initial plus at most two repairs; no repair for missing evidence; no change to hard needs; record initial and final outcomes separately; cancellation/stale response behavior.
- **05:** Edit only the current unsaved proposal; validate affected changes; preserve prior version on failure; do not mutate saved trips; outdated save controls become unusable after edit.
- **06:** Database-confirmed SUCCESS only; changed visibility/date/routing evidence prevents invalid saving; same-key replay; same-key changed payload rejected; double-submit and timeout behavior; no auto-navigation that hides confirmation.
- **07:** Reload before/during/after completion; committed-but-response-lost reconciliation; still-uncertain action stays blocked; cross-user history isolation; historical Q&A compatibility; migration checks if schema changes.
- **08:** No duplicated controller/provider calls; panel/full-page draft and proposal identity preserved; 360px and desktop; keyboard/focus; map failure leaves itinerary usable; no routing secrets in browser projections.
- **09:** Tests for each slice remain in that slice, not deferred here. Final integrated fixtures cover the approved demo and negative cases; RQ2 compares direct LLM output with validation/repair under matched requests/data and distinguishes structural rejection, insufficient data, failure and success. Live provider/browser/DB checks require available test configuration; record unavailable evidence rather than claiming acceptance. No production rollout is included.

## Handoff

The owner approved the consolidated plan and requested execution. All nine local ticket files now include implementation status and evidence links. Independent Standards/Spec reviews and the diagnosis loop found and resolved functional defects; remaining baseline test failures, synthetic-evaluation limits and the browser gate are documented in the verification report. No production rollout or product acceptance is implied.

## Sources and limits

The Product/System DOCX sources were not found during the preceding repository investigation; condensed contracts and current code ground this work. Some older overview/story status text predates implementation and does not establish absence or acceptance. Implementation verification now includes the explicit Development migration, PostgreSQL and live-provider receipts in the handoff report; browser acceptance remains unavailable.

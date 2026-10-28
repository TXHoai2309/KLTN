# Conversational trip planning in the Assistant

## Status

IMPLEMENTED — 2026-10-27. Functional code and automated/Development verification are delivered; visual/mobile browser acceptance and production rollout remain open. This is not an ACCEPTED product story.

## Owner approval and scope

Follow-up: the owner tested this implementation and approved Q1–Q7 to replace its automatic needs form with natural chat and proactive destination choices. See [the separate chat-first story](ASSISTANT-CHAT-FIRST-PLANNING.md). The original implementation receipts below remain historical evidence; the follow-up has its own acceptance and verification.

The owner approved design decisions Q1–Q9, the nine-ticket breakdown and implementation in this chat. The initial documentation-only restriction was explicitly superseded by the request to implement all nine tickets and perform `code-review` plus `diagnosing-bugs` before handoff.

Create a new itinerary, revise its unsaved proposal and explicitly save inside the existing Assistant. AI selects eligible destination IDs and ordering; deterministic scheduling, routing and Validator retain authority. Both full Assistant and the existing floating entry share the active workspace. Saved-trip editing uses the existing Trip workflow; starting another plan requires an explicit action.

## Sources

- [Approved design and decisions](../implementation/assistant-trip-planning-design.md).
- [Product: trip requirements, validation, edits, writes and RQ2](../product/product-spec.md).
- [User flows](../flow/user-flow.md), US-24–30 and US-33; [RBAC V2](RBAC-V2-admin-inherits-traveler.md).
- [Implementation tickets](../../.scratch/assistant-trip-planning/README.md).
- Original Product/System DOCX and a feature-specific Figma frame were unavailable; no source-DOCX or pixel-parity acceptance is claimed.

## Acceptance and implementation

- [x] Authenticated Traveler/Admin can describe needs, correct them across turns and explicitly review an editable needs card. Guest receives an auth handoff without auto-action.
- [x] Missing duration/transport and ambiguous destinations block generation. Mandatory stops survive repair; unsupported/missing evidence never becomes PASS.
- [x] AI selects existing eligible IDs/day/order; the same scheduling/routing/constraint functions used by the existing planner determine the result.
- [x] At most two automatic repairs after the initial proposal. Initial/final outcomes and attempt count remain separate; missing source evidence stops repair.
- [x] Unsaved edits retain the original context/instruction and previous proposal on failure. Server version/fingerprint prevents saving superseded proposals.
- [x] QA can be interleaved during planning and after a confirmed save. An edit to a saved Trip is directed to its existing workflow.
- [x] Explicit Save uses authoritative fresh validation and canonical transactional/idempotent persistence; committed replay occurs before fresh checks. Chat save additionally validates transfers into subsequent days.
- [x] Reload/history reopening restores reviewed needs and saved outcomes, requiring explicit regeneration. Explicit reconciliation resumes the exact confirmed save intent, including when the earlier worker stopped before creating a Trip.
- [x] Shared panel/page code, daily cards and the existing verified-geometry map are wired; semantic rendering and controller regressions pass.
- [x] Reproducible synthetic evaluation keeps all requests in the denominator and distinguishes structural rejection, no itinerary, insufficient evidence and technical failure.
- [ ] Visual layout, focus, touch/keyboard interactions and 360px behavior accepted in a live browser; local browser use is disabled in Work settings.

## Server/API and persistence

Later history-loss follow-up: account conversation text and an unreviewed needs checkpoint are now durable under the shared conversation lifecycle. This supersedes the original transient-transcript limitation, while retaining all restrictions on generated visit-schedule drafts and official Save. See `ASSISTANT-DIALOGUE-NATURALNESS.md` and the current dialogue-history verification.

`POST /api/ai/planning` is a thin Node Route Handler. Module services handle START, READ, ANALYZE, REVIEW, GENERATE, SAVE and explicit RECONCILE. Server identity precedes body/provider work; private reads/writes use actual conversation ownership, current account capability/status, same-origin requests and `private, no-store`. Provider-intensive calls have bounded per-instance admission; shared DB versions and idempotency operate across instances.

The workspace stores reviewed needs, version/fingerprint and save-operation metadata. Generated visit schedules are not retained as drafts in messages, replay responses or workspace JSON. Only an explicitly user-confirmed save intent that has just passed fresh authoritative validation can temporarily retain its exact canonical save request for UNKNOWN recovery. The canonical Save service replays or revalidates that intent; terminal success/failure erases its request. Shared QA tombstoning erases the workspace and removes reviewed needs from planning replay responses.

Three additive Prisma migrations were applied only to the verified Development endpoint: `20261027120000_assistant_planning_workspace`, `20261027123000_planning_history_retention`, `20261027130000_planning_replay_retention`. No production migration or deployment was performed.

## Verification and handoff

See [verification report](../implementation/assistant-trip-planning-verification.md) for exact commands, results, independent review findings/fixes, the before-task comparison and remaining limits. Production dataset/model-quality acceptance and a full thesis RQ2 experiment are separate from the synthetic regression evaluation.

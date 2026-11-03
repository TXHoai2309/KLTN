# Planning dates, natural replies and Guest continuation

Status: IMPLEMENTED — 2026-10-27. The owner approved Q1–Q3 with Luna/high and a login CTA, then Q4–Q5 with “có tôi đồng ý”. [Accepted design](../implementation/assistant-dialogue-naturalness-design.md). Browser acceptance is open.

This follows ASSISTANT-CHAT-FIRST-PLANNING. Guest permissions, deterministic Validator authority and explicit canonical Save remain unchanged.

- [x] Supply the server's Vietnam calendar date and Monday–Sunday week anchor to understanding.
- [x] Normalize day/month, explicit year and unambiguous relative dates. A past missing-year date asks before next-year interpretation; impossible dates and ambiguous weekdays ask a specific correction.
- [x] Preserve next week as an anchored range, without choosing its first day. Confirm replacement of a previously precise date; retain original absolute dates/range anchors in reviewed needs.
- [x] Keep date clarification, needs recap confirmation, generation and official Save distinct. Expired restored dates ask again; missing required data never passes validation.
- [x] Pin all three planning AI tasks to `gpt-6-luna` / `high`. Compose from original text, bounded context and authoritative needs/result; truthful deterministic fallback cannot rerun business operations.
- [x] Preserve pending planning needs through public Q&A. Supply bounded public context and clarify ambiguous agreement after an interruption.
- [x] Guest public Q&A continues after a login invitation. A visible login link retains the original request/context and returns to Assistant. Restored draft requires explicit send; no automatic generation/save/history migration.
- [x] Regression tests, live language smoke, typecheck/build and diff checks recorded in verification.
- [ ] Owner accepts desktop/mobile visuals and authenticated browser interaction. Browser tools are currently disabled in Work settings.

New metadata uses the existing reviewed-needs JSON; this story adds no database schema or migration. Unconfirmed transcript/offers/proposals retain existing transient retention. No additional durable Guest storage is introduced.

## Owner follow-up — guided questions, 2026-10-27 (batch presentation superseded)

The owner supplied screenshots showing an interest-only answer prematurely reaching recap and “không cần lưu ý gì hả” being sent to destination QA. They requested all remaining questions with guidance so travelers know what to answer.

- [x] Show the remaining optional experience, pace, companions/count, mobility and destination questions together, with examples and quick replies. Do not ask again about an already answered section.
- [x] Accept combined or incremental replies. One answer does not complete the entire optional stage. Scoped negative answers do not invent preferences/restrictions or skip other sections.
- [x] Explicitly allow skipping the remainder; only recap after sections are answered/skipped. Minimum requirements, separate recap confirmation, generation and official Save retain their contracts.
- [x] Keep requests for planning guidance in planning; preserve genuine destination QA and existing restrictions. Clarify ambiguous bare numbers/negative replies in a batch prompt.
- [x] Keep Luna/high, existing shared chat/page/popup UI, authorization and Validator boundaries. Optional per-section skip metadata uses existing JSON, no migration.

See [guided-question verification](../implementation/assistant-guided-preferences-verification.md). This supersedes one-question-at-a-time presentation only for the optional needs stage.

## Current correction — one optional question per turn

Owner: “những cái này nên hỏi từng câu 1 thôi á”, with the batch screenshot.

- [x] Ask the first unanswered optional topic only, retaining examples and current-topic quick replies. Continue in order and do not repeat answered topics.
- [x] Distinguish skipping this question from explicitly skipping the remainder. Understand short replies in the current topic; an ambiguous number must not change duration.
- [x] Retain volunteered combined answers, scoped negative answers, planning guidance, QA separation and all existing date/auth/Validator/save invariants.
- [x] Reply composition preserves the current question and allows at most one question mark; Luna/high remains in use.
- [x] Regression tests, web typecheck and production build; live-model and verification receipts are in the guided-question report. Browser acceptance remains open because browser use is disabled.

This supersedes only the batch display above, preserving coverage of all optional topics. No schema/migration/dependency change.

## Current follow-up — suggestions fill the composer

Owner: “chỗ này làm bấm thì sẽ tự điền xuống dưới ý, để ví dụ có thể chọn nhiều hoặc chọn thêm”, showing the optional-interest suggestion row.

- [x] Clicking optional suggestions, including skip chips, fills the existing composer without sending or advancing the question.
- [x] Keep typed text; append multiple suggestions without duplicating repeated clicks. Allow travelers to edit/add free text before explicit Send.
- [x] Apply to the shared full-page and floating chat. Keep unavailable/pending guards, current-topic guidance, separate generation/Save confirmations and all existing invariants.
- [x] Actual component-handler regressions and related suites pass; web typecheck passes. See the guided-question verification for build evidence and browser limitations.

No AI/provider, API, database, schema, migration or dependency change is needed for this interaction.

## Current correction — combine interests and grow the composer

Owner reports that choosing Thiên nhiên then Văn hóa looks like only the first choice is filled. The old handler appended a second sentence on a new line while the textarea stayed at a fixed one-line height. Owner wants “Mình thích trải nghiệm thiên nhiên, văn hóa”, and then explicitly requests automatic height with a line limit.

- [x] Combine selected interests into one comma-separated sentence, preserving other typed text and preventing duplicate clicks. Keep all current-topic suggestions usable until explicit Send.
- [x] Grow/shrink the shared composer with content, up to four visible lines; longer content scrolls internally. Recalculate on width changes and put the caret after an inserted suggestion.
- [x] Actual page/popup handler regressions cover combined text, retained edits, explicit Send, measured growth, four-line cap, shrink and focus/caret effects. Verification receipts are in the guided-question report.

No persistence/API/model change is part of this correction. The separately documented history-persistence proposal remains unimplemented.

## Current follow-up — choice cardinality, companions, language and durable history

Owner's five screenshots request single pace choices, verbal dates, removal of the skip-remainder button and more companion choices, again reporting lost sessions and asking about DB migrations/model wiring. This follow-up supersedes the transient account-dialogue limitation above; generated itinerary persistence and Guest permissions retain their existing boundaries.

- [x] Replace choices within single-value pace/companion groups; preserve multi-interest merging and free text.
- [x] Recognize “15 tháng 11” without requiring a “ngày” prefix; retain date validation.
- [x] Remove the visible skip-remainder action; keep per-question skip and one question at a time.
- [x] Offer solo/partner/family/friends/other; retain partial category/count and ask the missing part without guessing a family size or changing duration.
- [x] Grounded Luna/high prose can paraphrase the current question. Telemetry distinguishes model acceptance from truthful fallback; deterministic Validator/Save remain authoritative.
- [x] Persist completed account planning exchanges plus a separate unreviewed needs checkpoint, with transactional revision/idempotency/ownership and shared deletion/expiry. Reopen continues the missing question; expired proposals require regeneration. No Guest-history import or invalid itinerary storage.
- [x] Additive migration applied only on verified Development; zero pending afterward. Real DB, model, regression, typecheck/build and operational evidence are in [the follow-up verification](../implementation/assistant-dialogue-history-follow-up.md).

Earlier unwritten planning text is unrecoverable. In-flight/unacknowledged operations still require recovery; this is not durable background execution. Interactive browser/mobile acceptance is still open.

## Current FE follow-up — contained suggestions and chronological itinerary cards

Owner screenshots show wrapped companion choices crossing the curved outer border and revision replies appearing above an itinerary that is always rendered at the end.

- [x] Bound the suggestions group with padding/box sizing and a fixed corner radius; wrap labels without fixed-height clipping at desktop/mobile widths.
- [x] Attach each accepted itinerary snapshot to its creating response; render subsequent requests/replies below it and append a new card only after an accepted revision.
- [x] Keep earlier card data intact for comparison; expose Save only on the current proposal. Canceled/failed/unaccepted edits do not append a new accepted card.
- [x] Keep snapshots transient; durable checkpoint/turn JSON still contains no structured proposal. Reopening invalidates proposal snapshots while retaining persisted dialogue.
- [x] Shared page/popup regression, type/build and actual-component browser verification recorded in [the FE report](../implementation/assistant-planning-fe-chronology-verification.md).

Browser use became available for this follow-up. Isolated actual-component checks cover wrapping/chronology, not authenticated production or a new live-model flow. No database/schema/migration/provider change.

## Production migration release

After the owner pushed master and explicitly requested Production migrations, all four Assistant planning migrations through `20261027180000_planning_dialogue_history` were applied successfully from fetched master `723f24e`. Production has32 applied/0 pending/0 unfinished migrations; independent schema verification and health200 pass. Earlier Development-only notes are historical for this migration rollout. See [release verification](../implementation/assistant-planning-production-migration.md); this does not assert authenticated Production chat acceptance.

## Current correction — model invocation and repetitive wording, 2026-10-28

The owner clarified that the main issue is repetitive prose, asking whether the model is called. Five recent Production reply events confirm accepted Luna/high prose; real-provider reproduction still produced the repetitive style. The acknowledgement-every-turn instruction and verbatim proposal-opening guard were the demonstrated causes.

- [x] Remove those wording constraints while retaining grounded facts, one missing topic, complete dates, unsaved/preliminary state and deterministic Validator/Save authority.
- [x] Distinguish display, explicit create/save and generic agreement; showing an existing itinerary cannot generate/save or fall through to destination QA. Redisplayed snapshots have no duplicate Save control.
- [x] Verify failing-before/passing-after regressions, real Luna calls and accepted outputs, typecheck/build and scope checks. See [runtime and wording evidence](../implementation/assistant-reply-runtime-verification.md).

No model switch, database migration or deployment. Earlier requirements to preserve the proposal's literal opening are superseded by truthful state protection. Historical stored messages and transient itinerary-retention boundaries remain unchanged.

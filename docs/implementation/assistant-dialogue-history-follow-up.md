# Assistant choices, dates, natural replies and history — 2026-10-27

Status: implemented; Development migration applied. Authenticated browser/mobile acceptance remains open because local browser use is disabled in Work settings.

## Owner request and delivered behavior

The owner supplied five screenshots: mutually exclusive pace replies accumulated, “15 tháng 11” was rejected, skip-remainder controls remained visible, companion options were too limited, and the chat did not survive reopening. They also asked whether language generation had a model attached. This follow-up explicitly includes durable account planning dialogue/checkpoints, superseding the transient transcript limitation recorded by the earlier audit. It does not authorize persisting an invalid itinerary or changing Guest permissions.

- Pace and companion chips replace previous chips in the same single-choice group. Interest chips still merge multiple choices. Other typed lines are preserved; filling the composer still requires explicit Send. The hint now distinguishes single/multiple selection.
- Verbal dates with or without “ngày” normalize against the server's Vietnam calendar. “15 tháng 11” and “15 tháng 11 năm 2026” resolve to 15/11/2026 for the pinned test date. Invalid/past/ambiguous dates retain clarification rules.
- Removed the visible “Bỏ qua phần còn lại” action. “Bỏ qua câu này” remains per-topic; explicitly typed skip-remainder requests remain understood for compatibility, but are not suggested.
- Companion options include solo, partner, family, friends and another group. A partial category/count is retained in `companionDraft`. Family/other incomplete groups are asked for their missing count/category before advancing. A bare count in that context cannot change duration. Solo explicitly includes one person; no default family size is invented. Existing optional skips remain possible.
- A copied option such as “1. [TEST] Cột cờ Lũng Cú — …” or “Chọn 1: …” resolves to its actual current choice; unrelated numbered text does not silently select it.

## Model boundary

Understanding, selection and language composition already used `gpt-6-luna` with high reasoning. The old preferences guard required a literal canonical question, and its language timeout was 12 seconds. Natural paraphrases now pass a current-topic/one-question/fact gate; dates, recap facts and truthful save/validation status remain protected. The timeout is now the existing provider maximum of 25 seconds. Deterministic command acknowledgements still exist; they are not falsely described as model output.

Safe telemetry emits only model/reasoning and `MODEL_ACCEPTED`, `GUARD_FALLBACK` or `PROVIDER_FALLBACK`. It never logs the user text, API key or raw exception. Language failure falls back without rerunning business work. Real-model smoke accepted all three replies, including:

> Mình hiểu là đi cùng gia đình rồi. Nhà mình có tổng cộng bao nhiêu người đi?

This is a synthetic smoke example, not retained private conversation content.

## Durable history, separate from reviewed needs and Trip Save

`AssistantPlanningWorkspace` now has a separate dialogue revision and unreviewed checkpoint. `AssistantPlanningTurn` stores completed question/reply text and its existing QA boundary, ordered by a server sequence. It does not store proposal visits, route geometry or a save authorization. Client context sent to AI remains bounded to recent turns even when more history is visible.

The authenticated `CHECKPOINT` action stays behind the existing thin Route Handler and server ownership guard. Append and checkpoint update commit atomically with optimistic revisions and shared idempotency. Identical retries replay the original result; stale or reused keys cannot overwrite another version or duplicate a turn. The client waits for acknowledgement and shows an error/recovery state if history was not confirmed. Reopening retains messages, resumes the next missing question, and refreshes expired date questions. Old choices/proposals still need explicit regeneration, and official Save still uses fresh validation and separate confirmation.

History follows the same 30-day account-conversation lifecycle. The existing tombstone trigger deletes the workspace; its cascading relation deletes the new turns too. Reads/replays do not extend history; new completed exchanges update activity/expiry. No new Guest persistence or automatic Guest-history migration was added. No backfill can recover planning text that was never stored before this change. In-flight/provider-failed turns without a completed acknowledged response may need retry; this is not a claim of durable background execution. Competing writers are rejected by revision checks rather than silently overwriting each other.

## Migration and operational evidence

- Additive migration: `20261027180000_planning_dialogue_history` adds two workspace columns and the conversation-text table with cascading FK/indexes. No reset, db:push, production deployment or existing user-data rewrite.
- Prisma Client regenerated. The development client-cache revision creates a client for the new schema on hot reload, without requiring the user to restart their app.
- Verified the configured Development endpoint/database before applying. Initial Prisma attempts hit P1002: a pooled idle session held the migration advisory lock with no active transaction. Closed only the guarded idle backend after checking its PID/start time/lock/state, then applied the migration over a direct connection. The final migration preflight reports **zero pending migrations**. Application pooling and `.env` remain unchanged. Direct connections for Prisma migration/session locks follow [Prisma's guidance](https://www.prisma.io/postgres/migration-cannot-reach-database).

## Verification

- Red reproductions: single-choice accumulation, both verbal-date forms, remaining skip button, lost unfinished needs/history and lost checkpoint acknowledgement. New tests drive actual helpers/client/service; controlled provider/repository seams keep ordinary regressions deterministic.
- Development PostgreSQL integration **5/5 PASS**: ownership, exact replay/reused-key/stale revision handling, checkpoint separate from reviewed needs, actual client/service → DB → fresh-client continuation, save recovery and deletion erasure. UUID test users/conversations were cleaned up; no existing user conversations were altered.
- Real Luna/high smoke **1/1 PASS**, 23.2 seconds, with category → count → verbal-date turns; **3/3 MODEL_ACCEPTED**. No DB/routing/Trip writes in this smoke.
- Related suites before the last expiry refinement: **34 files / 304 tests PASS**, eight opt-in skips. Final affected regression/type/build receipts are appended below.
- Running `localhost:3010/assistant` returned **200**; its assets contain current checkpoint and single-choice code. This does not establish browser hydration, visual/focus/mobile acceptance. Browser inventory still returns disabled in Work settings.
- Planning-panel taste lint: zero failures, one existing clock-format warning. No new provider/dependency, frontend secrets, commit/push/merge or release claim.

Final regression receipts: related **34 files / 305 tests PASS** (eight opt-in skips). After the final explicit-count/expired-date refinements, affected **4 files / 29 tests PASS**; no guessed family count is accepted merely because the model returned one, and spoken counts such as “bốn người” are retained. Web typecheck **PASS**. Final isolated production build after source freeze **PASS, exit 0**, including TypeScript and 48 pages. Whitespace and task-scope credential/debug scans **PASS**. PostgreSQL and model receipts above remain separate from the ordinary suite.

# ASSISTANT-SKILL-RUNTIME-V1-RETIREMENT - One assistant chat, V1 retired

Spec: `.scratch/assistant-skill-runtime-v2/SPEC-V1-RETIREMENT.md` (tickets 01-06). Decision: ADR-35 (supersedes the rollback-switch clause of ADR-31). Terms: GLOSSARY (Guest, Guest mode).

## What changed
- One chat for everyone: signed-in travelers keep the V2 chat; guests use the same chat in Guest mode (Q&A only, citations, existing abuse limits, planning request answered with a sign-in invitation and the unsent text kept through the planning auth hand-off); saved-conversation links open in it (tickets 01-04).
- Ticket 06 (this retirement commit, separate so it can be reverted alone) deleted the V1 code:
  - V1 chat client `assistant-chat.tsx`, `assistant-chat-surface.tsx`, `use-assistant-preference.ts`, and the helpers only it used (`assistant-followups.ts`, `assistant-context-navigation.ts`). Shared exports (`AssistantAnswer`, `AssistantTurn`, `PROMPT_SUGGESTIONS`, `AssistantShell`, `AssistantContextProps`, `CitationSlot`) moved to `assistant-answer.tsx`.
  - The runtime switch: `runtime-gate.ts`, `ASSISTANT_RUNTIME_VERSION` in `.env.schema` / `.env.example`, `runtimeVersion` in the `/api/ai/session` response and in `useAssistantSession`. A deployment that still sets the variable is unaffected (ignored, covered by tests).
  - The V1 branch of `planning-http.ts`: only the `ASSISTANT_V2` action remains, behind the unchanged traveler auth, origin, idempotency-key and body checks. Any other action (the retired V1 planning actions) returns 400 `INVALID_INPUT` without running anything.
  - Page fallbacks: `/assistant` renders the V2 chat when the Q&A gate is open, otherwise an unavailable state (no local demo); the in-trip page always renders the V2 chat. Local V1 demo files and scripts (`development/assistant-demo*`, `assistant-development-chat`, `assistant-context-fixture`, three demo scripts) removed.
  - Unused panel props `newChatContext`, `onStartedNewChat`, `transport`.
- Kept: `AssistantController` and `AssistantHttpTransport` (Guest mode uses them), `/api/ai/ask`, `/api/ai/conversations`, `qaService`, abuse limits, `planning-auth-handoff`, all shared modules. No schema change, no stored conversation deleted.
- Tests: removed only those that rendered or exercised the deleted V1 chat, runtime selector or V1 route path; planning route, session route and runtime-mode tests updated to the single-runtime behavior, with new cases (V1 action rejected, session has no `runtimeVersion`, leftover variable ignored, unavailable state in dev and production).

## Live evidence (ticket 05, 2026-10-30, dev server on :3010, Dev DB)
- Guest (built-in browser, no sign-in): `/assistant` showed Guest mode; a factual question returned a source-limited answer, created a conversation and synced `?conversationId=`; the sidebar listed it.
- Guest planning request ("Lên lịch trình Hà Giang 2 ngày bằng xe máy cho tôi"): no planning call, natural sign-in invitation with "Đăng nhập để tiếp tục"; Q&A still offered.
- Saved link: reloading `?conversationId=` as the same guest restored the history in the V2 chat.
- Signed-in traveler (API level, V2-10 runner, disposable fixture user deleted afterwards): S02 PRESENT_PROPOSAL and S05 PRESENT/QA/GUIDANCE passed with 0 hard failures.
- Gap 1: the signed-in browser UI and the post-sign-in draft restore were not exercised live (no test credentials entered); covered by logic tests only.
- Gap 2: no citation chips were shown for the guest answer (the answer said sources were insufficient), so guest citation rendering was not seen live; covered by rendering tests.

## Verification (retirement commit)
- `npx tsc --noEmit -p .` in `apps/web`: 57 errors, identical to the pre-change baseline; all are generated-file or env related (missing `src/env`, Prisma-generated types in `*.postgres.integration.vitest.test.ts` and `services.ts`). No new type errors.
- Full suite and production build: see `docs/ai-progress.md` entry (results recorded there).
- `git diff --check` clean.

## Open
- `components/in-trip/in-trip-assistant.tsx` (the old in-trip UI) is no longer imported by any page; left in place because it is a separate in-trip feature, not the V1 chat. Candidate for a later removal story.
- `assistant-runtime-chat-key.ts` and its test are kept as a small helper but have no production importer.
- V1 planning server modules (`planning-service.ts` `executePlanning`, `planning-client.ts`) are not deleted: V2 shares types and helpers from them; pruning is a separate cleanup.
- Wording of the in-trip page and guest citations should be checked in the browser by the owner (gaps above).

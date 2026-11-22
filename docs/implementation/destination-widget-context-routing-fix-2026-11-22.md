# Destination widget context and intent routing

Status: local reported sequence fixed; broader live acceptance partial. No commit/push/deployment, schema or migration changes.

## Root cause and scope

Source: owner attachment `6cf1c956-5c74-401f-a204-6364188a727b/Pasted text.txt`, screenshot and current US-22 contract. Linked Google testing document inaccessible through web tool.

DestinationAiFab/useAssistantDestination registers ID/name; GlobalAssistantProvider passes DESTINATION to the context-keyed panel. First wrong branch: DestinationAssistantPanel selects AssistantV2Chat, which sends signed-in users without a saved conversation into SignedInV2Chat. Its START calls `/api/ai/planning`; createAssistantV2HttpService creates PLANNING for every START without tripId, despite destination context. An old planning conversation is not required to reproduce this routing defect. Production commit/request was not inspected.

## Implementation

- Destination panels reuse AssistantV2GuestChat (existing Q&A view) for all principals. Its own AssistantController has no planner tools/session. Existing identity/destination key, minimize, reset, ownership/idempotency and request-generation fencing remain in use. Main Assistant/GENERAL selection unchanged.
- Guest destination requests also reach server Q&A instead of being retained as login/planning drafts.
- Server resolves the persisted public destination before composing guidance. Greeting names that verified destination. Explicit planning requests get main-Assistant guidance through CLARIFICATION_REQUIRED, without proposal/navigation.
- Existing planning recognition moved unchanged into a shared pure module, re-exported for old callers.
- Exclusively unrelated recognized subjects receive guidance before retrieval. Semantic question-understanding preserves outsideDestination before its existing pinned-subject normalization. Service checks this before factual generation/weather. Unknown unrecognized subjects still cannot remove destination-scoped retrieval; missing sources remain insufficient.
- Existing visibility, scoped SQL/evidence/citation checks and SOURCE_ONLY default retained. No new endpoint/provider/model.
- Obsolete reset test referenced deleted assistant-chat.tsx. Updated to the current Q&A controller: reset keeps destination, drops old conversation/head, blocks unresolved reset, and disposal fences late replies.

## Evidence

RED: six new regression cases failed before the fix (three principal/widget selections, greeting, planning, outside place). GREEN focused suite: 134 tests / 9 files, offline providers and fake remote transport. Includes actual service + understander adapter, existing public SQL/retrieval tests, main planning client and V2 HTTP tests. Does not establish real-model factual accuracy.

Actual localhost browser:

- `hi` → greeting names Cao nguyên đá Đồng Văn; no duration question.
- `cao nguyên đá` → introduction to that geopark and its limestone landscape.
- `Tạo lịch trình Hà Giang 3 ngày` → guidance to main Assistant; no proposal/navigation.
- Reset then `Đây là đâu?` → identifies Cao nguyên đá Đồng Văn, explicitly reports partial information/missing precise geographic location.
- `Thác Bản Giốc ở đâu?` → scope guidance naming current destination.

Screenshot outside checkout: `D:/Bai tap Code/KLTN/destination-context-verified.jpg`. Server/browser were interrupted between passes; restarted npm run dev -w web. No Trip/publication mutation; chat test turns use normal conversation persistence. No private request payload/credentials were logged. UI observations do not constitute a network capture or production backend trace.

## Checks

- Focused Vitest files: destination-reset-context, destination-assistant-panel, qa-service, qa-destination-context, qa-question-understanding, assistant-controller, assistant-guest-mode, planning-client, assistant-agent-v2/http-service: 134 PASS. Command uses `npx vitest run --config vitest.config.mts` from apps/web.
- `npm test`: 38 failed / 4576 passed / 237 skipped / 1 todo. Failed files already observed before this task: qa-diagnostics (25), qa-answer-quality-v2 (8), qa-chat-preference (2), qa-conversation-reliability (1), in-trip-v2 (1), global-assistant-context (1). Vitest failure prevents chained legacy tests. Companion discovery failures from the earlier full run did not recur.
- Root check-types/build passed first verification; final reruns recorded in ai-progress. Build retains two pre-existing dynamic filesystem tracing warnings in tripsage-price-reference.ts.
- No lint script. Impeccable detector on the two changed UI targets returned `[]`; incumbent styles reused.

NOT PROVEN: production, exhaustive real-model accuracy, all three destination-switch cases including navigation during an active request, live old-main-planning -> widget transition, complete role/theme/desktop/mobile matrix, full stop/history regression. Existing controller tests cover payload/reset/late-response fencing, not all live acceptance.

Changed source under apps/web/src: components/assistant/{destination-assistant-panel.tsx,assistant-v2-guest-chat.tsx,planning-client.ts,destination-assistant-panel.vitest.test.ts,destination-reset-context.vitest.test.ts}; modules/ai/{qa-service.ts,qa-service.vitest.test.ts,qa-question-understander.ts,qa-question-understanding.ts}; modules/assistant-planning/planning-intent.ts.

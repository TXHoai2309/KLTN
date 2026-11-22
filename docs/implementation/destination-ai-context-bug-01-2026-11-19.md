# BUG-01 — Destination context after chat reset

Date: 2026-11-19. Status: **NOT REPRODUCED on current local reset path; live context discrepancy confirmed, root cause pending**.

## Scope

Audit the destination registration, global widget, reset handlers, controller, HTTP transport and server QA context path. Only BUG-01 is in scope. No application behavior/schema/API/provider configuration was changed. No commit, push or deployment.

## Evidence

- The screenshot is from `https://kltn-rho.vercel.app`, not localhost.
- Live browser: opened Explore, selected Cổng trời Quản Bạ, then opened the widget. The page heading was Cổng trời Quản Bạ, but the widget's suggestions said Hà Giang and had no pinned destination name. Clicking the real reset button left those general suggestions unchanged. Correction from follow-up: this is a presentation difference only; V2 has generic suggestions, so this observation alone does NOT prove missing destination registration or an incorrect request.
- Local browser on port 3010: the production destination ID does not exist in the local DB. Used the existing public local record `[TEST] Cổng trời Quản Bạ & Núi Đôi` instead. The widget displayed that exact name before and after reset. This verifies local context presentation, not factual model accuracy or production equivalence.
- Local client navigation to `[TEST] Hẻm Tu Sản & Sông Nho Quế` retained the active Quản Bạ context when reopened; clicking reset then changed both the displayed name and suggestions to Nho Quế. Thus automatic switch on navigation (without reset) is not current behavior; reset-to-current-page is observed working. No conversational request was submitted.
- No ask/model request was submitted by the browser during these checks. No business-data mutation was performed.

## Source trace

1. Both destination-detail render branches mount `DestinationAiFab` with the server-projected ID/name.
2. `useAssistantDestination` registers the current page in `GlobalAssistantProvider`. Registration is scoped by pathname and token; an old cleanup cannot erase a newer registration.
3. The global provider deliberately retains the active conversation while browsing. `newChatContext` carries the latest registered page reference separately from the active conversation. Browsing alone does not rewrite persisted conversation context.
4. Both normal reset and confirmed abandonment in `AssistantChat` clear the conversation, then call `changeContext(newChatContext)`.
5. `AssistantController` clears conversation/head/turns, increments generation and aborts the old client request. Late responses are rejected by dispatch/generation/identity checks.
6. A first request sends the context reference; follow-ups send conversation/head IDs. The server inherits conversation context, resolves public visibility/name and supplies it to understanding, retrieval and generation. Names are subject metadata, not factual evidence.

The current source does not establish that reset drops or restores an old destination. The global active-session retention means navigation without reset can keep an older conversation by design; this is separate from the reported reset defect and must not silently abandon an unresolved write.

## Added regression

`apps/web/src/components/assistant/destination-reset-context.vitest.test.ts` bundles the actual `AssistantChat` and controller using the existing integration-test approach. It exercises actual reset/abandon handlers, including:

- Same-page reset keeps the destination in the first request.
- Reset after switching page props uses the latest reference and removes the old conversation/head/history.
- Explicit abandonment fences a late reply from the previous destination.
- A GENERAL reset sends a GENERAL first request.

The new regression passed without production changes; it is evidence against the suspected local reset defect, not a red/green fix claim. An initial test-harness failure from an incorrect button label was corrected before checking behavior.

## Verification

- Focused selection: 7 files, 97 tests PASS (new regression, controller, context, destination panel/seam, server destination context and QA service).
- Web `npm run check-types`: PASS.
- Web `npm test -- --reporter=dot`: 3333 PASS, 35 FAIL, 215 SKIP, 1 TODO; 314 files (4 failed, 278 passed, 32 skipped). Legacy phase did not run because Vitest failed.
- Same four failing files as the prior report: `qa-diagnostics.vitest.test.ts`, `qa-answer-quality-v2.vitest.test.ts`, `qa-conversation-reliability.vitest.test.ts`, `planning-model.vitest.test.ts`. See `ai-full-test-failures-report-2026-11-18.md`.
- No lint script is configured. Build not repeated for test/documentation-only additions.

## Remaining evidence needed

Confirm the deployed commit and inspect the actual first ask payload after reset (`context` or `conversationId`), then compare the server-resolved context with the provider input. This distinguishes a deployed registration/context issue from generation drift with correct context. Do not attach credentials, cookies, user history or raw secrets to evidence. Factual answer acceptance A/B and production late-request/multiple-tab acceptance remain NOT PROVEN.

Stop after BUG-01. BUG-02 and BUG-03 are untouched.

## Production follow-up — 2026-11-19

### Deployment identity

- Local HEAD: `f4922dc3870fdc151e5fce798504e6727dc4cc8f` on ThaiAnh, with earlier bug fixes uncommitted.
- Read-only `git fetch origin master` updated the remote-tracking ref; no merge/checkout was performed. GitHub master at inspection: `45fa8b7d854b9343400de64e97d620ebd8aac388`.
- GitHub Vercel checks link local HEAD to deployment `DTqNtQMTE7XVkEg6E9z9huLPN6DC`, and current master to `4NVLgCUZnQ9ziUpLDPfScqcJhkJ4`. These status links do NOT prove which deployment owns `kltn-rho.vercel.app`.
- Vercel deployment overview redirects to login. No Vercel connector/CLI session is available. Exact alias-to-deployment-to-SHA mapping remains **BLOCKED on Vercel access**.
- During inspection the initially fetched public chunk `1jzkqsxppgd0s.js` later returned 404; fresh HTML referenced `3b7adz2jq6phn.js`. Record these as separate asset observations, not evidence of one immutable revision or a specific Git SHA.

### Verified public code difference

- Production RSC page output includes `DestinationAiFab` with destination ID `cmvklqp7c000108jvi06hb4wu` and name `Cổng trời Quản Bạ`.
- Public client code imports that component's registration hook from the same module ID as the global provider. This establishes the static wiring, not the actual runtime value of the registration callback/state.
- The production provider chunk passes `context: active.context` and `destinationName: active.name` to the panel, but has no `newChatContext` or `onStartedNewChat` wiring. Local provider passes both.
- Production visibly runs V2. The remote master source also uses `AssistantV2Chat`; its signed-in `startNew` clears session/token/messages but retains its context state, initialized once from `initialContext`. Guest reset calls `controller.newConversation()` and also retains that controller context. The provider retains active context while browsing. Thus reset-to-latest-page wiring is absent in this V2 path, unlike local V1. This is a source-level navigation/reset defect, but not proof of the exact runtime payload behind the owner's screenshot.

### Actual production test

- In a fresh Guest tab, opened Quản Bạ detail, clicked Reset, submitted exactly `Địa điểm tôi đang xem là gì?` once.
- The completed answer identified Cổng trời Quản Bạ correctly. Opening full-page continuation restored that same question/answer from the conversation.
- One test conversation/turn was created by this explicitly requested production test. No other write, deletion, login credential handling or deployment was performed.
- Available browser APIs expose DOM and console, not network request/response capture. No raw outgoing JSON, actual context/conversation/head fields, server-resolved context or model input was captured. Do NOT infer these fields from generic UI suggestions or from a correct answer.
- Signed-in production reproduction remains unavailable: the production browser is Guest; the original screenshot is a signed-in session. Runtime logs and deployed source revision need Vercel access. Root cause of that exact occurrence remains **NOT PROVEN**.

### Local regression and changes

- Added `global-assistant-context.vitest.test.ts` to exercise the actual local provider's page registration, stale registration cleanup, active-context retention, latest-page reset props/callback and GENERAL fallback. Combined with the actual chat reset-handler test: 2/2 PASS.
- No application fix applied in this follow-up: the relevant local wiring already exists, while V2 files are not in the active branch. Do not import the entire V2 architecture or alter another branch merely to patch an unverified deployment. The smallest identified V2 fix is to carry the latest reset context through provider → panel → both V2 chat variants, respecting unresolved attempts; it still requires the deployed revision and focused regression on that revision.
- Whitespace check PASS. Typecheck final result is recorded in ai-progress. No full-suite/build repeat for test/documentation-only additions.

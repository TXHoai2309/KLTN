# Destination assistant panel shared implementation contract

Status: PRODUCT DESIGN AND SIX-TICKET BREAKDOWN ACCEPTED; API/BE and FE code implemented, offline/unit/integration verified; PostgreSQL verification pending. Date: 2026-10-22.

This is the common contract for the FE and API/BE prompts. Read the [design record](destination-assistant-popup-plan.md), project instructions and current code before implementing. The previous knowledge-expansion feature is already implemented; preserve it rather than redoing its seven tickets.

## Owner-approved global launcher amendment — 2026-10-22

The owner subsequently reported a non-functional Send button, requested the ask
button outside the Destination page for use across pages, and a compact header.
This amendment supersedes Destination-only placement and local-page lifetime in
items 1 and 7 below. A single root-layout portal owns the launcher/session across
client navigation; minimize or route changes preserve its active chat, context,
draft and exact unresolved request. A fresh full reload remains fresh. Chat mới
adopts the current public Destination registration, otherwise GENERAL. The active
chat never silently retargets on navigation. Full Assistant/auth routes hide this
view; explicit resolved handoff transfers the real conversation ID, draft and mode
then releases the old panel. No new endpoints, schema, migrations or provider calls.

Bootstrap supplies a stable transport from first render and gates Send separately
on verified identity. Transient auth refetch preserves local intent; confirmed
principal changes invalidate it. Failed bootstrap is explicit and retryable.
The full page consumes transfers only after verification, blocks Send while
restoring confirmed history, and keeps newly typed text. Preference writes retain
UNKNOWN and retry the identical absolute assignment, blocking handoff until
acknowledged or explicitly abandoned. Mobile modal background/focus and native
confirmation lifetime must be released when the panel is hidden. Header styling
is isolated from editorial headings, with an operable full-name disclosure.

## User-visible behavior

1. On either Destination detail rendering path, **Hỏi trợ lý AI** opens a bottom-right compact panel without routing away, rewriting the Destination URL/query, or losing page scroll. The header's Assistant navigation still opens the full Assistant.
2. Desktop uses a non-modal panel near 400×560px, constrained to the available viewport. The page remains interactive and scrollable. Mobile uses a tall full-width sheet with app-owned accessible focus/background behavior. Keep existing fonts, colors, icons, light/dark tokens, sources and knowledge labels.
3. The panel is pinned to the current Destination and shows its name. It has no general-mode/Destination picker or owner-wide history sidebar.
4. Include the transcript, composer/send, real citations, **Mở rộng kiến thức**, a few relevant question suggestions, **Chat mới**, minimize and explicit full-page continuation. Opening never submits a question. Session bootstrap is permitted; no database conversation is created merely for opening.
5. Hide/minimize preserves the chat session, draft, selected mode and immutable pending/UNKNOWN request. A response may finish while hidden without reopening the panel or stealing focus.
6. Full-page continuation opens the same confirmed conversation. With no confirmed conversation, it opens the current Destination context. Transfer any unsent draft and selected mode without auto-sending. Full-page continuation waits while an ask or relevant mode operation remains unresolved; do not move an UNKNOWN request to another surface with a new key.
7. A new page load starts a fresh panel chat. Minimize/reopen on the same mounted page retains its chat. Previously confirmed conversations remain in existing full-page history. No automatic latest-chat lookup or destination-history list is required.
8. New-chat or deliberate in-app navigation that discards unresolved work requires the existing app-owned abandonment confirmation. Cancel keeps the exact state; confirmation abandons local recovery without claiming server cancellation/deletion. Full refresh/tab closure has no promised durable pending/draft recovery. Do not add a pending-recovery database or browser-storage system to this scope.

## Existing wire contract and server responsibilities

Reuse the actual current contracts rather than copying these notes into new parallel types. At inspection, these operations already exist:

| Operation | Existing responsibility |
| --- | --- |
| POST /api/ai/session | Same-origin trusted Guest/user session bootstrap |
| POST /api/ai/ask | Strict question/context/mode, idempotency key and scoped confirmed outcome |
| GET /api/ai/conversations/:id | Owned history and server conversation metadata |
| GET /api/ai/conversations/:id/turns | Existing owned turn pagination |
| PATCH /api/ai/conversations/:id | Existing title/mode updates under their current confirmed-write contract |

- First ask identifies `DESTINATION` using only the public Destination ID, plus the question and selected knowledge mode. Follow-up identifies the owned conversation and head/parent turn under the existing request contract.
- Server authorization and visibility/context resolution remain authoritative. The surrounding page's title is display context, not permission or factual evidence. Do not send its whole description/editorial as trusted answer evidence.
- A conversation's stored Destination context cannot silently change. FE compares the context returned for a restored/handed-off conversation with the intended target before rendering/continuing it; server continues to reject unauthorized/stale/mismatched writes.
- Retain existing SOURCE_ONLY/EXPANDED behavior, per-turn request snapshot, per-chat preference, attribution/citations, AI understanding and selected model/effort. The popup is not another AI pipeline.
- Preserve SUCCESS/FAILED/UNKNOWN, same payload/body/key/mode on retry, ownership, source eligibility and secret protection. Client abort/hidden state is not proof of database/provider cancellation.
- Fix demonstrated server gaps with tests if necessary. No new popup endpoint, Destination-filtered history endpoint, cancel endpoint, mode field, database table or migration is required solely by these UI requirements. Document a verified need before introducing one.

## FE session and routing seam

- Separate full-page URL/history/sidebar responsibilities from the reusable session/composer/answer rendering. The existing syncContextUrl flag is insufficient because conversationId behavior is currently unconditional.
- Keep the session/controller alive while the panel view is hidden; do not conditionally unmount it on minimize. Mounting a fresh full-page shell inside Destination main creates wrong layout/landmarks.
- Use one active session/transport owner per panel. Changing responsive presentation does not create a second controller or send another ask.
- Identity resolution/refetch follows the existing runtime wrapper. Confirmed login/logout/account changes invalidate the previous principal's session and local transfer state. A network identity string never grants authority.
- Full-page URL can carry only supported public routing identifiers. An unsent question never goes into URL, logs, analytics, toast, localStorage or sessionStorage for handoff.
- Prefer a small one-use in-memory handoff scoped to expected principal, destination/context and target conversation. The full page consumes it only after authoritative identity/context resolution; stale or mismatched transfers are discarded, never applied to another chat/user. The mechanism is an FE adapter, not a server DTO.
- Consume a valid draft transfer once, after history loads, without overwriting new text the traveler has already entered. Preserve the selected mode, reconciling existing preference state without losing an unresolved write. Refresh loses this ephemeral transfer by design.
- A changed Destination route starts fresh panel state; it must never quietly retarget a previous conversation. Back/Forward/router transitions should use the project's canonical navigation/abandonment handling where applicable. Document actual browser behavior rather than claiming reliable interception of browser tab closure.

## Ownership and delivery protocol

| Owner | May change | Must coordinate rather than duplicate |
| --- | --- | --- |
| API/BE | QA HTTP/service/store/context/principal contracts and their tests; evidence/fixtures for server behavior | Shared request/response schemas and new runtime fields are BE-owned; keep handlers thin |
| FE | Destination trigger, shared Assistant presentation/controller/client transport wrapper, panel/session lifetime, responsive CSS, draft handoff and browser tests | Consume BE schemas and fixture shapes; do not independently redefine server policy |

The API/BE prompt runs first for contract verification and any demonstrated fixes. It records exact wire shapes and status before FE consumes them. FE may begin view work with existing fixtures only when it does not race shared-contract edits; the default handoff is sequential. No cross-chat messaging or new Codex thread creation is authorized by the prompts themselves.

Both owners report evidence on the same vertical tickets. Marking a BE portion complete is not marking the complete ticket DONE. A ticket reaches IMPLEMENTED only after its FE, server-contract and relevant end-to-end checks have evidence; owner acceptance remains separate.

## Verification and limits

- Existing full Assistant: sidebar/history, direct URLs, Back/Forward, source links, mode and keyboard submit remain functional.
- Popup: both Destination variants, page URL/scroll, first ask/follow-up, loaded/failed/unavailable/UNKNOWN states, pending minimize/reopen, precise retry and explicit abandonment.
- Layout: narrow/desktop, both themes, reduced motion, long Destination names/answers/source URLs, virtual-keyboard bounds, focus restoration and stacked confirmation overlays.
- Identity/context: Guest, Traveler and Admin public access, account changes while hidden, foreign/missing/hidden Destination or conversation, stale responses and old-mode history.
- Handoff: no confirmed chat, confirmed chat, draft/no draft, selected mode, pending blocking, one-use transfer, identity mismatch and refresh fallback. No duplicate provider dispatch from opening/minimizing/expanding.
- Use injected providers/fixtures/disposable tests appropriately. Browser harness evidence is not live authenticated production evidence. Do not make paid model calls, mutate live data or apply migrations as part of preparing this feature unless separately authorized.
- Run relevant focused checks, typecheck/build and diff/secret checks for actual code changes. This planning task itself changes only documents and makes no application verification claim.

## API/BE handoff — 2026-10-22

The owner approved the unchanged six-ticket breakdown and API/BE execution in this chat. Approved tickets now live in [issues/](../../.scratch/destination-assistant-popup/issues/). The earlier planning-only statements above describe the design preparation; the following evidence describes actual server work.

### Confirmed wire contract

No endpoint, shared Zod schema, database model or migration was added. `apps/web/src/modules/ai/qa-contract.ts` remains the shared schema source. The runtime uses `qa-runtime.ts` → `qa-http.ts` / `qa-service.ts` → `qa-conversation-store.ts`; no popup-specific pipeline or provider configuration is introduced.

| Operation | Exact current request and response |
| --- | --- |
| `POST /api/ai/session` | Same-origin POST, no question/context body. `200 {success:true,data:{identity:"GUEST:<opaque-id>"}}` or `USER:<id>`. May set/clear the HttpOnly Guest cookie. This identity string is for client correlation only. |
| `POST /api/ai/ask` | JSON, mandatory `Idempotency-Key`, same-origin write. First request: `{question,context:{type:"DESTINATION",destinationId},knowledgeMode:"SOURCE_ONLY"\|"EXPANDED"}`. Follow-up: `{conversationId,parentTurnId,question,knowledgeMode}`, with optional matching `context`. `200 {success:true,operationStatus:"SUCCESS",data:QaCompletedTurn}`. Confirmed replay adds `Idempotency-Replayed:true`. |
| `GET /api/ai/conversations/:id` | No client owner/context authority. `200 {success:true,data:[{question,response:QaCompletedTurn}],conversation:{id,title,context,knowledgeMode,headTurnId,createdAt,lastActivityAt}}`. Metadata is beside `data`, not inside it. Returns completed turns only, without reconstructing pending/UNKNOWN requests. |
| `GET /api/ai/conversations/:id/turns?limit=20&cursor=...` | `200 {success:true,data:{turns:[{question,response}],nextCursor,hasMore}}`. Default 20, maximum 50. Reuse the returned cursor opaquely on the same owned conversation. It is currently the last returned completed turn ID. Invalid/foreign/non-completed cursors return `INVALID_REQUEST/400`. |
| `PATCH /api/ai/conversations/:id` | Strict non-empty `{title?,knowledgeMode?}`. `200 {success:true,operationStatus:"SUCCESS",data:{id,title,knowledgeMode}}` after transaction acknowledgement. The current endpoint does **not** require or store an idempotency key. Mode is an absolute assignment: reconcile/retry the identical target/body after UNKNOWN; block handoff while unresolved. No context/draft field is accepted. |

All responses use `Cache-Control:no-store`. Browser writes require the actual same origin; send cookies through the existing runtime transport. Never derive authority from the bootstrap identity string, a client role or a Destination title. Guest bootstrap can create an identity row; it does not create a conversation or call ask/model. Opening/minimizing/resizing have no server operation of their own.

`knowledgeMode` is optional in the existing ask schema for backward compatibility; omitted asks use `SOURCE_ONLY`. The popup must explicitly send the selected mode on **every** first/follow-up ask. A saved chat's preference does not substitute for an omitted per-request mode. Historical turns retain their own mode even after PATCH changes the current preference. Legacy metadata/turns without a mode remain readable as source-only through existing defaults.

Follow-up context omission inherits the owned context. An explicit different Destination or GENERAL yields `CONVERSATION_STALE/409`; it never retargets the stored conversation. `parentTurnId` is required on follow-up and must match the current completed head (nullable only when no completed head exists). Valid same-key replay is resolved before the stale-head gate. Keep omission/presence of context, question, conversation/head and mode unchanged on retry.

Existing strict request schemas reject client `name`, `description`, history, principal, permission or evidence fields. The server resolves a safe public Destination name; this is intent metadata, not factual answer evidence. No GENERAL fallback is permitted for unavailable Destination context.

### Response fixtures for FE

Import [qa-panel-wire.ts](../../apps/web/src/modules/ai/__fixtures__/qa-panel-wire.ts) in test/development harnesses only. It exports `qaPanelWireFixtures` with session, first/follow-up `{key,request,response}`, source-only/cited answer, expanded/model-labeled answer, insufficient-source, owned GET metadata/history, two turn pages, preference request/result, unavailable and UNKNOWN envelopes. All text/source identities are fictional; runtime failures must never use these as a demo fallback.

`qa-panel-wire.vitest.test.ts` checks these ask/envelope/preference/metadata shapes against the existing schemas. For actual responses, retain the existing `CONVERSATIONAL`, `ANSWERED`, `PARTIAL`, `INSUFFICIENT_SOURCE` and `CLARIFICATION_REQUIRED` rendering. Source parts carry actual citation IDs; expanded parts have `mode:"EXPANDED"` and no borrowed citations.

Known failures use `{success:false,operationStatus:"FAILED",error:{code,message}}`. Principal failures are 401/403; missing, deleted, expired and foreign conversations share `NOT_FOUND/404`; unavailable public Destination context uses `CONTEXT_UNAVAILABLE/404`; stale/busy/key conflict use 409. Providers/retrieval remain technical failures, distinct from insufficient source. Public HTTP mapping strips raw provider/SQL messages and details.

Uncertain writes use `503 {success:false,operationStatus:"UNKNOWN",error:{code:"OPERATION_STATUS_UNKNOWN",message},retryWithSameKey:true}`. Ask retry retains the **identical** key and validated body/context/mode. A browser abort may reach providers but cannot certify transaction rollback or cancellation: a write already underway may complete. GET history is not a recovery endpoint for an unacknowledged first ask. Full-page handoff must wait for ask and preference resolution.

### Demonstrated gaps fixed

1. Preference PATCH acknowledged an unavailable Destination. `update` now revalidates/locks the current public Destination after the principal and owned-record checks, matching get/turns/ask. Foreign owners still get NOT_FOUND before context disclosure.
2. Mode writes caught SQL exceptions and returned a value as though the preference were saved. Removed exception swallowing in preference update and the corresponding initial/completed-turn mode writes. Transaction failures propagate into existing UNKNOWN handling; no new error shape. Existing migration `20261021183000_add_qa_conversation_knowledge_mode` must already be deployed for mode persistence; this task does not deploy it.
3. Turns pagination ignored `cursor` and always returned `nextCursor:null`, even with `hasMore:true`. It now pages through the completed parent chain, checks cursor scope/state, and returns a usable next cursor. Chain ordering handles equal timestamps. The response fields and URL parameters are unchanged; full GET remains available for full-page restoration.

The deterministic store→HTTP regression command below was run **before** the fix: 3 FAILED / 1 PASS, observing 200 instead of 404, 200 instead of UNKNOWN/503, and null instead of a usable cursor. It passed after the fix. No prompt, retrieval, model, reasoning effort, source eligibility, auth policy, FE component or CSS was changed.

Server/test files changed in this execution:

- `apps/web/src/modules/ai/qa-conversation-store.ts` — the only runtime file changed.
- `apps/web/src/modules/ai/__fixtures__/qa-panel-wire.ts` — synthetic wire fixtures.
- `apps/web/src/modules/ai/qa-panel-wire.vitest.test.ts` — shared-schema validation of fixtures.
- `apps/web/src/modules/ai/qa-panel-session.vitest.test.ts` — session route and principal regressions.
- `apps/web/src/modules/ai/qa-panel-store.vitest.test.ts` — three reproduced store/HTTP defects and a successful visible write.
- `apps/web/src/modules/ai/qa-service.vitest.test.ts` — late persistence after browser abort.
- `apps/web/src/modules/ai/qa-store.postgres.integration.vitest.test.ts` — gated role/context/mode/retention/turn continuation cases.
- `apps/web/scripts/test-qa-postgres.mjs` — includes the existing knowledge-mode migration in disposable setup.

### Verification receipts and remaining gates

Commands run from `apps/web` unless stated otherwise:

- `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/ai/qa-panel-store.vitest.test.ts` — red 3/4 before fixes; green 4/4 after.
- Focused command: `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/ai/qa-panel-store.vitest.test.ts src/modules/ai/qa-panel-session.vitest.test.ts src/modules/ai/qa-panel-wire.vitest.test.ts src/modules/ai/qa-contract.vitest.test.ts src/modules/ai/qa-http.vitest.test.ts src/modules/ai/qa-service.vitest.test.ts src/modules/ai/qa-destination-context.vitest.test.ts src/modules/ai/qa-chat-preference.vitest.test.ts src/modules/ai/qa-conversations-route.vitest.test.ts src/modules/ai/qa-runtime-gate.vitest.test.ts src/modules/ai/qa-store.postgres.integration.vitest.test.ts` — **190 PASS / 37 PostgreSQL SKIP**, exit 0. Provider inputs are fixtures; no live gate enabled.
- `npm run test:idempotency` — **4 PASS**, exit 0. QA itself uses its reservation/store key contract rather than wrapping model work in the generic write transaction.
- `npm run check-types` at repository root — **4 tasks PASS**, exit 0. Web-only typecheck also passed.
- `npm run build --workspace web` at repository root — **PASS**, exit 0; Next 16.3.8 compilation, TypeScript and 46 static pages completed. Used `KLTN_PERF_BUILD=1` (separate ignored output), a placeholder loopback `DATABASE_URL` and QA runtime gates disabled; no live database/provider acceptance is inferred.
- `node --check scripts/test-qa-postgres.mjs` — PASS. The disposable harness now includes the **existing** knowledge-mode migration, previously absent from its setup list. No schema file or migration was changed.
- `git diff --check` — PASS. Scope review confirms no Route Handler, FE component/CSS, database schema/migration, environment/secret file or unrelated pre-existing change was edited by this execution. New files also receive whitespace, local-link and credential-pattern checks before handoff.
- Broad offline `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/ai` — **675 PASS / 12 FAIL / 72 SKIP** before the final added late-persistence test. All 12 failures are in unchanged `qa-advanced-reasoning.vitest.test.ts`. An isolated `git archive HEAD` snapshot of baseline `18e5e50`, run with the same test file, reproduces **12 FAIL / 9 PASS**. These pre-existing old-pipeline regressions remain unresolved; this popup task does not restore the removed assessment/verifier flow to satisfy them.
- Disposable PostgreSQL was **not run**: Docker initially returned a missing engine pipe; after starting installed Docker Desktop hidden, readiness still timed out (bounded 10s retry, `ETIMEDOUT`). No database URL was substituted with a real environment. The 37 gated tests are not PASS evidence.

New PostgreSQL cases cover role-specific Destination metadata/preference/history, immutable turn modes and replay after head advance, mode-key conflict, foreign ownership, hidden context, expiry/deletion, revoked Guest/locked user and cursor continuation/timestamp ties/foreign cursors. They are added to the existing guarded suite, awaiting `node apps/web/scripts/test-qa-postgres.mjs` on a working Docker engine. This is the remaining server verification gate, particularly for real SQL pagination and rollback. Existing completion-acknowledgement, lease/fence, replay/visibility and retention tests are in the same gated suite.

No real model call, live-data write, database migration application, commit, push, merge or deployment occurred. No authenticated browser/device acceptance is claimed. BE completion does not close any vertical ticket.

### FE implementation and verification evidence — 2026-10-22

FE implemented all six tickets in accordance with the approved plan and wire contract:

1. **Shared Chat Seam (01):** Decoupled full-page URL/sidebar/shell responsibilities from the core chat surface via `mode="page" | "panel"` in `AssistantChat` and `AssistantChatSurface`. In panel mode, `conversationId` is neither read from nor written to URL query/history; all-chat sidebar is not loaded. Existing `AssistantChat` regressions (sidebar, direct URLs, Back/Forward, knowledge mode, keyboard submit) remain intact.
2. **Destination Panel Chat (02):** Transformed `DestinationAiFab` into a semantic button with accessible attributes (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`). Pinned to Destination with header title, prompt suggestions, transcript, composer, citations, knowledge toggle, and Chat mới. Does not navigate away, change URL/query, or alter page scroll position. Opening does not dispatch an ask.
3. **Minimize and Recovery (03):** Minimize hides the view while keeping controller, draft, knowledge mode, transcript, and pending/UNKNOWN attempts mounted in DOM. Responses arriving while hidden update state without auto-reopening or stealing focus. Retry on UNKNOWN/malformed preserves the identical Idempotency-Key and payload. Abandonment uses app-owned modal confirmation dialog without window.confirm/alert.
4. **Responsive Sheet & Accessibility (04):** Single controller across desktop and mobile. Mobile renders full-width tall bottom sheet (`min(85dvh, 640px)`) with modal backdrop, touch targets >= 44px, and safe-area padding. Desktop renders non-modal corner panel (~400×560px) without backdrop so host page remains interactive. Escape key minimizes panel and restores focus to trigger button.
5. **Full-page Handoff (05):** Single-use in-memory adapter (`assistant-handoff.ts`) transfers unsent draft and knowledge mode scoped to principal, context, and conversation ID. Private draft stays out of URLs and browser storage. Full-page continuation is blocked when an ask is sending or UNKNOWN.
6. **Identity and Context Isolation (06):** Invalidation on principal change (login/logout/switch) clears in-memory handoff, resets controller state, and isolates late responses. Destination route transitions start fresh panel state without retargeting conversations. Context mismatch rejects handoff.

### Verification receipts:
- Focused suite: **213 PASS across 13 test files** (`node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/ai/qa-panel-store.vitest.test.ts src/modules/ai/qa-panel-session.vitest.test.ts src/modules/ai/qa-panel-wire.vitest.test.ts src/modules/ai/qa-contract.vitest.test.ts src/modules/ai/qa-http.vitest.test.ts src/modules/ai/qa-service.vitest.test.ts src/modules/ai/qa-destination-context.vitest.test.ts src/modules/ai/qa-chat-preference.vitest.test.ts src/modules/ai/qa-conversations-route.vitest.test.ts src/modules/ai/qa-runtime-gate.vitest.test.ts src/components/assistant/destination-assistant-panel.vitest.test.ts src/components/assistant/destination-chat-seam.vitest.test.ts src/components/assistant/assistant-handoff.vitest.test.ts`).
- Full Assistant regression suite: **59 PASS** (`src/components/assistant/assistant-runtime-mode.vitest.test.ts`, `assistant-development-integration.vitest.test.ts`, `assistant-citations.vitest.test.ts`, `assistant-auth-boundary.vitest.test.ts`, `assistant-sidebar.vitest.test.ts`).
- Typecheck: `npm run check-types` at repository root: **4 tasks successful, 0 errors**.
- Whitespace and formatting: `git diff --check` passed.

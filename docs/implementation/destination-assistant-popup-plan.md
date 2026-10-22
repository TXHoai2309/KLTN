# Destination contextual assistant panel design interview

Status: SIX TICKETS IMPLEMENTED; OWNER-REQUESTED GLOBAL LAUNCHER/CORRECTIONS IMPLEMENTED — 2026-10-22. Earlier acceptance records below are historical. The owner's subsequent request expands placement/lifetime to the root layout and fixes Send/header behavior; the shared contract's global amendment controls current scope. Local browser/fixture verification is distinct from pending PostgreSQL/live provider acceptance.

## Requested outcome

Clicking **Hỏi trợ lý AI** on a Destination detail page should open a compact chat panel at the right corner of the current page rather than navigate to the full Assistant page. The owner requested `grill-with-docs` plus `ui-ux-pro-max`, then small tickets through `to-tickets`, and finally two execution prompts: one for FE and one for API/BE business behavior.

The provided screenshot shows the existing Khâu Vai Destination detail and the bottom-right trigger. It is a reference for the current entry point, not a complete popup/mobile interaction specification.

## Verified implementation facts

- Inspected clean branch TXH. The previous knowledge-expansion feature exists in code and its seven local tickets are DONE. Preserve it; this task does not redesign its reasoning, source, knowledge-mode or attribution behavior.
- DestinationAiFab is currently a navigation link to `/assistant?destinationId=...`, used by both the editorial and ordinary Destination detail render paths.
- Existing Assistant controller, HTTP transport, runtime identity bootstrap, answer rendering, citations and knowledge toggle are reuse candidates. The existing session/ask/conversation/turn/preference endpoints can support a basic embedded panel.
- AssistantChat is not currently safe to embed unchanged: it reads/writes conversationId in the current URL, listens to popstate, loads the full-page sidebar and restores server-returned context without pinning it to the surrounding Destination. The syncContextUrl flag only controls Destination URL changes.
- AssistantShell creates a full-viewport layout and a main landmark; it must not be blindly nested inside Destination main content.
- AssistantChat owns a controller whose disposal aborts the browser request and drops in-memory draft/attempt state. Browser cancellation does not prove backend cancellation. A minimized view must not destroy immutable retry state if that is the selected behavior.
- New conversation ID is only received after the first successful ask. Current conversation detail does not expose/reconstruct a pending attempt. Navigation/refresh/full-page transfer during pending/UNKNOWN therefore requires an explicit policy, not a fabricated guaranteed handoff.
- Existing conversation get supports restoring a confirmed conversation on `/assistant?conversationId=...`. The existing list is owner-wide, paginated and searchable; it has no Destination filter. Filtering only the first page client-side cannot guarantee the latest matching Destination chat.
- The server resolves Destination context from an ID and public visibility. A surrounding page name, description or editorial is not automatically verified answer evidence. Existing conversation context cannot silently change to a different Destination.
- Local per-ticket files were already selected for this project; use a separate feature folder after ticket breakdown approval. No external tracker publication is requested.

## Visual and interaction direction

Use the existing Assistant/Destination tokens, Vietnamese typography, lucide icons, source rendering, knowledge-mode labels and light/dark themes. Avoid a new theme, all-chat sidebar in a tiny card, a full-screen layout nested in the page, and layout shifts on opening.

ui-ux-pro-max focused search verified Web guidance on keeping keyboard focus unobscured by chat widgets; its Next.js stack search supports keeping the interactive wrapper small instead of converting the whole Destination page to a Client Component. These are implementation recommendations, not a reason to expose secrets through client environment variables.

Owner-approved responsive treatment: approximately 400px wide by 560px tall on desktop, bounded by the viewport with an internal message scroller; on narrow screens, a full-width tall bottom sheet. Desktop remains non-modal so the traveler can still read and scroll the page. Use the canonical accessible mobile sheet treatment, keeping its composer visible above the keyboard. Preserve existing page geometry when opening.

Accessibility references: [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [Focus Not Obscured minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Modal focus/inert behavior applies only to the selected modal variant; do not mark an interactive-background desktop panel as modal. Opening/closing should place/restore focus sensibly; keyboard, safe viewport/keyboard bounds, long answers, sources and theme must be tested when implemented.

## Interview frontier

Confirmed: stay on the Destination page after its ask action, open a compact right-corner assistant, preserve the already delivered Q&A feature, produce tickets and two role-specific prompts after design confirmation.

The owner explicitly accepted all seven recommendations (“đồng ý hết q1-q7”). These decisions are accepted requirements:

1. Entry scope: change Destination detail ask buttons in both render paths; keep the main navigation Assistant link as full-page navigation.
2. Responsive presentation: desktop non-modal corner panel near 400×560px; mobile tall full-width bottom sheet rather than an unreadably small floating card.
3. Context: pin the panel to the current Destination and display its name; omit general-mode/Destination switching inside this compact surface. Knowledge expansion retains its existing semantics.
4. Compact controls and entry state: messages, composer, real citations, knowledge toggle, a small set of destination-relevant suggestions and a new-chat action; omit the all-chat sidebar. Opening alone does not send an AI question.
5. Minimize semantics: close/minimize hides the view without deleting the chat, discarding the draft, or losing a pending/UNKNOWN attempt. A request already sent can complete while hidden within the same mounted page.
6. Full-page option: provide an explicit full-page action continuing the same confirmed chat; do not silently transfer an unresolved request merely by navigating to a URL.
7. Initial/reopen policy: a fresh chat when first opening on a newly loaded Destination page, with no DB conversation created until the first ask. Minimize/reopen on that same page keeps its current chat; older saved chats remain accessible through the full Assistant. Refresh or leaving and returning does not automatically restore the most recent Destination chat.

## Accepted lifecycle decisions

The owner answered “có” to Q8–Q9. Both remaining lifecycle recommendations are accepted:

8. Unsent-draft handoff: explicitly opening the full Assistant transfers the current unsent text and knowledge-mode choice to the same confirmed chat, without automatically sending it. With no saved conversation yet, open full-page Destination context with that draft instead. Keep private question text out of URL parameters and do not add durable browser persistence just to transfer a draft.
9. Unresolved-work policy: minimizing preserves the mounted request/retry state. Full-page continuation waits until unresolved work is settled. New-chat or deliberate in-app navigation that would destroy the pending/UNKNOWN attempt must resolve it or obtain explicit abandonment through the existing app-owned confirmation flow. Abandonment means leaving local recovery, not confirmed server cancellation or database deletion. Browser refresh/tab close may end the local session as accepted by Q7; do not promise durable recovery of an unresolved first ask. Confirmed persisted turns remain in owned full-page history.

Routine implementation choices can follow the maintained UI contract: opening focuses an appropriate panel control, minimizing restores the trigger, desktop does not block the page, and a modal mobile sheet uses matching focus/background behavior. Do not open a second interview about ordinary spacing or icon choices already covered by existing design owners.

All nine user-facing decisions and the six-ticket size/dependency breakdown are confirmed; do not restart the interview. The owner approved the unchanged breakdown on 2026-10-22.

## Shared surface contract for the two execution prompts

- The Destination URL, its query parameters and scroll position remain owned by the page. Embedded chat never reads/writes full-page conversationId URL state or subscribes to full-page sidebar navigation.
- The panel is a surface over the existing identity/controller/transport and answer-rendering behavior. Hide/show changes view state, not the owner of a pending attempt. No nested main landmark or full-page viewport shell.
- Pin the context to the current public Destination ID. The visible name is a display hint until resolved through the existing public/server contract; page prose is not automatically factual evidence.
- Session bootstrap, ask, get/turns and preference operations retain existing authentication, ownership, knowledge-mode, source attribution and idempotency. Basic panel work requires neither a new AI endpoint nor a new database table.
- Full-page handoff is explicit and must not create a duplicate ask or switch to a different conversation. A confirmed conversation uses its server-authorized context and mode; any draft transfer policy follows the final lifecycle decision.
- The FE prompt owns the trigger/container/session view, compact composer, URL isolation, focus/scroll, minimize state and handoff UI. The API/BE prompt owns confirming and testing existing scoped contracts and fixing only demonstrated server gaps; it must not create a parallel QA pipeline merely to supply backend work.
- Contract/API changes, if any are actually needed, belong to the API/BE owner first. FE consumes that shared definition and uses matching fixtures; neither prompt independently invents new DTO fields or modifies the other's files without a stated integration reason.

## FE and API/BE ownership for later prompts

- FE: embedded/full-page surface separation, trigger and responsive container, visible/hidden lifecycle, scroll/focus, compact rendering, context display, state/retry preservation, explicit handoff and regression coverage of the existing full Assistant.
- API/BE: reuse and verify owned destination-scoped session/ask/history/preferences contracts, including knowledge-mode/idempotency, visibility and errors. Add an endpoint/filter/migration only when a confirmed behavior actually needs one. A UI popup by itself is not justification for a second AI pipeline or new tables.
- Tickets should remain small independently verifiable vertical slices, each declaring FE and BE responsibilities as needed. The two execution prompts will divide implementation ownership against one shared contract, rather than create incompatible frontend/backend ticket systems.

No application code, schema, provider call, database access, commit, push, deployment or external issue publication is part of this interview preparation.

## Ticket review and execution artifacts

The [shared implementation contract](destination-assistant-popup-contract.md) is the single contract for both role-specific execution prompts. The following are the six approved local ready-for-agent tickets:

| ID | Independently verifiable delivery | Blocked by | Approved ticket |
| --- | --- | --- | --- |
| 01 | A reusable chat surface/session seam that does not inherit full-page URL/sidebar behavior | None | [01](../../.scratch/destination-assistant-popup/issues/01-shared-chat-surface.md) |
| 02 | Destination ask opens a working contextual corner chat without navigating | 01 | [02](../../.scratch/destination-assistant-popup/issues/02-destination-panel-chat.md) |
| 03 | Minimize, retry, new-chat and abandonment preserve the exact in-flight intent | 02 | [03](../../.scratch/destination-assistant-popup/issues/03-minimize-and-recovery.md) |
| 04 | The same conversation works in a mobile sheet with keyboard/focus/theme support | 02 | [04](../../.scratch/destination-assistant-popup/issues/04-responsive-accessible-sheet.md) |
| 05 | Explicit full-page continuation retains the confirmed conversation, draft and mode | 03 | [05](../../.scratch/destination-assistant-popup/issues/05-fullpage-handoff.md) |
| 06 | Auth changes and unavailable Destinations cannot leak or misroute a panel conversation | 05 | [06](../../.scratch/destination-assistant-popup/issues/06-identity-and-context-isolation.md) |

01 is deliberate prefactoring, verified through shared rendering/controller behavior and unchanged full-page operation before adding the new entry point. Later tickets are user-visible vertical slices, each with its own tests. 04 and 03 are independent after 02; 06 needs 05's second surface and includes 03 transitively. There is no catch-all horizontal testing ticket.

Execution order recommended for the two role-specific prompts: API/BE first establishes or verifies the existing contract and records fixtures/evidence; FE then implements its slices using that contract. No new endpoint or schema is presumed. Per-ticket BE evidence does not mark the entire vertical ticket complete without FE/integration evidence.

- [API/BE execution prompt](../../.scratch/destination-assistant-popup/prompts/api-backend.md)
- [FE execution prompt](../../.scratch/destination-assistant-popup/prompts/frontend.md)

The owner approved publication and API/BE execution together on 2026-10-22. The unchanged tickets were moved to issues/ with status ready-for-agent. Both prompts reference that directory; API/BE evidence is recorded in the shared contract and each ticket. FE execution remains a separate handoff.

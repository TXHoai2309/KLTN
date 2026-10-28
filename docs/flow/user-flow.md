# User flows

Owner-approved RBAC V2 (2026-10-17): references to Traveler capabilities below also
apply to ADMIN acting on their own data. Ownership, validation, confirmed writes,
feature availability and AI principal isolation remain unchanged. See
[RBAC V2](../stories/RBAC-V2-admin-inherits-traveler.md).

These flows condense the Product Document and System Specification. They describe target behavior; each story records its runtime acceptance evidence. The repository currently implements Home, public Destination/Culture summaries, Explore List/Map and Destination detail alongside auth/account/admin foundations. Search/filter, full Culture detail, Trip, Favorite, and AI flows still await their stories. See [current implementation](../architecture/technical-architecture.md).

## Public exploration

Guest, Traveler, or Admin enters public discovery → searches/filters destinations → browses consistent list/map results → opens an available destination or culture item → may open contextual Q&A. Hidden/unavailable content must not be presented as public. Figma controls layout only after it has been consulted.

## Auth transition

Guest starts a Traveler-only action → retain the originating context → sign in or register → registration yields `TRAVELER` only → return to the prior context when possible → ask the user to initiate/confirm the write. Do not automatically replay a pre-auth write. Backend checks identity, role, and ownership independently of client navigation.

## Favorite

Traveler chooses destination, culture item, or an already-saved owned trip → create/remove the favorite relation → update UI only after a confirmed write. Favoriting a trip does not create/copy it or confer ownership. Prevent duplicate relation rows; removing a favorite leaves its target intact.

## RAG Q&A

Receive question and optional destination/trip context → retrieve only eligible `INDEXED` and non-`DISABLED` sources → if evidence is sufficient, generate a grounded answer and cite actual sources → otherwise return insufficient verified source without asking the model to invent facts. Keep this state distinct from provider/system error.

Owner-approved panel/global entry extension, 2026-10-22: **Hỏi trợ lý AI** is a single floating layout action available across user pages. Destination detail registers its public ID/name; opening a fresh panel uses that context, otherwise GENERAL. The active chat stays pinned across client navigation and minimize; Chat mới adopts the current page context. A full reload starts fresh. Opening does not ask/model-dispatch. Explicit full-page continuation opens the same confirmed conversation after ask/preference resolution, preserving unsent draft/mode without auto-sending. Discarding unresolved work requires explicit local abandonment, without claiming server cancellation. The main Assistant menu remains full-page; auth/full Assistant routes hide the floating view. See the [global amendment and verification](../implementation/destination-assistant-popup-contract.md). Code and local browser/fixture behavior are implemented; PostgreSQL/live provider acceptance remains separately gated.

## Trip requirement capture

Owner-approved conversational entry, 2026-10-27: the same Assistant on the full page or existing floating entry receives a planning request → authenticates for personal planning → accumulates/reviews needs and resolves mandatory destination names → explicit **Tạo hành trình** → AI selection plus deterministic scheduling/validation → bounded automatic repair or conversational revision → explicit canonical Save. Q&A does not mutate the proposal. Opening history regenerates only on request; a pending confirmed save reconciles its identical operation. See the [implementation story](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md) for verified versus pending acceptance.

Traveler enters a structured form or natural language → AI extracts candidate duration, companions, interests, pace, mode, and constraints → display candidates for review/edit → resolve ambiguous or missing required values → pass confirmed values to the planner. Duration and supported transport are the minimum inputs for a preliminary proposal. Without a specific start date, use Day 1 / Day 2 / ...; require a start date before final confirmation and official save. A proposal without a start date cannot be finally confirmed.

## Itinerary generation and validation

Owner-approved chat-first refinement, 2026-10-27: the Assistant asks one missing need → traveler answers or skips an optional field → Assistant recaps all stated/unknown needs in a message → traveler corrects or confirms naturally → generation/validation. There is no needs form in chat. For add/replace requests the Assistant offers real destination choices, binds the selected action to the current itinerary, revalidates and explains changes; edits affecting another day's timing require explicit acceptance. Rejected/canceled edits preserve the previous plan and restore any reviewed needs before reporting cancellation. Q&A does not change a plan, and saving remains a separate confirmation. Reload requires explicit regeneration; the saved-Trip and separate form-planner flows are unchanged. See [chat-first acceptance](../stories/ASSISTANT-CHAT-FIRST-PLANNING.md).

Planner proposes ordered visits from eligible existing destinations → validate structure → deterministic Validator checks opening hours, minimum visit duration, travel time, and schedule conflicts → report `PASS`, `VIOLATION`, or `INSUFFICIENT_DATA` for each check. Missing required routing data, including a response not received within at most 10 seconds, returns `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`, never `PASS`; AI must not guess travel time. Confirm only if every mandatory check passes and a start date is present.

## Save trip

Validated proposal → Traveler confirms → database write → report `SUCCESS` only after confirmation. Keep invalid proposals temporary, not long-lived saved drafts. “Save trip” creates/maintains the trip; “favorite trip” creates only a favorite relation.

## Edit itinerary

Traveler edits manually or asks AI for a change → keep a candidate separate from the stored itinerary → validate affected constraints again → show outcome → user confirms → database update succeeds → apply candidate. If canceled/rejected or not fully valid, preserve the previous saved itinerary.

## In-trip assistant

When the feature needs location, request GPS permission; if unavailable/denied, allow a specific manual location → consider current position, uncompleted itinerary, remaining time, and new needs → AI proposes changes without altering completed visits → Validator checks → user confirms → persist and apply after write confirmation. Do not track GPS continuously in the background.

## Admin destination, culture, and RAG management

Admin manages destination fields and visibility, culture content/source links, and RAG documents. New destinations start hidden. For new RAG uploads: Admin uploads a private file → the system confirms and stores the `UPLOADED` document without an index job → Admin clicks **Lập chỉ mục** → the existing request-scoped worker creates and processes a job → the document becomes `INDEXED` when a `READY` index is published → Admin checks the original file, source and index result, then explicitly enables public Q&A use. Existing `QUEUED` jobs from the former automatic flow are resumed on the same job. `REVIEWING`/`APPROVED` remain historical statuses. Upload or job admission alone is not index success. Only a ready, indexed, approved and active source may be used for public retrieval; disabling or revoking permission excludes it from future retrieval.

## Write recovery

For applicable writes, `SUCCESS` means confirmed; `FAILED` means known failure; `UNKNOWN` means completion is uncertain. On `UNKNOWN`, keep the input and retry the identical request with the same idempotency key. The server replays a stored success or executes only when no committed record exists. Do not create a second business record because a response was lost.

### Guided optional planning questions — owner follow-up, 2026-10-27

Owner correction after the batch screenshot: after minimum trip inputs → ask the next unanswered optional topic with an example/current-topic quick replies → accept the answer or skip this question → proceed to the next topic → recap → separate confirmation before generation. Volunteered combined answers are retained and their already answered topics are not asked again. A visible “Bỏ qua phần còn lại” skips unknown optional answers without filling defaults. Asking what else to provide stays within planning. Genuine destination QA remains separate and cannot mutate the plan. Minimum-date/save/authorization invariants and the shared full-page/popup flow remain unchanged.

Optional suggestion/skip click → append to the shared composer while retaining the existing draft → add more suggestions or edit freely → explicit Send → process the combined answer. Repeated clicks do not duplicate a suggestion, and filling the composer alone cannot create a turn or advance the current question.

Interest chips merge into a comma-separated sentence. The input grows/shrinks with content to four visible lines, then scrolls internally; inserting a suggestion focuses the end of the draft so the traveler can continue typing.

Current correction: pace/companion suggestion → replace the prior single choice in the input → explicit Send. Choose family/partner/friends/another group without a count → retain that category → ask the count next. The visible skip-remainder control is removed; per-question skip remains.

Completed planning exchange → authenticated atomic dialogue/checkpoint write → acknowledge DB result → reopen/reload → restore text and unfinished needs → continue the missing question. This does not confirm reviewed needs, regenerate a proposal or save a Trip. If a previous proposal's choices expired, ask for regeneration; if its departure date expired, ask a fresh date. Missing acknowledgement retries the same write/key. Deleted/expired conversations erase their planning dialogue/checkpoint through the same lifecycle.

Active proposal response → itinerary card at that exchange → later edit request/AI clarification below the old card → accepted revision response → new itinerary card below. The old card stays intact for comparison. Cancel/failure leaves the existing snapshots; only the current accepted proposal can be saved. Reopening retains text and requires regeneration under the existing proposal lifecycle.

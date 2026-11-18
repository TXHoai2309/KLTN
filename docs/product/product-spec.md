# KLTN product contract

This is a condensed developer-facing contract for the Hà Giang travel assistant. It describes intended MVP behavior, not a claim that each feature already exists in the repository. The source-of-truth requirements are the Product Document and its detailed System Specification; see [source baselines](../source-baselines.md).

## Purpose and MVP scope

Help visitors discover Hà Giang destinations and culture, get source-grounded answers, plan and adjust trips, and receive useful support while traveling. The MVP is responsive web for Hà Giang, with approximately 30–50 destinations and 20–50 reviewed cultural/heritage documents. It supports motorcycle and car trips. A native mobile application, booking/payment, trip collaboration, complex multi-objective route optimization, and mandatory multi-province coverage are out of scope. PWA is optional.

The owner-approved travel-companions extension below is a scoped exception to the original exclusion of trip collaboration: public invitations, member itinerary reads and group chat are approved requirements as of 2026-10-28. Shared trip ownership and collaborative editing remain out of scope. Following explicit coding requests, the backend through TC-11 is implemented locally with contract/tests and Development migration evidence. FE and full vertical/browser acceptance retain separate status in the [implementation inventory](../implementation/trip-companions-implementation-status.md); backend completion does not certify the full UI feature. Planning approval alone does not authorize coding.

## Roles and access

- **Guest:** May use public exploration and public culture Q&A.
- **Traveler:** May use public features and personal favorites, trips, itineraries, and in-trip support.
- **Admin:** Inherits Traveler capabilities for their own account, favorites, trips and planning, and retains destination, culture and RAG administration. This is capability inheritance, never permission to access another user's private resources. Owner-approved RBAC V2 (2026-10-17) supersedes the original non-inheritance rule; see [RBAC V2](../stories/RBAC-V2-admin-inherits-traveler.md).

Public signup creates only a Traveler account. Authorization is enforced on the backend before protected data is returned, changed, or supplied to AI. A known URL or ID grants no access. Private Trip workflows remain owner-scoped, and the MVP does not support shared trip ownership or collaborative editing. The planned extension below adds limited public introductions and explicit member-read capabilities through host publication and membership; it grants neither itinerary editing to members nor an Admin private-data bypass.

Owner-approved Admin User Management V2 (2026-10-17) additionally permits Admins
to view approved account metadata, change another account's role/status and revoke
its sessions through the audited CMS. Locked accounts cannot sign in or use private
capabilities. Self-demotion/lock/revoke and removal of the last active Admin are
blocked. This does not authorize reading another user's Trips, Favorites or AI
history. See [User CMS story](../stories/ADMIN-USER-MANAGEMENT-V2.md).

If a Guest is asked to authenticate from a Traveler-only feature, preserve the prior context when possible and return after authentication. Do not automatically replay the write action; the user must confirm it again.

## Core capabilities and invariants

### Explore destinations and culture

Guests, Travelers, and Admins can discover destinations and culture that are currently public. Destination search/list/map views should reflect the same active filters. Details may show location, opening hours, visit duration, linked culture, and available sources. Hidden/unavailable records must not be shown as public content.

### Favorites and saved trips

Favorites apply to destinations, culture content, and saved trips. Favorite trip is a link to an owned saved trip; it is not trip creation, a copy, or a change of ownership. Removing a favorite does not delete its source record. Do not create duplicate favorites for the same user and target. A now-hidden target may remain in a user's favorites but must be identified as unavailable rather than treated as public content. Update favorite UI only after the write is confirmed.

### Planned travel-companions extension — approved 2026-10-28

**Approved requirements; backend implemented through TC-11, FE continuing.** The owner confirmed Q1–Q17 in the [travel-companions design](../implementation/trip-companions-design.md), then explicitly requested coding and continuous backend delivery. All backend milestones have contracts/test evidence and Development migrations; see [verification and limits](../implementation/trip-companions-backend-verification.md). Existing local FE receipts are preserved separately; no full browser/owner acceptance follows from BE-only evidence. [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28) records the single-owner/live-itinerary boundary.

- A host may publish an invitation from an officially saved Trip. Guests see only the approved introduction, route summary, host display name/avatar, dates, transport and available additional places; detailed times, meeting information, member lists and chat require current membership. Existing private endpoints remain owner-scoped.
- An authenticated eligible account joins immediately if a place is available and recruitment is still open before the Vietnam departure date. Capacity means additional places, excluding the host/existing travel party; each joining account occupies one place. Joining must not oversubscribe or duplicate membership on concurrent writes/retries.
- Only the host edits the itinerary. Members read the latest successfully saved itinerary; date/destination/time changes create a consistent group notice without requiring every member to approve. Existing Validator, confirmation and write semantics continue to govern Trip changes.
- Each Trip has one group chat for text and links. New members can read its full history, disclosed before joining. The initial plan uses in-web unread indicators and polling about every three seconds while the group is open; it has no DM, attachment, voice/call or off-web notification requirement.
- Members may leave, losing private group access and returning their place; their messages remain for the group. A host may remove and bar a member from rejoining. Admin content-reporting tools remain future work and no new Admin private-read privilege is granted.
- Closing recruitment, withdrawing public visibility and canceling the companion trip are distinct. Closing/withdrawing preserves the group; cancellation makes user chat read-only. Completion permits chat indefinitely. Trips that have ever had members retain group/history and use cancellation/withdrawal rather than permanent deletion. Capacity may change but cannot fall below current joined accounts.

These are approved requirements for the complete extension. Backend implementation and staged FE/vertical status are detailed in the implementation inventory; the design contains the full permission matrix, lifecycle details, layout and acceptance scenarios.

### RAG answers

For new Admin uploads, the RAG document lifecycle is `UPLOADED → INDEXED`: after the private file is confirmed, the document waits for Admin to click **Lập chỉ mục**. That action creates one job and runs extraction, chunking, embedding and indexing in the existing bounded HTTP request. `REVIEWING` and `APPROVED` remain historical statuses. Indexing may send Admin-uploaded content to OpenAI before source review, but never before the Admin starts indexing. A new document starts with `publicQaApproved=false`; only Admin may grant public use after checking the original file and source, and only when the index is `READY` and the document is `INDEXED`. `DISABLED` is excluded from new retrieval. Answers about factual local information must be grounded in retrieved eligible sources, and citations must refer to real sources. When there is not enough verified evidence, report insufficient source rather than asking the LLM to invent facts. Keep insufficient-source results distinct from technical AI/service errors. The owner-approved 2026-10-27 manual index trigger supersedes the 2026-10-26 automatic trigger; the earlier removal of manual review and approval steps remains in force.

Owner-approved extension, 2026-10-21 (**implemented across Tickets 01–07, awaiting migration deployment and live acceptance**): Public Q&A will offer an explicit **Mở rộng kiến thức** switch. With the switch off, the source-only rule above continues to apply. With it on, document-first answers may use model knowledge to fill gaps and add relevant Hà Giang travel background or advice, including when documents answer the main question. Model-added content carries a small **Kiến thức mở rộng** label; only document-supported content receives actual source citations. New chats start off; an existing chat remembers its setting when reopened, while past turns retain the mode originally used. Unsupported current prices, hours, event dates and administrative changes remain explicitly unverified rather than being certified from model knowledge. The owner approved a normal two-AI-call path (question understanding before retrieval, then answer composition), replacing the separate assessment/eight-gate verification flow and mandatory facet protocol. Answer length and natural presentation are no longer constrained by the previous 80–120-word/style instructions. The selected model is `gpt-6.1-sol` with medium reasoning. These approved requirements explicitly supersede source exclusivity only for opted-in Q&A and the corresponding old Q&A implementation policies; see the [design record](../implementation/assistant-knowledge-expansion-plan.md) and [ADR-19](../decisions.md#adr-19--opt-in-knowledge-expansion-for-public-qa-2026-10-21). Planner/Constraint Validator, document eligibility, ownership, secrets, actual-reference validation and confirmed-write semantics retain their existing contracts.

Owner-approved model configuration update, 2026-10-28: `gpt-6.1-sol`/medium remains the default public-Q&A model, but Admin may choose another model from the application's supported structured-output list that is visible to the active OpenAI API key. Editorial and preference-extraction models are independently selectable from the same reviewed list. Model selection does not change citation grounding, RAG eligibility, answer validation, privacy, or the embedding model/provenance contract.

### Trip requirements and planning

Accept structured form input and natural-language trip needs. AI may extract duration, companions, interests, pace, transport, and mobility constraints, but show extracted values for user review/edit before the planner uses them. Duration and supported transport are the minimum inputs to create a preliminary proposal. Without a specific start date, the proposal may use Day 1, Day 2, and so on. A start date is required before the itinerary can be confirmed and officially saved; a proposal without one is not eligible for final confirmation. Transport is motorcycle or car; ask for clarification for another or ambiguous mode rather than silently substituting.

The planner can propose an itinerary only from existing, eligible destinations. Each visit needs a destination, trip day, start time, expected duration, and daily ordering. AI proposes; it does not certify validity.

Owner-approved extension, 2026-10-27: the existing Assistant supports reviewing needs, creating a new itinerary, revising its unsaved proposal and explicitly saving from chat. AI selects eligible destination IDs/day/order; deterministic scheduling/routing/Validator remain authoritative. Named must-visit stops are preserved, ambiguity requires clarification, and actionable failures allow at most two automatic repair passes. Q&A can be interleaved. Reopened history requires explicit regeneration; only a freshly validated and explicitly confirmed save intent may retain its exact request temporarily for UNKNOWN reconciliation, never an invalid/unconfirmed itinerary draft. Saved-trip editing continues through the existing Trip workflow. See the [story and acceptance limits](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md).

Owner-approved conversational refinement, 2026-10-27 (Q1–Q7): inside the Assistant, replace the automatically opened needs form with one missing question at a time and a detailed needs recap in chat. Natural confirmation reviews the recap and starts generation. Add/replace requests without a named new point proactively offer up to three real eligible options, selectable by number, name or button. Explicitly removed points stay excluded until the traveler asks to include them again; newly stated must-visits remain mandatory. Selected-point edits preserve unrelated days, with separate acceptance if cross-day transfers change another day's arrival times. Cancellation restores prior needs, including any persisted needs review; uncertain rollback retries use the identical request/key. Save is a distinct confirmed action. The separate form planner and saved-Trip editing workflow retain their scope. See the [chat-first story](../stories/ASSISTANT-CHAT-FIRST-PLANNING.md) and [approved decisions](../implementation/assistant-chat-first-planning-design.md).

### Deterministic Constraint Validator

Every itinerary proposal must be checked for:

1. Opening hours.
2. Minimum visit duration.
3. Travel time between stops.
4. Schedule conflicts.

Each check returns `PASS` / `ĐÁP ỨNG`, `VIOLATION` / `VI PHẠM`, or `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`. `INSUFFICIENT_DATA` is never a pass. The Validator is deterministic: the same input, data, and reference time yields the same result. AI cannot fill missing required data or decide the Validator outcome. Confirm an itinerary only when all mandatory checks pass.

The US-29B provider decision uses Stadia Standard Routing: car → `auto`, motorcycle → `motorcycle`. If mandatory route data is missing, unavailable, or not returned within at most 10 seconds, the travel-time check returns `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`, never `PASS`. AI must not guess travel time in place of required routing data.

### Edit, save, and in-trip support

Keep an edit proposal separate from the stored itinerary until it passes validation, the Traveler confirms it, and the database update succeeds. Revalidate affected checks after a change. Cancel/reject keeps the previous itinerary. The MVP does not persist an invalid itinerary as a long-lived draft; an unconfirmed proposal may remain in the active interaction.

Save a trip only after the proposal meets confirmation requirements and the write is confirmed. Editing or saving is separate from favoriting. In-trip support uses GPS only when needed and permitted; offer manual location when GPS is unavailable/denied. Do not track location continuously in the background or retain long-term GPS history. Do not let AI silently change completed visits. In-trip proposals still require validation and user confirmation.

### Admin content

Admin workflows cover destination data (including distinct suggested and minimum visit duration), culture content and sources, and RAG documents. New destinations start hidden. Uploading or queuing a document does not make it retrieval-ready; indexing must finish successfully, and public Q&A use requires separate Admin approval after source review. Hiding content must not silently delete historical records.

## Write semantics and recovery

Writes are `SUCCESS`, `FAILED`, or `UNKNOWN`:

- `SUCCESS`: the database write is confirmed.
- `FAILED`: the system knows the write failed.
- `UNKNOWN`: completion cannot be determined, for example after a lost response.

Never display a successful save before confirmation. Retry an `UNKNOWN` operation with the same idempotency key and identical request; do not create duplicate trips, favorites, or repeated business writes. Preserve user-entered input when possible, but do not call it saved.

The current shared implementation persists successful results in `idempotency_record` without TTL/cleanup; account, Destination, and Culture writes reuse it. See [technical architecture](../architecture/technical-architecture.md).

## Non-functional and research requirements

- Business dates/times use `Asia/Ho_Chi_Minh` consistently.
- Responsive web is mandatory on mobile and desktop. At widths of 360 px and above, main content should not require horizontal scrolling. PWA is optional.
- Keep enough experiment/operation data to evaluate RQ1 and RQ2. RQ1 compares language-model-only answers with RAG answers, including accuracy, relevance, citation accuracy, and unsupported-information rate. RQ2 compares direct LLM itinerary generation with generation plus constraint checking; report initial and post-adjustment quality, include all test requests in the success denominator, distinguish insufficient-data and no-itinerary cases, and record adjustment attempts.
- Do not let a feature's technical failure make unrelated non-AI features unavailable when they can still operate.

## Acceptance principle

Acceptance comes from the story's cited Product/System criteria and observable evidence. A missing-data state is not success, AI output is not validation, and a write is not successful until its status is confirmed. Do not add acceptance rules from Figma or implementation convenience.

## Source references

Primary references in **Product document.docx** include Sections 3.5 (RQ1/RQ2), 4 (roles), 5 (scope/data), 7 (product flows), 10 (AI), 11 (business rules), 12 (non-functional requirements), and 13 (acceptance). **System Specification.docx** details roles (2), favorites (4), RAG (5), trip input/planning/validation (6–9), in-trip (10), admin (11–12), writes/errors (13), and non-functional requirements (14). Story-specific contracts must cite the precise subsections they use.

### Guided optional questions — owner correction, 2026-10-27

The owner clarified after seeing the batch presentation: cover all optional needs, asking one question per turn. After minimum inputs, ask experiences, pace, companions/count, mobility and destination wishes in sequence, with examples and quick replies only for the current topic. Retain volunteered combined answers and skip already answered topics. “Bỏ qua câu này” skips only the current topic; “Bỏ qua phần còn lại” explicitly completes the remaining optional stage. These remain optional; no new validation requirement, permission or saved-Trip behavior is introduced. The earlier batch presentation is superseded. See the current dialogue story and guided-question verification.

Subsequent owner clarification: optional suggestion/skip chips fill the composer, preserving typed content and allowing multiple suggestions plus free text. They do not submit or advance the dialogue until the traveler explicitly presses Send.

Interest choices combine into one sentence such as “Mình thích trải nghiệm thiên nhiên, văn hóa”. The composer grows/shrinks to fit typed or wrapped content, with a four-line visible limit and internal scrolling beyond that limit.

Current screenshot correction: pace and companion categories are single choices; selecting another replaces the previous suggested value while preserving other text. The optional stage offers only a per-question skip button. A companion category without a count (or count without a category) remains an unfinished optional answer and prompts for the missing part; no family size is assumed.

The recurring account-history loss follow-up adds persisted completed planning dialogue and an unreviewed needs checkpoint, separate from reviewed planner needs and official Trip Save. Reopening keeps text and continues incomplete questions, while old proposals/options need explicit regeneration. The account conversation's existing ownership, deletion and expiry govern this data. Guest scope and the prohibition on retaining invalid/unconfirmed itinerary schedules are unchanged. See the current dialogue story and follow-up verification.

The active conversation preserves the chronological position and original contents of accepted itinerary cards. Edit requests and AI replies follow the previous card; an accepted revision appends a new card below its reply. Earlier cards are for comparison, with Save available only on the current proposal. This does not introduce durable storage of itinerary proposal snapshots.

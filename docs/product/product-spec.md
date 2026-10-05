# KLTN product contract

This is a condensed developer-facing contract for the Hà Giang travel assistant. It describes intended MVP behavior, not a claim that each feature already exists in the repository. The source-of-truth requirements are the Product Document and its detailed System Specification; see [source baselines](../source-baselines.md).

## Purpose and MVP scope

Help visitors discover Hà Giang destinations and culture, get source-grounded answers, plan and adjust trips, and receive useful support while traveling. The MVP is responsive web for Hà Giang, with approximately 30–50 destinations and 20–50 reviewed cultural/heritage documents. It supports motorcycle and car trips. A native mobile application, booking/payment, trip collaboration, complex multi-objective route optimization, and mandatory multi-province coverage are out of scope. PWA is optional.

## Roles and access

- **Guest:** May use public exploration and public culture Q&A.
- **Traveler:** May use public features and personal favorites, trips, itineraries, and in-trip support.
- **Admin:** May use public features and administer destination, culture, and RAG content. Admin does not automatically receive Traveler permissions or access to private Traveler trips.

Public signup creates only a Traveler account. Authorization is enforced on the backend before protected data is returned, changed, or supplied to AI. A known URL or ID grants no access. A Traveler may access and edit only their own trips. The MVP does not support shared trip ownership or collaborative editing.

If a Guest is asked to authenticate from a Traveler-only feature, preserve the prior context when possible and return after authentication. Do not automatically replay the write action; the user must confirm it again.

## Core capabilities and invariants

### Explore destinations and culture

Guests, Travelers, and Admins can discover destinations and culture that are currently public. Destination search/list/map views should reflect the same active filters. Details may show location, opening hours, visit duration, linked culture, and available sources. Hidden/unavailable records must not be shown as public content.

### Favorites and saved trips

Favorites apply to destinations, culture content, and saved trips. Favorite trip is a link to an owned saved trip; it is not trip creation, a copy, or a change of ownership. Removing a favorite does not delete its source record. Do not create duplicate favorites for the same user and target. A now-hidden target may remain in a user's favorites but must be identified as unavailable rather than treated as public content. Update favorite UI only after the write is confirmed.

### RAG answers

The RAG document lifecycle is `UPLOADED → REVIEWING → APPROVED → INDEXED`, with `DISABLED` excluded from new retrieval. Only `INDEXED` documents are eligible for retrieval. Answers about factual local information must be grounded in retrieved eligible sources, and citations must refer to real sources. When there is not enough verified evidence, report insufficient source rather than asking the LLM to invent facts. Keep insufficient-source results distinct from technical AI/service errors.

### Trip requirements and planning

Accept structured form input and natural-language trip needs. AI may extract duration, companions, interests, pace, transport, and mobility constraints, but show extracted values for user review/edit before the planner uses them. Duration and supported transport are the minimum inputs to create a preliminary proposal. Without a specific start date, the proposal may use Day 1, Day 2, and so on. A start date is required before the itinerary can be confirmed and officially saved; a proposal without one is not eligible for final confirmation. Transport is motorcycle or car; ask for clarification for another or ambiguous mode rather than silently substituting.

The planner can propose an itinerary only from existing, eligible destinations. Each visit needs a destination, trip day, start time, expected duration, and daily ordering. AI proposes; it does not certify validity.

### Deterministic Constraint Validator

Every itinerary proposal must be checked for:

1. Opening hours.
2. Minimum visit duration.
3. Travel time between stops.
4. Schedule conflicts.

Each check returns `PASS` / `ĐÁP ỨNG`, `VIOLATION` / `VI PHẠM`, or `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`. `INSUFFICIENT_DATA` is never a pass. The Validator is deterministic: the same input, data, and reference time yields the same result. AI cannot fill missing required data or decide the Validator outcome. Confirm an itinerary only when all mandatory checks pass.

Google Routes travel modes are `DRIVE` and `TWO_WHEELER`. If mandatory route data is missing, unavailable, or not returned within at most 10 seconds, the travel-time check returns `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`, never `PASS`. AI must not guess travel time in place of required routing data.

### Edit, save, and in-trip support

Keep an edit proposal separate from the stored itinerary until it passes validation, the Traveler confirms it, and the database update succeeds. Revalidate affected checks after a change. Cancel/reject keeps the previous itinerary. The MVP does not persist an invalid itinerary as a long-lived draft; an unconfirmed proposal may remain in the active interaction.

Save a trip only after the proposal meets confirmation requirements and the write is confirmed. Editing or saving is separate from favoriting. In-trip support uses GPS only when needed and permitted; offer manual location when GPS is unavailable/denied. Do not track location continuously in the background or retain long-term GPS history. Do not let AI silently change completed visits. In-trip proposals still require validation and user confirmation.

### Admin content

Admin workflows cover destination data (including distinct suggested and minimum visit duration), culture content and sources, and RAG documents. New destinations start hidden. Uploading or approving a document does not make it retrieval-ready; indexing must finish successfully. Hiding content must not silently delete historical records.

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

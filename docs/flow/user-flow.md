# User flows

These flows condense the Product Document and System Specification. They describe target behavior; each story records its runtime acceptance evidence. The repository currently implements Home, public Destination/Culture summaries, Explore List/Map and Destination detail alongside auth/account/admin foundations. Search/filter, full Culture detail, Trip, Favorite, and AI flows still await their stories. See [current implementation](../architecture/technical-architecture.md).

## Public exploration

Guest, Traveler, or Admin enters public discovery → searches/filters destinations → browses consistent list/map results → opens an available destination or culture item → may open contextual Q&A. Hidden/unavailable content must not be presented as public. Figma controls layout only after it has been consulted.

## Auth transition

Guest starts a Traveler-only action → retain the originating context → sign in or register → registration yields `TRAVELER` only → return to the prior context when possible → ask the user to initiate/confirm the write. Do not automatically replay a pre-auth write. Backend checks identity, role, and ownership independently of client navigation.

## Favorite

Traveler chooses destination, culture item, or an already-saved owned trip → create/remove the favorite relation → update UI only after a confirmed write. Favoriting a trip does not create/copy it or confer ownership. Prevent duplicate relation rows; removing a favorite leaves its target intact.

## RAG Q&A

Receive question and optional destination/trip context → retrieve only eligible `INDEXED` and non-`DISABLED` sources → if evidence is sufficient, generate a grounded answer and cite actual sources → otherwise return insufficient verified source without asking the model to invent facts. Keep this state distinct from provider/system error.

## Trip requirement capture

Traveler enters a structured form or natural language → AI extracts candidate duration, companions, interests, pace, mode, and constraints → display candidates for review/edit → resolve ambiguous or missing required values → pass confirmed values to the planner. Duration and supported transport are the minimum inputs for a preliminary proposal. Without a specific start date, use Day 1 / Day 2 / ...; require a start date before final confirmation and official save. A proposal without a start date cannot be finally confirmed.

## Itinerary generation and validation

Planner proposes ordered visits from eligible existing destinations → validate structure → deterministic Validator checks opening hours, minimum visit duration, travel time, and schedule conflicts → report `PASS`, `VIOLATION`, or `INSUFFICIENT_DATA` for each check. Missing required routing data, including a response not received within at most 10 seconds, returns `INSUFFICIENT_DATA` / `CHƯA ĐỦ DỮ LIỆU`, never `PASS`; AI must not guess travel time. Confirm only if every mandatory check passes and a start date is present.

## Save trip

Validated proposal → Traveler confirms → database write → report `SUCCESS` only after confirmation. Keep invalid proposals temporary, not long-lived saved drafts. “Save trip” creates/maintains the trip; “favorite trip” creates only a favorite relation.

## Edit itinerary

Traveler edits manually or asks AI for a change → keep a candidate separate from the stored itinerary → validate affected constraints again → show outcome → user confirms → database update succeeds → apply candidate. If canceled/rejected or not fully valid, preserve the previous saved itinerary.

## In-trip assistant

When the feature needs location, request GPS permission; if unavailable/denied, allow a specific manual location → consider current position, uncompleted itinerary, remaining time, and new needs → AI proposes changes without altering completed visits → Validator checks → user confirms → persist and apply after write confirmation. Do not track GPS continuously in the background.

## Admin destination, culture, and RAG management

Admin manages destination fields and visibility, culture content/source links, and RAG documents. New destinations start hidden. RAG lifecycle is `UPLOADED → REVIEWING → APPROVED → INDEXED`; only successfully indexed sources are retrieval eligible. Disable excludes a document from future retrieval; upload/approval alone is not index success.

## Write recovery

For applicable writes, `SUCCESS` means confirmed; `FAILED` means known failure; `UNKNOWN` means completion is uncertain. On `UNKNOWN`, keep the input and retry the identical request with the same idempotency key. The server replays a stored success or executes only when no committed record exists. Do not create a second business record because a response was lost.

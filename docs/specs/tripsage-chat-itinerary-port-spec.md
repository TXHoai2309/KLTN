# Spec: tripsage-style chat and agent for itinerary planning

Status: DRAFT, not approved, not published to an issue tracker (no tracker or triage-label config was provided). Source decisions: [story](../stories/TRIPSAGE-CHAT-ITINERARY-PORT.md), ADR-36 in [decisions.md](../decisions.md), [research note](../research/tripsage-itinerary-port.md). Nothing here authorizes code, migration or dependency changes until the owner approves the story and ADR-36.

## Problem Statement

A signed-in Traveler planning a Ha Giang trip today uses a form flow or the Assistant V2 chat. The AI only proposes from the KLTN destination database. The owner wants the richer tripsage-ai experience: a streaming chat whose agent can research places from Google and the web, then propose an itinerary the Traveler can review and save. The tripsage chat is a thin tool loop with no scheduler, no Constraint Validator and no SUCCESS/FAILED/UNKNOWN write contract, so it cannot simply be dropped in.

## Solution

Add a tripsage-style streaming planning chat for signed-in Travelers, behind a feature flag, while the current flows stay in place. The agent researches with a fixed set of tools, proposes a structured selection, and KLTN's deterministic scheduler and Constraint Validator turn it into a checked itinerary. The Traveler sees streamed progress and prose in Vietnamese, reviews the rendered itinerary, and saves through the existing idempotent save contract. Places found outside the KLTN destination table are stored as external places. Itineraries with unchecked items can be saved only after explicit confirmation and are stored as unchecked; any failed check blocks saving.

## User Stories

1. As a signed-in Traveler, I want to describe my trip in a chat, so that I can plan without filling a long form.
2. As a Traveler, I want the chat to ask me for missing required details (transport, duration, interests), so that the plan fits my trip.
3. As a Traveler, I want to choose motorcycle or car, so that routing and timing match how I travel.
4. As a Traveler, I want trip length between 1 and 14 days, so that the plan stays valid.
5. As a Traveler, I want to pick interests from the supported set, so that suggestions match my taste.
6. As a Traveler, I want to see step-by-step progress while the agent works, so that I know it has not stalled.
7. As a Traveler, I want the assistant's wording in Vietnamese, so that I can read it naturally.
8. As a Traveler, I want place names to match the KLTN database where they exist, so that names are consistent.
9. As a Traveler, I want the agent to search Google Places for places not in the database, so that I get richer options.
10. As a Traveler, I want the agent to use web search and page extraction for current information, so that advice is up to date.
11. As a Traveler, I want a proposed itinerary rendered as a day-by-day timeline and map, so that I can judge it quickly.
12. As a Traveler, I want travel times between stops computed by a routing provider, so that the schedule is realistic.
13. As a Traveler, I want to see each validation check as passed, failed or unchecked, so that I know how reliable the plan is.
14. As a Traveler, I want a plan with a failed check to be refused for saving, so that I never save an invalid itinerary.
15. As a Traveler, I want a plan with only unchecked items to be savable after I confirm, so that missing data does not block me.
16. As a Traveler, I want the confirmation to name exactly which items are unchecked, so that I decide knowingly.
17. As a Traveler, I want saved trips to show which checks were unchecked, so that I remember what to verify.
18. As a Traveler, I want "unchecked" never shown as "passed", so that I am not misled.
19. As a Traveler, I want to retry a save that ended UNKNOWN with the same request, so that I do not create duplicates.
20. As a Traveler, I want no success message until the database confirms the save, so that I can trust it.
21. As a Traveler, I want an interrupted stream not to count as saved, so that nothing is saved by accident.
22. As a Traveler, I want a clear unavailable message when a provider is down or a key is missing, so that I know to retry later.
23. As a Traveler, I want the chat to stop within a bounded time and number of steps, so that it does not hang or run up cost.
24. As a Traveler, I want to be told when the agent hit a limit and what was produced, so that I can continue or adjust.
25. As a Traveler, I want my chat history to be visible only to me, so that my plans stay private.
26. As a Traveler, I want to keep using the existing form and Assistant V2 when the new chat is off, so that nothing breaks for me.
27. As a Traveler, I want external places in a saved trip to remain valid links, so that I can reopen the trip later.
28. As a Guest, I want the chat to stay Q&A-only, so that planning data is never created for an unauthenticated visitor.
29. As an Admin, I want to use planning for my own resources as a Traveler under the shared role rules, so that I can test the flow.
30. As the project owner, I want the new flow behind a feature flag, so that I can roll back by turning it off.
31. As the project owner, I want the old planning flow kept in code until I remove it, so that rollback is cheap.
32. As the project owner, I want an explicit tool allow-list with a test, so that no unapproved tool can run.
33. As the project owner, I want web and scraped content treated as data, never instructions, so that a malicious page cannot steer the agent.
34. As the project owner, I want agent output validated against a schema and the Constraint Validator before display or save, so that AI never decides validity.
35. As the project owner, I want provider keys kept server-side and absent from bundles, logs and responses, so that secrets are not exposed.
36. As the project owner, I want per-turn caps on steps, time and provider calls, so that cost and latency are bounded.
37. As the project owner, I want the existing rate and concurrency admission applied to the new chat, so that abuse limits are not bypassed.
38. As the project owner, I want Google routing selectable by configuration with Stadia as default, so that I can switch providers without changing the agent.
39. As the project owner, I want the OpenAI key and its byte/token limits and no-store setting reused, so that privacy and cost controls are preserved.
40. As the project owner, I want the MIT notice for copied tripsage code kept in the repo, so that the license is respected.
41. As a developer, I want the schema change delivered as a Prisma migration applied to Development first, so that data changes are controlled.
42. As a developer, I want a baseline of currently failing tests recorded before changes, so that old failures are not blamed on the port.
43. As a developer, I want a documented list of every invariant this port changes, so that reviewers see exactly what moved.

## Implementation Decisions

- **Scope of replacement.** The chat UI, streaming route and tool-loop agent are replaced; scheduling, validation, routing adapters and the save service are reused as the bridge. The existing planning endpoint stays unchanged because in-trip planning, destination Q&A and reconcile also use it; the new chat gets its own streaming route.
- **Flag and rollback.** A server-controlled flag chooses the new chat or the old flows for signed-in Travelers. Turning it off restores current behavior. The old flows and the files that source-reading tests depend on stay in place.
- **Agent contract.** The agent's only planning output is a structured selection of days and places. A bridge tool converts it, through the existing scheduler and Validator, into the planner result, which is sent to the UI as a data part. The agent never emits the final itinerary as free text.
- **Tool allow-list.** Fixed set: read KLTN destinations, propose itinerary, routing, Google Places/Maps, web search, page extraction. Amadeus is excluded. Any other tool is rejected, with a test.
- **Untrusted content.** Web and extraction results are passed to the agent as data. The agent's output cannot trigger tools outside the allow-list or skip the schema and Validator.
- **Validator and Save gate.** Validator stays deterministic and separate from AI. Missing data yields "unchecked", never PASS. A failed check blocks save. Unchecked-only plans can be saved after explicit confirmation naming the unchecked items, and the Trip stores them as unchecked. This changes the current Save contract and needs a designed field and migration.
- **External places.** A new table stores places from outside the KLTN destination table with provider, provider place id, name, coordinates, source and fetch time. Each itinerary visit references exactly one of a KLTN destination or an external place, enforced in the database. Only the provider place id and minimal fields are stored; raw provider content is refetched when needed, subject to verifying Google's storage terms.
- **Write semantics.** Saving is a separate JSON request using the shared idempotent write path with SUCCESS/FAILED/UNKNOWN and an idempotency key; retry UNKNOWN with the identical payload and key. The stream carries no idempotency and an interrupted stream is never a save.
- **Streaming.** Only progress and conversational prose stream. Final results follow the existing contract.
- **Routing providers.** Routing goes through an adapter. Stadia is default; a Google adapter is selected by configuration. Provider keys are server-only.
- **OpenAI access.** The agent SDK is wrapped by a custom provider so the key still comes from the runtime configuration and the byte/token limits and no-store setting remain.
- **Admission and limits.** The new route applies the existing planning admission (8 requests per minute, 3 concurrent). Per turn: at most 8 steps and 60 seconds, plus caps on Places, Routes, search and extraction calls, within the route's maximum duration.
- **Language.** Prompts, UI strings and output are Vietnamese; place names follow the database.
- **Auth and ownership.** Signed-in Travelers only (Admin through the shared role rule); guests stay Q&A-only. Chat sessions and saved data are scoped to the owner on the server.
- **Dependencies.** Add the AI SDK core, React hooks and OpenAI provider packages; verify version compatibility with the pinned tripsage version before adopting.
- **Licensing.** Copy then adapt tripsage code under MIT, keeping the notice in a repo notice file.
- **Rendering.** Reuse KLTN's itinerary map and planner presentation rather than tripsage's timeline.
- **Baseline.** Known gap: the no-journey scheduling branch is marked not eligible for final confirmation; for now such plans are shown but not saved, and that branch is not edited in this spec.

## Testing Decisions

- **What makes a good test.** Assert external behavior only: what the Traveler sees in the stream and UI, what the HTTP responses and statuses are, and what is in the database after a save. Do not assert prompt text, internal step order or private functions.
- **Single seam (proposed, needs owner confirmation).** The highest seam is the chat turn boundary: a signed-in request to the new streaming route, observed as the streamed messages and the itinerary data part, followed by the separate JSON save request, with the database as the observable store. External providers (OpenAI, Google, web search, extraction, routing) are faked at the outermost edge. Real database for save and migration behavior.
- **Behaviors covered at that seam.** Flag off keeps old behavior; required-details questions; Vietnamese streaming; allow-list rejection of other tools; untrusted content cannot trigger tools; step/time/call caps; admission limits; failed check refuses save; unchecked-only requires confirmation and is stored as unchecked; UNKNOWN retry with identical payload and key creates no duplicate; interrupted stream saves nothing; external place linked by exactly one reference; secrets absent from responses and logs.
- **Database tests.** Opt-in PostgreSQL tests for the migration and the one-reference constraint, run on Development.
- **Prior art.** Existing planning route, planning-service and save-contract tests; the opt-in PostgreSQL suites already used for the origin and journey migrations; the source-reading tests for the form, which must stay green.
- **Baseline.** Record the currently failing Vitest tests before any change.

## Out of Scope

- Amadeus flights and hotels, Stripe, long-term memory, trip collaborators, Supabase/Redis/BYOK from tripsage.
- Removing the old planning flow; Production migration; changing the existing planning endpoint in place.
- Editing the no-journey scheduling branch.
- Guest planning.

## Further Notes

- Unverified: Google Maps Platform terms on storing Places data; scraping terms for extraction and search; compatibility of the AI SDK version; real structure of the visit table; the full save service.
- Invariants this port changes, for review: place source beyond the destination table, added routing provider, added dependencies and providers, and the Save gate for unchecked items.
- The sequence is: owner approval, baseline, Development migration, adapters and allow-list, route and UI behind the flag, bridge to scheduler/Validator/Save, evidence.
- No issue tracker was configured, so this spec lives in the repo until `/setup-matt-pocock-skills` is run and it is published with `ready-for-agent`.

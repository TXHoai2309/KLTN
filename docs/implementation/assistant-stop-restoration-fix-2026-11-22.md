# Assistant stop UI and saved conversation render loop

Date: 2026-11-22. Local fixes; no commit or deployment.

## Stop UI

The busy branch rendered a plain type=button while composer CSS targeted type=submit only. Reused the shared destructive Button and existing stop handler, added Square icon and scoped destructive-token styles, keyboard focus, hover/active feedback and reduced-motion handling. Mobile target is 44px. Removed the keyboard hint restored by the master merge, preserving the earlier UI request.

Local browser: submitted one test question in a new conversation, observed the red stop action, stopped processing, then typed again and observed enabled Send with the updated counter. The original saved conversation was not modified. Desktop/dark visual and all provider error/completion paths were not exhaustively exercised.

## Restoration loop

latestItinerary parsed schema data on every render. Parsing returns a fresh object. The lodging sync effect depends on that object and calls setChosenLodgings with another fresh object, causing another render and repeating the cycle for valid itinerary messages. Q&A without an itinerary does not trigger this cycle. The URL/hydration effects were not the source of this demonstrated loop.

Memoizing the parsed itinerary by messages and lastItineraryMessageId preserves reference identity during local state renders. No dependency removal, navigation-guard bypass or controller rewrite.

Regression executes the actual derived-state/effect block with React dependency/Object.is semantics: before the fix the itinerary case exceeded 20 renders; after the fix both itinerary and Q&A settle. It also checks equivalent data and conversation changes while preserving lodging state. This is a hook harness, not a DOM renderer.

Browser on localhost:3010: direct URL and refresh loaded an existing itinerary conversation without sending a new message. Mobile menu navigation reached Home, Explore, Trips and Favorites. Returning to the original conversation retained its history. Full desktop/sidebar switching, every conversation type, console capture and production remain NOT PROVEN; do not infer this is the only possible navigation failure.

## Verification

- Focused Vitest command (components/tripsage-chat, assistant-one-chat, tripsage-timeline-fixes, tripsage-web): 14 files / 75 tests PASS.
- npm run check-types (apps/web): PASS.
- npm run build (root): compiled, TypeScript and 59 pages generated; two existing dynamic filesystem tracing warnings in tripsage-price-reference.ts.
- Full suite not rerun; no claim about existing unrelated AI/planning failures.
- No lint script defined; no new dependency, schema/API/provider/auth change.

# Planning FE wrapping and chronological cards — 2026-10-27

Owner reports two FE defects: the companion-button group crosses its curved border when wrapped, and itinerary revision replies appear above the old card instead of below it. Implemented within the existing Assistant page/popup owners; no schema/API/provider changes.

## Changes

The suggestion wrapper used a capsule radius regardless of the number of rows, with narrow inset padding; fixed-height, nowrap buttons also could not accommodate long choices. It now uses border-box sizing, a bounded 22px corner radius and inset padding. Choice buttons wrap text and grow vertically. Existing themes, focus, disabled state and explicit Send semantics are reused.

The itinerary had been rendered once after all messages inside the control panel. `acceptProposal` now attaches a cloned, transient proposal snapshot to the response that created it. `PlanningExchange` renders that snapshot through the shared `PlanningProposalCard`. Both full page and floating chat pass the real client/availability boundary; there is no second always-bottom card. Subsequent messages appear below the existing card, and each accepted revision adds another card after its own response.

Previous cards retain their original stops/times/checks and are labelled “Phiên bản trước”. They have no Save control. The current card retains the existing validation/save gate, and its handler checks that it still matches the current proposal before invoking Save. Canceled/failed edits do not create an accepted snapshot. Existing map details/toggles remain scoped to each card.

These snapshots are active-session UI data. The existing checkpoint projection still serializes only question/reply/QA-boundary metadata and unreviewed needs, not the attached proposal. Reopen clears proposal snapshots and retains conversation text; canonical regeneration/Save and the prohibition on durable invalid-itinerary drafts are unchanged.

## Evidence

- A regression through the actual planning client and server-rendered shared panel initially failed: “Điểm a” appeared after the later edit text. After the change it verifies first card → edit exchange → revised response → second card, original contents, one Save action and snapshot expiry on history reopen.
- Added cancellation/failure preservation and a real checkpoint-payload regression confirming proposal IDs/arrival times never enter durable dialogue writes. Final focused panel/history/chat-flow run: **3 files / 30 tests PASS**.
- Related Assistant/planning run before those last two test additions: **34 files / 306 tests PASS**, eight opt-in skips. Web typecheck **PASS**. Isolated production build **PASS, exit 0**, including TypeScript and 48 pages. No model or database smoke rerun is needed for this FE-only correction.
- Browser availability returned this turn. The user's local app was initially stopped (`3010` refused connection); the existing dev command was restarted on its configured port. An isolated page at `127.0.0.1:3015` bundles the actual `PlanningPanel`, `PlanningClient`, renderer and CSS, with controlled synthetic transport/scheduler data and no DB/provider writes.
- The fixture reproduces the old border defect with the pre-change stylesheet. With current CSS, screenshots and DOM bounds verify desktop and 360px layout; all six companion choices stay inside the group. At the narrow check `clientWidth === scrollWidth === 302`; the itinerary page likewise has no horizontal document overflow. Light/dark wrapping was visually checked.
- Actual UI clicks create the first proposal, request a change and accept it. Browser DOM/screenshot confirms old card (Điểm a, no Save) → edit/confirmation exchanges → new card (Điểm b, exactly one Save). Captures: `.cache/assistant-wrapped-choices.png`, `.cache/assistant-wrapped-choices-mobile.png`, `.cache/assistant-chronological-cards.png`. These show a controlled component fixture, not the user's authenticated conversation or production data. Temporary viewport override was reset.
- Planning-panel taste lint: **0 failures**, one existing clock-format warning. Whitespace/scope/secret checks pass. No commit/push/merge/deployment or database/schema/dependency change; unrelated existing work is preserved.

The synthetic browser fixture proves component layout and ordering. Authenticated full-app interaction, live-provider edit quality and production map authentication remain separate acceptance areas; this task does not claim them.

# Guided optional planning questions — verification, 2026-10-27

Owner request: show all remaining questions with guidance because travelers do not know what to provide. Screenshots also show interest-only recap and “không cần lưu ý gì hả” incorrectly routed to destination QA. This amends the optional-question presentation in the [current story](../stories/ASSISTANT-DIALOGUE-NATURALNESS.md), without adding required business fields.

## Current correction: combined interests and a four-line composer

Owner reports Thiên nhiên → Văn hóa appears to retain only the first choice, and explicitly requests natural combined text plus automatic height with a line limit. The previous implementation inserted separate newline-delimited sentences while the textarea had a fixed one-line height. The updated actual page/popup regressions initially reproduced that wrong text; the four-line-cap expectation also failed against the intermediate 96px cap.

Interest chips now compose “Mình thích trải nghiệm thiên nhiên, văn hóa” in one sentence, preserving other typed lines and avoiding duplicates. All current-topic choices remain usable before explicit Send. A shared draft helper also determines whether a choice is already present for its accessible label. Other optional suggestions/skip chips retain their fill-before-send behavior.

The composer measures actual content on every draft change, grows/shrinks to a maximum of four computed text lines plus vertical padding, then uses internal scrolling. A width observer remeasures wrapping when available space changes. After a suggestion, focus/caret are placed at the end after the controlled value updates. The existing page/popup composer is the single owner; no new visual system or persistence is added.

Current evidence:

- Actual component-handler tests cover two selections without rerender, compound text, no duplicates, existing/free typed additions, explicit combined request, available/pending states and selected-choice labels. Their committed input/effect harness covers measured growth, four-line cap, shrink and caret/focus in both page and popup.
- Related Assistant/current guided-preferences suite: **23 files / 234 tests PASS**. Web typecheck **PASS**. Isolated production build (`KLTN_PERF_BUILD=1 npm run build -w web`) **PASS, exit 0**, including TypeScript and 48 generated pages. Whitespace/scope/secret/debug checks **PASS**.
- The running `http://localhost:3010/assistant` returned **200**; its 23 referenced JS assets include the new suggestion helper and four-line sizing code. This verifies current assets are being served, not successful browser hydration or visual acceptance.
- Browser inventory again reports use disabled in Work settings. Real browser/mobile wrapping, selection and touch acceptance remain open. These handler/effect tests do not substitute for pixel-based verification.
- Taste lint on both changed components reports five existing emoji/icon findings in unchanged Assistant controls, plus an existing clock-padding warning and em-dash warning. Those unrelated controls were retained; this is not a clean whole-file lint claim. No new API/provider/schema/migration/dependency changes or live AI/DB calls.

## Previous interaction: suggestions fill the composer (line grouping superseded)

Owner's next screenshot request: clicking the optional-interest chips should fill the input so travelers can select several suggestions and add free text. Optional suggestion and skip chips now call the existing shared composer's fill handler, without an API request, transcript entry or question advance. Each new suggestion is appended on a new line, preserving the latest typed draft; repeated clicks do not duplicate it. The composer receives focus, and a short hint explains explicit Send. Existing generation/Save and itinerary choice actions retain their semantics.

Evidence for this follow-up:

- Two actual `AssistantChat`/`PlanningPanel` handler regressions initially failed on page/popup because clicks still sent immediately; both now pass. They cover multiple clicks before rerender, duplicate prevention, typed additions, explicit combined ANALYZE payload, skip chips, pending/unavailable guards and preserving a newer draft while the response completes.
- `npx vitest run src/components/assistant src/modules/assistant-planning/planning-guided-preferences.vitest.test.ts` — **23 files / 234 tests PASS**.
- `npm run check-types -w web` — **PASS**. `KLTN_PERF_BUILD=1 npm run build -w web` — **PASS, exit 0**, including TypeScript and 48 generated pages.
- Component taste lint — **0 failures**, one existing clock-padding warning. Whitespace and scope/secret checks pass. No AI/provider/API/database/schema/migration/dependency changes; no live-model rerun is needed for composer-only behavior.
- Browser inventory still reports local browser use disabled in Work settings. Handler tests establish composition logic, but do not establish real-browser focus, touch, wrapping or visual acceptance. With browser access, start an optional-interest question, type a note, click Thiên nhiên/Văn hóa twice, edit, and verify only explicit Send advances the question in both page and popup at desktop/mobile widths.
- The additional premium audit script could not run because its previously installed plugin path is no longer present; no new premium-audit pass is claimed.

## Previous correction: one question per turn (retained)

The owner clarified the batch screenshot with “những cái này nên hỏi từng câu 1 thôi á”. The Assistant now asks only the first unanswered optional topic and shows only that topic’s quick replies. It keeps examples, remembers earlier/volunteered answers and advances in order. “Bỏ qua câu này” (including a bare skip) applies only to that topic; explicit “Bỏ qua phần còn lại” remains a separate action. Bare “không” for mobility/destination questions completes that topic without fabricating a preference; other ambiguous replies are clarified.

Dialogue carries the current preference topic to understanding. The language-only composer must preserve the current question and may not add another. Luna/high, auth, dates, Validator and official Save remain unchanged. No schema/migration/dependency change.

Current receipts: 13 focused files / 106 tests PASS (five opt-in skips), plus two actual-chat/popup integration files / 30 tests PASS; web typecheck PASS. Isolated production build PASS, exit 0, including TypeScript and 48 generated pages. Updated real Luna/high smoke PASS (1/1, 154.6 seconds), with the current question progressing from experience to companions, mobility and destinations, then recap; one-question and scoped-no assertions pass. No DB/routing/Trip writes. Assistant-scope premium audit: zero findings. Design lint: zero errors/four existing warnings. Whitespace and secret/scope checks PASS. Browser inventory still reports disabled in Work settings, so no new visual/focus/mobile browser acceptance is claimed.

## Historical batch result (superseded by the correction above)

`planning-preferences.ts` owns remaining questions, examples, relevant quick replies and explicit per-section skip interpretation. After minimum inputs, experience, pace, companions/count, mobility and destination wishes are shown together. Already answered sections disappear. Travelers can answer in one message, incrementally, or explicitly skip the rest. One interest/negative answer no longer sets the whole stage complete.

The existing reviewed-needs JSON accepts optional per-section skip metadata, with no schema migration. An explicit no-mobility answer does not create a truthy empty constraint that could block Save. Clearly scoped planning-guidance questions stay in planning; genuine destination QA and existing restrictions remain intact. Bare numbers/negative answers in the batch are clarified. The bounded phrase rules are not a universal intent parser; unfamiliar wording may still need clarification.

The reply composer keeps all canonical question bullets while Luna/high writes the framing. Existing full-page/popup components, theme, quick-reply buttons, pending locks, authorization, recap confirmation, generation, Validator and official Save remain canonical. No generated itinerary or new Guest storage is persisted.

## Verification

- Red-capable command `npx vitest run src/modules/assistant-planning/planning-guided-preferences.vitest.test.ts` initially failed both screenshot regressions: premature RECAP and QA intent. Final file has **9 passing tests**, including partial/combined answers, scoped no-mobility, true QA, ambiguous number, preserved questions and real client transitions.
- Related run `npx vitest run src/modules/assistant-planning src/components/assistant src/components/trip-planner/itinerary-map.vitest.test.ts` — **33 files / 292 tests PASS**, five opt-in skips. Includes panel guidance/quick replies, auth, actual submit handlers, recovery, map and planning boundaries.
- Real model smoke via `ASSISTANT_PLANNING_LANGUAGE_TEST=1` and `npx varlock run -- npx vitest run src/modules/assistant-planning/planning-language-live.vitest.test.ts` — **1/1 PASS**, 125.7 seconds. Uses Luna/high production interpretation/service/composition with controlled in-memory read boundaries and no DB, routing or Trip writes. It retains date/window behavior, shows all missing questions, removes the answered pace question, handles the exact screenshot guidance phrase and accepts a combined adventure/SOLO/no-mobility/no-must-visit reply before recap. Examples in questions do not become companion data.
- `npm run check-types -w web` — **PASS**. `KLTN_PERF_BUILD=1 npm run build -w web` — **PASS, exit 0**, including TypeScript and 48 generated pages. Uses the existing isolated build output.
- Assistant-scoped premium strict audit with `docs/design/us22-premium-ui.json` — **0 findings**, ignored receipt `.cache/assistant-guided-preferences-audit.json`.
- Design lint: **0 errors**, four existing orphaned-token warnings. `git diff --check`, added-file whitespace and secret/scope review pass. No new dependencies/schema/migration, no commit/push/merge/deployment.

## Remaining acceptance

Browser inventory reports local browser use disabled in Work settings. Static panel rendering and actual-client/handler tests do not prove desktop/mobile appearance, focus or touch behavior. No screenshot or authenticated browser acceptance is claimed. When available, test a fresh plan with an interest-only answer, the screenshot phrase, a no-mobility quick reply, a combined response and explicit skip; verify remaining questions and button wrapping at 360px and desktop, light/dark, keyboard and pending states.

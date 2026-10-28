# Planning dialogue verification — 2026-10-27

Scope: owner-approved Q1–Q5 in [the design](assistant-dialogue-naturalness-design.md), implemented by [this story](../stories/ASSISTANT-DIALOGUE-NATURALNESS.md). Existing uncommitted work is preserved. No commit, push, merge, deployment, dependency or database-schema change in this follow-up.

## Implemented

- Server Vietnam date/Monday–Sunday week anchor; deterministic normalization of day/month, explicit year and unambiguous relative dates. `31/10` at 27/10/2026 means 31/10/2026. Next week remains the anchored range 02–08/11/2026, never an automatically chosen departure date. Past missing-year dates ask before interpreting next year; invalid/ambiguous dates ask correction. Other stated needs survive an invalid date.
- Reviewed-needs JSON retains optional window/anchor, explicit deferral and preference-completion flags. Existing rows remain valid. Unconfirmed transcript/offers/proposals keep their existing transient retention. Expired restored dates require correction before generation; missing required data cannot pass official Save.
- Understanding, selection and reply composition pin `gpt-6-luna` / `high`, independent of QA overrides. Language composition receives original text, bounded context and actual needs/results. Recap facts and the proposal status sentence are protected. Unsupported numbers/dates, companion/preferences phrases and premature save/validation claims trigger canonical fallback. This is bounded protection, not proof of general model accuracy. Composition has a 12-second limit; failure cannot rerun generation/write.
- Guest public QA works after the login invitation and after QA attaches a conversation ID. An independent question separated by punctuation in a mixed message can use public QA; this is bounded separation, not a universal intent parser. Login retains the original request/public Destination context, not a newer draft. Same-tab memory expires after five minutes; restoration requires explicit send, with no Guest-history migration.

## Evidence

- Red regressions reproduced Guest QA trapping and loss of other needs on an invalid date. Calendar, restoration, confirmation and auth-handoff tests pass.
- Broad related run: `npx vitest run src/modules/assistant-planning src/components/assistant src/components/trip-planner/itinerary-map.vitest.test.ts src/modules/trip-save/trip-save.vitest.test.ts src/modules/trip-validation` — **38 files / 359 tests PASS**, five opt-in skips. Expected UNKNOWN diagnostics from deliberate database-failure fixtures are not test failures.
- After final mixed-Guest/partial-needs changes: affected planning, client and actual AssistantChat-handler suites — **12 files / 104 tests PASS**, five opt-in skips. Offline React hook harness covers public QA after invitation, conversation attachment, original-intent CTA capture, newer draft preservation and no automatic planning action. These are not browser tests.
- Intercepted provider test confirms all three request bodies use Luna/high, `store:false` and server calendar context; no real credential/network call in that test.
- Real provider smoke: `ASSISTANT_PLANNING_LANGUAGE_TEST=1`, then `npx varlock run -- npx vitest run src/modules/assistant-planning/planning-language-live.vitest.test.ts` — **1/1 PASS**, 47.2 seconds. Production interpretation/service/composition with in-memory read boundaries, no DB/routing/Trip writes. Screenshot sequence acknowledges 31/10/2026, confirms replacement by the next-week window, accepts deferral and packed pace without invented companions/interests. Real recap includes “3 ngày · Xe máy” and “Dự kiến 02/11/2026–08/11/2026 — chưa chốt ngày cụ thể, chỉ tạo sơ bộ”. One bounded quality sample, not a general certification.
- Root `npm run check-types` — **4/4 PASS**. Final isolated `KLTN_PERF_BUILD=1 npm run build -w web` — **PASS, exit 0**, including compilation, TypeScript and 48 static pages. The existing isolated output preserves the dev checkout.
- Premium strict audit, `docs/design/us22-premium-ui.json` — **0 findings** in Assistant scope; ignored receipt `.cache/assistant-dialogue-premium-audit.json`. Assistant scrollbar owner includes standard properties beside existing WebKit rules. No new palette/font.
- `npx -p @google/design.md designmd lint DESIGN.md` — **0 errors**, four existing orphaned-token warnings.
- Whitespace, changed-code anti-pattern and secret/scope checks pass. No server credentials added to browser code. No new schema/migration to inspect for this follow-up.

## Open acceptance

`cua.getState()` reports browser use disabled in Work settings. No current-session desktop/mobile screenshot, keyboard/focus/touch or authenticated browser login-return acceptance is claimed. Earlier live Stadia evidence belongs to its separate verification; this follow-up's component test is not new live-map evidence. No production rollout, new DB integration smoke or repository-wide full-suite green claim.

When browser use is available: as Guest, request planning, ask public QA, type another draft, select login and verify original editable restoration/no automatic send. As Traveler, try `31/10`, `khoảng tuần sau`, confirm replacement, defer, recap and explicitly generate. Try an invalid date with other needs, an expired restored date, and bare agreement after QA. Check 360px/desktop, dark mode and keyboard focus on login/date-confirmation controls.

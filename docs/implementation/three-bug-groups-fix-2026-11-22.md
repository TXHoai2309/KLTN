# Unsaved dialog, companion AI overlay and historical test failures

## Result and scope

Local source fixes implemented; browser acceptance partial. No commit, push, merge,
deploy, schema change or DB reset. Prisma Client regenerated from the existing
schema after initial typecheck identified stale generated TripPinnedItem types.

## BUG-01 — Unsaved changes dialog

**Partially Fixed (visual fix verified; full save/AI E2E matrix not proven).**

`useUnsavedChanges` creates a native modal `<dialog>` imperatively, not
`window.confirm`. Its styles were owned by `admin-form-shell.css`; both trip entry
routes render EditTripClient without that Admin stylesheet. Browser reset CSS
also requires an explicit auto margin to center the native dialog.

The hook now imports `unsaved-changes.css` itself. The old rules were removed from
Admin CSS. The dialog is fixed/centered, 440px capped with 16px viewport gutters,
theme-aware, scroll-bounded, with 44px minimum buttons, visible focus and a separate
danger color. Copy follows the task. Native showModal retains focus containment
and initial Stay focus. Refresh/tab-close still uses native beforeunload.

No dirty-state, mutation, navigation, cleanup or retry logic changed. Busy/UNKNOWN
continues to expose only Stay. New event-level guard tests verify Stay retains the
guard, confirmed Leave resumes once, and busy cannot leave; unload/cleanup tests
remain. Five focused guard tests pass.

Actual browser: `/trips/[id]/edit` and `/trips/[id]/in-trip`, owned local trip:
manual timing adjustment -> one unsaved change -> back -> Stay preserves the
change. In-trip also preserves a typed AI composer draft and its 38/500 counter.
Leave returns to the chosen trip URL. Both routes share the same renderer/hook.
No itinerary was saved during these checks; temporary manual edits were discarded
through confirmed Leave. Light dialog checked at 710px and 390px, dark at 1440px
and 390px. Screenshots outside Git:

- `D:/Bai tap Code/KLTN/edit-unsaved-dialog-desktop.png`
- `D:/Bai tap Code/KLTN/in-trip-unsaved-dialog-mobile.png`

Not proven live: new AI-generated/applied edits, successful/failed/UNKNOWN save,
browser Back/Forward and native refresh/close matrix on every device. Those
contracts have automated coverage; they are not substituted for live evidence.

## BUG-02 — Companion CTA overlap

**Partially Fixed (layout verified; non-host join/provider/mobile keyboard E2E pending).**

Actual route `/trip-companions/[publicationId]`, CompanionIntroductionView:
mobile `.companion-mobile-dock` pins its action to bottom/right at z-index 99;
the global assistant launcher pins to the same corner at layer 999. This is a
geometry collision, not a missing high z-index on the join action.

Scoped rules in `companion.css` put the launcher above the mobile/tablet dock
(88px + safe area). Desktop moves launcher/open panel to the left, away from the
right-hand joining card. Other routes retain their original widget position.
No CTA, AI feature or chat state removed. The existing mobile panel and its
minimize control remain the owner of expanded chat.

Browser at 390x844: launcher y=708..756, dock y=782.75..844, 26.75px clearance,
no horizontal overflow. At 710x883: launcher y=747..795, dock starts 821.75,
also 26.75px clearance. The available session is Host, so the same dock renders
“Vào nhóm”; no join mutation was executed. This proves shared dock geometry,
not a successful Traveler join. Open -> type an unsent 28-character draft ->
minimize -> reopen preserves draft/counter; the scratch draft was cleared at the
end. At 1440x900 the expanded panel spans x=24..424, while the joining card spans
x=793.83..1332.5, with no horizontal overflow. Theme and viewport restored.
Desktop and mobile expanded panel may cover ordinary page content by design;
mobile has its existing explicit minimize control. No new collision engine.

## BUG-03 — Test suite

| Check | Historical report | Fresh baseline | After fixes |
| --- | ---: | ---: | ---: |
| Failed tests | 47 | 38 | 0 |
| Failed files | 8 | 6 | 0 |
| Passed Vitest tests | — | 4582 | 4622 |
| Skipped / todo | — | 237 / 1 | 237 / 1 |
| Passed Vitest files | — | 430 | 436 |
| Typecheck | — | stale Prisma Client | PASS, 4 tasks |
| Build | — | stale Prisma Client | PASS |

Root `npm test` exit 0 includes Vitest **and chained legacy node:test suites**.
No tests removed, skipped or weakened to bypass authorization/validation. Existing
237 skipped and 1 todo remain unchanged. Nine-file focused run (the eight named
files plus guard): **192 PASS**.

### Root causes and changes

- `destination-reset-context`: already fixed in the preceding context task;
  no change needed, current lifecycle test passes.
- `global-assistant-context`: esbuild's CSS and CSS-module loaders could not
  bundle the lazy UI graph without an output path. Both are now empty loaders in
  this behavior-only harness. Assertions also referenced removed reset props and
  the retired passive-context contract; now verify current approved automatic
  destination switching, stale registration cleanup and retained context on a
  non-destination page. Production registration/session behavior unchanged.
- `companion-discovery`: current mock already exports usePathname. All eight
  cases pass; no source or test changes needed.
- `qa-answer-quality-v2` (8) and `qa-conversation-reliability` (1): stale
  Luna/high expectation conflicts with current runtime config defaults and
  qa-model/openai-model-catalog tests (Terra/medium). The reliability assertion
  threw inside the fake HTTP provider and was correctly mapped to AI_UNAVAILABLE.
  Updated expectations, preserving grounded output, failure and call-count tests.
  No production model/provider/prompt changed.
- `qa-chat-preference` (2): SOURCE_ONLY is intentionally omitted from requests;
  service and request hash default it to SOURCE_ONLY. Tests now assert effective
  mode and exact retry payload/key stability after toggling. EXPANDED ownership,
  restoration, snapshots and historical mode checks remain.
- `qa-diagnostics` (25 failures from one setup problem): default embedding
  provider now obtains credentials through runtime settings. Env-only fixtures
  failed before exercising generation/persistence. Injected the real embedding
  provider with fixture credentials and offline HTTP fetcher, retaining the
  embedding invocation/metadata instrumentation. Real retriever, adapter,
  service, HTTP, schema, failure mapping and diagnostic assertions still execute.
  All 32 diagnostics tests pass; genuine 503 stays 503 and persistence uncertainty
  remains UNKNOWN.
- `in-trip-v2`: reported duplicate location call did not reproduce; all current
  tests pass, no assertion/call-count changes.
- Fresh baseline also had one `tripsage-chat-assumed-draft` failure outside the
  eight named files. It did not reproduce in the final full run; no speculative
  change was made.

## Changed files

- apps/web/src/components/admin/use-unsaved-changes.ts
- apps/web/src/components/admin/unsaved-changes.css (new)
- apps/web/src/components/admin/admin-form-shell.css
- apps/web/src/components/admin/use-unsaved-changes.vitest.test.ts
- apps/web/src/app/trip-companions/companion.css
- apps/web/src/components/assistant/global-assistant-context.vitest.test.ts
- apps/web/src/modules/ai/qa-answer-quality-v2.vitest.test.ts
- apps/web/src/modules/ai/qa-chat-preference.vitest.test.ts
- apps/web/src/modules/ai/qa-conversation-reliability.vitest.test.ts
- apps/web/src/modules/ai/qa-diagnostics.vitest.test.ts
- docs/ai-progress.md
- this report

## Commands and evidence

Root: `npm test` (baseline and final), `npm run db:generate`,
`npm run check-types` (initial and final), `npm run build` (initial and final),
`git diff --check`.

Web: `npx vitest run --config vitest.config.mts` with these final targets:

```
src/components/assistant/destination-reset-context.vitest.test.ts
src/components/assistant/global-assistant-context.vitest.test.ts
src/components/trip-companions/companion-discovery.vitest.test.ts
src/modules/ai/qa-answer-quality-v2.vitest.test.ts
src/modules/ai/qa-chat-preference.vitest.test.ts
src/modules/ai/qa-conversation-reliability.vitest.test.ts
src/modules/ai/qa-diagnostics.vitest.test.ts
src/modules/assistant-agent-v2/in-trip-v2.vitest.test.ts
src/components/admin/use-unsaved-changes.vitest.test.ts
```

Intermediate focused runs used the affected subsets. Logs are in Windows TEMP:
`kltn-three-bugs-baseline.log`, `kltn-three-bugs-final.log`,
`kltn-eight-before.log`, `kltn-eight-final.log`, `kltn-groups-after.log`,
`kltn-two-after.log`, `kltn-guard-regression.log`,
`kltn-three-bugs-types-final.log`, `kltn-three-bugs-build-final.log`.
No lint script exists. Build retains two pre-existing dynamic filesystem tracing
warnings. Impeccable scan is advisory, not a browser/functional acceptance gate.
Production, real-provider accuracy and native mobile keyboard remain unproven.

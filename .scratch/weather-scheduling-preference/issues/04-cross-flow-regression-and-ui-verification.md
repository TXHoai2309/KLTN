# 04: Cross-flow verification, regression & UI check

**What to build:** Run end-to-end regression across Form, `journey`, and Assistant proposals, verify that the explainability warning renders cleanly in the proposal UI without altering Constraint Validator badges or blocking Save, and confirm all typecheck, build, and diff checks pass.

**Blocked by:**
- 02: Weather & sunset scheduling preference for origin round-trip (`journey`)
- 03: Assistant planner & scoped edit (`affectedDays`) weather preference + reply note

**Status:** done

- [x] Existing `trip-planner`, `trip-origin`, `assistant-planning`, `trip-weather`, and Constraint Validator test suites pass without relaxing or skipping assertions (1 unrelated pre-existing failure in `in-trip-v2.vitest.test.ts:155` noted in handoff).
- [x] Proposal UI displays the weather-scheduling explainability warning cleanly when present (`PlannerResult.warnings` + Assistant reply note) and does not alter Validator status or block saving.
- [x] `tsc --noEmit` and `git diff --check` pass cleanly (production build not run in this session).
- [x] Spec (`WEATHER-SCHEDULING-PREFERENCE.md`) and `ai-progress.md` are updated with verification evidence upon implementation completion.

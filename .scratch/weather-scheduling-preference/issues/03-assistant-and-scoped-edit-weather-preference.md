# 03: Assistant planner & scoped edit (`affectedDays`) weather preference + reply note

**What to build:** Wire the shared weather and sun-time scheduling preference into the Assistant planner (both new itinerary generation and scoped day edits / in-trip `affectedDays` replanning). Provide `isOutdoor`, sunset, and advisory context to Assistant planning, and let the deterministic scheduler refine stop order strictly within `affectedDays` without touching locked or unaffected days or dropping must-visit stops. Surface the explainability note in the Assistant reply when weather/sun times actually changed the schedule, and allow the Assistant to suggest indoor alternatives in prose when an entire day has severe advisories.

**Blocked by:** 01: Core weather & sunset scheduling preference + Form planner (standard trips)

**Status:** done

- [x] Assistant itinerary generation (`scheduleSelection` / planning session) applies the shared weather and sunset preference evaluator while preserving all must-visit stops and user constraints.
- [x] Scoped edits and in-trip replanning only reorder stops within `affectedDays`; locked stops and unaffected/completed days are never modified.
- [x] When weather/sun-time preference changed the stop order or day assignment, the Assistant reply includes a short, deterministic explainability note (omitted when unchanged or when forecasts are unavailable).
- [x] When an entire day has severe weather advisories that reordering cannot avoid, the Assistant keeps the valid schedule and may suggest indoor alternatives in prose without auto-replacing stops.
- [x] Assistant planning and response tests verify new proposals, `affectedDays` isolation, must-visit/lock preservation, reply explainability note, and forecast outage fallback.

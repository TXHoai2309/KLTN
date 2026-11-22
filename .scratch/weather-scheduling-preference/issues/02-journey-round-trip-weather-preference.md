# 02: Weather & sunset scheduling preference for origin round-trip (`journey`)

**What to build:** Extend the shared weather and sun-time scheduling preference from Ticket 01 to origin round-trip (`journey`) itineraries in both the Form planner and Assistant planner. Reordering visits within a day or across days must respect fixed departure/return bounds, keep `journey` driving/riding checks valid, and stay within the `<= 20%` (max `+30 minutes/day`) detour cap.

**Blocked by:** 01: Core weather & sunset scheduling preference + Form planner (standard trips)

**Status:** done

- [x] `journey` planning (both Form and Assistant paths) applies the shared weather and sunset preference evaluator to candidate schedules.
- [x] Any weather-driven reordering that would break outbound/return departure or arrival bounds, or introduce a `journey` timing/Validator `VIOLATION`, is rejected in favor of the baseline schedule.
- [x] Added driving/riding time (including origin/return impact) stays within `<= 20%` (max `+30 minutes/day`) of the route-optimal `journey` baseline.
- [x] The explainability warning is emitted when weather/sun-time preference changed the `journey` stop order or day assignment, and omitted otherwise.
- [x] Module tests with fake route and forecast providers verify `journey` sunset/weather reordering, departure/return bound preservation, detour cap rejection, and fallback on forecast outage.

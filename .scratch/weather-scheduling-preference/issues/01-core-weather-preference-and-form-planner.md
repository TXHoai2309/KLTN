# 01: Core weather & sunset scheduling preference + Form planner (standard trips)

**What to build:** Introduce the shared server-side weather and sun-time scheduling preference evaluator and wire it into the standard Form planner (non-`journey` trips). Outdoor destinations (`isOutdoor`) are prioritized before that day's sunset (or in the earlier half of the day when no `startDate` is provided, and even beyond the 16-day forecast horizon). Within the 16-day horizon, visits within a day or day assignments across the trip are reordered to reduce ADR-36 weather advisories (rain, fog, wind) and after-sunset advisories, while preserving all must-visit stops, introducing no new Constraint Validator `VIOLATION`, and keeping added travel time within `<= 20%` (max `+30 minutes/day`). Forecast errors or timeouts (~2.5s budget) degrade silently without failing planning, and a short explainability warning is emitted only when weather/sun times actually changed the schedule.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Shared weather/sunset preference evaluator scores a candidate schedule using `suncalc` sun times (`isOutdoor` before sunset, or earlier-half priority when `startDate` is null) and cached Open-Meteo destination forecasts with ADR-36 thresholds (`rain >= 70%` or `>= 5 mm/h`, `visibility < 1000 m`, `windGust >= 40 km/h`).
- [x] Form planner (standard non-`journey` flow) reorders stops within a day or swaps days when doing so strictly reduces advisory penalties without adding any Constraint Validator `VIOLATION` or exceeding `min(20% baseline travel time, 30 min * affected days)`.
- [x] All must-visit stops and Constraint Validator outcomes (`PASS` / `VIOLATION` / `INSUFFICIENT_DATA`) remain unchanged by weather/sun-time preferences (ADR-36 invariant).
- [x] Trips beyond the 16-day horizon still apply sunset ordering for `isOutdoor` stops; Open-Meteo failures or timeouts (> ~2.5s) skip forecast preferences and still return a valid proposal.
- [x] A short explainability warning is included in the proposal `warnings` only when weather/sun-time preference actually changed the stop order or day assignment.
- [x] Unit/module tests using fake route and fake forecast providers cover sunset ordering, 16-day advisory avoidance, detour cap rejection, Validator-violation rejection, must-visit preservation, outage fallback, and explainability note behavior.

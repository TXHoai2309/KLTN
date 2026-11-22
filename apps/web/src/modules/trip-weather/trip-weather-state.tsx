"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import { toTripWeatherRequest } from "./trip-weather-request";
import type { TripWeather } from "./trip-weather-service";

export type TripWeatherState = { status: "loading" } | { status: "error" } | { status: "ready"; weather: TripWeather };

/** One forecast request per itinerary; the panel and the inline stop rows share it through `TripWeatherProvider`. */
export function useTripWeatherState(days: PlannerDay[], journeyPlan?: JourneyPlan | null): TripWeatherState {
  const request = useMemo(() => toTripWeatherRequest(days, journeyPlan), [days, journeyPlan]);
  const body = useMemo(() => JSON.stringify(request), [request]);
  const [state, setState] = useState<TripWeatherState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch("/api/trip-weather", { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
      .then(async r => { const b = await r.json() as { success?: boolean; data?: TripWeather }; if (!r.ok || !b.success || !b.data) throw new Error("weather"); setState({ status: "ready", weather: b.data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [body]);
  return state;
}

export const TripWeatherContext = createContext<TripWeatherState | null>(null);

export function TripWeatherProvider({ days, journeyPlan, children }: { days: PlannerDay[]; journeyPlan?: JourneyPlan | null; children: ReactNode }) {
  const state = useTripWeatherState(days, journeyPlan);
  return <TripWeatherContext.Provider value={state}>{children}</TripWeatherContext.Provider>;
}

/** `null` outside a provider, so inline pieces render nothing instead of failing. */
export function useTripWeatherContext(): TripWeatherState | null {
  return useContext(TripWeatherContext);
}

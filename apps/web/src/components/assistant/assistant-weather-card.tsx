"use client";

import { Component, useEffect, useId, useState, type ReactNode } from "react";
import { Sunrise } from "lucide-react";
import type { QaDestinationChoice } from "../../modules/ai/qa-contract";
import type { DestinationWeather } from "../../modules/trip-weather/destination-weather-service";
import { ForecastView, SunTimesView } from "../../modules/trip-weather/destination-weather-card";
import { todayInVietnam } from "../../modules/trip-weather/sun-times";

export type AssistantWeatherCardLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; weather: DestinationWeather };

export type AssistantWeatherCardProps = {
  destinationId: string;
  date: string;
  representative: boolean;
  initialState?: AssistantWeatherCardLoadState;
  today?: string;
};

/** Builds a clean follow-up question when the user selects one of up to 3 ambiguous destination choices. */
export function buildWeatherChoiceFollowUp(choice: QaDestinationChoice, previousQuestion?: string): string {
  const destinationName = choice.name.replace(/\s+/gu, " ").trim();
  const base = previousQuestion
    ?.replace(/\s*(?:—|--)\s*tại\s+[^?]+\?\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .replace(/[?.!]+$/u, "")
    .trim();

  if (base && base.length <= 360) {
    return `${base} — tại ${destinationName}?`;
  }
  return `Dự báo thời tiết hôm nay tại ${destinationName} như thế nào?`;
}

function isDestinationWeatherPayload(value: unknown): value is DestinationWeather {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.destinationId !== "string" || typeof candidate.date !== "string") return false;
  if (!candidate.sunTimes || typeof candidate.sunTimes !== "object") return false;
  if (!candidate.forecast || typeof candidate.forecast !== "object") return false;
  const status = (candidate.forecast as Record<string, unknown>).status;
  return status === "AVAILABLE" || status === "NOT_YET_AVAILABLE" || status === "UNAVAILABLE";
}

class WeatherCardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="assistant-weather-card" aria-label="Giờ mặt trời và dự báo thời tiết">
          <p className="assistant-weather-status assistant-weather-status--error" role="alert">
            Không lấy được dự báo thời tiết lúc này. Đây không phải là trời đẹp; vui lòng thử lại sau.
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

function AssistantWeatherCardInner({
  destinationId,
  date,
  representative,
  initialState,
  today,
}: AssistantWeatherCardProps) {
  const titleId = useId();
  const [state, setState] = useState<AssistantWeatherCardLoadState>(() => initialState ?? { status: "loading" });

  useEffect(() => {
    if (initialState) {
      setState(initialState);
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    const url = `/api/destinations/${encodeURIComponent(destinationId)}/weather?date=${encodeURIComponent(date)}`;
    fetch(url, { signal: controller.signal, credentials: "same-origin" })
      .then(async response => {
        const body = (await response.json()) as { success?: boolean; data?: unknown };
        if (!response.ok || !body?.success || !isDestinationWeatherPayload(body.data)) {
          throw new Error("weather_unavailable");
        }
        if (!controller.signal.aborted) {
          setState({ status: "ready", weather: body.data });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      });

    return () => controller.abort();
  }, [destinationId, date, initialState]);

  const effectiveToday = today ?? todayInVietnam();

  return (
    <section
      className="assistant-weather-card"
      aria-labelledby={titleId}
      data-representative={representative ? "true" : "false"}
    >
      <div className="assistant-weather-card-header">
        <h3 id={titleId} className="assistant-weather-card-title">
          <Sunrise size={17} aria-hidden="true" />
          <span>
            Giờ mặt trời và dự báo · <time dateTime={date}>{date}</time>
          </span>
        </h3>
        {state.status === "ready" && (
          <a
            className="assistant-weather-dest-link"
            href={`/destinations/${encodeURIComponent(destinationId)}`}
          >
            Xem điểm đến
          </a>
        )}
      </div>

      {representative && (
        <p className="assistant-weather-representative" role="note">
          <strong>Điểm đại diện:</strong> Số liệu tính tại điểm đại diện khu vực thành phố Hà Giang (tham khảo chung cho Hà Giang).
        </p>
      )}

      {state.status === "loading" && (
        <p className="assistant-weather-status" role="status" aria-live="polite">
          Đang tải giờ mặt trời và dự báo…
        </p>
      )}

      {state.status === "error" && (
        <p className="assistant-weather-status assistant-weather-status--error" role="alert">
          Không lấy được dự báo thời tiết lúc này. Đây không phải là trời đẹp; vui lòng thử lại sau.
        </p>
      )}

      {state.status === "ready" && (
        <div className="assistant-weather-card-body">
          <SunTimesView sunTimes={state.weather.sunTimes} />
          <ForecastView forecast={state.weather.forecast} today={effectiveToday} />
          <p className="assistant-weather-footnote">Giờ Việt Nam (UTC+7) · Chỉ để tham khảo.</p>
        </div>
      )}
    </section>
  );
}

export function AssistantWeatherCard(props: AssistantWeatherCardProps) {
  return (
    <WeatherCardErrorBoundary key={`${props.destinationId}:${props.date}`}>
      <AssistantWeatherCardInner {...props} />
    </WeatherCardErrorBoundary>
  );
}

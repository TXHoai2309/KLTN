"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Clock, CloudSun, MapPin, MessageSquare, Sparkles, Ticket } from "lucide-react";
import FavoriteButton from "@/components/favorite-button";
import { cleanAreaDisplayLabel, cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import { formatPlannerDurationSummary } from "@/modules/destination/public-destination-contract";
import { formatMinute, todayInVietnam } from "@/modules/trip-weather/sun-times";
import type { DestinationWeather } from "@/modules/trip-weather/destination-weather-service";

export type OpeningHourDaySummary = {
  dayOfWeek: string;
  label: string;
  value: string;
};

type WeatherBrief =
  | { status: "idle" }
  | { status: "loaded"; minC: number | null; maxC: number | null; rainPct: number | null; sunrise: string; sunset: string }
  | { status: "unavailable" };

const WEEKDAY_VN_TO_KEY: Record<string, string> = {
  Mon: "MONDAY",
  Tue: "TUESDAY",
  Wed: "WEDNESDAY",
  Thu: "THURSDAY",
  Fri: "FRIDAY",
  Sat: "SATURDAY",
  Sun: "SUNDAY",
};

function currentVietnamWeekday(): string {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "short",
    }).format(new Date());
    return WEEKDAY_VN_TO_KEY[short] ?? "MONDAY";
  } catch {
    return "MONDAY";
  }
}

export function DestinationSummaryCard({
  destinationId,
  destinationName,
  area,
  hours,
  suggestedDurationMinutes,
  minimumDurationMinutes = null,
  ticketPrice,
  hasCoordinates,
  mapSlot,
}: {
  destinationId: string;
  destinationName: string;
  area?: string | null;
  hours: readonly OpeningHourDaySummary[];
  suggestedDurationMinutes: number | null;
  minimumDurationMinutes?: number | null;
  ticketPrice?: string | null;
  hasCoordinates: boolean;
  mapSlot: ReactNode;
}) {
  const displayName = cleanPlaceDisplayName(destinationName) || destinationName;
  const cleanArea = cleanAreaDisplayLabel(area);
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const todayKey = currentVietnamWeekday();
    return hours.find(h => h.dayOfWeek === todayKey)?.dayOfWeek ?? hours[0]?.dayOfWeek ?? todayKey;
  });
  const [weather, setWeather] = useState<WeatherBrief>({ status: "idle" });

  useEffect(() => {
    if (!hasCoordinates) return;
    const controller = new AbortController();
    const today = todayInVietnam();
    fetch(`/api/destinations/${encodeURIComponent(destinationId)}/weather?date=${encodeURIComponent(today)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        const body = (await response.json()) as { success?: boolean; data?: DestinationWeather };
        if (!response.ok || !body.success || !body.data) throw new Error("weather");
        const { sunTimes, forecast } = body.data;
        const todayForecast = forecast.status === "UNAVAILABLE" ? null : forecast.days.find(d => d.date === today) ?? forecast.days[0] ?? null;
        setWeather({
          status: "loaded",
          minC: todayForecast?.minTemperatureC ?? null,
          maxC: todayForecast?.maxTemperatureC ?? null,
          rainPct: todayForecast?.maxPrecipitationProbability ?? null,
          sunrise: formatMinute(sunTimes.sunriseMinute),
          sunset: formatMinute(sunTimes.sunsetMinute),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeather({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [destinationId, hasCoordinates]);

  const activeDay = hours.find(h => h.dayOfWeek === selectedDay) ?? hours[0] ?? null;
  const planHref = `/assistant?destinationId=${encodeURIComponent(destinationId)}&mustInclude=${encodeURIComponent(destinationId)}&intent=plan` as Route;
  const askHref = `/assistant?destinationId=${encodeURIComponent(destinationId)}` as Route;
  const durationCopy =
    formatPlannerDurationSummary({
      suggestedDurationMinutes,
      minimumDurationMinutes,
    }) ?? "Chưa có";
  const ticketCopy = ticketPrice?.trim() || "Chưa có giá vé";

  return (
    <section
      className="public-detail-summary"
      data-testid="destination-summary-card"
      aria-label={`Tóm tắt tham quan ${displayName}`}
    >
      <div className="public-detail-summary-top">
        <div className="public-detail-summary-actions">
          <Link href={planHref} className="public-detail-plan-cta" data-testid="plan-with-destination-cta">
            <Sparkles size={16} aria-hidden="true" />
            <span>Lập lịch với điểm này</span>
          </Link>
          <div className="public-detail-secondary-actions">
            <div className="public-detail-summary-fav">
              <FavoriteButton targetType="destinations" targetId={destinationId} />
            </div>
            <Link href={askHref} className="public-detail-ask-cta">
              <MessageSquare size={16} aria-hidden="true" />
              <span>Hỏi trợ lý</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="public-detail-summary-grid">
        <dl className="public-detail-summary-facts">
          {cleanArea && (
            <div className="public-detail-summary-row">
              <dt>
                <MapPin size={15} aria-hidden="true" />
                <span>Khu vực</span>
              </dt>
              <dd>{cleanArea}</dd>
            </div>
          )}

          <div className="public-detail-summary-row">
            <dt>
              <CalendarDays size={15} aria-hidden="true" />
              <span>Giờ mở cửa</span>
            </dt>
            <dd className="public-detail-summary-hours">
              {hours.length > 0 ? (
                <>
                  <label className="public-detail-day-select-wrap">
                    <span className="sr-only">Chọn ngày xem giờ mở cửa</span>
                    <select
                      className="public-detail-day-select"
                      value={activeDay?.dayOfWeek ?? selectedDay}
                      onChange={event => setSelectedDay(event.target.value)}
                    >
                      {hours.map(item => (
                        <option key={item.dayOfWeek} value={item.dayOfWeek}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className={`schedule-status-badge ${activeDay?.value === "Đóng cửa" ? "closed" : "open"}`}>
                    {activeDay?.value === "Đóng cửa" ? "Đóng cửa cả ngày" : activeDay?.value.replaceAll("–", " – ")}
                  </span>
                </>
              ) : (
                <span className="public-detail-muted-inline">Chưa có giờ mở cửa</span>
              )}
            </dd>
          </div>

          <div className="public-detail-summary-row">
            <dt>
              <Clock size={15} aria-hidden="true" />
              <span>Thời lượng gợi ý</span>
            </dt>
            <dd>{durationCopy}</dd>
          </div>

          <div className="public-detail-summary-row">
            <dt>
              <Ticket size={15} aria-hidden="true" />
              <span>Giá vé</span>
            </dt>
            <dd>{ticketCopy}</dd>
          </div>

          <div className="public-detail-summary-row">
            <dt>
              <CloudSun size={15} aria-hidden="true" />
              <span>Thời tiết hôm nay</span>
            </dt>
            <dd className="public-detail-weather-brief">
              {weather.status === "loaded" ? (
                <>
                  <span>
                    {weather.minC !== null && weather.maxC !== null
                      ? `${weather.minC.toFixed(0)}–${weather.maxC.toFixed(0)}°C`
                      : "Đang cập nhật nhiệt độ"}
                    {weather.rainPct !== null ? ` · mưa tối đa ${weather.rainPct.toFixed(0)}%` : ""}
                    {` · bình minh ${weather.sunrise}, hoàng hôn ${weather.sunset}`}
                  </span>
                  <a href="#thoi-tiet-chi-tiet" className="public-detail-weather-jump">
                    Xem dự báo chi tiết
                  </a>
                </>
              ) : weather.status === "unavailable" ? (
                <a href="#thoi-tiet-chi-tiet" className="public-detail-weather-jump">
                  Xem dự báo thời tiết
                </a>
              ) : (
                <a href="#thoi-tiet-chi-tiet" className="public-detail-weather-jump">
                  Xem dự báo hôm nay
                </a>
              )}
            </dd>
          </div>
        </dl>

        <div className="public-detail-summary-map">
          {mapSlot}
        </div>
      </div>
    </section>
  );
}

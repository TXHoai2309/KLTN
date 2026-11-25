import { Bus, Plane, TrainFront, Van } from "lucide-react";
import type { ReactNode } from "react";

import {
  ACCESS_MODE_LABELS,
  buildAccessDirectionSchedule,
  collectAccessLegWarnings,
  formatDurationVi,
  type AccessLegPart,
} from "@/modules/tripsage-chat/tripsage-access-leg";
import { formatVnd } from "@/modules/tripsage-chat/tripsage-cost";
import { PinButton, type PinControl } from "./tripsage-pin-button";

const ICON: Record<keyof typeof ACCESS_MODE_LABELS, ReactNode> = {
  FLIGHT: <Plane size={14} aria-hidden="true" />, SLEEPER_BUS: <Bus size={14} aria-hidden="true" />, TRAIN: <TrainFront size={14} aria-hidden="true" />, SHUTTLE: <Van size={14} aria-hidden="true" />,
};
const formatDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function segmentPriceLabel(segment: AccessLegPart["outbound"][number]): string {
  if (segment.priceVndPerPerson === 0 || segment.priceSource === "MISSING") return "chưa có giá";
  if (segment.priceSource === "GOOGLE_FLIGHTS") {
    const dateSuffix = segment.priceLookupDate ? ` ngày ${formatDate(segment.priceLookupDate)}` : "";
    return `${formatVnd(segment.priceVndPerPerson)}/người (giá tham khảo từ Google Flights${dateSuffix})`;
  }
  return `~${formatVnd(segment.priceVndPerPerson)}/người (ước tính)`;
}

function Segments({
  title,
  direction,
  segments,
  minutes,
  headingLevel = 5,
}: {
  title: string;
  direction: "outbound" | "return";
  segments: AccessLegPart["outbound"];
  minutes: number;
  headingLevel?: 3 | 5;
}) {
  const schedule = buildAccessDirectionSchedule(segments, direction);
  const Heading = headingLevel === 3 ? "h3" : "h5";
  const headingMinutes = schedule.totalSpanMinutes ?? minutes;
  return (
    <div className="tripsage-access-direction">
      <Heading className="font-semibold">
        {title}
        {headingMinutes > 0
          ? ` · khoảng ${formatDurationVi(headingMinutes)}${schedule.hasMissingDuration ? " (chưa đủ mọi đoạn)" : ""}`
          : ""}
      </Heading>
      <ol className="tripsage-access-segments tripsage-access-schedule">
        {schedule.steps.map((step, index) => {
          if (step.kind === "CHECKIN") {
            return (
              <li key={`checkin-${index}`} className="tripsage-access-step tripsage-access-step--meta">
                {step.clockLabel ? <strong>{step.clockLabel}</strong> : null}
                <span>{step.clockLabel ? ` · ${step.text}` : step.text}</span>
              </li>
            );
          }
          if (step.kind === "LAYOVER") {
            return (
              <li key={`layover-${index}`} className="tripsage-access-step tripsage-access-step--meta">
                {step.clockLabel ? <strong>{step.clockLabel}</strong> : null}
                {step.transferLabel ? (
                  <span>{step.clockLabel ? ` · ${step.transferLabel}` : step.transferLabel}</span>
                ) : null}
                {step.tightWarning && (
                  <p className="tripsage-access-warn" role="note">{step.tightWarning}</p>
                )}
              </li>
            );
          }
          const segment = step.segment;
          return (
            <li key={`seg-${step.segmentIndex}`} className="tripsage-access-step">
              {ICON[segment.mode]}{" "}
              {step.clockLabel ? <strong>{step.clockLabel} · </strong> : null}
              <strong>{ACCESS_MODE_LABELS[segment.mode]}</strong> {segment.from} → {segment.to}
              <span className="assistant-muted">
                {" · "}
                {segment.durationMinutes > 0 ? `${formatDurationVi(segment.durationMinutes)} · ` : ""}
                {segmentPriceLabel(segment)}
              </span>
            </li>
          );
        })}
      </ol>
      {schedule.totalSpanMinutes !== null && schedule.totalSpanMinutes > 0 && (
        <p className="tripsage-access-total">
          Tổng {formatDurationVi(schedule.totalSpanMinutes)}{" "}
          {schedule.startsWithFlight ? "từ lúc cất cánh" : "từ lúc khởi hành"}
          {schedule.travelMinutes > 0 ? ` (trong đó ${formatDurationVi(schedule.travelMinutes)} di chuyển)` : ""}
        </p>
      )}
    </div>
  );
}

/** Estimated access leg to a trip hub (ADR-42 §4). Not validated, not booked, not saved. */
/** `only` shows one direction inside the itinerary: the way to the hub before day 1, the way home after the last day. */
export function TripsageAccessLegCard({
  leg,
  only,
  isStale = false,
  pins,
  inlineHeadingLevel = 5,
  lastSightseeingEndMinute = null,
  returnDepartsSameDay,
}: {
  leg: AccessLegPart;
  only?: "outbound" | "return";
  isStale?: boolean;
  pins?: PinControl;
  inlineHeadingLevel?: 3 | 5;
  lastSightseeingEndMinute?: number | null;
  returnDepartsSameDay?: boolean;
}) {
  const connectionWarnings = collectAccessLegWarnings(leg, { lastSightseeingEndMinute, returnDepartsSameDay });
  if (only) {
    const dirWarnings = connectionWarnings.filter(w =>
      only === "outbound" ? w.startsWith("Chặng đi") : !w.startsWith("Chặng đi"),
    );
    return (
      <section className="tripsage-access tripsage-access-inline" aria-label={only === "outbound" ? "Chặng đi tới điểm tập kết" : "Chặng về nhà"}>
        {only === "outbound"
          ? <Segments title={`Trước ngày 1 · ${leg.homeCity} → ${leg.hubName}`} direction="outbound" segments={leg.outbound} minutes={leg.outboundMinutes} headingLevel={inlineHeadingLevel} />
          : <Segments title={`Sau ngày cuối · ${leg.hubName} → ${leg.homeCity}`} direction="return" segments={leg.return} minutes={leg.returnMinutes} headingLevel={inlineHeadingLevel} />}
        {dirWarnings.length > 0 && (
          <ul className="tripsage-access-warn-list" data-testid="access-leg-warnings" role="note">
            {dirWarnings.map((warning, i) => (
              <li key={`dir-warn-${i}`} className="tripsage-access-warn">{warning}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  const hasGoogleFlights = [...leg.outbound, ...leg.return].some(segment => segment.priceSource === "GOOGLE_FLIGHTS");
  return (
    <section
      className={`tripsage-access${isStale ? " tripsage-access--stale" : ""}`}
      data-stale={isStale ? "true" : undefined}
      aria-label="Chặng tiếp cận"
    >
      <div className="tripsage-access-header">
        <h4>Từ {leg.homeCity} tới {leg.hubName}</h4>
        {isStale ? (
          <span className="tripsage-access-stale-badge">Đã có bản mới</span>
        ) : (
          pins && <PinButton item={{ kind: "ACCESS", leg }} control={pins} label="chặng tiếp cận" />
        )}
      </div>
      <Segments title="Trước chuyến đi" direction="outbound" segments={leg.outbound} minutes={leg.outboundMinutes} />
      <Segments title="Sau chuyến đi" direction="return" segments={leg.return} minutes={leg.returnMinutes} />
      {connectionWarnings.length > 0 && (
        <ul className="tripsage-access-warn-list" data-testid="access-leg-warnings" role="note">
          {connectionWarnings.map((warning, i) => (
            <li key={`conn-warn-${i}`} className="tripsage-access-warn">{warning}</li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        Tổng tham khảo cả nhóm {leg.travelers} người:{" "}
        <strong>
          {leg.totalVnd > 0 ? formatVnd(leg.totalVnd) : "chưa có giá"}
        </strong>
        {leg.missingPriceSegments && leg.missingPriceSegments.length > 0 && (
          <span className="assistant-muted"> (chưa đầy đủ — thiếu giá {leg.missingPriceSegments.join(", ")})</span>
        )}
      </p>
      {hasGoogleFlights && (
        <p className="assistant-muted text-xs">Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
      )}
      <p className="assistant-muted text-xs">Chặng tiếp cận chưa được kiểm tra bằng bộ kiểm tra lịch trình; ứng dụng không đặt vé. Số ngày chuyến đi tính từ {leg.hubName}.</p>
    </section>
  );
}

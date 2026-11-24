import { Bus, Plane, TrainFront, Van } from "lucide-react";
import type { ReactNode } from "react";

import { ACCESS_MODE_LABELS, type AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { formatVnd } from "@/modules/tripsage-chat/tripsage-cost";
import { PinButton, type PinControl } from "./tripsage-pin-button";

const ICON: Record<keyof typeof ACCESS_MODE_LABELS, ReactNode> = {
  FLIGHT: <Plane size={14} aria-hidden="true" />, SLEEPER_BUS: <Bus size={14} aria-hidden="true" />, TRAIN: <TrainFront size={14} aria-hidden="true" />, SHUTTLE: <Van size={14} aria-hidden="true" />,
};
const hours = (minutes: number) => `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}`;
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
  segments,
  minutes,
  headingLevel = 5,
}: {
  title: string;
  segments: AccessLegPart["outbound"];
  minutes: number;
  headingLevel?: 3 | 5;
}) {
  const hasMissingDuration = segments.some(s => s.durationMinutes <= 0);
  const Heading = headingLevel === 3 ? "h3" : "h5";
  return (
    <div>
      <Heading className="font-semibold">
        {title}
        {minutes > 0 ? ` · khoảng ${hours(minutes)}${hasMissingDuration ? " (chưa đủ mọi đoạn)" : ""}` : ""}
      </Heading>
      <ol className="tripsage-access-segments">
        {segments.map((segment, index) => (
          <li key={index}>
            {ICON[segment.mode]} <strong>{ACCESS_MODE_LABELS[segment.mode]}</strong> {segment.from} → {segment.to}
            <span className="assistant-muted">
              {" · "}
              {segment.departTime ? `đi ${segment.departTime}, ` : ""}
              {segment.durationMinutes > 0 ? `${hours(segment.durationMinutes)} · ` : ""}
              {segmentPriceLabel(segment)}
            </span>
          </li>
        ))}
      </ol>
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
}: {
  leg: AccessLegPart;
  only?: "outbound" | "return";
  isStale?: boolean;
  pins?: PinControl;
  inlineHeadingLevel?: 3 | 5;
}) {
  if (only) {
    return (
      <section className="tripsage-access tripsage-access-inline" aria-label={only === "outbound" ? "Chặng đi tới điểm tập kết" : "Chặng về nhà"}>
        {only === "outbound"
          ? <Segments title={`Trước ngày 1 · ${leg.homeCity} → ${leg.hubName}`} segments={leg.outbound} minutes={leg.outboundMinutes} headingLevel={inlineHeadingLevel} />
          : <Segments title={`Sau ngày cuối · ${leg.hubName} → ${leg.homeCity}`} segments={leg.return} minutes={leg.returnMinutes} headingLevel={inlineHeadingLevel} />}
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
      <Segments title="Trước chuyến đi" segments={leg.outbound} minutes={leg.outboundMinutes} />
      <Segments title="Sau chuyến đi" segments={leg.return} minutes={leg.returnMinutes} />
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

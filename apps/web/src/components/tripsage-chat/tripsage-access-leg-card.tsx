import { Bus, Plane, TrainFront, Van } from "lucide-react";
import type { ReactNode } from "react";

import { ACCESS_MODE_LABELS, type AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { formatVnd } from "@/modules/tripsage-chat/tripsage-cost";

const ICON: Record<keyof typeof ACCESS_MODE_LABELS, ReactNode> = {
  FLIGHT: <Plane size={14} aria-hidden="true" />, SLEEPER_BUS: <Bus size={14} aria-hidden="true" />, TRAIN: <TrainFront size={14} aria-hidden="true" />, SHUTTLE: <Van size={14} aria-hidden="true" />,
};
const hours = (minutes: number) => `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}`;
const formatDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function segmentPriceLabel(segment: AccessLegPart["outbound"][number]): string {
  if (segment.priceVndPerPerson === 0) return "chưa có giá";
  if (segment.priceSource === "GOOGLE_FLIGHTS") {
    const dateSuffix = segment.priceLookupDate ? ` ngày ${formatDate(segment.priceLookupDate)}` : "";
    return `${formatVnd(segment.priceVndPerPerson)}/người (giá tham khảo từ Google Flights${dateSuffix})`;
  }
  return `~${formatVnd(segment.priceVndPerPerson)}/người (ước tính)`;
}

function Segments({ title, segments, minutes }: { title: string; segments: AccessLegPart["outbound"]; minutes: number }) {
  return (
    <div>
      <h5 className="font-semibold">{title} · khoảng {hours(minutes)}</h5>
      <ol className="tripsage-access-segments">
        {segments.map((segment, index) => (
          <li key={index}>
            {ICON[segment.mode]} <strong>{ACCESS_MODE_LABELS[segment.mode]}</strong> {segment.from} → {segment.to}
            <span className="assistant-muted"> · {segment.departTime ? `đi ${segment.departTime}, ` : ""}{hours(segment.durationMinutes)} · {segmentPriceLabel(segment)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Estimated access leg to a trip hub (ADR-42 §4). Not validated, not booked, not saved. */
/** `only` shows one direction inside the itinerary: the way to the hub before day 1, the way home after the last day. */
export function TripsageAccessLegCard({ leg, only }: { leg: AccessLegPart; only?: "outbound" | "return" }) {
  if (only) {
    return (
      <section className="tripsage-access tripsage-access-inline" aria-label={only === "outbound" ? "Chặng đi tới điểm tập kết" : "Chặng về nhà"}>
        {only === "outbound"
          ? <Segments title={`Trước ngày 1 · ${leg.homeCity} → ${leg.hubName}`} segments={leg.outbound} minutes={leg.outboundMinutes} />
          : <Segments title={`Sau ngày cuối · ${leg.hubName} → ${leg.homeCity}`} segments={leg.return} minutes={leg.returnMinutes} />}
      </section>
    );
  }
  const hasGoogleFlights = [...leg.outbound, ...leg.return].some(segment => segment.priceSource === "GOOGLE_FLIGHTS");
  return (
    <section className="tripsage-access" aria-label="Chặng tiếp cận">
      <h4>Từ {leg.homeCity} tới {leg.hubName}</h4>
      <Segments title="Trước chuyến đi" segments={leg.outbound} minutes={leg.outboundMinutes} />
      <Segments title="Sau chuyến đi" segments={leg.return} minutes={leg.returnMinutes} />
      <p className="text-sm">Tổng tham khảo cả nhóm {leg.travelers} người: <strong>{leg.totalVnd > 0 ? formatVnd(leg.totalVnd) : "chưa có giá"}</strong></p>
      {hasGoogleFlights && (
        <p className="assistant-muted text-xs">Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.</p>
      )}
      <p className="assistant-muted text-xs">Chặng tiếp cận chưa được kiểm tra bằng bộ kiểm tra lịch trình; ứng dụng không đặt vé. Số ngày chuyến đi tính từ {leg.hubName}.</p>
    </section>
  );
}

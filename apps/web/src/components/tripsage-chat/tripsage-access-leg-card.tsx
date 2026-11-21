import { Bus, Plane, TrainFront, Van } from "lucide-react";
import type { ReactNode } from "react";

import { ACCESS_MODE_LABELS, type AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { formatVnd } from "@/modules/tripsage-chat/tripsage-cost";

const ICON: Record<keyof typeof ACCESS_MODE_LABELS, ReactNode> = {
  FLIGHT: <Plane size={14} aria-hidden="true" />, SLEEPER_BUS: <Bus size={14} aria-hidden="true" />, TRAIN: <TrainFront size={14} aria-hidden="true" />, SHUTTLE: <Van size={14} aria-hidden="true" />,
};
const hours = (minutes: number) => `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}`;

function Segments({ title, segments, minutes }: { title: string; segments: AccessLegPart["outbound"]; minutes: number }) {
  return (
    <div>
      <h5 className="font-semibold">{title} · khoảng {hours(minutes)}</h5>
      <ol className="tripsage-access-segments">
        {segments.map((segment, index) => (
          <li key={index}>
            {ICON[segment.mode]} <strong>{ACCESS_MODE_LABELS[segment.mode]}</strong> {segment.from} → {segment.to}
            <span className="assistant-muted"> · {segment.departTime ? `đi ${segment.departTime}, ` : ""}{hours(segment.durationMinutes)} · ~{formatVnd(segment.priceVndPerPerson)}/người</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Estimated access leg to a trip hub (ADR-42 §4). Not validated, not booked, not saved. */
export function TripsageAccessLegCard({ leg }: { leg: AccessLegPart }) {
  return (
    <section className="tripsage-access" aria-label="Chặng tiếp cận">
      <h4>Từ {leg.homeCity} tới {leg.hubName}</h4>
      <Segments title="Trước chuyến đi" segments={leg.outbound} minutes={leg.outboundMinutes} />
      <Segments title="Sau chuyến đi" segments={leg.return} minutes={leg.returnMinutes} />
      <p className="text-sm">Ước tính cả nhóm {leg.travelers} người: <strong>{formatVnd(leg.totalVnd)}</strong></p>
      <p className="assistant-muted text-xs">Giờ và giá chỉ là ước tính, chưa được kiểm tra; ứng dụng không đặt vé. Số ngày chuyến đi tính từ {leg.hubName}.</p>
    </section>
  );
}

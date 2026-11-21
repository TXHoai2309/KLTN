import { Fragment } from "react";
import { formatVietnameseDate } from "@/lib/date-only";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { INTEREST_OPTIONS, PACE_OPTIONS, TRANSPORT_OPTIONS } from "@/modules/trip-requirement/trip-requirement-contract";
import { withTripInfoDefaults, type AssumableField, type DefaultedField, type TripsageTripInfo } from "@/modules/tripsage-chat/tripsage-chat-context";

const label = (options: readonly { value: string; label: string }[], value: string) => options.find(option => option.value === value)?.label ?? value;
const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

type SummaryPart = { key: string; text: string; assumed?: boolean };

/** Read-only line of what the assistant relies on (ADR-42 / ADR-43 / ADR-44). Assumed and default values are marked; changes go through the conversation. */
export function TripsageTripSummary({ tripInfo, journey }: { tripInfo: TripsageTripInfo | null; journey: TripJourney | null }) {
  if (!tripInfo && !journey?.origin?.confirmed) return null;
  const { info, defaulted } = withTripInfoDefaults(tripInfo ?? {});
  const assumed = new Set<AssumableField>(tripInfo?.assumedFields ?? []);
  const mark = (key: DefaultedField, text: string) => (defaulted.includes(key) ? `${text} (mặc định)` : text);
  const departureMinute = tripInfo?.departureMinute ?? journey?.departureMinute ?? info.departureMinute;
  const returnDeadlineMinute = tripInfo?.returnDeadlineMinute ?? journey?.returnDeadlineMinute ?? info.returnDeadlineMinute;
  const parts: SummaryPart[] = [
    info.transport ? { key: "transport", text: assumed.has("transport") ? `${label(TRANSPORT_OPTIONS, info.transport)} (giả định)` : label(TRANSPORT_OPTIONS, info.transport), assumed: assumed.has("transport") } : null,
    info.durationDays ? { key: "durationDays", text: assumed.has("durationDays") ? `${info.durationDays} ngày (giả định)` : `${info.durationDays} ngày`, assumed: assumed.has("durationDays") } : null,
    info.startDate ? { key: "startDate", text: assumed.has("startDate") ? `${formatVietnameseDate(info.startDate)} (giả định)` : formatVietnameseDate(info.startDate), assumed: assumed.has("startDate") } : null,
    journey?.origin?.confirmed ? { key: "origin", text: assumed.has("origin") ? `Xuất phát: ${journey.origin.label} (giả định)` : `Xuất phát: ${journey.origin.label}`, assumed: assumed.has("origin") } : null,
    { key: "departureMinute", text: mark("departureMinute", `Đi ${clock(departureMinute)}`) },
    { key: "returnDeadlineMinute", text: mark("returnDeadlineMinute", `Về trước ${clock(returnDeadlineMinute)}`) },
    { key: "travelers", text: mark("travelers", `${info.travelers} người`) },
    { key: "pace", text: mark("pace", label(PACE_OPTIONS, info.pace)) },
    { key: "interests", text: mark("interests", info.interests.map(value => label(INTEREST_OPTIONS, value)).join(", ")) },
  ].filter((part): part is SummaryPart => part !== null);
  return (
    <p className="mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="group" aria-label="Thông tin chuyến đi" lang="vi">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && " · "}
          {part.assumed
            ? <span data-assumed="true" className="rounded border border-dashed border-primary/50 bg-primary/5 px-1.5 py-0.5 text-primary">{part.text}</span>
            : <span>{part.text}</span>}
        </Fragment>
      ))}{" "}
      <span className="text-muted-foreground">— nhắn để đổi bất cứ lúc nào</span>
    </p>
  );
}

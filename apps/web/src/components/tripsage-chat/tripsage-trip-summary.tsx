import { formatVietnameseDate } from "@/lib/date-only";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import { INTEREST_OPTIONS, PACE_OPTIONS, TRANSPORT_OPTIONS } from "@/modules/trip-requirement/trip-requirement-contract";
import { withTripInfoDefaults, type DefaultedField, type TripsageTripInfo } from "@/modules/tripsage-chat/tripsage-chat-context";

const label = (options: readonly { value: string; label: string }[], value: string) => options.find(option => option.value === value)?.label ?? value;
const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Read-only line of what the assistant relies on (ADR-42 / ADR-43). Defaults are marked; changes go through the conversation. */
export function TripsageTripSummary({ tripInfo, journey }: { tripInfo: TripsageTripInfo | null; journey: TripJourney | null }) {
  if (!tripInfo && !journey?.origin?.confirmed) return null;
  const { info, defaulted } = withTripInfoDefaults(tripInfo ?? {});
  const mark = (key: DefaultedField, text: string) => (defaulted.includes(key) ? `${text} (mặc định)` : text);
  const departureMinute = tripInfo?.departureMinute ?? journey?.departureMinute ?? info.departureMinute;
  const returnDeadlineMinute = tripInfo?.returnDeadlineMinute ?? journey?.returnDeadlineMinute ?? info.returnDeadlineMinute;
  const parts = [
    info.transport ? label(TRANSPORT_OPTIONS, info.transport) : null,
    info.durationDays ? `${info.durationDays} ngày` : null,
    info.startDate ? formatVietnameseDate(info.startDate) : null,
    journey?.origin?.confirmed ? `Xuất phát: ${journey.origin.label}` : null,
    mark("departureMinute", `Đi ${clock(departureMinute)}`),
    mark("returnDeadlineMinute", `Về trước ${clock(returnDeadlineMinute)}`),
    mark("travelers", `${info.travelers} người`),
    mark("pace", label(PACE_OPTIONS, info.pace)),
    mark("interests", info.interests.map(value => label(INTEREST_OPTIONS, value)).join(", ")),
  ].filter(Boolean);
  return (
    <p className="mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="group" aria-label="Thông tin chuyến đi" lang="vi">
      {parts.join(" · ")} <span className="text-muted-foreground">— nhắn để đổi bất cứ lúc nào</span>
    </p>
  );
}

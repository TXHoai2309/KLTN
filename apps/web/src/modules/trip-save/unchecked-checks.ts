import { z } from "zod";
import { EXTERNAL_PLACE_ID_PREFIX } from "../trip-planner/external-place-id";
import type { PlannerResult } from "../trip-planner/planner-contract";

/** Ticket 09 (ADR-36 #4, Q21'a): which missing-data checks may be saved after an explicit confirmation. Pure; used by server and client. */
export const UNCHECKED_CHECK_KEYS = ["OPENING_HOURS", "MINIMUM_DURATION", "TRAVEL_TIME", "SCHEDULE_CONFLICTS"] as const;
export const UNCHECKED_REASON_CODES = ["EXTERNAL_PLACE_UNVERIFIED", "OPENING_UNKNOWN", "MINIMUM_UNKNOWN", "ROUTE_UNKNOWN"] as const;
export const UNCHECKED_REVISION = "unchecked-save-v1";

export const uncheckedItemSchema = z.object({
  check: z.enum(UNCHECKED_CHECK_KEYS),
  reasonCode: z.enum(UNCHECKED_REASON_CODES),
  placeId: z.string().min(1).max(128).startsWith(EXTERNAL_PLACE_ID_PREFIX),
}).strict();
export type UncheckedItem = z.infer<typeof uncheckedItemSchema>;

/** The user's explicit confirmation. The server compares it with its own list; it is never stored from the client. */
export const acknowledgedUncheckedSchema = z.object({ confirmed: z.literal(true), items: z.array(uncheckedItemSchema).min(1).max(40) }).strict();
export type AcknowledgedUnchecked = z.infer<typeof acknowledgedUncheckedSchema>;

export const storedUncheckedSchema = z.object({ revision: z.literal(UNCHECKED_REVISION), items: z.array(uncheckedItemSchema).max(40) }).strict();

export type UncheckedAssessment = { kind: "PASS" } | { kind: "BLOCKED" } | { kind: "UNCHECKED"; items: UncheckedItem[] };

const CHECK_LABEL: Record<UncheckedItem["check"], string> = {
  OPENING_HOURS: "Giờ mở cửa", MINIMUM_DURATION: "Thời lượng tối thiểu", TRAVEL_TIME: "Thời gian di chuyển", SCHEDULE_CONFLICTS: "Tính hợp lệ của điểm dừng",
};
const REASON_LABEL: Record<UncheckedItem["reasonCode"], string> = {
  EXTERNAL_PLACE_UNVERIFIED: "địa điểm ngoài danh mục, KLTN chưa kiểm tra",
  OPENING_UNKNOWN: "chưa có giờ mở cửa",
  MINIMUM_UNKNOWN: "chưa có thời lượng tối thiểu",
  ROUTE_UNKNOWN: "chưa có thời gian di chuyển đã xác minh",
};
/** Fixed Vietnamese text; never provider text. */
export const uncheckedItemLabel = (item: UncheckedItem) => `${CHECK_LABEL[item.check]}: ${REASON_LABEL[item.reasonCode]}`;

const isExternalId = (id: string | null | undefined): id is string => typeof id === "string" && id.startsWith(EXTERNAL_PLACE_ID_PREFIX);
const keyOf = (item: UncheckedItem) => `${item.check}|${item.reasonCode}|${item.placeId}`;
export const sortUnchecked = (items: readonly UncheckedItem[]) => [...new Map(items.map(item => [keyOf(item), item])).values()].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
export const uncheckedEqual = (a: readonly UncheckedItem[], b: readonly UncheckedItem[]) => JSON.stringify(sortUnchecked(a)) === JSON.stringify(sortUnchecked(b));

/**
 * PASS: every check passes. BLOCKED: any FAILED check, or missing data that is not about an external place. UNCHECKED: only
 * allow-listed missing-data issues attributable to an external place. Unknown is never promoted to PASS.
 */
export function assessUnchecked(result: PlannerResult): UncheckedAssessment {
  if (result.checks.some(check => check.status === "VIOLATION")) return { kind: "BLOCKED" };
  if (result.checks.every(check => check.status === "PASS")) return { kind: "PASS" };
  const stops = result.days.flatMap(day => day.stops);
  const items: UncheckedItem[] = [];
  for (const check of result.checks) {
    if (check.status === "PASS") continue;
    if (!check.issues.length || !(UNCHECKED_CHECK_KEYS as readonly string[]).includes(check.key)) return { kind: "BLOCKED" };
    for (const issue of check.issues) {
      if (!(UNCHECKED_REASON_CODES as readonly string[]).includes(issue.code)) return { kind: "BLOCKED" };
      let placeId: string | null = isExternalId(issue.destinationId) ? issue.destinationId : null;
      if (!placeId && check.key === "TRAVEL_TIME" && issue.code === "ROUTE_UNKNOWN" && issue.destinationId) {
        const from = stops.find(stop => stop.destination.id === issue.destinationId)?.inbound?.fromDestinationId;
        if (isExternalId(from)) placeId = from;
      }
      if (!placeId) return { kind: "BLOCKED" };
      items.push({ check: check.key as UncheckedItem["check"], reasonCode: issue.code as UncheckedItem["reasonCode"], placeId });
    }
  }
  return items.length ? { kind: "UNCHECKED", items: sortUnchecked(items) } : { kind: "BLOCKED" };
}

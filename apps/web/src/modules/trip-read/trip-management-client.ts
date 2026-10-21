import { sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import type { TripSummary } from "./trip-read-service";

export type TripChange = { tripId: string; deleted: true } | { tripId: string; manuallyCompletedAt: string | null; status: TripSummary["status"]; endDate: string };
export type TripAction = "delete" | boolean;

export async function changeTrip(id: string, action: TripAction, key: string): Promise<MutationOutcome<TripChange>> {
 const result = await sendIdempotentMutation<TripChange>(`/api/trips/${encodeURIComponent(id)}${action === "delete" ? "" : "/completion"}`, {
  idempotencyKey: key,
  init: action === "delete" ? { method: "DELETE" } : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: action }) },
 });
 if (result.status !== "SUCCESS") return result;
 const data = result.data;
 if (data && data.tripId === id && (action === "delete" ? "deleted" in data && data.deleted === true :
  "status" in data && ["UPCOMING", "ONGOING", "COMPLETED"].includes(data.status) && typeof data.endDate === "string" &&
  (action ? typeof data.manuallyCompletedAt === "string" && Number.isFinite(Date.parse(data.manuallyCompletedAt)) && data.status === "COMPLETED" : data.manuallyCompletedAt === null))) return result;
 return { status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa nhận được kết quả xác nhận hợp lệ. Kiểm tra lại với cùng yêu cầu." }, retryWithSameKey: true };
}

/** Never optimistically remove/reclassify an unconfirmed write. */
export function applyTripChange(items: TripSummary[], outcome: MutationOutcome<TripChange>): TripSummary[] {
 if (outcome.status !== "SUCCESS") return items;
 const change = outcome.data;
 return "deleted" in change ? items.filter(trip => trip.id !== change.tripId) : items.map(trip => trip.id === change.tripId ? { ...trip, status: change.status, endDate: change.endDate, manuallyCompletedAt: change.manuallyCompletedAt } : trip);
}

import type { MutationApiResponse } from "../../lib/mutation-contract";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";

export type TripSaveClientResult =
  | { status: "SUCCESS"; tripId: string; validation: TripValidation }
  | { status: "FAILED"; message: string; validation?: TripValidation }
  | { status: "UNKNOWN"; message: string };

const unknown = (): TripSaveClientResult => ({ status: "UNKNOWN", message: "Chưa xác định được kết quả lưu. Thử lại sẽ dùng cùng mã yêu cầu." });

function isValidation(value: unknown): value is TripValidation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripValidation>;
  return typeof candidate.canConfirm === "boolean" && !!candidate.groups
    && ["openingHours", "minimumDuration", "travelTime", "scheduleConflict"].every(name => {
      const group = candidate.groups?.[name as keyof TripValidation["groups"]];
      return group && ["SATISFIED", "VIOLATION", "INSUFFICIENT_DATA"].includes(group.status) && Array.isArray(group.findings);
    });
}

/** UNKNOWN preserves the caller's key and proposal so a retry can reconcile the write. */
export async function submitTripSave(proposal: TripProposal, key: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<TripSaveClientResult> {
  try {
    const response = await fetcher("/api/trips", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ confirm: true, proposal }), signal,
    });
    const result = await response.json() as MutationApiResponse<{ tripId: string; validation: TripValidation }>;
    if (response.ok && result.success === true && result.operationStatus === "SUCCESS"
      && typeof result.data?.tripId === "string" && result.data.tripId.length > 0 && isValidation(result.data.validation) && result.data.validation.canConfirm) {
      return { status: "SUCCESS", tripId: result.data.tripId, validation: result.data.validation };
    }
    if (!result.success && result.operationStatus === "FAILED" && typeof result.error?.message === "string") {
      const details = result.error.details as { validation?: unknown } | undefined;
      return { status: "FAILED", message: result.error.message, ...(isValidation(details?.validation) ? { validation: details.validation } : {}) };
    }
    return unknown();
  } catch {
    return unknown();
  }
}

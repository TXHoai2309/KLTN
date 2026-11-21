import type { MutationApiResponse } from "../../lib/mutation-contract";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import type { ChosenLodgingSaveItem } from "./trip-save-contract";
import { uncheckedItemSchema, type UncheckedItem } from "./unchecked-checks";

export type TripSaveClientResult =
  | { status: "SUCCESS"; tripId: string; validation: TripValidation; unchecked: UncheckedItem[] }
  | { status: "FAILED"; message: string; validation?: TripValidation; /** Server's own list when it refused for a missing or stale confirmation. */ unchecked?: UncheckedItem[] }
  | { status: "UNKNOWN"; message: string };

const unknown = (): TripSaveClientResult => ({
  status: "UNKNOWN",
  message: "Chưa xác định được kết quả lưu. Yêu cầu có thể đã được xử lý. Hãy kiểm tra lại trước khi tiếp tục để tránh lưu trùng.",
});

function isValidation(value: unknown): value is TripValidation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripValidation>;
  return typeof candidate.canConfirm === "boolean" && !!candidate.groups
    && ["openingHours", "minimumDuration", "travelTime", "scheduleConflict"].every(name => {
      const group = candidate.groups?.[name as keyof TripValidation["groups"]];
      return group && ["SATISFIED", "VIOLATION", "INSUFFICIENT_DATA"].includes(group.status) && Array.isArray(group.findings);
    });
}

export async function requestTripValidation(proposal: TripProposal, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<
  { ok: true; validation: TripValidation } | { ok: false; message: string }
> {
  try {
    const response = await fetcher("/api/trips/validate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal }), cache: "no-store", signal,
    });
    const result = await response.json() as { success?: boolean; data?: { validation?: unknown }; error?: { message?: string } };
    if (response.ok && result.success === true && isValidation(result.data?.validation)) {
      return { ok: true, validation: result.data.validation };
    }
    return { ok: false, message: result.error?.message || "Chưa thể kiểm tra hành trình. Vui lòng thử lại." };
  } catch {
    return { ok: false, message: "Chưa thể kiểm tra hành trình. Vui lòng thử lại." };
  }
}

/** UNKNOWN preserves the caller's key and proposal so a retry can reconcile the write. */
const parseUnchecked = (value: unknown): UncheckedItem[] | null => {
  const parsed = uncheckedItemSchema.array().safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** `acknowledgedUnchecked` is the user's explicit confirmation of the unchecked items; omitted for an all-PASS schedule. */
export async function submitTripSave(
  proposal: TripProposal,
  key: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
  acknowledgedUnchecked?: UncheckedItem[],
  chosenLodgings?: readonly ChosenLodgingSaveItem[],
): Promise<TripSaveClientResult> {
  try {
    const response = await fetcher("/api/trips", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        confirm: true,
        proposal,
        ...(acknowledgedUnchecked ? { acknowledgedUnchecked: { confirmed: true, items: acknowledgedUnchecked } } : {}),
        ...(chosenLodgings?.length ? { chosenLodgings } : {}),
      }),
      signal,
    });
    const result = await response.json() as MutationApiResponse<{ tripId: string; validation: TripValidation; unchecked?: unknown }>;
    const savedUnchecked = result.success === true && result.data?.unchecked !== undefined ? parseUnchecked(result.data.unchecked) : [];
    // A schedule saved with unchecked items is SUCCESS only if the server returned its list and no check is FAILED; it is never PASS.
    const confirmedOk = (validation: TripValidation) => validation.canConfirm ? savedUnchecked?.length === 0 : !!savedUnchecked?.length && acknowledgedUnchecked !== undefined && Object.values(validation.groups).every(group => group.status !== "VIOLATION");
    if (response.ok && result.success === true && result.operationStatus === "SUCCESS"
      && typeof result.data?.tripId === "string" && result.data.tripId.length > 0 && isValidation(result.data.validation) && confirmedOk(result.data.validation)) {
      return { status: "SUCCESS", tripId: result.data.tripId, validation: result.data.validation, unchecked: savedUnchecked ?? [] };
    }
    if (!result.success && result.operationStatus === "FAILED" && typeof result.error?.message === "string") {
      const details = result.error.details as { validation?: unknown; unchecked?: unknown } | undefined;
      const serverList = parseUnchecked(details?.unchecked);
      return { status: "FAILED", message: result.error.message, ...(isValidation(details?.validation) ? { validation: details.validation } : {}), ...(serverList?.length ? { unchecked: serverList } : {}) };
    }
    return unknown();
  } catch {
    return unknown();
  }
}

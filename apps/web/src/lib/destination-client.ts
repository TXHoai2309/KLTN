import { destinationDtoSchema, destinationListSchema, type DestinationDto, type DestinationInput } from "@/modules/destination/destination-contract";
import type { MutationOutcome } from "./mutation-contract";
import { fetchAuthWithTimeout } from "./auth-fetch";
export class DestinationReadError extends Error { constructor(readonly status: number) { super("Không thể tải dữ liệu điểm đến."); } }
export async function loadDestinations(page = 1, transport: typeof fetch = fetchAuthWithTimeout) {
  const response = await transport(`/api/admin/destinations?page=${page}`, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new DestinationReadError(response.status);
  return destinationListSchema.parse(body.data);
}
export async function loadDestination(id: string, transport: typeof fetch = fetchAuthWithTimeout) {
  const response = await transport(`/api/admin/destinations/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new DestinationReadError(response.status);
  return destinationDtoSchema.parse(body.data);
}
export async function saveDestination(id: string | null, input: DestinationInput, key: string, transport: typeof fetch = fetchAuthWithTimeout): Promise<MutationOutcome<DestinationDto>> {
  const unknown = (): MutationOutcome<DestinationDto> => ({ status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác định kết quả ghi." }, retryWithSameKey: true });
  try {
    const response = await transport(id ? `/api/admin/destinations/${encodeURIComponent(id)}` : "/api/admin/destinations", { method: id ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) });
    const body = await response.json();
    if (response.ok && body?.success === true && body.operationStatus === "SUCCESS") {
      const parsed = destinationDtoSchema.safeParse(body.data);
      if (parsed.success) return { status: "SUCCESS", data: parsed.data, replayed: response.headers.get("Idempotency-Replayed") === "true" };
    }
    if (!response.ok && body?.success === false && body.operationStatus === "FAILED" && typeof body.error?.code === "string") return { status: "FAILED", httpStatus: response.status, error: { code: body.error.code, message: "Không thể lưu điểm đến." } };
    return unknown();
  } catch { return unknown(); }
}

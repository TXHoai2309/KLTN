import { cultureDtoSchema, cultureListSchema, destinationLookupSchema, type CultureDto, type CultureInput } from "@/modules/culture/culture-contract";
import type { MutationOutcome } from "./mutation-contract";
import { fetchAuthWithTimeout } from "./auth-fetch";
export class CultureReadError extends Error { constructor(readonly status: number) { super("Không thể tải dữ liệu văn hóa."); } }
export async function loadCultureList(page = 1, transport: typeof fetch = fetchAuthWithTimeout) {
  const response = await transport(`/api/admin/culture?page=${page}`, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new CultureReadError(response.status);
  return cultureListSchema.parse(body.data);
}
export async function loadCulture(id: string, transport: typeof fetch = fetchAuthWithTimeout) {
  const response = await transport(`/api/admin/culture/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new CultureReadError(response.status);
  return cultureDtoSchema.parse(body.data);
}
export async function saveCulture(id: string | null, input: CultureInput, key: string, transport: typeof fetch = fetchAuthWithTimeout): Promise<MutationOutcome<CultureDto>> {
  const result = await writeCultureRequest(id ? `/api/admin/culture/${encodeURIComponent(id)}` : "/api/admin/culture", id ? "PATCH" : "POST", input, key, transport);
  if (id && result.status === "SUCCESS" && result.data.id !== id) return { status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Kết quả không khớp thao tác." }, retryWithSameKey: true };
  return result;
}
export async function changeCultureVisibility(id: string, visibility: CultureDto["visibility"], key: string, transport: typeof fetch = fetchAuthWithTimeout): Promise<MutationOutcome<CultureDto>> {
  const result = await writeCultureRequest(`/api/admin/culture/${encodeURIComponent(id)}/visibility`, "PATCH", { visibility }, key, transport);
  if (result.status === "SUCCESS" && (result.data.id !== id || result.data.visibility !== visibility)) return { status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Kết quả không khớp thao tác." }, retryWithSameKey: true };
  return result;
}
async function writeCultureRequest(url: string, method: string, input: unknown, key: string, transport: typeof fetch): Promise<MutationOutcome<CultureDto>> {
  const unknown = (): MutationOutcome<CultureDto> => ({ status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác định kết quả ghi." }, retryWithSameKey: true });
  try {
    const response = await transport(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) });
    const body = await response.json();
    if (response.ok && body?.success === true && body.operationStatus === "SUCCESS") {
      const parsed = cultureDtoSchema.safeParse(body.data);
      if (parsed.success) return { status: "SUCCESS", data: parsed.data, replayed: response.headers.get("Idempotency-Replayed") === "true" };
    }
    if (!response.ok && body?.success === false && body.operationStatus === "FAILED" && typeof body.error?.code === "string") return { status: "FAILED", httpStatus: response.status, error: { code: body.error.code, message: "Không thể lưu nội dung văn hóa." } };
    return unknown();
  } catch { return unknown(); }
}

export async function lookupDestinations(query: string, page = 1, transport: typeof fetch = fetchAuthWithTimeout) {
 const response = await transport(`/api/admin/culture/destination-lookup?q=${encodeURIComponent(query)}&page=${page}`, {cache: "no-store", credentials: "same-origin"});
 const body = await response.json();
 if (!response.ok || body?.success !== true) throw new CultureReadError(response.status);
 return destinationLookupSchema.parse(body.data);
}

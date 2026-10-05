import type { MutationOutcome } from "./mutation-contract";
import { fetchAuthWithTimeout } from "./auth-fetch";
import { accountDtoSchema, type AccountDto } from "@/modules/account/account-contract";

const unknownOutcome = (): MutationOutcome<AccountDto> => ({ status: "UNKNOWN", error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa thể xác định kết quả cập nhật." }, retryWithSameKey: true });
export async function loadAccount(transport: typeof fetch = fetchAuthWithTimeout): Promise<AccountDto> {
  const response = await transport("/api/account", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || body?.success !== true) throw new Error("ACCOUNT_READ_FAILED");
  return accountDtoSchema.parse(body.data);
}
export async function saveAccount(name: string, key: string, transport: typeof fetch = fetchAuthWithTimeout): Promise<MutationOutcome<AccountDto>> {
  try {
    const response = await transport("/api/account", {
      method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ name }),
    });
    const body = await response.json();
    if (response.ok && body?.success === true && body.operationStatus === "SUCCESS") {
      const parsed = accountDtoSchema.safeParse(body.data);
      if (parsed.success) return { status: "SUCCESS", data: parsed.data };
    }
    if (!response.ok && body?.success === false && body.operationStatus === "FAILED" && typeof body.error?.code === "string") {
      return { status: "FAILED", error: { code: body.error.code, message: "Không thể cập nhật thông tin." }, httpStatus: response.status };
    }
    return unknownOutcome();
  } catch { return unknownOutcome(); }
}

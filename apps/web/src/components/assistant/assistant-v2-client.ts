import type { AssistantV2Request } from "../../modules/assistant-agent-v2/http-contract";
import type { PlanningV2Turn } from "../../modules/assistant-agent-v2/travel-planning-session";
import type { InTripV2Turn } from "../../modules/assistant-agent-v2/in-trip-session";

export type AssistantV2Reply = { runtimeVersion: "v2"; sessionId?: string; stateToken?: string; mode: "PLANNING" | "IN_TRIP"; turn?: PlanningV2Turn | InTripV2Turn; save?: { save?: { status: string; data?: { tripId: string } }; workspace?: { savedTripId: string | null; pendingSaveKey: string | null }; message?: string } };
export class AssistantV2ClientError extends Error {
  constructor(readonly code: string, readonly status: number) { super(status === 409 ? "Phiên hoặc phương án đã thay đổi. Mở lại phiên để đọc trạng thái hiện tại; yêu cầu cũ chưa được tự động áp dụng." : status === 401 || status === 403 ? "Vui lòng đăng nhập lại để tiếp tục." : "Chưa hoàn tất yêu cầu. Giữ nội dung và kiểm tra lại cùng thao tác."); }
}
export async function assistantV2Fetch(request: AssistantV2Request, key: string, fetcher: typeof fetch = fetch): Promise<AssistantV2Reply> {
  const response = await fetcher("/api/ai/planning", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(request), signal: AbortSignal.timeout(115_000) });
  const envelope = await response.json() as { success?: boolean; data?: AssistantV2Reply; error?: { code?: string } };
  if (!response.ok || envelope.success !== true || envelope.data?.runtimeVersion !== "v2") throw new AssistantV2ClientError(envelope.error?.code ?? "ASSISTANT_UNAVAILABLE", response.status);
  return envelope.data;
}

import { sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import {
  companionDraftSchema,
  companionFormContextSchema,
  companionPreviewSchema,
  publicCompanionSchema,
  publishCompanionResultSchema,
  type CompanionDraft,
  type CompanionFormContext,
  type CompanionIntroduction,
  type PublicCompanion,
  type PublishCompanionResult,
} from "./companion-contract";

export class CompanionClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "COMPANION_CLIENT_ERROR", status = 500) {
    super(message);
    this.name = "CompanionClientError";
    this.code = code;
    this.status = status;
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CompanionClientError("Không thể đọc phản hồi từ máy chủ.", "INVALID_SERVER_RESPONSE", response.status);
  }
}

function extractErrorMessage(payload: unknown, fallback: string): { message: string; code: string } {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "object" && error !== null) {
      const message = typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
      const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "COMPANION_API_ERROR";
      return { message, code };
    }
  }
  return { message: fallback, code: "COMPANION_API_ERROR" };
}

export async function fetchCompanionFormContext(tripId: string): Promise<CompanionFormContext> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/publication`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải thông tin chuyến đi.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionFormContextSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu thông tin chuyến đi không đúng định dạng.", "INVALID_FORM_CONTEXT", 500);
  }
  return parsed.data;
}

export async function previewCompanionDraft(tripId: string, draft: CompanionDraft): Promise<CompanionIntroduction> {
  const validatedDraft = companionDraftSchema.parse(draft);
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/publication/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(validatedDraft),
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tạo bản xem trước.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionPreviewSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu xem trước không đúng định dạng.", "INVALID_PREVIEW_DATA", 500);
  }
  return parsed.data.introduction;
}

export async function publishCompanionTrip(
  tripId: string,
  draft: CompanionDraft,
  idempotencyKey: string,
): Promise<MutationOutcome<PublishCompanionResult>> {
  const validatedDraft = companionDraftSchema.parse(draft);
  const outcome = await sendIdempotentMutation<PublishCompanionResult>(
    `/api/trips/${encodeURIComponent(tripId)}/publication`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validatedDraft, confirm: true }),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = publishCompanionResultSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.tripId !== tripId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả xác nhận hợp lệ. Kiểm tra lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchPublicCompanion(publicationId: string): Promise<PublicCompanion> {
  const response = await fetch(`/api/trip-companions/${encodeURIComponent(publicationId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không tìm thấy thông tin chuyến đi công khai.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = publicCompanionSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu chuyến đi công khai không đúng định dạng.", "INVALID_PUBLIC_COMPANION", 500);
  }
  return parsed.data;
}

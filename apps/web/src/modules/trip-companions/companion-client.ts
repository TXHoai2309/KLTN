import { sendIdempotentMutation } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import {
  companionDraftSchema,
  companionFormContextSchema,
  companionPreviewSchema,
  publicCompanionSchema,
  publishCompanionResultSchema,
  companionViewerContextSchema,
  companionListSchema,
  type CompanionDraft,
  type CompanionFormContext,
  type CompanionIntroduction,
  type PublicCompanion,
  type PublishCompanionResult,
  type CompanionViewerContext,
  type CompanionList,
  type CompanionListQuery,
} from "./companion-contract";
import { z } from "zod";
import {
  companionGroupSchema,
  companionGroupMutationSchema,
  type CompanionGroup,
} from "./companion-group-contract";
import {
  companionManageSchema,
  companionManageInputSchema,
  type CompanionManage,
} from "./companion-management-contract";
import {
  companionMembersSchema,
  type CompanionMembers,
} from "./companion-members-contract";
import {
  companionSendSchema,
  companionSendResultSchema,
  companionHistorySchema,
  companionDeltaSchema,
  type CompanionHistory,
  type CompanionDelta,
  type CompanionMessage,
} from "./companion-chat-contract";
import {
  companionReadInputSchema,
  companionReadResultSchema,
  companionUnreadSchema,
  type CompanionUnread,
} from "./companion-unread-contract";

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

export async function fetchCompanionViewerContext(publicationId: string): Promise<CompanionViewerContext> {
  const response = await fetch(`/api/trip-companions/${encodeURIComponent(publicationId)}/viewer`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401 || response.status === 403) {
    return { relationship: "VISITOR" };
  }

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể xác định quyền xem.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionViewerContextSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu phân quyền người xem không đúng định dạng.", "INVALID_VIEWER_CONTEXT", 500);
  }
  return parsed.data;
}

export async function fetchPublicCompanions(query: Partial<CompanionListQuery> = {}): Promise<CompanionList> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.departureFrom) params.set("departureFrom", query.departureFrom);
  if (query.departureTo) params.set("departureTo", query.departureTo);
  if (query.transport) params.set("transport", query.transport);
  if (query.availableOnly) params.set("availableOnly", "true");
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);

  const qs = params.toString();
  const url = `/api/trip-companions${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải danh sách chuyến đi.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionListSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu danh sách chuyến đi không đúng định dạng.", "INVALID_COMPANION_LIST", 500);
  }
  return parsed.data;
}

export async function fetchMyCompanionPublications(query: Partial<CompanionListQuery> = {}): Promise<CompanionList> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.departureFrom) params.set("departureFrom", query.departureFrom);
  if (query.departureTo) params.set("departureTo", query.departureTo);
  if (query.transport) params.set("transport", query.transport);
  if (query.availableOnly) params.set("availableOnly", "true");
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);

  const qs = params.toString();
  const url = `/api/trip-companions/mine${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải danh sách chuyến đi của bạn.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionListSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu danh sách chuyến đi không đúng định dạng.", "INVALID_COMPANION_LIST", 500);
  }
  return parsed.data;
}

export async function fetchJoinedCompanions(query: Partial<CompanionListQuery> = {}): Promise<CompanionList> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.departureFrom) params.set("departureFrom", query.departureFrom);
  if (query.departureTo) params.set("departureTo", query.departureTo);
  if (query.transport) params.set("transport", query.transport);
  if (query.availableOnly) params.set("availableOnly", "true");
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);

  const qs = params.toString();
  const url = `/api/trip-companions/joined${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải danh sách chuyến bạn tham gia.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionListSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu danh sách chuyến đi không đúng định dạng.", "INVALID_COMPANION_LIST", 500);
  }
  return parsed.data;
}

export async function joinCompanionTrip(
  publicationId: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string }>> {
  const outcome = await sendIdempotentMutation<{ publicationId: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/join`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionGroupMutationSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả tham gia hợp lệ. Hãy thử lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function leaveCompanionTrip(
  publicationId: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string }>> {
  const outcome = await sendIdempotentMutation<{ publicationId: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/leave`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionGroupMutationSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả rời nhóm hợp lệ. Hãy thử lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchCompanionGroup(publicationId: string): Promise<CompanionGroup> {
  const response = await fetch(`/api/trip-companions/${encodeURIComponent(publicationId)}/group`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải thông tin nhóm đồng hành.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionGroupSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu thông tin nhóm không đúng định dạng.", "INVALID_GROUP_DATA", 500);
  }
  return parsed.data;
}

export type CompanionManageInput = z.infer<typeof companionManageInputSchema>;

export async function fetchCompanionManagement(publicationId: string): Promise<CompanionManage> {
  const response = await fetch(`/api/trip-companions/${encodeURIComponent(publicationId)}/management`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải thông tin quản lý chuyến đi.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionManageSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu quản lý chuyến đi không đúng định dạng.", "INVALID_MANAGEMENT_DATA", 500);
  }
  return parsed.data;
}

export async function updateCompanionManagement(
  publicationId: string,
  input: CompanionManageInput,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string; managementRevision: number }>> {
  const outcome = await sendIdempotentMutation<{ publicationId: string; managementRevision: number }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/management`,
    {
      idempotencyKey,
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = z
    .object({
      publicationId: z.string(),
      managementRevision: z.number().int().nonnegative(),
    })
    .safeParse(outcome.data);

  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả cập nhật quản lý hợp lệ. Hãy thử lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchCompanionMembers(publicationId: string): Promise<CompanionMembers> {
  const response = await fetch(`/api/trip-companions/${encodeURIComponent(publicationId)}/members`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải danh sách thành viên.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionMembersSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu danh sách thành viên không đúng định dạng.", "INVALID_MEMBERS_DATA", 500);
  }
  return parsed.data;
}

export async function banCompanionMember(
  publicationId: string,
  userId: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string }>> {
  const outcome = await sendIdempotentMutation<{ publicationId: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/members/${encodeURIComponent(userId)}/ban`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionGroupMutationSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được xác nhận loại thành viên hợp lệ. Hãy thử lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchCompanionMessages(
  publicationId: string,
  query?: { before?: string; limit?: number },
): Promise<CompanionHistory> {
  const params = new URLSearchParams();
  if (query?.before) {
    params.set("before", query.before);
  }
  if (query?.limit) {
    params.set("limit", String(query.limit));
  }
  const queryString = params.toString();
  const url = `/api/trip-companions/${encodeURIComponent(publicationId)}/messages${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải lịch sử trò chuyện.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionHistorySchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu lịch sử trò chuyện không đúng định dạng.", "INVALID_HISTORY_DATA", 500);
  }
  return parsed.data;
}

export async function sendCompanionMessage(
  publicationId: string,
  text: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string; messageId: string; sequence: string }>> {
  const validated = companionSendSchema.parse({ text });
  const outcome = await sendIdempotentMutation<{ publicationId: string; messageId: string; sequence: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/messages`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionSendResultSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được xác nhận gửi tin nhắn. Hãy thử lại với cùng nội dung.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchCompanionDelta(
  publicationId: string,
  after: string,
  limit?: number,
): Promise<CompanionDelta> {
  const query = new URLSearchParams();
  query.set("after", after);
  if (limit !== undefined) {
    query.set("limit", String(limit));
  }

  const response = await fetch(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/messages/delta?${query.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  const envelope = await response.json().catch(() => null);

  if (!response.ok) {
    const error = envelope?.error;
    throw new CompanionClientError(
      error?.message || "Không thể tải cập nhật tin nhắn mới.",
      error?.code || "DELTA_FETCH_FAILED",
      response.status,
    );
  }

  if (!envelope || envelope.success !== true || !envelope.data) {
    throw new CompanionClientError(
      "Phản hồi cập nhật tin nhắn không hợp lệ.",
      "INVALID_DELTA_ENVELOPE",
      response.status,
    );
  }

  const parsed = companionDeltaSchema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new CompanionClientError(
      "Dữ liệu cập nhật tin nhắn không đúng định dạng.",
      "INVALID_DELTA_DATA",
      500,
    );
  }

  return parsed.data;
}

export async function reconcileCompanionMessage(
  publicationId: string,
  text: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string; messageId: string; sequence: string }>> {
  const validated = companionSendSchema.parse({ text });
  const outcome = await sendIdempotentMutation<{ publicationId: string; messageId: string; sequence: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/messages/reconcile`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionSendResultSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả đối soát tin nhắn. Hãy thử lại cùng nội dung.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function fetchCompanionUnread(
  query: { after?: string; limit?: number } = {},
): Promise<CompanionUnread> {
  const params = new URLSearchParams();
  if (query.after) params.set("after", query.after);
  if (query.limit) params.set("limit", String(query.limit));

  const qs = params.toString();
  const url = `/api/trip-companions/unread${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await parseJsonResponse(response);
  if (!response.ok || (typeof body === "object" && body !== null && "success" in body && !(body as { success: boolean }).success)) {
    const { message, code } = extractErrorMessage(body, "Không thể tải thông tin tin nhắn chưa đọc.");
    throw new CompanionClientError(message, code, response.status);
  }

  const parsed = companionUnreadSchema.safeParse((body as { data?: unknown }).data);
  if (!parsed.success) {
    throw new CompanionClientError("Dữ liệu tin nhắn chưa đọc không đúng định dạng.", "INVALID_UNREAD_DATA", 500);
  }
  return parsed.data;
}

export async function markCompanionRead(
  publicationId: string,
  sequence: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string; sequence: string }>> {
  const validated = companionReadInputSchema.parse({ sequence });
  const outcome = await sendIdempotentMutation<{ publicationId: string; sequence: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/read`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionReadResultSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả cập nhật trạng thái đã đọc hợp lệ. Hãy thử lại.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

export async function cancelCompanionTrip(
  publicationId: string,
  idempotencyKey: string,
): Promise<MutationOutcome<{ publicationId: string }>> {
  const outcome = await sendIdempotentMutation<{ publicationId: string }>(
    `/api/trip-companions/${encodeURIComponent(publicationId)}/cancel`,
    {
      idempotencyKey,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    },
  );

  if (outcome.status !== "SUCCESS") {
    return outcome;
  }

  const parsed = companionGroupMutationSchema.safeParse(outcome.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId) {
    return {
      status: "UNKNOWN",
      error: {
        code: "OPERATION_STATUS_UNKNOWN",
        message: "Chưa nhận được kết quả hủy chuyến hợp lệ. Hãy thử lại với cùng yêu cầu.",
      },
      retryWithSameKey: true,
    };
  }

  return outcome;
}

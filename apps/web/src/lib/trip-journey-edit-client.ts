import type { TripProposal } from "@/modules/trip-validation/trip-proposal-contract";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import type { TripValidation } from "@/modules/trip-validation/trip-validation";

export type JourneyEditPreviewResult =
  | {
      ok: true;
      baseRevision: string;
      candidate: TripProposal | null;
      journeyPlan: JourneyPlan | null;
      validation?: TripValidation;
      eligibleForConfirmation: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type JourneyEditApplyResult =
  | {
      status: "SUCCESS";
      data?: { tripId: string; updatedAt: string };
    }
  | {
      status: "FAILED";
      code?: string;
      message: string;
    }
  | {
      status: "UNKNOWN";
      message: string;
    };

export async function previewJourneyEditClient(
  tripId: string,
  baseRevision: string,
  journey: TripJourney,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<JourneyEditPreviewResult> {
  try {
    const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/journey/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ baseRevision, journey }),
      signal,
    });

    const result = (await response.json()) as {
      success?: boolean;
      data?: {
        baseRevision: string;
        candidate: TripProposal | null;
        journeyPlan: JourneyPlan | null;
        validation?: TripValidation;
        eligibleForConfirmation: boolean;
      };
      error?: { code?: string; message?: string };
    };

    if (response.ok && result.success && result.data) {
      return {
        ok: true,
        baseRevision: result.data.baseRevision,
        candidate: result.data.candidate,
        journeyPlan: result.data.journeyPlan,
        validation: result.data.validation,
        eligibleForConfirmation: result.data.eligibleForConfirmation,
      };
    }

    return {
      ok: false,
      code: result.error?.code || "PREVIEW_FAILED",
      message: result.error?.message || "Không thể xem trước phương án di chuyển.",
    };
  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "Lỗi kết nối khi xem trước phương án di chuyển.",
    };
  }
}

export async function applyJourneyEditClient(
  tripId: string,
  baseRevision: string,
  candidate: TripProposal,
  key: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<JourneyEditApplyResult> {
  try {
    const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/journey/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        baseRevision,
        confirmed: true,
        candidate,
      }),
      signal,
    });

    const result = (await response.json()) as {
      success?: boolean;
      operationStatus?: "SUCCESS" | "FAILED" | "UNKNOWN";
      data?: { tripId: string; updatedAt: string };
      error?: { code?: string; message?: string };
    };

    if (response.ok && result.success && result.operationStatus === "SUCCESS") {
      return {
        status: "SUCCESS",
        data: result.data,
      };
    }

    if (result.operationStatus === "FAILED" && result.error) {
      return {
        status: "FAILED",
        code: result.error.code,
        message: result.error.message || "Cập nhật phương án thất bại.",
      };
    }

    return {
      status: "UNKNOWN",
      message:
        result.error?.message ||
        "Chưa xác định được kết quả cập nhật nơi xuất phát. Thử lại sẽ dùng cùng mã yêu cầu.",
    };
  } catch {
    return {
      status: "UNKNOWN",
      message:
        "Mất kết nối trong quá trình lưu. Thử lại sẽ dùng cùng mã yêu cầu để đảm bảo không lặp thao tác.",
    };
  }
}


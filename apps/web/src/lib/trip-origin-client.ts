import {
  ORIGIN_CONTRACT_REVISION,
  type OriginSelection,
  originSelectionSchema,
} from "@/modules/trip-origin/trip-origin-contract";

export type TripOriginValidationOutcome =
  | {
      kind: "VALID";
      revision: typeof ORIGIN_CONTRACT_REVISION;
      origin: OriginSelection;
      coverage: { status: "SUPPORTED"; name: string; license: string };
    }
  | {
      kind: "OUTSIDE_VIETNAM";
      message: string;
    }
  | {
      kind: "COVERAGE_UNKNOWN";
      message: string;
    }
  | {
      kind: "UNAUTHENTICATED";
      message: string;
    }
  | {
      kind: "FORBIDDEN";
      message: string;
    }
  | {
      kind: "INVALID_INPUT";
      message: string;
    }
  | {
      kind: "ERROR";
      code: string;
      message: string;
    };

export async function validateOriginOnServer(
  origin: OriginSelection,
  signal?: AbortSignal,
): Promise<TripOriginValidationOutcome> {
  const parsed = originSelectionSchema.safeParse(origin);
  if (!parsed.success) {
    return {
      kind: "INVALID_INPUT",
      message: "Dữ liệu nơi xuất phát không hợp lệ.",
    };
  }

  try {
    const response = await fetch("/api/trip-origins/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ origin }),
      signal,
    });

    const body = await response.json().catch(() => null);

    if (response.ok && body?.success && body?.data) {
      return {
        kind: "VALID",
        revision: body.data.revision,
        origin: body.data.origin,
        coverage: body.data.coverage,
      };
    }

    const errorCode = body?.error?.code ?? "UNKNOWN_ERROR";
    const errorMessage = body?.error?.message ?? "Không thể kiểm tra vị trí.";

    if (errorCode === "ORIGIN_OUTSIDE_VIETNAM") {
      return {
        kind: "OUTSIDE_VIETNAM",
        message: "Vị trí nằm ngoài phạm vi lãnh thổ Việt Nam được hỗ trợ.",
      };
    }

    if (errorCode === "ORIGIN_COVERAGE_UNKNOWN") {
      return {
        kind: "COVERAGE_UNKNOWN",
        message: "Không thể xác định phạm vi lãnh thổ tại vị trí này.",
      };
    }

    if (response.status === 401 || errorCode === "UNAUTHENTICATED") {
      return {
        kind: "UNAUTHENTICATED",
        message: "Vui lòng đăng nhập để kiểm tra vị trí xuất phát.",
      };
    }

    if (response.status === 403 || errorCode === "FORBIDDEN_ORIGIN" || errorCode === "FORBIDDEN") {
      return {
        kind: "FORBIDDEN",
        message: "Yêu cầu kiểm tra vị trí bị từ chối.",
      };
    }

    if (errorCode === "INVALID_ORIGIN_INPUT" || errorCode === "ORIGIN_INPUT_TOO_LARGE") {
      return {
        kind: "INVALID_INPUT",
        message: errorMessage,
      };
    }

    return {
      kind: "ERROR",
      code: errorCode,
      message: errorMessage,
    };
  } catch (error) {
    if (signal?.aborted) {
      return {
        kind: "ERROR",
        code: "ABORTED",
        message: "Yêu cầu đã bị hủy.",
      };
    }
    return {
      kind: "ERROR",
      code: "NETWORK_ERROR",
      message: "Không thể kết nối đến máy chủ để xác thực vị trí. Vui lòng thử lại.",
    };
  }
}


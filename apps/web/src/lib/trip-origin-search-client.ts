import {
  OSM_ATTRIBUTION,
  type OriginSearchResult,
  originSearchRequestSchema,
} from "@/modules/trip-origin/origin-search-contract";

export type SearchOutcome =
  | {
      status: "RESULTS";
      results: OriginSearchResult[];
      cached: boolean;
      attribution: { text: string; url: string; license: string };
    }
  | {
      status: "NO_RESULTS";
      results: [];
      cached: boolean;
      attribution: { text: string; url: string; license: string };
    }
  | {
      status: "BUSY";
      retryAfterSeconds: number;
      message: string;
    }
  | {
      status: "UNAVAILABLE";
      message: string;
    }
  | {
      status: "INVALID_QUERY";
      message: string;
    }
  | {
      status: "UNAUTHENTICATED";
      message: string;
    }
  | {
      status: "ERROR";
      message: string;
    };

export async function searchOriginNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const parsed = originSearchRequestSchema.safeParse({ query });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "INVALID_QUERY",
      message: issue?.message ?? "Tên địa điểm tìm kiếm không hợp lệ (từ 2 đến 160 ký tự công khai).",
    };
  }

  try {
    const response = await fetch("/api/trip-origins/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: parsed.data.query }),
      signal,
    });

    const body = await response.json().catch(() => null);

    if (response.ok && body?.success && body?.data) {
      const data = body.data;
      if (data.status === "RESULTS" && Array.isArray(data.results)) {
        return {
          status: "RESULTS",
          results: data.results,
          cached: Boolean(data.cached),
          attribution: data.attribution ?? OSM_ATTRIBUTION,
        };
      }
      return {
        status: "NO_RESULTS",
        results: [],
        cached: Boolean(data.cached),
        attribution: data.attribution ?? OSM_ATTRIBUTION,
      };
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retrySeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) || 4 : 4;
      return {
        status: "BUSY",
        retryAfterSeconds: retrySeconds,
        message: `Dịch vụ tìm kiếm đang bận. Vui lòng thử lại sau ${retrySeconds} giây hoặc chọn ghim thủ công.`,
      };
    }

    if (response.status === 503) {
      const message = body?.error?.message;
      return {
        status: "UNAVAILABLE",
        message: typeof message === "string" && /ghim|tọa độ|thủ công/iu.test(message)
          ? message
          : `${message ?? "Dịch vụ tìm kiếm địa điểm tạm thời không khả dụng."} Bạn có thể chọn ghim hoặc nhập tọa độ thủ công.`,
      };
    }

    if (response.status === 401) {
      return {
        status: "UNAUTHENTICATED",
        message: "Vui lòng đăng nhập để tìm kiếm địa điểm xuất phát.",
      };
    }

    if (response.status === 400) {
      return {
        status: "INVALID_QUERY",
        message: body?.error?.message ?? "Từ khóa tìm kiếm không hợp lệ.",
      };
    }

    return {
      status: "ERROR",
      message: body?.error?.message ?? "Đã xảy ra lỗi khi tìm kiếm địa điểm.",
    };
  } catch (error) {
    if (signal?.aborted) {
      return {
        status: "ERROR",
        message: "Đã hủy tìm kiếm.",
      };
    }
    return {
      status: "ERROR",
      message: "Không thể kết nối đến máy chủ tìm kiếm. Bạn có thể cắm ghim thủ công.",
    };
  }
}

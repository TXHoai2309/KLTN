import type { BrowserLocationResult } from "./browser-location";

export type GpsLocation = Omit<Extract<BrowserLocationResult, { status: "OK" }>, "status">;

export type LocationFlowState =
  | { status: "gps_ok"; requestId: number; location: GpsLocation }
  | {
      status: "idle" | "requesting" | "denied" | "unavailable" | "timeout" | "unsupported" | "manual";
      requestId: number;
    };

export type LocationFlowEvent =
  | { type: "REQUEST_GPS" }
  | { type: "SELECT_MANUAL" }
  | { type: "GPS_RESULT"; requestId: number; result: BrowserLocationResult };

const FAILURE_STATES = {
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout",
  UNSUPPORTED: "unsupported",
} as const;

const MESSAGES = {
  idle: "Chọn cách cung cấp vị trí: dùng GPS hoặc chọn thủ công.",
  requesting: "Đang lấy vị trí GPS. Bạn vẫn có thể chuyển sang chọn vị trí thủ công.",
  gps_ok: "Đã lấy được vị trí GPS. Bạn có thể dùng vị trí này hoặc chọn thủ công.",
  denied: "Chưa có quyền truy cập vị trí. Bạn có thể chọn vị trí thủ công hoặc thử lại GPS.",
  unavailable: "Hiện chưa lấy được vị trí GPS. Bạn có thể chọn vị trí thủ công hoặc thử lại.",
  timeout: "Chưa lấy được vị trí GPS trong thời gian chờ. Bạn có thể chọn vị trí thủ công hoặc thử lại.",
  unsupported: "Trình duyệt hiện không hỗ trợ lấy vị trí GPS. Bạn có thể chọn vị trí thủ công.",
  manual: "Chọn vị trí thủ công để tiếp tục.",
} satisfies Record<LocationFlowState["status"], string>;

export function createLocationFlowState(): LocationFlowState {
  return { status: "idle", requestId: 0 };
}

/** Pure transitions only. The caller starts GPS after an explicit user action. */
export function transitionLocationFlow(state: LocationFlowState, event: LocationFlowEvent): LocationFlowState {
  switch (event.type) {
    case "SELECT_MANUAL":
      // Switching modes discards the GPS selection and ignores its pending result.
      return { status: "manual", requestId: state.requestId };
    case "REQUEST_GPS":
      if (state.status === "requesting") return state;
      return { status: "requesting", requestId: state.requestId + 1 };
    case "GPS_RESULT": {
      if (state.status !== "requesting" || event.requestId !== state.requestId) return state;
      if (event.result.status !== "OK") {
        return { status: FAILURE_STATES[event.result.status], requestId: state.requestId };
      }
      const { latitude, longitude, accuracyMeters, capturedAt } = event.result;
      return {
        status: "gps_ok",
        requestId: state.requestId,
        location: { latitude, longitude, accuracyMeters, capturedAt },
      };
    }
  }
}

export function getLocationFlowMessage(state: LocationFlowState): string {
  return MESSAGES[state.status];
}

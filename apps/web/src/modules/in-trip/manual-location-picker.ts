import { parseCoordinateInputs, type MapCoordinate } from "../map/map-model";
import { startMapSession } from "../map/map-session";

export type CoordinateFields = { latitude: string; longitude: string };
export type CoordinateErrors = Partial<Record<keyof CoordinateFields, string>>;
export type ManualLocationMapState = "loading" | "ready" | "error" | "timeout";

export function coordinateFieldsFromValue(value: MapCoordinate | null): CoordinateFields {
  return value
    ? { latitude: String(value.latitude), longitude: String(value.longitude) }
    : { latitude: "", longitude: "" };
}

export function validateManualCoordinates(fields: CoordinateFields):
  | { ok: true; coordinates: MapCoordinate }
  | { ok: false; errors: CoordinateErrors } {
  const coordinates = parseCoordinateInputs(fields.latitude, fields.longitude);
  if (coordinates) return { ok: true, coordinates };
  const errors: CoordinateErrors = {};
  if (!parseCoordinateInputs(fields.latitude, "0")) {
    errors.latitude = fields.latitude.trim()
      ? "Nhập vĩ độ là số từ -90 đến 90, dùng dấu chấm cho phần thập phân."
      : "Nhập vĩ độ để chọn vị trí.";
  }
  if (!parseCoordinateInputs("0", fields.longitude)) {
    errors.longitude = fields.longitude.trim()
      ? "Nhập kinh độ là số từ -180 đến 180, dùng dấu chấm cho phần thập phân."
      : "Nhập kinh độ để chọn vị trí.";
  }
  return { ok: false, errors };
}

/** Preserve the shared map lifecycle and expose its 15-second timeout separately. */
export function startManualLocationMapSession<T>(options: {
  load: () => Promise<T>;
  mount: (library: T, ready: () => void, fail: () => void) => () => void;
  onState: (state: ManualLocationMapState) => void;
}) {
  let timedOut = false;
  return startMapSession({
    ...options,
    onState: state => options.onState(state === "error" && timedOut ? "timeout" : state),
    schedule: callback => setTimeout(() => {
      timedOut = true;
      callback();
    }, 15_000),
  });
}

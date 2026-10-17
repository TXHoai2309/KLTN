import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { isValidMapCoordinate, type MapCoordinate } from "../map/map-model";

function roundCoordinate(value: number): number {
  const rounded = Number(value.toFixed(5));
  return rounded === 0 ? 0 : rounded;
}

export const inTripLocationSchema = z.object({
  source: z.enum(["GPS", "MANUAL"]),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyMeters: z.number().finite().nonnegative().nullable().optional(),
  capturedAt: z.iso.datetime({ offset: true }),
}).strict().refine(isValidMapCoordinate, {
  message: "Tọa độ phải nằm trong miền vĩ độ [-90, 90] và kinh độ [-180, 180].",
}).transform(location => ({
  ...location,
  latitude: roundCoordinate(location.latitude),
  longitude: roundCoordinate(location.longitude),
} satisfies MapCoordinate));

export type InTripLocation = z.output<typeof inTripLocationSchema>;

/** Shape/range normalization only; does not certify regional eligibility or freshness. */
export function normalizeInTripLocation(input: unknown): InTripLocation {
  const result = inTripLocationSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "INVALID_IN_TRIP_LOCATION",
      "Vị trí đầu vào không hợp lệ.",
      400,
      { issues: result.error.issues.map(issue => ({ code: issue.code, path: issue.path })) },
    );
  }
  // Integration seam: the routing/in-trip caller can check an owner-approved regional
  // policy against this result. No Hà Giang boundary or allow/deny policy is decided here.
  return result.data;
}

import "server-only";
import { AppError } from "@/server/http/app-error";
import { missingJourneyFields, tripJourneySchema, type TripJourney } from "./trip-origin-contract";
import { vietnamCoverageAt } from "./vietnam-coverage";

/** Called on the server for manual input, search selection and every write. */
export function assertJourneyCoverage(journey: TripJourney | null | undefined): void {
  if (!journey?.origin) return;
  const coverage = vietnamCoverageAt(journey.origin);
  if (coverage !== "SUPPORTED") throw new AppError(
    coverage === "OUTSIDE" ? "ORIGIN_OUTSIDE_VIETNAM" : "ORIGIN_COVERAGE_UNKNOWN",
    coverage === "OUTSIDE" ? "Nơi xuất phát phải thuộc phạm vi Việt Nam được hỗ trợ." : "Chưa xác định được phạm vi nơi xuất phát. Vui lòng chọn lại.",
    422,
  );
}

export function assertJourneyReady(journey: TripJourney | null | undefined, returnOnly = false): asserts journey is TripJourney {
  const parsed = tripJourneySchema.safeParse(journey);
  if (!parsed.success) throw new AppError("TRIP_JOURNEY_REQUIRED", "Cần xác nhận nơi xuất phát và giờ đi/về trước khi lưu.", 422);
  const missing = missingJourneyFields(parsed.data, returnOnly);
  if (missing.length) throw new AppError("TRIP_JOURNEY_REQUIRED", "Cần bổ sung thông tin đi/về trước khi lưu.", 422, { missing });
  assertJourneyCoverage(parsed.data);
}


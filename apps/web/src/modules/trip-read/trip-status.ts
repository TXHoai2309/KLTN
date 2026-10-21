export type TripStatus = "UPCOMING" | "ONGOING" | "COMPLETED";

/** Operates on Asia/Ho_Chi_Minh calendar labels, not elapsed 24-hour periods. */
export function deriveTripStatus(startDate: string, durationDays: number, referenceDate: string): { status: TripStatus; endDate: string } {
  const end = new Date(`${startDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + durationDays - 1);
  const endDate = end.toISOString().slice(0, 10);
  const status = referenceDate < startDate ? "UPCOMING" : referenceDate > endDate ? "COMPLETED" : "ONGOING";
  return { status, endDate };
}

/** Explicit Trip-level confirmation never changes the date or Visit contract. */
export function effectiveTripStatus(startDate: string, durationDays: number, referenceDate: string, manuallyCompletedAt: Date | string | null) {
  const derived = deriveTripStatus(startDate, durationDays, referenceDate);
  return { ...derived, status: manuallyCompletedAt ? "COMPLETED" as const : derived.status };
}

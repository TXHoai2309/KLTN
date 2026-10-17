import { tripRequirementInputSchema } from "../../trip-requirement/trip-requirement-contract";
import { weekdays } from "../../destination/destination-contract";
import type { PlannerCandidate } from "../planner-candidates";
import type { RouteProvider } from "../planner-routes";

// TEST ONLY: synthetic data. Not factual tourism/corpus evidence and never imported by runtime.
export const referenceTime = new Date("2027-01-01T00:00:00Z");
export const requirement = tripRequirementInputSchema.parse({ startDate: "2027-01-01", durationDays: 2, transport: "MOTORCYCLE", pace: "MODERATE", interests: ["NATURE"], companions: { type: "FRIENDS", groupSize: 2 } });
export function candidate(id: string, overrides: Partial<PlannerCandidate> = {}): PlannerCandidate {
  return { id, name: `TEST Điểm đến ${id}`, description: "Dữ liệu tổng hợp chỉ để kiểm thử giao diện và thuật toán.", area: "khu vực kiểm thử", category: "thiên nhiên",
    address: null, latitude: 23 + id.length / 100, longitude: 105 + id.length / 100, image: null, visibility: "VISIBLE", revision: "1:2027-01-01",
    suggestedDurationMinutes: 60, minimumDurationMinutes: 30,
    openingDays: weekdays.map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 1080 }] })), ...overrides };
}
export const candidates = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"].map(id => candidate(id));
export const fakeRoutes: RouteProvider = { async route(pair) { return { fromDestinationId: pair.from.id, toDestinationId: pair.to.id, status: "VERIFIED", reason: null, durationSeconds: 1800, distanceMeters: 12_000, provider: "GOOGLE_ROUTES" }; } };

import type { PlannerCandidate } from "../modules/trip-planner/planner-candidates";
import type { RouteProvider } from "../modules/trip-planner/planner-routes";
import type { PlanningNeeds } from "../modules/assistant-planning/planning-contract";
export const planningNow = new Date("2026-10-27T03:00:00Z");
export const fixtureNeeds: PlanningNeeds = { requirement: { startDate: "2026-11-02", durationDays: 1, transport: "CAR", pace: null, interests: [], companions: null, mobilityConstraints: null }, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} };
export function planningCandidate(id: string, duration = 60): PlannerCandidate {
  return { id, name: `Điểm ${id}`, description: "Điểm tham quan", area: "Đồng Văn", category: "Thiên nhiên", address: null, latitude: 23, longitude: 105, image: null, visibility: "VISIBLE", revision: "1", suggestedDurationMinutes: duration, minimumDurationMinutes: duration,
    openingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 1080 }] })) };
}
export const fixtureRoutes: RouteProvider = { route: async pair => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, status: "VERIFIED", reason: null, durationSeconds: 600, distanceMeters: 1000, provider: "STADIA_MAPS" }) };

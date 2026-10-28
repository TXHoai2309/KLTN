/** Client-safe examples only; never a runtime fallback. */
import type { CompanionGroup } from "./companion-group-contract";
import { publicCompanionFixture } from "./companion-fixtures";
export const companionGroupFixture = {
  publicationId: publicCompanionFixture.publicationId, relationship: "MEMBER",
  introduction: publicCompanionFixture.introduction, memberCount: 2,
  itinerary: { days: [{ dayIndex: 1, localDate: "2030-11-15", visits: [{
    visitId: "synthetic-visit", order: 1, startMinute: 480, plannedDurationMinutes: 60,
    destination: { destinationId: "synthetic-destination", name: "Điểm đến mẫu", availability: "AVAILABLE", latitude: 23, longitude: 105 },
  }] }] },
} satisfies CompanionGroup;
export const companionCanceledGroupFixture = { ...companionGroupFixture, canSend: false, canceledAt: "2030-11-14T12:02:00.000Z", itineraryRevision: "1" } satisfies CompanionGroup;

/** Synthetic contract examples for FE/tests only. Never a production fallback. */
import type { CompanionDraft, CompanionFormContext, PublicCompanion } from "./companion-contract";
import type { CompanionViewerContext, CompanionList } from "./companion-contract";

export const companionHostViewerFixture = { relationship: "HOST", tripId: "synthetic-trip" } satisfies CompanionViewerContext;
export const companionVisitorFixture = { relationship: "VISITOR" } satisfies CompanionViewerContext;

export const companionDraftFixture = {
  title: "Cùng khám phá Hà Giang", introduction: "Tìm bạn đi cùng, trao đổi thêm trong nhóm khi tính năng tham gia sẵn sàng.",
  additionalCapacity: 2, imageMediaId: "synthetic-media",
} satisfies CompanionDraft;
export const publicCompanionFixture = {
  publicationId: "synthetic-publication",
  recruitmentStatus: "OPEN",
  introduction: {
    title: companionDraftFixture.title, introduction: companionDraftFixture.introduction,
    host: { displayName: "Chủ chuyến mẫu", avatarUrl: null },
    startDate: "2030-11-15", endDate: "2030-11-16", durationDays: 2, transport: "MOTORCYCLE",
    routeSummary: [{ destinationId: "synthetic-destination", name: "Điểm đến mẫu" }],
    additionalCapacity: 2, availablePlaces: 2,
    image: { url: "https://example.invalid/companion-fixture.jpg", alt: "Ảnh điểm đến mẫu" },
  },
} satisfies PublicCompanion;
export const companionFormFixture = {
  trip: {
    host: publicCompanionFixture.introduction.host, startDate: "2030-11-15", endDate: "2030-11-16",
    durationDays: 2, transport: "MOTORCYCLE", routeSummary: publicCompanionFixture.introduction.routeSummary,
  },
  imageOptions: [{ mediaId: "synthetic-media", ...publicCompanionFixture.introduction.image }],
  publication: null,
} satisfies CompanionFormContext;

export const companionListQueryFixture = {
  q: "Điểm đến mẫu", departureFrom: "2030-11-15", departureTo: "2030-11-15",
  transport: "MOTORCYCLE", availableOnly: "true", limit: "12",
} as const;
export const companionListFixture = { items: [publicCompanionFixture], total: 1, nextCursor: null } satisfies CompanionList;
export const companionEmptyListFixture = { items: [], total: 0, nextCursor: null } satisfies CompanionList;

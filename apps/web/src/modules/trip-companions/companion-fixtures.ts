/** Synthetic contract examples for FE/tests only. Never a production fallback. */
import type { CompanionDraft, CompanionFormContext, PublicCompanion } from "./companion-contract";

export const companionDraftFixture = {
  title: "Cùng khám phá Hà Giang", introduction: "Tìm bạn đi cùng, trao đổi thêm trong nhóm khi tính năng tham gia sẵn sàng.",
  additionalCapacity: 2, imageMediaId: "synthetic-media",
} satisfies CompanionDraft;
export const publicCompanionFixture = {
  publicationId: "synthetic-publication",
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

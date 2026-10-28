import type { CompanionManage } from "./companion-management-contract";
import { companionDraftFixture, companionFormFixture } from "./companion-fixtures";
export const companionManageFixture = {
  publicationId: "synthetic-publication", tripId: "synthetic-trip", draft: companionDraftFixture,
  visibility: "PUBLIC", recruitmentOpen: true, managementRevision: 0, activeMemberCount: 0,
  canReopen: true, trip: companionFormFixture.trip, imageOptions: companionFormFixture.imageOptions,
} satisfies CompanionManage;

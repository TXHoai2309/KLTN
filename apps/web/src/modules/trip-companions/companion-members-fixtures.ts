import type { CompanionMembers } from "./companion-members-contract";
export const companionMembersFixture = {
  publicationId: "synthetic-publication", host: { userId: "synthetic-host", displayName: "Chủ chuyến mẫu", avatarUrl: null },
  members: [{ userId: "synthetic-member", displayName: "Thành viên mẫu", avatarUrl: null, joinedAt: "2030-11-14T12:00:00.000Z" }],
} satisfies CompanionMembers;

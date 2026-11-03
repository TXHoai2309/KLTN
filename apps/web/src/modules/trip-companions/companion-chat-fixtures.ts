import type { CompanionDelta, CompanionHistory, CompanionMessage } from "./companion-chat-contract";
export const companionMessageFixture = {
  id: "synthetic-message", sequence: "1", kind: "USER", text: "Hẹn trao đổi tuyến đường trong nhóm.",
  author: { userId: "synthetic-member", displayName: "Thành viên mẫu", avatarUrl: null }, createdAt: "2030-11-14T12:00:00.000Z",
} satisfies CompanionMessage;
export const companionHistoryFixture = { publicationId: "synthetic-publication", items: [companionMessageFixture], olderCursor: null, highWaterCursor: "1", canSend: true } satisfies CompanionHistory;
export const companionDeltaFixture = { publicationId: "synthetic-publication", items: [companionMessageFixture], nextCursor: "1", highWaterCursor: "1", hasMore: false, canSend: true, relationship: "MEMBER" } satisfies CompanionDelta;
export const companionSystemMessageFixture = { id: "synthetic-system-message", sequence: "2", kind: "SYSTEM", text: "Chủ chuyến đã lưu thay đổi giờ.", author: null, createdAt: "2030-11-14T12:01:00.000Z", notice: { type: "ITINERARY_CHANGED", revision: "1", changes: { dates: false, destinations: false, times: true } } } satisfies CompanionMessage;
export const companionCanceledMessageFixture = { id: "synthetic-cancel-message", sequence: "3", kind: "SYSTEM", text: "Chủ chuyến đã hủy chuyến đồng hành.", author: null, createdAt: "2030-11-14T12:02:00.000Z", notice: { type: "COMPANION_CANCELED" } } satisfies CompanionMessage;

import { describe, expect, it } from "vitest";
import { companionDeltaSchema, companionDeltaQuerySchema, companionHistoryQuerySchema, companionHistorySchema, companionMessageSchema, companionSendSchema, companionSequenceSchema } from "./companion-chat-contract";
import { companionCanceledMessageFixture, companionDeltaFixture, companionHistoryFixture, companionMessageFixture, companionSystemMessageFixture } from "./companion-chat-fixtures";
import { companionReadInputSchema, companionUnreadSchema } from "./companion-unread-contract";
import { companionUnreadFixture } from "./companion-unread-fixtures";
import { companionItineraryChanges } from "./companion-itinerary-notice";
describe("TC-07 shared chat contract", () => {
  it("shares strict plain-text user-message and history fixtures", () => {
    expect(companionMessageSchema.parse(companionMessageFixture)).toEqual(companionMessageFixture);
    expect(companionHistorySchema.parse(companionHistoryFixture)).toEqual(companionHistoryFixture);
    expect(companionSendSchema.parse({ text: " <script>x</script> https://example.invalid " })).toEqual({ text: "<script>x</script> https://example.invalid" });
    for (const value of [{ text: " " }, { text: "x", authorId: "spoof" }, { text: "x", kind: "SYSTEM" }, { text: "x".repeat(4001) }]) expect(companionSendSchema.safeParse(value).success).toBe(false);
  });
  it("distinguishes trusted itinerary/cancellation notices from USER messages", () => {
    for (const message of [companionSystemMessageFixture, companionCanceledMessageFixture]) expect(companionMessageSchema.parse(message)).toEqual(message);
    expect(companionMessageSchema.safeParse({ ...companionCanceledMessageFixture, author: companionMessageFixture.author }).success).toBe(false);
  });
  it("validates exact bigint cursors and bounded history queries", () => {
    for (const cursor of ["-1", "01", "1.0", "9223372036854775808", "NaN"]) expect(companionSequenceSchema.safeParse(cursor).success).toBe(false);
    expect(companionSequenceSchema.parse("9223372036854775807")).toBe("9223372036854775807");
    expect(companionHistoryQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(companionHistoryQuerySchema.safeParse({ after: "0" }).success).toBe(false);
  });
  it("shares strict delta fixtures, preserving consumed cursor separately from high-water cut", () => {
    expect(companionDeltaSchema.parse(companionDeltaFixture)).toEqual(companionDeltaFixture);
    expect(companionDeltaQuerySchema.parse({})).toEqual({ after: "0", limit: 100 });
    expect(companionDeltaQuerySchema.safeParse({ before: "1" }).success).toBe(false);
  });
  it("shares private unread summary and accepts only a principal-free valid read cursor", () => {
    expect(companionUnreadSchema.parse(companionUnreadFixture)).toEqual(companionUnreadFixture);
    expect(companionReadInputSchema.safeParse({ sequence: "1", userId: "spoof" }).success).toBe(false);
    expect(companionReadInputSchema.safeParse({ sequence: "1.0" }).success).toBe(false);
  });
  it("detects semantic date/destination/time changes without depending on regenerated visit IDs", () => {
    const before = { startDate: "2030-11-15", durationDays: 1, transport: "CAR" as const, days: [{ dayIndex: 1, visits: [{ visitId: "old", destinationId: "point", order: 1, startMinute: 480, plannedDurationMinutes: 60 }] }] };
    const unchanged = structuredClone(before); unchanged.days[0]!.visits[0]!.visitId = "regenerated";
    expect(companionItineraryChanges(before, unchanged)).toEqual({ dates: false, destinations: false, times: false });
    const changed = structuredClone(before); changed.startDate = "2030-11-16"; changed.days[0]!.visits[0]!.destinationId = "new"; changed.days[0]!.visits[0]!.startMinute = 540;
    expect(companionItineraryChanges(before, changed)).toEqual({ dates: true, destinations: true, times: true });
  });
});

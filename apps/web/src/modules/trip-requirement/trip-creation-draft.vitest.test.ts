import { describe, expect, it } from "vitest";
import {
  clearTripCreationDraft,
  readTripCreationDraft,
  writeTripCreationDraft,
} from "./trip-creation-draft";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

describe("trip-creation-draft session persistence", () => {
  it("saves, restores, scopes by userId, expires after TTL, and clears cleanly", () => {
    const store = createMemoryStorage();
    const fields = {
      startDate: "2026-12-01",
      durationDays: "3",
      transport: "MOTORCYCLE",
      companionType: "SOLO",
      companionGroupSize: "",
      interests: ["SCENERY"],
      pace: "BALANCED",
      mobilityFlags: [],
      mobilityNote: "",
    };

    expect(
      writeTripCreationDraft(
        "user-a",
        { fields, journey: null, planner: null, activeTab: "details" },
        store,
        1_000,
      ),
    ).toBe(true);

    // Scoped to user-a only
    expect(readTripCreationDraft("user-b", store, 2_000)).toBeNull();

    const restored = readTripCreationDraft("user-a", store, 2_000);
    expect(restored?.fields.startDate).toBe("2026-12-01");
    expect(restored?.activeTab).toBe("details");

    // Expired after 12h
    expect(readTripCreationDraft("user-a", store, 1_000 + 13 * 60 * 60 * 1000)).toBeNull();

    // Clear removes draft
    writeTripCreationDraft("user-a", { fields, journey: null, planner: null, activeTab: "details" }, store, 5_000);
    clearTripCreationDraft("user-a", store);
    expect(readTripCreationDraft("user-a", store, 6_000)).toBeNull();
  });
});

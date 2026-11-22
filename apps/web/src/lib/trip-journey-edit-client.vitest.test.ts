import { describe, expect, it, vi } from "vitest";
import { applyJourneyEditClient, previewJourneyEditClient } from "./trip-journey-edit-client";
import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import type { TripProposal } from "@/modules/trip-validation/trip-proposal-contract";

describe("trip-journey-edit-client", () => {
  const dummyJourney: TripJourney = {
    origin: {
      label: "Bến xe Mỹ Đình",
      latitude: 21.0285,
      longitude: 105.7785,
      source: "NOMINATIM",
      confirmed: true,
    },
    returnDepartureMinute: null,
    departureMinute: 360,
    returnDeadlineMinute: 1200,
  };

  const dummyCandidate: TripProposal = {
    startDate: "2026-11-20",
    durationDays: 2,
    transport: "CAR",
    journey: dummyJourney,
    days: [
      {
        dayIndex: 1,
        visits: [
          { destinationId: "dest-1", order: 1, startMinute: 540, plannedDurationMinutes: 60 },
        ],
      },
      {
        dayIndex: 2,
        visits: [
          { destinationId: "dest-2", order: 1, startMinute: 600, plannedDurationMinutes: 60 },
        ],
      },
    ],
  };

  describe("previewJourneyEditClient", () => {
    it("returns ok: true when preview succeeds", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            baseRevision: "2026-11-04T12:00:00.000Z",
            candidate: dummyCandidate,
            journeyPlan: {
              legs: [],
              totals: { drivingSeconds: 14400, restMinutes: 30, distanceMeters: 300000 },
              policy: "roadside-rest-v1",
            },
            eligibleForConfirmation: true,
          },
        }),
      });

      const result = await previewJourneyEditClient(
        "trip-1",
        "2026-11-04T12:00:00.000Z",
        dummyJourney,
        undefined,
        mockFetch as unknown as typeof fetch
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.eligibleForConfirmation).toBe(true);
        expect(result.journeyPlan?.totals.restMinutes).toBe(30);
      }
    });

    it("handles preview error response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          success: false,
          error: { code: "TRIP_REVISION_CONFLICT", message: "Hành trình đã thay đổi." },
        }),
      });

      const result = await previewJourneyEditClient(
        "trip-1",
        "2026-11-04T12:00:00.000Z",
        dummyJourney,
        undefined,
        mockFetch as unknown as typeof fetch
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TRIP_REVISION_CONFLICT");
      }
    });
  });

  describe("applyJourneyEditClient", () => {
    it("returns SUCCESS on valid apply", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { tripId: "trip-1", updatedAt: "2026-11-04T12:30:00.000Z" },
        }),
      });

      const result = await applyJourneyEditClient(
        "trip-1",
        "2026-11-04T12:00:00.000Z",
        dummyCandidate,
        "key-123",
        undefined,
        mockFetch as unknown as typeof fetch
      );

      expect(result.status).toBe("SUCCESS");
    });

    it("returns UNKNOWN on network disconnection for reconciliation", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

      const result = await applyJourneyEditClient(
        "trip-1",
        "2026-11-04T12:00:00.000Z",
        dummyCandidate,
        "key-123",
        undefined,
        mockFetch as unknown as typeof fetch
      );

      expect(result.status).toBe("UNKNOWN");
    });
  });
});

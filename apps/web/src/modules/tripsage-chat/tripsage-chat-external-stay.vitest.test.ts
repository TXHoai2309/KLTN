import { describe, expect, it, vi } from "vitest";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";

// Ticket 08b: the default stay lives in ONE constant; changing it changes the whole behaviour.
// Vitest runs with isolate:false here, so the override is scoped with doMock/doUnmock and fresh module imports.
const STAY_MODULE = "../trip-planner/planner-external-stay";

describe("external place default stay is a single constant", () => {
  it("a changed constant changes the candidate and the scheduled stay everywhere", async () => {
    vi.resetModules();
    vi.doMock(STAY_MODULE, () => ({ EXTERNAL_PLACE_DEFAULT_STAY_MINUTES: 90 }));
    try {
      const { externalPlannerCandidate } = await import("../trip-planner/planner-candidates");
      const { schedulePlannerDays } = await import("../trip-planner/planner-engine");
      const candidate = externalPlannerCandidate({ placeId: "ChIJx", name: "Quán X", latitude: 22.8, longitude: 104.9 });
      expect(candidate).toMatchObject({ id: "ext:google:ChIJx", visibility: "EXTERNAL", openingDays: [], minimumDurationMinutes: null, suggestedDurationMinutes: 90, external: true });
      const requirement = tripRequirementInputSchema.parse({ startDate: "2026-11-02", durationDays: 1, transport: "CAR", interests: ["NATURE"] });
      const [day] = schedulePlannerDays(requirement, [[candidate]], new Map());
      expect(day!.stops[0]!.visitDurationMinutes).toBe(90);
    } finally {
      vi.doUnmock(STAY_MODULE);
      vi.resetModules();
    }
  });

  it("the default is 60 minutes", async () => {
    const { EXTERNAL_PLACE_DEFAULT_STAY_MINUTES } = await import("../trip-planner/planner-external-stay");
    expect(EXTERNAL_PLACE_DEFAULT_STAY_MINUTES).toBe(60);
  });
});

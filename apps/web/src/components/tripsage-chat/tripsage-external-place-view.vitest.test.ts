import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";
import { externalPlannerCandidate } from "../../modules/trip-planner/planner-candidates";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { tripRequirementInputSchema } from "../../modules/trip-requirement/trip-requirement-contract";
import { buildItineraryMapView } from "../../modules/map/itinerary-map-model";
import { TripsageItineraryView } from "./tripsage-itinerary-view";

// Ticket 08b UI: a place outside the catalogue is labelled, its stay is an estimate, unverified checks are listed.
async function proposal() {
  const requirement = tripRequirementInputSchema.parse({ startDate: "2026-11-02", durationDays: 1, transport: "CAR", interests: ["NATURE"] });
  const needs = { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} };
  const ext = externalPlannerCandidate({ placeId: "ChIJx", name: "Quán Cà Phê Mèo", latitude: 22.8, longitude: 104.9 });
  return scheduleSelection(needs, { days: [["a", ext.id]] }, [planningCandidate("a"), ext], fixtureRoutes, planningNow);
}

describe("external place presentation", () => {
  it("labels the place, marks the stay as an estimate, lists unchecked checks and shows no outside link or logo", async () => {
    const html = renderToStaticMarkup(createElement(TripsageItineraryView, { proposal: await proposal() }));
    expect(html).toContain("ngoài danh mục (chưa kiểm)");
    expect(html).toContain("ước tính"); // the stop list moved to the timeline; the notice still states the estimate
    expect(html).toContain("Google Maps");
    expect(html).toContain("Giờ mở cửa: chưa kiểm được");
    expect(html).toContain("Thời lượng tối thiểu: chưa kiểm được");
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toContain("<img");
  });

  it("keeps the coordinates on the map stops so the marker can be drawn", async () => {
    const result = await proposal();
    const view = buildItineraryMapView(result.days, null);
    const external = view.stops.find(s => s.destination.external)!;
    expect(external.destination).toMatchObject({ latitude: 22.8, longitude: 104.9 });
  });
});

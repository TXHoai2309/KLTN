import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ItineraryMap } from "./itinerary-map";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";

it("shows the complete itinerary without day controls in overview-only mode and preserves the Trip controls", async () => {
  const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 2 } };
  const { days } = await scheduleSelection(needs, { days: [["a"], ["b"]] }, [planningCandidate("a"), planningCandidate("b")], fixtureRoutes, planningNow);
  const props = { day: days[0]!, days, selectedDestinationId: null, focusSelection: false, onSelect: () => {} };
  const overview = renderToStaticMarkup(createElement(ItineraryMap, { ...props, overviewOnly: true }));
  expect(overview).toContain("Bản đồ toàn hành trình 2 ngày");
  expect(overview).toContain("Màu tuyến theo ngày");
  expect(overview).not.toContain("Phạm vi bản đồ");
  expect(overview).toContain("Vừa bản đồ");
  const trip = renderToStaticMarkup(createElement(ItineraryMap, props));
  expect(trip).toContain("Phạm vi bản đồ");
  expect(trip).toContain("Bản đồ điểm dừng ngày 1");
});

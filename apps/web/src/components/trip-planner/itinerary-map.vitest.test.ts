import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  expect(overview).toContain('aria-label="Vừa bản đồ"');
  const trip = renderToStaticMarkup(createElement(ItineraryMap, props));
  expect(trip).toContain("Phạm vi bản đồ");
  expect(trip).toContain("Bản đồ điểm dừng ngày 1");
  expect(trip).toContain('aria-label="Ngày 1"');
  expect(trip).toContain('aria-label="Toàn hành trình"');
  expect(trip).toContain("planner-map-scope-icon");
  expect(trip).toContain("planner-map-scope-label");
  expect(trip).toContain("planner-map-fit-label");
});

it("defines container queries on .planner-map-workspace for >=360px, 240-359px, and <240px without mid-word wrapping", () => {
  const css = readFileSync(resolve(process.cwd(), "src/components/trip-planner/trip-planner.css"), "utf8");
  expect(css).toMatch(/\.planner-map-workspace\s*\{[^}]*container-type:\s*inline-size/);
  expect(css).toMatch(/\.planner-map-scope button,\s*\.planner-map-fit\s*\{[^}]*white-space:\s*nowrap/);
  expect(css).toMatch(/@container\s+itinerary-map\s*\(max-width:\s*359px\)/);
  expect(css).toMatch(/@container\s+itinerary-map\s*\(max-width:\s*239px\)/);
});

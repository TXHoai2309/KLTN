import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";
import { externalPlannerCandidate } from "../../modules/trip-planner/planner-candidates";
import { fixtureNeeds, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../../modules/trip-origin/trip-origin-fixtures";
import { TripsageSaveSection } from "./tripsage-save-section";

const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = { route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }), coordinateRoute: async () => verified } as never;
const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, journey: COMPLETE_JOURNEY_FIXTURE } };
const ext = externalPlannerCandidate({ placeId: "ChIJx", name: "Quán Cà Phê Mèo", latitude: 22.8, longitude: 104.98 });
const run = (days: string[][], candidates = [planningCandidate("a"), planningCandidate("b"), ext]) => scheduleSelection(needs, { days }, candidates, routes, planningNow);

describe("Tripsage Save box", () => {
  it("unchecked schedule: names each unchecked item and the place, needs a tick, and relabels the button", async () => {
    const html = renderToStaticMarkup(createElement(TripsageSaveSection, { result: await run([["a", ext.id]]) }));
    expect(html).toContain("chưa kiểm");
    expect(html).toContain("Quán Cà Phê Mèo");
    expect(html).toContain("Giờ mở cửa: chưa có giờ mở cửa");
    expect(html).toContain("Thời lượng tối thiểu: chưa có thời lượng tối thiểu");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Xác nhận và lưu hành trình");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain(">Lưu hành trình<");
  });

  it("all-PASS schedule keeps the plain button without a confirmation box", async () => {
    const html = renderToStaticMarkup(createElement(TripsageSaveSection, { result: await run([["a", "b"]]) }));
    expect(html).toContain("Lưu hành trình");
    expect(html).not.toContain('type="checkbox"');
  });

  it("a schedule that is not saveable offers no Save", async () => {
    const html = renderToStaticMarkup(createElement(TripsageSaveSection, { result: await run([["a"]], [{ ...planningCandidate("a"), openingDays: [] }]) }));
    expect(html).toContain("chưa thể lưu");
    expect(html).not.toContain("<button");
  });
});

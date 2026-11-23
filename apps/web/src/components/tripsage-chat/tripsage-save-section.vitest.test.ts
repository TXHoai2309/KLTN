import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("Bug 5: renders frameless md desktop and lg mobile save buttons without legacy 40px pill or idle box text, preserving all save states", async () => {
    const okResult = await run([["a", "b"]]);

    // Desktop idle (md 34px)
    const desktopHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, { result: okResult, primaryLabel: "Lưu chuyến", buttonSize: "md" }),
    );
    expect(desktopHtml).toContain("tv-btn tv-btn--primary tv-btn--md");
    expect(desktopHtml).not.toContain("assistant-save-button");
    expect(desktopHtml).not.toContain("Lịch trình chưa được lưu");

    // Mobile idle (lg 44px)
    const mobileHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, { result: okResult, primaryLabel: "Lưu chuyến", buttonSize: "lg" }),
    );
    expect(mobileHtml).toContain("tv-btn tv-btn--primary tv-btn--lg");
    expect(mobileHtml).not.toContain("assistant-save-button");
    expect(mobileHtml).not.toContain("Lịch trình chưa được lưu");

    // Pending
    const pendingHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: okResult,
        primaryLabel: "Lưu chuyến",
        initialView: { state: "pending", message: "Đang lưu hành trình…", tripId: null, unchecked: [] },
      }),
    );
    expect(pendingHtml).toContain("Đang lưu…");
    expect(pendingHtml).toMatch(/<button[^>]*disabled/);

    // Success -> "Đã lưu" + link "Mở chuyến đi"
    const successHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: okResult,
        primaryLabel: "Lưu chuyến",
        initialView: { state: "success", message: "Đã lưu.", tripId: "trip-123", unchecked: [] },
      }),
    );
    expect(successHtml).toContain("Đã lưu");
    expect(successHtml).toContain("Mở chuyến đi");
    expect(successHtml).toContain('href="/trips/trip-123"');

    // Failed
    const failedHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: okResult,
        primaryLabel: "Lưu chuyến",
        initialView: { state: "failed", message: "Không thể lưu lúc này.", tripId: null, unchecked: [] },
      }),
    );
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("Không thể lưu lúc này.");

    // Unknown -> idempotent check button
    const unknownHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: okResult,
        primaryLabel: "Lưu chuyến",
        initialView: { state: "unknown", message: "Chưa rõ kết quả lưu.", tripId: null, unchecked: [] },
      }),
    );
    expect(unknownHtml).toContain('role="status"');
    expect(unknownHtml).toContain("Kiểm tra lại kết quả lưu");

    // CSS rules: frameless .tripsage-save, no legacy 40px .assistant-save-button override, slim mobile footer
    const css = readFileSync(resolve(process.cwd(), "src/components/assistant/assistant.css"), "utf8");
    const saveRule = css.match(/\.tripsage-save\s*\{([^}]*)\}/);
    expect(saveRule).not.toBeNull();
    expect(saveRule![1]).toMatch(/border\s*:\s*0/);
    expect(saveRule![1]).toMatch(/background\s*:\s*transparent/);
    expect(saveRule![1]).toMatch(/padding\s*:\s*0/);
    expect(css).not.toMatch(/\.assistant-save-button\s*\{[^}]*min-height\s*:\s*40px/);
    expect(css).toMatch(/\.tripsage-sheet-footer\s*\{[^}]*border-top\s*:\s*1px\s+solid\s+var\(--tv-sunken\)/);
  });
});

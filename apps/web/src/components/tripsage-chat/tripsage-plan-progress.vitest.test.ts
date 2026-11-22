import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyPlanProgress } from "@/modules/tripsage-chat/tripsage-chat-parts";
import { TripsagePlanProgress } from "./tripsage-plan-progress";

describe("Ticket 15: TripsagePlanProgress component (design §3.7, slim D19)", () => {
  it("renders done, running with gray detail, and pending icons without any fake percentage bar", () => {
    let snap = applyPlanProgress(null, { step: "SELECT", state: "done" });
    snap = applyPlanProgress(snap, { step: "VALIDATE", state: "running", detail: "đợt 3/5" });

    const html = renderToStaticMarkup(createElement(TripsagePlanProgress, { snapshot: snap }));
    expect(html).toContain("Chọn điểm đến");
    expect(html).toContain("✓");
    expect(html).toContain("Kiểm tra lịch");
    expect(html).toContain("●");
    expect(html).toContain("đợt 3/5");
    expect(html).toContain("Tìm chỗ nghỉ");
    expect(html).toContain("○");
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("%");
  });

  it("renders step error with 'Chưa tìm được…' and retry button without blocking the UI", () => {
    let snap = applyPlanProgress(null, { step: "SELECT", state: "done" });
    snap = applyPlanProgress(snap, { step: "VALIDATE", state: "done" });
    snap = applyPlanProgress(snap, { step: "LODGING", state: "error", detail: "Chưa tìm được chỗ nghỉ" });

    const html = renderToStaticMarkup(
      createElement(TripsagePlanProgress, {
        snapshot: snap,
        onRetryStep: () => {},
      }),
    );
    expect(html).toContain("Chưa tìm được chỗ nghỉ");
    expect(html).toContain("Thử lại");
  });

  it("renders interrupted stream state with 'Bị ngắt' and retry action", () => {
    let snap = applyPlanProgress(null, { step: "SELECT", state: "done" });
    snap = applyPlanProgress(snap, { step: "VALIDATE", state: "running", detail: "đợt 1/5" });

    const html = renderToStaticMarkup(
      createElement(TripsagePlanProgress, {
        snapshot: snap,
        interrupted: true,
        onRetryStream: () => {},
      }),
    );
    expect(html).toContain("Bị ngắt");
    expect(html).toContain("Thử lại");
  });
});

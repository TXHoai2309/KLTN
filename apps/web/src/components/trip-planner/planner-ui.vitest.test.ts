import { beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPlannerService } from "../../modules/trip-planner/planner-service";
import { candidates, fakeRoutes, referenceTime, requirement } from "../../modules/trip-planner/__fixtures__/planner-fixtures";
import { missingLeg } from "../../modules/trip-planner/planner-routes";
import type { PlannerResult } from "../../modules/trip-planner/planner-contract";

let components: Record<string, ComponentType<any>>;
let ready: PlannerResult;
const noop = () => {};
beforeAll(async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("./trip-planner-screen.tsx", import.meta.url))], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*"], loader: { ".css": "empty" }, logLevel: "silent" });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
  components = module.exports;
  ready = await createPlannerService({ repository: { candidates: async () => candidates, recheck: async () => true }, routes: fakeRoutes, now: () => referenceTime }).propose("test", "ready-ui-test", requirement);
});
const screen = (proposal: PlannerResult) => renderToStaticMarkup(createElement(components.TripPlannerScreen!, { proposal, onBack: noop, onRegenerate: noop }));
describe("real planner UI server rendering", () => {
  it("renders proposal order, selection, day tabs and server checks", () => {
    const html = screen(ready);
    expect(html.indexOf("TEST Điểm đến a")).toBeLessThan(html.indexOf("TEST Điểm đến bb"));
    expect(html).toContain('role="tablist"'); expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"'); expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Đề xuất đáp ứng các kiểm tra hiện tại"); expect(html).toContain("Đáp ứng");
    expect(html).toContain("Stadia Maps"); expect(html).not.toContain("Google Maps");
    expect(html).toContain('/destinations/a'); expect(html).not.toMatch(/Lưu hành trình|Xác nhận hành trình/);
  });
  it("missing routes display unknown times and missing data rather than zero travel", async () => {
    const proposal = await createPlannerService({ repository: { candidates: async () => candidates, recheck: async () => true }, routes: { route: async pair => missingLeg(pair, "NO_ROUTE") }, now: () => referenceTime }).propose("test", "missing-ui-test", requirement);
    const html = screen(proposal); expect(html).toContain("Chưa xác định"); expect(html).toContain("Chưa đủ dữ liệu");
    expect(html).toContain("Chưa có thời gian di chuyển đã xác minh"); expect(html).not.toContain("0 km");
  });
  it("relative dates remain relative and cannot claim complete verification", async () => {
    const proposal = await createPlannerService({ repository: { candidates: async () => candidates, recheck: async () => true }, routes: fakeRoutes, now: () => referenceTime }).propose("test", "relative-ui-test", { ...requirement, startDate: null });
    const html = screen(proposal); expect(html).toContain("Ngày tương đối"); expect(html).toContain("Đề xuất còn dữ liệu chưa được xác minh");
    expect(html).not.toContain("2027-01-01");
  });
  it("empty candidates render no fabricated destinations or metrics", async () => {
    const proposal = await createPlannerService({ repository: { candidates: async () => [], recheck: async () => true }, routes: fakeRoutes, now: () => referenceTime }).propose("test", "empty-ui-test", requirement);
    const html = screen(proposal); expect(html).toContain("Chưa đủ điểm đến phù hợp"); expect(html).not.toContain("TEST Điểm đến"); expect(html).not.toContain("Stadia Maps · Ước tính"); expect(html).not.toContain("0 km");
  });
  it("escapes destination text and encodes detail identifiers", () => {
    const proposal = structuredClone(ready); proposal.days[0]!.stops[0]!.destination.name = '<script>alert("x")</script>';
    proposal.days[0]!.stops[0]!.destination.id = "a/b";
    const html = screen(proposal); expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("/destinations/a%2Fb");
  });
  it("loading and technical failure have distinct accessible states", () => {
    const loading = renderToStaticMarkup(createElement(components.PlannerLoadingState!));
    const error = renderToStaticMarkup(createElement(components.PlannerErrorState!, { error: { ok: false, code: "PLANNER_UNAVAILABLE", message: "Dịch vụ tạm thời lỗi" }, onBack: noop, onRetry: noop }));
    expect(loading).toContain('aria-busy="true"'); expect(loading).toContain('role="status"');
    expect(error).toContain('role="alert"'); expect(error).toContain("Thử lại cùng yêu cầu"); expect(error).not.toContain("Chưa đủ dữ liệu");
  });
  it("authentication failure points to login and does not retry anonymously", () => {
    const html = renderToStaticMarkup(createElement(components.PlannerErrorState!, { error: { ok: false, code: "UNAUTHENTICATED", message: "Đăng nhập lại" }, onBack: noop, onRetry: noop }));
    expect(html).toContain("Đăng nhập lại"); expect(html).not.toContain("Thử lại cùng yêu cầu");
  });
});

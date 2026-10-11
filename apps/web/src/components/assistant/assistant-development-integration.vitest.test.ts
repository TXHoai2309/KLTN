import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantController } from "./assistant-controller";
import { DemoAssistantTransport, type DemoScenario } from "../../../development/assistant-demo-transport";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("real /assistant development integration", () => {
  it.each(["development", "production"] as const)("selects the correct %s page and dependency graph", async (mode) => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../../app/assistant/page.tsx", import.meta.url))],
      bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", metafile: true,
      external: ["react", "react/*", "next"], loader: { ".css": "empty" },
      define: { "process.env.NODE_ENV": JSON.stringify(mode) }, logLevel: "silent",
    });
    const module = { exports: {} as { default: () => Promise<ReactElement> } };
    // Execute the in-memory server page with the same React instance as the renderer.
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    const html = renderToStaticMarkup(await module.exports.default());
    const textarea = html.match(/<textarea\b[^>]*>/)![0];
    const inputs = Object.keys(bundle.metafile!.inputs);
    if (mode === "development") {
      expect(textarea).not.toContain("disabled");
      expect(html).toContain("DEMO / DỮ LIỆU MÔ PHỎNG");
      expect(html).toContain("Dữ liệu mô phỏng");
      expect(html).not.toContain("Trợ lý AI chưa khả dụng");
      expect(inputs.some((path) => path.includes("assistant-demo-transport"))).toBe(true);
    } else {
      expect(textarea).toContain("disabled");
      expect(html).toContain("Trợ lý AI chưa khả dụng");
      expect(html).not.toContain("DỮ LIỆU MÔ PHỎNG");
      expect(inputs.some((path) => path.includes("development/"))).toBe(false);
      expect(bundle.outputFiles[0]!.text).not.toContain("source_fixture_only");
    }
  }, 15000);
  it.each(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"] as const)("uses shared controller and existing fixture for %s", async (scenario) => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.citationScenario = "MULTI"; transport.scenario = scenario;
    let sequence = 0;
    const controller = new AssistantController(transport, "dev-fixture", () => `key_${++sequence}`);
    controller.setDraft("Câu hỏi kiểm thử"); expect(controller.submit()).toBe(true);
    expect(controller.getSnapshot().pending?.phase).toBe("sending"); await tick();
    const first = controller.getSnapshot().turns[0]!.response;
    expect(first.status).toBe(scenario);
    expect(first.citations.length).toBe(["ANSWERED", "PARTIAL"].includes(scenario) ? 3 : 0);
    controller.setDraft("Hỏi tiếp"); expect(controller.submit()).toBe(true); await tick();
    expect(controller.getSnapshot().turns).toHaveLength(2);
    expect(controller.getSnapshot().turns[1]!.response.conversationId).toBe(first.conversationId);
    expect(controller.newConversation()).toBe(true);
    expect(controller.getSnapshot().turns).toHaveLength(0);
    expect(controller.getSnapshot().conversationId).toBeNull();
  });
  it.each(["FAILED", "UNKNOWN", "NETWORK", "MALFORMED"] as DemoScenario[])("preserves recovery behavior for %s", async (scenario) => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.scenario = scenario;
    const controller = new AssistantController(transport, "dev-fixture", () => "key_fixture");
    controller.setDraft("Kiểm thử phục hồi"); controller.submit(); await tick();
    expect(controller.getSnapshot().turns).toHaveLength(0);
    const attempt = controller.getSnapshot().pending!.attempt;
    if (scenario === "FAILED") {
      controller.editFailed(); expect(controller.getSnapshot().draft).toBe("Kiểm thử phục hồi");
    } else {
      controller.setDraft("Draft khác"); transport.scenario = "ANSWERED";
      expect(controller.retry()).toBe(true); expect(controller.getSnapshot().pending!.attempt).toBe(attempt);
      await tick(); expect(controller.getSnapshot().turns).toHaveLength(1);
    }
  });
});

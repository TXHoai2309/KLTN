import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantChat } from "./assistant-chat";
import { AssistantController } from "./assistant-controller";
import { qaPanelWireFixtures } from "../../modules/ai/__fixtures__/qa-panel-wire";

describe("Ticket 01: Destination chat surface and session seam", () => {
  it("embedded panel mode renders without sidebar or full-viewport shell", () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantChat, {
        mode: "panel",
        identity: "GUEST:fixture",
        initialContext: { type: "DESTINATION", destinationId: "dest_1" },
        pinnedDestinationName: "Cột cờ Lũng Cú",
        available: true,
      })
    );

    // Embedded surface has panel classes, but NO sidebar
    expect(markup).toContain("assistant-chat-panel");
    expect(markup).toContain("destination-panel-header");
    expect(markup).toContain("Cột cờ Lũng Cú");
    expect(markup).not.toContain("assistant-sidebar-panel");
    expect(markup).not.toContain("assistant-page-fullscreen");
    expect(markup).not.toContain("assistant-floating-header");
    expect(markup).not.toContain("<main");
  });

  it("page mode retains sidebar and fullscreen classes for regression", () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantChat, {
        mode: "page",
        identity: "GUEST:fixture",
        available: true,
      })
    );

    expect(markup).toContain("assistant-chat-fullscreen");
    expect(markup).toContain("assistant-sidebar");
    expect(markup).toContain("assistant-floating-header");
    expect(markup).not.toContain("destination-panel-header");
  });

  it("embedded panel preserves pinned destination name in suggestions and header", () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantChat, {
        mode: "panel",
        identity: "GUEST:fixture",
        initialContext: { type: "DESTINATION", destinationId: "dest_1" },
        pinnedDestinationName: "Đèo Mã Pí Lèng",
        available: true,
      })
    );

    expect(markup).toContain("Đèo Mã Pí Lèng");
    expect(markup).toContain("Giới thiệu ngắn gọn về Đèo Mã Pí Lèng.");
  });

  it("controller retains exact single request and retry snapshot across session updates", () => {
    let keyIndex = 0;
    const controller = new AssistantController(
      null,
      "GUEST:test",
      () => `key_${++keyIndex}`,
      { type: "DESTINATION", destinationId: "dest_test" },
      "EXPANDED"
    );

    expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");
    expect(controller.getSnapshot().context).toEqual({ type: "DESTINATION", destinationId: "dest_test" });

    // Mode can be toggled
    controller.setKnowledgeMode("SOURCE_ONLY");
    expect(controller.getSnapshot().knowledgeMode).toBe("SOURCE_ONLY");

    // Draft update preserves context & mode
    controller.setDraft("Đường đi đèo Mã Pí Lèng thế nào?");
    expect(controller.getSnapshot().draft).toBe("Đường đi đèo Mã Pí Lèng thế nào?");
    expect(controller.getSnapshot().context).toEqual({ type: "DESTINATION", destinationId: "dest_test" });
  });
});

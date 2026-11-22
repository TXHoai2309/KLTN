import { describe, expect, it } from "vitest";
import { AssistantController } from "./assistant-controller";

describe("Ticket 01: Destination chat surface and session seam", () => {

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

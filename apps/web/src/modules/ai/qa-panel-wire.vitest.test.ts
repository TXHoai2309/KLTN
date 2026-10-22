import { describe, expect, it } from "vitest";
import { qaPanelWireFixtures as wire } from "./__fixtures__/qa-panel-wire";
import { qaConversationDetailMetadataSchema, qaRequestSchema, qaResponseSchema, qaUpdateConversationSchema } from "./qa-contract";

describe("Destination panel FE wire fixtures use existing schemas", () => {
  it("validates both ask requests and SUCCESS/FAILED/UNKNOWN envelopes after JSON serialization", () => {
    for (const input of [wire.first.request, wire.followUp.request]) expect(qaRequestSchema.safeParse(input).success).toBe(true);
    for (const response of [wire.first.response, wire.followUp.response, wire.insufficient, wire.unavailable, wire.unknown]) {
      expect(qaResponseSchema.safeParse(JSON.parse(JSON.stringify(response))).success).toBe(true);
    }
    expect(qaUpdateConversationSchema.parse(wire.preference.request)).toEqual({ knowledgeMode: "EXPANDED" });
  });

  it("provides authoritative context/head/preference metadata and preserves historical modes", () => {
    expect(qaConversationDetailMetadataSchema.parse(wire.get.conversation)).toEqual(wire.get.conversation);
    expect(wire.get.conversation.context).toEqual(wire.first.request.context);
    expect(wire.get.data.map(turn => turn.response.knowledgeMode)).toEqual(["SOURCE_ONLY", "EXPANDED"]);
    expect(wire.get.conversation.headTurnId).toBe(wire.followUp.response.data.turnId);
    expect(wire.turns[0].data.nextCursor).toBe(wire.first.response.data.turnId);
    expect(wire.turns[1].data.nextCursor).toBeNull();
  });
});

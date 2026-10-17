import { describe, expect, it, vi } from "vitest";

import {
  PreferenceExtractionError,
  type PreferenceExtractionErrorCode,
} from "../preference-extraction/preference-extraction-errors";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import type { EditIntentModelOutput } from "./edit-intent-contract";
import { recognizeEditIntent } from "./edit-intent-service";

const input = {
  message: "Đổi giờ tham quan sang 10 giờ.",
  itinerary: [
    {
      dayIndex: 1,
      visits: [
        {
          visitId: "visit-1",
          destinationName: "Bảo tàng",
          startTime: "09:00",
          durationMinutes: 60,
        },
      ],
    },
  ],
  eligibleDestinations: [{ id: "destination-1", name: "Công viên" }],
};

const validOutput: EditIntentModelOutput = {
  intentType: "CHANGE_TIME",
  targetVisitIds: ["visit-1"],
  destinationId: null,
  params: { dayIndex: null, position: null, startTime: "10:00", durationMinutes: null },
  affected: { visitIds: ["visit-1"], dayIndexes: [1] },
  needsClarification: false,
  clarificationReason: null,
};

function fakeLlm(
  complete: StructuredLlmClient["complete"],
): StructuredLlmClient {
  return { complete: vi.fn(complete) };
}

describe("recognizeEditIntent", () => {
  it("calls the injected structured client with a bounded, server-scoped strict schema", async () => {
    const llm = fakeLlm(async () => ({ rawText: JSON.stringify(validOutput), model: "fake-model" }));
    const result = await recognizeEditIntent(input, { llm });
    const call = vi.mocked(llm.complete).mock.calls[0]?.[0];
    const schema = call?.jsonSchema as {
      properties: { targetVisitIds: { items: { enum: string[] } } };
    };

    expect(result.targetVisitIds).toEqual(["visit-1"]);
    expect(call?.user).toContain("Đổi giờ tham quan");
    expect(schema.properties.targetVisitIds.items.enum).toEqual(["visit-1"]);
  });

  it.each([
    "PROVIDER_TIMEOUT",
    "PROVIDER_REFUSAL",
    "INVALID_PROVIDER_RESPONSE",
  ] satisfies PreferenceExtractionErrorCode[])("preserves ADR-16 provider code %s", async (code) => {
    const llm = fakeLlm(async () => {
      throw new PreferenceExtractionError(code, code === "PROVIDER_TIMEOUT");
    });

    await expect(recognizeEditIntent(input, { llm })).rejects.toMatchObject({ code });
  });

  it("maps an unexpected provider failure to a safe typed unavailable error", async () => {
    const llm = fakeLlm(async () => {
      throw new Error("raw provider detail must not be returned");
    });

    await expect(recognizeEditIntent(input, { llm })).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("enforces a timeout even when the provider ignores AbortSignal", async () => {
    const llm = fakeLlm(() => new Promise(() => undefined));

    await expect(recognizeEditIntent(input, { llm, timeoutMs: 5 })).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("rejects empty, oversized and malformed provider outputs", async () => {
    for (const rawText of ["", "x".repeat(32 * 1024 + 1), "not json"]) {
      const llm = fakeLlm(async () => ({ rawText, model: "fake-model" }));
      await expect(recognizeEditIntent(input, { llm })).rejects.toMatchObject({
        code: "INVALID_PROVIDER_RESPONSE",
      });
    }
  });
});

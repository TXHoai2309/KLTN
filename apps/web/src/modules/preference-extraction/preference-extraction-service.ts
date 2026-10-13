import { AppError } from "@/server/http/app-error";

import { modelOutputJsonSchema, preferenceInputSchema } from "./preference-extraction-contract";
import {
  PreferenceExtractionError,
  isPreferenceExtractionError,
} from "./preference-extraction-errors";
import type { StructuredLlmClient } from "./preference-extraction-client";
import { buildPreferenceExtractionPrompt } from "./prompt-builder";
import { verifyProviderExtraction } from "./verify-extraction";
import { downgradeContradictions } from "../trip-requirement/trip-clarification-rules";

export type PreferenceExtractionDependencies = {
  llm: StructuredLlmClient;
  now?: () => Date;
  nowMs?: () => number;
};

function validationError(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, {
    fieldErrors: { text: message },
  });
}

export async function extractPreferences(
  rawText: unknown,
  dependencies: PreferenceExtractionDependencies,
) {
  const parsed = preferenceInputSchema.safeParse(rawText);
  if (!parsed.success) {
    throw validationError(parsed.error.issues[0]?.message ?? "Nhu cầu chuyến đi chưa hợp lệ.");
  }

  const now = dependencies.now ?? (() => new Date());
  const nowMs = dependencies.nowMs ?? (() => Date.now());
  const startedAt = nowMs();
  const prompt = buildPreferenceExtractionPrompt(parsed.data);

  let completion: Awaited<ReturnType<StructuredLlmClient["complete"]>>;
  try {
    completion = await dependencies.llm.complete({
      system: prompt.system,
      user: prompt.user,
      jsonSchema: modelOutputJsonSchema,
    });
  } catch (error) {
    if (isPreferenceExtractionError(error)) throw error;
    throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true);
  }
  if (
    !completion ||
    typeof completion.rawText !== "string" ||
    typeof completion.model !== "string" ||
    completion.model.trim().length === 0
  ) {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }

  const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
  const verified = verifyProviderExtraction(completion.rawText, parsed.data, now(), {
    model: completion.model,
    latencyMs,
    inputLength: [...parsed.data].length,
  });
  // US-27 is the single post-verification clarification seam. It only
  // downgrades deterministic source contradictions and preserves the
  // ExtractionResult contract for existing US-25 callers.
  return downgradeContradictions(verified);
}

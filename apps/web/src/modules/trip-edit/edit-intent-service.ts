import {
  PreferenceExtractionError,
  isPreferenceExtractionError,
} from "../preference-extraction/preference-extraction-errors";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { createModelOutputJsonSchema } from "./edit-intent-contract";
import {
  buildEditIntentPrompt,
  MAX_EDIT_INTENT_OUTPUT_CHARS,
  MAX_EDIT_INTENT_PROVIDER_TIMEOUT_MS,
  type EditIntentPromptInput,
} from "./edit-intent-prompt";
import { verifyEditIntentOutput } from "./edit-intent-verify";

export type EditIntentServiceDependencies = {
  llm: StructuredLlmClient;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function validateTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_EDIT_INTENT_PROVIDER_TIMEOUT_MS) {
    throw new PreferenceExtractionError("PROVIDER_REJECTED", false);
  }
  return value;
}

function invalidProviderResponse(): PreferenceExtractionError {
  return new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
}

function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) {
    return Promise.reject(new PreferenceExtractionError("CANCELLED", false));
  }

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      callback();
    };
    const onExternalAbort = () => {
      controller.abort();
      finish(() => reject(new PreferenceExtractionError("CANCELLED", false)));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new PreferenceExtractionError("PROVIDER_TIMEOUT", true)));
    }, timeoutMs);

    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
  });
}

/** Recognize an intent using the existing generic structured-output client. */
export async function recognizeEditIntent(
  input: EditIntentPromptInput,
  dependencies: EditIntentServiceDependencies,
) {
  const prompt = buildEditIntentPrompt(input);
  const serverVisitIds = prompt.serverContext.itinerary.flatMap((day) =>
    day.visits.map((visit) => visit.visitId),
  );
  const serverDestinationIds =
    prompt.serverContext.eligibleDestinations?.map((destination) => destination.id) ?? [];
  const jsonSchema = createModelOutputJsonSchema({ serverVisitIds, serverDestinationIds });
  const timeoutMs = validateTimeout(
    dependencies.timeoutMs ?? MAX_EDIT_INTENT_PROVIDER_TIMEOUT_MS,
  );

  let completion: Awaited<ReturnType<StructuredLlmClient["complete"]>>;
  try {
    completion = await withTimeout(
      (signal) =>
        dependencies.llm.complete({
          system: prompt.system,
          user: prompt.user,
          jsonSchema,
          signal,
        }),
      timeoutMs,
      dependencies.signal,
    );
  } catch (error) {
    if (isPreferenceExtractionError(error)) throw error;
    throw new PreferenceExtractionError("PROVIDER_UNAVAILABLE", true);
  }

  if (
    !completion ||
    typeof completion.rawText !== "string" ||
    completion.rawText.length === 0 ||
    completion.rawText.length > MAX_EDIT_INTENT_OUTPUT_CHARS ||
    typeof completion.model !== "string" ||
    completion.model.trim().length === 0
  ) {
    throw invalidProviderResponse();
  }

  return verifyEditIntentOutput(completion.rawText, prompt.serverContext);
}

import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import {
  PreferenceExtractionError,
  isPreferenceExtractionError,
} from "../preference-extraction/preference-extraction-errors";
import { createReplanModelOutputJsonSchema } from "./replan-contract";
import {
  buildReplanPrompt,
  type ReplanPromptInput,
} from "./replan-prompt";
import {
  replanServerIds,
  verifyReplanOutput,
} from "./replan-verify";
import { MAX_REPLAN_OUTPUT_CHARS, MAX_REPLAN_PROVIDER_TIMEOUT_MS } from "./replan-contract";

export type ReplanAiServiceDependencies = {
  /** Reuse the shared US-25 structured-output client; tests provide a fake. */
  llm: StructuredLlmClient;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function validateTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_REPLAN_PROVIDER_TIMEOUT_MS) {
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

/** Generate and verify a read-only structured proposal for the remaining trip. */
export async function createInTripReplanIntent(
  input: ReplanPromptInput,
  dependencies: ReplanAiServiceDependencies,
) {
  const prompt = buildReplanPrompt(input);
  const jsonSchema = createReplanModelOutputJsonSchema(replanServerIds(prompt.serverContext));
  const timeoutMs = validateTimeout(
    dependencies.timeoutMs ?? MAX_REPLAN_PROVIDER_TIMEOUT_MS,
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
    completion.rawText.length > MAX_REPLAN_OUTPUT_CHARS ||
    typeof completion.model !== "string" ||
    completion.model.trim().length === 0
  ) {
    throw invalidProviderResponse();
  }

  // Raw request and completion text stay local to this call; neither is logged or stored.
  return verifyReplanOutput(completion.rawText, prompt.serverContext);
}

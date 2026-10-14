import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import type { AuthorizationDependencies } from "@/server/authorization/guard";

import { createOpenAiStructuredClient } from "./openai-structured-client";
import {
  extractPreferences,
  type PreferenceExtractionDependencies,
} from "./preference-extraction-service";

export type PreferenceExtractionServerDependencies = PreferenceExtractionDependencies & {
  authorization: AuthorizationDependencies;
};

export const preferenceExtractionDependencies: PreferenceExtractionServerDependencies = {
  authorization: authorizationDependencies,
  llm: createOpenAiStructuredClient(),
  now: () => new Date(),
  nowMs: () => Date.now(),
};

export function extractPreferencesOnServer(rawText: unknown) {
  return extractPreferences(rawText, preferenceExtractionDependencies);
}

export type { StructuredLlmClient } from "./preference-extraction-client";

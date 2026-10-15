import "server-only";
import { createOpenAiStructuredClient } from "../preference-extraction/openai-structured-client";
import { editorialAiConfigured } from "./editorial-service";
export function editorialAiClient() {
  return editorialAiConfigured() ? createOpenAiStructuredClient({ model: () => process.env.OPENAI_EDITORIAL_MODEL, timeoutMs: 15_000, maxOutputTokens: 1200, maxResponseBytes: 24_000 }) : null;
}

import "server-only";
import { createEditorialOpenAiClient } from "./editorial-openai-client";
import { editorialAiConfigured } from "./editorial-service";
import { createEditorialAiDiagnostics } from "./editorial-ai-diagnostics";
// Safe module-load observation also verifies configuration inside the Next runtime.
createEditorialAiDiagnostics().configured(Boolean(process.env.OPENAI_API_KEY?.trim()), process.env.OPENAI_EDITORIAL_MODEL);
export function editorialAiClient() {
  return editorialAiConfigured() ? createEditorialOpenAiClient() : null;
}

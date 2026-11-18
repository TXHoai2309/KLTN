import "server-only";
import { createEditorialOpenAiClient } from "./editorial-openai-client";
import { createEditorialAiDiagnostics } from "./editorial-ai-diagnostics";
import { effectiveConfig } from "../runtime-config/runtime-config-service";
import { isConfigurableChatModel } from "../runtime-config/openai-model-catalog";
export async function editorialAiClient() {
  const config = await effectiveConfig("OPENAI");
  createEditorialAiDiagnostics().configured(Boolean(config.apiKey), config.editorialModel?.toString());
  return config.apiKey && isConfigurableChatModel(config.editorialModel) ? createEditorialOpenAiClient() : null;
}

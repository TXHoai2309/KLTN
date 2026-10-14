export type StructuredLlmCompletionInput = {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
};

export type StructuredLlmCompletion = {
  rawText: string;
  model: string;
};

/** Provider boundary used by the extraction service and deterministic tests. */
export interface StructuredLlmClient {
  complete(input: StructuredLlmCompletionInput): Promise<StructuredLlmCompletion>;
}

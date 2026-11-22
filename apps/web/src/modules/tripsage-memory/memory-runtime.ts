import "server-only";
import { db } from "../../services";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import { createMemoryService } from "./memory-service";
import { createMemoryStore } from "./memory-store";

export function tripsageMemoryRuntime() {
  return createMemoryService(createMemoryStore(db), createOpenAiEmbeddingProvider());
}

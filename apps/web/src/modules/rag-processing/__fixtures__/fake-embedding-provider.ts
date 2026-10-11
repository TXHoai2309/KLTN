import type { EmbeddingProvider, ProviderEmbedding } from "../embedding-contract";

export function createFakeEmbeddingProvider(respond?: (input: string[], call: number) => Promise<ProviderEmbedding[]> | ProviderEmbedding[]) {
  const calls: string[][] = [];
  const provider: EmbeddingProvider = {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    async embed({ input }) {
      calls.push([...input]);
      if (respond) return respond(input, calls.length);
      return input.map((_, index) => ({ index, embedding: [1, ...Array<number>(1535).fill(0)] }));
    },
  };
  return { provider, calls };
}

import type { QaGenerationInput } from "./qa-runtime-contract";

// One request-local registry shared by generation and independent verification.
// Never serialize the registry or its handles as public answer content.
export function qaReviewedSupport(input: QaGenerationInput) {
  const registry = new Map<string, { citationId: string; sentence: string }>();
  const pairs = new Map<string, string>();
  const aspects = input.sourceReview?.aspects.map(aspect => ({ id: aspect.id, status: aspect.status,
    supportIds: aspect.status !== "SUPPORTED" ? [] : aspect.supports.map(ref => {
      const pair = JSON.stringify([ref.citationId, ref.sentence]);
      let id = pairs.get(pair);
      if (!id) { id = `s${registry.size + 1}`; pairs.set(pair, id); registry.set(id, { ...ref }); }
      return id;
    }),
  })) ?? [];
  return { registry, aspects };
}

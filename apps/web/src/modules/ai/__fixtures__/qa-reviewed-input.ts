// Offline fixtures only. Never imported by the runtime.
import { qaSourceReviewBinding } from "../qa-source-sufficiency";
import { qaScopedEvidenceSentences } from "../qa-prompt";
import type { QaGenerationInput } from "../qa-runtime-contract";
import type { QaAssessment } from "../qa-assessment";
export function fixtureQaAssessment(input: QaGenerationInput, partial = false): QaAssessment {
  return { intent: "CLEAR", review: { binding: qaSourceReviewBinding(input), exhaustive: true,
    relevance: input.evidence.map(item => ({ citationId: item.citationId, status: "RELATED" })),
    aspects: [...(partial ? [{ id: "missing_fixture_aspect", status: "MISSING" as const, supports: [] }] : []), { id: "fixture_aspect", status: "SUPPORTED", supports: input.evidence.flatMap(item =>
      qaScopedEvidenceSentences(item.text, input).map(sentence => ({ citationId: item.citationId, sentence }))) }],
  } };
}
export function fixtureReviewedInput(input: QaGenerationInput, partial = false): QaGenerationInput {
  return { ...input, sourceSufficiency: { status: partial ? "PARTIAL" : "SUFFICIENT", reason: partial ? "PARTIAL_COVERAGE" : "COMPLETE_COVERAGE" }, sourceReview: fixtureQaAssessment(input, partial).review };
}

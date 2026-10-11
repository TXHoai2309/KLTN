import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { qaRealCorpusEvaluationManifestSchema, runQaSyntheticEvaluation } from "./qa-evaluation";

describe("US21 repeatable offline technical evaluation", () => {
  it("reports per-case evidence and semantic limits without declaring real quality PASS", async () => {
    const result = await runQaSyntheticEvaluation();
    console.info("US21_EVALUATION_REPORT=" + JSON.stringify(result));
    expect(result.realCorpusEvaluation).toBe("NOT_EVALUATED");
    expect(result.semanticQuality).toBe("NOT_EVALUATED");
    expect(result.metrics.technicalExpectationsMatched).toBe(result.metrics.technicalCases);
    expect(result.results.filter(item => !item.expectationMatched)).toEqual([]);
    expect(result.metrics.historyIsolationFailures).toBe(0);
    expect(result.metrics.metadataAuthenticityFailures).toBe(0);
    expect(result.metrics.knownSemanticLimitationsObserved).toBe(2);
    expect(result.results.find(item => item.id === "instruction-variant-1")!.providerCalls).toBe(0);
    expect(result.results.find(item => item.id === "provider-unavailable")!.observed).toBe("AI_UNAVAILABLE");
    expect(result.results.find(item => item.id === "source-prompt-injection")!.providerCalls).toBe(0);
    expect(result.results.find(item => item.id === "no-current-source")!.providerCalls).toBe(0);
  });
  const manifest = () => ({ datasetId: "owner-review-fixture", locale: "vi-VN", scope: "HA_GIANG", documents: [{ sourceId: "source_fixture", sha256: "a".repeat(64),
    provenance: "Fictional fixture, not real corpus", usageRights: "Synthetic test fixture", verifiedBy: "fixture reviewer", verifiedAt: "2026-10-11T00:00:00Z" }],
    questions: [{ id: "q1", question: "Fixture?", expectedOutcome: "ANSWERED", expectedSourceIds: ["source_fixture"], expectedSupportedClaims: ["Fixture claim"], unansweredAspects: [], reviewedBy: "fixture reviewer" }] });
  it("requires provenance, rights, independent review and source hashes before a real-corpus run", () => {
    expect(qaRealCorpusEvaluationManifestSchema.safeParse(manifest()).success).toBe(true);
    for (const field of ["provenance", "usageRights", "verifiedBy", "verifiedAt", "sha256"]) {
      const value = manifest(); delete (value.documents[0] as unknown as Record<string, unknown>)[field];
      expect(qaRealCorpusEvaluationManifestSchema.safeParse(value).success).toBe(false);
    }
  });
  it("rejects unverified references, duplicates and unsupported factual expected outcomes", () => {
    const wrong = manifest(); wrong.questions[0]!.expectedSourceIds = ["unknown"];
    expect(qaRealCorpusEvaluationManifestSchema.safeParse(wrong).success).toBe(false);
    const duplicate = manifest(); duplicate.documents.push(duplicate.documents[0]!);
    expect(qaRealCorpusEvaluationManifestSchema.safeParse(duplicate).success).toBe(false);
    const unsupported = manifest(); unsupported.questions[0]!.expectedSupportedClaims = [];
    expect(qaRealCorpusEvaluationManifestSchema.safeParse(unsupported).success).toBe(false);
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { preferenceUtterances } from "../src/modules/preference-extraction/__fixtures__/utterances";
import type { PreferenceExtractionField } from "../src/modules/preference-extraction/preference-extraction-contract";

const FIELDS: readonly PreferenceExtractionField[] = [
  "startDate",
  "durationDays",
  "transport",
  "companions",
  "interests",
  "pace",
  "mobilityConstraints",
];

type FieldStat = { total: number; correct: number };
type EvaluationRecord = {
  id: string;
  latencyMs: number;
  errorCode?: string;
  fields?: Record<string, { expectedStatus: string; actualStatus: string; correct: boolean; hallucinated: boolean }>;
};

function numberArgument(name: string, fallback: number, maximum: number): number {
  const index = process.argv.indexOf(name);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  const value = raw === undefined ? fallback : Number(raw);
  return Number.isSafeInteger(value) ? Math.min(Math.max(1, value), maximum) : fallback;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pQuantile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

function publicErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "UNKNOWN";
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_PREFERENCE_MODEL?.trim();
  if (!apiKey || !model) {
    console.log("SKIP: thiếu OPENAI_API_KEY hoặc OPENAI_PREFERENCE_MODEL; không gọi OpenAI thật.");
    return;
  }

  // Keep the opt-in script import-safe when credentials are absent. The
  // provider adapter imports server-only and is intentionally not loaded for
  // the normal skipped path.
  const [{ createOpenAiStructuredClient }, { extractPreferences }] = await Promise.all([
    import("../src/modules/preference-extraction/openai-structured-client"),
    import("../src/modules/preference-extraction/preference-extraction-service"),
  ]);

  const limit = numberArgument("--limit", 10, preferenceUtterances.length);
  const concurrency = numberArgument("--concurrency", 2, 3);
  const fixtures = preferenceUtterances.slice(0, limit);
  const client = createOpenAiStructuredClient({ apiKey: () => apiKey, model: () => model });
  const records: EvaluationRecord[] = [];
  const latencies: number[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      const fixture = fixtures[index];
      if (!fixture) return;
      const startedAt = performance.now();
      try {
        const result = await extractPreferences(fixture.text, { llm: client });
        const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
        latencies.push(latencyMs);
        const fields: EvaluationRecord["fields"] = {};
        for (const field of FIELDS) {
          const expected = fixture.expected[field];
          const actual = result.fields[field];
          const correct = actual.status === expected.status &&
            (expected.status !== "EXTRACTED" || sameValue(actual.value, expected.value));
          fields[field] = {
            expectedStatus: expected.status,
            actualStatus: actual.status,
            correct,
            hallucinated: actual.status === "EXTRACTED" && !correct,
          };
        }
        records.push({ id: fixture.id, latencyMs, fields });
      } catch (error) {
        const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
        latencies.push(latencyMs);
        records.push({ id: fixture.id, latencyMs, errorCode: publicErrorCode(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, fixtures.length) }, () => worker()));

  const fieldStats = Object.fromEntries(FIELDS.map((field) => [field, { total: 0, correct: 0 } satisfies FieldStat]));
  let hallucinatedExtracted = 0;
  let extractedComparisons = 0;
  let ambiguousUnsupportedTotal = 0;
  let ambiguousUnsupportedCorrect = 0;
  let errorCount = 0;
  for (const record of records) {
    if (record.errorCode) {
      errorCount += 1;
      continue;
    }
    for (const field of FIELDS) {
      const stat = fieldStats[field] as FieldStat;
      const result = record.fields?.[field];
      if (!result) continue;
      stat.total += 1;
      if (result.correct) stat.correct += 1;
      if (result.expectedStatus === "EXTRACTED") extractedComparisons += 1;
      if (result.hallucinated) hallucinatedExtracted += 1;
      if (result.expectedStatus === "AMBIGUOUS" || result.expectedStatus === "UNSUPPORTED") {
        ambiguousUnsupportedTotal += 1;
        if (result.correct) ambiguousUnsupportedCorrect += 1;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model,
    limit,
    concurrency,
    fixtureCount: fixtures.length,
    fieldAccuracy: Object.fromEntries(FIELDS.map((field) => {
      const stat = fieldStats[field] as FieldStat;
      return [field, { correct: stat.correct, total: stat.total, rate: stat.total ? stat.correct / stat.total : null }];
    })),
    hallucinatedExtracted: {
      count: hallucinatedExtracted,
      denominator: extractedComparisons,
      rate: extractedComparisons ? hallucinatedExtracted / extractedComparisons : null,
    },
    ambiguousUnsupportedAccuracy: {
      correct: ambiguousUnsupportedCorrect,
      total: ambiguousUnsupportedTotal,
      rate: ambiguousUnsupportedTotal ? ambiguousUnsupportedCorrect / ambiguousUnsupportedTotal : null,
    },
    errors: { count: errorCount, rate: fixtures.length ? errorCount / fixtures.length : 0 },
    latencyMs: { p50: pQuantile(latencies, 0.5), p95: pQuantile(latencies, 0.95) },
    records,
  };

  const outputDirectory = join(tmpdir(), "kltn-preference-evaluation");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `report-${Date.now()}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Đã chạy ${fixtures.length} câu, concurrency=${concurrency}.`);
  console.log(`Báo cáo (không chứa văn bản/response thô): ${outputPath}`);
  console.log(`Lỗi/timeout: ${errorCount}/${fixtures.length}; hallucinated EXTRACTED: ${hallucinatedExtracted}/${extractedComparisons}.`);
}

void main().catch((error: unknown) => {
  console.error(`Evaluation failed: ${publicErrorCode(error)}`);
  process.exitCode = 1;
});

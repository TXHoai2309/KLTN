import { afterAll, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrismaClient, type Database } from "@KLTN/db";
import { createQaRetriever } from "./qa-retrieval";
import { createQaAssessor } from "./qa-assessment";
import { createQaGenerator, insufficientQaAnswer } from "./qa-generation";
import { planQaQuestion } from "./qa-question-plan";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import type { QaAnswer, QaGenerationInput } from "./qa-runtime-contract";
import { QA_ADVANCED_CASES } from "./__fixtures__/qa-advanced-cases";
vi.mock("server-only", () => ({}));

// Opt-in, read-only, pinned DEVELOPMENT target. No admission/history/source writes.
describe.skipIf(process.env.QA_ADVANCED_LIVE !== "1")("advanced reasoning live acceptance probes", () => {
  const results: object[] = [];
  let totalCalls = 0;
  afterAll(() => {
    if (process.env.QA_ADVANCED_LIVE === "1") writeFileSync(resolve("../../docs/implementation/rag-advanced-live-results.json"), JSON.stringify({ date: "2026-10-17", totalCalls, maxCalls: 36, readOnly: true, results }, null, 2) + "\n");
  });
  it.each(QA_ADVANCED_CASES)("case $id against current public corpus", async fixture => {
    const target = new URL(process.env.DATABASE_URL!);
    if (!process.env.OPENAI_API_KEY || process.env.QA_RUNTIME_ENABLED !== "true" ||
      process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development") ||
      target.hostname !== process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST || decodeURIComponent(target.pathname.slice(1)) !== process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME) throw new Error("Live probe requires approved development pins");
    const db = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL! });
    const reader = { $queryRaw: (query: Parameters<Database["$queryRaw"]>[0]) => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$queryRawUnsafe("SELECT set_config('statement_timeout', '5000ms', true)");
      return tx.$queryRaw(query);
    }, { timeout: 10000 }) } as unknown as Database;
    const calls: { role: string; model?: string; tokens?: number; httpStatus: number }[] = [];
    const events: QaDiagnosticEvent[] = [];
    const started = Date.now();
    let answer: QaAnswer | undefined;
    let failure: string | undefined;
    let retrievedDocuments = 0;
    const fetcher: typeof fetch = async (url, init) => {
      if (++totalCalls > 36 || calls.length >= 4) throw new Error("Live call cap exceeded");
      const body = JSON.parse(String(init?.body));
      const response = await fetch(url, init);
      const payload = await response.clone().json();
      calls.push({ role: body.response_format?.json_schema?.name ?? "embedding", model: payload.model, httpStatus: response.status, tokens: payload.usage?.total_tokens });
      return response;
    };
    try {
      await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
        const retriever = createQaRetriever(reader, { topK: 4, maxEvidenceTokens: 3000, hybrid: true,
          provider: createOpenAiEmbeddingProvider({ fetcher }) });
        const evidence = await retriever.retrieve(fixture.question, []);
        retrievedDocuments = new Set(evidence.map(item => item.documentId)).size;
        expect(await retriever.recheck(evidence)).toBe(true);
        const input: QaGenerationInput = { question: fixture.question, history: [], evidence, context: { type: "GENERAL" }, questionPlan: planQaQuestion(fixture.question) };
        if (!evidence.length) { answer = insufficientQaAnswer("NO_EVIDENCE"); return; }
        const assessment = await createQaAssessor({ fetcher }).assess(input);
        if (assessment.intent === "AMBIGUOUS") throw new Error("CLARIFICATION_REQUIRED");
        input.sourceReview = assessment.review;
        input.sourceSufficiency = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: assessment.review });
        answer = ["SUFFICIENT", "PARTIAL"].includes(input.sourceSufficiency.status) ? await createQaGenerator({ fetcher }).generate(input) : insufficientQaAnswer("MISSING_SUPPORT");
        expect(await retriever.recheck(evidence)).toBe(true);
      });
    } catch (error) { failure = typeof error === "object" && error && "code" in error ? String(error.code) : error instanceof Error && error.message === "CLARIFICATION_REQUIRED" ? error.message : "PROBE_ERROR"; }
    finally { await db.$disconnect(); }
    const text = answer?.answerParts.map(part => part.text).join(" ") ?? "";
    const folded = text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d").toLowerCase();
    const checks: Record<number, boolean> = {
      1: /21(?:\/|[-.]| thang )0?1(?:\/|[-.]| nam )1992/u.test(folded),
      2: /300/u.test(text) && /(?:qua nhieu dot|nhieu dot)/u.test(folded),
      3: /2021/u.test(text) && /quoc gia/u.test(folded),
      4: /27\s*(?:\/\s*3|thang\s*(?:3|ba))/u.test(folded) && /am lich/u.test(folded),
      5: !!answer && answer.status === "ANSWERED" && /cang bac me/u.test(folded) && /khau vai/u.test(folded) && answer.citations.length >= 2,
      6: /(?:chua thong nhat|khong thong nhat|khac nhau|chua.*chac|chua.*xac dinh)/u.test(folded) && /don/u.test(folded) && /giam/u.test(folded),
      7: answer?.status === "INSUFFICIENT_SOURCE" || answer?.status === "PARTIAL",
      8: answer?.status === "INSUFFICIENT_SOURCE" || answer?.status === "PARTIAL",
      9: /quoc gia/u.test(folded) && /unesco/u.test(folded) && /(?:khac|khong|chua)/u.test(folded),
    };
    const passed = !failure && checks[fixture.id];
    results.push({ caseId: fixture.id, passed, status: answer?.status, failure, retrievedDocuments, calls, elapsedMs: Date.now() - started, answer: text || undefined,
      missing: answer && "unansweredAspects" in answer ? answer.unansweredAspects : undefined,
      diagnostics: events.filter(event => event.event === "FAILURE" || event.stage === "SYNTHESIS_REJECTED").map(event => ({ stage: event.stage, category: event.category, gate: event.synthesisGate })) });
    expect(failure).toBeUndefined(); expect(passed).toBe(true);
  }, 90000);
});

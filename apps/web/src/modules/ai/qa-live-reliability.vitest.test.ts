import { describe, expect, it, vi } from "vitest";
import { createPrismaClient, type Database } from "@KLTN/db";
import { createQaRetriever } from "./qa-retrieval";
import { createQaAssessor } from "./qa-assessment";
import { createQaGenerator } from "./qa-generation";
import { createQaDiagnostics, type QaDiagnosticEvent } from "./qa-diagnostics";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { qaFactualQuestion, qaIntentHistory } from "./qa-question-understanding";
import type { QaGenerationInput } from "./qa-runtime-contract";
import { QA_DEFAULT_MODEL } from "./qa-json-provider";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import { QA_CONVERSATION_MESSAGES } from "./qa-conversation";

vi.mock("server-only", () => ({}));

// Explicit opt-in only: this uses the configured paid provider and approved corpus.
// Every database access is a READ ONLY transaction. Never log secrets, questions,
// retrieved prose, private provenance or unverified answer/verifier text.
describe.skipIf(process.env.QA_DIAGNOSTIC_LIVE !== "1")("live QA reliability against the pinned development corpus", () => {
  it.each([
    { label: "original", question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", followup: false },
    { label: "repeated", question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", followup: false },
    { label: "third-repeat", question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", followup: false },
    { label: "punctuated", question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn? ,./", followup: false },
    { label: "mixed-followup", question: "Cảm ơn, ở đó có gì nổi bật?", followup: true },
    { label: "entrance-followup", question: "giá vé vào thì sao?", followup: true },
  ])("answers the $label destination question with verified citations", async ({ label, question: rawQuestion, followup }) => {
    const url = process.env.DATABASE_URL;
    if (!url || !process.env.OPENAI_API_KEY) throw new Error("Live QA requires configured server credentials");
    const target = new URL(url);
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development" ||
        process.env.QA_RUNTIME_ENABLED !== "true" ||
        target.hostname !== process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST ||
        decodeURIComponent(target.pathname.slice(1)) !== process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME) {
      throw new Error("Live QA database does not match the approved development runtime pins");
    }
    const publicSourceIds = new Set((process.env.QA_PUBLIC_SOURCE_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean));
    if (!publicSourceIds.size) throw new Error("Live QA needs explicitly approved public sources");
    const db = createPrismaClient({ DATABASE_URL: url });
    const reader = { $queryRaw: (query: Parameters<Database["$queryRaw"]>[0]) => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$queryRawUnsafe("SELECT set_config('statement_timeout', '5000ms', true)");
      return tx.$queryRaw(query);
    }, { timeout: 10000 }) } as unknown as Database;
    const events: QaDiagnosticEvent[] = [];
    const calls: { name: string; requestedSol: boolean; actualSol: boolean; totalTokens?: number; parts?: number; claims?: number; matchingParts?: boolean[]; gates?: unknown; aspects?: number; supported?: number; expectedAspectIds?: string[]; coveredAspectIds?: string[] }[] = [];
    const fetcher: typeof fetch = async (request, init) => {
      const sent = JSON.parse(String(init?.body));
      const response = await fetch(request, init);
      const raw = await response.clone().json();
      expect(sent.model).toBe(QA_DEFAULT_MODEL);
      expect(sent.reasoning_effort).toBe("medium");
      expect(raw.model).toMatch(/^gpt-6\.1-sol(?:-[a-zA-Z0-9.-]+)?$/u);
      const content = raw.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const output = JSON.parse(content);
        const payload = JSON.parse(sent.messages[1].content);
        calls.push({ name: sent.response_format.json_schema.name,
          requestedSol: sent.model === "gpt-6.1-sol", actualSol: /^gpt-6\.1-sol(?:-[a-zA-Z0-9.-]+)?$/u.test(raw.model),
          totalTokens: Number.isSafeInteger(raw.usage?.total_tokens) ? raw.usage.total_tokens : undefined,
          parts: output.facets ? Object.values(output.facets).flat().length : output.answerParts?.length, claims: output.claims ? Object.keys(output.claims).length : undefined, gates: output.gates,
          aspects: output.aspects?.length, supported: output.aspects?.filter((a: { status: string }) => a.status === "SUPPORTED").length,
          expectedAspectIds: payload.REQUIRED_ASPECT_IDS,
          coveredAspectIds: output.coveredAspects?.filter((id: unknown) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test(id)),
          matchingParts: output.claims && payload.answerParts?.map((_part: unknown, index: number) => Object.hasOwn(output.claims, `p${index}`)),
        });
      }
      return response;
    };
    const started = Date.now();
    try {
      await createQaDiagnostics({ nodeEnv: "development", sink: event => events.push(event) }).run(async () => {
        const retriever = createQaRetriever(reader, { publicSourceIds, topK: 4, maxEvidenceTokens: 3000, hybrid: process.env.QA_LIVE_HYBRID === "1" });
        const question = qaFactualQuestion(rawQuestion);
        const old = { conversationId: "live_fixture", turnId: "old_fixture", turnState: "COMPLETED" as const, context: { type: "GENERAL" as const }, answerParts: [] as [], citations: [] as [] };
        const history = qaIntentHistory(rawQuestion, followup ? [
          { question: "tôi muốn tìm hiểu về cao nguyên đá đồng văn", response: { ...old, status: "INSUFFICIENT_SOURCE", message: QA_INSUFFICIENT_SOURCE_MESSAGE } },
          { question: "hi", response: { ...old, status: "CONVERSATIONAL", message: QA_CONVERSATION_MESSAGES.greeting } },
        ] : []);
        const evidence = await retriever.retrieve(question, history);
        expect(evidence.length).toBeGreaterThan(0);
        expect(await retriever.recheck(evidence)).toBe(true);
        const input: QaGenerationInput = { question, evidence, history, context: { type: "GENERAL" } };
        const assessment = await createQaAssessor({ fetcher }).assess(input);
        const sourceSufficiency = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: assessment.review });
        expect(assessment.intent).toBe("CLEAR");
        expect(["SUFFICIENT", "PARTIAL"]).toContain(sourceSufficiency.status);
        const answer = await createQaGenerator({ fetcher }).generate({ ...input, sourceSufficiency, sourceReview: assessment.review });
        console.info("QA_LIVE_RELIABILITY", JSON.stringify({ label, status: answer.status, answerMode: "answerMode" in answer ? answer.answerMode : "SYNTHESIS", elapsedMs: Date.now() - started, evidenceCount: evidence.length, sourceDecision: sourceSufficiency,
          calls, rejections: events.filter(event => event.synthesisRejection).map(event => ({ reason: event.synthesisRejection, gate: event.synthesisGate })) }));
        expect(["ANSWERED", "PARTIAL"]).toContain(answer.status);
        expect(answer.answerParts.length).toBeGreaterThan(0);
        expect(answer.citations.length).toBeGreaterThan(0);
        expect(await retriever.recheck(evidence)).toBe(true);
      });
    } finally { await db.$disconnect(); }
  }, 60000);
});

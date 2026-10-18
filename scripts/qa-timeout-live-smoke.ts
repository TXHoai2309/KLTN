/** Explicit owner-authorized, two-question read-only smoke. Never imports services/Auth. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { createQaRetriever } from "../apps/web/src/modules/ai/qa-retrieval";
import { createQaAssessor } from "../apps/web/src/modules/ai/qa-assessment";
import { createQaGenerator } from "../apps/web/src/modules/ai/qa-generation";
import { createQaService } from "../apps/web/src/modules/ai/qa-service";
import { createQaHttpHandlers } from "../apps/web/src/modules/ai/qa-http";
import { createQaDiagnostics, type QaDiagnosticEvent } from "../apps/web/src/modules/ai/qa-diagnostics";
import { createOpenAiEmbeddingProvider } from "../apps/web/src/modules/rag-processing/openai-embedding-provider";
import type { QaConversationStore } from "../apps/web/src/modules/ai/qa-conversation-store";
import type { Database } from "@KLTN/db";
import { secrets, verifyIdentity } from "./rag-sync-lib.mjs";

async function main() {
  if (process.argv[2] !== "--live-max-two" || !process.argv[3] || process.argv.length !== 4) throw Error("EXPLICIT_LIVE_SMOKE_AUTHORIZATION_REQUIRED");
  const configuration = parseEnv(await readFile(process.argv[3], "utf8"));
  if (!configuration.OPENAI_API_KEY) throw Error("OPENAI_INPUT_MISSING");
  const identities = await verifyIdentity(await secrets(process.argv[3]));
  const url = new URL(configuration.SYNC_TARGET_DATABASE_URL!);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=5000");
  const pool = new Pool({ connectionString: url.toString(), max: 3, connectionTimeoutMillis: 5000 });
  const database = { async $transaction(work: (tx: unknown) => Promise<unknown>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      if ((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only !== "on") throw Error("READ_ONLY_REQUIRED");
      const result = await work({ $queryRaw: async (sql: { text: string; values: unknown[] }) => {
        if (!/^SELECT\s/i.test(sql.text)) throw Error("NON_READ_QUERY_REFUSED");
        return (await client.query(sql.text, sql.values)).rows;
      } });
      await client.query("ROLLBACK"); return result;
    } finally { client.release(); }
  } } as unknown as Database;
  const events: QaDiagnosticEvent[] = [], calls: object[] = [], outcomes: object[] = [];
  let questionIndex = 0;
  const fetcher: typeof fetch = async (address, init) => {
    const started = performance.now();
    const body = JSON.parse(String(init?.body));
    const phase = body.response_format?.json_schema?.name ?? "embedding";
    if (calls.length >= 8 || calls.filter((call: any) => call.questionIndex === questionIndex).length >= 4) throw Error("LIVE_CALL_CAP");
    const call: any = { questionIndex, phase, requestedModel: body.model, reasoningEffort: body.reasoning_effort };
    calls.push(call);
    try {
      const response = await fetch(address, init); call.httpStatus = response.status;
      // Only bounded usage/model metadata leaves memory, never the provider text.
      if (response.ok) {
        const payload = await response.clone().json() as any;
        call.usage = payload.usage ? { promptTokens: payload.usage.prompt_tokens, completionTokens: payload.usage.completion_tokens, totalTokens: payload.usage.total_tokens, reasoningTokens: payload.usage.completion_tokens_details?.reasoning_tokens } : undefined;
        call.actualModel = payload.model;
      }
      return response;
    } catch { call.failure = init?.signal?.aborted ? "ABORTED" : "NETWORK"; throw Error("LIVE_PROVIDER_FAILED"); }
    finally { call.elapsedMs = Math.round(performance.now() - started); }
  };
  let completions = 0, failures = 0;
  const store = { reserve: async () => ({ kind: "RESERVED", conversationId: "smoke-conversation", turnId: "smoke-turn", fence: 1, context: { type: "GENERAL" }, history: [] }), complete: async (_p: unknown, _r: unknown, data: unknown) => { completions++; return data; }, fail: async () => { failures++; }, history: async () => [], delete: async () => {}, revokeGuest: async () => {}, cleanup: async () => ({}) } as unknown as QaConversationStore;
  const service = createQaService({ store, retriever: createQaRetriever(database, { topK: 4, maxEvidenceTokens: 3000, hybrid: true, provider: createOpenAiEmbeddingProvider({ apiKey: () => configuration.OPENAI_API_KEY, fetcher }) }), assessor: createQaAssessor({ apiKey: () => configuration.OPENAI_API_KEY, fetcher }), generator: createQaGenerator({ apiKey: () => configuration.OPENAI_API_KEY, fetcher }) });
  // Embedding adapter's existing API-key getter reads process.env; scoped to this process.
  process.env.OPENAI_API_KEY = configuration.OPENAI_API_KEY;
  const http = createQaHttpHandlers({ enabled: () => true, diagnostics: createQaDiagnostics({ nodeEnv: "production", sink: event => events.push(event) }), resolve: async () => ({ kind: "USER", id: "smoke-memory-only" }), ask: service.ask, history: service.history, delete: service.delete });
  try {
    for (const question of ["Cao nguyên đá Đồng Văn là gì và có đặc điểm nổi bật nào?", "Di tích Căng Bắc Mê có đặc điểm lịch sử gì?"]) {
      questionIndex++;
      const started = performance.now();
      const response = await http.ask(new Request("http://localhost/api/ai/ask", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "Idempotency-Key": `qa-timeout-smoke-${questionIndex}` }, body: JSON.stringify({ question }) }));
      const body = await response.json();
      outcomes.push({ questionIndex, httpStatus: response.status, status: body.data?.status ?? body.error?.code, citationCount: body.data?.citations?.length ?? 0, elapsedMs: Math.round(performance.now() - started) });
    }
  } finally { await pool.end(); }
  const totals = calls.reduce((total: any, call: any) => ({ input: total.input + (call.usage?.promptTokens ?? (call.phase === "embedding" ? call.usage?.totalTokens ?? 0 : 0)), output: total.output + (call.usage?.completionTokens ?? 0) }), { input: 0, output: 0 }) as any;
  await mkdir(".cache/qa-timeout", { recursive: true });
  const report = { checkedAt: new Date().toISOString(), mode: "LOCAL_PIPELINE_PRODUCTION_READ_ONLY_MEMORY_PERSISTENCE", identities, outcomes, calls, events, completions, failures, databaseWrites: 0, authWrites: 0, automaticRetries: 0, pricingUsd: { chatInputPerMillion: 2, chatOutputPerMillion: 10, embeddingPerMillion: 0.02 }, knownUsage: totals, costNote: "Usage estimate only; timed-out upstream calls may be billed without a returned usage envelope. Not billing settlement." };
  await writeFile(".cache/qa-timeout/live-smoke.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ outcomes, providerCalls: calls.length, completions, failures, databaseWrites: 0 }));
}
main().catch(() => { console.error("LIVE_SMOKE_NOT_CONFIRMED_DETAILS_SUPPRESSED"); process.exitCode = 1; });

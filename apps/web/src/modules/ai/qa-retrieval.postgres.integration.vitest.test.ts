import { fixtureQaAssessment } from "./__fixtures__/qa-reviewed-input";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { createQaRetriever, lockQaEvidenceEligibility } from "./qa-retrieval";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import type { EmbeddingProvider } from "../rag-processing/embedding-contract";
import type { Database } from "@KLTN/db";
import type { QaPrincipal } from "./qa-runtime-contract";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import { createQaConversationStore } from "./qa-conversation-store";
import { createQaGenerator } from "./qa-generation";
import { createQaService } from "./qa-service";
import { createQaHttpHandlers } from "./qa-http";
import { qaCompletedResponseSchema } from "./qa-contract";
import { createQaAbuseGuard, createQaNetworkResolver } from "./qa-abuse";
import { createQaPrincipalResolver } from "./qa-principal";
import { AssistantHttpTransport } from "../../components/assistant/assistant-http-transport";
vi.mock("server-only", () => ({}));

const databaseUrl = process.env.US19_TASK184_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const hash = "a".repeat(64);
const queryVector = [1, ...Array<number>(1535).fill(0)];
const provider: EmbeddingProvider = { provider: "openai", model: "text-embedding-3-small", dimensions: 1536,
  embed: async () => [{ index: 0, embedding: queryVector }] };
integrationDescribe("US21 real pgvector retrieval (explicit disposable database only)", () => {
  let db: PrismaClient;
  const documentIds: string[] = [];
  const publicSourceIds = new Set<string>();
  const guestIds: string[] = [];
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/task184_test" ||
      url.username !== "task184_test" || url.searchParams.get("sslmode") !== "disable" ||
      process.env.US19_TASK184_TEST_DISPOSABLE !== "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE") {
      throw new Error("Refusing retrieval tests outside explicitly confirmed disposable loopback PostgreSQL.");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const identity = await db.$queryRaw<Array<{ database: string; vectorVersion: string }>>(Prisma.sql`
      SELECT current_database() AS "database", extversion AS "vectorVersion" FROM pg_extension WHERE extname = 'vector'`);
    expect(identity[0]?.database).toBe("task184_test");
    expect(identity[0]?.vectorVersion).toMatch(/^0\.8\.6/);
  });
  afterAll(async () => {
    if (!db) return;
    for (const id of guestIds) {
      await db.$transaction(async tx => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM qa_turn WHERE "principalKind"='GUEST' AND "principalId"=${id}`);
        await tx.$executeRaw(Prisma.sql`DELETE FROM qa_conversation WHERE "principalKind"='GUEST' AND "principalId"=${id}`);
        await tx.$executeRaw(Prisma.sql`DELETE FROM qa_guest_identity WHERE id=${id}`);
      });
    }
    for (const id of documentIds) {
      await db.$transaction(async tx => {
        await tx.ragIndexPublication.deleteMany({ where: { ragDocumentId: id } });
        await tx.$executeRaw(Prisma.sql`DELETE FROM "rag_chunk_embedding" WHERE "chunkId" IN (SELECT "id" FROM "rag_chunk" WHERE "ragDocumentId" = ${id})`);
        await tx.ragChunk.deleteMany({ where: { ragDocumentId: id } });
        await tx.ragIndexGeneration.deleteMany({ where: { ragDocumentId: id } });
        await tx.ragContentVersion.deleteMany({ where: { ragDocumentId: id } });
        await tx.ragDocument.delete({ where: { id } });
      });
    }
    await db.$disconnect();
  });
  async function seed(status: "INDEXED" | "DISABLED" | "APPROVED" = "INDEXED", state: "READY" | "BUILDING" = "READY",
    publication = true, orthogonal = false, customVector?: number[], customText?: string) {
    const id = `qa-retrieval-${randomUUID()}`;
    documentIds.push(id);
    publicSourceIds.add(id); // Synthetic fixture explicitly approved for test DTO projection.
    // Public synthetic prose is separate from internal document identity.
    const text = customText ?? `Synthetic retrieval evidence number ${documentIds.length}.`;
    const tokenCount = countEmbeddingTokens(text);
    await db.ragDocument.create({ data: { id, originalFileName: "synthetic.txt", fileType: "TXT", mimeType: "text/plain", sizeBytes: 50,
      storagePath: `private/${id}`, sourceTitle: "Synthetic integration source", sourceUrl: "https://private.invalid/?token=secret",
      uploadedById: "synthetic", status } });
    const content = await db.ragContentVersion.create({ data: { ragDocumentId: id, originalBytesHash: hash, normalizedContentHash: hash,
      identityHash: hash, extractorVersion: "test", normalizationVersion: "test" } });
    async function generation(key: string, generationState: "READY" | "BUILDING") {
      const g = await db.ragIndexGeneration.create({ data: { ragDocumentId: id, contentVersionId: content.id, generationKey: key,
        chunkerVersion: "test", chunkOptions: {}, embeddingProvider: "openai", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536,
        tokenizer: "cl100k_base", tokenizerVersion: "js-tiktoken@1.0.21", expectedChunkCount: 1, expectedTokenCount: tokenCount,
        state: generationState, readyAt: generationState === "READY" ? new Date() : null } });
      const c = await db.ragChunk.create({ data: { ragDocumentId: id, generationId: g.id, index: 0, text, refs: [],
        locators: [{ format: "TXT", lineStart: 1, lineEnd: 1 }], textHash: hash, chunkHash: hash, chunkerVersion: "test" } });
      const vector = customVector ?? (orthogonal ? [0, 1, ...Array<number>(1534).fill(0)] : queryVector);
      await db.$executeRaw(Prisma.sql`INSERT INTO "rag_chunk_embedding" ("id", "chunkId", "inputHash", "vectorHash", "tokenCount", "embedding")
        VALUES (${randomUUID()}, ${c.id}, ${hash}, ${hash}, ${tokenCount}, ${`[${vector.join(",")}]`}::vector)`);
      return g;
    }
    const gen = await generation(hash, state);
    if (publication) await db.ragIndexPublication.create({ data: { ragDocumentId: id, generationId: gen.id } });
    return { id, gen, content, generation };
  }
  async function guest(): Promise<QaPrincipal> {
    const id = createHash("sha256").update(`qa-vertical-${randomUUID()}`).digest("hex");
    guestIds.push(id);
    await db.$executeRaw(Prisma.sql`INSERT INTO qa_guest_identity(id,"expiresAt") VALUES(${id},CURRENT_TIMESTAMP+INTERVAL '7 days')`);
    return { kind: "GUEST", id };
  }
  it("US22 real SQL selects only eligible named evidence with authentic citations", async () => {
    const startingCount = documentIds.length;
    const name = "Điểm Ngữ Cảnh Tổng Hợp";
    const selected = await seed("INDEXED", "READY", true, false, undefined, `${name} có dữ kiện giả lập.`);
    await seed("INDEXED", "READY", true, false, undefined, "Một điểm khác có dữ kiện riêng.");
    await seed("DISABLED", "READY", true, false, undefined, `${name} có dữ kiện đã vô hiệu hóa.`);
    const retriever = createQaRetriever(db as Database, { provider, publicSourceIds });
    const evidence = await retriever.retrieve("Nó có gì?", [], undefined, { type: "DESTINATION", destinationId: "synthetic_only", name });
    expect(evidence.map(item => item.documentId)).toEqual([selected.id]);
    expect(evidence[0]!.citation.title).toBe("Synthetic integration source");
    expect(await retriever.recheck(evidence)).toBe(true);
    expect(await retriever.retrieve("Q", [], undefined, { type: "DESTINATION", destinationId: "synthetic_missing", name: "Tên không có nguồn" })).toEqual([]);
    await db.ragDocument.updateMany({ where: { id: { in: documentIds.slice(startingCount) } }, data: { status: "DISABLED" } });
  });
  type Prompt = { HISTORY_QUESTIONS: string[]; CURRENT_EVIDENCE: Array<{ citationId: string; sentences: string[] }> };
  async function vertical(axis: number, respond?: (prompt: Prompt, call: number) => Promise<Response>) {
    const abuse = createQaAbuseGuard(db as Database);
    const resolver = createQaPrincipalResolver({ database: db as Database, secure: true, abuse,
      networkId: createQaNetworkResolver({ secret: () => "synthetic-offline-hmac-secret-32-characters", vercel: () => false, localIdentity: () => `vertical-${axis}` }),
      auth: { resolveSession: async () => null, database: { user: { findUnique: vi.fn() } } as never } });
    const bootstrap = await resolver.bootstrap(new Headers());
    const principal = bootstrap.principal;
    guestIds.push(principal.id);
    const cookie = bootstrap.setCookie!.split(";")[0]!;
    const vector = Array.from({ length: 1536 }, (_, index) => index === axis ? 1 : 0);
    const prompts: Prompt[] = [];
    const embeddingInputs: string[][] = [];
    const embeddingFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      embeddingInputs.push(body.input);
      return Response.json({ data: [{ index: 0, embedding: vector }] });
    });
    const answerFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = JSON.parse(body.messages[1]!.content) as Prompt;
      prompts.push(prompt);
      if (respond) return respond(prompt, prompts.length);
      return modelAnswer(prompt);
    });
    const retriever = createQaRetriever(db, { provider: createOpenAiEmbeddingProvider({ apiKey: () => "synthetic-test-only", fetcher: embeddingFetch as typeof fetch }), minScore: 0.99, publicSourceIds });
    const store = createQaConversationStore(db as Database, { abuse: abuse.hooks, publicSourceIds });
    const service = createQaService({ store, retriever, assessor: { assess: async input => fixtureQaAssessment(input) }, generator: createQaGenerator({ apiKey: () => "synthetic-test-only", fetcher: answerFetch as typeof fetch }) });
    const handlers = createQaHttpHandlers({ enabled: () => true, resolve: resolver.resolve, ...service });
    const ask = (input: unknown, key = randomUUID()) => handlers.ask(new Request("http://localhost/api/ai/ask", {
      method: "POST", body: JSON.stringify(input), headers: { cookie, origin: "http://localhost", "content-type": "application/json", "Idempotency-Key": key },
    }));
    const transport = new AssistantHttpTransport(async (_url, init) => {
      const headers = new Headers(init?.headers); headers.set("origin", "http://localhost"); headers.set("cookie", cookie);
      return handlers.ask(new Request("http://localhost/api/ai/ask", { ...init, headers }));
    });
    return { principal, vector, prompts, embeddingInputs, embeddingFetch, answerFetch, service, ask, transport };
  }
  function modelAnswer(prompt: Prompt, citationId = prompt.CURRENT_EVIDENCE[0]!.citationId): Response {
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "ANSWERED",
      answerParts: [{ text: prompt.CURRENT_EVIDENCE[0]!.sentences[0], citationIds: [citationId] }], unanswered: false }) } }] });
  }
  it("real transport joins server bootstrap, durable admission, pgvector, completion and same-key replay", async () => {
    const h = await vertical(106);
    const source = await seed("INDEXED", "READY", true, false, h.vector);
    const key = randomUUID(), payload = { question: "Synthetic transport question?", context: { type: "GENERAL" as const } };
    const attempt = { id: key, key, generation: 1, identity: "server-session", payload, body: JSON.stringify(payload) };
    const first = await h.transport.send(attempt, new AbortController().signal);
    expect(first.kind).toBe("response");
    if (first.kind !== "response") throw new Error("transport did not return response");
    expect(first.httpStatus).toBe(200);
    const data = qaCompletedResponseSchema.parse(first.body).data;
    expect(data.status).toBe("ANSWERED");
    const replay = await h.transport.send(attempt, new AbortController().signal);
    expect(replay).toEqual(first);
    expect(h.embeddingFetch).toHaveBeenCalledTimes(1); expect(h.answerFetch).toHaveBeenCalledTimes(1);
    const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM qa_turn WHERE "principalId"=${h.principal.id} AND key=${key}`);
    expect(Number(rows[0]!.n)).toBe(1);
    await db.ragDocument.update({ where: { id: source.id }, data: { status: "DISABLED" } });
  });
  it("runs cosine ranking with exact publication, state, status and relevance gates", async () => {
    const good = await seed();
    await seed("DISABLED"); await seed("APPROVED"); await seed("INDEXED", "BUILDING");
    await seed("INDEXED", "READY", false); await seed("INDEXED", "READY", true, true);
    // A ready historical generation must not join current publication.
    const historical = await good.generation("b".repeat(64), "READY");
    const retriever = createQaRetriever(db, { provider, topK: 20, minScore: 0.9, publicSourceIds });
    const evidence = await retriever.retrieve("Synthetic question?", []);
    const own = evidence.filter(item => documentIds.includes(item.documentId));
    expect(own).toHaveLength(1);
    expect(own[0]?.documentId).toBe(good.id);
    expect(own[0]?.generationId).toBe(good.gen.id);
    expect(own[0]?.generationId).not.toBe(historical.id);
    expect(own[0]?.score).toBeCloseTo(1);
    expect(own[0]?.citation.sourceUrl).toBeNull();
    expect(JSON.stringify(own[0]?.citation)).not.toMatch(/private|secret|chunkId|generationId|embedding/);
    const second = await retriever.retrieve("Synthetic question?", []);
    expect(second.map(item => item.chunkId)).toEqual(evidence.map(item => item.chunkId));
    // Isolate the remaining cases from this fixture's eligible publication.
    await db.ragDocument.update({ where: { id: good.id }, data: { status: "DISABLED" } });
  });
  it("rejects disabled and replaced publications at recheck, preserving original provenance", async () => {
    const good = await seed();
    const retriever = createQaRetriever(db, { provider, topK: 20, minScore: 0.9, publicSourceIds });
    const evidence = (await retriever.retrieve("Synthetic?", [])).filter(item => item.documentId === good.id);
    expect(await retriever.recheck(evidence)).toBe(true);
    expect(await retriever.recheck([{ ...evidence[0]!, contentVersionId: "wrong" }])).toBe(false);
    const replacement = await good.generation("b".repeat(64), "READY");
    await db.ragIndexPublication.update({ where: { ragDocumentId: good.id }, data: { generationId: replacement.id } });
    expect(await retriever.recheck(evidence)).toBe(false);
    const fresh = (await retriever.retrieve("Synthetic?", [])).filter(item => item.documentId === good.id);
    expect(fresh[0]?.generationId).toBe(replacement.id);
    await db.ragDocument.update({ where: { id: good.id }, data: { status: "DISABLED" } });
    expect(await retriever.recheck(fresh)).toBe(false);
  });
  it("completion eligibility lock fences a concurrent disable until transaction commit", async () => {
    const good = await seed();
    const retriever = createQaRetriever(db, { provider, topK: 20, minScore: 0.9, publicSourceIds });
    const evidence = (await retriever.retrieve("Synthetic?", [])).filter(item => item.documentId === good.id);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let locked!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const completion = db.$transaction(async tx => {
      expect(await lockQaEvidenceEligibility(tx, evidence, publicSourceIds)).toBe(true);
      locked(); await gate;
    }, { timeout: 10000 });
    await ready;
    const disabling = db.ragDocument.update({ where: { id: good.id }, data: { status: "DISABLED" } });
    // Await an observed PostgreSQL lock wait rather than inferring one from timing.
    const pending = disabling.then(() => true);
    let observedWait = false;
    try {
      for (let attempt = 0; attempt < 100 && !observedWait; attempt++) {
        const waiting = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT count(*)::int AS "count" FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%rag_document%'`);
        observedWait = (waiting[0]?.count ?? 0) > 0;
        if (!observedWait) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(observedWait).toBe(true);
    } finally { release(); }
    await completion; await pending;
    expect(await db.$transaction(tx => lockQaEvidenceEligibility(tx, evidence, publicSourceIds))).toBe(false);
  });
  it("vertical slice persists real retrieved citations and follows authorized history while retrieving anew", async () => {
    const h = await vertical(101);
    const source = await seed("INDEXED", "READY", true, false, h.vector);
    const firstResponse = await h.ask({ question: "Synthetic source question?" });
    expect(firstResponse.status).toBe(200);
    const first = qaCompletedResponseSchema.parse(await firstResponse.json()).data;
    expect(first.status).toBe("ANSWERED");
    expect(first.citations).toHaveLength(1);
    expect(first.citations[0]?.sourceUrl).toBeNull();
    expect(first.citations[0]?.sourceId).not.toContain(source.id);
    const followResponse = await h.ask({ conversationId: first.conversationId, parentTurnId: first.turnId, question: "What about it?" });
    expect(followResponse.status).toBe(200);
    const follow = qaCompletedResponseSchema.parse(await followResponse.json()).data;
    expect(follow.status).toBe("ANSWERED");
    expect(follow.turnId).not.toBe(first.turnId);
    expect(h.embeddingFetch).toHaveBeenCalledTimes(2);
    expect(h.answerFetch).toHaveBeenCalledTimes(2);
    expect(h.embeddingInputs[1]).toEqual(["Synthetic source question?\nWhat about it?"]);
    expect(h.prompts[1]?.HISTORY_QUESTIONS).toEqual(["Synthetic source question?"]);
    expect(h.prompts[1]?.CURRENT_EVIDENCE).toHaveLength(1);
    expect(await h.service.history(h.principal, first.conversationId)).toHaveLength(2);
    const other = await guest();
    await expect(h.service.ask(other, randomUUID(), { conversationId: first.conversationId, parentTurnId: follow.turnId, question: "Unauthorized?" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.embeddingFetch).toHaveBeenCalledTimes(2);
    const rows = await db.$queryRaw<Array<{ state: string; provenance: unknown }>>(Prisma.sql`SELECT state,provenance FROM qa_turn WHERE "conversationId"=${first.conversationId}`);
    expect(rows).toHaveLength(2); expect(rows.every(row => row.state === "COMPLETED")).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/private\/|secret|chunkId|generationId|embedding|storagePath/);
    await db.ragDocument.update({ where: { id: source.id }, data: { status: "DISABLED" } });
  });
  it("vertical slice completes no-source content without any answer model call", async () => {
    const h = await vertical(102);
    const response = await h.ask({ question: "Question with no current source?" });
    expect(response.status).toBe(200);
    const data = qaCompletedResponseSchema.parse(await response.json()).data;
    expect(data.status).toBe("INSUFFICIENT_SOURCE");
    expect(data.answerParts).toEqual([]); expect(data.citations).toEqual([]);
    expect(h.embeddingFetch).toHaveBeenCalledTimes(1);
    expect(h.answerFetch).not.toHaveBeenCalled();
    expect(await h.service.history(h.principal, data.conversationId)).toHaveLength(1);
  });
  it("vertical slice rejects Disable during generation and ignores old factual history on the next turn", async () => {
    let sourceId = "";
    const h = await vertical(103, async (prompt, call) => {
      if (call === 2) await db.ragDocument.update({ where: { id: sourceId }, data: { status: "DISABLED" } });
      return modelAnswer(prompt);
    });
    const source = await seed("INDEXED", "READY", true, false, h.vector);
    sourceId = source.id;
    const firstResponse = await h.ask({ question: "Initial verified source question?" });
    expect(firstResponse.status).toBe(200);
    const first = qaCompletedResponseSchema.parse(await firstResponse.json()).data;
    expect(first.status).toBe("ANSWERED");
    const follow = { conversationId: first.conversationId, parentTurnId: first.turnId, question: "Repeat its information?" };
    const failed = await h.ask(follow);
    expect(failed.status).toBe(502);
    const failure = await failed.json();
    expect(failure.operationStatus).toBe("FAILED"); expect(failure.error.code).toBe("AI_INVALID_RESPONSE");
    expect(failure).not.toHaveProperty("data");
    const freshResponse = await h.ask(follow);
    expect(freshResponse.status).toBe(200);
    const fresh = qaCompletedResponseSchema.parse(await freshResponse.json()).data;
    expect(fresh.status).toBe("INSUFFICIENT_SOURCE");
    expect(h.embeddingFetch).toHaveBeenCalledTimes(3);
    expect(h.answerFetch).toHaveBeenCalledTimes(2);
    const history = await h.service.history(h.principal, first.conversationId);
    expect(history).toHaveLength(2);
    expect(history[0]?.response.status).toBe("ANSWERED");
    expect(history[1]?.response.status).toBe("INSUFFICIENT_SOURCE");
    const turns = await db.$queryRaw<Array<{ state: string; response: unknown }>>(Prisma.sql`SELECT state,response FROM qa_turn WHERE "conversationId"=${first.conversationId}`);
    expect(turns.filter(turn => turn.state === "COMPLETED")).toHaveLength(2);
    expect(turns.filter(turn => turn.state === "FAILED")).toEqual([{ state: "FAILED", response: null }]);
  });
  it("vertical slice maps provider failure to503 and fabricated citations to502 without persisted answers", async () => {
    const h = await vertical(104, async (prompt, call) => call === 1 ? new Response(null, { status: 503 }) : modelAnswer(prompt, "fabricated_citation"));
    const source = await seed("INDEXED", "READY", true, false, h.vector);
    const unavailable = await h.ask({ question: "Technical provider failure?" });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE" } });
    const fabricated = await h.ask({ question: "Fabricated citation attempt?" });
    expect(fabricated.status).toBe(502);
    expect(await fabricated.json()).toMatchObject({ operationStatus: "FAILED", error: { code: "AI_INVALID_RESPONSE" } });
    const rows = await db.$queryRaw<Array<{ state: string; response: unknown }>>(Prisma.sql`SELECT state,response FROM qa_turn WHERE "principalKind"='GUEST' AND "principalId"=${h.principal.id}`);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.state === "FAILED" && row.response === null)).toBe(true);
    expect(h.embeddingFetch).toHaveBeenCalledTimes(2); expect(h.answerFetch).toHaveBeenCalledTimes(2);
    await db.ragDocument.update({ where: { id: source.id }, data: { status: "DISABLED" } });
  });
});

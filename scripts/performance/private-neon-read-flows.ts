import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { createAuth } from "@KLTN/auth";
import { requireActor } from "../../apps/web/src/server/authorization/guard";
import { getFavorites } from "../../apps/web/src/modules/favorite/favorite-service";
import { listMyTrips } from "../../apps/web/src/modules/trip-read/trip-read-service";
import { listDestinations } from "../../apps/web/src/modules/destination/destination-service";
import { createQaConversationStore } from "../../apps/web/src/modules/ai/qa-conversation-store";
import { observeNeonFactory, readSpans, unionMs } from "./neon-spans.mjs";
import { summarize } from "./metrics.mjs";

const secrets = parseEnv(await readFile("apps/web/.env", "utf8"));
const url = new URL(secrets.SYNC_SOURCE_DATABASE_URL!);
if (!/^ep-purple-pond-b3xujb8o(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || url.pathname !== "/neondb") throw Error("DEVELOPMENT_REQUIRED");
const fixtures = JSON.parse(await readFile(".cache/performance-v3-test-accounts-private.json", "utf8"));
if (fixtures.branch !== "br-aged-hat-b3o6hg9p" || fixtures.cleanedAt) throw Error("OWNED_FIXTURES_REQUIRED");
url.searchParams.set("sslmode", "verify-full");
const db = new PrismaClient({ adapter: observeNeonFactory(new PrismaNeon({ connectionString: url.toString(), max: 2 })), log: [{ emit: "event", level: "query" }] });
let queryCount = 0;
db.$on("query", () => queryCount++);
const database = db as unknown as Database;
const auth = createAuth({ BETTER_AUTH_URL: "http://localhost:3010", BETTER_AUTH_SECRET: randomUUID() + randomUUID() }, database);
const observations: object[] = [];
try {
  for (const fixture of fixtures.accounts) {
    const login = await auth.api.signInEmail({ body: { email: fixture.email, password: fixture.password }, headers: new Headers({ origin: "http://localhost:3010" }), asResponse: true });
    if (login.status !== 200) throw Error("REAL_SIGNIN_REQUIRED");
    const headers = new Headers({ cookie: login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") });
    const deps = { database, resolveSession: async (headers: Headers) => auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }) };
    const flows: { id: string; work: () => Promise<unknown> }[] = [
      { id: "favorites", work: () => getFavorites(headers, deps) },
      { id: "my-trips", work: () => listMyTrips(headers, deps, "2026-10-18") },
      { id: "dashboard-authorization", work: async () => { const session = await deps.resolveSession(headers); if (!session) throw Error("SESSION_REQUIRED"); const actor = await requireActor(headers, { ...deps, resolveSession: async () => session }); return { role: actor.role }; } },
      ...(fixture.role === "ADMIN" ? [{ id: "cms-admin", work: () => listDestinations(headers, 1, deps) }] : []),
      // Repository-only measurement after real persisted authorization. This
      // does NOT enable or bypass the HTTP runtime readiness gate. History
      // performs owned retention cleanup/locks, so run only on test principals
      // in DEVELOPMENT, never on an existing Production conversation owner.
      { id: "ai-history-repository-only", work: async () => { const actor = await requireActor(headers, deps); const store = createQaConversationStore(database); if (!store.list) throw Error("HISTORY_LIST_UNAVAILABLE"); return store.list({ kind: "USER", id: actor.id }, {}); } },
    ];
    for (const flow of flows) {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const scope = { connections: [], queries: [], explain: [] };
        queryCount = 0;
        const start = performance.now(), value = await readSpans.run(scope, flow.work), serviceMs = performance.now() - start;
        const serializeStart = performance.now(), json = JSON.stringify(value), serializationMs = performance.now() - serializeStart;
        samples.push({ sample: i, queryCount, poolCheckoutMs: unionMs(scope.connections), driverRoundtripMs: unionMs(scope.queries), serviceMs, serializationMs, totalMs: serviceMs + serializationMs, bytes: Buffer.byteLength(json) });
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      observations.push({ flow: flow.id, role: fixture.role, cohort: "owned fresh synthetic account; personal lists empty", samples, totalMs: summarize(samples.map(s => s.totalMs)), queryCounts: [...new Set(samples.map(s => s.queryCount))] });
      console.log(JSON.stringify({ flow: flow.id, role: fixture.role, measured: samples.length }));
    }
  }
  await writeFile("docs/performance/evidence/performance-v3-private-neon.json", JSON.stringify({ measuredAt: new Date().toISOString(), scope: "Local authenticated service/repository reads against DEVELOPMENT, same application PrismaNeon adapter; no API/Vercel timings; no before variant or optimization claim", productionWrites: 0, providerCalls: 0, historyHttpGate: "UNCHANGED_DISABLED_ON_PREVIEW", fixtureWrites: "Better Auth sign-in sessions; history owned retention maintenance only", observations }, null, 2) + "\n");
} finally { await db.$disconnect(); }

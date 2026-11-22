import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { createOriginSearchStore } from "./origin-search-store";
import { createOriginSearchService } from "./origin-search-service";

const raw = process.env.ORIGIN_SEARCH_TEST_DATABASE_URL;
const suite = raw ? describe : describe.skip;
suite("origin search actual PostgreSQL admission/cache/migration", () => {
  let db: PrismaClient, other: PrismaClient;
  const workers: ChildProcess[] = [];
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/origin02_test" || target.username !== "origin02_test" || target.searchParams.get("sslmode") !== "disable" || process.env.ORIGIN_SEARCH_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-owned origin search database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (identity[0]?.name !== "origin02_test") throw new Error("Disposable identity rejected");
  });
  beforeEach(async () => {
    await db.$executeRaw`DELETE FROM "origin_search_cache"`;
    await db.$executeRaw`UPDATE "origin_search_admission" SET "nextAllowedAt" = clock_timestamp() - interval '1 minute' WHERE "id" = 'nominatim'`;
  });
  afterAll(async () => {
    for (const worker of workers) if (worker.exitCode === null) worker.kill();
    await Promise.all([db?.$disconnect(), other?.$disconnect()]);
  });
  async function startWorker(hold = false): Promise<ChildProcess> {
    const worker = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", resolve("scripts/origin-search-worker-bootstrap.mjs"), ...(hold ? ["hold"] : [])], { cwd: process.cwd(), env: { ...process.env, ORIGIN_SEARCH_TEST_DATABASE_URL: raw }, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    workers.push(worker);
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker readiness timeout")), 20_000);
      worker.once("error", error => { clearTimeout(timer); reject(error); });
      worker.once("exit", code => { clearTimeout(timer); reject(new Error(`Worker exited before ready: ${code}`)); });
      worker.on("message", message => { if (message && typeof message === "object" && "type" in message && message.type === "ready") { clearTimeout(timer); done(); } });
    });
    return worker;
  }
  async function claim(worker: ChildProcess): Promise<boolean> {
    return new Promise<boolean>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker claim timeout")), 10_000);
      worker.on("message", message => { if (message && typeof message === "object" && "type" in message && message.type === "result") { clearTimeout(timer); done("admitted" in message && message.admitted === true); } });
      worker.send("claim");
    });
  }
  it("applies the scoped migration and records no pending/failed receipts", async () => {
    const rows = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ migration_name: "20261104110000_origin_search", rolled_back_at: null });
    expect(rows[0]?.finished_at).toBeInstanceOf(Date);
    expect(await createOriginSearchStore(db).claim()).not.toBeNull();
  });
  it("admits exactly one of three independent OS workers and denies immediate retries", async () => {
    const pool = await Promise.all([startWorker(), startWorker(), startWorker()]);
    expect((await Promise.all(pool.map(claim))).filter(Boolean)).toHaveLength(1);
    expect(await createOriginSearchStore(other).claim()).toBeNull();
  }, 30_000);
  it("persists cooldown after admitted worker death and only reopens after its reserved window", async () => {
    const worker = await startWorker(true);
    expect(await claim(worker)).toBe(true);
    const exited = new Promise<void>(done => worker.once("exit", () => done()));
    worker.kill(); await exited;
    const store = createOriginSearchStore(other);
    expect(await store.claim()).toBeNull();
    const before = Date.now();
    await new Promise(done => setTimeout(done, 4100));
    expect(await store.claim()).not.toBeNull();
    expect(Date.now() - before).toBeGreaterThanOrEqual(4000);
  }, 30_000);
  it("shares cached results/empty results/expiration across connections without another provider call", async () => {
    const config = () => ({ endpoint: "https://nominatim.example.test/search", contact: "https://example.test/contact" });
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([{ display_name: "Hà Nội", lat: "21.028511", lon: "105.804817" }]));
    const first = createOriginSearchService({ store: createOriginSearchStore(db), config, fetcher });
    const second = createOriginSearchService({ store: createOriginSearchStore(other), config, fetcher });
    expect(await first({ query: "Hà Nội" })).toMatchObject({ status: "RESULTS", cached: false });
    expect(await second({ query: "  hà   nội " })).toMatchObject({ status: "RESULTS", cached: true });
    expect(fetcher).toHaveBeenCalledOnce();
    const a = createOriginSearchStore(db), b = createOriginSearchStore(other);
    await a.write("empty-result-fixture", []);
    expect(await b.read("empty-result-fixture")).toEqual([]);
    await db.$executeRaw`UPDATE "origin_search_cache" SET "expiresAt" = clock_timestamp() - interval '1 second'`;
    expect(await b.read("empty-result-fixture")).toBeNull();
    await a.write("current-fixture", []);
    const remaining = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "origin_search_cache"`;
    expect(remaining[0]?.count).toBe(BigInt(1));
  });
  it("keeps the committed shared cooldown after upstream timeout and denies immediate retry on another connection", async () => {
    const config = () => ({ endpoint: "https://nominatim.example.test/search", contact: "https://example.test/contact" });
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const first = createOriginSearchService({ store: createOriginSearchStore(db), config, fetcher });
    const second = createOriginSearchService({ store: createOriginSearchStore(other), config, fetcher });
    expect(await first({ query: "Hà Nội" })).toEqual({ status: "UNAVAILABLE" });
    expect(await second({ query: "Hà Giang" })).toEqual({ status: "BUSY", retryAfterSeconds: 4 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  }, 10_000);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import yaml from "js-yaml";
import { resolveCleanupUrl, runCleanup, runHeartbeatCheck, validateCleanupResult, validateScheduledHeartbeat } from "./qa-cleanup-actions.mjs";

const sample = (overrides = {}) => ({
  processed: 2,
  hasMore: false,
  lockAcquired: true,
  lastSuccessfulSweep: "2026-10-11T12:00:00.000Z",
  eligibleBacklogCount: 0,
  oldestOverdueItem: null,
  failureCount: 0,
  ...overrides,
});

test("cleanup target is fixed to HTTPS and an explicitly matching configured host", () => {
  assert.equal(resolveCleanupUrl("https://qa.example.test", "qa.example.test"), "https://qa.example.test/api/internal/qa-cleanup");
  for (const [origin, host] of [
    ["http://qa.example.test", "qa.example.test"],
    ["https://other.example.test", "qa.example.test"],
    ["https://qa.example.test/elsewhere", "qa.example.test"],
    ["https://qa.example.test/?redirect=https://evil.test", "qa.example.test"],
    ["https://user:pass@qa.example.test", "qa.example.test"],
    ["https://127.0.0.1", "127.0.0.1"],
  ]) assert.throws(() => resolveCleanupUrl(origin, host));
});

test("cleanup response is strict, metadata-only and internally consistent", () => {
  assert.deepEqual(validateCleanupResult(sample()), sample());
  assert.throws(() => validateCleanupResult(sample({ lockAcquired: false })));
  assert.throws(() => validateCleanupResult(sample({ hasMore: true })));
  assert.throws(() => validateCleanupResult({ ...sample(), content: "private conversation" }));
});

test("runner authenticates, disables redirects, retries bounded transient errors and drains a bounded backlog", async () => {
  const seen = [];
  const delays = [];
  const logs = [];
  let call = 0;
  const result = await runCleanup({
    env: { QA_CLEANUP_ORIGIN: "https://qa.example.test", QA_CLEANUP_ALLOWED_HOST: "qa.example.test", CRON_SECRET: "s".repeat(40) },
    fetcher: async (url, init) => {
      seen.push({ url: String(url), init });
      call++;
      if (call === 1) return new Response("", { status: 503 });
      if (call === 2) return new Response(JSON.stringify(sample({ hasMore: true, eligibleBacklogCount: 1 })));
      return new Response(JSON.stringify(sample({ processed: 1 })));
    },
    sleepFn: async ms => delays.push(ms),
    logger: line => logs.push(line),
  });
  assert.deepEqual(result, { sweeps: 2, processed: 3, lastSuccessfulSweep: "2026-10-11T12:00:00.000Z" });
  assert.deepEqual(delays, [1000]);
  assert.equal(seen.length, 3);
  assert.equal(seen[0].url, "https://qa.example.test/api/internal/qa-cleanup");
  assert.equal(seen[0].init.headers.authorization, `Bearer ${"s".repeat(40)}`);
  assert.equal(seen[0].init.redirect, "error");
  assert.ok(logs.every(line => !line.includes("s".repeat(40)) && !line.includes("private")));
});

test("runner fails closed on unsafe targets, disabled responses, busy leases and exhausted retries", async () => {
  const base = { QA_CLEANUP_ORIGIN: "https://qa.example.test", QA_CLEANUP_ALLOWED_HOST: "qa.example.test", CRON_SECRET: "s".repeat(40) };
  await assert.rejects(runCleanup({ env: { ...base, QA_CLEANUP_ORIGIN: "http://qa.example.test" }, logger() {} }));
  await assert.rejects(runCleanup({ env: base, fetcher: async () => new Response("", { status: 202 }), logger() {} }), /CLEANUP_LEASE_BUSY/);
  let calls = 0;
  await assert.rejects(runCleanup({ env: base, fetcher: async () => { calls++; return new Response("", { status: 503 }); }, sleepFn: async () => {}, logger() {} }), /CLEANUP_HTTP_FAILED/);
  assert.equal(calls, 3);
  await assert.rejects(runCleanup({ env: base, fetcher: async () => new Response(JSON.stringify(sample({ hasMore: true, eligibleBacklogCount: 1, processed: 0 }))), logger() {} }), /CLEANUP_BACKLOG_NO_PROGRESS/);
});

test("watchdog detects missing, stale and failed scheduled heartbeats but ignores manual runs", () => {
  const now = Date.parse("2026-10-11T12:47:00.000Z");
  const heartbeat = { event: "schedule", head_branch: "master", created_at: "2026-10-11T12:17:00.000Z", status: "completed", conclusion: "success" };
  assert.equal(validateScheduledHeartbeat([heartbeat, { ...heartbeat, event: "workflow_dispatch", created_at: "2026-10-11T12:46:00.000Z" }], { now }).state, "success");
  assert.throws(() => validateScheduledHeartbeat([], { now }), /CLEANUP_HEARTBEAT_MISSING/);
  assert.throws(() => validateScheduledHeartbeat([{ ...heartbeat, created_at: "2026-10-11T11:17:00.000Z" }], { now }), /CLEANUP_HEARTBEAT_STALE/);
  assert.throws(() => validateScheduledHeartbeat([{ ...heartbeat, conclusion: "failure" }], { now }), /CLEANUP_HEARTBEAT_FAILED/);
  assert.throws(() => validateScheduledHeartbeat([{ ...heartbeat, head_branch: "feat/us21-rag-qa-batch" }], { now }), /CLEANUP_HEARTBEAT_MISSING/);
});

test("watchdog calls only the fixed GitHub Actions API endpoint and reports sanitized heartbeat state", async () => {
  let request;
  const logs = [];
  const now = Date.parse("2026-10-11T12:47:00.000Z");
  const run = { event: "schedule", head_branch: "master", created_at: "2026-10-11T12:17:00.000Z", status: "completed", conclusion: "success" };
  const state = await runHeartbeatCheck({
    env: { GITHUB_REPOSITORY: "owner/repo", QA_GITHUB_API_TOKEN: "ghs_private_test" },
    now,
    fetcher: async (url, init) => { request = { url: String(url), init }; return new Response(JSON.stringify({ workflow_runs: [run] })); },
    logger: line => logs.push(line),
  });
  assert.equal(state.state, "success");
  assert.match(request.url, /^https:\/\/api\.github\.com\/repos\/owner\/repo\/actions\/workflows\/us21-qa-retention-cleanup\.yml\/runs\?/u);
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.authorization, "Bearer ghs_private_test");
  assert.ok(logs.every(line => !line.includes("ghs_private_test")));
});

test("workflow YAML keeps schedules, default-branch guard, protected variables and read-only watchdog permissions", async () => {
  const cleanupText = await readFile(new URL("../../../.github/workflows/us21-qa-retention-cleanup.yml", import.meta.url), "utf8");
  const heartbeatText = await readFile(new URL("../../../.github/workflows/us21-qa-retention-heartbeat.yml", import.meta.url), "utf8");
  const cleanup = yaml.load(cleanupText);
  const heartbeat = yaml.load(heartbeatText);
  assert.deepEqual(cleanup.on.schedule, [{ cron: "17 * * * *" }]);
  assert.ok(cleanup.on.workflow_dispatch.inputs.confirm_production_cleanup);
  assert.match(cleanup.jobs.cleanup.if, /refs\/heads\/master/u);
  assert.equal(cleanup.jobs.cleanup.environment.name, "qa-cleanup-production");
  assert.equal(cleanup.jobs.cleanup.steps.at(-1).env.QA_CLEANUP_ORIGIN, "${{ vars.QA_CLEANUP_ORIGIN }}");
  assert.equal(cleanup.jobs.cleanup.steps.at(-1).env.CRON_SECRET, "${{ secrets.CRON_SECRET }}");
  assert.deepEqual(heartbeat.on.schedule, [{ cron: "47 * * * *" }]);
  assert.deepEqual(heartbeat.permissions, { actions: "read", contents: "read" });
  assert.match(heartbeat.jobs.heartbeat.if, /refs\/heads\/master/u);
});

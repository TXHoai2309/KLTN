import { appendFile } from "node:fs/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const cleanupPath = "/api/internal/qa-cleanup";
const cleanupTimeoutMs = 45_000;
const githubApiTimeoutMs = 10_000;
const requestAttempts = 3;
const maxSweeps = 8;
const heartbeatMaxAgeMs = 75 * 60_000;
const acceptedResultKeys = ["eligibleBacklogCount", "failureCount", "hasMore", "lastSuccessfulSweep", "lockAcquired", "oldestOverdueItem", "processed"];

export class QaCleanupActionError extends Error {
  constructor(code) {
    super(code);
    this.name = "QaCleanupActionError";
    this.code = code;
  }
}

function fail(code) {
  throw new QaCleanupActionError(code);
}

export function resolveCleanupUrl(origin, allowedHost) {
  if (typeof origin !== "string" || origin.length > 253 || typeof allowedHost !== "string" || !allowedHost) fail("CLEANUP_TARGET_NOT_CONFIGURED");
  let parsed;
  try { parsed = new URL(origin); } catch { fail("CLEANUP_TARGET_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || parsed.port) fail("CLEANUP_TARGET_INVALID");
  if (parsed.hostname.toLowerCase() !== allowedHost.trim().toLowerCase() || isIP(parsed.hostname) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/iu.test(parsed.hostname)) fail("CLEANUP_TARGET_HOST_MISMATCH");
  return new URL(cleanupPath, parsed.origin).href;
}

function isIsoTimestamp(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateCleanupResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CLEANUP_RESPONSE_INVALID");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...acceptedResultKeys].sort())) fail("CLEANUP_RESPONSE_INVALID");
  if (!Number.isSafeInteger(value.processed) || value.processed < 0 || typeof value.hasMore !== "boolean" || value.lockAcquired !== true ||
    !isIsoTimestamp(value.lastSuccessfulSweep) || !Number.isSafeInteger(value.eligibleBacklogCount) || value.eligibleBacklogCount < 0 ||
    !isIsoTimestamp(value.oldestOverdueItem, true) || !Number.isSafeInteger(value.failureCount) || value.failureCount < 0 ||
    value.hasMore !== (value.eligibleBacklogCount > 0)) fail("CLEANUP_RESPONSE_INVALID");
  return value;
}

async function readJsonLimited(response, maxBytes = 16 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) fail("CLEANUP_RESPONSE_INVALID");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        fail("CLEANUP_RESPONSE_INVALID");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("CLEANUP_RESPONSE_INVALID"); }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function invokeOneCleanup({ url, secret, fetcher, sleepFn }) {
  for (let attempt = 0; attempt < requestAttempts; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(cleanupTimeoutMs),
        headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
      });
    } catch {
      if (attempt + 1 === requestAttempts) fail("CLEANUP_REQUEST_FAILED");
      await sleepFn(1_000 * (2 ** attempt));
      continue;
    }

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < requestAttempts) {
        await sleepFn(1_000 * (2 ** attempt));
        continue;
      }
      fail(response.status === 202 ? "CLEANUP_LEASE_BUSY" : "CLEANUP_HTTP_FAILED");
    }
    return validateCleanupResult(await readJsonLimited(response));
  }
  fail("CLEANUP_REQUEST_FAILED");
}

async function writeSummary(env, text) {
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${text}\n`, { encoding: "utf8" });
}

export async function runCleanup({ env = process.env, fetcher = fetch, sleepFn = sleep, logger = console.log } = {}) {
  const url = resolveCleanupUrl(env.QA_CLEANUP_ORIGIN, env.QA_CLEANUP_ALLOWED_HOST);
  const secret = env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length < 32) fail("CLEANUP_SECRET_NOT_CONFIGURED");

  let totalProcessed = 0;
  let result;
  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    result = await invokeOneCleanup({ url, secret, fetcher, sleepFn });
    totalProcessed += result.processed;
    logger(JSON.stringify({ sweep, processed: result.processed, backlog: result.eligibleBacklogCount, lastSuccessfulSweep: result.lastSuccessfulSweep }));
    if (!result.hasMore) {
      const summary = `US-21 cleanup heartbeat: completed ${sweep} bounded sweep(s), processed ${totalProcessed}, eligible backlog 0.`;
      await writeSummary(env, summary);
      return { sweeps: sweep, processed: totalProcessed, lastSuccessfulSweep: result.lastSuccessfulSweep };
    }
    if (result.processed === 0) fail("CLEANUP_BACKLOG_NO_PROGRESS");
  }
  fail("CLEANUP_BACKLOG_REMAINS");
}

export function validateScheduledHeartbeat(runs, { now = Date.now(), defaultBranch = "master", maxAgeMs = heartbeatMaxAgeMs } = {}) {
  if (!Array.isArray(runs)) fail("HEARTBEAT_RESPONSE_INVALID");
  const candidates = runs.filter(run => run && run.event === "schedule" && run.head_branch === defaultBranch && typeof run.created_at === "string")
    .map(run => ({ ...run, createdAtMs: Date.parse(run.created_at) }))
    .filter(run => Number.isFinite(run.createdAtMs))
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
  const latest = candidates[0];
  if (!latest) fail("CLEANUP_HEARTBEAT_MISSING");
  const age = now - latest.createdAtMs;
  if (age < -5 * 60_000 || age > maxAgeMs) fail("CLEANUP_HEARTBEAT_STALE");
  if (latest.status === "queued" || latest.status === "in_progress") return { state: "pending", ageMs: age };
  if (latest.status !== "completed" || latest.conclusion !== "success") fail("CLEANUP_HEARTBEAT_FAILED");
  return { state: "success", ageMs: age };
}

export async function runHeartbeatCheck({ env = process.env, fetcher = fetch, now = Date.now(), logger = console.log } = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const token = env.QA_GITHUB_API_TOKEN;
  const defaultBranch = env.QA_DEFAULT_BRANCH ?? "master";
  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) || typeof token !== "string" || token.length < 1) fail("HEARTBEAT_CONFIG_INVALID");
  const url = new URL(`/repos/${repository}/actions/workflows/us21-qa-retention-cleanup.yml/runs?event=schedule&per_page=10`, "https://api.github.com");
  let response;
  try {
    response = await fetcher(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(githubApiTimeoutMs), headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  } catch { fail("HEARTBEAT_API_UNAVAILABLE"); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    fail("HEARTBEAT_API_UNAVAILABLE");
  }
  const payload = await readJsonLimited(response, 64 * 1024);
  const state = validateScheduledHeartbeat(payload?.workflow_runs, { now, defaultBranch });
  logger(JSON.stringify({ cleanupHeartbeat: state.state, ageMinutes: Math.floor(state.ageMs / 60_000), defaultBranch }));
  return state;
}

async function main() {
  try {
    if (process.argv[2] === "cleanup") await runCleanup();
    else if (process.argv[2] === "heartbeat") await runHeartbeatCheck();
    else fail("INVALID_COMMAND");
  } catch (error) {
    const code = error instanceof QaCleanupActionError ? error.code : "CLEANUP_ACTION_FAILED";
    process.stderr.write(`US-21 cleanup automation failed: ${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

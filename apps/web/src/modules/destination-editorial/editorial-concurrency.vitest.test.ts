import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const http = { deps: null as any, client: null as any };
import { createEditorialProposalHandler } from "./editorial-http";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
import { autoLayoutV2 } from "./editorial-engine";
import { readEditorialContext } from "./editorial-service";
import { createEditorialOpenAiClient } from "./editorial-openai-client";
import { withEditorialAiConcurrency } from "./editorial-concurrency";
import { editorialRetryAfter, editorial429Message } from "./editorial-retry-after";

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => { info = vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function fixture() {
  const f = v3TestStore(), db = f.deps.database as any;
  const created = await writeDestination(new Headers(), { name: "Fixture", description: "Fixture introduction.\n\nFixture body.", area: "Fixture area", category: "thiên nhiên", latitude: 23, longitude: 105, suggestedDurationMinutes: 60, minimumDurationMinutes: 30, openingDays: unknownSchedule() }, "create", null, f.deps);
  if (created.status !== "SUCCESS") throw Error("fixture");
  const id = created.data.id, layout = autoLayoutV2(await readEditorialContext(id, db));
  const budgetRead = vi.fn(() => { throw Error("Editorial must not read a historical budget"); });
  db.idempotencyRecord.count = budgetRead;
  db.idempotencyRecord.findMany = budgetRead;
  // Historical full-day admissions remain present but are never read or rewritten.
  for (let i = 0; i < 20; i++) f.records().set(`old-budget-${i}`, { scope: JSON.stringify(["test-admin", "destination:editorial-ai-budget"]), key: `old-budget-${i}`, responseJson: '{"admitted":true}', createdAt: new Date() });
  const recordsBefore = structuredClone(f.records());
  const install = (fetcher: typeof fetch) => { http.deps = f.deps; http.client = createEditorialOpenAiClient({ apiKey: () => "private-fixture-key", model: () => "gpt-6-luna", fetcher }); };
  const request = (mode = "PROPOSE", version = 2) => createEditorialProposalHandler(http.deps, () => http.client)(new Request("http://localhost/api/admin/destinations/fixture/editorial/propose", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ layout, mode, version }) }), { params: Promise.resolve({ id }) });
  return { ...f, id, db, layout, install, request, budgetRead, recordsBefore };
}
function answer(init: any, changed = true) {
  const input = JSON.parse(JSON.parse(init.body).messages[1].content), base = input.currentLayout;
  return { ...base, design: changed ? { typography: "MODERN", palette: "SLATE", rhythm: "IMMERSIVE", containerWidth: "STANDARD" } : base.design };
}
const response = (proposal: unknown) => new Response(JSON.stringify({ model: "gpt-6-luna", usage: { prompt_tokens: 123, completion_tokens: 45 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(proposal) } }] }), { headers: { "x-request-id": "req_mock_fixture" } });
const logs = (): Record<string, any>[] => info.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));

describe("Editorial admission, provider evidence and honest 429 UX", () => {
  it.each([["development", "PROPOSE"], ["production", "PROPOSE"]])("allows 25 sequential %s %s actions without minute/day budgets", async (environment, mode) => {
    vi.stubEnv("NODE_ENV", environment);
    const f = await fixture(), fetcher = vi.fn(async (_url, init) => response(answer(init))); f.install(fetcher as typeof fetch);
    for (let i = 0; i < 25; i++) {
      const r = await f.request(mode); expect(r.status).toBe(200); expect((await r.json()).data.status).toBe("PROPOSED");
    }
    expect(fetcher).toHaveBeenCalledTimes(25); expect(f.budgetRead).not.toHaveBeenCalled();
    expect(f.records()).toEqual(f.recordsBefore);
    expect(logs().some(l => l.stage === "ADMISSION_REJECTED")).toBe(false);
  });
  it("rejects a duplicate in-flight action with 409, then immediately allows the next action", async () => {
    const f = await fixture(); let started!: () => void, release!: () => void;
    const entered = new Promise<void>(r => started = r), gate = new Promise<void>(r => release = r);
    const fetcher = vi.fn(async (_url, init) => { started(); await gate; return response(answer(init)); }); f.install(fetcher as typeof fetch);
    const first = f.request(); await entered;
    try {
      const second = await f.request(); expect(second.status).toBe(409);
      expect(await second.json()).toMatchObject({ error: { code: "EDITORIAL_AI_IN_PROGRESS" } });
      expect(second.headers.has("Retry-After")).toBe(false); expect(fetcher).toHaveBeenCalledOnce();
      expect(logs().at(-1)).toMatchObject({ admissionReason: "CONCURRENCY", providerCalled: false });
    } finally { release(); await first; }
    expect((await f.request()).status).toBe(200);
  });
  it("caps in-flight work per process without a time quota and releases slots on error", async () => {
    let release!: () => void; const gate = new Promise<void>(r => release = r);
    const running = ["a", "b", "c", "d"].map(id => withEditorialAiConcurrency(id, () => gate));
    try { await expect(withEditorialAiConcurrency("e", async () => 1)).rejects.toMatchObject({ status: 503, code: "EDITORIAL_AI_BUSY" }); }
    finally { release(); await Promise.all(running); }
    await expect(withEditorialAiConcurrency("e", async () => { throw Error("timeout/cancel/provider failure"); })).rejects.toThrow();
    await expect(withEditorialAiConcurrency("e", async () => 1)).resolves.toBe(1);
  });
  it.each([null, "TRAVELER"])("denies %s before provider or request body parsing", async role => {
    const deps = v3TestStore(role as any).deps, fetcher = vi.fn();
    const client = createEditorialOpenAiClient({ apiKey: () => "fixture", model: () => "gpt-6-luna", fetcher });
    const r = await createEditorialProposalHandler(deps, () => client)(new Request("http://localhost/api/admin/destinations/fixture/editorial/propose", {method:"POST", body:"invalid"}), { params: Promise.resolve({id:"fixture"}) });
    expect(r.status).toBe(role ? 403 : 401); expect(fetcher).not.toHaveBeenCalled();
  });
  it("logs the actual provider response/model/usage/request ID and final validation with one correlation", async () => {
    const f = await fixture(); const fetcher = vi.fn(async (_url, init) => response(answer(init))); f.install(fetcher as typeof fetch);
    const r = await f.request(); expect(r.status).toBe(200); expect(fetcher).toHaveBeenCalledOnce();
    const trace = logs(), correlation = r.headers.get("X-Editorial-Ai-Request-Id");
    expect(trace.every(l => l.correlationId === correlation)).toBe(true);
    expect(trace.map(l => l.stage)).toEqual(expect.arrayContaining(["APP_REQUEST_RECEIVED", "ADMISSION_ACCEPTED", "PROVIDER_REQUEST_STARTED", "PROVIDER_RESPONSE_RECEIVED", "PROPOSAL_VALIDATED"]));
    expect(trace.find(l => l.stage === "PROVIDER_RESPONSE_RECEIVED")).toMatchObject({ actualModel: "gpt-6-luna", httpStatus: 200, providerRequestId: "req_mock_fixture", inputTokens: 123, outputTokens: 45 });
    expect(JSON.stringify(trace)).not.toContain("private-fixture"); expect(JSON.stringify(trace)).not.toContain("Fixture introduction");
  });
  it("distinguishes provider 429, forwards its Retry-After and never retries it", async () => {
    const f = await fixture(), fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), { status: 429, headers: { "retry-after": "7", "x-request-id": "req_mock_rate" } })); f.install(fetcher as typeof fetch);
    const r = await f.request(); expect(r.status).toBe(429); expect(r.headers.get("Retry-After")).toBe("7");
    expect(await r.json()).toMatchObject({ error: { code: "EDITORIAL_AI_PROVIDER_RATE_LIMIT", details: { source: "PROVIDER", providerCode: "rate_limit_exceeded" } } });
    expect(fetcher).toHaveBeenCalledOnce(); expect(logs().some(l => l.stage === "ADMISSION_REJECTED")).toBe(false);
    expect(logs().at(-1)).toMatchObject({ stage: "FALLBACK_USED", code: "RATE_LIMIT" });
    f.install(vi.fn(async (_url, init) => response(answer(init))) as typeof fetch);
    expect((await f.request()).status).toBe(200); // no application cooldown after completion
  });
  it("retains provider billing quota codes rather than PROPOSAL_INVALID", async () => {
    const f = await fixture(); f.install(vi.fn(async () => new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })) as typeof fetch);
    const r = await f.request(); expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: { code: "EDITORIAL_AI_PROVIDER_QUOTA", details: { source: "PROVIDER", providerCode: "insufficient_quota" } } });
    expect(editorial429Message("EDITORIAL_AI_PROVIDER_QUOTA", "insufficient_quota")).toContain("insufficient_quota");
  });
  it("logs validation rejection and fallback without applying invalid proposals", async () => {
    const f = await fixture(); const before = structuredClone(f.layout); f.install(vi.fn(async () => response({ bad: true })) as typeof fetch);
    const r = await f.request(), body = await r.json(); expect(body.data).toMatchObject({ status: "FALLBACK", layout: before });
    expect(logs().map(l => l.stage)).toEqual(expect.arrayContaining(["PROPOSAL_REJECTED", "FALLBACK_USED"])); expect(f.layout).toEqual(before);
  });
  it.each([["ALTERNATIVE", 2], ["PROPOSE", 1]])("rejects retired mode/version %s/%s before calling the provider", async (mode, version) => {
    const f = await fixture(), fetcher = vi.fn(); f.install(fetcher as typeof fetch);
    const r = await f.request(mode as string, version as number);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: { code: "INVALID_EDITORIAL_AI" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not fabricate absent or hostile provider evidence", async () => {
    const f = await fixture(); f.install(vi.fn(async (_url, init) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer(init)) } }] }), { headers: { "x-request-id": "private-fixture-key" } })) as typeof fetch);
    await f.request(); expect(logs().find(l => l.stage === "PROVIDER_RESPONSE_RECEIVED")).toMatchObject({ actualModel: null, providerRequestId: null, inputTokens: null, outputTokens: null });
    expect(JSON.stringify(logs())).not.toContain("private-fixture");
  });
  it("generation stops at one provider 429 without spending a second admission or call", async () => {
    const f = await fixture(), fetcher = vi.fn(async () => new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429 })); f.install(fetcher as typeof fetch);
    const r = await f.request(); expect(r.status).toBe(429); expect(r.headers.has("Retry-After")).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(logs().filter(l => l.stage === "PROVIDER_REQUEST_FAILED")).toHaveLength(1);
  });
  it("parses only valid Retry-After; never invents a cooldown", () => {
    const now = Date.parse("Thu, 15 Oct 2026 12:00:00 GMT");
    expect(editorialRetryAfter("8", now)).toBe(8); expect(editorialRetryAfter("Thu, 15 Oct 2026 12:00:09 GMT", now)).toBe(9);
    for (const v of [null, "invalid", "-1", "1.5", "Infinity", "999999999999999999", "Thu, 15 Oct 2026 11:00:00 GMT"]) expect(editorialRetryAfter(v, now)).toBeUndefined();

    expect(editorial429Message(undefined)).toBe("Bạn đang yêu cầu AI quá nhanh. Vui lòng đợi trước khi thử lại.");
  });
});

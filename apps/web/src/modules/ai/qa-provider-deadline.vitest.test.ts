import { afterEach, expect, it, vi } from "vitest";
import { createQaJsonProvider } from "./qa-json-provider";
import { createQaDiagnostics, qaReportFailure, type QaDiagnosticEvent } from "./qa-diagnostics";
import { withQaRequestBudget, QA_PROVIDER_WORK_BUDGET_MS } from "./qa-request-budget";
import { qaHttpError } from "./qa-http";

afterEach(() => vi.useRealTimers());
const output = () => Response.json({ model: "gpt-6.1-sol", choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 80, completion_tokens: 45, total_tokens: 125, completion_tokens_details: { reasoning_tokens: 30 } } });
const request = { name: "qa_claim_verification", schema: { type: "object" }, messages: [{ role: "user" as const, content: "private-question-fixture" }] };

async function observe(fetcher: typeof fetch, action?: (signal: AbortController) => void, timeoutMs = 25_000, validate = (value: unknown) => value) {
  const events: QaDiagnosticEvent[] = [];
  const controller = new AbortController();
  const provider = createQaJsonProvider({ apiKey: () => "private-key-fixture", fetcher, providerPhase: "SYNTHESIS_VERIFICATION", timeoutMs });
  const promise = createQaDiagnostics({ nodeEnv: "production", vercelEnv: "production", sink: event => events.push(event) }).run(async () => {
    try { return { value: await provider.request({ ...request, signal: controller.signal }, validate) }; }
    catch (error) { qaReportFailure(error, "AI_UNAVAILABLE"); return { error, http: qaHttpError(error) }; }
  });
  action?.(controller);
  return { promise, events };
}

it("reports local verifier deadline with elapsed time, not a stale generation HTTP200", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const test = await observe(fetcher);
  await vi.advanceTimersByTimeAsync(25_000);
  expect((await test.promise).http?.status).toBe(503);
  expect(test.events.at(-1)).toMatchObject({ providerPhase: "SYNTHESIS_VERIFICATION", stage: "SYNTHESIS_VERIFICATION", timeoutReason: "PROVIDER_TIMEOUT", providerElapsedMs: 25_000 });
  expect(test.events.at(-1)).not.toHaveProperty("httpStatus");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([429, 500, 503])("distinguishes upstream HTTP %i from timer expiration without copying provider error content", async status => {
  const test = await observe(vi.fn(async () => new Response("private-upstream-fixture", { status })));
  expect((await test.promise).http?.status).toBe(503);
  expect(test.events.at(-1)).toMatchObject({ providerPhase: "SYNTHESIS_VERIFICATION", providerFailureReason: "UPSTREAM_HTTP", httpStatus: status });
  expect(test.events.at(-1)).not.toHaveProperty("timeoutReason");
  expect(JSON.stringify(test.events)).not.toMatch(/private-|upstream-fixture/);
});

it("distinguishes fetch network failure and body-stream network failure from invalid JSON", async () => {
  for (const fetcher of [vi.fn(async () => { throw new TypeError("private network address"); }), vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("private stream")); } })))]) {
    const test = await observe(fetcher);
    expect((await test.promise).http?.status).toBe(503);
    expect(test.events.at(-1)).toMatchObject({ providerFailureReason: "NETWORK_ERROR", providerPhase: "SYNTHESIS_VERIFICATION" });
    expect(test.events.at(-1)).not.toHaveProperty("timeoutReason");
    expect(JSON.stringify(test.events)).not.toContain("private");
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});

it("keeps request abort separate from timeout even when the fetch implementation ignores cancellation", async () => {
  vi.useFakeTimers();
  const validate = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async () => { await new Promise(resolve => setTimeout(resolve, 12_000)); return output(); });
  const test = await observe(fetcher, controller => setTimeout(() => controller.abort(new Error("private abort")), 2000), 25_000, validate);
  await vi.advanceTimersByTimeAsync(2000);
  expect((await test.promise).http?.status).toBe(503);
  expect(test.events.at(-1)).toMatchObject({ timeoutReason: "REQUEST_ABORT", providerElapsedMs: 2000 });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(validate).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("bounds aggregate provider work to 40 seconds and refuses dispatch after the shared budget", async () => {
  vi.useFakeTimers();
  const events: QaDiagnosticEvent[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => { await new Promise(resolve => setTimeout(resolve, 24_000)); return output(); });
  const provider = createQaJsonProvider({ apiKey: () => "fixture", fetcher, providerPhase: "SYNTHESIS_VERIFICATION" });
  const pending = createQaDiagnostics({ nodeEnv: "production", sink: event => events.push(event) }).run(() => withQaRequestBudget(new AbortController().signal, async signal => {
    await new Promise(resolve => setTimeout(resolve, 30_000));
    try { await provider.request({ ...request, signal }, value => value); }
    catch (error) { qaReportFailure(error, "AI_UNAVAILABLE"); return error; }
  }));
  await vi.advanceTimersByTimeAsync(QA_PROVIDER_WORK_BUDGET_MS);
  expect(await pending).toMatchObject({ code: "AI_UNAVAILABLE" });
  expect(events.at(-1)).toMatchObject({ timeoutReason: "REQUEST_DEADLINE", providerPhase: "SYNTHESIS_VERIFICATION", providerElapsedMs: 10_000, configuredTimeoutMs: 10_000 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retains the same model/medium reasoning and records bounded reasoning token metadata", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => output());
  const test = await observe(fetcher);
  await test.promise;
  const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
  expect(body).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "medium", store: false, max_completion_tokens: 8000 });
  expect(test.events.find(event => event.reasoningTokens !== undefined)).toMatchObject({ providerPhase: "SYNTHESIS_VERIFICATION", reasoningTokens: 30, reasoningEffort: "medium" });
  expect(JSON.stringify(test.events)).not.toMatch(/private-|content|messages|authorization/);
});

it("never dispatches another provider after the request's deadline, even if earlier work ignored abort", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async () => output());
  const provider = createQaJsonProvider({ apiKey: () => "fixture", fetcher });
  const pending = withQaRequestBudget(new AbortController().signal, async signal => {
    await new Promise(resolve => setTimeout(resolve, 40_100));
    try { await provider.request({ ...request, signal }, value => value); return "unexpected"; }
    catch (error) { return error; }
  });
  await vi.advanceTimersByTimeAsync(40_100);
  expect(await pending).toMatchObject({ code: "AI_UNAVAILABLE" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("times out a hanging HTTP200 body and retains that status in verifier diagnostics", async () => {
  vi.useFakeTimers();
  const test = await observe(vi.fn(async () => new Response(new ReadableStream({ start() {} }), { status: 200 })));
  await vi.advanceTimersByTimeAsync(25_000);
  expect((await test.promise).http?.status).toBe(503);
  expect(test.events.at(-1)).toMatchObject({ httpStatus: 200, timeoutReason: "PROVIDER_TIMEOUT", providerPhase: "SYNTHESIS_VERIFICATION", providerElapsedMs: 25_000 });
});

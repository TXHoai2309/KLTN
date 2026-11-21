import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { resolveTripsageChatModel } from "./tripsage-chat-provider";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { createGooglePlacesSearch } from "./tripsage-places";
import { createFirecrawlWeb } from "./tripsage-web";

const KEY = "sk-test-secret-key-do-not-leak";
const PROVIDER_TEXT = "PROVIDER_RAW_BODY_insufficient_quota_org-abc123";
const USER_TEXT = "NOI_DUNG_NGUOI_DUNG_BI_MAT_xyz";
let seq = 0;
const auth = (id = `res-${++seq}`) => ({ database: { user: { findUnique: async () => ({ id, role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => ({ user: { id } }) }) as unknown as AuthorizationDependencies;
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
type Step = { tool: string; input: unknown } | { text: string };
function scripted(steps: Step[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      const chunks = "tool" in step
        ? [{ type: "tool-call", toolCallId: `c${call}`, toolName: step.tool, input: JSON.stringify(step.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
        : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
}
const planning = (over: Partial<TripsagePlanningDeps> = {}): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b")],
  routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) }, now: () => planningNow, ...over,
});
const req = (signal?: AbortSignal) => new Request("https://app.test/api/ai/chat", { method: "POST", signal, headers: { origin: "https://app.test", "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ id: "m", role: "user", parts: [{ type: "text", text: USER_TEXT }] }], journey: COMPLETE_JOURNEY_FIXTURE }) });
const base = (over: Record<string, unknown> = {}) => ({ authorization: auth(), model: async () => scripted([{ text: "ok" }]), env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning: planning(), ...over });
const propose = { tool: "proposeItinerary", input: { transport: "CAR", durationDays: 1, startDate: "2026-11-02", interests: ["NATURE"], selection: { days: [["a", "b"]] } } };

const logs = () => (["log", "info", "warn", "error", "debug"] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}));
const logged = (spies: ReturnType<typeof logs>) => spies.flatMap(spy => spy.mock.calls).map(args => args.map(a => (a instanceof Error ? `${a.name} ${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
afterEach(() => vi.restoreAllMocks());

const FORBIDDEN = [KEY, PROVIDER_TEXT, USER_TEXT, "Authorization", "Bearer", "org-abc123"];
const expectClean = (text: string) => { for (const bad of FORBIDDEN) expect(text).not.toContain(bad); };
/** The model prompt legitimately holds the user's own words; it must still never hold keys or raw provider text. */
const expectNoProviderData = (text: string) => { for (const bad of FORBIDDEN.filter(item => item !== USER_TEXT)) expect(text).not.toContain(bad); };

describe("provider failures become a friendly Vietnamese unavailable state", () => {
  const upstream: [string, () => Response | never][] = [
    ["OpenAI 401", () => new Response(JSON.stringify({ error: { message: `Incorrect API key ${KEY} ${PROVIDER_TEXT}` } }), { status: 401 })],
    ["OpenAI 429 quota", () => new Response(JSON.stringify({ error: { message: PROVIDER_TEXT, code: "insufficient_quota" } }), { status: 429, headers: { "retry-after": "9" } })],
    ["OpenAI 500", () => new Response(`<html>${PROVIDER_TEXT} ${KEY}</html>`, { status: 500 })],
    ["OpenAI network error", () => { throw new TypeError(`fetch failed ${KEY} ${PROVIDER_TEXT}`); }],
  ];
  for (const [name, answer] of upstream) {
    it(`${name}: stream ends cleanly, friendly text, no raw provider text, key or user text in stream or logs`, async () => {
      const spies = logs();
      const fetcher = vi.fn(async () => answer());
      const model = await resolveTripsageChatModel({ apiKey: () => KEY, model: "gpt-test", fetcher: fetcher as unknown as typeof fetch });
      const response = await tripsageChatResponse(req(), base({ model: async () => model }));
      expect(response.status).toBe(200);
      const sse = await response.text();
      expect(sse).toContain("tạm thời không khả dụng");
      expect(sse).toContain('"type":"error"');
      expectClean(sse);
      expectClean(logged(spies));
    });
  }

  it("the server log names the upstream status and error kind so an operator can tell causes apart, without key or body", async () => {
    const spies = logs();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: `Incorrect API key ${KEY} ${PROVIDER_TEXT}` } }), { status: 401 }));
    const model = await resolveTripsageChatModel({ apiKey: () => KEY, model: "gpt-test", fetcher: fetcher as unknown as typeof fetch });
    await (await tripsageChatResponse(req(), base({ model: async () => model }))).text();
    const text = logged(spies);
    expect(text).toContain("provider stream failed");
    expect(text).toContain("status=401");
    expectClean(text);
  });

  it("a 400 logs only the short parameter and error code OpenAI names, never its message", async () => {
    const spies = logs();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: `Bad request ${KEY} ${PROVIDER_TEXT}`, type: "invalid_request_error", param: "max_tokens", code: "unsupported_parameter" } }), { status: 400 }));
    const model = await resolveTripsageChatModel({ apiKey: () => KEY, model: "gpt-test", fetcher: fetcher as unknown as typeof fetch });
    await (await tripsageChatResponse(req(), base({ model: async () => model }))).text();
    const text = logged(spies);
    expect(text).toContain("status=400");
    expect(text).toContain("param=max_tokens");
    expect(text).toContain("apiCode=unsupported_parameter");
    expectClean(text);
  });

  it("OpenAI 429 tells the user the AI service is rate limited, in Vietnamese", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: PROVIDER_TEXT, code: "insufficient_quota" } }), { status: 429 }));
    const model = await resolveTripsageChatModel({ apiKey: () => KEY, model: "gpt-test", fetcher: fetcher as unknown as typeof fetch });
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model }))).text();
    expect(sse).toMatch(/hạn mức|giới hạn/);
  });

  it("missing OpenAI key: 503 Vietnamese, nothing raw", async () => {
    const spies = logs();
    const response = await tripsageChatResponse(req(), base({ model: () => resolveTripsageChatModel({ apiKey: () => undefined }) }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("không khả dụng");
    expectClean(text + logged(spies));
  });

  it("an unexpected error before the stream starts is a generic Vietnamese 503", async () => {
    const spies = logs();
    const response = await tripsageChatResponse(req(), base({ model: async () => { throw new Error(`boom ${KEY} ${PROVIDER_TEXT}`); } }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("tạm thời không khả dụng");
    expectClean(text + logged(spies));
  });

  it("routing provider (Stadia/Google) throwing: tool returns a generic failure, no crash, no leak", async () => {
    const spies = logs();
    const routes = { route: async () => { throw new Error(`routing ${KEY} ${PROVIDER_TEXT}`); }, coordinateRoute: async () => { throw new Error(`routing ${KEY} ${PROVIDER_TEXT}`); } };
    const model = scripted([propose, { text: "Hiện chưa kiểm tra được đường đi." }]);
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model, planning: planning({ routes: routes as never }) }))).text();
    expect(sse).toContain("Hiện chưa kiểm tra được đường đi");
    expectClean(sse + logged(spies)); expectNoProviderData(JSON.stringify(model.doStreamCalls[1]!.prompt));
  });

  it("Google Places and Firecrawl failures (401/429/500, thrown) leak nothing and do not crash", async () => {
    const spies = logs();
    for (const answer of [() => new Response(PROVIDER_TEXT, { status: 429 }), () => new Response(PROVIDER_TEXT, { status: 401 }), () => { throw new Error(`net ${KEY} ${PROVIDER_TEXT}`); }]) {
      const fetcher = vi.fn(async () => answer());
      const model = scripted([{ tool: "searchPlaces", input: { query: "quán cà phê" } }, { tool: "webSearch", input: { query: "lễ hội" } }, { text: "Hai dịch vụ tra cứu đang tạm thời không khả dụng." }]);
      const response = await tripsageChatResponse(req(), base({ model: async () => model,
        places: () => createGooglePlacesSearch({ apiKey: () => KEY, fetcher: fetcher as unknown as typeof fetch }),
        web: () => createFirecrawlWeb({ apiKey: () => KEY, fetcher: fetcher as unknown as typeof fetch }) }));
      const sse = await response.text();
      expect(response.status).toBe(200);
      expect(sse).toContain("tạm thời không khả dụng");
      expectClean(sse + logged(spies)); expectNoProviderData(JSON.stringify(model.doStreamCalls.map(c => c.prompt)));
    }
  });

  it("missing Places and Firecrawl keys: friendly unavailable, no request sent", async () => {
    const fetcher = vi.fn();
    const model = scripted([{ tool: "searchPlaces", input: { query: "quán cà phê" } }, { tool: "webSearch", input: { query: "lễ hội" } }, { text: "Không tra cứu được." }]);
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model,
      places: () => createGooglePlacesSearch({ apiKey: () => undefined, fetcher: fetcher as unknown as typeof fetch }),
      web: () => createFirecrawlWeb({ apiKey: () => undefined, fetcher: fetcher as unknown as typeof fetch }) }))).text();
    expect(fetcher).not.toHaveBeenCalled();
    expect(sse).toContain("Không tra cứu được");
    expect(JSON.stringify(model.doStreamCalls[2]!.prompt)).toContain("PLACES_UNAVAILABLE");
    expect(JSON.stringify(model.doStreamCalls[2]!.prompt)).toContain("WEB_UNAVAILABLE");
  });
});

describe("turn caps end with a readable, bounded notice that names what was created", () => {
  it("8-step cap: notice says the step limit, keeps the created itinerary and says it is not saved, suggests a next step", async () => {
    const model = scripted([propose, { tool: "listDestinations", input: {} }]);
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model }))).text();
    expect(model.doStreamCalls.length).toBeLessThanOrEqual(8);
    expect(sse).toContain("giới hạn 8 bước");
    expect(sse).toContain("Lịch trình đã tạo được vẫn hiển thị");
    expect(sse).toContain("chưa được lưu");
    expect(sse).toContain("Hãy nhắn tiếp");
    expect(sse.indexOf("giới hạn 8 bước")).toBeLessThan(sse.indexOf('"type":"finish"'));
  });

  it("8-step cap without any itinerary says nothing was created", async () => {
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => scripted([{ tool: "listDestinations", input: {} }]) }))).text();
    expect(sse).toContain("giới hạn 8 bước");
    expect(sse).toContain("Chưa tạo được lịch trình");
  });

  it("60 s cap: notice names the created itinerary (or its absence), not-saved, and a next step", async () => {
    const stalled = (withItinerary: boolean) => {
      let call = 0;
      return new MockLanguageModelV4({ doStream: async ({ abortSignal }) => {
        if (withItinerary && call++ === 0) return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "c1", toolName: "proposeItinerary", input: JSON.stringify(propose.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }] as never[] }) };
        return { stream: new ReadableStream({ start(controller) { abortSignal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true }); } }) };
      } });
    };
    const withItinerary = await (await tripsageChatResponse(req(), base({ model: async () => stalled(true), limits: { totalMs: 400 } }))).text();
    expect(withItinerary).toContain("Đã hết thời gian xử lý");
    expect(withItinerary).toContain("Lịch trình đã tạo được vẫn hiển thị");
    expect(withItinerary).toContain("chưa được lưu");
    expect(withItinerary).toContain("Hãy nhắn tiếp");
    const without = await (await tripsageChatResponse(req(), base({ model: async () => stalled(false), limits: { totalMs: 60 } }))).text();
    expect(without).toContain("Chưa tạo được lịch trình");
  });

  it("per-tool call caps answer the model with a Vietnamese limit result and the turn still ends", async () => {
    const model = scripted([...Array(4).fill({ tool: "searchPlaces", input: { query: "quán cà phê" } }), { text: "Đã đủ." }]);
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model, places: () => async () => ({ status: "NO_RESULTS" }) }))).text();
    expect(JSON.stringify(model.doStreamCalls[4]!.prompt)).toContain("PLACES_LIMIT");
    expect(sse).toContain("Đã đủ.");
  });
});

describe("interrupted streams", () => {
  it("a client abort mid-stream releases the admission slot and logs nothing sensitive", async () => {
    const spies = logs();
    const admit = createPlanningAdmission();
    const stalled = () => new MockLanguageModelV4({ doStream: async ({ abortSignal }) => ({ stream: new ReadableStream({ start(controller) { abortSignal?.addEventListener("abort", () => controller.error(new Error(`aborted ${KEY}`)), { once: true }); } }) }) });
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const open = await Promise.all(controllers.map(c => tripsageChatResponse(req(c.signal), base({ model: async () => stalled(), admit }))));
    expect(open.map(r => r.status)).toEqual([200, 200, 200]);
    expect((await tripsageChatResponse(req(), base({ admit }))).status).toBe(429);
    controllers[0]!.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    const next = await tripsageChatResponse(req(), base({ admit }));
    expect(next.status).toBe(200);
    await next.text();
    controllers.slice(1).forEach(c => c.abort());
    expectClean(logged(spies));
  });

  it("a stream error after a valid itinerary keeps the itinerary part and never offers a saved state", async () => {
    let call = 0;
    const model = new MockLanguageModelV4({ doStream: async () => {
      if (call++ === 0) return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "c1", toolName: "proposeItinerary", input: JSON.stringify(propose.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }] as never[] }) };
      throw new Error(`provider died ${KEY} ${PROVIDER_TEXT}`);
    } });
    const spies = logs();
    const sse = await (await tripsageChatResponse(req(), base({ model: async () => model }))).text();
    expect(sse).toContain('"type":"data-itinerary"');
    expect(sse).toContain("tạm thời không khả dụng");
    expect(sse).not.toMatch(/Đã lưu|"tripId"/);
    expectClean(sse + logged(spies));
  });
});

describe("429 admission gives a wait hint", () => {
  it("per-minute limit: 429 Vietnamese with a Retry-After of 1 to 60 seconds", async () => {
    const admit = createPlanningAdmission();
    const authorization = auth("same-user");
    for (let i = 0; i < 8; i++) await (await tripsageChatResponse(req(), base({ authorization, admit }))).text();
    const limited = await tripsageChatResponse(req(), base({ authorization, admit }));
    expect(limited.status).toBe(429);
    const wait = Number(limited.headers.get("retry-after"));
    expect(Number.isInteger(wait)).toBe(true);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    expect(await limited.text()).toContain("quá nhanh");
  });

  it("concurrency limit: 429 also carries a positive integer Retry-After", async () => {
    const admit = createPlanningAdmission();
    const stalled = () => new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream({ start() { /* never ends */ } }) }) });
    const open = await Promise.all([1, 2, 3].map(() => tripsageChatResponse(req(), base({ model: async () => stalled(), admit }))));
    const fourth = await tripsageChatResponse(req(), base({ admit }));
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    await Promise.all(open.map(r => r.body?.cancel()));
  });

  it("other errors carry no Retry-After", async () => {
    const response = await tripsageChatResponse(req(), base({ env: {} }));
    expect(response.status).toBe(404);
    expect(response.headers.has("retry-after")).toBe(false);
  });
});

describe("flag off and signed out reveal nothing", () => {
  it("404 and 401 bodies are generic Vietnamese with no config, key or env names", async () => {
    const off = await tripsageChatResponse(req(), base({ env: { TRIPSAGE_CHAT_ENABLED: "false" } }));
    const out = await tripsageChatResponse(req(), base({ authorization: auth(null as unknown as string) }));
    for (const response of [off, out]) {
      const text = await response.text();
      expect(text).not.toMatch(/TRIPSAGE|FLAG|ENABLED|OPENAI|env|key|token/i);
      expect(text).toMatch(/[ạăâêôơưđáàảãéèíìóòúùý]/);
    }
    expect([off.status, out.status]).toEqual([404, 401]);
  });
});

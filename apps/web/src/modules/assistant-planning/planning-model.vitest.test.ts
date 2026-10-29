import { afterAll, expect, it, vi } from "vitest";
import { analyzePlanningText, generateAiSelection } from "./planning-ai";
import { composePlanningReply } from "./planning-reply";
import { EMPTY_PLANNING_NEEDS } from "./planning-contract";
import { fixtureNeeds } from "../../test/planning-fixtures";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { effectiveConfig } from "../runtime-config/runtime-config-service";

// ADR-25 moves credential resolution to the effective runtime configuration.
vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: vi.fn() }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });

type PlanningProviderRequest = {
  model: string;
  reasoning_effort: string;
  store: boolean;
  response_format: { json_schema: { name: string } };
  messages: { role: string; content: string }[];
};

it("uses effective credentials while pinning understanding, selection and dialogue to Luna/high", async () => {
  const requests: PlanningProviderRequest[] = [];
  const configured = vi.mocked(effectiveConfig);
  configured.mockResolvedValue({ apiKey: "fixture-active-provider-key", qaModel: "gpt-6.1-sol" });
  const understanding = { intent: "NEEDS", durationDays: 3, transport: null, startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE" };
  vi.stubEnv("OPENAI_API_KEY", "fake-intercepted-test-key");
  vi.stubEnv("OPENAI_QA_MODEL", "unrelated-model");
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer fixture-active-provider-key");
    const body = JSON.parse(String(options?.body)) as PlanningProviderRequest; requests.push(body);
    const name = body.response_format.json_schema.name;
    const value = name === "trip_chat_understanding" ? understanding : name === "trip_chat_selection" ? { days: [["a"]] } : { message: "Bạn muốn đi mấy ngày?" };
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
  }));
  try {
    await analyzePlanningText("3", EMPTY_PLANNING_NEEDS, [], [], undefined, new Date("2026-10-27T17:01:00Z"));
    await generateAiSelection({ needs: fixtureNeeds, requirement: tripRequirementInputSchema.parse(fixtureNeeds.requirement), candidates: [], previous: null, feedback: [], instruction: "Tạo lịch" });
    await composePlanningReply({ kind: "NEED", field: "durationDays", canonical: "Bạn muốn đi mấy ngày?", needs: EMPTY_PLANNING_NEEDS, latestText: "Tạo lịch giúp tôi" });
    expect(requests).toHaveLength(3);
    expect(configured).toHaveBeenCalledTimes(3);
    for (const call of configured.mock.calls) expect(call).toEqual(["OPENAI"]);
    for (const body of requests) expect(body).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "high", store: false });
    const latestMessage = requests[0]?.messages.at(-1);
    if (!latestMessage) throw new Error("Expected the planning calendar context");
    const context = JSON.parse(latestMessage.content).calendarContext;
    expect(context).toEqual({ today: "2026-10-28", timeZone: "Asia/Ho_Chi_Minh", weekStartsOn: "MONDAY" });
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); configured.mockReset(); }
});

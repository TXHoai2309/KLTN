import { expect, it, vi } from "vitest";
import { composePlanningReply, type PlanningReplyInput } from "./planning-reply";
import { fixtureNeeds } from "../../test/planning-fixtures";
import { analyzePlanningText } from "./planning-ai";

// Real provider, synthetic conversation only. No database or business operations.
it.skipIf(process.env.ASSISTANT_PLANNING_LANGUAGE_TEST !== "1")("audits real Luna reply calls and accepted prose across planning stages", async () => {
  const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, durationDays: 3,
    transport: "MOTORCYCLE" as const, startDate: "2026-11-15", interests: ["NATURE" as const, "CULTURE_HISTORY" as const, "ADVENTURE" as const] } };
  const inputs: PlanningReplyInput[] = [
    { kind: "NEED", field: "preferences", latestText: "Mình thích thiên nhiên, văn hóa và mạo hiểm", needs,
      canonical: "Nhịp đi: bạn muốn thư thả, vừa phải hay trải nghiệm nhiều nhất có thể?" },
    { kind: "NEED", field: "preferences", latestText: "Mình muốn trải nghiệm nhiều nhất có thể", needs: { ...needs, requirement: { ...needs.requirement, pace: "PACKED" } },
      canonical: "Bạn đi một mình hay cùng ai?", dialogue: { question: "Bạn muốn đi thư thả hay trải nghiệm thật nhiều?", field: "preferences", preferenceField: "pace", current: null,
        recent: [{ question: "Mình thích thiên nhiên, văn hóa và mạo hiểm", reply: "Mình hiểu bạn thích thiên nhiên, văn hóa và mạo hiểm rồi. Bạn muốn đi thư thả, vừa phải hay trải nghiệm thật nhiều?" }] } },
    { kind: "PROPOSAL", latestText: "Đúng rồi, tạo đi", needs, eligibleForSave: true,
      canonical: "Mình đã lên lịch bên dưới và các bước kiểm tra đều đáp ứng. Bạn muốn chỉnh gì thêm hay lưu vào Chuyến đi của tôi?",
      result: { days: [{ day: 1, date: "2026-11-15", stops: ["Cổng trời Quản Bạ", "Làng Nặm Đăm"] }], checks: [] } },
  ];
  const request = globalThis.fetch;
  const calls: { model: string; reasoning: string }[] = [];
  const events: string[] = [];
  const providerReplies: string[] = [];
  const logger = vi.spyOn(console, "info").mockImplementation(value => { events.push(String(value)); });
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ model: body.model, reasoning: body.reasoning_effort });
    const response = await request(url, options);
    const payload = await response.clone().json();
    providerReplies.push(JSON.parse(payload.choices[0].message.content).message);
    return response;
  });
  const replies: string[] = [];
  try {
    for (const input of inputs) replies.push(await composePlanningReply(input));
    expect(calls).toHaveLength(inputs.length);
    expect(calls.every(call => call.model === "gpt-6-luna" && call.reasoning === "high")).toBe(true);
    const outcomes = events.map(event => JSON.parse(event)).filter(event => event.event === "planning_reply");
    expect(outcomes).toHaveLength(inputs.length);
    expect(outcomes.every(event => event.outcome === "MODEL_ACCEPTED")).toBe(true);
  } finally {
    network.mockRestore(); logger.mockRestore();
    console.info(JSON.stringify({ audit: "synthetic_planning_replies", calls, events, replies, providerReplies }));
  }
}, 120_000);

it.skipIf(process.env.ASSISTANT_PLANNING_LANGUAGE_TEST !== "1")("keeps real Luna display and create intents separate from saving", async () => {
  const needs = { ...fixtureNeeds, preferencesDone: true };
  const dialogue = { question: "Lịch trình đã sẵn sàng. Bạn muốn chỉnh thêm hay lưu chuyến đi?", field: null,
    recent: [{ question: "Đúng rồi, tạo đi", reply: "Lịch trình bên dưới chưa được lưu." }], current: { days: [["a"]] } };
  const now = new Date("2026-10-28T03:00:00Z");
  const display = await analyzePlanningText("Lịch mình vừa thống nhất đâu rồi nhỉ?", needs, [], [], dialogue, now);
  expect(display.intent).toBe("DISPLAY");
  expect(display.needs).toEqual(needs);
  const create = await analyzePlanningText("Bạn tạo giúp mình lịch trình đi nhé", needs, [], [], dialogue, now);
  expect(create.replyAction).toBe("CREATE");
  expect(create.needs).toEqual(needs);
  console.info(JSON.stringify({ audit: "synthetic_planning_intents", display: display.intent, create: create.replyAction }));
}, 90_000);

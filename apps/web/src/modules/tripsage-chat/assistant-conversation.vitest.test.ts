import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { hubOrigin } from "./trip-hubs";
import {
  ASSISTANT_CONVERSATION_RETENTION_DAYS,
  conversationMetaPartSchema,
  sanitizeStoredParts,
} from "./assistant-conversation-contract";
import { assistantConversationsResponse } from "./assistant-conversation-http";
import { createAssistantConversationStore } from "./assistant-conversation-store";
import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { OriginLookup, TripsagePlanningDeps } from "./tripsage-chat-tools";

const SECRET = "test-origin-hmac-secret-at-least-32-characters";
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

type ConvRow = { id: string; userId: string; title: string; createdAt: Date; updatedAt: Date; expiresAt: Date };
type MsgRow = { id: string; conversationId: string; role: string; clientMessageId: string; contentHash: string; parts: unknown; createdAt: Date };
type IdemRow = { scope: string; key: string; requestHash: string; responseJson: string };

function createFakeDb(options: { failWrites?: boolean } = {}) {
  const conversations = new Map<string, ConvRow>();
  const messages = new Map<string, MsgRow>();
  const idempotency = new Map<string, IdemRow>();
  const idemKey = (scope: string, key: string) => `${scope}::${key}`;

  const client = {
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => {
        if (options.failWrites) throw new Error("db connection lost");
        return idempotency.get(idemKey(where.scope_key.scope, where.scope_key.key)) ?? null;
      },
      create: async ({ data }: { data: IdemRow }) => {
        if (options.failWrites) throw new Error("db connection lost");
        const k = idemKey(data.scope, data.key);
        if (idempotency.has(k)) throw new Error("unique violation");
        idempotency.set(k, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const k = idemKey(where.scope_key.scope, where.scope_key.key);
        const row = idempotency.get(k)!;
        row.responseJson = data.responseJson;
        return row;
      },
    },
    assistantConversation: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        let rows = [...conversations.values()];
        if (typeof where.userId === "string") rows = rows.filter(r => r.userId === where.userId);
        const exp = where.expiresAt as { gt?: Date; lte?: Date } | undefined;
        if (exp?.gt) rows = rows.filter(r => r.expiresAt.getTime() > exp.gt!.getTime());
        if (exp?.lte) rows = rows.filter(r => r.expiresAt.getTime() <= exp.lte!.getTime());
        const title = where.title as { contains?: string } | undefined;
        if (title?.contains) rows = rows.filter(r => r.title.toLowerCase().includes(title.contains!.toLowerCase()));
        rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
        return take ? rows.slice(0, take) : rows;
      },
      findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: { messages?: unknown } }) => {
        const exp = where.expiresAt as { gt?: Date } | undefined;
        const found = [...conversations.values()].find(r =>
          (where.id === undefined || r.id === where.id)
          && (where.userId === undefined || r.userId === where.userId)
          && (!exp?.gt || r.expiresAt.getTime() > exp.gt.getTime()));
        if (!found) return null;
        if (select?.messages) {
          const convMsgs = [...messages.values()]
            .filter(m => m.conversationId === found.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
          return { ...found, messages: convMsgs };
        }
        return found;
      },
      create: async ({ data }: { data: ConvRow }) => {
        conversations.set(data.id, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ConvRow> }) => {
        const row = conversations.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = conversations.get(where.id)!;
        conversations.delete(where.id);
        for (const [id, msg] of messages) if (msg.conversationId === where.id) messages.delete(id);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId?: string; id?: { in: string[] } } }) => {
        const ids = [...conversations.values()]
          .filter(r => (where.userId === undefined || r.userId === where.userId) && (where.id === undefined || where.id.in.includes(r.id)))
          .map(r => r.id);
        for (const id of ids) {
          conversations.delete(id);
          for (const [mid, msg] of messages) if (msg.conversationId === id) messages.delete(mid);
        }
        return { count: ids.length };
      },
    },
    assistantMessage: {
      findFirst: async ({ where }: { where: { conversationId?: string; role?: string; clientMessageId?: string; conversation?: { userId: string; expiresAt: { gt: Date } } } }) => {
        if (options.failWrites) throw new Error("db connection lost");
        const found = [...messages.values()].find(m =>
          m.conversationId === where.conversationId
          && m.role === where.role
          && m.clientMessageId === where.clientMessageId);
        if (!found) return null;
        const conv = conversations.get(found.conversationId);
        if (!conv) return null;
        if (where.conversation && (conv.userId !== where.conversation.userId || conv.expiresAt.getTime() <= where.conversation.expiresAt.gt.getTime())) return null;
        return { ...found, conversation: { id: conv.id, title: conv.title } };
      },
      create: async ({ data }: { data: MsgRow }) => {
        for (const existing of messages.values()) {
          if (existing.conversationId === data.conversationId && existing.role === data.role && existing.clientMessageId === data.clientMessageId) {
            throw new Error("unique message violation");
          }
        }
        messages.set(data.id, { ...data });
        return data;
      },
    },
  };

  const db = {
    ...client,
    $transaction: async <T>(work: (tx: typeof client) => Promise<T>) => {
      const convSnap = new Map([...conversations].map(([k, v]) => [k, { ...v }]));
      const msgSnap = new Map([...messages].map(([k, v]) => [k, { ...v }]));
      const idemSnap = new Map([...idempotency].map(([k, v]) => [k, { ...v }]));
      try {
        return await work(client);
      } catch (error) {
        conversations.clear(); for (const [k, v] of convSnap) conversations.set(k, v);
        messages.clear(); for (const [k, v] of msgSnap) messages.set(k, v);
        idempotency.clear(); for (const [k, v] of idemSnap) idempotency.set(k, v);
        throw error;
      }
    },
  };

  return { db: db as unknown as Database, conversations, messages };
}

const auth = (userId: string | null) => ({
  database: { user: { findUnique: async () => (userId ? { id: userId, role: "TRAVELER", status: "ACTIVE" } : null) } },
  resolveSession: async () => (userId ? { user: { id: userId } } : null),
}) as unknown as AuthorizationDependencies;

const planning = (): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a", 120), planningCandidate("b", 120)],
  routes: { route: fixtureRoutes.route, coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }) },
  now: () => planningNow,
});

const sseParts = (sse: string) => sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown });

describe("sanitizeStoredParts", () => {
  it("keeps only schema-valid display parts and drops tool outputs, origin candidates, system context and invalid shapes", () => {
    const out = sanitizeStoredParts([
      { type: "text", text: "Xin chào Hà Giang" },
      { type: "data-trip-info", id: "trip-info", data: { tripInfo: { transport: "MOTORCYCLE", durationDays: 4 } } },
      { type: "data-sources", id: "sources", data: { sources: [{ kind: "DOCUMENT", title: "Cẩm nang Hà Giang" }] } },
      { type: "data-origin-candidates", id: "origin-candidates", data: { candidates: [{ candidateId: "oc-1", label: "Hà Nội" }], token: "v1.secret.coords" } },
      { type: "data-journey", id: "journey", data: { journey: COMPLETE_JOURNEY_FIXTURE } },
      { type: "data-status", data: { kind: "start", label: "Đang đọc..." } },
      { type: "data-quick-replies", id: "quick-replies", data: { replies: ["4 ngày"] } },
      { type: "data-quick-replies", id: "quick-replies-bad", data: { replies: ["x".repeat(41)] } },
      { type: "tool-output-available", toolCallId: "c1", output: { secret: "raw" } },
      { type: "system", text: "SYSTEM INSTRUCTIONS" },
      { type: "data-trip-info", data: { tripInfo: { transport: "PLANE" } } },
    ]);
    expect(out.map(p => p.type)).toEqual(["text", "data-trip-info", "data-sources", "data-quick-replies"]);
    expect(JSON.stringify(out)).not.toMatch(/v1\.secret\.coords|raw|SYSTEM INSTRUCTIONS|PLANE|x{41}/);
  });

  it("stores a journey only when its origin is a fixed public hub, so a reload keeps the confirmed hub", () => {
    const hubJourney = { ...COMPLETE_JOURNEY_FIXTURE, origin: hubOrigin("HA_NOI") };
    expect(sanitizeStoredParts([{ type: "data-journey", id: "journey", data: { journey: hubJourney } }]).map(p => p.type)).toEqual(["data-journey"]);
    expect(sanitizeStoredParts([{ type: "data-journey", id: "journey", data: { journey: { ...hubJourney, origin: { ...hubJourney.origin, latitude: 10.1 } } } }])).toEqual([]);
  });
});

describe("assistant conversation store (ticket 03)", () => {
  it("enforces owner isolation, idempotency on retries, conflict on reused key, UNKNOWN on DB outage, and 30-day retention cleanup", async () => {
    let clock = new Date("2026-11-21T10:00:00Z");
    const { db, conversations, messages } = createFakeDb();
    const store = createAssistantConversationStore(db, { now: () => clock });

    const first = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "u-1", text: "Đi Hà Giang 4 ngày từ Hà Nội" });
    expect(first.status).toBe("SUCCESS");
    if (first.status !== "SUCCESS") throw new Error("expected success");
    expect(first.replayed).toBe(false);
    const convId = first.data.conversationId;

    // Replaying identical payload with the same message ID returns SUCCESS (replayed) without duplicating rows.
    const replay = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "u-1", text: "Đi Hà Giang 4 ngày từ Hà Nội" });
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: { conversationId: convId, messageId: first.data.messageId } });
    // Replaying after learning conversationId also succeeds idempotently.
    const replayWithId = await store.recordUserMessage({ userId: "owner-1", conversationId: convId, clientMessageId: "u-1", text: "Đi Hà Giang 4 ngày từ Hà Nội" });
    expect(replayWithId).toMatchObject({ status: "SUCCESS", replayed: true, data: { conversationId: convId, messageId: first.data.messageId } });
    expect(messages.size).toBe(1);

    // Reusing the same message ID with different content is rejected with 409.
    const conflict = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "u-1", text: "Nội dung khác" });
    expect(conflict).toMatchObject({ status: "FAILED", httpStatus: 409, error: { code: "IDEMPOTENCY_KEY_REUSED" } });

    // Owner saves assistant message; foreign user cannot read, append, or delete.
    const savedReply = await store.recordAssistantMessage({
      userId: "owner-1",
      conversationId: convId,
      clientMessageId: "u-1:assistant",
      parts: [{ type: "text", text: "Chào bạn!" }, { type: "tool-output-available", output: { raw: 1 } }],
    });
    expect(savedReply.status).toBe("SUCCESS");

    await expect(store.get("intruder", convId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await store.recordUserMessage({ userId: "intruder", conversationId: convId, clientMessageId: "u-2", text: "Xin chào" }))
      .toMatchObject({ status: "FAILED", httpStatus: 404, error: { code: "NOT_FOUND" } });
    expect(await store.deleteOne("intruder", convId, "del-intruder"))
      .toMatchObject({ status: "FAILED", httpStatus: 404, error: { code: "NOT_FOUND" } });
    expect(conversations.size).toBe(1);

    // Owner reads back sanitized messages only.
    const detail = await store.get("owner-1", convId);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1]!.parts).toEqual([{ type: "text", text: "Chào bạn!" }]);

    // After 30 days, expired conversations are hidden and swept by cleanup().
    clock = new Date(clock.getTime() + ASSISTANT_CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000 + 1000);
    expect((await store.list("owner-1")).items).toEqual([]);
    await expect(store.get("owner-1", convId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await store.cleanup()).toEqual({ deletedCount: 1 });
    expect(conversations.size).toBe(0);
    expect(messages.size).toBe(0);

    // DB outage returns UNKNOWN with retryWithSameKey: true.
    const brokenStore = createAssistantConversationStore(createFakeDb({ failWrites: true }).db);
    expect(await brokenStore.recordUserMessage({ userId: "owner-1", clientMessageId: "u-broken", text: "Xin chào" }))
      .toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
  });
});

describe("assistant conversations HTTP and chat route persistence (ticket 03)", () => {
  it("persists the conversation and sanitized display parts when chat is enabled through Admin", async () => {
    const { db } = createFakeDb();
    const store = createAssistantConversationStore(db, { now: () => planningNow });
    const originSearch: OriginLookup = async () => ({
      status: "RESULTS",
      cached: false,
      results: [{ label: "Quận Cầu Giấy, Hà Nội", latitude: 21.0362, longitude: 105.7906, source: "GOOGLE_PLACES", confirmed: false }],
    });
    const knowledge = () => async () => [{ title: "Cẩm nang Hà Giang", text: "Thông tin đã duyệt." }];
    const model = scripted([
      { tool: "findOrigin", input: { query: "Cầu Giấy" } },
      { tool: "lookupLocalKnowledge", input: { question: "Hà Giang" } },
      { tool: "recordTripInfo", input: { travelers: 3 } },
      { tool: "proposeItinerary", input: { selection: { days: [["a", "b"]] } } },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 300_000 }] } },
      { text: "Mình đã lập lịch và ước tính chi phí xong." },
    ]);

    const response = await tripsageChatResponse(
      new Request("https://app.test/api/ai/chat", {
        method: "POST",
        headers: { origin: "https://app.test", "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "user-msg-1", role: "user", parts: [{ type: "text", text: "Lên lịch Hà Giang 1 ngày" }] }],
          journey: COMPLETE_JOURNEY_FIXTURE,
          tripInfo: TRIP_INFO_FIXTURE,
        }),
      }),
      {
        authorization: auth("owner-1"),
        model: async () => model,
        env: { TRIPSAGE_CHAT_ENABLED: "false" },
        settings: async () => ({
          chatEnabled: true,
          budget: false,
          flights: false,
          hotels: false,
          memory: false,
          calendar: false,
          amadeusEnvironment: "test",
          tripAssistantAgentEnabled: true,
        }),
        admit: createPlanningAdmission(),
        planning: planning(),
        originSearch: () => originSearch,
        originSecret: () => SECRET,
        knowledge,
        conversations: () => store,
        now: () => planningNow,
      },
    );

    expect(response.status).toBe(200);
    const convId = response.headers.get("x-assistant-conversation-id");
    expect(convId).toBeTruthy();
    const sse = await response.text();
    const meta = conversationMetaPartSchema.parse(sseParts(sse).find(p => p.type === "data-conversation")!.data);
    expect(meta.conversationId).toBe(convId);

    const detail = await store.get("owner-1", convId!);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[0]!.role).toBe("user");
    expect(detail.messages[0]!.parts).toEqual([{ type: "text", text: "Lên lịch Hà Giang 1 ngày" }]);
    const storedTypes = detail.messages[1]!.parts.map(p => p.type);
    expect(storedTypes).toEqual(expect.arrayContaining(["text", "data-sources", "data-trip-info", "data-itinerary", "data-timeline", "data-cost"]));
    expect(storedTypes).not.toContain("data-origin-candidates");
    expect(JSON.stringify(detail.messages[1]!.parts)).not.toContain("21.0362");
    expect(JSON.stringify(detail.messages[1]!.parts)).not.toContain("tool-output");
  });

  it("blocks model execution when user message persistence fails (foreign conversation or DB UNKNOWN)", async () => {
    const { db } = createFakeDb();
    const store = createAssistantConversationStore(db, { now: () => planningNow });
    const created = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "seed-1", text: "Xin chào" });
    if (created.status !== "SUCCESS") throw new Error("seed failed");

    const spyModel = scripted([{ text: "Không được chạy" }]);
    const doStreamSpy = vi.spyOn(spyModel, "doStream");
    const foreignResp = await tripsageChatResponse(
      new Request("https://app.test/api/ai/chat", {
        method: "POST",
        headers: { origin: "https://app.test", "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: created.data.conversationId,
          messages: [{ id: "intruder-msg", role: "user", parts: [{ type: "text", text: "Đọc trộm" }] }],
        }),
      }),
      {
        authorization: auth("intruder"),
        model: async () => spyModel,
        env: { TRIPSAGE_CHAT_ENABLED: "true" },
        admit: createPlanningAdmission(),
        conversations: () => store,
      },
    );
    expect(foreignResp.status).toBe(404);
    expect(doStreamSpy).not.toHaveBeenCalled();

    const brokenStore = createAssistantConversationStore(createFakeDb({ failWrites: true }).db);
    const unknownResp = await tripsageChatResponse(
      new Request("https://app.test/api/ai/chat", {
        method: "POST",
        headers: { origin: "https://app.test", "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "u-unknown", role: "user", parts: [{ type: "text", text: "Xin chào" }] }],
        }),
      }),
      {
        authorization: auth("owner-1"),
        model: async () => spyModel,
        env: { TRIPSAGE_CHAT_ENABLED: "true" },
        admit: createPlanningAdmission(),
        conversations: () => brokenStore,
      },
    );
    expect(unknownResp.status).toBe(503);
    expect(await unknownResp.json()).toMatchObject({ success: false, operationStatus: "UNKNOWN", retryWithSameKey: true });
    expect(doStreamSpy).not.toHaveBeenCalled();
  });

  it("enforces auth, same-origin, ownership and idempotency on /api/ai/assistant-conversations routes", async () => {
    const { db } = createFakeDb();
    const store = createAssistantConversationStore(db, { now: () => planningNow });
    const c1 = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "m-1", text: "Hội thoại 1" });
    const c2 = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "m-2", text: "Hội thoại 2" });
    const other = await store.recordUserMessage({ userId: "owner-2", clientMessageId: "m-3", text: "Của người khác" });
    if (c1.status !== "SUCCESS" || c2.status !== "SUCCESS" || other.status !== "SUCCESS") throw new Error("seed failed");

    // Guest is 401.
    const guest = await assistantConversationsResponse(new Request("https://app.test/api/ai/assistant-conversations"), { authorization: auth(null), store: () => store });
    expect(guest.status).toBe(401);

    // Owner lists only their own conversations.
    const listResp = await assistantConversationsResponse(new Request("https://app.test/api/ai/assistant-conversations"), { authorization: auth("owner-1"), store: () => store });
    expect(listResp.status).toBe(200);
    const listJson = await listResp.json() as { success: true; data: { items: { id: string }[] } };
    expect(listJson.data.items.map(i => i.id).sort()).toEqual([c1.data.conversationId, c2.data.conversationId].sort());

    // Foreign user cannot GET or DELETE.
    expect((await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`), { authorization: auth("owner-2"), store: () => store }, c1.data.conversationId)).status).toBe(404);
    expect((await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`, {
      method: "DELETE",
      headers: { origin: "https://app.test", "Idempotency-Key": "del-foreign" },
    }), { authorization: auth("owner-2"), store: () => store }, c1.data.conversationId)).status).toBe(404);

    // Cross-origin DELETE is 403; missing Idempotency-Key is 400.
    expect((await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`, {
      method: "DELETE",
      headers: { origin: "https://evil.test", "Idempotency-Key": "del-1" },
    }), { authorization: auth("owner-1"), store: () => store }, c1.data.conversationId)).status).toBe(403);
    expect((await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`, {
      method: "DELETE",
      headers: { origin: "https://app.test" },
    }), { authorization: auth("owner-1"), store: () => store }, c1.data.conversationId)).status).toBe(400);

    // Owner deletes one idempotently, then deletes all owned (leaving owner-2 untouched).
    const del1 = await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`, {
      method: "DELETE",
      headers: { origin: "https://app.test", "Idempotency-Key": "del-c1" },
    }), { authorization: auth("owner-1"), store: () => store }, c1.data.conversationId);
    expect(del1.status).toBe(200);
    expect(del1.headers.get("idempotency-replayed")).toBe("false");

    const del1Replay = await assistantConversationsResponse(new Request(`https://app.test/api/ai/assistant-conversations/${c1.data.conversationId}`, {
      method: "DELETE",
      headers: { origin: "https://app.test", "Idempotency-Key": "del-c1" },
    }), { authorization: auth("owner-1"), store: () => store }, c1.data.conversationId);
    expect(del1Replay.status).toBe(200);
    expect(del1Replay.headers.get("idempotency-replayed")).toBe("true");

    const delAll = await assistantConversationsResponse(new Request("https://app.test/api/ai/assistant-conversations", {
      method: "DELETE",
      headers: { origin: "https://app.test", "Idempotency-Key": "del-all-1" },
    }), { authorization: auth("owner-1"), store: () => store });
    expect(delAll.status).toBe(200);
    expect(await delAll.json()).toMatchObject({ success: true, operationStatus: "SUCCESS", data: { deletedCount: 1 } });

    // Owner-2's conversation is still intact.
    expect((await store.get("owner-2", other.data.conversationId)).conversation.id).toBe(other.data.conversationId);
  });

  it("Point 6: restores savedTripId + savedProposalId when reloading a saved itinerary and clears savedProposalId after a newer v3 edit", async () => {
    const { db, conversations } = createFakeDb();
    const savedTrips = new Map<string, {
      id: string;
      userId: string;
      startDate: Date;
      durationDays: number;
      transport: string;
      journeySnapshot: { revision: string; visitFingerprint: string };
      createdAt: Date;
    }>();
    (db as unknown as Record<string, unknown>).trip = {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const t = savedTrips.get(where.id);
        return t && t.userId === where.userId ? t : null;
      },
    };
    const store = createAssistantConversationStore(db, { now: () => new Date("2026-11-23T10:05:00Z") });
    const u1 = await store.recordUserMessage({ userId: "owner-1", clientMessageId: "u-save-1", text: "Lập lịch 1 ngày" });
    if (u1.status !== "SUCCESS") throw new Error("expected success");
    const convId = u1.data.conversationId;

    const makeProposal = (proposalId: string, visitDurationMinutes: number) => ({
      proposalId,
      phase: "PRELIMINARY_PROPOSAL" as const,
      status: "PROPOSAL_READY" as const,
      requirement: {
        startDate: "2026-12-13",
        durationDays: 1,
        transport: "MOTORCYCLE" as const,
        interests: ["NATURE" as const],
        pace: "PACKED" as const,
      },
      timezone: "Asia/Ho_Chi_Minh" as const,
      days: [{
        day: 1,
        date: "2026-12-13",
        distanceMeters: 20_000,
        travelSeconds: 1800,
        stops: [{
          order: 1,
          destination: {
            id: "cmvsa4ob3000108l8upj3ccfu",
            name: "Đèo Mã Pì Lèng",
            description: "Đèo",
            area: "Mèo Vạc",
            address: null,
            category: "Cảnh quan",
            latitude: 23.24,
            longitude: 105.4,
            image: null,
          },
          arrivalMinute: 480,
          departureMinute: 480 + visitDurationMinutes,
          visitDurationMinutes,
          scheduleState: "PLANNED" as const,
          inbound: null,
          validationStatus: "PASS" as const,
        }],
      }],
      checks: [
        { key: "OPENING_HOURS" as const, status: "PASS" as const, issues: [] },
        { key: "MINIMUM_DURATION" as const, status: "PASS" as const, issues: [] },
        { key: "TRAVEL_TIME" as const, status: "PASS" as const, issues: [] },
        { key: "SCHEDULE_CONFLICTS" as const, status: "PASS" as const, issues: [] },
        { key: "MOBILITY" as const, status: "PASS" as const, issues: [] },
      ],
      warnings: [],
      reasonCodes: [],
      eligibleForFinalConfirmation: true,
    });

    await store.recordAssistantMessage({
      userId: "owner-1",
      conversationId: convId,
      clientMessageId: "a-save-1",
      parts: [
        { type: "text", text: "Bản lịch v2 đã đạt." },
        { type: "data-itinerary", id: "itinerary", data: makeProposal("prop-v2", 30) },
      ],
    });
    // Mark conversation as saved to cmwt3nfzl000107lbf8uetc0l with matching fingerprint
    (conversations.get(convId) as unknown as { savedTripId?: string | null }).savedTripId = "cmwt3nfzl000107lbf8uetc0l";
    savedTrips.set("cmwt3nfzl000107lbf8uetc0l", {
      id: "cmwt3nfzl000107lbf8uetc0l",
      userId: "owner-1",
      startDate: new Date("2026-12-13T00:00:00Z"),
      durationDays: 1,
      transport: "MOTORCYCLE",
      journeySnapshot: {
        revision: "journey-save-v1",
        visitFingerprint: '[[1,[["cmvsa4ob3000108l8upj3ccfu",1,480,30]]]]',
      },
      createdAt: new Date("2026-11-23T10:05:10Z"),
    });

    // Reload: server confirms prop-v2 matches cmwt3nfzl000107lbf8uetc0l
    const reloaded = await store.get("owner-1", convId);
    expect(reloaded.conversation.savedTripId).toBe("cmwt3nfzl000107lbf8uetc0l");
    expect(reloaded.conversation.savedProposalId).toBe("prop-v2");

    // Newer edit v3 changes visit duration to 60 min -> fingerprint diverges -> savedProposalId becomes null
    await store.recordAssistantMessage({
      userId: "owner-1",
      conversationId: convId,
      clientMessageId: "a-save-2",
      parts: [
        { type: "text", text: "Bản lịch v3 đã chỉnh." },
        { type: "data-itinerary", id: "itinerary", data: makeProposal("prop-v3", 60) },
      ],
    });
    const afterEdit = await store.get("owner-1", convId);
    expect(afterEdit.conversation.savedTripId).toBe("cmwt3nfzl000107lbf8uetc0l");
    expect(afterEdit.conversation.savedProposalId).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { createQaConversationStore } from "./qa-conversation-store";
import { createQaHttpHandlers } from "./qa-http";
import type { QaPrincipal } from "./qa-runtime-contract";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";

vi.mock("server-only", () => ({}));

const principal: QaPrincipal = { kind: "GUEST", id: "panel_guest" };
const now = new Date("2026-10-22T00:00:00.000Z");

// Exercise the actual store and HTTP mapping. This fixture injects DB failures;
// transaction rollback and SQL behavior are covered separately in PostgreSQL.
function setup({ visible = true, writeFailure = false, withTurns = false } = {}) {
  const owned = {
    id: "panel_conversation", title: "Fixture", context: { type: "DESTINATION", destinationId: "panel_destination" },
    knowledgeMode: "SOURCE_ONLY", headTurnId: null, activeTurnId: null, deletedAt: null,
    createdAt: now, lastActivityAt: now, expiresAt: new Date(now.getTime() + 86_400_000),
  };
  const query = vi.fn(async (sql: { sql: string }) => {
    if (sql.sql.includes("SELECT * FROM qa_conversation")) return [owned];
    if (sql.sql.includes("FROM qa_guest_identity") && sql.sql.includes("FOR SHARE")) return [{ id: principal.id }];
    if (sql.sql.includes("FROM destination")) return visible ? [{ id: "panel_destination", name: "Điểm kiểm thử" }] : [];
    if (withTurns && sql.sql.includes("FROM qa_turn")) return ["turn_first", "turn_second"].map(id => ({
      id, question: "Fixture", response: { conversationId: owned.id, turnId: id, turnState: "COMPLETED",
        context: owned.context, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE },
    }));
    return [];
  });
  const execute = vi.fn(async (sql: { sql: string }) => {
    if (writeFailure && sql.sql.includes('SET "knowledgeMode"')) throw new Error("private database failure");
    return 1;
  });
  const tx = { $queryRaw: query, $executeRaw: execute };
  const database = { ...tx, $transaction: async (work: (value: typeof tx) => Promise<unknown>) => work(tx) } as unknown as Database;
  const store = createQaConversationStore(database, { now: () => now });
  const http = createQaHttpHandlers({
    enabled: () => true, resolve: async () => principal, ask: vi.fn(),
    history: store.history.bind(store), delete: store.delete.bind(store), update: store.update!.bind(store),
  });
  const patch = () => http.renameConversation(new Request("http://localhost/api/ai/conversations/panel_conversation", {
    method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({ knowledgeMode: "EXPANDED" }),
  }), owned.id);
  return { store, execute, patch };
}

describe("Destination panel confirmed preference writes", () => {
  it("rejects a preference update after the Destination becomes unavailable", async () => {
    const t = setup({ visible: false });
    const response = await t.patch();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ operationStatus: "FAILED", error: { code: "CONTEXT_UNAVAILABLE" } });
    expect(t.execute.mock.calls.some(([sql]) => sql.sql.includes('SET "knowledgeMode"'))).toBe(false);
  });

  it("never acknowledges a failed mode write as SUCCESS", async () => {
    const response = await setup({ writeFailure: true }).patch();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ operationStatus: "UNKNOWN", retryWithSameKey: true });
  });

  it("confirms a visible Destination preference using the existing response shape", async () => {
    const response = await setup().patch();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, operationStatus: "SUCCESS", data: {
      id: "panel_conversation", title: "Fixture", knowledgeMode: "EXPANDED",
    } });
  });

  it("provides a usable next cursor when another turn page exists", async () => {
    const page = await setup({ withTurns: true }).store.turns!(principal, "panel_conversation", { limit: 1 });
    expect(page.hasMore).toBe(true);
    expect(page.turns).toHaveLength(1);
    expect(page.nextCursor).toBe("turn_first");
  });
});

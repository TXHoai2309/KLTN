import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";
import { memoriesResponse } from "./memory-http";
import { createMemoryService } from "./memory-service";
import { fakeMemoryStore } from "./memory-test-fixtures";

const ORIGIN = "https://app.test";
const owner = { userId: "owner" };
const auth = (userId?: string) => ({
  resolveSession: async () => userId ? { user: { id: userId } } : null,
  database: { user: { findUnique: async () => ({ id: userId, status: "ACTIVE", role: "TRAVELER" }) } },
}) as unknown as AuthorizationDependencies;
const setup = () => {
  const store = fakeMemoryStore();
  const memory = createMemoryService(store, {
    ...EMBEDDING_PROVENANCE, embed: async () => [{ index: 0, embedding: [1, ...Array(1535).fill(0)] }],
  });
  return {
    store, memory,
    deps: { authorization: auth(owner.userId), memory: vi.fn(() => memory), env: { TRIPSAGE_FEATURE_MEMORY: "true" } },
  };
};
const request = (method: "GET" | "DELETE", origin = ORIGIN, key?: string) =>
  new Request(`${ORIGIN}/api/ai/memories`, { method, headers: { origin, ...(key ? { "Idempotency-Key": key } : {}) } });
const save = (memory: ReturnType<typeof createMemoryService>) =>
  memory.save(owner, { content: "Tôi ăn chay", kind: "PREFERENCE" }, { text: "Tôi ăn chay", messageId: "m1" });

describe("memory route", () => {
  it("returns 404 with the flag off, before auth and without resolving the service", async () => {
    const { deps } = setup();
    const authorization = auth();
    const session = vi.spyOn(authorization, "resolveSession");
    const response = await memoriesResponse(request("GET"), { ...deps, authorization, env: { TRIPSAGE_FEATURE_MEMORY: "TRUE" } });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(session).not.toHaveBeenCalled();
    expect(deps.memory).not.toHaveBeenCalled();
  });

  it("returns only the current traveler's public item projection and no embedding", async () => {
    const { deps, memory } = setup();
    await save(memory);
    const response = await memoriesResponse(request("GET"), deps);
    expect(await response.json()).toEqual({ success: true, data: { items: [{
      id: expect.any(String), content: "Tôi ăn chay", kind: "PREFERENCE",
      createdAt: expect.any(String), updatedAt: expect.any(String),
    }] } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await (await memoriesResponse(request("GET"), { ...deps, authorization: auth("other") })).json())
      .toEqual({ success: true, data: { items: [] } });
  });

  it("requires auth, same origin and a key for DELETE, with no existence leak for another user's ID", async () => {
    const { deps, memory } = setup();
    await save(memory);
    const [item] = await memory.list(owner);
    expect((await memoriesResponse(request("GET"), { ...deps, authorization: auth() })).status).toBe(401);
    expect((await memoriesResponse(request("DELETE", "https://other.test", "key"), deps, item!.id)).status).toBe(403);
    expect((await memoriesResponse(request("DELETE"), deps, item!.id)).status).toBe(400);
    expect((await memoriesResponse(request("DELETE", ORIGIN, "key"), { ...deps, authorization: auth("other") }, item!.id)).status).toBe(404);
    expect(await memory.list(owner)).toHaveLength(1);
  });

  it("replays an UNKNOWN delete with the same key", async () => {
    const { deps, memory, store } = setup();
    await save(memory);
    store.loseNextWriteResponse();
    const lost = await memoriesResponse(request("DELETE", ORIGIN, "all"), deps);
    expect(await lost.json()).toMatchObject({ operationStatus: "UNKNOWN", retryWithSameKey: true });
    const replay = await memoriesResponse(request("DELETE", ORIGIN, "all"), deps);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(await replay.json()).toMatchObject({ operationStatus: "SUCCESS", data: { count: 1 } });
  });
});

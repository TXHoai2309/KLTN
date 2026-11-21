import { describe, expect, it, vi } from "vitest";
import {
  deleteTripEditChatMessagesResponse,
  getTripEditChatMessagesResponse,
  postTripEditChatMessagesResponse,
  type TripEditChatDatabase,
} from "./trip-edit-chat-memory";
import type { AuthorizationDependencies } from "@/server/authorization/guard";

function makeAuth(userId: string): AuthorizationDependencies {
  return {
    resolveSession: vi.fn(async () => ({
      user: { id: userId, role: "TRAVELER" },
    })),
    database: {
      user: {
        findUnique: vi.fn(async () => ({
          id: userId,
          role: "TRAVELER" as const,
          status: "ACTIVE" as const,
        })),
      },
    },
  } as unknown as AuthorizationDependencies;
}

function makeMemoryDb(ownerId: string) {
  const rows: Array<Record<string, unknown>> = [];
  let seq = 0;
  const db: TripEditChatDatabase = {
    trip: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "trip-1" ? { id: "trip-1", userId: ownerId } : null,
      ),
    } as unknown as TripEditChatDatabase["trip"],
    tripEditChatMessage: {
      findMany: vi.fn(async ({ where, take }: { where: { tripId: string }; take: number }) =>
        rows
          .filter((r) => r.tripId === where.tripId)
          .slice(-take)
          .reverse(),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `msg-${++seq}`,
          createdAt: new Date(Date.now() + seq * 1000),
          ...data,
        };
        rows.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { tripId: string } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i]?.tripId === where.tripId) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    } as unknown as TripEditChatDatabase["tripEditChatMessage"],
  };
  return { db, rows };
}

describe("trip-edit chat memory HTTP & ownership", () => {
  it("appends, lists chronologically, and clears messages for the trip owner", async () => {
    const { db } = makeMemoryDb("owner-1");
    const deps = { authorization: makeAuth("owner-1"), database: db };

    const postRes = await postTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/trip-1/edits/ai/messages", {
        method: "POST",
        headers: {
          origin: "https://kltn.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "user", text: "Đổi giờ đi sang 8h sáng" },
            {
              role: "assistant",
              kind: "APPLIED",
              text: "Đã đổi giờ khởi hành sang 08:00.",
              steps: ["Xem lịch", "Kiểm tra tuyến đường"],
            },
          ],
        }),
      }),
      "trip-1",
      deps,
    );
    expect(postRes.status).toBe(201);

    const getRes = await getTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/trip-1/edits/ai/messages", { method: "GET" }),
      "trip-1",
      deps,
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { data: { messages: Array<{ role: string; text: string; steps?: string[] }> } };
    expect(getBody.data.messages).toHaveLength(2);
    expect(getBody.data.messages[0]).toMatchObject({ role: "user", text: "Đổi giờ đi sang 8h sáng" });
    expect(getBody.data.messages[1]).toMatchObject({
      role: "assistant",
      text: "Đã đổi giờ khởi hành sang 08:00.",
      steps: ["Xem lịch", "Kiểm tra tuyến đường"],
    });

    const delRes = await deleteTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/trip-1/edits/ai/messages", {
        method: "DELETE",
        headers: { origin: "https://kltn.test" },
      }),
      "trip-1",
      deps,
    );
    expect(delRes.status).toBe(200);
    const afterRes = await getTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/trip-1/edits/ai/messages", { method: "GET" }),
      "trip-1",
      deps,
    );
    const afterBody = (await afterRes.json()) as { data: { messages: unknown[] } };
    expect(afterBody.data.messages).toHaveLength(0);
  });

  it("rejects non-owners with 403 and missing trips with 404", async () => {
    const { db } = makeMemoryDb("owner-1");
    const nonOwnerDeps = { authorization: makeAuth("other-user"), database: db };

    const res403 = await getTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/trip-1/edits/ai/messages", { method: "GET" }),
      "trip-1",
      nonOwnerDeps,
    );
    expect(res403.status).toBe(403);

    const res404 = await getTripEditChatMessagesResponse(
      new Request("https://kltn.test/api/trips/missing/edits/ai/messages", { method: "GET" }),
      "missing",
      nonOwnerDeps,
    );
    expect(res404.status).toBe(404);
  });
});

import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { companionListQuerySchema, companionListSchema } from "./companion-contract";
import { companionEmptyListFixture, companionListFixture, companionListQueryFixture } from "./companion-fixtures";
import { listMyCompanionPublications, listPublicCompanions } from "./companion-discovery-service";
import { companionCollectionResponse } from "./companion-http";

const now = new Date("2030-11-14T16:59:59Z");
function fixture(actor: string | null = "owner", role = "TRAVELER", status = "ACTIVE") {
  const count = vi.fn(async () => 0), findMany = vi.fn(async () => []);
  const transaction = vi.fn(async (run: any) => run({ tripCompanionPublication: { count, findMany }, $queryRaw: async () => [] }));
  const resolveSession = vi.fn(async () => actor ? { user: { id: actor, role: "ADMIN" } } : null);
  return {
    count, findMany, transaction, resolveSession,
    deps: {
      database: { user: { findUnique: async () => ({ id: actor, role, status }) }, $transaction: transaction } as unknown as Database,
      resolveSession, now: () => now,
    },
  };
}
const request = (query = "") => new Request(`http://localhost/api/trip-companions${query}`);

describe("TC-02 discovery contract and HTTP", () => {
  it("shares raw URL filters and strict public list fixtures", () => {
    expect(companionListQuerySchema.parse({})).toEqual({ q: "", availableOnly: false, limit: 12 });
    expect(companionListQuerySchema.parse(companionListQueryFixture)).toMatchObject({ availableOnly: true, limit: 12 });
    expect(companionListSchema.parse(companionListFixture)).toEqual(companionListFixture);
    expect(companionListSchema.parse(companionEmptyListFixture)).toEqual(companionEmptyListFixture);
    expect(companionListSchema.safeParse({ ...companionListFixture, items: [{ ...companionListFixture.items[0], tripId: "private" }] }).success).toBe(false);
  });
  it.each([
    { userId: "owner" }, { hostId: "owner" }, { scope: "mine" }, { page: "1" },
    { departureFrom: "2030-02-30" }, { departureTo: "2030-2-3" }, { departureFrom: "2030-11-16", departureTo: "2030-11-15" },
    { transport: "BIKE" }, { availableOnly: "1" }, { limit: "0" }, { limit: "51" }, { limit: "12.5" }, { limit: "" },
    { q: "x".repeat(201) }, { cursor: "a=b" }, { cursor: "" },
  ])("rejects invalid query before database reads: %j", async query => {
    const f = fixture();
    await expect(listPublicCompanions(query, f.deps)).rejects.toMatchObject({ code: "INVALID_COMPANION_QUERY", status: 400 });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("public reads never resolve an actor and use no-store ordinary envelopes", async () => {
    const f = fixture(null);
    const response = await companionCollectionResponse(request(), f.deps, "public");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: companionEmptyListFixture });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(f.resolveSession).not.toHaveBeenCalled();
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });
  it.each([[null, "TRAVELER", "ACTIVE", 401], ["owner", "TRAVELER", "LOCKED", 403]])("own collection rejects %s/%s/%s", async (actor, role, status, http) => {
    const f = fixture(actor as string | null, role as string, status as string);
    const response = await companionCollectionResponse(request(), f.deps, "mine");
    expect(response.status).toBe(http);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each(["TRAVELER", "ADMIN"])("scopes current %s to their own posts and combines filters", async role => {
    const f = fixture("owner", role);
    await listMyCompanionPublications(new Headers(), companionListQueryFixture, f.deps);
    expect(f.count.mock.calls[0]).toMatchObject([{ where: {
      trip: { userId: "owner", startDate: { gte: new Date("2030-11-15"), lte: new Date("2030-11-15") }, transport: "MOTORCYCLE" },
      additionalCapacity: { gt: 0 },
    } }]);
  });
  it("rejects repeated params, unknown parameters and malformed cursor without reading", async () => {
    const f = fixture();
    for (const query of ["?transport=CAR&transport=MOTORCYCLE", "?userId=owner", "?cursor=eyJmb28iOjF9", "?__proto__=x"]) {
      const response = await companionCollectionResponse(request(query), f.deps, "public");
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_COMPANION_QUERY" } });
    }
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("technical read failures return 500 and never masquerade as an empty list or write status", async () => {
    const f = fixture(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    f.transaction.mockRejectedValueOnce(new Error("synthetic read outage"));
    try {
      const response = await companionCollectionResponse(request(), f.deps, "public");
      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result).toMatchObject({ success: false, error: { code: "INTERNAL_SERVER_ERROR" } });
      expect(result).not.toHaveProperty("operationStatus");
    } finally { log.mockRestore(); }
  });
});

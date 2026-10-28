import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { companionViewerContextSchema, publicCompanionSchema } from "./companion-contract";
import { companionHostViewerFixture, companionVisitorFixture, publicCompanionFixture } from "./companion-fixtures";
import { companionViewerResponse } from "./companion-http";
import { getCompanionViewerContext } from "./companion-service";

function fixture(actor: string | null = "owner", role = "TRAVELER", status = "ACTIVE") {
  const findFirst = vi.fn(async ({ where }: any) => where.id === "publication" && where.trip.userId === "owner" ? { tripId: "synthetic-trip" } : null);
  return {
    findFirst,
    deps: {
      database: { user: { findUnique: async () => ({ id: actor, role, status }) }, tripCompanionPublication: { findFirst } } as unknown as Database,
      resolveSession: async () => actor ? { user: { id: actor, role: "ADMIN" } } : null,
    },
  };
}

describe("milestone 0 trusted viewer context", () => {
  it("hands off strict fixtures without adding private fields to the public schema", () => {
    expect(companionViewerContextSchema.parse(companionHostViewerFixture)).toEqual(companionHostViewerFixture);
    expect(companionViewerContextSchema.parse(companionVisitorFixture)).toEqual(companionVisitorFixture);
    expect(companionViewerContextSchema.safeParse({ relationship: "VISITOR", tripId: "private" }).success).toBe(false);
    expect(publicCompanionSchema.safeParse({ ...publicCompanionFixture, tripId: "private" }).success).toBe(false);
  });
  it.each(["TRAVELER", "ADMIN"])("current %s owner can return to their Trip regardless of publication eligibility", async role => {
    const f = fixture("owner", role);
    expect(await getCompanionViewerContext(new Headers(), "publication", f.deps)).toEqual(companionHostViewerFixture);
    expect(f.findFirst).toHaveBeenCalledWith({ where: { id: "publication", trip: { userId: "owner" } }, select: { tripId: true } });
  });
  it.each(["TRAVELER", "ADMIN"])("unrelated %s and missing IDs disclose no private context", async role => {
    const f = fixture("outsider", role);
    for (const id of ["publication", "missing"]) expect(await getCompanionViewerContext(new Headers(), id, f.deps)).toEqual(companionVisitorFixture);
  });
  it.each([[null, "ACTIVE", 401], ["owner", "LOCKED", 403]])("rejects %s/%s using current account state", async (actor, status, code) => {
    const f = fixture(actor as string | null, "TRAVELER", status as string);
    const response = await companionViewerResponse(new Request("http://localhost/api/trip-companions/publication/viewer"), "publication", f.deps);
    expect(response.status).toBe(code);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(f.findFirst).not.toHaveBeenCalled();
  });
  it("returns the ordinary envelope/no-store and rejects spoofed query fields", async () => {
    const f = fixture();
    const response = await companionViewerResponse(new Request("http://localhost/api/trip-companions/publication/viewer"), "publication", f.deps);
    expect(await response.json()).toEqual({ success: true, data: companionHostViewerFixture });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const invalid = await companionViewerResponse(new Request("http://localhost/api/trip-companions/publication/viewer?userId=owner"), "publication", f.deps);
    expect(invalid.status).toBe(400);
  });
});

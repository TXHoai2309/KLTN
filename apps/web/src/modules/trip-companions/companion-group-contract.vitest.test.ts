import { describe, expect, it, vi } from "vitest";
import { companionGroupFixture } from "./companion-group-fixtures";
import { companionConfirmSchema, companionGroupMutationSchema, companionGroupSchema } from "./companion-group-contract";
import { companionTestRequest } from "./companion-test-fixture";
import { companionWriteResponse } from "./companion-group-http";
import { companionManageSchema, companionManageInputSchema } from "./companion-management-contract";
import { companionManageFixture } from "./companion-management-fixtures";
import { companionMembersSchema } from "./companion-members-contract";
import { companionMembersFixture } from "./companion-members-fixtures";

describe("companion group contract and write HTTP boundary", () => {
  it("exports strict client-safe group fixtures and identity-free confirmation/results", () => {
    expect(companionGroupSchema.parse(companionGroupFixture)).toEqual(companionGroupFixture);
    expect(companionConfirmSchema.safeParse({ confirm: true, userId: "spoof" }).success).toBe(false);
    expect(companionConfirmSchema.safeParse({ confirm: false }).success).toBe(false);
    expect(companionGroupMutationSchema.safeParse({ publicationId: "id", tripId: "private" }).success).toBe(false);
    expect(companionGroupSchema.safeParse({ ...companionGroupFixture, needs: "private" }).success).toBe(false);
  });
  it("shares host management fixture and rejects identity overrides or missing revision", () => {
    expect(companionManageSchema.parse(companionManageFixture)).toEqual(companionManageFixture);
    const payload = { ...companionManageFixture.draft, confirm: true, visibility: "PUBLIC", recruitmentOpen: false, baseRevision: 0 };
    expect(companionManageInputSchema.safeParse(payload).success).toBe(true);
    expect(companionManageInputSchema.safeParse({ ...payload, userId: "spoof" }).success).toBe(false);
    expect(companionManageInputSchema.safeParse({ ...payload, baseRevision: undefined }).success).toBe(false);
  });
  it("members fixture exposes group identity without account contacts", () => {
    expect(companionMembersSchema.parse(companionMembersFixture)).toEqual(companionMembersFixture);
    expect(companionMembersSchema.safeParse({ ...companionMembersFixture, email: "private" }).success).toBe(false);
  });
  it("returns known failures before invoking business logic for invalid HTTP writes", async () => {
    for (const variant of ["origin", "content", "key", "query", "oversized", "json"]) {
      const req = companionTestRequest("id", "join");
      let url = req.url, body = "{}";
      const headers = new Headers(req.headers);
      if (variant === "origin") headers.set("origin", "https://foreign.invalid");
      if (variant === "content") headers.set("content-type", "text/plain");
      if (variant === "key") headers.delete("Idempotency-Key");
      if (variant === "query") url += "?userId=spoof";
      if (variant === "oversized") body = "a".repeat(24577);
      if (variant === "json") body = "{invalid";
      const write = vi.fn();
      const response = await companionWriteResponse(new Request(url, { method: "POST", headers, body }), write);
      expect(response.status).toBe(variant === "origin" ? 403 : variant === "content" ? 415 : variant === "oversized" ? 413 : 400);
      expect(await response.json()).toMatchObject({ operationStatus: "FAILED" });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(write).not.toHaveBeenCalled();
    }
  });
});

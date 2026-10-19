import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { requireActor, type AuthorizationDependencies } from "../authorization/guard";
import { requireOwnership, readOwnedTravelerResource, type Actor } from "../authorization/policy";
import { hasRolePermission } from "@/lib/authorization-capabilities";
import { requireTraveler } from "./require-traveler";

function fixture(sessionRole?: string) {
  let persisted: { id: string; role: string } | null = { id: "admin-a", role: "ADMIN" };
  const findUnique = vi.fn(async () => persisted);
  const resolveSession = vi.fn(async () => ({ user: { id: "admin-a", role: sessionRole } }));
  const deps: AuthorizationDependencies = { database: { user: { findUnique } } as unknown as Database, resolveSession };
  return { deps, findUnique, setUser: (value: typeof persisted) => { persisted = value; } };
}

describe("RBAC V2 trusted Traveler capability", () => {
  it.each(["ADMIN", "TRAVELER", "ROOT", undefined])("persisted role authorizes independently of session role %s with one user lookup", async sessionRole => {
    const f = fixture(sessionRole);
    expect(await requireTraveler(new Headers({ "x-user-id": "victim", "x-role": "ROOT" }), f.deps)).toEqual({ userId: "admin-a" });
    expect(f.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: "admin-a" }, select: { id: true, role: true, status: true } });
  });

  it("reflects promotion/demotion and unsupported-role revocation on the next request", async () => {
    const f = fixture("ADMIN");
    expect(await requireActor(new Headers(), f.deps, "admin")).toHaveProperty("role", "ADMIN");
    f.setUser({ id: "admin-a", role: "TRAVELER" });
    await expect(requireActor(new Headers(), f.deps, "admin")).rejects.toMatchObject({ status: 403 });
    expect(await requireTraveler(new Headers(), f.deps)).toEqual({ userId: "admin-a" });
    f.setUser({ id: "admin-a", role: "ADMIN" });
    expect(await requireActor(new Headers(), f.deps, "admin")).toHaveProperty("role", "ADMIN");
    f.setUser({ id: "admin-a", role: "ROOT" });
    await expect(requireTraveler(new Headers({ "x-role": "ADMIN" }), f.deps)).rejects.toMatchObject({ status: 403 });
    f.setUser(null);
    await expect(requireTraveler(new Headers(), f.deps)).rejects.toMatchObject({ status: 401 });
  });

  it("denies an absent/revoked Better Auth session before database access", async () => {
    const f = fixture(); f.deps.resolveSession = async () => null;
    await expect(requireTraveler(new Headers(), f.deps)).rejects.toMatchObject({ status: 401 });
    expect(f.findUnique).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "TRAVELER"] as const)("%s inherits no ownership bypass", async role => {
    const actor: Actor = { id: "a", role };
    const read = vi.fn(async (scope: { id: string; userId: string }) => scope.id === "own" && scope.userId === "a" ? { secret: "own" } : null);
    expect(await readOwnedTravelerResource(actor, "own", read)).toEqual({ secret: "own" });
    for (const id of ["foreign", "absent"]) await expect(readOwnedTravelerResource(actor, id, read)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(read).toHaveBeenCalledWith({ id: "foreign", userId: "a" });
    expect(() => requireOwnership(actor, "b")).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("UI capability hints share the policy and fail closed on unsupported roles", () => {
    for (const role of ["ADMIN", "TRAVELER"]) expect(hasRolePermission(role, "traveler")).toBe(true);
    for (const role of [null, undefined, "ROOT", "__proto__"]) expect(hasRolePermission(role, "traveler")).toBe(false);
    expect(hasRolePermission("TRAVELER", "admin")).toBe(false);
    expect(hasRolePermission("ADMIN", "admin")).toBe(true);
  });
});

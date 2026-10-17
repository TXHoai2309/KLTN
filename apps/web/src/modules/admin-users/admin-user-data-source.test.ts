import { describe, it, expect } from "vitest";
import {
  filterAndPaginateUsers,
  computeUserStatistics,
  ClientAdminUserDataSource,
  DEV_FIXTURE_USERS,
} from "./admin-user-data-source";

describe("Admin User Data Source - Filtering, Sorting & Pagination", () => {
  it("computes accurate statistics from the user list", () => {
    const stats = computeUserStatistics(DEV_FIXTURE_USERS);
    expect(stats.totalUsers).toBe(10);
    expect(stats.adminCount).toBe(2);
    expect(stats.travelerCount).toBe(8);
    expect(stats.lockedCount).toBe(2);
  });

  it("filters users by search query (case-insensitive on name or email)", () => {
    const resName = filterAndPaginateUsers(DEV_FIXTURE_USERS, { search: "hoài" });
    expect(resName.total).toBe(1);
    expect(resName.items[0]?.name).toBe("Trần Xuân Hoài");

    const resEmail = filterAndPaginateUsers(DEV_FIXTURE_USERS, { search: "@gmail.com" });
    expect(resEmail.total).toBeGreaterThan(0);
    expect(resEmail.items.every((u) => u.email.endsWith("@gmail.com"))).toBe(true);
  });

  it("filters users by role correctly", () => {
    const admins = filterAndPaginateUsers(DEV_FIXTURE_USERS, { role: "ADMIN" });
    expect(admins.total).toBe(2);
    expect(admins.items.every((u) => u.role === "ADMIN")).toBe(true);

    const travelers = filterAndPaginateUsers(DEV_FIXTURE_USERS, { role: "TRAVELER" });
    expect(travelers.total).toBe(8);
    expect(travelers.items.every((u) => u.role === "TRAVELER")).toBe(true);
  });

  it("filters users by status correctly", () => {
    const locked = filterAndPaginateUsers(DEV_FIXTURE_USERS, { status: "LOCKED" });
    expect(locked.total).toBe(2);
    expect(locked.items.every((u) => u.status === "LOCKED")).toBe(true);

    const unknown = filterAndPaginateUsers(DEV_FIXTURE_USERS, { status: "UNKNOWN" });
    expect(unknown.total).toBe(1);
  });

  it("sorts by name alphabetically (A-Z and Z-A)", () => {
    const sortAZ = filterAndPaginateUsers(DEV_FIXTURE_USERS, {
      sortBy: "name",
      sortOrder: "asc",
      pageSize: 10,
    });
    const namesAZ = sortAZ.items.map((u) => u.name);
    const sortedExpected = [...namesAZ].sort((a, b) => a.localeCompare(b, "vi"));
    expect(namesAZ).toEqual(sortedExpected);

    const sortZA = filterAndPaginateUsers(DEV_FIXTURE_USERS, {
      sortBy: "name",
      sortOrder: "desc",
      pageSize: 10,
    });
    expect(sortZA.items[0]?.name).toBe(sortedExpected[sortedExpected.length - 1]);
  });

  it("paginates properly with page size and boundaries", () => {
    const page1 = filterAndPaginateUsers(DEV_FIXTURE_USERS, { page: 1, pageSize: 4 });
    expect(page1.items.length).toBe(4);
    expect(page1.totalPages).toBe(3);
    expect(page1.hasMore).toBe(true);

    const page3 = filterAndPaginateUsers(DEV_FIXTURE_USERS, { page: 3, pageSize: 4 });
    expect(page3.items.length).toBe(2);
    expect(page3.hasMore).toBe(false);
  });

  it("safely blocks mutations in ClientAdminUserDataSource", async () => {
    const ds = new ClientAdminUserDataSource(DEV_FIXTURE_USERS);
    const roleRes = await ds.requestChangeRole("usr_01", "TRAVELER");
    expect(roleRes.success).toBe(false);
    expect(roleRes.requiresPhase2Backend).toBe(true);

    const lockRes = await ds.requestLockUser("usr_01", "Testing");
    expect(lockRes.success).toBe(false);
    expect(lockRes.requiresPhase2Backend).toBe(true);
  });
});

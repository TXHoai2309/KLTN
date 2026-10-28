/** Synthetic fixtures for opt-in owned PostgreSQL tests only. */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { CompanionDependencies } from "./companion-service";

export const companionTestUrl = process.env.TC01_TEST_DATABASE_URL;
export async function companionTestFixture(label: string) {
  const raw = companionTestUrl!, target = new URL(raw);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/tc01_test" || target.username !== "tc01_test" || target.searchParams.get("sslmode") !== "disable" || process.env.TC01_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable companion target");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) });
  const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (identity[0]?.name !== "tc01_test") throw new Error("Disposable database identity mismatch");
  const prefix = `${label}-${randomUUID()}`, actors = ["owner", "a", "b", "admin"].map(name => `${prefix}-${name}`);
  const [owner, a, b, admin] = actors as [string, string, string, string];
  const destination = `${prefix}-destination`;
  const clock = { value: new Date("2030-11-14T16:59:59Z") };
  await db.user.createMany({ data: actors.map(id => ({ id, name: id === owner ? "Host" : "Member", email: `${id}@example.invalid`, role: id === admin ? "ADMIN" : "TRAVELER" })) });
  await db.destination.create({ data: { id: destination, name: "Public destination", description: "PRIVATE_DESCRIPTION", area: "test", category: "test", latitude: 23, longitude: 105, minimumDurationMinutes: 30, visibility: "VISIBLE",
    openingDays: { create: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek: dayOfWeek as "MONDAY", status: "OPEN", intervals: { create: { opensAtMinute: 0, closesAtMinute: 1440 } } })) },
  } });
  const deps = (actor: string | null = owner): CompanionDependencies => ({ database: db, resolveSession: async () => actor ? { user: { id: actor } } : null, now: () => clock.value });
  const create = async (capacity = 1) => {
    const trip = await db.trip.create({ data: { userId: owner, startDate: new Date("2030-11-15"), durationDays: 1, transport: "CAR",
      companionPublication: { create: { title: "Synthetic group", introduction: "Public introduction", additionalCapacity: capacity } },
      days: { create: { dayIndex: 1, localDate: new Date("2030-11-15"), visits: { create: { destinationId: destination, order: 1, startMinute: 480, plannedDurationMinutes: 60 } } } },
    }, select: { id: true, companionPublication: { select: { id: true } } } });
    return { tripId: trip.id, id: trip.companionPublication!.id };
  };
  const clean = async () => {
    // Synthetic IDs only. Explicit history reset is fixture teardown, never a product path.
    const publications = { trip: { userId: { in: actors } } };
    await db.tripCompanionMembership.deleteMany({ where: { publication: publications } });
    await db.tripCompanionPublication.updateMany({ where: publications, data: { everHadMembers: false, messageSequence: BigInt(0) } });
    await db.trip.deleteMany({ where: { userId: { in: actors } } });
    await db.user.updateMany({ where: { id: { in: actors } }, data: { status: "ACTIVE" } });
    await db.destination.update({ where: { id: destination }, data: { visibility: "VISIBLE" } });
    clock.value = new Date("2030-11-14T16:59:59Z");
  };
  return { db, owner, a, b, admin, destination, clock, deps, create, clean, close: async () => { try { await clean(); } finally { await db.$disconnect(); } } };
}
export type CompanionTestFixture = Awaited<ReturnType<typeof companionTestFixture>>;
export const confirmCompanion = { confirm: true };
export const companionTestHeaders = new Headers();
export function companionTestRequest(id: string, action: string, body: unknown = confirmCompanion, key = randomUUID()) {
  return new Request(`http://localhost:3010/api/trip-companions/${id}/${action}`, { method: "POST", headers: { origin: "http://localhost:3010", "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
}
export async function observeCompanionLock(db: PrismaClient) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND (query LIKE '%FOR UPDATE%' OR query LIKE '%FOR SHARE%')) AS waiting`;
    if (rows[0]?.waiting) return true;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return false;
}

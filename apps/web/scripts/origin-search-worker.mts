/** Test helper: accepts only the runner's owned disposable target, never DATABASE_URL. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../packages/db/prisma/generated/client.ts";
import { createOriginSearchStore } from "../src/modules/trip-origin/origin-search-store.ts";

const raw = process.env.ORIGIN_SEARCH_TEST_DATABASE_URL;
if (!raw) throw new Error("Disposable target missing");
const target = new URL(raw);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/origin02_test" || target.username !== "origin02_test" || target.searchParams.get("sslmode") !== "disable" || process.env.ORIGIN_SEARCH_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Disposable identity rejected");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) });
const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
if (identity[0]?.name !== "origin02_test") throw new Error("Database identity rejected");
process.on("message", async command => {
  if (command !== "claim") return;
  const claim = await createOriginSearchStore(db).claim();
  process.send?.({ type: "result", admitted: claim !== null });
  if (process.argv[2] !== "hold") { await db.$disconnect(); process.disconnect?.(); }
});
process.send?.({ type: "ready" });

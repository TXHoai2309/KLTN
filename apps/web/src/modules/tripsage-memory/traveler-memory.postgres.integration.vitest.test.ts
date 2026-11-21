import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";
import { createMemoryService } from "./memory-service";
import { createMemoryStore } from "./memory-store";

const connectionString = process.env.TRAVELER_MEMORY_TEST_DATABASE_URL;
const disposable = process.env.TRAVELER_MEMORY_TEST_DISPOSABLE === "OWNED_LOOPBACK_CONTAINER";
describe.skipIf(!connectionString || !disposable)("TravelerMemory on disposable PostgreSQL with pgvector", () => {
  const runId = randomUUID();
  const owner = { userId: `memory-${runId}-a` };
  const other = { userId: `memory-${runId}-b` };
  let db: PrismaClient;

  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" || target.searchParams.get("sslmode") !== "disable") {
      throw new Error("Refusing non-disposable PostgreSQL. Use a disposable loopback database with sslmode=disable.");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await db.user.createMany({ data: [owner, other].map(({ userId }) => ({
      id: userId, name: "Traveler memory test", email: `${userId}@example.test`,
    })) });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      // The disposable fixture cleans both user rows and their idempotency metadata.
      await db.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } });
      await db.idempotencyRecord.deleteMany({ where: { scope: {
        in: [owner, other].flatMap(({ userId }) => ["memory:remember", "memory:delete"].map(operation => JSON.stringify([userId, operation]))),
      } } });
    } finally {
      await db.$disconnect();
    }
  });

  it("ranks cosine matches for one owner, enforces scoped deletion and cascades the account delete", async () => {
    const vector = (x: number, y: number) => [x, y, ...Array<number>(1534).fill(0)];
    const provider = {
      ...EMBEDDING_PROVENANCE,
      embed: async ({ input }: { input: readonly string[] }) => [{
        index: 0,
        embedding: input[0]?.includes("xe máy") ? vector(1, 0)
          : input[0]?.includes("xe đạp") ? vector(1, 1) : vector(0, 1),
      }],
    };
    const service = createMemoryService(createMemoryStore(db), provider);
    const remember = async (actor: typeof owner, content: string) => {
      const outcome = await service.save(actor, { content, kind: "NOTE" }, { text: `Hãy nhớ: ${content}` });
      expect(outcome.status).toBe("SUCCESS");
    };
    await remember(owner, "Đi xe đạp");
    await remember(owner, "Đi xe máy");
    await remember(owner, "Đi bộ");
    await remember(other, "Đi xe máy cùng bạn");
    expect(await service.recall(owner, "xe máy")).toEqual([
      { content: "Đi xe máy", kind: "NOTE" }, { content: "Đi xe đạp", kind: "NOTE" },
    ]);
    expect(await service.recall(other, "xe máy")).toEqual([{ content: "Đi xe máy cùng bạn", kind: "NOTE" }]);
    const [item] = await service.list(other);
    expect(await service.delete(owner, item!.id, "delete-foreign")).toMatchObject({ status: "FAILED", httpStatus: 404 });
    await db.user.delete({ where: { id: owner.userId } });
    expect(await db.travelerMemory.count({ where: { userId: owner.userId } })).toBe(0);
    expect(await db.travelerMemory.count({ where: { userId: other.userId } })).toBe(1);
  });
});

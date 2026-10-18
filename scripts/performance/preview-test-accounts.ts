// Test setup only: real Better Auth accounts on the identity-pinned DEVELOPMENT
// branch. Never provision on Production; no application guard is substituted.
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../packages/db/prisma/generated/client";
import { createAuth } from "@KLTN/auth";
import type { Database } from "@KLTN/db";

const action = process.argv[2];
if (!["create", "cleanup"].includes(action ?? "")) throw Error("create|cleanup required");
const receipt = ".cache/performance-v3-test-accounts-private.json";
const secrets = parseEnv(await readFile("apps/web/.env", "utf8"));
const url = new URL(secrets.SYNC_SOURCE_DATABASE_URL!);
if (!/^ep-purple-pond-b3xujb8o(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || url.pathname !== "/neondb") throw Error("DEVELOPMENT_IDENTITY_REQUIRED");
url.searchParams.set("sslmode", "verify-full");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
try {
  if (action === "cleanup") {
    let pending: { state: string } | undefined;
    try { pending = JSON.parse(await readFile(".cache/v3-cms-pending-private.json", "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (pending && !["SUCCESS", "FAILED"].includes(pending.state)) throw Error("CMS_UNKNOWN_RECONCILIATION_REQUIRED_BEFORE_CLEANUP");
    const data = JSON.parse(await readFile(receipt, "utf8"));
    if (data.destinationIds?.length) {
      await db.$transaction(async tx => {
        const owned = await tx.destination.findMany({ where: { id: { in: data.destinationIds }, name: { startsWith: "Performance V3 fixture " } }, select: { id: true } });
        const ids = owned.map(d => d.id);
        // Editorial deliberately uses RESTRICT. Remove only this fixture's
        // publication before its parent; keep the schema and FK policy intact.
        await tx.destinationEditorial.deleteMany({ where: { destinationId: { in: ids } } });
        await tx.destination.deleteMany({ where: { id: { in: ids } } });
      });
    }
    for (const account of data.accounts) {
      if (!account.email.endsWith("@example.invalid") || !account.email.startsWith("perf-v3-")) throw Error("FIXTURE_IDENTITY_REQUIRED");
      await db.idempotencyRecord.deleteMany({ where: { scope: { startsWith: JSON.stringify([account.id]).slice(0, -1) + "," }, key: { startsWith: "perf-v3-" } } });
      // Delete only this receipt's owned synthetic users; FK cascades remove
      // their sessions/accounts. No shared table truncate or corpus mutation.
      await db.user.deleteMany({ where: { id: account.id, email: account.email } });
    }
    data.cleanedAt = new Date().toISOString();
    await writeFile(receipt, JSON.stringify(data, null, 2));
    console.log(JSON.stringify({ status: "FIXTURES_REMOVED", users: data.accounts.length, productionWrites: 0 }));
  } else {
    const auth = createAuth({ BETTER_AUTH_URL: "http://localhost:3010", BETTER_AUTH_SECRET: randomUUID() + randomUUID() }, db as unknown as Database);
    const data = { createdAt: new Date().toISOString(), branch: "br-aged-hat-b3o6hg9p", accounts: [] as { id: string; email: string; password: string; role: string }[] };
    await writeFile(receipt, JSON.stringify(data, null, 2), { flag: "wx" });
    for (const role of ["TRAVELER", "ADMIN"]) {
      const email = `perf-v3-${randomUUID()}@example.invalid`, password = randomUUID() + "aA!9";
      const response = await auth.api.signUpEmail({ body: { name: `Performance V3 ${role}`, email, password }, headers: new Headers({ origin: "http://localhost:3010" }), asResponse: true });
      if (response.status !== 200) throw Error(`FIXTURE_SIGNUP_HTTP_${response.status}`);
      const body = await response.json();
      data.accounts.push({ id: body.user.id, email, password, role });
      await writeFile(receipt, JSON.stringify(data, null, 2));
      if (role === "ADMIN") await db.user.update({ where: { id: body.user.id, email }, data: { role: "ADMIN" } });
    }
    console.log(JSON.stringify({ status: "REAL_AUTH_FIXTURES_CREATED", users: data.accounts.length, branch: data.branch, productionWrites: 0 }));
  }
} finally { await db.$disconnect(); }

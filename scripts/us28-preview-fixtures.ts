// Owned TEST fixtures on identity-verified Development only. No Production writes.
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/db/prisma/generated/client";
import { createAuth } from "@KLTN/auth";
import type { Database } from "@KLTN/db";
const action = process.argv[2];
if (!["create", "cleanup"].includes(action ?? "")) throw Error("CREATE_OR_CLEANUP_REQUIRED");
const receipt = ".cache/us28-production-registry/fixtures-private.json";
const input = parseEnv(await readFile("apps/web/.env", "utf8"));
const preview = parseEnv(await readFile(".cache/us28-production-registry/preview.env", "utf8"));
// Vercel redacts Sensitive values when pulled. This script provisions locally on
// pinned Development, never through Preview sign-up. Browser sign-in to unique
// Development-only credentials subsequently proves the Preview database binding.
for (const raw of [input.SYNC_SOURCE_DATABASE_URL, ...(!/SENSITIVE/.test(preview.DATABASE_URL ?? "") ? [preview.DATABASE_URL] : [])]) {
  const url = new URL(raw!);
  if (!/^ep-purple-pond-b3xujb8o(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || url.pathname !== "/neondb") throw Error("PREVIEW_AND_FIXTURES_MUST_USE_DEVELOPMENT");
}
const url = new URL(input.SYNC_SOURCE_DATABASE_URL!); url.searchParams.set("sslmode", "verify-full");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
try {
  const identity = await db.$queryRawUnsafe<{ branch: string; endpoint: string; project: string }[]>(`SELECT current_setting('neon.project_id',true) project,current_setting('neon.branch_id',true) branch,current_setting('neon.endpoint_id',true) endpoint`);
  if (identity[0]?.project !== "summer-unit-95870477" || identity[0]?.branch !== "br-aged-hat-b3o6hg9p" || identity[0]?.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_METADATA_REQUIRED");
  if (action === "create") {
    const prefix = "us28-registry-" + randomUUID();
    const data = { prefix, branch: identity[0].branch, accounts: [] as { id: string; email: string; password: string; role: string }[], destinations: ["000-" + prefix + "-0", "000-" + prefix + "-1"], coordinateSources: [] as string[] };
    await writeFile(receipt, JSON.stringify(data), { flag: "wx" });
    const auth = createAuth({ BETTER_AUTH_URL: "http://localhost:3010", BETTER_AUTH_SECRET: randomUUID() + randomUUID() }, db as unknown as Database);
    for (const role of ["TRAVELER", "ADMIN"]) {
      const email = `${prefix}-${role.toLowerCase()}@example.invalid`, password = randomUUID() + "aA!9";
      const response = await auth.api.signUpEmail({ body: { name: "TEST US28 registry " + role, email, password }, headers: new Headers({ origin: "http://localhost:3010" }), asResponse: true });
      if (response.status !== 200) throw Error("TEST_SIGNUP_FAILED");
      const body = await response.json(); data.accounts.push({ id: body.user.id, email, password, role });
      await writeFile(receipt, JSON.stringify(data));
      if (role === "ADMIN") await db.user.update({ where: { id: body.user.id, email }, data: { role: "ADMIN" } });
    }
    const sources = await db.destination.findMany({ where: { id: { in: ["cmv97lcrq0016z09ws0o74lqp", "cmv9fcwo1000be89w3yxz3mqu"] }, visibility: "VISIBLE", locationVerified: true }, orderBy: { id: "asc" }, select: { id: true, latitude: true, longitude: true } });
    if (sources.length !== 2) throw Error("VERIFIED_COORDINATES_REQUIRED");
    data.coordinateSources = sources.map(s => s.id); await writeFile(receipt, JSON.stringify(data));
    for (const [index, source] of sources.entries()) await db.destination.create({ data: {
      id: data.destinations[index], name: "TEST " + prefix + " " + index, description: "Synthetic duration and hours for bounded functional E2E; not tourism facts.", area: "TEST", category: "TEST", latitude: source.latitude, longitude: source.longitude,
      visibility: "VISIBLE", locationVerified: true, locationEvidence: "TEST coordinates copied from " + source.id, suggestedDurationMinutes: 60, minimumDurationMinutes: 30,
      openingDays: { create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const).map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: { create: { opensAtMinute: 480, closesAtMinute: 1080 } } })) },
    } });
    console.log(JSON.stringify({ status: "TEST_FIXTURES_CREATED", branch: identity[0].branch, users: 2, destinations: 2, productionWrites: 0 }));
  } else {
    const data = JSON.parse(await readFile(receipt, "utf8"));
    if (data.branch !== identity[0].branch || !/^us28-registry-[a-f0-9-]{36}$/.test(data.prefix)) throw Error("OWNED_RECEIPT_REQUIRED");
    await db.destination.deleteMany({ where: { id: { in: data.destinations }, name: { startsWith: "TEST " + data.prefix } } });
    for (const account of data.accounts) {
      if (!account.email.startsWith(data.prefix + "-") || !account.email.endsWith("@example.invalid")) throw Error("OWNED_ACCOUNT_REQUIRED");
      await db.user.deleteMany({ where: { id: account.id, email: account.email } });
    }
    const users = await db.user.count({ where: { id: { in: data.accounts.map((a: { id: string }) => a.id) } } });
    const destinations = await db.destination.count({ where: { id: { in: data.destinations } } });
    await writeFile("docs/implementation/us28-production-registry-evidence/fixture-cleanup.json", JSON.stringify({ measuredAt: new Date().toISOString(), branch: identity[0].branch, remainingOwnedUsers: users, remainingOwnedDestinations: destinations, productionWrites: 0 }, null, 2) + "\n");
    data.cleanedAt = new Date().toISOString(); await writeFile(receipt, JSON.stringify(data));
    console.log(JSON.stringify({ status: "TEST_FIXTURES_CLEANED", users, destinations, productionWrites: 0 }));
  }
} finally { await db.$disconnect(); }

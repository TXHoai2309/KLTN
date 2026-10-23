// Local-only benchmark. Creates one disposable Traveler through real Better Auth
// and removes only that fixture in finally. Never target Production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../packages/db/prisma/generated/client";

const secrets = parseEnv(await readFile("apps/web/.env", "utf8"));
const url = new URL(secrets.DATABASE_URL!);
const development = new URL(secrets.SYNC_SOURCE_DATABASE_URL!);
if (!/^ep-purple-pond-b3xujb8o(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname)
  || url.hostname.replace("-pooler", "") !== development.hostname.replace("-pooler", "")
  || url.pathname !== "/neondb" || url.pathname !== development.pathname) throw Error("Pinned Development database required");
const base = "http://localhost:3010";
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url.toString(), max: 2 }) });
const email = `api-latency-${randomUUID()}@example.invalid`;
const password = randomUUID() + "aA!9";
let userId: string | undefined;
const observations: Array<{ variant: string; requests: number; ms: number }> = [];
try {
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ name: "Disposable API latency fixture", email, password }),
    signal: AbortSignal.timeout(20000), redirect: "error",
  });
  assert.equal(signup.status, 200);
  userId = (await signup.json()).user.id;
  const cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  const discovery = await fetch(`${base}/api/destinations`, { signal: AbortSignal.timeout(20000) });
  const ids: string[] = (await discovery.json()).data.items.slice(0, 9).map((item: { id: string }) => item.id);
  assert.ok(ids.length >= 2);
  async function get(path: string) {
    const response = await fetch(base + path, { headers: { cookie }, signal: AbortSignal.timeout(20000), redirect: "error" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return (await response.json()).data;
  }
  // Warm both delivery paths before the paired comparison.
  await get(`/api/favorites/status?targetType=destinations&targetId=${ids[0]}`);
  await get(`/api/favorites/status/batch?targetType=destinations&targetIds=${ids.join(",")}`);
  for (let sample = 0; sample < 4; sample++) {
    const variants = sample % 2 ? ["batch", "individual"] : ["individual", "batch"];
    for (const variant of variants) {
      const start = performance.now();
      const data = variant === "individual"
        ? await Promise.all(ids.map(id => get(`/api/favorites/status?targetType=destinations&targetId=${id}`)))
        : await get(`/api/favorites/status/batch?targetType=destinations&targetIds=${ids.join(",")}`);
      assert.deepEqual(data, ids.map(targetId => ({ targetType: "destinations", targetId, isFavorite: false, changed: false })));
      observations.push({ variant, requests: variant === "individual" ? ids.length : 1, ms: Math.round(performance.now() - start) });
    }
  }
  const report = { measuredAt: new Date().toISOString(), scope: "four alternating local paired samples; actual Better Auth + Development Neon; disposable empty Favorites; no Favorite mutations/provider calls; tiny sample, not field p95", targets: ids.length, observations };
  await mkdir(".cache/api-latency", { recursive: true });
  await writeFile(".cache/api-latency/favorite-paired.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  // A lost signup response is recoverable by this unique, freshly generated email.
  await db.user.deleteMany({ where: { ...(userId ? { id: userId } : {}), email } });
  await db.$disconnect();
  console.log(JSON.stringify({ disposableAccountRemoved: true }));
}

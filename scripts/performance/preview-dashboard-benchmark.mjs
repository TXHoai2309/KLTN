import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { safeOrigin, summarize } from "./metrics.mjs";
const [beforeInput, afterInput, envFile, output] = process.argv.slice(2);
const origins = [safeOrigin(beforeInput), safeOrigin(afterInput)];
if (origins.some(o => !/^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/.test(o))) throw Error("EXACT_PREVIEW_ORIGINS_REQUIRED");
const token = parseEnv(await readFile(envFile, "utf8")).VERCEL_OIDC_TOKEN;
const fixtures = JSON.parse(await readFile(".cache/performance-v3-test-accounts-private.json", "utf8"));
if (!token || fixtures.branch !== "br-aged-hat-b3o6hg9p" || fixtures.cleanedAt) throw Error("OWNED_DEVELOPMENT_FIXTURES_AND_OIDC_REQUIRED");
const observations = [];
for (const account of fixtures.accounts) {
  const cookies = [];
  for (const origin of origins) {
    const r = await fetch(origin + "/api/auth/sign-in/email", { method: "POST", headers: { origin, "x-vercel-trusted-oidc-idp-token": token, "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password: account.password }), redirect: "error" });
    if (!r.ok || (await r.json()).user?.id !== account.id) throw Error("REAL_FIXTURE_SIGN_IN_REQUIRED");
    cookies.push(r.headers.getSetCookie().map(c => c.split(";")[0]).join("; "));
  }
  for (let sample = 0; sample < 30; sample++) for (const variant of sample % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    const r = await fetch(origins[variant] + "/dashboard", { headers: { "x-vercel-trusted-oidc-idp-token": token, cookie: cookies[variant] }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    const ttfbMs = performance.now() - start, body = await r.text(), totalMs = performance.now() - start;
    const expectedName = `Performance V3 ${account.role}`, otherName = `Performance V3 ${account.role === "ADMIN" ? "TRAVELER" : "ADMIN"}`;
    const isolated = r.status === 200 && body.includes(expectedName) && !body.includes(otherName);
    observations.push({ role: account.role, variant: variant ? "sin1" : "iad1", sample, status: r.status, ttfbMs, totalMs, bytes: Buffer.byteLength(body), isolated, cacheControl: r.headers.get("cache-control") });
    if (!isolated) throw Error("AUTHENTICATED_DASHBOARD_ISOLATION_FAILED");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log(JSON.stringify({ role: account.role, completedEachVariant: 30 }));
}
const summary = fixtures.accounts.map(({ role }) => ({ role, variants: ["iad1", "sin1"].map(variant => { const rows = observations.filter(r => r.role === role && r.variant === variant); return { variant, totalMs: summarize(rows.map(r => r.totalMs)), ttfbMs: summarize(rows.map(r => r.ttfbMs)), isolationPass: rows.every(r => r.isolated) }; }) }));
await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), method: "Sequential alternating Preview GET; 30 samples/role/region; fresh synthetic Development principals; HTML read to completion; no field Web Vitals claim", productionWrites: 0, privateBodiesPersisted: false, observations, summary }, null, 2) + "\n");
console.log(JSON.stringify({ observations: observations.length, summary }));

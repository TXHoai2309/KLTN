import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { safeOrigin } from "./metrics.mjs";
const [input, envFile, output] = process.argv.slice(2), origin = safeOrigin(input);
if (!/^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/.test(origin)) throw Error("PREVIEW_REQUIRED");
const privatePath = ".cache/performance-v3-test-accounts-private.json";
const fixtures = JSON.parse(await readFile(privatePath, "utf8"));
if (fixtures.branch !== "br-aged-hat-b3o6hg9p" || fixtures.cleanedAt) throw Error("OWNED_DEVELOPMENT_FIXTURES_REQUIRED");
const account = fixtures.accounts.find(a => a.role === "ADMIN");
const token = parseEnv(await readFile(envFile, "utf8")).VERCEL_OIDC_TOKEN;
if (!token) throw Error("OIDC_REQUIRED");
const headers = { origin, "x-vercel-trusted-oidc-idp-token": token, "Content-Type": "application/json" };
const login = await fetch(origin + "/api/auth/sign-in/email", { method: "POST", headers, body: JSON.stringify({ email: account.email, password: account.password }), redirect: "error" });
if (!login.ok) throw Error(`FIXTURE_SIGNIN_HTTP_${login.status}`);
const signedIn = await login.json();
// Fresh random test credentials must resolve to the exact DEVELOPMENT-created
// principal before any CMS write. No existing Admin account is impersonated.
if (signedIn.user?.id !== account.id || signedIn.user?.role !== "ADMIN") throw Error("FIXTURE_ADMIN_IDENTITY_MISMATCH");
headers.cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
const report = { startedAt: new Date().toISOString(), origin, environment: "Preview with real Development-only synthetic Admin", productionWrites: 0, existingDestinationWrites: 0, mediaUploads: 0, openAiRequests: 0, checks: [] };
let id;
async function mutation(path, payload, key = "perf-v3-" + randomUUID()) {
  const pending = { origin, path, payload, key, method: id ? "PATCH" : "POST", state: "PENDING" };
  await writeFile(".cache/v3-cms-pending-private.json", JSON.stringify(pending, null, 2));
  const r = await fetch(origin + path, { method: pending.method, headers: { ...headers, "Idempotency-Key": key }, body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(25000) });
  const body = await r.json();
  pending.state = body.operationStatus ?? "UNKNOWN";
  await writeFile(".cache/v3-cms-pending-private.json", JSON.stringify(pending, null, 2));
  if (body.status === "UNKNOWN" || body.operationStatus === "UNKNOWN") throw Error("UNKNOWN_RECONCILE_WITH_IDENTICAL_KEY_BEFORE_CLEANUP");
  if (!r.ok || body.operationStatus !== "SUCCESS") throw Error(`CMS_MUTATION_HTTP_${r.status}_${body.error?.code ?? body.operationStatus ?? "INVALID_RESULT"}`);
  return body.data;
}
async function publicCheck(name, visible, expectedName) {
  const r = await fetch(origin + "/api/destinations", { headers: { "x-vercel-trusted-oidc-idp-token": token }, redirect: "error" });
  const data = await r.json(), row = data.data?.items?.find(i => i.id === id);
  const home = await (await fetch(origin + "/", { headers: { "x-vercel-trusted-oidc-idp-token": token }, redirect: "error" })).text();
  const pass = r.status === 200 && Boolean(row) === visible && (!visible || row.name === expectedName) && home.includes(expectedName) === visible;
  report.checks.push({ name, visible, pass });
  if (!pass) throw Error("CMS_PUBLIC_FRESHNESS_FAILED");
}
try {
  const name = "Performance V3 fixture " + randomUUID();
  const firstText = "Synthetic performance acceptance paragraph one.";
  const secondText = "Synthetic performance acceptance paragraph two.";
  const payload = { name, description: firstText + "\n\n" + secondText, area: "performance fixture", category: "nature", latitude: 23, longitude: 105, suggestedDurationMinutes: 60, minimumDurationMinutes: 30, openingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "UNKNOWN", intervals: [] })) };
  const created = await mutation("/api/admin/destinations", payload);
  id = created.id;
  if (!id || created.name !== name || created.visibility !== "HIDDEN") throw Error("OWNED_HIDDEN_FIXTURE_REQUIRED");
  fixtures.destinationIds = [...(fixtures.destinationIds ?? []), id];
  await writeFile(privatePath, JSON.stringify(fixtures, null, 2));
  await publicCheck("create-hidden", false, name);
  await mutation(`/api/admin/destinations/${id}/visibility`, { visibility: "VISIBLE" });
  await publicCheck("show-next-read", true, name);
  payload.name += " edited";
  await mutation(`/api/admin/destinations/${id}`, payload);
  await publicCheck("edit-next-read", true, payload.name);
  let revision = 0;
  const layout = text => ({ schemaVersion: 1, family: "NATURE_SHOWCASE", variant: "EDITORIAL", blocks: [{ id: "fixture-text", type: "TEXT_SECTION", text }] });
  for (const text of [firstText, secondText]) {
    const saved = await mutation(`/api/admin/destinations/${id}/editorial`, { action: "SAVE", expectedRevision: revision, layout: layout(text) });
    revision = saved.draftRevision;
    const published = await mutation(`/api/admin/destinations/${id}/editorial`, { action: "PUBLISH", expectedRevision: revision, reviewed: true });
    revision = published.draftRevision;
    report.checks.push({ name: `editorial-publish-${text === firstText ? 1 : 2}`, pass: published.published?.blocks?.[0]?.text === text });
  }
  const rolledBack = await mutation(`/api/admin/destinations/${id}/editorial`, { action: "ROLLBACK", expectedRevision: revision, reviewed: true });
  report.checks.push({ name: "editorial-rollback", pass: rolledBack.published?.blocks?.[0]?.text === firstText });
  await mutation(`/api/admin/destinations/${id}/visibility`, { visibility: "HIDDEN" });
  await publicCheck("hide-next-read", false, payload.name);
  report.status = report.checks.every(c => c.pass) ? "PASS_SYNTHETIC_FIXTURE_ONLY" : "FAIL";
} catch (e) { report.status = "FAIL"; report.errorCode = e.message.slice(0, 160); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report)); }

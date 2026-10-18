import { test } from "node:test";
import assert from "node:assert/strict";
import { expected, readInputs, preflight } from "./preflight-destination-production-sync.mjs";

const url = endpoint => `postgresql://fixture:fixture-only@${endpoint}.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full`;
const fixture = () => ({ SYNC_SOURCE_DATABASE_URL: url(expected.source.endpoint), SYNC_TARGET_DATABASE_URL: url(expected.target.endpoint), NEON_API_KEY: "fixture-api-only" });
const fetcher = async path => {
  const side = path.includes(expected.source.branch) || path.includes(expected.source.endpoint) ? "source" : "target";
  const pin = expected[side];
  if (path.endsWith("/databases")) return Response.json({ databases: [{ name: "neondb" }] });
  if (path.includes("/endpoints/")) return Response.json({ endpoint: { id: pin.endpoint, branch_id: pin.branch, host: `${pin.endpoint}.c-4.ap-southeast-1.aws.neon.tech` } });
  return Response.json({ branch: { id: pin.branch, project_id: expected.project } });
};
test("never infers either connection from DATABASE_URL", async () => {
  let calls = 0;
  await assert.rejects(preflight({ DATABASE_URL: url(expected.source.endpoint) }, async () => { calls++; }), /MISSING_INPUTS/);
  assert.equal(calls, 0);
});
test("requires both explicit URLs and a provider-verification credential", () => {
  for (const key of Object.keys(fixture())) { const env = fixture(); delete env[key]; assert.throws(() => readInputs(env), /MISSING_INPUTS/); }
});
test("rejects reversal and same-endpoint target before any I/O", () => {
  assert.throws(() => readInputs({ ...fixture(), SYNC_SOURCE_DATABASE_URL: fixture().SYNC_TARGET_DATABASE_URL, SYNC_TARGET_DATABASE_URL: fixture().SYNC_SOURCE_DATABASE_URL }), /UNEXPECTED_SOURCE_TARGET/);
  assert.throws(() => readInputs({ ...fixture(), SYNC_TARGET_DATABASE_URL: fixture().SYNC_SOURCE_DATABASE_URL }), /UNEXPECTED_TARGET_TARGET/);
});
test("rejects invalid protocol, database, host spoofing, port and non-TLS inputs", () => {
  for (const value of ["not-a-url", fixture().SYNC_SOURCE_DATABASE_URL.replace("postgresql:", "https:"), fixture().SYNC_SOURCE_DATABASE_URL.replace("/neondb", "/another"), fixture().SYNC_SOURCE_DATABASE_URL.replace("neon.tech", "neon.tech.evil.example"), fixture().SYNC_SOURCE_DATABASE_URL.replace("/neondb", ":5433/neondb"), fixture().SYNC_SOURCE_DATABASE_URL.replace("verify-full", "disable")]) assert.throws(() => readInputs({ ...fixture(), SYNC_SOURCE_DATABASE_URL: value }));
});
test("metadata mismatch fails closed even when URL matches", async () => {
  await assert.rejects(preflight(fixture(), async () => Response.json({ branch: { id: expected.source.branch, project_id: "other" } })), /IDENTITY_MISMATCH/);
});
test("403 metadata failure neither retries nor exposes credentials", async () => {
  let calls = 0;
  await assert.rejects(preflight(fixture(), async () => { calls++; return new Response("private provider details", { status: 403 }); }), /NEON_METADATA_HTTP_403/);
  assert.equal(calls, 1);
});
test("verified provider identity is still not SQL, backup or transfer success", async () => {
  const result = await preflight(fixture(), fetcher);
  assert.equal(result.identities.length, 2);
  assert.equal(result.databaseWrites, 0);
  assert.equal(result.databaseConnections, 0);
  assert.equal(result.transferImplemented, false);
  assert.equal(result.destinationProductionSync, "NOT_RUN");
  assert.doesNotMatch(JSON.stringify(result), /fixture-only|fixture-api-only|postgresql:/);
});

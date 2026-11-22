/** Opt-in live API acceptance against the approved Development DB only.
 * Run from apps/web with bundled Node --env-file=.env and an explicit --live.
 * Fixture credentials stay in ignored .cache; reports never contain them.
 * No environment, schema, destination or source-approval change is performed. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.argv.includes("--live")) throw Error("Explicit --live required");
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const folder = resolve(web, process.argv.includes("--hardening") ? "../../.cache/v207a-live" : "../../.cache/v207-live");
  await mkdir(folder, { recursive: true });
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (target.hostname.replace("-pooler", "").split(".")[0] !== "ep-purple-pond-b3xujb8o" || target.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
  const sql = neon(target.toString());
  const actual = await sql`SELECT current_setting('neon.endpoint_id',true) AS endpoint`;
  if (actual[0]?.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_IDENTITY_MISMATCH");
  const origin = "http://localhost:3010";
  const statePath = resolve(folder, "private-fixture.json");
  let state;
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* Own new fixture below. */ }
  if (process.argv.includes("--cleanup")) {
    if (!state?.userId || !/^v207-[a-f0-9-]+@example\.invalid$/u.test(state.email)) throw Error("OWNED_FIXTURE_REQUIRED");
    const owned = await sql`SELECT id FROM "user" WHERE id=${state.userId} AND email=${state.email}`;
    if (owned.length) await sql.transaction([
      sql`DELETE FROM qa_turn WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM qa_conversation WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM trip WHERE "userId"=${state.userId}`,
      sql`DELETE FROM idempotency_record WHERE strpos(scope,${JSON.stringify([state.userId]).slice(0, -1) + ","})=1`,
      sql`DELETE FROM "user" WHERE id=${state.userId} AND email=${state.email}`,
    ]);
    await writeFile(statePath, JSON.stringify({ cleaned: true }));
    console.info("V207_CLEANUP", JSON.stringify({ ownedFixtureOnly: true, deleted: owned.length }));
    return;
  }
  if (!state?.cookie) {
    const email = `v207-${randomUUID()}@example.invalid`, password = `V207-${randomUUID()}-Aa1!`;
    const response = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password, name: "V2-07 owned acceptance fixture" }) });
    const body = await response.json();
    if (!response.ok || !body.user?.id) throw Error("FIXTURE_SIGNUP_FAILED");
    state = { email, password, userId: body.user.id, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
    await writeFile(statePath, JSON.stringify(state));
  }
  const report = [];
  let stateToken = state.crossWorker?.stateToken;
  async function call(request, key = `v207-${randomUUID()}`) {
    if (request.operation !== "START") request = { ...request, stateToken };
    const started = Date.now();
    const response = await fetch(origin + "/api/ai/planning", { method: "POST", headers: { origin, cookie: state.cookie, "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(request), signal: AbortSignal.timeout(180_000) });
    const body = await response.json();
    if (body.data?.stateToken) stateToken = body.data.stateToken;
    if (body.data) delete body.data.stateToken;
    report.push({ operation: request.operation, httpStatus: response.status, runtime: response.headers.get("x-assistant-runtime"), elapsedMs: Date.now() - started, ...body });
    await writeFile(resolve(folder, "api-results.json"), JSON.stringify(report, null, 2));
    console.info("V207_API", JSON.stringify({ operation: request.operation, httpStatus: response.status, goal: body.data?.turn?.responsePlan?.goal ?? body.data?.turn?.plan?.goal, code: body.error?.code }));
    if (!response.ok || !body.success) throw Error("CONTROLLED_API_FAILURE");
    return body.data;
  }
  if (process.argv.includes("--cross-b")) {
    if (!state.crossWorker?.sessionId || !stateToken) throw Error("WORKER_A_RECEIPT_REQUIRED");
    const sessionId = state.crossWorker.sessionId;
    const draft = await call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Ô tô." });
    if (draft.turn?.responsePlan?.goal !== "PRESENT_PROPOSAL") throw Error("CROSS_WORKER_DRAFT_FAILED");
    const refinement = await call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Mình thích văn hóa hơn." });
    if (!refinement.turn?.generated) throw Error("CROSS_WORKER_REFINEMENT_FAILED");
    delete state.crossWorker; await writeFile(statePath, JSON.stringify(state));
    console.info("V207A_CROSS_WORKER", JSON.stringify({ minimumBrief: true, refinement: true, explicitSaveOnly: true }));
    return;
  }
  const { sessionId } = await call({ action: "ASSISTANT_V2", operation: "START" });
  if (process.argv.includes("--cross-a")) {
    const result = await call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "2 ngày." });
    if (result.turn?.responsePlan?.goal !== "ASK_TRANSPORT") throw Error("WORKER_A_INTAKE_FAILED");
    state.crossWorker = { sessionId, stateToken };
    await writeFile(statePath, JSON.stringify(state));
    console.info("V207A_WORKER_A_READY");
    return;
  }
  for (const text of ["Tôi muốn đi Hà Giang.", "2 ngày.", "Ô tô.", "Mình thích trải nghiệm văn hóa hơn.", "Đi vừa phải thôi.", "Cao nguyên đá Đồng Văn được UNESCO công nhận khi nào?", "Có tài liệu xác minh mã vé thử nghiệm V207-UNKNOWN-RECORD không?"]) {
    await call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text });
  }
  console.info("V207_API_REPORT", JSON.stringify({ requests: report.length, report: ".cache/v207-live/api-results.json", browserAccepted: false }));
}
main().catch(error => { console.error("V207_LIVE_BLOCKED", error?.message && /^[A-Z_ ]+$/u.test(error.message) ? error.message : "ENVIRONMENT_OR_SERVICE_FAILURE"); process.exitCode = 1; });

/** Opt-in V2-09 live closure against the approved Development DB only.
 * Run from apps/web: node --env-file=.env scripts/assistant-v2-09-live.mjs --live [--cleanup]
 * Step 1 is a read-only SELECT of destination areas; then one owned disposable user drives
 * /api/ai/planning on localhost:3010. Reports go to ../../.cache/v209-live (ignored); no
 * credentials are written to the report. No environment, schema or data change is performed. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const LODGING = /khách sạn|homestay|đặt phòng|giá phòng|còn phòng|nhà nghỉ/i;
/** A sentence that says lodging data is unavailable is the honest disclaimer, not a fabrication. */
const withoutDisclaimers = text => (text ?? "").replace(/[^.]*(?:chưa|không) (?:có dữ liệu|phải)[^.]*\./gi, "");
const REASK = /mấy ngày|bao nhiêu ngày|ô tô hay xe máy|phương tiện nào/;
async function main() {
  if (!process.argv.includes("--live")) throw Error("Explicit --live required");
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const folder = resolve(web, "../../.cache/v209-live");
  await mkdir(folder, { recursive: true });
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (target.hostname.replace("-pooler", "").split(".")[0] !== "ep-purple-pond-b3xujb8o" || target.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
  const sql = neon(target.toString());
  const actual = await sql`SELECT current_setting('neon.endpoint_id',true) AS endpoint`;
  if (actual[0]?.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_IDENTITY_MISMATCH");
  const origin = "http://localhost:3010";
  const statePath = resolve(folder, "private-fixture.json");
  let state;
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* new fixture below */ }
  if (process.argv.includes("--cleanup")) {
    if (!state?.userId || !/^v209-[a-f0-9-]+@example\.invalid$/u.test(state.email)) throw Error("OWNED_FIXTURE_REQUIRED");
    const owned = await sql`SELECT id FROM "user" WHERE id=${state.userId} AND email=${state.email}`;
    if (owned.length) await sql.transaction([
      sql`DELETE FROM qa_turn WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM qa_conversation WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM trip WHERE "userId"=${state.userId}`,
      sql`DELETE FROM idempotency_record WHERE strpos(scope,${JSON.stringify([state.userId]).slice(0, -1) + ","})=1`,
      sql`DELETE FROM "user" WHERE id=${state.userId} AND email=${state.email}`,
    ]);
    await writeFile(statePath, JSON.stringify({ cleaned: true }));
    console.info("V209_CLEANUP", JSON.stringify({ ownedFixtureOnly: true, deleted: owned.length }));
    return;
  }

  // Read-only: which areas can an overnight be grounded in?
  const areaRows = await sql`SELECT area, count(*)::int AS n FROM destination WHERE visibility='VISIBLE' AND "deletedAt" IS NULL GROUP BY area ORDER BY n DESC`;
  const areas = areaRows.map(row => ({ area: row.area, destinations: row.n }));
  console.info("V209_AREAS", JSON.stringify(areas));

  if (!state?.cookie) {
    const email = `v209-${randomUUID()}@example.invalid`, password = `V209-${randomUUID()}-Aa1!`;
    const response = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password, name: "V2-09 owned acceptance fixture" }) });
    const body = await response.json();
    if (!response.ok || !body.user?.id) throw Error("FIXTURE_SIGNUP_FAILED");
    state = { email, password, userId: body.user.id, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
    await writeFile(statePath, JSON.stringify(state));
  }

  const report = [], failures = [];
  let stateToken, sessionId, last = null;
  async function call(request, key = `v209-${randomUUID()}`) {
    if (request.operation !== "START") request = { ...request, stateToken, sessionId };
    const started = Date.now();
    const response = await fetch(origin + "/api/ai/planning", { method: "POST", headers: { origin, cookie: state.cookie, "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(request), signal: AbortSignal.timeout(180_000) });
    const body = await response.json();
    if (response.headers.get("x-assistant-runtime") !== "v2") throw Error("RUNTIME_NOT_V2");
    if (body.data?.stateToken) stateToken = body.data.stateToken;
    if (body.data?.sessionId) sessionId = body.data.sessionId;
    return { status: response.status, ok: response.ok && body.success, elapsedMs: Date.now() - started, error: body.error?.code, turn: body.data?.turn };
  }
  async function newSession() { stateToken = undefined; sessionId = undefined; last = null; const started = await call({ action: "ASSISTANT_V2", operation: "START" }); if (!started.ok) throw Error("START_FAILED"); }
  const summary = turn => !turn ? null : {
    goal: turn.responsePlan?.goal, failureCode: turn.responsePlan?.failureCode ?? null, dropped: turn.responsePlan?.overnightPreferenceDropped ?? null, proposalChanged: turn.responsePlan?.proposalChanged ?? null, clarificationField: turn.responsePlan?.clarificationField ?? null,
    workspaceVersion: turn.workspace?.version, proposalVersion: turn.generated?.version ?? null, proposalId: turn.generated?.proposal?.proposalId ?? null,
    needs: { durationDays: turn.latestNeeds?.requirement?.durationDays ?? null, transport: turn.latestNeeds?.requirement?.transport ?? null, tripStructure: turn.latestNeeds?.tripStructure ?? null },
    stops: turn.generated?.proposal?.days?.map(d => d.stops.map(s => `${s.destination.name} [${s.destination.area}]`)) ?? null,
    overnights: turn.responsePlan?.guidance?.overnights ?? null, overnightUnmet: turn.generated?.overnightUnmet ?? null,
    stopCounts: turn.responsePlan?.guidance?.days?.map(d => d.stopCount) ?? null,
  };
  async function step(label, text, expect) {
    const result = await call({ action: "ASSISTANT_V2", operation: "TURN", text });
    const s = result.turn ? summary(result.turn) : null, message = result.turn?.message ?? null;
    const problems = [];
    if (!result.ok) problems.push(`HTTP ${result.status} ${result.error ?? ""}`);
    else { const issue = expect?.(s, message, last); if (issue) problems.push(issue); if (LODGING.test(withoutDisclaimers(message))) problems.push("LODGING_WORDING"); }
    report.push({ label, text, ...s, elapsedMs: result.elapsedMs, message, pass: !problems.length, problems });
    console.info("V209_STEP", JSON.stringify({ label, goal: s?.goal, pass: !problems.length, problems, ms: result.elapsedMs }));
    await writeFile(resolve(folder, "results.json"), JSON.stringify({ areas, report }, null, 2));
    if (!problems.length) { if (s) last = s; } else failures.push(label);
    return { s, message, ok: result.ok };
  }
  const nothingChanged = (s, prev) => prev && (s.workspaceVersion !== prev.workspaceVersion || s.proposalVersion !== prev.proposalVersion || s.proposalId !== prev.proposalId) ? "PROPOSAL_OR_VERSION_CHANGED" : null;

  // §31 required scenario
  await newSession();
  let built = await step("A1 all-in-one", "lên hành trình đi Hà Giang 2 ngày 1 đêm bằng xe máy", (s, m) =>
    ["PRESENT_PROPOSAL", "PROPOSAL_FAILED"].includes(s.goal) ? (s.needs.durationDays !== 2 ? `duration ${s.needs.durationDays}` : s.needs.transport !== "MOTORCYCLE" ? `transport ${s.needs.transport}` : s.needs.tripStructure?.overnightCount !== 1 ? `nights ${JSON.stringify(s.needs.tripStructure)}` : REASK.test(m) ? "REASKED_BRIEF" : null) : `goal ${s.goal}`);
  for (let attempt = 0; attempt < 2 && built.s?.goal === "PROPOSAL_FAILED"; attempt++) built = await step(`A1 retry ${attempt + 1}`, "thử lại", s => ["PRESENT_PROPOSAL", "PROPOSAL_FAILED"].includes(s.goal) ? null : `goal ${s.goal}`);
  if (built.s?.goal === "PRESENT_PROPOSAL") {
    report.push({ label: "A1 explains nights", pass: /1 đêm/.test(built.message) && /nghỉ đêm/.test(built.message), problems: /1 đêm/.test(built.message) && /nghỉ đêm/.test(built.message) ? [] : ["PROPOSAL_DOES_NOT_STATE_NIGHT_AREA"], message: built.message });
    if (!/1 đêm/.test(built.message) || !/nghỉ đêm/.test(built.message)) failures.push("A1 explains nights");

    await step("A2 advice", "đêm đầu nên nghỉ đâu?", (s, m, prev) => s.goal !== "PLANNING_GUIDANCE" ? `goal ${s.goal}` : nothingChanged(s, prev) ?? (s.proposalChanged !== false ? "proposalChanged" : null));
    await step("A3 advice 2", "2 ngày 1 đêm lịch này có gấp quá không?", (s, m, prev) => s.goal !== "PLANNING_GUIDANCE" ? `goal ${s.goal}` : nothingChanged(s, prev));

    // §31 change: pick a known area different from where day 1 ends, if the data has one.
    const current = built.s.overnights?.[0]?.area ?? null;
    const other = areas.find(item => item.area !== current && !/^khu vực/.test(item.area))?.area ?? null;
    if (other) {
      const change = await step("A4 change area", `tôi muốn ngủ ${other}`, (s, m, prev) => s.goal === "REFINE_PROPOSAL" || s.goal === "REFINEMENT_FAILED" ? (s.goal === "REFINE_PROPOSAL" && s.proposalVersion !== prev.proposalVersion + 1 ? "NO_NEW_VERSION" : null) : `goal ${s.goal}`);
      const o = change.s?.overnights?.[0];
      report.push({ label: "A4 outcome", area: other, satisfied: o?.area === other, unmet: change.s?.overnightUnmet ?? null, message: change.message, pass: true, problems: [] });
      console.info("V209_A4_OUTCOME", JSON.stringify({ wanted: other, actual: o?.area ?? null, unmet: change.s?.overnightUnmet ?? null, honest: o?.area === other || /chưa xếp được|chưa dựng được lịch với nơi nghỉ đêm/.test(change.message ?? "") }));
      if (o?.area !== other && !/chưa xếp được|chưa dựng được lịch với nơi nghỉ đêm/.test(change.message ?? "")) failures.push("A4 not honest about unmet area");
      await step("A5 regenerate keeps nights", "lập lại lịch cho tôi", (s, m) => s.goal !== "REFINE_PROPOSAL" ? `goal ${s.goal}` : !s.needs.tripStructure?.overnightCount ? "NIGHTS_LOST" : REASK.test(m) ? "REASKED_BRIEF" : null);
      // A preference that cannot be built must not poison the next rebuild.
      const generic = areas.find(item => /^khu vực/.test(item.area))?.area;
      if (generic) {
        const attempt = await step("A8 generic area", `tôi muốn ngủ ${generic}`, (s) => ["REFINE_PROPOSAL", "REFINEMENT_FAILED"].includes(s.goal) ? null : `goal ${s.goal}`);
        console.info("V209_A8_OUTCOME", JSON.stringify({ goal: attempt.s?.goal, failureCode: report.at(-1)?.failureCode ?? null, structure: attempt.s?.needs.tripStructure ?? null }));
        await step("A9 rebuild after A8", "lập lại lịch cho tôi", (s, m) => s.goal !== "REFINE_PROPOSAL" ? `goal ${s.goal}` : REASK.test(m) ? "REASKED_BRIEF" : null);
      }
    } else console.info("V209_A4_SKIPPED", "only one area in data");
    await step("A6 unknown area", "tôi muốn ngủ Sapa", (s, m, prev) => s.goal === "CLARIFY" && s.clarificationField === "tripStructure" ? null : `goal ${s.goal}/${s.clarificationField}`);
    await step("A7 homestay request", "tìm homestay ở Đồng Văn cho tôi", (s) => s.goal.startsWith("QA_") ? null : `goal ${s.goal}`);
  }

  // consistency, days-only, night-bus (fresh sessions)
  await newSession();
  await step("B1 inconsistent", "đi Hà Giang 2 ngày 5 đêm bằng xe máy", (s) => s.goal === "CLARIFY" && s.clarificationField === "tripStructure" ? null : `goal ${s.goal}/${s.clarificationField}`);
  await newSession();
  await step("B2 days only", "đi Hà Giang 2 ngày", (s) => s.goal === "ASK_TRANSPORT" && !s.needs.tripStructure ? null : `goal ${s.goal} structure ${JSON.stringify(s.needs.tripStructure)}`);
  await newSession();
  const nightBus = await step("B3 night bus is not a stay-night", "đi xe giường nằm đêm từ Hà Nội lên Hà Giang, ở Hà Giang 2 ngày bằng xe máy", (s) => s.needs.tripStructure?.overnightCount ? `COUNTED_NIGHT_BUS ${JSON.stringify(s.needs.tripStructure)}` : null);
  console.info("V209_B3_OBSERVATION", JSON.stringify({ goal: nightBus.s?.goal, tripStructure: nightBus.s?.needs.tripStructure ?? null }));
  const metrics = { steps: report.filter(r => r.goal !== undefined).length, failures };
  await writeFile(resolve(folder, "results.json"), JSON.stringify({ areas, metrics, report }, null, 2));
  console.info("V209_LIVE_REPORT", JSON.stringify(metrics));
}
main().catch(error => { console.error("V209_LIVE_BLOCKED", error?.message && /^[A-Z_ ]+$/u.test(error.message) ? error.message : "ENVIRONMENT_OR_SERVICE_FAILURE"); process.exitCode = 1; });

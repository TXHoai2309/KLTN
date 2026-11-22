/** Opt-in V2-08 live closure against the approved Development DB only.
 * Run from apps/web: node --env-file=.env scripts/assistant-v2-08-live.mjs --live [--cleanup]
 * Creates one owned disposable user, drives /api/ai/planning on localhost:3010, writes
 * a report to ../../.cache/v208-live (ignored) and never stores credentials in the report.
 * No environment, schema, destination or source-approval change is performed. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const BAD_QUESTION = /Bạn muốn điều chỉnh cụ thể điều gì/;
async function main() {
  if (!process.argv.includes("--live")) throw Error("Explicit --live required");
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const folder = resolve(web, "../../.cache/v208-live");
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
    if (!state?.userId || !/^v208-[a-f0-9-]+@example\.invalid$/u.test(state.email)) throw Error("OWNED_FIXTURE_REQUIRED");
    const owned = await sql`SELECT id FROM "user" WHERE id=${state.userId} AND email=${state.email}`;
    if (owned.length) await sql.transaction([
      sql`DELETE FROM qa_turn WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM qa_conversation WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM trip WHERE "userId"=${state.userId}`,
      sql`DELETE FROM idempotency_record WHERE strpos(scope,${JSON.stringify([state.userId]).slice(0, -1) + ","})=1`,
      sql`DELETE FROM "user" WHERE id=${state.userId} AND email=${state.email}`,
    ]);
    await writeFile(statePath, JSON.stringify({ cleaned: true }));
    console.info("V208_CLEANUP", JSON.stringify({ ownedFixtureOnly: true, deleted: owned.length }));
    return;
  }
  if (!state?.cookie) {
    const email = `v208-${randomUUID()}@example.invalid`, password = `V208-${randomUUID()}-Aa1!`;
    const response = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password, name: "V2-08 owned acceptance fixture" }) });
    const body = await response.json();
    if (!response.ok || !body.user?.id) throw Error("FIXTURE_SIGNUP_FAILED");
    state = { email, password, userId: body.user.id, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
    await writeFile(statePath, JSON.stringify(state));
  }

  const report = [];
  let stateToken, sessionId, last = null;
  async function call(request, key = `v208-${randomUUID()}`) {
    if (request.operation !== "START") request = { ...request, stateToken, sessionId };
    const started = Date.now();
    const response = await fetch(origin + "/api/ai/planning", { method: "POST", headers: { origin, cookie: state.cookie, "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(request), signal: AbortSignal.timeout(180_000) });
    const body = await response.json();
    if (response.headers.get("x-assistant-runtime") !== "v2") throw Error("RUNTIME_NOT_V2");
    if (body.data?.stateToken) stateToken = body.data.stateToken;
    if (body.data?.sessionId) sessionId = body.data.sessionId;
    return { status: response.status, ok: response.ok && body.success, elapsedMs: Date.now() - started, error: body.error?.code, turn: body.data?.turn };
  }
  const summary = turn => !turn ? null : {
    goal: turn.responsePlan?.goal, proposalChanged: turn.responsePlan?.proposalChanged ?? null, outcome: turn.responsePlan?.refinementOutcome ?? null,
    replanCode: turn.responsePlan?.replanCode ?? null, failureCode: turn.responsePlan?.failureCode ?? null,
    workspaceVersion: turn.workspace?.version, proposalVersion: turn.generated?.version ?? null, proposalId: turn.generated?.proposal?.proposalId ?? null,
    stops: turn.generated?.proposal?.days?.map(d => d.stops.map(s => s.destination.name)) ?? null,
    needs: { durationDays: turn.latestNeeds?.requirement?.durationDays ?? null, transport: turn.latestNeeds?.requirement?.transport ?? null },
    guidanceSignals: turn.responsePlan?.guidance?.signals?.map(s => s.code) ?? null, uncertain: !!turn.uncertain,
  };
  const failures = [];
  async function step(label, text, expect) {
    const result = await call({ action: "ASSISTANT_V2", operation: "TURN", text });
    const s = result.turn ? summary(result.turn) : null;
    const problems = [];
    if (!result.ok) problems.push(`HTTP ${result.status} ${result.error ?? ""}`);
    else if (expect) { const issue = expect(s, result.turn, last); if (issue) problems.push(issue); }
    if (result.turn && BAD_QUESTION.test(result.turn.message ?? "")) problems.push("FIXED_ADJUST_QUESTION_RETURNED");
    report.push({ label, text, ...s, elapsedMs: result.elapsedMs, message: result.turn?.message ?? null, pass: !problems.length, problems });
    console.info("V208_STEP", JSON.stringify({ label, goal: s?.goal, pass: !problems.length, problems, ms: result.elapsedMs }));
    await writeFile(resolve(folder, "results.json"), JSON.stringify(report, null, 2));
    if (!problems.length) { if (result.turn) last = s; } else failures.push(label);
    return { s, turn: result.turn, ok: result.ok };
  }
  const guidance = (label, text) => step(label, text, (s, turn, prev) => {
    if (s.goal !== "PLANNING_GUIDANCE") return `goal ${s.goal}`;
    if (prev && (s.workspaceVersion !== prev.workspaceVersion || s.proposalVersion !== prev.proposalVersion || s.proposalId !== prev.proposalId)) return "PROPOSAL_OR_VERSION_CHANGED";
    if (s.proposalChanged !== false) return "proposalChanged_not_false";
    return null;
  });

  const started = await call({ action: "ASSISTANT_V2", operation: "START" });
  if (!started.ok) throw Error("START_FAILED");

  // 4. original bug flow
  await step("A1 start", "lập hành trình đi hà giang", s => s.goal === "ASK_DURATION" ? null : `goal ${s.goal}`);
  await step("A2 duration", "2 ngày", s => s.goal === "ASK_TRANSPORT" ? null : `goal ${s.goal}`);
  let proposal = await step("A3 transport", "xe máy", s => ["PRESENT_PROPOSAL", "PROPOSAL_FAILED"].includes(s.goal) ? null : `goal ${s.goal}`);
  for (let attempt = 0; attempt < 2 && proposal.s?.goal === "PROPOSAL_FAILED"; attempt++) proposal = await step(`A3 retry ${attempt + 1}`, "thử lại", s => ["PRESENT_PROPOSAL", "PROPOSAL_FAILED"].includes(s.goal) ? null : `goal ${s.goal}`);
  if (proposal.s?.goal !== "PRESENT_PROPOSAL") { await finish(); return; }

  // 2. guidance cases (proposal already exists)
  await guidance("G1 original bug", "gợi ý cho tôi nên đi như nào");
  await guidance("G2", "theo bạn lịch này ổn chưa");
  await guidance("G3", "đi vậy có mệt không");
  await guidance("G4", "nếu đi chậm thì sao");
  await guidance("G5", "có nên thêm điểm nào nữa không");

  // 2. contrast: preference, then QA, then QA -> guidance
  await step("P1 preference", "mình thích văn hóa hơn", s => ["REFINE_PROPOSAL", "ACKNOWLEDGE_NO_CHANGE", "REFINEMENT_FAILED"].includes(s.goal) ? null : `goal ${s.goal}`);
  await step("Q1 qa", "Dinh họ Vương xây năm nào?", (s, turn, prev) => !s.goal.startsWith("QA_") ? `goal ${s.goal}` : (s.proposalVersion !== prev.proposalVersion ? "PROPOSAL_VERSION_CHANGED_BY_QA" : null));
  await guidance("Q2 qa->guidance", "thế lịch hiện tại nên đi như nào?");

  // 7. replanning contrast then guidance reads the new proposal
  const before = last;
  const edit = await step("E1 edit", "bỏ Lũng Cú đi", (s, turn, prev) => s.goal.startsWith("REPLAN_") ? null : `goal ${s.goal}`);
  const removed = edit.s?.goal === "REPLAN_PROPOSAL";
  const g2 = await guidance("E2 replan->guidance", "lịch mới này ổn không?");
  if (removed && g2.turn) {
    const names = (g2.turn.responsePlan?.guidance?.days ?? []).flatMap(d => d.stops);
    const stale = names.some(n => /Lũng Cú/.test(n));
    report.push({ label: "E2 reads latest", pass: !stale, problems: stale ? ["GUIDANCE_STILL_LISTS_REMOVED_STOP"] : [], before: before?.stops ?? null, after: names });
    if (stale) failures.push("E2 reads latest");
  }

  // 5. context reuse
  await step("C1 regenerate", "lập lại lịch cho tôi", (s, turn, prev) => {
    if (s.goal !== "REFINE_PROPOSAL") return `goal ${s.goal}`;
    if (/mấy ngày|ô tô hay xe máy|bao nhiêu ngày/.test(turn.message ?? "")) return "ASKED_KNOWN_BRIEF_AGAIN";
    return null;
  });
  await step("C2 correction", "thực ra mình đi ô tô", (s) => s.needs.transport === "CAR" ? null : `transport ${s.needs.transport}`);

  // 8. pending clarification -> guidance -> resume
  const ask = await step("M1 pending", "thêm Cột cờ Lũng Cú", s => ["REPLAN_CLARIFY", "REPLAN_PROPOSAL"].includes(s.goal) ? null : `goal ${s.goal}`);
  if (ask.s?.goal === "REPLAN_CLARIFY") {
    await guidance("M2 guidance while pending", "lịch hiện tại có mệt không");
    await step("M3 resume", "ngày 2", s => s.goal.startsWith("REPLAN_") ? null : `goal ${s.goal}`);
  }
  await finish();

  async function finish() {
    const guidanceSteps = report.filter(r => /^(G|Q2|E2 replan|M2)/.test(r.label) && r.goal);
    const metrics = { steps: report.length, failures, guidanceTurns: guidanceSteps.length,
      guidanceMutations: guidanceSteps.filter(r => r.problems?.includes("PROPOSAL_OR_VERSION_CHANGED")).length,
      fixedQuestionReturned: report.filter(r => r.problems?.includes("FIXED_ADJUST_QUESTION_RETURNED")).length };
    await writeFile(resolve(folder, "results.json"), JSON.stringify({ metrics, report }, null, 2));
    console.info("V208_LIVE_REPORT", JSON.stringify(metrics));
  }
}
main().catch(error => { console.error("V208_LIVE_BLOCKED", error?.message && /^[A-Z_ ]+$/u.test(error.message) ? error.message : "ENVIRONMENT_OR_SERVICE_FAILURE"); process.exitCode = 1; });

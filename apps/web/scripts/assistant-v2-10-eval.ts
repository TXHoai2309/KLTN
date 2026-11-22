/** Opt-in V2-10 final evaluation against the approved Development DB only.
 * Run from apps/web: npx tsx --env-file=.env scripts/assistant-v2-10-eval.ts --live [--only S01,S02] [--cleanup]
 * Drives /api/ai/planning on localhost:3010 with one owned disposable user: live V2 conversations (mode "live"),
 * paired V1 runs (mode "v1pair"). Controlled scenarios are covered by the vitest suite. Reports go to
 * ../../.cache/v210-eval (ignored); credentials never enter a report. No environment, schema or data change. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { scoreTranscript, type EvalTurn } from "../src/modules/assistant-agent-v2/eval-metrics";

type Scenario = { id: string; mode: "live" | "v1pair" | "controlled"; title: string; turns?: string[]; expected: string };
type Api = { status: number; ok: boolean; error?: string; data?: any; ms: number };
const origin = process.env.EVAL_ORIGIN ?? "http://localhost:3010";
const EMPTY_NEEDS = { requirement: {}, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} };

async function main() {
  if (!process.argv.includes("--live")) throw Error("Explicit --live required");
  const arg = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))?.split("=")[1];
  const only = arg("only")?.split(",");
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const folder = resolve(web, "../../.cache/v210-eval");
  await mkdir(folder, { recursive: true });
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (target.hostname.replace("-pooler", "").split(".")[0] !== "ep-purple-pond-b3xujb8o" || target.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
  const sql = neon(target.toString());
  const actual = await sql`SELECT current_setting('neon.endpoint_id',true) AS endpoint`;
  if (actual[0]?.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_IDENTITY_MISMATCH");
  const statePath = resolve(folder, "private-fixture.json");
  let state: any;
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* new fixture below */ }
  if (process.argv.includes("--cleanup")) {
    if (!state?.userId || !/^v210-[a-f0-9-]+@example\.invalid$/u.test(state.email)) throw Error("OWNED_FIXTURE_REQUIRED");
    const owned = await sql`SELECT id FROM "user" WHERE id=${state.userId} AND email=${state.email}`;
    if (owned.length) await sql.transaction([
      sql`DELETE FROM qa_turn WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM qa_conversation WHERE "principalKind"='USER' AND "principalId"=${state.userId}`,
      sql`DELETE FROM trip WHERE "userId"=${state.userId}`,
      sql`DELETE FROM idempotency_record WHERE strpos(scope,${JSON.stringify([state.userId]).slice(0, -1) + ","})=1`,
      sql`DELETE FROM "user" WHERE id=${state.userId} AND email=${state.email}`,
    ]);
    await writeFile(statePath, JSON.stringify({ cleaned: true }));
    console.info("V210_CLEANUP", JSON.stringify({ ownedFixtureOnly: true, deleted: owned.length }));
    return;
  }
  if (!state?.cookie) {
    const email = `v210-${randomUUID()}@example.invalid`, password = `V210-${randomUUID()}-Aa1!`;
    const response = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password, name: "V2-10 owned acceptance fixture" }) });
    const body = await response.json() as any;
    if (!response.ok || !body.user?.id) throw Error("FIXTURE_SIGNUP_FAILED");
    state = { email, password, userId: body.user.id, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
    await writeFile(statePath, JSON.stringify(state));
  }

  async function post(request: Record<string, unknown>): Promise<Api> {
    const started = Date.now();
    const response = await fetch(origin + "/api/ai/planning", { method: "POST", headers: { origin, cookie: state.cookie, "content-type": "application/json", "Idempotency-Key": `v210-${randomUUID()}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(180_000) });
    const body = await response.json() as any;
    return { status: response.status, ok: response.ok && body.success, error: body.error?.code, data: body.data, ms: Date.now() - started };
  }

  // ---------------- V2 conversation ----------------
  const v2 = () => {
    let stateToken: string | undefined, sessionId: string | undefined;
    const call = async (request: Record<string, unknown>) => {
      const result = await post(request.operation === "START" ? request : { ...request, stateToken, sessionId });
      if (result.data?.stateToken) stateToken = result.data.stateToken;
      if (result.data?.sessionId) sessionId = result.data.sessionId;
      return result;
    };
    return {
      start: (extra: Record<string, unknown> = {}) => call({ action: "ASSISTANT_V2", operation: "START", ...extra }),
      turn: (text: string) => call({ action: "ASSISTANT_V2", operation: "TURN", text }),
      save: () => call({ action: "ASSISTANT_V2", operation: "SAVE", confirmed: true }),
    };
  };
  const summarize = (user: string, api: Api): EvalTurn & { ms: number; error?: string; status: string | null; failureCode?: string | null } => {
    const turn = api.data?.turn;
    const goal = turn?.responsePlan?.goal ?? turn?.plan?.goal ?? (api.ok ? "UNKNOWN_GOAL" : "HTTP_ERROR");
    return {
      user, reply: turn?.message ?? "", goal, proposalVersion: turn?.generated?.version ?? null, proposalId: turn?.generated?.proposal?.proposalId ?? null,
      known: { durationDays: turn?.latestNeeds?.requirement?.durationDays ?? null, transport: turn?.latestNeeds?.requirement?.transport ?? null },
      ms: api.ms, error: api.ok ? undefined : api.error, status: turn?.generated?.proposal?.status ?? null, failureCode: turn?.responsePlan?.failureCode ?? turn?.responsePlan?.replanCode ?? null,
    };
  };
  async function runV2(turns: string[]) {
    const client = v2(); const started = await client.start();
    if (!started.ok) throw Error("START_FAILED");
    const out: ReturnType<typeof summarize>[] = [];
    for (const text of turns) {
      let api = await client.turn(text), said = text;
      if (api.ok && api.data?.turn?.responsePlan?.goal === "PROPOSAL_FAILED") { out.push(summarize(text, api)); api = await client.turn("thử lại"); said = "thử lại"; }
      out.push(summarize(said, api));
      if (!api.ok) break;
    }
    return out;
  }

  // ---------------- V1 conversation (existing contracts, unchanged) ----------------
  const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
  async function v1post(request: Record<string, unknown>): Promise<Api> {
    for (let attempt = 0; ; attempt++) {
      await sleep(attempt === 0 ? 4_000 : 25_000);
      const api = await post(request);
      if (api.error !== "RATE_LIMITED" || attempt >= 3) return api;
    }
  }
  async function runV1(turns: string[]) {
    const started = await v1post({ action: "START", conversationId: null, context: { type: "GENERAL" } });
    if (!started.ok) throw Error("V1_START_FAILED");
    let { conversationId, version } = started.data, needs: any = EMPTY_NEEDS, last = "", selection: any = null, proposalVersion: number | null = null, proposalId: string | null = null;
    const out: EvalTurn[] = [];
    const fieldOf = (message: string) => /mấy ngày/.test(message) ? "durationDays" : /ô tô hay xe máy|phương tiện/.test(message) ? "transport" : /khởi hành|ngày nào/.test(message) ? "startDate" : null;
    const known = () => ({ durationDays: needs.requirement?.durationDays ?? null, transport: needs.requirement?.transport ?? null });
    async function analyze(text: string) {
      const api = await v1post({ action: "ANALYZE", conversationId, version, text, draft: needs, unresolved: [], dialogue: { question: last, field: fieldOf(last), recent: [], current: selection ? { days: selection.days } : null } });
      if (!api.ok) { out.push({ user: text, reply: `[HTTP ${api.status} ${api.error}]`, goal: "HTTP_ERROR", proposalVersion, proposalId, known: known() }); return null; }
      needs = api.data.needs ?? needs; last = api.data.followUpMessage ?? api.data.message ?? "";
      out.push({ user: text, reply: last, goal: `V1_${api.data.intent}`, proposalVersion, proposalId, known: known() });
      return api.data;
    }
    for (const [index, text] of turns.entries()) {
      let analysis = await analyze(text);
      // V1 gathers date/preferences/recap before drafting: answer minimally, as a traveler who wants a draft would.
      for (let guard = 0; analysis && guard < 8 && !selection; guard++) {
        if (analysis.intent !== "NEEDS" && analysis.intent !== "CLARIFY") break;
        if (/tạo đi/.test(last) && /tóm tắt|tổng hợp/.test(last)) {
          const reviewed = await v1post({ action: "REVIEW", conversationId, version, needs });
          if (!reviewed.ok) { out.push({ user: "tạo đi", reply: `[REVIEW ${reviewed.error}]`, goal: "HTTP_ERROR", proposalVersion, proposalId, known: known() }); break; }
          version = reviewed.data.version;
          const generated = await v1post({ action: "GENERATE", conversationId, version, previous: null, instruction: "" });
          if (!generated.ok) { out.push({ user: "tạo đi", reply: `[GENERATE ${generated.error}]`, goal: "HTTP_ERROR", proposalVersion, proposalId, known: known() }); break; }
          version = generated.data.version ?? version; selection = generated.data.selection; proposalVersion = version; proposalId = generated.data.proposal?.proposalId ?? null;
          last = generated.data.reply ?? ""; out.push({ user: "tạo đi", reply: last, goal: "V1_PROPOSAL", proposalVersion, proposalId, known: known() });
          break;
        }
        if (/mấy ngày|ô tô hay xe máy|phương tiện/.test(last)) break; // the scripted turns answer these
        const answer = /khởi hành|ngày nào/.test(last) ? "chưa chốt ngày" : "bỏ qua phần còn lại";
        analysis = await analyze(answer);
      }
      if (index === turns.length - 1) break;
    }
    return out;
  }

  // ---------------- saved trip (J) attempt ----------------
  async function runSaved() {
    const out: any[] = []; const notes: string[] = [];
    const client = v2(); if (!(await client.start()).ok) throw Error("START_FAILED");
    const proposal = await client.turn("lên lịch Hà Giang 2 ngày bằng xe máy khởi hành 14/11/2026");
    out.push(summarize("lên lịch Hà Giang 2 ngày bằng xe máy khởi hành 14/11/2026", proposal));
    const generated = proposal.data?.turn?.generated; const eligible = !!generated?.proposal?.eligibleForFinalConfirmation;
    notes.push(`proposal status ${generated?.proposal?.status ?? "none"}, eligibleForSave ${eligible}`);
    if (!eligible) return { turns: out, notes: [...notes, "FALLBACK_CONTROLLED: Dev data cannot reach a passing proposal with an exact date"] };
    const saved = await client.save(); const tripId = saved.data?.save?.save?.data?.tripId ?? saved.data?.save?.workspace?.savedTripId;
    notes.push(`save outcome ${saved.data?.save?.save?.status ?? saved.error}`);
    if (!tripId) return { turns: out, notes: [...notes, "FALLBACK_CONTROLLED: explicit save did not complete"] };
    const trip = v2(); const started = await trip.start({ tripId }); if (!started.ok) return { turns: out, notes: [...notes, `FALLBACK_CONTROLLED: in-trip start ${started.error}`] };
    const lastStop = generated.proposal.days.at(-1)?.stops.at(-1)?.destination.name?.replace(/^\[TEST\]\s*/, "");
    for (const text of [`bỏ ${lastStop} ngày 2`, "áp dụng đi"]) { const api = await trip.turn(text); out.push(summarize(text, api)); notes.push(`${text} -> ${api.data?.turn?.plan?.goal ?? api.error}`); if (!api.ok) break; }
    return { turns: out, notes };
  }

  const corpus = JSON.parse(await readFile(resolve(web, "../../docs/implementation/assistant-v2-final-evaluation-corpus.json"), "utf8")) as { scenarios: Scenario[] };
  const results: any[] = [];
  const write = () => writeFile(resolve(folder, `${arg("out") ?? "results"}.json`), JSON.stringify(results, null, 2));
  for (const scenario of corpus.scenarios) {
    if (scenario.mode === "controlled" || only && !only.includes(scenario.id)) continue;
    if (scenario.mode === "v1pair" && process.argv.includes("--skip-v1")) continue;
    try {
      const run = scenario.id === "S10" ? await runSaved() : { turns: scenario.mode === "v1pair" ? await runV1(scenario.turns!) : await runV2(scenario.turns!), notes: [] as string[] };
      const score = scoreTranscript(run.turns);
      const hardFailures = [...(score.readOnlyMutations.length ? ["READ_ONLY_TURN_CHANGED_PROPOSAL"] : []), ...(score.redundantQuestions ? ["REDUNDANT_QUESTION"] : []), ...(score.jargonLeaks ? ["JARGON_LEAK"] : []), ...(score.lodgingFabrication ? ["LODGING_FABRICATION"] : []), ...(run.turns.some(turn => turn.goal === "HTTP_ERROR") ? ["HTTP_ERROR"] : [])];
      results.push({ id: scenario.id, mode: scenario.mode, title: scenario.title, turns: run.turns, notes: run.notes, score, hardFailures });
      console.info("V210_SCENARIO", JSON.stringify({ id: scenario.id, mode: scenario.mode, goals: run.turns.map(turn => turn.goal), hardFailures, questionsBeforeProposal: score.questionsBeforeProposal, caveatViolations: score.caveatViolations.length, mechanical: score.mechanicalPhrases, notes: run.notes }));
    } catch (error) {
      results.push({ id: scenario.id, mode: scenario.mode, title: scenario.title, error: String((error as Error)?.message ?? error).slice(0, 80) });
      console.info("V210_SCENARIO_ERROR", scenario.id, String((error as Error)?.message ?? error).slice(0, 80));
    }
    await write();
  }
  console.info("V210_EVAL_DONE", JSON.stringify({ scenarios: results.length, errors: results.filter(item => item.error).length, withHardFailures: results.filter(item => item.hardFailures?.length).map(item => item.id) }));
}
main().catch(error => { console.error("V210_EVAL_BLOCKED", error?.message && /^[A-Z_ ]+$/u.test(error.message) ? error.message : "ENVIRONMENT_OR_SERVICE_FAILURE"); process.exitCode = 1; });

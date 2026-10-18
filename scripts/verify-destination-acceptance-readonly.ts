import { writeFile } from "node:fs/promises";
import { createPrismaClient } from "../packages/db/src/index";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "../apps/web/src/modules/trip-planner/planner-candidates";
import { routingRegistry } from "../apps/web/src/modules/destination/destination-routing-registry";
// @ts-expect-error Standalone one-time JS guard has no generated declaration.
import { readInputs, verifyProvider } from "./preflight-destination-production-sync.mjs";

async function main() {
  const inputs = readInputs(process.env);
  const identities = await verifyProvider(inputs);
  const url = new URL(inputs.target.value);
  url.searchParams.set("options", "-c default_transaction_read_only=on");
  url.searchParams.set("sslmode", "verify-full");
  const db = createPrismaClient({ DATABASE_URL: url.toString() });
  try {
    const mode = await db.$queryRawUnsafe<Array<{ default_transaction_read_only: string }>>("SHOW default_transaction_read_only");
    if (mode[0]?.default_transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED");
    const candidates = await retrievePlannerCandidates(db);
    const current = await recheckPlannerCandidates(db, candidates);
    const expected = ["cmv97lcrq0016z09ws0o74lqp", "cmv9fcwo1000be89w3yxz3mqu", "cmvanjc6p000f7w9wyuydna52"].sort();
    const ids = candidates.map(row => row.id).sort();
    const report = {
      checkedAt: new Date().toISOString(), identities, readOnly: true,
      repositoryReadStatus: JSON.stringify(ids) === JSON.stringify(expected) && current ? "PASS" : "FAIL",
      count: ids.length, ids, recheckMatches: current,
      runtimeRegistryVerified: routingRegistry(inputs.target.value).verified,
      candidates: candidates.map(row => ({ id: row.id, name: row.name, visibility: row.visibility,
        suggestedDurationMinutes: row.suggestedDurationMinutes, minimumDurationMinutes: row.minimumDurationMinutes,
        openingDayCount: row.openingDays.length, unknownDays: row.openingDays.filter(day => day.status === "UNKNOWN").length })),
      proposalCalls: 0, routesCalls: 0, tripWrites: 0,
    };
    await writeFile("docs/implementation/destination-final-acceptance-evidence/planner-readonly.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    if (report.repositoryReadStatus !== "PASS") process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("READ_ONLY_ACCEPTANCE_FAILED_DETAILS_SUPPRESSED"); process.exitCode = 1; });

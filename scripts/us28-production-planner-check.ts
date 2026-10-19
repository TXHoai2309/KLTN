// Read-only integration: real Production repository + engine + validator; no auth
// substitution is presented as HTTP acceptance and no routing provider is invoked.
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { routingRegistry } from "../apps/web/src/modules/destination/destination-routing-registry";
import { retrievePlannerCandidates, retrievePlannerCandidateInventory, recheckPlannerCandidates } from "../apps/web/src/modules/trip-planner/planner-candidates";
import { createPlannerService } from "../apps/web/src/modules/trip-planner/planner-service";
import { registeredPlannerPropose } from "../apps/web/src/modules/trip-planner/planner-registry";
import { selectPlannerDays } from "../apps/web/src/modules/trip-planner/planner-engine";

const env = parseEnv(await readFile("apps/web/.env", "utf8"));
const url = new URL(env.SYNC_TARGET_DATABASE_URL!);
if (!/^ep-blue-art-b3v3vr4h(?:-pooler)?\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.test(url.hostname) || url.pathname !== "/neondb") throw Error("PINNED_PRODUCTION_REQUIRED");
url.searchParams.set("sslmode", "verify-full");
url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=5000");
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
const db = client as unknown as Database;
try {
  const readonly = await client.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only");
  if (readonly[0]?.transaction_read_only !== "on") throw Error("READ_ONLY_REQUIRED");
  const original = execFileSync("git", ["show", "70a810f5e088cbfad68be790a7e5ce88db150ee3:apps/web/src/modules/destination/destination-routing-registry.ts"], { encoding: "utf8" });
  const before = await import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(original)).toString("base64"));
  const old = before.routingRegistry(url.toString()), registry = routingRegistry(url.toString());
  const candidates = await retrievePlannerCandidates(db, undefined, registry.excludedIds);
  let providerCalls = 0;
  const service = createPlannerService({ repository: { candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds), inventory: () => retrievePlannerCandidateInventory(db, undefined, registry.excludedIds), recheck: selected => recheckPlannerCandidates(db, selected, registry.excludedIds) },
    routes: { route: async () => { providerCalls++; throw Error("LIVE_ROUTING_NOT_AUTHORIZED_BY_THIS_SCRIPT"); } } });
  const propose = registeredPlannerPropose(registry, service.propose);
  const outcomes = [];
  for (const transport of ["CAR", "MOTORCYCLE"] as const) {
    const requirement = { startDate: "2027-01-01", durationDays: 1, transport, pace: "RELAXED", interests: [], companions: { type: "FRIENDS", groupSize: 2 } };
    const result = await propose("readonly-audit", "readonly-audit-" + transport, requirement);
    outcomes.push({ transport, status: result.status, eligibleForFinalConfirmation: result.eligibleForFinalConfirmation,
      stops: result.days.flatMap(day => day.stops.map(stop => ({ id: stop.destination.id, duration: stop.visitDurationMinutes, validationStatus: stop.validationStatus }))),
      reasonCodes: result.reasonCodes, checks: result.checks, warnings: result.warnings.map(w => w.code),
      durationEligibleCount: selectPlannerDays(requirement, candidates).flat().length });
  }
  const report = { measuredAt: new Date().toISOString(), databaseReadOnly: true,
    before: { commit: "70a810f5e088cbfad68be790a7e5ce88db150ee3", registryVerified: old.verified, runtimeCandidateCount: old.verified ? candidates.length : 0 },
    after: { registryVerified: registry.verified, publicCoordinateCandidates: candidates.length, excludedIds: registry.excludedIds },
    candidates: candidates.map(c => ({ id: c.id, durationMissing: c.minimumDurationMinutes === null && c.suggestedDurationMinutes === null, openingHoursVerified: c.openingDays.some(d => d.status === "OPEN" && d.intervals.length > 0) })),
    outcomes, providerCalls, productionWrites: 0,
    limitation: "Repository/service integration only; this does not prove authenticated Production HTTP or browser behavior." };
  await writeFile("docs/implementation/us28-production-registry-evidence/production-planner-readonly.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await client.$disconnect(); }

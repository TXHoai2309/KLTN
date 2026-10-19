import "varlock/auto-load";
import { Pool } from "pg";
import { createPlannerService } from "../src/modules/trip-planner/planner-service";
import { createStadiaRoutesProvider } from "../src/modules/trip-planner/planner-routes";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "../src/modules/trip-planner/planner-candidates";
import { createPrismaClient } from "@KLTN/db";

const prisma = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL! });

async function main() {
  console.log("Loading candidates from Prisma DB...");
  const candidates = await retrievePlannerCandidates(prisma as any);
  console.log(`Loaded ${candidates.length} candidates from DB:`);
  for (const c of candidates) {
    console.log(`- ${c.name} (id: ${c.id}, lat: ${c.latitude}, lng: ${c.longitude})`);
    if (c.id.includes("cmv9fcwo1000be89w3yxz3mqu")) {
      console.log("  Cang Bac Me openingDays:", JSON.stringify(c.openingDays, null, 2));
    }
  }

  const routes = createStadiaRoutesProvider({
    apiKey: () => process.env.STADIA_MAPS_API_KEY,
  });

  const service = createPlannerService({
    repository: {
      candidates: () => Promise.resolve(candidates),
      recheck: (selected) => Promise.resolve(true),
    },
    routes,
    now: () => new Date("2026-10-18T00:00:00Z"),
  });

  console.log("\nCalling service.propose with startDate 2026-12-12...");
  let result: any;
  try {
    result = await service.propose("user_test", "key_" + Date.now(), {
      startDate: "2026-12-12",
      durationDays: 2,
      transport: "MOTORCYCLE",
      pace: "MODERATE",
      interests: ["NATURE", "CULTURE_HISTORY"],
      companions: { type: "FRIENDS", groupSize: 2 },
    });
    console.log("\nProposal result status:", result.status);
  } catch (err: any) {
    console.error("Caught error:", err.message);
    console.error("Details:", JSON.stringify(err.details, null, 2));
    throw err;
  }
  console.log("Checks:");
  for (const ch of result.checks) {
    console.log(`  - [${ch.status}] ${ch.key}:`);
    for (const issue of ch.issues) {
      console.log(`      * destinationId=${issue.destinationId}, day=${issue.day}, code=${issue.code}, msg=${issue.message}`);
    }
  }

  for (const day of result.days) {
    console.log(`\n--- Day ${day.day} (${day.date}) ---`);
    console.log(`Distance: ${day.distanceMeters}, Travel: ${day.travelSeconds}s`);
    for (const stop of day.stops) {
      console.log(`  Stop ${stop.order}: ${stop.destination.name}`);
      console.log(`    Time: ${stop.arrivalMinute} -> ${stop.departureMinute} (${stop.scheduleState})`);
      if (stop.inbound) {
        console.log(`    Inbound: provider=${stop.inbound.provider}, status=${stop.inbound.status}, reason=${stop.inbound.reason}, duration=${stop.inbound.durationSeconds}s, dist=${stop.inbound.distanceMeters}m`);
      } else {
        console.log(`    Inbound: None (first stop)`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

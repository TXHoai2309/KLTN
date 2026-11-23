import { createPrismaClient, Prisma } from "@KLTN/db";
import { buildDataTripTitle, extractOriginCityProvince } from "../src/lib/traveler-trip-title";
import { computeSanitizedAutoConversationTitle } from "../src/modules/tripsage-chat/auto-title-sanitize";
import { readPinnedItems } from "../src/modules/trip-save/trip-pin-contract";
import { savedJourneySchema } from "../src/modules/trip-origin/journey-saved-contract";

async function main() {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const at = arg.indexOf("=");
      return at < 0 ? [arg, "true"] : [arg.slice(0, at), arg.slice(at + 1)];
    }),
  );

  const allowedFlags = new Set(["--dry-run", "--apply", "--database-host", "--database-name", "--include-trips-audit"]);
  if ([...args.keys()].some((k) => !allowedFlags.has(k))) {
    throw new Error("UNKNOWN_ARGUMENT");
  }

  const apply = args.has("--apply");
  if (apply && args.get("--apply") !== "true") throw new Error("INVALID_APPLY_FLAG");

  const dbUrlRaw = process.env.DATABASE_URL ?? "";
  if (!dbUrlRaw) throw new Error("MISSING_DATABASE_URL");

  if (apply) {
    const parsedUrl = new URL(dbUrlRaw);
    if (
      parsedUrl.hostname !== args.get("--database-host") ||
      decodeURIComponent(parsedUrl.pathname.slice(1)) !== args.get("--database-name")
    ) {
      throw new Error("EXPLICIT_DATABASE_TARGET_REQUIRED");
    }
  }

  const db = createPrismaClient({ DATABASE_URL: dbUrlRaw });
  try {
    const conversations = await db.$queryRaw<
      Array<{
        id: string;
        title: string;
        titleCustomized: boolean;
        savedTripId: string | null;
      }>
    >(Prisma.sql`SELECT id, title, "titleCustomized", "savedTripId" FROM assistant_conversation ORDER BY "createdAt" DESC`);

    const customPreserved = conversations.filter((c) => c.titleCustomized).length;
    const autoRows = conversations.filter((c) => !c.titleCustomized);

    const updates: Array<{ id: string; nextTitle: string }> = [];

    for (const row of autoRows) {
      const latestMsg = await db.$queryRaw<Array<{ parts: unknown }>>(
        Prisma.sql`SELECT parts FROM assistant_message WHERE "conversationId" = ${row.id} AND role = 'ASSISTANT' ORDER BY "createdAt" DESC LIMIT 1`,
      );
      let tripRow: { journeySnapshot: unknown; pinnedItems: unknown; startDate: Date; durationDays: number } | undefined;
      if (row.savedTripId) {
        const rows = await db.$queryRaw<Array<{ journeySnapshot: unknown; startDate: Date; durationDays: number }>>(
          Prisma.sql`SELECT "journeySnapshot", "startDate", "durationDays" FROM trip WHERE id = ${row.savedTripId} LIMIT 1`,
        );
        const pins = await db.$queryRaw<Array<{ kind: string; payload: unknown }>>(
          Prisma.sql`SELECT kind::text AS kind, payload FROM trip_pinned_item WHERE "tripId" = ${row.savedTripId}`,
        );
        if (rows[0]) {
          tripRow = {
            ...rows[0],
            pinnedItems: readPinnedItems(pins),
          };
        }
      }

      const nextTitle = computeSanitizedAutoConversationTitle({
        id: row.id,
        title: row.title,
        titleCustomized: row.titleCustomized,
        savedTripId: row.savedTripId,
        latestAssistantParts: latestMsg[0]?.parts,
        tripJourneySnapshot: tripRow?.journeySnapshot,
        tripPinnedItems: tripRow?.pinnedItems,
        tripStartDate: tripRow?.startDate ? tripRow.startDate.toISOString().slice(0, 10) : null,
        tripDurationDays: tripRow?.durationDays ?? null,
      });

      if (nextTitle) {
        updates.push({ id: row.id, nextTitle: nextTitle.slice(0, 120) });
      }
    }

    let appliedCount = 0;
    if (apply && updates.length > 0) {
      for (const u of updates) {
        const res = await db.$executeRaw(
          Prisma.sql`UPDATE assistant_conversation SET title = ${u.nextTitle}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${u.id} AND "titleCustomized" = false`,
        );
        appliedCount += Number(res);
      }
    }

    // Read-only audit of dynamically titled Trip rows (computed at read time via buildDataTripTitle).
    const trips = await db.$queryRaw<
      Array<{ id: string; startDate: Date; durationDays: number; journeySnapshot: unknown }>
    >(Prisma.sql`SELECT id, "startDate", "durationDays", "journeySnapshot" FROM trip`);

    let tripsWithRawOriginAddress = 0;
    let tripsResolvableToCity = 0;
    let tripsFallbackNoCity = 0;
    for (const t of trips) {
      const parsed = savedJourneySchema.safeParse(t.journeySnapshot);
      const originLabel = parsed.success ? parsed.data.journey.origin?.label ?? null : null;
      if (!originLabel) continue;
      const beforeFirstPart = originLabel.split(",")[0]?.trim() ?? "";
      const extractedCity = extractOriginCityProvince(originLabel, { allowHaGiang: true });
      const startIso = t.startDate.toISOString().slice(0, 10);
      const endIso = new Date(t.startDate.getTime() + Math.max(0, t.durationDays - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const titleAfter = buildDataTripTitle({
        originLabel,
        startDate: startIso,
        endDate: endIso,
        durationDays: t.durationDays,
      });
      if (extractedCity && extractedCity !== beforeFirstPart) {
        tripsWithRawOriginAddress++;
        tripsResolvableToCity++;
      } else if (!extractedCity) {
        tripsWithRawOriginAddress++;
        tripsFallbackNoCity++;
      } else if (!titleAfter) {
        tripsFallbackNoCity++;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          assistantConversations: {
            total: conversations.length,
            titleCustomizedPreserved: customPreserved,
            autoTitledInspected: autoRows.length,
            toUpdate: updates.length,
            applied: appliedCount,
          },
          tripsDynamicTitleAudit: {
            totalTrips: trips.length,
            tripsWithNonCityOriginPrefix: tripsWithRawOriginAddress,
            sanitizedToCityProvince: tripsResolvableToCity,
            sanitizedFallbackToHaGiangOrArea: tripsFallbackNoCity,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("SANITIZE_AUTO_TITLES_FAILED:", err instanceof Error ? err.message : "UNKNOWN");
  process.exitCode = 1;
});

import { mkdir, writeFile } from "node:fs/promises";
import { secrets, verifyIdentity, open } from "./rag-sync-lib.mjs";

// No database writes, provider requests, credentials or private content in evidence.
const input = await secrets("apps/web/.env");
const identities = await verifyIdentity(input);
const client = await open(input, "target");
try {
  const destinations = (await client.query(`SELECT id,name,visibility,latitude,longitude,
    "suggestedDurationMinutes","minimumDurationMinutes","contentRevision"
    FROM destination ORDER BY id`)).rows;
  const openingDays = (await client.query(`SELECT d.* FROM opening_day d
    JOIN destination p ON p.id=d."destinationId" ORDER BY d."destinationId",d."dayOfWeek"`)).rows;
  const openingIntervals = (await client.query(`SELECT i.* FROM opening_interval i
    JOIN opening_day d ON d.id=i."openingDayId" ORDER BY i.id`)).rows;
  const report = { measuredAt: new Date().toISOString(), identities,
    transaction: "REPEATABLE READ READ ONLY; ROLLBACK", destinations, openingDays, openingIntervals };
  await mkdir("docs/implementation/us28-production-registry-evidence", { recursive: true });
  await writeFile("docs/implementation/us28-production-registry-evidence/production-inventory.json", JSON.stringify(report, null, 2)+"\n");
  console.log(JSON.stringify(report));
} finally { await client.query("ROLLBACK"); await client.end(); }

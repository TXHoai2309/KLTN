import "varlock/auto-load";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(`
    SELECT 
      d.id, 
      d.name, 
      d.latitude, 
      d.longitude, 
      d."minimumDurationMinutes", 
      d."suggestedDurationMinutes",
      d.visibility,
      COUNT(o.id) as opening_count
    FROM destination d 
    LEFT JOIN opening_day o ON o."destinationId" = d.id 
    GROUP BY d.id, d.name, d.latitude, d.longitude, d."minimumDurationMinutes", d."suggestedDurationMinutes", d.visibility
    ORDER BY d.name;
  `);

  console.log("Total destinations in DB:", res.rows.length);
  for (const row of res.rows) {
    console.log(`- [${row.id}] ${row.name}: lat=${row.latitude}, lng=${row.longitude}, min=${row.minimumDurationMinutes}, sug=${row.suggestedDurationMinutes}, vis=${row.visibility}, openingDaysCount=${row.opening_count}`);
  }
}

main().catch(console.error).finally(() => pool.end());

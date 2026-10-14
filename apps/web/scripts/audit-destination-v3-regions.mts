/** Explicit Development-only READ ONLY inspection. Never logs credentials or full connection URLs. */
import "varlock/auto-load";
import { Pool } from "pg";
const url = process.env.DATABASE_URL;
if (!url) throw Error("Development DB not configured");
const target = new URL(url);
if (
  !/^ep-purple-pond-b3xujb8o(?:-pooler)?\./u.test(target.hostname) ||
  target.pathname !== "/neondb"
)
  throw Error("Refusing database outside the verified Development endpoint");
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 5000");
    const identity = await client.query(
      "SELECT current_database() AS database, current_setting('neon.endpoint_id', true) AS endpoint",
    );
    if (identity.rows[0]?.endpoint !== "ep-purple-pond-b3xujb8o")
      throw Error("Endpoint identity mismatch");
    const rows = await client.query(
      "SELECT id,name,area,category,visibility FROM destination WHERE name ILIKE $1 OR name ILIKE $2",
      ["%Cao nguyên đá Đồng Văn%", "%Cột cờ Lũng Cú%"],
    );
    console.log(
      JSON.stringify({
        environment: "development",
        endpoint: "ep-purple-pond-b3xujb8o",
        rows: rows.rows,
      }),
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

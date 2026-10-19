/**
 * SCRIPT GỠ BỎ TOÀN BỘ DATA TEST CỦA PLANNER (US-28)
 * -------------------------------------------------------------
 * Chỉ xóa đúng các bản ghi có prefix `test_planner_%`.
 * Tuyệt đối không chạm đến bất kỳ dữ liệu thật nào khác.
 */

import "varlock/auto-load";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const mediaDeleted = await client.query(`DELETE FROM content_media WHERE "destinationId" LIKE 'test_planner_%'`);
  const destDeleted = await client.query(`DELETE FROM destination WHERE id LIKE 'test_planner_%'`);

  await client.query("COMMIT");

  console.log("✅ ĐÃ GỠ BỎ TOÀN BỘ DỮ LIỆU TEST AN TOÀN!");
  console.log(`- Số điểm đến test đã xóa: ${destDeleted.rowCount}`);
  console.log(`- Số media liên quan đã xóa: ${mediaDeleted.rowCount}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("❌ Lỗi khi gỡ bỏ dữ liệu test:", error);
  throw error;
} finally {
  client.release();
  await pool.end();
}

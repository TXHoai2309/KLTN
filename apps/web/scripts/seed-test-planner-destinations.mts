/**
 * SCRIPT SEED DATA TEST CHO BƯỚC ĐỀ XUẤT HÀNH TRÌNH (US-28)
 * -------------------------------------------------------------
 * Mục đích:
 * Nạp 6 điểm đến thực tế tại Hà Giang với đầy đủ:
 * - Tọa độ thực (latitude, longitude)
 * - Thời lượng tham quan hợp lệ (suggestedDurationMinutes, minimumDurationMinutes)
 * - Khung giờ mở cửa 7 ngày trong tuần (07:30 - 18:30)
 * - Gán prefix "test_planner_" cho ID và "[TEST]" cho Name
 *
 * An toàn tuyệt đối:
 * - KHÔNG chạm vào bất kỳ dữ liệu thật nào trong database.
 * - Để gỡ bỏ, chỉ cần chạy script `cleanup-test-planner-destinations.mts` (hoặc lệnh DELETE với prefix test_planner_).
 */

import "varlock/auto-load";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
const client = await pool.connect();

const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const testDestinations = [
  {
    id: "test_planner_lung_cu",
    name: "[TEST] Cột cờ Lũng Cú",
    description: "Cột cờ quốc gia trên đỉnh núi Rồng, điểm cực Bắc thiêng liêng của Tổ quốc tại Hà Giang.",
    shortDescription: "Cột cờ Lũng Cú trên đỉnh núi Rồng, cực Bắc Tổ quốc.",
    area: "đồng văn",
    category: "di tích lịch sử – văn hóa – ngắm cảnh",
    latitude: 23.3619,
    longitude: 105.3186,
    suggestedDurationMinutes: 90,
    minimumDurationMinutes: 60,
    address: "Xã Lũng Cú, Huyện Đồng Văn, Hà Giang",
  },
  {
    id: "test_planner_nha_vuong",
    name: "[TEST] Dinh họ Vương (Nhà Vương)",
    description: "Khu dinh thự cổ của dòng họ Vương (Vua Mèo) với kiến trúc độc đáo kết hợp văn hóa H'Mông, Trung Hoa và Pháp.",
    shortDescription: "Dinh thự cổ của Vua Mèo Vương Chính Đức tại thung lũng Sà Phìn.",
    area: "đồng văn",
    category: "di tích lịch sử – văn hóa – kiến trúc",
    latitude: 23.2483,
    longitude: 105.2447,
    suggestedDurationMinutes: 75,
    minimumDurationMinutes: 45,
    address: "Thung lũng Sà Phìn, Huyện Đồng Văn, Hà Giang",
  },
  {
    id: "test_planner_dong_van",
    name: "[TEST] Phố cổ Đồng Văn",
    description: "Khu phố cổ nằm lọt thỏm giữa thung lũng đá với những ngôi nhà trình tường mái ngói âm dương cổ kính.",
    shortDescription: "Khu phố cổ hơn 100 năm tuổi với ẩm thực và văn hóa đặc sắc.",
    area: "đồng văn",
    category: "văn hóa – ẩm thực – phố cổ",
    latitude: 23.2785,
    longitude: 105.3614,
    suggestedDurationMinutes: 90,
    minimumDurationMinutes: 60,
    address: "Thị trấn Đồng Văn, Huyện Đồng Văn, Hà Giang",
  },
  {
    id: "test_planner_ma_pi_leng",
    name: "[TEST] Đèo Mã Pí Lèng",
    description: "Một trong 'tứ đại đỉnh đèo' hùng vĩ bậc nhất miền Bắc Việt Nam, uốn lượn bên hẻm vực sông Nho Quế.",
    shortDescription: "Cung đèo hiểm trở và ngoạn mục nối liền Đồng Văn và Mèo Vạc.",
    area: "mèo vạc",
    category: "thiên nhiên – đèo – ngắm cảnh – cảnh quan",
    latitude: 23.2415,
    longitude: 105.4168,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    address: "Quốc lộ 4C, Xã Pải Lủng, Huyện Mèo Vạc, Hà Giang",
  },
  {
    id: "test_planner_nho_que",
    name: "[TEST] Hẻm Tu Sản & Sông Nho Quế",
    description: "Hẻm vực sâu nhất Đông Nam Á với làn nước xanh ngọc bích tuyệt đẹp, trải nghiệm đi thuyền ngắm hẻm đá vôi.",
    shortDescription: "Du thuyền ngắm cảnh sông Nho Quế và kỳ quan hẻm Tu Sản.",
    area: "mèo vạc",
    category: "thiên nhiên – khám phá – cảnh quan",
    latitude: 23.2201,
    longitude: 105.4332,
    suggestedDurationMinutes: 120,
    minimumDurationMinutes: 90,
    address: "Xã Giàng Chu Phìn, Huyện Mèo Vạc, Hà Giang",
  },
  {
    id: "test_planner_quan_ba",
    name: "[TEST] Cổng trời Quản Bạ & Núi Đôi",
    description: "Cửa ngõ đầu tiên bước vào Công viên địa chất toàn cầu, ngắm toàn cảnh thị trấn Tam Sơn và Núi Đôi Cô Tiên.",
    shortDescription: "Cửa ngõ cao nguyên đá với tầm nhìn Núi Đôi kỳ thú.",
    area: "quản bạ",
    category: "thiên nhiên – ngắm cảnh – cảnh quan",
    latitude: 23.0645,
    longitude: 104.9928,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    address: "Quốc lộ 4C, Thị trấn Tam Sơn, Huyện Quản Bạ, Hà Giang",
  },
];

try {
  await client.query("BEGIN");

  // 1. Dọn dẹp dữ liệu test cũ nếu có
  console.log("1. Dọn dẹp dữ liệu test cũ (nếu có)...");
  await client.query(`DELETE FROM content_media WHERE "destinationId" LIKE 'test_planner_%'`);
  await client.query(`DELETE FROM destination WHERE id LIKE 'test_planner_%'`);

  // 2. Nạp các điểm đến test
  console.log(`2. Nạp ${testDestinations.length} điểm đến test...`);
  for (const dest of testDestinations) {
    await client.query(
      `INSERT INTO destination (
        id, name, description, "shortDescription", area, category,
        latitude, longitude, "suggestedDurationMinutes", "minimumDurationMinutes",
        visibility, "createdAt", "updatedAt", "contentRevision"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VISIBLE', NOW(), NOW(), 1)`,
      [
        dest.id,
        dest.name,
        dest.description,
        dest.shortDescription,
        dest.area,
        dest.category,
        dest.latitude,
        dest.longitude,
        dest.suggestedDurationMinutes,
        dest.minimumDurationMinutes,
      ]
    );

    // 3. Nạp giờ mở cửa cho cả 7 ngày trong tuần: 07:30 - 18:30 (450 - 1110 phút)
    for (const day of weekdays) {
      const openingDayId = `${dest.id}_${day.toLowerCase()}`;
      await client.query(
        `INSERT INTO opening_day (id, "destinationId", "dayOfWeek", status)
         VALUES ($1, $2, $3, 'OPEN')`,
        [openingDayId, dest.id, day]
      );

      // Thêm interval từ 07:30 (450) đến 18:30 (1110)
      const intervalId = `${openingDayId}_int1`;
      await client.query(
        `INSERT INTO opening_interval (id, "openingDayId", "opensAtMinute", "closesAtMinute")
         VALUES ($1, $2, 450, 1110)`,
        [intervalId, openingDayId]
      );
    }
  }

  await client.query("COMMIT");
  console.log("✅ ĐÃ NẠP THÀNH CÔNG BỘ DỮ LIỆU TEST! (6 điểm đến, 42 lịch ngày, 42 khung giờ)");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("❌ Lỗi nạp dữ liệu:", error);
  throw error;
} finally {
  client.release();
  await pool.end();
}

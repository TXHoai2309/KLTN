import { readFile, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { existsSync } from "node:fs";
import { createPrismaClient } from "../packages/db/src/index.js";

async function main() {
  console.log("=== BẮT ĐẦU DỌN DẸP TOÀN BỘ DỮ LIỆU TEST HÀ GIANG (TEST FIXTURES) ===");

  const rawEnv = await readFile("apps/web/.env", "utf8");
  const env = parseEnv(rawEnv);
  const databaseUrl = env.DATABASE_URL || env.DATABASE_URL_PROD;

  if (!databaseUrl) {
    throw new Error("Không tìm thấy DATABASE_URL hoặc DATABASE_URL_PROD trong apps/web/.env");
  }

  const db = createPrismaClient({ DATABASE_URL: databaseUrl });

  try {
    let receipt: {
      users?: { id: string; email: string }[];
      destinations?: string[];
      trips?: string[];
      favorites?: string[];
    } = {};

    const receiptPath = ".cache/test-fixtures-receipt.json";
    if (existsSync(receiptPath)) {
      receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    }

    const testEmails = [
      "test_traveler@kltn.test",
      "test_admin@kltn.test",
      ...(receipt.users?.map((u) => u.email) ?? []),
    ];

    const testUserIds = receipt.users?.map((u) => u.id) ?? [];

    // 1. XÓA MỤC YÊU THÍCH TEST (Favorites)
    console.log("1. Xóa Favorites test...");
    const delFav = await db.favorite.deleteMany({
      where: {
        OR: [
          { id: { startsWith: "TEST_HG_FAV_" } },
          { id: { startsWith: "TEST_FAV_" } },
          { user: { email: { in: testEmails } } },
          { tripId: { startsWith: "TEST_HG_TRIP_" } },
          { tripId: { startsWith: "TEST_TRIP_" } },
          { destinationId: { startsWith: "TEST_HG_DEST_" } },
          { destinationId: { startsWith: "TEST_DEST_" } },
        ],
      },
    });
    console.log(`- Đã xóa ${delFav.count} mục yêu thích test.`);

    // 2. XÓA CHUYẾN ĐI TEST (ItineraryVisits -> ItineraryDays -> Trips)
    console.log("2. Xóa các chuyến đi test và lịch trình liên quan...");
    const delVisits = await db.itineraryVisit.deleteMany({
      where: {
        OR: [
          { day: { trip: { id: { startsWith: "TEST_HG_TRIP_" } } } },
          { day: { trip: { id: { startsWith: "TEST_TRIP_" } } } },
          { day: { trip: { user: { email: { in: testEmails } } } } },
          { destinationId: { startsWith: "TEST_HG_DEST_" } },
          { destinationId: { startsWith: "TEST_DEST_" } },
        ],
      },
    });
    console.log(`- Đã xóa ${delVisits.count} điểm dừng lịch trình (visits).`);

    const delDays = await db.itineraryDay.deleteMany({
      where: {
        OR: [
          { trip: { id: { startsWith: "TEST_HG_TRIP_" } } },
          { trip: { id: { startsWith: "TEST_TRIP_" } } },
          { trip: { user: { email: { in: testEmails } } } },
        ],
      },
    });
    console.log(`- Đã xóa ${delDays.count} ngày lịch trình (days).`);

    const delTrips = await db.trip.deleteMany({
      where: {
        OR: [
          { id: { startsWith: "TEST_HG_TRIP_" } },
          { id: { startsWith: "TEST_TRIP_" } },
          { user: { email: { in: testEmails } } },
        ],
      },
    });
    console.log(`- Đã xóa ${delTrips.count} chuyến đi test.`);

    // 3. XÓA ĐIỂM ĐẾN TEST (OpeningIntervals -> OpeningDays -> Destinations)
    console.log("3. Xóa các điểm đến test...");
    const delIntervals = await db.openingInterval.deleteMany({
      where: {
        openingDay: {
          destination: {
            OR: [
              { id: { startsWith: "TEST_HG_DEST_" } },
              { id: { startsWith: "TEST_DEST_" } },
              { name: { startsWith: "[TEST_HG]" } },
              { name: { startsWith: "[TEST_FIXTURE]" } },
            ],
          },
        },
      },
    });
    console.log(`- Đã xóa ${delIntervals.count} khung giờ mở cửa.`);

    const delDaysOfWeek = await db.openingDay.deleteMany({
      where: {
        destination: {
          OR: [
            { id: { startsWith: "TEST_HG_DEST_" } },
            { id: { startsWith: "TEST_DEST_" } },
            { name: { startsWith: "[TEST_HG]" } },
            { name: { startsWith: "[TEST_FIXTURE]" } },
          ],
        },
      },
    });
    console.log(`- Đã xóa ${delDaysOfWeek.count} ngày mở cửa.`);

    const delDests = await db.destination.deleteMany({
      where: {
        OR: [
          { id: { startsWith: "TEST_HG_DEST_" } },
          { id: { startsWith: "TEST_DEST_" } },
          { name: { startsWith: "[TEST_HG]" } },
          { name: { startsWith: "[TEST_FIXTURE]" } },
        ],
      },
    });
    console.log(`- Đã xóa ${delDests.count} điểm đến test.`);

    // 4. XÓA TÀI KHOẢN VÀ USER TEST
    console.log("4. Xóa tài khoản test (User, Session, Account)...");
    const testUsers = await db.user.findMany({
      where: {
        OR: [
          { email: { in: testEmails } },
          { id: { in: testUserIds } },
          { name: { startsWith: "[TEST_HG]" } },
          { name: { startsWith: "[TEST]" } },
        ],
      },
      select: { id: true, email: true },
    });

    const targetUserIds = testUsers.map((u) => u.id);

    if (targetUserIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: targetUserIds } } });
      await db.account.deleteMany({ where: { userId: { in: targetUserIds } } });
      const delUsers = await db.user.deleteMany({ where: { id: { in: targetUserIds } } });
      console.log(`- Đã xóa ${delUsers.count} user test (${testUsers.map((u) => u.email).join(", ")}).`);
    } else {
      console.log("- Không còn user test nào cần xóa.");
    }

    // 5. XÓA FILE RECEIPT
    if (existsSync(receiptPath)) {
      await unlink(receiptPath);
      console.log(`- Đã xóa file receipt: ${receiptPath}`);
    }

    console.log("\n=== DỌN DẸP DỮ LIỆU TEST HÀ GIANG THÀNH CÔNG (100% SẠCH SẼ) ===");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("Lỗi khi dọn dẹp test fixtures:", err);
  process.exit(1);
});

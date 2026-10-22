import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { existsSync } from "node:fs";
import { createPrismaClient } from "../packages/db/src/index.js";
import { createAuth } from "../packages/auth/src/index.js";

async function main() {
  console.log("=== BẮT ĐẦU NẠP BỘ DỮ LIỆU TEST CHUẨN KHU VỰC HÀ GIANG ===");

  const rawEnv = await readFile("apps/web/.env", "utf8");
  const env = parseEnv(rawEnv);
  const databaseUrl = env.DATABASE_URL || env.DATABASE_URL_PROD;

  if (!databaseUrl) {
    throw new Error("Không tìm thấy DATABASE_URL hoặc DATABASE_URL_PROD trong apps/web/.env");
  }

  const betterAuthUrl = env.BETTER_AUTH_URL || "http://localhost:3000";
  const betterAuthSecret = env.BETTER_AUTH_SECRET || "test-secret-min-32-chars-long-1234567890";

  const db = createPrismaClient({ DATABASE_URL: databaseUrl });
  const auth = createAuth(
    {
      BETTER_AUTH_URL: betterAuthUrl,
      BETTER_AUTH_SECRET: betterAuthSecret,
    },
    db,
  );

  const receipt = {
    createdAt: new Date().toISOString(),
    region: "Hà Giang",
    users: [] as { id: string; email: string; role: string; password: string }[],
    destinations: [] as string[],
    trips: [] as string[],
    favorites: [] as string[],
  };

  try {
    // 1. TẠO TÀI KHOẢN TEST
    console.log("\n1. Khởi tạo tài khoản test (Traveler & Admin)...");
    const testAccounts = [
      {
        name: "[TEST_HG] Nguyễn Văn Hà Giang (Traveler)",
        email: "test_traveler@kltn.test",
        password: "Password123!",
        role: "TRAVELER" as const,
      },
      {
        name: "[TEST_HG] Quản Trị Viên Hà Giang (Admin)",
        email: "test_admin@kltn.test",
        password: "Password123!",
        role: "ADMIN" as const,
      },
    ];

    let travelerId = "";

    for (const acc of testAccounts) {
      let user = await db.user.findUnique({ where: { email: acc.email } });
      if (!user) {
        const res = await auth.api.signUpEmail({
          body: {
            name: acc.name,
            email: acc.email,
            password: acc.password,
          },
          headers: new Headers({ origin: betterAuthUrl }),
          asResponse: true,
        });

        if (res.status !== 200) {
          const errText = await res.text();
          throw new Error(`Tạo tài khoản ${acc.email} thất bại: ${errText}`);
        }

        const data = await res.json();
        user = data.user;
        console.log(`- Đã tạo mới tài khoản ${acc.role}: ${acc.email} (ID: ${user?.id})`);
      } else {
        console.log(`- Tài khoản ${acc.role} đã sẵn sàng: ${acc.email} (ID: ${user.id})`);
      }

      if (user) {
        if (user.role !== acc.role) {
          await db.user.update({
            where: { id: user.id },
            data: { role: acc.role },
          });
        }
        receipt.users.push({
          id: user.id,
          email: acc.email,
          role: acc.role,
          password: acc.password,
        });

        if (acc.role === "TRAVELER") {
          travelerId = user.id;
        }
      }
    }

    // 2. KHỞI TẠO 7 ĐIỂM ĐẾN HÀ GIANG ĐẠT CHUẨN RÀNG BUỘC HÀNH TRÌNH
    console.log("\n2. Khởi tạo 7 điểm đến trong tỉnh Hà Giang...");
    const haGiangDestinations = [
      {
        id: "TEST_HG_DEST_COT_MOC_0",
        name: "[TEST_HG] Cột mốc số 0 Hà Giang",
        description: "Điểm xuất phát lý tưởng của hành trình khám phá Hà Giang, nằm ngay công viên trung tâm thành phố.",
        area: "thành phố hà giang",
        category: "điểm trải nghiệm du lịch",
        latitude: 22.8233,
        longitude: 104.9836,
        suggestedDurationMinutes: 30,
        minimumDurationMinutes: 20,
      },
      {
        id: "TEST_HG_DEST_QUAN_BA",
        name: "[TEST_HG] Cổng trời Quản Bạ & Núi Đôi Cô Tiên",
        description: "Cửa ngõ đầu tiên bước vào cao nguyên đá với tầm nhìn toàn cảnh núi Đôi và thung lũng Tam Sơn thơ mộng.",
        area: "quản bạ",
        category: "thiên nhiên – thắng cảnh",
        latitude: 23.0493,
        longitude: 104.9927,
        suggestedDurationMinutes: 45,
        minimumDurationMinutes: 30,
      },
      {
        id: "TEST_HG_DEST_LUNG_TAM",
        name: "[TEST_HG] Làng dệt lanh Lùng Tám",
        description: "Làng nghề dệt lanh truyền thống của người H'Mông trắng nằm ẩn mình dưới thung lũng Quản Bạ.",
        area: "quản bạ",
        category: "làng du lịch – bản làng",
        latitude: 23.0650,
        longitude: 105.0350,
        suggestedDurationMinutes: 60,
        minimumDurationMinutes: 30,
      },
      {
        id: "TEST_HG_DEST_NHA_VUONG",
        name: "[TEST_HG] Dinh thự họ Vương (Nhà Vua Mèo)",
        description: "Kiệt tác kiến trúc cổ kính hòa quyện phong cách H'Mông, Pháp và Hoa giữa thung lũng Sà Phìn.",
        area: "đồng văn",
        category: "di tích lịch sử – kiến trúc",
        latitude: 23.2389,
        longitude: 105.2444,
        suggestedDurationMinutes: 60,
        minimumDurationMinutes: 45,
      },
      {
        id: "TEST_HG_DEST_PHO_CO_DONG_VAN",
        name: "[TEST_HG] Phố cổ Đồng Văn",
        description: "Quần thể nhà cổ trình tường hơn trăm tuổi với chợ phiên truyền thống và cà phê phố cổ nhộn nhịp.",
        area: "đồng văn",
        category: "văn hóa",
        latitude: 23.2783,
        longitude: 105.3622,
        suggestedDurationMinutes: 60,
        minimumDurationMinutes: 30,
      },
      {
        id: "TEST_HG_DEST_MA_PI_LENG",
        name: "[TEST_HG] Đèo Mã Pí Lèng & Hẻm Tu Sản",
        description: "Một trong tứ đại đỉnh đèo hiểm trở bậc nhất Việt Nam, ngắm trọn dòng sông Nho Quế xanh ngắt uốn lượn.",
        area: "mèo vạc",
        category: "thiên nhiên – thắng cảnh",
        latitude: 23.2345,
        longitude: 105.4123,
        suggestedDurationMinutes: 90,
        minimumDurationMinutes: 60,
      },
      {
        id: "TEST_HG_DEST_COT_CO_LUNG_CU",
        name: "[TEST_HG] Cột cờ Quốc gia Lũng Cú",
        description: "Điểm cực Bắc thiêng liêng của Tổ quốc trên đỉnh núi Rồng, lá cờ đỏ sao vàng 54m2 tung bay phấp phới.",
        area: "đồng văn",
        category: "di tích lịch sử – kiến trúc",
        latitude: 23.3619,
        longitude: 105.3186,
        suggestedDurationMinutes: 90,
        minimumDurationMinutes: 45,
      },
    ];

    const weekdays = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ] as const;

    for (const dest of haGiangDestinations) {
      const existing = await db.destination.findUnique({ where: { id: dest.id } });
      if (!existing) {
        await db.destination.create({
          data: {
            id: dest.id,
            name: dest.name,
            description: dest.description,
            area: dest.area,
            category: dest.category,
            latitude: dest.latitude,
            longitude: dest.longitude,
            suggestedDurationMinutes: dest.suggestedDurationMinutes,
            minimumDurationMinutes: dest.minimumDurationMinutes,
            visibility: "VISIBLE",
            locationVerified: true,
            locationEvidence: "Tọa độ thực tại tỉnh Hà Giang",
            // RÀNG BUỘC GIỜ MỞ CỬA: Mở cửa cả 7 ngày từ 07:00 (420) đến 19:00 (1140)
            // Khung này bao trùm hoàn toàn cửa sổ lập lịch (08:00 - 18:00), đảm bảo luôn PASS!
            openingDays: {
              create: weekdays.map((dayOfWeek) => ({
                dayOfWeek,
                status: "OPEN",
                intervals: {
                  create: {
                    opensAtMinute: 420, // 07:00
                    closesAtMinute: 1140, // 19:00
                  },
                },
              })),
            },
          },
        });
        console.log(`- Đã tạo điểm đến: ${dest.name} (${dest.id})`);
      } else {
        console.log(`- Điểm đến đã tồn tại: ${dest.name} (${dest.id})`);
      }
      receipt.destinations.push(dest.id);
    }

    // 3. KHỞI TẠO CÁC CHUYẾN ĐI TEST ĐÁP ỨNG TOÀN BỘ RÀNG BUỘC HÀNH TRÌNH
    console.log("\n3. Khởi tạo Chuyến đi Test cho Traveler (Đảm bảo PASS ràng buộc)...");

    // Chuyến đi 1: Tuyến Hà Giang 3 ngày (Active / Upcoming)
    // Lịch trình mỗi ngày được tính toán kỹ: thời gian di chuyển giữa các điểm liền kề hợp lý,
    // thời lượng tham quan đúng chuẩn, kết thúc trước 13:00 (rất xa giới hạn 18:00/1080p).
    const trip1Id = "TEST_HG_TRIP_3D";
    const existingTrip1 = await db.trip.findUnique({ where: { id: trip1Id } });
    if (!existingTrip1) {
      await db.trip.create({
        data: {
          id: trip1Id,
          userId: travelerId,
          startDate: new Date("2026-11-05"),
          durationDays: 3,
          transport: "MOTORCYCLE",
          manuallyCompletedAt: null,
          days: {
            create: [
              // Ngày 1: TP. Hà Giang -> Quản Bạ (Cột mốc số 0 -> Cổng trời Quản Bạ -> Làng dệt Lùng Tám)
              {
                dayIndex: 1,
                localDate: new Date("2026-11-05"),
                visits: {
                  create: [
                    {
                      destinationId: "TEST_HG_DEST_COT_MOC_0",
                      startMinute: 480, // 08:00 - 08:30 (30p)
                      plannedDurationMinutes: 30,
                      order: 1,
                    },
                    {
                      destinationId: "TEST_HG_DEST_QUAN_BA",
                      startMinute: 585, // 09:45 - 10:30 (45p)
                      plannedDurationMinutes: 45,
                      order: 2,
                    },
                    {
                      destinationId: "TEST_HG_DEST_LUNG_TAM",
                      startMinute: 660, // 11:00 - 12:00 (60p)
                      plannedDurationMinutes: 60,
                      order: 3,
                    },
                  ],
                },
              },
              // Ngày 2: Yên Minh -> Đồng Văn (Dinh họ Vương -> Phố cổ Đồng Văn)
              {
                dayIndex: 2,
                localDate: new Date("2026-11-06"),
                visits: {
                  create: [
                    {
                      destinationId: "TEST_HG_DEST_NHA_VUONG",
                      startMinute: 510, // 08:30 - 09:30 (60p)
                      plannedDurationMinutes: 60,
                      order: 1,
                    },
                    {
                      destinationId: "TEST_HG_DEST_PHO_CO_DONG_VAN",
                      startMinute: 600, // 10:00 - 11:00 (60p)
                      plannedDurationMinutes: 60,
                      order: 2,
                    },
                  ],
                },
              },
              // Ngày 3: Đồng Văn -> Lũng Cú -> Mèo Vạc (Cột cờ Lũng Cú -> Đèo Mã Pí Lèng)
              {
                dayIndex: 3,
                localDate: new Date("2026-11-07"),
                visits: {
                  create: [
                    {
                      destinationId: "TEST_HG_DEST_COT_CO_LUNG_CU",
                      startMinute: 510, // 08:30 - 10:00 (90p)
                      plannedDurationMinutes: 90,
                      order: 1,
                    },
                    {
                      destinationId: "TEST_HG_DEST_MA_PI_LENG",
                      startMinute: 660, // 11:00 - 12:30 (90p)
                      plannedDurationMinutes: 90,
                      order: 2,
                    },
                  ],
                },
              },
            ],
          },
        },
      });
      console.log(`- Đã tạo Chuyến đi 1 (Sắp tới - 3 ngày Hà Giang): ${trip1Id}`);
    } else {
      console.log(`- Chuyến đi 1 đã tồn tại: ${trip1Id}`);
    }
    receipt.trips.push(trip1Id);

    // Chuyến đi 2: Chuyến đi 2 ngày đã hoàn thành (Completed)
    const trip2Id = "TEST_HG_TRIP_COMPLETED_2D";
    const existingTrip2 = await db.trip.findUnique({ where: { id: trip2Id } });
    if (!existingTrip2) {
      await db.trip.create({
        data: {
          id: trip2Id,
          userId: travelerId,
          startDate: new Date("2026-10-15"),
          durationDays: 2,
          transport: "CAR",
          manuallyCompletedAt: new Date("2026-10-17T16:00:00.000Z"),
          days: {
            create: [
              {
                dayIndex: 1,
                localDate: new Date("2026-10-15"),
                visits: {
                  create: [
                    {
                      destinationId: "TEST_HG_DEST_COT_MOC_0",
                      startMinute: 480,
                      plannedDurationMinutes: 30,
                      order: 1,
                    },
                    {
                      destinationId: "TEST_HG_DEST_QUAN_BA",
                      startMinute: 585,
                      plannedDurationMinutes: 45,
                      order: 2,
                    },
                  ],
                },
              },
              {
                dayIndex: 2,
                localDate: new Date("2026-10-16"),
                visits: {
                  create: [
                    {
                      destinationId: "TEST_HG_DEST_NHA_VUONG",
                      startMinute: 510,
                      plannedDurationMinutes: 60,
                      order: 1,
                    },
                    {
                      destinationId: "TEST_HG_DEST_PHO_CO_DONG_VAN",
                      startMinute: 600,
                      plannedDurationMinutes: 60,
                      order: 2,
                    },
                  ],
                },
              },
            ],
          },
        },
      });
      console.log(`- Đã tạo Chuyến đi 2 (Đã hoàn thành - 2 ngày Hà Giang): ${trip2Id}`);
    } else {
      console.log(`- Chuyến đi 2 đã tồn tại: ${trip2Id}`);
    }
    receipt.trips.push(trip2Id);

    // 4. KHỞI TẠO MỤC YÊU THÍCH TEST (Favorites)
    console.log("\n4. Khởi tạo Mục Yêu Thích Test (Favorites)...");
    const testFavorites = [
      {
        id: "TEST_HG_FAV_TRIP_1",
        targetType: "TRIP" as const,
        tripId: trip1Id,
        destinationId: null,
      },
      {
        id: "TEST_HG_FAV_DEST_MA_PI_LENG",
        targetType: "DESTINATION" as const,
        tripId: null,
        destinationId: "TEST_HG_DEST_MA_PI_LENG",
      },
    ];

    for (const fav of testFavorites) {
      const existingFav = await db.favorite.findUnique({
        where: fav.tripId
          ? { userId_tripId: { userId: travelerId, tripId: fav.tripId } }
          : { userId_destinationId: { userId: travelerId, destinationId: fav.destinationId! } },
      });

      if (!existingFav) {
        await db.favorite.create({
          data: {
            id: fav.id,
            userId: travelerId,
            targetType: fav.targetType,
            tripId: fav.tripId,
            destinationId: fav.destinationId,
          },
        });
        console.log(`- Đã tạo Favorite (${fav.targetType}): ${fav.id}`);
      } else {
        console.log(`- Favorite đã tồn tại: ${existingFav.id}`);
      }
      receipt.favorites.push(fav.id);
    }

    // 5. LƯU BIÊN NHẬN (RECEIPT)
    if (!existsSync(".cache")) {
      await mkdir(".cache", { recursive: true });
    }
    await writeFile(".cache/test-fixtures-receipt.json", JSON.stringify(receipt, null, 2), "utf8");
    console.log("\n-> Đã lưu danh mục ID test vào: .cache/test-fixtures-receipt.json");

    console.log("\n=== HOÀN TẤT NẠP DỮ LIỆU TEST HÀ GIANG ĐẠT CHUẨN RÀNG BUỘC ===");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("Lỗi khi nạp test fixtures Hà Giang:", err);
  process.exit(1);
});

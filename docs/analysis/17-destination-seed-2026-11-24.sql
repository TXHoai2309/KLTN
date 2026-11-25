-- =====================================================================
-- BẢN NHÁP — CHƯA CHẠY. Bổ sung/sửa dữ liệu điểm đến cho lập lịch.
-- Đi kèm: docs/analysis/17-itinerary-planning-redesign.md (mục 4).
--
-- Nguồn toạ độ: OpenStreetMap Nominatim, tra ngày 2026-11-24 (không phải khảo sát
-- thực địa) => mọi điểm mới để locationVerified = false, ghi locationEvidence.
-- Thời lượng tham quan và giờ mở là ƯỚC LƯỢNG theo góc nhìn khách du lịch,
-- cần chủ dự án duyệt. Không có giá vé (để NULL, không bịa).
--
-- Chạy thử trên DB dev trước. Toàn bộ nằm trong một transaction, chạy lại
-- được nhiều lần (ON CONFLICT DO NOTHING / UPDATE theo id cố định).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- A. SỬA 22 ĐIỂM ĐANG CÔNG KHAI (id lấy từ production qua /api/destinations)
-- ---------------------------------------------------------------------

-- A1. Bỏ tiền tố "[Tam] " khỏi tên công khai.
UPDATE "destination"
SET "name" = regexp_replace("name", '^\[Tam\]\s*', ''), "updatedAt" = now(), "contentRevision" = "contentRevision" + 1
WHERE "id" IN ('cmw588hy3e60910dc8cace901', 'cmw588e041cd155bf3a51de77', 'cmw588fcnc9d4d6220d5c499e',
               'cmw588h6i623ed27349209914', 'cmw588gaq325631f0e9497dc0')
  AND "name" LIKE '[Tam]%';

-- A2. isOutdoor = true cho điểm ngoài trời (đang false cho cả 22 điểm, nên
--     tối ưu thời tiết/hoàng hôn không bao giờ coi điểm nào là ngoài trời).
UPDATE "destination" SET "isOutdoor" = true, "updatedAt" = now()
WHERE "id" IN (
  'cmvklqp7c000108jvi06hb4wu', -- Cổng trời Quản Bạ
  'cmw588e041cd155bf3a51de77', -- Núi Đôi Cô Tiên
  'cmw588fcnc9d4d6220d5c499e', -- Rừng thông Yên Minh
  'cmvsa4ob3000108l8upj3ccfu', -- Đèo Mã Pì Lèng
  'cmvtdsbz1000108jumr696xmd', -- Sông Nho Quế
  'cmvksuz4w000h08jwpl5fxr4z', -- Pả Vi Thượng
  'cmvku7fq4000108jss7z5wdil', -- Cột cờ Lũng Cú
  'cmvuho815000108l9pi6zc4zm', -- Ruộng bậc thang Hoàng Su Phì
  'cmvt6u44w000108l362px0r9x', -- Đỉnh Chiêu Lầu Thi
  'cmvgb1hht000107lh49mnzwtv'  -- Cao nguyên đá Đồng Văn
);

-- A3. Điểm thiếu thời lượng => planner loại bỏ. Pả Vi Thượng là điểm ngắm cảnh cụ thể.
--     (Cao nguyên đá Đồng Văn là cả một vùng, KHÔNG phải một điểm dừng => cố ý để trống.)
UPDATE "destination" SET "suggestedDurationMinutes" = 45, "minimumDurationMinutes" = 20, "updatedAt" = now()
WHERE "id" = 'cmvksuz4w000h08jwpl5fxr4z' AND "suggestedDurationMinutes" IS NULL;

-- A4. Điểm ngắm cảnh ven đường không có cổng: mở 06:00–18:30 thay vì 07:00–17:00,
--     để lịch có thể đặt điểm ngắm vào giờ đẹp (sáng sớm / chiều muộn).
UPDATE "opening_interval" oi SET "opensAtMinute" = 360, "closesAtMinute" = 1110
FROM "opening_day" od
WHERE oi."openingDayId" = od."id" AND od."status" = 'OPEN'
  AND od."destinationId" IN (
    'cmvklqp7c000108jvi06hb4wu', -- Cổng trời Quản Bạ
    'cmw588e041cd155bf3a51de77', -- Núi Đôi Cô Tiên
    'cmw588fcnc9d4d6220d5c499e', -- Rừng thông Yên Minh
    'cmvsa4ob3000108l8upj3ccfu', -- Đèo Mã Pì Lèng
    'cmvksuz4w000h08jwpl5fxr4z'  -- Pả Vi Thượng
  )
  -- chỉ khi mỗi ngày đang có đúng một khung giờ
  AND NOT EXISTS (SELECT 1 FROM "opening_interval" o2 WHERE o2."openingDayId" = od."id" AND o2."id" <> oi."id");

-- A5. Khu vực (area): đang là "khu vực hà giang" cho mọi điểm => thưởng "cùng khu"
--     của thuật toán vô dụng. KHÔNG lặp lại ở đây: dùng script có sẵn
--     apps/web/scripts/fix-content-data-2026-11.ts (nhóm B3, đang chạy dry-run).

-- ---------------------------------------------------------------------
-- B. ĐIỂM MỚI (VISIBLE, chưa xác minh vị trí, chưa có ảnh)
--    Ưu tiên: điểm "hot" nằm TRÊN tuyến vòng cung, và điểm dừng chụp ảnh ngắn.
-- ---------------------------------------------------------------------
INSERT INTO "destination" ("id", "name", "description", "shortDescription", "area", "category",
  "latitude", "longitude", "suggestedDurationMinutes", "minimumDurationMinutes", "isOutdoor",
  "visibility", "aliases", "locationVerified", "locationEvidence", "bestVisitTime", "visitNotes", "updatedAt")
VALUES
  ('hg-seed-doc-bac-sum', 'Dốc Bắc Sum',
   'Con dốc nhiều khúc cua tay áo trên Quốc lộ 4C, đoạn từ TP Hà Giang lên Quản Bạ; điểm dừng chụp ảnh đầu tiên của cung đường.',
   'Dốc cua tay áo trên QL4C, dừng chụp ảnh nhanh.', 'Quản Bạ', 'thiên nhiên – điểm ngắm cảnh',
   22.9882, 104.9359, 20, 10, true, 'VISIBLE', ARRAY['Bac Sum','Dốc 9 khoanh Bắc Sum'], false,
   'OpenStreetMap Nominatim: "Bac Sum Pass" (viewpoint), tra 2026-11-24', 'Sáng sớm hoặc chiều muộn', 'Dừng ở lề an toàn; không đỗ giữa khúc cua.', now()),

  ('hg-seed-hang-lung-khuy', 'Hang Lùng Khúy',
   'Hang động đá vôi ở Quản Bạ, có lối đi bộ lên cửa hang và hệ thống thạch nhũ bên trong.',
   'Hang động thạch nhũ ở Quản Bạ.', 'Quản Bạ', 'thiên nhiên – hang động',
   23.0788, 105.0199, 75, 45, false, 'VISIBLE', ARRAY['Lung Khuy Cave'], false,
   'OpenStreetMap Nominatim: "Lung Khuy Cave" (cave_entrance), tra 2026-11-24', 'Ban ngày; hợp cả khi trời mưa', 'Có đoạn đi bộ dốc lên cửa hang.', now()),

  ('hg-seed-doc-tham-ma', 'Dốc Thẩm Mã',
   'Con dốc quanh co nổi tiếng trên QL4C giữa Yên Minh và Đồng Văn, điểm chụp ảnh đường đèo quen thuộc.',
   'Dốc đèo nổi tiếng, dừng chụp ảnh.', 'Phố Bảng', 'thiên nhiên – điểm ngắm cảnh',
   23.1690, 105.1942, 20, 10, true, 'VISIBLE', ARRAY['Tham Ma'], false,
   'OpenStreetMap Nominatim: "Dốc Thẩm Mã", tra 2026-11-24', 'Sáng hoặc chiều', NULL, now()),

  ('hg-seed-lang-pho-cao', 'Làng Phố Cáo',
   'Làng người Mông với nhà trình tường và hàng rào đá, nằm ven QL4C gần dốc Thẩm Mã.',
   'Làng nhà trình tường, rào đá ven QL4C.', 'Phố Bảng', 'làng du lịch – bản làng',
   23.2008, 105.1759, 45, 20, true, 'VISIBLE', ARRAY['Pho Cao'], false,
   'OpenStreetMap Nominatim: "Phố Cáo" (village), tra 2026-11-24', NULL, NULL, now()),

  ('hg-seed-doc-chin-khoanh', 'Dốc Chín Khoanh',
   'Đoạn đèo nhiều vòng cua trên QL4C, nhìn xuống thung lũng; dừng chụp ảnh trên đường lên Đồng Văn.',
   'Đèo nhiều vòng cua, dừng chụp ảnh.', 'Phố Bảng', 'thiên nhiên – điểm ngắm cảnh',
   23.2099, 105.1952, 15, 10, true, 'VISIBLE', ARRAY['Chin Khoanh'], false,
   'OpenStreetMap Nominatim: "Chin Khoanh Pass" (viewpoint), tra 2026-11-24', NULL, NULL, now()),

  ('hg-seed-pho-bang', 'Phố cổ Phố Bảng',
   'Thị trấn biên giới cũ với dãy nhà trình tường, mái ngói âm dương.',
   'Thị trấn cổ nhà trình tường.', 'Phố Bảng', 'văn hóa',
   23.2531, 105.1851, 45, 30, false, 'VISIBLE', ARRAY['Pho Bang'], false,
   'OpenStreetMap Nominatim: tâm hành chính xã Phố Bảng (XẤP XỈ, cần chỉnh về khu phố cổ), tra 2026-11-24', NULL, NULL, now()),

  ('hg-seed-cho-phien-dong-van', 'Chợ phiên Đồng Văn',
   'Chợ phiên họp sáng Chủ nhật ở trung tâm Đồng Văn, nơi người dân các bản xuống mua bán.',
   'Chợ phiên sáng Chủ nhật.', 'Đồng Văn', 'chợ phiên',
   23.2769, 105.3610, 60, 30, false, 'VISIBLE', ARRAY['Dong Van Market'], false,
   'OpenStreetMap Nominatim: "Dong Van Market" (marketplace), tra 2026-11-24', 'Sáng Chủ nhật', 'Giờ họp chợ 06:00–12:00 là ước lượng.', now()),

  ('hg-seed-cho-phien-meo-vac', 'Chợ phiên Mèo Vạc',
   'Chợ phiên sáng Chủ nhật ở trung tâm Mèo Vạc.',
   'Chợ phiên sáng Chủ nhật.', 'Mèo Vạc', 'chợ phiên',
   23.1644, 105.4088, 45, 30, false, 'VISIBLE', ARRAY['Meo Vac Market'], false,
   'OpenStreetMap Nominatim: "Chợ trung tâm huyện Mèo Vạc" (marketplace), tra 2026-11-24', 'Sáng Chủ nhật', 'Giờ họp chợ 06:00–12:00 là ước lượng.', now()),

  ('hg-seed-thac-du-gia', 'Thác Du Già',
   'Thác nước gần bản Du Già, có hồ nước dưới chân thác.',
   'Thác nước gần bản Du Già.', 'Du Già', 'thiên nhiên – thắng cảnh',
   22.9255, 105.1977, 60, 30, true, 'VISIBLE', ARRAY['Du Gia Waterfall'], false,
   'OpenStreetMap Nominatim: "Du Gia Waterfalls" (waterfall), tra 2026-11-24', 'Ban ngày', NULL, now()),

  ('hg-seed-nui-cam', 'Núi Cấm',
   'Ngọn núi trong TP Hà Giang, có đường lên ngắm toàn cảnh thành phố và sông Lô.',
   'Ngắm toàn cảnh TP Hà Giang.', 'TP Hà Giang', 'thiên nhiên – điểm ngắm cảnh',
   22.8240, 104.9782, 45, 30, true, 'VISIBLE', ARRAY['Nui Cam'], false,
   'OpenStreetMap Nominatim: "Núi Cấm" (peak), tra 2026-11-24', 'Chiều muộn', NULL, now())
ON CONFLICT ("id") DO NOTHING;

-- Giờ mở cửa: 7 ngày/tuần. Thiếu giờ mở => Validator trả INSUFFICIENT_DATA => lịch không lưu được.
--   ROADSIDE: 06:00–18:30 mọi ngày; DAYTIME: 07:00–17:00 mọi ngày;
--   SUNDAY_MARKET: Chủ nhật 06:00–12:00, ngày khác CLOSED.
WITH spec("destinationId", kind) AS (VALUES
  ('hg-seed-doc-bac-sum', 'ROADSIDE'), ('hg-seed-doc-tham-ma', 'ROADSIDE'), ('hg-seed-doc-chin-khoanh', 'ROADSIDE'),
  ('hg-seed-lang-pho-cao', 'ROADSIDE'), ('hg-seed-pho-bang', 'ROADSIDE'), ('hg-seed-nui-cam', 'ROADSIDE'),
  ('hg-seed-hang-lung-khuy', 'DAYTIME'), ('hg-seed-thac-du-gia', 'DAYTIME'),
  ('hg-seed-cho-phien-dong-van', 'SUNDAY_MARKET'), ('hg-seed-cho-phien-meo-vac', 'SUNDAY_MARKET')
)
INSERT INTO "opening_day" ("id", "destinationId", "dayOfWeek", "status")
SELECT s."destinationId" || '-' || lower(w::text), s."destinationId", w,
       CASE WHEN s.kind = 'SUNDAY_MARKET' AND w <> 'SUNDAY' THEN 'CLOSED'::"OpeningStatus" ELSE 'OPEN'::"OpeningStatus" END
FROM spec s CROSS JOIN unnest(enum_range(NULL::"Weekday")) AS w
JOIN "destination" d ON d."id" = s."destinationId"
ON CONFLICT DO NOTHING;

WITH spec("destinationId", opens, closes) AS (VALUES
  ('hg-seed-doc-bac-sum', 360, 1110), ('hg-seed-doc-tham-ma', 360, 1110), ('hg-seed-doc-chin-khoanh', 360, 1110),
  ('hg-seed-lang-pho-cao', 360, 1110), ('hg-seed-pho-bang', 360, 1110), ('hg-seed-nui-cam', 360, 1110),
  ('hg-seed-hang-lung-khuy', 420, 1020), ('hg-seed-thac-du-gia', 420, 1020),
  ('hg-seed-cho-phien-dong-van', 360, 720), ('hg-seed-cho-phien-meo-vac', 360, 720)
)
INSERT INTO "opening_interval" ("id", "openingDayId", "opensAtMinute", "closesAtMinute")
SELECT od."id" || '-i1', od."id", s.opens, s.closes
FROM spec s JOIN "opening_day" od ON od."destinationId" = s."destinationId" AND od."status" = 'OPEN'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- C. CHƯA ĐỦ DỮ LIỆU — KHÔNG CHÈN (cần toạ độ đã kiểm tra trước)
--   - Hẻm Tu Sản (Mèo Vạc): Nominatim không trả kết quả. DB dev có bản [TEST]
--     23.2201,105.4332 nhưng không rõ nguồn => cần ghim trên Google Maps.
--   - Cột mốc Km0 Hà Giang, Bảo tàng tỉnh Hà Giang (TP Hà Giang): chưa có toạ độ.
--   - Chợ phiên Lũng Phìn, Nhà cổ Lao Xa, điểm ngắm Mã Pì Lèng Panorama: chưa có toạ độ.
--   - Đèo Mã Pì Lèng: OSM đặt "Ma Pi Leng Pass" viewpoint ở 23.2406,105.4121, lệch
--     khoảng 1,2 km so với DB (23.2400,105.4000) => nên kiểm tra lại.
-- ---------------------------------------------------------------------

-- Kiểm tra sau khi chạy (mong đợi 10 dòng, mỗi dòng 7 opening_day):
-- SELECT d."name", count(od.*) FROM "destination" d JOIN "opening_day" od ON od."destinationId" = d."id"
-- WHERE d."id" LIKE 'hg-seed-%' GROUP BY d."name";

COMMIT;

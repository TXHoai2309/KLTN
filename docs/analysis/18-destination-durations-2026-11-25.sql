-- =====================================================================
-- D10: Cập nhật thời lượng tham quan theo hoạt động thực tế (đã duyệt 2026-11-25)
-- Đi kèm: docs/specs/trip-review-lessons-c6be04d7-spec.md (D10) & docs/decisions.md (ADR-56)
--
-- Chạy thử trên DB dev trước. Toàn bộ nằm trong một transaction, chạy lại
-- được nhiều lần (idempotent WHERE theo id hoặc tên chuẩn).
-- KHÔNG chạy file này trên production khi chưa được phép.
-- =====================================================================
BEGIN;

-- Hang Lùng Khúy: 120 / 75 phút (gồm thời gian đi bộ lên cửa hang và tham quan hang)
UPDATE "destination"
SET
  "suggestedDurationMinutes" = 120,
  "minimumDurationMinutes" = 75,
  "visitNotes" = 'Gồm thời gian đi bộ dốc khoảng 25–30 phút hai chiều lên cửa hang và tham quan bên trong hang.',
  "updatedAt" = now(),
  "contentRevision" = "contentRevision" + 1
WHERE ("id" = 'hg-seed-hang-lung-khuy' OR "name" = 'Hang Lùng Khúy')
  AND ("suggestedDurationMinutes" IS DISTINCT FROM 120 OR "minimumDurationMinutes" IS DISTINCT FROM 75);

-- Sông Nho Quế: 180 / 120 phút (gồm đi thuyền hẻm Tu Sản và di chuyển xuống bến)
UPDATE "destination"
SET
  "suggestedDurationMinutes" = 180,
  "minimumDurationMinutes" = 120,
  "visitNotes" = 'Gồm thời gian di chuyển xuống bến thuyền, chờ thuyền và đi thuyền ngắm hẻm Tu Sản trên sông Nho Quế.',
  "updatedAt" = now(),
  "contentRevision" = "contentRevision" + 1
WHERE ("id" = 'cmvtdsbz1000108jumr696xmd' OR "name" = 'Sông Nho Quế')
  AND ("suggestedDurationMinutes" IS DISTINCT FROM 180 OR "minimumDurationMinutes" IS DISTINCT FROM 120);

-- Làng dệt lanh Lùng Tám: 60 / 45 phút
UPDATE "destination"
SET
  "suggestedDurationMinutes" = 60,
  "minimumDurationMinutes" = 45,
  "visitNotes" = 'Thời lượng xem quy trình se lanh, nhuộm chàm, vẽ sáp ong và trải nghiệm tại hợp tác xã dệt lanh Lùng Tám.',
  "updatedAt" = now(),
  "contentRevision" = "contentRevision" + 1
WHERE ("id" = 'cmvor08h1000207ldzmta1v09' OR "name" = 'Làng dệt lanh Lùng Tám')
  AND ("suggestedDurationMinutes" IS DISTINCT FROM 60 OR "minimumDurationMinutes" IS DISTINCT FROM 45);

COMMIT;

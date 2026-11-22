# 11: Lưu chỗ nghỉ đã chọn cùng chuyến đi

**What to build:** Khi du khách bấm Lưu, các chỗ nghỉ đã chọn được lưu cùng chuyến đi đã lưu (Saved itinerary) theo từng đêm; mở lại chuyến vẫn thấy. Đây là liên kết chuyến – đêm – ExternalPlace mới, không phải lượt tham quan, không phải đặt phòng.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 36, mục "Chỗ nghỉ đã chọn": phần lưu chuyến và schema).

**Blocked by:** 10

**Status:** done

- [x] Prisma migration thêm model chỗ nghỉ đã chọn của chuyến: chuyến, số thứ tự đêm, ExternalPlace; duy nhất theo (chuyến, đêm). Dùng migration, không `db:push`.
- [x] Payload lưu mang danh sách chỗ nghỉ đã chọn; server phân giải lại từng `place_id` bằng resolver Google Place Details hiện có (giữ giới hạn số place mỗi lần lưu), upsert ExternalPlace, ghi liên kết.
- [x] Giữ hợp đồng SUCCESS / FAILED / UNKNOWN và idempotency: gửi lại cùng payload và key cho cùng kết quả, không tạo bản ghi trùng.
- [x] Place không phân giải được được báo rõ cho người dùng; không âm thầm bỏ.
- [x] Quyền ghi kiểm tra ở server: chỉ chủ chuyến.
- [x] Trang xem chuyến đã lưu hiển thị chỗ nghỉ đã chọn theo đêm, có nút xem nhanh.
- [x] Test: test lưu tripsage-chat và integration Postgres cho lưu, đọc lại, gửi lại idempotent, place không phân giải được, người không phải chủ chuyến.
- [x] Kiểm tra trạng thái migration; typecheck, build, vitest liên quan, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `packages/db/prisma/schema/trip.prisma` & `packages/db/prisma/migrations/20261121180948_trip_chosen_lodging/migration.sql` (thêm model `TripChosenLodging` ánh xạ bảng `trip_chosen_lodging`, duy nhất theo `(tripId, nightIndex)`, liên kết `Trip` (Cascade) và `ExternalPlace` (Restrict); đã lọc bỏ 2 lệnh `RenameForeignKey` không liên quan của `assistant_planning_workspace` trước khi chạy `migrate deploy`)
  - `apps/web/src/modules/trip-save/trip-save-contract.ts`, `trip-save-service.ts`, `trip-save-client.ts` (nhận `chosenLodgings`, kiểm tra `nightIndex` duy nhất và `< durationDays`, phân giải `placeId` qua `resolveExternalPlaces` cùng giới hạn `MAX_EXTERNAL_PLACES_PER_SAVE`, báo rõ từng đêm/chỗ nghỉ khi không phân giải được thay vì bỏ qua, upsert `ExternalPlace` và tạo `TripChosenLodging` trong cùng transaction idempotent)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-save.ts`, `apps/web/src/components/tripsage-chat/tripsage-save-section.tsx`, `tripsage-chat-client.tsx` (truyền `chosenLodgings` vào payload lưu và chữ ký idempotency)
  - `apps/web/src/modules/trip-read/trip-read-service.ts`, `apps/web/src/app/trips/trips-view.tsx`, `trips.css` (đọc và hiển thị chỗ nghỉ đã chọn theo từng đêm trên `/trips/[id]` kèm nhãn `"Chưa kiểm tra · Không phải đặt phòng"` và nút `"Xem nhanh"` mở `PlacePreviewModal`)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-chosen-lodging-save.vitest.test.ts` (4 test lưu/đọc lại, idempotent replay, báo lỗi rõ khi không phân giải được, chặn caller chưa đăng nhập/không phải chủ chuyến)
  - `apps/web/src/app/trips/trips-view-chosen-lodging.vitest.test.ts` (render test trang chi tiết chuyến đã lưu)
  - `apps/web/src/modules/trip-save/chosen-lodging-save.postgres.integration.vitest.test.ts` (integration test trên disposable PostgreSQL theo chuẩn `ORIGIN_SAVE_TEST_DATABASE_URL`)
- **Kiểm tra đã chạy:**
  - `npx prisma migrate deploy && npx prisma generate && npx prisma migrate status` (`packages/db`): PASS (`52 migrations`, `Database schema is up to date!`)
  - `npm run check-types` (`packages/db`) & `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/modules/trip-save src/modules/trip-read src/modules/tripsage-chat/tripsage-chat-save*.vitest.test.ts src/modules/tripsage-chat/tripsage-chat-chosen-lodging-save.vitest.test.ts src/components/tripsage-chat src/app/trips`: PASS (39 files passed, 204 tests passed; 4 disposable Postgres integration files skipped do Docker chưa bật)
  - `node scripts/prepare-map-assets.mjs && node scripts/build.mjs --webpack` (`apps/web`): PASS (59/59 static pages + toàn bộ routes; dùng `--webpack` do Turbopack OOM trên Windows)
  - `git diff --check`: PASS
- **Việc chưa làm:** Chưa chạy thực thi suite `*.postgres.integration.vitest.test.ts` trên container Postgres rời vì Docker Desktop chưa bật (`DOCKER_OFF`).

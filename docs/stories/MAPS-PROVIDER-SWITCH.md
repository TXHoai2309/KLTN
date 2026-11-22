# MAPS-PROVIDER-SWITCH — Google Maps với cờ quay lại Stadia

## Status

IN PROGRESS — code local hoàn tất theo yêu cầu implement ngày 2026-11-18; automated/build/review có evidence, nghiệm thu browser/provider live còn mở.

## Goal / Source References

Đáp ứng yêu cầu dùng Google Maps mà giữ nghiệp vụ và khả năng tắt cờ quay về Stadia. Hợp đồng: [spec Q1–Q7](../specs/google-maps-provider-switch-spec.md), [ticket plan](../implementation/google-maps-provider-switch-tickets-plan.md), [runbook](../implementation/google-maps-provider-switch-runbook.md). Product/technical boundaries theo [product contract](../product/product-spec.md), [technical architecture](../architecture/technical-architecture.md), [source baselines](../source-baselines.md), các story US-12/US-28/US-29B/US-30 và [origin/return](TRIP-ORIGIN-ROUND-TRIP.md). Không tự đặt thêm yêu cầu ngoài nguồn đã duyệt; UI giữ hành vi hiện có, không thiết kế lại theo Figma.

## In Scope

- Một cờ môi trường cho interactive maps, routing và origin search; không fallback tự động. Giữ adapter Stadia, credentials và domain auth.
- Explore/pickers/itinerary/owner/member/public companion maps dùng hợp đồng renderer chung; origin Google tìm toàn coverage Việt Nam.
- Route evidence đúng provider, đọc lịch sử tương thích; đọc không route lại hoặc ghi trip. Loại bỏ geometry/metrics giả gán VERIFIED từ UI.
- Giữ quyền, privacy, AI/Validator separation và mutation/idempotency; Google external-place features và Home/Detail iframe hiện có không đổi provider contract.

## Acceptance Criteria / Evidence

- [ ] Cả hai cấu hình chạy đúng trên các màn hình thật theo toàn bộ checklist spec/runbook; Google Map/Places/Routes có live evidence và Stadia rollback được smoke test.
- [x] Automated provider matrix, timeout/error/no-fallback, provenance/rollback, map/picker lifecycle và ownership regression được chạy, phân biệt lỗi baseline.
- [x] Typecheck/build, bundle secret scan, full suite và hai trục code-review có evidence được ghi lại.
- [ ] Live configuration và Google content retention/agreement gate được operator giải quyết; không có claim live acceptance từ mock.

## Roles / Data / API / Writes

Giữ server authorization và ownership hiện có. Public/member không được nhận origin chính xác hoặc origin legs. Read có thể trả transfer evidence từ saved snapshot hợp lệ nhưng không làm mới route. Origin source mở rộng ở JSON contract, giữ legacy values; không đổi Prisma schema và không cần migration. DTO/envelope API hiện có được giữ; attribution origin theo nguồn. Save/Edit vẫn cần xác nhận và SUCCESS/FAILED/UNKNOWN, retry payload/key giống hệt; DB commit là nguồn xác nhận thành công.

## Environment / Error / Recovery

`NEXT_PUBLIC_MAPS_PROVIDER` là cờ build-time công khai, thay routing-only selector cũ; rebuild/deploy lại khi đổi. Google browser key + Map ID tách biệt với private server key. Missing key, quota hoặc timeout không đổi provider/phương tiện. Routing missing vẫn insufficient, UI giữ nội dung ngoài bản đồ. Chi tiết cấu hình và rollback tại runbook.

## Out of Scope / Handoff

Không đổi nghiệp vụ, mở rộng edit external-place, thêm quản lý Google secrets trong Admin, tạo billing account, chạy migration/shared DB, merge/push hoặc deploy production. Chưa có key Google local, nên kiểm thử Google thật/acceptance vẫn pending. Cập nhật kết quả local và review trước commit cuối; không đánh dấu ACCEPTED thay chủ dự án.

## Local Implementation / Verification — 2026-11-18

Code cho GM-01–07 đã nối vào shared selector/renderer, Google origin, routing hiện có, Save provenance và snapshot Read; GM-08 có config/runbook, automated integration, build, secret scan và review. Live checklist của các ticket vẫn mở, không có claim deployment hoặc Google/Stadia live acceptance.

[Verification receipt](../implementation/google-maps-provider-switch-verification.md): production webpack Google build/typecheck PASS, 0 private-key hits trong static bundle; full Vitest 4,214 tests, 3,922 pass, 59 failures đã đối chiếu với 51 baseline + 8 order-dependent companion mock cũ, 232 pending, 1 todo. Targeted provider/rollback tests và 27 map legacy tests pass; chạy đủ legacy scripts, chỉ destination/explore còn lỗi nền đã ghi trước. Hai trục review cùng tìm một P2 mobile first-reveal viewport; đã tái hiện red → green và sửa, không còn unresolved code findings từ review. Không schema/migration mới và không kết nối DB thật.

# 02: Tìm nơi xuất phát bằng Nominatim

**What to build:** Người dùng nhập tên, bấm Tìm, chọn kết quả và xác nhận ghim trong bộ chọn đã có; tìm kiếm lỗi/bận vẫn có thể chọn thủ công mà không mất dữ liệu.

**Blocked by:** 01 — Chọn nơi xuất phát thủ công và nhập giờ đi/về

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Nominatim chỉ được gọi sau explicit submit, không autocomplete hoặc tự reverse-geocode khi kéo ghim; chỉ gửi truy vấn địa điểm, không gửi nhu cầu/ghi chú/thông tin riêng của chuyến.
- [ ] Auth Traveler/Admin trước đọc body/provider; cùng ứng dụng, bounded JSON/response, timeout/cancel, lỗi an toàn và private-no-store theo hợp đồng hiện hành.
- [ ] Cache và admission dùng chung giữa mọi instance bảo đảm tối đa một upstream request/giây toàn ứng dụng; kiểm chứng cả cache miss đồng thời, timeout, retry và worker chết. Limiter trong process không đủ.
- [ ] Ứng dụng có identifying header/contact, attribution OpenStreetMap, endpoint đổi được bằng cấu hình; ghi rõ ODbL/service limitations. Không đổi key, mua gói hoặc tự dùng Google.
- [ ] Kết quả search đi qua kiểm tra phạm vi server như ghim thủ công; chọn kết quả chưa phải xác nhận ghim. Đổi query/ghim bỏ xác nhận cũ; response cũ không ghi đè lựa chọn mới.
- [ ] UI thể hiện loading/no results/busy/unavailable và retry chủ động; fallback manual luôn dùng được, keyboard/mobile không mất input.
- [ ] PostgreSQL disposable chứng minh shared admission/cache và additive migration nếu có; provider mock phục vụ automated test, không load-test dịch vụ công cộng. Live request evidence báo riêng.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.

## BE handoff — 2026-11-04

**BE: verified; FE/integration: pending.** Triage giữ nguyên, chưa DONE/ACCEPTED.
Chi tiết [contract/evidence/limits](../02-backend-verification.md).

- Revision `origin-search-v1`; POST `/api/trip-origins/search`, strict `{query}`
  public-place input; NFC/trim 2–160 chars. Generic success data có
  `revision/status/results/cached/attribution`; RESULTS/NO_RESULTS riêng.
  Result giữ origin-v1 nhưng NOMINATIM/confirmed=false. Không tự confirm.
- Errors 400 INVALID_ORIGIN_QUERY, 401/403 auth/origin, 415 content type,
  413 input size, 429 ORIGIN_SEARCH_BUSY (Retry-After 4),
  503 ORIGIN_SEARCH_UNAVAILABLE. Private-no-store, auth trước đọc body/provider.
  Không dùng mutation envelope cho read-only search; không trả raw provider error.
- Null/timezone theo origin-v1; search không đặt clock hoặc thay needs/review.
  Vietnam polygon guard dùng chung manual; không dựa riêng country filter.
- Shared DB admission commit trước I/O: reserve 4 giây, budget upstream 3 giây,
  giữ 1 giây cooldown; monotonic timing không kéo dài claim khi DB trả chậm.
  Cache hash query/endpoint/revision, TTL một ngày, empty results được cache;
  response/cached rows đều allowlist/coverage-checked. Cancel/death không release.
- Additive migration `20261104110000_origin_search`: đã áp **chỉ** PostgreSQL
  disposable riêng, scoped status up to date/zero pending; chưa áp DB dùng chung.
  Prisma/Varlock generation thực hiện; không sửa actual `.env`/credentials.
- Provider identification/config: optional server-only NOMINATIM_CONTACT và
  NOMINATIM_SEARCH_ENDPOINT. Không có contact hợp lệ thì unavailable, manual
  fallback vẫn dùng được. Attribution OSM/ODbL trong mọi success search.
- Fixtures [`origin-search-fixtures.ts`](../../../apps/web/src/modules/trip-origin/origin-search-fixtures.ts)
  và client-safe [`origin-search-contract.ts`](../../../apps/web/src/modules/trip-origin/origin-search-contract.ts).
  Loading là client in-flight state. FE: explicit submit/stale cancel/results/
  attribution, query edits invalidate confirm, no autocomplete/reverse-geocode.
- Evidence: search 15 tests PASS; PostgreSQL migration/cache/3-process admission/
  worker-death 4 PASS, ownership cleanup PASS; root typecheck/isolated webpack
  build PASS. No actual public Nominatim call/load test; FE/browser/live pending.
- Next BE: 03, không đánh blocker vertical 01/02 hoàn tất từ BE evidence.


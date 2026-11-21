# 01: Client SerpApi dùng chung và xoay key

**What to build:** Một helper server-only gọi SerpApi (`https://serpapi.com/search.json`) dùng chung cho chỗ ở và chuyến bay. Đọc `SERPAPI_API_KEYS` (danh sách key, phân cách dấu phẩy) mỗi lần gọi. Dùng key theo thứ tự: giữ key hiện tại tới khi SerpApi trả 429 hoặc báo hết lượt, khi đó chuyển sang key kế tiếp và thử lại request đó với key mới (mỗi key tối đa một lần). Hết key → kết quả `UNAVAILABLE`. Timeout 8 giây, giới hạn kích thước phản hồi, không retry cho lỗi khác. Ghi amendment vào `docs/decisions.md`.

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (user story 12–14, mục "Key, quota và cấu hình", "Lỗi và an toàn", D3, D9).

**Blocked by:** —

**Status:** done

- [x] Amendment trong `docs/decisions.md` ngay dưới đoạn TripSage P2: Amadeus Self-Service đóng 2026-07-17, Duffel cần tài khoản thương mại → thay cả hai bằng SerpApi `google_hotels` / `google_flights`; giữ nguyên lookup only, không booking/payment/persistence; dẫn tới spec.
- [x] `.env.schema`: thêm `SERPAPI_API_KEYS` (`@required=false @sensitive=true`), đọc qua `ENV` như các key khác. Chưa xóa biến Duffel/Amadeus (ticket 02, 04 xóa).
- [x] Helper tái sử dụng `withLookupDeadline`, `readBounded`, `echoesCredential` có sẵn (`tripsage-provider-response.ts`, `tripsage-places.ts`). `fetch` được inject để test.
- [x] Nhận diện hết lượt: HTTP 429, hoặc HTTP lỗi kèm thông điệp hết lượt của SerpApi. Lỗi khác (500, timeout, JSON hỏng) → `UNAVAILABLE`, không chuyển key.
- [x] Vị trí key hiện tại giữ trong bộ nhớ tiến trình (không lưu DB). Thứ tự, không round-robin.
- [x] Key không xuất hiện trong log, lỗi trả về hay kết quả. URL request (chứa `api_key`) không được ghi log.
- [x] Vitest: key 1 → 429 → key 2 thành công; mọi key 429 → `UNAVAILABLE`; 500 không chuyển key; timeout; phản hồi quá lớn; danh sách rỗng/thiếu biến → `UNAVAILABLE` không gọi mạng; kết quả chứa key → `UNAVAILABLE`.
- [x] Typecheck, vitest module, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi / thêm:**
  - `apps/web/src/modules/tripsage-chat/tripsage-serpapi.ts` (client SerpApi dùng chung, xoay key tuần tự trên 429/quota exhausted, timeout 8s, đọc phản hồi giới hạn byte, chặn credential echo).
  - `apps/web/src/modules/tripsage-chat/tripsage-serpapi.vitest.test.ts` (12 unit test).
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-runtime.ts` (thêm `tripsageSerpApiRuntime` đọc `ENV.SERPAPI_API_KEYS` dùng `sharedSerpApiKeyState`).
  - `apps/web/.env.schema`, `apps/web/.env.example` (thêm `SERPAPI_API_KEYS` `@required=false @sensitive=true`, chạy `npm run env:generate`).
  - `docs/decisions.md` (thêm amendment SerpApi ngay dưới đoạn TripSage P2).
- **Kiểm tra đã chạy:**
  - `npm run env:generate`: PASS.
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat` (`apps/web`): PASS (36 files / 357 tests, gồm 12 test mới).
  - `git diff --check`: PASS.
- **Việc chưa làm:** Chưa gọi SerpApi thật (`NOT verified live`); xóa Duffel/Amadeus và đấu nối adapter ở ticket 02, 04.

# 06: Kiểm thử hồi quy và tài liệu

**What to build:** Chạy toàn bộ kiểm tra, đối chiếu 13 tiêu chí nghiệm thu của spec, cập nhật tài liệu, và chạy thử với key thật nếu chủ dự án đã cung cấp.

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (Testing Decisions, tiêu chí 1–13).

**Blocked by:** 01–05

**Status:** done

- [x] Bảng đối chiếu tiêu chí 1–13: mỗi tiêu chí chỉ ra test nào chứng minh, hoặc ghi "chưa kiểm" và lý do.
- [x] Không còn tham chiếu Duffel/Amadeus trong code, `.env.schema`, test (trừ lịch sử trong `docs/decisions.md` và tài liệu cũ).
- [x] Key không lọt bundle trình duyệt: test client-source chặn `SERPAPI`; build `apps/web` rồi tìm chuỗi `SERPAPI` và `serpapi.com/search` trong output client.
- [x] Typecheck, build, toàn bộ vitest `src/modules/tripsage-chat` và `src/components/tripsage-chat`, `git diff --check`. Nêu rõ lỗi nền có sẵn từ trước nếu có.
- [x] Chạy thử với key thật (chỉ khi `SERPAPI_API_KEYS` có trong `.env` local, tối đa ~6 lượt): một lịch Đồng Văn/Mèo Vạc 2 đêm và một chuyến DAD → HAN. Ghi số kết quả có giá / chưa có giá mỗi khu. Không có key thì ghi "chưa chạy live". *(Đã kiểm tra biến qua `varlock run`: `HAS_SERPAPI_KEYS=false` → **chưa chạy live**.)*
- [x] Cập nhật `docs/ai-progress.md`; ghi chú vào spec mục trạng thái: implemented / automated verification / live check.

## Đối chiếu 13 tiêu chí nghiệm thu (`docs/specs/serpapi-travel-lookup-spec.md`)

| # | Tiêu chí | Bằng chứng tự động / Trạng thái |
|---|---|---|
| 1 | Tự tra chỗ ở: lịch 4 đêm 3 khu → 3 lượt song song; bản nháp tạm → 0 lượt; lặp cùng tham số → 0 lượt mới | PASS — `tripsage-auto-lodging.vitest.test.ts` (parallel 3-area merge, `ASSUMED_DRAFT_BLOCKED`, same-turn + cross-turn dedup via `data-hotels-ref`). |
| 2 | Loại chỗ ở: hỏi gộp một lần khi chưa biết, đã nêu không hỏi lại, `q` đúng loại | PASS — `tripsage-serpapi-hotels.vitest.test.ts` (4 loại `HOTEL`/`HOMESTAY`/`GUESTHOUSE`/`ANY` → `q`), `tripsage-auto-lodging.vitest.test.ts` (prompt `lodgingKind` khi cờ bật). Hành vi hội thoại LLM thật chưa chạy live. |
| 3 | Lọc 10 km: loại kết quả xa > 10 km hoặc thiếu tọa độ; không còn gì → `NO_RESULTS` | PASS — `tripsage-serpapi-hotels.vitest.test.ts`. |
| 4 | Có giá / chưa có giá: tối đa 5 + 3, đúng nhãn | PASS — `tripsage-serpapi-hotels.vitest.test.ts`, `tripsage-chat-parts.vitest.test.ts`, `tripsage-result-cards.vitest.test.ts` (`"Chưa có giá online"`). |
| 5 | Không mặc định bay: `shouldSuggestHub` bật chưa rõ → hỏi; chọn tàu/xe khách → 0 request; chọn máy bay/so sánh → 1 request | PASS — `tripsage-access-leg-flights.vitest.test.ts` (`hubHint`, `flightDeclined`, `TRAIN` 0 request, `FLIGHT` 1 request). |
| 6 | Sân bay: Đà Nẵng → `DAD`, Hội An → `DAD`, TP.HCM → `SGN`, Hà Nội → không tra; model không tự đặt mã | PASS — `tripsage-serpapi-flights.vitest.test.ts` (`vietnam-airports.ts`, `ORIGIN_REQUIRED`, `ALREADY_NEAR_HAN`, strict schema rejects `origin`/`destination`). |
| 7 | Giá chặng FLIGHT: có kết quả dùng giá rẻ nhất/người kèm nguồn; lỗi giữ ước tính kèm nhãn `"ước tính"` | PASS — `tripsage-access-leg-flights.vitest.test.ts` (`GOOGLE_FLIGHTS` override + `ESTIMATE` fallback + `TripsageAccessLegCard` render test kể cả part cũ). |
| 8 | Xoay key: key 1 trả 429 → key 2; hết mọi key → `UNAVAILABLE`, AI vẫn trả lời | PASS — `tripsage-serpapi.vitest.test.ts` (429/403 quota rotation, shared state, exhausted pool), `tripsage-feature-matrix.vitest.test.ts`. |
| 9 | Lỗi: timeout, HTTP lỗi, JSON sai schema, phản hồi quá lớn → `UNAVAILABLE`, không bịa giá | PASS — `tripsage-serpapi.vitest.test.ts`, `tripsage-serpapi-hotels.vitest.test.ts`, `tripsage-serpapi-flights.vitest.test.ts`. |
| 10 | Cờ: tắt cờ nào không có tool & không có prompt; tắt cả giữ nguyên tool/prompt cơ bản | PASS — `tripsage-feature-matrix.vitest.test.ts` (32 tổ hợp cờ + Varlock loader), `tripsage-chat-context-http.vitest.test.ts`, `tripsage-auto-lodging.vitest.test.ts`. |
| 11 | Secrets: key không lọt response, stream, log, bundle trình duyệt | PASS — `tripsage-serpapi.vitest.test.ts` (`echoesCredential`, 0 console log), `tripsage-chat-stream-redaction.vitest.test.ts`, `tripsage-chat-client-source.vitest.test.ts` (chặn `SERPAPI`), quét `.next/static` 274 file = 0 kết quả `SERPAPI`/`serpapi.com/search`. |
| 12 | Không đặt chỗ: không có luồng đặt/thanh toán; kết quả không vào `proposeItinerary` và không là PASS | PASS — `tripsage-chat-stream-redaction.vitest.test.ts`, `tripsage-result-cards.vitest.test.ts`, `tripsage-access-leg-flights.vitest.test.ts`. |
| 13 | Kiểm tra dự án + chạy thử key thật | Tự động: PASS (`tsc --noEmit`, 47/47 file / 408/408 test Vitest, build `apps/web --webpack` 59/59 trang tĩnh, `git diff --check`). Live key thật: **chưa chạy live** vì `SERPAPI_API_KEYS` chưa cấu hình trong `.env` local. |

## Ghi chú hoàn thành

- **File đã đổi:**
  - `docs/specs/serpapi-travel-lookup-spec.md` (cập nhật mục trạng thái tách biệt Implemented / Automated verification / Live check).
  - `docs/ai-progress.md` (bổ sung mục tổng kết SerpApi tickets 01–06).
  - `.scratch/serpapi-travel-lookup/issues/06-regression-docs.md`, `.scratch/serpapi-travel-lookup/README.md`.
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat src/components/tripsage-chat` (`apps/web`): PASS (47/47 files, 408/408 tests; không có lỗi nền trong phạm vi hai thư mục này).
  - `node scripts/prepare-map-assets.mjs && node scripts/build.mjs --webpack` (`apps/web`): PASS (59/59 trang tĩnh + toàn bộ route động/API; dùng `--webpack` trên Windows để tránh OOM worker Turbopack).
  - Quét bundle client `apps/web/.next/static` (274 file) tìm `SERPAPI` / `serpapi.com/search`: PASS (0 kết quả).
  - `git grep -in "duffel|amadeus"` trên `apps/web/src/`, `.env.schema`, `.env.example`: PASS (0 kết quả).
  - `git diff --check`: PASS.
- **Việc chưa làm / còn mở:**
  - **Chưa chạy live với `SERPAPI_API_KEYS` thật** (biến chưa có giá trị trong `.env` local); JSON thật của SerpApi và độ phủ tại Hà Giang cần xác minh khi có key.
  - Chủ dự án cần kiểm tra danh sách tọa độ sân bay trong `apps/web/src/modules/tripsage-chat/vietnam-airports.ts`, bổ sung/duyệt bảng giá tàu/xe khách trong `docs/fixtures/price-reference-ha-giang.md`, và kiểm tra điều khoản SerpApi về việc dùng nhiều tài khoản free.
  - Chưa mở trình duyệt thực tế ở 375px để chụp ảnh kiểm tra trực quan (mới kiểm bằng render test + CSS hiện có).

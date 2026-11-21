# 04: Tra vé máy bay qua SerpApi, sân bay do server chọn

**What to build:** Thay adapter Duffel bằng adapter SerpApi `google_flights` giữ kiểu kết quả `FlightOutcome`. Sân bay đi do server chọn: sân bay dân dụng Việt Nam gần tọa độ nơi xuất phát nhất; model chỉ truyền mã khi người dùng tự nêu sân bay. Sân bay đến cố định `HAN`. Một lượt tra cho cả khứ hồi (tổng giá + chi tiết chiều đi). Xóa toàn bộ Duffel.

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (user story 7, 8, 10, 11, mục "Chặng ra Hà Nội và vé máy bay", D3, D4).

**Blocked by:** 01

**Status:** done

- [x] Danh sách tĩnh sân bay dân dụng Việt Nam (mã IATA, tên, tọa độ) trong một file module, kèm comment "cần chủ dự án kiểm tra". Hàm chọn sân bay gần nhất theo `haversine`.
- [x] Input tool `searchFlights`: bỏ `origin`/`destination` bắt buộc; thêm `originAirport` tùy chọn (chỉ khi người dùng nêu). Server lấy tọa độ nơi xuất phát đã xác nhận từ `journey` của request; không có → lỗi rõ ràng cho model, không gọi mạng. Nơi xuất phát gần HAN hơn mọi sân bay khác (đã ở Hà Nội) → không tra.
- [x] Truy vấn: `engine=google_flights`, `departure_id`, `arrival_id=HAN`, `outbound_date`, `return_date` + `type=1` khi khứ hồi, `type=2` khi một chiều, `adults`, `currency=VND`, `gl=vn`, `hl=vi`, `sort_by=2`. Không gọi lượt thứ hai với `departure_token`.
- [x] Parse bằng zod `best_flights` + `other_flights`: segments (sân bay, giờ, hãng, số hiệu), `price`, `layovers`; `price_insights.typical_price_range` nếu có. Tối đa 5 lựa chọn rẻ nhất.
- [x] `FlightsPart` thêm khoảng giá thường gặp (tùy chọn) và cờ khứ hồi; card ghi "xem chi tiết chiều về trên Google Flights" khi khứ hồi và dòng nguồn SerpApi. Part cũ đã lưu vẫn đọc được.
- [x] Runtime dùng helper ticket 01. Xóa `tripsage-duffel.ts`, test của nó, `DUFFEL_ACCESS_TOKEN` và mọi tham chiếu (kể cả mẫu chặn trong test redaction/client-source).
- [x] Vitest: chọn sân bay (Đà Nẵng → DAD, Hội An → DAD, TP.HCM → SGN, Hà Nội → không tra); khứ hồi; một chiều; không có chuyến; schema sai; model không truyền mã thì không có mã do model đoán.
- [x] Typecheck, vitest liên quan, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi / thêm / xóa:**
  - Thêm `apps/web/src/modules/tripsage-chat/vietnam-airports.ts` (22 sân bay dân dụng Việt Nam kèm comment cần chủ dự án kiểm tra, chọn sân bay gần nhất bằng `haversine`).
  - Thêm `apps/web/src/modules/tripsage-chat/tripsage-serpapi-flights.ts` + `apps/web/src/modules/tripsage-chat/tripsage-serpapi-flights.vitest.test.ts` (12 unit test).
  - Xóa `apps/web/src/modules/tripsage-chat/tripsage-duffel.ts` và `apps/web/src/modules/tripsage-chat/tripsage-duffel.vitest.test.ts`.
  - Cập nhật `tripsage-extra-tools.ts` (`searchFlights` bỏ `origin`/`destination`, thêm `originAirport` tùy chọn, chọn sân bay từ `confirmedOrigin`, đích cố định `HAN`, chặn `ORIGIN_REQUIRED`/`ALREADY_NEAR_HAN`), `tripsage-chat-tools.ts`, `tripsage-features.ts`, `tripsage-chat-runtime.ts`.
  - Cập nhật `tripsage-chat-parts.ts` (`roundTrip`, `typicalPriceRange`, `totalDurationMinutes`, tương thích ngược `FlightsPart` cũ) và `tripsage-result-cards.tsx` (hiện khoảng giá thường gặp, dòng "xem chi tiết chiều về trên Google Flights", dòng nguồn SerpApi).
  - Xóa `DUFFEL_ACCESS_TOKEN` khỏi `apps/web/.env.schema` và `apps/web/.env.example`, chạy `npm run env:generate`.
  - Cập nhật test liên quan (`tripsage-chat-client-source`, `tripsage-result-cards`, `tripsage-chat-parts`, `tripsage-extra-tools`, `tripsage-chat-stream-redaction`, `tripsage-feature-matrix`, `tripsage-chat-context-http` — chuyển Duffel sang SerpApi và cập nhật input `originAirport`).
- **Kiểm tra đã chạy:**
  - `npm run env:generate`: PASS.
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat src/components/tripsage-chat` (`apps/web`): PASS (46 files / 402 tests).
  - `git diff --check` và quét còn sót `duffel`/`DUFFEL`: PASS (0 kết quả).
- **Việc chưa làm:** Chưa chạy live với SerpApi thật (`NOT verified live`); danh sách tọa độ sân bay trong `vietnam-airports.ts` cần chủ dự án kiểm tra trước khi nghiệm thu.

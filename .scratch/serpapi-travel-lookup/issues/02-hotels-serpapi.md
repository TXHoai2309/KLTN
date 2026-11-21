# 02: Tra giá chỗ ở qua SerpApi

**What to build:** Thay adapter Amadeus bằng adapter SerpApi `google_hotels` giữ nguyên kiểu kết quả `RESULTS` / `NO_RESULTS` / `UNAVAILABLE`. Tool `searchHotels` nhận thêm loại chỗ ở. Kết quả lọc 10 km quanh điểm đến, chia nhóm có giá (tối đa 5) và chưa có giá online (tối đa 3). Card kết quả hiện điểm đánh giá và nhóm chưa có giá. Xóa toàn bộ Amadeus.

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (user story 2, 4, 5, 10, 11, mục "Chỗ ở", D2, D3, D5).

**Blocked by:** 01

**Status:** done

- [x] Input tool thêm `kind: "HOTEL" | "HOMESTAY" | "GUESTHOUSE" | "ANY"` (mặc định `ANY`). Vẫn nhận `destinationId`; tọa độ và tên lấy từ `destinationPoint` (DB), không từ model.
- [x] Truy vấn: `engine=google_hotels`, `q` = cụm từ theo loại (`khách sạn` / `homestay` / `nhà nghỉ` / `chỗ ở`) + ` gần <tên điểm đến>, Hà Giang`, `check_in_date`, `check_out_date`, `adults`, `currency=VND`, `gl=vn`, `hl=vi`. Không dùng `property_types`.
- [x] Parse bằng zod (trường thừa bỏ qua, trường cần thiết sai → `UNAVAILABLE`): `properties[].name`, `gps_coordinates`, `rate_per_night.extracted_lowest`, `total_rate.extracted_lowest`, `overall_rating`, `reviews`. Tên làm sạch bằng `cleanPlaceName`.
- [x] Bỏ kết quả không có tọa độ hoặc xa hơn 10 km (`haversine`); sắp theo khoảng cách. Có giá: tối đa 5; chưa có giá: tối đa 3. Không còn gì → `NO_RESULTS`.
- [x] `HotelsPart` (`tripsage-chat-parts.ts`) và hợp đồng lưu hội thoại nhận thêm `rating` (nullable) và `price` nullable cho nhóm chưa có giá; card hiện nhãn "chưa có giá online", dòng nguồn "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ." Hội thoại cũ đã lưu với `HotelsPart` dạng cũ vẫn đọc được.
- [x] `priceNote` và mô tả tool đổi provider thành Google/SerpApi. Kết quả vẫn không vào `proposeItinerary`, không gắn được làm gợi ý `LODGING`.
- [x] Runtime: `tripsageHotelRuntime` dùng helper ticket 01. Xóa `tripsage-amadeus.ts`, test của nó, `AMADEUS_*` trong `.env.schema`/`env.server` và mọi tham chiếu (kể cả test redaction/client-source: thay mẫu chặn `AMADEUS_` bằng `SERPAPI`).
- [x] Vitest adapter với fixture: có giá, chưa có giá, ngoài 10 km, thiếu tọa độ, rỗng, schema sai, mỗi `kind` tạo đúng `q`. Render test card: nhóm có giá + nhóm chưa có giá; part cũ vẫn render.
- [x] Typecheck, vitest `src/modules/tripsage-chat` và `src/components/tripsage-chat`, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi / thêm / xóa:**
  - Thêm `apps/web/src/modules/tripsage-chat/tripsage-serpapi-hotels.ts` + `apps/web/src/modules/tripsage-chat/tripsage-serpapi-hotels.vitest.test.ts` (13 unit test).
  - Xóa `apps/web/src/modules/tripsage-chat/tripsage-amadeus.ts` và `apps/web/src/modules/tripsage-chat/tripsage-amadeus.vitest.test.ts`.
  - Cập nhật `tripsage-chat-parts.ts` (`rating`, `reviews`, `price.perNight`, `price` nullable, tối đa 5 có giá + 3 chưa có giá, giữ tương thích `HotelsPart` cũ; lưu ý `assistant-conversation-contract.ts` chủ ý không lưu `data-hotels` vào DB theo quy tắc không lưu kết quả tra cứu), `tripsage-extra-tools.ts`, `tripsage-chat-tools.ts`, `tripsage-features.ts`, `tripsage-chat-runtime.ts`.
  - Cập nhật `tripsage-result-cards.tsx` + `tripsage-result-cards.module.css` (nhóm có giá + nhóm "Chưa có giá online", điểm đánh giá, dòng nguồn Google qua SerpApi).
  - Xóa `AMADEUS_*` khỏi `apps/web/.env.schema` và `apps/web/.env.example`, chạy `npm run env:generate`.
  - Cập nhật test liên quan (`tripsage-chat-client-source`, `tripsage-result-cards`, `tripsage-chat-parts`, `tripsage-extra-tools`, `tripsage-chat-stream-redaction`, `tripsage-feature-matrix` — đổi Amadeus sang SerpApi và thay mẫu chặn `AMADEUS_` bằng `SERPAPI`).
- **Kiểm tra đã chạy:**
  - `npm run env:generate`: PASS.
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat src/components/tripsage-chat` (`apps/web`): PASS (45 files / 398 tests).
  - `git diff --check` và quét còn sót `amadeus`/`AMADEUS`: PASS (0 kết quả).
- **Việc chưa làm:** Chưa chạy với key SerpApi thật (`NOT verified live`).

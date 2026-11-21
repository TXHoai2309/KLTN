# 05: Hỏi phương tiện và dùng giá vé thật cho chặng tiếp cận

**What to build:** Khi `shouldSuggestHub` bật (gợi ý `hubHint` trong `proposeItinerary`) và người dùng chưa nói cách ra Hà Nội, trợ lý hỏi một lần: máy bay, tàu hỏa, xe khách, hoặc so sánh. Chỉ khi chọn máy bay hoặc so sánh thì gọi `searchFlights`. `planAccessLeg` dùng giá rẻ nhất/người từ kết quả tra trong hội thoại cho đoạn FLIGHT, kèm nguồn; tàu/xe khách giữ ước tính có nhãn "ước tính".

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (user story 6, 7, 9, mục "Chặng ra Hà Nội và vé máy bay", "Tàu, xe khách", D6, D7, D10).

**Blocked by:** 04

**Status:** done

- [x] Prompt (theo cờ flights): không mặc định máy bay; hỏi phương tiện đúng một lần khi `hubHint` xuất hiện và chưa rõ; người dùng từ chối bay thì không gọi `searchFlights` cho chuyến đó. Khi cờ flights tắt: vẫn hỏi phương tiện nhưng mọi chặng là ước tính.
- [x] Ước tính tàu/xe khách dựa trên `docs/fixtures/price-reference-ha-giang.md` (đưa nội dung bảng vào ngữ cảnh khi cần, không bịa tuyến không có trong bảng; không có tuyến thì nói không có số tham khảo).
- [x] `segmentSchema` của chặng tiếp cận thêm nguồn giá (`ESTIMATE` | `GOOGLE_FLIGHTS`). `planAccessLeg`: nếu có đoạn FLIGHT và có kết quả `searchFlights` trong hội thoại khớp ngày/số người, server ghi đè `priceVndPerPerson` bằng giá rẻ nhất chia số người và gắn `GOOGLE_FLIGHTS`; còn lại `ESTIMATE`. Model không tự gắn nguồn.
- [x] Card chặng tiếp cận hiện nhãn "giá tham khảo từ Google Flights" hoặc "ước tính" cho từng đoạn. Part cũ không có nguồn hiển thị là "ước tính".
- [x] `estimateCosts` giữ cách cộng dòng "Chặng tiếp cận" hiện có (giá FLIGHT thật đi vào qua chặng tiếp cận là đúng D6; không thêm luồng cộng nào khác).
- [x] Tối đa 1 lần tra chủ động mỗi chuyến; đổi nơi xuất phát hoặc ngày thì được thêm 1 lần.
- [x] Test route chat với `MockLanguageModelV4`: hub bật + chưa rõ phương tiện → có câu hỏi, 0 request; chọn tàu → 0 request, chặng ghi "ước tính"; chọn máy bay → 1 request, đoạn FLIGHT dùng giá thật + nguồn; tra lỗi → giữ ước tính. Render test nhãn nguồn.
- [x] Typecheck, vitest liên quan, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi / thêm:**
  - Thêm `apps/web/src/modules/tripsage-chat/tripsage-price-reference.ts` (đọc mục `## Đi lại` từ `docs/fixtures/price-reference-ha-giang.md` vào ngữ cảnh khi có `homeCity`/`accessLeg`, không sửa file fixture).
  - Cập nhật `apps/web/src/modules/tripsage-chat/tripsage-access-leg.ts` (`ACCESS_PRICE_SOURCES`, tách `inputSegmentSchema` không cho model truyền `priceSource` và `partSegmentSchema` tùy chọn `priceSource`/`priceLookupDate` giữ tương thích part cũ, `buildAccessLeg` hỗ trợ `FlightPriceOverride` ghi đè giá đoạn `FLIGHT` theo giá rẻ nhất/người).
  - Cập nhật `apps/web/src/components/tripsage-chat/tripsage-access-leg-card.tsx` (hiện nhãn `"giá tham khảo từ Google Flights"` hoặc `"ước tính"` cho từng đoạn, part cũ không có nguồn hiện `"ước tính"`, thêm dòng nguồn Google/SerpApi khi có giá Google Flights).
  - Cập nhật `tripsage-chat-parts.ts`, `tripsage-chat-context.ts`, `tripsage-extra-tools.ts`, `tripsage-chat-tools.ts`, `tripsage-chat-service.ts`, `tripsage-chat-http.ts`, `tripsage-features.ts` (`flightDeclined`, `data-flights-ref`, `parseTripsageChatPriorFlightLookups`, giới hạn 1 lần tra chủ động + 1 lần khi đổi ngày/nơi đi, `hubHint` hỏi phương tiện 1 lần không mặc định bay).
  - Thêm `apps/web/src/modules/tripsage-chat/tripsage-access-leg-flights.vitest.test.ts` (6 test kịch bản route + render card).
  - Cập nhật `tripsage-chat-client-source.vitest.test.ts` (thêm `tripsage-price-reference` vào `SERVER_ONLY_CHAT`), `tripsage-extra-tools.vitest.test.ts` (3 ngày đi khác nhau cho test giới hạn song song vì có chống tra trùng), `tripsage-chat-stream-redaction.vitest.test.ts` (cập nhật metadata `FlightsPart` và 2 ngày đi khác nhau cho test ID liên tiếp).
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat src/components/tripsage-chat` (`apps/web`): PASS (47 files / 408 tests sau khi sửa `lookupDate` và label `"Chặng tiếp cận (đi và về)"`).
  - `git diff --check`: PASS.
- **Việc chưa làm:** Chưa chạy kiểm tra live với SerpApi thật; nội dung bảng `docs/fixtures/price-reference-ha-giang.md` giữ nguyên để chủ dự án tự bổ sung/duyệt (D10).

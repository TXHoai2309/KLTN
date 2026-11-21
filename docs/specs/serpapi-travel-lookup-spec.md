# Spec: Tra giá vé máy bay và chỗ ở qua SerpApi

Ngày: 2026-11-22 (Asia/Saigon).

Trạng thái (cập nhật 2026-11-22 sau ticket 06):
- **Đã triển khai (Implemented):** Đã hoàn thành toàn bộ tickets 01–05 (`a150ed8`, `f9c12e6`, `3b92071`, `09eec64`, `c26c75c`), đã ghi amendment vào `docs/decisions.md` và xóa toàn bộ code/test/env Duffel & Amadeus.
- **Đã kiểm tra tự động (Automated verification):** PASS (`tsc --noEmit`, 47/47 file / 408/408 test Vitest `src/modules/tripsage-chat` & `src/components/tripsage-chat`, build production `apps/web --webpack` 59/59 trang tĩnh, quét 274 file bundle client `.next/static` 0 kết quả `SERPAPI`/`serpapi.com/search`, `git diff --check` sạch).
- **Chạy thử live (Live check):** **chưa chạy live** (`SERPAPI_API_KEYS` chưa có giá trị trong `.env` local; độ phủ Hà Giang và JSON SerpApi thật chưa được xác minh live). Danh sách sân bay (`vietnam-airports.ts`) và bảng giá tàu/xe khách (`docs/fixtures/price-reference-ha-giang.md`) vẫn chờ chủ dự án duyệt.

## Problem Statement

Quyết định TripSage P1/P2 (decisions.md, sửa đổi 2026-11-20) đã cho phép planning chat **tra cứu giá tham khảo** vé máy bay và khách sạn, sau cờ `TRIPSAGE_FEATURE_FLIGHTS` / `TRIPSAGE_FEATURE_HOTELS`. Không đặt chỗ, không thanh toán, không lưu dữ liệu tra cứu, không dùng kết quả làm ứng viên lịch trình.

Hiện trạng không dùng được:

- Khách sạn dùng Amadeus Self-Service (`tripsage-amadeus.ts`). Amadeus đã đóng cổng Self-Service ngày 2026-07-17 và vô hiệu hóa key, nên tính năng khách sạn là code chết.
- Vé máy bay dùng Duffel (`tripsage-duffel.ts`). Muốn có giá thật thì cần tài khoản thương mại đã được duyệt; nhóm không có.
- Tool hiện tại chỉ chạy khi AI chủ động gọi, mỗi lượt tối đa 2 lần, và AI tự đoán mã sân bay nơi đi.

Người dùng lập chuyến Hà Giang cần biết chi phí lưu trú thực tế cho từng đêm. Người ở xa (Đà Nẵng, TP.HCM…) cần so sánh cách ra Hà Nội. Hiện cả hai chỉ có số AI ước tính.

## Solution

Thay Duffel và Amadeus bằng SerpApi (`google_flights`, `google_hotels`), dùng chung một nhóm key phía server.

- **Chỗ ở:** sau khi người dùng xác nhận ngày và lịch trình, hệ thống tự tra giá cho **mọi khu nghỉ đêm** trong lịch, chạy song song. Kết quả hiện thành card tham khảo, không đổi lịch trình.
- **Vé máy bay:** khi quy tắc chặng tiếp cận hiện có (`shouldSuggestHub`) đề nghị ra Hà Nội, AI hỏi một lần người dùng muốn đi bằng gì. Chỉ khi chọn máy bay hoặc "so sánh giúp" thì mới tra vé tới HAN. Giá thật thay giá ước tính trong chặng máy bay.
- **Tàu, xe khách:** không có nguồn giá trực tuyến; giữ ước tính dựa trên bảng giá tham khảo đã duyệt, mở rộng thêm các tuyến ra Hà Nội.
- **Tìm địa điểm** (có nhà nghỉ, quán ăn nào gần X) vẫn dùng Google Places qua `searchPlaces`, không chuyển sang SerpApi.

## User Stories

1. As a Traveler, I want reference room prices for every overnight area once my trip dates are confirmed, so that I know the lodging cost without asking for each night.
2. As a Traveler, I want to say whether I prefer hotel, homestay or nhà nghỉ, so that the prices shown match how I want to stay.
3. As a Traveler, I want to be asked only once about lodging kind, together with dates and number of people, so that planning is not slowed by extra questions.
4. As a Traveler, I want lodging without an online price to still be listed and marked as such, so that I do not miss small homestays and nhà nghỉ.
5. As a Traveler, I want only lodging near the overnight stop, so that a text search does not show places in another district.
6. As a Traveler starting far from Hà Nội, I want to be asked how I will get there (máy bay, tàu, xe khách, or compare), so that flying is not assumed.
7. As a Traveler who chooses flying, I want real flight prices from my nearest airport to Hà Nội, so that the access-leg cost is realistic.
8. As a Traveler, I want the departure airport chosen from my trip origin, so that I do not need to know IATA codes.
9. As a Traveler choosing tàu or xe khách, I want an estimate clearly labelled as an estimate, so that I do not mistake it for a live price.
10. As a Traveler, I want every price labelled "giá tham khảo, có thể thay đổi, ứng dụng không đặt chỗ", so that I know I must book elsewhere.
11. As a Traveler, I want planning to continue when price lookup fails, so that a provider outage does not block my itinerary.
12. As an operator, I want several SerpApi keys used in order with automatic move to the next on quota exhaustion, so that the team's free quotas cover development and demo.
13. As an operator, I want the flight and hotel groups to stay behind their existing flags, so that each can be turned off independently.
14. As a project owner, I want no SerpApi key in browser bundles, logs, responses or the repository, so that team members' accounts stay safe.

## Implementation Decisions

### Quyết định của chủ dự án (2026-11-22)

| # | Quyết định |
|---|---|
| D1 | Hỏi loại chỗ ở **một lần** khi chưa biết, gộp với câu hỏi ngày/số người: khách sạn, homestay, nhà nghỉ bình dân, hoặc không quan trọng. |
| D2 | Hiện tối đa 5 chỗ **có giá**, sau đó tối đa 3 chỗ **chưa có giá online**. |
| D3 | Xóa code, test và biến môi trường Duffel/Amadeus. SerpApi là nhà cung cấp duy nhất cho hai nhóm này. |
| D4 | Vé khứ hồi: 1 lượt tra, lấy tổng giá khứ hồi + chi tiết chiều đi. Không tra chi tiết chiều về. |
| D5 | Lọc chỗ ở trong bán kính 10 km quanh điểm nghỉ đêm. |
| D6 | Giá tra được không tự cộng vào bảng ước tính chi phí. AI có thể dùng giá đó làm căn cứ cho dòng "Lưu trú"/"Đi lại", ghi "giá tham khảo ngày tra". |
| D7 | Không mặc định đi máy bay. Hỏi phương tiện ra Hà Nội một lần khi `shouldSuggestHub` bật; chỉ tra vé khi chọn máy bay hoặc "so sánh". |
| D8 | Tự tra giá chỗ ở cho **toàn bộ hành trình** sau khi xác nhận ngày, không chờ người dùng hỏi. |
| D9 | Dùng 5 tài khoản free (mỗi thành viên nhóm tự tạo một tài khoản), xoay theo thứ tự. |
| D10 | Bổ sung bảng giá tham khảo tàu/xe khách cho các tuyến ra Hà Nội; chủ dự án kiểm tra số liệu. |

### Nguồn dữ liệu cho từng câu hỏi

- "Gần X có nhà nghỉ/homestay/quán ăn nào?" → `searchPlaces` (Google Places API) như hiện tại. Có `placeId`, không có giá, không tốn lượt SerpApi. Vẫn là nguồn duy nhất cho gợi ý `LODGING` gắn vào timeline.
- "Phòng gần X ngày D giá bao nhiêu?" → SerpApi `google_hotels`.
- "Vé từ nơi tôi ở ra Hà Nội giá bao nhiêu?" → SerpApi `google_flights`.
- Tàu, xe khách → ước tính theo `docs/fixtures/price-reference-ha-giang.md`.

### Chỗ ở

- **Thời điểm tự tra:** khi người dùng đã xác nhận ngày và các điểm nghỉ đêm của bản đề xuất. Không tra trên bản nháp tạm (ticket 04, assumed draft) vì ngày có thể còn đổi.
- **Một lần gọi cho cả lịch:** tool `searchHotels` nhận danh sách tối đa 6 khu nghỉ đêm (id điểm đến từ cơ sở dữ liệu + ngày nhận/trả phòng của từng khu), chạy song song. Các đêm liên tiếp ở cùng khu được gộp thành một lượt tra. Người dùng vẫn có thể hỏi riêng một khu.
- **Không tra trùng:** cùng (khu, ngày, loại chỗ ở, số người) không tra lại trong cùng cuộc hội thoại.
- **Truy vấn:** SerpApi không nhận tọa độ, chỉ nhận chữ. `q` = loại chỗ ở + tên điểm đến + "Hà Giang", ví dụ `homestay gần Phố cổ Đồng Văn, Hà Giang`; "không quan trọng" dùng `chỗ ở gần …`. Tham số `gl=vn`, `hl=vi`, `currency=VND`, `adults` = số người.
- **Lọc vị trí:** tọa độ điểm đến lấy từ cơ sở dữ liệu KLTN, không lấy từ input của model. Bỏ kết quả có `gps_coordinates` xa hơn 10 km (dùng `haversine` hiện có) hoặc không có tọa độ.
- **Kết quả:** tên, khoảng cách, điểm đánh giá, giá/đêm, tổng giá; tối đa 5 chỗ có giá rồi tối đa 3 chỗ "chưa có giá online". Không có kết quả trong bán kính → `NO_RESULTS`.
- **Giới hạn:** không dùng bộ lọc `property_types` vì Google Hotels không có loại homestay/nhà nghỉ và gắn nhãn homestay là "Khách sạn".
- Kết quả chỉ để tham khảo: không vào `proposeItinerary`, không là PASS của Validator, không gắn được làm gợi ý `LODGING` (gợi ý này vẫn cần `placeId` từ `searchPlaces`).

### Chặng ra Hà Nội và vé máy bay

- Dựa trên chặng tiếp cận hiện có (`tripsage-access-leg.ts`, các mode FLIGHT / SLEEPER_BUS / TRAIN / SHUTTLE): chỉ hiển thị, không kiểm tra, không lưu.
- Điều kiện gợi ý giữ nguyên `shouldSuggestHub`. Không thêm ngưỡng khoảng cách mới.
- Khi người dùng chưa nói phương tiện, AI hỏi một lần: "Bạn muốn ra Hà Nội bằng máy bay, tàu hỏa hay xe khách? (hoặc để mình so sánh giúp)". Người dùng từ chối bay thì không tra vé cho chuyến đó.
- **Sân bay đi do server chọn:** sân bay gần tọa độ nơi xuất phát nhất trong một danh sách tĩnh các sân bay dân dụng Việt Nam. Model không truyền mã IATA, trừ khi người dùng tự nêu sân bay ("bay từ Huế"). Sân bay đến cố định `HAN`.
- **Ngày:** đi = ngày bắt đầu chuyến, về = ngày cuối chuyến. Một lượt tra `type=1` (khứ hồi) hoặc `type=2` (một chiều), `adults` = số người, `currency=VND`, sắp theo giá.
- **Kết quả:** tối đa 5 lựa chọn rẻ nhất (giá, hãng, giờ, số chặng nối) và khoảng giá thường gặp nếu có. Chiều về ghi "xem chi tiết chiều về trên Google Flights".
- **Đưa vào chặng tiếp cận:** khi có kết quả, server dùng giá rẻ nhất/người cho đoạn FLIGHT thay cho số model ước tính, ghi nguồn "Google Flights, ngày tra". Không có kết quả hoặc lỗi → giữ ước tính, ghi "ước tính".
- Tối đa 1 lần tra chủ động mỗi chuyến; đổi nơi xuất phát hoặc ngày thì được tra thêm 1 lần.

### Tàu, xe khách

- SerpApi không có engine giá tàu/xe khách. Vexere và Đường sắt Việt Nam không có API giá công khai.
- Giữ ước tính của AI, dựa trên `docs/fixtures/price-reference-ha-giang.md`. Bổ sung các tuyến ra Hà Nội phổ biến (Đà Nẵng, Huế, Vinh, TP.HCM…); chủ dự án kiểm tra số liệu trước khi dùng. Luôn ghi "ước tính".

### Key, quota và cấu hình

- `SERPAPI_API_KEYS`: danh sách key cách nhau bởi dấu phẩy, chỉ ở server, `@sensitive=true` trong `.env.schema`. Mỗi key do chính thành viên sở hữu tạo; không commit key.
- Dùng **theo thứ tự**: dùng key đầu tới khi SerpApi báo hết lượt/429 thì chuyển sang key tiếp theo trong tiến trình hiện tại. Không xoay vòng đều, để cache 1 giờ miễn phí của SerpApi (tính theo tài khoản) còn tác dụng. Hết mọi key → `UNAVAILABLE`.
- Ước tính: 5 × 250 = 1.250 lượt/tháng; một chuyến tốn khoảng 3–5 lượt.
- Giữ cờ `TRIPSAGE_FEATURE_FLIGHTS` / `TRIPSAGE_FEATURE_HOTELS`. Xóa `DUFFEL_ACCESS_TOKEN`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_ENV`.

### Lỗi và an toàn (giữ quy tắc hiện có)

- Thiếu key, lỗi HTTP, timeout 8 giây, phản hồi quá lớn hoặc sai schema → `UNAVAILABLE`. AI báo chưa tra được giá và tiếp tục lập lịch. Thiếu giá không bao giờ được coi là có giá.
- Key đọc khi gọi, không ghi log, không xuất hiện trong response (giữ cơ chế `echoesCredential`). Gửi key qua tham số theo tài liệu SerpApi; URL request không được ghi log.
- Mọi card ghi: "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ."

### Thay đổi theo file (dự kiến)

- Mới: adapter SerpApi cho chỗ ở và cho chuyến bay, dùng chung helper gọi SerpApi có xoay key; danh sách sân bay Việt Nam.
- Sửa: `tripsage-extra-tools.ts` (input `kind`, danh sách khu, sân bay do server chọn, giới hạn mới, ghi chú nguồn), prompt hệ thống, `tripsage-chat-parts.ts` (thêm điểm đánh giá, nhóm chưa có giá, khoảng giá thường gặp), card UI, `tripsage-chat-runtime.ts`, chỗ dựng chặng tiếp cận, `.env.schema`.
- Xóa: `tripsage-duffel.ts`, `tripsage-amadeus.ts` và test của chúng.
- Tài liệu: amendment trong `docs/decisions.md`, bảng giá tham khảo, `docs/ai-progress.md`.

## Testing Decisions

Test quan sát hành vi ở ranh giới tool/adapter; inject `fetch` giả tại ranh giới SerpApi như test Duffel/Amadeus hiện có. Không gọi SerpApi thật trong test tự động.

### Ranh giới kiểm thử

- Adapter: fixture JSON SerpApi giả lập cho chỗ ở và chuyến bay.
- Tool: dùng context giả như test `tripsage-extra-tools` / feature-matrix hiện có.
- Prior art: `tripsage-duffel.vitest.test.ts`, `tripsage-amadeus.vitest.test.ts`, `tripsage-feature-matrix.vitest.test.ts`, `tripsage-chat-stream-redaction.vitest.test.ts`, test access leg / hub confirmation.

### Tiêu chí nghiệm thu

1. **Tự tra chỗ ở:** sau khi xác nhận lịch 4 đêm ở 3 khu, đúng 3 lượt tra song song; bản nháp tạm không phát lượt nào; lặp cùng tham số không phát thêm.
2. **Loại chỗ ở:** chưa biết loại thì có đúng một câu hỏi gộp với ngày/số người; đã nêu thì không hỏi lại; `q` chứa đúng loại.
3. **Lọc 10 km:** kết quả xa hơn 10 km hoặc thiếu tọa độ bị loại; nếu không còn gì → `NO_RESULTS`.
4. **Có giá / chưa có giá:** tối đa 5 + 3, đúng nhãn.
5. **Không mặc định bay:** `shouldSuggestHub` bật mà chưa rõ phương tiện → hỏi; chọn tàu/xe khách → không có request SerpApi; chọn máy bay/so sánh → đúng 1 request.
6. **Sân bay:** origin Đà Nẵng → `DAD`; origin ở Hội An → `DAD`; model không tự đặt mã khi người dùng không nêu.
7. **Giá chặng FLIGHT:** có kết quả thì đoạn FLIGHT dùng giá rẻ nhất/người kèm nguồn; lỗi thì giữ ước tính kèm nhãn "ước tính".
8. **Xoay key:** key 1 trả 429 → request tiếp theo dùng key 2; hết mọi key → `UNAVAILABLE`, AI vẫn trả lời.
9. **Lỗi:** timeout, HTTP lỗi, JSON sai schema, phản hồi quá lớn → `UNAVAILABLE`, không bịa giá.
10. **Cờ:** tắt cờ nào thì nhóm đó không có tool và không có prompt; tắt cả thì tool/prompt cơ bản giữ nguyên.
11. **Secrets:** key không xuất hiện trong response, stream, log, bundle trình duyệt (mở rộng test redaction và client-source hiện có để chặn `SERPAPI`).
12. **Không đặt chỗ:** không có luồng đặt/thanh toán; kết quả không vào `proposeItinerary` và không là PASS.
13. **Kiểm tra dự án:** typecheck, vitest liên quan, `git diff --check`; một lần chạy thử với key thật (~5 lượt), ghi riêng kết quả. Mock pass không đồng nghĩa đã nghiệm thu dịch vụ thật.

### Điều kiện hoàn tất

Ghi riêng: đã implement, đã kiểm tra tự động, đã chạy thử với key thật. Độ phủ thực tế (bao nhiêu chỗ có giá ở Lũng Cú, Du Già, Hoàng Su Phì) ghi thành số liệu quan sát, không phải điều kiện pass.

## Out of Scope

- Đặt phòng, đặt vé, thanh toán, giữ chỗ hoặc lưu kết quả tra cứu vào chuyến đi.
- Dùng khách sạn/chuyến bay làm ứng viên lịch trình hoặc đưa qua Constraint Validator.
- Giá tàu, xe khách trực tuyến; tích hợp Vexere, Đường sắt Việt Nam.
- Chuyển `searchPlaces` sang SerpApi `google_maps`.
- Tra chi tiết chiều về (lượt thứ hai với `departure_token`), tra booking options (`booking_token`).
- Cache riêng trong cơ sở dữ liệu, trang Admin quản lý key, theo dõi quota.
- Tạo tài khoản SerpApi hoặc mua gói trả phí như một phần của việc viết spec.

## Further Notes

- Dữ kiện đã kiểm tra ngày 2026-11-22: tài liệu SerpApi Google Hotels (không có tham số tọa độ; `property_types` không có homestay), Google Flights (khứ hồi cần lượt thứ hai cho chiều về); Amadeus Self-Service đóng ngày 2026-07-17. Kiểm tra trực tiếp trên Google Hotels: "khách sạn Đồng Văn" có 146 kết quả; "nhà nghỉ homestay Mèo Vạc" có 189 kết quả, có homestay và nhà nghỉ, khoảng 5/18 kết quả đầu có giá.
- Chưa kiểm tra: JSON SerpApi thật (cần key), độ phủ ở các điểm nhỏ, mức giá các gói trên trang chính thức (số 250 lượt/tháng lấy từ nguồn thứ ba và trang use-case của SerpApi).
- **Rủi ro điều khoản:** chưa đọc điều khoản SerpApi về việc một dự án dùng nhiều tài khoản free. Nếu bị coi là vi phạm, các key có thể bị khóa cùng lúc trước demo. Phương án dự phòng: mua gói $25 trong tháng bảo vệ.
- SerpApi lấy dữ liệu bằng cách scrape Google; ghi vào phần hạn chế của báo cáo.
- Danh sách sân bay và tọa độ là dữ liệu tĩnh cần chủ dự án kiểm tra.
- Tài liệu nền: [product contract](../product/product-spec.md), [decisions](../decisions.md), [TripSage port story](../stories/TRIPSAGE-CHAT-ITINERARY-PORT.md), [origin/return story](../stories/TRIP-ORIGIN-ROUND-TRIP.md), [bảng giá tham khảo](../fixtures/price-reference-ha-giang.md).

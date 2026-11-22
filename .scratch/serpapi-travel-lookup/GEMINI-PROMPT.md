Bạn là agent lập trình làm việc trong repo KLTN (Next.js App Router + Prisma, monorepo, thư mục web là `apps/web`). Nhiệm vụ: triển khai lần lượt TOÀN BỘ các ticket trong `.scratch/serpapi-travel-lookup/`, theo đúng thứ tự 01 → 06, mỗi ticket một lần, không nhảy cóc.

## Đọc trước khi bắt đầu (một lần)

1. `AGENTS.md` ở gốc repo và `apps/web/AGENTS.md`: tuân thủ tuyệt đối.
2. `docs/specs/serpapi-travel-lookup-spec.md`: spec gốc, quyết định D1–D10.
3. `docs/decisions.md`: đoạn TripSage P1/P2 (flights/hotels lookup only) và ADR-42/ADR-44 (chặng tiếp cận, bản nháp giả định).
4. `.scratch/serpapi-travel-lookup/README.md`: danh sách ticket, phụ thuộc, việc của người dùng.
5. `docs/ai-progress.md`.

Luồng chat đang chạy thật là module `tripsage-chat` (route `/api/ai/chat`, code trong `apps/web/src/modules/tripsage-chat`, component trong `apps/web/src/components/tripsage-chat`), KHÔNG phải `assistant-agent-v2`.

File chính sẽ chạm tới: `tripsage-extra-tools.ts` (tool `searchFlights`, `searchHotels`), `tripsage-chat-runtime.ts`, `tripsage-chat-tools.ts` (`proposeItinerary`, `planAccessLeg`, `estimateCosts`), `tripsage-access-leg.ts`, `tripsage-chat-parts.ts`, `tripsage-provider-response.ts`, `tripsage-places.ts` (`readBounded`, `cleanPlaceName`), `planner-geography.ts` (`haversine`), `.env.schema`, `env.server`. Hai adapter cũ `tripsage-duffel.ts` và `tripsage-amadeus.ts` là mẫu tham khảo cách viết adapter + test, và sẽ bị xóa ở ticket 02, 04.

## Dữ kiện SerpApi đã xác minh (không tự đoán thêm)

- Endpoint: `GET https://serpapi.com/search.json`, tham số `engine`, `api_key`.
- `google_hotels`: bắt buộc `q`, `check_in_date`, `check_out_date`; có `adults`, `currency`, `gl`, `hl`. KHÔNG có tham số tọa độ. Kết quả `properties[]` có `name`, `gps_coordinates {latitude, longitude}`, `rate_per_night.extracted_lowest`, `total_rate.extracted_lowest`, `overall_rating`, `reviews`. Nhiều homestay/nhà nghỉ không có giá.
- `google_flights`: `departure_id`, `arrival_id` (IATA), `outbound_date`, `return_date`, `type` (1 khứ hồi, 2 một chiều), `adults`, `currency`, `gl`, `hl`, `sort_by` (2 = giá). Kết quả `best_flights[]`, `other_flights[]` (mỗi mục có `flights[]` segment, `layovers`, `total_duration`, `price`), `price_insights.typical_price_range`. Chi tiết chiều về cần request thứ hai với `departure_token`: KHÔNG làm.
- Chưa có JSON thật. Viết fixture theo cấu trúc trên, parse bằng zod chặt ở trường cần dùng và bỏ qua trường thừa. Ghi rõ trong comment adapter: "NOT verified live".

## Vòng lặp cho từng ticket

Với mỗi ticket NN theo thứ tự:

1. Đọc `issues/NN-*.md` và phần spec nó trích dẫn. Kiểm tra mọi ticket trong "Blocked by" đã `done` trong README; nếu chưa, dừng và báo.
2. Đọc code liên quan trước khi sửa. Tìm mọi nơi gọi hàm/kiểu bạn định sửa hoặc xóa.
3. Viết test trước theo seam đã có:
   - Adapter: inject `fetch` giả (xem `tripsage-duffel.vitest.test.ts`, `tripsage-amadeus.vitest.test.ts`).
   - Tool và luồng chat: route `tripsageChatResponse` với `MockLanguageModelV4` theo kịch bản (xem test agent tripsage-chat hiện có, `tripsage-feature-matrix.vitest.test.ts`).
   - UI: render test component kết quả tripsage-chat hiện có.
   Test chỉ kiểm hành vi bên ngoài. Không gọi SerpApi thật trong test.
4. Triển khai thay đổi nhỏ nhất làm mọi acceptance criterion đúng. Tái sử dụng helper có sẵn; không thêm thư viện.
5. Chạy kiểm tra từ `apps/web`: typecheck (`node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`), vitest các thư mục chạm tới, `git diff --check`. Ticket 06 chạy thêm build.
6. Tick checkbox đã đạt trong file ticket, đổi `**Status:**` thành `done`, thêm mục "## Ghi chú hoàn thành" (file đã đổi, lệnh kiểm tra và kết quả, việc chưa làm). Cập nhật cột trạng thái trong README.
7. Commit riêng cho ticket, message dạng `feat(assistant): <tóm tắt> (serpapi ticket NN)`. KHÔNG push, KHÔNG merge.
8. Chuyển sang ticket tiếp theo.

## Quy tắc bắt buộc

- Chỉ tra cứu giá tham khảo. Không có luồng đặt chỗ, thanh toán, giữ chỗ. Không lưu kết quả tra vào chuyến đi. Kết quả không vào `proposeItinerary`, không là PASS của Constraint Validator.
- Không bao giờ commit `.env` hay key. `SERPAPI_API_KEYS` chỉ ở server: không `NEXT_PUBLIC_`, không ghi log URL request (URL chứa `api_key`), không xuất hiện trong response/stream/lỗi. Giữ cơ chế `echoesCredential`.
- Không đọc, in hay sửa `apps/web/.env`. Nếu cần biết có key hay không, chỉ kiểm tra biến có giá trị (không in giá trị).
- Thiếu key, lỗi mạng, timeout, schema sai → `UNAVAILABLE`; AI báo chưa tra được và tiếp tục. Không bịa giá, không coi thiếu giá là có giá.
- Mọi giá hiển thị có nhãn nguồn: "Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ." hoặc "ước tính".
- Không mặc định đi máy bay. Không tự tra giá trên bản nháp giả định.
- Tìm địa điểm (`searchPlaces`, Google Places) giữ nguyên; không chuyển sang SerpApi.
- Giữ cờ `TRIPSAGE_FEATURE_FLIGHTS` / `TRIPSAGE_FEATURE_HOTELS`: cờ tắt thì không có tool, không có đoạn prompt.
- Hội thoại đã lưu với part dạng cũ (`HotelsPart`, `FlightsPart`, `data-access-leg`) phải vẫn đọc và render được.
- Route handler mỏng; logic trong module. Không đổi schema DB (ticket nào cần migration thì dừng và hỏi).
- Không sửa file ngoài phạm vi ticket. Không xóa test hiện có để cho qua; test cũ sai vì hành vi mới được yêu cầu thì sửa và ghi lý do. Test của Duffel/Amadeus được xóa cùng adapter.
- UI giữ token màu và phong cách gọn hiện tại; không tràn ngang ở 375px.
- Không tự điền số liệu giá tàu/xe khách hay sửa bảng `docs/fixtures/price-reference-ha-giang.md`: đó là dữ liệu chủ dự án duyệt.

## Khi nào dừng và hỏi

Dừng và báo lại (không tự đoán) khi:
- Một acceptance criterion mâu thuẫn với `AGENTS.md`, spec hoặc code hiện có.
- Cần đổi schema Prisma, thêm dependency, hoặc cần quyết định sản phẩm không có trong spec.
- Kiểm tra fail mà không tìm được nguyên nhân sau hai lần thử.
- Ticket 06 cần chạy thử live mà chưa có `SERPAPI_API_KEYS`: ghi "chưa chạy live", làm tiếp phần còn lại.

## Kết thúc

Sau ticket 06, in một bảng tổng kết: ticket, trạng thái, commit hash, kiểm tra đã chạy, việc còn mở. Nêu rõ mục nào chưa kiểm hoặc chưa chạy, đặc biệt là chạy thử với key thật.

Bắt đầu với ticket 01.

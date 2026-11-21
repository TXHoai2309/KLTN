# 02: Route stream — tiến trình, chữ, kết quả cuối, lọc ID/URL, Correction note

**What to build:** `POST /api/trips/[id]/edits/ai` trả **UI message stream của AI SDK** khi request có header `Accept: text/event-stream`. Không có header đó thì trả JSON như cũ. Stream gồm, theo thứ tự xuất hiện:

1. các phần tiến trình bằng lời tiếng Việt cho từng bước;
2. chữ trả lời của model, stream dần, đã lọc ID nội bộ và URL;
3. một phần *Correction note* nếu fact guard phát hiện khẳng định sai;
4. đúng một phần **kết quả cuối** mang payload JSON hiện tại.

Bản nháp ở client chỉ đổi khi nhận phần kết quả cuối (ticket 03).

**Blocked by:** 01.

**Status:** done

## Yêu cầu chi tiết

1. **Content negotiation trong lớp HTTP** (`apps/web/src/modules/trip-edit/ai-edit-http.ts` + route):
   - Xác thực, kiểm tra quyền sở hữu, parse body và kiểm tra request chạy y như cũ **trước** khi quyết định trả stream hay JSON. Lỗi trước đó (401/403/404/409/400…) vẫn trả JSON lỗi như hiện tại, kể cả khi client xin stream.
   - Route Handler giữ mỏng, đúng quy tắc trong `AGENTS.md`.
2. **Định dạng stream** (theo mẫu `streamTripsageChat` trong `tripsage-chat-service.ts`):
   - Dùng `createUIMessageStream` + `createUIMessageStreamResponse` với headers `Cache-Control: private, no-store` và `X-Accel-Buffering: no`.
   - Phần tiến trình: `data-status` (`transient: true`) với `{ kind, label }`. Nhãn do server viết, **không** chứa tham số thô hay ID.
     - Bắt đầu: "Đang xem lịch của bạn…"
     - `simulate_changes`: "Đang chạy thử: <title của phương án>…" (title đã lọc ID)
     - `search_destinations`: "Đang tìm điểm phù hợp…"
     - `get_weather`: "Đang xem dự báo thời tiết…"
     - `lookup_local_knowledge`: "Đang tra tài liệu địa phương…"
     - `apply_to_draft` / `show_options`: "Đang chuẩn bị phương án…"
     - Khi chữ bắt đầu: "Đang soạn câu trả lời…"
   - Ngoài các nhãn trên, gửi thêm một phần `data-steps` **không transient**: danh sách các bước đã làm (mảng nhãn ngắn, ví dụ `["Xem lịch", "Chạy thử 2 phương án", "Xem thời tiết"]`), để client hiện dòng tóm tắt sau khi xong.
   - Phần chữ: `text-start` / `text-delta` / `text-end` từ `streamText(...).toUIMessageStream()`.
   - Giống tripsage, `tool-output-available` chỉ gửi `{ ok }`; `tool-input-*` không gửi tham số thô, hoặc lọc bỏ hẳn các chunk `tool-*` nếu client không cần.
   - Phần kết quả cuối: `data-trip-assistant-result` (không transient) với `data` đúng bằng object `AiEditServiceResult` mà JSON path trả cho cùng kịch bản, kèm thêm `correctionNote` nếu có. `advice` / `aiSummary` bằng toàn văn chữ **đã lọc**.
3. **Lọc ID/URL ngay trong luồng chữ:**
   - Thêm một `TransformStream` trên các chunk `text-delta`, loại các token khớp các mẫu sau trước khi enqueue: `visit-…`, `dest-…`, `ext:…`, cuid (`c[a-z0-9]{20,}`), các destination id đã biết trong catalog (độ dài ≥12), và URL `https?://…`. Mẫu lấy từ `groundedAdviceRejection` trong `saved-trip-advisory.ts`.
   - Bộ lọc giữ một đoạn đệm ở cuối mỗi delta, đủ để token bị cắt giữa hai chunk vẫn bị bắt. Flush phần còn lại khi `text-end`.
4. **Correction note:**
   - Khi chữ kết thúc, chạy `groundedAdviceRejection` trên toàn văn đã lọc, với trạng thái theo đúng cách ticket 01 đã chọn.
   - `FALSE_PASS` hoặc `ABSOLUTE_SAFETY` → **không** chuyển về ADR-38. Gửi phần `data-correction-note` với text do server viết từ dữ kiện đã kiểm chứng. Ví dụ: "Lưu ý: lịch hiện tại vẫn còn N điểm chưa đạt kiểm tra." hoặc "Lưu ý: thời tiết chỉ là dự báo tham khảo, không thể bảo đảm an toàn tuyệt đối."
   - JSON path cũng áp dụng tương tự: không fallback nữa, mà thêm trường `correctionNote` vào kết quả `ADVISED` / `PROPOSED`. Thêm trường optional này vào kiểu `AiEditAdvisedResult` / `AiEditProposalResult`, không đổi trường cũ.
   - `LEAKED_ID` / `URL_OR_HTML` không còn là lý do fallback, vì đã lọc. `LENGTH` (quá ngắn hoặc dài) vẫn fallback.
   - Log thêm `correction: true/false`.
5. **Luồng dự phòng và các nhánh tất định** (trường khung, GPS, `resolution`, ADR-38): khi client xin stream thì vẫn trả stream, nhưng chỉ gồm `data-status` "Đang xem lịch của bạn…" và `data-trip-assistant-result`. Phần chữ không cần stream: client hiện `advice` từ kết quả cuối.
6. **Abort:**
   - `request.signal` của Next được nối vào `abortSignal` của `streamText` và các công cụ.
   - Khi client hủy, không gửi `data-trip-assistant-result` và không có simulation nào được coi là áp.
7. `maxDuration = 300` giữ nguyên. Không có giới hạn token hay chi phí.

## Acceptance criteria

- [x] Test Seam 1 (`MockLanguageModelV4` + `simulateReadableStream`), đọc response stream thành mảng chunk:
  - có `data-status` cho từng công cụ đúng nhãn, rồi `text-*`, rồi đúng một `data-trip-assistant-result`;
  - `data` của result **bằng** JSON path cho cùng kịch bản (ADVISED và PROPOSED).
- [x] Không gửi `Accept: text/event-stream` → JSON y như cũ; mọi test `trip-edit` cũ đạt.
- [x] Lỗi xác thực / quyền / revision khi xin stream → vẫn là JSON lỗi đúng mã HTTP.
- [x] Model viết `visit-1`, một cuid, hoặc `https://x.y` (kể cả bị cắt giữa hai chunk, ví dụ `vis` | `it-1`) → không byte nào của các token đó xuất hiện trong response; text vẫn đọc được.
- [x] Model nói "lịch đã đạt PASS" khi Validator báo VIOLATION → có `data-correction-note` và `correctionNote` trong result; lời trả lời không bị xóa; bộ phân loại ADR-38 **không** được gọi.
- [x] Provider lỗi giữa chừng → chuyển về ADR-38, stream vẫn kết thúc bằng một result hợp lệ.
- [x] Trường khung, GPS khi `ONGOING`, `resolution` → stream chỉ có status + result.
- [x] Abort giữa chừng → không có result.
- [x] `npx tsc --noEmit -p .` đạt. Commit cục bộ (không push).

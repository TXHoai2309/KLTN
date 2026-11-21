# Spec — Trợ lý chuyến đi trả lời tự nhiên, hiện chữ dần và cho thấy đang làm gì

**Trạng thái: IMPLEMENTED — 2026-11-21.** Tổng hợp từ buổi phỏng vấn thiết kế Q1–Q19 (2026-11-21). Kế thừa [saved-trip-assistant-reasoning-spec.md](saved-trip-assistant-reasoning-spec.md) (ADR-39). Quyết định kiến trúc ghi tại [ADR-40](../decisions.md#adr-40--saved-trip-assistant-streams-through-the-ai-sdk-and-decides-through-tools-2026-11-21). Thuật ngữ mới trong [GLOSSARY](../../GLOSSARY.md): *Stated assumption (giả định nêu rõ)*, *Correction note (dòng đính chính)*.

---

## Problem Statement

Sau ADR-39, Trợ lý chuyến đi trên `/trips/[id]/edit` đã biết suy luận và dùng công cụ, nhưng trải nghiệm vẫn chưa giống trò chuyện với một người thật:

1. **Phải chờ trong im lặng.** Một lượt có thể mất vài chục giây (nhiều vòng model, chạy thử phương án, gọi định tuyến và Validator). Người dùng chỉ thấy vòng xoay, không biết AI đang làm gì hay đã treo. Trình duyệt từng tự hủy yêu cầu sau 15 giây (đã sửa thành 305 giây, chưa push).
2. **Câu trả lời đến một cục.** AI phải trả về một khối JSON ở cuối (`reply`, `proposeSimulationId`, `suggestionSimulationIds`), nên không thể hiện chữ dần.
3. **Giọng còn khô và đóng dấu từng câu.** Mỗi câu tư vấn gắn nhãn "Tư vấn · Lịch chưa bị thay đổi", trái với *Caveat policy* (lượt chỉ đọc không gắn lưu ý). Prompt vẫn mang nhiều quy tắc kiểu báo cáo.
4. **Gặp yêu cầu chưa rõ hẳn thì xử lý chưa nhất quán.** Ví dụ *"ngày 1 chưa muốn tham quan, dời chợ tình Khâu Vai sang hôm khác"*: AI có thể hỏi lại, tự làm, hoặc đưa thẻ, nhưng chưa có quy tắc khi nào làm gì.
5. **Không dừng được.** Người dùng gửi nhầm hoặc đổi ý thì vẫn phải chờ hết lượt.

Người dùng muốn trợ lý "trả lời tự nhiên nhất có thể, giống như Claude": chữ hiện dần, thấy được AI đang làm gì, giọng như người đồng hành, dám khuyên.

---

## Solution

- **Giọng người đồng hành:** xưng "mình/bạn", ấm áp, nói thẳng, dám khuyến nghị kèm lý do. Không ép độ dài, câu trả lời dài ngắn theo nhu cầu. Không có câu kết chung chung, không emoji. Câu ngoài lề đáp ngắn rồi kéo về chuyến đi. Trả lời bằng ngôn ngữ người dùng viết, mặc định tiếng Việt.
- **Hiện chữ dần (stream)** và **hiện từng bước AI đang làm** bằng lời thường; khi xong thì thu gọn thành một dòng có thể mở lại. Có **nút Dừng**.
- **AI quyết định bằng công cụ thay vì JSON cuối lượt:** lời văn stream tự do. Muốn sửa lịch thì gọi `apply_to_draft`, muốn đưa lựa chọn thì gọi `show_options`. Server vẫn chỉ nhận simulation do chính lượt đó tạo.
- **Giả định nêu rõ:**
  - Có một cách hiểu hợp lý: áp vào bản nháp và nói rõ đã hiểu thế nào.
  - Có đánh đổi thật: đưa thẻ phương án.
  - Không đoán được ý: hỏi lại.
- **An toàn khi stream:** ID nội bộ và URL bị lọc ngay trong luồng chữ. Khẳng định "đạt PASS" sai sự thật hoặc "an toàn tuyệt đối" thì server gắn **dòng đính chính** bên dưới, không xóa câu trả lời.
- **Dựng trên Vercel AI SDK** đã có trong repo (đang chạy cho chat lập hành trình), thay client Responses API tự viết.

---

## User Stories

Người dùng là chủ chuyến đi đã lưu, đang ở `/trips/[id]/edit` hoặc `/trips/[id]/in-trip`.

1. Khi gửi câu hỏi, tôi thấy ngay AI đang làm gì: "Đang xem lịch của bạn…", "Đang chạy thử: Dời Chợ tình Khâu Vai sang sáng ngày 2…", "Đang tìm điểm phù hợp…", "Đang xem dự báo thời tiết…", "Đang tra tài liệu địa phương…".
2. Khi AI bắt đầu trả lời, chữ hiện dần, các bước đã làm thu lại thành một dòng nhỏ phía trên ("Đã xem lịch · chạy thử 2 phương án · xem thời tiết"). Bấm vào thì mở lại chi tiết.
3. Khi AI trả lời dở mà tôi muốn dừng, tôi bấm "Dừng": chữ đã hiện được giữ lại, lịch không đổi.
4. Khi tôi nói *"ngày 1 chưa muốn tham quan, dời chợ tình Khâu Vai sang hôm khác"*, nếu chỉ có một cách hợp lý thì AI dời luôn trên bản nháp và nói *"Mình đã dời sang sáng ngày 2 vì… Nếu bạn muốn ngày khác cứ nói nhé"*. Tôi Hoàn tác được và phải tự bấm Lưu.
5. Khi các cách dời có đánh đổi thật (ví dụ sang ngày 2 thì về muộn, sang ngày 4 phải bỏ một điểm), AI giải thích đánh đổi và đưa thẻ để tôi chọn.
6. Khi tôi nói *"đổi điểm đó đi"* mà AI không biết "điểm đó" là gì, AI hỏi lại ngắn gọn.
7. Khi tôi hỏi tư vấn chỉ-đọc, câu trả lời không mang nhãn "Lịch chưa bị thay đổi". Khi AI thực sự sửa bản nháp, tin nhắn có nhãn "Đã áp dụng".
8. Khi tôi chào, cảm ơn hoặc hỏi "bạn là ai", AI đáp tự nhiên, ngắn, không đổ dữ liệu chuyến đi ra.
9. Khi tôi viết tiếng Anh, AI trả lời tiếng Anh.
10. Khi AI lỡ nói lịch hiện tại "đạt yêu cầu" trong khi Validator còn vi phạm, bên dưới câu trả lời có dòng đính chính nêu đúng sự thật.
11. Khi mất mạng sau lúc chữ đã nói "mình đã dời…" nhưng trước khi bản sửa về tới, tin nhắn ghi "Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi" kèm nút Thử lại.
12. Khi vòng suy luận lỗi và lượt đó chạy bằng luồng dự phòng ADR-38, tôi vẫn thấy "Đang xem lịch của bạn…" rồi nhận cả câu trả lời một lần, không có nhãn kỹ thuật.

---

## Implementation Decisions

### 1. Vòng suy luận trên AI SDK (thay `trip-assistant-agent.ts` + `trip-assistant-openai.ts`)
- Dùng `streamText` + `createUIMessageStream` / `createUIMessageStreamResponse` từ `ai` 7.0.28 và provider `@ai-sdk/openai` 4.0.14, theo đúng mẫu của [tripsage-chat-service.ts](../../apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts) và [tripsage-chat-tools.ts](../../apps/web/src/modules/tripsage-chat/tripsage-chat-tools.ts).
- Model `gpt-6.1-terra`, gọi qua Responses API, mức suy luận `medium`, `store: false`. Không đặt trần token hay chi phí.
- Chốt chặn kỹ thuật giữ nguyên tinh thần ADR-39: giới hạn số bước gọi công cụ để chặn vòng lặp vô hạn (dùng `isStepCount`), và route `maxDuration = 300`.
- Các bước kiểm tra tất định chạy **trước** model, giữ như ADR-39: quyền sở hữu, revision, `COMPLETED`, yêu cầu đổi trường khung, lượt `ONGOING` cần GPS, lượt có `resolution`.

### 2. Công cụ
- Giữ 4 công cụ đọc/chạy thử của ADR-39, chuyển sang `tool()` của AI SDK, tái dùng nguyên logic server: `simulate_changes`, `search_destinations`, `get_weather`, `lookup_local_knowledge`.
- Thêm 2 công cụ quyết định:
  - `apply_to_draft({ simulationId })`: đánh dấu simulation đó là bản đề xuất của lượt (kết quả `PROPOSED`). Mỗi lượt tối đa một lần; gọi lần sau ghi đè lần trước.
  - `show_options({ simulationIds })`: tối đa 3 thẻ *Actionable advice suggestion*.
- Server chỉ chấp nhận simulationId do chính lượt này tạo. ID lạ thì công cụ trả lỗi cho model, không có gì được áp.
- Candidate, diff, thẻ và kết quả Validator luôn do server đóng gói từ simulation đã chạy, không lấy từ chữ của model.

### 3. Prompt (giọng và hành vi)
- Viết lại `TRIP_ASSISTANT_AGENT_INSTRUCTIONS` theo các quyết định Q1–Q3, Q6, Q7:
  - Giọng: "mình/bạn", người đồng hành có kinh nghiệm, dám khuyến nghị kèm lý do.
  - Không có quy tắc độ dài, không có câu kết chung chung, không emoji.
  - Ngoài lề: đáp ngắn rồi kéo về chuyến đi. Trả lời theo ngôn ngữ người dùng viết.
  - Giả định nêu rõ: một cách hiểu hợp lý thì áp và nói rõ; có đánh đổi thật thì đưa thẻ; không đoán được thì hỏi lại.
- Giữ nguyên các quy tắc cứng của ADR-39: chỉ dùng ID từ ngữ cảnh/công cụ; không đụng lượt đã khóa; không đổi trường khung; PASS/VIOLATION chỉ lấy từ máy chủ; không bịa giá hoặc giờ mở cửa; thời tiết chỉ để tham khảo; ghi rõ *Kiến thức mở rộng*.

### 4. An toàn khi stream
- Bộ lọc nằm giữa luồng chữ của model và luồng gửi về trình duyệt. Nó loại các token ID nội bộ (`visit-…`, `dest-…`, `ext:…`, cuid, ID danh mục đã biết) và URL **trước khi** gửi đi. Bộ lọc giữ lại một đoạn đệm ngắn để không cắt đôi một token.
- Khi luồng chữ kết thúc, chạy `groundedAdviceRejection` trên toàn văn bản:
  - `FALSE_PASS` hoặc `ABSOLUTE_SAFETY`: gửi thêm một phần *Correction note* do server viết từ dữ kiện đã kiểm chứng. Ví dụ: "Lưu ý: lịch hiện tại vẫn còn 2 điểm chưa đạt kiểm tra."
  - Trạng thái đối chiếu theo cách ADR-39 đang làm: lượt có đề xuất thì lấy trạng thái của simulation được áp; có thẻ PASS thì coi là PASS; còn lại lấy trạng thái của lịch hiện tại.
- Log `trip_assistant` (chỉ mã lỗi và thời gian) ghi thêm `correction: true/false`.

### 5. Hợp đồng HTTP
- Cùng route `POST /api/trips/[id]/edits/ai`, cùng body, cùng bước xác thực và kiểm tra quyền sở hữu.
- `Accept: text/event-stream`: trả UI message stream của AI SDK với `Cache-Control: private, no-store` và `X-Accel-Buffering: no`. Các phần trong luồng:
  - phần chữ (stream dần);
  - phần tiến trình cho mỗi bước gọi công cụ, mang nhãn tiếng Việt do server tạo (không gửi tham số thô của công cụ);
  - một phần **kết quả cuối** (`data-trip-assistant-result`) mang đúng payload JSON hiện tại (`ADVISED` / `PROPOSED` / `NEEDS_CLARIFICATION` / `NEEDS_LOCATION`), với `advice` / `aiSummary` bằng toàn văn đã lọc;
  - phần *Correction note* nếu có.
- Không có `Accept: text/event-stream`: trả JSON như hiện tại. Các test, công cụ và luồng dự phòng giữ nguyên.
- Lượt đi qua luồng dự phòng ADR-38 hoặc các nhánh tất định (khung, GPS…) vẫn trả stream khi được yêu cầu, nhưng chỉ gồm một phần tiến trình "Đang xem lịch của bạn…" và phần kết quả cuối.

### 6. Giao diện
- `requestAiTripEdit` đọc stream, dùng chung thời gian chờ 305 giây.
- Thời gian chờ được đặt lại mỗi khi nhận một phần mới, để lượt dài vẫn chạy được miễn là còn dữ liệu đến.
- Trong lúc chạy:
  - Tin nhắn AI hiện danh sách bước đang làm. Khi phần chữ đầu tiên về, danh sách thu thành một dòng tóm tắt có thể mở lại (`<details>`).
  - Chữ hiện dần qua `FormattedAdvisoryProse` hiện có.
  - Nút "Gửi AI" đổi thành "Dừng". Bấm thì abort fetch, giữ chữ đã hiện, lịch không đổi.
- **Chỉ khi nhận phần kết quả cuối** mới áp bản đề xuất lên *Edit draft*, gắn thẻ phương án, đổi nhãn thành "Đã áp dụng" và đẩy vào ngăn Hoàn tác.
- Mất kết nối hoặc bấm Dừng trước phần kết quả cuối: tin nhắn ghi "Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi" (hoặc "Đã dừng — lịch chưa thay đổi"), kèm nút Thử lại.
- Bỏ nhãn "Tư vấn · Lịch chưa bị thay đổi" và "Lịch chưa bị thay đổi" ở tin nhắn tư vấn. Giữ "Đã áp dụng" và "Cần làm rõ".
- Phần *Correction note* hiển thị như một dòng nhỏ có biểu tượng cảnh báo dưới câu trả lời.
- Chip gợi ý, thẻ "điểm cần xem lại" và nút "Sửa giúp tôi" giữ nguyên như commit `fa2874a`.

### 7. Không đổi
- Không đổi Prisma schema, không migration.
- Không đổi luồng Lưu / Apply, idempotency `SUCCESS` / `FAILED` / `UNKNOWN`, Rebase `409`.
- Không thêm biến môi trường bắt buộc. `TRIP_ASSISTANT_AGENT=off` vẫn tắt vòng suy luận.
- Khóa OpenAI chỉ ở server.
- Không thêm dependency mới: `ai`, `@ai-sdk/openai`, `@ai-sdk/react` đã có.

---

## Testing Decisions

Seam giữ như spec ADR-38/39: biên dịch vụ và Route Handler của *AI Edit/Advise*, với provider giả và đồng hồ cố định `Asia/Ho_Chi_Minh`. Dùng `MockLanguageModelV4` và `simulateReadableStream` của AI SDK theo mẫu các test `tripsage-chat-*`.

**Server**
- Stream gồm phần tiến trình (đúng nhãn tiếng Việt cho từng công cụ), phần chữ, rồi phần kết quả cuối với payload giống hệt bản JSON cho cùng kịch bản.
- `apply_to_draft` với simulationId thật cho ra `PROPOSED`. Với ID lạ hoặc của lượt khác thì công cụ báo lỗi và lượt kết thúc `ADVISED`. `show_options` lấy tối đa 3 thẻ từ simulation thật.
- ID nội bộ hoặc URL do model viết không bao giờ xuất hiện trong byte nào gửi tới trình duyệt, kể cả khi token bị cắt giữa hai chunk (theo mẫu `tripsage-chat-stream-redaction.vitest.test.ts`).
- "Đạt PASS" khi Validator báo VIOLATION thì có phần *Correction note*; câu trả lời hợp lệ thì không có.
- Không gửi `Accept: text/event-stream` thì nhận JSON như cũ. Toàn bộ test `trip-edit` hiện có vẫn đạt.
- Model lỗi hoặc vượt giới hạn bước thì chuyển về luồng ADR-38: stream chỉ có phần tiến trình và phần kết quả cuối.
- Trường khung, `COMPLETED`, GPS khi `ONGOING` không bao giờ vào vòng suy luận.
- Abort giữa chừng không để lại simulation nào được áp.

**Giao diện**
- Render các trạng thái: đang chạy (danh sách bước), đang stream (dòng tóm tắt bước cộng chữ), xong `ADVISED` (không có nhãn tư vấn), xong `PROPOSED` (nhãn "Đã áp dụng"), có *Correction note*, đứt kết nối hoặc Dừng trước kết quả cuối ("lịch chưa thay đổi" cộng Thử lại).
- Nút Gửi đổi thành Dừng khi đang chạy.

**Thử thật trước khi push (Q18)**
- Dùng khóa trong `apps/web/.env` local, chạy một script/test thủ công với chuyến mẫu dựng sẵn, không dùng database, khoảng 5 câu:
  - hỏi hiện trạng;
  - "tôi xuất phát từ đâu lúc mấy giờ";
  - yêu cầu dời chợ tình Khâu Vai (giả định nêu rõ);
  - "sáng muốn nghỉ đến 9h" (thẻ phương án);
  - "cảm ơn bạn".
- Xác nhận: Responses API nhận đúng request, công cụ được gọi, chữ stream ra, có phần kết quả cuối, không rò ID.
- Ghi kết quả (không ghi khóa) vào `docs/ai-progress.md`.

---

## Out of Scope

- Đổi model hoặc mức suy luận (giữ `gpt-6.1-terra` mức medium).
- Lưu hội thoại hoặc kết quả mô phỏng xuống database.
- Đổi bố cục workspace, thanh công cụ góc trên, thẻ lịch trình, bản đồ.
- Áp dụng cho trợ lý `/assistant` toàn cục hoặc khung trợ lý theo điểm đến.
- Tái hiện và sửa khả năng lịch do AI tạo hành trình sinh ra không qua được kiểm tra của trang chỉnh sửa (chặng về sau 23:59). Cần một story riêng có chuyến mẫu.
- Hiển thị nội dung suy luận nội bộ của model. Chỉ hiển thị các bước gọi công cụ.

---

## Further Notes

- **Nguồn quyết định:** phỏng vấn Q1–Q19 ngày 2026-11-21.
  - Q2: chủ dự án bỏ quy tắc độ dài, chỉ yêu cầu "tự nhiên nhất".
  - Q5: chủ dự án chọn làm luôn stream và hiển thị bước.
  - Các câu còn lại theo khuyến nghị.
- **Thứ tự triển khai đề xuất:**
  1. Công cụ và prompt trên AI SDK, có route JSON cũ để so sánh.
  2. Stream, bộ lọc ID/URL, *Correction note*.
  3. Giao diện: bước đang làm, chữ dần, Dừng, áp khi có kết quả cuối.
  4. Bỏ nhãn tư vấn.
  5. Thử thật với khóa local.
  6. Commit, push `TXH`, fast-forward `master` (Q19). Gồm cả bản sửa thời gian chờ 305 giây đang chờ trong working tree.
- **Rủi ro cần theo dõi:**
  - Proxy hoặc CDN có thể gom (buffer) luồng SSE. Header `X-Accel-Buffering: no` đã dùng ổn cho chat lập hành trình.
  - Vercel `maxDuration = 300` vẫn là giới hạn cứng của một lượt.

---

## Trạng thái triển khai (2026-11-21)

- **Đã triển khai đủ 4 lát cắt dọc (`01`–`04`):**
  1. Vòng suy luận AI SDK (`streamText` + `@ai-sdk/openai` `.responses("gpt-6.1-terra")`) trong `trip-assistant-agent.ts` và `trip-assistant-openai.ts` (bỏ Responses client tự viết), giọng người đồng hành + *Stated assumption*, hai công cụ quyết định `apply_to_draft` và `show_options`.
  2. Content negotiation `Accept: text/event-stream` tại `ai-edit-http.ts` + `streamAiEditProposal` tại `ai-edit-service.ts`, gửi `data-status`, `data-steps`, chữ đã lọc qua `trip-assistant-stream-redaction.ts`, `data-correction-note` khi `FALSE_PASS` / `ABSOLUTE_SAFETY`, và `data-trip-assistant-result` trùng payload JSON. Lỗi tiền kiểm (401/403/400/404/409/422) vẫn trả JSON trước khi mở stream.
  3. Client `streamAiTripEdit` (`trip-edit-client.ts`, đặt lại timeout 305 s mỗi chunk) + `resolveAiStreamOutcome` (`ai-stream-outcome.ts`) + giao diện `STREAMING`, `<details>` tóm tắt bước, nút Dừng 44×44 px, *Correction note*, trạng thái `INTERRUPTED` / `STOPPED` giữ chữ dở kèm nút Thử lại, bỏ nhãn "Tư vấn · Lịch chưa bị thay đổi" / "Lịch chưa bị thay đổi".
  4. Thử thật 5 câu trên `gpt-6.1-terra` qua Responses API (`trip-assistant-live.vitest.test.ts`, chạy opt-in bằng `TRIP_ASSISTANT_LIVE=1`): 5/5 lượt đạt, stream 8–128 chunk/lượt, gọi `simulate_changes` + `show_options`, không rò ID/URL, giọng tự nhiên.
- **Chi tiết kỹ thuật / khác biệt nhỏ so với spec:**
  - `@ai-sdk/openai` 4.0.14 chỉ tự nhận diện model reasoning cho họ `o1`/`o3`/`o4-mini`/`gpt-5*`; cần đặt thêm `forceReasoning: true` và `reasoningSummary: null` trong `providerOptions.openai` để gửi đúng `reasoning.effort = "medium"` và `include: ["reasoning.encrypted_content"]` cho `gpt-6.1-terra` mà không lộ nội dung suy luận nội bộ.
  - Luồng gửi về trình duyệt lọc bỏ hẳn các chunk `tool-*` và `reasoning-*` (thay vì gửi `tool-output-available: { ok }`), vì giao diện chỉ hiển thị nhãn tiếng Việt từ `data-status` và `data-steps`.
  - Định nghĩa thêm kiểu `AiTripEditStreamOutcome` riêng cho `streamAiTripEdit` để giữ tương thích hoàn toàn với `requestAiTripEdit` và `ai-edit-panel.tsx`.
- **Chưa chứng minh:**
  - Chưa mở trình duyệt thật (desktop/360px/dark mode/Production Vercel CDN) để kiểm tra hiển thị trực quan và hành vi SSE qua proxy thực tế.
  - Bài thử thật dùng routing/DB giả trong bộ nhớ; chưa chạy end-to-end với PostgreSQL/Stadia thật và chưa thử lượt thật kích hoạt `apply_to_draft` hay `FALSE_PASS` (cả hai nhánh này đã được kiểm chứng bằng unit/stream test với `MockLanguageModelV4`).

# Spec — Trợ lý chuyến đi biết suy luận (`Saved-trip assistant` reasoning upgrade)

**Trạng thái: IMPLEMENTED LOCALLY — 2026-11-21.** Chủ dự án duyệt làm cả Giai đoạn A và B (2026-11-20); quyết định ghi tại [ADR-39](../decisions.md#adr-39--saved-trip-assistant-answers-through-a-bounded-tool-using-reasoning-loop-2026-11-21). Đã qua test với provider giả; **chưa chạy thử với OpenAI thật** (xem mục Trạng thái triển khai ở cuối). Bổ sung cho [saved-trip-assistant-spec.md](saved-trip-assistant-spec.md) và [ADR-38](../decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19). **Giai đoạn A** nằm trong phạm vi ADR-38 hiện hành. **Giai đoạn B** thay đổi kiến trúc Bước 1/Bước 2 của ADR-38, nên phải có một quyết định mới được chủ dự án duyệt (đề xuất `ADR-39`, xem mục cuối) trước khi lập trình. Tài liệu này chưa kích hoạt lập trình, migration hay triển khai.

---

## Problem Statement

Trong `/trips/[id]/edit`, người dùng hỏi Trợ lý AI những câu tự nhiên về chuyến đi đã lưu nhưng nhận về câu trả lời theo khuôn mẫu, lặp lại và không đúng trọng tâm, dù hệ thống có cấu hình khóa OpenAI.

**Bằng chứng (2026-11-20, production `kltn-rho.vercel.app`, chuyến 5 ngày / 13 lượt, có `nơi xuất phát`):** người dùng hỏi *"tôi di chuyển bắt đầu từ đâu lúc mấy giờ nhỉ"*. Trợ lý trả về **nguyên văn** đoạn đã trả lời ở lượt trước: "Bản nháp hiện có 13 điểm trên 5 ngày… Di chuyển nội bộ: đã đo 8/8 chặng… Lộ trình xuất phát/trở về: dự kiến tới điểm đầu lúc 13:04…". Câu trả lời không nêu xuất phát **từ đâu** và **lúc mấy giờ**. Văn bản này khớp từng dòng với template tất định `buildGroundedAdvice` ([ai-workspace-plan.ts](../../apps/web/src/modules/trip-edit/ai-workspace-plan.ts)), nghĩa là lời văn **không do LLM soạn**.

**Nguyên nhân từ mã nguồn hiện tại:**

1. **Lỗi composer bị nuốt im lặng.** `composeGroundedAdviceWithFallback` ([saved-trip-advisory.ts](../../apps/web/src/modules/trip-edit/saved-trip-advisory.ts)) có `catch { return input.fallbackText; }` và không ghi lại bất kỳ lý do nào. Có ít nhất bốn đường dẫn tới fallback mà không ai thấy được:
   - timeout `COMPOSER_TIMEOUT_MS = 10_000`, sau khi request đã tốn thời gian cho LLM phân loại, routing, preview và thời tiết;
   - `finish_reason !== "stop"` (ví dụ chạm `max_completion_tokens` 1200) bị client coi là lỗi;
   - JSON trả về không khớp schema;
   - bộ `isGroundedAdviceTextSafe` từ chối câu trả lời.

   Hiện không có dữ liệu cho biết đường nào đang xảy ra trên production.
2. **LLM được dùng để phân loại chứ không để suy luận.** Lần gọi đầu ép câu hỏi vào `mode` cộng một trong 15 `AdviceTopic`, với hơn 15 luật "nếu… thì đặt topic=…". Sau đó regex/if-else chọn một nhánh code viết sẵn (location → interleaved QA → recommend → rest → two-step). Câu nào không lọt khuôn sẽ rơi về `GENERAL`, và `GENERAL` luôn ra cùng một bản tóm tắt.
3. **Composer thiếu ngữ cảnh và bị trói câu chữ.** Composer chỉ nhận `verifiedFacts` (tóm tắt trạng thái), không thấy lịch đầy đủ từng ngày/lượt/chặng. Nó chạy với `temperature: 0` và 7 quy tắc "TUYỆT ĐỐI", kèm yêu cầu "dựa HOÀN TOÀN trên verifiedFacts", nên câu chữ cứng và lặp lại tóm tắt.
4. **Không có khả năng tự thử phương án.** Mọi tình huống ("nếu bỏ điểm X thì sao", "nghỉ đến 9h thì sửa thế nào", "so sánh hai cách") phải có người viết sẵn một nhánh code. Gặp tình huống chưa có nhánh, AI không xử lý được.
5. **Fallback không trả lời câu hỏi.** Khi LLM lỗi, người dùng nhận bản tóm tắt chung thay vì dữ kiện liên quan đến câu đã hỏi.
6. **Trợ lý chuyến đi gọi model "yếu" hơn các chức năng khác dù cùng là `gpt-6-luna`.**
   - Route `/api/trips/[id]/edits/ai` dùng `createOpenAiStructuredClient` (client của preference extraction). Với `gpt-6-luna`, client này gửi `reasoning_effort: "none"`, `temperature: 0`, `max_completion_tokens: 1200` (`preferenceRequestParameters`).
   - Các chức năng khác như `planning-reply`, `planning-response`, `in-trip-session` và Q&A dùng `createQaJsonProvider({ model: "gpt-6-luna" })`. Provider này gửi `reasoning_effort: "high"` với ít nhất 8000 token (`qaRequestParameters`).
   - Vì vậy trợ lý chuyến đi vừa không suy luận, vừa dễ chạm trần token, rồi `finish_reason !== "stop"` khiến câu trả lời bị bỏ và rơi về template.

---

## Solution

Chia làm hai giai đoạn, mỗi giai đoạn tự đem lại giá trị.

**Giai đoạn A — Quan sát được và làm composer hoạt động thật (trong ADR-38, không đổi kiến trúc):**
- Ghi lại lý do mỗi lần composer rơi về fallback, để sửa đúng chỗ thay vì đoán.
- Cho composer ngữ cảnh đủ để trả lời (lịch đầy đủ, nơi/giờ xuất phát), nới quy tắc câu chữ theo ADR-34 (giữ chặt cổng an toàn, bỏ cổng văn phong), và đặt ngân sách thời gian/token hợp lý.
- Khi buộc phải fallback, câu trả lời tất định phải đưa dữ kiện liên quan đến câu hỏi lên đầu, không đổ ra bản tóm tắt chung.

**Giai đoạn B — Trợ lý suy luận có công cụ, giới hạn số bước (cần `ADR-39`):**
- Thay chuỗi "phân loại 15 topic → nhánh code cứng → LLM viết lại" bằng **một vòng suy luận LLM có giới hạn**. Trong vòng này, model đọc toàn bộ ngữ cảnh chuyến đi và tự gọi các **công cụ tất định chỉ-đọc hoặc chạy-thử** của server: đọc lịch, chạy thử thao tác qua Validator, tìm điểm đến, tra thời tiết, tra RAG.
- Model chỉ **đề xuất**. Mọi bản nháp, diff, thẻ `Actionable advice suggestion` và kết quả `PASS` / `VIOLATION` / `INSUFFICIENT_DATA` vẫn do server đóng gói từ kết quả công cụ. Ranh giới quyền hạn của ADR-29 được giữ nguyên.
- Các quy tắc cứng vẫn chạy bằng code **trước** model: quyền sở hữu, khóa `COMPLETED`, trường khung bất biến, chính sách GPS và khóa lượt đã qua giờ khi `ONGOING`.

---

## User Stories

Người dùng là chủ chuyến đi đã lưu, đang ở `/trips/[id]/edit` hoặc `/trips/[id]/in-trip`.

1. Hỏi *"tôi xuất phát từ đâu, lúc mấy giờ?"* → nhận đúng tên `nơi xuất phát`, giờ khởi hành và giờ dự kiến tới điểm đầu, không kèm tóm tắt thừa.
2. Hỏi *"tôi đi thế này được không?"* → nhận đánh giá có lập luận: ngày nào dày, chặng nào dài, điểm nào sát giờ đóng cửa hoặc sau hoàng hôn, kèm phương án nếu có điểm nghẽn.
3. Hỏi *"có nên đi Lũng Cú trước rồi mới tới Dinh Vua Mèo không?"* → server chạy thử cả hai thứ tự, AI so sánh thời gian di chuyển và kết quả Validator rồi khuyên dựa trên số liệu thật.
4. Hỏi *"sáng đến nơi muốn nghỉ đến 9h mới đi thì nên sửa thế nào?"* → AI tự thử các phương án (lùi giờ kèm `auto-shift`, chuyển điểm cuối sang ngày sau, rút thời lượng trong ngưỡng tối thiểu) và trả về tối đa 2 thẻ phương án đã được kiểm chứng.
5. Nói *"tôi muốn đổi địa điểm này sang chỗ khác"* (trỏ tới một lượt cụ thể, hoặc nhắc lại lượt vừa nói) → nhận tối đa 3 điểm `VISIBLE` phù hợp, mỗi điểm có thẻ áp dụng 1 chạm và lý do chọn.
6. Hỏi giả định *"nếu bỏ điểm X thì ngày 2 về lúc mấy giờ?"* → AI chạy thử và trả lời con số thật, bản nháp không thay đổi.
7. Hỏi nối tiếp *"sao lại thế?"*, *"giải thích rõ hơn"*, *"ý tôi là ngày 3"* → AI hiểu lượt trước và trả lời đúng mạch, không lặp lại câu cũ.
8. Hỏi kép *"ngày 4 có gấp không, gấp thì sửa luôn giúp tôi"* → nhận đánh giá kèm bản đề xuất `PROPOSED` (hoặc thẻ lựa chọn nếu có nhiều cách đánh đổi).
9. Hỏi *"ngày nào nhẹ nhất để đi chậm?"*, *"tổng cộng tôi lái bao nhiêu km?"* → nhận câu trả lời tổng hợp từ lịch và chặng đã đo.
10. Hỏi văn hóa, ẩm thực hoặc thời tiết xen giữa lúc chỉnh lịch → nhận câu trả lời RAG/`Kiến thức mở rộng` hoặc thời tiết như ADR-38, không đứt mạch hội thoại.
11. Hỏi điều hệ thống không có dữ liệu → AI nói rõ là không biết hoặc chưa đủ dữ liệu, không bịa và không lặp lại bản tóm tắt.
12. Khi LLM gặp sự cố → vẫn nhận câu trả lời tất định có dữ kiện liên quan đến câu hỏi, cùng mọi thẻ phương án và kết quả kiểm tra.

---

## Implementation Decisions

### Giai đoạn A — Quan sát được & sửa composer (trong ADR-38)

**A1. Ghi lý do fallback.**
- `composeGroundedAdviceWithFallback` trả kèm (hoặc ghi qua metric hiện có) một mã lý do: `TIMEOUT`, `PROVIDER_ERROR:<PreferenceExtractionError code>`, `SCHEMA_INVALID`, `FACT_GUARD:<rule>` hoặc `OK`.
- `isGroundedAdviceTextSafe` trả về tên quy tắc đã chặn, thay vì chỉ `false`.
- Log chỉ chứa mã lý do, độ trễ, model và tripId đã băm. **Không** log nội dung câu hỏi, câu trả lời, tọa độ hay `nơi xuất phát`, để tuân thủ quy định không rò rỉ dữ liệu người dùng và secret.
- Nếu đủ, tận dụng `assistantMetric` / bộ đếm từ chối mà ADR-34 đã định nghĩa. Không thêm dependency logging mới.

**A2. Ngữ cảnh đủ cho composer.**
- Payload composer bổ sung lịch rút gọn của bản nháp (theo ngày: tên lượt, giờ bắt đầu–kết thúc, thời lượng; các chặng đã đo) và khối `journey` đầy đủ (`originLabel`, `departureTime`, giờ tới điểm đầu, giờ về, hạn về), luôn có mặt khi chuyến đi có `nơi xuất phát`.
- Chặn kích thước theo trần 50 lượt hiện có. Không thêm ID nội bộ vào payload ngoài những gì Fact Guard đã cho phép lọc.

**A3. Prompt và tham số.**
- Viết lại prompt composer theo tinh thần ADR-34: giữ các cổng **an toàn** (không nói PASS khi VIOLATION/INSUFFICIENT_DATA, không bịa tên điểm/ID/giá/giờ mở cửa, không cam kết an toàn thời tiết tuyệt đối, phân biệt `UPCOMING`/`ONGOING`), và bỏ các ràng buộc **văn phong** (định dạng cố định, bắt buộc nhắc tóm tắt).
- Yêu cầu trả lời thẳng câu hỏi trước, chỉ nêu dữ kiện liên quan, rồi mới đến lưu ý quan trọng nếu có.
- Thêm vài ví dụ hỏi–đáp ngắn (few-shot) cho các câu hỏi mẫu trong User Stories.
- **Model (đã chốt):** dùng `gpt-6.1-terra`, cùng model với hỏi đáp và tạo hành trình (đã đổi ngày 2026-11-20), gọi qua `createQaJsonProvider({ model: "gpt-6.1-terra", ... })` theo đúng mẫu của [planning-reply.ts](../../apps/web/src/modules/assistant-planning/planning-reply.ts). Bỏ `createOpenAiStructuredClient` cho cả composer lẫn bộ phân loại của trợ lý chuyến đi; nhờ vậy cả hai dùng `qaRequestParameters` (`reasoning_effort: "medium"` là mức mặc định của Terra, ≥ 8000 token).
- **Không đặt giới hạn chi phí hay token riêng (đã chốt):** dùng mức trần lớn nhất mà `createQaJsonProvider` cho phép (`QA_GENERATION_LIMITS`). `COMPOSER_TIMEOUT_MS` nâng ngang timeout của provider. Không thêm hàm tham số mới vào `openai-model-catalog.ts`.

**A4. Fallback có trọng tâm.**
- `buildDeterministicAdvisoryFallback` nhận `topic` (đã có) và câu hỏi gốc, rồi sắp xếp dòng liên quan lên đầu. Ví dụ: `JOURNEY_ORIGIN` hoặc câu hỏi về xuất phát thì in dòng `nơi xuất phát` + giờ khởi hành trước; câu hỏi về một ngày thì in ngày đó trước.
- Bổ sung dòng `nơi xuất phát` và giờ khởi hành vào template, vì hiện template chỉ in giờ tới điểm đầu và giờ về.
- Fallback **không** lặp lại nguyên văn câu trả lời của lượt trước. Nếu trùng, mở đầu bằng câu nói rõ trợ lý chưa trả lời chi tiết được câu này, kèm dữ kiện liên quan.

### Giai đoạn B — Vòng suy luận có công cụ (cần `ADR-39`)

**B1. Thứ tự xử lý một lượt.**
1. Code tất định chạy trước: xác thực, quyền sở hữu, trạng thái chuyến (`COMPLETED` → từ chối), phát hiện yêu cầu đổi trường khung (`isTripFrameEditRequest` → trả `IMMUTABLE_FRAME_ADVICE`), chính sách GPS khi `ONGOING`. Các nhánh này giữ nguyên.
2. Vòng suy luận: model nhận system prompt, ngữ cảnh chuyến đi đầy đủ (như A2), tối đa 16 lượt lịch sử (dữ liệu không đáng tin) và danh sách công cụ. Model có thể gọi công cụ nhiều lần trong giới hạn rồi trả kết quả cuối có cấu trúc.
3. Server đóng gói phản hồi: `ADVISED` / `PROPOSED` / `NEEDS_CLARIFICATION`, kèm thẻ phương án lấy **từ kết quả công cụ đã chạy**, rồi áp Fact Guard lên lời văn.

**B2. Bộ công cụ.** Tất cả đều tất định, server-owned và tái dùng code hiện có. Không công cụ nào gọi lại một planner chạy bằng model, theo ADR-29.

| Công cụ | Loại | Tái dùng |
|---|---|---|
| `get_itinerary(dayIndex?)` | đọc | `baseCandidate`, `placeNames`, `journeySummary`, `legs` |
| `get_validation(dayIndex?)` | đọc | kết quả `previewEdit` của bản nháp hiện tại |
| `simulate_operations(operations[])` | chạy thử, không ghi | `workspaceOperationModelSchema` → `verifyWorkspacePlanOutput` → `applyWorkspaceOperations` → `previewEdit`. Trả `simulationId`, diff, validation, giờ về |
| `search_destinations(query?, near?, dayIndex?, window?)` | đọc | catalog `VISIBLE`, logic xếp hạng của `saved-trip-recommend` |
| `get_weather_sun(dayIndex)` | đọc | `gatherWeatherAndSunDigest` (ADR-36: chỉ tư vấn) |
| `knowledge_lookup(question)` | đọc | `qaLookup` / RAG hiện có, giữ nhãn `Kiến thức mở rộng` |

`simulate_operations` dùng **đúng** hợp đồng thao tác hiện tại: ID phải nằm trong lịch hoặc catalog đã lọc, lượt đã qua giờ bị khóa khi `ONGOING`, và trần 50 lượt / 20 thao tác vẫn áp dụng.

**B3. Kết quả cuối của model** (JSON strict):
- `reply`: lời văn tiếng Việt;
- `proposeSimulationId`: `string | null` (khi người dùng ra lệnh sửa trực tiếp → `PROPOSED`);
- `suggestionSimulationIds`: tối đa 2 phần tử (→ thẻ `Actionable advice suggestion`);
- `destinationOptionIds`: tối đa 3 phần tử;
- `clarification`: `null` hoặc lý do + ứng viên.

Server chỉ chấp nhận `simulationId` do chính lượt này tạo ra. Thẻ, candidate, diff và validation được lấy từ bộ nhớ đệm kết quả công cụ của lượt, **không** từ văn bản model. Kết quả mô phỏng chỉ tồn tại trong request, không lưu DB.

**B4. Giới hạn (đã chốt: không giới hạn chi phí, số câu hỏi hay số lượt hỏi).**
- Không đặt trần chi phí, token hay số lượt hỏi của người dùng; model được gọi công cụ bao nhiêu lần tùy câu hỏi cần.
- Chỉ giữ hai chốt chặn **kỹ thuật**, không phải hạn mức ngân sách:
  1. Chống vòng lặp vô hạn khi model gọi lặp lại cùng một công cụ: trần cao (ví dụ 20 lần gọi công cụ mỗi lượt), bình thường không bao giờ chạm tới.
  2. `maxDuration` của route theo mức tối đa mà gói Vercel cho phép. Đây là giới hạn của nền tảng, code không bỏ được.
- Chạm một trong hai chốt → trả lời bằng những gì đã có, hoặc fallback A4.

**B5. Fact Guard.**
- Giữ các luật hiện có. Bổ sung kiểm tra số liệu theo đơn vị (phút, km, giờ đồng hồ, số lượt, số ngày) so với dữ kiện cùng loại từ ngữ cảnh và kết quả công cụ, như ADR-34 đã định.
- Lời văn vi phạm → dùng fallback A4 nhưng **vẫn giữ** các thẻ đã đóng gói.

**B6. Client OpenAI hỗ trợ tool-calling (đã chốt).**
- Trong repo chưa có client nào gọi `tools`. `modules/assistant-agent-v2/agent-runtime.ts` chỉ kích hoạt skill, không gọi provider và không có vòng lặp công cụ, nên không tái dùng được.
- Model `gpt-6.1-terra`. Theo [tài liệu OpenAI](https://developers.openai.com/api/docs/models/gpt-6.1-terra), model này nhận Chat Completions nhưng **gọi công cụ cần Responses API** (`POST /v1/responses`; tham số là `reasoning.effort`, không phải `reasoning_effort`). `createQaJsonProvider` hiện gọi Chat Completions với `response_format`.
- Vì vậy thêm một đường gọi Responses API cho vòng suy luận, đặt cạnh `createQaJsonProvider` trong `modules/ai/`. Đường mới dùng chung cách lấy khóa/model từ runtime config, cùng xử lý lỗi/timeout và quy ước `store: false`. Các chức năng hiện có vẫn ở Chat Completions, không đổi.
- Không thêm SDK mới (ADR-30).

**B7. Triển khai có cờ.** Bật Giai đoạn B sau một feature flag phía server, theo mẫu ADR-31. Pipeline ADR-38 hiện tại vẫn là đường mặc định cho tới khi eval B đạt tiêu chí. Hợp đồng HTTP của `/api/trips/[id]/edits/ai` **không đổi**, nên client và UI không phải sửa.

### Hợp đồng không đổi (cả A và B)
- Không đổi Prisma schema, không migration, không thêm biến môi trường bắt buộc (dùng cấu hình model runtime hiện có; cờ B có giá trị mặc định là tắt).
- Không đổi luồng `Apply` / `Lưu`, idempotency `SUCCESS` / `FAILED` / `UNKNOWN`, xử lý xung đột `409`, hay `Edit draft` phía client.
- Khóa OpenAI và Stadia chỉ dùng ở server. Không có giá trị nào xuất hiện trong log, phản hồi API hay bundle trình duyệt.

---

## Testing Decisions

Dùng lại **Seam 1** của [saved-trip-assistant-spec.md](saved-trip-assistant-spec.md#ranh-giới-kiểm-thử-test-seams-đề-xuất) (biên dịch vụ / Route Handler của `AI Edit/Advise`, với fake LLM, routing, thời tiết và RAG, đồng hồ cố định `Asia/Ho_Chi_Minh`). Không thêm seam mới.

**Giai đoạn A:**
- Mỗi đường fallback (timeout, `finish_reason=length`, schema sai, từng luật Fact Guard) ghi đúng mã lý do và **không** ghi nội dung người dùng.
- Câu hỏi về xuất phát, với fake LLM lỗi, trả fallback có dòng `nơi xuất phát` + giờ khởi hành ở đầu.
- Payload composer chứa lịch rút gọn và khối `journey` khi chuyến có `nơi xuất phát`.
- Hai câu hỏi khác nhau liên tiếp, cùng rơi về fallback, không trả hai văn bản giống hệt nhau.

**Giai đoạn B (fake LLM điều khiển chuỗi gọi công cụ theo kịch bản):**
- `simulationId` giả hoặc của lượt khác bị bỏ qua; thẻ chỉ sinh từ mô phỏng thật.
- `simulate_operations` với ID ngoài lịch/catalog, lượt đã qua giờ khi `ONGOING`, hoặc vượt trần đều bị từ chối như luồng hiện tại.
- Vượt giới hạn vòng hoặc ngân sách thời gian → vẫn trả phản hồi hợp lệ.
- Lời văn khẳng định PASS khi Validator báo VIOLATION/INSUFFICIENT_DATA, hoặc nêu số phút/km không có trong kết quả công cụ → bị chặn, thẻ vẫn còn.
- Yêu cầu đổi trường khung, chuyến `COMPLETED`, và câu cần GPS khi `ONGOING` không bao giờ đi vào vòng suy luận.
- Cờ tắt → hành vi y hệt pipeline ADR-38.

**Bộ eval câu hỏi (ngoài CI, chạy tay với khóa thật):**
- Khoảng 30 câu tiếng Việt bao phủ 12 User Stories, chạy trên 2–3 chuyến mẫu cố định (có/không `nơi xuất phát`, có ngày quá dày, có điểm ngoài trời sau hoàng hôn).
- Đo: tỷ lệ fallback, tỷ lệ trả lời đúng dữ kiện được hỏi (chấm theo checklist dữ kiện bắt buộc), tỷ lệ vi phạm Fact Guard, độ trễ p50/p95 và số lần gọi model mỗi lượt.
- So sánh A với B trên cùng bộ câu. Kết quả ghi vào `docs/implementation/` theo mẫu `assistant-v2-evaluation.md`.

---

## Acceptance Criteria

**Giai đoạn A**
- [ ] Given composer lỗi vì bất kỳ lý do nào, when lượt `ADVISED` hoàn tất, then log/metric có mã lý do cụ thể và không chứa nội dung câu hỏi, câu trả lời hay vị trí.
- [ ] Given chuyến có `nơi xuất phát` và composer hoạt động, when hỏi *"tôi xuất phát từ đâu lúc mấy giờ"*, then câu trả lời nêu tên `nơi xuất phát` và giờ khởi hành, và không lặp lại nguyên văn câu trả lời của lượt trước.
- [ ] Given composer lỗi, when hỏi cùng câu trên, then fallback đặt dòng `nơi xuất phát` + giờ khởi hành ở đầu.
- [ ] Given bộ eval, when chạy trên production config, then tỷ lệ fallback và nguyên nhân chính được ghi lại; tỷ lệ fallback mục tiêu do chủ dự án chốt sau lần đo đầu.

**Giai đoạn B** (sau khi `ADR-39` được duyệt)
- [ ] Given câu hỏi giả định hoặc so sánh (User Stories 3, 4, 6), when gửi, then câu trả lời dựa trên kết quả `simulate_operations` thật và bản nháp không đổi cho tới khi người dùng bấm áp dụng.
- [ ] Mọi thẻ, candidate, diff và validation trả về đều truy được tới một mô phỏng do server chạy trong lượt đó.
- [ ] Trên bộ eval, B có tỷ lệ trả lời đúng dữ kiện cao hơn A và không tăng vi phạm Fact Guard; không lượt nào bị Vercel cắt vì quá `maxDuration`.
- [ ] Cờ tắt → toàn bộ test hiện có của `trip-edit` vẫn đạt.

---

## Out of Scope

- Thay đổi UI/UX của `Saved-trip assistant` (bố cục, thẻ, Undo/Redo). Hợp đồng HTTP giữ nguyên.
- Streaming câu trả lời từng phần (có thể làm story riêng sau B).
- Chuyển sang AI SDK hoặc nhà cung cấp model khác (ADR-30).
- Cho model ghi trực tiếp vào `Edit draft` hay lịch trình đã lưu, hoặc tự quyết `PASS`.
- Thay đổi trường khung chuyến đi, tạo `ExternalPlace` mới, đặt dịch vụ lưu trú hay giá cả (như spec ADR-38).
- Lưu lịch sử hội thoại hoặc kết quả mô phỏng xuống DB.
- Áp dụng cùng thay đổi cho trợ lý lập kế hoạch `/assistant` toàn cục.

---

## Quyết định đã chốt (chủ dự án, 2026-11-20)

1. **Model:** `gpt-6.1-terra` (mức suy luận Medium) cho mọi lần gọi của trợ lý chuyến đi, cùng với hỏi đáp và tạo hành trình. Hai chức năng này đã được chuyển sang Terra trong code ngày 2026-11-20. Giai đoạn A gọi qua `createQaJsonProvider`; Giai đoạn B gọi qua Responses API (B6).
2. **Ngân sách:** dự án có đủ ngân sách, nên không đặt giới hạn chi phí, token, số câu hỏi hay số lượt. Chỉ giữ chốt chống vòng lặp vô hạn và `maxDuration` của Vercel (B4).
3. **Runtime Giai đoạn B:** mở rộng `createQaJsonProvider` thêm tool-calling (B6); không dùng `assistant-agent-v2/agent-runtime.ts`.
4. **Bộ phân loại 15 topic:** bỏ hẳn khi bật Giai đoạn B. Mọi câu hỏi, kể cả lệnh sửa trực tiếp, đi qua một vòng suy luận duy nhất (model gọi `simulate_operations` rồi trả `proposeSimulationId`). Không giữ "đường nhanh", vì ngân sách không phải ràng buộc và một đường xử lý thì ít code hơn hai.
5. **Thứ tự:** làm A trước (sửa nhanh, đo được ngay), rồi làm B ngay khi `ADR-39` được duyệt, không đợi số liệu A.
6. **Còn mở:** gói Vercel đang dùng cho phép `maxDuration` tối đa bao nhiêu. Kiểm tra trong dashboard Vercel khi bắt đầu B.

---

## Further Notes

**Quyết định cần duyệt — đề xuất `ADR-39` (chưa ghi vào `decisions.md`):**
> *Saved-trip assistant dùng một vòng suy luận LLM có giới hạn, gọi các công cụ tất định chỉ-đọc/chạy-thử thay cho bộ phân loại 15 topic và các nhánh kịch bản cứng của ADR-38 Bước 1. Server vẫn sở hữu mô phỏng, Validator, đóng gói thẻ và mọi lần ghi. Mô hình chỉ đề xuất và viết lời. Sửa đổi ADR-38 (Bước 1/Bước 2). Giữ ADR-29 (không gọi lồng planner chạy bằng model, Validator giữ quyền phán quyết), ADR-34 (cổng an toàn chặt, cổng văn phong lỏng), ADR-36 (thời tiết chỉ tư vấn).*

**Thứ tự:** A1–A4 (gồm đổi sang `createQaJsonProvider` + `gpt-6.1-terra`) → chủ dự án duyệt `ADR-39` → B sau cờ → eval A so với B → bật B mặc định.

**Nguồn:** ảnh chụp hội thoại production (2026-11-20), mã nguồn `apps/web/src/modules/trip-edit/` tại commit `9183c0b`, ADR-29, ADR-30, ADR-31, ADR-34, ADR-36, ADR-38.

---

## Trạng thái triển khai (2026-11-21)

**Giai đoạn A — đã làm:**
- Client mới `createTripAssistantStructuredClient` ([trip-assistant-openai.ts](../../apps/web/src/modules/trip-edit/trip-assistant-openai.ts)): `gpt-6.1-terra`, `reasoning_effort: "medium"`, không đặt trần token. Client này thay `createOpenAiStructuredClient` cho route `/api/trips/[id]/edits/ai`, nên bộ phân loại, composer và các nhánh kịch bản cũ đều chạy Terra. Lý do không dùng `createQaJsonProvider` như dự kiến ở A3: provider đó giới hạn input 8.000 token / 40.000 ký tự và phụ thuộc ngân sách thời gian của luồng Q&A, không hợp với prompt chỉnh sửa có danh mục điểm đến.
- Timeout: bộ phân loại 15 s → 90 s, composer 10 s → 90 s.
- A1: `groundedAdviceRejection` trả tên luật chặn; composer ghi `{"event":"trip_assistant","stage":"COMPOSER","outcome","reason","topic","elapsedMs"}`, không ghi nội dung hội thoại.
- A3: viết lại prompt composer (giữ cổng an toàn, bỏ ràng buộc văn phong).
- A4: câu trả lời dự phòng thêm "khởi hành từ <nơi xuất phát> lúc <giờ>" và đưa dòng này lên đầu khi câu hỏi là về xuất phát/trở về (`isJourneyQuestion`).

**Giai đoạn B — đã làm, khác bản nháp ở các điểm:**
- **Bật mặc định** (không đợi eval như B7 dự kiến), theo yêu cầu "làm luôn" của chủ dự án. An toàn nhờ: mọi lỗi của vòng suy luận đều chuyển lượt đó về pipeline ADR-38. Tắt bằng biến môi trường `TRIP_ASSISTANT_AGENT=off`.
- **Bộ phân loại không bị xóa**: nó vẫn là đường dự phòng, và vẫn xử lý lượt có `resolution` (người dùng chọn đáp án làm rõ) cùng lượt cần GPS khi chuyến `ONGOING`.
- Bỏ công cụ `get_itinerary` / `get_validation`: lịch, chặng và kết quả kiểm tra hiện tại đã nằm sẵn trong `tripContext` ở tin nhắn đầu.
- Chốt chặn vòng lặp: 12 vòng / 24 lần gọi công cụ; route `maxDuration = 300`.
- Mã nguồn: [trip-assistant-agent.ts](../../apps/web/src/modules/trip-edit/trip-assistant-agent.ts), nối vào `createAiEditProposal` qua `answerWithTripAssistantAgent` trong [ai-edit-service.ts](../../apps/web/src/modules/trip-edit/ai-edit-service.ts).

**Kiểm chứng:**
- Test mới: `trip-assistant-agent.vitest.test.ts` (8), `trip-assistant-openai.vitest.test.ts` (8), `saved-trip-composer.vitest.test.ts` (7). Toàn bộ `trip-edit` + `src/app/trips`: 289 đạt, 1 bỏ qua. Typecheck đạt.
- **Chưa chứng minh:** hình dạng request Responses API (`store: false` + `include: ["reasoning.encrypted_content"]`, gửi lại nguyên các output item) mới được kiểm bằng provider giả. Bộ eval khoảng 30 câu với khóa thật chưa chạy. Nếu request sai, mọi lượt sẽ về pipeline ADR-38 và log ghi `stage: "AGENT", outcome: "FALLBACK", reason: "PROVIDER:..."`.

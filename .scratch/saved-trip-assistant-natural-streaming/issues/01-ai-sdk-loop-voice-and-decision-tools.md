# 01: Vòng suy luận trên AI SDK, giọng người đồng hành, quyết định bằng `apply_to_draft` / `show_options` (vẫn trả JSON)

**What to build:** Viết lại vòng suy luận ADR-39 (`apps/web/src/modules/trip-edit/trip-assistant-agent.ts`) trên Vercel AI SDK, dùng `ai` 7.0.28 và `@ai-sdk/openai` 4.0.14 đã cài. Ticket này **chưa stream ra trình duyệt**: route vẫn trả đúng JSON như hiện tại. Có ba thay đổi:

1. Model không còn trả JSON cuối lượt (`reply` / `proposeSimulationId` / `suggestionSimulationIds`). Nó viết lời văn tự do và quyết định bằng hai công cụ mới:
   - `apply_to_draft({ simulationId })`
   - `show_options({ simulationIds })`
2. Prompt mới theo giọng "người đồng hành": xưng mình/bạn, không ép độ dài, dám khuyến nghị kèm lý do, áp dụng *Stated assumption*.
3. Mọi đảm bảo của ADR-39 giữ nguyên:
   - simulation chỉ hợp lệ trong cùng lượt;
   - server đóng gói candidate, diff, thẻ và Validator;
   - fact guard vẫn chạy;
   - mọi lỗi chuyển về luồng ADR-38.

**Blocked by:** Không có.

**Status:** done

## Bối cảnh code hiện tại (đọc trước khi sửa)

- `trip-edit/trip-assistant-agent.ts`: `runTripAssistantAgent(ctx)` gồm vòng lặp tự viết; các công cụ `simulate_changes`, `search_destinations`, `get_weather`, `lookup_local_knowledge`; `simulateChanges()` dùng `verifyWorkspacePlanOutput` → `applySuggestedDurationsToPlan` → `applyWorkspaceOperations` → `runPreview`; `TRIP_ASSISTANT_AGENT_INSTRUCTIONS`; `FINAL_OUTPUT_SCHEMA`; fact guard qua `groundedAdviceRejection`; log qua `logTripAssistantEvent`.
- `trip-edit/trip-assistant-openai.ts`:
  - `createTripAssistantResponsesClient` (Responses API tự viết): **sẽ bỏ** ở ticket này.
  - `createTripAssistantStructuredClient` (Chat Completions cho luồng ADR-38): **giữ nguyên**.
- `trip-edit/ai-edit-service.ts`: `answerWithTripAssistantAgent()` dựng `TripAssistantAgentContext` rồi map kết quả sang `AiEditServiceResult`. Dependency `agent?: TripAssistantResponsesClient` sẽ đổi kiểu.
- Route `apps/web/src/app/api/trips/[id]/edits/ai/route.ts`: tạo client và đọc `TRIP_ASSISTANT_AGENT=off`.

## Yêu cầu chi tiết

1. **Model:**
   - Tạo `LanguageModel` bằng `createOpenAI({ apiKey, fetch })` của `@ai-sdk/openai`, khóa lấy từ `effectiveConfig("OPENAI").apiKey` như `resolveTripsageChatModel` trong `tripsage-chat-provider.ts`.
   - Model `gpt-6.1-terra`. Dùng **Responses API**: `provider.responses("gpt-6.1-terra")`. Theo tài liệu OpenAI, tool calling của Terra cần Responses API.
   - Đặt `providerOptions: { openai: { reasoningEffort: "medium", store: false } }`.
   - Đọc kiểu trong `node_modules/@ai-sdk/openai` để dùng đúng tên option, **không đoán**.
   - Không đặt trần `maxOutputTokens` (chủ dự án không giới hạn).
   - **Không** dùng lại `createBoundedOpenAiFetch` của tripsage, vì nó ép trần 8000 token. Nếu cần fetch có timeout thì viết wrapper riêng, không ép token.
2. **Vòng lặp:**
   - Dùng `generateText` hoặc `streamText` của `ai` với `tools`, `stopWhen: isStepCount(N)`, `maxRetries: 0`, `repairToolCall: async () => null`, và `prepareStep` khóa công cụ ở bước cuối, như tripsage.
   - N giữ tinh thần ADR-39 (≈12 bước; tối đa 24 lần gọi công cụ). Đây là chốt chặn vòng lặp, không phải hạn mức ngân sách.
   - Ticket này có thể dùng `generateText`, nhưng nên dựng hàm sao cho ticket 02 chuyển sang `streamText` mà không viết lại công cụ.
3. **Công cụ** (định nghĩa bằng `tool({ description, inputSchema: z.object(...).strict(), execute })`):
   - Giữ nguyên logic server của 4 công cụ cũ, chuyển sang `tool()`.
   - `apply_to_draft({ simulationId })`: simulationId phải có trong map simulation của lượt. ID lạ thì trả `{ ok: false, error }` cho model. Gọi nhiều lần thì lần sau ghi đè lần trước.
   - `show_options({ simulationIds })`: lọc ID lạ, bỏ trùng, tối đa 3 thẻ, bỏ simulation đã được `apply_to_draft`.
   - Kết quả công cụ chỉ đi tới model, không bao giờ vào văn bản trả lời.
4. **Kết quả:**
   - Có `apply_to_draft` hợp lệ → `{ kind: "PROPOSED", reply, simulation }`.
   - Còn lại → `{ kind: "ADVISED", reply, suggestions, knowledgeParts?, citations? }`.
   - `reply` = toàn bộ lời văn của model (nối các bước có chữ), đã `normalize("NFC").trim()`. `reply` rỗng thì coi là lỗi, chuyển về ADR-38.
5. **Prompt** (thay `TRIP_ASSISTANT_AGENT_INSTRUCTIONS`), tiếng Việt:
   - Giọng: "mình/bạn", người đồng hành có kinh nghiệm, ấm áp, nói thẳng, dám khuyến nghị kèm lý do.
   - Không quy tắc độ dài: viết tự nhiên theo nhu cầu câu hỏi. Không câu kết chung chung kiểu "bạn cần gì thêm không". Không emoji.
   - Chào, cảm ơn, hỏi ngoài lề: đáp ngắn tự nhiên, không đổ dữ liệu chuyến đi ra.
   - Trả lời bằng ngôn ngữ người dùng viết (mặc định tiếng Việt).
   - *Stated assumption*:
     - Yêu cầu sửa thiếu một chi tiết nhưng chỉ có một cách hiểu hợp lý → chạy thử, `apply_to_draft`, rồi nói rõ đã hiểu thế nào và mời đổi.
     - Nhiều cách có đánh đổi thật → chạy thử các cách, `show_options`, giải thích đánh đổi.
     - Không đoán được ý (ví dụ "điểm đó" không rõ) → hỏi lại ngắn.
   - Câu hỏi tư vấn chỉ-đọc → không `apply_to_draft`.
   - Giữ **nguyên văn ý nghĩa** các quy tắc cứng của prompt cũ:
     - chỉ dùng visitId trong `tripContext` và destination id từ `search_destinations`;
     - không đụng `lockedVisitIds`;
     - trường khung cố định;
     - `originClocks` chỉ khi `journeyEditable`;
     - PASS/VIOLATION chỉ từ máy chủ, không nói lịch hiện tại hợp lệ khi có vi phạm;
     - không bịa tên điểm, giá, giờ mở cửa;
     - thời tiết chỉ tham khảo;
     - kiến thức ngoài tài liệu ghi `[Kiến thức mở rộng]`;
     - không ghi visitId, destination id, simulationId, URL hay HTML trong lời trả lời.
6. **Fact guard và fallback:**
   - Giữ `groundedAdviceRejection` trên `reply` với cách chọn trạng thái như hiện tại: có đề xuất thì lấy trạng thái simulation; có thẻ PASS thì PASS; còn lại lấy trạng thái lịch hiện tại.
   - Ở ticket này, bị chặn vẫn chuyển về ADR-38 như cũ. Ticket 02 mới đổi sang Correction note.
   - Mọi lỗi provider, vượt bước hoặc reply rỗng → `null`, rồi luồng ADR-38 chạy.
   - Log `logTripAssistantEvent` giữ các trường cũ: `stage`, `outcome`, `reason`, `kind`, `rounds`/`steps`, `toolCalls`, `elapsedMs`. **Không** log câu hỏi, câu trả lời, vị trí hay khóa.
7. **Dependency injection:**
   - `AiEditServiceDependencies.agent` đổi thành thứ test inject được, ví dụ `agent?: { model: LanguageModel } | (() => Promise<LanguageModel>)`.
   - Test truyền `MockLanguageModelV4`. Route tạo model thật.
   - `TRIP_ASSISTANT_AGENT=off` vẫn tắt.
8. **Dọn code:**
   - Xóa `createTripAssistantResponsesClient` và các kiểu `Responses*` không còn dùng.
   - Cập nhật `trip-assistant-openai.vitest.test.ts`: bỏ các test Responses, giữ test structured client.

## Acceptance criteria

- [x] `trip-assistant-agent.vitest.test.ts` được viết lại với `MockLanguageModelV4`, đạt hết, phủ các kịch bản sau:
  - câu hỏi chỉ-đọc → `ADVISED`, bộ phân loại cũ **không** được gọi;
  - `simulate_changes` rồi `apply_to_draft("sim-1")` → `PROPOSED` với candidate đúng giờ mới;
  - `show_options(["sim-1","sim-2","sim-9"])` → đúng 2 thẻ, `sim-9` bị bỏ;
  - `apply_to_draft("sim-9")` (ID lạ) → công cụ trả `ok:false`, lượt kết thúc `ADVISED`;
  - thao tác với visitId giả → `simulate_changes` trả `ok:false`;
  - provider lỗi / vượt số bước / lời trả lời rò `visit-1` → chuyển về ADR-38 (bộ phân loại được gọi đúng 1 lần), log `outcome:"FALLBACK"` đúng `reason`;
  - yêu cầu đổi trường khung → agent không được gọi;
  - log không chứa nội dung câu hỏi.
- [x] Tin nhắn user đầu tiên gửi model vẫn chứa `tripContext` (stops có visitId, journey, lockedVisitIds, journeyEditable, now).
- [x] Prompt mới có đủ các ý của mục 5. Một test đọc hằng số prompt kiểm có các cụm "mình", "Kiến thức mở rộng", "giả định" hoặc tương đương. Không cần kiểm câu chữ chính xác.
- [x] Route `POST /api/trips/[id]/edits/ai` vẫn trả JSON y như trước; toàn bộ test `trip-edit` cũ đạt.
- [x] `npx tsc --noEmit -p .` đạt.
- [x] Commit cục bộ (không push). Commit này gồm cả các file đang chờ trong working tree của phiên trước: `apps/web/src/lib/trip-edit-client.ts`, `apps/web/src/app/trips/[id]/edit/edit-trip-client.tsx` (thời gian chờ AI 305 giây), `GLOSSARY.md`, `docs/decisions.md` (ADR-40), `docs/README.md`, `docs/product/saved-trip-assistant-natural-streaming-spec.md`, và thư mục `.scratch/saved-trip-assistant-natural-streaming/`.

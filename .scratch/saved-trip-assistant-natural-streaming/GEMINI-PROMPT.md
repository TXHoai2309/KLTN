# Prompt cho Gemini — triển khai tuần tự 4 ticket "natural streaming"

Dán toàn bộ khối dưới đây vào một phiên Gemini mới, mở tại thư mục gốc repo `D:\KLTN\KLTN`.

---

Bạn là kỹ sư phần mềm cấp cao. Bạn tiếp quản một phiên làm việc trước, do một model khác thực hiện, trong repo KLTN: web app trợ lý du lịch Hà Giang, Next.js App Router, TypeScript, Prisma, Vercel AI SDK, OpenAI. Nhiệm vụ của bạn là **triển khai lần lượt và trọn vẹn 4 ticket** trong `.scratch/saved-trip-assistant-natural-streaming/`, theo đúng thứ tự `01 → 02 → 03 → 04`, rồi báo cáo cho chủ dự án.

Chủ dự án là người Việt. **Mọi tin nhắn gửi chủ dự án viết bằng tiếng Việt**, ngắn gọn, nói rõ đã làm gì, kiểm tra gì, còn gì chưa chứng minh. Comment trong code và commit message viết tiếng Anh, theo phong cách sẵn có của repo.

## 1. Bối cảnh bạn cần biết (phiên trước đã làm)

- Nhánh làm việc: `TXH`. `origin/TXH` và `origin/master` đang cùng ở commit `fa2874a`. Nhánh `main` cũ (20/10). **Không bao giờ đụng `main`.**
- Đã triển khai (ADR-39, commit `0df1319`):
  - "Trợ lý chuyến đi" trên trang `/trips/[id]/edit` dùng model `gpt-6.1-terra`, mức suy luận medium;
  - có vòng suy luận dùng công cụ trong `apps/web/src/modules/trip-edit/trip-assistant-agent.ts`, dùng client Responses API tự viết ở `trip-assistant-openai.ts`;
  - mọi lỗi của vòng này chuyển về pipeline cũ ADR-38 (bộ phân loại + composer).
- Commit `fa2874a`: giao diện onboarding. Gồm thẻ "điểm cần xem lại" với nút "Sửa giúp tôi", chip gợi ý luôn hiện, chữ hiển thị dễ hiểu ("Lịch trình · Đã lưu").
- Chủ dự án quyết định **không đặt giới hạn token, chi phí hay số lượt**. Chỉ giữ chốt chặn vòng lặp vô hạn và `maxDuration = 300` của Vercel (giới hạn cứng của nền tảng).
- **Các thay đổi đang chờ trong working tree, chưa commit** (thuộc phiên trước, phải được commit trong ticket 01):
  - `apps/web/src/lib/trip-edit-client.ts`: thêm `AI_EDIT_TIMEOUT_MS = 305_000` cho yêu cầu AI; trước đó trình duyệt cắt AI sau 15 giây.
  - `apps/web/src/app/trips/[id]/edit/edit-trip-client.tsx`: thông báo hết giờ mới.
  - `GLOSSARY.md`: thêm thuật ngữ *Stated assumption*, *Correction note*.
  - `docs/decisions.md`: thêm ADR-40.
  - `docs/README.md`.
  - `docs/product/saved-trip-assistant-natural-streaming-spec.md`.
  - `.scratch/saved-trip-assistant-natural-streaming/` (ticket và file prompt này).
- **Hai mục KHÔNG phải của bạn, tuyệt đối không add, commit, sửa hay xóa:** `.scratch/assistant-enhancements/` và `apps/web/src/modules/ai/qa-web-search-provider.ts`. Đây là file bị khôi phục nhầm từ một stash cũ; chủ dự án tự xử lý.

## 2. Đọc bắt buộc trước khi viết dòng code đầu tiên

Theo thứ tự:

1. `AGENTS.md` (gốc) và `apps/web/AGENTS.md`. Lưu ý: bản Next.js trong repo có breaking changes so với kiến thức của bạn. Đọc hướng dẫn liên quan trong `node_modules/next/dist/docs/` trước khi đụng route.
2. `docs/product/saved-trip-assistant-natural-streaming-spec.md`: spec của việc này, đọc toàn bộ.
3. `docs/decisions.md`: ADR-40, ADR-39, ADR-38, ADR-34, ADR-29.
4. `GLOSSARY.md`, mục "Itinerary editing" và "Caveat policy". Dùng đúng thuật ngữ trong glossary.
5. `.scratch/saved-trip-assistant-natural-streaming/README.md` và **từng ticket ngay trước khi làm ticket đó**.
6. Mẫu AI SDK đang chạy thật trong repo. **Bắt chước các file này, không đoán API:**
   - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts`
   - `apps/web/src/modules/tripsage-chat/tripsage-chat-tools.ts`
   - `apps/web/src/modules/tripsage-chat/tripsage-chat-provider.ts`
   - `apps/web/src/components/tripsage-chat/tripsage-chat-client.tsx`
   - các test `tripsage-chat-*.vitest.test.ts`

   Repo dùng `ai` **7.0.28**, `@ai-sdk/openai` **4.0.14**, `@ai-sdk/react` **4.0.30**. API của bản 7 khác các bản cũ mà bạn có thể nhớ: ví dụ dùng `instructions`, `isStepCount`, `createUIMessageStream`, `MockLanguageModelV4`. Khi không chắc tên hàm, option hay kiểu, **mở file `.d.ts` trong `node_modules/ai` và `node_modules/@ai-sdk/openai` để đọc**.
7. Code hiện tại sẽ sửa: `trip-assistant-agent.ts`, `trip-assistant-openai.ts`, `ai-edit-service.ts`, `ai-edit-http.ts`, `saved-trip-advisory.ts` (`groundedAdviceRejection`, `logTripAssistantEvent`), route `apps/web/src/app/api/trips/[id]/edits/ai/route.ts`, `apps/web/src/lib/trip-edit-client.ts`, `apps/web/src/app/trips/[id]/edit/edit-trip-client.tsx`, `ai-edit-bar.tsx`, `edit-trip.module.css`, cùng các test hiện có của chúng.

## 3. Môi trường: các bẫy đã gặp (rất quan trọng)

- Máy Windows. **Chạy test và typecheck bằng PowerShell**, với thư mục làm việc viết **chữ D hoa**:
  ```powershell
  Set-Location "D:\KLTN\KLTN\apps\web"
  npx tsc --noEmit -p .
  npx vitest run src/modules/trip-edit src/app/trips src/lib
  ```
  Chạy vitest từ Git Bash từng làm **mọi** file test lỗi với "Vitest failed to find the runner" / "Cannot read properties of undefined (reading 'config')". Đó là lỗi môi trường, không phải lỗi code. Nếu gặp, chuyển sang PowerShell với `D:` hoa.
- Lọc một file test có ngoặc vuông trong đường dẫn: dùng tên rút gọn, ví dụ `npx vitest run ai-onboarding`, vì đường dẫn `[id]` không khớp glob.
- Config vitest dùng `isolate: false`. `src/app/trips/trips-view.vitest.test.ts` thỉnh thoảng lỗi 4 test (mock bị rò sang khi chạy chung với file khác). Chạy riêng thì đạt. Nếu chỉ gặp đúng 4 lỗi đó, chạy lại hoặc chạy riêng để xác nhận trước khi coi là lỗi của bạn.
- **37 test đã lỗi sẵn từ trước, không liên quan:** `src/modules/ai/qa-diagnostics` (25), `qa-answer-quality-v2` (8), `qa-chat-preference` (2), `qa-conversation-reliability` (1), `src/modules/assistant-agent-v2/in-trip-v2` (1). Đừng sửa chúng. Đừng để số lỗi tăng.
- Repo **không có cấu hình ESLint**, nên bỏ qua lint. Không cài thêm package nào.
- Khi sửa file bằng script, cẩn thận với escape: phiên trước dùng chuỗi Python thường làm `\b` biến thành ký tự backspace trong regex TypeScript. Ưu tiên công cụ sửa file trực tiếp. Sau khi sửa regex, đọc lại dòng đó.
- Không bao giờ dùng `git stash` (repo có stash cũ của chủ dự án, pop nhầm sẽ làm bẩn working tree). Không `git add -A` / `git add .`. Luôn add từng đường dẫn cụ thể.
- Khóa OpenAI có trong `apps/web/.env` (đã gitignore). Chỉ dùng ở ticket 04. **Không in, không log, không ghi vào file nào, không commit.**

## 4. Quy tắc dự án phải giữ (từ `AGENTS.md` và các ADR)

- Route Handler mỏng: parse request, xác thực, gọi service, map lỗi. Logic nghiệp vụ và kiểm tra quyền sở hữu nằm trong module/service.
- AI chỉ **đề xuất**. Kết quả PASS/VIOLATION/INSUFFICIENT_DATA chỉ do Constraint Validator tất định quyết định. Candidate, diff, thẻ phương án và kết quả kiểm tra luôn do server đóng gói từ simulation chạy trong chính lượt đó, không bao giờ lấy từ chữ của model.
- Không đổi Prisma schema, không migration. Không đổi luồng Lưu / Apply, idempotency `SUCCESS` / `FAILED` / `UNKNOWN`, Rebase `409`.
- Không bao giờ đưa khóa server ra `NEXT_PUBLIC_`, log hay response.
- Log chỉ chứa mã lỗi, mã trạng thái và thời gian. **Không** log câu hỏi, câu trả lời, vị trí hay nơi xuất phát của người dùng.
- Không mở rộng phạm vi ngoài ticket. Gặp chỗ spec không nói, hãy chọn cách nhỏ nhất, đúng tinh thần spec/ADR, rồi ghi lại trong báo cáo. Chỉ dừng hỏi chủ dự án khi đó là quyết định sản phẩm thật sự, không tự suy ra được.
- Giữ trải nghiệm hiện có: chip gợi ý, thẻ "điểm cần xem lại", nút "Sửa giúp tôi", Undo/Redo, responsive từ 360 px, dark mode bằng token CSS có sẵn.

## 5. Quy trình cho mỗi ticket

1. Đọc ticket và mọi file nó nhắc tới. Liệt kê cho chính bạn các chỗ thay đổi phải lan tới: caller, test, fixture, kiểu dữ liệu.
2. Chạy test liên quan **trước khi sửa** để có mốc.
3. Triển khai thay đổi nhỏ nhất đáp ứng đủ acceptance criteria. Viết hoặc sửa test cùng lúc.
4. Chạy `npx tsc --noEmit -p .` và các suite trong ticket (PowerShell, `D:` hoa). Mọi test mới và cũ trong phạm vi phải đạt; các suite AI chỉ được còn đúng 37 lỗi có sẵn.
5. Tick checkbox trong file ticket, đổi `**Status:**` thành `done`, cập nhật bảng trong README của ticket.
6. `git diff --check`, rồi add **từng file của bạn** và commit cục bộ trên `TXH`, message tiếng Anh dạng `feat(trip-edit): ...` hoặc `test(trip-edit): ...`. **Không push** cho tới ticket 04.
7. Gửi chủ dự án một đoạn báo cáo ngắn tiếng Việt (3–6 dòng): đã làm gì, test bao nhiêu đạt, có gì lệch spec. Sau đó **tự động sang ticket kế tiếp**, không cần chờ trả lời, trừ khi gặp điều kiện dừng ở mục 6.

## 6. Khi nào phải dừng và hỏi chủ dự án

- Một acceptance criterion không thể đạt mà không đổi kiến trúc, schema hay hợp đồng ngoài spec.
- AI SDK 7 không hỗ trợ một điều spec giả định và không có cách tương đương nhỏ.
- Ticket 04: thử thật với OpenAI thất bại cả với `.responses()` lẫn `.chat()`.
- Ticket 04: `origin/master` không fast-forward được lên `origin/TXH`. **Không force push.**
- Phát hiện thay đổi lạ trong working tree không thuộc danh sách ở mục 1.

Khi dừng: nói rõ bạn đang ở đâu, đã thử gì, đề xuất phương án, và chờ.

## 7. Báo cáo cuối cùng (sau ticket 04)

Viết tiếng Việt, gồm:
- danh sách commit (hash + tiêu đề) và xác nhận `origin/TXH` = `origin/master`, `main` không đổi;
- kết quả từng kiểm tra: typecheck, build, từng suite test với số đạt/lỗi, `git diff --check`;
- kết quả thử thật 5 câu: mỗi câu một dòng, gồm outcome, công cụ đã gọi, có stream không, có rò ID không, thời gian, nhận xét về độ tự nhiên;
- những gì khác spec và lý do;
- điều chưa chứng minh;
- việc chủ dự án cần làm trên Vercel:
  - thêm `RUNTIME_CONFIG_ENCRYPTION_KEY` cho Production (64 ký tự hex, tự tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  - sửa `OPENAI_QA_MODEL` (đang là `gpt-6.1-sol`) thành `gpt-6.1-terra` hoặc xóa;
  - redeploy;
  - xem log có `"event":"trip_assistant"`.

Bắt đầu bằng việc đọc các file ở mục 2, rồi làm ticket 01.

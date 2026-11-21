# 04: Thử thật với OpenAI, nghiệm thu toàn bộ, tài liệu, commit & push

**What to build:** Chứng minh luồng mới chạy với `gpt-6.1-terra` thật trước khi lên Production, chạy đủ kiểm tra của Definition of Done, cập nhật tài liệu, rồi push `TXH` và fast-forward `master` (Q19).

**Blocked by:** 03.

**Status:** ready

## Yêu cầu chi tiết

1. **Thử thật (Q18):**
   - Viết một script hoặc test thủ công **không chạy trong CI**, ví dụ `apps/web/src/modules/trip-edit/trip-assistant-live.vitest.test.ts`, bỏ qua (`describe.skipIf`) khi không có biến `TRIP_ASSISTANT_LIVE=1`.
   - Script dựng một chuyến mẫu trong bộ nhớ, **không dùng database**: 3 ngày, có `Trip origin` "Hà Nội" khởi hành 05:00, có Chợ tình Khâu Vai ngày 1. Routing và Validator dùng fake tất định như các test Seam 1.
   - Model thật lấy khóa từ `apps/web/.env` (`OPENAI_API_KEY`). **Không in, không log, không commit khóa.**
   - Gửi 5 câu, mỗi câu một lượt, kèm history của các lượt trước:
     1. "hiện hành trình của tôi đang như nào"
     2. "tôi xuất phát từ đâu lúc mấy giờ"
     3. "ngày 1 tôi chưa muốn tham quan, dời chợ tình Khâu Vai sang hôm khác"
     4. "sáng ngày 2 muốn nghỉ đến 9h mới đi thì chỉnh sao"
     5. "cảm ơn bạn"
   - Với mỗi lượt, ghi (không ghi khóa): outcome (`ADVISED` / `PROPOSED`), số bước, công cụ đã gọi, có stream chữ không, có `data-trip-assistant-result` không, có rò ID/URL không, có correction note không, thời gian. Ghi thêm nhận xét ngắn về độ tự nhiên.
   - Nếu `provider.responses(...)` lỗi do request không hợp lệ: thử `provider.chat(...)`, ghi rõ cái nào chạy, sửa code theo cái chạy được, ghi lý do vào ADR-40 (mục Consequences).
2. **Kiểm tra Definition of Done** (chạy bằng PowerShell, xem phần Môi trường trong prompt):
   - `npx tsc --noEmit -p .`
   - `npx vitest run src/modules/trip-edit src/app/trips src/lib src/app/api/trips`: phải đạt hết.
   - `npx vitest run src/modules/ai src/modules/assistant-planning src/modules/assistant-agent-v2 src/modules/runtime-config src/modules/tripsage-chat src/modules/in-trip`: chỉ được còn **37 lỗi có sẵn từ trước**, đúng 5 file: `qa-diagnostics` (25), `qa-answer-quality-v2` (8), `qa-chat-preference` (2), `qa-conversation-reliability` (1), `assistant-agent-v2/in-trip-v2` (1). Lỗi mới nào ngoài danh sách này đều phải sửa.
   - `npm run build` trong `apps/web` (Next.js build) đạt.
   - `git diff --check` sạch.
   - Không có khóa hay secret trong diff (quét `sk-`, `OPENAI_API_KEY=` có giá trị).
3. **Tài liệu:**
   - Spec `docs/product/saved-trip-assistant-natural-streaming-spec.md`: đổi trạng thái thành `IMPLEMENTED`, thêm mục "Trạng thái triển khai" (đã làm gì, khác spec chỗ nào, kết quả thử thật, điều chưa chứng minh).
   - ADR-40: đổi Status thành implemented, bổ sung Consequences nếu có khác biệt (ví dụ phải dùng `.chat()` thay `.responses()`).
   - `docs/ai-progress.md`: thêm một mục ngày triển khai theo mẫu các mục trước (Why / Changes / Checks / Not proven). Ghi rõ số test, kết quả thử thật, và lỗi có sẵn.
   - `.scratch/saved-trip-assistant-natural-streaming/README.md` và từng ticket: đổi trạng thái thành `done`, tick checkbox đã chứng minh.
   - `docs/README.md`: cập nhật mô tả dòng spec (ready-for-agent → implemented).
4. **Commit và push (Q19):**
   - Chỉ `git add` từng đường dẫn cụ thể của mình. **Tuyệt đối không** `git add -A` / `git add .`, không đụng `.scratch/assistant-enhancements/` và `apps/web/src/modules/ai/qa-web-search-provider.ts` (file khôi phục nhầm, chủ dự án tự xử lý).
   - Commit message tiếng Anh, kiểu `feat(trip-edit): ...`, kết thúc bằng dòng ký tên do môi trường của bạn yêu cầu (nếu có).
   - `git push origin TXH`.
   - Kiểm tra `git merge-base --is-ancestor origin/master origin/TXH`. **Chỉ khi** đúng (fast-forward được) mới `git push origin origin/TXH:refs/heads/master`. Nếu không fast-forward được thì **dừng, không force push**, và báo chủ dự án.
   - Không đụng nhánh `main`.

## Acceptance criteria

- [ ] Kết quả thử thật 5 câu đã được ghi vào `docs/ai-progress.md`; mỗi lượt có result hợp lệ và không rò ID/URL.
- [ ] Typecheck, build, test trip-edit / trips / lib / api đạt; các suite AI chỉ còn đúng 37 lỗi có sẵn.
- [ ] Tài liệu cập nhật như mục 3.
- [ ] `origin/TXH` và `origin/master` cùng trỏ tới commit cuối. `main` không đổi.
- [ ] Báo cáo cho chủ dự án:
  - commit hash;
  - kết quả từng kiểm tra;
  - kết quả thử thật;
  - điều chưa chứng minh;
  - các việc cần làm trên Vercel: `RUNTIME_CONFIG_ENCRYPTION_KEY`, `OPENAI_QA_MODEL` hiện đang là `gpt-6.1-sol`, redeploy.

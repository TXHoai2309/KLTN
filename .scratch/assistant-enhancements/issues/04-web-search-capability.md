# Ticket 04: Hợp đồng & Cơ chế Tìm kiếm Ngoài Web (Web Search Capability & Fallback)

**What to build:** Xây dựng tính năng tìm kiếm ngoài web khi tài liệu nội bộ không đủ thông tin, hoặc khi người dùng chủ động yêu cầu. Tích hợp OpenAI Web Search tool sẵn có của mô hình; hỗ trợ AI chủ động gợi ý tìm kiếm web kèm thông báo cảnh báo tính chính xác của dữ liệu web.

**Blocked by:** None.

**Depends on:** Ticket 01, Ticket 03.

**Status:** IMPLEMENTED & VERIFIED.

---

## 1. Acceptance Criteria

- [ ] Bổ sung trường `webSearch: boolean` vào schema yêu cầu hỏi đáp `qaRequestSchema` (mặc định `false`).
- [ ] Khi `webSearch: false` và tài liệu xác minh nội bộ không tìm thấy câu trả lời:
  - Phản hồi trả về cờ `suggestWebSearch: true` kèm thông điệp gợi ý thân thiện: *"Tài liệu xác minh nội bộ chưa có thông tin về vấn đề này. Bạn có muốn tôi tìm kiếm thông tin từ Web không?"*.
- [ ] Khi `webSearch: true` (người dùng đã xác nhận đồng ý):
  - Kích hoạt OpenAI Web Search tool của mô hình `gpt-6-luna`.
  - Kết quả trả về được gắn nhãn rõ ràng: `sourceType: "WEB"`.
  - Hiển thị ghi chú cảnh báo: *"Thông tin được tổng hợp từ Web, có thể chưa được ban quản lý điểm đến kiểm duyệt"*.
  - Giữ lại URL nguồn web để người dùng có thể nhấp vào xem bài viết gốc.
- [ ] Bảo mật và an toàn: Chặn các truy vấn web injection hoặc cố tình trích xuất thông tin nhạy cảm.

---

## 2. Technical Design & Files

- **Cấu hình OpenAI Responses API (`gpt-6-luna` + `web_search`)**:
  - Khi `webSearch: true`, gọi OpenAI API theo chuẩn Responses API (hoặc endpoint `https://api.openai.com/v1/responses`):
    ```json
    {
      "model": "gpt-6-luna",
      "tools": [
        { "type": "web_search" }
      ],
      "input": "<Câu hỏi kèm ngữ cảnh hội thoại>"
    }
    ```
  - Trích xuất nội dung văn bản và siêu dữ liệu URL trích dẫn web từ phản hồi (`response.output_text` / annotations).
  - Chuẩn hóa thành `answerParts` có `mode: "EXPANDED"` hoặc `mode: "WEB"`, kèm danh sách citations chứa URL nguồn web trực tiếp.
- `apps/web/src/modules/ai/qa-contract.ts`:
  - Thêm `webSearch: z.boolean().default(false)` vào `qaRequestSchema`.
  - Thêm `suggestWebSearch?: boolean` vào `QaResponsePayload`.
- `apps/web/src/modules/ai/qa-json-provider.ts` & `qa-service.ts`:
  - Bổ sung hàm gọi Responses API với `tools: [{ type: "web_search" }]` khi kích hoạt tìm kiếm ngoài web.
  - Vẫn giữ nguyên luồng fallback an toàn: Nếu không bật web search, mô hình chỉ đọc dữ liệu từ `CURRENT_EVIDENCE` nội bộ.
- `apps/web/src/modules/ai/qa-web-search.vitest.test.ts`:
  - Viết suite kiểm thử unit test cho luồng gợi ý web search khi thiếu tài liệu và luồng gọi Responses API với tool `web_search`.

---

## 3. Definition of Done

- Kiểm thử mock API: Khi tài liệu rỗng, AI trả về `suggestWebSearch: true`.
- Khi gửi kèm `webSearch: true`, AI kích hoạt web search tool và trả về câu trả lời kèm URL nguồn web.
- `npm run check-types` pass 0 errors.

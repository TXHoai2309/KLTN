# Ticket 03: Tự động Bật Chế độ Kiến thức & Diễn đạt Mềm mại Từ Tài liệu (Document-Grounded Natural Synthesis)

**What to build:** Chuyển đổi chế độ mở rộng kiến thức thành mặc định tự động bật (`defaultKnowledgeMode = "EXPANDED"`). Định hình lại chính sách tạo câu trả lời: AI tập trung hoàn toàn vào tài liệu xác minh đã duyệt (internal documents), KHÔNG tự ý tìm kiếm ngoài nhưng được phép diễn đạt tự nhiên, trau chuốt, mềm mại (paraphrase thông minh) thay vì cắt ghép cứng nhắc từng mẩu câu trích đoạn.

**Blocked by:** None.

**Depends on:** Ticket 01, Ticket 02.

**Status:** IMPLEMENTED & VERIFIED.

---

## 1. Acceptance Criteria

- [ ] Trạng thái khởi tạo của phiên hỏi đáp (`AssistantController` & state ban đầu) luôn là `knowledgeMode = "EXPANDED"` (tự động bật, người dùng không cần thao tác kích hoạt).
- [ ] Chính sách prompt trong `qa-prompt.ts`:
  - AI chỉ sử dụng thông tin và sự kiện có căn cứ trong `CURRENT_EVIDENCE` (tài liệu xác minh).
  - Không tự ý bịa đặt thông tin ngoài tài liệu nội bộ khi không bật Web Search.
  - Được phép thay đổi câu từ nhẹ nhàng, diễn đạt câu trả lời trôi chảy, giàu tính hướng dẫn du lịch, cấu trúc đoạn văn rành mạch thay vì chỉ trích xuất từng câu nguyên văn thô ráp.
- [ ] Gắn citation chính xác: Từng ý hoặc thông tin thực tế được tổng hợp từ tài liệu nguồn đều được đánh số trích dẫn citation để người dùng kiểm chứng nguồn gốc.
- [ ] Khi tài liệu nguồn không có hoặc thiếu thông tin: AI trả lời rõ ràng phần nào có trong tài liệu, phần nào tài liệu chưa đề cập, không sinh ảo giác (hallucination).

---

## 2. Technical Design & Files

- `apps/web/src/components/assistant/assistant-controller.ts`:
  - Cập nhật mặc định `knowledgeMode: "EXPANDED"`.
- `apps/web/src/modules/ai/qa-prompt.ts`:
  - Cập nhật `QA_GENERATION_POLICY` và `modePolicy`:
    - Cho phép paraphrase và tổng hợp đa nguồn từ evidence.
    - Hướng dẫn phong cách: Giọng văn thân thiện, tự nhiên, trau chuốt, hướng dẫn du lịch nhiệt tình.
- `apps/web/src/modules/ai/qa-synthesis-verification.ts`:
  - Cho phép các câu diễn đạt tự nhiên vượt qua kiểm định nếu ý nghĩa ngữ nghĩa (semantic facts) được hỗ trợ bởi bằng chứng xác minh.

---

## 3. Definition of Done

- Kiểm thử câu trả lời với tài liệu nguồn: Văn phong tự nhiên, không bị cụt câu, trích dẫn citation đầy đủ.
- Toàn bộ test của `qa-prompt.vitest.test.ts` và `assistant-controller.vitest.test.ts` pass.
- `npm run check-types` pass 0 errors.

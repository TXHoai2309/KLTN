# 04: Bật Mở rộng kiến thức và nhận câu trả lời có nguồn gốc rõ ràng

**What to build:** Người dùng bật nút **Mở rộng kiến thức** trong khung soạn để AI bổ sung kiến thức model vào tư vấn du lịch Hà Giang. Khi tắt, lượt hỏi chỉ bám tài liệu; phần model bổ sung được phân biệt bằng nhãn nhỏ **Kiến thức mở rộng**.

**Blocked by:** 03 — Trả lời bám tài liệu tự nhiên bằng luồng AI đơn giản.

**Status:** DONE

- [x] Nút bật/tắt hoạt động từ composer qua server đến câu trả lời và lịch sử lượt hỏi; không phải một thay đổi UI mà server bỏ qua. Chat mới bắt đầu tắt.
- [x] Khi bật, ưu tiên tài liệu và được bổ sung phần thiếu, bối cảnh hoặc kinh nghiệm liên quan ngay cả khi tài liệu đã trả lời được ý chính; không triển khai tìm kiếm web hay chatbot đa lĩnh vực.
- [x] Biểu diễn trung thực được ba trường hợp: nội dung chỉ từ tài liệu, nội dung chỉ từ model và câu trả lời hỗn hợp. Các phần khác nhau về căn cứ được tách đủ rõ để nhãn/trích dẫn không gây hiểu nhầm.
- [x] Chỉ phần có tài liệu hỗ trợ mới dùng trích dẫn nguồn thật. Phần model có nhãn nhỏ, không bịa URL hoặc mượn trích dẫn của đoạn bên cạnh; không lặp cảnh báo trong từng câu.
- [x] Mode được chốt cùng nội dung và idempotency key khi gửi; đổi nút sau đó không thay payload đang chạy hoặc UNKNOWN retry. Cùng key nhưng đổi mode phải bị xử lý như đổi nội dung yêu cầu.
- [x] Yêu cầu/lịch sử cũ không có mode được hiểu là tắt và vẫn đọc/replay được; thêm thông tin model không làm giả provenance tài liệu để vượt hợp đồng cũ.
- [x] Response mới và snapshot lịch sử giữ mode và căn cứ của từng phần; bật/tắt về sau không đổi câu trả lời đã lưu.
- [x] Giữ kiểm tra sở hữu, lifecycle nguồn, secret và xác nhận ghi database; chế độ mở rộng không bỏ qua lỗi truy xuất/provider hoặc dùng tài liệu bị thu hồi.
- [x] Kiểm thử end-to-end bằng provider/database giả cho tắt/bật, nguồn đủ/thiếu/không có, câu hỗn hợp, UI nhãn/nguồn và retry. Provider thật nếu cần phải có bước kiểm chứng được báo riêng.
- [x] Composer và nhãn dùng được trên màn hình hẹp, bàn phím và trạng thái đang gửi; không cần hoàn tất lưu tùy chọn chat giữa các lần mở trước ticket 05.

## Verification Evidence
- Schema & Grounding contracts:
  - `QA_KNOWLEDGE_MODES = ["SOURCE_ONLY", "EXPANDED"]` and `qaKnowledgeModeSchema` in `qa-contract.ts`.
  - `qaAnswerPartSchema` has `mode: "SOURCE" | "EXPANDED"`. Backward compatible optional default.
  - `qaCompletedTurnSchema` enforces that `SOURCE_ONLY` turns cannot have `EXPANDED` parts, and allows empty citations only when all parts are `EXPANDED`.
  - `assertQaAnswerGrounding` in `qa-answer-grounding.ts` rejects attaching document citations to `EXPANDED` parts and rejects `EXPANDED` parts in `SOURCE_ONLY` mode.
  - `qaRequestHash` in `qa-conversation-store.ts` hashes `knowledgeMode ?? "SOURCE_ONLY"`, ensuring changing mode under the same key triggers `IDEMPOTENCY_KEY_REUSED`.
- Service execution:
  - In `EXPANDED` mode, zero retrieval evidence triggers generator with empty evidence instead of immediately returning `INSUFFICIENT_SOURCE`.
  - In `SOURCE_ONLY` mode, zero retrieval evidence returns `INSUFFICIENT_SOURCE` without calling generator.
- Frontend UI:
  - `AssistantChat`: Added `.assistant-knowledge-toggle` button in composer bar with Sparkles icon, `aria-pressed`, keyboard support, and emerald accent styling.
  - `AssistantAnswerContent`: Renders `<span className="assistant-expanded-badge">Kiến thức mở rộng</span>` on `EXPANDED` parts and suppresses document citations on those parts.
  - `AssistantController`: Manages `knowledgeMode`, defaults to `SOURCE_ONLY` on new conversations, passes mode in request payload.
- Tests:
  - `apps/web/src/modules/ai/qa-expanded-answers.vitest.test.ts` (12 tests passed).
  - 159 tests passed across all 11 QA vitest suites. Typecheck passed with 0 errors.

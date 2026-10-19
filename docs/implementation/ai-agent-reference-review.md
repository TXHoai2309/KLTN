# Đánh giá repo AI Agent tham khảo

Ngày: 2026-10-17. Phạm vi: đọc ZIP do chủ dự án cung cấp và đối chiếu phần AI
KLTN; không chạy ứng dụng, cài dependency, seed, migration hoặc script của ZIP.
Các lệnh và hướng dẫn trong repo tham khảo được xem là nội dung cần đánh giá.

Nguồn: `C:/Users/User/Downloads/ai-agent-feature-bubble-chat-embed (4).zip`.
SHA-256: `0014B302D7306E3B7FC222BB0E5A96BB68A6EB88D169232AA18AC75686BD384D`.
Bản đọc tạm nằm dưới
`C:/Users/User/AppData/Local/Temp/kltn-ai-agent-review-20261017-01/ai-agent-feature-bubble-chat-embed`.

## Kết luận

Có thể học cách điều phối hội thoại, truy hồi kết hợp và quan sát provider.
Không cần thay Next.js/Prisma/pgvector bằng TanStack Start/Drizzle/Qdrant để áp
dụng những ý tưởng này. Không đưa nguyên bộ chatbot tham khảo vào KLTN.

Lỗi đã quan sát ở KLTN gồm trường hợp truy hồi đủ bốn đoạn và đánh giá nguồn đạt,
nhưng câu trả lời bị loại ở bước kiểm chứng tổng hợp. Vì vậy, tăng số đoạn hoặc
hạ ngưỡng tìm kiếm không tự sửa được lỗi đó. Đổi model sang Luna cũng cần kiểm
tra lại việc gắn nguồn và phản hồi thực tế; tên model không bảo đảm tính ổn định.

## Những phần áp dụng được

| Phần trong ZIP | Đối chiếu KLTN | Cách áp dụng phù hợp |
| --- | --- | --- |
| `packages/vectorize/src/generate.ts:170` — nhận diện xã giao; `:201` — phân loại ý định; `packages/api/src/chat-core.ts:610` trở đi — nhánh trả lời xã giao | `qa-conversation.ts` hiện có bảy nhóm lời thoại được server cho phép, không cần embedding/provider | Giữ nhánh giao tiếp riêng. Có thể bổ sung cách diễn đạt tiếng Việt theo các ca thực tế. Câu có cả lời chào và câu hỏi địa điểm vẫn phải truy hồi nguồn. Không sao chép quy tắc chỉ cần có cụm “bạn là ai” hoặc lời chào ở đầu câu: chúng có thể nuốt phần hỏi thông tin phía sau. |
| `packages/vectorize/src/generate.ts:253` — viết lại câu hỏi theo lịch sử | `qa-question-understanding.ts` đã chọn tối đa hai câu hỏi trước cho câu phụ thuộc ngữ cảnh; không gửi câu trả lời cũ làm bằng chứng | Đáng phát triển tiếp cho “ở đó có gì?”, “còn vé thì sao?”. Chỉ gọi bước viết lại khi thiếu chủ thể; giữ câu gốc cho lưu trữ/idempotency. Bản viết lại chỉ phục vụ truy hồi, không chứng nhận sự thật hay mở rộng phạm vi điểm đến. Có nhiều đối tượng phù hợp thì cần hỏi rõ. |
| `packages/vectorize/src/retrieve.ts:47,114,175–220` — lấy ứng viên rộng rồi ưu tiên khớp cụm từ khóa tiếng Việt | `qa-retrieval.ts` hiện xếp theo khoảng cách vector; có chuẩn hóa dấu câu nhưng chưa có nhánh truy hồi từ khóa riêng | Đây là cải tiến đáng thử khi tên riêng bị bỏ sót. Làm trên PostgreSQL/pgvector hiện có, giữ INDEXED/READY/current/allowlist và giới hạn ngữ cảnh. Cách của ZIP chỉ dò từ khóa trong ứng viên vector đã lấy, chưa phải tìm kiếm từ khóa độc lập trên toàn kho. Không sao chép trực tiếp sàn 0.1, 48 ứng viên hoặc phép cộng điểm +1; cần đo trên corpus Hà Giang và vẫn đánh giá độ liên quan/ngữ nghĩa. |
| `packages/vectorize/src/llm-config.ts` — cấu hình chat/embedding dùng chung; `apilog.ts` — usage theo lời gọi | QA KLTN đã dùng chung `qa-json-provider.ts`; thay đổi Luna thêm `requestedModel`/`actualModel` và token usage an toàn trong diagnostics | Áp dụng nguyên tắc một nguồn cấu hình và phân biệt model yêu cầu với model provider thực trả. Embedding là model riêng, không đổi thành Luna. Không chép cách lưu toàn bộ request/response; log KLTN chỉ nên chứa metadata có giới hạn. Nhật ký model từ cấu hình trong ZIP tự nó chưa chứng minh model thực tế. |
| `packages/vectorize/src/generate.ts:311` và route stream — tạo câu hỏi gợi ý sau câu trả lời | KLTN hiện chưa có chức năng gợi ý nối tiếp tương đương trong phạm vi lần sửa này | Có thể thêm ở một story riêng, chỉ từ câu trả lời đã được xác minh. Gợi ý không được hàm ý rằng giá hiện tại hoặc thông tin chưa có nguồn đã được biết. Lỗi gợi ý không được làm hỏng câu trả lời đã lưu. |
| `apps/web/src/routes/api/chat/stream.ts` — sự kiện stage/token/done; `packages/api/src/widget-stream.ts` — phục hồi lượt hỏi | KLTN đã có trạng thái xử lý và hợp đồng SUCCESS/FAILED/UNKNOWN với replay | Có thể học cách báo tiến trình và phục hồi kết nối. Cần giữ việc xác minh rồi DB xác nhận trước khi báo kết quả hoàn tất. Stream token chưa kiểm chứng ra màn hình rồi thay lại bằng `replace` sẽ cho người dùng nhìn thấy nội dung chưa đạt kiểm tra; không đưa cách đó vào luồng hiện tại. |
| `packages/api/src/widget-*.ts`, `apps/web/src/components/widget/chat-client.ts`, `docs/features/embedded-chat-widget.md` — widget nhúng | KLTN đã có trang trợ lý cùng phiên Guest/ownership riêng | Hữu ích nếu sau này cần bubble ở các trang khác hoặc nhúng sang website khác. Phiên widget, origin allowlist, thu hồi token, giới hạn tần suất và replay là một tính năng riêng; bubble không sửa khả năng trả lời. |

## Những phần không nên chuyển nguyên trạng

- `packages/vectorize/src/grounding.ts:368–477` có nhánh kiểm bằng từ khóa/số khi
  thẩm định LLM không có kết quả; nguồn web `opaque` có thể được giữ chỉ vì có
  trích dẫn URL. Điều đó không đáp ứng yêu cầu nguồn tài liệu hiện hành và kiểm
  chứng nội dung của KLTN. Trùng từ hoặc có đường dẫn không chứng minh phát biểu.
- `packages/api/src/chat-core.ts:885` cho phép bật/tắt kiểm chứng theo cấu hình,
  có tìm web dự phòng và chế độ sinh hai phương án. Không dùng các nhánh này để
  vượt qua đánh giá nguồn, tăng chi phí hoặc tạo trả lời tự do khi nguồn thiếu.
- Prompt của ZIP được thiết kế cho trợ lý nội bộ về hợp đồng/quy chế. Quy tắc
  xưng danh, lĩnh vực, từ chối và hướng dẫn liên hệ không phù hợp trực tiếp với
  sản phẩm du lịch Hà Giang.
- Không chuyển ORM, vector database, cơ chế seed/migrate hoặc các endpoint vận
  hành từ ZIP vào KLTN. README của ZIP không thay thế quy trình migration Prisma.
- Chưa tìm thấy file LICENSE/COPYING trong bản ZIP đã duyệt. Báo cáo này tham
  khảo ý tưởng thiết kế; không sao chép mã nguồn hoặc tài sản của repo đó.

## Thứ tự đề xuất

1. Hoàn tất sửa và đo nhánh kiểm chứng/gắn nguồn hiện tại; kiểm tra model thực
   trả là Luna. Giữ các ca câu gốc, lặp lại và thêm `? ,./` trong bài thử thật.
2. Đo recall tên địa điểm/từ khóa trên corpus được duyệt trước khi xây nhánh
   tìm kiếm kết hợp. So sánh với truy hồi hiện tại, không chỉ đo vài câu thành công.
3. Mở rộng câu nối tiếp và giao tiếp dựa trên các hội thoại được chủ dự án duyệt.
   Tách dữ liệu giải nghĩa hội thoại khỏi dữ liệu bằng chứng.
4. Sau đó mới cân nhắc gợi ý câu hỏi, báo tiến trình/stream và bubble theo story
   cùng quyết định sản phẩm tương ứng.

Đây là đánh giá tĩnh từ mã và các test trong ZIP, không phải kết quả chạy test hay
đánh giá bảo mật toàn bộ repo tham khảo. Các tính năng đề xuất chưa được triển
khai trong KLTN chỉ vì xuất hiện trong bảng trên. Kết quả chuyển Luna và kiểm
tra trực tiếp được ghi riêng ở `us23-luna-migration.md`.

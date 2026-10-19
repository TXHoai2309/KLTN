# Phản hồi khi chưa đủ căn cứ — 17/10/2026

Chủ dự án yêu cầu trợ lý vẫn trả lời tự nhiên, hữu ích khi không trả lời được hoặc
không có nguồn. Đã thay khung cảnh báo cứng bằng hai đoạn hội thoại: giải thích
giới hạn cụ thể và đề nghị một hướng hỏi tiếp liên quan.

## Hành vi

- `NO_EVIDENCE`: chưa tìm thấy tài liệu phù hợp **trong lần tra cứu này**; không
  kết luận toàn bộ corpus hoặc thực tế không có thông tin.
- `MISSING_SUPPORT`: chưa có đủ căn cứ cho phần đang hỏi; không gọi đó là lỗi
  provider và không tự thêm dữ kiện để lấp khoảng trống.
- `ANSWER_VERIFICATION`: có tài liệu liên quan, nhưng câu trả lời chưa được kiểm
  chứng; không xuất câu trả lời bị từ chối hoặc nội dung kiểm chứng nội bộ.
- Câu hỏi hiện tại giúp chọn lời đáp về giá vé, giờ mở cửa, danh hiệu, địa chất,
  văn hóa, điều kiện phù hợp/di chuyển, vị trí hoặc thông tin hiện hành. Ví dụ
  câu hỏi giá vé có hướng hỏi tiếp về vé chung/vé của một điểm; hỏi giờ mở cửa có
  hướng làm rõ ngày. Mẫu không bảo đảm hỏi lại sẽ có đủ nguồn, không bịa giá/giờ,
  không coi một tiền đề chưa xác minh trong câu hỏi là sự thật.
- Những reply không có question/reason ở lịch sử cũ dùng lời đáp chung an toàn.
  Chỉ nối `question` đã xác nhận vào thành phần hiển thị; không gửi toàn bộ lịch
  sử, không echo tên/id/HTML/URL lạ trong lời đáp mới. `giá trị văn hóa`, `đánh giá`
  và `bây giờ` không bị hiểu nhầm lần lượt là giá vé/giờ mở cửa.
- Câu trả lời PARTIAL vẫn giữ phần thực tế có căn cứ và phần thiếu riêng. Lỗi
  kỹ thuật/FAILED và UNKNOWN vẫn theo đường phục hồi cũ, không giả thành một lượt
  trả lời thành công. Không auto-send câu hỏi, không đổi idempotency/ownership.

`assistant-source-reply.ts` ghép lời đáp theo reason/topic từ các câu do ứng dụng
kiểm soát. **Không phải một lời gọi Luna mới** hoặc lời giải đáp thực tế không có
nguồn. Không tăng chi phí/độ trễ bằng cách gọi provider để viết lại lời báo thiếu
dữ liệu. API/history giữ literal `message` cũ để tương thích; UI render cách nói
mới. Service bổ sung reason `MISSING_SUPPORT` cho nhánh từ chối sau đánh giá nguồn;
reason đã tồn tại trong contract. Không đổi schema/migration/model/embedding.

## Kiểm tra

- Full web: **1.862 Vitest PASS / 105 gated SKIP; 329 legacy PASS**. Sau đó thêm
  hai test service cho reason/no-extra-call và chạy nhóm service + lời đáp:
  **38/38 PASS**, gồm 20 ca lời đáp, 18 ca service. Không cộng hai số thành tổng
  full-suite giả. Test đầu có một assertion nhận nhầm `<article>` là anchor `<a`;
  sửa selector test, không sửa renderer để che lỗi.
- Browser cuối: **19/19 nhóm PASS**, component production/transport hư cấu với
  mạng ngoài bị chặn. Kiểm tra ba reason hiển thị đúng câu hỏi giá vé, không có
  thẻ nguồn/cảnh báo, không tạo thêm request; mobile 360px có kiểm tra ảnh. Bộ
  light/dark, keyboard, nháp/auth, nguồn thu gọn, PARTIAL, chậm, lỗi và UNKNOWN
  hiện có tiếp tục đạt. Đây không phải chạy provider/corpus thật.
- Root typecheck cuối PASS. Build/diff chốt ghi bên dưới. Không thay SQL/schema,
  không cần migration hoặc chạy lại PostgreSQL harness. Không chạy API trả phí mới.
- Premium audit không chạy được: plugin frontend-design-premium đã không còn ở
  đường dẫn cài trước và không tìm thấy `audit_project.py` trong plugin cache.
  Không lấy kết quả audit đợt trước làm kết quả đợt này. Kiểm tra browser, typecheck,
  build và diff vẫn chạy trực tiếp; không thêm luồng permission từ hạn chế này.

Không commit/push/deploy, chỉnh nguồn hoặc credential. US-23 vẫn NOT_ACCEPTED;
nghiệm thu corpus độc lập chưa thay đổi. Lời đáp hữu ích hơn không đồng nghĩa
nguồn đã đủ hoặc câu hỏi thực tế đã được giải đáp.

Kiểm tra chốt: root build cuối PASS (21,058 giây), root typecheck PASS,
`git diff --check` PASS và quét pattern credential trên dòng thêm/tệp mới không
phát hiện khớp. Trang assistant localhost:3010 trả HTTP 200. Đã xem ảnh mobile
NO_EVIDENCE và ANSWER_VERIFICATION cuối, hai đoạn có khoảng cách rõ, không có
nguồn giả hoặc khung cảnh báo. Server local được giữ chạy để thử lượt mới.

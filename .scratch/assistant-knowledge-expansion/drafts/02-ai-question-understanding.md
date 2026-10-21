# 02: AI hiểu câu hỏi và truy xuất đúng địa danh

**What to build:** Khi người dùng hỏi “Làng văn hóa du lịch cộng đồng Hạ Thành là điểm đến như thế nào”, AI xác định đúng địa danh và nhu cầu giới thiệu trước khi tìm tài liệu; các đoạn mô tả Hạ Thành được chọn thay vì nội dung Đồng Văn hoặc danh mục nguồn.

**Blocked by:** None (can start immediately).

**Status:** DRAFT — awaiting breakdown approval.

- [ ] Bước QA question understanding chạy trước truy xuất, dùng đúng `gpt-6.1-sol` với `medium`; đầu ra diễn tả chủ thể, ý định và thông tin cần tìm, không tự sinh dữ kiện trả lời.
- [ ] Câu hỏi gốc, tên riêng, phủ định, số liệu, thời điểm và các điều kiện người dùng nêu được giữ nguyên ý nghĩa khi lập truy vấn.
- [ ] Dùng bối cảnh điểm đến được server cho phép và lịch sử câu hỏi có giới hạn để hiểu câu tiếp nối; không dùng câu trả lời cũ làm bằng chứng thực tế.
- [ ] Xác định/đối chiếu chủ thể bằng dữ liệu tên và alias có thật; tên đầy đủ, tên ngắn, câu không dấu hoặc cách viết tương đương không tự động biến thành một địa danh khác.
- [ ] Tìm ứng viên rồi xếp hạng theo đúng chủ thể và nhu cầu trước khi chọn ngữ cảnh cuối; các từ chung như “văn hóa”, “du lịch” không đủ để đưa Đồng Văn lên thay Hạ Thành.
- [ ] Tuning giới hạn ứng viên/ngữ cảnh đồng bộ với giới hạn đầu vào các bước sau; giữ ngân sách hữu hạn và không thêm một lần gọi AI riêng chỉ để xếp hạng.
- [ ] Nếu bước hiểu câu hỏi lỗi/malformed, dùng một lần câu hỏi gốc và cách hiểu xác định hiện có; không tự retry provider hoặc biến lỗi kỹ thuật thành kết luận toàn kho không có tài liệu. Chủ thể thực sự chưa rõ vẫn được hỏi lại.
- [ ] Kiểm thử từ yêu cầu hỏi đến ngữ cảnh được đưa cho bước trả lời, gồm Hạ Thành, một địa danh đối chứng, so sánh, câu nối tiếp và lỗi bước hiểu; UI nhận đúng kết quả hoặc lời hỏi rõ đối tượng.
- [ ] Báo cáo cố định trước/sau về chọn đúng chủ thể/đoạn và số lần gọi model; không tuyên bố chất lượng model thực tế chỉ từ mock.

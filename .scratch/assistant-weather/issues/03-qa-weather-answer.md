# 03: Q&A trả lời câu hỏi thời tiết (server)

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 (phần bổ sung "Assistant") · thuật ngữ theo `GLOSSARY.md` (Weather question, Representative point).

**What to build:** Khi bộ hiểu câu hỏi trả `WEATHER`, Q&A bỏ qua truy xuất tài liệu và trả lời bằng trạng thái thời tiết: tìm đúng điểm đến, xử lý ngày, kiểm tra điểm đến còn công khai, và sinh một câu dẫn ngắn không kết luận. Guest dùng được, dùng chung giới hạn Q&A. Server không lưu giá trị dự báo.

**Blocked by:** 02.

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] Điểm đến lấy từ `targetSubjects` bằng bộ khớp tên hiện có; trang điểm đến đang mở thì lấy luôn điểm đó.
- [x] Khớp nhiều điểm: tối đa 3 lựa chọn dưới dạng câu hỏi làm rõ. Không khớp: câu "mình chưa tìm thấy điểm đó". Không nêu điểm nào: dùng điểm đại diện (thành phố Hà Giang) và đánh dấu `representative`.
- [x] Ngày: vắng thì hôm nay; ngoài tầm dự báo thì trả "Chưa có dự báo, sẽ có từ ngày X"; không hợp lệ thì một câu hỏi làm rõ ngắn.
- [x] Điểm đến ẩn hoặc không còn công khai trả lỗi như endpoint thời tiết hiện có, không lộ dự báo.
- [x] Câu dẫn do model viết từ số liệu đã lấy; câu chứa kết luận "nên/không nên đi" hoặc số liệu không có trong dữ liệu bị thay bằng câu cố định.
- [x] Câu hỏi nửa thời tiết nửa kiến thức (ví dụ mùa đẹp nhất) vẫn đi vào truy xuất như cũ khi bộ hiểu câu hỏi không trả `WEATHER`.
- [x] Nhà cung cấp lỗi: trả trạng thái không lấy được dự báo, không coi là thời tiết tốt, không làm hỏng lượt.
- [x] Hội thoại lưu điểm đến, ngày, câu dẫn; không lưu giá trị dự báo.
- [x] Guest và Traveler cùng đường; một câu hỏi thời tiết tính một lượt Q&A trong bộ giới hạn lạm dụng; idempotency giữ nguyên.
- [x] Test với bộ hiểu, dịch vụ thời tiết và bộ sinh giả: điểm đến có tên, trang đang mở, 3 lựa chọn, không khớp, đại diện, ngày các loại, điểm ẩn, lỗi nhà cung cấp, câu dẫn vi phạm, Guest và đếm giới hạn.
- [x] Typecheck, test, build và `git diff --check` PASS.

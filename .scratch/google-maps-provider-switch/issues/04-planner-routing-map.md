# 04: Đề xuất hành trình với tuyến và bản đồ đúng provider

**What to build:** Traveler tạo itinerary proposal từ Planner hoặc hội thoại, xem tuyến từng ngày/toàn chuyến và kết quả Validator dựa trên routing của provider đang bật.

**Blocked by:** 01 — Explore dùng Google/Stadia qua cấu hình chung.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và kiểm thử đang hoàn tất, live acceptance còn mở.

- [ ] Tái sử dụng Google Routes adapter hiện có và Stadia adapter qua bộ chọn chung; route evidence mới giữ nguồn thực tế, không gán cứng Stadia.
- [ ] CAR dùng DRIVE và MOTORCYCLE dùng TWO_WHEELER ở Google; không fallback phương tiện hoặc provider.
- [ ] Chuẩn hóa giây, mét và geometry theo hợp đồng hiện có; giữ timeout tối đa 10 giây, cap số cặp và mức song song; không thêm retry/cache.
- [ ] Planner và hội thoại lập hành trình đều dùng routing chung; scheduler/Validator giữ nguyên với cùng bằng chứng, missing data vẫn INSUFFICIENT_DATA.
- [ ] Bản đồ proposal dùng renderer tương ứng cho tuyến từng ngày/toàn chuyến, marker, chọn điểm và theme; geometry không quyết định PASS.
- [ ] Giữ nội dung proposal khi map lỗi; không tạo hình tuyến giả để thay dữ liệu chưa có. Chỉ nạp SDK đang chọn.
- [ ] Test end-to-end service proposal → routing → Validator → projection và map contract cho hai chế độ, geometry sai và thiếu dữ liệu.
- [ ] Kiểm tra quy định Google chính thức về hiển thị geometry/attribution trước khi đưa overlay vào sử dụng live; ghi nguồn xác minh và giới hạn thực tế.

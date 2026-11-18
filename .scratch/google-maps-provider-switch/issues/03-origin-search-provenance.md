# 03: Tìm, xác nhận và lưu nơi xuất phát bằng provider đang chọn

**What to build:** Traveler tìm một nơi xuất phát trong coverage Việt Nam, chọn kết quả, xác nhận và đọc lại nơi xuất phát với nguồn dữ liệu đúng; tắt cờ vẫn đọc được dữ liệu đã lưu.

**Blocked by:** 01 — Explore dùng Google/Stadia qua cấu hình chung.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và automated verification hoàn tất, live acceptance còn mở.

- [ ] Google dùng Places và Stadia dùng Geocoding qua bộ chọn chung; giữ hợp đồng origin search, ngôn ngữ Việt, coverage Việt Nam, tối đa năm gợi ý và ngân sách thời gian hiện có.
- [ ] Có trường hợp origin ngoài Hà Giang; không dùng nguyên giới hạn tìm địa điểm ngoài danh mục chỉ trong Hà Giang.
- [ ] Kết quả được resolve thành tọa độ hợp lệ trước khi xác nhận; không tự chọn kết quả đầu tiên. Response truy vấn cũ không ghi đè truy vấn mới.
- [ ] Phân biệt RESULTS, NO_RESULTS và UNAVAILABLE; sai key/quota/timeout/lỗi response không gọi provider kia. Không thêm cache/rate-limit mới ngoài phạm vi.
- [ ] Origin đã chọn đi qua xác nhận và persistence/read hiện có; dữ liệu mới ghi đúng Google/Stadia, không giả danh NOMINATIM và không suy diễn nguồn lịch sử từ cờ.
- [ ] Nếu enum/contract cần mở rộng, tạo Prisma migration cộng thêm và reader tương thích; giữ giá trị lịch sử, không backfill hàng loạt hoặc rollback bằng xóa enum. Không áp shared DB mặc định.
- [ ] Tắt cờ vẫn đọc được origin Google trên phiên bản hỗ trợ hai nguồn; origin privacy, authorization và idempotency giữ nguyên.
- [ ] Test origin search → xác nhận → lưu/đọc qua seam hiện có với hai provider, lỗi và truy vấn cạnh tranh; kiểm tra migration trên DB thử nghiệm nếu có thay schema.

**Local evidence (2026-11-18):** Code đã triển khai và review hai trục; provider/map/Save/Read regression tests qua, production webpack build/typecheck qua. Full suite còn các lỗi nền được phân biệt trong verification receipt. Các checkbox yêu cầu browser/provider thật chưa được tự đóng vì thiếu Google keys/Map ID; đây không phải live acceptance.

# 08: Kiểm chứng chuyển Google toàn phạm vi và quay lại Stadia

**What to build:** Người vận hành có một cấu hình thống nhất, hướng dẫn triển khai và bằng chứng kiểm thử để bật Google hoặc quay lại Stadia mà không đổi nghiệp vụ hay dữ liệu chuyến đi.

**Blocked by:** 02 — Chọn tọa độ Admin và nơi xuất phát trên cả hai bản đồ; 06 — Chỉnh lịch và hỗ trợ khi đang đi qua provider hiện hành; 07 — Hiển thị tuyến đồng hành đúng nguồn và đúng quyền.

**Status:** IN PROGRESS — chủ dự án yêu cầu triển khai toàn bộ ngày 2026-11-18; code local và kiểm thử đang hoàn tất, live acceptance còn mở.

- [ ] Chạy ma trận hai chế độ cho Explore, pickers, origin search, Planner/chat, Save/Read/Edit/in-trip và companion views; đối chiếu đủ tiêu chí spec.
- [ ] Hoàn tất chuyển đổi cấu hình routing cũ sang cờ chung; không còn hai bộ chọn độc lập gây browser/server khác chế độ. Giữ adapter/credentials Stadia phục vụ rollback.
- [ ] Chứng minh các chức năng được chuyển không gọi provider đang tắt và không fallback khi lỗi; ngoại lệ iframe/Google Places ngoài danh mục đã có được ghi rõ.
- [ ] Kiểm tra official Google docs cho TWO_WHEELER tại Việt Nam và quyền lưu/hiển thị geometry/Places; ghi nguồn, ngày và giới hạn, không tự thay nghiệp vụ để né unsupported mode.
- [ ] Smoke test Google thật cho Maps JavaScript, Places origin, Routes ô tô/xe máy rồi đổi cờ và smoke Stadia. Không coi mock pass hoặc iframe load là bằng chứng tiles/route thật.
- [ ] Nếu key/billing/domain hay dịch vụ thật chưa sẵn sàng, ghi blocker cụ thể và giữ live acceptance mở; không báo hoàn tất feature chỉ vì code/test tự động xong.
- [ ] Hướng dẫn Local/Preview/Production nêu billing/API, hai key, domain/API restrictions, Map ID nếu cần, rebuild/restart và rollback bằng cờ trên phiên bản hỗ trợ hai nguồn.
- [ ] Chạy typecheck/build/test phù hợp và git diff --check, kiểm tra bundle/log/response không lộ server key; nếu có migration thì kiểm tra trạng thái và bằng chứng DB thử nghiệm.
- [ ] Cập nhật ADR, story/progress và hiện trạng implemented/automated/live riêng biệt; giữ ADR/evidence cũ làm lịch sử. Không push/merge/deploy production nếu chưa được yêu cầu.

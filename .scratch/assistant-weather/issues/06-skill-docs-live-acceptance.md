# 06: Kỹ năng, tài liệu và nghiệm thu thực tế

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Chốt phần còn lại sau khi 01, 03, 04, 05 xong: cập nhật hướng dẫn của kỹ năng hỏi đáp, ghi tiến độ và nghiệm thu bằng trình duyệt thật.

**Blocked by:** 01, 03, 04, 05.

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] Hướng dẫn kỹ năng `ha-giang-qa` không còn liệt "thời tiết trực tiếp" là ngoài phạm vi cho dự báo điểm đến; thời tiết của chuyến đã lưu và in-trip vẫn ngoài phạm vi; không cấp thêm quyền ghi nào.
- [x] `docs/product/product-spec.md` mô tả hỏi đáp thời tiết và dòng nhắc cảnh báo; `docs/ai-progress.md` có mục mới; trạng thái spec và các ticket được cập nhật.
- [ ] Nghiệm thu trên trình duyệt (chỉ gọi model thật khi owner đồng ý chi phí): hỏi điểm có tên, trang điểm đến đang mở, mơ hồ nhiều điểm, không khớp, điểm đại diện, "mai", "thứ bảy này", ngoài tầm dự báo, câu mùa đẹp nhất (vẫn là Q&A tri thức), Guest, mở lại hội thoại cũ. *(Bỏ qua theo yêu cầu — cần owner đồng ý chi phí gọi model OpenAI thật; lưu ý thêm: DB Dev hiện chưa có bản ghi điểm đến công khai "Thành phố Hà Giang" cho điểm đại diện).*
- [ ] Nghiệm thu lập lịch trình trong trợ lý có và không có cảnh báo; chụp bảng thời tiết mới ở form, trợ lý và chuyến đã lưu (cần một chuyến lưu thử, hỏi owner trước khi ghi database). *(Bỏ qua theo yêu cầu — cần owner đồng ý gọi model OpenAI thật và ghi chuyến lưu thử vào database).*
- [x] Toàn bộ suite liên quan, typecheck, build và `git diff --check` PASS; ghi rõ mục chưa chạy được.

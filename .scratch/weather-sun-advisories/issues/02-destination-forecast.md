# 02: Dự báo tại điểm đến

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Trang điểm đến hiện dự báo theo giờ cho hôm nay và tóm tắt theo ngày cho các ngày tới: xác suất mưa, lượng mưa, nhiệt độ, tầm nhìn, gió giật. Có dòng ghi nguồn Open-Meteo và thời điểm cập nhật. Khi nhà cung cấp lỗi thì hiện "không lấy được dự báo", còn giờ mặt trời vẫn hiện.

**Blocked by:** 01 (Giờ mặt trời trên trang điểm đến).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Bộ chuyển Open-Meteo chỉ chạy ở server, có `fetcher`, `timeoutMs` và `signal` tiêm được như bộ chuyển Stadia routing. Gọi với `timezone=Asia/Ho_Chi_Minh`, tối đa 16 ngày, gom nhiều toạ độ vào một yêu cầu.
- [ ] Kết quả chuẩn hoá là `AVAILABLE` hoặc `UNAVAILABLE` kèm lý do (`TIMEOUT`, `UNAVAILABLE`, `INVALID_RESPONSE`); không bao giờ điền giá trị mặc định.
- [ ] Cache server theo toạ độ làm tròn, TTL khoảng 1 giờ, có comment `shortcut:` về giới hạn một instance.
- [ ] Endpoint công khai của ticket 01 trả thêm dự báo.
- [ ] Test service với fetcher giả: phản hồi hợp lệ, timeout, lỗi HTTP, JSON sai.
- [ ] Test component: khối dự báo, trạng thái không lấy được, dòng ghi nguồn.
- [ ] Không có biến `NEXT_PUBLIC_` mới; không gọi Open-Meteo thật trong test tự động. Gọi thật một lần thủ công và ghi vào ai-progress.
- [ ] Typecheck, test, build và `git diff --check` PASS.

# 03: Sinh lịch trình do AI chọn điểm

**What to build:** Sinh lịch trình do AI chọn điểm, theo kế hoạch đã được chủ sản phẩm phê duyệt ngày 2026-10-27. Mỗi lát cắt bao gồm hành vi UI, server và kiểm thử liên quan.

**Blocked by:** 02 — Hiểu nhiều lượt và điểm đến bắt buộc.

**Status:** IMPLEMENTED — automated/Development evidence recorded 2026-10-27; browser/product acceptance pending.

- [x] AI chỉ chọn ID đủ điều kiện, đúng số ngày, không lặp, giữ mọi điểm bắt buộc.
- [x] Server xếp giờ, định tuyến và kiểm tra xác định; hiện kết quả từng nhóm.
- [x] Thiếu ngày/dữ liệu không được lưu; có kiểm thử và regression Planner cũ.

**Verification:** See the [handoff report](../../../docs/implementation/assistant-trip-planning-verification.md). Full-repo baseline failures and disabled browser acceptance are recorded separately; IMPLEMENTED does not mean ACCEPTED.

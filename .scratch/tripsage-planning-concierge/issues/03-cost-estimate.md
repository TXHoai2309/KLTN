# 03: Bảng chi phí ước tính

**What to build:** `estimateCosts` luôn bật: server tính tiền xăng từ quãng đường lịch mới nhất × mức tiêu hao × giá xăng giả định (sửa được), cộng các khoản AI ước tính (lưu trú, ăn uống, vé, khác, thuê xe), tổng, mỗi người mỗi ngày, so ngân sách. Thẻ `data-cost`. Tài liệu mẫu bảng giá tham khảo cho Admin.

**Blocked by:** 02

**Status:** DONE (2026-11-21) — code + automated tests; price reference document still needs Admin review and upload.

- [x] Tiền xăng và tổng do server tính; số tiền là số nguyên VND; giả định hiện ra.
- [x] `data-cost` qua schema; thẻ bảng chi phí, nhãn "ước tính", ngày cập nhật bảng giá.
- [x] Mẫu `docs/fixtures/price-reference-ha-giang.md`.
- [x] Test thuần chi phí, test route, typecheck.

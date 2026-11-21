# Tra giá vé máy bay và chỗ ở qua SerpApi

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (quyết định D1–D10). Quyết định gốc cần sửa đổi: TripSage P1/P2 trong `docs/decisions.md` (sửa đổi 2026-11-20, flights/hotels lookup only).

Thứ tự chạy (tuần tự): 01 → 02 → 03 → 04 → 05 → 06.

| # | Ticket | Blocked by | Trạng thái |
|---|---|---|---|
| 01 | [Client SerpApi dùng chung và xoay key](issues/01-serpapi-client-keys.md) | — | done |
| 02 | [Tra giá chỗ ở qua SerpApi](issues/02-hotels-serpapi.md) | 01 | done |
| 03 | [Tự tra giá chỗ ở cho cả hành trình](issues/03-auto-lodging-prices.md) | 02 | done |
| 04 | [Tra vé máy bay qua SerpApi, sân bay do server chọn](issues/04-flights-serpapi.md) | 01 | ready-for-agent |
| 05 | [Hỏi phương tiện và dùng giá vé thật cho chặng tiếp cận](issues/05-access-leg-mode-flight-price.md) | 04 | ready-for-agent |
| 06 | [Kiểm thử hồi quy và tài liệu](issues/06-regression-docs.md) | 01–05 | ready-for-agent |

Việc của người dùng (không phải agent):
- Mỗi thành viên tự tạo tài khoản tại **serpapi.com** (không phải searchapi.io), gửi key cho chủ dự án. Đặt vào `apps/web/.env` dạng `SERPAPI_API_KEYS=key1,key2,...`. Không commit.
- Trước ticket 05: bổ sung và kiểm tra giá tàu/xe khách các tuyến ra Hà Nội trong `docs/fixtures/price-reference-ha-giang.md` (D10).
- Trước ticket 06: kiểm tra danh sách sân bay ticket 04 tạo ra.
- Đọc điều khoản SerpApi về việc dùng nhiều tài khoản free.

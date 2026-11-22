# Tickets — Giao diện thon gọn cho người đi, lịch trình đồng nhất, "Tối nay"

**Trạng thái:** cả 17 ticket đều `ready-for-agent` (2026-11-23). Chưa có code.

## Nguồn

- [ASSISTANT-TRIP-TIMELINE-PARITY](../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md) (viết tắt **PARITY**): chặng tiếp cận hiện hành, `DayTimeline` dùng chung, tab ngày đi/về, khối "Tối nay".
- [TRAVELER-UI-SLIM-REDESIGN](../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md) (viết tắt **slim**): token, nút, panel và sheet lịch, đầu trang chuyến đi, danh sách, luồng AI.
- [traveler-ui-system.md](../../docs/design/traveler-ui-system.md) (viết tắt **design**): token, thành phần, bố cục, danh sách kiểm tra.
- [GLOSSARY.md](../../GLOSSARY.md): chặng tiếp cận hiện hành, ngày đi / ngày về, tối nay.

## Ranh giới kiểm thử

- **Seam 1 — module và service:** các tool trong `tripsage-chat-tools.ts`, `tripsage-activities.ts`, `tripsage-access-leg.ts`, các hàm đặt tên và làm sạch tên hiển thị. Kiểm bằng unit/contract test với Places, SerpApi và LLM giả.
- **Seam 2 — component và trình duyệt:** `DayTimeline`, thẻ tóm tắt, panel, sheet, nút và tab. Kiểm bằng harness compact-ui hiện có, sau đó trên trình duyệt ở 1440, 768 và 375px, cả sáng và tối.

## Danh sách ticket và quan hệ chặn

| Ticket | Bị chặn bởi | Trạng thái |
| --- | --- | --- |
| [01 — Bộ token, nút, tab ngày; áp trước cho trang chi tiết chuyến](issues/01-tokens-buttons-trip-detail.md) | Không có | `verified-offline` |
| [02 — Áp token cho trợ lý, danh sách, trang chia sẻ; chỉ còn 2 font](issues/02-tokens-other-screens-fonts.md) | `01` | `verified-offline` |
| [03 — Luồng AI bớt 2 lượt (không hỏi quận, không hỏi lại ngày)](issues/03-ai-fewer-turns.md) | Không có | `done` |
| [04 — Dọn dữ liệu hiển thị, lọc chỗ lưu trú khỏi gợi ý vui chơi](issues/04-display-cleanup-lodging-filter.md) | Không có | `done` |
| [05 — Chặng tiếp cận hiện hành](issues/05-current-access-leg.md) | Không có | `done` |
| [06 — `DayTimeline` dùng chung, áp trước cho trang chi tiết](issues/06-shared-day-timeline.md) | `01` | `verified-offline` |
| [07 — Tab Ngày đi / Ngày về trên trang chi tiết](issues/07-trip-travel-day-tabs.md) | `05`, `06` | `verified-offline` |
| [08 — Khối "Tối nay"](issues/08-evening-plan.md) | `04`, `06` | `verified-offline` |
| [09 — Trang chia sẻ dùng `DayTimeline`](issues/09-shared-page-day-timeline.md) | `06` | `verified-offline` |
| [10 — Thẻ tóm tắt bản lịch, panel desktop, ngăn kéo tablet](issues/10-plan-summary-and-panel.md) | `02`, `05`, `06` | `ready-for-agent` |
| [11 — Sheet lịch mobile, ô nhập, thanh trên 48px](issues/11-mobile-sheet-composer.md) | `10` | `ready-for-agent` |
| [12 — Đầu trang chi tiết chuyến, dải cung đường, thanh chân mobile](issues/12-trip-detail-header.md) | `06`, `07` | `verified-offline` |
| [13 — Danh sách chuyến đi gọn, tên chuyến tự đặt](issues/13-trip-list-compact.md) | `02` | `verified-offline` |
| [14 — Tên cuộc chat tự đặt, dấu cuộc chat đã ra chuyến](issues/14-conversation-auto-title.md) | `02` | `verified-offline` |
| [15 — Khối tiến độ thật, chạy song song](issues/15-plan-progress-parallel.md) | `10` | `ready-for-agent` |
| [16 — Chip tiết kiệm ngân sách, nhãn sở thích](issues/16-budget-chips-preference-labels.md) | `02` | `done` |
| [17 — Nghiệm thu tích hợp](issues/17-integrated-acceptance.md) | `03`, `08`, `09`, `11`, `12`, `13`, `14`, `15`, `16` | `ready-for-agent` |

```
01 ─┬─ 02 ─┬─ 10 ─┬─ 11
    │      │      └─ 15
    │      ├─ 13
    │      ├─ 14
    │      └─ 16
    └─ 06 ─┬─ 07 ── 12
           ├─ 08 (+04)
           ├─ 09
           └─ 10 (+05)
03, 04, 05: không phụ thuộc, làm song song được ngay
17: sau tất cả
```

## Độ phủ yêu cầu

| Ticket | Phủ |
| --- | --- |
| `01` | slim A1, A2, A5 · design §2, §3.1, §3.2 |
| `02` | slim A3, A4, B12 (in đậm) · slim AC-1 |
| `03` | slim D17, D18 · slim AC-5 |
| `04` | slim D23 · PARITY BR-8, BR-10 · slim AC-9 |
| `05` | PARITY US 1–5, BR-1–BR-5 · PARITY AC-1, AC-2 |
| `06` | PARITY US 6–10 · slim C16 · design §3.3 |
| `07` | PARITY US 11, BR-6 · PARITY AC-4 |
| `08` | PARITY US 13–20, BR-7–BR-9 · PARITY AC-6, AC-8, AC-9, AC-10 |
| `09` | PARITY US 12 · PARITY AC-3, AC-5 |
| `10` | slim B6, B7, B12 (thứ tự chip), BR-3 · slim AC-3 (desktop) |
| `11` | slim B8–B10 · slim AC-3 (mobile) |
| `12` | slim C13, C14 · slim AC-2 |
| `13` | slim C15, BR-7 |
| `14` | slim B11, BR-7 · migration nếu cần |
| `15` | slim D19, D20, BR-4 · slim AC-6 |
| `16` | slim D21, D22, BR-5, BR-6 · slim AC-7, AC-8 |
| `17` | slim AC 1–11 · PARITY AC 1–10 · design §6 |

## Thứ tự thực thi gợi ý

1. Mở song song ngay: **01** (lát mẫu giao diện), **03**, **04**, **05**.
2. Sau **01**: **02** và **06**.
3. Sau **02**: **13**, **14**, **16** (độc lập với nhau).
4. Sau **06**: **09**; thêm **05** thì mở **07**, rồi **12**; thêm **04** thì mở **08**.
5. Sau **02**, **05** và **06**: **10**, rồi **11** và **15**.
6. **17** nghiệm thu khi mọi nhánh đã xong.

## Câu hỏi mở ảnh hưởng tới ticket

- Nút chính của trang chi tiết chuyến ("Hỏi trợ lý" hay "Chỉnh sửa") → ticket **12**. Mặc định: "Hỏi trợ lý".
- Chia đôi màn hình từ 1200px → ticket **10**. Mặc định: có.
- Field `places.types` hay `places.primaryType` → ticket **04**.
- Ngày về sáng sớm có tính là một ngày của chuyến không → không thuộc ticket nào; cần owner quyết.

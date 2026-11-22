# Tickets — Cải tiến luồng và giao diện Chỉnh sửa hành trình

**Trạng thái: Tickets 01–08 `done`; Ticket 09 `verified-offline` — 2026-11-18.** Toàn bộ mã nguồn cho 8 slice đầu đã triển khai và kiểm chứng qua `npm run check-types`, `npm run build --workspace web`, `npm run test:legacy --workspace web`, và `78` file Vitest (`809 passed`); `14` file PostgreSQL integration (bao gồm [trip-edit-workspace.postgres.integration.vitest.test.ts](../../apps/web/src/modules/trip-edit/trip-edit-workspace.postgres.integration.vitest.test.ts)) và kiểm thử trình duyệt live vẫn đang chờ môi trường có Docker/PostgreSQL & Playwright.

## Nguồn

- [Spec đã tổng hợp](../../docs/product/trip-edit-redesign-spec.md) (Q1–Q19, 37 User Stories, Testing Decisions).
- [ADR-37](../../docs/decisions.md#adr-37--unified-stateless-client-edit-draft-and-atomic-edit-apply-2026-11-18) (Unified stateless client `Edit draft`, atomic `/edits/apply`, gỡ cap 4 lượt/ngày).
- [GLOSSARY.md](../../GLOSSARY.md) (thuật ngữ `Saved itinerary`, `Edit draft`, `Scheduled visit`, `Itinerary validation`, `Trip origin`, `Planning guidance`).

## Ranh giới kiểm thử đã thống nhất

- **Seam 1 (Backend API & Service):** gọi trực tiếp qua các Route Handler / service `preview`, `ai`, `apply` và snapshot reader của Trip Edit (fake routing/LLM với đồng hồ cố định cho unit/contract, PostgreSQL disposable cho concurrency/idempotency/privacy).
- **Seam 2 (Frontend Workspace & Browser):** client controller/state (`Edit draft`, `Undo/Redo`, auto-shift, kiểm tra 0ms, debounce preview, `409` Rebase, `UNKNOWN` retry) và component workspace hoàn chỉnh trên trình duyệt/DOM ở Desktop và `360px`.

## Danh sách ticket và blocking edges

| Ticket | Bị chặn bởi | Trạng thái |
| --- | --- | --- |
| [01 — Khung Workspace Timeline + Bản đồ, Edit draft thống nhất, bỏ trần 4 lượt/ngày & Hộp thoại Lưu](issues/01-unified-workspace-and-save.md) | Không có | `done` |
| [02 — Ngăn Thêm điểm đến trực quan (Drawer tìm kiếm, giờ mở cửa & gợi ý giờ/thời lượng)](issues/02-visual-add-visit-drawer.md) | `01` | `done` |
| [03 — Kiểm tra 2 tầng (0ms + debounce), Tự dời giờ dây chuyền, Nhãn chặng & Thời tiết](issues/03-two-tier-validation-autoshift-legs-weather.md) | `01` | `done` |
| [04 — Tích hợp chỉnh Trip origin & giờ đi/về (journeySnapshot) trong Workspace](issues/04-integrated-trip-origin-and-times.md) | `01` | `done` |
| [05 — Hỗ trợ chỉnh sửa chuyến có địa điểm ngoài danh mục (ExternalPlace) & xác nhận uncheckedChecks](issues/05-external-place-and-unchecked-edits.md) | `01` | `done` |
| [06 — Bảo vệ lượt đã qua giờ khi ONGOING & Cơ chế Rebase khi gặp xung đột 409](issues/06-ongoing-protection-and-revision-rebase.md) | `01`, `04` | `done` |
| [07 — Thanh AI Edit hợp nhất v1 (đọc Edit draft, đa thao tác, gợi ý 3 điểm & Hoàn tác trực quan)](issues/07-unified-ai-edit-batch-and-undo.md) | `01`, `03`, `05`, `06` | `done` |
| [08 — Thanh AI Edit hợp nhất v2 (ngữ cảnh hội thoại trong phiên, đổi giờ xuất phát & Planning guidance)](issues/08-ai-context-origin-and-guidance.md) | `04`, `07` | `done` |
| [09 — Nghiệm thu tích hợp toàn luồng (PostgreSQL concurrency/idempotency + Browser 360px+/bàn phím)](issues/09-vertical-acceptance-and-hardening.md) | `02`, `03`, `05`, `06`, `08` | `verified-offline` |

## Độ phủ User Stories

| Ticket | User Stories được chứng minh chính |
| --- | --- |
| `01` | 1–8, 10, 26, 27, 32, 33, 35–37 |
| `02` | 11, 12, 36, 37 |
| `03` | 9, 13, 14, 23, 24, 25, 30, 31 |
| `04` | 15, 16, 17, 32, 37 |
| `05` | 29, 31, 32, 33 |
| `06` | 28, 34, 37 |
| `07` | 1, 3, 18, 19, 22, 28, 29 |
| `08` | 20, 21, 22 |
| `09` | 1–37 (tích hợp xuyên suốt, PostgreSQL thật & trình duyệt Desktop/360px) |

## Thứ tự thực thi gợi ý (Frontier)

1. Bắt đầu từ **01** (tracer bullet nền tảng).
2. Sau khi **01** hoàn tất, có thể chạy song song hoặc tuần tự **02**, **03**, **04**, **05**.
3. Sau **04** (cùng **01**), mở **06**.
4. Sau **03, 05, 06** (cùng **01**), mở **07**, rồi đến **08** (cần thêm **04**).
5. **09** kiểm chứng tích hợp cuối khi toàn bộ các nhánh lá đã hoàn thành.

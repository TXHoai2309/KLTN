# Tickets — Trợ lý chuyến đi hợp nhất & Tư vấn hành trình thông minh (`Saved-trip assistant`)

**Trạng thái: DONE (`01`–`07` hoàn tất & đã nghiệm thu) — 2026-11-19.** Bảy lát cắt dọc (`01`–`07`) được tách từ [Spec đã duyệt](../../docs/product/saved-trip-assistant-spec.md) (`Q1–Q10`, 38 User Stories) và [ADR-38](../../docs/decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19), kế thừa nền tảng `ADR-37` đã triển khai trong repo.

## Nguồn tham chiếu bắt buộc

- [Spec Trợ lý chuyến đi hợp nhất](../../docs/product/saved-trip-assistant-spec.md) (`Q1–Q10`, 38 User Stories, Implementation & Testing Decisions).
- [ADR-38](../../docs/decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19) (Unified `Saved-trip assistant`, 2-step Grounded Advisory Pipeline, 7 nhóm câu hỏi, thẻ `Actionable advice suggestion` 1 chạm, GPS có điều kiện và mở rộng thời tiết chuyến đi `ADR-36`).
- [ADR-37](../../docs/decisions.md#adr-37--unified-stateless-client-edit-draft-and-atomic-edit-apply-2026-11-18) (Stateless client `Edit draft`, atomic `/edits/apply`, trần 50 lượt/chuyến).
- [GLOSSARY.md](../../GLOSSARY.md) (thuật ngữ `Saved-trip assistant`, `Edit draft`, `Saved itinerary`, `Scheduled visit`, `Itinerary validation`, `Planning guidance`, `Actionable advice suggestion`, `Schedule rest buffer`, `Trip origin`).

## Ranh giới kiểm thử (Test Seams)

1. **Seam 1 — Hợp đồng HTTP & Dịch vụ của `Trợ lý chuyến đi` (`AI Edit/Advise`, `Preview`, `Apply`, `Snapshot/Read`):**
   - Kiểm thử trực tiếp qua biên Route Handler / dịch vụ của luồng chỉnh sửa chuyến đi với database giả lập hoặc PostgreSQL disposable thật, đồng hồ cố định (`Asia/Ho_Chi_Minh`) và fake providers (LLM, routing, weather, RAG).
2. **Seam 2 — Không gian làm việc hợp nhất trên trình duyệt (`Saved-trip Assistant Workspace & Client Controller`):**
   - Kiểm thử trực tiếp trạng thái & giao diện Workspace hợp nhất (đồng bộ cả `/edit` và `/in-trip`, luồng hội thoại 16 lượt, bấm áp dụng thẻ `Actionable advice suggestion` 1 chạm, kết hợp sửa tay + AI + `Undo/Redo`, kiểm tra 0ms + debounce preview, Rebase `409`, xác nhận lưu + retry `UNKNOWN`, và bố cục responsive `360px+` / Desktop).

## Danh sách ticket và blocking edges

| Ticket | Bị chặn bởi | Trạng thái |
| --- | --- | --- |
| [01 — Hợp nhất điểm vào & Không gian Trợ lý chuyến đi (`Saved-trip assistant`), hội thoại 16 lượt & bảo vệ trường khung](issues/01-unified-entry-and-assistant-workspace.md) | Không có | `done` |
| [02 — Kiến trúc AI 2 bước (`Grounded Advisory Composer` + `Fact Guard`) & Thẻ `Gợi ý chỉnh sửa từ tư vấn` áp dụng 1 chạm](issues/02-two-step-grounded-advisory-and-action-cards.md) | `01` | `done` |
| [03 — Mô phỏng tình huống `Khoảng nghỉ trong lịch` (`Schedule rest buffer`), đến sớm/muộn, đổi nhịp độ & Câu hỏi kép](issues/03-rest-buffer-delay-scenarios-and-compound-turns.md) | `02` | `done` |
| [04 — Tư vấn đổi / thêm địa điểm thông minh (`Destination option`) & Xử lý điểm danh mục bị ẩn (`HIDDEN`)](issues/04-smart-destination-recommendations-and-hidden-stops.md) | `02` | `done` |
| [05 — Hỏi đáp tri thức địa phương (`RAG` + `Kiến thức mở rộng`), `Dự báo thời tiết` / `Giờ mặt trời` chuyến đi & Tiến độ lượt tiếp theo](issues/05-interleaved-rag-knowledge-weather-and-progress.md) | `01`, `02` | `done` |
| [06 — Chính sách GPS / Vị trí hiện tại có điều kiện cho chuyến đi đang diễn ra (`ONGOING`)](issues/06-conditional-ongoing-gps-and-manual-location.md) | `01`, `03` | `done` |
| [07 — Nghiệm thu tích hợp toàn luồng `Trợ lý chuyến đi` (Seam 1 + Seam 2, PostgreSQL Concurrency/Idempotency & Browser `360px+`)](issues/07-vertical-acceptance-and-end-to-end-hardening.md) | `03`, `04`, `05`, `06` | `done` |

## Độ phủ User Stories (1–38)

| Ticket | User Stories được chứng minh chính |
| --- | --- |
| `01` | 1, 2, 3, 4, 5, 22, 23, 26, 27, 31, 32, 36, 37, 38 |
| `02` | 6, 7, 8, 29, 30, 31 |
| `03` | 9, 10, 11, 14, 15, 25, 29 |
| `04` | 12, 13, 24, 28, 29 |
| `05` | 16, 17, 18, 19, 29 |
| `06` | 20, 21, 25, 38 |
| `07` | 1–38 (kiểm chứng tích hợp đầu-cuối, Rebase `409` câu 35, Lưu nguyên tử câu 33, retry `UNKNOWN` câu 34, responsive `360px+` & bàn phím) |

## Thứ tự thực thi tuần tự (Frontier)

1. **`01`** (Hợp nhất điểm vào `/edit` & `/in-trip`, nâng cấp Khung hội thoại Trợ lý AI song hành Timeline + Bản đồ, 16 lượt hội thoại, bảo vệ trường khung).
2. **`02`** (Kiến trúc AI 2 bước: Bước 1 phân tích + `dry-run` phương án ứng viên → Bước 2 LLM soạn lời tư vấn tự nhiên + `Fact Guard` + fallback + thẻ `Actionable advice suggestion` bấm áp dụng 1 chạm).
3. **`03`** (Mô phỏng tình huống `Schedule rest buffer`, đến trễ, đổi nhịp độ, tháo gỡ kẹt giờ cuối ngày & câu hỏi kép vừa hỏi vừa nhờ sửa).
4. **`04`** (Xếp hạng tối đa 3 `Destination option` công khai theo khu vực/giờ mở cửa/thời tiết, thẻ chọn 1 chạm, xử lý điểm `HIDDEN` & bảo toàn `ExternalPlace`).
5. **`05`** (Hỏi đáp RAG + `Kiến thức mở rộng` có nhãn, `Dự báo thời tiết` / `Giờ mặt trời` theo ngày chuyến đi, và hỏi tiến độ lượt tham quan tiếp theo).
6. **`06`** (Chính sách GPS / vị trí thủ công có điều kiện chỉ cho yêu cầu `ONGOING` thực sự phụ thuộc vị trí đang đứng + `preserveCompleted`).
7. **`07`** (Nghiệm thu tích hợp toàn luồng 38 User Stories, PostgreSQL concurrency/idempotency, typecheck, build, test suites & `git diff --check`).

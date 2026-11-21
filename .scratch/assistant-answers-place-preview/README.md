# Trợ lý trả lời tự nhiên hơn, bản nháp giả định, xem nhanh địa điểm và chọn chỗ nghỉ

Spec: `docs/specs/assistant-answers-place-preview-spec.md`. Quyết định: ADR-44 trong `docs/decisions.md`. Thuật ngữ: `GLOSSARY.md` (Assumed draft, Chosen lodging, Place preview, Lodging suggestion, Planning suggestion, Trip hub, Exact departure date, Indicative departure window).

Thứ tự chạy (tuần tự): 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13.

| # | Ticket | Blocked by | Trạng thái |
|---|---|---|---|
| 01 | [Ngày hôm nay và ngày tương đối](issues/01-today-date-relative-departure.md) | — | done |
| 02 | [Hết lỗi 400 với tin nhắn ngắn](issues/02-short-message-400.md) | — | ready-for-agent |
| 03 | [Quy tắc giọng văn](issues/03-tone-rules.md) | 01 | ready-for-agent |
| 04 | [Bản nháp giả định trước, hỏi sau](issues/04-assumed-draft-first.md) | 01, 03 | ready-for-agent |
| 05 | [Xác nhận điểm tập kết ngay lần đầu](issues/05-hub-confirmation.md) | — | ready-for-agent |
| 06 | [Sửa mốc timeline](issues/06-timeline-planner-fixes.md) | — | ready-for-agent |
| 07 | [Giao diện gọn và tab theo ngày](issues/07-ui-compact-day-tabs.md) | 06 | ready-for-agent |
| 08 | [Mô tả điểm dừng và "Vài lưu ý"](issues/08-visit-descriptions-tips.md) | 03, 07 | ready-for-agent |
| 09 | [Xem nhanh địa điểm](issues/09-place-preview.md) | 07 | ready-for-agent |
| 10 | [Chọn chỗ nghỉ trong đề xuất](issues/10-chosen-lodging-proposal.md) | 09 | ready-for-agent |
| 11 | [Lưu chỗ nghỉ đã chọn](issues/11-chosen-lodging-save.md) | 10 | ready-for-agent |
| 12 | [Mời tìm quán ăn](issues/12-meal-suggestions-offer.md) | 03, 04, 09 | ready-for-agent |
| 13 | [Kiểm thử hồi quy](issues/13-regression-verification.md) | 01–12 | ready-for-agent |

Việc của người dùng trước ticket 09: bật Maps Embed API cho khóa trình duyệt Google và kiểm tra giới hạn HTTP referrer (domain production và localhost).

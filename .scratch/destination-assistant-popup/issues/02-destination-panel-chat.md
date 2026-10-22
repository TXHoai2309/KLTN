# 02: Mở khung chat điểm đến ngay trên trang đang xem

**What to build:** Bấm **Hỏi trợ lý AI** ở trang chi tiết điểm đến mở một khung chat nhỏ góc dưới bên phải; người dùng gửi và nhận câu trả lời về đúng điểm đến mà vẫn ở nguyên trang.

**Blocked by:** 01 — Tách phiên chat dùng chung khỏi giao diện trang Assistant.

**Status:** IMPLEMENTED — FE and API/BE offline code complete; PostgreSQL verification pending; awaiting owner acceptance.

- [x] Áp dụng cho cả trang chi tiết thường và trang có editorial; URL, query và vị trí đọc của trang giữ nguyên khi mở khung. Menu Assistant chính vẫn điều hướng như cũ.
- [x] Desktop có khung gần 400×560px, co theo viewport, không khóa trang phía sau; tên điểm đến ở header và context được ghim đúng điểm đến đó.
- [x] Có transcript, nhập/gửi, nguồn thật, nhãn nội dung model, Mở rộng kiến thức, gợi ý ngắn và Chat mới; không có sidebar lịch sử hoặc bộ chọn điểm đến/general trong khung nhỏ.
- [x] Chỉ mở khung không tự gửi câu hỏi, gọi model hoặc tạo conversation; conversation được tạo từ lượt hỏi đầu tiên qua luồng hiện có.
- [x] Session/bootstrap đang chờ, không khả dụng hoặc lỗi có trạng thái rõ; không dùng demo hoặc context GENERAL làm fallback âm thầm.
- [x] First ask và follow-up dùng API hiện có với context/mode đúng; không gửi mô tả trang thành nguồn sự thật hay thêm endpoint popup nếu không có nhu cầu được chứng minh.
- [x] Nguồn-only và expanded, câu trả lời thiếu nguồn, lỗi kỹ thuật và lịch sử đã lưu được hiển thị như hợp đồng hiện tại.
- [x] Kiểm thử từ click đến API/response/UI cho cả hai render path và một câu hỏi tiếp nối; đo không đổi URL/scroll và không dispatch ask khi chỉ mở khung.


## API/BE evidence — 2026-10-22

**BE status:** IMPLEMENTED / offline verified; PostgreSQL verification pending. **Vertical ticket:** ready-for-agent, FE/integration still OPEN; not DONE.

BE: verified strict ID-only Destination request/mode and bootstrap-without-ask via HTTP/session/context tests. Added gated PostgreSQL Guest/Traveler/Admin Destination preference/history tests. No GENERAL fallback or page-prose evidence. FE still implements both Destination triggers, first/follow-up rendering, URL/scroll and non-sending open.

Shared receipt: [API/BE handoff](../../../docs/implementation/destination-assistant-popup-contract.md#apibe-handoff--2026-10-22). Focused suite: 190 PASS / 37 PostgreSQL SKIP; shared idempotency: 4 PASS; root typecheck: 4 tasks PASS. Three red store regressions passed after fixes. Broad Q&A still has 12 pre-existing failures, reproduced on isolated HEAD 18e5e50; see shared receipt for commands and limits. Docker readiness failed/timed out, so SQL/transaction behavior is not claimed verified. No new migration, live database/model use, commit/push/merge/deploy.

## FE evidence — 2026-10-22

**FE status:** IMPLEMENTED / verified.

- `DestinationAiFab` được chuyển thành semantic button (`type="button"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`), áp dụng cho cả hai render path (editorial và chi tiết thường qua `destination-detail.tsx`).
- Bấm mở panel trên chính trang đang xem: không route away, không sửa query hay hash của URL, không gây layout shift hay cuộn trang.
- Header của popup panel hiển thị tên điểm đến được ghim và context `{ type: "DESTINATION", destinationId }`; không có dropdown chuyển sang GENERAL trong popup.
- Có đầy đủ transcript, ô nhập composer, nhãn model, Mở rộng kiến thức (toggle `SOURCE_ONLY`/`EXPANDED`), gợi ý câu hỏi theo điểm đến (`PROMPT_SUGGESTIONS`), và nút Chat mới.
- Mở panel không dispatch ask hay gọi model: kiểm chứng `sentCount === 0`.
- Hiển thị đầy đủ các trạng thái session verifying, unavailable và context error thông qua `useAssistantSession`.
- Đã kiểm chứng qua test chuyên biệt `src/components/assistant/destination-assistant-panel.vitest.test.ts` (Ticket 02 suite: 5 PASS).

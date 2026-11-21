# 03: Giao diện stream — bước đang làm, chữ dần, Dừng, chỉ áp khi có kết quả cuối, bỏ nhãn tư vấn

**What to build:** Khung Trợ lý AI trên `/trips/[id]/edit` (và `/in-trip`, dùng chung workspace) xin stream từ route của ticket 02 và hiển thị:

- từng bước AI đang làm;
- chữ hiện dần;
- dòng tóm tắt các bước có thể mở lại;
- nút Dừng;
- *Correction note*.

Bản nháp chỉ đổi khi nhận `data-trip-assistant-result`. Đồng thời bỏ nhãn "Tư vấn · Lịch chưa bị thay đổi" theo *Caveat policy*.

**Blocked by:** 02.

**Status:** done

## Bối cảnh code

- `apps/web/src/lib/trip-edit-client.ts`: `requestAiTripEdit(tripId, body, options)` hiện gửi JSON và nhận JSON. Đã có `AI_EDIT_TIMEOUT_MS = 305_000`. Kiểu kết quả `AiTripEditOutcome` có các nhánh `TIMEOUT`, `NETWORK_ERROR`, …
- `apps/web/src/app/trips/[id]/edit/edit-trip-client.tsx` (~2800 dòng): hàm gửi prompt quanh dòng 400–700 (`requestAiTripEdit(...)`, `rollbackOptimisticUser`, `setAiBarState`, xử lý `PROPOSED` / `ADVISED` / `NEEDS_CLARIFICATION` / `NEEDS_LOCATION`, đẩy Undo). Đọc kỹ trước khi sửa.
- `apps/web/src/app/trips/[id]/edit/ai-edit-bar.tsx`: `AiBarUiState` (`IDLE` / `LOADING` / `CLARIFYING` / `ADVISED` / `NEEDS_LOCATION` / `APPLIED` / `ERROR`), `AiConversationEntry`, `FormattedAdvisoryProse`, nhãn ở hai chỗ "Tư vấn · Lịch chưa bị thay đổi" và "Lịch chưa bị thay đổi", nút Gửi, chip gợi ý, thẻ "điểm cần xem lại" (commit `fa2874a`, giữ nguyên).
- CSS: `edit-trip.module.css`. Dùng các token `--edit-*`, `--card`, `--border`, `--muted-foreground` có sẵn, để chế độ sáng và tối đều đúng.

## Yêu cầu chi tiết

1. **Client đọc stream** (`trip-edit-client.ts`):
   - Thêm hàm `streamAiTripEdit(tripId, body, { onStatus, onSteps, onTextDelta, onCorrectionNote, signal, fetcher })`. Hàm gửi `Accept: text/event-stream`, đọc UI message stream bằng `readUIMessageStream` hoặc các helper parse chunk của `ai` (đọc kiểu trong `node_modules/ai`, không tự parse SSE nếu `ai` đã có sẵn), rồi trả `AiTripEditOutcome` từ `data-trip-assistant-result`.
   - Response là JSON (lỗi xác thực / quyền / revision) → xử lý như `requestAiTripEdit` hiện tại, trả đúng outcome lỗi cũ.
   - Thời gian chờ là thời gian **không nhận được gì**: đặt lại mỗi chunk, tối đa `AI_EDIT_TIMEOUT_MS` (305 s).
   - Stream kết thúc mà chưa có result → outcome mới `{ kind: "INTERRUPTED", partialText }`.
   - `signal` bị abort (người dùng bấm Dừng) → `{ kind: "STOPPED", partialText }`.
   - Giữ `requestAiTripEdit` (JSON) cho chỗ khác đang dùng và cho test cũ.
2. **Trạng thái giao diện** (`AiBarUiState`): thêm trạng thái stream, ví dụ `{ kind: "STREAMING", prompt, statusLabel, steps, text }`. Hiển thị:
   - Chưa có chữ: danh sách bước đã qua kèm `statusLabel` hiện tại, có spinner; `aria-live="polite"`.
   - Đã có chữ: các bước thu thành một dòng tóm tắt (`<details><summary>Đã xem lịch · chạy thử 2 phương án · xem thời tiết</summary>…</details>`) phía trên chữ đang hiện dần qua `FormattedAdvisoryProse`.
   - Nút "Gửi AI" đổi thành "Dừng" (biểu tượng Square, `aria-label="Dừng trả lời"`). Bấm thì abort.
3. **Áp kết quả:** chỉ khi có result mới chạy đúng logic hiện tại cho `PROPOSED` / `ADVISED` / `NEEDS_CLARIFICATION` / `NEEDS_LOCATION`: áp *Edit draft*, đẩy Undo, gắn thẻ phương án, nhãn "Đã áp dụng". Tin nhắn hội thoại lưu `advice` / `aiSummary` từ result (bản đã lọc), không lưu chữ thô đã stream. Dòng tóm tắt bước được lưu cùng tin nhắn để vẫn mở lại được.
4. **Correction note:** nếu có, hiển thị một dòng nhỏ dưới câu trả lời (biểu tượng `AlertTriangle`, màu `--edit-danger`, chữ cỡ ≈12.5px), lưu cùng tin nhắn.
5. **INTERRUPTED / STOPPED:**
   - Giữ chữ đã hiện trong tin nhắn.
   - Thêm dòng "Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi." (INTERRUPTED) hoặc "Đã dừng — lịch chưa thay đổi." (STOPPED), kèm nút "Thử lại" gửi lại đúng prompt.
   - Không thay đổi *Edit draft*, không đẩy Undo.
6. **Bỏ nhãn tư vấn:** xóa badge "Tư vấn · Lịch chưa bị thay đổi" và "Lịch chưa bị thay đổi" ở tin nhắn tư vấn. Giữ "Đã áp dụng" và "Cần làm rõ". Cập nhật các assertion liên quan trong `edit-workspace-ui.vitest.test.ts` (hai chỗ đang `toContain("Lịch chưa bị thay đổi")`).
7. **Luồng không stream:** kết quả từ luồng dự phòng hoặc nhánh tất định chỉ có status rồi result. Giao diện hiện "Đang xem lịch của bạn…" rồi hiện cả câu trả lời, không có nhãn kỹ thuật.
8. **Responsive và trợ năng:**
   - Từ 360 px trở lên không tràn ngang.
   - Nút Dừng và Thử lại tối thiểu 44×44 px.
   - Bàn phím: Enter gửi, Escape **không** tự hủy stream.
   - Dark mode dùng token.

## Acceptance criteria

- [x] Test `trip-edit-client` với fetcher giả trả `ReadableStream` chứa chunk UI message:
  - gọi `onStatus` / `onSteps` / `onTextDelta` / `onCorrectionNote` đúng thứ tự;
  - trả outcome từ `data-trip-assistant-result`;
  - stream đứt trước result → `INTERRUPTED`;
  - abort → `STOPPED`;
  - response JSON lỗi 409 → outcome revision conflict như cũ;
  - im lặng quá thời gian chờ → `TIMEOUT` (dùng fake timers).
- [x] Test render `AiEditBar`:
  - `STREAMING` chưa có chữ hiện bước và spinner;
  - có chữ thì hiện `<details>` tóm tắt và chữ;
  - nút Dừng thay nút Gửi;
  - tin nhắn `ADVISED` **không** có "Lịch chưa bị thay đổi";
  - `APPLIED` có "Đã áp dụng";
  - có correction note thì hiện dòng đính chính;
  - INTERRUPTED / STOPPED hiện đúng câu và nút Thử lại.
- [x] Không có result thì *Edit draft* không đổi. Kiểm ở mức hàm xử lý outcome trong `edit-trip-client.tsx`, hoặc tách hàm thuần để test.
- [x] Mọi test `src/modules/trip-edit`, `src/app/trips`, `src/lib` đạt; `npx tsc --noEmit -p .` đạt. Commit cục bộ (không push).

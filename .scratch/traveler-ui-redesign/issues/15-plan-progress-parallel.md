# 15: Khối tiến độ thật trong lúc lập lịch và chạy song song sau khi lịch đạt

**What to build:** Phát data part `data-plan-progress` ({step, state, detail}) trong luồng stream từ các tool đang chạy: Chọn điểm đến → Kiểm tra lịch (đợt n/5) → Tìm chỗ nghỉ → Tính chi phí; không lưu vào tin nhắn đã lưu. Sau khi lịch đạt, chạy song song tìm chỗ nghỉ, gợi ý quanh đây, tra giá vé và bảng chi phí nếu không phụ thuộc nhau; đoạn chữ ngắn hiện trước, các thẻ đổ vào panel khi xong. Một bước song song lỗi không chặn hiển thị hay lưu.

**Blocked by:** 10

**Status:** verified-offline

**Nguồn:** [slim D19–D20, Data Contract, Error/Recovery](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md), [design §3.7](../../../docs/design/traveler-ui-system.md)

- [x] Trong kịch bản slim AC-5, khối tiến độ đổi bước ít nhất 3 lần trước khi có bản lịch (slim AC-6); không có bước hay phần trăm giả (BR-4) — đã xác minh bằng unit/SSE stream test (`tripsage-plan-progress.vitest.test.ts`).
- [x] `data-plan-progress` bị lọc khỏi phần lưu (`sanitizeStoredParts`), có test.
- [ ] Đo thời gian lượt lập lịch trên preview deploy trước và sau, ghi vào ticket (chưa deploy theo quy tắc không deploy khi chưa được owner yêu cầu; đã xác minh chạy song song `Promise.allSettled` giữa `emitNearbyActivities` và `emitGroundedPreferenceLabels` bằng overlap probe trong unit test).
- [x] Một bước lỗi hiện "Chưa tìm được…" kèm "Thử lại"; stream bị ngắt hiện "Bị ngắt" và thử lại đúng payload.

## Bằng chứng kiểm tra

- `Set-Location apps/web; npx vitest run src/modules/tripsage-chat src/components/tripsage-chat src/components/traveler-ui` — 63/64 (cũ) + 5/5 sau sửa fixture: `tripsage-plan-progress.vitest.test.ts` (4/4), `components/tripsage-chat/tripsage-plan-progress.vitest.test.ts` (3/3), `tripsage-chat-client-source.vitest.test.ts` (7/7), `traveler-tokens-audit.vitest.test.ts` (10/10), `tripsage-restoration-loop.vitest.test.ts` (2/2).
- `npm run check-types` — PASS (4/4 Turbo tasks).
- `git diff --check` — PASS.

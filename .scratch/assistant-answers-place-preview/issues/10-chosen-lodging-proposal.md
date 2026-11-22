# 10: Chọn chỗ nghỉ cho từng đêm trong đề xuất

**What to build:** Trên mỗi gợi ý chỗ nghỉ (Lodging suggestion) của một đêm và trong modal xem nhanh của nó có nút "Chọn cho đêm N". Mỗi đêm có tối đa một chỗ nghỉ đã chọn (Chosen lodging): chọn chỗ khác thì thay, bấm lại thì bỏ. Chỗ đã chọn được đánh dấu rõ trong timeline, kèm dòng "Không phải đặt phòng". Việc chọn không gọi model, không đổi giờ giấc, kết quả kiểm tra hay bảng chi phí. Khi lịch được lập lại, lựa chọn cho đêm không còn tồn tại bị bỏ.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 31–35, 37–39, mục "Chỗ nghỉ đã chọn").

**Blocked by:** 09

**Status:** done

- [x] Trạng thái đề xuất phía client có ánh xạ đêm → { place_id, tên }, tối đa một mục mỗi đêm; chỉ chọn được trong các gợi ý chỗ nghỉ hệ thống đã gắn cho đêm đó.
- [x] Chọn / thay / bỏ chọn không gửi request tới model, không đổi fingerprint lịch, không chạy lại kiểm tra, không đổi bảng chi phí.
- [x] Lập lại lịch bỏ lựa chọn của các đêm không còn.
- [x] Lựa chọn còn sau khi tải lại cuộc trò chuyện đã lưu (dùng cơ chế lưu trạng thái cuộc trò chuyện hiện có).
- [x] Render test: chọn, thay, bỏ chọn; tối đa một mỗi đêm; nút có trong cả thẻ gợi ý và modal.
- [x] Typecheck, vitest component, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-timeline.ts` (thêm `chosenLodgingItemSchema`, `chosenLodgingsPartSchema`, `ChosenLodgingMap`, `nightIndexFromSlotId`, `isEligibleLodgingSuggestion`, `toggleChosenLodging`, `pruneChosenLodgings`, `chosenLodgingMapToList`, `chosenLodgingListToMap`)
  - `apps/web/src/modules/tripsage-chat/assistant-conversation-contract.ts`, `assistant-conversation-store.ts`, `assistant-conversation-http.ts`, `apps/web/src/app/api/ai/assistant-conversations/[id]/route.ts`, `apps/web/src/components/tripsage-chat/assistant-unified-history.ts` (lưu/khôi phục part `data-chosen-lodgings` qua cơ chế lưu hội thoại hiện có với `PATCH` kiểm quyền chủ sở hữu + idempotency, không gọi model hay thay đổi `data-itinerary`/`data-cost`)
  - `apps/web/src/components/tripsage-chat/tripsage-conversation-state.ts` (đọc `data-chosen-lodgings` khi mở lại hội thoại và tự cắt các đêm không còn khi lập lại lịch)
  - `apps/web/src/components/tripsage-chat/tripsage-timeline-view.tsx`, `tripsage-chat-client.tsx`, `apps/web/src/components/assistant/assistant.css` (nút `"Chọn cho đêm N"` / `"Đã chọn cho đêm N"` trong cả thẻ gợi ý chỗ nghỉ lẫn `PlacePreviewModal`, đánh dấu rõ `"Không phải đặt phòng"`, quản lý state đề xuất phía client)
  - `apps/web/src/components/tripsage-chat/tripsage-chosen-lodging.vitest.test.ts` (4 test chọn/thay/bỏ chọn tối đa 1 mục mỗi đêm, lọc bỏ `placeId` không hợp lệ, cắt đêm khi lập lại lịch, render nút ở cả thẻ gợi ý & modal, khôi phục khi tải lại hội thoại)
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/components/tripsage-chat src/components/place-preview src/modules/tripsage-chat/assistant-conversation.vitest.test.ts`: PASS (11 files, 51 tests)
  - `git diff --check`: PASS
- **Việc chưa làm:** Không có.

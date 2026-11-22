# 12: Mời tìm quán ăn sau khi có lịch

**What to build:** Sau khi có lịch, câu hỏi duy nhất cuối tin của trợ lý là "Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?". Người dùng đồng ý thì trợ lý tìm 1–2 quán cho slot nghỉ trưa từng ngày và quanh điểm cuối ngày rồi gắn vào lịch dưới dạng gợi ý kèm lịch (Planning suggestion) loại MEAL, đánh dấu chưa kiểm tra, mỗi quán mở được xem nhanh. Người dùng từ chối thì trợ lý không hỏi lại trong chuyến đó.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 41–45, mục "Gợi ý quán ăn").

**Blocked by:** 03, 04, 09

**Status:** done

- [x] Dùng lại `searchPlaces` (gần điểm theo id điểm đến trong DB) và `addSuggestions` MEAL; không thêm tool mới.
- [x] Chỉ dẫn hệ thống: sau lịch mới, câu hỏi cuối là lời mời tìm quán ăn (đúng quy tắc tối đa một câu hỏi của ticket 03). Khi lịch còn là bản nháp giả định (ticket 04), câu hỏi về giả định được ưu tiên; lời mời tìm quán ăn để tới lượt đầu tiên không còn giả định quan trọng.
- [x] Từ chối được ghi vào ngữ cảnh chuyến để không hỏi lại.
- [x] Gợi ý quán ăn có `place_id` và nút xem nhanh.
- [x] Test qua route chat với model giả lập: đồng ý → `searchPlaces` + `addSuggestions` MEAL và gợi ý xuất hiện trong phần trả về; từ chối → ngữ cảnh lượt sau ghi đã từ chối.
- [x] Typecheck, vitest tripsage-chat, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-context.ts` (thêm trường tùy chọn `mealSuggestionsDeclined?: boolean` vào `tripInfoSchema`, không đánh dấu lịch cũ)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-tools.ts` (bổ sung `mealSuggestionsDeclined` vào `recordInputSchema` của `recordTripInfo`; dùng lại `searchPlaces` và `addSuggestions` loại `MEAL`, không thêm tool mới)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts` (chỉ dẫn hệ thống: sau lịch không còn giả định quan trọng và chưa từ chối thì câu hỏi cuối duy nhất là `"Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?"`; ưu tiên hỏi giả định khi còn bản nháp giả định; đồng ý → tìm 1-2 quán cho slot trưa và quanh điểm cuối ngày kèm `placeId`; từ chối → ghi `mealSuggestionsDeclined: true` và hiển thị trong ngữ cảnh lượt sau)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-meals.vitest.test.ts` (3 test: kịch bản đồng ý chạy `searchPlaces` + `addSuggestions` MEAL mang `placeId` và render nút `"Xem nhanh"`; kịch bản từ chối ghi `mealSuggestionsDeclined` và xuất hiện trong ngữ cảnh lượt sau; kiểm tra chỉ dẫn hệ thống)
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/modules/tripsage-chat/tripsage-chat-meals.vitest.test.ts src/modules/tripsage-chat/tripsage-chat-tone.vitest.test.ts src/modules/tripsage-chat/tripsage-chat-assumed-draft.vitest.test.ts src/components/tripsage-chat`: PASS (12 files, 51 tests)
  - `git diff --check`: PASS
- **Việc chưa làm:** Không có.

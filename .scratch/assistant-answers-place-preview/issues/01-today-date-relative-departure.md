# 01: Trợ lý biết ngày hôm nay và hiểu ngày tương đối

**What to build:** Trợ lý trong `/assistant` biết hôm nay là ngày nào theo giờ Việt Nam. Người dùng nói "ngày 1 tháng sau" thì ngày khởi hành cụ thể (Exact departure date) được ghi luôn và trợ lý nói lại ngày đó trong một câu. Người dùng nói một khoảng khởi hành dự kiến (Indicative departure window) như "giữa tháng sau", "đầu tháng 12" thì trợ lý tự chọn một ngày cụ thể trong khoảng, chưa ghi, và hiện nút "Đúng, đi <dd/mm/yyyy>" và "Chọn ngày khác"; chỉ ghi khi người dùng đồng ý. Ngày đã bị người dùng bỏ không bị nhắc lại ở các lượt sau.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 10–15, mục "Ngày hôm nay và ngày tương đối").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Ngữ cảnh hệ thống mỗi lượt chat có dòng "Hôm nay: <thứ>, <dd/mm/yyyy> (giờ Việt Nam)", lấy từ đồng hồ server được tiêm (cùng nguồn `now` của planning), không lấy từ client.
- [x] Chỉ dẫn hệ thống hướng dẫn: ngày tương đối rõ ràng → quy đổi, ghi bằng `recordTripInfo`, nói lại một câu; khoảng ngày → chọn một ngày cụ thể, trả `suggestReplies` "Đúng, đi <ngày>" / "Chọn ngày khác", không ghi trước khi người dùng đồng ý.
- [x] Server vẫn từ chối ngày khởi hành trong quá khứ theo giờ Việt Nam (kể cả quanh nửa đêm UTC/VN).
- [x] Khi đã có ngày mới, ngữ cảnh không còn mang ngày bị bỏ và chỉ dẫn cấm nhắc lại lỗi ngày cũ.
- [x] Test qua route chat với model giả lập theo kịch bản: ngữ cảnh chứa ngày hôm nay từ đồng hồ tiêm; `recordTripInfo` nhận 01/12/2026 khi hôm nay là 21/11/2026; từ chối ngày quá khứ.
- [x] Typecheck, vitest của module tripsage-chat và `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts`: thêm `formatVietnamTodayLine(now)` (giờ Việt Nam `Asia/Ho_Chi_Minh`) vào đầu `buildTripsageContext` dùng đồng hồ `planning.now` của server; bổ sung chỉ dẫn hệ thống cho ngày tương đối rõ ràng (`recordTripInfo` ngay + nói lại 1 câu), khoảng khởi hành dự kiến (`suggestReplies` "Đúng, đi <dd/mm/yyyy>" / "Chọn ngày khác", chưa ghi trước khi đồng ý), và không nhắc lại ngày cũ đã bỏ/lỗi ngày cũ.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-http.ts`: đồng nhất đồng hồ server `deps.now` vào `planning.now` khi tiêm clock.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-date.vitest.test.ts`: 5 test qua `tripsageChatResponse` + `MockLanguageModelV4` (dòng Hôm nay từ server clock, bỏ qua trường client, mốc nửa đêm UTC/VN + từ chối `PAST_DATE`, ghi `2026-12-01` khi hôm nay là `21/11/2026`, khoảng ngày chỉ trả `suggestReplies`, đổi ngày bỏ ngày cũ khỏi ngữ cảnh lượt sau).
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (từ `apps/web`): PASS.
  - `npx vitest run src/modules/tripsage-chat`: 27/27 files, 321/321 tests PASS.
  - `git diff --check`: PASS.
- **Việc chưa làm:** Kiểm thử với model thật trên trình duyệt (để ở ticket 13).

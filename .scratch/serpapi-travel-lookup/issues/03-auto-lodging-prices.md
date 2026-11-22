# 03: Tự tra giá chỗ ở cho cả hành trình

**What to build:** Khi lịch đề xuất đã có ngày bắt đầu và nơi xuất phát được xác nhận (không còn trong `blockingAssumedFields`), trợ lý tự tra giá chỗ ở cho mọi khu nghỉ đêm trong một lần gọi, chạy song song. Nếu chưa biết loại chỗ ở, trợ lý hỏi một lần, gộp với câu hỏi ngày/số người. Không tra trên bản nháp giả định. Không tra trùng trong cùng hội thoại.

Spec: `docs/specs/serpapi-travel-lookup-spec.md` (user story 1, 3, 11, mục "Chỗ ở" phần thời điểm tự tra, D1, D8).

**Blocked by:** 02

**Status:** done

- [x] `searchHotels` nhận danh sách tối đa 6 khu `{ destinationId, checkInDate, checkOutDate }` (giữ được cách gọi một khu). Các đêm liên tiếp ở cùng điểm nghỉ được model/server gộp thành một khu. Chạy song song; mỗi khu một kết quả riêng, khu lỗi không làm hỏng khu khác.
- [x] `TRIPSAGE_EXTRA_LIMITS.maxHotelCalls` đổi theo số khu: tối đa 6 khu mỗi lượt (đếm theo khu, không theo lần gọi tool).
- [x] Bỏ qua khu đã tra với cùng (destinationId, ngày nhận, ngày trả, kind, adults) trong hội thoại: dùng ngữ cảnh lượt/hội thoại hiện có (các `HotelsPart` đã phát), không thêm bảng DB.
- [x] Prompt (chỉ khi cờ hotels bật): sau `proposeItinerary` có lịch hợp lệ và ngày/nơi xuất phát không còn giả định, gọi `searchHotels` cho mọi khu nghỉ đêm; chưa biết loại chỗ ở thì hỏi đúng một lần trong cùng câu hỏi ngày/số người, người dùng nói "không quan trọng" thì dùng `ANY`. Trên bản nháp giả định thì không tra.
- [x] Server từ chối tra (lỗi rõ ràng cho model) nếu lịch mới nhất còn `startDate` hoặc `origin` giả định.
- [x] Test route chat với `MockLanguageModelV4` (theo test agent tripsage-chat hiện có): lịch 4 đêm 3 khu → đúng 3 request song song; bản nháp giả định → 0 request; lặp lại cùng tham số → 0 request mới; một khu `UNAVAILABLE` thì các khu khác vẫn có card; cờ hotels tắt → không có tool, không có đoạn prompt.
- [x] Typecheck, vitest liên quan, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi / thêm:**
  - `apps/web/src/modules/tripsage-chat/tripsage-extra-tools.ts`: hỗ trợ `stays[]` (tối đa 6 khu sau `mergeConsecutiveStays`), giữ gọi 1 khu, chạy song song độc lập từng khu, đổi `TRIPSAGE_EXTRA_LIMITS.maxHotelCalls` = 6 (đếm theo khu), chặn `ASSUMED_DRAFT_BLOCKED` khi còn `origin`/`startDate` giả định, chống tra trùng trong lượt và xuyên lượt qua `priorHotelLookups`.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-parts.ts`, `tripsage-serpapi-hotels.ts`, `tripsage-chat-context.ts`: chia sẻ `LODGING_KINDS` client-safe, thêm `lodgingKind` vào `tripInfoSchema`, thêm metadata tùy chọn (`destinationId`, `kind`, `adults`) trên `hotelsPartSchema`, nén `data-hotels` thành `data-hotels-ref` nhỏ gọn trong `compactChatMessagesForRequest`.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts`, `tripsage-chat-http.ts`, `tripsage-chat-tools.ts`, `tripsage-features.ts`: `parseTripsageChatPriorHotelLookups` (không thêm bảng DB), truyền `blockingAssumedFields` + `priorHotelLookups`, cập nhật hướng dẫn tự tra trong `FEATURE_INSTRUCTIONS.hotels` (chỉ bật khi cờ hotels bật).
  - Thêm `apps/web/src/modules/tripsage-chat/tripsage-auto-lodging.vitest.test.ts` (5 integration test route chat với `MockLanguageModelV4`).
  - Cập nhật `tripsage-extra-tools.vitest.test.ts` (đổi test giới hạn từ 2 lên 6 khu khác nhau vì giới hạn mới là 6 và có chống tra trùng) và `tripsage-chat-stream-redaction.vitest.test.ts` (cập nhật metadata `HotelsPart` và dùng 2 khu khác nhau cho test cấp ID liên tiếp).
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS.
  - `npx vitest run --config vitest.config.mts src/modules/tripsage-chat src/components/tripsage-chat` (`apps/web`): PASS (46 files / 403 tests).
  - `git diff --check`: PASS.
- **Việc chưa làm:** Chưa chạy kiểm tra thực tế với OpenAI/SerpApi thật.

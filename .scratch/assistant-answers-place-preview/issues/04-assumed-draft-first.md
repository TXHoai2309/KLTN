# 04: Lập bản nháp giả định trước, hỏi sau

**What to build:** Người dùng chỉ nhắn "tôi muốn lập hành trình Hà Giang" thì ngay trong lượt đó trợ lý đưa ra một bản nháp giả định (Assumed draft): xuất phát từ điểm tập kết Hà Nội, 4 ngày 3 đêm, xe máy, ngày đi là thứ Bảy gần nhất hợp lý tính từ hôm nay (giờ Việt Nam). Thông tin người dùng đã nói thì dùng thay giả định. Bản nháp được xếp giờ và kiểm tra như mọi đề xuất. Sau lịch, trợ lý viết một dòng "Mình đang giả định: Hà Nội · 4N3Đ · xe máy · <ngày>", rồi hỏi **một** câu về giả định quan trọng nhất (đi từ đâu hoặc ngày nào); các giả định còn lại là nút gợi ý. Bản nháp có nơi xuất phát hoặc ngày đi còn là giả định thì không lưu được; nút Lưu nói rõ cần xác nhận gì.

Quyết định: ADR-44. Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 52–55, mục "Bản nháp giả định").

**Blocked by:** 01, 03 (cùng sửa chỉ dẫn hệ thống; cần ngày hôm nay)

**Status:** done

- [x] Trip info có dấu "giả định" theo từng trường (nơi xuất phát, số ngày, phương tiện, ngày đi); dòng tóm tắt nhu cầu phía trên ô nhập hiển thị giả định khác với giá trị đã xác nhận.
- [x] Nơi xuất phát giả định dùng hub cố định Hà Nội do server dựng, không qua tìm địa chỉ; model không đưa tọa độ.
- [x] Ngày giả định tính ở server từ đồng hồ tiêm, không bao giờ ở quá khứ.
- [x] Người dùng xác nhận hoặc sửa một giả định thì dấu giả định của trường đó mất; đổi nơi xuất phát vẫn đi qua xác nhận nơi xuất phát trong chat (ADR-43).
- [x] Lưu bị chặn khi nơi xuất phát hoặc ngày đi còn là giả định; thông báo nói rõ trường nào cần xác nhận; kiểm tra ở server, không chỉ ở client.
- [x] Chỉ dẫn hệ thống: tình huống A của ADR-43 đổi thành "lập bản nháp giả định ngay"; tình huống B, C giữ nguyên.
- [x] Test qua route chat với model giả lập: tin "lập hành trình" không kèm thông tin → `proposeItinerary` được gọi trong cùng lượt với giá trị giả định đánh dấu; lưu bị từ chối khi còn giả định; xác nhận xong thì lưu được.
- [x] Typecheck, vitest tripsage-chat và trip-save, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/trip-validation/trip-proposal-contract.ts`: thêm `ASSUMABLE_FIELDS`, `blockingAssumedFields`, `formatAssumedConfirmationMessage` và trường tùy chọn `assumedFields` trên `tripProposalSchema`.
  - `apps/web/src/modules/trip-planner/planner-contract.ts`: thêm `assumedFields` trên `plannerResultSchema` và chặn `eligibleForFinalConfirmation` khi `origin` hoặc `startDate` còn là giả định.
  - `apps/web/src/modules/trip-save/trip-save-adapter.ts` & `trip-save-service.ts`: truyền `assumedFields` vào `TripProposal`, chặn `toSaveProposal` / `toUncheckedSavePlan` ở client và chặn ở server (`saveTrip` ném `422 ASSUMED_FIELDS_UNCONFIRMED` nêu rõ trường cần xác nhận).
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-context.ts`, `tripsage-chat-tools.ts`, `tripsage-chat-service.ts`: thêm `assumedFields` vào `tripInfoSchema` (server-owned, omit khỏi `recordInputSchema`), `nearestReasonableSaturday(now)` tính thứ Bảy tương lai gần nhất theo giờ Việt Nam, tự điền bản nháp giả định trong `proposeItinerary` (hub cố định `Hà Nội (bến xe Mỹ Đình)`, 4 ngày, xe máy, thứ Bảy gần nhất) và xóa dấu giả định khi người dùng xác nhận/đổi qua `recordTripInfo` / `confirmOrigin`; cập nhật tình huống A (ADR-44) và đánh dấu `[giả định, chưa xác nhận]` trong ngữ cảnh.
  - `apps/web/src/components/tripsage-chat/tripsage-trip-summary.tsx`, `tripsage-save-section.tsx`, `tripsage-chat-client.tsx`: hiển thị phân biệt `(giả định)` (`data-assumed="true"`) trên dòng tóm tắt nhu cầu và vô hiệu hóa nút Lưu kèm thông báo nêu rõ trường cần xác nhận.
  - Cập nhật test cũ bị thay đổi bởi ADR-44: `tripsage-chat-agent.vitest.test.ts` và `tripsage-chat-context-http.vitest.test.ts` (trước ADR-44 test chặn `proposeItinerary` khi thiếu cụm 1; theo ADR-44 nay lập bản nháp giả định có đánh dấu và chặn lưu, vẫn chặn khi origin tường minh chưa xác nhận).
  - Test mới: `apps/web/src/modules/tripsage-chat/tripsage-chat-assumed-draft.vitest.test.ts` (4 test bao phủ `nearestReasonableSaturday`, luồng bản nháp giả định, chặn lưu phía server + lưu thành công sau khi xác nhận, render `TripsageTripSummary` & `TripsageSaveSection`).
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`: PASS.
  - `npx vitest run src/modules/tripsage-chat src/modules/trip-save src/components/tripsage-chat`: 44/44 files, 411/411 tests PASS.
  - `npx prisma migrate status` (từ `packages/db`): 51 migrations, `Database schema is up to date!`.
  - `node scripts/build.mjs --webpack` (từ `apps/web`): PASS (lưu ý Turbopack mặc định bị Windows native OOM ở worker Babel `0xc0000409` trên máy hiện tại).
  - `git diff --check`: PASS.
- **Việc chưa làm:** Integration Postgres (`journey-save.postgres.integration.vitest.test.ts`) chưa chạy do Docker Desktop không bật (`DOCKER_OFF`). Kiểm thử trực quan với model thật để ở ticket 13.

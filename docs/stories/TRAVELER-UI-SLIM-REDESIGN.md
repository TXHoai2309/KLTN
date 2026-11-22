# TRAVELER-UI-SLIM-REDESIGN — Giao diện thon gọn cho Trợ lý AI và Chuyến đi, luồng lập lịch nhanh hơn

## Status

`implemented, verified-offline` (2026-11-23). Toàn bộ 17/17 tickets đã triển khai và vượt qua kiểm thử offline (typecheck, webpack build, 150 bộ test Vitest, kiểm tra token CSS & tương phản WCAG AA, quét secret bundle). Chờ xác minh trình duyệt thật 1440/768/375px trên preview deploy, áp dụng migration #55 (`20261123022000_assistant_conversation_auto_title`), và chốt câu hỏi mở #3 từ owner.

Tài liệu đi kèm:
- Hệ giao diện (token, thành phần, bố cục): [traveler-ui-system.md](../design/traveler-ui-system.md)
- Kết quả rà soát và bằng chứng: [assistant-trips-redesign-ideas.md](../design/assistant-trips-redesign-ideas.md)
- Tickets (chung với PARITY): [.scratch/traveler-ui-redesign](../../.scratch/traveler-ui-redesign/README.md)
- Phụ thuộc: [ASSISTANT-TRIP-TIMELINE-PARITY](ASSISTANT-TRIP-TIMELINE-PARITY.md) — `DayTimeline` dùng chung, chặng tiếp cận hiện hành, khối "Tối nay"

Thuật ngữ theo [GLOSSARY](../../GLOSSARY.md).

## Epic

Trải nghiệm lập hành trình và chuyến đi đã lưu.

## Owner

Owner sản phẩm (người duyệt hướng thiết kế ngày 2026-11-23).

## Goal / User Story

Là người đi, tôi muốn thấy bản lịch của mình nhanh, ở dạng gọn và giống nhau ở mọi trang, với một việc rõ ràng cần làm tiếp, để tôi tin lịch và lưu nó mà không phải đi tìm.

## Outcome

- Giao diện ba màn hình (trợ lý, chuyến đi, trang chia sẻ) dùng chung một bộ token: nút 34px với chữ đậm 500, không bóng, một nút chính trên mỗi màn hình, hai font.
- Khi đã có lịch, trợ lý hiển thị lịch trình và bản đồ là thứ chính: trên desktop là panel bên phải, trên mobile là sheet.
- Thời gian từ tin nhắn đầu tiên tới bản lịch đầu tiên giảm từ khoảng 3 lượt và 2 phút 40 giây xuống còn 1 lượt. Trong lúc chờ có tiến độ thật.

## Source References

- Buổi rà soát prod ngày 2026-11-23: conversation `a3e290bf-21b5-457b-8b58-1c034971c9fb`, trip `cmws4tw8t000108l8oyszsmj3`. Đo bằng JavaScript trên trang chi tiết: nút cao 42–44px, chữ 13.5px đậm 700, bóng màu xanh, bo 12px, dùng 3 font.
- Luật persona hiện có trong `tripsage-chat-service.ts`: không xác nhận lại; người ở xa đi qua điểm tập kết.
- ADR-42 (chặng tiếp cận), ADR-45 (gợi ý quanh đây được lưu), ADR-47 (mục ghim), ADR-48 (lịch linh hoạt).

## Dependencies

- Lát 3 và lát 4 cần `DayTimeline` từ spec PARITY (lát 3 của PARITY). Các lát 1, 2, 5 không phụ thuộc.
- Không cần migration.

## In Scope

### A. Bộ token và thành phần (theo traveler-ui-system §2–§3)

1. Token `--tv-*` (màu sáng và tối, chữ, khoảng cách, bo góc, bóng) trong `packages/ui/src/styles/globals.css`.
2. Thành phần nút với ba cỡ (sm, md, lg) và sáu kiểu (chính, phụ, chữ, link, nguy hiểm, chỉ icon).
3. Áp token cho CSS của trợ lý, trang chuyến đi, danh sách chuyến đi và trang chia sẻ:
   - bỏ `font-weight` 650 và 700;
   - bỏ bóng trên thẻ, nút và tab;
   - thay mực navy bằng `--tv-ink`;
   - một kiểu bo góc cho control.
4. Hai font: Be Vietnam Pro và Lora. Bỏ Inter trên ba màn hình.
5. Tab ngày cao 32px, có chấm màu ngày; link "Xem nhanh" thay cho hộp viền.

### B. Trợ lý AI

6. Thẻ tóm tắt bản lịch trong tin nhắn thay cho việc dàn bảng chi phí và timeline dài trong luồng chat. Thẻ bản cũ mờ đi, ghi "Đã có bản mới".
7. Panel lịch trên desktop từ 1200px trở lên: tiêu đề viết từ dữ liệu, nút chính "Lưu chuyến", tab ngày, `DayTimeline full` cạnh bản đồ dính, tab phụ Lịch trình · Chi phí · Kiểm tra. Từ 768px đến 1199px là ngăn kéo bên phải 560px.
8. Sheet lịch trên mobile: 3 tab Lịch · Bản đồ · Chi phí, nút "Lưu chuyến" dính ở chân sheet; đóng bằng kéo xuống hoặc nút Back.
9. Ô nhập một dòng, tự giãn tối đa 4 dòng, nút gửi tròn nằm trong ô; bộ đếm ký tự chỉ hiện khi đã dùng trên 80%.
10. Thanh trên cùng 48px trên mobile; bỏ nút mở thanh bên đang nổi.
11. Tên cuộc chat tự đặt từ nội dung đã chốt; chấm đánh dấu cuộc chat đã ra chuyến đi.
12. Chip trả lời nhanh chỉ hiện sau khi đoạn chữ đã chạy xong. Bỏ in đậm cả câu trong tin nhắn trợ lý.

### C. Chuyến đi của tôi

13. Chi tiết, đầu trang:
    - tiêu đề viết từ dữ liệu, dòng xám;
    - một nút chính, các nút chữ, menu "⋯";
    - dải cung đường chia theo ngày;
    - bỏ nhãn chữ hoa nhỏ và bốn ô icon thông tin.
14. Chi tiết trên mobile: thanh trên ← / "⋯", thanh chân dính gồm "Bản đồ" và nút chính; bỏ nút trợ lý đang nổi.
15. Danh sách:
    - chuyến gần nhất được làm to;
    - các chuyến khác là dòng gọn 72px;
    - tên theo cung đường, ảnh thật của điểm dừng đầu;
    - "Đánh dấu hoàn thành" và "Xoá" vào menu "⋯".
16. Sửa lỗi nhỏ:
    - chữ trắng của nhãn "Ngày 1" trên trục thời gian;
    - icon máy bay và xe khách rơi xuống dòng riêng;
    - dòng địa chỉ "khu vực hà giang" khi không có địa chỉ thật.

### D. Luồng AI

17. **Người ở xa không bị hỏi quận.** Khi đã biết thành phố nhà ở xa (theo `shouldSuggestHub` hoặc khoảng cách tới điểm tập kết), `findOrigin` không trả ứng viên nằm trong thành phố nhà. Trợ lý hỏi ngay cách ra điểm tập kết kèm 3 chip (máy bay · tàu · xe khách).
18. **Không xác nhận lại ngày đã nêu.** Ngày tạm hiểu hiện trên thẻ tóm tắt, kèm chip "Đổi ngày". Có kiểm tra phía server: khi lượt chỉ còn thiếu bước xác nhận ngày mà người dùng đã nêu ngày rồi, cho lập lịch luôn.
19. **Khối tiến độ thật** dựng từ các tool đang chạy: Chọn điểm đến → Kiểm tra lịch (đợt n/5) → Tìm chỗ nghỉ → Tính chi phí. Phát qua data part trong luồng stream, không chờ hết lượt.
20. **Chạy song song sau khi lịch đạt:** tìm chỗ nghỉ, gợi ý quanh đây, tra giá vé và lập bảng chi phí chạy cùng lúc nếu không phụ thuộc nhau. Đoạn chữ ngắn của trợ lý hiện trước, các thẻ đổ vào panel khi xong.
21. **Vượt ngân sách thì có lối ra:** 2–3 chip kèm số tiền tiết kiệm ước tính lấy từ bảng giá tham khảo (đổi máy bay sang xe khách, hạng phòng rẻ hơn, bớt một ngày). Không tự đổi lịch khi người dùng chưa chọn.
22. **Sở thích thành nhãn:**
    - "săn mây" thành nhãn trên điểm phù hợp, kèm giờ sáng sớm;
    - "ăn đặc sản" thành gợi ý ăn ghi rõ món, lấy từ tài liệu địa phương đã duyệt.
    Nếu không có dữ liệu thì không gắn nhãn.
23. **Dọn dữ liệu hiển thị:** bỏ tiền tố "[Tạm]" khi hiển thị, viết hoa đúng địa danh, bỏ chỗ lưu trú khỏi gợi ý vui chơi (PARITY BR-10).

## Out of Scope

- Khu quản trị, trang chủ, trang Khám phá và trang chi tiết điểm đến.
- Đổi quy tắc của Constraint Validator, cách tính chi phí hay cách tính ngày. Ngày 4 có 0 điểm là câu hỏi mở, không sửa trong spec này.
- Thêm thư viện giao diện mới. Dùng component sẵn có trong `packages/ui` và CSS hiện có.
- Đặt chỗ hoặc thanh toán.

## Business Rules

- **BR-1** Mỗi màn hình hoặc sheet có tối đa một nút kiểu chính.
- **BR-2** Màu ngày chỉ dùng để nhận diện ngày (tab, trục thời gian, bản đồ, dải cung đường), không dùng cho nút hay trạng thái.
- **BR-3** Panel và sheet lịch luôn hiển thị **bản lịch hiện hành** (id mới nhất), không vẽ lại khi có tin nhắn mới không đổi bản lịch.
- **BR-4** Khối tiến độ chỉ hiện bước có thật từ tool đang chạy, không có bước hay phần trăm giả.
- **BR-5** Chip tiết kiệm ngân sách chỉ ghi số lấy từ bảng giá tham khảo hoặc kết quả tra cứu đã có, luôn ghi "ước tính".
- **BR-6** Nhãn sở thích không làm đổi giờ trong lịch và không phải đầu vào của Constraint Validator.
- **BR-7** Tên tự đặt của cuộc chat và chuyến đi chỉ dùng dữ liệu đã chốt (thành phố nhà, điểm tập kết, ngày, số người, cung đường). Người dùng vẫn đổi tên được như hiện tại.

## Roles / Authorization

Không đổi. Panel lịch, thẻ tóm tắt và các tab chỉ đọc dữ liệu đã có quyền đọc như hiện tại.

## Ownership Rules

Không đổi.

## UX / UI Contract

Theo [traveler-ui-system.md](../design/traveler-ui-system.md) §2–§5. Các điểm phải đạt:
- Nút md cao 34px, chữ 13.5px / 500. Nút lg cao 44px, chỉ dùng ở chân màn hình mobile.
- Không có bóng trên thẻ, nút hay tab. Bóng chỉ có ở menu, sheet, popover và ô nhập chat.
- Trợ lý trên desktop: thanh bên 240px, chat 440–480px, panel lịch chiếm phần còn lại. Khi panel hẹp hơn 760px, bản đồ chuyển thành tab.
- Breakpoint: dưới 768px dùng sheet; từ 768px đến dưới 1200px dùng ngăn kéo; từ 1200px trở lên chia đôi màn hình.

## Data Contract

- Data part mới `data-plan-progress`: `{ step: "SELECT" | "VALIDATE" | "LODGING" | "COSTS", state: "running" | "done", detail?: string }`. Chỉ dùng trong lúc stream, không lưu vào tin nhắn đã lưu (giống cách tool trace bị lọc khỏi phía người dùng).
- Thẻ tóm tắt đọc từ data part bản lịch và bảng chi phí đã có; không thêm trường lưu trữ mới.
- Tên tự đặt của cuộc chat cập nhật trường `title` hiện có của `AssistantConversation`, và chỉ khi người dùng chưa tự đổi tên. Nếu chưa có cờ phân biệt tên tự đặt với tên người dùng đặt thì cần thêm một cờ; đây là điểm duy nhất có thể cần migration, phải kiểm schema trước.

## API Contract

Không thêm endpoint. Luồng stream của trợ lý thêm data part `data-plan-progress`.

## Error / Recovery

- Một bước chạy song song lỗi (ví dụ tìm chỗ nghỉ): panel vẫn hiện lịch; khối đó ghi "Chưa tìm được…" kèm nút "Thử lại". Lỗi này không chặn việc lưu.
- Stream bị ngắt giữa chừng: khối tiến độ chuyển sang "Bị ngắt", hiện nút "Thử lại" và gửi lại đúng payload (theo hợp đồng UNKNOWN hiện có).

## Write Semantics / Idempotency

Không đổi. "Lưu chuyến" vẫn dùng hợp đồng SUCCESS / FAILED / UNKNOWN và khoá idempotency hiện tại.

## External Services

Không thêm dịch vụ. Chạy song song làm tăng số lượt gọi Google Places, SerpApi và OpenAI cùng lúc nhưng không tăng tổng số lượt; giữ các giới hạn hiện có.

## Acceptance Criteria

1. Grep CSS của ba màn hình không còn `font-weight: 650`, `font-weight: 700`, `box-shadow` trên thẻ, nút hay tab, hay mã màu hex viết cứng ngoài file token.
2. Mỗi màn hình (trợ lý trống, trợ lý có lịch, chi tiết chuyến, danh sách, sheet mobile) chỉ có một nút kiểu chính.
3. Ở 1440px, khi trợ lý đã có lịch, panel bên phải hiện tiêu đề, tab ngày, timeline và bản đồ mà không cần cuộn chat. Ở 375px, thẻ tóm tắt mở sheet có nút "Lưu chuyến" ở chân.
4. Tab ngày cao 32px với chấm màu ngày trùng màu đường ngày đó trên bản đồ.
5. Kịch bản "4 người ở Đà Nẵng, 4 ngày xe máy, 12/12, bay ra Hà Nội rồi xe khách" cho ra bản lịch ngay ở lượt có đủ thông tin. Trợ lý không hỏi quận ở Đà Nẵng và không hỏi lại ngày.
6. Trong lúc lập lịch, khối tiến độ đổi bước ít nhất 3 lần trước khi có bản lịch.
7. Khi vượt ngân sách, có ít nhất 2 chip kèm số tiền tiết kiệm ước tính; bấm một chip gửi đúng yêu cầu tương ứng.
8. Nếu người dùng nói "săn mây", có ít nhất một điểm mang nhãn săn mây kèm giờ sáng sớm, nhưng chỉ khi tài liệu địa phương có dữ liệu; nếu không có thì không gắn.
9. Không còn "[Tạm]", "khu vực hà giang" viết thường, hay khách sạn/homestay/resort trong gợi ý vui chơi.
10. Chế độ tối: mọi chữ đạt tương phản AA; không còn chữ trắng trên nền sáng (lỗi nhãn "Ngày 1").
11. Typecheck, các bộ test tripsage, trip-save và companion đều qua; `git diff --check` sạch.

## Test Plan

- Unit:
  - `findOrigin` không trả ứng viên trong thành phố nhà ở xa;
  - quy tắc bỏ bước xác nhận ngày;
  - bộ dựng `data-plan-progress`;
  - tính chip tiết kiệm từ bảng giá tham khảo;
  - hàm đặt tên cuộc chat và chuyến đi;
  - hàm làm sạch tên hiển thị ("[Tạm]", viết hoa địa danh).
- Component (harness compact-ui): thẻ tóm tắt (bản hiện hành và bản cũ), panel lịch, sheet, tab ngày, nút theo cỡ và kiểu.
- Trình duyệt: chụp 1440, 768 và 375px cho các màn hình ở AC-2, cả sáng và tối; chạy lại kịch bản AC-5 trên preview deploy và ghi thời gian từng lượt.

## Expected Modules / Files

- `packages/ui/src/styles/globals.css`: token `--tv-*`.
- `apps/web/src/app/layout.tsx`: bỏ Inter khỏi ba màn hình (nếu không dùng chung với chỗ khác thì giữ ở root và chỉ đổi biến font trong CSS màn hình).
- `apps/web/src/components/tripsage-chat/*`:
  - `tripsage-chat-client.tsx` (bố cục chia đôi, sheet, ô nhập);
  - thẻ tóm tắt mới;
  - panel lịch mới;
  - khối tiến độ mới;
  - `assistant.css`.
- `apps/web/src/app/trips/trips-view.tsx` và CSS liên quan: đầu trang, dải cung đường, danh sách, thanh chân trên mobile.
- `apps/web/src/components/trip-companions/companion-group-view.tsx` và `companion.css`: token và `DayTimeline`.
- `apps/web/src/modules/tripsage-chat/`:
  - `tripsage-chat-tools.ts` (`findOrigin`, xác nhận ngày, chạy song song, chip ngân sách, nhãn sở thích);
  - `tripsage-chat-service.ts` (persona và stream progress);
  - `tripsage-chat-origin.ts`;
  - hàm đặt tên.
- `apps/web/src/modules/tripsage-chat/tripsage-activities.ts`: lọc chỗ lưu trú (dùng chung với PARITY).

## Migration Impact

Mặc định là không có. Có thể cần một cờ "tên tự đặt" trên `AssistantConversation` (xem Data Contract); nếu cần thì làm bằng Prisma migration và ghi vào story.

## Environment Impact

Không có.

## Implementation Sequence

1. **Token và thành phần (A1–A5):** áp lên CSS hiện có, chưa đổi bố cục. Thấy khác biệt ngay, ít rủi ro.
2. **Luồng AI nhanh (D17, D18, D23) và sửa lỗi nhỏ (C16, B12):** bớt lượt hỏi thừa, dọn dữ liệu hiển thị.
3. **Spec PARITY** (`DayTimeline`, chặng tiếp cận hiện hành, "Tối nay"), rồi thẻ tóm tắt cùng panel lịch, ngăn kéo và sheet (B6–B10).
4. **Chuyến đi:** đầu trang, dải cung đường, danh sách, mobile (C13–C15); tên tự đặt (B11).
5. **Tiến độ thật và chạy song song (D19, D20)**, chip ngân sách (D21), nhãn sở thích (D22).

Mỗi lát giao và nghiệm thu riêng.

## Acceptance Evidence

- **2026-11-23 (offline integrated verification — Ticket 17):**
  - AC-1 (CSS grep): `traveler-tokens-audit.vitest.test.ts` PASS trên cả 9 file CSS người đi (`trips.css`, `traveler-ui.css`, `day-timeline.css`, `assistant.css`, `assistant-citations.css`, `assistant-weather-card.css`, `tripsage-result-cards.module.css`, `tripsage-memory-panel.module.css`, `companion.css`) — 0 `font-weight: 650/700+`, 0 `#hex` cứng, 0 `Inter`, 0 `box-shadow` ngoài `none` / `var(--tv-shadow-float)`.
  - AC-2, AC-3, AC-4 (một nút chính/màn hình, panel desktop `>= 1200px`, ngăn kéo tablet `768–1199px`, sheet mobile `< 768px` có nút "Lưu chuyến" dính chân, tab ngày 32px chấm `--tv-day-1..7`): `traveler-ui.vitest.test.ts`, `tripsage-plan-panel.vitest.test.ts`, `tripsage-mobile-sheet-composer.vitest.test.ts`, `trips-detail-header.vitest.test.ts`, `trips-list-compact.vitest.test.ts` PASS.
  - AC-5 (luồng AI bớt lượt: không hỏi quận Đà Nẵng, không hỏi lại ngày đã nêu): `tripsage-fewer-turns.vitest.test.ts` PASS.
  - AC-6 (`data-plan-progress` >= 3 lần đổi bước trước `data-itinerary`, không lưu vào DB, chạy song song `Promise.allSettled`, lỗi một bước không chặn lưu): `tripsage-plan-progress.vitest.test.ts` (module 4/4 + component 3/3) PASS.
  - AC-7, AC-8 (chip tiết kiệm ngân sách "ước tính", nhãn "Săn mây" / "Ăn đặc sản" có căn cứ tài liệu đã duyệt): `tripsage-budget-preferences.vitest.test.ts` PASS.
  - AC-9 (dọn "[Tạm]", viết hoa địa danh, lọc lưu trú khỏi vui chơi): `traveler-display-clean.vitest.test.ts`, `tripsage-activities.vitest.test.ts` PASS.
  - AC-10 (chế độ tối & tương phản AA): kiểm toán toán học 16/16 cặp token `--tv-*` sáng/tối đều >= 4.5:1 (tối thiểu `4.93:1` light, `6.51:1` dark); sửa nhãn "Ngày 1" trong `DayTimeline`.
  - AC-11: `npm run check-types` PASS (4/4), `npm run build --workspace web -- --webpack` PASS (60/60 static pages, 289 static files quét = 0 secret), Vitest 150 passed / 17 skipped (1115 passed / 65 skipped), `git diff --check` PASS.
  - Chưa chạy kiểm duyệt trình duyệt thật 1440/768/375px trên preview deploy và chưa áp dụng migration #55 (`20261123022000_assistant_conversation_auto_title`).

## Open Questions

1. **Nút chính của trang chi tiết chuyến đi** là "Hỏi trợ lý" hay "Chỉnh sửa"? Đề xuất: "Hỏi trợ lý", vì sửa lịch cũng đi qua trợ lý và nút đó dẫn tới cả hai việc.
2. **Trợ lý chia đôi màn hình từ 1200px** có được không? Đề xuất: có.
3. **Ngày về sáng sớm có tính là một ngày của chuyến không?** (Ngày 4 có 0 điểm.) Đề xuất: không tính. Một chuyến "N ngày" phải có N ngày đi chơi; nếu chặng về bắt đầu sáng sớm thì đó là tab Ngày về. Đây là quy tắc sản phẩm, cần owner quyết. Không sửa trong spec này.

## Handoff Notes

- Bố cục bản đồ dính bên phải của trang chi tiết chuyến đi là mẫu tốt nhất hiện có. Giữ nguyên nó và đem sang panel của trợ lý, không thiết kế lại.
- Các số đo "trước" (nút 42–44px, đậm 700, bóng xanh, 3 font) lấy bằng `getComputedStyle` trên prod ngày 2026-11-23. Sau lát 1, đo lại cùng cách để làm bằng chứng nghiệm thu.
- Hướng thiết kế đã lưu ở `.taste-skill/app/direction.json`. Thư mục này chưa có trong `.gitignore`.

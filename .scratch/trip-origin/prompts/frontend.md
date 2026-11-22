# Prompt frontend — Nơi xuất phát và lịch trình đi/về

Đây là prompt chuẩn bị để dùng cho chat frontend. Tạo/đọc prompt hoặc duyệt ticket không cho phép bắt đầu code. **Chỉ thực thi khi người dùng nói rõ “bắt đầu code frontend” hoặc chỉ định ticket được code.** Nếu chưa có lệnh đó, chỉ đọc, phân tích và cập nhật tài liệu. Nếu chỉ cho một ticket thì không tự mở rộng sang toàn bộ danh sách.

## Nhiệm vụ

Bạn phụ trách frontend cho tính năng nơi xuất phát và tính chặng đi/về Hà Giang theo spec Q1–Q22 và 10 ticket local. Làm UI/controller/client integration/browser evidence từng lát cắt, dùng shared contract phía BE; không tự xây scheduler/Validator hoặc coi fixture là API thật.

Workspace: `D:/KLTN/KLTN`.

Đọc theo thứ tự yêu cầu trong AGENTS.md, kể cả apps/web/AGENTS.md và hướng dẫn Next.js được cài trước sửa code. Đọc thêm:

- `docs/product/trip-origin-spec.md`.
- `docs/implementation/trip-origin-design.md`.
- `docs/stories/TRIP-ORIGIN-ROUND-TRIP.md`.
- `.scratch/trip-origin/README.md`, ticket tương ứng trong `issues/` và phần BE handoff.
- GLOSSARY.md, DESIGN.md, design/UI baseline và accepted ADRs liên quan.

Khi được phép code UI, dùng các frontend skill áp dụng trong workspace, gồm frontend-design-premium cùng frontend-design và design-taste-frontend cho app screens; giữ nhận diện/giao diện hiện hành, không tự redesign toàn bộ. Figma chưa được xem không được coi là đã nghiệm thu pixel parity.

## Ranh giới trách nhiệm

- FE sở hữu components, form/review/dialog, client controllers/transports, map rendering, styles, accessibility/responsive và browser/component integration tests.
- BE sở hữu shared schemas/types, API contracts, server business logic/auth/ownership, routing/Validator, DB/migrations và fixtures hợp lệ theo schema. Import client-safe types, không server-only services hay secret.
- Không sửa shared schema hoặc tự đặt response shape/error code để làm UI chạy; đọc BE handoff và đề xuất thay đổi contract cụ thể khi thiếu. Không gọi Nominatim/Stadia trực tiếp từ browser, không dựng route thời gian từ AI/Haversine hoặc client clock để chứng nhận lưu.
- Có thể chạy hai chat BE/FE do người dùng mở nhưng tránh cùng sửa một file; với file mixed client/server, thống nhất owner qua handoff trước sửa. Không tự tạo agent/chat hoặc push/merge.

## Các quy tắc UX bắt buộc

- Dùng MapLibre/picker hiện có. Luồng tên → bấm Tìm → chọn kết quả → chỉnh ghim → xác nhận; manual pin/tọa độ là fallback. Không chọn sẵn camera/Hà Nội làm origin. Đổi query/location bỏ xác nhận cũ và invalidates review/proposal liên quan.
- Nominatim không autocomplete, không tự reverse-geocode khi kéo ghim; attribution luôn đúng. Search busy/no-result/error giữ input/manual path. Ghi rõ query không nên chứa thông tin riêng; không đưa private trip notes vào search.
- Nhập giờ đi ngày đầu, hạn về ngày cuối; chỉ hỏi giờ bắt đầu về khi ngày cuối chỉ di chuyển. Không mặc định 08:00 hoặc bắt nhập thời gian nghỉ. Timezone/validity do contract server quyết định.
- Hiển thị outbound/return, visits và ngày travel-only; chạy xe/nghỉ/tổng từ một nguồn response. Không cộng chặng/nghỉ lần nữa trên client hoặc tự quyết PASS. Điểm tham quan/mốc routing/lodging là ba khái niệm khác; disclosure chưa tính lodging phải rõ.
- Hệ thống tự tính nghỉ theo policy spec; UI chỉ trình bày/giải thích kết quả. INSUFFICIENT_DATA khác VIOLATION và lỗi kỹ thuật; preliminary khác official saved Trip. Must-visit không bị UI âm thầm bỏ khi lịch lỗi.
- Guest auth handoff không auto-save; Save/apply cần xác nhận riêng. SUCCESS chỉ sau server xác nhận DB; UNKNOWN giữ exact request/key và chặn thao tác thay thế thuộc mutation đó, retry không phát sinh payload/key mới. Cancel/failure giữ canonical schedule/input.
- Owner view mới hiển thị precise origin; không dùng CSS để giấu dữ liệu server lỡ trả member/public. Nếu API lộ origin cho sai role, báo gap BE và chặn rollout, không đánh ticket complete.
- Origin/time edit có eligibility/cutoff server; frontend hiển thị trạng thái phù hợp nhưng không coi ẩn nút là auth. Legacy no-origin vẫn xem/sửa visit theo điều kiện hiện hành, opt-in riêng; không tự hỏi bổ sung origin mỗi lần đọc chuyến cũ.
- Keyboard/focus labels/aria-live, loading/error/empty/retry, map failure, narrow screens và dark mode theo baseline sản phẩm. Không để panel nhúng áp toàn viewport hoặc duplicate controller/session với full Assistant.

## Thứ tự và đầu ra FE theo ticket

Làm **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → phần FE của 10** nếu được cho phép toàn phạm vi. Có thể làm ticket khác đã có contract khi ticket kế tiếp chưa có BE handoff; không tự đoán contract. 02 không chặn 03 hoặc 07 vì manual path đã đủ.

| Ticket | Phần FE cần giao | Demo và kiểm chứng |
| --- | --- | --- |
| 01 | Picker ghim/tọa độ, confirm/invalidation, input giờ đi/hạn về và form review; kết nối server Vietnam validation/missing-data gates. | Chọn → confirm → review/preliminary, map fail/invalid/outside/missing; direct save failure hiển thị đúng, mobile/keyboard. |
| 02 | Search submit/results/attribution/loading/busy/retry/fallback tích hợp backend. | Không provider call khi chỉ gõ; out-of-order response không ghi đè; chọn/chỉnh/xác nhận và manual fallback. |
| 03 | Proposal một ngày có đủ hai chặng, timeline/chạy xe/nghỉ/tổng/check states từ DTO. | One-day feasible/unknown/deadline/overnight fixtures và API thật local nếu đã sẵn; không gọi candidate là saved. |
| 04 | Daily tabs/timeline/map và tổng nhiều ngày theo contract; giữ selected day/point hợp lý khi regenerate. | Multi-day/cross-day/no-duplicate totals; thiếu dữ liệu không hiện 0; constraints chưa đủ không có Save thành công. |
| 05 | Travel-only day UI, mốc routing/disclosure, return-start control có điều kiện. | Outbound-only/return-only/cả hai, missing giờ, final-day visits tự về; không tạo visit giả để dùng component. |
| 06 | Explicit Save/reconcile, owner readback, errors/UNKNOWN và shared saved views đúng quyền. | Lưu → DB confirmed → read; failed/unknown giữ exact operation và input; member/public không render/nhận private origin. |
| 07 | Bộ chọn chung trong Assistant V2, structured operation, needs/refinement/proposal/save UI, shared full-page/floating behavior. | Create → refine → QA → save/read; stale session/reload/unknown; manual dùng được nếu search chưa hoàn thành. |
| 08 | Saved journey edit UI: separate preview → confirm apply → readback, cancel/cutoff/revision errors. | Before/at/after cutoff, manual-completed, cancel/failure/UNKNOWN giữ canonical; không sửa UI trước DB confirmation. |
| 09 | Legacy disclosure, ordinary visit-edit continuity và explicit opt-in origin trước chuyến. | Đọc không tự backfill; sửa visit không bị ép origin; opt-in đủ/thiếu input/cutoff/cancel/readback. |
| 10 | Browser journeys toàn tính năng và so sánh form/chat cùng fixture/input, phối hợp BE cho DB/race evidence. | Desktop/mobile/keyboard, full/floating, auth/roles, provider outage/fallback và report limits thật. |

## Khi chưa có backend hoàn chỉnh

Chỉ bắt đầu phần UI/fixture của ticket khi BE đã bàn giao contract client-safe được review và fixtures hợp schema hoặc đã thống nhất contract bằng tài liệu. Fixture phải là dữ liệu synthetic ở test/harness riêng, không thêm chế độ giả vào production, không giả call mạng thành công.

Ghi “FE fixture: verified; live/API integration: pending” nếu chưa tích hợp server thật. Tiếp tục phần độc lập có contract, ghi gap cụ thể thay vì bịa response. Không đánh parent blocker/ticket DONE dựa trên mock.

## Bàn giao và Definition of Done

Sau mỗi ticket cập nhật “FE handoff”: contract revision đã dùng, UI flows xong, states/tests/screenshots kiểm chứng, API/backend gaps, live acceptance còn thiếu. Mỗi ticket chỉ hoàn thành khi BE evidence, FE integration và acceptance criteria đều đạt. Không đổi trạng thái ACCEPTED sản phẩm thay người dùng.

Test hành vi qua components/browser, không snapshot phụ thuộc implementation hoặc exact LLM prose. Kiểm tra typecheck/build/tests liên quan, desktop/mobile/keyboard và git diff --check. Chỉ báo actual screenshots/browser receipts; thiếu browser/provider môi trường thì nói rõ. Không run migration shared database, sửa env secrets, push/merge/deploy từ prompt FE.

Kết thúc báo ticket FE nào đã kiểm chứng, fixture/API integration nào còn pending, checks thực chạy và đường dẫn evidence. Nếu user chưa ra lệnh code, chỉ trả kế hoạch và handoff cần thiết, không sửa source.

# Tickets — Nơi xuất phát và lịch trình đi/về

**Trạng thái: Backend được phép code ngày 2026-11-04; BE 01–09 có local evidence; phần BE integration của 10 có receipt. FE/browser/live vertical acceptance vẫn pending.**

Người dùng duyệt cả độ lớn, blocking edges và phương án lưu mỗi ticket một file local. Không tạo issue bên ngoài, không sửa hoặc đóng parent issue. Không cần thay cấu hình tracker toàn dự án để lưu bộ tài liệu này.

## Execution gate

Người dùng đã ra lệnh “bắt đầu code be” ngày 2026-11-04. Backend được phép triển khai theo dependency và ownership trong prompt; không cần xin lại quyền code BE. Nhãn `ready-for-agent` không phải acceptance. FE/integration vẫn cần bằng chứng riêng; shared migration, push/merge/deploy cần chỉ thị riêng.

## Nguồn

- [Spec đã tổng hợp](../../docs/product/trip-origin-spec.md).
- [Quyết định Q1–Q22](../../docs/implementation/trip-origin-design.md).
- [Plan tổng hợp](../../docs/implementation/trip-origin-plan.md).
- [Story và acceptance criteria](../../docs/stories/TRIP-ORIGIN-ROUND-TRIP.md).

## Hai prompt backend và frontend — 2026-11-04

- [Prompt backend](prompts/backend.md): contract/types, validation/routing/rest, auth/privacy, database/admission và API/service/PostgreSQL evidence.
- [Prompt frontend](prompts/frontend.md): picker/form/chat/proposal/saved-trip UI, client transport/controller và browser/accessibility evidence.

Giữ nguyên 10 ticket và blocker đã duyệt. Không cần chia lại thành 20 ticket BE/FE: mỗi ticket vẫn là một lát cắt hành vi; hai prompt chia ownership và workstream bên trong ticket. Cả hai prompt là tài liệu chuẩn bị, chưa phải lệnh code. Chỉ chạy phần được người dùng cho phép rõ ràng ở chat thực thi.

### Bàn giao theo contract và trạng thái hoàn thành

1. BE đọc scope của ticket, định nghĩa contract client-safe/error/timezone/role projection và fixtures hợp schema, kiểm chứng ở service/API rồi ghi BE handoff ngay trong ticket.
2. FE làm phần UI bằng contract/fixture đã review; có thể chuẩn bị trước khi BE service hoàn chỉnh. Fixture ở harness/test, không production fake mode và không thay live acceptance.
3. BE có thể đi tiếp phần backend của ticket phụ thuộc sau khi backend dependency đã kiểm chứng; đây là tiến độ workstream, không có nghĩa parent blocker đã hoàn thành. FE chỉ nối ticket tiếp theo khi có contract tương ứng, không tự đoán hoặc sao chép business rules.
4. Ticket hoàn thành khi cả BE, FE và integration/AC đạt. Ghi riêng BE verified / FE fixture verified / API integration pending; không coi một nửa là DONE. Ticket 10 kiểm tra xuyên suốt, không gánh thay test riêng của các slice.
5. Shared schemas/types/server-only thuộc BE; UI/CSS/client controller thuộc FE. Contract thay đổi phải cập nhật revision/fixtures trước tích hợp; không để hai chat cùng sửa một file. Không cần thêm refactor cơ học rộng trước vì chưa có bằng chứng cần thiết; prefactor cục bộ nằm trong slice và giữ regression checks.

| Ticket | Backend bàn giao chính | Frontend bàn giao chính |
| --- | --- | --- |
| 01 | Origin/time/coverage contract, missing-data gates | Manual picker, confirm và form review |
| 02 | Search + admission/cache nhiều worker | Explicit search/results/fallback |
| 03 | One-day routes/rest/Validator | Timeline hai chặng và checks/totals |
| 04 | Multi-day schedule/cross-day totals | Daily views/tabs/map/totals |
| 05 | Travel-only anchors/clock checks | Ngày chỉ di chuyển và giờ về có điều kiện |
| 06 | Fresh save/read/persistence/privacy/UNKNOWN | Confirm Save/reconcile/owner readback |
| 07 | Assistant V2 operation/state/parity | Picker/chat/refinement/save toàn trang và popup |
| 08 | Saved preview/apply/cutoff/transaction | Preview-confirm-cancel và apply recovery |
| 09 | Legacy ordinary-edit/opt-in compatibility | Disclosure/opt-in UI giữ luồng visit edit |
| 10 | API/DB/race/migration/security evidence | Browser integrated/responsive/accessibility evidence |

10 ticket này là phân rã thực thi được duyệt, thay cho việc coi OR-01–OR-09 trong plan ban đầu là danh sách ticket. OR-01–OR-09 vẫn mô tả nhóm công việc/phụ thuộc kỹ thuật, không phải 9 issue cạnh tranh.

## Danh sách và blocking edges

| Ticket | Bị chặn bởi | Trạng thái |
| --- | --- | --- |
| [01 — Chọn nơi xuất phát thủ công và nhập giờ đi/về](issues/01-manual-origin-and-times.md) | Không có | ready-for-agent; BE & FE verified / live acceptance ready |
| [02 — Tìm nơi xuất phát bằng Nominatim](issues/02-nominatim-origin-search.md) | 01 | ready-for-agent; BE verified / FE + integration pending |
| [03 — Lập chuyến một ngày có cả đi, tham quan và về](issues/03-one-day-round-trip.md) | 01 | ready-for-agent; BE verified / FE + integration pending |
| [04 — Lập chuyến nhiều ngày có tính chặng đầu/cuối](issues/04-multi-day-round-trip.md) | 03 | ready-for-agent; BE verified / FE + integration pending |
| [05 — Hỗ trợ ngày đầu/cuối chỉ di chuyển](issues/05-travel-only-boundary-days.md) | 04 | ready-for-agent; BE verified / FE + integration pending |
| [06 — Lưu và đọc chuyến có nơi xuất phát riêng tư](issues/06-save-read-private-origin.md) | 05 | ready-for-agent; BE local evidence / FE + integration pending |
| [07 — Lập và tinh chỉnh chuyến qua Assistant V2](issues/07-assistant-v2-origin-planning.md) | 06 | ready-for-agent; BE local evidence / FE + integration pending |
| [08 — Đổi nơi/giờ của chuyến đã lưu trước khởi hành](issues/08-edit-origin-before-departure.md) | 06 | ready-for-agent; BE local evidence / FE + integration pending |
| [09 — Bổ sung nơi xuất phát cho chuyến cũ](issues/09-legacy-trip-origin-opt-in.md) | 08 | ready-for-agent; BE local evidence / FE + integration pending |
| [10 — Nghiệm thu toàn luồng form và Assistant](issues/10-vertical-acceptance.md) | 02, 07, 09 | ready-for-agent; BE local evidence / FE + integration pending |

## Cách thực hiện sau khi có lệnh code

- Frontier BE hiện tại: 01–09 đã có contract/evidence; phần BE 10 có integration receipt. Tiếp theo là FE/browser/live acceptance và shared migration/deployment nếu được chỉ thị. Đây không phải hoàn tất blocker vertical 01. Xem [receipt BE 01](01-backend-verification.md).
- Khi 01 xong, 02 và 03 độc lập về blocking; triển khai song song không phải yêu cầu tự động.
- 03 → 04 → 05 → 06 tạo tuyến lập/lưu hoàn chỉnh; mỗi bước có hành vi demo/test và bảo vệ không cho xác nhận lịch chưa đủ dữ liệu.
- Sau 06, 07 và 08 không chặn nhau. 07 dùng manual picker nếu 02 chưa xong; không tạo phụ thuộc search không cần thiết. 09 theo 08.
- 10 chỉ cần blocker trực tiếp 02, 07, 09; các ticket còn lại nằm trong phụ thuộc bắc cầu. Nó kiểm chứng tích hợp, không thay test riêng từng slice.
- Mỗi ticket kiểm tra đủ auth/ownership/missing-data/privacy/write semantics ngay khi chạm boundary, không đợi ticket cuối. Chỉ thay schema khi slice cần, giữ additive/legacy compatibility.

## Coverage tới user stories trong spec

| Ticket | User stories được chứng minh chính |
| --- | --- |
| 01 | 3–9, 24–25, 43–46; chọn thủ công, giờ và review, bước đầu gate new save. |
| 02 | 1–7, 45–46; tên địa điểm, shared admission/cache, fallback và nguồn. |
| 03 | 10–17, 23, 26–29; chuyến một ngày, nghỉ và kiểm tra. |
| 04 | 10–16, 23, 26–29; nhiều ngày và chuyển ngày. |
| 05 | 18–22, 25–29; travel-only boundary days và mốc chặng về. |
| 06 | 33–36, 38, 41–44; lưu/đọc/quyền riêng tư/UNKNOWN. |
| 07 | 24–35, 43–46; tạo/tinh chỉnh/QA/save trong Assistant dùng engine chung. |
| 08 | 31, 34–38, 41–44; preview-confirm-apply trước khởi hành. |
| 09 | 39–40, 34–38; legacy edit và opt-in. |
| 10 | 1–46 qua các hành trình tích hợp chọn lọc, không nhân bản mọi test nội bộ. |

Coverage là liên kết yêu cầu để review, không phải đánh dấu user story đã triển khai hoặc kiểm chứng.


## BE delivery — 2026-11-04

Ticket [01](issues/01-manual-origin-and-times.md) có BE handoff `origin-v1`; xem [receipt milestone đầu](01-backend-verification.md). Temporary Save gate của milestone đó đã được thay bằng authoritative journey Save ở 06.

BE [02](02-backend-verification.md) và [03–05](03-05-backend-verification.md) có contract/service/HTTP evidence riêng. Admission migration chỉ áp disposable PostgreSQL, chưa shared deploy. FE/integration của mọi ticket vẫn pending.

Current [BE 06–10 receipt](06-10-backend-verification.md) supersedes the temporary Save gate in earlier milestone receipts: fresh journey Save/read, Assistant structured ORIGIN, owned journey edit and explicit legacy opt-in now have local evidence. Vertical ticket 10 stays pending browser/live integration. Two new migrations remain unapplied to shared environments.

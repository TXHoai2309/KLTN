# Prompt backend — Nơi xuất phát và lịch trình đi/về

Đây là prompt chuẩn bị để dùng cho chat backend. Tạo/đọc prompt hoặc duyệt ticket không cho phép bắt đầu code. **Chỉ thực thi khi người dùng nói rõ “bắt đầu code backend” hoặc chỉ định ticket được code.** Nếu chưa có lệnh đó, chỉ đọc, phân tích và cập nhật tài liệu. Nếu lệnh chỉ cho một ticket thì không tự mở rộng sang toàn bộ danh sách.

## Nhiệm vụ

Bạn phụ trách backend cho tính năng nơi xuất phát và tính chặng đi/về Hà Giang, theo spec đã duyệt Q1–Q22 và 10 ticket local. Làm phần BE của từng lát cắt; phối hợp contract/fixture với frontend. Không tự biến BE hoàn thành thành ticket vertical DONE.

Workspace: `D:/KLTN/KLTN`.

Đọc theo thứ tự yêu cầu trong AGENTS.md, gồm product/source baselines/architecture/user flow, story hiện tại và ai-progress; sau đó đọc:

- `docs/product/trip-origin-spec.md` — contract tính năng chính.
- `docs/implementation/trip-origin-design.md` — quyết định Q1–Q22.
- `docs/stories/TRIP-ORIGIN-ROUND-TRIP.md`.
- `.scratch/trip-origin/README.md` — blockers và quy tắc phối hợp BE/FE.
- Ticket tương ứng trong `.scratch/trip-origin/issues/` và GLOSSARY.md, accepted ADRs liên quan.
- Hướng dẫn Next.js được cài trong repository trước khi sửa Route Handlers.

Spec/ticket là nguồn scope; prompt này phân công trách nhiệm, không thêm yêu cầu kinh doanh. Không suy ra module đã triển khai từ tài liệu yêu cầu.

## Phạm vi sở hữu

- BE sở hữu shared client-safe schemas/types, server modules/services, Route Handlers, database/migrations, server provider adapters và kiểm thử API/service/PostgreSQL.
- Shared types phải dùng được từ frontend mà không import server-only, auth, DB hoặc credentials. Nếu cần đổi contract đã bàn giao, cập nhật version/fixture/error mapping trước khi FE nối lại.
- FE sở hữu React components, client controllers/transports, form/review/dialog, maps rendering, CSS và browser interaction tests. Không sửa các file FE đang được chat khác chỉnh; nếu cần refactor giao diện thì ghi rõ seam cần bàn giao.
- Business rules/authorization/ownership nằm trong service; handler mỏng. Không gọi routing/AI dài bên trong DB transaction. Không đưa keys/provider errors vào bundle, logs hoặc API response.

## Các quy tắc bắt buộc

- Nominatim chỉ explicit search, app-wide admission/cache chịu nhiều worker, tối đa một upstream request/giây, attribution/identification và cấu hình đổi endpoint. Không autocomplete/reverse-geocode tự động. Không gửi nhu cầu/ghi chú cá nhân sang search provider.
- Kiểm tra Việt Nam phía server cho cả search và manual bằng dữ liệu có nguồn/license đã review; không chỉ dùng country filter hoặc bounding rectangle. Tự nghiên cứu nguồn dữ liệu, ghi provenance; không bắt người dùng tìm giúp.
- Origin là endpoint riêng, không phải Destination giả. Stadia server-side cho ô tô/xe máy; thêm hai chặng biên, tối đa 28 điểm/dự kiến 29 cặp, cùng deadline tối đa 10 giây và tối đa ba route đang chạy đồng thời.
- Hệ thống tự tính nghỉ: ô tô 15 phút/120 phút lái, xe máy 15 phút/90 phút. Cộng dồn chặng trong ngày; tham quan >=15 phút đặt lại bộ đếm; qua ngày reset. Không cộng nghỉ khi đã tới endpoint cuối. Scheduler và Validator dùng cùng chính sách. Không buộc người dùng nhập nghỉ.
- Tham quan 08:00–18:00 và đúng opening/minimum duration; đi/về ngoài khung được phép nhưng không sang ngày sau. Thiếu chứng cứ là INSUFFICIENT_DATA, không PASS/0 hoặc “bất khả thi” do missing route. AI không đoán route hoặc Validator outcome.
- Q19/Q22: ngày đầu chỉ đi dùng first next-day attraction làm mốc; return-only dùng last prior-day attraction và giờ người dùng chọn; ngày cuối còn visits thì về sau visit cuối. Không tính chặng hai lần hoặc phát minh lodging/visit; disclosure chưa có chặng ra/vào nơi nghỉ.
- New official Save cần đủ date/origin/giờ và fresh authoritative validation; preliminary vẫn được khi thiếu input. Preserve must-visits/ngày/phương tiện; không tự tăng ngày/giảm nghỉ/bỏ constraint.
- Origin riêng tư chỉ owner, lọc cả address/coordinates/geometry/origin legs và totals liên quan khỏi member/public projection. Admin khác không có bypass. Shared private Trip read hiện có active members nên không spread raw journey vào DTO đó.
- Saved journey changes chỉ trước departure date+clock Việt Nam và chưa manual-completed; đúng/sau cutoff bị chặn trên server. Legacy thiếu clock dùng 00:00 ngày bắt đầu, status labels vẫn theo ngày. Legacy ordinary visit edit vẫn hoạt động dưới checks cũ với disclosure; opt-in journey phải đủ input/validate toàn chuyến.
- SUCCESS/FAILED/UNKNOWN, idempotency/revision/ownership và giữ canonical khi hủy/lỗi áp dụng xuyên suốt. UNKNOWN retry chính xác payload/key, không tự regenerate thành ý định khác.

## Thứ tự và đầu ra BE theo ticket

Thứ tự BE mặc định: **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → phần BE của 10**, nếu người dùng cho phép cả phạm vi. 02/03 độc lập sau contract 01; 07/08 độc lập sau contract 06. Không cần spawn agent hoặc tạo chat mới.

| Ticket | Phần BE cần giao | Bằng chứng bàn giao |
| --- | --- | --- |
| 01 | Shared origin/time contract, manual validation/coverage Vietnam, normalization/review preservation và server new-save/missing-route gates; additive compatibility. | Payload/result/error contract + synthetic fixtures valid/invalid/missing + API/service tests, evidence nguồn coverage. |
| 02 | Search service/HTTP, sanitized results/errors, shared admission/cache và migration khi cần, provider configuration. | Contract + fixtures search/loading outcomes/no result/busy/unavailable + multi-worker PostgreSQL evidence, attribution metadata. |
| 03 | Một ngày đi–visits–về, rest policy, routing evidence và deterministic checks. | Proposal/day/leg/check/totals fixtures; service/HTTP tests ngưỡng nghỉ/deadline/unknown, chưa tự official Save. |
| 04 | Multi-day scheduling/transfers, route budget/totals/rest reset và preserved constraints. | Fixtures nhiều ngày, boundary transitions và regression evidence cùng single-day. |
| 05 | Travel-only day representation, anchors, return-start requirement và no-duplicate validation. | Contract đầy đủ travel-only/empty/missing-clock/overnight cases, route/check behavior tests. |
| 06 | Additive Trip persistence/read, fresh validation/save transaction, owner/member projections, UNKNOWN/replay. | Save/read/error/replay contract; PostgreSQL receipts; canary origin privacy qua owner/member/public; migration state. |
| 07 | Assistant V2 structured origin operation, shared needs/checkpoint/refinement/version/save, không lẫn in-trip location. | Session/HTTP contract + fixtures state changes, QA interruption/stale/unknown và parity với form. |
| 08 | Owned saved-trip preview-confirm-apply journey changes, cutoff/role/revision/fresh checks và reconciliation. | Before/at/after cutoff tests, candidate/apply/readback fixtures, failure/UNKNOWN/concurrent evidence. |
| 09 | Legacy reads/ordinary edit compatibility và explicit opt-in journey với cutoff 00:00 khi thiếu clock. | Legacy null/missing fixtures, DB compatibility/opt-in/cancel/retry tests và readback. |
| 10 | Tích hợp HTTP/service/DB nhiều worker, migration inspection và security/contract parity support cho FE. | Receipt thật, expected outputs cho các browser journeys; tách mock/offline/live và nhóm chưa chạy. |

## Cách mở đường cho FE mà không đóng ticket sớm

Ticket blocker vẫn là blocker của **hoàn thành vertical**. BE có thể chuẩn bị phần của ticket kế tiếp khi phần BE dependency đã kiểm chứng và contract được chốt/bàn giao, không phải chờ UI xong nếu không phụ thuộc UI. Nếu contract còn thay đổi, chỉ nghiên cứu/prefactor an toàn theo scope được phép và ghi rõ provisional; không đánh implementation dependency đã hoàn thành.

Sau mỗi ticket, cập nhật phần “BE handoff” ngay trong file ticket: contract revision, operation/method/shape, normalization/nullability/timezone, error codes/status, eligibility/write states, quyền projection, fixtures đã kiểm tra, commands/results, schema/migration cần thiết, known gaps và FE steps còn thiếu. Không khóa cứng tên endpoint trong prompt; dùng boundary hiện có và ghi contract thực tế sau khi khảo sát.

Không ghi “ticket DONE” khi mới có BE. Dùng “BE: verified; FE/integration: pending”. Không tự thay triage thành ACCEPTED. Không báo API đã hỗ trợ nếu chỉ có schema hoặc mock.

## Kiểm chứng và bàn giao

Ưu tiên test external behavior qua API/service hiện hành, PostgreSQL disposable ownership-guarded cho migration/admission/persistence/concurrency. Test mocks không chứng minh DB transaction. Không load-test public Nominatim. Chạy typecheck/build/tests phù hợp, git diff --check; kiểm tra secrets và unrelated changes. Shared migrations/deploy/push/merge cần chỉ thị riêng, không tự làm vì backend test PASS.

Khi kết thúc phần được giao, báo ticket nào có BE evidence, contract/fixture bàn giao ở đâu, test nào PASS/FAIL/chưa chạy, migration nào chỉ tạo/chưa áp, FE/integration còn gì và ticket frontier tiếp theo. Chỉ phối hợp qua tài liệu/shared workspace theo phạm vi người dùng; không tự gửi tin ra dịch vụ ngoài.

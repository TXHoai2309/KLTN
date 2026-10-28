# Task BE — Hoàn thiện backend Tìm bạn đồng hành

**Trạng thái thực thi: BE SCOPE COMPLETE / READY FOR FE THROUGH TC-11 — 2026-10-28.**
Đã xác minh mốc 0/TC-02 và triển khai liên tục TC-03–TC-11 theo prerequisite BE,
không chờ FE. Contract/source/tests/migration và Development rollout có evidence
từng mốc trong [sổ bàn giao](../trip-companions-delivery-contract.md) và
[receipt cuối](../trip-companions-backend-verification.md): PostgreSQL58/58,
focused344 PASS, root types/build/HTTP smoke PASS; 5 lỗi regression rộng ở source
baseline không đổi được ghi rõ. FE/vertical/browser acceptance còn riêng;
không nhận ACCEPTED thay chủ dự án. Prompt và ranh giới thực thi dưới đây giữ nguyên.

---

Bạn làm việc trong **D:/KLTN/KLTN**. Triển khai phần **BE của toàn bộ scope còn lại của Tìm bạn đồng hành**: follow-up TC-01 và TC-02–TC-11. Hoàn thành đúng phần backend, kiểm thử và bàn giao contract theo từng mốc trong kế hoạch; FE là task riêng.

## Phạm vi và đọc đầu vào

Đọc `AGENTS.md` và đúng thứ tự tài liệu dự án: docs/README.md, source-baselines.md, product/product-spec.md, architecture/technical-architecture.md, flow/user-flow.md, story đang làm và ai-progress.md. Đọc apps/web/AGENTS.md và guide đúng bản Next cài trong repo trước khi dùng API framework.

Đọc các nguồn:

- [Kế hoạch thực thi hai task](../trip-companions-completion-plan.md).
- [Hiện trạng/gap TC-01](../trip-companions-implementation-status.md), [design Q1–Q17](../trip-companions-design.md), [dependency index](../trip-companions-tickets-plan.md).
- [Delivery contract](../trip-companions-delivery-contract.md), từng issue TC-01–TC-11 tại `.scratch/trip-companions/issues/`, `GLOSSARY.md`, ADR-23.
- [Story TC-01](../../stories/TC-01-publish-public-introduction.md), [Development migration receipt](../tc01-development-migration.md), [review fixes](../tc01-publication-form-review-fixes.md).

Q1–Q17 và 11 ticket/dependency đã được duyệt. Không grill lại, không hỏi duyệt từng mốc. Task này cho phép làm toàn bộ phần BE còn lại khi đủ prerequisite backend; không giới hạn vào một ticket. Các quan hệ phụ thuộc nghiệp vụ giữ nguyên, nhưng gate **bắt đầu phần BE** chỉ yêu cầu backend/contract/tests của prerequisite đã có, không yêu cầu FE của nó hoàn tất. Gate **đánh dấu vertical ticket IMPLEMENTED** vẫn cần đủ BE/FE/tích hợp.

Kiểm tra git status/diff, giữ nguyên work có sẵn và không nhận code của phiên khác là phần mình đã kiểm chứng. TC-01 đã có backend/schema/API thật và migration Development; tái sử dụng, không viết lại hoặc chạy lại migration mù quáng. Không sửa phần Assistant/AI không liên quan.

## Thứ tự và bàn giao

Đi qua **mốc 0 TC-01 follow-up → TC-02 → TC-03 → TC-04 → TC-05 → TC-06 → TC-07 → TC-08 → TC-09 → TC-10 → TC-11**. Mốc 0/TC-02 đã bàn giao thì xác minh source/contract hiện tại rồi tiếp tục TC-03, không làm lại từ đầu. Trước ticket mới, kiểm tra backend prerequisite, sửa lỗi server còn chặn rồi tiếp tục. Tạo/cập nhật story theo `docs/stories/US-TEMPLATE.md` với AC issue và nguồn extension đã duyệt; không bịa requirement IDs.

Mỗi vòng: đọc story/AC → hiện thực BE vừa đủ → focused tests/DB evidence → cập nhật contract/fixture và BE READY FOR FE → **tự chuyển sang phần BE ticket kế tiếp đủ prerequisite trong cùng lượt làm việc**. Việc cập nhật contract là bàn giao liên tục cho FE, không phải tín hiệu kết thúc turn. Đọc lại các báo lỗi FE trong tài liệu chung tại ranh giới ticket và xử lý server defects liên quan; không chờ FE để tiếp tục phần BE độc lập.

Không tự kết thúc chỉ vì xong một ticket, đã cập nhật contract, FE đang làm hoặc combined build đang lỗi ở file FE chưa xong. Khi còn phần BE thực hiện được, tiếp tục hiện thực/kiểm chứng, sửa lỗi thuộc mình và báo tiến độ bằng commentary. Với lỗi build FE đồng thời, ghi repro/nguồn lỗi và kiểm chứng BE riêng; vẫn giữ combined build OPEN, không gọi nó PASS, không sửa lấn file FE hoặc chạy lại build liên tục trên snapshot đang đổi.

Chỉ trả final khi toàn scope BE đã hoàn tất, chủ dự án yêu cầu dừng, hoặc có blocker thật mà đã điều tra và không còn phần BE hữu ích nào làm được (ví dụ thiếu quyền/credential bắt buộc, prerequisite backend không thể giải quyết trong scope, xung đột nguồn chưa thể xử lý). Nêu nguyên nhân/bằng chứng và việc cần từ bên ngoài; không gọi trạng thái chờ FE thông thường là blocker BE. Không busy-wait, poll vô hạn hoặc tự tạo/nhắn chat. Nếu turn bị giới hạn bởi nền tảng, lưu checkpoint chính xác, không nhận DONE giả.

## Phần BE phải hoàn thành

1. **TC-01 follow-up:** chốt cách lấy viewer/host context bằng auth và quyền thật, tái sử dụng server boundary hiện có nếu đủ, để FE hiện link quản lý. Public DTO tiếp tục chỉ allowlist; private tripId/context quản lý chỉ cấp cho owner. Không so displayName hoặc cho ADMIN bypass. Ghi rõ cách gọi cho FE.
2. **TC-02:** public discovery và Tôi đăng, tìm/lọc ngày khởi hành/phương tiện/còn chỗ, pagination/order ổn định, shared schemas/fixtures. Không trả bài/nội dung/media không còn public eligible.
3. **TC-03:** membership/giữ chỗ/eligibility nguyên tử, host không chiếm chỗ, Tôi tham gia/member itinerary reader. Số chỗ còn từ current membership thật. **Thêm guard xóa Trip từng có thành viên ngay tại đây**, giữ dấu đã từng tham gia lâu dài.
4. **TC-04:** leave/rejoin, trả chỗ đúng một lần, revoke reader/writer và giữ lịch sử; không cho host tự rời/chuyển chủ.
5. **TC-05:** sửa publication/capacity, đóng/mở tuyển, gỡ/công khai lại; trạng thái manual recruitment, visibility, full và ngày lịch riêng; không giảm dưới số đang tham gia, race với join đúng.
6. **TC-06:** members reader đúng quyền, host remove/ban, ngăn rejoin qua retry/tạo membership mới, trả chỗ/revoke; không tự thêm unban hay Admin CMS.
7. **TC-07:** lưu/đọc text/link/history, authorship từ session, ordering/cursor không bỏ commit muộn, idempotent send; không dùng chat AI làm chat nhóm.
8. **TC-08:** delta/current permission/reconciliation contract tương thích history; đủ để FE reconnect/dedup và xử lý UNKNOWN/late response, không thêm provider mới.
9. **TC-09:** read marker/unread summary theo actor/nhóm cho cả host, marker không lùi/không vượt cursor hợp lệ, isolation giữa tài khoản, không public read receipt.
10. **TC-10:** tích hợp mọi đường ghi lịch chính thức liên quan với revision/system notice atomic; unchanged proposal/preview/cancel/FAILED không phát notice, replay không trùng; giữ Validator/owner/confirmation.
11. **TC-11:** hủy terminal cho nhóm hiện tại, notice và khóa join/send; giữ quyền đọc lịch sử cho quan hệ hợp lệ, giữ deletion guard; completion bình thường không tự khóa chat hoặc có TTL.

Đọc đầy đủ AC trong issue, không dùng danh sách tóm tắt này để bỏ sót kiểm tra. Thêm schema/migration tối thiểu theo mốc, giữ publication/group identity ổn định. Business logic nằm trong service/modules, Route Handlers mỏng. Không tạo backend/framework/provider chat riêng.

## Ranh giới bắt buộc

- Server lấy trusted actor và role/status hiện hành, xác minh owner/membership ở mỗi reader/writer, không tin ID/role của body. Private Trip API vẫn owner-only; public/member projection riêng, không lộ needs/AI/contact/hidden data.
- Tham gia ngay trước ngày đi Việt Nam, mỗi account một chỗ tìm thêm. Không approval, shared edit/chuyển chủ, đặt suất thay người khác, DM/upload/voice/call/email/push/CMS báo cáo.
- Shared SUCCESS/FAILED/UNKNOWN + idempotency. Payload/target/key của retry phải bất biến; kết quả replay và business write commit nhất quán. PostgreSQL tests cho race/rollback/lost acknowledgement ở các mốc liên quan.
- Chọn và chứng minh cursor/commit ordering; cùng một chiến lược cho user/system messages, delta/history/unread. Không tuyên bố timestamp hoặc ID lớn là đủ để không mất tin.

BE sở hữu schema/migrations, module service/HTTP/shared DTO/fixture/server tests, API routes, điểm tích hợp Trip service và dependency server. FE sở hữu pages/components/CSS/navigation/client adapters/client/UI tests. Không tự sửa giao diện; nếu cần giao điểm hãy ghi rõ contract và file FE cần dùng. Không sửa đồng thời file task FE đang sở hữu.

## Bằng chứng và rollout

Mỗi mốc chạy tests liên quan service/route/shared contract/auth/idempotency; PostgreSQL integration nếu schema/FK/transaction/concurrency đổi. Chạy typecheck/build phù hợp và git diff --check. Giữ regressions Trip Save/Read/Edit/Validator và TC-01 preview/UNKNOWN khi có ảnh hưởng.

Dùng disposable PostgreSQL/synthetic fixtures trước. Khi FE cần schema Development, kiểm tra identity/pending, review migration trong scope, áp dụng bằng Prisma migrate deploy và xác minh ledger/tables/index/FK, lưu receipt không chứa secrets. Không reset/db:push, không đổi credential/.env, không apply Production hoặc gọi AI/routing thật chỉ để test xanh. Nếu thấy pending migration ngoài scope thì ghi rõ, không apply hàng loạt.

Cập nhật từng mục ticket trong `trip-companions-delivery-contract.md`: contract revision, exports, endpoint/method, request/response/errors, auth/allowlist, retry/key semantics, ordering/cursor, fixture, migrations/checks và mục **BE READY FOR FE** với giới hạn cụ thể. Chỉ ghi khi source/tests thực có. Không đổi API đã bàn giao âm thầm; ghi revision/tác động và để FE cập nhật client.

Cập nhật story + BE evidence issue, append ai-progress. Giữ FE/integration OPEN đến khi có bằng chứng thật; việc đó không chặn BE tiến tiếp. Khi FE ghi server defect, xử lý trong ticket liên quan và chạy lại checks bị ảnh hưởng. Giữ DTO đã bàn giao tương thích khi thêm khả năng ở ticket sau; thay đổi cần thiết phải có revision và fixture/migration rõ, không phá client đang chạy.

## Điều kiện hoàn tất và báo cáo

Task BE chỉ hoàn tất khi phần BE của mốc 0 và TC-02–TC-11 đều có code/contract/tests/migration evidence cần thiết, server defects trong tích hợp được xử lý và không còn blocker backend trong scope. Không tự ghi ACCEPTED thay chủ dự án hoặc hoàn tất cả vertical ticket từ BE evidence.

Báo cáo: mốc/ticket đã xong và còn chờ; file/API/exports thật; checks PASS/FAIL/SKIPPED; migration target/status; link contract và phần FE cần tiếp tục. Không commit/push/merge/deploy ứng dụng, Production rollout, tạo chat/automation hoặc nhắn sang chat khác.

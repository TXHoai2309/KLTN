# Hoàn thiện Tìm bạn đồng hành — kế hoạch và hai task BE/FE

Ngày: 2026-10-28. **PLAN PREPARED / TASKS PREPARED — chưa bắt đầu triển khai trong lần lập kế hoạch này.** Chủ dự án yêu cầu lập kế hoạch hoàn thiện toàn bộ ticket còn lại rồi chia thành hai task: một BE, một FE. Đây là cách tổ chức thực thi cho scope đã duyệt, không thay đổi Q1–Q17 hoặc dependency của 11 ticket.

**Điều chỉnh phương thức thực thi theo yêu cầu chủ dự án — 2026-10-28:** Chủ dự án yêu cầu hai task tiếp tục đến hết scope, không tự kết thúc ở mỗi lần bàn giao. **BE được triển khai ticket kế tiếp khi backend prerequisites/contract/tests đã sẵn sàng, không phải chờ FE/tích hợp của ticket trước. FE tích hợp liên tục theo contract thật đã bàn giao.** Gate đủ BE + FE + tích hợp vẫn áp dụng để đánh dấu vertical ticket IMPLEMENTED và xác nhận toàn tính năng, không còn là điều kiện bắt đầu mọi công việc BE. Quy tắc này thay thế các chỉ dẫn chờ FE ở bản prompt/receipt cũ; không thay đổi sản phẩm, AC hoặc kết quả kiểm chứng đã ghi.

## 1. Đầu vào và kết quả cần đạt

**Cập nhật thực thi BE — 2026-10-28:** Toàn scope BE mốc 0 và TC-02–TC-11 đã
hoàn tất theo task mới, có contract/evidence từng mốc, không chờ FE. Development
42 applied / 0 pending / 0 unfinished; PostgreSQL58/58, focused344, types/build và
HTTP smoke PASS. Regression rộng còn 5 lỗi baseline không đổi, ghi rõ trong
[receipt cuối](trip-companions-backend-verification.md). Các receipt FE đã ghi
trong sổ bàn giao giữ nguyên; FE còn lại và browser/owner acceptance tiếp tục độc lập.
Xem [sổ bàn giao](trip-companions-delivery-contract.md).
Các trạng thái “chưa bắt đầu” trong bản kế hoạch ban đầu là snapshot planning,
không thay thế cập nhật thực thi này.

- [Hiện trạng đã kiểm kê](trip-companions-implementation-status.md): TC-01 có code local; Development đã có migration TC-01; TC-02–TC-11 chưa triển khai. Không làm lại phần TC-01 đã có bằng chứng.
- Nguồn nghiệp vụ: [kế hoạch Q1–Q17](trip-companions-design.md), [ticket index](trip-companions-tickets-plan.md), từng issue trong `.scratch/trip-companions/issues/`, [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), ADR-23 và [glossary](../../GLOSSARY.md).
- Kết quả cuối: người ngoài tìm được chuyến công khai; đăng nhập rồi tham gia ngay khi còn chỗ; chủ chuyến quản lý bài và thành viên; nhóm xem lịch mới nhất, chat văn bản/link, nhận tin mới/chưa đọc/thông báo đổi lịch; hủy và hoàn tất đúng quy tắc giữ lịch sử.
- Hoàn thiện các gap TC-01: nút về quản lý cho chủ chuyến, copy đúng chức năng đang có; khi TC-03 xuất hiện thì số chỗ còn và CTA dựa trên membership/trạng thái thật. Sửa publication thuộc TC-05; không nhầm với chỉnh Trip gốc đã có.

## 2. Đúng hai task, đi qua các mốc tích hợp

| Task | Người thực hiện chịu trách nhiệm | Prompt để giao việc |
| --- | --- | --- |
| **BE — Hoàn thiện backend Đồng hành** | Schema/migration, service/quyền/transaction, API, shared DTO/fixture, server/DB tests, bàn giao contract từng mốc | [Task BE](tasks/trip-companions-backend.md) |
| **FE — Hoàn thiện frontend và tích hợp Đồng hành** | Navigation/pages/components, client adapters, giao diện theo quyền, recovery/polling/unread, UI/browser tests và evidence tích hợp | [Task FE](tasks/trip-companions-frontend.md) |

Đây là hai task thực thi dài hạn; mười issue gốc tiếp tục là đơn vị scope và nghiệm thu. Không tạo thêm mười task/chat và không chuyển chúng thành hai ticket ngang chỉ có “làm DB”/“làm màn hình”.

Hai luồng chạy nối tiếp trong từng vai trò: **BE hiện thực/kiểm thử → xuất contract từng ticket → làm BE ticket tiếp theo đủ prerequisite**; **FE đọc contract → tích hợp/kiểm chứng → làm FE mốc tiếp theo sẵn sàng**. Hai phía cập nhật evidence liên tục. Mỗi ticket chỉ được IMPLEMENTED khi đủ BE + FE + tích hợp; BE READY FOR FE không đồng nghĩa DONE. FE có thể chuẩn bị phần không phụ thuộc nhưng không bịa endpoint/DTO hoặc dùng fixture làm runtime fallback.

Hai task có thể chạy đồng thời theo vùng file sở hữu riêng. Sau mỗi mốc đọc/cập nhật bàn giao rồi tự làm phần kế tiếp có thể thực hiện, không cần lệnh “tiếp tục”. Nếu cần contract từ phía kia, hoàn thiện phần độc lập và kiểm chứng còn lại trước; không tự kết thúc vì một lời nhắn bàn giao thông thường. Chỉ dừng khi hết scope, chủ dự án yêu cầu, hoặc blocker thật đã được điều tra khiến không còn công việc hữu ích trong scope. Không busy-wait/poll vô hạn, tự tạo/nhắn chat hoặc xin duyệt lại các quyết định đã chốt. Prompt không bảo đảm vượt giới hạn turn của nền tảng và sửa file không tự đánh thức task đã kết thúc; task đã dừng cần một lệnh tiếp tục để đọc quy tắc mới.

## 3. Thứ tự thực thi

Chọn thứ tự tuần tự đã có trong ticket index để hai task dễ phối hợp. Mốc 0 là follow-up TC-01, không phải ticket nghiệp vụ mới. Giữ các quan hệ phụ thuộc nghiệp vụ; khi bắt đầu phần BE chỉ kiểm tra backend prerequisite, phần FE kiểm tra contract/UI prerequisite. Cột điều kiện qua mốc bên dưới là **điều kiện hoàn tất tích hợp**, không chặn BE của ticket sau khi backend đã đủ.

| Mốc / ticket | BE bàn giao | FE bàn giao | Điều kiện qua mốc |
| --- | --- | --- | --- |
| **0 — Hoàn thiện TC-01** | Cách lấy quan hệ viewer/host đáng tin cậy cho private UI context, tái sử dụng auth/owner service nếu đủ; không thêm private ID/quyền vào public DTO | Hiện nút về quản lý đúng host; copy không hứa join/chat trước khi có; giữ preview/UNKNOWN regressions | Host có lối về Trip; Guest/outsider/Admin không sở hữu không thấy dữ liệu quản lý; không regression form/publish |
| **1 — TC-02** | Collection public và Tôi đăng, tìm/lọc ngày khởi hành/phương tiện/còn chỗ, thứ tự/phân trang ổn định, shared schemas/fixtures | Navigation desktop/mobile; Khám phá/Tôi đăng, card, bộ lọc/URL, tải thêm, loading/rỗng/lỗi | Guest tìm được bài thật; bộ lọc kết hợp đúng; Tôi đăng đúng actor; đi-về giữ bộ lọc |
| **2 — TC-03** | Membership/giữ chỗ nguyên tử, eligibility theo ngày Việt Nam, current member reader, Tôi tham gia và guard xóa Trip từng có member | CTA login/join/đã tham gia/vào nhóm/hết chỗ; không gian nhóm và lịch/thành viên; Tôi tham gia | Hai tài khoản tranh chỗ cuối chỉ một thắng; retry không trùng; member đọc lịch nhưng không sửa; người ngoài bị chặn |
| **3 — TC-04** | Leave idempotent, trả chỗ/thu hồi quyền, giữ lịch sử quan hệ | Tự rời có giải thích; xử lý UNKNOWN; xóa view riêng và cập nhật danh sách/chỗ | Trả đúng một chỗ; request tiếp theo mất quyền; vào lại được khi hợp lệ; host không tự rời |
| **4 — TC-05** | Sửa publication/capacity; đóng/mở tuyển; gỡ/công khai lại; xử lý race với join | Khu vực quản lý chủ chuyến, form sửa và hành động tuyển/visibility tách biệt | Capacity không thấp hơn số đang tham gia; đóng/gỡ dừng người mới nhưng giữ nhóm; mở lại không tạo bài/nhóm mới |
| **5 — TC-06** | Loại/chặn thành viên, chống rejoin, trả chỗ và thu hồi mọi reader/writer | Danh sách thành viên theo quyền, thao tác host, trạng thái mất quyền ở người bị loại | Không loại host; outsider/Admin không sở hữu không bypass; retry/race không tự gỡ chặn |
| **6 — TC-07** | Tin text/link, lịch sử phân trang, thứ tự/cursor an toàn khi commit lệch, membership auth, gửi idempotent | Tab chat, transcript/composer, tác giả/thời gian, link an toàn, tải lịch sử/giữ vị trí | Hai người gửi/đọc được; người mới đọc lịch sử; UNKNOWN không mất/trùng tin; ngoài nhóm không đọc được |
| **7 — TC-08** | Delta reader/quyền hiện hành, đối soát request và cursor đúng commit | Poll khoảng 3 giây khi nhóm mở + trang visible, refresh khi trở lại, reconnect/dedup/late-response guards | Ngắt mạng/đổi tab không mất/trùng tin; đọc tin cũ không bị kéo xuống; session/group cũ không đổ dữ liệu vào view mới |
| **8 — TC-09** | Read marker theo actor/nhóm, monotonic cursor, unread summary cho cả host và member | Badge đúng nhóm, mở đúng chat, mark phần đã hiển thị; summary khoảng 15 giây khi web visible | Marker độc lập từng tài khoản; background fetch không tự đọc hết; leave/logout xóa summary riêng |
| **9 — TC-10** | Tích hợp các đường ghi lịch chính thức liên quan với revision/tin hệ thống trong cùng transaction | Tin đổi lịch khác tin người, lối mở lịch mới nhất và summary mới | Chỉ confirmed save phát một notice; preview/FAILED/hủy chỉnh không phát; replay/rollback đúng, Validator giữ nguyên |
| **10 — TC-11** | Cancellation terminal cho nhóm hiện tại, notice/khóa gửi và giữ lịch sử; completion không khóa chat | Hủy có giải thích, badge/composer chỉ đọc khi hủy, hoàn tất vẫn chat | Hủy cạnh tranh với join/send vẫn đúng; thành viên cũ đọc lịch sử; Trip từng có member vẫn không được xóa |

Mỗi ticket dùng nguyên AC trong issue, không chỉ câu tóm tắt ở bảng này. Trạng thái ban đầu của mọi mốc trong lần lập kế hoạch này là **chưa bắt đầu**; bằng chứng TC-01 cũ vẫn giữ nguyên.

## 4. Các quyết định kỹ thuật phải cụ thể hóa trong story

BE tạo/cập nhật story theo [US-TEMPLATE](../stories/US-TEMPLATE.md) trước khi code mỗi ticket; dẫn extension đã duyệt và issue gốc, không bịa ID requirement trong nguồn Product/System ban đầu. FE đọc và bổ sung UI/evidence của cùng story.

- **Mô hình dữ liệu theo mốc:** tái sử dụng publication duy nhất theo Trip làm danh tính ổn định; thêm các quan hệ/trạng thái tối thiểu cần cho mốc đang làm. Membership giữ dấu từng tham gia dù leave/kick; không tạo lại group khi mở tuyển lại. Không làm trước toàn bộ schema mười ticket chỉ để FE có types.
- **Sức chứa và quyền:** chốt transaction/row lock, uniqueness và guard cho join/leave/capacity/kick/delete; kiểm tra tài khoản/role, quan hệ hiện hành và ngày Việt Nam ở server tại thời điểm ghi. Capacity không suy từ planner party size. Không mở private Trip endpoints cho mọi người.
- **Projection và viewer context:** public allowlist riêng; member đọc lịch chi tiết đã lưu bằng quyền nhóm; context quản lý chỉ cấp cho owner thật. Không so tên hiển thị, không coi ADMIN là owner. Sau mỗi lần thu hồi quyền, reader/writer tiếp theo phải từ chối.
- **Contract đọc danh sách:** ghi rõ query, cách khớp ngày khởi hành, phép kết hợp filter, sort/tie-breaker/cursor, personal scopes và fresh/no-store semantics. UI không tự đếm chỗ bằng dữ liệu thành viên chưa được cấp quyền.
- **Tin/cursor:** chọn và chứng minh cách đọc không bỏ tin do transaction commit muộn; user message, system notice và delta/history/unread phải thống nhất thứ tự. Ghi rõ xác nhận gửi, history pagination và reconciliation, không coi timestamp/ID tăng đơn thuần là bằng chứng commit-order an toàn.
- **Lưu lịch và notice:** xác định mọi đường ghi authoritative hiện có bị ảnh hưởng, không chỉ một Route Handler. Trip update/revision/system notice commit nhất quán; AI proposal/preview không phát tin đã đổi. Tái sử dụng Validator và confirmation hiện hữu.
- **Mutation:** giữ SUCCESS/FAILED/UNKNOWN dùng helper chung; attempts pending/UNKNOWN giữ actor/target/payload/key, khóa các callback cũ có thể đổi request. Known failure cho sửa đúng ngữ cảnh; response muộn không tác động principal/nhóm mới.

Tên endpoint/field/schema mới trong các mốc sau chưa được đóng băng bằng tài liệu này. BE phải xuất contract thực và fixture client-safe trước khi FE nối API; schema của hai phía không được tự lệch nhau.

## 5. Bàn giao và quyền sửa file

- **BE sở hữu:** `packages/db/prisma/schema/`, migrations mới, `apps/web/src/modules/trip-companions/` phần service/HTTP/shared DTO/fixture/server tests, Route Handlers, điểm tích hợp service Trip edit/delete/transaction và dependency server khi cần. Không tự sửa UI/CSS để nhận là đã tích hợp.
- **FE sở hữu:** pages/server page composition theo contract, components, client adapters và client tests, CSS, header/navigation/mobile drawer, trải nghiệm Trip/group và UI/browser tests. Không sửa Prisma, business service, auth policy hoặc shared DTO do BE sở hữu để vượt lỗi tích hợp.
- Cùng thư mục module không có nghĩa cùng file: `companion-client.ts`/client tests thuộc FE; shared `companion-contract.ts`/fixture thuộc BE. Hai task ghi rõ file giao điểm trước khi sửa, không cùng chỉnh một file đồng thời.
- [Delivery contract](trip-companions-delivery-contract.md) là sổ bàn giao theo ticket. BE ghi exports/routes/auth/errors/retry/cursor/migration/test evidence, contract revision và trạng thái sẵn sàng cho FE. FE thêm API đang dùng, UI/browser/integration evidence và gap còn lại; không ghi đè kết quả BE. `ai-progress.md` append-only, tránh hai phiên ghi đồng thời.
- Shared contract đổi sau bàn giao phải ghi revision/tác động, cập nhật fixture và hồi quy client của phần bị ảnh hưởng. Không dựa vào lời nhắn “xong rồi” hoặc code mock để mở dependency.

## 6. Kiểm chứng và môi trường

**Mỗi mốc:** test có ý nghĩa cho quyền/contract/service/controller liên quan, kiểm chứng AC qua API/UI thực, typecheck/build phù hợp và `git diff --check`. Schema/transaction/concurrency đổi thì chạy PostgreSQL integration và kiểm tra migration ledger trên đúng DB đã xác minh. Ghi PASS/FAIL/SKIPPED riêng; không chuyển skip thành pass.

BE kiểm thử schema trên disposable trước. Khi tích hợp cần schema trên Development, kiểm tra identity và pending migrations, chỉ áp dụng migration đã review trong scope task, kiểm tra lại bảng/index/FK và ledger; lưu receipt đã che thông tin nhạy cảm. Không lặp lỗi TC-01 code có nhưng DB thiếu bảng. Không reset/db:push, không đổi `.env` hoặc tự apply Production. Fixture không thay thế API runtime và test không cần gọi AI/routing thật.

**Nghiệm thu tổng sau mốc 10:**

1. Host đăng → Guest tìm/lọc/xem → đăng nhập quay lại rồi bấm join; hai member vào nhóm và người ngoài/Admin không phải member không đọc riêng.
2. Tranh chỗ cuối, double-click, mất commit acknowledgement/retry UNKNOWN; join cạnh tranh leave/capacity/kick/đổi ngày/cancel; không overbook hoặc trùng membership/tin/notice.
3. Chủ chuyến sửa bài/đóng/gỡ/mở lại, loại/chặn; nhóm cũ được giữ và người mất quyền không tiếp tục đọc/gửi bằng UI/cursor cũ.
4. Chat hai phiên, người mới đọc lịch sử; tải tin cũ/URL dài; offline/reconnect/switch tab/account/group; mark unread đúng actor và phần thực đã xem.
5. Host lưu đổi lịch → member nhận đúng một notice và xem lịch mới; preview/FAILED/cancel edit không phát; hủy chuyến chat chỉ đọc, hoàn tất bình thường chat tiếp.
6. Desktop/mobile 360/390/768/1024/1440px và header 1152–1366px, light/dark, keyboard/focus/reduced motion, tên tiếng Việt dài; sticky/composer/AI launcher không che điều khiển. Ảnh mockup không phải browser evidence.

BE kết thúc phần được giao khi toàn bộ backend/contract/tests và các server defects đã biết trong scope được xử lý; không phải chờ FE hoàn thành nếu không còn việc BE. FE kết thúc khi toàn bộ UI/integration được giao có evidence. Toàn tính năng chỉ hoàn tất khi TC-02–TC-11 đủ BE/FE/tích hợp và gap TC-01 đã được xử lý. IMPLEMENTED ghi sau kiểm chứng; ACCEPTED thuộc chủ dự án. Trường hợp blocker thật/giới hạn turn phải có checkpoint và trạng thái chưa hoàn tất. Commit/push/merge/deploy ứng dụng và Production rollout không nằm trong hai task mặc định.

## 7. Cách giao hai task

Mở hai prompt task ở mục 2 và dán mỗi prompt vào phiên tương ứng khi muốn bắt đầu/tiếp tục. Tại snapshot BE đã xong mốc 0/TC-02: **BE tiếp tục TC-03–TC-11 dựa trên backend prerequisite, FE hoàn thiện mốc 0/TC-02 rồi nối các contract tiếp theo**. Không cần tạo task mới cho mỗi issue, không yêu cầu gửi “tiếp tục” giữa các ticket còn làm được. Hai prompt cũ trong `prompts/` vẫn là chế độ một-ticket nếu chủ dự án chỉ giao đúng một ticket; không dùng giới hạn của chúng để dừng hai task toàn phạm vi.

Lần soạn này chỉ tạo kế hoạch và hai task/prompt; không khởi chạy chat/agent triển khai, không sửa code/schema hoặc thao tác DB. Kiểm tra tài liệu: coverage mốc 0 + TC-02–TC-11, dependency order, local links và whitespace; không cần chạy lại application tests/typecheck/build cho thay đổi chỉ có tài liệu.

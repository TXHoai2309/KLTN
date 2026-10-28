# Task FE — Hoàn thiện frontend và tích hợp Tìm bạn đồng hành

**Trạng thái tài liệu: PREPARED — chưa thực thi.** Copy toàn bộ phần prompt dưới đây vào task FE khi muốn bắt đầu. Đây là một task xuyên suốt phần còn lại, không phải prompt mặc định chỉ làm TC-01.

---

Bạn làm việc trong **D:/KLTN/KLTN**. Triển khai phần **FE và kiểm chứng tích hợp của toàn bộ scope còn lại của Tìm bạn đồng hành**: follow-up TC-01 và TC-02–TC-11. BE là task riêng, bàn giao contract theo mốc. Hãy hoàn thiện luồng thật từ tìm chuyến đến tham gia/quản lý/chat/vòng đời.

## Phạm vi và đọc đầu vào

Đọc `AGENTS.md` và đúng thứ tự tài liệu dự án: docs/README.md, source-baselines.md, product/product-spec.md, architecture/technical-architecture.md, flow/user-flow.md, story đang làm, ai-progress.md. Đọc apps/web/AGENTS.md và guide đúng bản Next cài trong repo trước khi dùng API framework.

Đọc:

- [Kế hoạch hai task](../trip-companions-completion-plan.md), [hiện trạng/gap TC-01](../trip-companions-implementation-status.md), [design Q1–Q17](../trip-companions-design.md), [dependency index](../trip-companions-tickets-plan.md).
- [Delivery contract](../trip-companions-delivery-contract.md), từng issue TC-01–TC-11 trong `.scratch/trip-companions/issues/`, story tương ứng, `GLOSSARY.md` và ADR-23.
- `DESIGN.md`, [UI baseline](../../design/ui-baseline.md), [UI/UX analysis](../../design/trip-companions-ui-ux-analysis.md), [mockups](../../design/trip-companions-mockups/README.md) cùng ba PNG, [TC-01 review regressions](../tc01-publication-form-review-fixes.md).

Q1–Q17, bố cục và dependency đã duyệt; không hỏi duyệt lại. Task này bao trùm mọi phần FE còn lại khi đủ prerequisite. Không dùng giới hạn “mặc định TC-01/một ticket rồi dừng” của prompt cũ để bỏ phần còn lại.

Kiểm tra git status/diff, giữ mọi thay đổi hiện có. Tái sử dụng form/public page/client/CSS của TC-01 và luồng Trip edit đã có; không thiết kế lại từ đầu hoặc can thiệp Assistant không liên quan. Figma phải được đối chiếu theo UI baseline khi có thể; không nói đã xem Figma, đã browser-test hoặc đã đạt accessibility nếu chưa kiểm chứng.

## Thứ tự và phối hợp BE

Đi qua **mốc 0 TC-01 follow-up → TC-02 → TC-03 → TC-04 → TC-05 → TC-06 → TC-07 → TC-08 → TC-09 → TC-10 → TC-11**. Trước khi tích hợp một mốc, đọc BE READY FOR FE, contract revision/exports/fixtures, migration state và tests của mốc đó. Dependency phải đủ cả BE/FE/tích hợp.

Có thể chuẩn bị layout, reusable view và test cases từ thiết kế đã duyệt trong lúc chờ BE. Không tự bịa endpoint/schema, lách bằng `any`, đưa hardcoded membership/chat/capacity vào runtime hoặc coi fixture là API thành công. Nếu contract thiếu/sai, ghi rõ request/response/repro để BE sửa; tiếp tục phần không phụ thuộc và giữ integration OPEN.

Nếu cần chờ BE, bàn giao với đúng mốc/contract còn thiếu và trạng thái task **chưa hoàn tất**. Khi được tiếp tục, đọc lại source/contract/evidence rồi làm tiếp cùng task; không viết lại phần đã kiểm chứng, không busy-wait hoặc tự nhắn sang chat khác/tạo thêm task.

## Giao diện và luồng cần hoàn thành

1. **TC-01 follow-up:** nối context host từ auth/server contract thật để hiện “Quay lại quản lý chuyến đi”; ngoài chủ chuyến không được nhận link/ID quản lý riêng. Copy công khai phản ánh chức năng hiện có, giữ mandatory preview và immutable UNKNOWN retry. Không bật CTA tham gia chỉ vì có chữ mô tả trong mockup.
2. **TC-02:** thêm mục **Tìm bạn đồng hành** vào desktop/mobile navigation; trang discovery có **Khám phá/Tôi đăng**, danh sách/card, tìm kiếm, lọc ngày khởi hành/phương tiện/còn chỗ, tải thêm và URL giữ context khi đi-về. “Đăng chuyến đi” dẫn chọn Trip đã lưu hợp lệ; không biến publication thành tạo Trip mới.
3. **TC-03:** CTA đúng Guest/outsider/member/host/đủ chỗ/đã khởi hành; login-return rồi người dùng bấm lại, không tự join. Khi confirmed join, vào nhóm có **Lịch trình/Thành viên** và **Tôi tham gia**. Số chỗ lấy server, host không chiếm suất; không cho member sửa lịch.
4. **TC-04:** tự rời, giải thích mất quyền/giữ tin/trả chỗ, pending/FAILED/UNKNOWN; khi revoke xóa dữ liệu riêng khỏi view và cập nhật Tôi tham gia/chỗ, quay về nội dung được phép xem.
5. **TC-05:** quản lý host có form sửa tiêu đề/giới thiệu/số chỗ và hành động **Đóng/Mở tuyển**, **Gỡ/Công khai lại** tách biệt. Giải thích lý do server không cho mở/giảm chỗ; giữ draft khi recoverable, không nhầm với sửa ngày/điểm/giờ trong Trip gốc.
6. **TC-06:** danh sách thành viên đúng quyền; host loại/chặn với hậu quả rõ, người bị loại thấy mất quyền và không dùng stale CTA rejoin để vượt chặn. Không thêm chuyển chủ/unban/CMS.
7. **TC-07:** thêm tab **Trò chuyện**, transcript/composer text/link, tác giả/thời gian/trạng thái gửi, lịch sử tải thêm và empty/error; thành viên mới đọc toàn bộ lịch sử, disclosure trước nút join. Escape text/link an toàn, không HTML tùy ý.
8. **TC-08:** polling khoảng 3 giây chỉ nhóm đang mở và document visible, dừng khi ẩn/unmount/mất quyền, refresh khi quay lại. Merge/dedup theo contract, reconnect/UNKNOWN giữ request/key; cuối transcript theo tin mới, đang đọc cũ giữ chỗ/có lối “tin mới”.
9. **TC-09:** badge/unread summary đúng actor/nhóm, khoảng 15 giây khi web visible; từ Tôi tham gia mở đúng nhóm/tab, mark theo phần đã hiển thị, không đánh dấu hết chỉ do background fetch.
10. **TC-10:** tin hệ thống đổi lịch khác tin người, có lối mở lịch chính thức mới nhất, cập nhật summary; giữ owner-only edit và Validator/save confirmation, không bắt toàn nhóm xác nhận lại.
11. **TC-11:** hủy chuyến có giải thích hậu quả, badge và composer chỉ đọc theo authoritative state; nhóm hoàn tất bình thường vẫn chat; đóng tuyển/gỡ bài không biến thành hủy nhóm.

Đọc toàn bộ AC trong issue và ma trận vai trò/vòng đời, không bỏ sót vì danh sách này tóm tắt. Không render nút hứa chức năng chưa có API thực trong mốc hiện tại; hoàn thiện các trạng thái dần theo từng contract.

## UI/UX và ranh giới source

Áp dụng **ui-ux-pro-max** và **design-taste-frontend** theo nhánh app screens khi thực thi; đọc skill tương ứng, kế thừa theme/component hiện có. Body Be Vietnam Pro, heading Lora, cream/forest green, Lucide và semantic light/dark. Mockups là tham chiếu bố cục, không phải ảnh nền giả UI hoặc dữ liệu thật.

Discovery ưu tiên so sánh ngày/phương tiện/tuyến/chỗ. Public introduction giữ phần công khai; timeline/meeting/members/chat chỉ hiện khi có quyền thật. Mobile nhóm dùng một tab làm việc mỗi lần, composer nằm trong nhóm, không chồng chat người dùng lên launcher AI. Header dài phải được kiểm tra ở desktop nhỏ.

FE sở hữu pages/server composition theo contract, components/CSS/navigation, `companion-client.ts` và client tests, UI/browser tests. BE sở hữu shared schema/fixture, business/auth/persistence/service/HTTP/API routes. Không sửa Prisma, Validator, private auth policy hoặc public DTO để làm UI chạy; ghi cụ thể server defect và để BE sửa. Không cùng chỉnh file với task BE.

Mutation dùng shared client helpers và DTO BE export. SUCCESS chỉ sau confirmed response; UNKNOWN giữ toàn bộ payload/key/target, pending không cho stale input/image/tab callbacks thay request. Response cũ phải gắn actor/nhóm/attempt; logout/account switch/leave/kick/lock clear state và ngừng request/poll thích hợp. Không báo tham gia/tin đã gửi giả.

Không thêm approval, cùng sửa lịch, DM, upload/voice/call, typing/read receipts, email/push, chuyển chủ, CMS báo cáo hoặc TTL khóa chat sau 7 ngày.

## Kiểm chứng theo mốc và nghiệm thu tổng

Mỗi mốc: kiểm tra AC qua API thật đã bàn giao; tests có ý nghĩa cho component/controller/client contract và interactions (stale response, pending/UNKNOWN, revocation, timer/visibility khi liên quan). Giữ TC-01 actual-handler preview/UNKNOWN regressions; không dùng HTML tĩnh làm bằng chứng đủ cho tương tác.

Chạy typecheck/build phù hợp, git diff --check. Browser flows bằng tài khoản/Trip synthetic trên local + DB disposable hoặc Development đã xác minh; nếu schema thiếu, báo migration còn thiếu cho BE, không sửa schema/chạy db:push. Không giả lập network fixture rồi nhận là DB write đã được xác nhận.

Kiểm tra desktop/mobile 360/390/768/1024/1440px, header 1152–1366px, light/dark, keyboard/focus/reduced motion, tiếng Việt/tên/URL dài; sticky/composer/AI launcher không che focus. Phân biệt viewport giả lập với keyboard thiết bị thật. Lưu screenshot browser thật và ghi các giới hạn Figma/accessibility/môi trường chưa kiểm chứng.

Cuối scope chạy ma trận tổng trong completion-plan với host, hai member, người mới đọc lịch sử, outsider, Guest và Admin không phải member; gồm tranh chỗ cuối, revoke, đổi lịch/notice, hủy/hoàn tất, offline/reconnect/UNKNOWN và unread isolation. BE hỗ trợ sửa server defect qua bàn giao; không tự làm backend ngoài quyền sở hữu.

Cập nhật FE/integration evidence trong từng story/issue/delivery-contract; ghi contract revision đang dùng, checks PASS/FAIL/SKIPPED, screenshot/DB/API evidence và phần còn mở. Chỉ đánh dấu vertical ticket IMPLEMENTED khi đủ BE + FE + tích hợp và checks cần thiết; không nhận ACCEPTED thay chủ dự án. Append ai-progress, giữ BE evidence hiện có.

## Điều kiện hoàn tất và báo cáo

Task FE chỉ hoàn tất khi gap TC-01 được xử lý, TC-02–TC-11 có giao diện/API runtime thực, các AC/tích hợp bắt buộc có evidence và không còn lỗi chặn FE/integration trong scope. Nếu thiếu contract/check/môi trường, nói rõ mốc đang chờ, không tuyên bố hoàn thành toàn feature.

Báo cáo: các màn hình/luồng đã hoàn thiện, API thật đang dùng, ticket/mốc còn chờ, checks và ảnh browser, link evidence/giới hạn. Không commit/push/merge/deploy ứng dụng, thao tác Production/migration/schema/credentials, tạo chat/automation hoặc nhắn sang chat khác.

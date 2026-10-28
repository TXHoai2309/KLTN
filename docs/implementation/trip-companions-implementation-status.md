# Tìm bạn đồng hành — hiện trạng triển khai

Kiểm kê ngày 2026-10-28 theo yêu cầu của chủ dự án, áp dụng grill-with-docs (grilling + domain-modeling). Đối chiếu source hiện tại với Q1–Q17 và [11 ticket đã duyệt](trip-companions-tickets-plan.md); không thay đổi nghiệp vụ, blocking edges hoặc tự bắt đầu ticket mới.

## Phần đang có

**Cập nhật sau kiểm kê — task BE 2026-10-28:** Toàn scope BE mốc 0/TC-02–TC-11
đã có source/contract/tests và **BE READY FOR FE**. Membership/lifecycle, chat,
delta/reconcile, unread và atomic itinerary notices đều có API thật; Development
42 applied / 0 pending / 0 unfinished. FE mốc 0/TC-02–05 đã ghi receipt local
riêng; phần FE tiếp theo đang triển khai, chưa nhận nghiệm thu browser/owner thay.
Xem [delivery contract](trip-companions-delivery-contract.md) và
[verification](trip-companions-backend-verification.md) cho counts, commands,
5 lỗi baseline trong regression rộng và giới hạn. Các mô tả thiếu code bên dưới
là **snapshot kiểm kê trước triển khai**, không phải hiện trạng BE.

| Phạm vi hiện hành | BE | FE / vertical |
| --- | --- | --- |
| TC-01, mốc 0, TC-02–05 | READY, tests/Development evidence | Local receipts recorded separately |
| TC-06–11 | READY, tests/Development evidence | OPEN / FE continuing; no owner ACCEPTED claim |

**TC-01 đã có BE, FE và bằng chứng kiểm thử local**: chủ chuyến mở form từ Trip đã lưu, nhập giới thiệu/số chỗ/ảnh hợp lệ, xem trước rồi xác nhận công khai; người ngoài đọc giới thiệu qua link riêng. Form có recovery SUCCESS/FAILED/UNKNOWN và dùng lại request/key khi chưa xác nhận được kết quả.

- [Service](../../apps/web/src/modules/trip-companions/companion-service.ts) hiện chỉ có lấy context chủ chuyến, preview, publish và đọc giới thiệu công khai.
- [Schema](../../packages/db/prisma/schema/trip.prisma) có `TripCompanionPublication`; chưa có membership, tin nhắn, dấu đã đọc hoặc trạng thái tuyển/hủy.
- [Trang công khai](../../apps/web/src/app/trip-companions/[id]/page.tsx) và form `/trips/[id]/publication` đã có. Chưa có trang danh sách `/trip-companions` hoặc API collection.
- Migration TC-01 đã áp dụng vào Development, xác minh 34 applied / 0 pending / 0 unfinished; xem [bằng chứng rollout](tc01-development-migration.md). Production chưa được rollout trong các task này.
- [Chỉnh sửa Trip gốc](../../apps/web/src/app/trips/trips-view.tsx) đã có trong “Chuyến đi của tôi”. Đây là luồng chỉnh lịch đã lưu, khác với sửa nội dung bài đăng đồng hành.

Đây là trạng thái hiện thực, không thay thế nghiệm thu đầy đủ của chủ dự án hoặc khẳng định toàn bộ tính năng đồng hành đã hoàn thành.

## Các ticket còn thiếu FE/tích hợp hoặc chưa triển khai

Bảng dưới ghi các gap tại **snapshot kiểm kê ban đầu**. Backend của tất cả các
ticket đã được bổ sung sau đó; trạng thái hiện hành là bảng ở trên và delivery
contract. Không coi BE READY FOR FE là vertical ticket IMPLEMENTED.

| Ticket | Phần người dùng còn chưa có | Phụ thuộc đã duyệt |
| --- | --- | --- |
| TC-02 | Mục “Tìm bạn đồng hành” trong điều hướng; danh sách chuyến công khai; Khám phá/Tôi đăng; tìm kiếm, lọc ngày/phương tiện/còn chỗ, phân trang và giữ bộ lọc khi quay lại | TC-01 |
| TC-03 | Nút tham gia ngay, giữ chỗ không vượt sức chứa, membership, không gian nhóm và lịch thành viên, Tôi tham gia; chặn xóa Trip từng có thành viên | TC-02 |
| TC-04 | Tự rời nhóm, thu hồi quyền đọc/gửi, trả chỗ đúng một lần và tham gia lại khi hợp lệ | TC-03 |
| TC-05 | Sửa tiêu đề/giới thiệu/số chỗ; đóng/mở tuyển; gỡ/công khai lại bài; giới hạn không giảm chỗ dưới số đang tham gia | TC-03 |
| TC-06 | Danh sách thành viên theo quyền; chủ chuyến loại/chặn tài khoản và ngăn tham gia lại | TC-03 |
| TC-07 | Chat nhóm bằng văn bản/link, tác giả/thời gian, tải lịch sử; thành viên mới đọc lịch sử cũ | TC-03 |
| TC-08 | Cập nhật tin trong vài giây khi mở nhóm, polling khoảng 3 giây theo kế hoạch, reconnect và đối soát tin chưa xác nhận không mất/trùng | TC-07 |
| TC-09 | Dấu chưa đọc theo từng tài khoản/nhóm, tóm tắt ở Tôi tham gia và cập nhật mốc đã đọc | TC-08 |
| TC-10 | Tích hợp lưu đổi ngày/điểm/giờ với revision và tin hệ thống trong nhóm; không báo đổi từ preview/thất bại | TC-07 |
| TC-11 | Hủy chuyến đồng hành, giữ lịch sử, khóa gửi tin khi hủy; chat tiếp không giới hạn sau hoàn tất bình thường | TC-05, TC-07 |

Các phần này cần cả service/quyền/dữ liệu/API/UI và kiểm chứng tích hợp theo ticket, không phải chỉ thêm nút vào giao diện. Chat AI hiện có không phải chat nhóm giữa người dùng.

## Các thiếu sót đang thấy ở TC-01

1. **Chưa nối lối về quản lý cho chủ chuyến ở trang công khai.** `CompanionIntroductionView` có nhánh `isHost && tripId`, nhưng public page chưa truyền hai giá trị này. Nút “Quay lại quản lý chuyến đi” vì vậy không xuất hiện. Đây là wiring còn thiếu trong trải nghiệm hiện có; không đồng nghĩa đã có chức năng quản lý tuyển TC-05.
2. **Nội dung giao diện mô tả việc tham gia/chat như đã hoạt động.** Các câu “Chuyến đi đang nhận tìm bạn đồng hành”, “Tham gia ngay khi còn chỗ” và nội dung lịch sử nhóm gây hiểu nhầm khi chưa có join/membership/chat. Cần làm copy phản ánh đúng phần đang có trong một lần sửa UI riêng.
3. **Số “chỗ còn” hiện bằng số chỗ chủ chuyến khai.** Source ghi rõ TC-01 chưa có membership. TC-03 phải tính lại theo số tài khoản đang tham gia; hiện chưa ai chiếm chỗ qua ứng dụng được.
4. **Đăng xong chỉ có lối xem bài/quay về Trip.** Chưa có form sửa publication hoặc hành động đóng/gỡ; đó là phần chưa triển khai đúng theo TC-05, không phải lỗi migration.

Chưa sửa source trong lần kiểm kê này. Các phát hiện trên chưa được coi là đã khắc phục.

## Tên gọi và các quyết định giữ nguyên

- **Lịch trình đã lưu** là lịch chính thức của Trip; **bài đăng tìm bạn đồng hành** là lời mời công khai gắn với Trip đó. Chỉ chủ chuyến sửa lịch, thành viên xem lịch đã lưu mới nhất.
- **Đóng tuyển** dừng người mới; **gỡ công khai** ẩn bài và dừng người mới; cả hai giữ nhóm. **Hủy chuyến đồng hành** có thêm hệ quả chat chỉ đọc. Hoàn tất chuyến bình thường không tự khóa chat.
- Không bổ sung vòng duyệt tham gia, cùng sửa lịch, chuyển chủ, đặt nhiều suất thay người khác, DM, ảnh/tệp/voice/call hoặc email/push ngoài web. Những phần này không thuộc mười ticket đang thiếu; công cụ báo cáo Admin vẫn để giai đoạn sau.

Q1–Q17 và đồ thị ticket đã được chủ dự án xác nhận. Lần kiểm kê này không phát sinh quyết định nghiệp vụ mới cần hỏi lại, không tạo ADR mới và không coi câu hỏi về hiện trạng là yêu cầu triển khai.

## Điểm tiếp tục

Theo dependency đã duyệt, ticket chức năng kế tiếp là TC-02, sau đó TC-03. TC-05 giải quyết phần đóng/sửa bài mà chủ dự án vừa hỏi; TC-07 mở phần chat sau khi có membership. Các thiếu sót trải nghiệm của TC-01 ở trên cần được theo dõi rõ khi hoàn thiện giao diện. Không tự đổi thứ tự phụ thuộc hoặc tuyên bố TC-01 đã được chủ dự án nghiệm thu.

## Giới hạn kiểm chứng

Đọc source/API/schema/navigation, các issue, story và evidence hiện có; dùng một sub-agent chỉ đọc để kiểm tra chéo sự tồn tại của code. Không chạy lại tests/typecheck/build, không mở browser, gọi DB/provider, sửa ứng dụng/schema/migration, commit/push/merge hoặc triển khai trong lần kiểm kê tài liệu này. Kết quả test/runtime/migration trước đó giữ nguyên phạm vi trong các báo cáo tương ứng.

## Kế hoạch tiếp theo đã soạn — 2026-10-28

Theo yêu cầu lập kế hoạch triển khai hết phần còn lại và chia đúng hai task, đã có [completion plan](trip-companions-completion-plan.md), [task BE](tasks/trip-companions-backend.md) và [task FE/tích hợp](tasks/trip-companions-frontend.md). Phạm vi gồm gap TC-01 và TC-02–TC-11, giữ nguyên nghiệp vụ/dependency. Đây là bước chuẩn bị bàn giao; trạng thái code trong bản kiểm kê này chưa thay đổi.

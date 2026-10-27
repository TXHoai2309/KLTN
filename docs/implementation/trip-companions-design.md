# Tìm bạn đồng hành — kế hoạch và quyết định thiết kế

Ngày: 2026-10-27. Trạng thái: DRAFT, đang phỏng vấn theo vòng. Chỉ lập kế hoạch; chưa triển khai code, API, schema, migration hay dịch vụ chat.

## Mục tiêu và ranh giới nguồn

Sau khi lập và lưu hành trình, chủ chuyến có thể công khai lời mời tìm người đi cùng. Người khác khám phá chuyến, tham gia khi còn chỗ, xem lịch trình và trò chuyện trong nhóm chuyến.

Đây là đề xuất mở rộng phạm vi hiện hành. [Product contract](../product/product-spec.md) đang loại trip collaboration khỏi MVP và giới hạn Trip vào chủ sở hữu. Các câu trả lời dưới đây ghi nhận yêu cầu cho tính năng mới; chưa tự sửa product baseline hoặc biến story thành READY. Cần xác nhận toàn bộ kế hoạch sau khi giải quyết các nhánh còn mở.

Nguồn đã đối chiếu: [source baselines](../source-baselines.md), [technical architecture](../architecture/technical-architecture.md), [user flow](../flow/user-flow.md), [US-30](../stories/US-30-confirm-save-trip.md), [US-31](../stories/US-31-my-trips-detail.md), [UI baseline](../design/ui-baseline.md), [DESIGN.md](../../DESIGN.md), Trip read/save/schema và giao diện hiện tại.

## Hiện trạng đã kiểm tra trong repository

- Trip có một `userId` sở hữu. Các luồng đọc/sửa/xóa hiện tại kiểm tra chủ sở hữu trên server. Chưa có công khai Trip, thành viên, chỗ trống hay chat giữa người dùng.
- Lưu Trip chính thức yêu cầu ngày khởi hành, Validator và xác nhận ghi thành công. Công khai là thao tác riêng sau bước này; không biến đề xuất chưa lưu thành chuyến chính thức.
- Số người trong nhu cầu lập lịch không được lưu thành sức chứa nhóm; không suy diễn số chỗ từ thông tin đó.
- Trạng thái ngày lịch của chuyến và trạng thái nhận người tham gia là hai khái niệm khác nhau.
- Admin chưa có quyền đọc Trip/chat riêng của người khác theo vai trò. Chat AI hiện tại không phải hạ tầng chat nhóm người dùng.
- UI hiện có dùng nền kem, xanh rừng, Be Vietnam Pro và heading Lora; header chung, mobile drawer, Trip timeline/map và semantic light/dark tokens là điểm kế thừa.

## Vòng 1 — quyết định đã được người dùng trả lời

| Câu | Quyết định |
| --- | --- |
| Q1 | Chỉ chủ chuyến sửa lịch trình. Thành viên được xem lịch và chat. |
| Q2 | Bấm tham gia là vào ngay khi còn chỗ. Không có yêu cầu/chờ duyệt. |
| Q3 | Guest xem danh sách và giới thiệu công khai. Đăng nhập để tham gia; liên hệ và chat dành cho thành viên. |
| Q4 | Một phòng chat nhóm cho mỗi chuyến; chỉ chủ chuyến và thành viên tham gia được nhắn. Không có DM trong bản đầu. |

Q2 là quyết định cụ thể về cách vào nhóm: các từ “xin tham gia/đã duyệt” trong lựa chọn khuyến nghị ở Q3/Q4 không tạo thêm bước duyệt.

## Vòng 2 — quyết định đã được người dùng trả lời

| Câu | Quyết định |
| --- | --- |
| Q5 | Chủ chuyến khai số chỗ tìm thêm, không tính chủ chuyến/nhóm đi cùng sẵn có; mỗi tài khoản tự tham gia chiếm một chỗ. |
| Q6 | Thành viên xem lịch mới nhất chủ chuyến đã lưu thành công. Thay đổi ngày/điểm đến/giờ đi được báo trong nhóm. |
| Q7 | Chỉ nhận người trước ngày khởi hành theo giờ Việt Nam; đủ chỗ, chủ chuyến đóng tuyển hoặc đến ngày đi thì dừng nhận người mới. |
| Q8 | Chat văn bản và link; ảnh/tệp/tin thoại/gọi điện để giai đoạn sau. |
| Q9 | Thành viên mới đọc toàn bộ lịch sử chat; quy tắc được thông báo trước khi tham gia. |
| Q10 | Chủ chuyến có thể loại thành viên và chặn tài khoản đó vào lại; công cụ báo cáo Admin để giai đoạn sau. |

## Cây quyết định còn mở

Các nhánh sau đã có đủ tiền đề để hỏi ở vòng tiếp theo, chưa phải yêu cầu được duyệt:

1. Rời nhóm: thu hồi quyền đọc/nhắn, giữ tin đã gửi, hoàn chỗ và điều kiện tham gia lại.
2. Vòng đời: phân biệt đóng tuyển, gỡ công khai, hủy chuyến và xóa Trip đã có người tham gia.
3. Sau khi chuyến kết thúc: thời hạn chat, chế độ chỉ đọc và lưu lịch sử.
4. Nội dung giới thiệu công khai: danh sách trường được phép hiển thị, thông tin chủ chuyến và phần chỉ thành viên xem.
5. Trải nghiệm nhận tin/thông báo trong web, kỳ vọng độ trễ và phạm vi thông báo ngoài web.
6. Tăng/giảm số chỗ, mở lại sau khi đầy và xử lý sửa ngày khi đã có thành viên.

Không suy đoán câu trả lời để đánh dấu story READY.

## Bố cục đề xuất — đang chờ chốt nghiệp vụ

### 1. Trang Tìm bạn đồng hành

Kế thừa header/navigation hiện tại. Đầu trang có tên tính năng, một câu hướng dẫn và nút “Đăng chuyến đi”. Danh sách chuyến là nội dung chính; các vùng “Tôi đăng” và “Tôi tham gia” giúp quay lại chuyến của mình.

Desktop: thanh tìm kiếm và bộ lọc ngày đi/phương tiện/còn chỗ phía trên; danh sách thẻ ngang với ảnh tuyến đường, tiêu đề, ngày đi, phương tiện, tuyến tóm tắt, chỗ còn và chủ chuyến. Mỗi thẻ dẫn đến phần giới thiệu, không biến toàn bộ thẻ thành thao tác tham gia ngay.

Mobile từ 360px: một cột; bộ lọc mở trong sheet, kết quả đầu tiên xuất hiện sớm. Nội dung chính không cuộn ngang. Hiển thị tổng kết quả đúng theo bộ lọc, không dùng số liệu cộng đồng giả.

### 2. Trang giới thiệu chuyến

Desktop: phần chính khoảng hai phần ba dành cho giới thiệu và tuyến tóm tắt; cột còn lại tóm tắt ngày đi, phương tiện, chỗ còn, chủ chuyến và nút “Tham gia”. Lịch chi tiết và chat mở theo quyền thành viên; danh sách trường công khai sẽ chốt ở vòng tiếp.

Nút chính có các trạng thái đăng nhập/tham gia/đã tham gia/hết chỗ/đóng tuyển. Khi đăng nhập quay về đúng chuyến nhưng không tự thực hiện hành động tham gia. Giải thích rõ trước thao tác rằng người mới được xem lịch sử chat.

Mobile: metadata và trạng thái chỗ nằm trước phần giới thiệu; nút tham gia dễ tìm và không che nội dung hoặc focus. Chủ chuyến có lối vào quản lý công khai/nhóm từ Trip hiện tại.

### 3. Không gian nhóm chuyến

Tiêu đề chuyến và thông tin ngày/phương tiện ở đầu. Ba khu vực “Lịch trình”, “Trò chuyện”, “Thành viên”. Lịch trình tái sử dụng trải nghiệm timeline/map; quyền sửa chỉ hiện cho chủ chuyến.

Desktop khi chat: vùng tin nhắn là phần chính, thông tin chuyến/thành viên ở cột phụ có thể thu gọn. Composer văn bản/link nằm trong vùng chat. Tin hệ thống về thay đổi lịch có kiểu hiển thị riêng với tin người dùng.

Mobile: một vùng làm việc mỗi lần; tab Trò chuyện dành trọn chiều rộng cho tin nhắn và composer. Không chồng thêm một cửa sổ chat nhóm lên chat AI nổi hiện tại.

### 4. Công khai từ Trip đã lưu

Trong chi tiết Trip của chủ sở hữu có thao tác “Tìm bạn đồng hành”. Form ngắn nhập tiêu đề, lời giới thiệu và số chỗ tìm thêm; ngày/phương tiện/tuyến lấy từ Trip. Có bước xem trước phần sẽ công khai. Chỉ hiển thị công khai thành công sau khi server xác nhận ghi dữ liệu.

Đây là đề xuất cấu trúc form, chưa chốt các trường bắt buộc hoặc cho phép tải ảnh mới.

## Căn cứ UI/UX

- Dùng ui-ux-pro-max: các kết quả đúng chủ đề đã đối chiếu gồm phản hồi khi gửi, badge bất đồng bộ có ngữ cảnh, focus nhìn thấy và sticky UI không che focus. Áp dụng vào tham gia, số chỗ, trạng thái gửi tin và điều hướng bàn phím.
- Hai truy vấn design-system trả về bố cục marketing/storytelling không phù hợp màn hình tìm chuyến/chat. Không lưu hoặc áp đặt palette/font/layout đó. Truy vấn Next.js về auth không có kết quả sau một lần thử lại; quyền truy cập lấy từ repository và quyết định sản phẩm, không gán cho dataset.
- Dataset không có kết quả đã xác minh cho chat autoscroll. Quy tắc cuộn chat sẽ được ghi là đề xuất thiết kế chung, không tuyên bố có nguồn dataset.
- Tham khảo design-taste-frontend theo nhánh app screens: direction `editorial-greeting`, seed `1400346441`, giữ palette/type. Cấu trúc rõ nội dung và khung chat nhiều vùng là gợi ý; navigation chung hiện tại và UI baseline của repo có ưu tiên. Không thay header bằng sidebar mới theo sheet.
- Dấu hiệu riêng của sản phẩm: tuyến Hà Giang và ngày khởi hành đi cùng thông tin chỗ còn; mọi tổng chỗ/thành viên phải có tên và cách tính rõ.
- Bản này là wireframe bằng mô tả; chưa kiểm chứng Figma/browser, tương phản hay responsive bằng màn hình đã render.

## Khung triển khai dự kiến sau khi duyệt kế hoạch

1. Chốt yêu cầu mở rộng, quyền đọc công khai/thành viên và thuật ngữ; đối chiếu UI baseline trước khi làm giao diện.
2. Thiết kế dữ liệu và contract cho công khai, suất tham gia, membership và chat; migration Prisma khi triển khai.
3. Làm công khai/khám phá/tham gia theo server authorization và giới hạn chỗ nguyên tử, kể cả hai người tranh chỗ cuối.
4. Làm trang nhóm, cập nhật lịch và chat; chọn cơ chế nhận tin phù hợp deployment sau khi chốt kỳ vọng sản phẩm.
5. Kiểm tra ownership, đọc sai nhóm, leave/kick, tranh chỗ, retry UNKNOWN không trùng, lifecycle, lỗi mạng và desktop/mobile/light-dark.

Chưa tạo story READY hoặc chọn provider/hạ tầng realtime. Mỗi phần sẽ có acceptance criteria sau khi phỏng vấn xong. Đây không phải lệnh bắt đầu triển khai.

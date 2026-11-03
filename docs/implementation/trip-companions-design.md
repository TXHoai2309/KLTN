# Tìm bạn đồng hành — kế hoạch và quyết định thiết kế

Bắt đầu: 2026-10-27. Cập nhật: 2026-10-28. Trạng thái: APPROVED PLAN — người dùng đã xác nhận Q17: “Đồng ý chốt bản kế hoạch, chưa triển khai code”. Chỉ lập kế hoạch; chưa triển khai code, API, schema, migration hay dịch vụ chat.

**Cập nhật thực thi sau phiên planning, 2026-10-28:** Người dùng đã giao riêng BE rồi FE/tích hợp TC-01. Publication/public introduction, form/preview, schema/migration và recovery đã có local; migration Development đã chạy và form/preview được quan sát hoạt động. TC-02–11 chưa bắt đầu; trang công khai còn thiếu wiring nút về quản lý và có copy mô tả join/chat trước khi có chức năng. Xem [kiểm kê hiện trạng](trip-companions-implementation-status.md), [contract/evidence hiện hành](trip-companions-delivery-contract.md) và [story TC-01](../stories/TC-01-publish-public-introduction.md). Các ghi nhận “chưa triển khai” bên dưới mô tả thời điểm phiên planning, không thay thế evidence thực thi này hoặc nghiệm thu đầy đủ của chủ dự án.

## Mục tiêu và ranh giới nguồn

Sau khi lập và lưu hành trình, chủ chuyến có thể công khai lời mời tìm người đi cùng. Người khác khám phá chuyến, tham gia khi còn chỗ, xem lịch trình và trò chuyện trong nhóm chuyến.

Đây là phần mở rộng đã được người dùng duyệt ở mức yêu cầu/kế hoạch. [Product contract](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28) ghi nhận ngoại lệ có phạm vi cho giới thiệu công khai, quyền đọc của thành viên và chat nhóm; [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28) giữ một chủ sở hữu và một lịch chính thức. Shared ownership/collaborative editing vẫn ngoài phạm vi. Kế hoạch được duyệt không đồng nghĩa tính năng đã triển khai hoặc các story đã READY.

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

## Vòng 3 — quyết định đã được người dùng trả lời

| Câu | Quyết định |
| --- | --- |
| Q11 | Đã đồng ý: thành viên tự rời thì mất quyền đọc lịch chi tiết/chat ngay; giữ tin đã gửi, trả chỗ. Tự rời có thể tham gia lại nếu còn mở/còn chỗ; bị chặn thì không. |
| Q12 | Đã đồng ý: đóng tuyển giữ nhóm; gỡ công khai ẩn bài và dừng nhận người nhưng giữ nhóm; hủy chuyến báo nhóm và chat chỉ đọc. Chuyến từng có người tham gia dùng hủy/ẩn thay cho xóa vĩnh viễn. |
| Q13 | Người dùng chọn tiếp tục chat không giới hạn sau chuyến. Không có mốc tự chuyển chỉ đọc sau 7 ngày; hủy chuyến theo Q12 vẫn khóa chat. |
| Q14 | Đã đồng ý: công khai tiêu đề, ảnh điểm đến sẵn có, tên/ảnh đại diện host, ngày đi, phương tiện, tuyến tóm tắt, chỗ còn và giới thiệu. Lịch từng giờ/điểm hẹn/thành viên/chat dành cho nhóm. |
| Q15 | Đã đồng ý: nhận tin trong vài giây khi mở nhóm; dấu chưa đọc và thông báo đổi lịch trong web; chưa có email/push sau khi đóng web. |
| Q16 | Đã đồng ý: tăng/giảm số chỗ nhưng không dưới số tài khoản đang tham gia. Đổi ngày/điểm/giờ thông báo và cho rời nhóm, không cần toàn nhóm xác nhận lại. |

## Xác nhận kế hoạch

Q1–Q16 đã được trả lời. Ngày 2026-10-28, người dùng xác nhận Q17: “Đồng ý chốt bản kế hoạch, chưa triển khai code”. Xác nhận bao gồm bố cục ba màn hình, các mặc định tương tác/kỹ thuật được ghi trong bản kế hoạch và polling khoảng 3 giây khi mở nhóm. Không còn câu hỏi nghiệp vụ hoặc xác nhận planning đang chờ. Chưa có yêu cầu bắt đầu viết code.

Figma/browser chưa được đối chiếu trực tiếp cho các màn hình mới; kiểm chứng UI và chốt chi tiết dữ liệu/API là công việc của story triển khai, không phải chứng cứ đã có trong bản kế hoạch này.

## Ma trận quyền và nội dung

| Nội dung / thao tác | Guest | Đăng nhập, chưa tham gia | Thành viên đang tham gia | Chủ chuyến |
| --- | --- | --- | --- | --- |
| Danh sách/giới thiệu đang công khai | Có | Có | Có | Có |
| Tên/avatar host, ngày đi, phương tiện, tuyến tóm tắt, chỗ còn | Có | Có | Có | Có |
| Tham gia nếu còn tuyển/còn chỗ | Đăng nhập rồi bấm lại | Có | Không chiếm thêm chỗ | Không chiếm chỗ |
| Lịch từng giờ, thông tin hẹn và danh sách thành viên | Không | Không | Có | Có |
| Toàn bộ lịch sử chat | Không | Không | Có | Có |
| Nhắn văn bản/link | Không | Không | Có, trừ nhóm đã hủy | Có, trừ nhóm đã hủy |
| Sửa/lưu lịch trình, cấu hình bài, số chỗ | Không | Không | Không | Có, theo quy tắc Trip hiện tại |
| Đóng tuyển/gỡ công khai/hủy/loại và chặn thành viên | Không | Không | Không | Có |
| Tự rời nhóm | Không | Không | Có | Dùng gỡ công khai/hủy |

Tên/avatar là dữ liệu công khai được trình bày rõ trong bước xem trước. Thông tin hẹn/liên hệ được chủ chuyến và thành viên tự trao đổi trong nhóm; tính năng này không tự lấy email/số điện thoại từ hồ sơ để hiển thị. Người đã rời/bị loại mất quyền nhóm, chỉ còn quyền xem giới thiệu như người ngoài nếu bài vẫn đang công khai.

## Bố cục đã chốt ở mức kế hoạch

Phân tích UI/UX bổ sung theo yêu cầu ngày 2026-10-28 nằm tại [trip-companions-ui-ux-analysis.md](../design/trip-companions-ui-ux-analysis.md). Báo cáo làm rõ thứ tự thông tin, trạng thái thao tác và các điểm cần kiểm chứng trước implementation; các khuyến nghị tinh chỉnh không tự đổi quyết định Q1–Q17.

### 1. Trang Tìm bạn đồng hành

Kế thừa header/navigation hiện tại. Đầu trang có tên tính năng, một câu hướng dẫn và nút “Đăng chuyến đi”. Danh sách chuyến là nội dung chính; các vùng “Tôi đăng” và “Tôi tham gia” giúp quay lại chuyến của mình.

Desktop: thanh tìm kiếm và bộ lọc ngày đi/phương tiện/còn chỗ phía trên; danh sách thẻ ngang với ảnh tuyến đường, tiêu đề, ngày đi, phương tiện, tuyến tóm tắt, chỗ còn và chủ chuyến. Mỗi thẻ dẫn đến phần giới thiệu, không biến toàn bộ thẻ thành thao tác tham gia ngay. Mặc định đề xuất sắp theo ngày khởi hành gần nhất; danh sách công khai chỉ lấy chuyến sắp đi còn công khai, có thể hiển thị hết chỗ/đã đóng tuyển bằng nhãn rõ và cho lọc còn chỗ.

Mobile từ 360px: một cột; bộ lọc mở trong sheet, kết quả đầu tiên xuất hiện sớm. Nội dung chính không cuộn ngang. Hiển thị tổng kết quả đúng theo bộ lọc, không dùng số liệu cộng đồng giả.

### 2. Trang giới thiệu chuyến

Desktop: phần chính khoảng hai phần ba dành cho giới thiệu và tuyến tóm tắt; cột còn lại tóm tắt ngày đi, phương tiện, chỗ còn, chủ chuyến và nút “Tham gia”. Lịch chi tiết và chat mở theo ma trận quyền; không dựng timeline từng giờ trong phần xem công khai.

Nút chính có các trạng thái đăng nhập/tham gia/đã tham gia/hết chỗ/đóng tuyển. Khi đăng nhập quay về đúng chuyến nhưng không tự thực hiện hành động tham gia. Giải thích rõ trước thao tác rằng người mới được xem lịch sử chat.

Mobile: metadata và trạng thái chỗ nằm trước phần giới thiệu; nút tham gia dễ tìm và không che nội dung hoặc focus. Chủ chuyến có lối vào quản lý công khai/nhóm từ Trip hiện tại.

### 3. Không gian nhóm chuyến

Tiêu đề chuyến và thông tin ngày/phương tiện ở đầu. Ba khu vực “Lịch trình”, “Trò chuyện”, “Thành viên”. Lịch trình tái sử dụng trải nghiệm timeline/map; quyền sửa chỉ hiện cho chủ chuyến.

Desktop khi chat: vùng tin nhắn là phần chính, thông tin chuyến/thành viên ở cột phụ có thể thu gọn. Composer văn bản/link nằm trong vùng chat. Tin hệ thống về thay đổi lịch có kiểu hiển thị riêng với tin người dùng.

Mobile: một vùng làm việc mỗi lần; tab Trò chuyện dành trọn chiều rộng cho tin nhắn và composer. Không chồng thêm một cửa sổ chat nhóm lên chat AI nổi hiện tại.

### 4. Công khai từ Trip đã lưu

Trong chi tiết Trip của chủ sở hữu có thao tác “Tìm bạn đồng hành”. Form ngắn nhập tiêu đề, lời giới thiệu và số chỗ tìm thêm; ngày/phương tiện/tuyến lấy từ Trip. Có bước xem trước phần sẽ công khai. Chỉ hiển thị công khai thành công sau khi server xác nhận ghi dữ liệu.

Đề xuất form: tiêu đề, lời giới thiệu và số chỗ tìm thêm là các trường nhập có nhãn; ảnh chọn từ điểm đến hiện có đủ điều kiện hiển thị, có fallback khi không có ảnh. Ngày/phương tiện/tuyến lấy từ Trip đã lưu, không nhập lần thứ hai. Chưa có tải ảnh bài đăng riêng trong bản đầu. Số chỗ là số nguyên dương, không được giảm dưới số tài khoản đang tham gia.

### Sơ đồ bố cục desktop

```text
TÌM BẠN ĐỒNG HÀNH                          [Đăng chuyến đi]
[Khám phá chuyến] [Tôi đăng] [Tôi tham gia]
[Tìm theo tên / tuyến] [Ngày đi] [Phương tiện] [Còn chỗ]
---------------------------------------------------------
[Ảnh tuyến] Tiêu đề chuyến                    [Xem chuyến]
            Ngày đi · Phương tiện · Chỗ còn
            Tuyến tóm tắt · Chủ chuyến
---------------------------------------------------------
... Danh sách kết quả thực ...                 [Tải thêm]
```

```text
GIỚI THIỆU CHUYẾN
---------------------------------------------------------
Tên chuyến · Tuyến tóm tắt        Ngày đi / Phương tiện
Ảnh điểm đến hiện có             Số chỗ còn / Trạng thái
Lời giới thiệu                   Chủ chuyến
Thông tin công khai              [Tham gia chuyến]
                                 Quy tắc lịch sử chat
---------------------------------------------------------
```

```text
NHÓM CHUYẾN · tên chuyến · ngày đi            [Quản lý / Rời]
[Lịch trình] [Trò chuyện] [Thành viên]
---------------------------------------------------------
TRÒ CHUYỆN                           THÔNG TIN CHUYẾN
Tin hệ thống về lịch vừa đổi          Ngày / Phương tiện
Tin nhắn của thành viên               Lối về lịch mới nhất
...                                  Thành viên
[Soạn tin nhắn........................] [Gửi]
---------------------------------------------------------
```

Đây là sơ đồ nội dung, không phải giao diện đã render. Mobile giữ một cột/vùng làm việc, có lối chuyển khu vực rõ ràng; tablet chỉ giữ hai cột nếu vùng chat và thông tin còn đủ đọc.

## Ràng buộc triển khai đã suy ra từ quyết định được chốt

- Giữ các endpoint private Trip hiện tại theo chủ sở hữu. Thiết kế riêng phần đọc giới thiệu công khai và phần đọc lịch cho thành viên, với danh sách trường cho phép rõ ràng. Biết ID không cấp quyền.
- Host lấy từ chủ sở hữu Trip; Admin dùng tính năng bằng tư cách chủ chuyến/thành viên của chính tài khoản, không có đặc quyền xem nhóm người khác. Tài khoản bị khóa không tiếp tục dùng chức năng riêng tư.
- Một Trip có một nhóm và một lời mời tìm người; đăng/gỡ/đăng lại không tạo các nhóm trùng nhau. Không chuyển quyền chủ chuyến trong bản đầu.
- Nhóm đi cùng sẵn có không tự trở thành tài khoản thành viên. Bản đầu cấp quyền nhóm cho chủ chuyến và tài khoản thực sự tham gia; số chỗ tìm thêm không phải tổng số người ngoài đời.
- Còn chỗ = số chỗ tìm thêm trừ số tài khoản thành viên đang tham gia, không tính host, tài khoản đã rời hoặc bị loại. Số người có quyền chat hiển thị bằng nhãn riêng, có tính host; hai số không được dùng thay nhau.
- Việc vào nhóm phải kiểm tra đồng thời đăng nhập, tư cách tài khoản, không bị chặn, bài còn công khai, còn tuyển, chưa đến ngày đi, chuyến chưa hoàn tất/hủy và còn chỗ tại thời điểm ghi transaction. Hai người tranh chỗ cuối chỉ một người thành công. Tham gia lặp/retry không chiếm hai chỗ.
- Đầy chỗ là trạng thái suy ra từ số thành viên, không tự ghi thành thao tác đóng tuyển của host. Có người rời thì chỗ mở lại chỉ khi host chưa đóng tuyển, bài còn công khai và còn trong thời hạn.
- Tự rời thu hồi quyền ở lần đọc/ghi tiếp theo trên server. Tin đã trả về hoặc đã được người khác lưu ngoài hệ thống không thể bị thu hồi từ xa; UI phải xóa vùng dữ liệu nhóm khi nhận trạng thái mất quyền.
- Loại/chặn là thao tác chủ chuyến trên thành viên khác; không cho người bị chặn tự tạo lại membership để quay vào. Host không tự rời chuyến; dùng gỡ công khai/hủy khi muốn ngừng tổ chức.
- Đóng tuyển/gỡ công khai không giải tán nhóm. Hủy chuyến đồng hành là trạng thái của phần đồng hành, không giả lập bằng cờ hoàn tất thủ công của Trip.
- Hoàn tất chuyến không khóa chat hoặc tự xóa lịch sử; chủ chuyến và thành viên còn trong nhóm tiếp tục chat không giới hạn. Trạng thái hủy ở Q12 vẫn ưu tiên hơn trạng thái hoàn tất.
- Gỡ công khai/đóng tuyển có thể mở lại trước ngày đi khi đáp ứng điều kiện. Hủy là trạng thái kết thúc cho nhóm đồng hành hiện tại; không có khôi phục hoặc chuyển nhóm sang Trip khác trong bản đầu. Người dùng muốn tổ chức chuyến khác tạo/lưu Trip mới theo luồng hiện có.
- Sau hủy, thành viên còn trong nhóm giữ quyền đọc và Q6 vẫn áp dụng cho lịch đã lưu; chat chỉ đọc đối với tin người dùng, các sự kiện hệ thống vẫn có thể phản ánh thay đổi của Trip. Host cần thu hồi quyền một tài khoản bằng thao tác loại/chặn. Không phát sinh bản lịch độc lập mà host tưởng là đã tách khỏi nhóm.
- Chỉnh lịch/số chỗ vẫn theo quyền và Validator hiện có. Bản đầu không bắt người khác duyệt sửa lịch, không cho chỉnh các lượt ghé đã hoàn thành vượt qua quy tắc Trip hiện tại và không tự đăng ký lại người đã rời.
- Quy tắc cấm xóa Trip từng có người tham gia phải được thêm tại service xóa hiện hữu, không chỉ ẩn nút. Trip chưa từng có thành viên và chưa có dữ liệu nhóm cần giữ vẫn dùng luồng xóa owner-scoped hiện tại.
- Lịch lưu thành công, revision của nhóm và tin hệ thống báo thay đổi phải nhất quán trong cùng transaction. AI/preview chưa lưu không được làm đổi lịch hoặc tạo tin thông báo đã đổi lịch.
- Nội dung public không tự công khai nhu cầu cá nhân, lịch sử AI, email/số điện thoại hay trường quản trị. Điểm đến/ảnh đã ẩn không được lộ qua dữ liệu tự động dựng cho bài công khai.
- Các write dùng SUCCESS/FAILED/UNKNOWN và idempotency. Tham gia/gửi tin UNKNOWN giữ đúng payload/key khi đối soát; không đổi key để thử cho đến khi vô tình tạo trùng.
- Chưa thiết kế chuyển chủ chuyến, đặt nhiều suất thay người khác, mời riêng không chiếm chỗ, DM, sửa lịch cộng tác, chat ảnh/tệp/voice/call hoặc CMS báo cáo.

## Căn cứ UI/UX

- Dùng ui-ux-pro-max: các kết quả đúng chủ đề đã đối chiếu gồm phản hồi khi gửi, badge bất đồng bộ có ngữ cảnh, focus nhìn thấy và sticky UI không che focus. Áp dụng vào tham gia, số chỗ, trạng thái gửi tin và điều hướng bàn phím.
- Hai truy vấn design-system trả về bố cục marketing/storytelling không phù hợp màn hình tìm chuyến/chat. Không lưu hoặc áp đặt palette/font/layout đó. Truy vấn Next.js về auth không có kết quả sau một lần thử lại; quyền truy cập lấy từ repository và quyết định sản phẩm, không gán cho dataset.
- Dataset không có kết quả đã xác minh cho chat autoscroll. Quy tắc cuộn chat sẽ được ghi là đề xuất thiết kế chung, không tuyên bố có nguồn dataset.
- Tham khảo design-taste-frontend theo nhánh app screens: direction `editorial-greeting`, seed `1400346441`, giữ palette/type. Cấu trúc rõ nội dung và khung chat nhiều vùng là gợi ý; navigation chung hiện tại và UI baseline của repo có ưu tiên. Không thay header bằng sidebar mới theo sheet.
- Dấu hiệu riêng của sản phẩm: tuyến Hà Giang và ngày khởi hành đi cùng thông tin chỗ còn; mọi tổng chỗ/thành viên phải có tên và cách tính rõ.
- Bản này là wireframe bằng mô tả; chưa kiểm chứng Figma/browser, tương phản hay responsive bằng màn hình đã render.

## Chi tiết tương tác đã chốt ở mức kế hoạch

- Mỗi màn hình ưu tiên một việc: tìm chuyến phù hợp, quyết định tham gia, hoặc trao đổi với nhóm. Tên tính năng trong navigation là “Tìm bạn đồng hành”; quay lại nhóm qua “Tôi tham gia”. Không cần một inbox DM riêng.
- Kế thừa semantic tokens light/dark hiện tại. Tham chiếu Trip runtime: nền `#f8f7f3`, surface trắng, ink `#14221a`, action xanh `#174a35`; body Be Vietnam Pro, heading Lora. Các giá trị dark lấy từ token hiện có, không đảo màu cơ học.
- Đề xuất danh sách tối đa khoảng 1240px, chi tiết/nhóm tối đa khoảng 1400px theo Trip hiện tại; spacing theo nhịp 4/8px; controls tối thiểu 44px. Ở mobile, gutter khoảng 16px, body khoảng 16px, metadata không dưới 12px. Các thông số này là hướng thiết kế cần kiểm chứng trên màn hình thực.
- Một nút chính trong từng ngữ cảnh. Nút Tham gia ghi trực tiếp vào nhóm theo Q2; thông tin quyền đọc lịch sử nằm ngay cạnh nút, không thêm bước chờ duyệt. Nút bị vô hiệu hóa phải nêu lý do như “Hết chỗ” hoặc “Đã khởi hành”.
- Tin nhắn hiển thị tác giả, thời gian và trạng thái gửi. Tin mới đang chờ ghi có nhãn “Đang gửi”; mất xác nhận là “Chưa xác nhận”, có lối đối soát. Không gọi tin đó là “Đã gửi” trước khi DB xác nhận.
- Đề xuất cuộn chat chung: đang ở cuối thì theo tin mới; đang đọc tin cũ thì giữ vị trí và hiện nút “Có tin nhắn mới”. Tải tin cũ không làm nhảy vị trí. Đây là hướng thiết kế chung, không phải kết quả đã xác minh từ dataset.
- Tin hệ thống đổi lịch chứa nội dung thay đổi và lối mở lịch mới nhất. Tin này chỉ được tạo từ lịch đã lưu thành công; người dùng có thể xem rồi chọn rời nhóm.
- Loading giữ khung trang; không có chuyến thì hướng dẫn đổi bộ lọc hoặc đăng chuyến. Không có tin thì mời bắt đầu trò chuyện. Lỗi map không che lịch; lỗi chat không che thông tin chuyến; lỗi nhận người giữ trạng thái chỗ mới nhất và cho làm lại theo kết quả server.
- Labels, thứ tự focus, focus-visible, trạng thái có chữ và live status có ngữ cảnh là tiêu chí kiểm tra. Không dùng màu đơn lẻ để báo hết chỗ/lỗi/chưa đọc; menu/composer/sticky action và launcher AI không được che điều khiển đang focus.
- Nội dung tin là văn bản đã escape; link chỉ nhận giao thức phù hợp, không render HTML tùy ý. Bản đầu không có sửa/xóa tin, phản ứng emoji, quote/reply/thread hay trạng thái đang nhập/đã xem. “Chưa đọc” của bản đầu là dấu mốc đọc của chính tài khoản, không phải công bố ai đã đọc tin của ai.
- Các mặc định tương tác trên đã được duyệt cùng bản kế hoạch ở Q17, chưa phải giao diện đã triển khai hoặc được kiểm chứng bằng browser.

## Dữ liệu và module đề xuất

Đây là mô hình khái niệm để chia story, chưa phải Prisma schema hoặc API đã tồn tại:

| Thành phần | Trách nhiệm |
| --- | --- |
| Công khai đồng hành, gắn duy nhất một Trip | Tiêu đề/giới thiệu, số chỗ tìm thêm, trạng thái công khai, đóng tuyển chủ động, hủy và mốc lịch thay đổi. Host xuất phát từ Trip owner. |
| Thành viên chuyến | Quan hệ tài khoản với nhóm, đang tham gia/đã rời/bị chặn, các mốc tham gia/rời; giữ dấu đã từng có thành viên để bảo toàn lịch sử. |
| Tin nhắn nhóm | Tin người dùng hoặc tin hệ thống; tác giả, thời gian, thứ tự ổn định, nội dung và định danh phục vụ chống gửi trùng. |
| Dấu mốc đã đọc | Theo tài khoản/nhóm, gồm cả host, phục vụ số chưa đọc mà không công khai read receipts. |

Route Handlers chỉ parse/auth/call service/map kết quả. Module đồng hành sở hữu quyền đọc công khai/thành viên, giữ chỗ, lifecycle và membership; module chat sở hữu gửi/đọc/đối soát tin dưới quyền thành viên hiện hành. Luồng Trip edit/delete hiện có cần gọi đúng quy tắc tích hợp, không tạo đường vòng vượt ownership hoặc Validator.

### Cơ chế nhận tin đề xuất cho bản đầu

Theo Q15, dùng polling tăng dần theo cursor khoảng 3 giây khi đang mở nhóm, làm mới ngay khi quay lại. Dừng polling nhóm khi trang bị ẩn; chỉ theo dõi nhóm đang mở, không chạy một vòng lặp cho mọi nhóm đã tham gia. Chỉ báo chưa đọc tổng hợp trong website có nhịp cập nhật chậm hơn, đề xuất khoảng 15 giây khi website đang hiện.

Đây là lựa chọn kỹ thuật đề xuất phù hợp kỳ vọng “trong vài giây”, cần đo khi triển khai; không phải SLA đã được kiểm chứng. Trang đang ẩn không được hứa nhận tin đúng nhịp timer. [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) mô tả trạng thái hiển thị và việc browser hạn chế timers ở background.

Tin đã ghi vào PostgreSQL là nguồn chính; polling chỉ đọc phần mới sau cursor. Lịch sử phân trang từ mới tới cũ, giữ vị trí khi tải thêm. Thứ tự/cursor phải không làm mất tin khi hai giao dịch ghi đồng thời; reconnect và retry đối soát bằng cùng định danh tin, không tạo trùng.

Không cần chọn nhà cung cấp chat ngoài ở giai đoạn đầu. Việc này dựa trên phạm vi Q15, không dựa vào giả định Vercel cấm WebSocket: Vercel đã công bố WebSocket trên Functions [generally available ngày 2026-10-20](https://vercel.com/changelog/websocket-support-is-now-generally-available). Nếu sau này chuyển sang push, vẫn giữ DB, membership và write contract làm nguồn thẩm quyền.

### Quyết định ownership đã ghi ADR

Giữ một chủ sở hữu và một lịch Trip chính thức; quan hệ tham gia chỉ cấp quyền đọc lịch/trò chuyện theo nhóm. Phần giới thiệu công khai dùng projection giới hạn trường. Cùng sửa lịch và bản lịch nhóm độc lập là hai phương án không chọn theo Q1/Q6. Quyết định này tránh tạo thêm quyền sửa hoặc hai bản lịch khác nhau, nhưng yêu cầu tích hợp ghi lịch với revision/tin hệ thống và kiểm soát việc xóa/thu hồi quyền ở service. Ranh giới này có chi phí thay đổi đáng kể và đã được ghi tại [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28) sau xác nhận Q17.

## Tiêu chí nghiệm thu đề xuất

| Kịch bản | Kết quả cần chứng minh khi triển khai |
| --- | --- |
| Công khai | Chỉ host của Trip đã lưu được công khai; hiển thị đúng phần xem trước và không sinh hai bài/nhóm cho một Trip. |
| Xem công khai | Guest/người ngoài chỉ nhận allowlist; không lộ lịch từng giờ, điểm hẹn, email, chat, nhu cầu AI hay nội dung/ảnh điểm đến đã ẩn. |
| Quyền nhóm | Thành viên đọc lịch/chat đúng nhóm; ID nhóm khác, quyền Admin đơn thuần và tài khoản khóa không vượt qua kiểm tra server. Thành viên không sửa lịch. |
| Tranh chỗ cuối | Hai tài khoản bấm cùng lúc chỉ một người có chỗ; double-click hoặc retry cùng thao tác không chiếm thêm chỗ. |
| Hết hạn tuyển | Server kiểm tra ngày Việt Nam, đóng tuyển/gỡ công khai/hủy/hoàn tất trước khi ghi; UI cũ không giúp vượt điều kiện. |
| Rời/loại/chặn | Quyền nhóm bị thu hồi, tin cũ còn cho nhóm, số chỗ đúng; tự rời có thể vào lại khi đủ điều kiện, bị chặn không thể vào lại. |
| Sửa lịch | Lịch chính thức mới và tin hệ thống nhất quán; preview/thất bại/hủy chỉnh không tạo thông báo lịch đã đổi. Người khác có quyền rời. |
| Lifecycle | Đóng tuyển/gỡ bài giữ nhóm; hủy khóa gửi tin người dùng; hoàn tất vẫn chat được. Xóa Trip từng có thành viên bị chặn tại service. |
| Lịch sử | Thành viên mới thấy tin cũ; lịch sử dài tải thêm giữ vị trí; dấu chưa đọc của từng tài khoản chính xác. |
| Mất phản hồi | SUCCESS chỉ sau DB xác nhận; UNKNOWN tham gia/gửi tin đối soát cùng payload/key, không trùng và không báo thành công giả. |
| Đồng bộ tin | Poll/reconnect hai người dùng thấy tin đã commit đúng thứ tự, không mất/trùng tin; mất quyền không tiếp tục đọc/gửi. Độ trễ được đo theo điều kiện thử đã ghi. |
| Lỗi từng phần | Lỗi chat/map không làm mất thông tin lịch hợp lệ; input còn khi có thể phục hồi, retry đúng thao tác. |
| UI | 360/390/768/1024/1440px, light/dark, bàn phím và reduced motion; không tràn ngang, focus không bị che, nội dung tiếng Việt/URL dài đọc được. |

Chưa chạy các kiểm tra sản phẩm này vì chưa có implementation của tính năng.

## Khung triển khai cho yêu cầu code sau này

Đã soạn và được người dùng duyệt nguyên [bộ 11 ticket và prompt BE/FE](trip-companions-tickets-plan.md), gồm độ nhỏ và mọi blocking edge. Ngày 2026-10-28 đã xuất bản file local trong issues/ với nhãn ready-for-agent theo skill to-tickets. Chưa có implementation; chỉ bắt đầu ticket được giao bằng yêu cầu code riêng.

1. **Hợp đồng yêu cầu và UI:** Dùng bản kế hoạch đã duyệt, ngoại lệ sản phẩm và ADR ownership làm nguồn; đối chiếu Figma/UI baseline, tách các story có scope/acceptance rõ.
2. **Nền dữ liệu và quyền:** Thiết kế dữ liệu/index/unique/FK và migration Prisma; projection public/member; tích hợp guard xóa và lifecycle. Có kiểm tra service/DB cho cô lập dữ liệu và tranh chỗ.
3. **Công khai và tìm chuyến:** Form từ Trip đã lưu, xem trước, publish/update/close/withdraw/cancel; trang khám phá/giới thiệu và bộ lọc.
4. **Tham gia và không gian nhóm:** Join/leave/remove/ban, capacity và số thành viên đúng; tab lịch/thành viên, đồng bộ revision/lịch và thông báo hệ thống.
5. **Chat và kiểm chứng:** Văn bản/link, polling/cursor/history/read marker, UNKNOWN/reconnect; full regression cho Trip đang có và kiểm tra tích hợp/browser theo bảng nghiệm thu.

Chưa tạo story READY, cài thư viện, chọn provider chat ngoài hoặc bắt đầu triển khai. Các pha là đề xuất chia việc để thực hiện khi có yêu cầu code riêng.

## Kiểm tra của phiên planning

Đã kiểm tra source/docs, đối chiếu quyết định Q1–Q17 và chạy `git diff --check`. Chưa chạy typecheck/build/test ứng dụng, migration hoặc browser acceptance vì chỉ thay tài liệu. Không sửa code/schema, không đọc/ghi dữ liệu tài khoản/chuyến thực, không commit/push/merge/deploy trong phiên này. Các thay đổi có sẵn trong workspace được giữ nguyên.

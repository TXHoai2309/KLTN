# Tìm bạn đồng hành — User Story và task

Ngày tổng hợp: 28/10/2026. Phạm vi: chức năng Tìm bạn đồng hành đã được chủ dự án duyệt và triển khai trong phiên làm việc này.

Tài liệu diễn đạt lại **11 ticket thành 11 User Story, chia thành 55 task: 22 BE, 22 FE và 11 kiểm thử/tích hợp**. Mã `US-TC-01` đến `US-TC-11` dùng để trình bày, ánh xạ một-một tới ticket `TC-01` đến `TC-11` hiện có; không tạo backlog mới hoặc đổi mã các US khác của dự án. Các task mô tả công việc của chức năng đã làm, không phải 55 đầu việc mới chưa triển khai.

## Epic — Công khai hành trình, tìm bạn đồng hành và trò chuyện nhóm

Sau khi lưu hành trình chính thức, chủ chuyến có thể đăng lời mời tìm người đi cùng. Người khác khám phá chuyến công khai, tham gia ngay khi đủ điều kiện, xem lịch trình và trao đổi trong nhóm của chuyến đó. Chủ chuyến quản lý bài đăng, số chỗ, thành viên và trạng thái chuyến.

**Vai trò:** Khách chưa đăng nhập, người dùng đã đăng nhập, chủ chuyến và thành viên. Admin sử dụng chức năng như người dùng thông thường; vai trò Admin không tự cấp quyền xem nhóm riêng hoặc sửa chuyến của người khác.

**Màn hình:** Tìm bạn đồng hành với các mục Khám phá / Tôi đăng / Tôi tham gia; Giới thiệu chuyến; Công khai hoặc quản lý bài đăng; Nhóm chuyến với lịch trình, thành viên và trò chuyện. Luồng chỉnh lịch chính thức tiếp tục dùng màn hình Trip hiện có.

## Quy tắc áp dụng chung

- Mỗi Trip có một chủ sở hữu và một bài đăng/nhóm ổn định. Chỉ chủ chuyến sửa lịch trình chính thức; thành viên xem lịch đã lưu mới nhất.
- Khách xem danh sách và phần giới thiệu công khai. Lịch từng giờ, thông tin hẹn, danh sách thành viên và chat chỉ dành cho người có quyền trong nhóm.
- Tham gia ngay, không có bước duyệt. Mỗi tài khoản chiếm một chỗ tìm thêm; chủ chuyến và nhóm đi cùng sẵn có không tính vào số chỗ này.
- Chỉ nhận người trước ngày khởi hành theo giờ Việt Nam, khi bài còn công khai, còn tuyển, còn chỗ, chưa hủy/hoàn tất và tài khoản hợp lệ, không bị chặn.
- Đóng tuyển, gỡ công khai và hủy chuyến là ba thao tác riêng. Hoàn tất bình thường vẫn được chat không giới hạn; hủy chuyến chuyển chat sang chỉ đọc.
- Các thao tác ghi dùng `SUCCESS` / `FAILED` / `UNKNOWN`. Chỉ báo thành công sau xác nhận từ DB; khi `UNKNOWN`, giữ nguyên đối tượng, dữ liệu và idempotency key để đối soát/thử lại.
- Chat nhóm hỗ trợ văn bản và liên kết. Thành viên mới được xem toàn bộ lịch sử; quy tắc này được thông báo trước khi tham gia.

## US-TC-01 — Công khai hành trình và xem giới thiệu chuyến

**User Story:** Là chủ chuyến, tôi muốn công khai lời mời từ hành trình đã lưu để tìm thêm người đi cùng và cho họ xem trước thông tin chuyến đi.

**Phụ thuộc:** Luồng lưu và đọc Trip hiện có. Ticket tương ứng: [TC-01](../stories/TC-01-publish-public-introduction.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC01-BE01 | BE | Mô hình hóa bài đăng duy nhất theo Trip; kiểm tra chủ sở hữu, tài khoản hợp lệ và ngày khởi hành theo giờ Việt Nam. |
| TC01-BE02 | BE | Xây dựng API đọc cấu hình, xem trước, công khai và đọc giới thiệu; chỉ trả trường được phép công khai, hỗ trợ chống ghi trùng và recovery. |
| TC01-FE01 | FE | Thêm lối “Tìm bạn đồng hành” từ Trip; form tiêu đề, giới thiệu, ảnh điểm đến hợp lệ và số chỗ tìm thêm; giữ dữ liệu khi lỗi. |
| TC01-FE02 | FE | Xây dựng xem trước và trang giới thiệu công khai; hiển thị chủ chuyến, ngày, phương tiện, tuyến tóm tắt, chỗ còn và trạng thái lưu/thử lại. |
| TC01-QA01 | Kiểm thử | Kiểm tra quyền owner/Guest/outsider, dữ liệu riêng không bị lộ, preview khớp bài đăng và bấm/gửi lại không tạo hai publication. |

**Tiêu chí nghiệm thu:** Chỉ chủ chuyến công khai được Trip hợp lệ đã lưu. Khách xem được phần giới thiệu theo phạm vi cho phép. Một Trip không phát sinh nhiều publication khi thao tác lặp hoặc mất phản hồi.

## US-TC-02 — Khám phá, tìm kiếm và lọc chuyến công khai

**User Story:** Là người đang tìm bạn đi cùng, tôi muốn tìm và lọc những chuyến công khai phù hợp để chọn hành trình có thời gian, phương tiện và số chỗ phù hợp với mình.

**Phụ thuộc:** TC-01. Ticket tương ứng: [TC-02](../stories/TC-02-discover-filter-trips.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC02-BE01 | BE | Xây dựng API danh sách chuyến công khai với tìm kiếm, khoảng ngày khởi hành, phương tiện, còn chỗ và phân trang ổn định. |
| TC02-BE02 | BE | Xây dựng danh sách “Tôi đăng” theo tài khoản; loại bài không đủ điều kiện khỏi khám phá và bàn giao DTO/fixture cho FE. |
| TC02-FE01 | FE | Thêm mục điều hướng “Tìm bạn đồng hành”, trang danh sách, thẻ chuyến và hai mục Khám phá / Tôi đăng. |
| TC02-FE02 | FE | Tích hợp bộ lọc với URL, tải thêm, mở chi tiết và giữ ngữ cảnh khi quay lại; bổ sung loading, lỗi, rỗng và xóa bộ lọc. |
| TC02-QA01 | Kiểm thử | Kiểm tra lọc kết hợp, các bản ghi trùng ngày không bị mất/lặp giữa trang, Guest xem công khai và “Tôi đăng” chỉ trả bài của chính tài khoản. |

**Tiêu chí nghiệm thu:** Khách khám phá được chuyến sắp đi đủ điều kiện. Bộ lọc và phân trang phản ánh đúng dữ liệu. Bài gỡ công khai/hủy không xuất hiện trong danh sách khám phá.

## US-TC-03 — Tham gia chuyến và xem lịch trình nhóm

**User Story:** Là người dùng đã đăng nhập, tôi muốn tham gia ngay chuyến còn chỗ để trở thành thành viên và xem lịch trình chính thức của nhóm.

**Phụ thuộc:** TC-02. Ticket tương ứng: [TC-03](../stories/TC-03-instant-join-member-itinerary.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC03-BE01 | BE | Tạo membership và API tham gia; giữ chỗ nguyên tử, kiểm tra điều kiện tại thời điểm ghi, chống tham gia trùng và vượt sức chứa. |
| TC03-BE02 | BE | Xây dựng API nhóm/lịch trình và “Tôi tham gia”; kiểm tra quan hệ hiện hành, giữ quyền sửa cho owner và chặn xóa Trip từng có thành viên. |
| TC03-FE01 | FE | Hiển thị CTA theo Guest/người ngoài/thành viên/chủ chuyến; đăng nhập quay lại đúng chuyến, rồi người dùng tự bấm tham gia. |
| TC03-FE02 | FE | Xây dựng không gian nhóm, lịch trình chỉ đọc và mục “Tôi tham gia”; chuyển vào nhóm sau kết quả tham gia đã xác nhận. |
| TC03-QA01 | Kiểm thử | Cho hai tài khoản tranh chỗ cuối; kiểm tra retry không chiếm thêm chỗ, outsider/Admin không thành viên không đọc lịch riêng và Trip có lịch sử thành viên không bị xóa. |

**Tiêu chí nghiệm thu:** Mỗi tài khoản chiếm đúng một chỗ, host không chiếm chỗ. Chỉ một người nhận được chỗ cuối. Thành viên xem lịch đã lưu mới nhất nhưng không được sửa lịch.

## US-TC-04 — Tự rời nhóm và trả chỗ

**User Story:** Là thành viên, tôi muốn tự rời chuyến khi không còn tham gia để trả chỗ cho người khác và kết thúc quyền truy cập nhóm của mình.

**Phụ thuộc:** TC-03. Ticket tương ứng: [TC-04](../stories/TC-04-leave-return-place.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC04-BE01 | BE | Xây dựng API rời nhóm, cập nhật trạng thái quan hệ và trả chỗ đúng một lần, kể cả khi gửi lại request. |
| TC04-BE02 | BE | Thu hồi quyền đọc/gửi ở request kế tiếp, giữ lịch sử; cho người tự rời tham gia lại nếu đủ điều kiện, chặn host dùng luồng rời thành viên. |
| TC04-FE01 | FE | Thêm thao tác và xác nhận rời nhóm, nêu rõ mất quyền nhóm nhưng tin đã gửi vẫn được giữ. |
| TC04-FE02 | FE | Sau rời thành công, xóa dữ liệu nhóm khỏi giao diện, dừng polling và cập nhật “Tôi tham gia”, số chỗ và CTA phù hợp. |
| TC04-QA01 | Kiểm thử | Kiểm tra retry không trả chỗ hai lần, rời/tham gia đồng thời, mất quyền bằng API và tham gia lại không vượt qua trạng thái bị chặn. |

**Tiêu chí nghiệm thu:** Rời thành công làm mất quyền nhóm và trả đúng một chỗ. Lịch sử/tin nhắn cũ được giữ. Người tự rời có thể vào lại khi chuyến vẫn nhận người và còn chỗ.

## US-TC-05 — Sửa bài đăng, số chỗ và trạng thái tuyển

**User Story:** Là chủ chuyến, tôi muốn cập nhật lời mời, số chỗ và trạng thái tuyển để chủ động quản lý việc tìm người đi cùng mà vẫn giữ nhóm hiện có.

**Phụ thuộc:** TC-03. Ticket tương ứng: [TC-05](../stories/TC-05-manage-recruitment-capacity.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC05-BE01 | BE | Xây dựng API quản lý tiêu đề, giới thiệu, ảnh và sức chứa; kiểm tra owner, phiên bản dữ liệu và số chỗ không thấp hơn số thành viên đang tham gia. |
| TC05-BE02 | BE | Xử lý đóng/mở tuyển và gỡ/công khai lại bài theo điều kiện chuyến; giữ nguyên group ID và quyền thành viên. |
| TC05-FE01 | FE | Xây dựng trang quản lý có dữ liệu hiện hành, số người tham gia, số chỗ và các hành động đóng/mở tuyển, gỡ/công khai lại. |
| TC05-FE02 | FE | Tích hợp lưu/xung đột/recovery; chỉ cập nhật trạng thái sau SUCCESS, khóa draft khi pending/UNKNOWN và thử lại đúng payload/key ban đầu. |
| TC05-QA01 | Kiểm thử | Kiểm tra giảm chỗ cạnh tranh với join, quyền host, FAILED không đổi nhãn sai, UNKNOWN không đổi request và đóng/gỡ vẫn giữ nhóm. |

**Tiêu chí nghiệm thu:** Không giảm sức chứa dưới số đang tham gia. Đóng tuyển hoặc gỡ bài ngăn người mới nhưng thành viên vẫn dùng nhóm. Chỉ mở lại khi chuyến còn đủ điều kiện.

## US-TC-06 — Loại và chặn thành viên

**User Story:** Là chủ chuyến, tôi muốn loại và chặn thành viên không phù hợp để quản lý nhóm và ngăn tài khoản đó tham gia lại.

**Phụ thuộc:** TC-03. Ticket tương ứng: [TC-06](../stories/TC-06-remove-ban-member.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC06-BE01 | BE | Xây dựng API danh sách thành viên theo quyền và thao tác loại/chặn chỉ dành cho chủ chuyến. |
| TC06-BE02 | BE | Thu hồi membership, trả chỗ một lần, giữ lịch sử và kiểm tra chặn trong mọi luồng join/rejoin; ngăn host tự loại mình. |
| TC06-FE01 | FE | Hiển thị danh sách thành viên; chỉ host thấy hành động loại/chặn và xác nhận tác động trước khi thực hiện. |
| TC06-FE02 | FE | Cập nhật danh sách/số chỗ sau SUCCESS; khi tài khoản bị loại mất quyền, xóa nội dung riêng và dừng các tác vụ nhóm đang chạy. |
| TC06-QA01 | Kiểm thử | Kiểm tra host/member/outsider, join cạnh tranh với loại, retry và tài khoản bị chặn không vào lại bằng request cũ hoặc membership khác. |

**Tiêu chí nghiệm thu:** Chỉ chủ chuyến được loại/chặn. Người bị loại không còn đọc/gửi trong nhóm và không thể tham gia lại; nhóm còn lại cùng lịch sử vẫn được giữ.

## US-TC-07 — Chat nhóm bằng văn bản và liên kết

**User Story:** Là chủ chuyến hoặc thành viên, tôi muốn trò chuyện trong nhóm chuyến và đọc trao đổi trước đó để thống nhất việc đi cùng mọi người.

**Phụ thuộc:** TC-03. Ticket tương ứng: [TC-07](../stories/TC-07-group-text-chat-history.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC07-BE01 | BE | Mô hình hóa tin nhắn và thứ tự tin theo nhóm; xây dựng API đọc lịch sử có phân trang, kiểm tra quyền ở mỗi request. |
| TC07-BE02 | BE | Xây dựng gửi tin văn bản/link với tác giả lấy từ session, chống ghi trùng và chỉ xác nhận đã gửi sau khi DB commit. |
| TC07-FE01 | FE | Xây dựng transcript, tên người gửi, thời gian, ô soạn, nút gửi và tải lịch sử cũ; hiển thị nội dung an toàn. |
| TC07-FE02 | FE | Hiển thị pending/FAILED/UNKNOWN; giữ draft và attempt khi chưa rõ kết quả, retry đúng text/key; giữ vị trí khi tải lịch sử cũ. |
| TC07-QA01 | Kiểm thử | Kiểm tra quyền theo nhóm, gửi đồng thời, gửi lại không trùng, HTML được escape và thành viên mới đọc được toàn bộ lịch sử. |

**Tiêu chí nghiệm thu:** Chỉ host/thành viên hợp lệ đọc và gửi. Tin có thứ tự ổn định, không bị nhân đôi khi retry. Thành viên mới biết trước và đọc được lịch sử nhóm.

## US-TC-08 — Cập nhật tin mới và phục hồi kết nối

**User Story:** Là người đang mở nhóm chuyến, tôi muốn nhận tin mới trong vài giây và phục hồi sau gián đoạn mạng để cuộc trò chuyện không bị thiếu hoặc trùng tin.

**Phụ thuộc:** TC-07. Ticket tương ứng: [TC-08](../stories/TC-08-polling-reconnect-recovery.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC08-BE01 | BE | Xây dựng API lấy tin mới theo cursor, hỗ trợ chia trang delta và đối soát tin gửi chưa xác nhận bằng định danh thao tác. |
| TC08-BE02 | BE | Bảo đảm cursor phản ánh phần dữ liệu đã giao, thứ tự commit không làm mất tin, kiểm tra quyền trên mỗi lần poll/reconcile. |
| TC08-FE01 | FE | Poll khoảng 3 giây khi mở nhóm và trang hiển thị; tạm dừng khi ẩn, lấy phần mới khi quay lại và giữ trải nghiệm đọc/cuộn. |
| TC08-FE02 | FE | Merge/dedup/sắp xếp tin; tách ACK gửi khỏi cursor nhận; bỏ response cũ và dừng polling khi đổi tài khoản/nhóm, logout hoặc mất quyền. |
| TC08-QA01 | Kiểm thử | Kiểm tra mạng ngắt/reconnect, own-send xen tin người khác, delta nhiều trang, timer/visibility và response về muộn sau khi bị loại hoặc đổi tài khoản. |

**Tiêu chí nghiệm thu:** Tin đã commit không bị mất/trùng/đảo sai thứ tự khi reconnect. ACK tin tự gửi không bỏ qua tin người khác. Mất quyền không để lại transcript hoặc polling hoạt động cho phiên cũ.

## US-TC-09 — Tin chưa đọc và quay lại đúng nhóm

**User Story:** Là thành viên của các chuyến, tôi muốn thấy nhóm có tin chưa đọc và mở đúng cuộc trò chuyện để theo dõi trao đổi chưa xem.

**Phụ thuộc:** TC-08. Ticket tương ứng: [TC-09](../stories/TC-09-unread-return-to-group.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC09-BE01 | BE | Lưu mốc đã đọc riêng cho từng tài khoản/nhóm; xây dựng API cập nhật marker, kiểm tra quyền và không cho marker lùi hoặc vượt dữ liệu hợp lệ. |
| TC09-BE02 | BE | Xây dựng API tổng hợp tin chưa đọc từ dữ liệu thực cho các nhóm có quyền hiện hành, không công khai read receipt của từng người. |
| TC09-FE01 | FE | Hiển thị badge chưa đọc trong “Tôi tham gia” và lối mở đúng tab trò chuyện; cập nhật summary trong website đang hiển thị. |
| TC09-FE02 | FE | Chỉ đánh dấu phần tin thực sự hiển thị trong viewport khi trang visible; giữ recovery marker và xóa summary riêng khi đổi tài khoản/mất quyền. |
| TC09-QA01 | Kiểm thử | Kiểm tra hai tài khoản có marker độc lập, background fetch/tin ngoài viewport không bị đánh dấu đã đọc và marker không vượt cursor đã nhận. |

**Tiêu chí nghiệm thu:** Badge phản ánh tin chưa đọc thực tế theo tài khoản. Chỉ phần tin đã được hiển thị mới làm tiến mốc đọc. Không hứa thông báo khi website đã đóng.

## US-TC-10 — Thông báo khi lịch trình chính thức thay đổi

**User Story:** Là thành viên, tôi muốn được thông báo khi chủ chuyến lưu thay đổi ngày, điểm đến hoặc giờ đi để theo dõi đúng lịch trình mới nhất.

**Phụ thuộc:** TC-07 và luồng sửa/lưu Trip hiện có. Ticket tương ứng: [TC-10](../stories/TC-10-saved-itinerary-change-notices.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC10-BE01 | BE | Tích hợp revision và tin hệ thống vào transaction lưu thay đổi Trip; lịch, revision và notice cùng thành công hoặc cùng rollback. |
| TC10-BE02 | BE | Xác định thay đổi ngày/điểm/giờ cần thông báo, chống notice trùng khi replay và cập nhật điều kiện tuyển theo lịch mới; giữ Validator/quyền owner. |
| TC10-FE01 | FE | Nối lối sửa lịch cho chủ chuyến về luồng Trip hiện có; phân biệt sửa lịch chính thức với sửa nội dung bài đăng tìm bạn. |
| TC10-FE02 | FE | Hiển thị notice trong chat, cho thành viên mở lịch mới nhất và giữ lịch chỉ đọc; không bắt cả nhóm xác nhận lại thay đổi. |
| TC10-QA01 | Kiểm thử | Kiểm tra save thành công có notice, preview/cancel/FAILED không có notice, replay không nhân đôi và lỗi transaction không để lịch/notice lệch nhau. |

**Tiêu chí nghiệm thu:** Chỉ thay đổi lịch đã lưu thành công mới phát thông báo. Thành viên xem lịch mới nhất nhưng không có quyền sửa; các quy tắc xác nhận và Validator của Trip vẫn được giữ.

## US-TC-11 — Hủy chuyến và giữ lịch sử nhóm

**User Story:** Là chủ chuyến, tôi muốn hủy chuyến đồng hành và thông báo cho nhóm để dừng tham gia/trò chuyện mới, đồng thời giữ lịch sử cho những người còn trong nhóm.

**Phụ thuộc:** TC-05 và TC-07. Ticket tương ứng: [TC-11](../stories/TC-11-cancel-retain-group-lifecycle.md).

| Mã task | Phần | Công việc |
| --- | --- | --- |
| TC11-BE01 | BE | Xây dựng thao tác hủy chỉ dành cho host, cập nhật trạng thái và notice nguyên tử; chặn join/gửi tin sau hủy kể cả khi dùng request cũ. |
| TC11-BE02 | BE | Giữ quyền đọc cho thành viên hiện hành, lịch sử và ràng buộc không xóa Trip từng có thành viên; cho chat tiếp không giới hạn khi hoàn tất bình thường. |
| TC11-FE01 | FE | Thêm hành động/xác nhận hủy, giải thích tác động và phân biệt rõ với đóng tuyển, gỡ công khai hoặc hoàn tất chuyến. |
| TC11-FE02 | FE | Hiển thị trạng thái đã hủy và chat chỉ đọc, giữ lịch sử; với chuyến hoàn tất bình thường vẫn cho người có quyền tiếp tục chat. |
| TC11-QA01 | Kiểm thử | Kiểm tra quyền host, hủy cạnh tranh với gửi/join, retry không thêm notice trùng, lịch sử còn nguyên và hoàn tất không tự khóa chat sau 7 ngày. |

**Tiêu chí nghiệm thu:** Sau hủy không nhận người mới hoặc tin nhắn người dùng; thành viên hiện hành vẫn đọc lịch sử. Hủy không tự khôi phục nhóm. Hoàn tất bình thường không đặt hạn sử dụng chat.

## Phụ thuộc và cách tổ chức BE/FE

| User Story | Tiền đề chức năng |
| --- | --- |
| US-TC-01 | Saved Trip, auth và write contract hiện có |
| US-TC-02 | TC-01 |
| US-TC-03 | TC-02 |
| US-TC-04, US-TC-05, US-TC-06, US-TC-07 | TC-03 |
| US-TC-08 | TC-07 |
| US-TC-09 | TC-08 |
| US-TC-10 | TC-07 và sửa/lưu Trip hiện có |
| US-TC-11 | TC-05, TC-07 |

Hai task vai trò xuyên suốt đã có: [BE](tasks/trip-companions-backend.md) và [FE/tích hợp](tasks/trip-companions-frontend.md). Các task nhỏ trong tài liệu này là phần việc nằm bên trong hai task đó. BE có thể tiến theo prerequisite backend đã kiểm chứng, FE tích hợp theo contract thật; chỉ ghi một US hoàn tất đầy đủ khi có bằng chứng BE, FE và tích hợp tương ứng.

## Điều kiện hoàn tất và trạng thái tổng hợp

Đối với mỗi US, đối chiếu AC, kiểm tra quyền nhiều vai trò, test hành vi và các ca lỗi/retry liên quan; chạy typecheck/build phù hợp, kiểm tra migration khi đổi DB, whitespace và cập nhật evidence. Những thao tác thay đổi quyền phải được chặn trên server và xử lý dữ liệu client khi thu hồi quyền. UI cần trạng thái loading/rỗng/lỗi, thao tác bàn phím và bố cục responsive phù hợp.

**Hiện trạng theo các receipt đến 28/10/2026:** BE có code/contract/tests đến TC-11; FE có code và bằng chứng local cho các luồng, cùng đợt sửa bảy lỗi review. Development đã kiểm tra **42 migrations applied, 0 pending, 0 unfinished**; lần chạy lại không cần áp dụng migration mới. Bản ghi kiểm chứng hiệu năng gần nhất báo **204 focused tests PASS**, PostgreSQL **58/58 PASS** trong lượt disposable riêng, typecheck và build PASS. Các con số thuộc các lượt kiểm chứng đã ghi, không phải test mới chạy khi soạn tài liệu này.

Không đồng nhất các receipt local hoặc quan sát Guest với nghiệm thu đầy đủ nhiều tài khoản trên browser. Nghiệm thu cuối của chủ dự án và triển khai Production giữ trạng thái riêng; tài liệu này không tự đổi toàn bộ ticket thành ACCEPTED. Các mô tả “FE continuing” hoặc “chưa có code” trong snapshot cũ cần đọc cùng các receipt thực thi mới hơn.

**Ngoài phạm vi đã duyệt:** Đồng sửa lịch, đổi chủ, duyệt yêu cầu tham gia, đặt nhiều chỗ thay người khác, tin nhắn riêng, ảnh/tệp/voice/call, email/push khi đóng web, công cụ báo cáo Admin và tự xóa nhóm/chat sau chuyến.

## Nguồn đối chiếu

- [11 ticket và phụ thuộc đã duyệt](trip-companions-tickets-plan.md), [quyết định Q1–Q17](trip-companions-design.md).
- [Product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28).
- [Contract bàn giao](trip-companions-delivery-contract.md), [kiểm chứng BE và migration](trip-companions-backend-verification.md).
- [Bảy lỗi review và sửa chữa](trip-companions-review-fixes.md), [hiệu năng và kiểm chứng gần nhất](../performance/companion-loading-2026-10-28.md).
- [Nhật ký thực thi](../ai-progress.md). Story tương ứng được dẫn tại từng US ở trên và vẫn giữ vai trò hợp đồng triển khai chi tiết.

# Tìm bạn đồng hành — phân tích UI/UX trước triển khai

Ngày: 2026-10-28. Phạm vi: phân tích bằng ui-ux-pro-max, đối chiếu source và [kế hoạch Q1–Q17 đã duyệt](../implementation/trip-companions-design.md). Chưa viết giao diện/code/schema. Các tinh chỉnh trong báo cáo là khuyến nghị thiết kế, không tự sửa nghiệp vụ đã chốt.

## Kết luận thiết kế

Giao diện nên giúp người dùng lần lượt trả lời ba câu hỏi: **Có chuyến nào phù hợp ngày đi của tôi? → Tôi có muốn đi cùng nhóm này? → Nhóm đã thống nhất những gì?** Ba màn hình đã chốt tương ứng tốt với ba việc này.

Nên giữ nền kem, xanh rừng, kiểu chữ và cách trình bày hành trình của sản phẩm. Tập trung cải thiện thứ tự thông tin, nhãn số chỗ, lối vào nhóm và trạng thái thao tác. Bản phân tích không đề xuất đổi thương hiệu hoặc thêm chức năng mạng xã hội ngoài phạm vi đã duyệt.

## Bằng chứng và giới hạn

Đã đọc [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), kế hoạch, [UI baseline](ui-baseline.md), [DESIGN.md](../../DESIGN.md), `header.tsx`, `header.css`, `trips-view.tsx`, `trips.css` và font runtime ở `layout.tsx`.

Các màn hình đồng hành chưa được triển khai. Những nhận định bố cục dưới đây là phân tích thiết kế; rủi ro tích hợp dựa trên source, không phải lỗi đã quan sát bằng browser. Chưa xem trực tiếp Figma và chưa đo responsive/focus/ảnh chụp màn hình. Không chấm điểm UI hoặc tuyên bố đạt accessibility trên cơ sở chỉ đọc source.

## Các điểm cần ưu tiên

| Ưu tiên | Vấn đề thiết kế cần giải quyết | Tác động | Hướng xử lý |
| --- | --- | --- | --- |
| Cao | Giới thiệu công khai và nhóm dễ bị hiểu thành cùng một màn hình | Người ngoài không hiểu mình được xem gì; thành viên khó tìm lại nhóm | Phân biệt rõ trang giới thiệu và không gian nhóm; CTA đổi theo quan hệ hiện tại. |
| Cao | “2/4 người” không nói rõ có tính chủ chuyến/nhóm sẵn có hay không | Người dùng hiểu sai chỗ còn và quy mô nhóm | Nhãn “Còn 2 chỗ tìm thêm”; số tài khoản trong nhóm dùng nhãn riêng. |
| Cao | Chưa vào nhóm thì không xem lịch từng giờ | Người dùng thiếu cơ sở quyết định tham gia | Đưa ngày, phương tiện, tuyến tóm tắt, giới thiệu và host lên trước CTA; giữ giới hạn Q14. |
| Cao | Bấm tham gia có thể gặp chỗ vừa hết hoặc mất phản hồi | UI dễ báo tham gia thành công sai hoặc khiến bấm lại nhiều lần | Thiết kế Đang tham gia/Chưa xác nhận/Chỗ vừa hết/Đã tham gia thành các trạng thái rõ. |
| Cao | Chat, lịch trình và thông tin nhóm cùng xuất hiện trên màn hình nhỏ | Composer bị che, nội dung bị nén và khó định hướng | Mobile dùng một tab làm việc mỗi lần, thông tin phụ mở từ header. |
| Vừa | Thêm một nhãn navigation dài vào header hiện tại | Có nguy cơ chen chúc ở desktop nhỏ | Kiểm tra vùng 1152–1366px và trạng thái đăng nhập/tên dài; cho drawer xuất hiện sớm khi nội dung không còn đủ chỗ. |
| Vừa | Công khai/đóng tuyển/hủy/hoàn tất dùng nhiều badge ngang nhau | Người dùng khó biết mình còn tham gia hoặc gửi tin được không | Hiển thị trạng thái phục vụ hành động trước; vòng đời chuyến ở dòng phụ có chữ giải thích. |
| Vừa | Trang có nhiều nhóm vẫn thiếu đường quay lại cuộc trò chuyện đang dùng | Người dùng phải đi lại từ danh sách khám phá | “Tôi tham gia” có dấu chưa đọc và mở đúng tab chat; từ Trip có lối vào nhóm. |

Đây là thứ tự ưu tiên thiết kế, không phải danh sách bug đã xác nhận của tính năng đang chạy.

## 1. Điều hướng và cách tổ chức thông tin

Giữ navigation chung của ứng dụng, thêm điểm đến “Tìm bạn đồng hành”. Bên trong trang có ba phạm vi:

- **Khám phá chuyến:** tìm chuyến công khai phù hợp.
- **Tôi đăng:** những chuyến mình đang tổ chức và trạng thái nhận người.
- **Tôi tham gia:** quay lại lịch/chat nhóm đã vào.

Guest vẫn vào phần khám phá. Khi chọn vùng cá nhân, có lời mời đăng nhập với lối quay về đúng ngữ cảnh. Không trình bày dữ liệu rỗng như thể tài khoản đã có quyền xem.

Header hiện tại chuyển sang drawer ở 1140px, còn link desktop không xuống dòng. Thêm một nhãn mới cần kiểm chứng tổng chiều rộng thực với logo, các link tùy feature flag, theme và user menu; chưa có bằng chứng rằng breakpoint cũ còn phù hợp. Giữ cỡ chữ đọc được thay vì thu nhỏ đồng loạt để ép đủ chỗ.

## 2. Trang tìm chuyến: ưu tiên so sánh nhanh

Phần đầu chỉ cần tên trang, một câu mô tả và nút “Đăng chuyến đi”. Tiếp theo là ba phạm vi ở trên, rồi tìm kiếm và lọc. Giữ kết quả xuất hiện sớm; chưa cần một hero ảnh lớn hoặc sidebar bộ lọc cho ba điều kiện đơn giản.

Thứ tự thông tin trong mỗi thẻ nên là:

1. Tiêu đề chuyến và ngày khởi hành/kết thúc đầy đủ năm khi cần.
2. Phương tiện và số chỗ tìm thêm còn trống.
3. Tuyến tóm tắt từ dữ liệu được phép công khai.
4. Host với tên hiển thị/avatar và một phần lời giới thiệu.
5. Lối “Xem chuyến”. Thao tác tham gia nằm trong trang giới thiệu có đủ ngữ cảnh.

Desktop dùng danh sách thẻ ngang để ngày đi/chỗ còn nằm ở vị trí ổn định khi quét nhiều chuyến. Ảnh có một kích thước nhất quán và hỗ trợ nhận ra tuyến; thông tin so sánh vẫn là phần chính. Mobile thu gọn ảnh và cho metadata xuống hàng có chủ đích, không giữ nguyên các cột desktop.

Các nhãn bộ lọc đề xuất: “Ngày khởi hành”, “Phương tiện”, “Còn chỗ”. Cần giải thích cách khớp khoảng ngày, không dùng một chữ “Ngày” có thể bị hiểu là ngày đi hoặc ngày kết thúc. Các bộ lọc là phép kết hợp; chip đang áp dụng có thể xóa từng mục và có “Xóa bộ lọc”. Trên mobile, sheet có nút áp dụng và hủy rõ ràng; bỏ sheet không âm thầm áp dụng các giá trị đang chọn thử.

Giữ bộ lọc/vị trí danh sách khi quay lại từ chi tiết. Trạng thái bộ lọc có thể chia sẻ bằng URL. Khi không có kết quả, nói rõ đang lọc theo gì và cho bỏ một điều kiện; không chỉ để “0 kết quả”. Autocomplete là gợi ý của dataset nhưng không cần thêm vào bản đầu nếu tìm kiếm/bộ lọc cơ bản đã đủ; không mở rộng scope chỉ vì có khuyến nghị.

## 3. Trang giới thiệu: đủ thông tin trước khi tham gia

Desktop đề xuất khung nội dung khoảng 1240px, cột chính 856px và cột hành động 360px, gap 24px. Đây là số khởi điểm để làm wireframe, chưa phải kích thước đã đo trên browser. Không gian cột chính dành cho tên chuyến, ảnh vừa phải, tuyến và giới thiệu; cột hành động đặt ngày, phương tiện, chỗ còn, host và nút chính.

Lịch từng giờ vẫn dành cho thành viên theo Q14. Để người xem quyết định được, thông tin công khai cần trả lời rõ: đi ngày nào, bằng gì, qua những điểm nào, tìm thêm bao nhiêu người, host mong muốn điều gì. Lời giới thiệu do host tự viết; không tự lấy nhu cầu riêng trong hội thoại AI để lấp nội dung.

Ngay trước CTA cần một lời giải thích ngắn: “Tham gia để xem lịch trình chi tiết và trò chuyện. Thành viên mới được xem lịch sử nhóm.” Không dùng nhãn “Gửi yêu cầu”, “Chờ duyệt” hoặc gợi ý host sẽ duyệt, vì Q2 đã chọn vào ngay.

| Quan hệ / trạng thái | CTA hoặc thông báo chính |
| --- | --- |
| Guest, chuyến còn nhận người | Đăng nhập để tham gia; đăng nhập xong quay lại, chưa tự join. |
| Đã đăng nhập, chưa tham gia | Tham gia chuyến. |
| Đang ghi / mất xác nhận | Đang tham gia… / Chưa xác nhận, có lối kiểm tra lại cùng thao tác. |
| Đã tham gia | Vào nhóm chuyến. |
| Host | Quản lý chuyến / Vào nhóm, không chiếm thêm một chỗ. |
| Hết chỗ hoặc đóng tuyển | Nêu lý do cạnh nút; gợi ý quay lại danh sách. |
| Bị loại/chặn | Nêu không thể tham gia lại; không hiển thị lời hứa gửi yêu cầu cho host. |

Nếu chỗ cuối vừa bị người khác lấy, giữ nguyên phần giới thiệu và hiển thị “Chỗ vừa được người khác tham gia”. Không chuyển người dùng vào một nhóm mà DB chưa xác nhận họ là thành viên.

Mobile sắp metadata/chỗ/host trước phần giới thiệu dài. Một thanh CTA bám dưới có thể giúp thao tác nhưng cần dành chỗ cho nội dung, bàn phím và launcher AI; tránh đồng thời có nhiều CTA cố định cạnh tranh.

## 4. Công khai từ Trip: form ngắn, phần công khai nhìn thấy được

Từ Trip đã lưu, đưa trực tiếp vào form của chuyến đó. Từ nút “Đăng chuyến đi” của kênh, trước hết chọn Trip đã lưu còn đủ điều kiện; Trip đã có bài đưa về quản lý bài hiện tại. Nếu chưa có Trip phù hợp, giải thích điều kiện và dẫn đến luồng lập/lưu hành trình hiện có.

Thông tin Trip hiển thị thành khối tóm tắt chỉ đọc. Nhập tiêu đề, lời giới thiệu và số chỗ tìm thêm; chọn ảnh từ dữ liệu điểm đến hiện có. Trợ giúp ngay tại trường số chỗ: “Không tính bạn và những người đã đi cùng sẵn có. Mỗi tài khoản tham gia dùng một chỗ.”

Xem trước phải thể hiện đúng phần Guest sẽ thấy, đặc biệt tên/avatar host và lời giới thiệu. Desktop có thể đặt preview cạnh form; mobile đi từ form sang preview và quay lại giữ nội dung. Nút “Công khai tìm người” chỉ xác nhận thành công sau khi ghi thành công; không thêm một wizard dài cho ít trường nhập.

Các lỗi đi cùng trường có vấn đề; lỗi nhiều trường có tóm tắt dẫn về từng trường. Không mất lời giới thiệu khi publish bị lỗi. “Chưa xác nhận” có nội dung khác “Thất bại”, phù hợp hợp đồng write đã duyệt.

## 5. Không gian nhóm: ưu tiên nội dung theo lối vào

Giữ ba tab **Lịch trình — Trò chuyện — Thành viên** theo kế hoạch. Khuyến nghị lối vào chọn tab theo công việc: vừa tham gia hoặc bấm tin chưa đọc thì mở Trò chuyện; từ phần lịch trong Trip thì mở Lịch trình. Khi quay lại trong cùng phiên, giữ tab/vị trí đang dùng. Đây là đề xuất tương tác để làm wireframe, không đổi quyền truy cập.

Desktop tab chat có vùng tin chính và cột thông tin phụ khoảng 300–340px, có thể thu gọn. Không cần dựng thêm một sidebar chat toàn ứng dụng. Nội dung hội thoại giữ chiều dài dòng hợp lý dù màn hình rộng; danh sách thành viên đầy đủ vẫn có tab riêng.

Mobile chỉ có vùng chat và composer. Thông tin phụ mở bằng nút có tên trong header; tên chuyến dài được xử lý xuống dòng/thu gọn hợp lý mà không đẩy composer khỏi màn hình. Kiểm tra riêng khi bàn phím mở và khi xoay ngang.

Tin người dùng hiển thị danh tính/thời gian; tin hệ thống về lịch có kiểu trình bày riêng và lối “Xem lịch mới nhất”. Không thêm online/đang nhập/đã xem giả hoặc giao diện đính kèm khi bản đầu chưa có các tính năng đó.

Khi đang ở cuối thì theo tin mới. Khi đọc tin cũ thì giữ vị trí và hiện “Có tin nhắn mới”; tải tin cũ giữ điểm neo. Polling không lấy focus khỏi composer và không làm cả vùng chat nháy/skeleton mỗi lần cập nhật. Lỗi kết nối có thông báo gọn, vẫn giữ văn bản chưa gửi. Quy tắc cuộn này là khuyến nghị thiết kế chung, không phải kết quả phù hợp đã tìm được trong dataset.

Trạng thái tin nhắn cần phân biệt: Đang gửi / Đã gửi được xác nhận / Chưa xác nhận / Không gửi được. Không dùng một dấu tích để ngầm hứa “người kia đã đọc”. Dấu chưa đọc là trạng thái của chính tài khoản; cập nhật badge có ngữ cảnh, không đọc một con số trần hoặc nhiều live-region cùng tranh nhau.

## 6. Số chỗ, quản lý nhóm và vòng đời

Ví dụ minh họa, không phải dữ liệu thực: host mở thêm 4 chỗ, có 2 tài khoản tham gia. Phần công khai ghi “Còn 2 chỗ tìm thêm”; phần quản lý có thể ghi “2/4 chỗ đã có người tham gia”. Nhóm chat có 3 tài khoản gồm host. Không gọi nhóm là “đoàn 3 người”, vì số người đi cùng sẵn có ngoài hệ thống không được suy ra từ membership.

Host có khu vực quản lý riêng cho số chỗ/công khai/tuyển người. Thao tác thường dùng xuất hiện trước; hủy chuyến và loại/chặn thành viên có mô tả hậu quả ngay trong ngữ cảnh, không làm chúng thành nút nổi bật nhất của trang. Thành viên chỉ thấy quyền phù hợp với mình.

| Trạng thái | Thông tin cần hiểu ngay |
| --- | --- |
| Đang công khai, còn chỗ | Có thể tham gia trước ngày đi. |
| Hết chỗ | Hiện chưa nhận thêm; người đã tham gia vẫn dùng nhóm. |
| Host đóng tuyển / gỡ công khai | Nhóm cũ vẫn dùng được; không có người mới vào. |
| Đã khởi hành | Dừng nhận người mới, nhóm vẫn trò chuyện. |
| Đã hoàn tất | “Chuyến đã hoàn tất · Nhóm vẫn hoạt động”; không đếm ngược đóng chat. |
| Đã hủy | “Chuyến đã hủy · Chỉ đọc”; thay composer bằng thông báo có nghĩa. |
| Đã rời / bị loại | Thu hồi màn hình riêng, đưa về thông báo/lối khám phá; không để các tab riêng tư hiện như còn dùng được. |

## 7. Kiểu chữ, màu và accessibility

Kế thừa **Be Vietnam Pro** cho body/controls và **Lora** cho tiêu đề có vai trò rõ ràng; runtime hiện tại là căn cứ chính, không lấy nhầm token Admin trong đầu DESIGN.md làm palette của trang người dùng. Giữ Lucide đang có trong repo để thống nhất icon; không cài bộ icon khác chỉ theo mặc định dành cho native app của skill.

Đề xuất thang chữ cho wireframe: tiêu đề trang 28–32px desktop, 24px mobile; tiêu đề thẻ 18–20px; body/chat 16px; metadata 13–14px. Controls cao tối thiểu 44px là mục tiêu usability của trang web này, không diễn giải thành đơn vị pt/dp của native app. Nội dung nhiều chữ tiếng Việt cần line-height khoảng 1.5–1.6, URL/tên dài không tràn ngang.

Tính tương phản từ các mã màu source, với giả định foreground/background phẳng và đục:

| Cặp màu | Tỷ lệ tính được | Nhận định ở mức token |
| --- | --- | --- |
| Trắng trên xanh `#174a35` | 10.16:1 | Phù hợp để dùng cho nhãn CTA chữ thường. |
| Muted `#5e6d65` trên nền `#f8f7f3` | 5.09:1 | Còn đủ tương phản, tránh giảm thêm opacity cho metadata. |
| Trắng trên dark action `#2d825c` | 4.71:1 | Sát ngưỡng hơn; cần giữ trạng thái tương tác đủ tương phản. |
| Trắng trên dark hover token `#389d70` | 3.37:1 | Không dùng cặp này cho nhãn chữ thường nhỏ trong trang mới. |
| Muted dark `#9bb0a4` trên surface `#18221c` | 7.12:1 | Hợp lý cho thông tin phụ nếu giữ cặp màu này. |

[W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) đặt ngưỡng 4.5:1 cho chữ thông thường, 3:1 cho chữ lớn với các ngoại lệ được nêu tại nguồn. Tỷ lệ ở bảng là phép tính màu, không chứng minh một component đã render đạt tiêu chí. Primary action hiện tại trong trips.css dùng gradient riêng; vì vậy cặp token hover 3.37:1 **không phải bằng chứng nút hiện tại đang lỗi**. Khi thiết kế trang mới, một ứng viên hover phẳng đậm hơn là `#246e4c`, trắng trên nền này khoảng 6.16:1; đây là khuyến nghị, chưa thay token.

Sticky header/CTA, composer và launcher AI phải được bố trí để người dùng bàn phím thấy điều khiển đang focus. Phân biệt đúng: [W3C SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) mức AA yêu cầu điều khiển không bị che hoàn toàn; mục tiêu thiết kế nên giữ toàn bộ điều khiển/focus nhìn thấy được. Không tuyên bố yêu cầu AAA là yêu cầu AA.

Trạng thái có chữ đi cùng màu; nút icon có tên; error/status được thông báo hợp lý. Bổ sung thiết kế cho zoom 200%, reduced motion, tên/URL dài và nhiều tin nhắn. Các thông số màu/chữ vẫn cần đo lại trên cả light/dark và trạng thái hover/focus/disabled thực.

## 8. Responsive và trạng thái cần có trong wireframe

| Vùng | Desktop | Tablet | Mobile từ 360px |
| --- | --- | --- | --- |
| Khám phá | Toolbar gọn, thẻ ngang so sánh ngày/chỗ | Bộ lọc có thể thu vào sheet | Một cột; kết quả đầu xuất hiện sớm. |
| Giới thiệu | Nội dung và cột hành động | Hai cột chỉ khi còn đủ đọc | Metadata/CTA trước phần giới thiệu dài. |
| Công khai | Form và preview | Xếp dọc khi cột quá hẹp | Form → preview, quay lại giữ draft. |
| Chat | Hội thoại và cột phụ thu gọn được | Ẩn cột phụ khi làm chat quá hẹp | Một vùng chat; composer không bị bàn phím che. |
| Thành viên/quản lý | Danh sách với hành động theo quyền | Các trường phụ xuống dòng | Mỗi người một hàng có hành động rõ, không bảng nhiều cột ép nhỏ. |

Wireframe cần có các trạng thái: danh sách đang tải/rỗng/không khớp bộ lọc/lỗi; Guest; đang tham gia/chưa xác nhận/chỗ vừa hết; nhóm chưa có tin/có tin mới/mất kết nối; đang gửi/chưa xác nhận/thất bại; host/member/đã rời/bị chặn; công khai/ẩn/đóng tuyển/đã đi/hoàn tất/hủy. Skeleton giữ vùng ảnh và chiều cao cơ bản, không đẩy nút đang thao tác sang vị trí khác khi dữ liệu tới.

Khi triển khai bằng Next.js hiện có, giữ kích thước/tỷ lệ ảnh trước khi tải để giảm layout shift; ưu tiên pipeline/component ảnh phù hợp repo. Hướng dẫn image của skill áp dụng cho 16.2 đã được đối chiếu lại với tài liệu Next đóng gói tại `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` của bản cài trong workspace. Chưa viết component hoặc cấu hình ảnh.

## Căn cứ từ ui-ux-pro-max

Đã kiểm tra category và độ phù hợp của từng kết quả trước khi dùng:

| Truy vấn | Kết quả phù hợp | Cách áp dụng |
| --- | --- | --- |
| `search filter results feedback` / ux | No Results, Chip Collection Reflow | Gỡ bộ lọc khi rỗng; chip không bị cắt mất nhãn. Autocomplete là tùy chọn, chưa đưa vào phạm vi. |
| `live badge count screen reader` / ux | Contextual Live Badge Updates | Số chỗ/tin chưa đọc có ngữ cảnh, không di chuyển focus. |
| `focus not obscured` / ux | Minimum và Enhanced được phân biệt | Kiểm soát sticky UI/composer, phân biệt AA/AAA; đối chiếu W3C. |
| `progressive disclosure form` / ux | Submit Feedback, Form Labels phù hợp về form | Nhãn trường và trạng thái ghi dữ liệu. Không lấy kết quả này làm chứng cứ cho progressive disclosure. |
| `progressive disclosure` / ux — thử lại | Chỉ trả Heading Line Balance, không phù hợp ý định | Không tìm được match đã xác minh; cách chia form/preview là đánh giá thiết kế của báo cáo, không gán cho dataset. |
| `image responsive layout` / nextjs | Responsive image, dimensions/layout shift | Giữ vùng ảnh ổn định; đối chiếu tài liệu đóng gói của bản Next hiện cài. |

Không tạo design-system mới hoặc lưu kết quả gợi ý style/palette chưa phù hợp. Bản phân tích dùng hệ thống hiện tại và kế thừa các nguyên tắc app-screen từ design-taste-frontend đã đối chiếu trong phiên planning.

## Bước tiếp theo của thiết kế

Theo yêu cầu tạo thử ảnh sau phiên phân tích, đã có [ba ảnh mockup desktop minh họa](trip-companions-mockups/README.md) cho khám phá, giới thiệu và chat nhóm. Đây là ảnh sinh bằng image_gen, chưa phải wireframe tương tác hoặc browser/Figma acceptance; nội dung kế hoạch đã duyệt vẫn là nguồn nghiệp vụ.

Dựng wireframe desktop/mobile cho ba màn hình cùng form công khai, thể hiện đủ trạng thái ưu tiên cao; sau đó đối chiếu Figma và kiểm tra chiều rộng navigation, thứ tự nội dung, hành trình bàn phím và cảm giác đọc chat. Bước này chưa được thực hiện trong phiên phân tích, và không tự bắt đầu code.

Kiểm tra phiên này: source/docs, kết quả tìm kiếm local, phép tính tương phản màu và `git diff --check`. Chưa chạy build/test ứng dụng, migration hoặc browser QA vì chỉ tạo tài liệu phân tích.

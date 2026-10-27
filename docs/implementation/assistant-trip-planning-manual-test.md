# Lộ trình test thủ công: lập hành trình trong trợ lý AI

> Checklist này mô tả giao diện 9 ticket ban đầu. Luồng form trong chat đã được thay bằng hội thoại theo Q1–Q7; dùng [checklist chat hiện hành](assistant-chat-first-planning-manual-test.md) để kiểm tra bản mới. Các kiểm tra quyền sở hữu/ghi dữ liệu trong tài liệu này vẫn là tham chiếu.

Ngày soạn: 2026-10-27. Tất cả ca dưới đây **chưa được đánh dấu đã chạy**. Đây là checklist nghiệm thu thủ công, bổ sung cho [kết quả kiểm thử tự động](assistant-trip-planning-verification.md).

Phạm vi: [story](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md) và [9 ticket](../../.scratch/assistant-trip-planning/README.md). Dự kiến 60–90 phút, tùy thời gian phản hồi của AI và dữ liệu tuyến đường.

## Chuẩn bị

- Mở <http://localhost:3010/assistant>. Nếu server chưa chạy, chạy `npm run dev --workspace web` từ thư mục gốc repo.
- Dùng tài khoản thử nghiệm trên môi trường Development. Chuẩn bị thêm tài khoản B để kiểm tra quyền sở hữu.
- Chọn một ngày khởi hành trong tương lai và một điểm đến đang có trong danh sách công khai của ứng dụng. Thay `[tên điểm]` bằng tên thật đó trong các câu mẫu.
- Ghi số chuyến đi hiện có trước khi thử lưu. Mỗi lần lưu thành công trong checklist sẽ tạo dữ liệu thử thật.
- Nếu có thể, mở DevTools → Network, lọc `planning` để đối chiếu request khi có lỗi. Không chia sẻ cookie, token hoặc header Authorization.

Thực hiện vòng 1 theo thứ tự trong cùng một hội thoại. Vòng 2 dùng hội thoại mới khi ca test yêu cầu. Ghi `PASS`, `FAIL` hoặc `BLOCKED` cùng bằng chứng; không đánh dấu PASS chỉ vì AI trả lời nghe hợp lý.

## Vòng 1 — Luồng sử dụng chính, khoảng 25–35 phút

| Xong | Mã / ticket | Thao tác hoặc câu nhập mẫu | Kết quả mong đợi |
| --- | --- | --- | --- |
| [ ] | M01 / 01 | Đăng nhập, mở Assistant, bấm **Lập hành trình cùng AI**. | Hiện thẻ nhu cầu. Chưa tự tạo lịch trình, chưa lưu chuyến đi. |
| [ ] | M02 / 01–02 | Nhập: **“Tôi muốn đi chơi 2 ngày, thích thiên nhiên và chụp ảnh.”** | Nhận diện số ngày và sở thích; phương tiện còn thiếu phải được làm rõ. Nút tạo bị khóa khi chưa đủ số ngày/phương tiện. |
| [ ] | M03 / 02 | Nhập tiếp: **“Đi ô tô, 2 người, nhịp độ thư thả.”** Sau đó sửa trực tiếp một trường trên thẻ nhu cầu. | Thông tin từ các lượt trước được giữ; thông tin mới cập nhật đúng. Bạn có thể kiểm tra và chỉnh trước khi xác nhận. |
| [ ] | M04 / 02–03 | Nhập: **“Tôi bắt buộc phải ghé [tên điểm].”** Kiểm tra thẻ, rồi bấm nút tạo. Chưa chọn ngày khởi hành. | Điểm xuất hiện trong danh sách bắt buộc. Nếu tạo được đề xuất, có các ngày và điểm tham quan; thiếu ngày khởi hành phải được cảnh báo, chưa cho lưu. Nếu không thể thỏa điểm bắt buộc, phải giải thích, không âm thầm bỏ điểm. |
| [ ] | M05 / 03–04 | Chọn ngày khởi hành tương lai trên thẻ rồi bấm **Xác nhận nhu cầu và tạo lại**. | Đề xuất được kiểm tra lại theo ngày. Có kết quả giờ mở cửa, thời lượng, di chuyển, xung đột và khả năng di chuyển. Hiển thị số phương án đã kiểm tra; tối đa 2 lần điều chỉnh tự động sau phương án đầu. |
| [ ] | M06 / 05 | Ghi lại đề xuất, rồi hỏi: **“[tên điểm] có gì đáng tham quan?”** | Trả lời câu hỏi; nhu cầu, các điểm và thứ tự trong đề xuất đang có không tự thay đổi. |
| [ ] | M07 / 05 | Nhập: **“Hãy điều chỉnh ngày 2 nhẹ hơn, giữ điểm bắt buộc của tôi.”** Xem lại nhu cầu và xác nhận tạo lại nếu được yêu cầu. | Có phản hồi về thay đổi; phiên bản mới tiếp tục giữ điểm bắt buộc. Nếu việc chỉnh thất bại, đề xuất trước còn để đối chiếu và không được lưu như thể đã áp dụng chỉnh sửa. |
| [ ] | M08 / 08 | Bấm **Mở lịch trình và bản đồ**; chuyển lần lượt ngày 1 và ngày 2, chọn điểm trên bản đồ nếu có. | Danh sách và bản đồ khớp ngày/điểm. Tuyến được hiển thị theo dữ liệu có thật; thiếu dữ liệu phải được giải thích. Mở/đóng bản đồ không tự sinh đề xuất mới. |
| [ ] | M09 / 06 | Khi đề xuất có ngày khởi hành và đủ điều kiện xác nhận, bấm **Xác nhận và lưu chuyến đi** một lần. | Chỉ báo thành công sau khi hệ thống xác nhận lưu. Hiện **Mở chuyến đi**; chuyến đã lưu khớp đề xuất vừa xác nhận. Số chuyến tăng đúng 1. |
| [ ] | M10 / 06–07 | Bấm **Mở chuyến đi**, tải lại trang, rồi tìm chuyến trong danh sách chuyến đi. | Chuyến vẫn tồn tại, đúng số ngày, ngày khởi hành, phương tiện và điểm bắt buộc. Không xuất hiện bản sao do tải lại trang. |

Nếu M09 bị chặn bởi `Vi phạm` hoặc `Chưa đủ dữ liệu`, ghi rõ mục kiểm tra và điểm/ngày liên quan. Việc chặn lưu là đúng khi thiếu bằng chứng; ca lưu thành công được ghi `BLOCKED` nếu dữ liệu hiện có không cho tạo phương án hợp lệ. Thử thêm một kế hoạch đơn giản: **“Lập hành trình 1 ngày, đi ô tô, nhịp độ thư thả”**, chọn ngày tương lai, rồi kiểm tra lại. Không bỏ qua Validator để đạt PASS.

## Vòng 2 — Ca biên và khôi phục, khoảng 25–40 phút

| Xong | Mã / ticket | Thao tác hoặc câu nhập mẫu | Kết quả mong đợi |
| --- | --- | --- | --- |
| [ ] | M11 / 02 | Trong hội thoại mới: **“Lập hành trình 2 ngày đi ô tô, bắt buộc ghé Địa điểm thử nghiệm XYZ123.”** | Không tự bịa một điểm đến. Có yêu cầu làm rõ/nhập tên khác hoặc **Bỏ yêu cầu điểm này**; chưa được tạo khi điểm còn chưa rõ. |
| [ ] | M12 / 02 | Nếu dữ liệu có các điểm trùng/gần tên, nhập tên chưa đầy đủ; sau đó chọn một gợi ý cụ thể. | Không tự chọn thay khi còn mơ hồ. Sau khi chọn, thẻ ghi đúng điểm. Nếu corpus không có trường hợp mơ hồ, ghi `BLOCKED — chưa có dữ liệu phù hợp`. |
| [ ] | M13 / 02–04 | Yêu cầu nhiều điểm bắt buộc trong 1 ngày hoặc bật hạn chế di chuyển có liên quan tới điểm đã chọn. | Nếu không thể đáp ứng, có lý do cụ thể; không xóa điểm bắt buộc, đổi phương tiện hoặc tự bỏ hạn chế để làm cho kết quả đạt. Tối đa 2 lần sửa tự động; thiếu dữ liệu không được suy thành `Đáp ứng`. |
| [ ] | M14 / 03–05 | Tạo đề xuất, rồi đổi số ngày hoặc phương tiện trên thẻ nhu cầu, chưa tạo lại. | Đề xuất cũ được giữ để đối chiếu; không thể lưu nó như phiên bản đã cập nhật. Chỉ phiên bản được tạo và kiểm tra theo nhu cầu mới mới có thể xác nhận. |
| [ ] | M15 / 07–08 | Tạo đề xuất chưa lưu trong khung Assistant nổi; thu nhỏ, đi sang trang công khai khác, mở lại khung. | Đề xuất và nhu cầu đang làm còn trong phiên. Thu nhỏ/mở lại không tự gọi AI tạo thêm đề xuất. |
| [ ] | M16 / 07–08 | Mở cùng hội thoại từ khung nổi sang trang Assistant đầy đủ, rồi tải lại trang hoặc mở lại từ lịch sử. | Khi chuyển giao diện trong phiên, dùng cùng workspace. Sau tải lại/mở lại lịch sử, khôi phục nhu cầu và kết quả lưu nếu có; đề xuất chưa lưu cần thao tác tạo lại rõ ràng, không có nút lưu một bản lịch trình lịch sử chưa được kiểm tra lại. |
| [ ] | M17 / 05–07 | Sau khi lưu thành công, hỏi một câu về điểm đến. Tiếp theo nhập **“Đổi ngày 2 giúp tôi.”** Cuối cùng bấm **Lập chuyến khác từ nhu cầu này**. | Câu hỏi vẫn được trả lời. Yêu cầu sửa chuyến đã lưu hướng về luồng sửa Trip hiện có; không âm thầm ghi đè chuyến. Nút lập chuyến khác bắt đầu kế hoạch mới và không thay đổi chuyến cũ. |
| [ ] | M18 / 06–07 | Trên một đề xuất hợp lệ mới, bấm lưu nhanh hai lần hoặc bấm lại trong lúc đang xử lý. | Không tạo hai chuyến; nút đang xử lý được khóa. Nếu thành công, cả thao tác quy về cùng một chuyến. |
| [ ] | M19 / 06–07 | Thử gián đoạn mạng lúc gửi yêu cầu trong một ca riêng, rồi bật mạng lại. Nếu xuất hiện **Kiểm tra lại kết quả**, dùng nút đó. | Không báo thành công khi chưa có xác nhận. Nếu kết quả chưa rõ, giao diện đối soát thao tác trước; không buộc tạo một thao tác lưu mới rồi sinh chuyến trùng. Nếu chỉ gặp lỗi kết nối thông thường, ghi đúng lỗi quan sát được. |

M19 kiểm tra tình huống lỗi mạng thực tế; bật Offline không bảo đảm tái hiện được trạng thái `UNKNOWN` sau khi server đã lưu. Không đánh dấu đã kiểm tra toàn bộ phục hồi `UNKNOWN` nếu chưa tái hiện được thời điểm đó. Các nhánh chính xác đã có kiểm thử tự động trong báo cáo verification.

## Vòng 3 — Quyền truy cập và giao diện, khoảng 10–15 phút

| Xong | Mã / ticket | Thao tác | Kết quả mong đợi |
| --- | --- | --- | --- |
| [ ] | M20 / 01 | Mở cửa sổ chưa đăng nhập, nhập một yêu cầu lập hành trình rồi thực hiện đăng nhập theo giao diện. | Yêu cầu được đưa qua bước đăng nhập; không tạo/lưu với quyền Guest. Bản nháp được giữ qua luồng đăng nhập cùng tab nếu còn phiên bàn giao; không tự gửi lại yêu cầu hay tự lưu. |
| [ ] | M21 / 06–07 | Sao chép URL chuyến đi của tài khoản A. Đăng nhập B trong một cửa sổ riêng rồi mở URL đó; kiểm tra lịch sử của B. | B không đọc hoặc sửa được chuyến riêng của A; lịch sử của B không chứa nội dung riêng của A. Không cần thao tác sửa dữ liệu thật. |
| [ ] | M22 / 08 | Với đề xuất chưa lưu, đăng xuất A rồi đăng nhập B trong cùng tab. | Không còn hiển thị/cho lưu workspace riêng của A trong phiên B; phản hồi đến trễ của A không thay nội dung của B. |
| [ ] | M23 / 08 | Kiểm tra màn hình rộng và chiều rộng 360px; dùng Tab/Shift+Tab/Enter để đi qua form, tạo, mở bản đồ và lưu. | Nhãn/trạng thái đọc được, không tràn ngang, không có nút quan trọng bị che, vị trí focus thấy được, thao tác bàn phím dùng được. Kiểm tra riêng khung nổi khi bàn phím điện thoại mở nếu có thiết bị. |

## Đánh giá chất lượng và ghi lỗi — ticket 09

Ngoài PASS/FAIL kỹ thuật, ghi lại ít nhất 5 yêu cầu thực tế: chuyến ngắn thư thả, nhiều sở thích, điểm bắt buộc, hạn chế di chuyển, và một yêu cầu không thể đáp ứng. Với mỗi yêu cầu, lưu câu nhập, thẻ nhu cầu đã xác nhận, kết quả ban đầu/cuối cùng và nhận xét lịch trình có hợp lý hay không. Giữ cả các ca lỗi/thiếu dữ liệu trong bảng tổng hợp. Đây là kiểm tra trải nghiệm, chưa thay thế thí nghiệm RQ2 của luận văn.

Mẫu ghi một lỗi:

```text
Mã test: M07
Môi trường / thời điểm:
Các câu đã nhập và bước bấm để tái hiện:
Nhu cầu: số ngày / ngày khởi hành / phương tiện / điểm bắt buộc
Mong đợi:
Thực tế:
Ảnh hoặc video:
HTTP status / mã lỗi phản hồi nếu có (không kèm thông tin đăng nhập):
Tái hiện lại được: Có / Không
```

Ưu tiên sửa trước: truy cập nhầm tài khoản, báo lưu thành công nhưng không có chuyến, lưu trùng, mất điểm bắt buộc không giải thích, hoặc cho lưu khi thiếu kiểm tra bắt buộc. Các lỗi này chặn nghiệm thu.

Chỉ kết luận đạt nghiệm thu khi luồng tạo → chỉnh → lưu → mở lại đã chạy thành công, quyền sở hữu và dữ liệu được giữ đúng, các lỗi chặn đã được xử lý, và các ca chưa chạy/bị chặn được ghi rõ. Hiện tại nghiệm thu trình duyệt vẫn đang mở.

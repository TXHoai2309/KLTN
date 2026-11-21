# Spec: AI dẫn dắt nhập thông tin cho trang lập hành trình AI (kiểu tripsage)

Trạng thái: **đã thay thế** bởi [tripsage-planning-concierge-spec.md](tripsage-planning-concierge-spec.md) (ADR-42, 2026-11-21). Giữ lại làm lịch sử.
Phạm vi trang: chỉ `/assistant/plan`. Nền: nhánh `feat/tripsage-chat-itinerary-port`.

## Problem Statement

Người dùng vào trang "Lập hành trình AI" thì bị một hộp thoại "Thông tin chuyến đi" tự mở, bắt điền phương tiện, số ngày, ngày bắt đầu, sở thích, điểm xuất phát và giờ giấc trước khi AI làm gì. AI chỉ còn chọn điểm đến sau khi form đã đủ, nên cảm giác là "form kèm chatbot" chứ không phải trợ lý hỏi đáp và suy luận như tripsage. Khi người dùng đã ghim điểm xuất phát, AI còn hỏi lại vì không biết thông tin đó đã có.

## Solution

Chat là lối vào duy nhất. Người dùng nhắn tự do ("đi Hà Giang 2 ngày"); AI hỏi tiếp, gợi ý và đề xuất giá trị mặc định cho phần còn thiếu. Giá trị chỉ được ghi sau khi người dùng đồng ý hoặc sửa. Điểm xuất phát được chọn bằng một thẻ bản đồ AI mở ngay trong chat, kèm giờ đi và hạn về. Khi đủ thông tin đã xác nhận, AI chọn điểm đến, lập lịch, tự sửa khi Validator báo vi phạm và giải thích lý do. Lõi KLTN giữ nguyên: scheduler, Validator, routing, điểm đến trong DB (cộng Google Places chưa kiểm tra), Save idempotent.

## User Stories

1. Là du khách, tôi muốn mở trang lập hành trình và thấy ngay khung chat với lời chào, để bắt đầu mà không phải điền form.
2. Là du khách, tôi muốn nhắn bằng câu tự nhiên ("2 ngày bằng xe máy, thích khám phá"), để AI hiểu nhu cầu mà tôi không phải chọn từng ô.
3. Là du khách, tôi muốn AI hỏi đúng mục còn thiếu, để tôi chỉ trả lời những gì cần.
4. Là du khách, tôi muốn AI đề xuất giá trị mặc định hợp lý (số ngày, ngày đi, phương tiện, sở thích, giờ đi/về), để tôi trả lời "ok" thay vì nghĩ từng thứ.
5. Là du khách, tôi muốn giá trị mặc định chỉ được ghi sau khi tôi đồng ý hoặc sửa, để AI không tự quyết thay tôi.
6. Là du khách, tôi muốn thấy một dòng tóm tắt thông tin đã ghi phía trên ô nhập, để biết AI đang dựa vào gì.
7. Là du khách, tôi muốn đổi thông tin bằng cách nhắn ("đổi sang 4 ngày"), để không cần mở form.
8. Là du khách, tôi muốn khi đổi thông tin mà lịch hiện tại bị ảnh hưởng thì AI lập lại lịch và thay lịch cũ, để lịch luôn khớp thông tin mới.
9. Là du khách, tôi muốn khi đổi thông tin không ảnh hưởng lịch (ví dụ sở thích) thì AI hỏi lại trước khi lập, để tôi không mất lịch đang ưng.
10. Là du khách, tôi muốn AI mở thẻ chọn điểm xuất phát ngay trong chat, để chọn bằng tìm kiếm hoặc ghim bản đồ mà không rời cuộc trò chuyện.
11. Là du khách, tôi muốn thẻ kiểm tra điểm xuất phát nằm trong Việt Nam, để lịch không dựa trên vị trí không hỗ trợ.
12. Là du khách, tôi muốn điền giờ khởi hành và hạn về ngay trong thẻ (có giá trị AI đề xuất sẵn), để xác nhận một lần cho cả điểm và giờ.
13. Là du khách, tôi muốn AI không đoán điểm xuất phát thay tôi, để tọa độ luôn do tôi chọn.
14. Là du khách, tôi muốn AI từ chối ngày bắt đầu trong quá khứ và số ngày ngoài 1–14 và hỏi lại, để tôi không nhận lịch vô nghĩa.
15. Là du khách, tôi muốn AI chưa lập lịch khi thiếu điểm xuất phát đã xác nhận, để lịch không bao giờ dựa trên dữ liệu thiếu.
16. Là du khách, tôi muốn AI giải thích vì sao chọn các điểm và đưa lựa chọn thay thế, để tôi hiểu và điều chỉnh.
17. Là du khách, tôi muốn khi Validator báo vi phạm thì AI tự sửa lịch và nói rõ đã đổi gì, để tôi không phải tự xử lý lỗi kỹ thuật.
18. Là du khách, tôi muốn lịch chưa PASS được nói rõ là chưa xác nhận, để không nhầm lịch tham khảo với lịch hợp lệ.
19. Là du khách, tôi muốn địa điểm ngoài danh mục (Google Places) được đánh dấu chưa kiểm tra và không lưu nhầm, để biết rủi ro.
20. Là du khách, tôi muốn thấy trạng thái từng bước (đang tra cứu, đang kiểm tra, đang soạn), để biết hệ thống đang làm gì.
21. Là du khách, tôi muốn lịch chỉ được lưu khi tôi bấm Lưu, để không có thay đổi ngoài ý muốn.
22. Là du khách, tôi muốn khi lượt chat chạm giới hạn bước hoặc thời gian thì nhận thông báo rõ và hướng dẫn nhắn tiếp, để không bị cụt cuộc trò chuyện.
23. Là du khách, tôi muốn lỗi nhà cung cấp AI hiện thông báo tiếng Việt dễ hiểu và nút gửi lại, để thử lại dễ dàng.
24. Là du khách, tôi muốn nội dung web và tên địa điểm được coi là dữ liệu, không phải chỉ dẫn, để không bị prompt injection.
25. Là chủ dự án, tôi muốn mô hình không nhận được tọa độ và không tự bịa điểm đến, để bất biến sản phẩm giữ nguyên.
26. Là chủ dự án, tôi muốn form `/trips/new` và chat hỏi đáp `/assistant` hoạt động như cũ, để phần đã nghiệm thu không bị ảnh hưởng.
27. Là chủ dự án, tôi muốn luồng mới bám cờ tính năng hiện có và rollback được, để tắt khi cần.
28. Là nhà phát triển, tôi muốn có ADR bổ sung cho ADR-36 và story được cập nhật, để thay đổi kiến trúc có quyết định được duyệt.

## Implementation Decisions

- **Không form, không hộp thoại.** Bỏ hộp thoại tự mở và nút "Sửa thông tin". Thanh tóm tắt thành chỉ đọc. Mọi thay đổi thông tin đi qua hội thoại.
- **Công cụ ghi nhận thông tin (mới).** Mô hình gọi khi người dùng nói hoặc đồng ý giá trị cho phương tiện, số ngày, ngày bắt đầu, sở thích. Đầu vào kiểm bằng schema chặt dùng lại hợp đồng yêu cầu chuyến đi hiện có. Công cụ chỉ ghi giá trị người dùng đã nói hoặc đã đồng ý; mặc định do AI đề xuất phải được xác nhận trước khi ghi.
- **Công cụ mở thẻ điểm xuất phát (mới).** Chỉ mở khi chưa có điểm xuất phát đã xác nhận. Thẻ dùng lại picker điểm xuất phát hiện có (tìm kiếm, ghim, kiểm tra lãnh thổ Việt Nam) và thêm hai ô giờ khởi hành, hạn về, điền sẵn giá trị AI đề xuất, sửa được. Một lần xác nhận cho cả điểm, giờ đi và hạn về.
- **Trạng thái chuyến đi do trình duyệt giữ.** Server không lưu phiên. Kết quả ghi nhận trả về trình duyệt qua một phần dữ liệu riêng; trình duyệt gửi lại ở mỗi lượt; server kiểm lại bằng schema chặt như hiện nay. Không thêm bảng hay migration.
- **Ngữ cảnh gửi mô hình.** Thông tin đã xác nhận (kể cả việc điểm xuất phát đã xác nhận, chỉ gồm tên, giờ đi, hạn về) được đưa vào ngữ cảnh mỗi lượt như dữ liệu, không như chỉ dẫn. Mô hình không bao giờ nhận tọa độ.
- **Cổng bắt buộc ở server giữ nguyên.** Công cụ lập lịch từ chối khi thiếu thông tin đã xác nhận (kể cả điểm xuất phát và giờ), trả danh sách câu hỏi còn thiếu và không tiêu tốn lượt lập lịch.
- **Giá trị AI không được tự đề xuất mặc định:** điểm xuất phát; ngày bắt đầu trong quá khứ; số ngày ngoài 1–14. Được đề xuất mặc định: phương tiện, số ngày, ngày đi gần nhất hợp lý, sở thích, giờ đi/về.
- **Đổi thông tin sau khi có lịch.** AI ghi giá trị mới rồi gọi lại công cụ lập lịch khi thay đổi ảnh hưởng lịch (số ngày, phương tiện, ngày đi, điểm xuất phát, giờ); lịch mới thay lịch cũ. Khi không ảnh hưởng (ví dụ sở thích), AI hỏi lại trước khi lập.
- **Giới hạn mỗi lượt.** Tăng số bước tối đa từ 8 lên 10; giữ tổng 60 giây, tối đa 2 lần lập lịch, 3 lần tìm địa điểm, 3 lần tìm web, 2 lần đọc trang. Bước cuối chỉ ra văn bản.
- **Prompt hệ thống.** Viết lại tiếng Việt: AI dẫn dắt hội thoại, hỏi từng mục, đề xuất mặc định cần xác nhận, giải thích lựa chọn, tự sửa theo kết quả Validator; bỏ chỉ dẫn "nhắc bấm Sửa thông tin".
- **Phạm vi trang.** Chỉ `/assistant/plan`. Cờ tính năng và các lớp bảo vệ hiện có (xác thực, same-origin, giới hạn tần suất, ẩn đầu ra công cụ khỏi trình duyệt) giữ nguyên.
- **Lõi không đổi.** Scheduler, Validator (thiếu dữ liệu không phải PASS), routing, điểm đến DB cộng Google Places chưa kiểm tra, Save qua endpoint lưu hiện có với idempotency SUCCESS/FAILED/UNKNOWN.
- **Tài liệu.** Thêm ADR bổ sung cho ADR-36 ("AI dẫn dắt nhập thông tin, mặc định cần xác nhận, không form") và cập nhật story, tiến độ trước khi code.

## Testing Decisions

- **Test tốt** chỉ kiểm hành vi bên ngoài: yêu cầu vào, luồng stream và dữ liệu ra; không kiểm chi tiết cài đặt.
- **Một điểm kiểm thử duy nhất:** route chat với mô hình giả theo kịch bản. Các tình huống: ghi nhận thông tin chỉ sau khi người dùng nói/đồng ý và từ chối giá trị không hợp lệ; chưa lập lịch khi thiếu điểm xuất phát đã xác nhận; không tự mặc định điểm xuất phát, ngày quá khứ, số ngày ngoài 1–14; lập lại khi đổi thông tin ảnh hưởng lịch và hỏi lại khi không ảnh hưởng; giới hạn 10 bước và 60 giây; mô hình không nhận tọa độ; đầu ra công cụ không lộ ra trình duyệt.
- **Giao diện:** không thêm điểm kiểm thử mới. Thẻ điểm xuất phát dùng lại picker đã có test; test nguồn của client chat và test hộp thoại cũ được viết lại cho khớp luồng mới.
- **Tiền lệ trong repo:** các test route chat, provider, resilience, context và error của module chat; test picker điểm xuất phát.
- **Kiểm tra hoàn tất:** typecheck, vitest của module chat và thành phần chat, `git diff --check`, rà không lộ secret. 51 test lỗi từ trước ở nhóm qa-* và in-trip không tính là hồi quy.

## Out of Scope

- Bộ nhớ dài hạn (pgvector), Supabase, Redis, chuyến bay, khách sạn, thanh toán, Amadeus, BYOK.
- Bỏ hoặc nới Validator, ràng buộc điểm đến trong DB, hay Save idempotent.
- Thay đổi `/trips/new`, `/assistant` và chat hỏi đáp.
- Lưu phiên hội thoại phía server hoặc bảng/migration mới.
- Vá ngoài phạm vi: vấn đề gợi ý tìm kiếm điểm xuất phát (khóa Google Places phía server) được xử lý riêng.

## Further Notes

- Khác tripsage gốc ở ba điểm có chủ đích: mặc định phải được xác nhận; điểm xuất phát bắt buộc (tripsage không cần); lịch luôn đi qua Validator và chỉ lưu khi người dùng bấm Lưu.
- Hai thay đổi nhỏ đã làm trước đó trên nhánh: picker không còn khóa nút xác nhận khi ô tên trống, và ngữ cảnh mô hình báo điểm xuất phát đã xác nhận. Cả hai nên giữ.
- Rủi ro chính: AI hỏi dài dòng hoặc đề xuất mặc định chưa hợp ý (mất tính dự đoán của form); độ trễ và chi phí tăng do nhiều lượt hơn.
- Trước khi code cần chạy lại `/mattpocock-skills:setup-matt-pocock-skills` nếu muốn spec này được đăng lên issue tracker với nhãn `ready-for-agent`.

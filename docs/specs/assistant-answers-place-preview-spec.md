# Spec: Trợ lý trả lời tự nhiên hơn, xem nhanh địa điểm và chọn chỗ nghỉ

Trạng thái: **sẵn sàng cho agent** (ready-for-agent), 2026-11-21.
Phạm vi: trang `/assistant` (chat hợp nhất, luồng tripsage-chat). Nền: các quyết định trong ADR-42/ADR-43 và GLOSSARY (Chosen lodging, Place preview, Lodging suggestion, Planning suggestion, Exact departure date, Indicative departure window, Trip hub).

## Problem Statement

Luồng lập lịch bằng chat đã chạy được, nhưng người dùng thấy trợ lý "cứng nhắc" và "chưa thông minh":

- Trợ lý nhắc lại cùng một lỗi nhiều lượt liền (ví dụ "ngày 01/12/2026 đã ghi nhầm" xuất hiện 5 lượt), xin lỗi lặp lại, và kết mỗi tin bằng hai, ba câu hỏi.
- Người dùng nói "giữa tháng sau" hay "ngày 1 tháng sau" thì trợ lý không tự hiểu, còn trả lời "chưa xác định được tháng hiện tại", bắt người dùng gõ ngày, tháng, năm đầy đủ.
- Nhắn "hi", "hello" hay "tôi muốn thay đổi" thì nhận về thông báo đỏ "Nội dung yêu cầu chưa hợp lệ" thay vì một câu trả lời.
- Người dùng chọn tập kết ở Hà Nội ba lần mà hệ thống vẫn báo "chưa xác nhận được"; lịch cuối cùng vẫn xuất phát từ địa chỉ cũ.
- Lịch có chỗ đọc như máy: "Nghỉ đêm khu vực khu vực hà giang", nghỉ đêm lúc 09:30 hoặc 10:50, ngày đầu "Chưa có điểm phù hợp" dù đó là ngày chạy xe 446 km, tên chỗ nghỉ lặp hai lần, "So với ngân sách 0đ · Vượt …" khi người dùng chưa nói ngân sách, nguồn tài liệu không liên quan gắn vào lượt lập lịch.
- Giao diện chat giãn ngang hết màn hình; thẻ lịch và bảng chi phí lệch hàng, dính chữ ("Kiểm tra lịch trình4 đạt").
- Trợ lý gợi ý chỗ nghỉ từ Google Maps nhưng người dùng không xem được chỗ đó ở đâu, được đánh giá thế nào, mà không rời trang; cũng không chọn được chỗ nghỉ nào cho đêm nào.
- Trợ lý không chủ động hỏi có muốn tìm quán ăn không.

## Solution

- Trợ lý nói như một người tư vấn: mỗi vấn đề nói một lần, mỗi lượt tối đa một câu hỏi, cảnh báo kiểm tra nằm trên thẻ lịch thay vì lặp trong lời văn.
- Trợ lý biết hôm nay là ngày nào (giờ Việt Nam). Ngày tương đối rõ ràng ("ngày 1 tháng sau") được ghi luôn và nói lại; khoảng ngày ("giữa tháng sau") được trợ lý chọn sẵn một ngày cụ thể để người dùng bấm xác nhận hoặc chọn ngày khác.
- Lời chào và yêu cầu mơ hồ luôn nhận được câu trả lời; "tôi muốn thay đổi" được hỏi lại "bạn muốn đổi gì?" kèm nút.
- Chọn điểm tập kết hoạt động ngay lần đầu; lịch không có nghỉ đêm buổi sáng; chuyến ngắn từ xa không bị dồn một ngày chạy xe quá dài mà không được gợi ý điểm tập kết gần hơn.
- Mỗi điểm đến trong danh mục và mỗi gợi ý Google Places có nút **Xem nhanh**: mở khung xem nhanh địa điểm ngay trong trang, có bản đồ, số sao, số lượt đánh giá và link mở Google Maps ở tab mới.
- Mỗi đêm người dùng chọn được tối đa một **chỗ nghỉ đã chọn** từ các gợi ý chỗ nghỉ; lựa chọn được giữ trong đề xuất và lưu cùng chuyến đi; không phải đặt phòng.
- Sau khi có lịch, câu hỏi duy nhất cuối tin là lời mời tìm quán ăn; đồng ý thì trợ lý gắn gợi ý quán ăn vào lịch, mỗi quán cũng xem nhanh được.
- Người dùng chỉ nói muốn đi thì thấy ngay một bản nháp giả định (Hà Nội, 4 ngày 3 đêm, xe máy, thứ Bảy gần nhất), có dòng giả định và một câu hỏi; lưu được sau khi xác nhận nơi xuất phát và ngày đi (ADR-44).
- Mỗi điểm dừng có một dòng "nên làm gì ở đây" từ dữ liệu đã duyệt; sau lịch có tối đa 3 lưu ý.
- Giao diện gọn như các trợ lý chat phổ biến: chữ nhỏ vừa đọc, không thẻ phình, thẻ lịch dạng tab theo ngày, cột hội thoại hẹp, bảng chi phí thẳng hàng, giữ tông màu xanh hiện tại.

## User Stories

### Giọng văn và hội thoại

1. Là du khách, tôi muốn trợ lý chỉ nhắc một lỗi hoặc một lời xin lỗi một lần, để cuộc trò chuyện không lặp như máy.
2. Là du khách, tôi muốn mỗi tin của trợ lý có tối đa một câu hỏi, để tôi biết cần trả lời gì.
3. Là du khách, tôi muốn các câu hỏi phụ (số người, ngân sách, nhịp đi, kiểu chỗ nghỉ) hiện thành nút gợi ý, để trả lời bằng một lần bấm.
4. Là du khách, tôi muốn trợ lý không lặp lại thông tin tôi vừa nói trong mỗi tin, để tin ngắn và dễ đọc.
5. Là du khách, tôi muốn cảnh báo về kiểm tra lịch nằm trên thẻ lịch, còn lời văn chỉ nói một câu, để không bị ngợp chữ.
6. Là du khách, tôi muốn lượt lập lịch không gắn nguồn tài liệu không liên quan, để tin tưởng vào các nguồn được gắn.
7. Là du khách, khi tôi chào "hi" hay "hello", tôi muốn trợ lý chào lại tự nhiên và nhắc tới chuyến đi đang lập, để tôi tiếp tục dễ dàng.
8. Là du khách, khi tôi nhắn "tôi muốn thay đổi", tôi muốn trợ lý hỏi "bạn muốn đổi gì?" kèm nút (ngày đi, số ngày, điểm đến, nơi xuất phát), để tôi không phải đoán cú pháp.
9. Là du khách, tôi muốn không bao giờ thấy thông báo "Nội dung yêu cầu chưa hợp lệ" cho một tin nhắn bình thường, để không nghĩ ứng dụng bị hỏng.

### Ngày khởi hành

10. Là du khách, tôi muốn trợ lý biết hôm nay là ngày nào theo giờ Việt Nam, để hiểu "tháng sau", "tuần sau".
11. Là du khách, khi tôi nói "ngày 1 tháng sau", tôi muốn trợ lý ghi luôn ngày khởi hành cụ thể và nói lại ngày đó trong một câu, để không bị hỏi lại.
12. Là du khách, khi tôi nói một khoảng ("giữa tháng sau", "đầu tháng 12"), tôi muốn trợ lý tự chọn một ngày cụ thể trong khoảng đó và cho tôi nút "Đúng, đi ngày …" và "Chọn ngày khác", để xác nhận bằng một lần bấm.
13. Là du khách, tôi muốn ngày trợ lý chọn từ khoảng chỉ được ghi sau khi tôi bấm xác nhận, để trợ lý không tự quyết thay tôi.
14. Là du khách, tôi muốn trợ lý không bao giờ chọn ngày trong quá khứ, để lịch luôn dùng được.
15. Là du khách, khi tôi đổi ý về ngày, tôi muốn trợ lý chỉ ghi ngày mới, không nhắc ngày cũ đã bị bỏ ở các lượt sau, để cuộc trò chuyện không vướng lỗi cũ.

### Điểm xuất phát và lịch

16. Là du khách ở xa, khi tôi đồng ý tập kết ở Hà Nội, tôi muốn điểm tập kết được xác nhận ngay lần đầu, để không phải bấm lại nhiều lần.
17. Là du khách, tôi muốn lịch lập từ điểm tập kết đã xác nhận chứ không từ địa chỉ cũ, để lịch đúng với kế hoạch đi.
18. Là du khách, tôi muốn không thấy "nghỉ đêm" lúc buổi sáng, để lịch hợp lý.
19. Là du khách, tôi muốn nơi nghỉ đêm được ghi bằng tên khu vực rõ ràng, không lặp chữ, để biết tối đó ở đâu.
20. Là du khách đi chuyến ngắn từ xa, tôi muốn trợ lý gợi ý điểm tập kết gần hơn khi ngày đầu phải chạy xe quá dài, để không mất trọn một ngày trên đường.
21. Là du khách, tôi muốn ngày chỉ có di chuyển được ghi là "Ngày di chuyển" kèm quãng đường và thời gian, thay vì "Chưa có điểm phù hợp", để hiểu ngày đó dùng để làm gì.

### Xem nhanh địa điểm

22. Là du khách, tôi muốn bấm "Xem nhanh" trên một điểm đến trong lịch để mở bản đồ ngay trong trang, để không rời ứng dụng.
23. Là du khách, tôi muốn bấm "Xem nhanh" trên một gợi ý chỗ nghỉ hoặc quán ăn, để thấy nó ở đâu, bao nhiêu sao, bao nhiêu lượt đánh giá.
24. Là du khách, tôi muốn có link "Xem đánh giá đầy đủ trên Google Maps" mở tab mới, để đọc review và xem ảnh khi cần.
25. Là du khách, tôi muốn đóng khung xem nhanh bằng nút đóng, phím Esc hoặc bấm ra ngoài, để quay lại cuộc trò chuyện đúng chỗ đang đọc.
26. Là du khách dùng điện thoại, tôi muốn khung xem nhanh chiếm gần hết màn hình, để xem bản đồ rõ.
27. Là du khách, tôi muốn khung xem nhanh nói rõ thông tin là của Google và chưa được ứng dụng kiểm tra, để không hiểu nhầm là đã xác minh.
28. Là du khách, tôi muốn không thấy nút "Xem nhanh" cho tên địa điểm trợ lý chỉ viết trong lời văn, để không mở nhầm một nơi không có thật.
29. Là du khách dùng bàn phím hoặc trình đọc màn hình, tôi muốn khung xem nhanh nhận focus khi mở và trả focus về nút khi đóng, để dùng được không cần chuột.
30. Là du khách, khi bản đồ không tải được, tôi muốn thấy một dòng báo lỗi và vẫn có link mở Google Maps, để vẫn xem được địa điểm.

### Chọn chỗ nghỉ

31. Là du khách, tôi muốn bấm "Chọn cho đêm N" trên một gợi ý chỗ nghỉ, để ghi nơi tôi định ở đêm đó.
32. Là du khách, tôi muốn có cùng nút đó trong khung xem nhanh, để chọn ngay sau khi xem.
33. Là du khách, tôi muốn chọn một chỗ khác cho cùng đêm thì chỗ cũ tự bỏ, để mỗi đêm chỉ có một chỗ nghỉ đã chọn.
34. Là du khách, tôi muốn bấm lại vào chỗ đã chọn để bỏ chọn, để đổi ý dễ dàng.
35. Là du khách, tôi muốn chỗ nghỉ đã chọn được đánh dấu rõ trong timeline, để nhìn lại biết mình đã chọn gì.
36. Là du khách, tôi muốn chỗ nghỉ đã chọn được lưu cùng chuyến đi khi tôi bấm Lưu, để mở lại chuyến vẫn thấy.
37. Là du khách, tôi muốn biết chọn chỗ nghỉ không phải là đặt phòng, để tự liên hệ đặt.
38. Là du khách, tôi muốn việc chọn chỗ nghỉ không làm đổi giờ giấc, kết quả kiểm tra hay bảng chi phí, để lịch không bị xáo trộn.
39. Là du khách, khi lịch được lập lại và một đêm không còn tồn tại, tôi muốn chỗ nghỉ đã chọn cho đêm đó bị bỏ, để không lưu một lựa chọn không còn đúng.
40. Là du khách, tôi muốn tên chỗ nghỉ hiện một lần kèm khoảng cách, không lặp tên, để danh sách gọn.

### Gợi ý quán ăn

41. Là du khách, sau khi có lịch, tôi muốn trợ lý hỏi "Bạn có muốn mình tìm thêm quán ăn gần các điểm dừng không?", để chủ động nhận gợi ý ăn uống.
42. Là du khách, khi tôi đồng ý, tôi muốn trợ lý tìm quán ăn quanh điểm nghỉ trưa và điểm cuối ngày rồi gắn vào lịch, để biết ăn ở đâu.
43. Là du khách, tôi muốn gợi ý quán ăn được đánh dấu là chưa kiểm tra, để không hiểu nhầm là đã xác minh.
44. Là du khách, tôi muốn mỗi quán ăn gợi ý đều mở được khung xem nhanh, để xem đánh giá trước khi đi.
45. Là du khách, khi tôi từ chối, tôi muốn trợ lý không hỏi lại về quán ăn trong chuyến đó, để không bị làm phiền.

### Chi phí và giao diện

46. Là du khách chưa nói ngân sách, tôi muốn không thấy dòng "So với ngân sách 0đ", để bảng chi phí không báo vượt vô lý.
47. Là du khách, tôi muốn cột hội thoại có chiều rộng vừa đọc trên màn hình lớn, để không phải đảo mắt ngang cả màn hình.
48. Là du khách, tôi muốn thẻ lịch có tiêu đề từng ngày gọn, phần kiểm tra lịch thẳng hàng, không dính chữ, để đọc nhanh.
49. Là du khách, tôi muốn bảng chi phí có các cột thẳng hàng, số tiền căn phải, để so sánh dễ.
50. Là du khách, tôi muốn giao diện giữ tông xanh quen thuộc của ứng dụng, để không thấy lạ.
51. Là du khách dùng điện thoại, tôi muốn thẻ lịch, bảng chi phí và khung xem nhanh không bị tràn ngang, để dùng được trên màn hình hẹp.

### Bản nháp giả định (ADR-44)

52. Là du khách, khi tôi chỉ nói "lập hành trình Hà Giang", tôi muốn thấy ngay một lịch mẫu trong cùng lượt, để hình dung chuyến đi trước khi trả lời câu hỏi.
53. Là du khách, tôi muốn trợ lý nói rõ nó đang giả định gì (Hà Nội, 4 ngày 3 đêm, xe máy, ngày đi) trong một dòng, để biết cần sửa gì.
54. Là du khách, tôi muốn sau bản nháp chỉ bị hỏi một câu về giả định quan trọng nhất, các giả định khác là nút, để trả lời nhanh.
55. Là du khách, tôi muốn không lưu được bản nháp khi nơi xuất phát hoặc ngày đi còn là giả định, và được nói rõ cần xác nhận gì, để không lưu nhầm một chuyến không phải của mình.

### Giao diện gọn

56. Là du khách, tôi muốn chữ trong chat nhỏ gọn vừa đọc, không to và phình, để nhìn được nhiều nội dung hơn.
57. Là du khách, tôi muốn tin của trợ lý là văn bản trên nền trang chứ không bọc trong thẻ to, để giao diện nhẹ nhàng.
58. Là du khách, tôi muốn thẻ lịch có tab theo ngày, để xem từng ngày mà không cuộn dài.
59. Là du khách, tôi muốn mỗi ngày là một timeline dọc có giờ, tên điểm và dòng mô tả, để đọc lịch như một câu chuyện.

### Mô tả điểm dừng và lưu ý

60. Là du khách, tôi muốn mỗi điểm dừng có một dòng "nên làm gì ở đây", để biết tới đó làm gì.
61. Là du khách, tôi muốn dòng mô tả lấy từ dữ liệu đã duyệt, để không bị dẫn sai.
62. Là du khách, tôi muốn sau lịch có tối đa 3 lưu ý về thời điểm, phương tiện và đặt chỗ, để chuẩn bị tốt hơn.
63. Là du khách, tôi muốn lưu ý không nêu tên khách sạn, giá hay tình trạng phòng, để không hiểu nhầm là đã kiểm tra.

## Implementation Decisions

### Giọng văn (prompt hệ thống tripsage-chat)

- Thêm vào chỉ dẫn hệ thống các quy tắc: một vấn đề hoặc lời xin lỗi chỉ nói một lần trong cả cuộc trò chuyện; mỗi lượt tối đa một câu hỏi, các câu hỏi phụ chuyển thành `suggestReplies`; không lặp lại thông tin người dùng vừa nêu; cảnh báo kiểm tra nói tối đa một câu vì thẻ lịch đã hiển thị chi tiết.
- Chỉ dẫn "hỏi cụm 2" sau khi có lịch được thay bằng: câu hỏi cuối là lời mời tìm quán ăn; số người, nhịp đi, ngân sách, kiểu chỗ nghỉ đưa vào `suggestReplies`.
- Nguồn tài liệu chỉ được gắn vào tin khi lượt đó thực sự dùng `lookupLocalKnowledge` và nội dung trả lời dựa vào nguồn đó; lượt chỉ lập lịch không gắn nguồn.
- Lời văn vẫn không được tự đặt giờ, tên địa điểm ngoài dữ liệu tool, giá hay tình trạng phòng (giữ nguyên ranh giới hiện có).

### Ngày hôm nay và ngày tương đối

- Ngữ cảnh hệ thống mỗi lượt có thêm dòng "Hôm nay: <thứ>, <dd/mm/yyyy> (giờ Việt Nam)", lấy từ đồng hồ server được tiêm (cùng nguồn `now` đang dùng cho planning), không lấy từ client.
- Ngày tương đối rõ ràng: model tự quy đổi rồi ghi bằng `recordTripInfo` và nói lại ngày trong một câu.
- Khoảng ngày (Indicative departure window): model chọn một ngày cụ thể trong khoảng, không ghi; trả `suggestReplies` gồm "Đúng, đi <dd/mm/yyyy>" và "Chọn ngày khác". Chỉ ghi khi người dùng đồng ý ở lượt sau.
- Validation phía server của `recordTripInfo` giữ nguyên: từ chối ngày quá khứ theo giờ Việt Nam.
- Khi một ngày đã bị người dùng bỏ, ngữ cảnh không còn mang ngày đó; prompt cấm nhắc lại lỗi cũ khi đã có ngày mới.

### Lỗi 400 với tin nhắn ngắn

- Chẩn đoán trước khi sửa: tái hiện "hi", "hello", "tôi muốn thay đổi" trong một cuộc trò chuyện đã có lịch và xác định điều kiện nào trong bước phân tích request (tin nhắn, journey, trip info, itinerary, access leg, conversation id, message id) ném lỗi đầu vào không hợp lệ.
- Sửa ở gốc trong phần phân tích request hoặc phía client gửi request; không nới lỏng ranh giới bảo mật (same-origin, JSON, giới hạn kích thước, auth).
- Kết quả: mọi tin nhắn văn bản hợp lệ trong giới hạn ký tự đều đi tới model.

### Lỗi lập lịch (chẩn đoán trước, sửa ở gốc)

- Xác nhận điểm tập kết: `confirmOrigin` với hub cố định (Hà Nội, TP Hà Giang) phải thành công ở lượt người dùng đồng ý hoặc bấm nút; lịch tiếp theo dùng điểm tập kết làm nơi xuất phát của phần lịch được kiểm tra.
- Nghỉ đêm không được đặt trước giờ kết thúc tham quan trong ngày khi ngày đó còn thời gian; nếu ngày kết thúc sớm vì hết điểm phù hợp, timeline ghi rõ "tự do buổi chiều" thay vì "nghỉ đêm" lúc buổi sáng.
- Nhãn khu vực nghỉ đêm không lặp từ "khu vực" và dùng tên khu vực của điểm cuối ngày.
- Khi chặng đầu từ nơi xuất phát chiếm gần trọn ngày 1 của chuyến ngắn, `proposeItinerary` trả `hubHint` để trợ lý gợi ý tập kết ở TP Hà Giang.

### Xem nhanh địa điểm (Place preview)

- Component modal dùng chung trên trang chat, nhận một trong hai: điểm đến trong danh mục (tọa độ và URL Google Maps đã xác minh nếu có) hoặc gợi ý có `place_id` Google.
- Nội dung: iframe Maps Embed API chế độ place (`q=place_id:<id>` cho gợi ý Google; tọa độ hoặc tên + địa chỉ cho điểm đến trong danh mục), dùng khóa trình duyệt hiện có. Không gọi Places Details, không có backend mới.
- Link "Xem đánh giá đầy đủ trên Google Maps" mở tab mới với `noopener noreferrer`; URL dựng từ `place_id` hoặc URL đã xác minh, không từ chữ model viết.
- Ghi chú nguồn: "Thông tin từ Google Maps, ứng dụng chưa kiểm tra".
- Nút "Xem nhanh" chỉ render khi dữ liệu có tọa độ hợp lệ hoặc `place_id`; không bao giờ render cho tên trong lời văn.
- Trợ năng: role dialog, có nhãn, bẫy focus, Esc để đóng, trả focus về nút mở. Trên màn hình hẹp hiển thị gần toàn màn hình.
- Lối nâng cấp sau (ngoài phạm vi): thẻ riêng dùng Places Details để hiện ảnh và review.
- Yêu cầu vận hành: Maps Embed API phải được bật cho khóa trình duyệt và khóa giới hạn theo domain production và localhost. Khóa routing Stadia và khóa Google phía server không bao giờ xuất hiện trong trình duyệt.

### Chỗ nghỉ đã chọn (Chosen lodging)

- Trạng thái đề xuất có thêm ánh xạ "đêm N → place_id + tên" cho các gợi ý chỗ nghỉ; mỗi đêm tối đa một mục. Chọn mục khác thì thay; chọn lại mục đang chọn thì bỏ.
- Chọn hoặc bỏ chọn diễn ra ở client trên trạng thái đề xuất, không gọi model, không đổi fingerprint lịch, không chạy lại Validator, không đổi bảng chi phí.
- Khi lịch được lập lại, các lựa chọn cho đêm không còn tồn tại bị bỏ.
- Chỉ chọn được trong danh sách gợi ý chỗ nghỉ hệ thống đã gắn vào đêm đó.
- Lưu chuyến: payload lưu mang danh sách chỗ nghỉ đã chọn; server phân giải lại từng `place_id` bằng resolver Google Place Details hiện có (giới hạn số place mỗi lần lưu như hiện tại), upsert `ExternalPlace`, rồi ghi liên kết chuyến – đêm – ExternalPlace. Đây là liên kết mới, không phải lượt tham quan.
- Schema: một model mới cho chỗ nghỉ đã chọn của chuyến, gồm chuyến, số thứ tự đêm, ExternalPlace; duy nhất theo (chuyến, đêm); thêm bằng Prisma migration.
- Lưu giữ hợp đồng SUCCESS / FAILED / UNKNOWN và idempotency hiện có: gửi lại cùng payload và key cho cùng kết quả.
- Nếu không phân giải được place khi lưu: lưu chuyến vẫn theo luật hiện có cho external place không phân giải được, và báo rõ chỗ nghỉ nào không lưu được; không âm thầm bỏ.
- Chủ sở hữu chuyến là người duy nhất ghi lựa chọn; kiểm tra quyền ở server.

### Gợi ý quán ăn

- Dùng lại `searchPlaces` (gần điểm theo id điểm đến trong DB) và `addSuggestions` loại MEAL hiện có; không thêm tool mới.
- Khi người dùng đồng ý: tìm 1–2 quán cho slot nghỉ trưa từng ngày và quanh điểm cuối ngày; gợi ý được đánh dấu chưa kiểm tra và có `place_id` để xem nhanh.
- Khi người dùng từ chối: ghi nhận trong ngữ cảnh chuyến để không hỏi lại.

### Bản nháp giả định (ADR-44)

- Khi người dùng muốn lập lịch mà chưa đủ thông tin, trợ lý lập bản nháp giả định ngay trong lượt: hub cố định Hà Nội, 4 ngày 3 đêm, xe máy, ngày đi là thứ Bảy gần nhất hợp lý tính từ hôm nay theo giờ Việt Nam. Giá trị người dùng đã nói thay cho giả định.
- Trip info mang dấu "giả định" theo từng trường; dòng tóm tắt nhu cầu và lời văn hiển thị giả định. Nơi xuất phát giả định do server dựng từ hub, không qua tìm địa chỉ; ngày giả định do server tính.
- Bản nháp đi qua scheduler và Validator như mọi đề xuất.
- Lưu bị chặn ở server khi nơi xuất phát hoặc ngày đi còn là giả định; thông báo nêu trường cần xác nhận. Đổi nơi xuất phát vẫn theo xác nhận trong chat của ADR-43.
- Sau bản nháp: một dòng giả định, một câu hỏi về giả định quan trọng nhất, các giả định khác thành `suggestReplies`. Lời mời tìm quán ăn để tới lượt không còn giả định quan trọng.

### Mô tả điểm dừng và lưu ý

- Kết quả lập lịch trả về mỗi lượt tham quan kèm mô tả ngắn lấy từ danh mục điểm đến khi có; không có thì không hiện, không bịa.
- Model có thể diễn đạt lại mô tả qua gợi ý kèm lịch; giờ và tên điểm vẫn do hệ thống.
- Khối "Vài lưu ý" tối đa 3 ý, mỗi ý có căn cứ từ tài liệu đã duyệt hoặc thời tiết; không tên khách sạn, giá, tình trạng phòng.

### Hiển thị và UI

- Phong cách gọn như các trợ lý chat phổ biến: chữ thân khoảng 15px, dòng 1.55; tin trợ lý là văn bản trên nền trang, tin người dùng là bong bóng nhỏ; bớt padding, bo góc, bóng; cỡ chữ và khoảng cách đặt qua token dùng chung.
- Thẻ lịch có tab theo ngày (tablist có bàn phím); mỗi tab là timeline dọc: giờ, chấm và đường dọc, tên điểm, dòng mô tả xám.
- Giữ token màu xanh hiện tại; cột hội thoại giới hạn khoảng 720px và căn giữa.
- Timeline: ngày không có lượt tham quan và có chặng đi được ghi "Ngày di chuyển · <km> · ~<giờ>"; tên gợi ý chỗ nghỉ hiện một lần, khoảng cách đi kèm.
- Khối kiểm tra lịch: nhãn và số đạt/cần xem lại cách nhau, "Xem chi tiết" thẳng hàng.
- Bảng chi phí: cột thẳng hàng, số tiền căn phải; dòng so với ngân sách chỉ hiện khi người dùng đã có ngân sách lớn hơn 0.
- Bố cục không tràn ngang ở chiều rộng 375px.

## Testing Decisions

- Test tốt chỉ kiểm hành vi bên ngoài: request vào và stream ra của route chat, HTML/ARIA render ra của component, dữ liệu trong DB sau khi lưu. Không kiểm tên hàm nội bộ hay chuỗi prompt nguyên văn, trừ việc ngữ cảnh có chứa ngày hôm nay.
- Seam 1, route chat với model giả lập theo kịch bản (giống các test agent tripsage-chat hiện có):
  - ngữ cảnh gửi cho model có ngày hôm nay theo giờ Việt Nam từ đồng hồ được tiêm;
  - "hi", "hello", "tôi muốn thay đổi" trong cuộc trò chuyện đã có lịch trả stream, không 400;
  - `recordTripInfo` với ngày quá khứ bị từ chối; với 01/12/2026 khi hôm nay là 21/11/2026 thì được ghi;
  - xác nhận hub Hà Nội bằng `confirmOrigin` thành công ở lượt đồng ý và lịch kế tiếp xuất phát từ hub;
  - kịch bản đồng ý tìm quán ăn dẫn tới `searchPlaces` và `addSuggestions` MEAL, và các gợi ý xuất hiện trong phần trả về;
  - lượt chỉ lập lịch không mang nguồn tài liệu;
  - tin "lập hành trình" không kèm thông tin dẫn tới `proposeItinerary` ngay trong lượt với giá trị giả định được đánh dấu; lưu bị từ chối khi còn giả định;
  - kết quả lập lịch mang mô tả từ danh mục cho các điểm có mô tả.
- Seam 2, render test component kết quả (giống test result cards, external place view, timeline hiện có):
  - nút Xem nhanh có cho điểm trong danh mục có tọa độ và gợi ý có `place_id`, không có cho mục thiếu cả hai;
  - khung xem nhanh có role dialog, iframe đúng URL embed, link Google Maps đúng; Esc đóng và trả focus;
  - "Chọn cho đêm N": chọn, thay, bỏ chọn; mỗi đêm tối đa một;
  - ngày chỉ di chuyển hiện "Ngày di chuyển"; không có "khu vực khu vực"; tên chỗ nghỉ không lặp;
  - dòng ngân sách ẩn khi ngân sách bằng 0 hoặc chưa có.
- Seam 3, lưu chuyến (test lưu tripsage-chat hiện có và integration Postgres):
  - chỗ nghỉ đã chọn được lưu theo đêm qua ExternalPlace và đọc lại đúng;
  - gửi lại cùng payload và idempotency key cho cùng kết quả, không tạo bản ghi trùng;
  - place không phân giải được được báo rõ;
  - người không phải chủ chuyến không ghi được.
  - Kiểm tra trạng thái migration sau khi thêm model.
- Giọng văn không test tự động được với model thật: bước kiểm thử hồi quy chạy lại hai đoạn chat mẫu (TP.HCM → tập kết Hà Nội, 5 ngày 4 đêm; Thanh Hóa, 3 ngày, "ngày 1 tháng sau", "hi", "tôi muốn thay đổi") trên trình duyệt, chụp ảnh trước và sau, ở 1440px và 375px.
- Chạy typecheck, build, vitest của các module chạm tới, và `git diff --check`.

## Out of Scope

- Đặt phòng, giá phòng, phòng trống hoặc bất kỳ giao dịch nào.
- Thẻ địa điểm riêng dùng Places Details (ảnh, nội dung review); để nâng cấp sau.
- Chọn chỗ nghỉ bằng cách gõ chat ("chọn Tom Homestay").
- Chọn quán ăn (quán ăn chỉ là gợi ý, không lưu lựa chọn).
- Đổi tông màu hoặc thiết kế lại toàn bộ trang trợ lý.
- Đổi model AI hoặc cấu hình reasoning.
- Luồng hỏi đáp điểm đến ở khung trợ lý theo điểm đến (contextual assistant panel), ngoài những gì dùng chung component.

## Further Notes

- Bằng chứng gốc: đoạn chat production `kltn-rho.vercel.app/assistant` ngày 21/11/2026 và ảnh chụp người dùng gửi (Thanh Hóa, 3 ngày).
- Thuật ngữ mới đã ghi vào GLOSSARY: Chosen lodging (chỗ nghỉ đã chọn), Place preview (xem nhanh địa điểm), Assumed draft (bản nháp giả định).
- ADR-44 (2026-11-22) ghi quyết định "lập bản nháp giả định trước, hỏi sau", sửa tình huống A của ADR-43.
- Ảnh tham chiếu phong cách: người dùng gửi ảnh một trợ lý chat chung hiển thị lịch mẫu dạng tab theo ngày, chữ nhỏ gọn, mỗi điểm một dòng mô tả và khối lưu ý. Chỉ dùng làm tham chiếu mật độ và bố cục, không sao chép thương hiệu.
- Maps Embed API miễn phí theo hiểu biết hiện tại; phí Places Details theo SKU (Enterprise cho rating/review/ảnh) cần kiểm lại trên trang giá Google trước khi nâng cấp.
- Việc người dùng phải làm: bật Maps Embed API cho khóa trình duyệt và kiểm tra giới hạn referrer.

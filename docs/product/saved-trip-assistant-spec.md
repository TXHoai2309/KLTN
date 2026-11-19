# Spec — Trợ lý chuyến đi hợp nhất & Tư vấn hành trình thông minh (`Saved-trip assistant`)

**Trạng thái: SPEC / PLAN ONLY — 2026-11-19 (`ready-for-agent`).** Tổng hợp từ phỏng vấn thiết kế **Q1–Q10** (2026-11-19), hệ thuật ngữ miền trong `GLOSSARY` và quyết định kiến trúc `ADR-38` (kế thừa `ADR-37`, mở rộng phạm vi thời tiết `ADR-36`). Tài liệu này là hợp đồng đặc tả sản phẩm và kỹ thuật; chưa tự động kích hoạt lập trình, tạo migration hay triển khai hệ thống cho đến khi chủ dự án yêu cầu.

---

## Problem Statement

Người dùng sở hữu một chuyến đi đã lưu (`Saved itinerary`) hiện gặp bốn rào cản lớn khi muốn nhờ AI tư vấn hoặc chỉnh sửa hành trình:

1. **Hai luồng chỉnh sửa chuyến đi bị chia cắt và mâu thuẫn nhau:** Trên trang chi tiết chuyến đi hiện tồn tại đồng thời hai lối vào rời rạc ("Chỉnh sửa hành trình" và "Trợ lý trong chuyến đi"). Màn hình trợ lý trong chuyến đi chạy luồng cũ chỉ xử lý từng thao tác đơn lẻ trực tiếp trên cơ sở dữ liệu, bắt xác nhận hoặc hủy ngay lập tức (không thể chỉnh 2–3 bước nối tiếp), từ chối toàn bộ chuyến đi có địa điểm ngoài danh mục với lỗi hệ thống, không thấy được các thay đổi của `nơi xuất phát` (`Trip origin`), không có bản đồ/timeline tương tác trực tiếp và luôn ép bật GPS ngay cả khi người dùng chỉ muốn đổi giờ hay thay điểm trong ngày.
2. **Thanh AI trên màn hình chỉnh sửa chỉ trả lời máy móc, thiếu khả năng suy luận và tư vấn thông minh:** Khi người dùng hỏi những câu rất tự nhiên như *"Tôi đi thế này được không?"*, *"Có nên đi như này không?"*, hay *"Sáng đến nơi muốn nghỉ ngơi đến 9h mới đi thì nên chỉnh sửa chuyến đi như nào cho hợp lý?"*, thanh AI hiện tại chỉ ghép vài câu mẫu cố định đếm số điểm và số lỗi. Nó không biết phân tích độ hợp lý của nhịp độ di chuyển, không biết mô phỏng thử các phương án tháo gỡ khi lùi giờ làm kẹt điểm cuối ngày, và không thể giải thích tự nhiên lý do nên hay chưa nên đi theo phương án nào.
3. **Không xử lý được toàn diện các nhóm câu hỏi thực tế trong chuyến đi:** Người dùng đang xem hoặc sửa lịch trình thường hỏi xen kẽ nhiều nhu cầu: vừa hỏi đánh giá lịch, vừa hỏi giải pháp khi mệt/đến trễ/muốn có `khoảng nghỉ trong lịch` (`Schedule rest buffer`), vừa muốn AI gợi ý đổi sang địa điểm khác hợp lý hơn, vừa hỏi kinh nghiệm ăn nghỉ/văn hóa địa phương, lại vừa hỏi `dự báo thời tiết` (`Destination forecast`) hay `giờ mặt trời` (`Sun times`) của ngày đi. Luồng hiện tại tách rời các khả năng này khiến AI trả lời "không hỗ trợ" hoặc làm đứt mạch chỉnh sửa.
4. **Ranh giới giữa "hỏi ý kiến tư vấn" và "sửa lịch trình" chưa có cầu nối 1 chạm:** Khi nhận được một lời khuyên từ AI, người dùng không có sẵn các thẻ phương án đã được hệ thống kiểm chứng để bấm áp dụng ngay vào `bản nháp chỉnh sửa` (`Edit draft`), mà phải tự đi sửa tay từng giờ hoặc gõ lại lệnh mới cho AI.

Người dùng cần một **`Trợ lý chuyến đi` (`Saved-trip assistant`) hợp nhất, thông minh và đáng tin cậy**: bê toàn bộ sức mạnh và luật bảo vệ của luồng chỉnh sửa thao tác tay sang không gian trợ lý AI, trả lời thông minh mọi tình huống câu hỏi dựa trên dữ liệu kiểm chứng thật của hệ thống, và cho phép phối hợp mượt mà giữa trò chuyện với AI, bấm áp dụng gợi ý 1 chạm và tinh chỉnh trực tiếp trên timeline/bản đồ trước khi xác nhận lưu một lần.

---

## Solution

Hợp nhất luồng chỉnh sửa hành trình và luồng trợ lý trong chuyến đi thành một không gian làm việc **`Trợ lý chuyến đi` (`Saved-trip assistant`)** duy nhất vận hành trên một **`bản nháp chỉnh sửa` (`Edit draft`)** dùng chung:

- **Một không gian hợp nhất choทั้ง AI và thao tác tay:** Cả hai lối vào chỉnh sửa và trợ lý trong chuyến đi đều dẫn về cùng một không gian làm việc có **Khung hội thoại Trợ lý AI hoàn chỉnh** đặt song hành với **Timeline `bản nháp chỉnh sửa`** và **Bản đồ lộ trình tương tác** (trên di động chuyển đổi qua 3 tab `Trợ lý AI` | `Lịch trình` | `Bản đồ`).
- **Đầy đủ 100% năng lực và luật bảo vệ của luồng sửa tay trong Trợ lý AI:** Trợ lý AI đọc và thao tác trực tiếp trên `bản nháp chỉnh sửa` cộng dồn nhiều lượt (kèm lịch sử `Hoàn tác` / `Làm lại` từng bước), hỗ trợ tới 50 `lượt tham quan` (`Scheduled visit`) toàn chuyến (không giới hạn 4 điểm/ngày), thực hiện nhiều thao tác gộp trong một câu kèm tự động dời giờ dây chuyền (`auto-shift`), chỉnh `nơi xuất phát` (`Trip origin`) và giờ khởi hành/hạn về khi chuyến chưa bắt đầu, bảo toàn/điều chỉnh các địa điểm ngoài danh mục hiện có kèm xác nhận mục chưa kiểm khi lưu, bảo vệ các lượt đã qua giờ khi chuyến đang diễn ra, khóa sửa chuyến đã hoàn thành, và hỗ trợ Rebase khi xung đột phiên bản.
- **Chỉ yêu cầu GPS khi thực sự cần cho vị trí đang đứng:** Bỏ quy tắc ép bật GPS cứng nhắc; chỉ hỏi quyền GPS hoặc vị trí thủ công khi chuyến đi đang diễn ra và câu hỏi của người dùng thực sự phụ thuộc vào vị trí thực tế đang đứng.
- **Kiến trúc AI 2 bước (Mô phỏng kiểm tra thật trên Server → LLM Soạn lời tư vấn tự nhiên) xử lý trọn vẹn 7 nhóm câu hỏi:**
  1. *Đánh giá tổng thể / độ hợp lý của lịch trình.*
  2. *Tình huống muốn nghỉ ngơi (`khoảng nghỉ trong lịch`), đến sớm/muộn, đi chậm hoặc đổi nhịp độ.*
  3. *Tư vấn đổi / thêm điểm đến thông minh (gợi ý tối đa 3 điểm công khai trong danh mục KLTN khớp khu vực, giờ mở cửa, thời lượng và thời tiết).*
  4. *Lệnh chỉnh sửa trực tiếp đơn lẻ hoặc chuỗi nhiều thao tác.*
  5. *Câu hỏi kép vừa hỏi đánh giá vừa nhờ chỉnh sửa luôn.*
  6. *Hỏi thông tin điểm đến, văn hóa, kinh nghiệm ăn nghỉ địa phương (kết hợp RAG tài liệu đã duyệt và `Kiến thức mở rộng` có gắn nhãn).*
  7. *Hỏi `dự báo thời tiết`, `giờ mặt trời` và tiến độ `lượt tham quan` tiếp theo của chuyến đi.*
- **Thẻ `gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`) áp dụng 1 chạm:** Khi AI trả lời `tư vấn theo lịch hiện tại` (`Planning guidance`), hệ thống giữ nguyên `bản nháp chỉnh sửa` không tự ý biến đổi, đồng thời đính kèm tối đa 2 thẻ phương án đã được server chạy thử `kiểm tra tính hợp lệ` (`Itinerary validation`) để người dùng bấm áp dụng ngay vào bản nháp trong 1 chạm mà không cần gọi lại LLM.

---

## User Stories

1. As a Trip owner, I want cả hai lối vào "Chỉnh sửa hành trình" và "Trợ lý trong chuyến đi" từ trang chi tiết chuyến đi đều mở cùng một không gian `Trợ lý chuyến đi` (`Saved-trip assistant`), so that tôi không bị phân mảnh giữa hai màn hình sửa lịch khác nhau.
2. As a Trip owner, I want khi truy cập qua đường dẫn trợ lý trong chuyến đi thì khung hội thoại Trợ lý AI được mở và đặt tiêu điểm sẵn bên cạnh timeline và bản đồ, so that các liên kết hoặc thói quen sử dụng cũ vẫn hoạt động tự nhiên.
3. As a Trip owner, I want mọi chỉnh sửa qua hội thoại AI, bấm thẻ gợi ý hay thao tác tay trực tiếp đều cập nhật lên cùng một `bản nháp chỉnh sửa` (`Edit draft`) duy nhất, so that tôi có thể vừa trò chuyện với AI vừa tự tinh chỉnh giờ trước khi bấm lưu một lần.
4. As a Trip owner, I want hoàn tác (`Undo`) và làm lại (`Redo`) từng bước chỉnh sửa bất kể bước đó đến từ AI, từ thẻ gợi ý tư vấn hay từ thao tác tay, so that tôi thoải mái thử nghiệm các phương án mà không sợ làm hỏng lịch.
5. As a Trip owner, I want khung hội thoại Trợ lý chuyến đi ghi nhớ tới 16 lượt trao đổi gần nhất trong phiên làm việc kèm trạng thái mới nhất của `bản nháp chỉnh sửa`, so that tôi có thể hỏi nối tiếp nhiều câu mà AI vẫn hiểu mạch ngữ cảnh.
6. As a Trip owner, I want hỏi AI các câu đánh giá tổng thể như *"Tôi đi thế này được không?"*, *"Lịch Ngày 1 có gấp quá không?"*, *"Có nên đi theo thứ tự này không?"* và nhận được lời phân tích tự nhiên, thông minh dựa trên tổng thời gian di chuyển, thời gian tham quan, giờ kết thúc ngày, giờ mở cửa, giờ mặt trời và thời tiết mà không làm tự động thay đổi `bản nháp chỉnh sửa`, so that tôi nắm rõ ưu/nhược điểm của lịch hiện tại.
7. As a Trip owner, I want khi AI chỉ ra điểm bất hợp lý trong câu trả lời `tư vấn theo lịch hiện tại` (`Planning guidance`), AI đính kèm ngay 1–2 thẻ `gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`) đã được kiểm tra thử trên server, so that tôi có giải pháp khả thi ngay trước mắt.
8. As a Trip owner, I want bấm nút "Áp dụng phương án này vào bản nháp" trên thẻ `gợi ý chỉnh sửa từ tư vấn` để đổ ngay phương án đó lên `bản nháp chỉnh sửa` (cập nhật timeline, bản đồ và lịch sử Hoàn tác) mà không phải chờ gọi lại AI, so that việc chốt một lời khuyên diễn ra tức thì.
9. As a Trip owner, I want trình bày các tình huống cần nghỉ ngơi hoặc thay đổi giờ giấc như *"Sáng đến nơi muốn nghỉ ngơi ăn sáng đến 9h mới đi thì nên chỉnh sửa chuyến đi như nào cho hợp lý?"* hoặc *"Mình dậy muộn / xuất phát trễ 2 tiếng"*, so that AI tính toán giúp tôi `khoảng nghỉ trong lịch` (`Schedule rest buffer`) hợp lý thay vì coi đó là yêu cầu đặt khách sạn hay thêm một điểm tham quan giả.
10. As a Trip owner, I want hệ thống tự động mô phỏng thử (`dry-run`) việc lùi giờ bắt đầu và dời giờ dây chuyền các `lượt tham quan` phía sau khi tôi hỏi phương án nghỉ ngơi hoặc đi trễ, so that AI biết chính xác việc lùi giờ có làm các điểm cuối ngày bị đóng cửa, quá giờ hoàng hôn, lố qua nửa đêm hay trễ hạn về hay không.
11. As a Trip owner, I want khi việc lùi giờ để nghỉ ngơi làm kẹt các điểm cuối ngày, AI giải thích rõ điểm nào bị vi phạm và đề xuất tới 2 phương án tháo gỡ cụ thể (chẳng hạn rút ngắn thời lượng tham quan trong ngưỡng tối thiểu cho phép, hoặc dời/bỏ điểm cuối ngày sang ngày khác) kèm thẻ bấm áp dụng, so that tôi chọn được cách điều chỉnh ưng ý nhất.
12. As a Trip owner, I want nói *"Tôi muốn đổi địa điểm này"* hoặc *"Có chỗ nào khác hợp hơn không?"* và được AI gợi ý tối đa 3 `lựa chọn điểm đến` (`Destination option`) công khai trong danh mục KLTN khớp nhất với khu vực của ngày đó, khung giờ mở cửa, quỹ thời gian và thời tiết, kèm lời giải thích vì sao từng điểm phù hợp, so that tôi chọn được điểm thay thế tốt nhất mà không phải tự tìm kiếm thủ công.
13. As a Trip owner, I want bấm chọn trực tiếp lên thẻ điểm đến mà AI gợi ý để thay thế hoặc thêm ngay vào `bản nháp chỉnh sửa` kèm giờ bắt đầu và thời lượng hợp lý, so that thao tác đổi điểm trong chat chỉ mất một chạm.
14. As a Trip owner, I want ra lệnh cho AI thực hiện nhiều thao tác chỉnh sửa cùng lúc trong một câu (ví dụ *"Đổi giờ xuất phát sang 07:30, thay điểm đầu Ngày 1 bằng Dốc Thẩm Mã, lùi giờ đi lúc 09:00 và tự dời giờ các điểm sau"*), so that tôi tái cấu trúc cả buổi hoặc cả ngày nhanh chóng.
15. As a Trip owner, I want đặt câu hỏi kép vừa hỏi ý kiến vừa yêu cầu sửa luôn (ví dụ *"Ngày 2 đi thế này có bị muộn giờ đóng cửa không, nếu muộn thì xếp lại giúp tôi luôn"*), để AI vừa giải thích rõ nguyên nhân vừa áp dụng phương án sửa lên `bản nháp chỉnh sửa` kèm nút Hoàn tác 1 chạm, so that tôi không phải hỏi làm hai lượt.
16. As a Trip owner, I want hỏi thông tin văn hóa, lịch sử, đặc sản hoặc kinh nghiệm ăn nghỉ tại các khu vực trong chuyến đi (ví dụ *"Sáng đến Quản Bạ nghỉ ăn sáng ở khu vực nào tiện?"*, *"Dinh Vua Mèo có gì đặc sắc?"*) ngay trong khung Trợ lý chuyến đi và nhận câu trả lời dựa trên RAG tài liệu đã duyệt cùng `Kiến thức mở rộng` (`Knowledge expansion`) có gắn nhãn rõ ràng, so that tôi được giải đáp mọi thắc mắc thực tế mà không làm gián đoạn bản nháp đang chỉnh.
17. As a Trip owner, I want hỏi trực tiếp về `dự báo thời tiết` (`Destination forecast`), `thời tiết lúc có mặt` (`Visit-time weather`) và `giờ mặt trời` (`Sun times`) của các ngày hoặc điểm dừng trong chuyến đi (ví dụ *"Ngày mai đi Mã Pì Lèng có mưa hay sương mù không, mấy giờ mặt trời lặn?"*), so that AI trả lời bằng số liệu dự báo thực tế và gợi ý điều chỉnh giờ hoặc đổi điểm trong nhà khi có `cảnh báo thời tiết` (`Weather advisory`).
18. As a Trip owner, I want AI luôn giữ ranh giới trung thực khi tư vấn về thời tiết: nêu rõ số liệu dự báo, các `cảnh báo thời tiết` hoặc `cảnh báo sau hoàng hôn` (`After-sunset advisory`) và gợi ý phương án giảm rủi ro, nhưng không biến cảnh báo thời tiết thành lỗi chặn lưu và không cam kết an toàn tuyệt đối thay tôi, so that quyền quyết định cuối cùng luôn thuộc về tôi.
19. As a Trip owner, I want hỏi *"Tiếp theo mình đi đâu, mấy giờ xuất phát?"* hoặc *"Hôm nay còn những điểm nào?"* khi chuyến đi đang diễn ra để AI trả lời ngay dựa trên các `lượt tham quan` chưa hoàn thành trong `bản nháp chỉnh sửa`, so that tôi nắm bắt nhanh chặng kế tiếp trên đường đi.
20. As a Trip owner, I want Trợ lý chuyến đi không bao giờ ép tôi bật GPS khi chuyến đi chưa khởi hành (`UPCOMING`) hoặc khi tôi chỉ yêu cầu đổi giờ, đổi điểm, hỏi tư vấn lịch hay hỏi thời tiết không phụ thuộc vị trí hiện tại, so that tôi có thể chỉnh sửa hành trình ở bất cứ đâu mà không bị chặn.
21. As a Trip owner traveling on an active trip (`ONGOING`), I want Trợ lý chuyến đi chỉ hỏi quyền GPS (và cho phép chọn vị trí thủ công trên bản đồ nếu từ chối hoặc mất sóng GPS) khi yêu cầu của tôi thực sự phụ thuộc vào vị trí đang đứng (như *"Tôi đang kẹt ở đây thì chiều nay đi tiếp những điểm nào kịp?"*), so that vị trí thực tế được dùng đúng lúc cần thiết mà không theo dõi ngầm.
22. As a Trip owner, I want tự do sắp xếp hơn 4 `lượt tham quan` trong một ngày qua cả AI lẫn thao tác tay miễn tổng số lượt toàn chuyến không vượt quá 50 và thỏa mãn `kiểm tra tính hợp lệ`, so that lịch trình linh hoạt theo đúng nhu cầu thực tế.
23. As a Trip owner, I want chỉnh sửa `nơi xuất phát` (`Trip origin`), giờ khởi hành Ngày 1 và hạn về ngày cuối (hoặc bổ sung cho chuyến cũ chưa có) bằng cả hội thoại AI lẫn bộ chọn trực quan khi chuyến đi chưa khởi hành, kèm tự động tính lại hai chặng biên và `thời gian nghỉ dọc đường dự kiến` (`Roadside rest allowance`), so that toàn bộ lộ trình đi/về luôn đồng bộ.
24. As a Trip owner, I want vẫn mở và nhờ AI tư vấn hoặc chỉnh sửa được chuyến đi có chứa địa điểm ngoài danh mục hiện có (để giữ nguyên, đổi giờ, đổi thứ tự hoặc xóa), đồng thời mọi gợi ý thêm mới hoặc thay thế từ AI đều lấy từ danh mục điểm đến công khai của KLTN, so that chuyến đi tạo từ luồng chat không bị lỗi chặn mà vẫn đảm bảo độ tin cậy kiểm tra giờ mở cửa cho các điểm mới.
25. As a Trip owner, I want các `lượt tham quan` đã qua giờ kết thúc (theo múi giờ `Asia/Ho_Chi_Minh`) và thông tin khởi hành ban đầu của chuyến đi đang diễn ra (`ONGOING`) luôn được bảo vệ cố định trước cả thao tác tay lẫn lệnh AI, trong khi các lượt và ngày sắp tới vẫn chỉnh sửa bình thường, so that lịch sử chặng đã đi qua không bị xáo trộn.
26. As a Trip owner, I want chuyến đi đã hoàn thành (`COMPLETED`) được khóa chỉnh sửa và hiển thị trạng thái chỉ xem rõ ràng trên cả hai đường dẫn, so that dữ liệu chuyến đi đã kết thúc được bảo toàn.
27. As a Trip owner, I want khi tôi yêu cầu AI đổi `ngày bắt đầu`, `số ngày` hoặc `phương tiện` của chuyến đi, AI giữ nguyên các trường khung này và giải thích rõ phạm vi chỉnh sửa của chuyến đã lưu (hướng dẫn lập chuyến mới nếu muốn thay đổi cấu trúc khung), so that dữ liệu khung và nhóm đồng hành của chuyến đi không bị biến đổi ngoài hợp đồng.
28. As a Trip owner, I want hệ thống đánh dấu rõ nếu trong chuyến đi có điểm đến danh mục vừa bị quản trị viên ẩn và hỗ trợ tôi nhờ AI gợi ý điểm thay thế hoặc xóa nhanh trước khi lưu, so that lịch trình cập nhật chỉ chứa các điểm hợp lệ.
29. As a Trip owner, I want mọi số liệu thời gian di chuyển, giờ mở cửa, thời lượng tối thiểu và kết quả `PASS` / `VIOLATION` / `INSUFFICIENT_DATA` trong câu trả lời và thẻ gợi ý của AI đều do bộ định tuyến và `Constraint Validator` phía server quyết định (không bao giờ do LLM tự suy đoán), so that mọi lời khuyên của AI đều trung thực với dữ liệu hệ thống.
30. As a Trip owner, I want khi bước gọi LLM soạn lời văn tư vấn gặp sự cố mạng hoặc quá thời gian chờ, hệ thống vẫn trả về bản tóm tắt dữ liệu kiểm tra chuẩn từ server và giữ nguyên câu vừa nhập để tôi thử lại nếu muốn, so that tôi không bao giờ bị mất dữ liệu hay kẹt luồng làm việc.
31. As a Trip owner, I want thấy ngay các thay đổi do AI hoặc thẻ gợi ý vừa áp dụng được tô nổi bật trên Timeline và Bản đồ kèm nút "Hoàn tác bước AI này", đồng thời có thể tự chỉnh tay tiếp giờ bắt đầu, thời lượng, thứ tự hoặc thêm điểm từ Drawer, so that AI và thao tác tay bổ trợ liền mạch cho nhau.
32. As a Trip owner, I want nhận cảnh báo tức thì (0ms) trên thẻ khi trùng giờ và hệ thống tự động chạy `kiểm tra tính hợp lệ` đầy đủ trên server khi `bản nháp chỉnh sửa` thay đổi, hiển thị lỗi trực tiếp lên đúng thẻ `lượt tham quan` hoặc chặng di chuyển bị vi phạm, so that tôi nhìn thấy ngay tác động của mọi chỉnh sửa.
33. As a Trip owner, I want chỉ khi bấm "Lưu thay đổi" và xác nhận trong hộp thoại tóm tắt (kèm thông báo cho nhóm đồng hành nếu có, và hộp kiểm xác nhận mục chưa kiểm nếu còn địa điểm ngoài danh mục) thì hệ thống mới ghi nguyên tử vào `lịch trình đã lưu` (`Saved itinerary`), so that không có thay đổi nháp hay câu chat nào tự động ghi đè cơ sở dữ liệu.
34. As a Trip owner, I want khi kết quả lưu trả về trạng thái chưa xác định (`UNKNOWN`), giao diện khóa các thao tác sửa mới, giữ nguyên khóa idempotency cùng dữ liệu đã đóng băng để tôi bấm "Kiểm tra lại kết quả" mà không tạo bản ghi hay thông báo nhóm trùng lặp, so that việc lưu luôn an toàn khi mạng chập chờn.
35. As a Trip owner, I want khi gặp xung đột phiên bản (`409`) do chuyến đi vừa được cập nhật ở tab hoặc thiết bị khác, hệ thống giữ nguyên `bản nháp chỉnh sửa` và cuộc hội thoại AI trong phiên, cho phép tôi chọn Rebase bản nháp lên phiên bản mới nhất để kiểm tra lại hoặc hủy nháp tải lại bản mới, so that công sức trao đổi với AI và chỉnh lịch không bị mất trắng.
36. As a Desktop user (`>= 900px`), I want nhìn thấy song hành Khung hội thoại Trợ lý AI, Timeline `bản nháp chỉnh sửa` và Bản đồ lộ trình (với nút thu gọn/mở rộng khung chat linh hoạt), so that tôi vừa trò chuyện với AI vừa quan sát trực tiếp lịch trình và bản đồ.
37. As a Mobile user (`360px+`) or keyboard user, I want chuyển đổi mượt mà giữa 3 tab `Trợ lý AI`, `Lịch trình` và `Bản đồ` mà không bị tràn ngang, thấy thông báo nổi để nhảy sang xem lịch hoặc hoàn tác ngay khi AI vừa cập nhật bản nháp, và không bị nút nổi "Hỏi trợ lý AI" toàn cục che khuất màn hình, so that trải nghiệm trên di động và bàn phím hoàn toàn thuận tiện.
38. As a Guest, non-owner Traveler, or Admin viewing another user's trip, I want mọi yêu cầu truy cập màn hình hoặc gọi API của `Trợ lý chuyến đi` không thuộc quyền sở hữu đều bị từ chối nghiêm ngặt trên server trước khi đọc dữ liệu hay gọi mô hình AI, và thông báo nhóm đồng hành không bao giờ làm lộ tọa độ/địa chỉ `nơi xuất phát`, so that quyền riêng tư và bảo mật tài nguyên luôn được đảm bảo tuyệt đối.

---

## Implementation Decisions

### 1. Hợp nhất điểm vào và mô hình không gian làm việc (`Saved-trip assistant`)
- Hợp nhất hai luồng chỉnh sửa chuyến đi đã lưu và trợ lý trong chuyến đi về cùng một không gian làm việc **`Trợ lý chuyến đi` (`Saved-trip assistant`)** xoay quanh một **`bản nháp chỉnh sửa` (`Edit draft`)** stateless duy nhất trên trình duyệt.
- Giữ cả hai đường dẫn trang chỉnh sửa và trang trợ lý trong chuyến đi đều hoạt động và cùng hiển thị không gian làm việc hợp nhất này: khi mở qua đường dẫn trợ lý trong chuyến đi (hoặc chọn nút mở trợ lý AI từ trang chi tiết chuyến đi), giao diện tự động mở sẵn và đặt tiêu điểm vào Khung hội thoại Trợ lý AI (trên di động mở sẵn tab `Trợ lý AI`).
- Trên trang chi tiết chuyến đi, hợp nhất các nút thao tác rời rạc trước đây để dẫn người dùng trực tiếp vào không gian `Trợ lý chuyến đi` hợp nhất (với chuyến đi chưa hoàn thành).
- Ẩn nút nổi trợ lý toàn cục (`Global assistant launcher`) trên cả hai đường dẫn của không gian làm việc này để không chồng chéo hai khung chat AI.
- Giữ nguyên mô hình Modular Monolith: Route Handlers chỉ làm nhiệm vụ xác thực phiên, kiểm tra `Origin`/Content-Type/giới hạn kích thước body, phân tích dữ liệu đầu vào và trả về envelope chuẩn với header `private, no-store`; toàn bộ quy tắc nghiệp vụ, kiểm tra quyền sở hữu, mô phỏng lịch trình, định tuyến, kiểm tra ràng buộc và ghi cơ sở dữ liệu nằm trong các module dịch vụ phía server.
- Không tạo thêm bảng lưu nháp dài hạn trong cơ sở dữ liệu; `bản nháp chỉnh sửa` và lịch sử hội thoại AI của phiên làm việc chỉ tồn tại trong bộ nhớ phiên trình duyệt cho tới khi người dùng chủ động xác nhận lưu.

### 2. Ngang bằng năng lực với luồng sửa tay & Chính sách GPS có điều kiện
- **Một `bản nháp chỉnh sửa` cộng dồn nhiều lượt:** Mọi thao tác từ hội thoại AI, từ việc bấm thẻ `gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`), hay từ điều khiển chỉnh tay trực tiếp trên thẻ `lượt tham quan` (`Scheduled visit`) đều đọc và cập nhật trên cùng `bản nháp chỉnh sửa` hiện hành, đồng thời đẩy vào cùng một ngăn xếp `Hoàn tác` / `Làm lại` (`Undo/Redo`) trong phiên.
- **Độ sâu hội thoại trong phiên:** Khung hội thoại Trợ lý chuyến đi lưu giữ tối đa **16 lượt trao đổi gần nhất** trong phiên làm việc. Mỗi yêu cầu gửi lên endpoint AI kèm theo trạng thái `bản nháp chỉnh sửa` mới nhất (đã bao gồm cả những thao tác người dùng vừa chỉnh tay xen kẽ giữa các câu chat) để AI luôn tư vấn và thao tác trên dữ liệu thực tế đang hiển thị.
- **Đầy đủ các phép biến đổi lịch trình:**
  - Mở trần số `lượt tham quan` mỗi ngày (bỏ giới hạn 4 điểm/ngày của bước tạo lịch sơ bộ), giữ giới hạn tối đa `50` lượt và tối thiểu `1` lượt cho toàn chuyến đi.
  - Hỗ trợ đơn lẻ hoặc kết hợp nhiều thao tác trong một lượt yêu cầu: thêm điểm (từ danh mục điểm đến công khai `VISIBLE` của KLTN), xóa điểm, thay thế điểm, đổi giờ bắt đầu, đổi thời lượng tham quan, đổi thứ tự trong ngày, chuyển sang ngày khác, và **tự động dời giờ dây chuyền (`auto-shift`)** các điểm phía sau trong cùng ngày (không vượt quá `23:59` và không chạm vào các lượt đã khóa).
  - Hỗ trợ chỉnh sửa `nơi xuất phát` (`Trip origin`), giờ khởi hành Ngày 1, giờ/hạn về ngày cuối và thao tác tính lại giờ theo lộ trình xuất phát khi chuyến đi ở trạng thái `UPCOMING` (trước giờ khởi hành theo `Asia/Ho_Chi_Minh`).
- **Bảo toàn các trường khung của chuyến đi:** `ngày bắt đầu`, `số ngày` và `phương tiện` giữ cố định trong suốt phiên chỉnh sửa; khi người dùng yêu cầu AI đổi một trong ba thông tin này, AI phân loại rõ và trả lời giải thích phạm vi chỉnh sửa của chuyến đi đã lưu cùng hướng dẫn tạo chuyến mới nếu muốn đổi cấu trúc khung, đồng thời server từ chối mọi payload cố tình thay đổi ba trường này.
- **Quy tắc theo trạng thái chuyến đi (`UPCOMING`, `ONGOING`, `COMPLETED`):**
  - `COMPLETED`: Khóa hoàn toàn mọi thao tác chỉnh sửa, mô phỏng AI và lưu (`409`); giao diện hiển thị trạng thái chỉ xem và lối quay về trang chi tiết.
  - `ONGOING`: Bảo vệ cố định toàn bộ các `lượt tham quan` đã qua giờ kết thúc tính theo thời gian thực tại `Asia/Ho_Chi_Minh` (`preserveCompleted`) và khóa chỉnh sửa `nơi xuất phát`/giờ khởi hành ban đầu; cho phép AI tư vấn và chỉnh sửa các lượt/ngày chưa diễn ra.
  - `UPCOMING`: Cho phép chỉnh sửa toàn bộ các `lượt tham quan` và `nơi xuất phát`/giờ đi-về.
- **Chính sách GPS / vị trí hiện tại có điều kiện:**
  - Không bao giờ yêu cầu GPS đối với chuyến đi `UPCOMING` hoặc các yêu cầu chỉnh sửa giờ giấc, thêm/đổi/xóa điểm, hỏi tư vấn lịch trình, hỏi kiến thức hay hỏi thời tiết không phụ thuộc vị trí đang đứng.
  - Chỉ khi chuyến đi đang `ONGOING` **và** bộ phân tích ý định xác định yêu cầu của người dùng thực sự phụ thuộc vào vị trí vật lý hiện tại (ví dụ: đang bị kẹt/trễ tại một vị trí trên đường và hỏi từ chỗ đang đứng đi tiếp điểm nào kịp, hoặc tìm điểm ghé gần vị trí hiện tại) mà phiên chưa có vị trí, Trợ lý mới trả về trạng thái yêu cầu vị trí để giao diện kích hoạt xin quyền GPS một lần (với fallback chọn tọa độ/vị trí thủ công trên bản đồ nếu từ chối hoặc lỗi GPS). Tuyệt đối không theo dõi GPS ngầm hoặc lưu lịch sử vị trí dài hạn.
- **Địa điểm ngoài danh mục (`ExternalPlace`) và điểm danh mục bị ẩn (`HIDDEN`):**
  - Cho phép mở, tư vấn và chỉnh sửa chuyến đi có sẵn `ExternalPlace` (giữ nguyên, đổi giờ, đổi thứ tự hoặc xóa; tôn trọng quy tắc hết hạn cache 30 ngày của thông tin hiển thị).
  - Mọi gợi ý thêm mới hoặc thay thế điểm đến từ AI trong luồng này chỉ lấy từ danh mục điểm đến công khai (`VISIBLE`) của KLTN; không gọi Google Places để tìm và chèn mới `ExternalPlace` trong luồng chỉnh sửa chuyến đi đã lưu.
  - Nếu bản nháp còn giữ `ExternalPlace`, hệ thống phân loại chính xác danh sách mục chưa kiểm (`uncheckedItems`) để yêu cầu người dùng xác nhận tường minh (`acknowledgedUnchecked`) lúc bấm Lưu; nếu người dùng đã xóa hết `ExternalPlace`, hệ thống xóa sạch trạng thái mục chưa kiểm khi lưu. Các lỗi thiếu dữ liệu tuyến đường hoặc lỗi của điểm trong danh mục KLTN tiếp tục chặn lưu nghiêm ngặt.
  - Nếu bản nháp chứa điểm danh mục đã bị quản trị viên ẩn (`HIDDEN` / đã xóa mềm), giao diện và Trợ lý AI cảnh báo rõ tên điểm cần xử lý, hỗ trợ gợi ý điểm thay thế công khai hoặc xóa nhanh trước khi cho phép lưu.

### 3. Bản đồ 7 nhóm câu hỏi & Kiến trúc AI 2 bước trên Server (`Grounded Agent Pipeline`)
Để AI trả lời thông minh cho mọi tình huống người dùng hỏi mà không bao giờ tự bịa số liệu hay phán quyết thay `Constraint Validator`, backend xử lý hội thoại theo **kiến trúc 2 bước**:

#### Bước 1 — Phân tích ý định & Mô phỏng kiểm tra thật trên Server (`Intent Analysis & Server Dry-Run Simulation`)
Mô hình ngôn ngữ phân tích câu hỏi của người dùng cùng ngữ cảnh `bản nháp chỉnh sửa` hiện tại, lịch sử hội thoại (tối đa 16 lượt, được coi là dữ liệu không đáng tin cậy) và danh sách điểm đến công khai đủ điều kiện của server thành một cấu trúc điều khiển chặt chẽ thuộc 7 nhóm tình huống:

1. **Nhóm 1 — Đánh giá tổng thể & kiểm tra độ hợp lý (`EVALUATE_SCHEDULE`):**
   - Áp dụng cho các câu hỏi như *"Tôi đi thế này được không?"*, *"Lịch Ngày 1 có bị gấp/mệt quá không?"*, *"Có nên đi theo thứ tự này không?"*.
   - Server thu thập bộ chỉ số thực tế của `bản nháp chỉnh sửa`: số điểm dừng từng ngày, tổng thời gian chạy xe đã xác minh và quãng đường từng chặng từ `PLANNER_ROUTING_PROVIDER`, giờ bắt đầu/kết thúc mỗi ngày (cảnh báo về muộn sau `18:00` hoặc lố hạn về `nơi xuất phát`), toàn bộ kết quả `kiểm tra tính hợp lệ` (`PASS` / `VIOLATION` / `INSUFFICIENT_DATA` cho giờ mở cửa, thời lượng tối thiểu, thời gian di chuyển, trùng lịch), cùng dữ liệu `giờ mặt trời` và `cảnh báo thời tiết` của các ngày trong chuyến.
   - Nếu lịch hiện tại có điểm nghẽn (ví dụ ngày quá dày, vi phạm giờ mở cửa, điểm ngoài trời rơi vào sau hoàng hôn hoặc có cảnh báo mưa lớn/sương mù, hoặc thời gian di chuyển quá dài), Bước 1 có thể đề xuất kèm tối đa **2 phương án điều chỉnh ứng viên (`candidate remedies`)** để server chạy mô phỏng thử (`dry-run`).

2. **Nhóm 2 — Tình huống muốn nghỉ ngơi (`Schedule rest buffer`), đến sớm/muộn hoặc đổi nhịp độ (`SCENARIO_REST_OR_DELAY`):**
   - Áp dụng cho các câu hỏi như *"Sáng đến nơi muốn nghỉ ngơi như này thì nên chỉnh sửa chuyến đi như nào cho hợp lý?"*, *"Đoàn xuất phát trễ 2 tiếng thì đi sao?"*, *"Chiều muốn nghỉ sớm hơn để đỡ mệt"*.
   - Hệ thống mô hình hóa nhu cầu "nghỉ" thành **`khoảng nghỉ trong lịch` (`Schedule rest buffer`)** (dời mốc bắt đầu hoặc tạo khoảng đệm giữa hai `lượt tham quan`, không tạo điểm tham quan giả và không đặt dịch vụ lưu trú).
   - Mô hình sinh tối đa **2 phương án điều chỉnh ứng viên (`candidate remedies`)** phù hợp với yêu cầu (ví dụ: *Phương án 1*: lùi giờ bắt đầu đến mốc người dùng muốn nghỉ xong và tự dời giờ dây chuyền `auto-shift` các điểm phía sau trong ngày, có thể kết hợp điều chỉnh thời lượng tham quan trong ngưỡng tối thiểu cho phép; *Phương án 2*: lùi giờ bắt đầu + chuyển điểm cuối ngày sang ngày kế tiếp hoặc lược bớt điểm phụ nếu dời dây chuyền làm điểm cuối bị đóng cửa/quá tối/tràn qua `23:59`).
   - **Server thực thi mô phỏng thử (`dry-run`)** từng phương án ứng viên trên bản sao của `bản nháp chỉnh sửa`, gọi bộ định tuyến và `Constraint Validator` để biết chính xác phương án nào đạt `PASS`, phương án nào phát sinh vi phạm gì, và đóng gói các phương án hợp lệ thành thẻ **`gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`)**.

3. **Nhóm 3 — Muốn đổi hoặc thêm địa điểm thông minh (`RECOMMEND_OR_SWAP_PLACES`):**
   - Khi người dùng muốn đổi một điểm trong lịch hoặc hỏi thêm điểm mà chưa chỉ định rõ tên điểm duy nhất (ví dụ *"Tôi muốn đổi địa điểm này sang chỗ nào đỡ mệt hơn"*, *"Chiều Ngày 2 còn trống nên đi đâu?"*):
   - Server lọc và xếp hạng tối đa **3 `lựa chọn điểm đến` (`Destination option`)** từ danh mục điểm đến công khai (`VISIBLE`) của KLTN chưa có trong lịch, ưu tiên theo: cùng khu vực địa lý với các điểm lân cận trong ngày đó, mở cửa khớp khung giờ dự kiến, có thời lượng gợi ý vừa với quỹ thời gian, và phù hợp với `dự báo thời tiết` / `giờ mặt trời` (ví dụ ưu tiên điểm trong nhà khi ngày đó có cảnh báo mưa lớn/sương mù hoặc khung giờ sau hoàng hôn).
   - Với mỗi lựa chọn, server tính sẵn phương án chèn/thay thế vào bản sao nháp để người dùng có thể bấm chọn áp dụng trong 1 chạm.

4. **Nhóm 4 — Lệnh chỉnh sửa trực tiếp đơn lẻ hoặc gộp nhiều thao tác (`DIRECT_BATCH_EDIT` & `CHANGE_ORIGIN_CLOCKS`):**
   - Khi người dùng yêu cầu sửa trực tiếp (ví dụ *"Đổi điểm A sang điểm B, lùi giờ bắt đầu xuống 08:30 và tự dời các điểm sau"* hoặc *"Đổi giờ xuất phát Ngày 1 sang 07:00"*), server xác minh toàn bộ ID và tham số giờ, áp dụng chuỗi thao tác lên bản sao `bản nháp chỉnh sửa`, chạy `kiểm tra tính hợp lệ` + tính lại lộ trình xuất phát/trở về và trả về trạng thái `PROPOSED` để cập nhật trực tiếp lên `bản nháp chỉnh sửa` kèm quyền Hoàn tác 1 chạm.

5. **Nhóm 5 — Câu hỏi kép vừa hỏi đánh giá vừa yêu cầu sửa luôn (`COMPOUND_EVALUATE_AND_EDIT`):**
   - Khi người dùng vừa hỏi vừa chủ động yêu cầu sửa (ví dụ *"Đi như này có kịp không, nếu gấp quá thì chỉnh lại giúp tôi luôn"*), server chạy đánh giá kèm áp dụng phương án điều chỉnh hợp lệ (hoặc trả về thẻ phương án gợi ý nếu có nhiều cách đánh đổi như bỏ điểm vs chuyển ngày cần người dùng quyết định) và giải thích rõ cả phần đánh giá lẫn phần đã/đề xuất điều chỉnh.

6. **Nhóm 6 — Hỏi thông tin điểm đến, văn hóa, kinh nghiệm ăn nghỉ địa phương (`LOCAL_KNOWLEDGE_QA`):**
   - Khi người dùng hỏi thông tin thực tế hoặc kinh nghiệm ngoài thao tác xếp lịch (ví dụ *"Ở Đồng Văn có đặc sản gì?"*, *"Sáng đến Quản Bạ nghỉ ăn sáng ở đâu tiện?"*), server gọi dịch vụ truy xuất **RAG tài liệu đã duyệt** kết hợp chế độ **`Kiến thức mở rộng` (`Knowledge expansion`)** (gắn nhãn rõ phần kiến thức bổ sung từ mô hình, chỉ trích dẫn nguồn thực tế cho phần có tài liệu, không bịa giá cả/giờ mở cửa chưa xác minh). `Bản nháp chỉnh sửa` được giữ nguyên 100%.

7. **Nhóm 7 — Hỏi `dự báo thời tiết`, `giờ mặt trời` và tiến độ `lượt tham quan` tiếp theo (`TRIP_WEATHER_AND_PROGRESS`):**
   - Mở ngoại lệ có kiểm soát của `ADR-36` cho `Trợ lý chuyến đi`: cho phép truy vấn trực tiếp dịch vụ thời tiết chuyến đi (Open-Meteo + `suncalc`) cho đúng các ngày và điểm dừng trong `bản nháp chỉnh sửa` hiện tại, cũng như xác định `lượt tham quan` tiếp theo chưa hoàn thành.
   - Giữ nguyên nguyên tắc cốt lõi của `ADR-36`: thời tiết và giờ mặt trời chỉ mang tính thông tin và tư vấn (`Weather advisory`, `After-sunset advisory`), không bao giờ làm thay đổi kết quả của `Constraint Validator`, không chặn quyền lưu chuyến đi, và AI phân tích rủi ro/gợi ý phương án thay thế chứ không đưa ra cam kết đảm bảo an toàn tuyệt đối.

#### Bước 2 — Soạn phản hồi tư vấn tự nhiên bám sát sự thật (`Grounded Advisory Response Composer`)
- Sau khi Bước 1 hoàn tất việc kiểm tra, mô phỏng (`dry-run`), lọc lựa chọn điểm đến hoặc truy xuất RAG/thời tiết, mô hình ngôn ngữ ở Bước 2 nhận **câu hỏi của người dùng** cùng **bộ dữ liệu sự thật đã được server kiểm chứng** để soạn câu trả lời tiếng Việt tự nhiên, thông minh, giải thích rõ ràng *"vì sao ổn / chưa ổn"* và hướng dẫn cụ thể từng phương án.
- **Ranh giới bảo vệ sự thật (`Deterministic Fact Guard`):**
  - Mô hình soạn lời văn không có quyền thay đổi `bản nháp chỉnh sửa`, không có quyền tự tạo ID điểm đến ngoài danh sách server đã lọc, và không thể sửa trạng thái `PASS` / `VIOLATION` / `INSUFFICIENT_DATA`.
  - Mọi thẻ **`gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`)**, thẻ **`lựa chọn điểm đến` (`Destination option`)**, bản nháp mới (`candidate`), danh sách thay đổi (`diff`) và bảng kết quả `kiểm tra tính hợp lệ` trả về cho trình duyệt đều được **code server đóng gói trực tiếp** từ kết quả đã kiểm chứng ở Bước 1.
  - Nếu lệnh gọi LLM ở Bước 2 bị lỗi hoặc hết thời gian chờ, server tự động dùng bộ tổng hợp văn bản tất định từ dữ liệu Bước 1 để trả lời ngay kèm đầy đủ các thẻ phương án/kết quả kiểm tra, đảm bảo luồng của người dùng không bao giờ bị đứt gãy.

### 4. Hợp đồng áp dụng gợi ý 1 chạm, Kiểm tra hai tầng, Rebase `409` và Lưu nguyên tử
- **Áp dụng `gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`) trong 1 chạm:**
  - Mỗi thẻ gợi ý đính kèm dưới tin nhắn `ADVISED` chứa sẵn bản nháp mục tiêu đã được server mô phỏng, tóm tắt các thay đổi (`diff`), danh sách ID các lượt bị ảnh hưởng và kết quả `kiểm tra tính hợp lệ` dự kiến.
  - Khi người dùng bấm nút **"Áp dụng phương án này vào bản nháp"**, trình duyệt áp dụng ngay bản nháp của thẻ đó thành `bản nháp chỉnh sửa` hiện hành, đẩy bản nháp trước đó vào ngăn xếp `Undo`, gắn nhãn nổi bật các thẻ vừa thay đổi trên Timeline, cập nhật Bản đồ lộ trình và ghi nhận một dòng xác nhận trong khung chat mà không cần gọi lại endpoint AI.
- **Kiểm tra hai tầng và đồng bộ lộ trình:**
  - *Tầng 1 (0ms tại trình duyệt):* Kiểm tra tức thì định dạng giờ, vượt quá `24:00`, trùng khoảng thời gian trong cùng ngày và thời lượng tối thiểu khi người dùng chỉnh tay trên thẻ.
  - *Tầng 2 (Server Preview, debounced ~800ms kèm sequence token chống race condition + nút kiểm tra lại thủ công):* Tự động kiểm tra toàn bộ ràng buộc qua `PLANNER_ROUTING_PROVIDER`, tính lại `journeySnapshot` (`nơi xuất phát` → điểm đầu, điểm cuối → `nơi xuất phát`, `thời gian nghỉ dọc đường dự kiến`) và đánh giá lại `uncheckedItems` nếu còn `ExternalPlace`. Khi đang chờ kết quả kiểm tra hoặc có lỗi chặn, nút **Lưu thay đổi** bị khóa.
- **Xử lý xung đột phiên bản (`409`) và Lưu nguyên tử (`SUCCESS` / `FAILED` / `UNKNOWN`):**
  - Khi gặp `409` do chuyến đi vừa được cập nhật ở nơi khác, giữ nguyên `bản nháp chỉnh sửa` và toàn bộ hội thoại AI trong phiên; cho phép người dùng chọn **Rebase bản nháp lên phiên bản mới nhất** (cập nhật mốc `baseRevision` và tự chạy lại kiểm tra) hoặc **Hủy nháp để tải bản mới nhất**.
  - Việc ghi chính thức vào `lịch trình đã lưu` chỉ diễn ra khi người dùng bấm **Lưu thay đổi** và xác nhận trong hộp thoại tóm tắt. Bên ngoài transaction thực hiện tái kiểm tra định tuyến và `Constraint Validator` bằng dữ liệu tươi; bên trong transaction idempotent thực hiện kiểm tra quyền sở hữu, trạng thái chuyến, CAS `baseRevision`, cập nhật `journeySnapshot`, `uncheckedChecks` / `uncheckedConfirmedAt`, thay thế các ngày/lượt tham quan và ghi thông báo nhóm đồng hành (không tiết lộ tọa độ/địa chỉ `nơi xuất phát`).
  - Khi kết quả lưu là `UNKNOWN`, đóng băng payload và khóa idempotency để người dùng bấm **"Kiểm tra lại kết quả"** đối soát an toàn mà không bao giờ nhân đôi bản ghi.

### 5. Hợp đồng giao diện, Responsive (`360px+`) và Trợ năng
- **Trên Desktop (`>= 900px`):** Không gian làm việc hiển thị Khung hội thoại Trợ lý AI đầy đủ (có danh sách tin nhắn cuộn độc lập, các chip gợi ý câu hỏi theo ngữ cảnh chuyến đi, các thẻ `gợi ý chỉnh sửa từ tư vấn` có nút áp dụng 1 chạm, các thẻ lựa chọn điểm đến, ô nhập đa dòng và nút xóa hội thoại tạm) song hành cùng cột Timeline `bản nháp chỉnh sửa` và cột Bản đồ lộ trình sticky (cho phép thu gọn/mở rộng khung Trợ lý AI linh hoạt).
- **Trên Mobile (`< 900px`, hỗ trợ từ `360px` không tràn ngang):** Cung cấp thanh chuyển 3 tab `Trợ lý AI` | `Lịch trình` | `Bản đồ` cùng thanh hành động ghim đáy (`sticky bottom bar`) hiển thị trạng thái kiểm tra, số thay đổi chưa lưu và nút **Lưu thay đổi**. Khi AI vừa áp dụng thay đổi hoặc khi người dùng bấm áp dụng một thẻ gợi ý từ tab `Trợ lý AI`, hiển thị banner thao tác nhanh cho phép nhảy sang tab `Lịch trình` / `Bản đồ` hoặc bấm `Hoàn tác` ngay lập tức.
- **Nhất quán thuật ngữ & Trợ năng:** Sử dụng thống nhất các thuật ngữ `Trợ lý chuyến đi`, `Lịch trình đã lưu`, `Bản nháp chỉnh sửa`, `Lượt tham quan`, `Kiểm tra tính hợp lệ`, `Tư vấn theo lịch hiện tại`, `Gợi ý chỉnh sửa từ tư vấn`, `Khoảng nghỉ trong lịch`, `Nơi xuất phát` theo đúng `GLOSSARY`. Mọi nút tương tác đạt kích thước chạm tối thiểu `44×44px`, hỗ trợ đầy đủ bàn phím (`Enter` để gửi, `Shift+Enter` xuống dòng, `Escape` đóng hộp thoại/ngăn chọn) và vùng thông báo `aria-live="polite"`.

---

## Testing Decisions

### Ranh giới kiểm thử (Test Seams) đề xuất
Tuân thủ nguyên tắc chọn **ít seam nhất ở mức cao nhất có thể** và chỉ kiểm tra **hành vi đầu ra quan sát được** (không kiểm tra tên hàm nội bộ hay chi tiết cài đặt bên trong):

1. **Seam 1 — Hợp đồng HTTP & Dịch vụ của `Trợ lý chuyến đi` (`AI Edit/Advise`, `Preview`, `Apply`, `Snapshot/Read`):**
   - Kiểm thử trực tiếp qua biên Route Handler / dịch vụ của luồng chỉnh sửa chuyến đi với cơ sở dữ liệu giả lập hoặc PostgreSQL disposable thật, đồng hồ tham chiếu cố định theo `Asia/Ho_Chi_Minh`, cùng các bộ giả lập (`fake`) cho LLM, bộ định tuyến, thời tiết và truy xuất RAG.
   - Đảm bảo một điểm vào duy nhất cho mọi kịch bản nghiệp vụ: phân quyền/sở hữu, 7 nhóm câu hỏi AI, mô phỏng thử (`dry-run`) các phương án `Actionable advice suggestion`, bảo vệ sự thật (`Fact Guard`) và fallback khi LLM composer lỗi, yêu cầu GPS có điều kiện khi `ONGOING`, bảo vệ lượt đã qua giờ, xử lý `ExternalPlace` / điểm `HIDDEN`, xung đột `409` và idempotency `SUCCESS` / `FAILED` / `UNKNOWN`.

2. **Seam 2 — Không gian làm việc hợp nhất trên trình duyệt (`Saved-trip Assistant Workspace & Client Controller`):**
   - Kiểm thử trực tiếp trạng thái và giao diện không gian làm việc hợp nhất (đồng bộ cả hai đường dẫn `/edit` và `/in-trip`, luồng hội thoại 16 lượt, thao tác bấm áp dụng thẻ `Actionable advice suggestion` 1 chạm lên `bản nháp chỉnh sửa`, kết hợp sửa tay + AI + `Undo/Redo`, kiểm tra 0ms + debounce preview, Rebase `409`, hộp thoại xác nhận lưu + retry `UNKNOWN`, và bố cục responsive ở `360px` / Desktop).

*(Vui lòng xác nhận 2 seam kiểm thử cấp cao này đã khớp với kỳ vọng của bạn trước khi chuyển sang bước tách ticket hoặc lập trình).*

### Các kịch bản kiểm thử bắt buộc
- **Phân quyền & Bảo mật biên:** Từ chối `401` cho Guest, `403`/`404` chuẩn xác cho tài khoản không phải chủ chuyến (kể cả thành viên đoàn `Trip member` hoặc `ADMIN` truy cập chuyến của người khác) trước khi đọc body hay gọi mô hình AI; mọi phản hồi gắn `private, no-store`; thông báo nhóm đồng hành không bao giờ rò rỉ tọa độ/địa chỉ `nơi xuất phát`.
- **7 nhóm câu hỏi & Mô phỏng phương án (`Dry-Run` + `Fact Guard`):**
  - Câu hỏi đánh giá (*"Tôi đi thế này được không?"*) trả về `ADVISED` với lời phân tích tự nhiên khớp số liệu thật, không làm thay đổi `bản nháp chỉnh sửa`, và đính kèm thẻ `Actionable advice suggestion` khi có điểm nghẽn.
  - Câu hỏi tình huống nghỉ ngơi/đi trễ (*"Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?"*) mô phỏng chính xác `Schedule rest buffer` + `auto-shift`; khi dời giờ làm điểm cuối vi phạm giờ mở cửa hoặc quá tối, trả về các thẻ phương án tháo gỡ đã được Validator kiểm chứng.
  - Yêu cầu đổi/thêm điểm mở trả về tối đa 3 `Destination option` đều thuộc danh mục `VISIBLE` của KLTN; mọi ID giả hoặc điểm `HIDDEN` từ đầu ra mô hình đều bị chặn.
  - Lệnh sửa trực tiếp đa thao tác (`multi-op` + `shiftFollowing` + đổi giờ xuất phát trước khởi hành) trả về `PROPOSED` với `diff` và `validation` chính xác.
  - Câu hỏi kiến thức địa phương trả về nội dung RAG + `Kiến thức mở rộng` có nhãn; câu hỏi thời tiết chuyến đi trả về số liệu dự báo/giờ mặt trời thực tế của ngày trong lịch mà không biến thời tiết thành lỗi Validator.
  - Khi bước gọi LLM soạn lời văn tư vấn (Bước 2) gặp lỗi hoặc timeout, hệ thống vẫn trả về phản hồi `ADVISED` / `PROPOSED` hợp lệ từ bản tóm tắt dữ liệu server mà không làm thất bại toàn bộ lượt hỏi.
- **Chính sách GPS, Trạng thái chuyến & Trường khung:**
  - Chuyến `UPCOMING` hoặc các câu hỏi chỉnh giờ/đổi điểm/tư vấn không phụ thuộc vị trí không bao giờ trả về yêu cầu GPS; chuyến `ONGOING` hỏi tình huống phụ thuộc vị trí đang đứng mới kích hoạt yêu cầu GPS/vị trí thủ công.
  - Chuyến `ONGOING` chặn mọi thao tác (cả tay lẫn AI) cố tình xóa, đổi giờ hoặc dời ngày của các `lượt tham quan` đã qua giờ kết thúc.
  - Chuyến `COMPLETED` từ chối mọi thao tác chỉnh sửa và lưu.
  - Yêu cầu AI đổi `ngày bắt đầu`, `số ngày` hoặc `phương tiện` được từ chối an toàn kèm lời giải thích rõ ràng.
- **Tương tác Client, Concurrency & Idempotency:**
  - Luồng kết hợp: hỏi tư vấn AI → bấm áp dụng thẻ `Actionable advice suggestion` 1 chạm → sửa tay thêm trên thẻ → `Undo` bước sửa tay → `Undo` bước gợi ý AI → `Redo` → Rebase khi gặp `409` → xác nhận Lưu (kèm `acknowledgedUnchecked` nếu có `ExternalPlace`) → retry cùng key khi gặp `UNKNOWN` trên PostgreSQL disposable thật chỉ tạo đúng một lần cập nhật.

### Prior Art trong Codebase
- Kế thừa mẫu kiểm thử hợp đồng HTTP/Service của module chỉnh sửa chuyến đi hiện tại (kiểm thử với fake DB, fake routing provider và fake LLM provider có đồng hồ cố định).
- Kế thừa mẫu kiểm thử phân tích tư vấn lịch trình (`planning-guidance`), thời tiết chuyến đi (`trip-weather`) và hỏi đáp RAG (`qa-service`).
- Kế thừa mẫu kiểm thử tích hợp PostgreSQL disposable cho lưu chuyến đi có `ExternalPlace` (`unchecked-checks`), xung đột phiên bản `409` và đối soát `UNKNOWN` idempotency.

---

## Out of Scope

- Cho phép thay đổi các trường khung của chuyến đi (`ngày bắt đầu`, `số ngày`, `phương tiện`) ngay trong luồng chỉnh sửa chuyến đi đã lưu.
- Gọi Google Places hoặc tìm kiếm web ngoài để tạo mới các địa điểm ngoài danh mục (`ExternalPlace`) trong luồng chỉnh sửa chuyến đi đã lưu (chỉ hỗ trợ giữ, đổi giờ, đổi thứ tự hoặc xóa các `ExternalPlace` đã có sẵn trong chuyến).
- Chọn và chỉnh sửa trực tiếp chuyến đi đã lưu từ trang `/assistant` toàn cục hoặc từ nút nổi trợ lý toàn cục ở các trang khám phá công khai.
- Lưu `bản nháp chỉnh sửa` hoặc lịch sử hội thoại chỉnh sửa tạm thời xuống cơ sở dữ liệu dài hạn khi người dùng chưa xác nhận lưu chuyến đi.
- Chỉnh sửa cộng tác nhiều người (`shared editing`) hoặc mở quyền sửa lịch trình cho thành viên tham gia tìm bạn đồng hành (`Trip member`).
- Theo dõi GPS liên tục dưới nền hoặc lưu trữ lịch sử tọa độ GPS lâu dài của người dùng.
- Đặt phòng khách sạn, homestay, vé xe, thanh toán hoặc cam kết đảm bảo an toàn thời tiết thay cho quyết định của người dùng.

---

## Further Notes

- **Nguồn quyết định:** Phỏng vấn `Q1–Q10` (2026-11-19), kế thừa nền tảng `Q1–Q19` (2026-11-18), `GLOSSARY` và `ADR-38` (cùng `ADR-36`, `ADR-37`).
- **Ghi chú về công cụ quản lý issue (`to-spec`):** Theo yêu cầu trực tiếp của bạn (*"viết vào 1 file spec trước"*), đặc tả này được xuất bản thành file chuẩn trong repository kèm nhãn trạng thái `ready-for-agent`. Dự án hiện chưa cấu hình kết nối tới hệ thống issue tracker ngoài cho bộ skill; nếu sau này bạn muốn tự động đẩy spec lên issue tracker ngoài (GitHub Issues / Linear), bạn có thể chạy `/setup-matt-pocock-skills`.
- **Bước tiếp theo:** Sau khi bạn xác nhận bản spec và 2 seam kiểm thử ở trên, chúng ta có thể dùng `/to-tickets` để tách thành các ticket lát cắt dọc hoặc bắt đầu triển khai code ngay theo yêu cầu của bạn.

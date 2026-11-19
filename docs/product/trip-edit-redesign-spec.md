# Spec — Cải tiến luồng và giao diện Chỉnh sửa hành trình & Trợ lý chuyến đi hợp nhất (`/trips/[id]/edit` & `/trips/[id]/in-trip`)

**Trạng thái: SPEC / PLAN UPDATED — 2026-11-19 (`ADR-37` + `ADR-38`).** Tổng hợp quyết định phỏng vấn **Q1–Q19** (2026-11-18, đã triển khai nền tảng ở Tickets `01`–`09`) cùng đợt phỏng vấn mở rộng **Q1–Q10** (2026-11-19) hợp nhất `/trips/[id]/in-trip` và nâng cấp **Trợ lý chuyến đi (`Saved-trip assistant`)** thông minh theo [`GLOSSARY.md`](../../GLOSSARY.md), [`ADR-37`](../decisions.md#adr-37--unified-stateless-client-edit-draft-and-atomic-edit-apply-2026-11-18) và [`ADR-38`](../decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19). Phần nâng cấp `ADR-38` hiện ở mức **SPEC / PLAN ONLY** (chưa triển khai code cho tới khi chủ dự án yêu cầu).

---

## Problem Statement

Luồng chỉnh sửa hành trình đã lưu hiện tại khiến Traveler gặp nhiều ma sát và dễ mất công sức vì hai vấn đề cốt lõi:

1. **Hai quy trình tách rời và xung đột nhau trên cùng màn hình:** Công cụ chỉnh sửa với AI luôn đọc trực tiếp `lịch trình đã lưu` từ database (bỏ qua mọi chỉnh sửa thủ công đang dang dở), chỉ xử lý được một thao tác đơn lẻ mỗi lần, và tự có bảng xem trước cùng nút xác nhận lưu riêng. Người dùng không thể sửa tay vài điểm rồi nhờ AI tinh chỉnh tiếp, hoặc ngược lại nhờ AI đề xuất rồi tự chỉnh lại giờ trước khi lưu.
2. **Giao diện nặng nề, thiếu trực quan và lệch nhịp với phần còn lại của sản phẩm:** Người dùng phải mở từng thẻ accordion ẩn để bấm nút, tự gõ giờ và thời lượng từ ô trống trong một dropdown thô, không có bản đồ tương tác hay ảnh điểm đến, mỗi lần đổi 1 phút lại phải bấm nút "Kiểm tra phương án" rồi cuộn xuống đọc các mã lỗi rời rạc. Ngoài ra, nút nổi "Hỏi trợ lý AI" đè lên giao diện, đổi nơi xuất phát bị tách thành modal ở trang khác làm gãy kế hoạch di chuyển khi sửa điểm, chuyến đi có địa điểm ngoài danh mục bị chặn cứng với lỗi hệ thống, và xung đột phiên bản giữa 2 tab làm kẹt người dùng không thể lưu mà không tải lại mất hết công chỉnh.

Người dùng cần một không gian chỉnh sửa **thống nhất, trực quan và an toàn**: chỉ có một `bản nháp chỉnh sửa` duy nhất trên timeline và bản đồ tương tác, nơi mọi thao tác tay và AI nối tiếp nhau tự nhiên, phản hồi kiểm tra tức thì ngay tại điểm bị ảnh hưởng, và chỉ ghi vào `lịch trình đã lưu` sau một bước xác nhận tường minh.

---

## Solution

Tái cấu trúc màn hình chỉnh sửa hành trình (`/trips/[id]/edit`) thành một **Workspace hợp nhất theo một `bản nháp chỉnh sửa` (Edit draft) duy nhất**, đồng bộ ngôn ngữ thị giác với trang chi tiết chuyến đi và màn hình lập kế hoạch:

- **Một nguồn làm việc duy nhất trên trình duyệt:** Cả chỉnh sửa thủ công (sửa trực tiếp trên thẻ `lượt tham quan`, kéo đổi vị trí bằng nút, thêm qua Drawer trực quan, chỉnh `nơi xuất phát` và giờ đi/về) lẫn **AI hợp nhất** đều đọc và cập nhật lên cùng một `bản nháp chỉnh sửa` hiển thị trên timeline và bản đồ tương tác, kèm lịch sử Hoàn tác/Làm lại (`Undo/Redo`) trong phiên.
- **Thao tác trực quan tại chỗ:** Hiển thị ảnh điểm đến, mở trực tiếp các điều khiển gọn trên từng thẻ `lượt tham quan`, hỗ trợ tùy chọn **tự động dời giờ các điểm sau** trong ngày, mở Drawer thêm điểm có tìm kiếm/lọc/giờ mở cửa/tự điền thời lượng gợi ý và giờ bắt đầu nối tiếp, hiển thị nhãn chặng di chuyển cùng khối `cảnh báo thời tiết` thu gọn (chỉ tham khảo), đồng thời ẩn nút nổi "Hỏi trợ lý AI" trên màn hình này.
- **Kiểm tra hai tầng và đồng bộ dữ liệu hệ thống:** Kiểm tra tức thì 0ms tại trình duyệt cho xung đột giờ/định dạng ngay khi thao tác, kết hợp tự động debounce gọi `kiểm tra tính hợp lệ` phía server (hiển thị nhãn lỗi trực tiếp lên thẻ/chặng vi phạm) bằng cùng bộ định tuyến (`PLANNER_ROUTING_PROVIDER`, giới hạn tốc độ) và tính lại kế hoạch đi/về (`journeySnapshot`).
- **Quy tắc trạng thái và lưu an toàn:** Gỡ giới hạn cứng 4 điểm/ngày (giữ trần 50 lượt toàn chuyến); khóa chuyến đã hoàn thành; bảo vệ các lượt đã qua giờ đối với chuyến đang diễn ra; cho phép giữ/điều chỉnh/xóa các địa điểm ngoài danh mục hiện có kèm xác nhận mục chưa kiểm khi lưu; hỗ trợ Rebase giữ nguyên bản nháp khi gặp xung đột phiên bản `409`; và khóa quy trình Lưu sau một hộp thoại xác nhận gọn theo hợp đồng idempotency `SUCCESS` / `FAILED` / `UNKNOWN`.

---

## User Stories

1. As a Trip owner, I want mọi chỉnh sửa thủ công và đề xuất AI cùng tác động lên một `bản nháp chỉnh sửa` duy nhất, so that tôi có thể phối hợp sửa tay và nhờ AI nối tiếp nhau trước khi lưu một lần.
2. As a Trip owner, I want thấy ngay trạng thái "Đã lưu" hoặc số lượng thay đổi chưa lưu ở đầu trang, so that tôi luôn biết `bản nháp chỉnh sửa` có đang khác `lịch trình đã lưu` hay không.
3. As a Trip owner, I want hoàn tác (`Undo`) và làm lại (`Redo`) từng bước chỉnh sửa tay hoặc bước AI trong phiên làm việc, so that tôi dám thử nghiệm thay đổi mà không sợ hỏng lịch.
4. As a Trip owner, I want chuyển đổi xem theo "Tất cả các ngày" hoặc từng ngày cụ thể qua thanh tab ngày đồng bộ với bản đồ, so that tôi tập trung chỉnh sửa từng ngày dễ dàng hơn.
5. As a Trip owner, I want thấy bản đồ lộ trình tương tác bên cạnh timeline (và chuyển tab Lịch trình/Bản đồ trên di động), so that tôi kiểm tra trực quan khoảng cách và thứ tự địa lý của các `lượt tham quan`.
6. As a Trip owner, I want xem ảnh đại diện, tên, khu vực, giờ bắt đầu và thời lượng ngay trên mỗi thẻ `lượt tham quan`, so that tôi nhận diện điểm dừng nhanh hơn thay vì nhìn các ô biểu tượng xám.
7. As a Trip owner, I want chỉnh sửa giờ bắt đầu và thời lượng trực tiếp trên thẻ `lượt tham quan` mà không phải mở thẻ accordion ẩn, so that thao tác tinh chỉnh nhanh và ít lượt bấm hơn.
8. As a Trip owner, I want đổi thứ tự lên/xuống, chuyển sang ngày khác hoặc xóa một `lượt tham quan` ngay bằng điều khiển gọn trên thẻ (dùng được bằng cả chuột, chạm và bàn phím), so that tôi sắp xếp lại ngày đi thuận tiện.
9. As a Trip owner, I want bật/tắt tùy chọn "Tự động dời giờ các điểm sau", so that khi tôi thêm điểm, đổi thứ tự hoặc kéo dài thời gian ở một điểm, các điểm phía sau trong ngày tự dời giờ nối tiếp thay vì bị trùng lịch ngay lập tức.
10. As a Trip owner, I want tự do xếp hơn 4 `lượt tham quan` trong một ngày miễn tổng toàn chuyến không vượt 50 lượt và thỏa mãn các kiểm tra hợp lệ, so that tôi không bị bó buộc bởi giới hạn tạo lịch sơ bộ ban đầu.
11. As a Trip owner, I want bấm "+ Thêm điểm dừng" ở mỗi ngày để mở ngăn chọn điểm trực quan (tìm theo tên, lọc khu vực/yêu thích, xem ảnh, giờ mở cửa và thời lượng gợi ý), so that tôi chọn đúng điểm phù hợp mà không phải đoán từ danh sách chữ thuần.
12. As a Trip owner, I want hệ thống tự điền sẵn thời lượng gợi ý và gợi ý giờ bắt đầu hợp lý ngay sau điểm trước đó khi chọn một điểm muốn thêm, so that tôi thêm điểm mới chỉ trong vài thao tác ngắn.
13. As a Trip owner, I want xem nhãn thời gian/quãng đường chặng di chuyển giữa hai `lượt tham quan` liên tiếp trên timeline, so that tôi biết ngay hai điểm có quá xa hay sát giờ nhau không.
14. As a Trip owner, I want thấy ngay cảnh báo tham khảo về thời tiết và giờ hoàng hôn (chỉ mang tính thông tin) trên không gian chỉnh sửa, so that tôi cân nhắc giờ tham quan ngoài trời mà không bị chặn quyền lưu lịch.
15. As a Trip owner, I want chỉnh sửa `nơi xuất phát`, giờ khởi hành Ngày 1 và hạn về ngày cuối (hoặc bổ sung cho chuyến cũ chưa có) ngay trong cùng trang chỉnh sửa, so that kế hoạch chặng đi/về luôn đồng bộ với các điểm tham quan mà không phải nhảy sang modal ở trang khác.
16. As a Trip owner, I want hệ thống giữ nguyên giờ các `lượt tham quan` tôi đã tự chỉnh khi tôi đổi `nơi xuất phát` hay giờ đi/về, và chỉ kiểm tra xem hai chặng biên có kịp giờ hay không, so that công sức căn chỉnh giờ chi tiết của tôi không bị ghi đè ngoài ý muốn.
17. As a Trip owner, I want có nút chủ động "Tự xếp lại giờ theo lộ trình xuất phát" khi tôi thực sự muốn hệ thống tính lại toàn bộ giờ theo `nơi xuất phát` mới, so that tôi có lựa chọn tối ưu nhanh khi thay đổi lớn điểm khởi đầu.
18. As a Trip owner, I want gõ yêu cầu bằng ngôn ngữ tự nhiên để AI thực hiện nhiều thao tác cùng lúc và tự dời giờ các điểm liên quan trên chính `bản nháp chỉnh sửa` hiện tại, so that tôi tái cấu trúc cả buổi hoặc cả ngày nhanh chóng.
19. As a Trip owner, I want AI gợi ý tối đa 3 điểm đến đủ điều kiện để tôi bấm chọn khi yêu cầu còn chung chung (ví dụ "thêm một điểm ngắm cảnh"), so that tôi không phải tự quay lại tìm kiếm từ đầu.
20. As a Trip owner, I want yêu cầu AI giữ ngữ cảnh hội thoại tạm trong phiên chỉnh sửa và hiểu được ý định đổi giờ xuất phát/hạn về (khi chưa khởi hành), so that tôi có thể trao đổi nối tiếp tự nhiên như đang trò chuyện.
21. As a Trip owner, I want hỏi AI các câu tư vấn theo lịch hiện tại (ví dụ "Ngày 1 đi vậy có bị gấp không?") và nhận câu trả lời ngắn dựa trên `bản nháp chỉnh sửa` mà không làm thay đổi lịch, so that tôi có thêm góc nhìn tham khảo ngay lúc chỉnh sửa.
22. As a Trip owner, I want đề xuất chỉnh sửa từ AI hiển thị trực tiếp lên timeline và bản đồ kèm nhãn đánh dấu phần mới thêm/sửa/xóa và nút "Hoàn tác bước AI này", so that tôi nhìn thấy ngay tác động trực quan và có thể sửa tiếp bằng tay hoặc quay lại trong một chạm.
23. As a Trip owner, I want nhận cảnh báo tức thì (0ms) ngay trên thẻ khi nhập trùng giờ hoặc sai thời lượng tối thiểu, và hệ thống tự động chạy `kiểm tra tính hợp lệ` đầy đủ khi tôi tạm dừng thao tác, so that tôi không phải bấm kiểm tra thủ công sau mỗi lần đổi nhỏ.
24. As a Trip owner, I want thấy lỗi giờ mở cửa, thời lượng tối thiểu, thời gian di chuyển hay thiếu dữ liệu định tuyến gắn trực tiếp lên đúng thẻ `lượt tham quan` hoặc chặng bị vi phạm, so that tôi sửa đúng chỗ sai thay vì đọc mã ID rời rạc.
25. As a Trip owner, I want có nút kiểm tra lại thủ công khi lần kiểm tra tự động gặp lỗi mạng hoặc hết thời gian chờ, so that tôi luôn kiểm soát được trạng thái kiểm tra của bản nháp.
26. As a Trip owner, I want hệ thống giữ nguyên `ngày bắt đầu`, `số ngày` và `phương tiện` cố định trên trang chỉnh sửa và giải thích rõ, so that cấu trúc khung của chuyến đi không bị biến đổi ngoài phạm vi màn hình này.
27. As a Trip owner, I want chuyến đi đã hoàn thành (`COMPLETED`) bị khóa chỉnh sửa, so that lịch sử chuyến đi đã kết thúc không bị sửa nhầm.
28. As a Trip owner, I want khi chỉnh sửa chuyến đang diễn ra (`ONGOING`), các `lượt tham quan` đã qua giờ và phần khởi hành ban đầu được bảo vệ cố định, trong khi các lượt/ngày sắp tới vẫn chỉnh sửa được, so that lịch sử đã đi qua được bảo toàn mà không mất quyền điều chỉnh chặng tiếp theo.
29. As a Trip owner, I want vẫn mở và chỉnh sửa được chuyến đi có chứa địa điểm ngoài danh mục (`ExternalPlace`) để giữ, đổi giờ, đổi thứ tự hoặc xóa các điểm đang có, so that tôi không bị chặn bởi lỗi chưa hỗ trợ khi cần điều chỉnh lịch trình tạo từ trợ lý chat.
30. As a Trip owner, I want hệ thống đánh dấu rõ các điểm trong danh mục đã bị ẩn bởi quản trị viên với tùy chọn thay thế hoặc xóa nhanh, và chỉ cho lưu sau khi tôi xử lý chúng, so that lịch trình lưu không giữ lại điểm đã ngừng công khai.
31. As a Trip owner, I want lỗi thiếu dữ liệu tuyến đường hoặc thiếu dữ liệu của điểm trong danh mục tiếp tục chặn lưu, còn mục thiếu dữ liệu danh mục của địa điểm ngoài danh mục hiện có được xác nhận lại rõ ràng lúc lưu, so that ranh giới trung thực của hệ thống kiểm tra luôn được giữ vững.
32. As a Trip owner, I want xem hộp thoại xác nhận gọn tóm tắt các thay đổi (kèm nhắc nhở gửi thông báo tới nhóm đồng hành nếu có, và checkbox xác nhận mục chưa kiểm nếu còn địa điểm ngoài danh mục) trước khi ghi vào database, so that mọi cập nhật chính thức đều do tôi chủ động xác nhận.
33. As a Trip owner, I want khi kết quả lưu trả về chưa xác định (`UNKNOWN`), giao diện giữ nguyên khóa idempotency và dữ liệu đã xác nhận để tôi bấm "Kiểm tra lại kết quả" mà không tạo ghi đè trùng lặp, so that hành trình không bị sai lệch khi mạng chập chờn.
34. As a Trip owner, I want khi gặp xung đột phiên bản (`409`) do chuyến đi vừa được cập nhật ở nơi khác, hệ thống giữ nguyên `bản nháp chỉnh sửa` của tôi và cho phép chọn Rebase lên phiên bản mới để kiểm tra lại hoặc bỏ nháp tải lại, so that tôi không bị mất trắng công sức chỉnh sửa.
35. As a Trip owner, I want bấm "Hủy chỉnh sửa" (hoặc rời trang khi có thay đổi chưa lưu) nhận cảnh báo xác nhận và giữ nguyên `lịch trình đã lưu` nếu tôi hủy, so that thay đổi nháp không bao giờ tự ghi đè dữ liệu thật.
36. As a mobile user (`360px+`) or keyboard user, I want toàn bộ thao tác chỉnh sửa, bản đồ, ngăn thêm điểm, thanh AI và thanh lưu ghim đáy sử dụng mượt mà không tràn ngang, và không bị nút nổi "Hỏi trợ lý AI" che mất nội dung, so that tôi chỉnh hành trình thuận tiện trên mọi thiết bị.
37. As a Guest, non-owner Traveler, or Admin viewing another user's trip, I want mọi yêu cầu mở trang hoặc gọi API chỉnh sửa không thuộc quyền sở hữu đều bị từ chối chuẩn xác theo phiên và quyền sở hữu trên server, so that dữ liệu hành trình riêng tư được bảo vệ tuyệt đối.
38. As a Trip owner, I want mở `/trips/[id]/in-trip` hay `/trips/[id]/edit` đều dẫn về cùng một không gian `Trợ lý chuyến đi` (`Saved-trip assistant`) có khung chat AI song hành với Timeline và Bản đồ, so that tôi không bị phân mảnh giữa hai màn hình sửa lịch trình khác nhau.
39. As a Trip owner, I want hỏi các câu tình huống thực tế (như *"sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao cho hợp lý?"*, *"tôi đi thế này được không?"*, *"có nên đi thứ tự này không?"*) và nhận câu trả lời tư vấn tự nhiên dựa trên kết quả mô phỏng kiểm tra thật cùng các thẻ `Gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`) bấm áp dụng 1 chạm, so that AI hỗ trợ tôi ra quyết định thông minh mà không tự ý làm hỏng bản nháp.
40. As a Trip owner, I want hỏi thông tin địa điểm/văn hóa/kinh nghiệm địa phương (qua RAG + `Kiến thức mở rộng` có gắn nhãn) và hỏi `dự báo thời tiết` / `giờ mặt trời` của các ngày trong chuyến đi ngay trong cùng khung Trợ lý chuyến đi, so that tôi có đủ thông tin tham khảo tại một nơi duy nhất khi điều chỉnh lịch.
41. As a Trip owner, I want Trợ lý chuyến đi chỉ hỏi GPS hoặc vị trí thủ công khi chuyến đi đang `ONGOING` và yêu cầu của tôi thực sự phụ thuộc vị trí đang đứng, so that tôi không bị chặn vô lý khi sửa lịch trước chuyến đi hay khi chỉ muốn đổi giờ/đổi điểm.
42. As a Trip owner, I want khung hội thoại Trợ lý chuyến đi giữ được ngữ cảnh tới 16 lượt trao đổi gần nhất trong phiên cùng các thao tác sửa tay xen kẽ, so that tôi có thể bàn bạc và tinh chỉnh sâu nhiều bước liên tiếp trước khi bấm Lưu.

---

## Implementation Decisions

### 1. Kiến trúc tổng thể & ranh giới trách nhiệm
- Giữ mô hình Modular Monolith trên Next.js App Router: Route Handlers chỉ xác thực, kiểm tra `Origin`/Content-Type/kích thước JSON, parse input và ánh xạ response/error theo envelope chuẩn (`private, no-store`); toàn bộ quy tắc nghiệp vụ, quyền sở hữu, xác minh dữ liệu và persistence nằm trong các service backend.
- Áp dụng **một `bản nháp chỉnh sửa` (`Edit draft`) stateless ở phía client** cho toàn bộ trang chỉnh sửa và trợ lý chuyến đi; không thêm bảng draft mới trong database để lưu nháp chưa kiểm tra/chưa xác nhận.
- `Edit draft` chứa đồng thời trạng thái `lượt tham quan` theo ngày và trạng thái `nơi xuất phát` / giờ khởi hành / hạn về (nếu có hoặc người dùng opt-in bổ sung).
- `ngày bắt đầu`, `số ngày` và `phương tiện` giữ bất biến trong suốt phiên chỉnh sửa tại màn hình này; server từ chối mọi request cố tình thay đổi các trường khung đó (AI giải thích rõ phạm vi khi người dùng hỏi đổi các trường này).
- Ghi nhận [`ADR-37`](../decisions.md#adr-37--unified-stateless-client-edit-draft-and-atomic-edit-apply-2026-11-18) và [`ADR-38`](../decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19) cho quyết định hợp nhất client draft, gộp `/trips/[id]/in-trip` vào cùng Workspace `Saved-trip assistant`, kiến trúc AI tư vấn 2 bước có mô phỏng server và gỡ giới hạn 4 lượt/ngày.

### 2. Mô hình trạng thái client (`Edit draft`, Undo/Redo, Preview & Rebase)
- **Nguồn dữ liệu thống nhất:** Khởi tạo từ snapshot `Saved itinerary` + `baseRevision` (`Trip.updatedAt`) đọc cùng lúc trên server. Giữ bản `baseline` tách biệt với `workingDraft`.
- **Undo/Redo stack trong phiên:** Mọi thao tác chỉnh tay (thêm, xóa, đổi giờ, đổi thời lượng, đổi thứ tự, chuyển ngày, đổi xuất phát/giờ đi-về, tự xếp lại giờ) và mỗi lượt AI chỉnh sửa tạo ra một bước lịch sử trong bộ nhớ phiên. Khi thực hiện thao tác mới sau khi đã Undo, nhánh Redo cũ được cắt bỏ.
- **Tự động dời giờ dây chuyền (Auto-shift):** Cung cấp tùy chọn bật/tắt ở cấp phiên (chỉ áp dụng trong cùng ngày và không chạm vào các lượt đã khóa khi chuyến `ONGOING`). Khi thêm điểm, đổi thứ tự hoặc thay đổi giờ/thời lượng một lượt, các lượt phía sau có thể tự dịch chuyển tuần tự theo độ dài chặng di chuyển gần nhất đã biết (hoặc nối tiếp an toàn nếu chưa có dữ liệu route) miễn không vượt quá `23:59` của ngày đó; nếu vượt cuối ngày thì giữ trạng thái cảnh báo rõ để người dùng tự xử lý thay vì tự đẩy sang ngày khác.
- **Kiểm tra hai tầng:**
  - *Tầng 1 (Client instant, 0ms):* Kiểm tra định dạng giờ/thời lượng, vượt quá `24:00`, trùng khoảng giờ trong ngày và thời lượng tối thiểu (nếu có metadata) ngay lập tức để gắn cảnh báo nhẹ trên thẻ bị ảnh hưởng.
  - *Tầng 2 (Server Preview, debounced ~800ms + nút chạy tay):* Khi `workingDraft` thay đổi và khác `baseline`, tự động debounce gửi `workingDraft` + `baseRevision` tới endpoint preview (hủy/bỏ qua response đến muộn bằng sequence token để chống race condition). Khi đang chờ kiểm tra hoặc vừa sửa xong chưa nhận kết quả preview khớp với `workingDraft` hiện tại, nút **Lưu thay đổi** bị khóa (`canConfirm = false`).
- **Xử lý xung đột phiên bản (`409 TRIP_REVISION_CONFLICT`):** Khi Preview, AI hoặc Apply trả về `409`, không xóa `workingDraft`. Client tải lại snapshot mới nhất (`latestBaseline`, `latestRevision`) và trình bày hai lựa chọn rõ ràng:
  - *Rebase bản nháp hiện tại lên phiên bản mới:* Giữ nguyên `workingDraft`, cập nhật `baseRevision = latestRevision` và `baseline = latestBaseline` (với cảnh báo kiểm tra lại khác biệt so với bản mới nhất), tự động kích hoạt preview mới.
  - *Hủy nháp & dùng bản mới nhất:* Thay `workingDraft` bằng `latestBaseline` và xóa sạch lịch sử Undo cũ.

### 3. Quyền truy cập, trạng thái chuyến & quy tắc miền dữ liệu
- **Phân quyền & sở hữu:** Dùng chung guard Traveler (cho phép `TRAVELER` và `ADMIN` thao tác trên chuyến đi **do chính mình sở hữu** theo RBAC V2, không bao giờ cho phép Admin sửa chuyến của người khác). Auth chạy trước khi đọc body. Chuyến không tồn tại hoặc không thuộc sở hữu cùng trả `404`. Thành viên tham gia tìm bạn đồng hành (`MEMBER`) không có quyền mở trang hoặc gọi API sửa.
- **Khóa theo trạng thái chuyến (`TripStatus` & thời gian Việt Nam `Asia/Ho_Chi_Minh`):**
  - `COMPLETED` (theo ngày kết thúc hoặc `manuallyCompletedAt`): Khóa hoàn toàn trên server cho cả Preview, AI và Apply (`409`); giao diện trang chi tiết ẩn đường dẫn chỉnh sửa, truy cập trực tiếp URL hiển thị trạng thái chỉ xem/thông báo đã hoàn thành.
  - `ONGOING`: Bảo vệ các `lượt tham quan` đã qua giờ kết thúc (tính theo `Asia/Ho_Chi_Minh` tại thời điểm server xử lý) theo cùng logic `preserveCompleted` của luồng in-trip — không cho xóa, đổi giờ, đổi thứ tự hay dời ngày các lượt đó; đồng thời khóa chỉnh sửa `nơi xuất phát` và giờ khởi hành theo mốc cutoff đã khởi hành. Các lượt và ngày chưa qua giờ vẫn chỉnh sửa bình thường.
  - `UPCOMING`: Cho phép chỉnh cả `lượt tham quan` lẫn `nơi xuất phát`/giờ đi/hạn về.
- **Gỡ giới hạn 4 lượt/ngày:** Mở trần số `lượt tham quan` mỗi ngày trong contract candidate chỉnh sửa; giữ trần tối đa `50` lượt toàn chuyến và tối thiểu `1` lượt tham quan trong cả chuyến theo contract lưu hiện có.
- **Địa điểm ngoài danh mục (`ExternalPlace`):**
  - Chuyến đi có chứa `ExternalPlace` được phép mở `/edit`, đọc thông tin an toàn theo chính sách cache 30 ngày của module Trip Read (nếu quá hạn 30 ngày thì hiển thị nhãn chung và không hiển thị tọa độ cache cũ, vẫn giữ ID tham chiếu để bảo toàn/cho phép xóa hoặc đổi giờ).
  - Người dùng được giữ nguyên, đổi giờ, đổi thứ tự hoặc xóa `ExternalPlace` hiện có; màn hình chỉnh sửa chưa cung cấp chức năng tìm/thêm mới địa điểm từ Google Places.
  - Khi còn `ExternalPlace` trong bản nháp, bước Preview trả về danh sách `uncheckedItems` tính từ phía server (chỉ áp dụng cho `ExternalPlace`, không áp dụng cho lỗi của điểm trong danh mục KLTN hay lỗi thiếu tuyến đường); bước Apply bắt buộc gửi `acknowledgedUnchecked` khớp đúng danh sách server tính, được đưa vào hash idempotency và lưu lại `uncheckedChecks` / `uncheckedConfirmedAt` (hoặc xóa sạch về `null` nếu người dùng đã xóa hết `ExternalPlace` khỏi bản nháp).
- **Điểm catalog đã ẩn (`HIDDEN` / `deletedAt`):** Giữ nguyên nguyên tắc không cho giữ điểm không còn công khai trong bản cập nhật mới; giao diện gắn nhãn cảnh báo đỏ nổi bật trực tiếp trên thẻ điểm đó kèm nút thay thế/xóa nhanh, và Preview/Apply trả lỗi chi tiết trỏ đúng `visitId` cần xử lý.

### 4. Hợp đồng Backend (`Preview`, `AI Edit`, `Apply`)
- **Định tuyến & Chính sách tốc độ nhất quán:** Cả `Preview`, `AI Edit` và `Apply` dùng chung bộ cấu hình provider định tuyến của hệ thống (`PLANNER_ROUTING_PROVIDER`: Stadia mặc định hoặc Google Routes sau flag) và cùng rule tốc độ/nghỉ dọc đường như Planner và Trip Detail. Thiếu tuyến đường hoặc timeout (tối đa 10 giây) luôn trả `INSUFFICIENT_DATA`, tuyệt đối không suy đoán hoặc chuyển sang `PASS`.
- **Tích hợp `journeySnapshot` trong `Preview` và `Apply`:**
  - Nếu bản nháp có dữ liệu `nơi xuất phát` đầy đủ (cả trường hợp sửa lại hoặc chuyến cũ chủ động opt-in bổ sung), `Preview` thực hiện xác thực vùng phủ Việt Nam, tính lại hai chặng biên (`Origin → Điểm đầu`, `Điểm cuối → Origin`), thời gian nghỉ dọc đường dự kiến (`Roadside rest allowance`) và kiểm tra hạn về / quy tắc không lái xuyên đêm.
  - Đổi `nơi xuất phát` hoặc giờ đi/về không tự động ghi đè giờ các `lượt tham quan` trong bản nháp; tính lại toàn bộ giờ chỉ diễn ra khi người dùng chủ động kích hoạt thao tác "Tự xếp lại giờ theo lộ trình xuất phát" (chạy ở client hoặc qua endpoint tính lại không ghi DB).
  - Chuyến cũ chưa có `nơi xuất phát` (`journey = null`) vẫn sửa `lượt tham quan` bình thường kèm thông báo chưa tính hai chặng đi/về.
  - Trong `Apply`: mọi kiểm tra định tuyến và Validator chạy **bên ngoài transaction database**; bên trong `executeIdempotentWrite` transaction chỉ kiểm tra lại quyền sở hữu, trạng thái chuyến, `baseRevision` CAS (`updatedAt`), độ tươi dữ liệu điểm đến và ghi nguyên tử: cập nhật `Trip.updatedAt`, cập nhật `journeySnapshot` (kèm `visitFingerprint` mới), cập nhật `uncheckedChecks` / `uncheckedConfirmedAt`, thay thế `ItineraryDay` / `ItineraryVisit` (giữ ổn định `visitId` của các lượt không thay thế) và ghi `CompanionItineraryChange` nếu chuyến có đăng tìm bạn đồng hành (không làm lộ tọa độ/địa chỉ `nơi xuất phát` vào thông báo nhóm).
- **Hợp đồng AI Edit & Trợ lý chuyến đi thông minh (`/edits/ai` — mở rộng theo `ADR-38`):**
  - Request nhận: `baseRevision`, `draft` (`Edit draft` hiện tại gồm cả `days` và `journey` tùy chọn), `message` (giới hạn độ dài), tùy chọn `history` trong phiên (tối đa **16 lượt gần nhất**, được chuẩn hóa/giới hạn độ dài và xem là dữ liệu không đáng tin cậy), `resolution` (nếu đang trả lời gợi ý chọn điểm/lượt/ngày), và tùy chọn `location` (GPS hoặc vị trí thủ công chỉ khi chuyến đi `ONGOING` và yêu cầu thực sự phụ thuộc vị trí đang đứng).
  - **Bản đồ 7 nhóm tình huống câu hỏi người dùng:**
    1. *Đánh giá tổng thể / độ hợp lý* (*"Tôi đi thế này được không?"*, *"Lịch Ngày 1 có gấp không?"*, *"Có nên đi thứ tự này không?"*).
    2. *Tình huống muốn nghỉ ngơi / đến sớm-muộn / đổi nhịp độ* (*"Sáng đến nơi muốn nghỉ đến 9h mới đi thì chỉnh sao?"*, *"Đoàn mệt muốn đi thong thả"*, *"Xuất phát trễ 2 tiếng"*) — tạo `Khoảng nghỉ trong lịch` (`Schedule rest buffer`) hoặc dời mốc bắt đầu + `auto-shift`.
    3. *Đổi / thêm địa điểm thông minh* (*"Muốn đổi điểm này"*, *"Có chỗ nào hợp hơn không?"*) — gợi ý tối đa 3 điểm `VISIBLE` trong danh mục KLTN khớp khu vực, khung giờ mở cửa, thời lượng và thời tiết (ưu tiên điểm trong nhà khi có cảnh báo mưa lớn/sau hoàng hôn).
    4. *Lệnh chỉnh sửa trực tiếp (đơn lẻ hoặc gộp nhiều thao tác + chỉnh `Nơi xuất phát`/giờ đi-về khi `UPCOMING`)*.
    5. *Câu hỏi kép vừa hỏi đánh giá vừa nhờ sửa luôn*.
    6. *Hỏi thông tin điểm đến, văn hóa, kinh nghiệm ăn nghỉ địa phương* — truy xuất **RAG tài liệu đã duyệt + `Kiến thức mở rộng` (có gắn nhãn rõ)** ngay trong luồng chat mà không làm biến đổi `Edit draft`.
    7. *Hỏi thời tiết / giờ mặt trời / lượt tiếp theo của chuyến đi* — đọc trực tiếp từ `dự báo thời tiết` (Open-Meteo), `giờ mặt trời` (`suncalc`) của đúng ngày trong lịch và danh sách `lượt tham quan` còn lại (mở ngoại lệ `ADR-36` cho `Saved-trip assistant`, giữ nguyên nguyên tắc thời tiết không phải là `Constraint Validator` và không cam kết an toàn tuyệt đối thay người dùng).
  - **Kiến trúc 2 bước trên Server (`Intent + Server Dry-Run Simulation` → `Grounded Advisory Composer`):**
    - *Bước 1:* Phân tích ý định và (với câu hỏi tình huống/tối ưu lịch) sinh tối đa **2 phương án điều chỉnh ứng viên (`candidate remedies`)**. Server xác minh lại mọi `visitId`, `destinationId`, ngày, tham số giờ với dữ liệu thực tế từ `draft` + database (chặn ID giả, chặn chạm vào lượt đã qua giờ nếu `ONGOING`, chặn đổi giờ xuất phát sau cutoff), rồi chạy **mô phỏng thử (`dry-run`)** từng phương án qua bộ tính giờ, bộ định tuyến (`PLANNER_ROUTING_PROVIDER`), `Constraint Validator`, `suncalc` + Open-Meteo và (nếu cần) bộ truy xuất RAG.
    - *Bước 2:* Model nhận bộ sự thật đã kiểm chứng từ Bước 1 để soạn câu trả lời tiếng Việt tự nhiên, thông minh, đi thẳng vào câu hỏi của người dùng. Các thẻ **`Gợi ý chỉnh sửa từ tư vấn` (`Actionable advice suggestion`)** và kết quả kiểm tra (`PASS` / `VIOLATION` / `INSUFFICIENT_DATA`) luôn do code server đóng gói trực tiếp; nếu bước gọi LLM soạn lời văn bị lỗi hoặc timeout, server tự động fallback về bản tóm tắt dữ liệu chuẩn.
  - Các trạng thái trả về từ `/edits/ai`:
    - `PROPOSED`: `draft` mới (để client đổ vào `workingDraft` kèm Undo), danh sách `diff`, lời giải thích tự nhiên và `validation` đầy đủ.
    - `ADVISED`: câu trả lời `tư vấn theo lịch hiện tại` tự nhiên dựa trên sự thật server (bao gồm cả RAG/thời tiết khi được hỏi), giữ nguyên `draft` không thay đổi, kèm tối đa 2 thẻ `Actionable advice suggestion` đã được server kiểm chứng sẵn để người dùng bấm **"Áp dụng phương án này vào bản nháp"** trong 1 chạm (không cần gọi LLM lại).
    - `NEEDS_CLARIFICATION` / `NEEDS_LOCATION`: câu hỏi làm rõ kèm tối đa 3 lựa chọn tạo bởi code từ dữ liệu server, hoặc yêu cầu GPS/vị trí thủ công khi chuyến `ONGOING` thực sự cần vị trí hiện tại.
  - Endpoint AI tuyệt đối không ghi database.

### 5. Hợp đồng UX / UI & Responsive (`360px+` — hợp nhất `/edit` & `/in-trip` theo `ADR-38`)
- **Điều hướng & Route hợp nhất:**
  - Hợp nhất `/trips/[id]/edit` và `/trips/[id]/in-trip` vào cùng một Workspace `Trợ lý chuyến đi` (`Saved-trip assistant`). Truy cập `/trips/[id]/in-trip` mở chính Workspace này với khung hội thoại Trợ lý AI được mở và focus sẵn; trên trang chi tiết `/trips/[id]`, các nút hành động dẫn thống nhất vào Workspace này.
- **Bố cục Desktop & Mobile:**
  - Thay thanh `AiEditBar` nhỏ hẹp bằng **Khung hội thoại Trợ lý AI hoàn chỉnh** (luồng chat nhiều lượt tối đa 16 lượt, gợi ý câu hỏi thông minh theo trạng thái chuyến đi, thẻ `Actionable advice suggestion` 1 chạm, thẻ chọn điểm thay thế, và nút GPS/vị trí thủ công khi `ONGOING` cần vị trí).
  - Trên Desktop (`>= 900px`): Hiển thị song hành **Khung Trợ lý AI + Timeline `Bản nháp chỉnh sửa` + Bản đồ `ItineraryMap` sticky** (cho phép thu gọn/mở rộng linh hoạt để vừa trò chuyện với AI vừa nhìn lịch/bản đồ cập nhật trực tiếp hoặc chỉnh tay).
  - Trên Mobile (`< 900px`, từ `360px` không tràn ngang): thanh chuyển 3 tab `Trợ lý AI` / `Lịch trình` / `Bản đồ`, thông báo nổi khi AI vừa cập nhật nháp hoặc có phương án gợi ý, và thanh hành động ghim đáy (`sticky bottom bar`) hiển thị tóm tắt trạng thái kiểm tra + số thay đổi + nút **Lưu thay đổi** (các nút chạm tối thiểu `44×44px`).
  - Ẩn nút nổi toàn cục "Hỏi trợ lý AI" trên cả `/trips/[id]/edit` và `/trips/[id]/in-trip`.
- **Thuật ngữ nhất quán trên UI:** Sử dụng đúng bộ thuật ngữ `Lịch trình đã lưu`, `Bản nháp chỉnh sửa`, `Lượt tham quan`, `Kiểm tra tính hợp lệ`, `Nơi xuất phát` (khớp `GLOSSARY.md`).
- **Tương tác thêm & sửa:**
  - Ngăn chọn điểm đến (`Add visit drawer`) tải danh sách công khai qua API hiện có, hỗ trợ tìm kiếm, lọc theo khu vực và danh sách Yêu thích, hiển thị ảnh, khu vực, giờ mở cửa theo ngày đang chọn và thời lượng gợi ý; khi chọn sẽ tự tính sẵn giờ bắt đầu tiếp nối điểm trước (nếu có) và thời lượng mặc định.
  - Thay đổi từ AI khi đổ lên timeline phải gắn badge phân biệt tạm thời (đã thêm / đã chỉnh / vừa dời) kèm banner thao tác nhanh *Hoàn tác bước AI* để người dùng nhận biết ngay điều gì vừa xảy ra.
  - Mọi trạng thái loading, checking, AI thinking, empty day, error, `409` rebase, hộp thoại Xác nhận lưu (hiển thị diff, cảnh báo nhóm đồng hành nếu có, checkbox `uncheckedChecks` nếu có `ExternalPlace`) và trạng thái `UNKNOWN` ("Kiểm tra lại kết quả" với nguyên khóa idempotency và payload đã đóng băng) phải có thông báo rõ ràng bằng tiếng Việt, hỗ trợ điều hướng bàn phím và `aria-live`.

---

## Testing Decisions

### Ranh giới (Seams) đề xuất để kiểm thử
Ưu tiên ít seam nhất ở điểm vào cao nhất có thể (khớp kiến trúc sẵn có của repo):

1. **Seam 1 — API & Service Contract của Trip Edit (`preview`, `ai`, `apply` + `getTripForEdit`):**
   - Dùng trực tiếp các Route Handler / HTTP adapter hiện có của Trip Edit kết hợp với database giả lập/PostgreSQL disposable và fake routing/LLM providers có đồng hồ tham chiếu cố định.
   - Không tạo thêm lớp orchestrator hay interface giả chỉ phục vụ test.

2. **Seam 2 — Unified Edit Workspace & Client Controller / Browser Boundary:**
   - Kiểm thử trực tiếp client state/controller (Undo/Redo, auto-shift, 0ms instant checks, debounced preview cancellation, `409` rebase, `UNKNOWN` exact-key/payload retry) và thành phần giao diện hoàn chỉnh (`EditTripClient`) trên trình duyệt/DOM harness ở cả Desktop và `360px`.

*(Xác nhận lại với người dùng trong phần trả lời rằng 2 seam cấp cao này đã khớp kỳ vọng kiểm thử trước khi bước sang giai đoạn viết story/code).*

### Nguyên tắc viết test & các kịch bản bắt buộc
- **Nguyên tắc chung:** Test chỉ kiểm tra **hành vi đầu ra quan sát được** (kết quả HTTP, trạng thái Validator, dữ liệu DB sau commit, trạng thái UI hiển thị/khóa nút), không assert tên helper nội bộ hay thứ tự gọi hàm bên trong. Dùng dữ liệu tổng hợp (`synthetic`) với đồng hồ cố định (`Asia/Ho_Chi_Minh`); test provider thật (OpenAI, VietMap/Stadia/Google) tách thành bước live kiểm chứng riêng.
- **Kịch bản Backend/API (`vitest` + PostgreSQL disposable):**
  - Auth trước body (`401` Guest, `403` non-owner/Admin xem chuyến người khác, `404` ẩn sự tồn tại), cache header `private, no-store`.
  - Gỡ giới hạn 4 lượt/ngày (cho phép lưu ngày có >= 5 lượt khi hợp lệ, vẫn chặn khi tổng > 50 hoặc rỗng 0 lượt toàn chuyến).
  - Bảo vệ trạng thái chuyến: `COMPLETED` từ chối mọi thao tác; `ONGOING` từ chối sửa/xóa/dời lượt đã qua giờ và đổi `nơi xuất phát` sau giờ khởi hành, vẫn cho sửa các lượt tương lai.
  - Đồng bộ `PLANNER_ROUTING_PROVIDER` & tính lại `journeySnapshot` (`visitFingerprint`, outbound/return legs, rest allowance) trong Preview và Apply; legacy no-origin vẫn sửa được bình thường.
  - `ExternalPlace` & `uncheckedChecks`: bảo toàn khi giữ nguyên, cập nhật/yêu cầu `acknowledgedUnchecked` đúng danh sách server khi còn điểm ngoài danh mục, tự xóa sạch `uncheckedChecks` khi xóa hết `ExternalPlace`; vẫn chặn cứng nếu thiếu route hoặc điểm catalog KLTN bị ẩn/thiếu dữ liệu.
  - AI Edit: nhận `draft` chưa lưu từ client; thực hiện multi-op + chain time shift; gợi ý tối đa 3 điểm; trả lời `ADVISED` chỉ-đọc không biến đổi draft; từ chối ID giả/lượt đã qua giờ; tuyệt đối không ghi DB.
  - Concurrency & Idempotency (chạy trên PostgreSQL disposable thật): hai request cùng `baseRevision` chỉ một request thắng, request sau nhận `409`; replay cùng `Idempotency-Key` + payload trả về kết quả cũ trước kiểm tra stale revision; cùng key khác payload trả `409`; đứt kết nối/giả lập `UNKNOWN` sau commit retry cùng key tạo đúng một cập nhật và cập nhật thông báo nhóm đồng hành một lần (không lộ tọa độ `nơi xuất phát` vào notice).
- **Kịch bản Client & Browser:**
  - Luồng nối tiếp: sửa tay → nhờ AI sửa tiếp trên bản nháp đó → sửa tay tiếp → Undo bước AI → Rebase sau `409` → mở hộp thoại xác nhận → xử lý `UNKNOWN` retry.
  - Responsive `360px` và `1280px+` (Light/Dark), không tràn ngang, nút chạm `>= 44px`, ẩn nút nổi "Hỏi trợ lý AI", thao tác hoàn chỉnh bằng bàn phím và thông báo `aria-live`.
- **Prior art trong repo:** Kế thừa mô hình kiểm thử của bộ test `trip-edit` hiện tại (route/service integration với fake DB/provider), `trip-save` (`unchecked-checks` & disposable PostgreSQL concurrency/UNKNOWN), `trip-origin` (`journey-edit` & cutoff), `tripsage-chat` và `US-38` responsive/accessibility browser harness.

---

## Out of Scope

- Triển khai code, thay đổi schema/migration, sinh Prisma client, đăng issue lên tracker hoặc deploy trong phạm vi tài liệu spec này.
- Cho phép chỉnh sửa `ngày bắt đầu`, `số ngày` hoặc `phương tiện` ngay trong `/trips/[id]/edit`.
- Tích hợp tìm kiếm & thêm mới địa điểm ngoài danh mục (Google Places / web search) vào Drawer thêm điểm của `/edit` (việc khám phá địa điểm ngoài danh mục tiếp tục thuộc luồng chat Trợ lý AI).
- Lưu `bản nháp chỉnh sửa` dài hạn trên database hoặc đồng bộ nháp giữa nhiều thiết bị/phiên đăng nhập.
- Kéo-thả (`Drag & Drop`) thẻ điểm dừng bằng chuột/cảm ứng (sử dụng nút Lên/Xuống và menu Chuyển ngày nhanh).
- Chỉnh sửa cộng tác nhiều người (`shared editing`) hoặc mở quyền sửa cho thành viên đoàn (`Trip member`).
- Tối ưu tuyến đa mục tiêu phức tạp ngoài quy tắc tuần tự/tự xếp giờ theo lựa chọn của người dùng, đặt chỗ/lưu trú hoặc chỉnh sửa trực tiếp dữ liệu thời tiết.

---

## Further Notes

- **Nguồn quyết định:** Phỏng vấn `Q1–Q19` (2026-11-18) và `Q1–Q10` (2026-11-19), [`GLOSSARY.md`](../../GLOSSARY.md), [`ADR-37`](../decisions.md#adr-37--unified-stateless-client-edit-draft-and-atomic-edit-apply-2026-11-18), [`ADR-38`](../decisions.md#adr-38--unified-saved-trip-assistant-and-2-step-grounded-advisory-pipeline-2026-11-19), [`product-spec.md`](product-spec.md), [`US-32`](../stories/US-32-manual-itinerary-edit.md), [`US-33`](../stories/US-33-ai-itinerary-edit.md), [`TRIP-ORIGIN-ROUND-TRIP.md`](../stories/TRIP-ORIGIN-ROUND-TRIP.md), [`ADR-36` (Weather)](../decisions.md#adr-36--weather-is-an-advisory-never-a-constraint-validator-input-2026-11-18) và [`ADR-36` (Tripsage port)](../decisions.md#adr-36--port-the-tripsage-ai-chatagent-to-replace-the-planning-chat-2026-11-14).
- **Khoảng trống hiện trạng đã xác minh khi khảo sát code:**
  - Nếu dự án chưa chạy 2 migration đã tạo trước đó cho `ExternalPlace` và `uncheckedChecks` trên database Development/Production thì cần kiểm tra trạng thái migration trước khi kiểm thử tính năng `ExternalPlace` thật.
  - Cần giữ ranh giới quyền riêng tư `Trip origin` từ `TRIP-ORIGIN-ROUND-TRIP.md`: không bao giờ phát tọa độ/địa chỉ nơi xuất phát ra projection công khai hay thông báo nhóm đồng hành khi lưu chỉnh sửa.
- **Lưu ý quy trình `to-spec`:** Bản spec được ghi thành một file trong repository theo yêu cầu trực tiếp của người dùng nên chưa xuất bản lên hệ thống issue tracker ngoài (và chưa gắn nhãn `ready-for-agent` trên tracker). Nếu sau này muốn cấu hình issue tracker cho skill, chạy `/setup-matt-pocock-skills`; việc này không bắt buộc để duyệt hoặc triển khai theo file spec hiện tại.
- **Bước tiếp theo sau khi duyệt spec:** Khi người dùng xác nhận các test seams và yêu cầu chuyển sang thực hiện, tách/lập kế hoạch triển khai theo từng lát cắt dọc (1: Backend contract + Unified Preview/Apply + Routing/Journey/Status/ExternalPlace; 2: AI Edit đa thao tác + Tư vấn + Context; 3: Giao diện Workspace Timeline + Bản đồ + Drawer + Mobile `360px+` + Rebase/Confirm UI; 4: Kiểm thử tích hợp + trình duyệt + nghiệm thu).

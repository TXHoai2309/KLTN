# Hội thoại lập hành trình: ngày linh hoạt, lời đáp và khách vãng lai

Trạng thái: **Q1–Q5 đã được chủ dự án duyệt; đã triển khai và kiểm chứng code/model** — 2026-10-27. Chủ dự án xác nhận Q4–Q5 bằng “có tôi đồng ý”. Browser acceptance vẫn mở vì browser use bị tắt trong Work settings.

Người dùng gọi `grill-with-docs` sau khi thử “31/10”, rồi “khoảng tuần sau” và nhận lại cùng câu hỏi ngày khởi hành. Tài liệu này phân biệt hiện trạng đã đọc từ code với hướng đề xuất; không thay thế các quyết định Q1–Q7 trước đó và không mở quyền Guest một cách ngầm định.

## Hiện trạng đã đối chiếu

- `modules/assistant-planning/planning-ai.ts` gọi model để hiểu câu mới, nhận nhu cầu hiện tại, câu AI đang hỏi, tối đa tám lượt planning gần đây và danh sách điểm của đề xuất. Một call khác chọn ID/thứ tự điểm; scheduler/routing/Validator quyết định giờ và điều kiện. AI không quyết định PASS hoặc thành công lưu.
- Prompt hiện yêu cầu “Không đoán ngày tương đối; hỏi ngày cụ thể”. Request chưa có ngày hôm nay/múi giờ làm mốc. Chưa có biểu diễn riêng cho ngày thiếu năm, ngày suy ra hoặc khoảng thời gian dự kiến.
- `PlanningClient.advance` dùng `nextNeedsPrompt`; phần lớn câu hỏi, recap và thông báo sau generation là câu mẫu. `analysis.message` được dùng ở nhánh CLARIFY và một số thao tác, không phải bộ soạn lời đáp chung sau mỗi bước. Vì vậy có AI hiểu câu không đồng nghĩa mọi câu hiển thị được AI viết theo ngữ cảnh.
- Cấu hình local được kiểm tra chỉ tên model: `OPENAI_QA_MODEL=gpt-6-luna`. Provider planning hiện dùng chung default QA, với high reasoning cho Luna. Tài liệu cũ có lựa chọn Sol; hiện trạng runtime được phân biệt với yêu cầu/tài liệu đó. Không đổi cấu hình hoặc gọi model trong phiên phỏng vấn này.
- Guest có public Q&A; API planning yêu cầu Traveler/Admin. Guest gọi START chỉ nhận lời mời đăng nhập, chưa có workspace/hành trình. Static audit phát hiện sau đó `active=true` khiến các câu public Q&A tiếp theo vẫn bị chuyển vào planning rồi trả HANDLED khi không có workspace. Đây là finding từ code, chưa phải browser reproduction.
- Handoff đăng nhập hiện chỉ giữ nội dung/context trong bộ nhớ cùng tab, tối đa năm phút; không tự gửi hoặc tạo/lưu sau đăng nhập. Cần giữ rõ ý định và không để Guest bị kẹt khỏi public Q&A.

## Các bất biến giữ nguyên

- Hệ thống hiểu câu và viết lời đáp tách khỏi quyết định dữ liệu/nghiệp vụ; model không tự phát minh ngày, người đi cùng, điểm đến, giờ mở cửa hoặc kết quả kiểm tra.
- Người dùng có thể nói chưa chốt ngày để xem đề xuất sơ bộ. Ngày chính xác hợp lệ và mọi kiểm tra bắt buộc vẫn cần trước khi lưu chính thức.
- Lưu vẫn là xác nhận riêng, có ownership và SUCCESS/FAILED/UNKNOWN/idempotency hiện hành.
- Tạo hành trình đầy đủ cho Guest là thay đổi quyền sản phẩm, chỉ thực hiện khi chủ dự án duyệt rõ. Đăng nhập không tự phát lại write/generation.

## Vòng 1 — Q1–Q3 đã thống nhất

Chủ dự án trả lời: “Tôi đồng ý, nhưng mà dùng model luna hight hết nhé, ở q3 có thể thêm nút điều hướng tới đăng nhập”. Q1 được duyệt theo đề xuất; Q2 được duyệt với `gpt-6-luna` / reasoning `high` cho mọi bước AI của luồng này; Q3 giữ ranh giới Guest hiện tại và thêm nút điều hướng đăng nhập rõ ràng. Đề xuất dùng Sol trước đó bị thay thế, không triển khai Sol/Terra hoặc tự chuyển model.

### Q1 — Hiểu ngày và làm rõ theo câu đã nhận

Đề xuất:

- Mốc ngày do server cấp theo giờ Việt Nam cho mỗi lượt.
- “31/10” vào 27/10/2026 được hiểu là ứng viên 31/10/2026, trình bày năm rõ trong phản hồi/recap để người dùng kiểm tra. Không hỏi lại nguyên câu “ngày nào?”.
- Ngày thiếu năm đã qua không tự nhảy sang năm sau; hỏi có phải người dùng muốn năm sau không. Ngày không tồn tại hỏi sửa cụ thể.
- “mai”, “ngày kia” có thể quy ra ngày chính xác theo mốc server; nói rõ ngày đã hiểu. Những cách nói mơ hồ phải giữ sự mơ hồ đó.
- “Khoảng tuần sau” vào 27/10/2026 là khoảng 02–08/11/2026 nếu thống nhất tuần thứ Hai–Chủ nhật; hỏi ngày cụ thể trong khoảng đó hoặc cho phép chưa chốt để tạo bản sơ bộ. Không tự chọn thứ Hai làm ngày khởi hành.
- Khi người dùng đổi từ ngày cụ thể sang khoảng thời gian, nhận biết đây có thể là sửa câu trả lời trước và làm rõ ngày cũ còn hiệu lực không.
- Nhận nhiều nhu cầu trong một câu, trả lời gián tiếp và sửa thông tin; tránh lặp nguyên câu hỏi khi chưa hiểu hoặc người dùng đã đưa thông tin một phần.

Nhánh sau khi duyệt: quy tắc năm/tuần/“thứ này–thứ tới”, thời hạn xác nhận ngày suy ra, ngày qua lúc mở lại phiên và độ bền dữ liệu khoảng thời gian.

### Q2 — AI viết lời đáp theo trạng thái thật

Đề xuất mô hình trách nhiệm:

1. AI hiểu câu và đề xuất ý định/thông tin có cấu trúc.
2. Hệ thống chuẩn hóa ngày, xác định điều còn thiếu, quyết định hành động/kiểm tra và nội dung cần người dùng xác nhận.
3. AI soạn lời đáp từ câu gốc, ngữ cảnh gần đây và kết quả hệ thống vừa quyết định; thừa nhận phần đã hiểu và chỉ hỏi phần còn thiếu. Sau tạo/chỉnh lịch, giải thích bằng dữ liệu được cung cấp.
4. Lời đáp không được thay đổi kế hoạch, chọn ngày còn mơ hồ, tạo thêm thao tác hoặc nói “đã lưu” khi kết quả chưa thành công. Hỏng bước diễn đạt vẫn có fallback ngắn đúng trạng thái, không chạy lại tác vụ nghiệp vụ.

**Đã chốt:** dùng `gpt-6-luna` / reasoning `high` cho hiểu nhu cầu, chọn điểm và soạn lời đáp. Cấu hình phải bảo đảm các bước của planning cùng dùng lựa chọn này, không tự chuyển sang model/mức suy luận khác. Các lời dự phòng xác định khi AI lỗi vẫn được giữ theo Q2; chúng không phải một model thay thế. Cấu hình local đã là Luna/high ở provider chung; phần soạn lời planning riêng còn chưa triển khai.

Đề xuất Sol/medium ban đầu đã được người dùng thay thế bằng lựa chọn trên. Không có benchmark mới hoặc thay đổi model/env trong phiên phỏng vấn này. Phạm vi lựa chọn bao phủ mọi bước AI của luồng đang thảo luận; không suy ra một đợt thay đổi các chức năng khác ngoài scope.

Tài liệu OpenAI đã đọc ngày 27/10/2026 xác nhận Sol hỗ trợ structured outputs và medium reasoning; Terra được mô tả hướng tới phản hồi nhanh và văn bản tự nhiên, là phương án tối ưu sau nếu phép thử thực tế cho phép. Tài liệu model không chứng minh chất lượng trên tình huống riêng của sản phẩm.

- <https://developers.openai.com/api/docs/models/gpt-6.1-sol>
- <https://developers.openai.com/api/docs/models/gpt-6.1-terra>

Nhánh sau khi duyệt: số call/độ trễ, ngữ cảnh Q&A xen ngang, chính sách fallback, kiểm tra lời đáp bám kết quả, giới hạn độ dài và chi phí.

### Q3 — Ranh giới khách vãng lai

Khuyến nghị giữ baseline hiện tại cho vòng này:

- Guest hỏi thông tin công khai qua Q&A bình thường.
- Khi yêu cầu tạo/chỉnh hành trình cá nhân, giải thích lợi ích/nhu cầu đăng nhập bằng lời tự nhiên, giữ yêu cầu để tiếp tục sau khi đăng nhập và yêu cầu xác nhận lại. Không để trạng thái này nuốt câu Q&A tiếp theo.
- Không tự mở login khi chỉ hỏi kiến thức hoặc lời khuyên chung. Nếu hỏi pha trộn public Q&A và tạo kế hoạch, tách phần có thể trả lời khỏi hành động cần đăng nhập.

**Đã chốt thêm:** hiển thị nút **Đăng nhập để tiếp tục** điều hướng tới trang đăng nhập và quay về Assistant. Giữ đúng yêu cầu ban đầu, không lấy một bản nháp khác mà khách gõ sau đó làm yêu cầu cần tiếp tục. Khách vẫn được hỏi đáp công khai. Sau đăng nhập khôi phục yêu cầu để người dùng xác nhận tiếp; không tự tạo/lưu. Không mở nhánh Guest tạo/chỉnh đề xuất tạm trong lần này.

## Vòng 2 — Q4–Q5 đã thống nhất

### Q4 — Xác nhận ngày đã hiểu ở bước nào?

Khuyến nghị:

- Cách nói cho ra đúng một ngày hợp lệ (“31/10”, “mai”) được AI nhắc lại với ngày/tháng/năm và đưa vào recap hiện hành; không thêm một lượt xác nhận riêng chỉ cho việc chuẩn hóa ngày. Việc tạo vẫn chờ người dùng xác nhận recap.
- Ngày thiếu năm đã qua, cách nói “thứ này/thứ tới” hoặc câu có nhiều cách hiểu thì hỏi làm rõ đúng điểm mơ hồ. Tuần là thứ Hai–Chủ nhật theo giờ Việt Nam. Không chốt ngày đại diện của một khoảng thời gian.
- Nếu bản tổng hợp đang chờ mà người dùng đổi ngày hoặc ngày đã qua, cập nhật/làm rõ và xác nhận lại nhu cầu trước khi tạo/lưu.

### Q5 — Giữ ý nghĩa ngày khi hội thoại bị gián đoạn

Khuyến nghị:

- Trong phiên, nhớ nhu cầu và bước đang chờ khi khách hỏi kiến thức xen ngang; cung cấp phần ngữ cảnh liên quan cho AI, không tự biến kiến thức hỏi đáp thành yêu cầu sửa lịch. Câu “có” mơ hồ vẫn phải làm rõ.
- “Mai” đã được quy ra ngày 28/10/2026 không được tính lại thành 29/10 khi người dùng quay lại vào hôm sau. Khoảng “tuần sau” giữ mốc được hiểu tại lượt nói gốc và vẫn chưa phải một ngày khởi hành.
- Khi tải lại/mở lịch sử, khôi phục nhu cầu đã được xác nhận và mốc ngày tương ứng trong giới hạn baseline; vẫn cần tạo lại đề xuất. Ngày đã qua phải yêu cầu chọn lại, không âm thầm dời lịch.
- Với Guest, chỉ chuyển yêu cầu ban đầu và bối cảnh công khai cần thiết qua đăng nhập; không tự nhập toàn bộ lịch sử Guest thành lịch sử tài khoản. Không hứa giữ toàn bộ hội thoại hoặc hành trình chưa lưu qua một lần tải lại.

Các chi tiết kỹ thuật về lời dự phòng, ngữ cảnh có giới hạn, timeout, chống lặp thao tác và kiểm chứng được xử lý trong phạm vi bất biến đã duyệt. Không dùng các chi tiết này để xin lại Q1–Q3.

## Kiểm chứng dự kiến sau khi thống nhất

- Bảng ca ngày với thời gian giả cố định theo Việt Nam: thiếu năm, qua năm, năm nhuận, ngày không tồn tại, ngày qua, ngày tương đối và khoảng mơ hồ.
- Hội thoại thật đúng chuỗi trong ảnh; không hỏi lặp khi đã nhận một phần ngày và không âm thầm chốt ngày.
- Câu tổng hợp/đề xuất không bịa thông tin hoặc báo lưu sai; hỏng diễn đạt không làm mất/nhân đôi tác vụ đã xác nhận.
- Guest Q&A → yêu cầu planning → Q&A tiếp → đăng nhập → xác nhận tiếp; cần cả client và server regression theo quyền đã chốt.

## Triển khai sau xác nhận Q4–Q5

- Server cấp ngày Việt Nam; bộ chuẩn hóa calendar quyết định ngày chính xác/khoảng dự kiến/làm rõ. Model trích nguyên văn cụm ngày, không được tự cấp năm hoặc ngày tuyệt đối. Nhu cầu JSON lưu được khoảng và mốc gốc khi người dùng xác nhận recap; không thêm schema/migration cho follow-up này.
- Understanding, selection và reply composition được pin `gpt-6-luna`, reasoning `high` độc lập với override QA. Composition nhận câu khách, ngữ cảnh giới hạn, nhu cầu và kết quả thật; chỉ trả lời, không điều khiển hành động. Recap giữ từng dòng dữ liệu; trạng thái đề xuất giữ câu đầu xác định. Timeout/lỗi/vi phạm gate lời đáp trả canonical fallback, không lặp generation/write.
- Guest tiếp tục public Q&A sau lời mời đăng nhập; client giữ lời mời khi Q&A gắn conversation ID. CTA dùng yêu cầu/context ban đầu, không dùng composer mới. Handoff vẫn chỉ bộ nhớ cùng tab 5 phút, editable draft, explicit send, không chuyển Guest history.
- Q&A xen ngang cung cấp tối đa ba lượt công khai trong cùng chat; không sửa nhu cầu và không biến “có” sau gián đoạn thành write. Các offer/ngày chưa xác nhận vẫn nằm trong bộ nhớ như baseline.

Xem [story](../stories/ASSISTANT-DIALOGUE-NATURALNESS.md) và [verification](assistant-dialogue-naturalness-verification.md) cho evidence và giới hạn. Các mô tả ở phần “Hiện trạng đã đối chiếu” phía trên là snapshot trước triển khai, không phải hiện trạng cuối.

# Lập hành trình bằng hội thoại tự nhiên — phỏng vấn thiết kế

Trạng thái: IMPLEMENTED / đã kiểm chứng tự động và Development, 2026-10-27. Người dùng đã đồng ý Q1–Q3 bằng “có đồng ý” và Q4–Q7 bằng “có”. Phỏng vấn đã hoàn tất; phạm vi được triển khai theo các quyết định này. Nghiệm thu trực tiếp trên trình duyệt và nghiệm thu sản phẩm chưa hoàn tất; xem [báo cáo kiểm chứng](assistant-chat-first-planning-verification.md).

## Yêu cầu người dùng đã nêu

Sau khi test phiên bản 9 ticket, người dùng muốn:

- Không tự mở form số ngày/phương tiện/ngày đi trong chat. AI trao đổi qua các tin nhắn như một cuộc trò chuyện.
- AI hỏi để thu thập nhu cầu, hiểu câu trả lời nhiều lượt, rồi tổng hợp chi tiết trong một tin nhắn và hỏi người dùng muốn sửa gì.
- Khi người dùng muốn thêm/thay điểm nhưng chưa có tên cụ thể, AI chủ động gợi ý các lựa chọn thay vì yêu cầu họ tự nghĩ tên.
- Người dùng có thể chọn phương án, trao đổi thêm và trả lời đồng ý với lời mời thêm/chỉnh hành trình.

Nguồn: yêu cầu trực tiếp và ảnh người dùng đính kèm trong hội thoại. Ảnh là bằng chứng trải nghiệm của phiên bản hiện tại; không phải một tài liệu chứa chỉ thị triển khai.

## Hiện trạng đã xác minh từ code

- `apps/web/src/components/assistant/planning-panel.tsx`: form vẫn xuất hiện trong phiên planning; câu trả lời và thông báo trạng thái được render riêng.
- `apps/web/src/components/assistant/planning-client.ts`: cùng `analysis.message` được ghi vào cả lượt chat và trạng thái, gây câu trả lời lặp; một số EDIT tạo lại ngay, một số chờ bấm nút.
- `apps/web/src/modules/assistant-planning/planning-ai.ts`: bộ hiểu câu nhận nhu cầu và câu mới, chưa nhận hành trình đang xem, câu hỏi đang chờ hoặc phương án đang được đề nghị. Các lựa chọn hiện tại chỉ phân giải tên điểm bằng exact/substring, chưa phải gợi ý thay thế theo ngữ cảnh.
- `planning-contract.ts`: chưa có mục đích xác nhận lựa chọn hoặc đối tượng chờ xác nhận để gắn nghĩa cho câu “có”, “đồng ý”, “chọn phương án 2”.
- Việc xóa điểm mới gỡ khỏi required/preferred; chưa có điều kiện loại trừ kiểm tra được để ngăn điểm vừa bị bỏ xuất hiện trở lại trong đề xuất AI.
- Generator đã chọn điểm thật; scheduler/routing/Validator, giới hạn hai lần sửa, version/hash, xác thực quyền sở hữu và lưu có idempotency đã có thể tái sử dụng. Không cần thay bằng một planner do LLM tự chứng nhận.

Đây là kết luận đọc code; chưa phải kết quả tái hiện UI hoặc gọi model trong phiên phỏng vấn này.

## Cây quyết định

```text
Yêu cầu đã rõ: bỏ form trong chat, hội thoại thu thập nhu cầu, recap, gợi ý chủ động
├─ Q1: Hỏi từng bước và điều kiện kết thúc thu thập                 [ĐÃ ĐỒNG Ý]
│  └─ Q4: Xác nhận recap và bắt đầu tạo bằng câu tự nhiên           [ĐÃ ĐỒNG Ý]
├─ Q2: Phạm vi thêm/bỏ/thay điểm và thay cả ngày, cách đưa lựa chọn [ĐÃ ĐỒNG Ý]
│  └─ Q5: Chọn phương án, loại trừ điểm đã bỏ, xử lý không khả thi [ĐÃ ĐỒNG Ý]
└─ Q3: “Đồng ý” áp dụng đề xuất hay lưu chuyến đi chính thức        [ĐÃ ĐỒNG Ý]
   ├─ Q6: Câu trả lời ngắn, chuyển chủ đề, hủy và phương án cũ      [ĐÃ ĐỒNG Ý]
   └─ Q7: Chuyến đã lưu; tải lại/mở lịch sử; hai giao diện chat     [ĐÃ ĐỒNG Ý]
```

Không còn nhánh quyết định sản phẩm chưa trả lời. Các chi tiết triển khai phải nằm trong phạm vi đã đồng ý và giữ ràng buộc sản phẩm bên dưới.

## Vòng 1 — đã được người dùng đồng ý

Người dùng trả lời **“có đồng ý”** cho cả ba khuyến nghị Q1–Q3 trong hội thoại. Các quyết định dưới đây đã được chấp thuận cho thiết kế mới; điều này chưa đồng nghĩa ứng dụng đã triển khai chúng.

### Q1 — Thu thập nhu cầu

Mỗi lượt AI hỏi một ý còn thiếu, bỏ qua thông tin người dùng đã cung cấp. Ưu tiên số ngày, phương tiện, ngày khởi hành; cho phép chưa chốt ngày để xem đề xuất sơ bộ. Sở thích, nhịp độ, người đi cùng và hạn chế di chuyển có thể bổ sung hoặc bỏ qua. Kết thúc bằng bản tổng hợp nhu cầu qua tin nhắn để người dùng kiểm tra.

### Q2 — Đề xuất chỉnh sửa

Hỗ trợ thêm, bỏ, thay một điểm và đề nghị thay một ngày. Khi chưa nêu điểm mới, AI chủ động đưa tối đa ba lựa chọn từ điểm đủ điều kiện hiện có, kèm lý do phù hợp và ảnh hưởng dự kiến trong giới hạn dữ liệu có thật. Yêu cầu thay cả ngày được hiểu là thay phương án của ngày đó; không tự biến thành thay toàn bộ chuyến. Không yêu cầu người dùng tự đặt tên điểm nếu họ đang muốn AI gợi ý.

### Q3 — Nghĩa của xác nhận

“Có” sau câu hỏi thêm/thay điểm áp dụng thay đổi cho đề xuất đang xem, với kiểm tra lại và kết quả rõ ràng. Lưu chuyến đi chính thức là một xác nhận riêng, nêu rõ đang lưu chuyến nào. Chưa xác định trong vòng này có mở rộng sửa chuyến đã lưu ngay trong general Assistant hay không.

## Vòng 2 — đã được người dùng đồng ý

Người dùng trả lời **“có”** cho cả bốn quyết định Q4–Q7. Không yêu cầu thêm một vòng phê duyệt lặp lại; tiến hành phần sửa đã yêu cầu trong phạm vi này.

### Q4 — Từ bản tổng hợp tới lịch trình

Sau bản tổng hợp, AI hỏi rõ người dùng muốn sửa hay bắt đầu tạo. “Đúng rồi, tạo đi”, “đồng ý” hoặc nút trả lời nhanh xác nhận bản tổng hợp hiện hành và bắt đầu tạo; không mở lại form hoặc bắt bấm thêm một nút tạo. Nếu người dùng sửa thông tin thì cập nhật và tổng hợp lại trước khi dùng bản nhu cầu mới. Bản tổng hợp cuối cùng nêu cả thông tin chưa biết; không âm thầm điền sở thích hoặc điều kiện còn thiếu.

### Q5 — Chọn, bỏ và kiểm tra phương án

Khi AI đã trình bày rõ hành động và lựa chọn, câu “chọn số 2” hoặc nút tương ứng là xác nhận áp dụng phương án đó, không hỏi thêm một lần cùng nội dung. Với chỉ một đề nghị cụ thể, “có” xác nhận đúng đề nghị đó. Có ít hơn ba điểm phù hợp thì đưa đúng số hiện có; không có thì giải thích, không bịa cho đủ số lượng.

Điểm người dùng yêu cầu bỏ/thay được loại khỏi kế hoạch hiện tại, kể cả lúc AI tạo lại, trừ khi họ yêu cầu thêm lại. Nếu đó là điểm bắt buộc, chỉ yêu cầu bỏ/thay rõ ràng của người dùng mới thay đổi ràng buộc đó. Các điểm bắt buộc khác tiếp tục được giữ. Phương án thay đổi phải được kiểm tra lại, giữ phần ngoài phạm vi chỉnh sửa khi có thể; nếu cần đổi ngày khác thì trình bày tác động và xin quyết định thay vì âm thầm sửa rộng hơn.

Không áp dụng phương án vi phạm như thể đã hợp lệ. Giữ phương án trước để đối chiếu, giải thích trở ngại và đề xuất hướng khác. Với chuyến chưa có ngày, có thể tiếp tục chỉnh đề xuất sơ bộ; vẫn nêu rõ hạn chế và khóa lưu chính thức. Thiếu dữ liệu khác không được suy thành PASS hoặc lời hứa phương án khả thi.

### Q6 — Câu trả lời ngắn và chuyển chủ đề

Một câu trả lời ngắn phải có đối tượng rõ ràng: câu hỏi nhu cầu, bản tổng hợp, lựa chọn thêm/thay, hoặc lời mời lưu đang chờ. “Có” không tự chọn giữa nhiều lựa chọn. Q&A xen kẽ không làm thay đổi đề xuất; sau Q&A nếu “có” có thể hiểu nhiều nghĩa, hỏi lại ngắn gọn hành động cụ thể. “Thôi/không đổi nữa” hủy đề nghị đang chờ, giữ kế hoạch trước. Lựa chọn cũ không được áp dụng cho một bản kế hoạch đã thay đổi; thông báo cần gợi ý/kiểm tra lại.

### Q7 — Chuyến đã lưu và khôi phục phiên

Tiếp tục giới hạn phần chat này ở việc tạo và chỉnh đề xuất chưa lưu. Chuyến đã lưu được mở trong luồng Trip hiện có khi cần sửa; muốn lập chuyến khác thì bắt đầu kế hoạch mới một cách rõ ràng. Không mở rộng chỉnh Trip đã lưu ngay trong general Assistant ở lần thay đổi này.

Khung nổi và trang Assistant dùng cùng trải nghiệm chat, tóm tắt lịch trình và bản đồ hiện có; không đưa form nhu cầu trở lại. Thu nhỏ/chuyển trang trong phiên giữ cuộc trao đổi và đề nghị đang chờ. Tải lại/mở lịch sử khôi phục nhu cầu và chuyến đã lưu theo hợp đồng hiện tại, nhưng không coi lựa chọn cũ là hành động còn hiệu lực: AI nói rõ cần tạo/gợi ý lại trước khi tiếp tục. Một lần lưu chưa rõ kết quả vẫn đối soát thao tác cũ, không tạo lần lưu mới.

## Ràng buộc hiện hành tiếp tục có hiệu lực

- Tối thiểu số ngày và ô tô/xe máy để tạo sơ bộ; ngày khởi hành và toàn bộ kiểm tra bắt buộc đạt mới cho lưu chính thức.
- AI chỉ chọn điểm thật, đủ điều kiện. Không bịa dữ liệu giờ mở cửa, thời gian tuyến hoặc kết quả kiểm tra.
- AI đề xuất, Validator quyết định. Thông tin thiếu không phải PASS; không báo đã lưu khi database chưa xác nhận.
- Không âm thầm bỏ điểm bắt buộc. Phân biệt bỏ một điểm theo yêu cầu rõ ràng với tự bỏ để tìm phương án đạt.
- Quyền sở hữu, phiên bản hiện hành, retry UNKNOWN cùng payload/key và giới hạn lưu bản nháp vẫn giữ nguyên.
- Sửa Trip đã lưu trong general Assistant chưa thuộc phạm vi đã duyệt trước đó. Form lập chuyến riêng ở `/trips/new` là luồng khác với form người dùng yêu cầu bỏ trong chat.

## Tài liệu liên quan

- [Thiết kế 9 ticket hiện tại](assistant-trip-planning-design.md).
- [Story và phạm vi đã triển khai](../stories/ASSISTANT-CONVERSATIONAL-PLANNING.md).
- [Product contract](../product/product-spec.md), [user flow](../flow/user-flow.md), [technical architecture](../architecture/technical-architecture.md).
- [Glossary](../../GLOSSARY.md): phân biệt bản tổng hợp nhu cầu, đề xuất hành trình và chuyến đã lưu.

## Luồng và ranh giới đã triển khai

1. Yêu cầu lập hành trình đi vào ô chat hiện có. Bộ điều phối hỏi lần lượt phần còn thiếu, giữ thông tin đã nêu, cho bỏ qua ngày/sở thích tùy chọn, rồi xuất bản tổng hợp nhu cầu trong tin nhắn.
2. Xác nhận bản tổng hợp bằng câu tự nhiên hoặc trả lời nhanh gọi REVIEW rồi GENERATE; không hiển thị form nhu cầu trong chat. Form planner riêng giữ hành vi của nó.
3. Bộ hiểu câu nhận câu hỏi đang chờ, các lượt gần đây, các ngày/điểm đang xem và các điểm thực sự đủ dữ liệu. Model có thể chọn tối đa ba gợi ý; server chiếu tên/lý do từ dữ liệu điểm có thật và chặn ID ngoài tập đủ điều kiện.
4. Chọn một phương án rõ ràng xác nhận đúng thao tác/ngày/điểm. ADD/REMOVE/REPLACE sửa lựa chọn đó một cách xác định; REPLAN_DAY cho AI chọn lại ngày được yêu cầu và kiểm tra rằng các ngày khác giữ nguyên thứ tự điểm. Scheduler/routing/Validator kiểm tra lại toàn bộ đề xuất.
5. Loại trừ điểm đã bỏ là điều kiện kiểm tra được. Chỉ yêu cầu thêm lại rõ ràng mới đưa điểm đó trở lại các lựa chọn; việc bỏ loại trừ xảy ra khi người dùng chọn. Điểm mới được nói là bắt buộc được giữ thành yêu cầu bắt buộc.
6. Nếu chỉnh một ngày làm đổi giờ đến của ngày khác, giữ phương án cũ để đối chiếu và hỏi riêng về các giờ đã thay đổi trước khi áp dụng bản mới. Lưu Trip vẫn là một xác nhận khác.
7. Hủy trước khi REVIEW phục hồi đề xuất cũ ngay trong phiên. Hủy sau khi REVIEW đã thay đổi nhu cầu phải ghi phục hồi nhu cầu thành công trước khi báo đã hủy; khi mất phản hồi, retry đúng payload/key của thao tác phục hồi, không tự sinh hành trình. Lịch trình cũ chỉ còn để đối chiếu nếu phiên bản server đã thay đổi; cần tạo/kiểm tra lại trước khi lưu.
8. Các tin nhắn planning và Q&A được đặt theo thứ tự trao đổi trong cùng transcript. Không hiển thị cùng một câu trả lời ở cả tin nhắn và thông báo trạng thái. Các lựa chọn/hành trình tạm chỉ sống trong phiên, không thêm persistence cho lịch trình chưa xác nhận.

## Giao diện

Giữ shell, màu, font và bong bóng chat Assistant hiện có; dùng lựa chọn trả lời nhanh có nhãn, focus rõ và mục tiêu chạm 44px. Tóm tắt ngày, kết quả kiểm tra và bản đồ nằm trong một vùng hành trình, không biến toàn bộ hội thoại thành form.

Tham khảo app-screen của design-taste-frontend: `framed-sheet`, seed `1319196880`, giữ palette/type. Không đổi shell sang sơ đồ builder vì yêu cầu là chỉnh tương tác trong Assistant hiện có. Không thêm dữ liệu giả vào UI, font hoặc thư viện. Source lint của panel không có FAIL; cảnh báo zero-padding là định dạng giờ HH:mm hợp lệ. Browser inspector/screenshot không chạy được do Work settings tắt local browser.

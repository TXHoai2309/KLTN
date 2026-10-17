# Kế hoạch cải thiện chatbot AI Hà Giang

Ngày lập: **17/10/2026** · Phiên bản: **1.2**

**Trạng thái: ĐÃ TRIỂN KHAI CÁC HẠNG MỤC CODE — CHỜ NGHIỆM THU CORPUS ĐỘC LẬP.**
Đợt tiếp theo đã thực hiện phần còn lại của Giai đoạn 1–5 và đo Giai đoạn 6.
Không đánh dấu toàn bộ kế hoạch hoặc US-23 đã nghiệm thu: bộ 60 ca đề xuất vẫn
cần người duyệt nội dung. Không thêm model viết lại câu hỏi, tìm web, provider
retry hoặc triển khai production. Bảng đợt đầu bên dưới được giữ làm lịch sử.

### Tiến độ hoàn thiện — 17/10/2026

| Phần | Kết quả |
| --- | --- |
| Đánh giá/sinh/kiểm chứng | Mã nguồn do server cấp, ràng buộc từng khía cạnh; verifier kiểm tra toàn bộ từng đoạn thay vì chép lại văn bản/mã nguồn |
| Cách trả lời khi diễn đạt lại bị từ chối | Chỉ với các điều kiện được mô tả trong báo cáo: tạo câu trả lời khác từ câu nguyên văn đã được đánh giá; gắn nhãn `SOURCE_EXCERPTS`, không chứng nhận bản diễn đạt bị từ chối |
| Truy hồi | Hybrid vector + từ khóa cùng phạm vi/quyền/giới hạn; recall chuỗi dữ kiện trên cùng snapshot 36/40 → 38/40, không suy ra độ đúng ngữ nghĩa |
| Giao diện | Đoạn/list/bảng có trích dẫn; thông báo PARTIAL và lỗi kiểm chứng riêng; tối đa ba câu gợi ý chỉ điền ô nhập |
| Kiểm tra thực tế cuối | Direct 6/6, trong đó 4 diễn đạt + 2 trích nguyên văn; HTTP 7/7 gồm lịch sử/replay/cleanup. Direct xác nhận 18/18 JSON calls thực trả Luna |
| Chờ duyệt | 60 ca dự thảo, người duyệt và đáp án chuẩn độc lập chưa có; US-23 vẫn `NOT_ACCEPTED` |

Chi tiết và mọi lần đo không đạt/thử nghiệm đã hoàn nguyên:
[báo cáo hoàn thiện](D:/KLTN/KLTN/docs/implementation/ai-chatbot-completion.md),
[số liệu](D:/KLTN/KLTN/docs/implementation/ai-chatbot-completion-results.json),
[bộ ca chờ duyệt](D:/KLTN/KLTN/docs/implementation/ai-chatbot-corpus-review.json).

Điều chỉnh theo ảnh thử nghiệm của chủ dự án: giọng trả lời ngắn/tự nhiên hơn,
nguồn đóng dưới “Xem nguồn”, giữ chủ thể qua chuỗi nối tiếp trung tính và gợi ý
danh hiệu cụ thể. Giữ backend grounding/model/embedding. HTTP lần rộng 4/5, lần
gợi ý hẹp 5/5 (có một trích nguyên văn); không phải nghiệm thu độ đúng độc lập.
[Báo cáo điều chỉnh](D:/KLTN/KLTN/docs/implementation/ai-chatbot-natural-conversation.md).

### Tiến độ đợt đầu — 17/10/2026

| Phần | Kết quả triển khai |
| --- | --- |
| Bộ đo trước/sau | 40 ca hành vi hư cấu: 23/40 trước sửa → 40/40 sau sửa; dùng service và adapter thật với provider giả lập. Chưa phải 40 ca Hà Giang do chủ dự án duyệt |
| Quy tắc trả lời | Có policy chung về nguồn/phạm vi/thời điểm, prompt trả lời theo đoạn và xử lý câu tổng quan/so sánh; giữ kiểm chứng trên server |
| Giao tiếp và nối tiếp | Sửa câu cảm ơn kèm câu hỏi, nhận diện nối tiếp không phụ thuộc viết hoa, câu hỏi lại khi thiếu/nhiều chủ thể, giữ thuộc tính khi người dùng trả lời tên điểm đến sau câu làm rõ |
| Chi phí | Giao tiếp/làm rõ do server xử lý không gọi provider; chưa thêm bước model viết lại câu hỏi, retry hay fallback |
| Quan sát | Metadata thời gian từng lời gọi và tổng lượt; bỏ debug ghi nguyên phản hồi đánh giá nguồn ra file |
| Kiểm định thật | Ghi cả các lượt không đạt và kết quả lần cuối trong báo cáo đợt đầu; không suy ra nghiệm thu từ test offline |
| Truy hồi/UI/gợi ý | Chưa thay thuật toán truy hồi, giao diện hay thêm gợi ý; không tăng ngưỡng/budget để làm đẹp tỷ lệ trả lời |

Chi tiết, hạn chế và trạng thái kiểm tra:
[báo cáo đợt đầu](D:/KLTN/KLTN/docs/implementation/ai-improvement-batch1.md),
[số liệu trước/sau](D:/KLTN/KLTN/docs/implementation/ai-improvement-batch1-results.json).

## 1. Mục tiêu

1. Cùng một ý hỏi có kết quả nhất quán hơn khi viết hoa, thêm dấu câu hoặc hỏi lại.
2. Trả lời tự nhiên, đúng trọng tâm; hỗ trợ câu hỏi tổng quan và trao đổi cơ bản.
3. Hiểu câu hỏi nối tiếp mà không lấy câu trả lời cũ làm bằng chứng.
4. Tìm được đúng dữ kiện về tên địa điểm, thuộc tính và điều kiện người dùng hỏi.
5. Giữ trích dẫn chính xác; phân biệt rõ thiếu nguồn, cần hỏi rõ và lỗi kỹ thuật.
6. Đo được chất lượng, độ trễ và lượng sử dụng Luna trước/sau từng thay đổi.

## 2. Hiện trạng làm mốc so sánh

| Hạng mục | Hiện trạng đã quan sát | Việc còn cần cải thiện |
| --- | --- | --- |
| Model | Ba bước đánh giá nguồn, sinh câu trả lời và kiểm chứng dùng Luna; API thật đã xác nhận | Theo dõi model yêu cầu/thực trả và usage khi chạy các ca mới |
| Dấu câu và hỏi lại | Đã có chuẩn hóa cách hiểu câu hỏi; thử cuối với câu gốc, lặp và `? ,./` đều đạt | Mở rộng bộ dữ liệu kiểm tra, giữ nguyên số, ngày, phủ định và điều kiện |
| Kiểm chứng | Đã dùng mã tham chiếu nguồn do server tạo, ràng buộc theo từng đoạn trả lời | Đo các trường hợp từ chối sai và bỏ lọt thông tin thiếu căn cứ |
| Giao tiếp | Có bảy nhóm lời thoại do server cho phép, không cần gọi model | Thêm cách nói thông dụng, hỏi lại có ích và xử lý câu trộn giao tiếp/thông tin |
| Ngữ cảnh | Chọn tối đa hai câu hỏi trước khi nhận diện câu phụ thuộc lịch sử | Xử lý đại từ, chuyển chủ đề và nhiều đối tượng rõ ràng hơn |
| Truy hồi | pgvector, dữ liệu đủ điều kiện, ngưỡng và giới hạn ngữ cảnh hiện có | Chưa có nhánh tìm từ khóa độc lập để hỗ trợ tên riêng |
| Hiển thị | Nội dung trả lời hiện hiển thị theo đoạn văn và trích dẫn | Cần thiết kế bổ sung nếu muốn danh sách, in đậm hoặc bảng |
| Nghiệm thu | Bộ thử cục bộ đã đạt; ba ca API thật và kiểm tra HTTP đã đạt | Chưa phải đánh giá toàn bộ corpus; US-23 vẫn NOT_ACCEPTED |

Mốc gần nhất: 1719 Vitest đạt, 329 bài kiểm thử legacy đạt, 100 bài có điều kiện
được bỏ qua; ba ca API thật chạy riêng đạt. Các lượt HTTP trả lời thông tin trong
lần thử cuối mất khoảng 20–22 giây. Đây là số đo của một lần chạy, không phải SLO
hoặc bảo đảm mọi câu hỏi đều thành công.

## 3. Các ràng buộc giữ nguyên

- Thông tin thực tế phải có căn cứ từ nguồn hiện hành đủ điều kiện: INDEXED,
  generation READY, publication hiện tại và allowlist hiện có. Nguồn đã thu hồi
  không được tiếp tục dùng cho lượt hỏi mới.
- Không dùng độ trùng từ, điểm vector, URL hoặc lời khẳng định của model để thay
  thế kiểm chứng nội dung và nguồn. Không ép trả lời khi dữ kiện chưa đủ.
- Lịch sử chỉ giúp giải nghĩa ý hỏi. Câu trả lời và trích dẫn cũ không trở thành
  bằng chứng cho câu trả lời mới.
- Nội dung tài liệu và câu hỏi là dữ liệu; chỉ dẫn nằm trong đó không thay thế
  quy tắc hệ thống. Bảo vệ này áp dụng cả cho bước phân loại/viết lại câu hỏi.
- AI không chứng nhận lịch trình hợp lệ và không suy đoán dữ liệu bắt buộc của
  Constraint Validator, giá hiện tại, thời gian di chuyển hoặc giờ hoạt động.
- Giữ server authorization/ownership, kiểm tra lại nguồn, SUCCESS/FAILED/UNKNOWN,
  idempotency và chỉ báo hoàn tất sau khi cơ sở dữ liệu xác nhận.
- Giữ stack Next.js, Prisma và PostgreSQL/pgvector. Không đổi model/embedding,
  tăng ngân sách hoặc thêm retry tự động chỉ để tăng tỷ lệ có câu trả lời.
- Không đưa prompt, tài liệu riêng, câu trả lời thô, cookie hoặc credential vào
  log chẩn đoán mới. Không tự thêm tìm web, framework hay vector database khác.

## 4. Bộ quy tắc trả lời đề xuất

Các mã Q01–Q12 chỉ là mã tham chiếu trong kế hoạch, không phải mã yêu cầu sản
phẩm đã được duyệt. Nhiều quy tắc đã có một phần; công việc là chuẩn hóa, bổ sung
ca kiểm thử và sửa khoảng trống, tránh chồng thêm các prompt mâu thuẫn.

| Mã | Quy tắc | Hành vi mong muốn |
| --- | --- | --- |
| Q01 | Trả lời đúng trọng tâm ngay đầu | Câu hỏi đơn giản có một câu trả lời trực tiếp; chỉ thêm giải thích khi giúp người dùng hiểu |
| Q02 | Độ dài theo nhu cầu | Tổng quan ngắn gọn; chỉ đi sâu khi được hỏi; bỏ phần mở đầu, lặp ý và kết luận không có căn cứ |
| Q03 | Được tổng hợp dữ kiện có căn cứ | Không đòi nguồn có sẵn đáp án giống nguyên văn; mọi phát biểu diễn đạt lại vẫn phải được hỗ trợ và kiểm chứng |
| Q04 | Trả lời phần đã biết | Dùng PARTIAL khi có phần được hỗ trợ; tách rõ nội dung chưa xác minh, không gắn nhãn trả lời đầy đủ |
| Q05 | Hỏi lại đúng chỗ thiếu | Khi thiếu đối tượng hoặc tiêu chí, hỏi một câu cụ thể; không yêu cầu người dùng nói lại điều đã rõ |
| Q06 | Giao tiếp thân thiện, đúng phạm vi | Xưng hô nhất quán; chào/cảm ơn ngắn gọn; câu trộn lời chào và thông tin vẫn xử lý đầy đủ phần thông tin |
| Q07 | Tư vấn dựa trên dữ kiện và nhu cầu | Với câu “có phù hợp với tôi không?”, nêu dữ kiện được hỗ trợ và hỏi tiêu chí còn thiếu; không tự khẳng định phù hợp/an toàn |
| Q08 | Không tự thêm thông tin phụ | Không bịa số điện thoại, đơn vị liên hệ, dịch vụ, giá, danh hiệu, giờ hoặc lời khuyên địa phương thiếu nguồn |
| Q09 | Giữ phạm vi và thời điểm | Phí của một điểm không thành phí cả khu vực; giá trong hồ sơ không thành giá hôm nay; ngày đăng không chứng minh hiệu lực hiện tại |
| Q10 | Dẫn đúng nguồn thực sự hỗ trợ | Nguồn đặt gần phần trả lời; không gắn nguồn chỉ vì cùng chủ đề; không để model tự viết URL hoặc mã trích dẫn ngoài registry |
| Q11 | Trình bày theo dạng câu hỏi | Đoạn văn cho câu đơn giản, danh sách cho các ý song song, bảng cho so sánh; chỉ bật định dạng đã được giao diện hỗ trợ |
| Q12 | Gợi ý tiếp nối có ích | Đề xuất tối đa ba câu ngắn liên quan sau kết quả đủ điều kiện; không lặp câu cũ hoặc giả định dữ kiện chưa xác minh |

### Ví dụ hành vi để nghiệm thu

| Tin nhắn | Hành vi mong muốn |
| --- | --- |
| `hi!!!` | Chào ngắn và mời người dùng nêu nhu cầu; không chạy truy hồi cho lời chào thuần túy |
| `Chào bạn, tôi muốn tìm hiểu về cao nguyên đá Đồng Văn? ,./` | Nhận diện yêu cầu tổng quan; trả lời từ nguồn được duyệt, không chỉ chào lại |
| `Ở đó có gì đặc biệt?` sau một đối tượng rõ ràng | Giữ đúng đối tượng và truy hồi nguồn hiện tại |
| `Ở đó thì sao?` sau khi so sánh hai nơi | Hỏi rõ nơi nào nếu không xác định được; không tự chọn |
| `Giá hôm nay là bao nhiêu?` trong khi nguồn chỉ có giá theo hồ sơ | Không khẳng định giá hiện tại; trả lời phần có căn cứ theo chính sách PARTIAL hoặc báo thiếu nguồn tương ứng |
| `Tôi đi cùng người lớn tuổi, nơi này có phù hợp không?` | Nêu dữ kiện được hỗ trợ, hỏi nhu cầu di chuyển còn thiếu; không tự chứng nhận an toàn hoặc khả năng tiếp cận |
| `Cảm ơn, còn giờ mở cửa thì sao?` | Xử lý phần hỏi giờ mở cửa theo ngữ cảnh; không nuốt toàn bộ câu vào nhánh cảm ơn |

Các ví dụ là mẫu đầu vào/hành vi; không bổ sung sự thật du lịch vào corpus.

## 5. Lộ trình triển khai

### Giai đoạn 0 — Lập bộ đánh giá và đo đường cơ sở · P0

**Mục đích:** biết thay đổi có cải thiện thật hay chỉ giúp một vài ví dụ.

- [ ] Lập tối thiểu 40 ca có người duyệt, bao phủ câu hẹp, tổng quan, nhiều ý,
  giá/giờ/thời điểm, phủ định, giao tiếp, câu trộn và hội thoại nối tiếp.
- [x] Gắn mỗi ca offline với ý định, đối tượng, dữ kiện mong đợi, nguồn/phần nguồn hỗ trợ,
  thông tin phải để ngỏ và trạng thái hợp lệ. Không dùng đáp án do cùng model tự
  tạo làm chuẩn duy nhất.
- [x] Tạo biến thể dấu câu/viết hoa/khoảng trắng/hỏi lại; có đối chứng trong đó dấu
  số, thời gian hoặc từ phủ định thật sự làm thay đổi ý nghĩa.
- [x] Chạy offline trước; tách báo cáo offline và corpus/provider thật. Với chạy
  thật, chọn tập đại diện và giới hạn lượt/token trước khi chạy theo ngân sách
  hiện có; giữ cả ca thất bại, không chạy lại đến khi đạt rồi bỏ số liệu cũ.
- [x] Ghi mốc trạng thái, căn cứ/trích dẫn theo fixture, lý do từ chối, model thực trả,
  lượng token và độ trễ theo từng bước.

Phần offline đã thực hiện; mục 40 ca có người duyệt độc lập vẫn chưa hoàn tất.
Độ đúng ngữ nghĩa/corpus không được suy ra từ provider giả lập.

**Hoàn tất khi:** có bộ ca tái sử dụng, phiên bản nguồn rõ ràng và báo cáo đường cơ
sở. Ca thiếu dữ liệu thật phải được đánh dấu thiếu dữ liệu, không tính là lỗi chỉ
vì chatbot không trả lời.

### Giai đoạn 1 — Chuẩn hóa quy tắc trả lời · P1

**Phụ thuộc:** Giai đoạn 0. Ưu tiên Q01–Q10.

- [x] Rà soát quy tắc hiện tại của đánh giá nguồn, sinh và kiểm chứng; bỏ chỉ dẫn
  trùng/mâu thuẫn. Tách quy tắc dùng chung với chỉ dẫn riêng của từng bước.
- [x] Giữ giọng trợ lý du lịch thân thiện; câu trả lời cụ thể đi thẳng vào ý hỏi.
- [x] Chuẩn hóa phân biệt tổng quan, hỏi một thuộc tính, so sánh và hỏi đánh giá.
  Không bắt câu tổng quan phải có mọi dữ kiện giá/giờ chưa được hỏi.
- [x] Giữ tổng hợp có kiểm chứng; không ép chép nguyên văn hoặc ép trả lời chỉ vì
  tìm thấy đúng tên địa điểm.
- [x] Với PARTIAL, kiểm tra khả năng nói rõ phần còn thiếu từ review hiện tại;
  không cho model tự tạo phần thiếu không gắn với câu hỏi/đánh giá nguồn.
- [x] Nếu cần mở rộng DTO hoặc câu hỏi làm rõ đang cố định, thiết kế schema,
  validation, public safety và tương thích lịch sử trước khi nối vào runtime.

**Vùng mã:**
[qa-prompt.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-prompt.ts),
[qa-assessment.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-assessment.ts),
[qa-generation.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-generation.ts),
[qa-synthesis-verification.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-synthesis-verification.ts).

**Nghiệm thu:** trả lời đúng loại câu hỏi; các dữ kiện bắt buộc có nguồn; PARTIAL
không thành ANSWERED; các ca sai phạm vi, sai thời điểm, phủ định và nguồn giả
tiếp tục bị chặn. Không dùng test khớp nguyên văn một câu trả lời để thay đánh
giá nghĩa và hành vi.

### Giai đoạn 2 — Hiểu câu nối tiếp và mở rộng giao tiếp · P1

**Phụ thuộc:** Giai đoạn 1.

- [x] Thêm biến thể giao tiếp dựa trên ca đã ghi nhận, giữ nhận diện toàn câu cho nhánh
  xã giao; không cho từ “hi”, “cảm ơn” hay “bạn là ai” nuốt yêu cầu thông tin.
- [x] Nhận diện câu tự chứa chủ thể, câu phụ thuộc chủ thể và câu đổi chủ đề trong bộ ca hiện tại.
- [x] Xử lý đại từ/câu ngắn theo tối đa ngữ cảnh được phép; nếu có nhiều đối tượng
  hợp lý, hỏi làm rõ thay vì ghép ngẫu nhiên.
- [x] Trước tiên cải thiện đường xử lý hiện có. Chỉ thêm bước Luna viết lại khi
  bộ ca chứng minh cần thiết; không gọi thêm cho mọi lượt hỏi.
- Không áp dụng ở đợt này — không thêm bước model viết lại. Nếu bổ sung: bản viết lại chỉ giúp truy hồi; phải giữ nguyên thuộc tính, phủ định, điều
  kiện, thời điểm và context điểm đến. Câu gốc vẫn dùng cho lưu trữ/idempotency.
- Không áp dụng ở đợt này. Nếu bổ sung: bản viết lại lỗi/không hợp lệ phải đi theo đường dự phòng có kiểm soát hoặc
  hỏi rõ; không mở rộng phạm vi nguồn và không lấy câu trả lời cũ làm bằng chứng.
- Không áp dụng ở đợt này — không thêm provider call. Nếu thêm, cập nhật tính toán worst-case token, deadline,
  cancellation và admission; không âm thầm vượt ngân sách hiện tại.

**Vùng mã:**
[qa-conversation.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-conversation.ts),
[qa-question-understanding.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-question-understanding.ts),
[qa-service.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-service.ts),
[qa-retrieval.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-retrieval.ts).

Đã triển khai đường xử lý không gọi thêm model. Đây là nhận diện bảo thủ theo
mẫu ngôn ngữ, chưa phải nhận diện mọi tên riêng/đại từ; câu chưa rõ vẫn cần làm rõ.
Các mục liên quan bước model viết lại không áp dụng vì chưa thêm bước đó.

**Nghiệm thu:** giữ đúng đối tượng qua lời chào/cảm ơn, chuyển chủ đề khi có tên
mới, hỏi rõ khi mơ hồ, không rò rỉ lịch sử người khác, replay không gọi model lại.
Nếu có thêm bước viết lại, lỗi bước này không được giả thành một kết quả có căn cứ.

### Giai đoạn 3 — Cải thiện truy hồi tên địa điểm và thuộc tính · P2

**Phụ thuộc:** Giai đoạn 0; triển khai khi số liệu cho thấy có dữ kiện hợp lệ nhưng
truy hồi bỏ sót. Không dùng hạng mục này để sửa lỗi thuần kiểm chứng tổng hợp.

- [x] Đánh giá recall chuỗi dữ kiện với tên riêng, từ viết tắt và cách gõ không dấu trên corpus hiện hành được phép; chưa thay đánh giá ngữ nghĩa độc lập.
- [x] Thử ứng viên kết hợp vector và từ khóa trên PostgreSQL hiện có; xác định rõ
  từ khóa chỉ dò trong ứng viên vector hay là một nhánh tìm kiếm độc lập.
- [x] Cả hai nhánh dùng cùng bộ điều kiện nguồn hiện hành/được phép và context.
- [x] Chuẩn hóa tiếng Việt cho tìm kiếm nhưng giữ bản gốc làm bằng chứng; không
  xóa thông tin số, phủ định hoặc coi từ khóa là bằng chứng đủ để trả lời.
- [x] Gộp/loại trùng theo danh tính chunk hiện có; hiệu chỉnh xếp hạng trên bộ ca,
  giữ giới hạn số đoạn và token đưa vào bước đánh giá/sinh hiện tại.
- [x] So sánh recall chuỗi dữ kiện, ca nguồn nhiễu/thu hồi và số đo độ trễ/token với đường cơ sở; độ liên quan ngữ nghĩa độc lập còn chờ duyệt.
  Không sao chép các số ngưỡng hoặc phép cộng điểm trong ZIP thành mặc định.
- Không áp dụng: dùng FTS có giới hạn trong transaction đọc hiện có; không thêm index/schema/migration. Chưa chạy EXPLAIN; không tuyên bố cải thiện hiệu năng SQL.

**Vùng mã:**
[qa-retrieval.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-retrieval.ts),
[qa-retrieval.vitest.test.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-retrieval.vitest.test.ts),
[qa-retrieval.postgres.integration.vitest.test.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-retrieval.postgres.integration.vitest.test.ts).

**Nghiệm thu:** cải thiện recall ở các ca bỏ sót đã ghi nhận; không tăng câu trả
lời thiếu căn cứ hoặc truy cập nguồn ngoài quyền. Nguồn vừa bị thu hồi phải bị
loại ở cả hai nhánh và trước khi ghi kết quả.

### Giai đoạn 4 — Trình bày và trích dẫn dễ đọc · P2

**Phụ thuộc:** Giai đoạn 1; tham chiếu Figma và hướng dẫn thiết kế hiện hành trước
khi đổi giao diện. Không bật bảng bằng cách chỉ sửa prompt.

- [x] Đầu tiên giữ câu trả lời theo đoạn ngắn, trích dẫn gần ý, phần thiếu tách rõ.
- [x] Chọn một cách biểu diễn được kiểm soát cho danh sách/in đậm/bảng: Markdown
  giới hạn hoặc DTO có cấu trúc. Ghi quyết định trước khi mở rộng contract.
- [x] Kiểm chứng toàn bộ nội dung hiển thị, gồm tiêu đề, hàng/cột bảng và ghi chú;
  giữ liên kết giữa nội dung, nguồn và certificate khi thay biểu diễn.
- Không áp dụng Markdown: renderer cấu trúc giữ nguyên văn bản đã kiểm chứng, dùng nhãn cố định và không parse HTML/URL. Nếu dùng Markdown sau này, tắt HTML thô, không nhận URL do model tự tạo, giới hạn
  loại phần tử/kích thước; nguồn vẫn do server cung cấp qua thành phần trích dẫn.
- [x] Không gửi toàn bộ chunk riêng tư chỉ để làm tooltip. Nếu bổ sung đoạn trích,
  phải dùng DTO công khai được duyệt và quyền/điều kiện nguồn tương ứng.
- [x] Kiểm tra mobile, bảng dài, nội dung dài, bàn phím và khả năng đọc bằng công
  nghệ hỗ trợ; không tràn ngang toàn trang và không làm mất trích dẫn.

**Vùng mã:**
[assistant-chat.tsx](D:/KLTN/KLTN/apps/web/src/components/assistant/assistant-chat.tsx),
[qa-contract.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-contract.ts),
[qa-answer-grounding.ts](D:/KLTN/KLTN/apps/web/src/modules/ai/qa-answer-grounding.ts).

**Nghiệm thu:** câu đơn giản vẫn gọn; so sánh có cấu trúc dễ đọc; không xuất ký tự
Markdown chưa render, HTML/URL không hợp lệ hoặc nội dung chưa được kiểm chứng.
Kết quả lịch sử cũ tiếp tục hiển thị đúng.

### Giai đoạn 5 — Câu hỏi gợi ý theo câu trả lời · P3

**Phụ thuộc:** Giai đoạn 1–2; xác định story và ngân sách trước khi thêm lời gọi.

- [x] Tối đa ba gợi ý ngắn, riêng biệt, liên quan tới nội dung đã xác minh.
- [x] Không lặp câu hiện tại, không khẳng định ngầm giá hiện tại hoặc dữ kiện chưa
  biết; không mặc định mọi câu hỏi gợi ý đều có đủ nguồn để trả lời.
- [x] Ưu tiên mẫu theo loại ý định/dữ kiện trước; dùng model khi có lợi ích đo được.
- [x] Sinh gợi ý lỗi thì bỏ gợi ý; không đổi trạng thái hoặc làm mất câu trả lời đã
  được xác nhận. Nếu lưu gợi ý, thiết kế ownership, replay và tương thích lịch sử.
- [x] Bấm gợi ý đi qua luồng gửi câu hỏi bình thường, giữ context và idempotency;
  không dùng endpoint riêng bỏ qua các kiểm tra hiện có.

**Nghiệm thu:** gợi ý phù hợp, không tự gửi câu hỏi, không tạo lượt trùng khi mất
kết nối, không cản người dùng tự nhập và không làm sai trạng thái UNKNOWN.

### Giai đoạn 6 — Đo vận hành và nghiệm thu corpus · xuyên suốt

- [x] Theo dõi metadata development theo bước: model yêu cầu/thực trả, tokens, thời gian,
  trạng thái, mã từ chối và lỗi provider; phân biệt thiếu nguồn với lỗi kỹ thuật.
- [ ] Báo cáo tỷ lệ trả lời đúng trên nhóm có đủ nguồn, từ chối đúng trên nhóm
  thiếu nguồn, từ chối sai, độ chính xác trích dẫn và tính nhất quán giữa biến thể.
- [x] Ghi độ trễ trung vị/p95 mẫu thử và lượng token trên cùng bộ ca. Chỉ quy đổi chi phí
  khi có bảng giá được kiểm tra tại thời điểm chạy; không coi dashboard $0 là bằng
  chứng chatbot không dùng model.
- [x] Tối ưu ràng buộc tham chiếu/định dạng gây lỗi đã đo; không bỏ bước kiểm chứng hoặc stream dữ kiện chưa
  đạt kiểm tra để làm cảm giác trả lời nhanh hơn. Nếu thêm báo tiến trình, không
  báo thành công trước khi ghi DB hoàn tất.
- [ ] Nghiệm thu bằng nguồn Hà Giang được duyệt, có kiểm tra độc lập; ghi rõ ca
  thành công/thất bại, nguồn/phiên bản, lượng sử dụng và hạn chế còn lại.

## 6. Bộ kiểm tra bắt buộc theo thay đổi

| Nhóm | Ca cần giữ |
| --- | --- |
| Dấu câu | Cùng ý hỏi với `?`, `,`, `.`, `/`, nhiều dấu, khoảng trắng, chữ hoa/thường; tách biệt với số thập phân/ngày tháng |
| Giao tiếp | Lời chào/cảm ơn thuần túy; giao tiếp kèm câu hỏi thực tế; câu ngoài phạm vi |
| Nối tiếp | Một chủ thể, nhiều chủ thể, đổi địa điểm, xen lời cảm ơn, context điểm đến cố định |
| Nguồn | Có đủ, thiếu một phần, không liên quan, mâu thuẫn, hết hiệu lực/thu hồi, chưa INDEXED |
| Độ đúng | Phủ định, danh hiệu, phí chung/phí riêng, điều kiện giá, thời điểm hiện tại/lịch sử |
| Chỉ dẫn trong dữ liệu | Tài liệu/câu hỏi có yêu cầu bỏ quy tắc, tiết lộ dữ liệu hoặc tạo nguồn giả |
| Vận hành | Timeout, lỗi schema, provider lỗi, model thực trả khác yêu cầu, hủy tác vụ |
| Ghi và đọc | SUCCESS/FAILED/UNKNOWN, retry cùng payload/key, lịch sử cũ, quyền Guest/Traveler/Admin và ownership |
| Trình bày nếu thay đổi | Câu dài, bảng/list, mobile, bàn phím, HTML/URL lạ, trích dẫn và PARTIAL |

Mỗi ca dùng bộ dữ kiện/nguồn để chấm, không mặc định một trạng thái cho mọi corpus.
Lặp ít nhất ba lần với tập câu thật đại diện khi đánh giá tính ổn định; các lời
gọi này chỉ chạy theo chế độ opt-in và giới hạn lượt/token đã đặt cho lần đo.

## 7. Điều kiện hoàn tất từng đợt

- Có so sánh trước/sau trên cùng bộ ca và ảnh chụp phiên bản nguồn tương đương.
- Ca đối kháng đã định nghĩa không để lộ dữ liệu hoặc chấp nhận phát biểu không
  có căn cứ; ca có đủ nguồn không bị từ chối vì lỗi ánh xạ/định dạng đã biết.
- Không suy ra bảo đảm tuyệt đối từ bộ thử hữu hạn; mọi lỗi còn lại có ví dụ và
  mã chẩn đoán để tiếp tục xử lý.
- Chạy test hành vi phù hợp; typecheck/build khi thay code. Chạy kiểm tra DB/
  migration khi thay schema/truy vấn, browser QA khi thay UI và diff check.
- Ghi kết quả/skip vào story và tiến độ; kiểm tra secret và giữ các thay đổi ngoài
  phạm vi. Không tự commit, push, deploy hoặc đổi trạng thái nghiệm thu toàn US-23.
- Nếu một thử nghiệm làm giảm chất lượng, hoàn tác đúng phần thay đổi của đợt
  đó. Dừng rollout khi có lỗi nguồn/ownership; không giảm kiểm chứng để tiếp tục.
- Nếu phải rollback sau migration, có phương án tương thích dữ liệu được đánh
  giá riêng; không xóa dữ liệu hoặc rollback schema tùy tiện.

## 8. Thứ tự thực hiện khuyến nghị

**Đợt đầu:** Giai đoạn 0 → Giai đoạn 1 → Giai đoạn 2, rồi đo và nghiệm thu.
Đây là phần sát nhu cầu hiện tại nhất: trả lời tốt hơn, hỏi lại đúng và trò chuyện
được mà vẫn có căn cứ.

**Đợt tiếp:** Giai đoạn 3 nếu đo được lỗi truy hồi; Giai đoạn 4 nếu cần cải thiện
trình bày. Thực hiện từng mục riêng để xác định thay đổi nào tạo ra cải thiện.

**Sau cùng:** Giai đoạn 5. Bubble/nhúng website khác, sinh hai phương án đồng thời,
tìm web dự phòng và tự động viết tiếp nhiều lượt nằm ngoài kế hoạch ưu tiên này;
nếu cần phải có phạm vi và đánh giá riêng.

Không ấn định thời gian hoặc ngưỡng chất lượng sản xuất khi chưa đo Giai đoạn 0.
Chốt khối lượng và tiêu chí định lượng cho mỗi đợt từ đường cơ sở cùng ngân sách
thực tế, không coi các con số đề xuất trong kế hoạch là SLO đã được chấp thuận.

## 9. Tài liệu và mã đối chiếu

- [Quy tắc repo](D:/KLTN/KLTN/AGENTS.md).
- [Yêu cầu sản phẩm — RAG answers](D:/KLTN/KLTN/docs/product/product-spec.md:29).
- [US-21](D:/KLTN/KLTN/docs/stories/US-21-rag-qa.md),
  [US-22](D:/KLTN/KLTN/docs/stories/US-22-destination-context.md),
  [US-23](D:/KLTN/KLTN/docs/stories/US-23-source-sufficiency.md).
- [Báo cáo chuyển Luna và thử thực tế](D:/KLTN/KLTN/docs/implementation/us23-luna-migration.md).
- [Đối chiếu repo ZIP](D:/KLTN/KLTN/docs/implementation/ai-agent-reference-review.md).
- Quy tắc tham khảo trong ZIP: `packages/vectorize/src/generate.ts` —
  SYSTEM_PROMPT, FAITHFUL_SYSTEM_PROMPT, SMALLTALK_SYSTEM, contextualizeQuery,
  generateFollowups; `packages/vectorize/src/retrieve.ts` — ưu tiên từ khóa trong
  ứng viên vector. Chỉ tham khảo thiết kế, không áp nguyên prompt trợ lý nội bộ
  hoặc các nhánh kiểm chứng bằng heuristic vào sản phẩm du lịch.

## 10. Lịch sử tác vụ

Tác vụ lập kế hoạch ban đầu chỉ bổ sung file này. Không đổi runtime/prompt/UI, dữ liệu, schema,
model hoặc cấu hình. Không chạy API trả phí, test ứng dụng hay build cho thay đổi
tài liệu; kiểm tra định dạng, đường dẫn tham chiếu và `git diff --check` khi bàn giao.

Sau đó chủ dự án yêu cầu triển khai. Đợt đầu có thay đổi backend/prompt/test như
ghi trong báo cáo đợt đầu; các giới hạn của tác vụ lập kế hoạch ở đoạn trên là
lịch sử, không mô tả trạng thái triển khai mới.

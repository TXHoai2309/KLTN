# Hoàn thiện kế hoạch cải thiện chatbot — 17/10/2026

**Đã triển khai các hạng mục code còn lại; chưa nghiệm thu corpus độc lập.**
US-23 giữ `NOT_ACCEPTED`. Không commit, push, deploy, thay credential, schema,
corpus hay dữ liệu nguồn. Chủ dự án yêu cầu làm tiếp theo
[kế hoạch](ai-chatbot-improvement-plan.md); báo cáo này nối tiếp
[đợt đầu](ai-improvement-batch1.md), không thay các số liệu lịch sử.

## 1. Những thay đổi đã thực hiện

### Tham chiếu nguồn và kiểm chứng

- Đánh giá nguồn chọn mã câu `eN` do server tạo thay vì chép lại nguyên câu.
  Server khôi phục đúng cặp câu/citation hiện hành rồi kiểm tra review như cũ.
- Sinh câu trả lời theo từng khía cạnh được hỗ trợ. Schema bắt buộc đủ các khóa
  khía cạnh và chỉ cho chọn mã `sN` của chính khía cạnh đó. Nguồn thực tế, số lượng
  đoạn và toàn bộ nội dung vẫn được kiểm tra trên server.
- Verifier nhận toàn văn từng đoạn, nguồn đã chọn và mã đoạn cố định `pN`;
  trả verdict cho từng đoạn, không phải chép lại nội dung/nguồn để server so khớp.
  Giữ tám cổng ngữ nghĩa, kiểm tra số tiền, đầy đủ khía cạnh, trích dẫn và binding
  certificate với chính câu trả lời/review. Summary riêng tư không được xuất,
  lưu, log hoặc dùng để đảo kết quả âm tính.
- Quy tắc tổng quan yêu cầu giới thiệu đủ ý được hỏi, không bắt lặp mọi chi tiết
  trong tài liệu. Quy tắc phí chung/phí điểm riêng và thời điểm vẫn được giữ.
- Chỉ bỏ khối tham chiếu chứa URL thuần túy khỏi văn bản đưa vào model. Khối có
  nội dung thực tế/điều kiện nhưng không an toàn khiến đầu vào bị chặn; không xóa
  điều kiện rồi giữ phần khẳng định. Schema động cũng được tính vào giới hạn đầu vào.

### Trả lời bằng trích đoạn nguyên văn có điều kiện

Đây là **câu trả lời khác**, không phải bản diễn đạt bị từ chối được cho qua.
Chỉ tạo khi verdict đúng schema xác nhận đủ khía cạnh và cả năm cổng về đúng câu
hỏi, phạm vi đối tượng, thời điểm, số liệu và độ bao phủ đều đạt; các cổng âm tính
chỉ thuộc diễn đạt/căn cứ/trích dẫn. Không dùng cho lỗi provider/schema, nguồn
thiếu/mâu thuẫn/hết hiệu lực hoặc lỗi ở năm cổng quan trọng trên.

Server lấy tất cả câu hỗ trợ của các khía cạnh SUPPORTED trong review hiện tại,
giữ nguyên câu và điều kiện, gộp câu trùng với nguồn thật. Đánh giá lại chính sách
nguồn, public safety và exact-source grounding; giữ ANSWERED/PARTIAL tương ứng.
Không cắt ngắn để vừa giới hạn: quá 20 đoạn/2.000 token hoặc nội dung không hợp
lệ thì không dùng phương án này. Không thêm provider call, retry hay certificate
cho bản diễn đạt bị từ chối. Chỉ dẫn nhúng trong nguồn vẫn bị chặn.

Không áp dụng khi câu hỏi hiện tại hoặc hai câu hỏi lịch sử được phép có yêu cầu
thời điểm hiện tại rõ ràng. Giá trong hồ sơ không thành giá hôm nay. Giao diện
gắn nhãn `SOURCE_EXCERPTS` và nói rõ nội dung được trích nguyên văn từ tài liệu
đã đánh giá. Các cổng âm tính của bản diễn đạt vẫn xuất hiện trong metadata;
không báo rằng câu trả lời trích đoạn đã vượt qua cả tám cổng synthesis.

Đường diễn đạt tự nhiên vẫn là đường chính. Trích nguyên văn dùng cơ chế
exact-source đã có, không biến điểm vector/từ khóa thành chứng nhận sự thật.

### Truy hồi

Thêm nhánh PostgreSQL FTS độc lập với vector, dùng cùng điều kiện publication
hiện hành, INDEXED/READY, provenance, allowlist và context. Chuẩn hóa dấu tiếng
Việt chỉ phục vụ tìm kiếm; bằng chứng giữ nguyên. Hai nhánh dùng chung transaction
đọc giới hạn 7 giây, statement timeout 5 giây; gộp theo thứ hạng, loại trùng chunk,
giữ tối đa bốn đoạn/3.000 token. Không thay vector floor, không dùng lexical rank
làm bằng chứng đủ. Không thêm index/schema/migration; chưa chạy EXPLAIN và không
tuyên bố cải thiện hiệu năng SQL trên corpus lớn.

### Giao diện và tương tác

- Renderer cấu trúc cho đoạn/list/bảng; giữ nguyên toàn văn đã kiểm chứng và nguồn
  cạnh từng ý. Nhãn bảng là UI cố định. Không parse Markdown, HTML hoặc URL model.
- PARTIAL có thông báo thiếu theo nhóm khía cạnh; lỗi kiểm chứng câu trả lời có
  thông báo khác với không tìm được dữ liệu. Trường DTO mới là tùy chọn, lịch sử
  cũ vẫn hợp lệ; không đổi schema DB.
- Tối đa ba câu gợi ý từ mẫu theo chủ đề trong kết quả đã xác nhận. Không gọi model,
  không lưu gợi ý, không hứa đủ dữ liệu. Bấm chỉ điền/focus ô nhập; người dùng gửi
  theo controller/context/idempotency hiện có. Không ghi đè bản nháp; ẩn khi còn
  lượt chưa xác định và vô hiệu khi xác thực lại.
- Giữ màu, font, chủ sở hữu scroll và trích dẫn hiện hành. Bảng tự giữ overflow,
  header xuống dòng trên mobile; có kiểm tra light/dark, bàn phím và reduced motion.
  Các mẫu mở đầu chỉ mời hỏi theo nguồn, không hứa chứng nhận lịch trình/an toàn.

Không thêm Luna viết lại câu hỏi: nhận diện hội thoại hiện có đã được sửa ở đợt
trước. Các mục có điều kiện về call viết lại/Markdown/index mới không áp dụng.

## 2. Đo trên nguồn thật

[Số liệu có cấu trúc](ai-chatbot-completion-results.json) giữ các lần đo không
đạt và thử nghiệm đã hoàn nguyên. Những tỷ lệ dưới đây là kết quả hữu hạn của bộ
thử, **không phải độ đúng ngữ nghĩa hoặc SLO sản xuất**.

Snapshot READ ONLY có 51 chunk đủ điều kiện, SHA-256:
`a92bc63ff954f9afe855e8b6d3fee914efd8f9f5a93dd345c51314fbe7f5806e`.
40 biến thể thuộc 10 chủ đề có chuỗi dữ kiện mục tiêu trong nguồn. Recall là có
tìm lại được chuỗi đó, không phải được người duyệt chấm đúng nghĩa.

| Đường truy hồi | Recall chuỗi dữ kiện |
| --- | --- |
| Vector ban đầu | 36/40 |
| Hybrid thử đầu | 36/40: một ca tăng, một ca giảm; chưa bật runtime ở mốc này |
| Hybrid đã hiệu chỉnh và bật runtime | 38/40; không mất ca từng tìm được ban đầu |

Hai mục còn thiếu chuỗi mục tiêu là `overview-unaccented` và `area-unaccented`.
Đây là giới hạn recall đã ghi nhận, không tự kết luận hai câu đó sẽ trả sai hoặc
không trả lời. Chưa có người duyệt chấm độ liên quan/nhiễu ngữ nghĩa độc lập.

### Các lần chạy trực tiếp

| Mốc | Kết quả ANSWERED/PARTIAL trên số lượt dự định |
| --- | --- |
| Đường cơ sở trước đợt này | 1/4 |
| Mã câu nguồn | 2/6; một lượt lỗi trước khi ghi kết quả theo lượt |
| Tên nguồn + hybrid | 3/6 |
| Tổng quan tối thiểu | 4/6 |
| Mã hỗ trợ khi sinh | 5/6 |
| Phạm vi phí vào cửa | 5/6 |
| Thử prompt đồng tham chiếu | 3/6; đã hoàn nguyên |
| Sinh theo khía cạnh | 6/6; HTTP riêng vẫn chỉ 6/7 |
| Verifier ràng buộc toàn đoạn | 5/6 |
| Thử lược trích dẫn | 2/6; một lượt lỗi trước khi ghi kết quả; đã hoàn nguyên |
| Logic cuối có phương án trích nguyên văn | 6/6: bốn diễn đạt, hai trích nguyên văn |

Không gộp đường cơ sở bốn ca với bộ sáu ca thành một so sánh tỷ lệ chuẩn hóa.
Các mẫu chẩn đoán đơn lẻ được tách khỏi nghiệm thu. Không giữ logic thử prompt
đồng tham chiếu hoặc lược trích dẫn trong runtime cuối.

Sáu ca cuối gồm ba lần hỏi tổng quan cùng ý, biến thể dấu câu, câu nối tiếp trộn
giao tiếp/thông tin và câu nối tiếp phí vào cửa. Cả 18 JSON calls đều yêu cầu và
thực trả `gpt-6-luna`. Tổng token quan sát 51.682, trung vị mỗi lượt 10.127,5 ms,
p95 nearest-rank 12.050 ms với chỉ sáu mẫu. Không quy đổi USD hoặc suy từ dashboard
$0 rằng không gọi model. Embedding vẫn dùng model embedding hiện hành.

Sau lần đo cuối chỉ bổ sung guard chặt hơn về thời điểm thừa kế từ lịch sử và
chỉ dẫn trong nguồn; không chạy thêm bộ trả phí để làm đẹp kết quả. Guard được
kiểm tra offline và có trong build cuối.

### HTTP, DB và replay

Bộ HTTP cuối **7/7**: hỏi thiếu chủ thể, lời chào, tổng quan, hỏi lặp, dấu câu,
nối tiếp trộn và giá vé. Năm lượt thông tin gồm bốn ANSWERED và một PARTIAL;
hai lượt thông tin là SOURCE_EXCERPTS. Thời gian bảy lượt có trung vị 13.079 ms,
p95 16.611 ms; không so với mẫu direct như cùng một tải chuẩn.

Lịch sử đã lưu, replay cùng key/payload và cleanup đều đạt. Chỉ tạo/xóa hội thoại
và thu hồi Guest của bộ thử, không đọc/sửa hội thoại của chủ dự án. Lần gọi đầu
khi server chưa chạy bị ECONNREFUSED, không phải lỗi model. Sau đó khởi động server
development localhost:3010. Các lần HTTP trung gian lần lượt 5/7, 6/7, 6/7, 5/7,
5/7 vẫn được lưu trong JSON; không loại khỏi báo cáo.

## 3. Kiểm tra code cuối

| Kiểm tra | Kết quả |
| --- | --- |
| Web regression | 1.834 Vitest PASS, 105 gated SKIP; 329 legacy PASS |
| PostgreSQL disposable thực | 69/69 PASS, không skip; container/volume của harness đã dọn |
| Root typecheck | PASS |
| Root production build | PASS, 32,758 giây |
| Browser production components + transport hư cấu | 17/17 nhóm PASS; 360/390/768/1440, light/dark, nguồn, bản nháp, bàn phím, PARTIAL, lỗi, chậm, UNKNOWN/retry |
| Premium UI audit scoped | PASS, 0 findings |
| DESIGN.md lint | 0 errors; bốn cảnh báo token mồ côi đã có từ trước |
| git diff --check / kiểm tra credential theo phần thay đổi | Xem dòng kiểm tra chốt bên dưới |

Browser fixture không gọi API hoặc DB và chặn mạng ngoài; không coi đó là chứng
minh Luna. Corpus live READ ONLY được khóa development target/allowlist. Không
thay corpus để làm bộ thử đạt. Kiểm tra PostgreSQL sửa fixture allowlist tổng hợp
bị cũ và kỳ vọng token admission đã lạc phiên bản; không nới quyền/quota runtime.

## 4. Phần còn chờ nghiệm thu

[Gói 60 ca](ai-chatbot-corpus-review.json) gồm 40 biến thể recall và 20 ca hội
thoại/thời điểm/đánh giá phù hợp/đối kháng. `reviewer`, `reviewedAt`, đáp án và ghi
chú độc lập được để trống; không để Luna tự tạo chuẩn rồi tự chấm. Script export
không ghi đè khi phát hiện người đã chú giải. Đây là gói để duyệt, chưa là gold.

Các checkbox chưa xong trong plan là phần người duyệt/corpus: tối thiểu 40 ca có
duyệt độc lập, chấm đúng/từ chối đúng/từ chối sai/trích dẫn và nghiệm thu nguồn
thật. Không thể suy ra chúng từ các trạng thái PASS, recall hoặc bộ thử hư cấu.
Chưa chốt tỷ lệ chính xác sản xuất hoặc bảo đảm chatbot luôn có câu trả lời.
Thiếu nguồn thật vẫn cần báo giới hạn. Không có schema mới để kiểm tra migration.

Các tệp chính: `qa-assessment.ts`, `qa-reviewed-support.ts`, `qa-generation.ts`,
`qa-synthesis-verification.ts`, `qa-reviewed-excerpts.ts`, `qa-retrieval.ts`,
`qa-answer-details.ts`, `assistant-answer-content.tsx`, `assistant-followups.ts`.
Script đo/export và browser fixture được giữ trong repo để tái lập với chế độ
opt-in; việc chạy API thật vẫn cần đúng target và ngân sách hiện hành.

Kiểm tra chốt: `git diff --check` PASS; quét pattern credential trên dòng thêm
và tệp chưa theo dõi của tác vụ không phát hiện khớp. Dọn các tệp chẩn đoán tạm
do tác vụ tạo; không giữ instrumentation xuất nội dung nguồn hoặc phản hồi thô.
Không chạy migration vì không thay schema. Server development localhost:3010
được để chạy để chủ dự án kiểm tra.

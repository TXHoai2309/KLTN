# Chatbot: giọng trả lời và nguồn thu gọn — 17/10/2026

Chủ dự án yêu cầu trả lời tự nhiên hơn, cho phép thu gọn nguồn và hỏi liệu thay
embedding bằng Luna có giúp tìm/viết tốt hơn. Giữ `gpt-6-luna` cho đánh giá, sinh,
kiểm chứng; giữ `text-embedding-3-small` và index/provenance hiện hành cho tìm kiếm.
Không đổi model, schema, corpus, credential, ngân sách hay thêm provider call.

## Thay đổi

- Policy `.4` yêu cầu câu ngắn, nối ý tự nhiên; không lặp văn phong “Hồ sơ ghi…”
  và tên đầy đủ của địa điểm ở từng đoạn. Diễn đạt bằng lời của trợ lý, giữ nguyên
  số liệu, phủ định, điều kiện và giới hạn thời điểm. Không chèn lời khuyên hoặc
  câu chào/kết không có căn cứ vào các phần thông tin đã kiểm chứng.
- Verifier được làm rõ cách hiểu đại từ/tên rút gọn trong cùng câu trả lời;
  các phần trước chỉ giải nghĩa chủ thể, không trở thành bằng chứng. Giữ đủ tám
  cổng và binding certificate; không sửa câu chữ trên client sau kiểm chứng.
- Một mục native “Xem nguồn (n)” mặc định đóng thay các thẻ nguồn lặp sau mỗi đoạn.
  Mở ra vẫn có mapping nguồn cho từng ý và metadata/link an toàn cũ. Bảng giữ mã
  nguồn gọn. Registry không hợp lệ vẫn hiện lỗi, không dựng nguồn thay thế. Mở
  hoặc focus phần nguồn ngăn tự cuộn xuống cuối, dùng được bằng bàn phím/mobile.
- PARTIAL được giới thiệu bằng câu trực tiếp hơn, vẫn hiện rõ phần chưa đủ dữ
  liệu. Câu cần làm rõ hiển thị trực tiếp câu hỏi, không ghép thêm heading trạng thái.
- Sửa lỗi mất chủ thể sau chuỗi hỏi tiếp: tái hiện test đỏ với giới thiệu → địa chất
  → danh hiệu → giá vé. Chọn tối đa hai câu từ lịch sử đã được phép: câu nêu chủ
  thể gần nhất và câu nối tiếp mới nhất, chỉ khi mọi câu trung gian bị lược bỏ
  khớp mẫu nối tiếp trung tính đầy đủ được cho phép. Không dùng blacklist để đoán
  rằng câu lạ không có điều kiện. Câu có thời điểm, số, phủ định hoặc nhu cầu cá
  nhân/di chuyển khác không được bỏ để nhường chỗ; giữ hai câu gần nhất và hỏi
  rõ chủ thể khi không đủ ngữ cảnh. Lịch sử không trở thành nguồn sự thật.
- Gợi ý danh hiệu hỏi đúng danh hiệu UNESCO khi nội dung đã xác nhận có nhắc
  UNESCO, thay vì hỏi rộng về ý nghĩa/danh hiệu/xếp hạng cùng lúc. Mẫu khác không
  khẳng định UNESCO. Tên Đồng Văn không còn bị nhầm với đơn vị tiền “đồng” để sinh
  gợi ý giá vé. Không auto-send, ghi đè nháp hoặc lưu gợi ý.

UI giữ màu/font và controller hiện có. Người dùng chấp thuận thu gọn nguồn là
thay đổi trình bày; kiểm tra nguồn và citation trên server vẫn bắt buộc. Các câu
trích nguyên văn vẫn được gắn nhãn và có thể giữ văn phong của tài liệu; không
coi chúng là bản diễn đạt tự nhiên đã vượt qua verifier.

## Kiểm tra và giới hạn

[Metadata hai lần HTTP](ai-chatbot-natural-conversation-results.json):

| Lần thử | Kết quả |
| --- | --- |
| Gợi ý rộng “danh hiệu hoặc xếp hạng” | 4/5; câu danh hiệu bị REQUIRED_FACETS_COVERAGE từ chối. Lượt giá vé vẫn giữ chủ thể và trả lời được |
| Gợi ý hẹp “được UNESCO công nhận là gì” | 5/5: một CONVERSATIONAL, ba ANSWERED, một PARTIAL. Một ANSWERED là SOURCE_EXCERPTS; ba lượt thông tin còn lại là synthesis |

Cả hai lần đều xác minh lịch sử đã lưu, replay cùng payload/key và dọn hội thoại/
Guest riêng. Không đọc/sửa hội thoại chủ dự án. Các đoạn synthesis của lần đầu
không bắt đầu bằng mẫu “Hồ sơ…” được đo; đây chỉ là mô tả, không phải chấm điểm
tự nhiên hay độ đúng. Hai lần khác câu danh hiệu, không phải so sánh cùng nguyên
đầu vào. Trong lần đầu có thay guard lịch sử sang allowlist chặt hơn; lần cuối
dùng rule cuối. Độ trễ có chồng hoạt động build/test cục bộ, không dùng làm benchmark.
Không chạy tiếp để xóa/che lần không đạt hoặc bỏ cổng kiểm chứng.

- Test tái hiện trước sửa: 1 lỗi mất chủ thể, 49 bài đạt.
- Full web cuối: **1.842 Vitest PASS / 105 gated SKIP; 329 legacy PASS**.
- Lần full đầu có chín kỳ vọng UI cũ không còn phù hợp và một timeout 5 giây của
  test SDK Blob không liên quan. Sửa UI giữ fail-closed registry/thiếu nguồn;
  cập nhật kỳ vọng trình bày. Test Blob không thay mã: chạy riêng đạt; full cuối đạt.
- Browser: **17/17 nhóm** với component production/transport hư cấu, 360/390/768/
  1440, light/dark, đóng mặc định, bàn phím mở nguồn, nguồn mobile, nháp, auth,
  PARTIAL, lỗi/chậm và UNKNOWN/retry. Chặn mạng ngoài; không coi đây là bằng chứng API.
- Root typecheck PASS. Build cuối và diff check ghi ở dòng chốt bên dưới.
- Scoped premium audit: 0 findings; DESIGN lint: 0 errors, bốn cảnh báo token mồ
  côi cũ. Không thay SQL/schema, không chạy lại benchmark recall/PostgreSQL cho
  thay đổi này; kết quả PostgreSQL đợt trước là lịch sử.

Không triển khai Luna thành model embedding: endpoint embedding trả vector để
so khớp index, còn model sinh đọc văn bản để trả lời. Một lớp viết lại query/rerank
bằng LLM là việc khác và cần đo riêng; đợt này không thêm call đó. Nếu đổi model
embedding, phải tạo lại vector và đánh giá index tương ứng, kể cả cùng số chiều;
không trộn model mới với vector cũ. Tham khảo
[OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings).

US-23 vẫn NOT_ACCEPTED; 60 ca độc lập chờ người duyệt. Không suy ra chatbot luôn
trả lời hoặc mọi câu đã tự nhiên từ một chuỗi 5/5. Không commit/push/deploy hay
thay cấu hình tài khoản/billing. Giao diện cũ được thu nguồn khi render lại;
prompt mới áp dụng cho lượt hỏi mới, không sửa lại câu trả lời đã lưu.

Kiểm tra chốt: root build cuối PASS (30,198 giây), root typecheck PASS,
`git diff --check` PASS; JSON báo cáo hợp lệ và tệp mới không có lỗi whitespace.
Quét pattern credential trên dòng thêm/tệp mới không phát hiện khớp. Rà soát
React không thêm hook có điều kiện, fetch hoặc request state toàn cục; disclosure
dùng native keyboard behavior, renderer không parse HTML và controller giữ
ownership/retry/nháp hiện có. Trang `http://localhost:3010/assistant` trả HTTP 200.
Đã xem ảnh mobile paragraph/table, phần nguồn đóng mặc định và mở được bằng
bàn phím trong bộ browser. Server local được để chạy để chủ dự án thử lượt mới.

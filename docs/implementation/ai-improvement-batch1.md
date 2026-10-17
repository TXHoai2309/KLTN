# Cải thiện chatbot — đợt đầu theo kế hoạch

Ngày: 17/10/2026 · Story: US-23 · Phạm vi: Giai đoạn 0–2 và metadata đo lường.
Chủ dự án đã yêu cầu bắt đầu triển khai
[kế hoạch](D:/KLTN/KLTN/docs/implementation/ai-chatbot-improvement-plan.md).
Đây là báo cáo triển khai, không phải biên bản chấp nhận corpus/production.

## Những gì đã thay đổi

- Thêm 40 ca được ghi chú rõ là dữ liệu hành vi hư cấu; chạy service và adapter
  thực với provider giả lập, kiểm tra route, query, lịch sử, số lời gọi, giữ nguyên
  câu gốc và hoàn tất qua store. Trước sửa 23/40 đạt, sau sửa 40/40 đạt.
- Chuẩn hóa quy tắc nguồn, phạm vi và thời điểm trong `qa-answer-policy.ts`.
  Prompt generation dùng policy chung, trả lời trực tiếp, tổng hợp có căn cứ,
  giữ modality/điều kiện, tránh lời khuyên thiếu nguồn. Định dạng vẫn là đoạn văn
  phù hợp renderer hiện tại; chưa thêm Markdown/bảng hoặc thay UI.
- Bỏ suy đoán tên riêng chỉ từ viết hoa: `NÓ Ở ĐÂU?`, `Giờ Mở Cửa Là Gì?` vẫn
  giữ đúng chủ thể. Cảm ơn/lời chào kèm yêu cầu không nuốt phần hỏi thông tin.
- Làm rõ chủ thể bằng câu do server soạn khi câu nối tiếp không có chủ thể hoặc
  theo sau mẫu so sánh nhiều đối tượng. Bối cảnh DESTINATION đã được server giải
  quyết không bị hỏi lại thiếu chủ thể. Mẫu so sánh chỉ là dấu hiệu bảo thủ, không
  phải bộ nhận diện tên riêng tổng quát.
- Tên điểm đến ngắn trả lời câu làm rõ giữ thuộc tính từ câu hỏi trước; câu mới
  có chủ thể và thuộc tính đầy đủ vẫn ưu tiên chủ đề mới. Chỉ câu hỏi cũ được giữ,
  không đưa câu trả lời cũ thành nguồn.
- Mở rộng lời chào/cảm ơn/hỏi khả năng hiện diện. Câu mở đầu chuyến đi mới hỏi
  một thông tin cụ thể; giữ literal cũ trong allowlist để đọc được lịch sử cũ.
- Các nhánh giao tiếp/làm rõ không dùng embedding/provider, vẫn reserve,
  complete/replay và xử lý UNKNOWN như trước. Không thêm provider call cho bước
  viết lại, retry hoặc fallback; model, embedding và ngân sách không đổi.
- Bỏ ba nhánh debug ghi nguyên phản hồi/review ra đường dẫn cá nhân. Metadata
  an toàn có thêm elapsedMs của lượt và providerElapsedMs của từng lời gọi;
  diagnostics tiếp tục chỉ hoạt động ở development theo gate hiện có.

## Kiểm chứng câu trả lời

Các lần thử thật ban đầu còn gặp `CLAIM_GROUNDING` âm dù từng claim đều được model
đánh dấu entailed. Đã bổ sung chỉ dẫn về tính nhất quán giữa verdict từng claim
và gate tổng, phân biệt lỗi trích dẫn với sở thích trình bày.

Verifier có thêm `summary` ngắn tối đa 400 ký tự để nêu căn cứ chấp nhận/từ chối.
Đây là nhận xét ngắn, không yêu cầu suy luận từng bước. Trường này chỉ sống trong
lời gọi kiểm chứng, không vào câu trả lời, DB hoặc log. Nó không có quyền đổi gate:
test đối kháng xác nhận summary nói tích cực nhưng gate âm vẫn phải từ chối.
Mọi gate, nguồn tham chiếu, phủ đủ câu/khía cạnh, public safety và certificate
hiện có vẫn được server thực thi.

Lần thử chẩn đoán tạm có bổ sung lý do trong schema không được tính là kết quả
nghiệm thu runtime. Mã chẩn đoán tạm đã được bỏ; kết quả bàn giao dùng schema
runtime cuối cùng. Các lần chưa đạt được giữ trong báo cáo, không xóa khỏi số đo.

## Cách đọc số liệu

[Số liệu 40 ca trước/sau](D:/KLTN/KLTN/docs/implementation/ai-improvement-batch1-results.json)
chỉ đo hành vi chương trình với verdict hư cấu. Chúng không chứng minh Luna luôn
đánh giá đúng ngữ nghĩa, không thay 40 ca Hà Giang do người có chuyên môn duyệt,
và không đủ cơ sở chọn ngưỡng hybrid retrieval.

Các ca source/grounding, phủ định, giá hiện tại, trích dẫn giả, ownership, UNKNOWN,
replay và thu hồi nguồn tiếp tục nằm trong bộ hồi quy hiện có. Chưa thêm DTO chi
tiết cho missing aspects; PARTIAL vẫn dùng thông báo thiếu dữ liệu hiện tại.

Kết quả cuối của backend: 1767 Vitest đạt, 101 bài có điều kiện được bỏ qua và
329 bài legacy đạt. Typecheck toàn repo, production build (18.8s) và diff check
đều đạt. Không đổi UI nên không chạy một vòng browser
QA mới; không có lint script để báo lint đạt.

| Kiểm tra thật cuối | Kết quả |
| --- | --- |
| Direct API: câu gốc | ANSWERED |
| Direct API: lặp câu hỏi | ANSWERED |
| Direct API: thêm `? ,./` | ANSWERED |
| Direct API: cảm ơn + câu nối tiếp | INSUFFICIENT_SOURCE do CLAIM_GROUNDING — ca chưa đạt |
| HTTP: thiếu chủ thể | CLARIFICATION_REQUIRED, không có trích dẫn |
| HTTP: chào | CONVERSATIONAL, không có trích dẫn |
| HTTP: gốc/lặp/dấu câu/nối tiếp | Cả bốn ANSWERED, mỗi lượt có trích dẫn |
| HTTP: lịch sử/replay/dọn tài nguyên riêng | Đạt |

Direct API xác nhận actual Luna cho cả 12 lời gọi JSON. Bốn lượt thông tin trong
HTTP cuối mất khoảng 27.1s, 18.6s, 14.1s và 20.2s. Chạy đồng thời các kiểm tra có
thể ảnh hưởng độ trễ; không dùng bốn mẫu để kết luận p95 sản xuất.

**Giới hạn chưa xử lý hết:** cùng câu nối tiếp đạt trong HTTP nhưng vẫn bị từ
chối ở phép thử độc lập. Không kết luận đó là thiếu nguồn thật hoặc lỗi căn cứ
của câu trả lời nếu chưa chấm độc lập cả answer/support; verdict model tự nó
không phải chuẩn ngữ nghĩa. Không thay gate âm bằng kết quả tích cực, không chạy
lại đến khi đạt để tuyên bố nghiệm thu. Phần đánh giá ngữ nghĩa/corpus và độ ổn
định thật còn mở dù routing và các hồi quy chương trình đã đạt.

## Các lần chạy và giới hạn

- Baseline 40 ca: `%TEMP%/kltn-ai-improvement-baseline.log` — 17 ca hành vi chưa đạt.
- Sau sửa routing: `%TEMP%/kltn-ai-improvement-focused.log` — 40 ca đạt và các
  nhóm hồi quy liên quan đạt. Corpus và người duyệt độc lập vẫn PENDING.
- Direct API trước protocol summary: `kltn-ai-improvement-live.log` và
  `kltn-ai-improvement-live-final.log` — mỗi lần 3/4 đạt; mixed follow-up bị từ
  chối ở semantic grounding. Đây không phải lỗi truy hồi rỗng.
- HTTP trước protocol summary: `kltn-ai-improvement-http-final.log` và
  `kltn-ai-improvement-http-verified.log` — các bước làm rõ/chào hoạt động nhưng
  bài thử dừng ở câu thông tin bị từ chối; cả hai lần đều dọn tài nguyên riêng.
- Kết quả runtime cuối: `kltn-ai-improvement-live-release.log`,
  `kltn-ai-improvement-http-release.log`. Không gộp lần chạy có schema chẩn đoán
  tạm vào số đo này; không suy ra 100% ổn định từ một smoke.

Direct API chỉ đọc corpus trong transaction READ ONLY và kiểm tra development
pins/allowlist. HTTP chỉ tạo Guest/conversation riêng và dọn qua API thông thường;
không dùng session Admin hoặc lịch sử của chủ dự án. Không đổi source/index,
schema/migration, runtime gate, credentials hoặc cấu hình provider. Không commit,
push hay deploy. Ứng dụng development được khởi động lại ở cổng 3010 để thử HTTP.

## Phần tiếp theo trong kế hoạch

1. Duyệt độc lập bộ ca corpus thật, chấm các lần từ chối còn lại và đo recall.
2. Chỉ thử hybrid retrieval khi đo được dữ kiện đủ điều kiện bị truy hồi bỏ sót.
3. Đợt riêng cho hiển thị danh sách/bảng và gợi ý câu hỏi sau khi có quyết định
   contract/design tương ứng. Chưa triển khai các phần này trong đợt đầu.

US-23 giữ NOT_ACCEPTED đến khi nghiệm thu corpus. Tính đúng ngữ nghĩa và sự ổn
định của model vẫn cần đo liên tục, kể cả khi bộ hồi quy chương trình đạt.

Tham khảo quy trình đánh giá từ
[OpenAI Docs — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
và [Prompting](https://developers.openai.com/api/docs/guides/prompting): tách bộ dữ
liệu, tiêu chí và kết quả; lưu ca thất bại và kiểm tra lại khi đổi prompt.

## 17/10/2026 — phản hồi tiếp theo: câu hỏi vé vào cửa và quy tắc

Ảnh mới của chủ dự án cho thấy câu hỏi nối tiếp “giá vé vào thì sao?” và một
câu giới thiệu lặp lại vẫn nhận INSUFFICIENT_SOURCE. Tái hiện được một lỗi
chương trình riêng: bộ chọn lịch sử chưa nhận các thuộc tính “vé vào”, “vé vào
cửa”, “phí vào cửa”, nên bỏ chủ thể vừa hỏi. Năm ca biến thể mới thất bại trước
sửa; sau sửa giữ chủ thể qua lượt chào, hoặc hỏi lại điểm đến nếu không có lịch
sử. Hai ca tên điểm đến rõ ràng kiểm tra rằng chủ đề mới vẫn không lấy lịch sử.
Không lấy câu trả lời cũ làm bằng chứng và không thay cách đánh giá giá hiện tại.

Kiểm tra code xác nhận câu tổng hợp đi qua bước kiểm chứng riêng: một trong tám
gate âm sẽ loại toàn bộ ứng viên và trả INSUFFICIENT_SOURCE; câu trùng nguyên
văn support đã duyệt đi đường ngắn hơn. Đây là điểm cần đánh giá khi xử lý tính
ổn định, chưa chứng minh mọi lần từ chối là sai. Các log metadata có verdict
CLAIM_GROUNDING/ENTITY_SCOPE nhưng không chứa câu hỏi để ghép chắc chắn với từng
lượt trong ảnh. Khuyến nghị giữ ràng buộc nguồn/số liệu/phạm vi, đo các lần từ
chối sai và xem lại tiêu chí chồng chéo; không bỏ toàn bộ quy tắc hoặc coi lỗi
diễn đạt là thiếu dữ liệu. Chưa thay hợp đồng tám gate trong lần sửa này.

Kiểm tra sau sửa: 1774 Vitest PASS / 101 gated SKIP, 329 legacy PASS; root
typecheck PASS; production build PASS (26.142s); git diff --check PASS. Log riêng:
`%TEMP%/kltn-entrance-followup-red.log`, `kltn-entrance-followup-green.log`,
`kltn-entrance-followup-tests.log`, `kltn-entrance-followup-types.log`,
`kltn-entrance-followup-build.log`. Không chạy thêm API/HTTP thật cho bản sửa này;
không tuyên bố giá vé đã trả lời được hoặc tính chập chờn tổng hợp đã giải quyết.
Không đổi provider, schema, nguồn hay giao diện. US-23 giữ NOT_ACCEPTED.

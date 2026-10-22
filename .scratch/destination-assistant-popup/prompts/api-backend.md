# Prompt API và BE nghiệp vụ cho Destination Assistant popup

Trạng thái: ĐÃ DUYỆT THỰC HIỆN API/BE — chủ dự án duyệt nguyên bộ sáu ticket và dependency ngày 2026-10-22. Ticket chính thức nằm trong issues/. Thiết kế Q1–Q9 đã duyệt; không grill lại.

Bạn làm việc trong D:\KLTN\KLTN và chịu trách nhiệm API/BE cho tính năng khung trợ lý theo điểm đến. Hãy thực hiện công việc thực tế trong phạm vi dưới đây, không chỉ nêu kế hoạch. Prompt FE chạy sau khi bạn bàn giao hợp đồng và evidence.

## Đọc trước và bảo toàn công việc

Đọc AGENTS.md, docs/README.md, docs/source-baselines.md, phần liên quan trong product spec, technical architecture, user flow, US-21/22/23, GLOSSARY.md và docs/ai-progress.md. Đọc hướng dẫn lồng nhau áp dụng. Sau đó đọc toàn bộ:

- D:\KLTN\KLTN\docs\implementation\destination-assistant-popup-plan.md
- D:\KLTN\KLTN\docs\implementation\destination-assistant-popup-contract.md
- Sáu ticket của tính năng trong D:\KLTN\KLTN\.scratch\destination-assistant-popup\issues\; nếu bộ đã duyệt còn nằm ở drafts, cập nhật vị trí theo quyết định xuất bản và không tự đổi phạm vi.

Kiểm tra branch, git status và diff. Giữ các thay đổi tài liệu/UI đã có; không reset, đổi branch hoặc sửa công việc FE không liên quan. Tính năng mở rộng kiến thức và AI hiểu câu hỏi trước đó đã có; không triển khai lại hoặc khôi phục verifier/giới hạn cũ.

## Kết quả cần giao

Popup dùng lại QA backend hiện có. Công việc của bạn là xác nhận hợp đồng đủ, thêm kiểm thử hành vi thiếu và sửa đúng gap server đã chứng minh. Kết quả “không cần đổi endpoint/schema” là hợp lệ nếu có evidence, không phải lý do tạo API cho đủ phần BE.

Rà soát session/bootstrap, ask, get conversation/history/turns, preference update, context resolution, principal và idempotency. Ở thời điểm thiết kế, server đã có SOURCE_ONLY/EXPANDED và Destination context; không tự thêm DTO popup hoặc pipeline model thứ hai.

Các hành vi đã chốt:

- Mở/thu gọn popup không tạo ask, conversation hoặc hủy chat trên server. Bootstrap identity theo luồng hiện có được phép.
- First ask chỉ gửi Destination ID theo context hợp lệ, question và knowledge mode; follow-up dùng owned conversation và parent/head theo hợp đồng hiện tại. Không tin tên/mô tả trang từ client như quyền truy cập hoặc nguồn thực tế.
- Guest/Traveler/Admin giữ quyền public hiện có; private conversation luôn scoped theo principal. Destination phải còn khả dụng theo hợp đồng đã có.
- Cùng lượt retry phải giữ key/body/context/mode. UNKNOWN không phải thất bại chắc chắn và browser abort không phải xác nhận backend cancellation.
- Panel mới sau một page load bắt đầu mới; không cần API tìm chat gần nhất theo Destination. Lịch sử đã xác nhận vẫn đọc từ full Assistant.
- Handoff chỉ dùng conversation đã xác nhận khi không còn ask chưa giải quyết. Backend get trả metadata/context/mode/history đủ cho FE xác nhận; bản nháp chuyển cục bộ thuộc FE, không đưa lên query string hay lưu database.
- Thu hồi quyền, hết hạn/xóa chat, sai owner/context, mất Destination visibility và lỗi provider/database không được biến thành phản hồi thành công hoặc demo.

## Phân công theo ticket

01: xác nhận wire contracts/reuse seam và chuẩn bị fixture phản hồi đúng schema; tránh biến prefactor UI thành refactor backend không cần thiết.

02: chứng minh first ask/follow-up đúng Destination/mode, session public và ownership; không thêm truy xuất general để che lỗi context.

03: chứng minh replay/key conflict/UNKNOWN/late completion; ghi rõ phần nào chỉ là client abandonment, không tạo cancel endpoint nếu không có yêu cầu mới được duyệt.

04: xác nhận thay viewport/presentation không cần và không tạo request schema riêng; BE không sửa CSS hoặc component mobile.

05: kiểm chứng owned get/turns/preference và metadata cho full-page continuation, kể cả không tìm thấy/sai owner/mismatch. Nếu server đã đáp ứng, giữ nguyên API và cung cấp evidence.

06: bổ sung/fix các regression identity/context/visibility/retention thực sự còn thiếu; giữ lỗi public nhất quán, không lộ dữ liệu nội bộ.

## Quy tắc sửa và phối hợp

- Route Handlers chỉ parse/auth/delegate/map; business rules và ownership nằm trong module/service.
- Shared QA request/response schema là hợp đồng chung do bạn bàn giao. Chỉ đổi nếu có gap đã chứng minh, giữ tương thích full Assistant và dữ liệu cũ. Nêu chính xác thay đổi cho FE trước khi họ dùng.
- FE sở hữu Destination FAB, Assistant components/controller/client wrappers, CSS, local draft transfer và browser interactions. Đừng tự đổi chúng; ghi yêu cầu tích hợp vào evidence.
- Không chạm prompt/model/retrieval/nguồn-only/expanded business policy đã hoàn thành nếu không có bug trực tiếp phục vụ popup. Giữ model/effort hiện tại, secrets server-side và source eligibility.
- Tính năng UI này mặc định không cần migration. Nếu thực sự cần, giải thích lý do và tạo Prisma migration; không db:push, không apply database thật/Production trong nhiệm vụ này.
- Không thêm durable pending recovery, account-wide widget settings, scoped-history list hoặc websocket/streaming chỉ vì chúng có thể hữu ích.

## Kiểm thử và bàn giao

Chạy các API/service/contract/idempotency/ownership tests liên quan, typecheck phù hợp và git diff --check. Provider dùng fixture; disposable database nếu có và phù hợp, không mutate live data hoặc gọi model thật để làm test xanh.

Ghi vào shared contract và ticket evidence: endpoint/schema thực tế đã xác nhận, fixture/input/output cần cho FE, phần server đã sửa, commands/kết quả và giới hạn chưa kiểm chứng. Không đánh dấu toàn bộ vertical ticket DONE chỉ vì BE xong; dùng trạng thái phần BE và để FE/integration còn mở.

Cuối nhiệm vụ báo ngắn: hợp đồng có đổi không; danh sách server files thay đổi; kết quả tests/typecheck; FE còn phải làm gì. Không commit/push/merge/deploy hoặc tự nhắn sang chat khác.

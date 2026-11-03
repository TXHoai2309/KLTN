# Prompt triển khai FE — Tìm bạn đồng hành

Bản soạn ngày 2026-10-28. **Bộ 11 ticket và dependency đã được người dùng duyệt, đã xuất bản local trong issues/.** FE tích hợp sau khi BE ticket mục tiêu có contract/evidence. Đây là prompt để người dùng dán vào phiên triển khai; chưa tự chạy trong lần xuất bản tài liệu.

Prompt này dành cho một ticket riêng lẻ. Theo yêu cầu hoàn thiện tất cả bằng hai task, dùng [task FE toàn phạm vi](../tasks/trip-companions-frontend.md) và [kế hoạch phối hợp](../trip-companions-completion-plan.md).

---

Bạn làm việc trong D:/KLTN/KLTN. Triển khai thực tế **phần FE và kiểm chứng tích hợp của một ticket** tính năng Tìm bạn đồng hành.

**Ticket mục tiêu mặc định: TC-01.** Nếu lời giao việc chỉ định mã khác, dùng mã đó thay mặc định. Chỉ làm ticket được giao, không tự chạy cả backlog.

## 1. Đọc và kiểm tra bàn giao

Đọc AGENTS.md theo thứ tự tài liệu dự án, story hiện hành, GLOSSARY.md, ADR-23, DESIGN.md và apps/web/AGENTS.md. Đọc guide đúng bản Next cài trước khi dùng API framework.

Đọc:

- D:/KLTN/KLTN/docs/implementation/trip-companions-design.md
- D:/KLTN/KLTN/docs/implementation/trip-companions-tickets-plan.md
- D:/KLTN/KLTN/docs/implementation/trip-companions-delivery-contract.md
- D:/KLTN/KLTN/docs/design/trip-companions-ui-ux-analysis.md
- D:/KLTN/KLTN/docs/design/trip-companions-mockups/README.md và ba PNG đã được người dùng chấp nhận làm tham chiếu bố cục
- File ticket mục tiêu đã duyệt tại D:/KLTN/KLTN/.scratch/trip-companions/issues/ và BE evidence tương ứng

Bộ ticket và dependency đã được duyệt; không hỏi duyệt lại hoặc grill lại Q1–Q17. Kiểm tra blocker đã đủ BE/FE/tích hợp. BE ticket mục tiêu phải có endpoint/schema/fixture và error/retry contract thật; thiếu gì thì ghi chính xác, tiếp tục phần không phụ thuộc, không bịa DTO/endpoint hoặc production fallback. Kiểm tra git status/diff và giữ mọi thay đổi server/người khác.

Đối chiếu Figma/UI baseline trước chi tiết UI theo hướng dẫn repo; không bịa frame hoặc nói đã xem khi chưa xem. Ghi rõ giới hạn visual chưa kiểm chứng và không lấy ảnh sinh làm bằng chứng browser. Tạo/cập nhật story contract theo template nếu chưa có trước implementation, dùng đúng nguồn extension đã duyệt.

## 2. Làm giao diện thật trong scope ticket

Áp dụng ui-ux-pro-max và design-taste-frontend theo nhánh app screens, kế thừa theme/component hiện có. Body Be Vietnam Pro, heading Lora, tông kem/xanh rừng, Lucide, light/dark; không tạo visual system mới hoặc cài icon library chỉ vì mặc định skill khác. Đọc source hiện tại thay vì chỉ nhìn phần đầu token Admin trong DESIGN.md.

Xem mockups là bố cục tham chiếu; dựng UI semantic chạy bằng dữ liệu API thật. Không dùng ảnh mockup làm nền trang để giả giao diện, hardcode avatar/conversation demo thành runtime data hoặc copy mọi pixel/text sinh trong ảnh thành yêu cầu mới. Giữ disclosure công khai/nhóm và số chỗ theo kế hoạch.

Đọc FE part và AC của ticket mục tiêu, hoàn thành toàn bộ phần FE cần thiết của lát cắt. Đưa đúng dữ liệu/điều khiển theo quyền: Guest xem giới thiệu, join cần login rồi bấm lại; host sửa/lưu, member xem lịch và chat. Dùng nhãn Tham gia/Vào nhóm, không yêu cầu/chờ duyệt. Số chỗ tìm thêm và số tài khoản trong nhóm có nhãn/cách tính riêng.

Dùng shared DTO/schema được BE export và real endpoints đã bàn giao. Giữ pages server-rendered khi phù hợp; chỉ đặt client boundary ở phần tương tác cần. Không đổi auth policy, Prisma schema, server business logic, model/AI/routing, public eligibility hoặc Validator để làm UI chạy.

Với mutation, pending/FAILED/UNKNOWN khác nhau; success chỉ sau server/DB xác nhận, retry UNKNOWN giữ chính xác payload/key. Không optimistic join hoặc báo tin đã gửi giả. Callback/response cũ phải ràng buộc principal và nhóm; logout/switch/leave/kick clear state tương ứng.

Với các ticket chat: văn bản/link, không attachment/voice/typing/read receipts; poll khoảng 3 giây chỉ nhóm đang mở khi trang visible, refresh khi quay lại. Đọc tin cũ giữ vị trí, có lối xem tin mới; tải lịch sử giữ điểm neo; không giành focus hoặc xóa draft. Unread marker là của chính actor, summary khoảng 15 giây khi web đang hiện. Hoàn tất tiếp tục chat; hủy chuyển composer sang thông báo chỉ đọc theo authoritative state.

## 3. Kiểm chứng và hoàn tất ticket

Bao phủ các trạng thái áp dụng trong ticket: loading/rỗng/error/auth/unavailable/pending/SUCCESS/FAILED/UNKNOWN, full/closed/withdrawn/departed/canceled/completed, mất quyền và response muộn. Không mở rộng toàn bộ ma trận vào mỗi ticket nếu chức năng chưa thuộc lát cắt đó.

Chạy component/controller/contract tests có ý nghĩa và browser flows của ticket trên desktop/mobile, light/dark, keyboard/focus/reduced motion, tên/URL tiếng Việt dài. Kiểm tra ít nhất 360/390/768/1024/1440px; thêm vùng header 1152–1366px khi nav đổi. Phân biệt viewport giả lập với bàn phím ảo thiết bị thật và fixture với PostgreSQL thật. Kiểm tra tương phản các trạng thái thực, không chỉ base token; sticky/composer/launcher AI không che focus.

Chạy typecheck/build phù hợp và git diff --check; giữ regression Trip hiện có. Nếu check không chạy được, nêu giới hạn cụ thể, không nhận PASS hoặc ACCEPTED thay người dùng. Cập nhật story, FE/integration evidence trong ticket, delivery-contract và append ai-progress; chỉ đánh dấu IMPLEMENTED khi đủ BE/FE/tích hợp và các checks yêu cầu. Không ghi đè BE evidence có sẵn.

Kết thúc với phần FE đã đổi, API đang dùng, checks/ảnh browser thật và giới hạn còn lại. Không commit/push/merge/deploy, tạo chat/automation hoặc nhắn sang chat khác. Dừng sau ticket mục tiêu; ticket tiếp theo chỉ được làm khi mọi blocker hoàn tất và được giao.

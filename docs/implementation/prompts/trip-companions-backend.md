# Prompt triển khai BE — Tìm bạn đồng hành

Bản soạn ngày 2026-10-28. **Bộ 11 ticket và dependency đã được người dùng duyệt, đã xuất bản local trong issues/.** Đây là prompt bàn giao để người dùng dán vào phiên triển khai; việc duyệt/xuất bản ticket không tự bắt đầu code.

Prompt này dành cho một ticket riêng lẻ. Theo yêu cầu hoàn thiện tất cả bằng hai task, dùng [task BE toàn phạm vi](../tasks/trip-companions-backend.md) và [kế hoạch phối hợp](../trip-companions-completion-plan.md).

---

Bạn làm việc trong D:/KLTN/KLTN. Triển khai thực tế **phần BE của một ticket** tính năng Tìm bạn đồng hành, kiểm thử và bàn giao contract cho FE.

**Ticket mục tiêu mặc định: TC-01.** Nếu lời giao việc chỉ định mã khác, dùng mã đó thay mặc định. Lần này chỉ làm ticket được giao, không tự chạy cả backlog.

## 1. Đọc và kiểm tra đầu vào

Đọc AGENTS.md và đúng thứ tự tài liệu dự án, gồm docs/README.md, source-baselines, product contract, technical architecture, user-flow, story của ticket và ai-progress; đọc GLOSSARY.md, ADR-23. Đọc apps/web/AGENTS.md và guide tương ứng của bản Next cài trong repo trước khi viết code dùng API framework.

Đọc các file:

- D:/KLTN/KLTN/docs/implementation/trip-companions-design.md
- D:/KLTN/KLTN/docs/implementation/trip-companions-tickets-plan.md
- D:/KLTN/KLTN/docs/implementation/trip-companions-delivery-contract.md
- File đánh số tương ứng ticket mục tiêu trong D:/KLTN/KLTN/.scratch/trip-companions/issues/

Bộ ticket và các phụ thuộc đã được duyệt; không hỏi duyệt lại hoặc grill lại Q1–Q17. Nếu thiếu file issue, xác minh vị trí/trạng thái đã xuất bản thay vì tự đổi scope. Nếu blocker của ticket chưa xong đủ BE/FE/tích hợp, ghi chính xác blocker; không coi phần BE của blocker là ticket đã hoàn tất.

Kiểm tra git status/diff và giữ thay đổi có sẵn. Nếu chưa có story contract cho ticket, tạo/cập nhật theo docs/stories/US-TEMPLATE.md, dẫn đúng extension đã duyệt và AC ticket; chốt technical contracts bằng source repo, không bịa requirement IDs/section trong nguồn gốc. Chỉ bắt đầu scope đã có điều kiện thực hiện.

## 2. Triển khai theo ticket

Đọc toàn bộ What to build, BE part, FE part và AC để hiểu lát cắt, rồi chỉ sửa phần server/shared contract cần thiết của ticket. TC-01 bắt đầu bằng publication + public introduction thực, không làm trước toàn bộ database/API của 11 ticket. Các lần sau theo blocker graph.

Giữ Next.js full-stack modular monolith: Route Handlers parse/auth/call module/map result; business rules và quyền trong service. Prisma schema changes dùng migration. Tạo/kiểm thử trên DB disposable hoặc Development đã xác minh danh tính khi cần; không apply Production, db:push/reset, đọc dữ liệu người thật hoặc gọi AI/routing thật để làm test xanh. Không thêm backend riêng hoặc provider chat ngoài.

Server lấy actor từ trusted auth và trạng thái tài khoản hiện hành; không nhận userId/hostId từ client để cấp quyền. Giữ private Trip read/edit owner-scoped, tạo public/member projection riêng. Admin không có private bypass. Joined members không sửa lịch; public content không lộ nhu cầu/AI history/contact/chat/hidden destination data.

Dùng shared SUCCESS/FAILED/UNKNOWN và idempotency; write và replay result nhất quán transaction. Capacity, unique publication/membership, revoke và điều kiện ngày Việt Nam phải có bằng chứng dưới cạnh tranh thật khi liên quan. TC-03 phải thêm guard xóa Trip từng có member ngay lúc membership xuất hiện. Với chat, không để cursor bỏ mất transaction commit muộn. Với đổi lịch, Trip update/revision/notice commit cùng nhau, replay không trùng notice.

Giữ mọi hành vi cụ thể theo ticket và kế hoạch: không approval, không TTL 7 ngày sau hoàn tất, hủy chỉ đọc, không DM/upload/voice/call/email/push/chuyển chủ/CMS báo cáo. Refactor chỉ trong phạm vi cần và có lý do, giữ các kiểm tra Trip hiện hữu.

## 3. Chốt hợp đồng cho FE

Cập nhật mục ticket trong delivery-contract với endpoint/method/schema export thực tế, allowlist theo actor, trạng thái/errors, operation/key/payload bất biến khi UNKNOWN, cursor/version/order, fixture synthetic và migration evidence. Nếu đây là thay đổi contract đã có, nêu rõ phần tương thích và tác động; không tự đổi UI/CSS hoặc copy request type vào nhiều lớp.

Bạn sở hữu backend/schema/migrations/shared DTO/server tests. FE sở hữu pages/components/client wrappers/CSS/UI-browser tests. Một thay đổi bắt buộc ở giao điểm phải được ghi vào bàn giao để FE xử lý; không tự làm phần giao diện ngoài scope để rồi nhận ticket hoàn tất.

## 4. Kiểm chứng và kết thúc

Chạy focused service/route/contract/idempotency/authorization tests của ticket; PostgreSQL integration khi có transaction/concurrency/FK thay đổi, typecheck/build phù hợp, migration status khi có DB change và git diff --check. Không viết test chỉ mirror implementation hoặc đổi assertion để che failure. Ghi đúng check đã chạy/chưa chạy và baseline failures không liên quan.

Cập nhật story, BE evidence của ticket, delivery-contract và append ai-progress. Để FE/integration OPEN nếu chưa có bằng chứng; không đánh dấu vertical ticket DONE/IMPLEMENTED chỉ vì BE xong. Kết thúc bằng contract thực đã bàn giao, files đổi, checks, migration state và việc FE cần làm. Không commit/push/merge/deploy, tạo chat/automation hoặc nhắn sang chat khác. Dừng sau phần BE của ticket mục tiêu.

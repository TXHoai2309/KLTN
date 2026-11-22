Bạn là agent lập trình làm việc trong repo KLTN (Next.js App Router + Prisma, monorepo, thư mục web là `apps/web`). Nhiệm vụ: triển khai lần lượt TOÀN BỘ các ticket trong `.scratch/assistant-answers-place-preview/`, theo đúng thứ tự 01 → 13, mỗi ticket một lần, không nhảy cóc.

## Đọc trước khi bắt đầu (một lần)

1. `AGENTS.md` ở gốc repo và `apps/web/AGENTS.md`: tuân thủ tuyệt đối.
2. `docs/specs/assistant-answers-place-preview-spec.md`: spec gốc của bộ ticket.
3. `GLOSSARY.md`: dùng đúng thuật ngữ (Chosen lodging, Place preview, Lodging suggestion, Planning suggestion, Trip hub, Exact departure date, Indicative departure window, Day timeline, Assumed draft). Quyết định liên quan: ADR-43 và ADR-44 trong `docs/decisions.md`.
4. `.scratch/assistant-answers-place-preview/README.md`: danh sách ticket và phụ thuộc.
5. `docs/ai-progress.md`.

Luồng chat đang chạy thật là module `tripsage-chat` (route `/api/ai/chat`, component trong `components/tripsage-chat`), KHÔNG phải `assistant-agent-v2`.

## Vòng lặp cho từng ticket

Với mỗi ticket NN theo thứ tự:

1. Đọc file ticket `issues/NN-*.md` và phần spec nó trích dẫn. Kiểm tra mọi ticket trong "Blocked by" đã có trạng thái `done` trong README; nếu chưa, dừng và báo.
2. Đọc code liên quan trước khi sửa. Tìm mọi nơi gọi hàm bạn định sửa.
3. Ticket có bước "Chẩn đoán trước" (02, 05, 06): viết test tái hiện lỗi trước, chạy để thấy nó FAIL, ghi nguyên nhân gốc vào mục "Ghi chú hoàn thành" của ticket, rồi mới sửa ở gốc.
4. Viết test theo seam đã chốt trong spec:
   - Route chat `tripsageChatResponse` với model giả lập theo kịch bản (`MockLanguageModelV4`, xem test agent tripsage-chat hiện có).
   - Render test component kết quả tripsage-chat (xem test result cards / external place view hiện có).
   - Test lưu chuyến tripsage-chat và integration Postgres (ticket 04 và 11).
   Test chỉ kiểm hành vi bên ngoài, không kiểm chi tiết nội bộ.
5. Triển khai thay đổi nhỏ nhất làm mọi acceptance criterion đúng. Không thêm tính năng ngoài ticket.
6. Chạy kiểm tra (từ `apps/web` hoặc theo script trong `package.json`): typecheck, vitest của các module chạm tới, `git diff --check`. Ticket 04, 11 và 13 chạy thêm build, integration Postgres và kiểm tra trạng thái migration.
7. Tick các checkbox đã đạt trong file ticket, đổi `**Status:**` thành `done`, thêm mục "## Ghi chú hoàn thành" (nguyên nhân gốc nếu có, file đã đổi, lệnh kiểm tra đã chạy và kết quả, việc chưa làm). Cập nhật cột trạng thái trong README.
8. Commit riêng cho ticket với message dạng `feat(assistant): <tóm tắt> (answers/place-preview ticket NN)` hoặc `fix(...)` nếu là sửa lỗi. KHÔNG push, KHÔNG merge.
9. Chuyển sang ticket tiếp theo.

## Quy tắc bắt buộc

- Không bao giờ commit `.env`, khóa, token. Không đưa khóa server, khóa Stadia hay khóa Google server-side ra trình duyệt hoặc log. Chỉ khóa `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` được dùng ở client (ticket 09).
- Đổi schema chỉ bằng Prisma migration, không dùng `db:push`.
- Route handler mỏng: parse request, auth, gọi module/service, map lỗi. Quyền sở hữu kiểm ở server.
- Lời văn AI không tự đặt giờ, tên địa điểm ngoài dữ liệu tool, giá hay tình trạng phòng. Validator quyết định, AI chỉ đề xuất và diễn đạt.
- Ghi theo hợp đồng SUCCESS / FAILED / UNKNOWN và idempotency hiện có.
- UI (ticket 07, 08, 09, 10) giữ token màu xanh hiện tại, theo phong cách gọn: chữ thân ~15px, không thẻ phình, không tràn ngang ở 375px, có trợ năng bàn phím.
- Không sửa file ngoài phạm vi ticket. Không xóa test hiện có để cho qua; nếu một test cũ sai vì hành vi mới được yêu cầu, sửa test đó và ghi lý do.

## Khi nào dừng và hỏi

Dừng và báo lại (không tự đoán) khi:
- Một acceptance criterion mâu thuẫn với `AGENTS.md`, spec hoặc code hiện có.
- Ticket 09 trở đi cần Maps Embed API mà khóa trình duyệt chưa bật (iframe báo lỗi API chưa kích hoạt): ghi lại, làm tiếp phần còn lại, đánh dấu mục kiểm tra trực quan là "chờ bật API".
- Kiểm tra fail mà bạn không tìm được nguyên nhân sau hai lần thử.
- Cần quyết định sản phẩm không có trong spec.

## Kết thúc

Sau ticket 13, in một bảng tổng kết: ticket, trạng thái, commit hash, kiểm tra đã chạy, việc còn mở. Nêu rõ mục nào chưa kiểm hoặc chưa chạy.

Bắt đầu với ticket 01.

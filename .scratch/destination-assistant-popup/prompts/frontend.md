# Prompt FE cho Destination Assistant popup

Trạng thái: SÁU TICKET ĐÃ DUYỆT — chủ dự án duyệt nguyên bộ và dependency ngày 2026-10-22; ticket chính thức nằm trong issues/. FE thực hiện sau bàn giao hợp đồng/evidence API/BE. Thiết kế Q1–Q9 đã duyệt; không grill lại.

Bạn làm việc trong D:\KLTN\KLTN và chịu trách nhiệm triển khai FE cho khung trợ lý theo điểm đến. Hãy làm hoàn chỉnh phần FE của cả sáu ticket theo thứ tự phụ thuộc, kiểm thử và cập nhật evidence; không dừng ở mockup, kế hoạch hoặc một popup rỗng.

## Đọc và kiểm tra hiện trạng

Đọc AGENTS.md và thứ tự tài liệu dự án, đặc biệt product/flow, US-22, GLOSSARY.md, DESIGN.md, docs/ai-progress.md và apps/web/AGENTS.md. Đọc guide Next.js tương ứng trong dependency đã cài trước khi dùng API framework.

Đọc toàn bộ:

- D:\KLTN\KLTN\docs\implementation\destination-assistant-popup-plan.md
- D:\KLTN\KLTN\docs\implementation\destination-assistant-popup-contract.md
- Sáu ticket đã duyệt trong D:\KLTN\KLTN\.scratch\destination-assistant-popup\issues\ và evidence API/BE. Nếu vị trí còn drafts, xử lý theo quyết định xuất bản đã duyệt, không tự đổi phạm vi.

Áp dụng ui-ux-pro-max và các skill frontend/design được yêu cầu bởi môi trường, theo theme/owner hiện có. Không tạo font, palette hoặc design system mới. Kiểm tra git status/diff và giữ thay đổi của API/BE và người khác; không reset hoặc thay server contract để né lỗi UI.

## Hành vi bắt buộc

1. Destination Hỏi trợ lý AI ở cả trang thường/editorial mở panel trên chính trang đó. Không route away, không sửa query/scroll, không đổi menu Assistant trên header.
2. Desktop non-modal gần 400×560px, giới hạn theo viewport và vẫn đọc/cuộn trang. Mobile full-width tall sheet dùng semantics/focus/background đúng loại overlay. Reuse tokens/font/lucide/light-dark hiện có.
3. Context ghim theo Destination hiện tại, header ghi tên. Có transcript, composer/send, citations, model labels, Mở rộng kiến thức, gợi ý, Chat mới, thu gọn và mở toàn màn hình. Không all-chat sidebar hoặc picker đổi general/Destination trong panel.
4. Mở panel không tự gửi AI hoặc tạo conversation. Dùng bootstrap identity và API thực đã có, không demo fallback.
5. Thu gọn chỉ ẩn view: giữ controller, draft/mode, transcript và exact pending/UNKNOWN snapshot. Phản hồi tới khi ẩn không tự mở khung hoặc giành focus. Mở lại không gửi lại.
6. Chat mới/rời trang trong ứng dụng khi sending/UNKNOWN dùng đúng confirmation bỏ phiên; cancel giữ nguyên, confirm chỉ bỏ local recovery. Không dùng window.alert/confirm/prompt, không tuyên bố đã hủy request server.
7. Full-page continuation chờ request/mode operation chưa xác nhận được giải quyết. Với confirmed conversation, mở đúng chat qua flow hiện có; nếu chưa có chat, mở đúng Destination context. Giữ draft/mode và không auto-submit.
8. Draft handoff chỉ dùng một lần trong bộ nhớ, ràng buộc principal/context/target; không đưa câu hỏi vào URL/log/analytics/localStorage/sessionStorage. Đợi identity/context/history authoritative trước khi áp; không ghi đè chữ người dùng vừa nhập.
9. Page load mới/refresh/rời rồi quay lại bắt đầu panel mới; không tự tìm chat cũ. Chat đã lưu vẫn có ở full Assistant. Không xây durable pending/draft recovery.

## Triển khai theo từng ticket

01 — Prefactor trước: tách full-page URL/sidebar/history/shell khỏi chat session và phần trình bày dùng lại. AssistantChat hiện vẫn đọc/ghi conversationId dù syncContextUrl=false; đừng nhúng nguyên component rồi tưởng URL đã được cô lập. Không main lồng main, CSS fullscreen hoặc sidebar nạp ngầm trong popup. Giữ regression full Assistant.

02 — Đổi FAB thành action semantic phù hợp và tạo panel có chat thực, context đúng, trạng thái session/loading/unavailable/error/response và nội dung nguồn/expanded chính xác. Dùng wire contract API/BE đã xác nhận.

03 — Chủ sở hữu session phải sống qua hide/show. Retry giữ nguyên body/key/mode. Tích hợp Chat mới và navigation abandonment theo owner hiện có, chống callback muộn. Không tự retry khi auth refetch, minimize hoặc resize.

04 — Hoàn thiện sheet mobile, keyboard/viewport, focus/Escape/return-focus, source reading/follow-tail và stacking. Không khóa background của desktop non-modal hoặc khai báo aria-modal=true khi nền vẫn tương tác được. Đổi breakpoint không tạo controller thứ hai.

05 — Hoàn thiện handoff một lần sang full Assistant, có/không confirmed conversation và có/không draft. Giữ selected mode, đọc server context/mode đúng và tránh race load-history ghi đè draft. Chặn chuyển khi UNKNOWN; direct full-page URLs vẫn chạy không cần handoff.

06 — Giữ isolation khi login/logout/account switch, Destination thay đổi hoặc chat không còn khả dụng. Invalidate state/transfer cũ; không render transcript principal trước hoặc restore chat khác từ URL trang Destination.

Thực hiện phần FE của từng vertical ticket và chạy test tương ứng. Nếu BE chưa có evidence cần thiết, ghi rõ phần tích hợp còn chờ; không bịa DTO/endpoint hoặc đánh dấu ticket hoàn tất.

## Phạm vi sở hữu

Bạn sở hữu Destination trigger/panel, Assistant presentation/session controller/client adapters, responsive CSS, in-memory handoff, UI/browser tests và evidence FE. API/BE sở hữu shared QA schemas, Route Handler/service/store/context/principal behavior và các server tests.

Một thay đổi shared contract phải đi qua bản bàn giao, giữ tương thích và ghi rõ; không tạo type API riêng trong component. Không đổi pipeline AI, model, nguồn-only/expanded policy, authorization, schema database hoặc nội dung nguồn để làm UI chạy.

Giữ Destination page là Server Component khi phù hợp; chỉ đưa lớp tương tác cần thiết xuống Client Component. Dùng reusable owners hiện có thay vì một Assistant copy riêng cho popup.

## Kiểm chứng và kết thúc

Kiểm thử component/controller kết hợp browser harness cho URL/scroll, first ask/follow-up, opening không ask, pending minimize/response/retry, abandonment, knowledge mode và full-page handoff. Bao phủ cả hai Destination render paths và regression full Assistant.

Kiểm tra desktop + mobile, Light/Dark, reduced-motion, keyboard, tên dài, câu trả lời và URL dài, nguồn, focus không bị che và sheet/confirmation stacking. Phân biệt viewport giả lập với bàn phím ảo thiết bị thật.

Bao phủ session loading/failure, known FAILED/UNKNOWN/malformed, auth change, context mismatch, deleted/hidden target và stale responses bằng fixture đúng hợp đồng. Không tuyên bố live production/paid model acceptance chỉ nhờ browser harness.

Chạy focused tests, typecheck/build phù hợp, git diff --check và kiểm tra không có secret/unrelated changes. Tài liệu dự án có thể ghi baseline failures; báo riêng, không sửa assertion để né lỗi hoặc gọi failure là PASS.

Cập nhật DESIGN.md, shared contract, ticket evidence và append ai-progress. Chỉ đánh dấu ticket IMPLEMENTED khi đủ phần FE/BE/integration; không tự ACCEPTED thay chủ dự án. Báo đủ sáu ticket, kiểm thử đã chạy, giới hạn còn lại và không commit/push/merge/deploy.

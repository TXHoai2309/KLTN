# 03: Lưu hội thoại trợ lý

**What to build:** Bảng `assistant_conversation`, `assistant_message` (migration Prisma), store + route thin (liệt kê, đọc, xoá một, xoá hết) theo chủ sở hữu. Route chat ghi tin nhắn người dùng trước khi gọi model và tin nhắn trợ lý khi stream kết thúc, theo `SUCCESS/FAILED/UNKNOWN` + idempotency. Chỉ lưu phần đã qua schema.

**Blocked by:** 01

**Status:** DONE (2026-11-21)

- [x] Migration mới, kiểm trạng thái migration.
- [x] Không lưu đầu ra tool thô, ứng viên tọa độ, ngữ cảnh hệ thống.
- [x] Người khác không đọc/xoá được; idempotent khi gửi lại.
- [x] Dọn dẹp theo cùng thời hạn với hội thoại hỏi đáp.
- [x] Test store/route (in-memory fake Prisma DB), typecheck.

**Ghi chú / chưa kiểm:** Migration `20261121103155_assistant_conversation` đã tạo bằng `--create-only` và đọc kỹ SQL (đã bỏ 2 lệnh `ALTER TABLE "assistant_planning_workspace" RENAME CONSTRAINT` do Prisma tự sinh ngoài phạm vi để chỉ tạo mới `assistant_conversation`, `assistant_message`, 4 index và 2 FK `ON DELETE CASCADE`). Sẽ áp dụng migration lên DB trong bước bàn giao sau khi hoàn tất ticket 04. Postgres integration test chưa chạy trong bước này; toàn bộ store, idempotency, owner isolation, retention cleanup và route `/api/ai/chat` + `/api/ai/assistant-conversations` đã kiểm bằng test đơn vị và `MockLanguageModelV4`.

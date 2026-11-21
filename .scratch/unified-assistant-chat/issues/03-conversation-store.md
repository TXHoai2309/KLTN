# 03: Lưu hội thoại trợ lý

**What to build:** Bảng `assistant_conversation`, `assistant_message` (migration Prisma), store + route thin (liệt kê, đọc, xoá một, xoá hết) theo chủ sở hữu. Route chat ghi tin nhắn người dùng trước khi gọi model và tin nhắn trợ lý khi stream kết thúc, theo `SUCCESS/FAILED/UNKNOWN` + idempotency. Chỉ lưu phần đã qua schema.

**Blocked by:** 01

**Status:** TODO (chưa được duyệt code)

- [ ] Migration mới, kiểm trạng thái migration.
- [ ] Không lưu đầu ra tool thô, ứng viên tọa độ, ngữ cảnh hệ thống.
- [ ] Người khác không đọc/xoá được; idempotent khi gửi lại.
- [ ] Dọn dẹp theo cùng thời hạn với hội thoại hỏi đáp.
- [ ] Test store/route (kể cả Postgres integration nếu có DB thử), typecheck.

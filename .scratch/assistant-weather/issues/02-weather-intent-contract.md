# 02: Ý định WEATHER và trạng thái trả lời thời tiết trong hợp đồng Q&A

Spec: `docs/stories/ASSISTANT-WEATHER.md` · ADR-36 (phần bổ sung "Assistant") · thuật ngữ theo `GLOSSARY.md` (Weather question).

**What to build:** Bước AI hiểu câu hỏi nhận biết câu hỏi thời tiết và trả về một ngày chuẩn, và hợp đồng Q&A có thêm một trạng thái trả lời thời tiết. Chưa trả lời gì cho người dùng; chỉ cần hiểu đúng, kiểm tra đúng và đọc/ghi được trạng thái mới.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); owner acceptance pending

- [x] `QaQuestionUnderstanding` và schema JSON của bộ hiểu câu hỏi có thêm `WEATHER` trong `intent` và `weatherDate` (`YYYY-MM-DD` hoặc null); prompt nhận ngày hôm nay theo giờ Việt Nam. Không thêm danh sách từ khóa thời tiết.
- [x] Nhánh dự phòng khi AI lỗi không bao giờ trả `WEATHER`; câu hỏi đi tiếp vào truy xuất như hiện tại.
- [x] Hàm kiểm tra ngày phía server: đúng định dạng, không ở quá khứ, trong 16 ngày dự báo; kết quả phân biệt hợp lệ, ngoài tầm dự báo (kèm ngày "sẽ có từ"), không hợp lệ (cần hỏi lại), vắng ngày (dùng hôm nay).
- [x] Hợp đồng completed-turn có thêm một trạng thái thời tiết mang `destinationId`, `date`, `representative` và một câu dẫn; trạng thái này không có nguồn trích dẫn và không chứa số liệu dự báo.
- [x] Các lượt đã lưu trước đây vẫn đọc và hiển thị được; test với dữ liệu cũ.
- [x] Test: bộ hiểu câu hỏi (schema, dự phòng không bao giờ ra `WEATHER`), bảng kiểm tra ngày (hôm nay, mai, quá khứ, ngoài tầm, sai định dạng, null), hợp đồng cũ và mới.
- [x] Typecheck, test, build và `git diff --check` PASS.

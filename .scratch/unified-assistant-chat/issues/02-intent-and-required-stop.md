# 02: Ý định lập lịch và điểm bắt buộc

**What to build:** Prompt ba trường hợp (nói thẳng → lập ngay; chuyển từ hỏi đáp → xác nhận một câu; mơ hồ → trả lời rồi mời). `recordTripInfo.mustIncludeDestinationIds` (≤ 4, id từ `listDestinations`); `proposeItinerary` từ chối selection thiếu điểm bắt buộc. `lookupLocalKnowledge` phát `data-sources` với tên tài liệu để hiện chip nguồn.

**Blocked by:** 01

**Status:** DONE (2026-11-21)

- [x] Điểm bắt buộc kiểm ở server, id lạ bị từ chối.
- [x] Chip nguồn chỉ hiện tên tài liệu, không URL nội bộ.
- [x] Test route mô hình giả, typecheck.

**Ghi chú / chưa kiểm:** Live OpenAI cho phân loại 3 trường hợp ý định và hiển thị trình duyệt chưa chạy; kiểm tra ranh giới đã phủ đủ qua `MockLanguageModelV4` (validation `mustIncludeDestinationIds` ở `recordTripInfo` và `proposeItinerary`, `lookupLocalKnowledge` lọc URL nội bộ trong `data-sources`, `TripsageSourcesView` render chip tên tài liệu không kèm liên kết).

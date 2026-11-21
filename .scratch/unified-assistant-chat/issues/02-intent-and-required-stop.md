# 02: Ý định lập lịch và điểm bắt buộc

**What to build:** Prompt ba trường hợp (nói thẳng → lập ngay; chuyển từ hỏi đáp → xác nhận một câu; mơ hồ → trả lời rồi mời). `recordTripInfo.mustIncludeDestinationIds` (≤ 4, id từ `listDestinations`); `proposeItinerary` từ chối selection thiếu điểm bắt buộc. `lookupLocalKnowledge` phát `data-sources` với tên tài liệu để hiện chip nguồn.

**Blocked by:** 01

**Status:** TODO (chưa được duyệt code)

- [ ] Điểm bắt buộc kiểm ở server, id lạ bị từ chối.
- [ ] Chip nguồn chỉ hiện tên tài liệu, không URL nội bộ.
- [ ] Test route mô hình giả, typecheck.

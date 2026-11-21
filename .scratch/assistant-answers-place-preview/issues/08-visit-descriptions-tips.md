# 08: Mô tả từng điểm dừng và khối "Vài lưu ý"

**What to build:** Mỗi lượt tham quan trong timeline có một dòng xám "nên làm gì ở đây" (ví dụ "Check-in ngắm Núi Đôi và thung lũng Quản Bạ"), lấy từ mô tả ngắn của điểm đến trong danh mục hoặc tài liệu đã duyệt; model chỉ diễn đạt lại, không thêm sự kiện. Mốc buổi tối dùng gợi ý EVENING đã có ("Ăn tối, dạo phố cổ về đêm"). Sau lịch, tin của trợ lý có khối "Vài lưu ý" tối đa 3 gạch đầu dòng về thời điểm/thời tiết, phương tiện và đặt chỗ, dựa trên tài liệu đã duyệt (`lookupLocalKnowledge`) hoặc dữ liệu thời tiết; không nêu tên khách sạn, giá hay tình trạng phòng.

Quyết định: ADR-44 §5. Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 60–63, mục "Mô tả điểm dừng và lưu ý").

**Blocked by:** 03, 07 (giọng văn; dòng mô tả hiển thị trong timeline dạng tab)

**Status:** done

- [x] Dữ liệu lượt tham quan trả về cho client có trường mô tả ngắn lấy từ danh mục điểm đến (không từ chữ model) khi có; điểm không có mô tả thì không hiện dòng xám, không bịa.
- [x] Model có thể diễn đạt lại mô tả qua gợi ý kèm lịch, nhưng giờ giấc và tên điểm vẫn do hệ thống.
- [x] Chỉ dẫn hệ thống cho khối "Vài lưu ý": tối đa 3 ý, mỗi ý có căn cứ từ tài liệu hoặc thời tiết; không tên khách sạn, giá, tình trạng phòng; khi không có căn cứ thì bỏ ý đó.
- [x] Render test: lượt tham quan có mô tả hiện dòng xám; không có thì không hiện.
- [x] Test qua route chat với model giả lập: kết quả lập lịch mang mô tả từ danh mục cho các điểm có mô tả.
- [x] Typecheck, vitest tripsage-chat, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-timeline.ts` (thêm trường tùy chọn `description` trong `timelinePartSchema`, hàm `formatVisitDescription` rút gọn mô tả danh mục thành 1 dòng ngắn, chỉ gắn khi `stop.destination.description` khác rỗng)
  - `apps/web/src/components/tripsage-chat/tripsage-timeline-view.tsx` (hiển thị dòng xám `.tripsage-timeline-desc` dưới tên điểm dừng khi `item.description` có giá trị)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts` (bổ sung chỉ dẫn cho mô tả điểm dừng/gợi ý EVENING–TIP không đổi giờ hay tên điểm, và khối `### Vài lưu ý` tối đa 3 gạch đầu dòng có căn cứ tài liệu/thời tiết, cấm nêu tên khách sạn, giá hoặc tình trạng phòng)
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-descriptions.vitest.test.ts` (test route chat với `MockLanguageModelV4` kiểm tra `data-timeline`, render test `TripsageTimelineView`, và kiểm tra chỉ dẫn `"Vài lưu ý"`)
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/modules/tripsage-chat src/components/tripsage-chat`: 40/40 file sẵn có PASS + `tripsage-chat-descriptions.vitest.test.ts` 3/3 PASS (tổng 41 files, 375 tests PASS)
  - `git diff --check`: PASS
- **Việc chưa làm:** Không có.

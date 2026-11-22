# 07: Giao diện gọn, chữ nhỏ hơn và thẻ lịch dạng tab theo ngày

**What to build:** Trang `/assistant` nhìn nhỏ gọn như các trợ lý chat phổ biến, giữ tông xanh hiện tại:
- Chữ thân tin nhắn nhỏ lại (khoảng 15px, dòng 1.55), tiêu đề thẻ không quá to; bớt padding, bo góc và bóng làm thẻ "phình"; khoảng cách giữa các tin gọn hơn.
- Cột hội thoại tối đa khoảng 720px và căn giữa; tin của trợ lý không bọc trong thẻ to, chỉ là văn bản trên nền trang; tin người dùng là bong bóng nhỏ bên phải.
- Thẻ lịch có tab "Ngày 1 / Ngày 2 / …"; mỗi tab là một timeline dọc: cột giờ nhỏ bên trái, chấm và đường dọc, tên điểm (đậm vừa) và một dòng mô tả xám bên dưới. Thay cho danh sách dài các ngày xếp chồng.
- Tên gợi ý chỗ nghỉ hiện một lần kèm khoảng cách (không còn "HomeStay Minh Đức · HomeStay Minh Đức, cách 0.3 km").
- Khối kiểm tra lịch không dính chữ ("Kiểm tra lịch trình4 đạt"), "Xem chi tiết" thẳng hàng.
- Bảng chi phí ước tính căn cột, số tiền căn phải, chữ nhỏ; dòng "So với ngân sách" chỉ hiện khi ngân sách lớn hơn 0.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 40, 46–51, 56–59, mục "Hiển thị và UI").

**Blocked by:** 06 (cùng sửa phần render timeline)

**Status:** done

- [x] Dùng skill thiết kế của repo (design-taste-frontend hoặc impeccable) và token màu sẵn có; không đổi tông màu. Cỡ chữ và khoảng cách đặt qua token/biến dùng chung, không rải số lẻ.
- [x] Tab theo ngày dùng được bằng bàn phím (role tablist/tab/tabpanel, phím mũi tên), tab đang chọn rõ ràng.
- [x] Ngày chỉ di chuyển (ticket 06) hiển thị đúng trong tab.
- [x] Các điểm trên đều đúng ở 1440px và 375px, không tràn ngang; trên điện thoại tab cuộn ngang được.
- [x] Render test: tab theo ngày chuyển đúng nội dung; tên chỗ nghỉ không lặp; dòng ngân sách ẩn khi ngân sách 0 hoặc chưa có; nhãn khối kiểm tra có khoảng cách.
- [ ] Ảnh chụp trước và sau ở 1440px và 375px, ghi đường dẫn trong mục "Ghi chú hoàn thành".
- [x] Typecheck, vitest component tripsage-chat, `git diff --check` sạch.

## Ghi chú hoàn thành

- **File đã đổi:**
  - `apps/web/src/components/assistant/assistant.css` (token cỡ chữ/khoảng cách gọn `--chat-col-max: 720px`, `--chat-body-size: 0.9375rem`, `--chat-body-lh: 1.55`, tin trợ lý phẳng trên nền trang, bong bóng người dùng gọn bên phải, tab ngày cuộn ngang trên mobile, timeline dọc chấm-đường, bảng chi phí căn phải, không tràn ngang ở 375px)
  - `apps/web/src/components/tripsage-chat/tripsage-timeline-view.tsx` (tab theo ngày hỗ trợ bàn phím `tablist`/`tab`/`tabpanel` với ArrowLeft/ArrowRight/Home/End, timeline dọc, khử lặp tên chỗ nghỉ khi `title` trùng `place.name`)
  - `apps/web/src/modules/tripsage-chat/tripsage-cost.ts` (chuẩn hóa `budgetCap <= 0` thành `null`)
  - `apps/web/src/components/tripsage-chat/tripsage-cost-card.tsx` (ẩn dòng "So với ngân sách" khi `budgetCap` không dương, căn phải số tiền `tabular-nums`)
  - `apps/web/src/components/trip-planner/planner-presentation.tsx` & `apps/web/src/components/trip-planner/trip-planner.css` (tách khoảng trắng giữa `"Kiểm tra lịch trình"` và `"{passCount} đạt"`, thêm style căn thẳng hàng cho khối validation và nút `"Xem chi tiết"`)
  - `apps/web/src/components/tripsage-chat/tripsage-itinerary-view.tsx` (gắn nút mở `ValidationSheet` vào `ItineraryValidationPanel`)
  - `apps/web/src/components/tripsage-chat/tripsage-compact-ui.vitest.test.ts` (4 render test cho tab ngày + ngày chỉ di chuyển, khử lặp tên chỗ nghỉ, ẩn dòng ngân sách khi 0/trống, khoảng cách nhãn kiểm tra)
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run src/components/tripsage-chat src/modules/tripsage-chat/tripsage-cost.vitest.test.ts src/modules/tripsage-chat/tripsage-timeline-fixes.vitest.test.ts`: PASS (10 files, 45 tests)
  - `git diff --check`: PASS
- **Việc chưa làm:** Chưa chụp ảnh màn hình trước/sau ở 1440px và 375px (chưa chụp ảnh trước khi sửa; kiểm tra trực quan 1440px/375px sẽ thực hiện trong ticket 13).

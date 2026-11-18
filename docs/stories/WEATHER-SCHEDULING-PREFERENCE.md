# WEATHER-SCHEDULING-PREFERENCE — Ưu tiên thời tiết và giờ mặt trời khi lập lịch trình

## Status

`implemented` (2026-11-18, Tickets 01–04). Owner đã duyệt toàn bộ thiết kế qua buổi grill Q1–Q11 ngày 2026-11-18. Mở rộng [WEATHER-SUN-ADVISORIES](WEATHER-SUN-ADVISORIES.md) và [ASSISTANT-WEATHER](ASSISTANT-WEATHER.md); quyết định nền là [ADR-36](../decisions.md#adr-36--weather-is-an-advisory-never-a-constraint-validator-input-2026-11-18) kèm phần bổ sung *Scheduling soft preference*.

Thuật ngữ dùng theo [GLOSSARY](../../GLOSSARY.md#weather-and-sun-times): dự báo tại điểm đến, thời tiết lúc có mặt, thời tiết dọc chặng, cảnh báo thời tiết, cảnh báo sau hoàng hôn, chưa có dự báo, giờ mặt trời, điểm ngoài trời, kiểm tra tính hợp lệ.

## Problem Statement

Hiện tại, KLTN đã hiển thị **giờ mặt trời**, **dự báo tại điểm đến**, **thời tiết lúc có mặt** và **cảnh báo thời tiết / cảnh báo sau hoàng hôn** sau khi lịch trình đã được tạo. Tuy nhiên, thuật toán lập lịch trình ở cả Form và Trợ lý AI vẫn hoàn toàn "mù" trước dữ liệu này: nó có thể xếp một *điểm ngoài trời* (như điểm ngắm cảnh đèo hoặc cột cờ) vào cuối chiều sau hoàng hôn, hoặc xếp điểm ngoài trời vào đúng khung giờ dự báo mưa to/gió giật trong khi buổi còn lại hoặc ngày khác trong chuyến đi có thời tiết thuận lợi hơn. Du khách thấy cảnh báo nhưng phải tự tay đảo lại thứ tự điểm hoặc ngày.

## Solution

Đưa **giờ mặt trời** và **dự báo tại điểm đến** (trong tầm 16 ngày) vào bước lập lịch trình của cả **Form** và **Trợ lý AI** như một **tín hiệu ưu tiên mềm (soft preference)**:

1. **Ưu tiên giờ mặt trời cho điểm ngoài trời:** Khi có ngày khởi hành, ưu tiên xếp các *điểm ngoài trời* kết thúc trước giờ hoàng hôn của ngày đó; khi chưa có ngày khởi hành, ưu tiên xếp *điểm ngoài trời* vào nửa đầu ngày.
2. **Né khung giờ có cảnh báo thời tiết:** Trong tầm dự báo 16 ngày, nếu một khung giờ hoặc một ngày có *cảnh báo thời tiết* (mưa, sương mù, gió giật theo đúng ngưỡng ADR-36), ưu tiên đảo thứ tự điểm trong ngày (đẩy *điểm ngoài trời* sang khung giờ thuận lợi hơn, đẩy điểm trong nhà vào khung giờ xấu) hoặc đảo thứ tự giữa các ngày trong chuyến đi.
3. **Tôn trọng ràng buộc cứng và tuyến đường hợp lý:** Luôn giữ nguyên điểm bắt buộc (*must-visit*) và các ràng buộc ngày/giờ của người dùng. Chỉ áp dụng phương án đảo thứ tự khi không tạo ra vi phạm mới ở *kiểm tra tính hợp lệ* và tổng thời gian di chuyển không tăng quá 20% (tối đa +30 phút/ngày) so với phương án tối ưu khoảng cách.
4. **Minh bạch và fallback an toàn:** Khi logic thời tiết thực sự làm thay đổi thứ tự hoặc ngày tham quan, hiển thị một dòng giải thích ngắn trong cảnh báo đề xuất và câu trả lời của Trợ lý AI. Nếu ngày nằm ngoài tầm 16 ngày hoặc nhà cung cấp dự báo lỗi/quá hạn, hệ thống bỏ qua tín hiệu dự báo và vẫn lập lịch trình bình thường.

## User Stories

### Giờ mặt trời trong lập lịch trình

1. As a Traveler using the form planner with a start date, I want outdoor destinations to be scheduled before that day's sunset when feasible, so that I do not arrive at viewpoints in the dark.
2. As a Traveler using the assistant planner with a start date, I want the same sunset-aware ordering for outdoor destinations, so that both planning paths give consistent schedules.
3. As a Traveler planning without a start date (Day 1, Day 2), I want outdoor destinations prioritized in the earlier half of the day, so that scenic stops are not pushed to late afternoon by default.
4. As a Traveler planning a trip beyond the 16-day forecast horizon, I want sunset-aware ordering for outdoor destinations to still work, so that computable sun times are used even when weather forecasts are not yet available.

### Dự báo tại điểm đến trong lập lịch trình

5. As a Traveler planning within the 16-day forecast horizon, I want the planner to reorder stops within a day when an outdoor stop falls in a rain, fog, or wind advisory window and another slot that day is clearer, so that I avoid bad conditions without manual editing.
6. As a Traveler on a multi-day trip within the 16-day horizon, I want the planner to consider swapping day assignments when one day has significantly worse weather advisories than another, so that outdoor-heavy days land on clearer days.
7. As a Traveler, I want indoor or non-outdoor destinations to remain eligible during rainy windows, so that my day stays productive instead of leaving empty gaps.
8. As a Traveler, I want the planner to use the exact existing ADR-36 advisory thresholds (rain, visibility, wind gusts) rather than hidden rules, so that scheduling behavior matches the advisories shown on screen.

### Ràng buộc người dùng, tuyến đường và tính hợp lệ

9. As a Traveler who specified must-visit destinations, I want all my must-visit stops preserved even if the weather is poor, so that the planner never silently drops places I asked to visit.
10. As a Traveler who locked a specific stop or day, I want my explicit lock respected, so that soft weather preferences never override my stated constraints.
11. As a Traveler, I want weather-based reordering to be rejected if it would create a new Constraint Validator violation (opening hours, minimum stay, travel time, or schedule conflict), so that schedule validity always comes first.
12. As a Traveler, I want weather-based reordering to be rejected if it increases driving or riding time by more than 20% or more than 30 minutes per day compared to the route-optimal baseline, so that avoiding a shower does not force an impractical mountain detour.
13. As a Traveler, I want weather preferences to never change a Constraint Validator outcome and never block saving a trip, so that ADR-36 invariants remain intact.

### Chuyến đi có điểm xuất phát/về (`journey`) và chỉnh sửa cục bộ

14. As a Traveler planning a round-trip from an origin (`journey`), I want weather and sun-time preferences applied within my departure and return time bounds, so that origin trips also benefit without breaking return timing.
15. As a Traveler editing specific days in the Assistant or performing an in-trip replan (`affectedDays`), I want weather-aware reordering applied only within the affected days, so that untouched or completed days are never reshuffled.
16. As a Traveler asking the Assistant about a rainy day where reordering cannot avoid bad weather, I want the Assistant to keep my schedule valid and optionally suggest indoor alternatives in prose, so that I can decide whether to swap destinations myself.

### Minh bạch và fallback

17. As a Traveler, I want a short note in the proposal warnings and Assistant reply only when weather or sun times actually changed the stop order or day assignment, so that I understand why the schedule was arranged that way without noisy boilerplate when nothing changed.
18. As a Traveler, I want leg weather to remain an informational post-schedule advisory rather than driving route changes, so that itinerary generation stays fast and predictable.
19. As a Traveler, I want itinerary generation to succeed normally if the forecast provider fails or exceeds its short scheduling timeout, so that a weather outage never blocks planning.

## Implementation Decisions

- **Kiến trúc chung (Shared seam):** Tách một bộ đánh giá & tối ưu ưu tiên thời tiết dùng chung cho cả Form planner và Trợ lý AI ở lớp lập lịch phía server, chạy sau khi đã có tập điểm ứng viên/lựa chọn ngày và trước khi chốt kết quả trả về; không đụng vào logic đánh giá của Constraint Validator.
- **Tín hiệu đầu vào:**
  - *Giờ mặt trời:* Tính nội bộ bằng thư viện `suncalc` theo tọa độ điểm đến và ngày tương ứng; luôn sẵn sàng khi có ngày khởi hành, và dùng thứ tự ưu tiên nửa đầu ngày cho điểm có cờ `isOutdoor` khi chưa có ngày khởi hành.
  - *Dự báo tại điểm đến:* Đọc qua lớp dịch vụ thời tiết hiện có (tận dụng cache server của Open-Meteo) với ngân sách timeout ngắn (~2.5 giây) cho bước lập lịch. Nếu quá hạn hoặc lỗi, hoặc ngày nằm ngoài tầm 16 ngày, coi như không có dữ liệu dự báo và bỏ qua phần né cảnh báo thời tiết.
- **Không gian tìm kiếm có giới hạn (Bounded reordering):**
  - Với Form planner: sau khi chọn tập điểm theo sở thích/nhịp độ, cho phép thử hoán vị thứ tự các điểm linh hoạt trong từng ngày (hoặc đổi ngày giữa các ngày có thể đổi) để giảm tổng điểm phạt cảnh báo (*cảnh báo sau hoàng hôn* + *cảnh báo thời tiết* tại điểm đến).
  - Với Trợ lý AI: kết hợp cung cấp thông tin cờ `isOutdoor`, giờ hoàng hôn (khi có) và tóm tắt khung giờ xấu trong ngữ cảnh lập lịch của AI, đồng thời cho phép lớp lập lịch deterministic tinh chỉnh thứ tự trong phạm vi được phép nếu phương án AI tạo ra dính cảnh báo có thể tránh được.
  - Với chuyến đi có điểm xuất phát/về (`journey`): chỉ xét các hoán vị giữ nguyên được điều kiện giờ xuất phát và giờ về.
  - Với chỉnh sửa cục bộ (`affectedDays`): chỉ cho phép sắp xếp lại bên trong tập `affectedDays`, tuyệt đối giữ nguyên các ngày ngoài phạm vi.
- **Hàm kiểm soát đường vòng & Validator:** Mọi phương án ứng viên sau khi đảo theo thời tiết đều phải chạy qua kiểm tra tuyến đường và Constraint Validator chuẩn. Phương án đảo chỉ được chọn nếu: (a) không phát sinh `VIOLATION` mới so với phương án nền, (b) tổng điểm phạt cảnh báo giảm thực sự, và (c) thời gian di chuyển tăng thêm không vượt quá `min(20% thời gian di chuyển nền, 30 phút × số ngày bị ảnh hưởng)`.
- **Bảo toàn dữ liệu & hợp đồng hiện có:** Không thay đổi schema cơ sở dữ liệu, không lưu snapshot dự báo, không đổi cấu trúc check của Constraint Validator. Bổ sung một mã cảnh báo/ghi chú thông tin mới trong danh sách `warnings` của đề xuất (chỉ phát sinh khi thứ tự/ngày thực sự bị thay đổi bởi ưu tiên thời tiết) và chuyển tiếp thông tin này sang lớp sinh câu trả lời của Trợ lý AI.

## Testing Decisions

- **Nguyên tắc kiểm thử:** Kiểm thử hành vi đầu ra ở ranh giới module lập lịch (thứ tự điểm, ngày được xếp, kết quả Validator, mã ghi chú giải thích), dùng fake route provider và fake forecast provider; không kiểm thử chi tiết cài đặt bên trong.
- **Các nhóm test chính:**
  - *Ưu tiên giờ mặt trời:* Ngày có `startDate` đẩy điểm `isOutdoor` lên trước hoàng hôn khi điểm nền bị xếp sau hoàng hôn; ngày không có `startDate` ưu tiên điểm `isOutdoor` ở nửa đầu ngày; ngày >16 ngày vẫn áp dụng logic giờ mặt trời bình thường.
  - *Né cảnh báo thời tiết trong 16 ngày:* Đảo thứ tự trong ngày giữa điểm `isOutdoor` và điểm trong nhà khi khung giờ chiều có cảnh báo mưa/gió/sương mù; đảo giữa 2 ngày trong chuyến khi một ngày mưa cả ngày và ngày kia tạnh ráo.
  - *Rào chắn đường vòng & Validator:* Từ chối phương án đảo nếu tạo `VIOLATION` giờ mở cửa/di chuyển, hoặc nếu thời gian chạy xe tăng >20% hoặc >30 phút/ngày so với phương án nền.
  - *Bảo toàn ràng buộc người dùng:* Must-visit và ngày/giờ khóa cứng luôn được giữ nguyên dù có cảnh báo.
  - *Phạm vi `journey` và `affectedDays`:* `journey` không vi phạm giờ đi/về; chỉnh sửa cục bộ không làm thay đổi các ngày ngoài `affectedDays`.
  - *Fallback & minh bạch:* Khi Open-Meteo lỗi hoặc timeout, đề xuất vẫn thành công như bình thường; ghi chú giải thích chỉ xuất hiện khi thứ tự/ngày thực sự thay đổi do thời tiết.
- **Prior art & regression:** Tái sử dụng pattern test của `trip-planner`, `assistant-planning`, `trip-origin` và `trip-weather`; toàn bộ bộ test Constraint Validator hiện có phải giữ nguyên kết quả. Kiểm tra `tsc --noEmit`, build và `git diff --check`.

## Out of Scope

- Đưa thời tiết thành điều kiện `PASS` / `VIOLATION` của Constraint Validator hoặc chặn lưu chuyến đi.
- Tự động thay thế/xóa điểm đến khỏi danh sách người dùng hoặc thay đổi tập điểm của Form chỉ vì thời tiết (trừ gợi ý bằng lời trong Trợ lý AI).
- Tối ưu lại lộ trình dựa trên *thời tiết dọc chặng* (`leg weather`).
- Khả năng săn mây, cảnh báo sạt lở từ mưa tích lũy, hoặc bộ ngưỡng cảnh báo mới ngoài ADR-36.
- Lưu snapshot dự báo vào DB hoặc thay đổi hợp đồng API công khai của destination weather.

## Further Notes

- Spec này mô tả phần mở rộng đã chốt thiết kế ngày 2026-11-18, chưa có code. Khi bắt đầu triển khai, cần chia thành các lát cắt nhỏ (ticket) theo thứ tự: (1) lõi đánh giá & hoán vị ưu tiên thời tiết dùng chung + unit test, (2) nối vào Form planner và `journey`, (3) nối vào Trợ lý AI (`scheduleSelection` / `affectedDays`) và ghi chú giải thích, (4) kiểm tra hồi quy toàn bộ suite lập lịch và thời tiết.

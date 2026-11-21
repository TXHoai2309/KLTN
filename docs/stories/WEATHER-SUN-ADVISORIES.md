# WEATHER-SUN-ADVISORIES — Giờ mặt trời, dự báo thời tiết và cảnh báo cho chuyến đi

## Status

`implemented` (2026-11-18, chưa nghiệm thu trên trình duyệt). Owner đã duyệt ở mức kế hoạch ngày 2026-11-18 ("đồng ý hết"); quyết định nền là [ADR-36](../decisions.md#adr-36--weather-is-an-advisory-never-a-constraint-validator-input-2026-11-18). Chưa có code. Bản spec này gỡ phần loại trừ thời tiết trong [trip-origin-spec](../product/trip-origin-spec.md) cho đúng các hạng mục bên dưới; `product-spec.md` và `trip-origin-spec.md` cần được cập nhật cùng lát cắt đầu tiên.

Thuật ngữ dùng theo [GLOSSARY](../../GLOSSARY.md#weather-and-sun-times): dự báo tại điểm đến, thời tiết lúc có mặt, thời tiết dọc chặng, cảnh báo thời tiết, cảnh báo sau hoàng hôn, chưa có dự báo, giờ mặt trời, điểm ngoài trời.

## Problem Statement

Du khách lên lịch trình Hà Giang nhưng không biết trời sẽ thế nào ở từng điểm vào đúng giờ mình tới. Mưa, sương mù trên đèo và gió giật nguy hiểm khi đi xe máy, nhưng KLTN hiện không hiển thị gì về thời tiết. Du khách cũng không biết giờ bình minh hay hoàng hôn ở các điểm ngắm cảnh như Mã Pí Lèng hay Lũng Cú, và có thể vô tình được xếp tới một điểm ngoài trời khi trời đã tối.

## Solution

KLTN hiển thị **giờ mặt trời** và **dự báo tại điểm đến** trên trang chi tiết điểm đến. Trong mọi lịch trình (đề xuất trong form hoặc trong trợ lý, chuyến đi đã lưu), mỗi lượt tham quan có **thời tiết lúc có mặt**, mỗi chặng di chuyển có **thời tiết dọc chặng**, và mỗi ngày có giờ mặt trời. Khi điều kiện xấu, KLTN hiện **cảnh báo thời tiết**. Khi một điểm ngoài trời bị xếp sau hoàng hôn, KLTN hiện **cảnh báo sau hoàng hôn**.

Mọi cảnh báo chỉ để tham khảo. Chúng không thay đổi kết quả của Constraint Validator, không chặn đề xuất và không chặn việc lưu chuyến đi. Ngày nằm ngoài khoảng dự báo hiện "Chưa có dự báo, sẽ có từ ngày X". Khi nhà cung cấp lỗi, KLTN hiện thông báo "không lấy được dự báo" chứ không báo trời đẹp.

Ngoài ra có thêm hai tiện ích bản đồ: nút "Mở bằng Google Maps" ở điểm đến và lựa chọn nền bản đồ.

## User Stories

### Giờ mặt trời

1. As a Guest, I want to see today's sunrise and sunset on a destination page, so that I know when to arrive for the view.
2. As a Guest, I want to see the morning and evening golden hours on a destination page, so that I can plan photos.
3. As a Guest, I want to pick another date on the destination page and see that date's sun times, so that I can plan a future visit.
4. As a Traveler, I want each day of my itinerary to show sunrise and sunset, so that I can judge the daylight available.
5. As a Traveler, I want each day's sun times to be computed for that day's first destination, so that the times match where I actually am.
6. As a Traveler, I want sun times shown in Vietnam time (Asia/Ho_Chi_Minh), so that they match my itinerary clock.
7. As a Traveler, I want sun times to appear even when the forecast is unavailable, so that a weather outage does not hide information that is always computable.

### Dự báo tại điểm đến

8. As a Guest, I want to see the hourly forecast for today on a destination page, so that I know whether to go now.
9. As a Guest, I want to see a daily summary for the next days on a destination page, so that I can choose a good day.
10. As a Guest, I want to see rain chance, rainfall, temperature, visibility and wind gusts, so that I understand the conditions that matter in Hà Giang.
11. As a Guest, I want to see the forecast source and when it was last updated, so that I can judge how fresh it is.
12. As a Guest, I want a clear "không lấy được dự báo" state when the provider fails, so that I never mistake missing data for good weather.
13. As a Guest, I want hidden or unavailable destinations to never expose forecasts, so that the public visibility rules still hold.

### Thời tiết lúc có mặt

14. As a Traveler reviewing a form proposal, I want each visit to show the forecast for the hour I arrive, so that I see what to expect at each stop.
15. As a Traveler planning in the assistant, I want the same visit-time weather on the proposal card, so that both planning paths behave alike.
16. As a Traveler viewing a saved trip, I want visit-time weather fetched fresh when I open it, so that I see the latest forecast instead of an old copy.
17. As a Traveler, I want a visit longer than one hour to summarise the worst hour within the visit, so that I am not misled by the arrival hour alone.
18. As a Traveler, I want days beyond the forecast horizon to say "Chưa có dự báo, sẽ có từ ngày X", so that I know when to check back.
19. As a Traveler, I want no climate averages or guesses shown for those days, so that estimates are never presented as forecasts.
20. As a Traveler, I want visit-time weather to follow the itinerary when I edit it (manual edit, AI edit, in-trip replan), so that it always matches the current schedule.

### Thời tiết dọc chặng

21. As a Traveler, I want each travel leg with a verified route to show the forecast along the road for the time I pass each part, so that I know if I will ride through rain or fog.
22. As a Traveler, I want legs without route timing or geometry to say the weather along that leg is unavailable, so that missing data is never shown as clear.
23. As a Traveler, I want leg weather to be labelled as an approximation based on even speed along the leg, so that I understand its limits.
24. As a Traveler, I want outbound and return legs from my origin included, so that the whole journey is covered.

### Cảnh báo

25. As a Traveler, I want a rain advisory when the rain chance is at least 70 % or rainfall is at least 5 mm/h, so that I can prepare or reschedule.
26. As a Traveler, I want a fog advisory when visibility is below 1 km, so that I take care on mountain passes.
27. As a Traveler, I want a wind advisory when gusts reach 40 km/h, so that I take care on a motorcycle.
28. As a Traveler, I want each advisory to say where (visit or leg), when, and which value crossed which threshold, so that I can act on it.
29. As a Traveler, I want an after-sunset advisory when a visit to an outdoor destination ends after that day's sunset, so that I don't arrive at a viewpoint in the dark.
30. As a Traveler, I want advisories to never change the Validator result or block saving, so that weather uncertainty never stops me from planning.
31. As a Traveler, I want advisory thresholds to be described as guidance, not certainty, so that I am not misled about their accuracy.
32. As a Traveler, I want a trip summary count of advisories, so that I can see at a glance whether the trip has weather concerns.

### Admin

33. As an Admin, I want to mark a destination as outdoor in the destination form, so that the after-sunset advisory works.
34. As an Admin, I want the outdoor flag to default to "không" for existing destinations until I set it, so that nothing is guessed from the category text.
35. As an Admin, I want the outdoor flag shown in the destination list, so that I can find destinations I have not reviewed.

### Bản đồ

36. As a Guest, I want an "Mở bằng Google Maps" button on a destination, so that I can navigate with the app I already use.
37. As a Guest, I want to switch the map background between standard and satellite/terrain, so that I can see the landscape around a destination.
38. As a Guest, I want my map background choice remembered on this device, so that I don't pick it again each visit.

### Độ tin cậy và quyền riêng tư

39. As a Traveler, I want forecast requests to go through KLTN's server, so that my trip details and location are not sent from my browser to third parties.
40. As a Traveler, I want a slow provider to time out with an unavailable notice instead of freezing the itinerary, so that the rest of the page still works.
41. As an owner, I want forecasts cached for about one hour, so that the free provider limits are respected.
42. As an owner, I want the Open-Meteo attribution shown wherever forecast data appears, so that the licence terms are met.

## Implementation Decisions

- **Hạng mục và thứ tự** (cắt từ cuối lên nếu hết thời gian): (1) giờ mặt trời, (2) dự báo tại điểm đến, (3) thời tiết lúc có mặt, (4) cảnh báo thời tiết và cảnh báo sau hoàng hôn, (5) thời tiết dọc chặng, (6) nút Google Maps và chọn nền bản đồ. Mỗi hạng mục là một lát cắt dọc có thể giao riêng.
- **Một module mới cho thời tiết** trong `apps/web/src/modules/` (ví dụ `trip-weather`), gồm:
  - **Bộ chuyển Open-Meteo** chỉ chạy ở server, nhận `fetcher`, `timeoutMs`, `signal` có thể tiêm giống bộ chuyển Stadia routing hiện có. Gọi forecast API với `timezone=Asia/Ho_Chi_Minh`, `forecast_days` tối đa 16, các biến theo giờ: nhiệt độ, xác suất mưa, lượng mưa, tầm nhìn, gió giật, mã thời tiết. Gom nhiều toạ độ vào một yêu cầu. Kết quả chuẩn hoá thành `AVAILABLE` (các giá trị theo giờ, nguồn, thời điểm cập nhật) hoặc `UNAVAILABLE` với lý do (`TIMEOUT`, `UNAVAILABLE`, `INVALID_RESPONSE`). Không bao giờ điền giá trị mặc định.
  - **Cache server** theo toạ độ (làm tròn) và giờ, TTL khoảng 1 giờ. Cache trong bộ nhớ là đủ cho khóa luận. `shortcut: không chia sẻ giữa các instance; nâng lên bảng cache nếu deploy nhiều instance`.
  - **Giờ mặt trời** tính tại chỗ bằng thư viện `suncalc`, ghim chính xác phiên bản. Kết quả: bình minh, hoàng hôn, giờ vàng sáng và chiều theo phút trong ngày ở Asia/Ho_Chi_Minh. Đây là dependency mới duy nhất.
  - **Service thời tiết của chuyến đi** (seam chính). Đầu vào: một lịch trình (đề xuất hoặc chuyến đi đã lưu, cùng hình dạng với contract đề xuất và journey plan hiện có) hoặc một điểm đến, cùng giờ hiện tại và fetcher. Đầu ra gồm: giờ mặt trời theo ngày, thời tiết lúc có mặt theo lượt tham quan, thời tiết dọc chặng theo chặng và danh sách cảnh báo. Logic cảnh báo là hàm thuần.
- **Mốc thời gian**: ngày của lượt tham quan suy ra từ ngày bắt đầu chuyến đi và số thứ tự ngày theo quy ước hiện có. Giờ có mặt là `startMinute`; khoảng tham quan là `startMinute` đến `startMinute + plannedDurationMinutes`. Thời tiết lúc có mặt lấy giờ xấu nhất trong khoảng đó.
- **Ngoài khoảng dự báo**: ngày nào nằm ngoài giờ có trong phản hồi thì trạng thái là `NOT_YET_AVAILABLE` kèm ngày bắt đầu có dự báo (ngày đó trừ 15 ngày).
- **Thời tiết dọc chặng**: chỉ cho chặng có route `VERIFIED`, có geometry, `startMinute` và `endMinute`. Lấy mẫu điểm dọc geometry, khoảng mỗi 20 km, tối đa 8 điểm mỗi chặng. Thời điểm qua mỗi điểm nội suy tuyến tính theo quãng đường. Kết quả gắn nhãn `LINEAR_APPROXIMATION`. Chặng thiếu dữ liệu thì là `INSUFFICIENT_DATA`, không bao giờ tính là trời quang. Không tự đoán ETA bằng đường chim bay.
- **Ngưỡng cảnh báo** (owner đặt, chưa hiệu chuẩn, để làm hằng số đặt tên trong module): mưa khi xác suất ≥ 70 % hoặc lượng mưa ≥ 5 mm/h; sương mù khi tầm nhìn < 1 km; gió khi gió giật ≥ 40 km/h. Cảnh báo sau hoàng hôn khi điểm đến là ngoài trời và lượt tham quan kết thúc sau giờ hoàng hôn của ngày đó.
- **Cấu trúc một cảnh báo**: loại (`RAIN`, `FOG`, `WIND`, `AFTER_SUNSET`), vị trí (lượt tham quan hoặc chặng, kèm ngày), khoảng giờ, giá trị quan sát và ngưỡng.
- **Constraint Validator không đổi**. Không thêm check mới, không đổi kết quả hay test hiện có (ADR-36).
- **Schema**: thêm một cột boolean "ngoài trời" cho Destination, mặc định `false`, qua Prisma migration có review SQL. Không có bảng mới, không lưu bản chụp thời tiết vào chuyến đi. Form admin điểm đến thêm một ô chọn; danh sách admin hiện cờ này. Contract điểm đến công khai và contract dùng cho lập lịch thêm trường này.
- **API** (Route Handler mỏng, chỉ parse, xác thực và gọi service):
  - Endpoint công khai trả giờ mặt trời và dự báo cho một điểm đến đang công khai và một ngày. Điểm đến ẩn hoặc không tồn tại thì trả not-found như các endpoint điểm đến công khai hiện có.
  - Endpoint cho chủ chuyến đi trả thời tiết của một chuyến đi đã lưu. Kiểm tra quyền sở hữu ở server giống endpoint đọc chuyến đi. Admin không có ngoại lệ.
  - Endpoint cho Traveler đã đăng nhập nhận một đề xuất (form hoặc trợ lý) và trả thời tiết. Không ghi gì vào database.
  - Thành viên chuyến đồng hành không nằm trong phạm vi đợt này.
  - Các endpoint chỉ đọc nên không dùng contract idempotency.
- **Giao diện**: dùng design token của `@KLTN/ui`. Trang điểm đến có khối giờ mặt trời và dự báo. Lịch trình có thời tiết ở từng lượt tham quan và từng chặng, giờ mặt trời ở đầu mỗi ngày, cảnh báo đặt cạnh nhưng tách khỏi bảng kết quả Validator. Luôn ghi nguồn Open-Meteo. Có đủ các trạng thái loading, không lấy được và chưa có dự báo.
- **Bản đồ**: nút Google Maps dựng URL tìm theo toạ độ của điểm đến. Chọn nền thêm một style Stadia vệ tinh hoặc địa hình vào cấu hình map hiện có; lựa chọn lưu ở `localStorage` có bọc try/catch.
- **Bí mật**: Open-Meteo bản miễn phí không cần key. Không thêm biến `NEXT_PUBLIC_` nào. Nếu style Stadia vệ tinh cần gói trả phí thì hạng mục chọn nền bị chặn, không tự đổi sang nhà cung cấp khác.
- **Nguồn ý tưởng**: các tính năng tham khảo SkyRadar (WX-001…018, AST-001/002, RTE-005, MAP-006/007 trong `research/`), nhưng không dùng code, công thức, dữ liệu hay giao diện của SkyRadar.

## Testing Decisions

- **Một test tốt chỉ kiểm hành vi nhìn thấy từ bên ngoài**: với lịch trình, giờ hiện tại và phản hồi nhà cung cấp cho trước, kết quả trả về phải đúng. Không kiểm hàm nội bộ, tên biến hay số lần gọi.
- **Seam chính, đã thống nhất với owner: service thời tiết của chuyến đi.** Tiêm fetcher giả trả phản hồi Open-Meteo mẫu và cố định giờ hiện tại. Bao phủ:
  - Giờ mặt trời của một toạ độ Hà Giang khớp giá trị tham chiếu trong khoảng ±2 phút.
  - Thời tiết lúc có mặt chọn giờ xấu nhất trong khoảng tham quan.
  - Mỗi ngưỡng có ca ngay dưới và ngay trên ngưỡng.
  - Cảnh báo sau hoàng hôn chỉ áp cho điểm ngoài trời.
  - Ngày ngoài khoảng dự báo trả `NOT_YET_AVAILABLE` với đúng ngày bắt đầu có dự báo.
  - Nhà cung cấp timeout, lỗi hoặc trả JSON sai đều ra `UNAVAILABLE`, không sinh cảnh báo giả, nhưng vẫn có giờ mặt trời.
  - Chặng thiếu geometry hoặc thời điểm ra `INSUFFICIENT_DATA`; chặng đủ dữ liệu ra các điểm mẫu với thời điểm nội suy đúng.
  - Kết quả Validator của cùng lịch trình không đổi khi có hoặc không có cảnh báo.
- **Seam phụ: test component hiển thị**: khối thời tiết của lượt tham quan và chặng, danh sách cảnh báo, các trạng thái loading, không lấy được và chưa có dự báo, dòng ghi nguồn.
- **Test cho phần được sửa**: form admin có ô "ngoài trời"; migration được kiểm bằng `prisma migrate status`.
- **Mẫu có sẵn để làm theo**: test của bộ chuyển Stadia routing và travel-time (fetcher tiêm vào, kết quả chuẩn hoá); test của trip-validation và visit-constraints (hàm thuần trên lịch trình); test của trip-validation-panel (component hiển thị kết quả); fixture journey planning của trip-origin cho các chặng có geometry.
- **Không gọi Open-Meteo thật trong test tự động.** Gọi thật một lần thủ công từ máy owner và ghi vào ai-progress.
- **Kiểm tra trước khi giao mỗi lát cắt**: typecheck toàn repo, test liên quan, build, `git diff --check`.

## Out of Scope

- Biển mây và các điểm số chụp ảnh như Burn hay Astro.
- Rủi ro sạt lở theo lượng mưa tích lũy.
- Cảnh báo chính thức của Trung tâm Khí tượng Thủy văn.
- Radar, sét, bão, gió hạt hay ảnh mây trên bản đồ.
- So sánh nhiều mô hình dự báo.
- Thời tiết làm ràng buộc của Validator, hoặc làm tiêu chí để planner chọn điểm hay xếp giờ.
- Trợ lý AI trả lời câu hỏi thời tiết.
- Thông báo đẩy hay bản tin thời tiết.
- Đề xuất giờ xuất phát theo thời tiết.
- Lưu bản chụp thời tiết vào chuyến đi.
- Thời tiết cho thành viên chuyến đồng hành.
- Bản đồ sao, lịch thiên văn, pha Mặt Trăng.
- Gói Pro hay thanh toán, đóng góp địa điểm, app native, quét đa điểm.
- Mọi code, công thức, dữ liệu, logo hay giao diện lấy từ SkyRadar.

## Further Notes

- Khoảng dự báo khoảng 16 ngày nên phần lớn chuyến đi lên kế hoạch xa sẽ chỉ có giờ mặt trời cho tới gần ngày đi. Đây là hành vi mong muốn, không phải lỗi.
- Ngưỡng cảnh báo là con số owner tự đặt. Trong báo cáo khóa luận nên ghi rõ chúng chưa được hiệu chuẩn bằng số liệu quan trắc.
- Điều khoản Open-Meteo bản miễn phí chỉ cho dùng phi thương mại. Nếu KLTN sau này thương mại hoá thì phải đổi sang gói trả phí hoặc nhà cung cấp khác.
- Owner cần đánh dấu "ngoài trời" cho khoảng 30–50 điểm đến sau khi chạy migration. Trước đó, cảnh báo sau hoàng hôn không bắn cho điểm nào.
- Hạng mục 5 và 6 có nguy cơ không kịp trong 2 tuần. Nếu cắt thì chuyển sang mục Hướng phát triển của báo cáo.

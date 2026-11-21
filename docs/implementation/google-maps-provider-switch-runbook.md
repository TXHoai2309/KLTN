# Google Maps/Stadia — cấu hình và kiểm chứng

Ngày 2026-11-18. Code local; nghiệm thu dịch vụ thật còn mở. Nguồn phạm vi: [spec](../specs/google-maps-provider-switch-spec.md), [story](../stories/MAPS-PROVIDER-SWITCH.md), [ticket plan](google-maps-provider-switch-tickets-plan.md).

## Một cờ cho toàn bộ tích hợp Stadia được chuyển

| Cấu hình | Giá trị/ý nghĩa |
| --- | --- |
| `NEXT_PUBLIC_MAPS_PROVIDER` | `GOOGLE` để bật Google; `STADIA` hoặc chưa cấu hình để dùng Stadia. Đây là metadata công khai, không phải secret. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser key riêng, giới hạn HTTP referrers và Maps JavaScript API. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | JavaScript Map ID cho Advanced Markers; dùng Map ID thật cho triển khai. `DEMO_MAP_ID` chỉ để thử local. |
| `GOOGLE_MAPS_API_KEY` | Server secret cho Routes API và Places API (New); không đưa vào biến `NEXT_PUBLIC_*`. Các luồng Google external-place đã có cũng dùng key này khi chọn Stadia. |
| `STADIA_MAPS_API_KEY` | Giữ nguyên; server tiếp tục ưu tiên scoped Admin runtime override hiện hành nếu có. |

`PLANNER_ROUTING_PROVIDER` cũ không còn được đọc và đã bỏ khỏi schema/example. Khi nâng phiên bản, chuyển giá trị mong muốn sang `NEXT_PUBLIC_MAPS_PROVIDER`; không dùng hai cờ độc lập. Turbo đưa các biến Maps qua ranh giới môi trường của task.

Do Next.js đóng các biến `NEXT_PUBLIC_*` vào bundle, **đổi cờ, browser key hoặc Map ID phải build và deploy lại**; khi chạy dev thì restart. Server và browser dùng cùng biểu thức cấu hình công khai ở build. Không hot-switch qua Admin hoặc tài khoản người dùng. Không sửa riêng runtime env của một image đã build rồi kỳ vọng browser tự đổi.

Chọn Google nhưng thiếu key/Map ID, bị từ chối quyền, hết quota hoặc timeout vẫn là Google unavailable; không chuyển ngầm sang Stadia. Ô tô dùng DRIVE, xe máy dùng TWO_WHEELER, không đổi mode để né lỗi. Giữ timeout routing tối đa 10 giây; origin Google có ngân sách 4 giây, tối đa 5 kết quả và kiểm tra coverage Việt Nam.

## Chuẩn bị Local, Preview và Production

1. Trên Google Cloud project được phép sử dụng, cấu hình billing và bật Maps JavaScript API, Routes API, Places API (New). Việc tạo tài khoản/bật billing không được thực hiện bởi task code này.
2. Tạo browser key riêng và giới hạn API/referrers. Cho phép chính xác localhost/port dùng dev, hostname Preview được dùng để test và domain Production; không mặc nhiên coi mọi preview hostname đã được cấp quyền.
3. Tạo JavaScript Map ID phù hợp và cấu hình browser key/Map ID/cờ cho từng môi trường. Không dùng server key làm browser key.
4. Cấu hình server key riêng, hạn chế API theo Routes/Places và áp dụng biện pháp giới hạn phù hợp hosting. Giữ giá trị ngoài Git/log/tài liệu. Không yêu cầu operator dán key vào chat.
5. Giữ Stadia property/domain authentication và scoped runtime credentials cho môi trường sẽ kiểm thử rollback; không xóa cấu hình vì Google đang bật.
6. Build/deploy lại với các biến tương ứng. Kiểm tra ngay trên hostname đó, không lấy kết quả localhost làm bằng chứng Production.

Home/Detail Google iframe và Google external-place search/Save đã có vẫn dùng Google theo hợp đồng riêng. Vì vậy chế độ Stadia không có nghĩa là toàn website không được phát bất kỳ request Google nào.

## Kiểm chứng hành vi

- Mỗi chế độ: Explore marker/popup, picker Admin, picker origin/manual in-trip, route map từng ngày/toàn chuyến, chọn điểm, fit bounds và light/dark. Google color scheme chỉ đặt được khi khởi tạo nên đổi theme tạo map mới nhưng giữ camera/selection; cleanup gỡ marker/overlay/listener.
- Với Google: tìm một nơi xuất phát ngoài Hà Giang nhưng trong coverage Việt Nam; chọn và xác nhận, không tự chọn kết quả đầu tiên. Kiểm tra hủy/response cũ và fallback nhập tọa độ thủ công. Kết quả hiển thị attribution riêng theo nguồn.
- Tạo proposal cho CAR và MOTORCYCLE; kiểm tra đúng endpoint/mode, duration/distance/geometry thực, Validator và Save revalidation. Xem cả hội thoại, chỉnh sửa và in-trip. Không dùng AI hoặc đường thẳng để tạo bằng chứng tuyến.
- Save → mở lại → tắt cờ/rebuild → mở lại: dữ liệu trip và nguồn lịch sử không bị rewrite; đọc không gọi routing. Chỉ hành động hiện cần bằng chứng mới mới dùng provider đang chọn. Giữ SUCCESS/FAILED/UNKNOWN và cùng payload/key khi retry UNKNOWN.
- Kiểm tra Guest/member/non-member/owner: origin không xuất hiện trong public/member projection; Admin không có private-trip bypass.
- Sai browser key/Map ID, server key, unauthorized, quota, timeout, malformed response: hiển thị unavailable/insufficient tương ứng, không tự gọi provider kia. Nội dung ngoài bản đồ vẫn dùng được.
- Network panel của consumer được chuyển không gọi SDK/API provider đang tắt. Ngoại lệ iframe/Places hiện có được nhận diện riêng. Xác nhận tiles/marker thật hiển thị; load event hoặc mock pass không đủ để nghiệm thu live.
- Scan browser bundle/response/log: browser key công khai có thể xuất hiện, server key phải vắng mặt.

## Dữ liệu cũ và rollback

Origin source là trường trong JSON snapshot, không phải Prisma enum. Thêm `STADIA`/`GOOGLE_PLACES` vào contract, giữ `MANUAL`/`NOMINATIM` để đọc lịch sử; không cần schema/migration mới. Không backfill các giá trị NOMINATIM cũ vì không chứng minh được provider gốc từng record.

Save giữ nguồn route thật; đọc chuyến lấy transfer evidence từ snapshot khớp fingerprint của lịch trình, không route lại trên page read. Snapshot cũ không có fingerprint khớp/không có geometry vẫn đọc được lịch trình nhưng không được dựng tuyến giả. Journey origin chỉ gửi owner; member chỉ có thể nhận transfer attraction-to-attraction từ snapshot phù hợp.

Các view trước đây tự dựng đường thẳng với 30 phút/15 km và nhãn VERIFIED/Stadia nay trả thiếu bằng chứng, không coi đó là dữ liệu provider. Public companion summary không có route evidence thì bản đồ chỉ có điểm, không tự thêm DTO giờ/route riêng tư hoặc gọi routing khi đọc.

Khi chọn Stadia, geometry do Google Routes cung cấp không được vẽ trên basemap Stadia; vẫn giữ metadata/lịch trình đã lưu và hiện thiếu hình tuyến. Ghim origin lấy từ Google Places cũng không được đưa lên Stadia; giữ form/text đã lưu và cho người dùng lựa chọn thủ công mới qua thao tác hiện có. Rollback bằng cờ trên phiên bản hỗ trợ cả hai provider; không bảo đảm một binary cũ hiểu source mới.

## Nguồn Google đã kiểm tra và giới hạn live

Đọc tài liệu Google chính thức ngày 2026-11-18:

- [TWO_WHEELER coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled?hl=en): có Việt Nam. [Two-wheeler guide](https://developers.google.com/maps/documentation/routes/route_two_wheel): beta và cần cảnh báo người dùng; UI có ghi chú này, không thay quyết định Validator.
- [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker): cần marker library và Map ID. [Map options](https://developers.google.com/maps/documentation/javascript/reference/map#MapOptions.colorScheme): colorScheme chỉ đặt lúc khởi tạo.
- [Routes policies](https://developers.google.com/maps/documentation/routes/policies) và [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies): nội dung Google hiển thị trên bản đồ phải ở Google Map; attribution và giới hạn caching/storage áp dụng.

**Live gate còn mở:** local chưa có Google server key/browser key/Map ID nên chưa gọi Google thật hoặc chứng nhận billing/quota/domain authorization. Chính sách retention của dữ liệu Google được giữ trong trip JSON và các external-place cache đã tồn tại cần được operator kiểm tra theo agreement hiện hành trước triển khai live; việc giữ snapshot theo nghiệp vụ không đồng nghĩa được Google cho phép lưu vô thời hạn. Không bổ sung cleanup job hoặc viết lại dữ liệu cũ trong scope provider switch. Public Terms/Privacy của ứng dụng cũng cần đáp ứng điều kiện của API khi đưa vào sử dụng live.

Evidence automated/build/full-suite/review được ghi trong story và progress; không dùng kết quả giả lập thay thế nghiệm thu dịch vụ thật.

# Google Maps iframe cho thẻ bản đồ landing page

Ngày nghiên cứu: 2026-10-25

## Kết quả

- Google Maps Help hướng dẫn tạo iframe bằng cách mở **Share or embed map → Embed a map → Copy HTML**. Đây là đường dẫn được Google hướng dẫn cho việc nhúng bản đồ qua giao diện Maps. Tài liệu trợ giúp này không mô tả chi tiết cú pháp `maps.google.com/maps?q=...&output=embed` hoặc cam kết rằng URL tự dựng này là API được hỗ trợ ổn định. Vì vậy, không nên coi URL query legacy trong ví dụ là hợp đồng chính thức nếu độ ổn định lâu dài là yêu cầu. [Google Maps Help: Share, send, or print directions](https://support.google.com/maps/answer/7101463)
- Google Maps Platform **Maps Embed API** hiện được tài liệu hóa với URL dạng `https://www.google.com/maps/embed/v1/{mode}?key=...`; API này miễn phí sử dụng theo trang billing, nhưng mọi request vẫn cần API key và project billing được bật. Vì vậy, tuyên bố “Maps Embed API không cần key” là không đúng. [Embed a map](https://developers.google.com/maps/documentation/embed/embedding-map), [Usage and Billing](https://developers.google.com/maps/documentation/embed/usage-and-billing), [Quickstart](https://developers.google.com/maps/documentation/embed/quickstart)
- URL **Google Maps URLs** cho nút mở chỉ đường là lựa chọn chính thức không cần API key. Cú pháp directions là `https://www.google.com/maps/dir/?api=1&destination=...`; `api=1` là bắt buộc, URL cần encode đúng, và destination có thể là địa danh/địa chỉ hoặc tọa độ. [Google Maps URLs: Get Started](https://developers.google.com/maps/documentation/urls/get-started)
- `referrerPolicy="no-referrer-when-downgrade"` không nên dùng cho Maps Embed API có key: tài liệu Google khuyến nghị `strict-origin-when-cross-origin`; policy legacy có thể gửi toàn bộ URL trang trong Referer. Nếu dùng iframe “Embed a map” tạo từ Google Maps UI, cần kiểm tra thuộc tính và URL HTML Google thực sự sinh ra thay vì mặc định áp dụng cấu hình của API khác. [Embed a map](https://developers.google.com/maps/documentation/embed/embedding-map)

## Đánh giá đề xuất

Đoạn `mapsEmbedUrl(location)` dùng endpoint `maps.google.com/maps?q=...&z=16&output=embed` có thể hoạt động như cách nhúng legacy, nhưng tài liệu developer hiện tại được khảo sát không xác nhận endpoint/cú pháp này. Tài liệu Google xác nhận riêng hai lựa chọn: iframe HTML lấy từ chức năng **Embed a map** trong Google Maps; hoặc Maps Embed API hiện hành có API key. Nên kiểm chứng trực tiếp URL legacy trên môi trường mục tiêu nếu vẫn chọn nó, và ghi nhận đây là phụ thuộc tương thích không được tài liệu API hiện hành bảo đảm.

URL chỉ đường `maps/dir/?api=1&destination=...` phù hợp với tài liệu Maps URLs và không cần API key. Có thể dùng `target="_blank"` cùng `rel="noopener noreferrer"` khi mở tab mới.

## Kế hoạch đã chốt

Các quyết định được người dùng xác nhận trong phiên lập kế hoạch:

- Thay phần bản đồ tương tác trên Home bằng Google iframe và giữ danh sách 9 điểm thành một vùng riêng bên cạnh/bên dưới.
- Chấp nhận dùng URL iframe legacy không API key, đồng thời chấp nhận đây là endpoint không được Google xác nhận hỗ trợ lâu dài.
- Bấm một điểm trong danh sách vẫn mở preview hiện tại (ảnh, mô tả, khu vực, loại điểm và nút xem chi tiết). Bản đồ iframe giữ nguyên vị trí Hà Giang, không pan theo điểm được chọn.
- Bản đồ hiển thị khu vực Hà Giang ở mức tổng quan gần với mức zoom 9 đang dùng; không dùng zoom 16 vì mức đó là cận thành phố/đường phố và không phù hợp với các điểm phân bố trên toàn vùng.
- Nút chỉ đường duy nhất dẫn tới thành phố Hà Giang.

### Phạm vi và hướng triển khai

1. Thay phần `DestinationMap` trong `HomeExploreMap` tại `apps/web/src/components/home-explore-map.tsx` bằng iframe Google Maps legacy có truy vấn rõ `Hà Giang, Việt Nam`, tâm bản đồ theo tọa độ Hà Giang đang có trong project (`22.8233, 104.9836`), và mức zoom tổng quan 9. Khu vực này được dùng trong section khám phá của Home; không có `landing.showLocation`, `eventType` hoặc `event.location` trong luồng Home hiện tại, nên không bê nguyên điều kiện của ví dụ trang sự kiện.
2. Render danh sách từ prop `destinations` hiện có, không hard-code đúng 9 phần tử. Dataset này đã được lọc thành điểm đến công khai và chứa tên, khu vực, loại, tọa độ cùng ảnh tùy chọn. Bố cục responsive: map và danh sách cạnh nhau khi đủ rộng, danh sách xuống dưới map trên màn hình nhỏ.
3. Dùng thao tác chọn danh sách để cập nhật `selectedId` và tái sử dụng preview hiện tại. Giữ CTA xem chi tiết hiện có. Không tuyên bố rằng chọn một item đã di chuyển map hoặc đặt pin lên iframe.
4. Thêm một link “Xem chỉ đường” tới `Thành phố Hà Giang, Việt Nam` bằng Google Maps URL `https://www.google.com/maps/dir/?api=1&destination=...`; encode destination và mở tab mới với `rel="noopener noreferrer"`. Origin được để trống để Google Maps có thể dùng vị trí người dùng hoặc cho nhập điểm xuất phát.
5. Iframe có `title` dễ hiểu, `loading="lazy"`, chiều rộng 100%, chiều cao đáp ứng CSS, viền bỏ, và `referrerPolicy="strict-origin-when-cross-origin"` để tránh gửi toàn bộ URL trang qua Referer. Tham số referrer này là hướng bảo vệ riêng tư; URL legacy không dùng API key để kiểm tra referrer.
6. Giữ nguyên điều kiện Home hiện tại: section dùng dữ liệu điểm đến public khi có; nhánh fallback Home hiện hữu không bị thay bằng event visibility rules. Không sửa Explore map, admin pin picker, destination detail map hay routing.

### Kiểm thử / chấp nhận khi triển khai

- Kiểm tra source/component: iframe query hướng tới Hà Giang và zoom tổng quan; không có API key hoặc routing key trong URL/client output.
- Kiểm tra danh sách render từ data đầu vào; chọn item mở preview đúng, nút đóng/Escape hoạt động, link xem chi tiết giữ nguyên.
- Kiểm tra link chỉ đường encode chính xác destination Hà Giang, có `api=1`, mở tab mới an toàn.
- Kiểm tra accessibility title/status/focus và bố cục ở mobile/desktop; chỉ có một iframe map trong section.
- Chạy test Home/landing liên quan và `git diff --check`; smoke browser thật trên môi trường mục tiêu để xác nhận legacy iframe render. Nếu legacy URL không render hoặc bị chặn, giữ danh sách và CTA dùng được, báo blocker cho owner; không tự chuyển sang API key, MapLibre/VietMap hay cơ chế fallback.

### Rủi ro đã chấp nhận

URL `maps.google.com/maps?q=...&output=embed` có thể hoạt động nhưng không có cam kết tương thích lâu dài trong tài liệu Google developer được khảo sát. Việc dùng no-key legacy là lựa chọn người dùng đã xác nhận; smoke test thật vẫn là điều kiện trước khi kết luận triển khai hoạt động. Embed API chính thức là phương án thay thế nếu sau này cần endpoint được tài liệu hóa, nhưng phương án đó cần API key và hiện không nằm trong quyết định đã chốt.

## Giới hạn nghiên cứu

Tài liệu chính thức hiện hành được khảo sát không xác nhận rõ URL `maps.google.com/maps?q=...&output=embed` là endpoint được hỗ trợ lâu dài, cũng không xác nhận quy tắc `no API key` cho chính endpoint tự dựng này. Không suy diễn từ việc URL hoạt động ở một thời điểm thành cam kết hỗ trợ chính thức.

## Kết quả triển khai — 2026-10-25

- `HomeExploreMap` đã dùng iframe Google Maps legacy với `q=Hà Giang, Việt Nam`, `ll=22.8233,104.9836`, `z=9`; không thêm API key. Danh sách lấy từ `destinations` công khai hiện có, chọn một mục mở lại preview/CTA chi tiết, đóng được bằng nút hoặc Escape. Một link chỉ đường dẫn tới thành phố Hà Giang.
- CSS Home hiển thị map và danh sách cạnh nhau ở desktop, xếp danh sách dưới map ở mobile. Không thay các bản đồ Explore, Destination detail, Admin hoặc routing.
- Browser local ở `localhost:3010`: Google iframe thực tế tải bản đồ; 1 iframe, 0 canvas và 9 mục theo dữ liệu hiện có. Preview, Escape, URL chỉ đường, bố cục 566px/1280px và không tràn ngang đã được kiểm tra. Không có API key trong iframe URL hoặc link chỉ đường.
- Typecheck `tsc --noEmit --project apps/web/tsconfig.json` đạt; Home focused Vitest đạt 3/3; `git diff --check` đạt. Full Vitest: 2705 đạt, 22 lỗi trong các suite khác, 104 skipped, 1 todo. Build production riêng đã khởi chạy nhưng không hoàn tất sau vài phút ở bước `Creating an optimized production build` và được dừng; chưa có kết luận build PASS.

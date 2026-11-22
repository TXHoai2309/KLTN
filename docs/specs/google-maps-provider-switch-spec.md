# Spec: Google Maps với cờ chuyển lại Stadia

Ngày: 2026-11-18 (Asia/Saigon).

Trạng thái: phạm vi sản phẩm được chủ dự án xác nhận qua Q1–Q7 và bản tổng hợp; phạm vi kiểm thử được xác nhận trong bước to-spec. Đây là đặc tả, chưa phải bằng chứng triển khai hoặc nghiệm thu. Chưa đăng issue và chưa gắn nhãn `ready-for-agent`: repository chưa cung cấp cấu hình issue tracker/triage cho skill.

Cập nhật thực thi 2026-11-18: chủ dự án yêu cầu implement toàn bộ bộ chia tám ticket tiếp theo. Đã chuyển sang local issues theo tiền lệ dự án, code local/verification đang hoàn tất. Xem [story](../stories/MAPS-PROVIDER-SWITCH.md), [ticket plan](../implementation/google-maps-provider-switch-tickets-plan.md) và [runbook](../implementation/google-maps-provider-switch-runbook.md) để biết hiện trạng; đoạn trạng thái ban đầu ở trên là lịch sử bước to-spec, không phải hiện trạng delivery. Nghiệp vụ và scope đã duyệt bên dưới giữ nguyên.

## Problem Statement

Dự án cần dùng Google Maps theo yêu cầu của chủ dự án. Người dùng cần tiếp tục xem bản đồ, chọn nơi xuất phát và lập hành trình bằng các thao tác hiện có, trong khi người vận hành cần có thể chuyển lại Stadia bằng cấu hình. Mục tiêu là đáp ứng yêu cầu nhà cung cấp, không phải khẳng định Google chính xác hơn khi chưa có bằng chứng thực tế.

Hiện trạng chưa đáp ứng việc chuyển đồng bộ: MapLibre tải bản đồ nền Stadia; tìm nơi xuất phát gọi Stadia Geocoding; routing đã có Google adapter nhưng cờ hiện tại chỉ điều khiển routing. Một số dữ liệu tuyến vẫn bị gán cứng nguồn Stadia. Vì vậy chỉ bật cờ routing chưa chuyển được toàn bộ các phụ thuộc Stadia thuộc phạm vi này.

Google Places tìm địa điểm ngoài danh mục và Place Details khi Save đã tồn tại. Home/Chi tiết điểm đến đã có Google iframe. Các tích hợp này không được mô tả là tính năng mới của lần chuyển đổi.

## Solution

Cung cấp một lựa chọn nhà cung cấp dùng chung cho các chức năng hiện sử dụng Stadia: bản đồ tương tác, tuyến đường/thời gian/quãng đường và tìm nơi xuất phát. Khi bật Google, các chức năng đó dùng Google Maps JavaScript API, Routes API và Places API. Khi tắt, chúng dùng lại Stadia và MapLibre hiện có.

Cờ là cấu hình môi trường cho toàn website, không phải tùy chọn từng người dùng hoặc nút Admin. Thay đổi cần khởi động/deploy lại; nếu cấu hình trình duyệt được đóng tại build time thì phải build lại. Trình duyệt và server phải nhận cùng lựa chọn từ một nguồn cấu hình.

Giữ nguyên nghiệp vụ, các thao tác giao diện, quyền truy cập và dữ liệu chuyến đi đã lưu. Không tự chuyển nhà cung cấp khi gặp lỗi. Không tự tính lại hoặc ghi đè lịch trình khi đổi cờ. Tính năng Google Places ngoài danh mục đã có tiếp tục hoạt động theo hợp đồng hiện hành, kể cả khi cờ chọn Stadia.

## User Stories

1. As a project owner, I want the existing Stadia-dependent features to support Google Maps, so that the project meets its provider requirement.
2. As an operator, I want one environment-controlled provider selection, so that browser maps, routing and origin search switch together.
3. As an operator, I want to turn Google off and use Stadia again, so that I can roll back without removing either integration.
4. As an operator, I want provider changes to take effect through restart/redeployment, so that the active deployment has a consistent configuration.
5. As a Guest, I want public interactive destination maps to use the selected provider, so that discovery continues to work.
6. As a Traveler, I want destination markers and their existing information to remain usable, so that switching providers does not remove map interactions.
7. As a Traveler, I want daily and whole-trip routes to remain visible, so that I can understand my itinerary proposal.
8. As a Traveler, I want the map to preserve existing viewport and theme behavior, so that it remains usable across supported screens and themes.
9. As an Admin, I want the destination coordinate picker to work with the selected provider, so that I can maintain destination locations.
10. As a Traveler, I want origin and manual-pin pickers to remain usable, so that I can choose and confirm my trip origin.
11. As a Traveler, I want origin suggestions across the currently supported Vietnam coverage, so that I can start outside Hà Giang.
12. As a Traveler, I want to review and confirm a suggested origin, so that a search result does not silently become my chosen origin.
13. As a Traveler, I want stale search results to be ignored, so that an older query cannot overwrite my current choice.
14. As a Traveler, I want motorcycle routing to remain distinct from car routing, so that travel evidence matches my selected transport.
15. As a Traveler, I want travel duration and distance from the selected provider, so that the existing scheduler and Constraint Validator use actual route evidence.
16. As a Traveler, I want missing or failed route evidence to remain explicitly insufficient, so that an unavailable service cannot produce a false PASS.
17. As a Traveler, I want map failures to preserve the surrounding list and itinerary content, so that I can still use the page.
18. As an operator, I want Google errors to remain visible without silent Stadia fallback, so that I know which provider the deployment actually uses.
19. As a trip owner, I want existing saved itineraries to remain unchanged when the flag changes, so that an operational switch does not rewrite my trip.
20. As a trip owner, I want a new validation, edit or save that requires fresh routes to use the active provider, so that current operations use current configuration.
21. As a trip owner, I want saving to retain explicit confirmation and the existing idempotency contract, so that retries do not create duplicate or falsely successful writes.
22. As a trip owner, I want precise origin data to retain its existing privacy rules, so that changing map providers does not expose it publicly.
23. As a trip member, I want itinerary and route views to retain existing membership permissions, so that the switch does not broaden access.
24. As an operator, I want new routing and origin evidence to identify its actual source, so that Google and Stadia data are not mislabeled.
25. As an operator, I want browser and server Google credentials to be separate, so that private routing and search credentials remain server-side.
26. As an operator, I want the inactive provider to remain uncalled by switched features, so that provider selection has a predictable effect.
27. As a Traveler, I want existing external-place search and save behavior to remain available, so that the provider switch does not disable unrelated Google integrations.
28. As a maintainer, I want automated checks for both configurations and live smoke-test evidence, so that Google delivery and Stadia rollback can be assessed separately.

## Implementation Decisions

### Phạm vi và chọn nhà cung cấp

- Một quyết định cấu hình chung điều khiển rendering, routing và origin search. Chỉ có hai chế độ Google và Stadia, không hỗ trợ phối hợp tùy ý giữa ba chức năng.
- Ngữ nghĩa bật/tắt đã chốt; tên biến môi trường mới chưa được chốt trong phỏng vấn. Khi triển khai, ưu tiên mở rộng/thay thế bộ chọn routing hiện có bằng cấu hình chung; không giữ hai cờ có thể mâu thuẫn. Tài liệu phải chỉ rõ cách chuyển từ cấu hình routing cũ.
- Cấu hình không bật Google giữ mặc định Stadia để tương thích triển khai cũ. Bản triển khai dùng Google phải bật rõ ràng sau khi cấu hình đầy đủ dịch vụ.
- Bật Google nhưng thiếu key vẫn là chế độ Google và trả unavailable tương ứng; không coi đó là yêu cầu tắt cờ.
- Không cung cấp API hoặc UI để người dùng/Admin đổi nhà cung cấp lúc chạy. Không tự chuyển sang nhà cung cấp kia khi lỗi, hết quota, timeout hoặc không hỗ trợ phương tiện.
- Các màn hình hiện dùng Stadia phải cùng đi qua lựa chọn chung: Explore, các bản đồ hành trình/ngày/toàn chuyến, bản đồ trong các luồng chỉnh sửa/đang đi/đồng hành có dùng chung renderer, picker nơi xuất phát và picker tọa độ Admin.
- Google iframe đã có trên Home/Chi tiết điểm đến không phải phụ thuộc Stadia; không thiết kế lại các khối này trong lần chuyển đổi. Tắt cờ không có nghĩa là loại bỏ mọi Google request của website: iframe và tính năng Places ngoài danh mục đã tồn tại tiếp tục giữ hợp đồng riêng.

### Rendering và giao diện

- Có chung hợp đồng ứng dụng cho marker, popup/thông tin điểm, viewport, chọn tọa độ, route geometry, theme và lifecycle. Giữ cách dùng ở các màn hình; thay adapter phía dưới thay vì nhân đôi nghiệp vụ ở từng màn hình.
- Google dùng Maps JavaScript API; Stadia tiếp tục dùng MapLibre và các style/domain-auth hiện hành. Không dùng tile Google trong MapLibre như một lối thay thế Maps JavaScript API.
- Chỉ khởi tạo SDK/renderer của chế độ đang bật tại các bề mặt được chuyển đổi. Không khởi tạo cả hai rồi ẩn một bên.
- Giữ các trạng thái loading, unavailable, retry, no-coordinate và nội dung ngoài bản đồ. Dọn listener/marker/overlay/instance khi unmount, retry hoặc thay đổi dữ liệu cần tái khởi tạo; theme không làm mất tuyến/marker đang hiển thị.
- Giữ khả năng tiếp cận, thao tác trên màn hình nhỏ và attribution bắt buộc của nhà cung cấp. Không yêu cầu giao diện Google giống từng pixel với Stadia.
- Geometry chỉ để trình bày tuyến đã có bằng chứng; không tự tạo PASS hoặc làm thay đổi quyết định Validator.

### Routing và Constraint Validator

- Tái sử dụng Google Routes adapter đã có và bộ điều phối routing dùng chung. Các luồng Planner, hội thoại lập hành trình, Save, chỉnh sửa thường/AI, chặng đi/về và hỗ trợ khi đang đi đều phải dùng cùng bộ chọn.
- Ô tô dùng Google DRIVE; xe máy dùng TWO_WHEELER. Không đổi xe máy thành ô tô để né lỗi dịch vụ.
- Chuẩn hóa duration theo giây, distance theo mét và geometry theo hợp đồng tọa độ hiện có. Các consumer vẫn giữ yêu cầu dữ liệu riêng: không siết một luồng trước đây chỉ cần duration thành bắt buộc distance ngoài phạm vi nghiệp vụ đã duyệt.
- Giữ timeout routing tối đa 10 giây, ngân sách số cặp và mức song song hiện có. Không thêm retry/caching hoặc tính thời gian bằng khoảng cách thẳng/AI.
- AI chỉ đề xuất và diễn đạt. Scheduler/Constraint Validator tiếp tục quyết định tất định; thiếu bằng chứng bắt buộc vẫn là INSUFFICIENT_DATA, không phải PASS.
- Không thay đổi xử lý opening hours, minimum stay, nghỉ dọc đường, đi/về cùng nơi xuất phát, xác nhận hay cơ chế Save có mục chưa kiểm đã có. Không mở rộng điều kiện được lưu dưới danh nghĩa chuyển provider.

### Tìm nơi xuất phát

- Origin search dùng adapter theo cờ chung: Google Places khi bật và Stadia Geocoding khi tắt. Có thể dùng adapter Places hiện có làm nền kỹ thuật, nhưng không tái sử dụng nguyên giới hạn chỉ Hà Giang của tìm địa điểm ngoài danh mục.
- Giữ phạm vi Việt Nam và kiểm tra coverage hiện có, ngôn ngữ Việt, tối đa năm gợi ý và ngân sách phản hồi tìm kiếm hiện tại. Kết quả phải có tên/tọa độ hợp lệ trước khi được chọn làm nơi xuất phát; nếu API trả dự đoán chưa có tọa độ thì phải resolve trước khi xác nhận.
- Giữ các trạng thái có kết quả, không có kết quả và tạm không khả dụng; hủy/bỏ qua response của truy vấn cũ. Không coi lỗi dịch vụ là không có địa điểm.
- Không tự chọn kết quả đầu tiên. Chọn pin thủ công và bước xác nhận nơi xuất phát tiếp tục có hiệu lực.
- Không bổ sung cache tìm kiếm hoặc hệ thống rate-limit mới chỉ vì đổi nhà cung cấp. Tuân thủ các giới hạn truy cập hiện có.

### Dữ liệu, API và quyền

- Giữ các DTO/envelope công khai và lỗi nghiệp vụ hiện có ở mức có thể; chuẩn hóa khác biệt Google/Stadia tại adapter. Route Handler vẫn mỏng, ownership và business rules ở module/service.
- Bỏ các chỗ gán cứng nguồn Stadia khi tạo bằng chứng Google; mọi projection mới, kể cả đồng hành, phải giữ đúng provenance hoặc trạng thái không biết nếu không có nguồn.
- Đọc được dữ liệu lịch sử và không suy diễn nguồn lịch sử bằng cờ đang bật. Không gán nhãn lại toàn bộ dữ liệu cũ: origin search Stadia hiện từng lưu nhãn NOMINATIM nên không thể khôi phục nguồn chính xác chỉ bằng đổi chuỗi.
- Nếu enum nguồn xuất phát cần thêm giá trị để biểu diễn Google/Stadia, dùng Prisma migration cộng thêm và cập nhật validation/reader tương thích. Không dùng db:push, xóa enum cũ hoặc rewrite hàng loạt chuyến đi. Migration chỉ thay đổi khả năng biểu diễn, không thay nghiệp vụ.
- Tắt cờ sau khi đã có dữ liệu Google vẫn đọc được chuyến đi. Không rollback schema bằng cách xóa giá trị Google. Rollback bằng cờ áp dụng trên phiên bản code đã hỗ trợ cả hai nguồn; không mặc nhiên bảo đảm một bản binary cũ sẽ đọc được enum mới.
- Chỉ những thao tác hiện cần route mới mới gọi nhà cung cấp đang chọn. Đổi cờ/đọc chuyến đi không tự revalidate, lưu lại hoặc thay lịch trình. Bằng chứng lịch sử không được trình bày thành kết quả kiểm tra mới.
- Giữ phân quyền Guest/Traveler/Admin, ownership, membership và giới hạn công khai tọa độ nơi xuất phát. Admin không có quyền đọc chuyến riêng của người khác.
- Save/Edit tiếp tục dùng SUCCESS/FAILED/UNKNOWN và idempotency hiện hành. UNKNOWN retry dùng cùng payload/key; không báo thành công trước khi DB xác nhận. HTTP provider không chạy trong transaction ghi DB.

### Cấu hình và vận hành

- Hai Google key riêng: browser key được phép công khai nhưng giới hạn domain/API; server key giữ kín cho Routes/Places. Server key không đi qua NEXT_PUBLIC, bundle, response, log hoặc tài liệu.
- Cấu hình browser/server phải được mô tả rõ cho Local/Preview/Production, bao gồm billing, bật Maps JavaScript/Routes/Places, domain/API restrictions và yêu cầu Map ID nếu cách dùng marker cần nó.
- Giữ Stadia credentials, runtime override đã có và domain authentication để quay lại bằng cờ. Không tự xóa cấu hình của provider đang tắt.
- Google dùng cấu hình môi trường cho lần chuyển đổi này; không tự thêm tính năng quản lý Google key trong Admin Settings. Admin Settings hiện quản lý Stadia vẫn là cấu hình Stadia, không được đổi nhãn thành Google khi nguồn thực tế chưa đổi.
- Khi triển khai, cập nhật tài liệu và quyết định provider hiện hành để ghi rõ phạm vi thay thế các lựa chọn cũ, bao gồm các ADR Stadia/VietMap và ngoại lệ browser-key. Giữ ADR và bằng chứng cũ như lịch sử, không sửa thành đã dùng Google từ trước.

## Testing Decisions

Phạm vi dưới đây được chủ dự án xác nhận ngày 2026-11-18. Test quan sát hành vi ở ranh giới cao nhất hiện có; không kiểm tra tên hàm, cấu trúc file hoặc chi tiết SDK không ảnh hưởng hợp đồng người dùng.

### Ranh giới kiểm thử

- Trục tích hợp chính: dịch vụ/API hiện có của origin search và Planner → Validator → Save/Edit. Inject/mock HTTP tại ranh giới nhà cung cấp đã có; tránh tạo seam ở mọi lớp. Cùng một bộ tình huống nghiệp vụ chạy với Google và Stadia.
- Bản đồ là hành vi trình duyệt riêng: kiểm qua renderer/picker contract hiện có và smoke test màn hình thật. Không thể dùng riêng test backend làm bằng chứng Google Maps hiển thị đúng.
- Unit test nhỏ chỉ dành cho chuyển đổi có rủi ro như tọa độ, polyline, đơn vị, mode và provenance; ưu tiên mở rộng test hiện có.
- Prior art: bộ test Planner Google/Stadia, route geometry và provider environment; origin search/client và journey planner/save; map, location picker, itinerary renderer; Trip Save/Edit/Read và companion projections. Các bộ này đã có HTTP injection/fake database phù hợp để tái sử dụng.

### Tiêu chí nghiệm thu

1. **Chọn đồng bộ:** bật Google thì mọi chức năng Stadia trong phạm vi dùng Google; tắt thì dùng Stadia. Kiểm tra browser và server cùng chế độ sau rebuild/restart/deploy đúng hướng dẫn.
2. **Không gọi nhầm:** ở chế độ Google, các chức năng đã chuyển không gọi Stadia; ở chế độ Stadia, chúng không gọi Google thay thế. Loại trừ rõ Google iframe/Places ngoài danh mục đã tồn tại khỏi assertion này.
3. **Lỗi không fallback:** missing key, unauthorized, quota, timeout, lỗi mạng, response sai hoặc no route chỉ trả kết quả lỗi tương ứng của provider đang chọn; không phát request sang provider kia.
4. **Rendering:** marker, popup, fit bounds, tuyến từng ngày/toàn chuyến, theme, retry và cleanup vẫn làm việc trên các màn hình/picker đại diện cho từng consumer, không đảo lat/lng hoặc tạo instance chồng nhau.
5. **Nội dung khi lỗi:** SDK/map lỗi hoặc thiếu tọa độ không làm mất list/chi tiết/lịch trình; attribution hiển thị đúng. Test browser phải xác nhận tiles/marker thật, không chỉ dựa vào load event.
6. **Origin:** tìm nơi xuất phát trong coverage Việt Nam gồm một ví dụ ngoài Hà Giang; tối đa năm kết quả hợp lệ, response cũ không ghi đè response mới, không tự xác nhận, manual pin vẫn dùng được. Phân biệt no results với unavailable.
7. **Phương tiện:** ô tô và xe máy đi đúng profile; xe máy lỗi/không hỗ trợ không sinh request DRIVE thay thế.
8. **Validator:** duration/distance được chuẩn hóa đúng; route thiếu/không hợp lệ không tạo PASS; các kiểm tra giờ mở cửa, thời lượng tham quan và nghỉ dọc đường giữ nguyên với cùng bằng chứng giả lập.
9. **Mọi luồng route:** proposal, hội thoại, Save revalidation, Edit thường/AI, chặng đi/về và in-trip đều dùng lựa chọn chung; không còn Save hoặc companion projection gán cứng Stadia cho bằng chứng Google.
10. **Dữ liệu cũ/rollback:** snapshot chuyến đi trước và sau đổi cờ không bị ghi lại; đọc được dữ liệu lịch sử và cả dữ liệu Google sau khi tắt cờ; lần thao tác cần kiểm tra mới dùng provider đang bật.
11. **Quyền và ghi:** request không có quyền/non-owner vẫn bị chặn; tọa độ origin không lọt projection công khai; các ca SUCCESS, FAILED và retry UNKNOWN giữ hợp đồng idempotency, không tạo chuyến trùng.
12. **Secrets:** bundle chỉ chứa browser key được cho phép; không chứa server key. Kiểm tra response/log và diff không rò credential thật.
13. **Schema nếu có:** Prisma validate/generate, migration status và thử migration trên DB thử nghiệm dùng riêng; enum/contract mới không phá reader cũ trong phiên bản hai-provider. Không áp migration lên shared DB như một phần mặc định của việc viết spec.
14. **Google live:** với billing/API/key hợp lệ, smoke test Google Maps JavaScript, Routes CAR/TWO_WHEELER và Places origin; ghi riêng bằng chứng từng API. Tắt cờ và smoke test Stadia bằng cấu hình được giữ lại.
15. **Kiểm tra dự án:** chạy typecheck/build và các test liên quan, git diff --check; so sánh lỗi nền nếu có, nêu rõ test/live check chưa chạy. Mock pass không đồng nghĩa đã nghiệm thu dịch vụ thật.

### Điều kiện hoàn tất

Không yêu cầu hai nhà cung cấp trả cùng tuyến, thời gian hay số mét. Yêu cầu cùng hợp đồng ứng dụng và cùng quy tắc nghiệp vụ khi nhận cùng bằng chứng. Nghiệm thu Google thật cần cấu hình Cloud hoạt động; kiểm thử rollback cần cấu hình Stadia hoạt động. Ghi riêng implemented, automated verification và live acceptance.

## Out of Scope

- Đổi nghiệp vụ lập lịch, quyền, điều kiện Save, quy tắc mục chưa kiểm hoặc phạm vi địa lý sản phẩm.
- Thay thế Google Places ngoài danh mục bằng Stadia khi tắt cờ; chuyển web search/Firecrawl/AI provider.
- Thiết kế lại UI, tính năng điều hướng từng chặng, traffic optimization, booking hoặc phương tiện mới.
- Nút Admin, cờ theo người dùng, A/B testing hoặc hot-switch giữa phiên đang chạy.
- Tự động fallback, retry/caching mới hoặc ước lượng route để né dữ liệu thiếu.
- Recompute/backfill hàng loạt chuyến cũ; xóa Stadia, dữ liệu nguồn cũ hoặc bí mật cấu hình rollback.
- Mở rộng Admin credential management cho Google, tạo tài khoản Cloud, bật billing, mua quota hoặc deploy production như một phần của yêu cầu viết spec.
- Cam kết Google luôn chính xác hơn Stadia hoặc có kết quả giống Stadia.

## Further Notes

- Nguồn quyết định: Q1 yêu cầu phải dùng Google; Q2 chỉ đổi provider và giữ nghiệp vụ; Q3 cờ chung cho bản đồ/routing/origin, giữ Places hiện có; Q4 cờ môi trường; Q5 không fallback; Q6 giữ chuyến cũ và dùng provider hiện hành khi cần bằng chứng mới; Q7 Maps JavaScript/Routes/Places, hai key riêng và giữ Stadia. Chủ dự án xác nhận bản tổng hợp rồi yêu cầu xuất spec; chưa có code được sửa trong bước này.
- Tài liệu nền: [source baselines](../source-baselines.md), [product contract](../product/product-spec.md), [technical architecture](../architecture/technical-architecture.md), [user flows](../flow/user-flow.md), [decisions](../decisions.md), [origin/return story](../stories/TRIP-ORIGIN-ROUND-TRIP.md), [TripSage port story](../stories/TRIPSAGE-CHAT-ITINERARY-PORT.md). Dùng thuật ngữ Trip origin, itinerary proposal, saved itinerary và trip save confirmation theo glossary của dự án.
- Origin/return và các tính năng TripSage có trạng thái nghiệm thu riêng; spec provider không chứng nhận các story đó đã hoàn tất. Những đoạn tài liệu cũ nói chưa có Trip/Google adapter không thay thế hiện trạng code đã kiểm tra.
- Google Maps JavaScript từng bị Permission Denied trong lịch sử; đó không phải bằng chứng key hiện tại hoạt động hay không hoạt động. Kiểm tra cấu hình hiện hành bằng smoke test, không tái sử dụng kết luận cũ.
- Trước triển khai live, kiểm tra tài liệu Google chính thức về hỗ trợ TWO_WHEELER ở Việt Nam, quyền hiển thị/lưu geometry/Places và attribution. Đặc biệt, đọc trip chứa dữ liệu Google khi chọn bản đồ Stadia không tự cho phép hiển thị nội dung Google trên basemap khác; nếu có hạn chế, giữ lịch trình đọc được và dùng trạng thái unavailable cho lớp nội dung bị hạn chế thay vì gọi ngầm provider khác hoặc viết lại trip. Không tuyên bố tuân thủ hoặc tương thích live khi chưa xác minh.
- Tên cờ, cách truyền cấu hình an toàn cho browser và migration nguồn cụ thể là chi tiết triển khai cần ghi lại, không phải quyết định sản phẩm đã được phỏng vấn. Bắt buộc bảo toàn ngữ nghĩa và giới hạn trong spec.
- Chưa có tracker/triage setup. Chạy `/setup-matt-pocock-skills` trước bước đăng issue theo skill to-spec; sau khi có đích rõ ràng, xuất nguyên đặc tả và gắn `ready-for-agent`. Không suy đoán remote Git là tracker được chọn và không tự tạo label hay issue ở một đích chưa được cấu hình.

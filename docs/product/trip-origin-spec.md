# Spec — Nơi xuất phát và lịch trình đi/về Hà Giang

**Trạng thái: SPEC / PLAN ONLY — 2026-11-03.** Tổng hợp Q1–Q22 đã chốt; người dùng đã đồng ý ranh giới kiểm thử mô tả bên dưới. Chưa triển khai. Duyệt spec không phải lệnh code, chạy migration, đăng issue hoặc deploy. Chỉ bắt đầu code khi người dùng yêu cầu rõ ràng.

## Problem Statement

Người dùng chưa chọn được nơi xuất phát khi lập hành trình. Lịch có thể bắt đầu lúc 08:00 ngay tại điểm tham quan đầu tiên dù họ đang ở Hà Nội hoặc một địa điểm khác. Chặng đi đến Hà Giang và chặng quay về chưa được tính, dẫn đến ngày đầu xếp quá nhiều điểm, ngày cuối không đủ thời gian về hoặc tổng số ngày không phản ánh chuyến đi thực tế.

Người dùng cần biết lịch có phù hợp từ lúc bắt đầu đến khi quay về hay không, bao gồm nghỉ dọc đường. Họ không nên phải tự tính thời gian nghỉ, tự sửa giờ của từng điểm để bù chặng đi/về hoặc cung cấp vị trí riêng tư cho người tham gia đồng hành.

## Solution

Cho Traveler/Admin chọn nơi xuất phát thực tế trong Việt Nam, xác nhận ghim và nhập giờ đi cùng hạn về. Tổng số ngày bao gồm di chuyển hai chiều, nghỉ dự kiến và tham quan Hà Giang. Một phương tiện ô tô hoặc xe máy áp dụng xuyên suốt chuyến.

Form và Assistant V2 dùng cùng khả năng tìm/chọn nơi xuất phát và cùng bộ tính lịch. MapLibre hiển thị bản đồ; Nominatim tìm địa điểm khi người dùng bấm Tìm; Stadia tiếp tục tính đường phía server. Khi không tìm được tên, người dùng vẫn chọn ghim hoặc nhập tọa độ thủ công.

Hệ thống tự cộng nghỉ dự kiến, đặt thời gian tham quan theo các ràng buộc hiện hành và tính chặng về trước hạn đã chọn. Nếu thiếu dữ liệu thì nêu chưa đủ dữ liệu; nếu lịch vượt thời gian đã chọn thì trình bày phương án chưa khả thi và gợi ý điều chỉnh. Chỉ lưu chính thức khi đủ điều kiện, người dùng xác nhận và database xác nhận ghi thành công.

Ví dụ: “3 ngày từ Hà Nội, đi 06:00, về trước 21:00 ngày cuối” phải chứa toàn bộ hai chặng đi/về trong ba ngày; không được tự biến thành ba ngày tham quan cộng thêm ngày đi đường.

## User Stories

1. As a Traveler, I want to tìm nơi xuất phát bằng tên, so that tôi chọn được vị trí bắt đầu chuyến đi.
2. As a Traveler, I want to chỉ tìm khi bấm Tìm, so that tôi chủ động gửi truy vấn địa điểm.
3. As a Traveler, I want to chọn kết quả và xem ghim trên bản đồ, so that tôi kiểm tra được nơi đã chọn.
4. As a Traveler, I want to chỉnh ghim trước khi xác nhận, so that lịch dùng đúng vị trí xuất phát thực tế.
5. As a Traveler, I want to chọn ghim hoặc nhập tọa độ khi tìm kiếm lỗi, so that tôi vẫn tiếp tục lập kế hoạch.
6. As a Traveler, I want to biết vị trí chưa được xác nhận sau khi đổi dữ liệu lựa chọn, so that hệ thống không dùng nhầm nơi xuất phát cũ.
7. As a Traveler, I want to được báo khi nơi xuất phát ngoài Việt Nam hoặc chưa xác định được phạm vi, so that tôi biết giới hạn hỗ trợ.
8. As a Traveler, I want to nhập giờ khởi hành ngày đầu, so that thời gian đến Hà Giang được tính đúng.
9. As a Traveler, I want to nhập giờ muốn về tới nơi ngày cuối, so that lịch dành đủ thời gian quay về.
10. As a Traveler, I want to số ngày bao gồm cả đi và về, so that kế hoạch khớp thời gian tôi có.
11. As a Traveler, I want to dùng ô tô hoặc xe máy cho toàn chuyến, so that tuyến và thời gian phù hợp phương tiện tôi đã chọn.
12. As a Traveler, I want to xem riêng thời gian chạy xe và nghỉ dự kiến, so that tôi hiểu tổng thời gian di chuyển.
13. As a Traveler, I want to hệ thống tự tính nghỉ dọc đường, so that tôi không phải nhập hoặc tính khoảng nghỉ.
14. As a Traveler, I want to khoảng tham quan đủ dài được tính là ngắt quãng lái xe, so that lịch không cộng nghỉ trùng một cách máy móc.
15. As a Traveler, I want to lịch tính chặng từ nơi xuất phát tới điểm tham quan đầu tiên, so that ngày đầu không bắt đầu giả định tôi đã ở Hà Giang.
16. As a Traveler, I want to lịch tính chặng từ điểm cuối về nơi xuất phát, so that ngày cuối không bị xếp kín giờ tham quan.
17. As a Traveler, I want to một ngày có thể chứa cả đi, tham quan và về, so that chuyến ngắn vẫn được kiểm tra đầy đủ.
18. As a Traveler, I want to ngày đầu có thể chỉ đi đường, so that chuyến xa không bị ép có điểm tham quan trong ngày đầu.
19. As a Traveler, I want to ngày cuối có thể chỉ đi về, so that hệ thống dành trọn thời gian cho chặng về khi cần.
20. As a Traveler, I want to chọn giờ bắt đầu về cho ngày chỉ đi về, so that hệ thống không âm thầm mặc định 08:00.
21. As a Traveler, I want to hệ thống tự xếp chặng về sau lượt tham quan cuối khi ngày cuối vẫn tham quan, so that tôi không phải nhập thêm một giờ không cần thiết.
22. As a Traveler, I want to thấy mốc định tuyến cho ngày chỉ đi đường và giới hạn chưa tính đường ra/vào chỗ nghỉ, so that tôi không nhầm đó là khách sạn hoặc nơi nghỉ đã xác định.
23. As a Traveler, I want to giờ tham quan phù hợp giờ mở cửa và thời lượng tối thiểu, so that bổ sung chặng đi/về không phá các kiểm tra hiện có.
24. As a Traveler, I want to xem đề xuất sơ bộ khi chưa chốt đủ nơi hoặc giờ đi/về, so that tôi vẫn khám phá được phương án.
25. As a Traveler, I want to được chỉ rõ dữ liệu còn thiếu trước khi lưu, so that tôi biết phải bổ sung gì.
26. As a Traveler, I want to lỗi hoặc thiếu dữ liệu routing được thể hiện đúng, so that tôi không tin nhầm một lịch chưa được kiểm tra.
27. As a Traveler, I want to được báo khi nghỉ dự kiến hoặc chặng đi/về làm lịch vượt hạn, so that tôi chủ động đổi giờ, số ngày hoặc điểm tham quan.
28. As a Traveler, I want to điểm bắt buộc và số ngày không bị tự thay đổi, so that hệ thống tôn trọng nhu cầu đã xác nhận.
29. As a Traveler, I want to được báo khi chặng chạy sang ngày hôm sau chưa được hỗ trợ, so that tôi không nhận một lịch vượt phạm vi tính toán.
30. As a Traveler, I want to form và Assistant V2 dùng cùng dữ liệu nơi xuất phát, so that kết quả nhất quán giữa hai cách lập hành trình.
31. As a Traveler, I want to chỉnh nơi hoặc giờ đi/về trong đề xuất và nhận lịch được tính lại, so that tôi so sánh được phương án phù hợp hơn.
32. As a Traveler, I want to việc hỏi Q&A không tự thay đổi nơi xuất phát hoặc lịch, so that hội thoại không làm mất phương án đang xem.
33. As a Trip owner, I want to lưu là hành động xác nhận riêng, so that việc tạo hoặc chỉnh đề xuất không tự ghi đè chuyến chính thức.
34. As a Trip owner, I want to server kiểm tra lại dữ liệu hiện tại trước khi lưu hoặc áp dụng sửa, so that phương án cũ không vượt qua thay đổi mới của dữ liệu điểm đến.
35. As a Trip owner, I want to retry kết quả UNKNOWN bằng đúng yêu cầu đã xác nhận, so that không tạo chuyến hoặc ghi thay đổi trùng lặp.
36. As a Trip owner, I want to xem lại nơi xuất phát và giờ đi/về trong chuyến đã lưu, so that tôi đối chiếu được kế hoạch chính thức.
37. As a Trip owner, I want to chỉ thay đổi nơi/giờ đi-về trước khi khởi hành và trước khi đánh dấu hoàn tất, so that phần khởi hành của chuyến đang đi không bị viết lại.
38. As a Trip owner, I want to giữ lịch đã lưu khi hủy hoặc sửa thất bại, so that một đề xuất chưa được chấp nhận không làm mất hành trình.
39. As a Trip owner with a legacy Trip, I want to vẫn đọc và sửa lượt tham quan theo điều kiện hiện hành dù chưa có nơi xuất phát, so that dữ liệu cũ không bị khóa vì tính năng mới.
40. As a Trip owner with a legacy Trip, I want to chủ động bổ sung nơi/giờ trước chuyến và kiểm tra lại toàn hành trình, so that tôi có thể dùng khả năng tính hai chặng khi cần.
41. As a Trip owner, I want to tên, địa chỉ, tọa độ và đường đi từ nơi xuất phát chỉ được trả cho tôi, so that việc tìm bạn đồng hành không tự tiết lộ nơi ở riêng tư.
42. As a Trip member, I want to tiếp tục xem lịch được phép mà không nhận vị trí xuất phát riêng tư của chủ chuyến, so that quyền đọc lịch không bị hiểu thành quyền đọc địa chỉ riêng.
43. As a Guest, I want to được yêu cầu đăng nhập khi bắt đầu lập chuyến riêng, so that quyền dùng tính năng rõ ràng và hành động ghi không tự chạy sau đăng nhập.
44. As an Admin planning my own Trip, I want to có cùng khả năng lập hành trình của Traveler, so that tôi sử dụng tính năng cho chuyến của mình mà không có quyền đọc dữ liệu riêng của người khác.
45. As a mobile or keyboard user, I want to tìm, chỉnh và xác nhận nơi xuất phát bằng các điều khiển truy cập được, so that tôi hoàn thành cùng luồng trên thiết bị của mình.
46. As a Traveler, I want to thấy trạng thái đang tìm, không có kết quả, bận, lỗi và chưa chọn rõ ràng, so that tôi biết cách tiếp tục mà không mất dữ liệu đã nhập.

## Implementation Decisions

- **Kiến trúc:** giữ Next.js Modular Monolith và Route Handlers mỏng. Handler xác thực/parse/map response; module/service sở hữu quy tắc, quyền sở hữu và kiểm tra dữ liệu. Tái sử dụng Planner, routing, Constraint Validator và Trip persistence hiện tại; không tạo planner thứ hai trong Assistant.
- **Module liên quan:** mở rộng Trip Requirement, Planner, Trip Validation, Trip Save/Read/Edit, Assistant V2 và bộ chọn vị trí dùng chung. Thêm khả năng tìm tên địa điểm và kiểm tra phạm vi hỗ trợ; origin không phải một Destination tham quan và không được giả lập bằng Destination ID.
- **Hợp đồng nơi xuất phát:** giữ tên đã review, tọa độ và nguồn lựa chọn; lưu trạng thái thiếu dữ liệu rõ ràng. Vị trí camera hoặc tên chưa phân giải không phải vị trí đã xác nhận. Thay tên tìm kiếm hoặc vị trí làm mất xác nhận cũ; không coi nhấn tìm, mở bản đồ hay chọn kết quả là đã xác nhận ghim.
- **Hợp đồng thời gian:** giờ khởi hành ngày đầu và hạn về ngày cuối theo Asia/Ho_Chi_Minh. Giờ bắt đầu chặng về chỉ bắt buộc khi ngày cuối chỉ di chuyển. Giữ exact departure date bắt buộc trước lưu mới; đề xuất chưa có ngày vẫn có thể dùng Day 1/Day 2 và chưa đủ kiểm tra phụ thuộc ngày.
- **Search API:** request có tên địa điểm giới hạn độ dài; response chỉ trả các lựa chọn cần thiết và attribution. Xác thực Traveler/Admin trước đọc body/provider; kiểm tra same-origin, bounded JSON, timeout, response size và lỗi an toàn. Giữ envelope HTTP/private-no-store hiện hành. Search không phải thao tác lưu Trip.
- **Nominatim:** chỉ gọi khi người dùng bấm Tìm, không autocomplete hoặc tự reverse-geocode khi kéo ghim. Có cache, nhận diện app, ghi nguồn OpenStreetMap và cấu hình đổi provider. Admission dùng chung giữa mọi instance bảo đảm tổng upstream tối đa một request/giây, gồm cả timeout/retry/worker chết; limiter trong process không đủ. Không gửi nhu cầu, ghi chú, thông tin cá nhân/bí mật trong truy vấn provider. Dịch vụ công cộng không có cam kết luôn sẵn có; giữ fallback thủ công.
- **Phạm vi Việt Nam:** kiểm tra cả kết quả search và tọa độ thủ công trên server bằng dữ liệu địa lý có nguồn/license được review. Search country filter hoặc hình chữ nhật bao Việt Nam không đủ chứng minh tọa độ bất kỳ nằm trong phạm vi. Không xác định được phạm vi thì yêu cầu chọn lại, không PASS.
- **Schema:** dự kiến migration cộng thêm cho thông tin xuất phát/thời gian của Trip và dữ liệu admission/cache. Trường mới hỗ trợ null cho chuyến cũ; không bịa backfill hoặc chuyển schema bằng db:push. Chưa khóa lựa chọn cột riêng hay JSON trong spec; schema cụ thể phải giữ validation và quyền projection nêu trên.
- **Routing:** MapLibre là renderer; Stadia tiếp tục routing với ô tô/xe máy được hỗ trợ. Thêm endpoint origin riêng vào đầu/cuối chuỗi. Tối đa 28 điểm tương ứng dự kiến tối đa 29 cặp routing gồm hai chặng biên, cùng deadline tối đa 10 giây và tối đa ba request đang chạy đồng thời. Không fallback sang AI hoặc đường chim bay để chứng nhận thời gian.
- **Tổng thời gian:** cộng thời gian chạy xe có chứng cứ routing và thời gian nghỉ dự kiến; hiển thị riêng hai phần. Ngày đầu/cuối và tổng toàn chuyến không cộng hai lần một chặng. Thiếu route không được biến thành 0 phút hoặc tổng thời gian đã xác minh.
- **Chính sách nghỉ Q18:** ô tô nghỉ 15 phút sau mỗi 120 phút lái; xe máy sau mỗi 90 phút. Chỉ tính nghỉ trước khi còn phải lái tiếp, không cộng nghỉ khi đã tới endpoint cuối. Cộng dồn lái xe giữa các chặng trong ngày; tham quan từ 15 phút trở lên đặt lại bộ đếm, qua ngày mới bắt đầu lại. Ví dụ 300 phút ô tô liên tục có 30 phút nghỉ; đúng 120 phút tới nơi không thêm nghỉ cuối. Đây là allowance xếp lịch có thể hiệu chỉnh, không phải chứng nhận an toàn hay dữ liệu provider; chưa có bữa ăn riêng. Scheduler và Validator phải dùng cùng chính sách, giữ provenance/chính sách của phương án để giải thích và reconcile chính xác.
- **Khung lịch:** tham quan 08:00–18:00, trong giờ mở cửa và đủ thời lượng tối thiểu. Chặng đi/về có thể ngoài khung đó nhưng trong cùng ngày; không tự thêm ngày lái xuyên đêm. Tổng số ngày gồm cả đi/về. Một phương tiện dùng xuyên suốt chuyến.
- **Ngày chỉ đi đường:** cho phép ngày đầu/cuối không có lượt tham quan. Ngày đầu dùng điểm tham quan đủ điều kiện đầu tiên của ngày tiếp theo làm mốc đến định tuyến; ngày kế tiếp không tính lại chặng origin đó. Ngày chỉ về dùng điểm cuối ngày trước làm mốc xuất phát và giờ về do người dùng chọn. Ghi rõ chưa tính chặng ra/vào chỗ nghỉ; không tạo khách sạn, lượt tham quan hoặc tọa độ qua đêm giả. Phân biệt ngày di chuyển hợp lệ với ngày trống do thiếu dữ liệu.
- **Chặng về Q22:** nếu ngày cuối còn tham quan, về ngay sau lượt cuối và cộng nghỉ còn cần; không hỏi thêm giờ về bắt đầu. Nếu chỉ về, dùng giờ đã chọn. Phải tới origin trước hoặc đúng hạn về. Không tính chặng về thêm ở cuối ngày trước.
- **Đầu ra kiểm tra:** giữ PASS/VIOLATION/INSUFFICIENT_DATA. Chỉ đủ chứng cứ mới được PASS. Thiếu routing không chứng minh bất khả thi; thiếu ngày vẫn chặn kiểm tra phụ thuộc ngày. Không có thời gian tham quan cho toàn chuyến hoặc lịch có chứng cứ vượt khung thì báo phương án không khả thi. Không tự bỏ điểm bắt buộc, giảm nghỉ, đổi số ngày hoặc điều kiện người dùng để làm kết quả hợp lệ.
- **Đề xuất và lưu mới:** chưa đủ nơi/giờ vẫn được đề xuất sơ bộ có thông báo giới hạn; không cho final confirmation/save mới khi thiếu dữ liệu bắt buộc. Người dùng xác nhận lưu riêng; server reauthorize, kiểm tra ownership, đọc lại destination/revision và kiểm tra toàn hành trình bằng chứng cứ hiện tại. Không dựa vào cờ eligible hoặc số phút route do client gửi để cấp quyền lưu.
- **Assistant V2:** dùng contract cùng form và một thao tác nơi xuất phát riêng với dữ liệu đã xác nhận, không nhầm với vị trí hiện tại trong in-trip. AI có thể hiểu tên/ý định nhưng không tạo tọa độ/routing/Validator outcome. Giữ needs, review, checkpoint, refinement, proposal version và save payload nhất quán; thay nơi/giờ khiến phương án cũ phải tính/kiểm tra lại. Q&A không tự mutate proposal. Giữ lifecycle reload/expired proposal/UNKNOWN hiện hành.
- **Sửa chuyến đã lưu:** origin/giờ chỉ đổi trước ngày + giờ khởi hành Việt Nam và trước manual completion; đúng hoặc sau mốc đó phải chặn trên server. Chuyến cũ thiếu giờ dùng 00:00 ngày bắt đầu làm cutoff cho thao tác mới. Nhãn trạng thái theo ngày vẫn giữ nguyên. Thay đổi tạo candidate riêng và chỉ apply sau xác nhận, fresh validation và confirmed DB write. Không sửa phần khởi hành khi đang đi; in-trip vẫn dùng vị trí hiện tại và bảo toàn phần đã hoàn thành.
- **Tương thích cũ:** Trip chưa có origin vẫn đọc và sửa lượt tham quan dưới điều kiện hiện hành với disclosure chưa tính hai chặng. Không bắt bổ sung origin chỉ để sửa một visit. Chủ động kích hoạt journey planning yêu cầu đủ dữ liệu, kiểm tra lại toàn chuyến và tuân thủ cutoff mới. Đây không phải yêu cầu sửa mọi quy tắc ordinary EDIT ngoài phạm vi.
- **Quyền riêng tư:** precise origin chỉ thuộc owner. Không thêm raw origin vào DTO dùng chung owner/member; lọc tên, địa chỉ, tọa độ, geometry và origin-leg data/tổng có thể tiết lộ vị trí khỏi public/member projections. Admin không sở hữu không có bypass; điểm hẹn nhóm không tự lấy từ origin. Không thay quyền thành viên đọc lịch tham quan được phép và không mở shared editing.
- **Write semantics:** SUCCESS chỉ sau DB confirmation; FAILED và UNKNOWN phân biệt rõ. UNKNOWN khóa mutation tương ứng và retry đúng payload/key đã xác nhận; payload chứa đủ dữ liệu/chính sách cần thiết để không tính lại thành một ý định khác. Reuse key khác payload bị từ chối. Giữ lịch canonical trên hủy/lỗi/rejected candidate, không persist invalid itinerary như draft lâu dài.
- **UX states:** giữ input khi lỗi; hiển thị chưa chọn/chưa xác nhận/đang tìm/không kết quả/bận/lỗi/map unavailable. Có keyboard/focus/aria-live và mobile. Cùng dữ liệu được dùng cho thời gian xuất hiện ở nhiều nơi; warning phải cụ thể, không giả định mọi dữ liệu là đã xác minh.

## Testing Decisions

- **Ranh giới đã được người dùng xác nhận:** ưu tiên gọi API/service công khai hiện có của Planner, Assistant V2 và Trip Save/Edit/Read. Dùng các điểm vào hiện tại thay vì tạo interface chỉ để test; ghép ít boundary nhất đủ chứng minh hành vi. Không thể dùng một API duy nhất để chứng minh cả thao tác lưu, privacy projection và tương tác bản đồ, nên giữ các boundary hiện có này thay vì thêm một orchestrator giả cho test.
- **Một test tốt:** đưa vào nhu cầu/lựa chọn và chứng cứ provider có kiểm soát, quan sát lịch/checks/response/DB state; không assert tên helper, thứ tự gọi hàm nội bộ, hình dạng partition hoặc snapshot implementation. Dùng đồng hồ/reference time cố định, tọa độ và route fixture có nhãn synthetic; test routing/AI thật là nhóm live riêng.
- **Planner và Validator:** kiểm thử đầy đủ một ngày đi–tham quan–về; nhiều ngày; thay origin/giờ làm đổi arrival/feasibility; return deadline bằng/vượt giờ; thiếu ngày/route/hours/minimum; route timeout/malformed; overnight unsupported; no-sightseeing; travel-only days không sinh visit/chặng trùng. Must-visit và scope ngoài ngày đang sửa được giữ.
- **Nghỉ dự kiến:** trước/đúng/sau ngưỡng 90/120 phút, qua hai ngưỡng, hai chặng ngắn cộng lại vượt ngưỡng, tham quan dưới/đúng 15 phút, đạt ngưỡng tại endpoint cuối, nghỉ làm vượt deadline. Quan sát thời gian/checks hiển thị qua scheduler/Validator, tránh test một phép chia sao chép implementation.
- **Trip Save/Edit/Read:** preview rồi thay dữ liệu destination/quyền/revision; yêu cầu trực tiếp giả mạo eligibility/time/provider metrics; trước/đúng/sau cutoff; manual completion; legacy no-origin ordinary edit; kích hoạt origin trên chuyến cũ; cancel/reject; DB failure; idempotent replay/UNKNOWN same-key, changed-payload conflict và concurrent writes. Xác nhận không có dữ liệu mới trước khi DB ghi thành công.
- **Quyền:** principal owner/member/Guest/Admin khác, không chỉ UI ẩn nút. Dùng canary origin riêng kiểm tra cả JSON/geometry/tổng liên quan trong public và member reads; giữ khả năng đọc điểm tham quan được phép. Không gửi dữ liệu bị cấm cho AI/provider.
- **Assistant V2:** hiểu tên cần xác nhận, structured origin selection, refinement và regenerate dùng cùng rule với form; QA interruption giữ needs/proposal; stale state/version bị chặn; uncertain write không tạo mutation mới; retry payload/key không đổi. Không assert exact prose của LLM trừ thông báo nghiệp vụ cố định.
- **Nominatim và coverage:** auth trước provider, explicit submit only, stale response không ghi đè selection mới, filter/validate Việt Nam cho search/manual, unavailable fallback. PostgreSQL riêng chứng minh admission giữa nhiều worker, cache hit/miss/expiry, worker death/timeout/retry không vượt app-wide ceiling. Không gọi public Nominatim trong test tự động tải lớn.
- **Persistence thật:** dùng PostgreSQL disposable có ownership/cleanup guard để thử migration cộng thêm, legacy nulls, transaction/replay và shared admission/cache. Không dùng shared Development/Production làm test fixture mặc định; không suy ra transaction correctness từ mock database.
- **Browser:** dùng form và Assistant đang tồn tại, kiểm tra desktop/mobile/keyboard, tìm/chọn/chỉnh/xác nhận ghim, thời gian hiển thị, lỗi map/search, giữ input, auth transition không auto-save, expired proposal và lifecycle đã chốt. Browser fixture PASS không thay live provider acceptance.
- **Prior art:** kế thừa bộ test Planner HTTP/service/provider bounds, Trip Save service/HTTP/idempotency, Trip Edit preview/apply/candidate, Trip Read permission và Assistant V2 HTTP/session đang có. Kế thừa map manual-picker accessibility và các runner PostgreSQL disposable hiện có. Chọn assertion behavioral phù hợp từ các bộ này, không nhân bản assertion cấu trúc query chỉ để tăng số test.
- **Điều kiện bàn giao sau triển khai:** typecheck/build/test liên quan PASS, migration state được kiểm tra, browser evidence và git diff --check, không secrets/unrelated changes. Báo rõ nhóm chưa chạy, receipt synthetic, live API/AI/routing/deployment chưa chứng minh; không gọi tính năng ACCEPTED chỉ vì test unit PASS.

## Out of Scope

- Bắt đầu code, sửa schema/env, tạo hoặc áp migration, generate client, publish issue, push/merge hoặc deploy trong nhiệm vụ viết spec này.
- Google Places/Maps integration, iframe làm bộ chọn tọa độ, nâng gói Stadia hoặc đăng ký dịch vụ trả phí.
- Xe khách, máy bay, thuê xe và nhiều phương tiện trong một chuyến; xuất phát ngoài Việt Nam hoặc hành trình qua biên giới; thêm điểm tham quan ngoài Hà Giang.
- Lái xuyên đêm sang ngày khác, tự tăng ngày, tự bỏ must-visit, tự bỏ nghỉ để làm lịch hợp lệ.
- Booking, địa chỉ chỗ nghỉ thực tế, đường ra/vào khách sạn, bữa ăn riêng, điểm hẹn nhóm, continuous GPS tracking hoặc lưu lịch sử GPS dài hạn.
- Tối ưu tuyến đa mục tiêu phức tạp, chứng nhận an toàn lái xe, thời tiết/giao thông thời gian thực hoặc cam kết Nominatim luôn sẵn có.
- Thay quyền sở hữu Trip, shared editing, Admin private-read bypass, tự sửa toàn bộ ordinary EDIT hoặc thay cách phân loại trạng thái chuyến theo ngày.

## Further Notes

- Nguồn quyết định: phỏng vấn Q1–Q22, plan tổng hợp, story Trip origin/return và domain glossary. Giữ hierarchy Product/System, repository truth và accepted ADRs: Stadia routing, single Trip ownership, Assistant V2 orchestration, progressive refinement và tách AI khỏi Validator. Spec này mô tả yêu cầu được duyệt cho tính năng mới, không tuyên bố code đã có.
- Hiện trạng đã xác minh: requirement/proposal/Trip chưa có nơi xuất phát; scheduler chưa có inbound từ origin/chặng về. Active planning HTTP phục vụ V2. Ordinary EDIT chưa có đầy đủ lifecycle guard của thao tác origin mới; shared private Trip read cho active members, nên privacy phải được thực thi ở projection phía server.
- Các lựa chọn kỹ thuật cần chứng minh lúc triển khai: nguồn polygon/coverage Việt Nam có license/provenance; schema cụ thể và migration; mô hình admission/cache chịu lỗi nhiều worker; nhận diện ứng dụng/contact; timeout/body bounds/cache retention; render/focus/mobile. Đây là implementation evidence còn thiếu, không phải giấy phép tự mở rộng product scope hoặc lý do hỏi người dùng tự tìm dữ kiện.
- Nominatim là dịch vụ công cộng có giới hạn và dữ liệu theo ODbL; tuân thủ policy đã được giải thích và chấp thuận trong plan. Các nguồn điều kiện provider cần được kiểm tra lại khi triển khai: [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), [Nominatim search API](https://nominatim.org/release-docs/latest/api/Search/). Không xem country filter hay tên hiển thị là chứng nhận tọa độ thủ công.
- Các quy tắc nghỉ là allowance sản phẩm đã chốt, không trích từ luật hay hướng dẫn y tế. Ghi rõ giới hạn chưa có bữa ăn/chỗ nghỉ thực và không dùng kết quả như lời đảm bảo an toàn.
- Các đầu việc dự kiến theo thứ tự: contract/persistence → search và coverage → bộ chọn chung → routing/schedule/Validator → Assistant → save/edit/read/privacy → hiển thị tổng hợp → kiểm chứng. Tất cả chưa bắt đầu; duyệt spec vẫn tiếp tục chờ lệnh code rõ ràng.
- Bản spec được tạo thành file trong repository theo yêu cầu trực tiếp. Không đăng issue hoặc gắn ready-for-agent lên tracker. Nếu sau này muốn thiết lập quy trình tracker của skill mà chưa có cấu hình, chạy `/setup-matt-pocock-skills`; việc này không cần để review file hiện tại.

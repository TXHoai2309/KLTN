# Điểm xuất phát và chặng về — phỏng vấn thiết kế

Trạng thái: PLAN REVIEW — Q1–Q22 đã được chốt, gồm Q14 được sửa theo người dùng: hệ thống tự tính thời gian nghỉ. Phỏng vấn quyết định sản phẩm đã hoàn tất; bản tổng hợp đang chờ người dùng review. Người dùng xác nhận hiện chỉ làm plan, chưa cho phép triển khai. Code/schema/config hiện hành được giữ nguyên; chưa áp dụng migration.

**Ranh giới bắt buộc của phiên này:** Người dùng nhắc lại chỉ tiếp tục plan với grill-with-docs; chỉ được code khi người dùng ra lệnh code rõ ràng. Trả lời “có”, chốt thiết kế/provider, duyệt story, yêu cầu “làm tiếp” trong phiên plan hoặc hoàn tất phỏng vấn không phải lệnh triển khai. Trong lúc lập kế hoạch chỉ đọc nguồn và sửa tài liệu; không sửa source/schema/env, tạo migration, generate client hay chạy thao tác database.

## Mục tiêu

Người dùng yêu cầu bổ sung lựa chọn nơi xuất phát để lịch trình phản ánh thời gian đi thực tế, thay vì bắt đầu ngay tại điểm tham quan đầu tiên.

## Nguồn và hiện trạng đã xác minh

- [Product contract](../product/product-spec.md): điểm tham quan trong phạm vi Hà Giang, phương tiện ô tô/xe máy, AI đề xuất và Validator quyết định; thiếu dữ liệu bắt buộc không phải PASS.
- [US-28](../stories/US-28-trip-planner.md): điểm xuất phát/chỗ nghỉ chờ thiết kế input bổ sung.
- `apps/web/src/modules/trip-requirement/trip-requirement-contract.ts`: chưa có nơi/giờ xuất phát.
- `apps/web/src/modules/trip-planner/planner-order.ts`: chưa có điểm xuất phát của người dùng để định hướng tuyến.
- `apps/web/src/modules/trip-planner/planner-engine.ts`: khung lập lịch 08:00–18:00; tuyến hiện tại nối các điểm tham quan, không có chặng vào điểm đầu.
- `apps/web/src/modules/trip-planner/planner-service.ts` và `apps/web/src/modules/assistant-planning/planning-engine.ts`: cảnh báo `ORIGIN_AND_LODGING_UNKNOWN` công khai giới hạn chưa tính chặng xuất phát/kết thúc/chỗ nghỉ.
- Trip/proposal hiện chưa lưu điểm xuất phát. Vị trí hiện tại trong in-trip là khái niệm khác, không tự trở thành nơi khởi hành của chuyến mới.

Đây là kết quả đọc tài liệu/code, không phải nghiệm thu trên trình duyệt hoặc routing thật.

## Cây quyết định

- Q1: Tính chặng đi từ nơi xuất phát tới Hà Giang — ĐÃ ĐỒNG Ý.
  - Q3: Số ngày bao gồm thời gian đi/về — ĐÃ ĐỒNG Ý.
  - Q4: Cùng một phương tiện ô tô hoặc xe máy suốt chuyến — ĐÃ ĐỒNG Ý.
  - Q7: Tìm địa điểm và xác nhận vị trí trên bản đồ — ĐÃ ĐỒNG Ý.
- Q2: Tính chặng quay về nơi xuất phát vào ngày cuối — ĐÃ ĐỒNG Ý.
  - Q5: Nhập giờ xuất phát ngày đầu và hạn về ngày cuối — ĐÃ ĐỒNG Ý.
- Q6: Đồng bộ phạm vi form, Assistant và chuyến lưu — ĐÃ ĐỒNG Ý.
- Q8: Thiếu nơi/giờ đi-về và điều kiện tạo sơ bộ/lưu — ĐÃ ĐỒNG Ý.
- Q9: Khung giờ di chuyển và chặng kéo qua đêm — ĐÃ ĐỒNG Ý.
- Q10: Ngày chỉ di chuyển, không đủ thời gian hoặc thiếu routing — ĐÃ ĐỒNG Ý.
- Q11: Đổi nơi/giờ đi-về và xử lý chuyến đã lưu — ĐÃ ĐỒNG Ý.
- Q12: MapLibre + Nominatim tìm nơi xuất phát, Stadia routing — ĐÃ ĐỒNG Ý CHO PLAN. Không dùng Google APIs hoặc nâng gói Stadia trong phương án này.
- Q13: Giờ di chuyển trên ngày chỉ đi/về — ĐÃ ĐỒNG Ý: hỏi rõ giờ bắt đầu, không mặc định 08:00.
- Q14: Thời gian nghỉ dọc đường — ĐÃ CHỈNH THEO NGƯỜI DÙNG: hệ thống tự tính, không bắt người dùng nhập; công thức chốt tại Q18.
- Q15: Ai được thấy nơi xuất phát chính xác — ĐÃ ĐỒNG Ý: chỉ chủ chuyến; không tự chia sẻ qua tìm bạn đồng hành.
- Q16: Phạm vi địa lý của nơi xuất phát — ĐÃ ĐỒNG Ý: Việt Nam cho lần đầu, không hỗ trợ qua biên giới.
- Q17: Khi nào được đổi nơi/giờ đi-về của chuyến đã lưu — ĐÃ ĐỒNG Ý: chỉ chuyến chưa bắt đầu/chưa đánh dấu hoàn tất, thực thi trên server.
- Q18: Công thức tự tính nghỉ dọc đường — ĐÃ ĐỒNG Ý.
- Q19: Mốc đến khi ngày đầu chỉ di chuyển — ĐÃ ĐỒNG Ý.
- Q20: Sửa chuyến cũ thiếu thông tin xuất phát — ĐÃ ĐỒNG Ý.
- Q21: Xác định thời điểm bắt đầu chuyến cho thao tác sửa nơi/giờ — ĐÃ ĐỒNG Ý.
- Q22: Thời điểm/mốc bắt đầu chặng về — ĐÃ ĐỒNG Ý.

Frontier sản phẩm đã khép lại. Các quyết định Q1–Q22 không cần hỏi lại; [bản tổng hợp và đầu việc](trip-origin-plan.md) dùng để review, không tự chuyển sang code. Chi tiết kỹ thuật còn cần kiểm chứng được ghi riêng, không coi là yêu cầu sản phẩm chưa trả lời.

## Vòng 1 — quyết định đã chấp thuận

### Q1 — Chặng đi

Người dùng chọn: “Có, tính cả chặng đến Hà Giang”. Nơi xuất phát phải ảnh hưởng tính thời gian và lịch tham quan; không chỉ là nhãn tham khảo.

### Q2 — Chặng về

Người dùng chọn: “Có, tính cả chặng về”. Ngày cuối cần tính chặng quay về nơi xuất phát để tránh xếp kín điểm tham quan rồi thiếu thời gian về.

## Vòng 2 — quyết định đã chấp thuận

Người dùng trả lời “có” cho khuyến nghị Q3–Q7 trong hội thoại.

### Q3 — Số ngày

Tổng số ngày bao gồm đi, tham quan và về. Ví dụ “3 ngày từ Hà Nội” không có thêm ngày di chuyển ngoài ba ngày. Khi thiếu thời gian, báo rõ và đề nghị giảm điểm hoặc tăng ngày; không tự tăng ngày hoặc bỏ điểm bắt buộc.

### Q4 — Phương tiện

Lần bổ sung này dùng cùng một phương tiện ô tô hoặc xe máy suốt chuyến. Xe khách tới Hà Giang rồi thuê xe máy cần thiết kế riêng, chưa được mở rộng trong phạm vi này.

### Q5 — Giờ đi/về

Cho nhập giờ xuất phát ngày đầu và giờ muốn về tới nơi ngày cuối, hiển thị rõ để chỉnh. Không tự hiểu mọi người đều khởi hành lúc 08:00.

### Q6 — Phạm vi áp dụng

Đồng bộ form tạo hành trình, Assistant và thông tin chuyến đã lưu. Chuyến cũ chưa có nơi xuất phát được ghi rõ là thiếu thông tin, không bịa thêm dữ liệu.

### Q7 — Xác định vị trí

Cho tìm địa điểm rồi xác nhận vị trí trên bản đồ. Không chỉ lưu chữ “Hà Nội” hoặc âm thầm lấy tâm thành phố khi chưa xác định vị trí.

## Vòng 3 — quyết định đã chấp thuận

Người dùng trả lời “có” cho khuyến nghị Q8–Q11 trong hội thoại.

### Q8 — Thiếu dữ liệu

Vẫn cho xem đề xuất sơ bộ khi chưa có đủ nơi/giờ đi-về, ghi rõ chưa tính đủ các chặng. Phải bổ sung dữ liệu này trước khi lưu chính thức; không tự điền Hà Nội hoặc 08:00. Đây là yêu cầu mở rộng cho luồng mới, chưa phải hành vi hiện có.

### Q9 — Khung giờ

Chặng di chuyển có thể trước 08:00 hoặc sau 18:00 theo giờ người dùng nhập. Tham quan vẫn thuộc khung 08:00–18:00 và giờ mở cửa đã xác minh. Không hỗ trợ chặng lái xuyên đêm sang ngày hôm sau trong lần bổ sung này; phải báo giới hạn, không âm thầm gán ngày hoặc thêm chặng nghỉ.

### Q10 — Ngày di chuyển và tính khả thi

Ngày đầu/cuối có thể chỉ di chuyển. Cần phân biệt ngày di chuyển có dữ liệu hợp lệ với ngày rỗng do thiếu điểm/dữ liệu. Nếu toàn bộ chuyến không còn thời gian tham quan thì báo không khả thi; thiếu routing là chưa đủ dữ liệu, không phải chứng cứ không khả thi. Không tự bỏ điểm bắt buộc hoặc tăng ngày.

### Q11 — Thay đổi và tương thích chuyến cũ

Đổi nơi/giờ đi-về phải tính lại lịch và kiểm tra lại. Chuyến đã lưu giữ nguyên cho đến khi người dùng xác nhận phương án mới và database xác nhận ghi thành công. Chuyến cũ vẫn đọc được, không tự sửa hoặc tự điền dữ liệu xuất phát; việc thiếu thông tin được hiển thị rõ.

## Phụ thuộc kỹ thuật phát hiện sau phỏng vấn

- Có thể tái sử dụng `components/in-trip/manual-location-picker.tsx` và `mountDestinationPinPicker`; vị trí camera mặc định không phải lựa chọn của người dùng.
- Chưa có dịch vụ tìm địa điểm theo tên trong repository. [Tài liệu tìm kiếm Stadia](https://docs.stadiamaps.com/geocoding-search-autocomplete/search/) và [autocomplete](https://docs.stadiamaps.com/geocoding-search-autocomplete/autocomplete/) nêu điều kiện gói Standard/Professional/Enterprise cho lưu kết quả lâu dài. Người dùng đã xác nhận tài khoản dự án dùng **Free**; không dùng quyền routing để suy ra quyền lưu geocoding lâu dài.
- HTTP planning hiện tại chỉ phục vụ `ASSISTANT_V2` trong `modules/assistant-planning/planning-http.ts`; mô tả production-V1 trong các tài liệu cũ không phản ánh code hiện tại. Cần nối input với V2 readiness/refinement/session, không chỉ cập nhật V1.
- Đã chốt provider tìm kiếm là Nominatim public sau khi giải thích giới hạn. Chi tiết triển khai dưới đây là kế hoạch, không phải code đã hoàn thành hoặc sự cho phép bắt đầu code.

### Q12 — Quyết định cuối cùng cho plan

Người dùng chọn lại phương án MapLibre + Nominatim và sau đó làm rõ chỉ yêu cầu lập plan. Nominatim chỉ tìm khi người dùng bấm Tìm, không autocomplete; MapLibre sẵn có dùng để xác nhận ghim; Stadia giữ tính đường và thời gian đi/về. Không dùng Google APIs hoặc nâng gói Stadia. Các phương án Google và Stadia geocoding bên dưới là lịch sử cân nhắc, không phải phạm vi đã chọn.

Theo [usage policy chính thức](https://operations.osmfoundation.org/policies/nominatim/), phải giới hạn tối đa một request/giây cho toàn ứng dụng (gồm nhiều instance), nhận diện ứng dụng, ghi nguồn OSM, dùng proxy/cache, cho đổi dịch vụ bằng cấu hình, không gửi dữ liệu cá nhân/bí mật và chỉ dùng với lưu lượng vừa phải. Dịch vụ có thể rút quyền truy cập; dữ liệu theo ODbL. Nhà phát triển đã được giải thích các giới hạn trước khi chọn phương án cho plan.

Shared DB admission/cache là phương án kỹ thuật dự kiến cần kiểm chứng khi được phép triển khai; per-process limiter không đủ. Ghim thủ công vẫn dùng khi search lỗi/bị giới hạn. Không thay Stadia routing hoặc đăng ký gói trả phí. Google Maps chỉ là phương án đã cân nhắc trước khi chốt Nominatim, không còn là phụ thuộc cần người dùng bật API.

## Vòng 4 — quyết định đã chấp thuận và điều chỉnh

Người dùng đồng ý Q13, Q15, Q16, Q17; sửa Q14: thời gian nghỉ phải do hệ thống tính toán, không yêu cầu người dùng nhập. Đây là duyệt thiết kế, không phải cho phép code.

### Q13 — Ngày chỉ di chuyển

Ví dụ tham quan hết ngày 2 và dùng ngày 3 chỉ để về. Đề nghị thu thập giờ bắt đầu chặng về ngày 3; không suy ra 08:00 từ khung tham quan. Chặng đi dùng giờ khởi hành đã được yêu cầu tại Q5. Chưa đủ giờ thì giữ trạng thái chưa đủ dữ liệu trước khi lưu.

### Q14 — Nghỉ dọc đường

Hệ thống tự tính thời gian nghỉ và cộng vào chặng đi/về; không có trường bắt buộc người dùng nhập thời gian nghỉ. Thời gian chạy xe từ routing và phần nghỉ dự kiến phải tách rõ. Công thức Q18 đã được đồng ý là chính sách lập kế hoạch, không phải thời gian thực tế do provider xác minh hoặc kết luận an toàn lái xe.

### Q15 — Phạm vi chia sẻ nơi xuất phát

Đã đồng ý: chỉ chủ chuyến được xem tên/vị trí chính xác đã chọn. Bài đăng tìm bạn đồng hành và dữ liệu trả cho thành viên không tự lộ điểm xuất phát riêng tư; điểm hẹn nhóm là khái niệm riêng, ngoài phạm vi bổ sung này. Cần lọc cả tọa độ, tên, đường vẽ và chặng/tổng có thể tiết lộ nơi xuất phát trong DTO không thuộc chủ chuyến.

### Q16 — Nơi xuất phát trong Việt Nam

Đã đồng ý: giới hạn nơi xuất phát trong Việt Nam ở lần đầu, áp dụng cả tìm kiếm và ghim/tọa độ thủ công. Nếu chưa xác định được vị trí thuộc phạm vi hỗ trợ thì yêu cầu chọn lại, không coi điều kiện tìm kiếm của provider là đủ để chứng nhận tọa độ bất kỳ. Chưa duyệt thuật toán/dataset kiểm tra địa giới.

### Q17 — Đổi nơi/giờ của chuyến đã lưu

Đã đồng ý: chỉ cho thay đổi nơi/giờ đi-về trước khi chuyến bắt đầu và khi chưa đánh dấu hoàn tất; chuyến đang đi/đã hoàn tất chỉ đọc thông tin khởi hành. Nhu cầu hỗ trợ đang đi tiếp tục dùng vị trí hiện tại và luồng in-trip hiện hành, không thay lại gốc chuyến đi. Quy tắc của thao tác mới phải được thực thi trên server; mốc xác định bắt đầu cần chốt tại Q21.

## Vòng 5 — đã được người dùng đồng ý

Người dùng trả lời “có” cho Q18–Q21. Các quy tắc sau là quyết định cho plan, không phải lệnh code.

- **Q18:** Chính sách nghỉ do hệ thống tính: 15 phút sau mỗi 120 phút chạy xe đối với ô tô; 15 phút sau mỗi 90 phút đối với xe máy; chỉ tính mốc nghỉ nằm trước khi tới nơi, không thêm nghỉ cuối chặng. Ví dụ 300 phút ô tô có 30 phút nghỉ, 120 phút đúng có 0 phút nghỉ giữa đường. Dùng cùng chính sách cho các chặng di chuyển, cộng dồn thời gian lái giữa các điểm trong cùng ngày; thời gian tham quan tối thiểu 15 phút được tính là ngắt quãng và bắt đầu lại bộ đếm. Chưa có dữ liệu routing thì không dùng phần nghỉ để tạo tổng thời gian giả. Đây là chính sách xếp lịch có thể hiệu chỉnh, không phải quy định pháp luật hoặc chứng nhận an toàn; chưa bao gồm một bữa ăn riêng.
- **Q19:** Nếu ngày đầu chỉ di chuyển, dùng điểm đến đủ điều kiện đầu tiên của ngày tham quan tiếp theo làm mốc đến có tên/tọa độ rõ ràng, công khai rằng đó là mốc định tuyến, không phải nơi nghỉ được đặt. Ngày kế tiếp vẫn giữ phạm vi hiện tại chưa tính đường ra/vào chỗ nghỉ. Không tự đặt một tọa độ qua đêm khác hoặc thêm điểm tham quan ngày đầu.
- **Q20:** Chuyến cũ thiếu origin vẫn cho sửa các lượt tham quan theo điều kiện kiểm tra hiện hành và ghi rõ chưa tính đi/về. Khi chủ động bổ sung nơi/giờ đi-về, phải đủ input và kiểm tra cả hành trình trước xác nhận; áp dụng giới hạn trước chuyến tại Q17. Không hồi tố bắt mọi chuyến cũ bổ sung origin chỉ để sửa một điểm.
- **Q21:** Chuyến có giờ xuất phát: dùng ngày + giờ xuất phát Việt Nam làm mốc chặn sửa nơi/giờ. Chuyến cũ thiếu giờ: dùng 00:00 ngày bắt đầu, không bịa giờ khởi hành. Giữ cách phân loại trạng thái chuyến theo ngày hiện hành; quy tắc giờ này chỉ áp dụng quyền thay đổi nơi/giờ của tính năng mới. Đánh dấu hoàn tất luôn chặn thao tác mới.

## Vòng 6 — đã được người dùng đồng ý

Người dùng trả lời “có” cho Q22. **Quyết định:** Nếu ngày cuối còn tham quan, hệ thống tự tính bắt đầu về ngay sau lượt tham quan cuối, gồm nghỉ dự kiến Q18 và phải tới nơi không muộn hơn hạn về Q5. Không hỏi thêm giờ bắt đầu chặng về cho trường hợp này. Nếu ngày cuối chỉ về, dùng giờ bắt đầu người dùng chọn theo Q13 và dùng điểm tham quan cuối của ngày trước làm mốc định tuyến; ghi rõ chưa tính đường từ chỗ nghỉ đến mốc đó. Không đồng thời tính chặng về ở cuối ngày trước hoặc coi đã quay về rồi đi tiếp ngày cuối.

Khi cộng thời gian nghỉ làm vượt hạn về hoặc kéo sang ngày sau: giữ nguyên quy tắc đã chốt Q3/Q9/Q10, trả phương án chưa khả thi và gợi ý người dùng giảm điểm/tăng ngày/đổi giờ. Không tự bớt thời gian nghỉ, bớt must-visit, đổi ngày hoặc chứng nhận PASS. Đây là hệ quả của quyết định đã duyệt, không mở lại một câu hỏi trùng lặp.

**Sự thật đã xác minh:** `trip-edit/trip-edit-service.ts` hiện khóa startDate/durationDays/transport qua `assertCandidateMatchesTrip`, chưa có origin/time; ordinary EDIT chưa có status guard tương đương in-trip. UI ẩn sửa khi hoàn tất không chứng minh API đã chặn. Vì vậy quyền sửa nơi/giờ trước chuyến là yêu cầu mới cần thiết kế, không phải khả năng có sẵn. `trip-read/trip-read-service.ts` cho active MEMBER đọc `getMyTrip`; đưa origin vào DTO dùng chung mà không lọc vai trò sẽ làm lộ vị trí cho thành viên. Chưa sửa các luồng này.

## Ràng buộc giữ nguyên

- Nơi xuất phát ngoài Hà Giang không tự mở rộng danh sách điểm tham quan sang nhiều tỉnh.
- Không để AI tự ước lượng thay dữ liệu routing bắt buộc; không coi thiếu dữ liệu là PASS.
- Giữ xác thực, quyền sở hữu, xác nhận lưu riêng và hợp đồng SUCCESS/FAILED/UNKNOWN cùng idempotency.
- Chưa có quyết định ADR hoặc story READY. Chỉ lập kế hoạch; cần yêu cầu triển khai rõ ràng của người dùng trước khi viết code.

## Kế hoạch triển khai đề xuất — chưa thực hiện

1. **Hợp đồng dữ liệu và migration:** định nghĩa nơi xuất phát đã xác nhận (tên, tọa độ, nguồn), giờ đi và hạn về; phân biệt thiếu dữ liệu với giá trị đã chọn. Migration cộng thêm, trường nullable cho chuyến cũ. Thiết kế bảng admission/cache tìm kiếm dùng chung giữa các instance, không dùng limiter trong bộ nhớ như giới hạn toàn ứng dụng.
2. **Tìm nơi xuất phát:** endpoint chỉ cho Traveler/Admin, xác thực trước đọc body/gọi provider, giới hạn payload/timeout/response. Nominatim chỉ gọi theo thao tác Tìm, nhận diện ứng dụng, cache kết quả, giới hạn tối đa một upstream request/giây cho toàn ứng dụng và cho đổi endpoint bằng cấu hình. Không gửi nhu cầu chuyến đi, ghi chú hoặc dữ liệu cá nhân/bí mật sang dịch vụ tìm kiếm.
3. **Form và Assistant V2:** một bộ chọn dùng chung: nhập tên → bấm Tìm → chọn kết quả → xác nhận ghim; hỗ trợ ghim/tọa độ thủ công khi search lỗi. Đổi tên tìm kiếm/vị trí phải bỏ xác nhận cũ. Thêm giờ đi/hạn về, hiển thị dữ liệu chưa biết và ghi nguồn OpenStreetMap. V2 dùng thao tác nơi xuất phát riêng, không nhầm với vị trí hiện tại trong chuyến đi; AI không tự tạo tọa độ.
4. **Planner và Validator:** mô hình endpoint riêng cho nơi xuất phát, không giả làm Destination. Định hướng tuyến theo nơi xuất phát và thêm hai chặng outbound/return vào cùng deadline routing tối đa 10 giây. Với tối đa 28 điểm, ngân sách dự kiến tăng từ 27 lên 29 chặng, giữ ba chặng đang gọi đồng thời. Xếp giờ theo chặng đi/hạn về; hỗ trợ ngày đầu/cuối chỉ di chuyển và phân biệt chúng với ngày rỗng do thiếu dữ liệu. Không tăng ngày, bỏ must-visit hoặc tự thêm lái xuyên đêm.
5. **Lưu, đọc và sửa:** giữ nơi/giờ đi-về qua mọi bước review/conversion/checkpoint/refinement. Trước lưu/apply, đọc dữ liệu điểm đến hiện tại và kiểm tra lại hai chặng; giữ hợp đồng idempotency và UNKNOWN. Thay đổi thông tin tạo phương án riêng, chưa ghi đè chuyến đã lưu. Chuyến cũ đọc được với ghi chú thiếu thông tin. Không tự công khai tọa độ xuất phát riêng tư qua bài đăng tìm bạn đồng hành.
6. **Kiểm chứng và bàn giao:** kiểm tra form + Assistant, đầy đủ/thiếu nơi/giờ, đổi nơi, một ngày, nhiều ngày, ngày chỉ đi đường, không còn thời gian tham quan, lỗi routing, lái xuyên đêm, giả mạo request, thay dữ liệu sau preview, retry UNKNOWN, tương thích chuyến cũ. Test PostgreSQL riêng cho migration, shared admission nhiều worker, cache và idempotency; chạy typecheck/build/tests phù hợp, browser desktop/mobile/keyboard và git diff --check. Báo riêng những bước chưa chạy hoặc phụ thuộc môi trường.

### Phụ thuộc và giới hạn cần ghi trong implementation story

- Nominatim public dành cho lưu lượng vừa phải và có thể rút quyền truy cập; có fallback ghim thủ công, không hứa tìm kiếm luôn sẵn có.
- Xác minh nhận diện ứng dụng/contact và endpoint triển khai trước live acceptance. Chưa sửa env, thêm key hay đăng ký dịch vụ.
- Chưa biết tọa độ chỗ nghỉ: phải tiếp tục ghi rõ giới hạn này, không tuyên bố đã tính chặng ra/vào nơi nghỉ.
- Phân bổ giờ ngày chỉ về theo Q13/Q22 và tương thích chuyến cũ theo Q20 phải được kiểm chứng khi triển khai; không suy ra từ code nháp đã gỡ.
- Chưa áp dụng migration vào Development hoặc Production; việc triển khai/deploy không tự động được cho phép từ plan này.

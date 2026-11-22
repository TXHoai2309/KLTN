# Plan bổ sung nơi xuất phát và tính chặng đi/về

**Trạng thái: PLAN REVIEW — chưa code.** Q1–Q22 đã được người dùng đồng ý trong [phỏng vấn thiết kế](trip-origin-design.md). Việc duyệt tài liệu này không cho phép triển khai. Chỉ bắt đầu khi người dùng ra lệnh code rõ ràng; không tự chạy migration, thay env hoặc deploy.

## Kết quả người dùng sẽ nhận

Người dùng chọn nơi xuất phát thực tế tại Việt Nam, giờ khởi hành và hạn về. Lịch trình tính cả đi, tham quan, nghỉ dọc đường và về trong đúng số ngày đã chọn. Điểm tham quan vẫn thuộc phạm vi Hà Giang; một phương tiện ô tô hoặc xe máy dùng xuyên suốt chuyến.

Ví dụ: “3 ngày từ Hà Nội, đi lúc 06:00, về trước 21:00 ngày cuối” không được hiểu thành ba ngày tham quan cộng thêm hai ngày đi đường. Hệ thống phải dành thời gian cho hai chặng đó trước khi kết luận lịch khả thi.

## Trải nghiệm đã chốt

1. Form tạo hành trình và Assistant dùng cùng bộ chọn nơi xuất phát: nhập tên → bấm **Tìm** → chọn kết quả → kiểm tra/chỉnh ghim → **Xác nhận nơi xuất phát**. Không tự lấy tâm Hà Nội hoặc tọa độ camera làm vị trí đã chọn. Khi search lỗi, vẫn chọn ghim/tọa độ thủ công.
2. MapLibre hiển thị bản đồ; Nominatim tìm tên theo thao tác người dùng; Stadia tiếp tục tính đường. Không cần Google APIs hoặc nâng gói Stadia. Không autocomplete Nominatim.
3. Nhập giờ đi ngày đầu và giờ muốn về tới nơi ngày cuối, theo giờ Việt Nam. Chỉ hỏi thêm giờ bắt đầu về khi ngày cuối chỉ di chuyển. Nếu ngày cuối còn tham quan, hệ thống tự xếp chặng về sau điểm cuối.
4. Ngày đầu/cuối có thể chỉ đi đường. Ngày đầu dùng điểm tham quan đầu tiên của ngày sau làm mốc đến; ngày chỉ về dùng điểm tham quan cuối ngày trước làm mốc xuất phát. Hiển thị rõ đây là mốc định tuyến, chưa tính đường ra/vào nơi nghỉ; không tạo lượt tham quan giả.
5. Vẫn cho xem đề xuất sơ bộ khi thiếu nơi/giờ, kèm trạng thái chưa đủ dữ liệu. Muốn lưu chuyến mới phải đủ thông tin và đạt các kiểm tra bắt buộc. Lưu vẫn là một xác nhận riêng.

## Quy tắc tính lịch

| Thành phần | Quy tắc |
| --- | --- |
| Thời gian chạy xe | Dùng routing phía server; không thay bằng thời gian do AI đoán hoặc khoảng cách đường chim bay. |
| Nghỉ dự kiến | Ô tô: 15 phút sau mỗi 120 phút lái. Xe máy: 15 phút sau mỗi 90 phút lái. Chỉ cộng nghỉ trước khi tới nơi; không thêm nghỉ cuối chặng. |
| Tích lũy thời gian lái | Cộng qua các chặng trong ngày; tham quan từ 15 phút là ngắt quãng và bắt đầu lại bộ đếm. Qua ngày mới bắt đầu lại. |
| Minh bạch thời gian | Hiển thị riêng chạy xe và nghỉ dự kiến. Nghỉ là chính sách xếp lịch có thể hiệu chỉnh, không phải dữ liệu provider hoặc chứng nhận an toàn. Chưa thêm bữa ăn riêng. |
| Tham quan | 08:00–18:00 và trong giờ mở cửa, đủ thời lượng tối thiểu. |
| Đi/về | Có thể ngoài khung tham quan nhưng không chạy sang ngày hôm sau. Không giới thiệu kết quả là bảo đảm giao thông/thời tiết/an toàn. |
| Chặng về | Sau lượt tham quan cuối, hoặc theo giờ đã chọn cho ngày chỉ về; phải tới nơi không muộn hơn hạn về. |
| Thiếu routing | INSUFFICIENT_DATA, không PASS và không chứng minh chuyến bất khả thi. |
| Không đủ thời gian | Báo phương án chưa khả thi, gợi ý giảm điểm/tăng ngày/đổi giờ; không tự bỏ must-visit, giảm nghỉ hoặc tăng ngày. |

Ví dụ kiểm tra chính sách nghỉ: chạy ô tô 300 phút liên tục có 30 phút nghỉ; đúng 120 phút tới nơi không cộng nghỉ cuối chặng. Nếu còn lái tiếp mà chưa có khoảng ngắt đủ 15 phút, bộ đếm chưa được đặt lại.

## Chuyến lưu, chỉnh sửa và quyền xem

- Nơi xuất phát chính xác thuộc chủ chuyến. Lọc địa chỉ/tọa độ/đường vẽ/chặng liên quan khỏi dữ liệu trả cho Guest, thành viên đồng hành và Admin không sở hữu chuyến. Không tự lấy nơi xuất phát làm điểm hẹn nhóm.
- Chỉ đổi nơi/giờ đi-về trước ngày + giờ khởi hành và trước khi đánh dấu hoàn tất; kiểm tra trên server. Chuyến cũ thiếu giờ dùng 00:00 ngày bắt đầu làm mốc chặn thao tác mới. Nhãn trạng thái chuyến theo ngày hiện hành không đổi.
- Đổi nơi/giờ tạo phương án riêng, tính và kiểm tra lại; chuyến đã lưu chỉ thay đổi sau xác nhận và database xác nhận ghi thành công. Hỗ trợ khi đang đi vẫn dùng vị trí hiện tại theo luồng in-trip.
- Chuyến cũ chưa có nơi xuất phát vẫn đọc/sửa lượt tham quan theo điều kiện hiện hành với ghi chú chưa tính hai chặng. Khi chủ động bổ sung chức năng xuất phát, phải đủ dữ liệu, đạt kiểm tra toàn chuyến và thuộc thời điểm được phép sửa.
- SUCCESS/FAILED/UNKNOWN và idempotency giữ nguyên. Retry UNKNOWN dùng đúng payload/key đã xác nhận, bao gồm nơi/giờ và chính sách tính đã gắn với phương án; không tự tạo yêu cầu khác.

## Đầu việc và thứ tự triển khai dự kiến

Mọi đầu việc dưới đây đều **chưa bắt đầu**. Đây là phân rã để review, không phải backlog đã hoàn thành hoặc lệnh code.

**Cập nhật sau khi dùng to-tickets:** Người dùng đã duyệt [10 ticket theo lát cắt hoàn chỉnh](../../.scratch/trip-origin/README.md), mỗi ticket một file local. Đây là danh sách ticket thực thi thay cho việc coi OR-01–OR-09 bên dưới là các issue độc lập. Bảng OR vẫn mô tả các nhóm công việc kỹ thuật. Duyệt ticket không cho phép code.

| ID | Đầu việc | Phụ thuộc | Điều kiện hoàn thành |
| --- | --- | --- | --- |
| OR-01 | Hợp đồng nơi xuất phát, giờ đi/về và kết quả chặng; migration cộng thêm, tương thích chuyến cũ; mô hình cache/admission chung. | Lệnh code rõ ràng | Có validation, thiếu dữ liệu không bị mặc định, migration qua PostgreSQL riêng, không tự áp shared DB. |
| OR-02 | Tìm địa điểm Nominatim qua backend, cache, admission giữa nhiều instance, timeout/body bound, cấu hình đổi provider, ghi nguồn. | OR-01 | Chỉ gọi khi bấm Tìm; tối đa một upstream request/giây toàn app; cache/retry/lỗi không vượt giới hạn; không lộ lỗi provider hoặc bí mật. |
| OR-03 | Kiểm tra phạm vi Việt Nam cho kết quả search và ghim thủ công bằng dữ liệu địa lý có nguồn/license đã review. | OR-01 | Tọa độ ngoài/không xác định phạm vi bị chặn rõ ràng; không dùng bounding rectangle như bằng chứng đủ. |
| OR-04 | Bộ chọn nơi xuất phát dùng chung và nối form/review, giờ đi/hạn về/giờ về cho ngày chỉ di chuyển. | OR-01–03 | Search/chọn/chỉnh/xác nhận hoạt động; bỏ xác nhận cũ khi đổi dữ liệu; fallback map/search; keyboard/mobile. |
| OR-05 | Chặng xuất phát/kết thúc trong routing; xếp ngày và giờ theo deadline; tự tính nghỉ; Validator dùng cùng quy tắc. | OR-01 | Tối đa 28 điểm + hai chặng biên, dự kiến tối đa 29 cặp dưới cùng hạn 10 giây; không duplicate chặng, nghỉ hoặc visit giả; kiểm tra đủ các trường hợp Q18–Q22. |
| OR-06 | Nối Assistant V2: nhận nơi xuất phát đã xác nhận, cập nhật needs/checkpoint/refinement, hiển thị kết quả và hỏi đúng input còn thiếu. | OR-04–05 | Form/chat dùng cùng contract/engine; AI không bịa tọa độ; thay needs vô hiệu hóa phương án cũ; QA/UNKNOWN không tự sửa lịch. |
| OR-07 | Lưu/đọc/sửa chính thức; fresh validation, lifecycle guards, legacy compatibility và lọc origin theo owner. | OR-01, OR-05 | Gọi trực tiếp API cũng không vượt kiểm tra/quyền; changed-data/revision/idempotency đúng; không lọt origin qua member/public DTO. |
| OR-08 | Tổng hợp UI lịch trình: chặng đi/về, tổng chạy xe/nghỉ, ngày chỉ di chuyển, thiếu dữ liệu và lỗi khả thi. | OR-04–07 | Các tổng dùng cùng dữ liệu, không cộng chặng hai lần; origin map/geometry đúng quyền; desktop/mobile đọc được. |
| OR-09 | Kiểm chứng toàn luồng và cập nhật story/progress/verification. | OR-01–08 | Các nhóm nghiệm thu bên dưới có kết quả và giới hạn rõ; không gộp fixture PASS thành live acceptance. |

## Nhóm nghiệm thu bắt buộc khi được code

| Nhóm | Tình huống cần chứng minh |
| --- | --- |
| Vị trí | Tìm được/không có kết quả; ghim/chỉnh/xác nhận; tên mới không giữ xác nhận cũ; Việt Nam/ngoài phạm vi; map/search lỗi. |
| Thời gian | Một ngày có cả đi và về; đi sớm/về muộn trong ngày; ngày đầu chỉ đi, cuối chỉ về; hạn về sát giờ; nghỉ làm vượt hạn; chặng qua nửa đêm. |
| Nghỉ | Trước/đúng/sau ngưỡng 90/120 phút; hai ngưỡng; cộng dồn chặng; visit ngắn hơn/đủ 15 phút; không cộng nghỉ tại điểm kết thúc. |
| Dữ liệu | Thiếu ngày/nơi/giờ/routing/giờ mở cửa/thời lượng tối thiểu; route timeout/malformed; không biến unknown thành PASS. |
| Bảo toàn | Must-visit không bị bỏ; không tự thêm ngày; không đổi ngày/điểm ngoài scope chỉnh đã xác nhận; dữ liệu gốc giữ nguyên khi hủy/lỗi. |
| Lưu và tranh chấp | Preview → dữ liệu điểm đến/role/revision đổi → save bị kiểm tra lại; UNKNOWN retry cùng payload/key; key cũ payload mới bị chặn; không nhân đôi Trip. |
| Quyền và lifecycle | Chủ/member/Guest/Admin khác; gọi API trực tiếp; trước/đúng/sau giờ đi; chuyến hoàn tất; chuyến cũ thiếu dữ liệu; không lộ origin qua DTO/geometry. |
| Nominatim | Nhiều worker đồng thời, cache hit/miss, timeout/release/retry; admission toàn app đúng; không autocomplete; attribution và cấu hình đổi provider. |
| Tích hợp | Cùng dữ liệu qua form và Assistant cho kết quả nhất quán; popup/full-page, reload và expired proposal theo lifecycle hiện hành. |

Sau thay đổi thực tế: chạy typecheck/build/tests liên quan, PostgreSQL riêng cho migration/admission/persistence, browser desktop/mobile/keyboard, kiểm tra migration state, `git diff --check`, kiểm tra secrets và phạm vi diff. Live AI/routing/search/database acceptance báo tách riêng nếu chưa có môi trường để xác minh.

## Những việc kỹ thuật cần xác minh trước nghiệm thu

- Chọn nguồn dữ liệu phạm vi Việt Nam có license/provenance rõ; chưa có lựa chọn được chứng minh trong phiên plan. Đây là đầu ra OR-03, không cần hỏi người dùng tự tìm dữ kiện.
- Admission Nominatim phải kiểm chứng nhiều instance và khi worker chết; một limiter trong process không đủ. Không giữ transaction database suốt HTTP provider call nếu có thể dùng lease/admission bền vững.
- Review mức lưu cache và nhận diện app/contact trước live request. Không lấy nhãn địa điểm bằng cách gửi tọa độ riêng tư sang reverse geocoding tự động.
- Thay schema, deploy migration, triển khai Preview/Production và push/merge là thao tác riêng; kế hoạch này chưa thực hiện hay cho phép chúng.
- Không hỗ trợ hỗn hợp xe khách/thuê xe, chỗ nghỉ cụ thể, ăn uống riêng, tối ưu tuyến phức tạp hoặc điểm tham quan ngoài Hà Giang trong lần này.

## Hồ sơ hiện tại

- [Phỏng vấn Q1–Q22](trip-origin-design.md): các quyết định và điều chỉnh theo người dùng.
- [Story và acceptance criteria](../stories/TRIP-ORIGIN-ROUND-TRIP.md): hợp đồng cho triển khai sau này.
- [Glossary](../../GLOSSARY.md): nơi xuất phát, chặng về và thời gian nghỉ dự kiến.
- Trạng thái hiện tại: chỉ tài liệu thay đổi; chưa có tính năng mới, chưa migration/database write/deploy. Hoàn tất review vẫn tiếp tục chờ lệnh code rõ ràng.

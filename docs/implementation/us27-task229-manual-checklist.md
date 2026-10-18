# US-27 Task 229 — Checklist browser do Đào Duy Bình thực hiện

Trạng thái ban đầu của **mọi mục là NOT PROVEN**. Tài liệu này là checklist, không phải evidence browser. Người chạy tự ghi PASS/FAIL/BLOCKED, ngày giờ, browser, ảnh/video hoặc mô tả kết quả thực tế; không tick PASS chỉ vì Vitest xanh.

## Chuẩn bị và cách ghi kết quả

- [ ] Mở ứng dụng chính `/trips/new` bằng tài khoản Traveler. Ghi build/commit, ngày giờ, browser và kích thước viewport thực tế; dùng dữ liệu thử, không dùng ghi chú sức khỏe thật.
- [ ] Mỗi case bắt đầu với trang mới để tránh dữ liệu user đã nhập ở case trước. Flow hiện tại: “Mô tả” → “Bổ sung” → “Kiểm tra” → “Đề xuất”. Không bấm tạo Planner, xác nhận lưu Trip hoặc dùng endpoint ngoài US-24→27 trong checklist này.
- [ ] Nếu chạy analyze thật, ghi provider availability và response thực tế; AI không bảo đảm phân loại cùng câu giống fixture. Nếu AI lỗi/unavailable, ghi BLOCKED/NOT PROVEN cho đường analyze; vẫn kiểm tra form thủ công. Không chèn mock vào production để tự coi case đã đạt.
- [ ] Để trống ngày bắt đầu hoặc chọn một ngày tương lai hợp lệ. Xác nhận nhu cầu không đồng nghĩa xác nhận/lưu hành trình chính thức.
- [ ] DevTools Network chỉ dùng để quan sát `/analyze`, `/evaluate`, `/check`, payload và response. Không chia sẻ cookie/token/key hoặc raw nội dung riêng trong evidence.

| Case | Kết quả người chạy | Evidence / ghi chú |
| --- | --- | --- |
| M1 Thiếu thời lượng | NOT PROVEN | Chưa chạy |
| M2 Thiếu phương tiện | NOT PROVEN | Chưa chạy |
| M3a Phương tiện không hỗ trợ | NOT PROVEN | Chưa chạy |
| M3b Phương tiện mơ hồ | NOT PROVEN | Chưa chạy |
| M4 Dữ liệu mâu thuẫn | NOT PROVEN | Chưa chạy |
| A1 Viewport 360px | NOT PROVEN | Chưa đo |
| A2 Focus / keyboard | NOT PROVEN | Chưa chạy |
| A3 aria-live / screen reader | NOT PROVEN | Chưa nghe thử |

## M1 — Thiếu thời lượng

Câu thử: `Đi Hà Giang bằng ô tô, tôi chưa chốt số ngày.`

- [ ] Phân tích, quan sát kết quả: chưa có số ngày xác định; trường số ngày không được tự điền giá trị mặc định. Ghi response thực tế, gồm status/clarification nếu được trả.
- [ ] Ở “Bổ sung”, để trống số ngày; thử tiếp tục. Hệ thống báo thiếu số ngày và chặn bước yêu cầu dữ liệu đủ. Nếu form chặn trước review, ghi đúng điểm chặn này, không tuyên bố đã thấy panel review.
- [ ] Nhập số ngày không hợp lệ (0 hoặc 15) rồi thử lại: lỗi vẫn hiện, không được xác nhận. Nhập 3 ngày: lỗi của trường được giải quyết; giá trị phương tiện user đã chọn không bị đổi.
- [ ] Vào “Kiểm tra” khi đủ dữ liệu. Nếu còn BLOCKING, “Xác nhận nhu cầu” vẫn khóa. Sau khi giải quyết đủ, tích “Tôi đã kiểm tra các thông tin trên” và xác nhận: quan sát `/check`; chỉ response `confirmable: true` mới có snapshot nhu cầu đã kiểm tra.
- [ ] Quay về chỉnh số ngày/xóa số ngày và kiểm tra lại: kết quả xác nhận cũ không được dùng tiếp cho dữ liệu đã đổi; thiếu số ngày phải bị chặn trở lại.

## M2 — Thiếu phương tiện

Câu thử: `Đi Hà Giang 3 ngày, chưa chọn phương tiện.`

- [ ] Kết quả phân tích và form giữ phương tiện trống; không tự chọn xe máy/ô tô. Thử tiếp tục khi chưa chọn: có lỗi và không vượt gate thiếu phương tiện.
- [ ] Nếu CHOOSE_ONE xuất hiện, có đúng “Xe máy” và “Ô tô”, cả hai ban đầu chưa chọn; “Lưu lựa chọn” chưa thể dùng khi chưa chọn. BLOCKING không có thao tác bỏ qua để vượt gate.
- [ ] Chủ động chọn “Xe máy” hoặc “Ô tô”, rồi lưu lựa chọn (nếu dùng panel) và kiểm tra lại. Giá trị được chọn là giá trị gửi `/check`; không bị đổi sang lựa chọn khác.
- [ ] Chỉ khi đủ các trường bắt buộc, không edit/check đang chạy và đã tích acknowledgement thì có thể xác nhận. Xóa phương tiện sau đó phải chặn lại, không giữ snapshot xác nhận cho dữ liệu cũ.

## M3 — Phương tiện không hỗ trợ / mơ hồ

Chạy riêng từng câu trong phiên mới:

- Không hỗ trợ: `Đi Hà Giang 3 ngày bằng xe đạp.` (có thể thử thêm `grab`).
- Mơ hồ: `Đi Hà Giang 3 ngày, tự lái.` (có thể thử thêm `đi xe`).

- [ ] Nội dung/source được hiển thị như plain text. Với kết quả còn unresolved, không tự chuyển sang CAR/MOTORCYCLE; form và review không chọn sẵn phương tiện để thay user.
- [ ] Có thông điệp chỉ hỗ trợ xe máy/ô tô hoặc yêu cầu chọn rõ; tình trạng chưa rõ vẫn chặn qua form/review gate phù hợp. Ghi rõ đã thấy `UNSUPPORTED`, `AMBIGUOUS` hay output khác; output bất ngờ cần ghi lại, không tự sửa evidence thành đúng fixture.
- [ ] Nếu có CHOOSE_ONE, thử Tab/arrow/Space, chọn phương tiện rõ ràng và “Lưu lựa chọn”. Chỉ thao tác user mới tạo lựa chọn; source ban đầu vẫn được giữ như provenance, không bị đổi thành câu AI đã hiểu đúng từ đầu.
- [ ] Chạy `/check` sau khi sửa, quan sát `confirmable` và giá trị transport. Nếu còn blocker khác thì vẫn không xác nhận; không lấy “đã phân tích xong” làm bằng chứng đủ dữ liệu.

## M4 — Dữ liệu mâu thuẫn

Câu thử: `Đi Hà Giang 2-3 ngày, xe máy hoặc ô tô.`

- [ ] Không tự chọn 2 hay 3 ngày, xe máy hay ô tô như thể user đã chốt. Khi source contradiction được nhận diện, duration và transport đều unresolved; transport conflict hiện qua `AMBIGUOUS` + reason `CONFLICT` theo contract hiện có, không cần status mới.
- [ ] Chỉ sửa số ngày thành 3, vẫn để phương tiện chưa chọn: gate vẫn đóng, chưa được xác nhận. Sau đó chọn rõ phương tiện: chỉ khi không còn BLOCKING mới đi tiếp được.
- [ ] Nếu form buộc điền đủ trước review, ghi đúng hành vi gate ở “Bổ sung”; không đánh PASS cho panel conflict chưa thật sự được mở.
- [ ] Ở review khi đủ dữ liệu, kiểm tra số ngày/phương tiện đã sửa, tích acknowledgement và chạy `/check`. Sau khi sửa tiếp một trường đã xác nhận, hệ thống phải yêu cầu kiểm tra lại, không dùng snapshot cũ.
- [ ] Case phụ nếu các controls có sẵn: SOLO + YOUNG_CHILDREN phải bị chặn theo rule code đang PROPOSED; PACKED + AVOID_LONG_WALKING chỉ là warning/advisory. Ghi behavior thực tế; kết quả test không đồng nghĩa owner đã duyệt các rule PROPOSED.

## A1 — Responsive tại đúng 360px

- [ ] Đặt viewport DevTools **360 CSS px**; kiểm tra `window.innerWidth` đúng 360, không chỉ ước lượng chiều rộng cửa sổ.
- [ ] Chạy lại M1–M4 tại viewport này: tab, source text dài, panel/field error, radio, “Lưu lựa chọn”, “Lưu thay đổi”, “Hủy” và nút xác nhận không bị cắt/đè.
- [ ] Quan sát/đo `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; không cần kéo ngang để đọc hoặc thao tác nội dung chính. Ghi số đo và ảnh cho cả lỗi dài/panel mở, không chỉ màn trống.
- [ ] Kiểm tra vùng bấm và focus nhìn thấy được; các controls mục tiêu tối thiểu 44px theo UI contract. Bổ sung dark/light nếu có thể; chưa thử thì để NOT PROVEN.

## A2 — Focus và keyboard

- [ ] Dùng Tab/Shift+Tab, Enter/Space và phím mũi tên điều hướng flow tabs/radio; không bị trap focus hoặc nhảy sang tab đang khóa.
- [ ] Vào review, xác định focus hiện tại có hợp lý và nhìn thấy được; panel không tự giật focus khỏi thao tác đang làm. Ghi element thực tế, không suy từ source `focus()`.
- [ ] Nếu panel đang có item: “Đi tới mục …” đưa đến đúng hàng; “Nhập …” mở đúng editor và focus input; sửa rồi “Lưu thay đổi”/“Hủy”/Escape trả focus về nút sửa của hàng phù hợp.
- [ ] CHOOSE_ONE không tự focus/chọn radio đầu tiên như một quyết định thay user. Sau lựa chọn, focus còn ở vị trí sử dụng được và không mất vào DOM đã unmount.
- [ ] Trong khi edit/check hoặc chưa acknowledgement, xác nhận bị khóa có lý do bằng text; error liên kết về đúng trường và không mất dữ liệu đã nhập.

## A3 — aria-live và screen reader

- [ ] Bật screen reader (ghi tên/phiên bản). Nghe summary/count của panel khi có blocker, thay đổi số mục bắt buộc/khuyến nghị và trạng thái check. DOM có `aria-live` chỉ là source evidence, chưa đủ PASS cho trải nghiệm nghe.
- [ ] Sau khi giải quyết blocker cuối cùng bằng review editor/panel, nghe thông báo `Đã làm rõ đủ thông tin bắt buộc.` hoặc nội dung trạng thái tương ứng; không bị đọc liên tục/trùng gây khó hiểu.
- [ ] Radio có nhóm/nhãn rõ, error đọc được và liên hệ đúng control; PASS/blocked/warning không chỉ phân biệt bằng màu.
- [ ] Chuyển case/nhập nhanh hoặc retry khi mạng lỗi: không đọc response cũ như kết quả hiện tại, không mất draft; ghi điều chưa quan sát là NOT PROVEN.

## Kết thúc và phạm vi chưa chứng minh

- [ ] Người chạy điền bảng kết quả và đính kèm evidence đã bỏ dữ liệu nhạy cảm; FAIL/BLOCKED giữ nguyên để sửa/đối chiếu riêng, không tick thay.
- Checklist này không chứng minh US-28 đã gọi `assertTripRequirementClear`/`assertStartDateForFinalConfirmation` ở server, không chứng minh Validator itinerary hoặc lưu Trip. Hai yêu cầu handoff vẫn DEFERRED và checkbox story giữ nguyên chưa tick.
- Vitest dùng model/auth giả lập và HTTP response functions trong tiến trình; không thay thế browser/real-provider/session evidence của checklist này.

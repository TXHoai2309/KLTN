# Test thủ công: lập hành trình qua chat, không mở form

Phạm vi: [story](../stories/ASSISTANT-CHAT-FIRST-PLANNING.md), Q1–Q7 đã đồng ý. Các ô dưới đây chưa được đánh dấu đã chạy. Mở <http://localhost:3010/assistant>, đăng nhập tài khoản Development, dùng ngày tương lai và tên điểm có thật trong ứng dụng.

| Xong | Mã | Thao tác | Mong đợi |
| --- | --- | --- | --- |
| [ ] | C01 | Nhắn “Tôi muốn tạo hành trình chuyến đi”. | AI hỏi số ngày; không mở form, không lặp câu trả lời. |
| [ ] | C02 | Trả lời chỉ “2”, rồi “Ô tô”. | Hiểu 2 ngày và ô tô, hỏi ý còn thiếu, không bắt nhập lại. |
| [ ] | C03 | Trả lời “chưa chốt ngày”, rồi “bỏ qua” nếu chưa có sở thích. | Cho xem bản tổng hợp chi tiết, ghi rõ ngày chưa chốt và thông tin chưa nêu. |
| [ ] | C04 | Nhắn “Đổi thành xe máy”. Sau bản tổng hợp mới, nhắn “Đúng rồi, tạo đi”. | Sửa đúng thông tin, xác nhận qua chat là tạo luôn; đề xuất chưa có ngày không cho lưu. |
| [ ] | C05 | Nhắn ngày khởi hành cụ thể trong tương lai; xác nhận bản tổng hợp. | Tạo/kiểm tra lại theo ngày, không tự lưu. |
| [ ] | C06 | Nhắn “Thêm một điểm ở ngày 1, bạn gợi ý cho tôi”. | Đưa tối đa 3 điểm thật kèm thông tin phù hợp; không bắt bạn tự nghĩ tên. Thiếu điểm phù hợp phải nói rõ. |
| [ ] | C07 | Nếu có nhiều lựa chọn, nhắn “có”, rồi “chọn số 2”. | “Có” phải được làm rõ; chọn số 2 kiểm tra và áp dụng đúng điểm, chưa lưu Trip. |
| [ ] | C08 | Nhắn “Thay [điểm đang có] ngày 1 bằng điểm khác”, chọn một gợi ý. | Giữ các ngày khác; điểm cũ không quay lại khi tạo lại. Nếu đổi giờ ngày khác, AI trình bày và hỏi thêm trước khi áp dụng. |
| [ ] | C09 | Nhắn “Thêm lại [điểm vừa bỏ] vào ngày 1”. | Có thể đề nghị lại đúng điểm đủ điều kiện; chỉ gỡ loại trừ khi bạn chọn/xác nhận. |
| [ ] | C10 | Nhắn “Thêm [điểm mới] vào ngày 1, bắt buộc phải có”, xác nhận, rồi yêu cầu đổi ngày đó. | Điểm mới tiếp tục là bắt buộc; không âm thầm bỏ nó để tìm phương án khác. |
| [ ] | C11 | Trong lúc AI chờ chọn điểm/lưu, hỏi một câu kiến thức; sau đó nhắn “có”. | Q&A không sửa lịch; câu đồng ý mơ hồ được làm rõ trước khi thực hiện. |
| [ ] | C12 | Đề nghị chỉnh rồi nhắn “Không đổi nữa”; thử cả ca thêm quá nhiều điểm làm chỉnh thất bại. Sau đó tải lại chat. | Hủy không để lại điểm/ngày/nhu cầu đã từ chối. Nếu server đã đổi phiên bản, phục hồi nhu cầu và yêu cầu tạo/kiểm tra lại trước khi lưu. |
| [ ] | C13 | Sau một ca chỉnh thất bại, đổi thêm ngày đi, rồi hủy và tải lại. | Nhu cầu cũ được phục hồi cả trong phiên lẫn sau tải lại; không mang theo điểm bị thêm thất bại. |
| [ ] | C14 | Thu nhỏ khung nổi, chuyển trang, mở lại; sau đó tiếp tục ở trang Assistant. Tải lại riêng một lần. | Trong phiên giữ cuộc trao đổi; sau tải lại lựa chọn cũ hết hiệu lực, phải tạo/gợi ý lại rõ ràng. |
| [ ] | C15 | Khi đủ điều kiện, trả lời đồng ý với câu hỏi riêng về lưu chuyến đi. Mở Trip và tải lại. | Lưu thành công đúng một chuyến, dữ liệu khớp. Sửa Trip đã lưu hướng về trang Trip. |
| [ ] | C16 | Thử 360px, bàn phím Tab/Enter, mất mạng rồi dùng “Kiểm tra lại kết quả”. | Không tràn/che nút; focus rõ. Kết quả chưa rõ không báo thành công và retry không tạo thao tác lưu mới. |

Ghi lỗi bằng mã Cxx, các câu đã nhập, nhu cầu/ngày/phương tiện, mong đợi và thực tế, ảnh chụp, mã lỗi HTTP nếu có. Không chia sẻ cookie/token. Nếu dữ liệu giờ mở cửa/tuyến còn thiếu, việc khóa lưu là đúng; ghi riêng phần thiếu dữ liệu và phần lỗi ứng dụng.

## Owner screenshot regression follow-up, 2026-10-27

- Send an initial planning request and a short follow-up with delayed responses. Each question must appear immediately, the composer clears immediately, and each reply appears once. Type another draft while waiting: completion must preserve it.
- Enter “3”, then “Xe máy”. The next question must ask the departure date. Only an explicit “chưa chốt ngày” may skip it; an old reopened workspace with no date must ask again before regeneration.
- Give an impossible date (31/02/2026) or a past departure date. Expect a conversational clarification, unchanged needs and no uncertain-error state.
- Say “trải nghiệm nhiều nhất có thể”. The recap may record the requested pace, but must not invent companions, group size or specific interests.
- Create a preliminary trip. See a clear missing-date notice, daily schedule first, grouped checks in collapsible details, and a disabled Save with an explanation. Supply a real future date, confirm the updated recap and recheck before saving.
- Open the Assistant map. It must use the Trip's MapLibre/Stadia implementation, fit the complete trip, show every day's markers and only existing verified route geometry. No day dropdown or day/all scope buttons in chat. The separate Trip page retains its normal map controls.
- After generation, the complete map opens automatically. Collapse it, then generate a revised proposal: the new proposal opens its own map. With live services available, expect Stadia road/place labels and provider route shapes, as on the Trip page; missing provider geometry must remain explicitly missing.
- At 360px, 768px and desktop, check full-width mobile input, wrapping, keyboard focus, light/dark, no horizontal overflow, map loading/retry and normal scrolling past the map.


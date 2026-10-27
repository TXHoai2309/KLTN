# Kiểm tra mất lịch sử Assistant — 2026-10-27

**Cập nhật sau audit:** phần lưu account planning dialogue/checkpoint đã được triển khai trong lần follow-up tiếp theo của các ảnh lỗi; xem [báo cáo mới](assistant-dialogue-history-follow-up.md). Nội dung bên dưới là bằng chứng và đề xuất tại thời điểm audit, không phải trạng thái triển khai mới nhất. Các tin nhắn cũ chưa được ghi vẫn không thể phục hồi.

Trạng thái: **đã xác minh nguyên nhân; đề xuất bên dưới chưa triển khai**. Phạm vi yêu cầu lần này là kiểm tra việc lưu DB và hiện tượng mất dữ liệu. Không thay đổi ứng dụng, schema, chính sách lưu trữ hoặc dữ liệu người dùng trong lần kiểm tra này.

## Kết luận

Q&A được lưu vào DB. Phần hội thoại lập hành trình chưa được lưu đầy đủ: tin nhắn và nhu cầu đang thu thập ở trong bộ nhớ trình duyệt; DB chỉ giữ nhu cầu đã đi qua REVIEW và thông tin thao tác lưu. Tải lại trang sẽ mất phần chưa được lưu. Mở lại lịch sử trong cùng phiên cũng xóa mảng tin nhắn planning. Đây không phải bằng chứng Neon tự làm mất dữ liệu.

## Bằng chứng trên hội thoại trong ảnh

Đã xác minh đúng endpoint Development trước khi đọc. Truy vấn trong transaction `BEGIN READ ONLY`, kết thúc bằng `ROLLBACK`; không ghi/sửa/xóa dữ liệu.

Hội thoại `79066a55…2512`:

- Còn tồn tại, thuộc loại USER, chưa xóa; hết hạn ngày **26/11/2026**, không phải hết hạn tại thời điểm kiểm tra 27/10.
- Có đúng **một** `qa_turn` COMPLETED, câu hỏi “tôi muốn tạo hành hình di chuyển”, kết quả `CLARIFICATION_REQUIRED`.
- Có workspace planning **version 0**, `requirement: {}`, chưa có proposal fingerprint, chưa có chuyến đi đã lưu hay thao tác Save chưa rõ kết quả.
- Các câu hỏi/trả lời planning đã từng hiển thị nhưng không được ghi DB không thể khôi phục từ DB hiện tại. Không suy đoán nội dung những lượt đã mất.

Chuỗi mở đầu trong DB không được `isPlanningRequest` nhận ra, nên bị đưa vào luồng Q&A. Đây là lỗi định tuyến do cách nhận diện hiện tại quá hẹp, riêng với hiện tượng lưu lịch sử.

## Đối chiếu code

| Lớp dữ liệu | Hiện tại | Hệ quả |
| --- | --- | --- |
| `qa_conversation` / `qa_turn` | Lưu hội thoại và lượt Q&A | Q&A mở lại được theo retention hiện có |
| `PlanningClient.messages` | Bộ nhớ JS; giới hạn 40 lượt | Không sống qua reload; `reopenHistory()` còn đặt lại `messages: []` |
| Kết quả `ANALYZE` | Trả needs/reply về client, không ghi needs/transcript vào repository | Nhu cầu đang hỏi dở biến mất khi reload |
| `REVIEW` | Lưu nhu cầu đã xác nhận, version và idempotency | Chỉ sau bước này DB mới có nhu cầu đủ để khôi phục |
| `restore()` | Đọc reviewed needs rồi luôn đặt REGENERATE khi chưa Save | Workspace rỗng cũng bị recap “Chưa rõ ngày/phương tiện” và yêu cầu tạo lại |
| Hành trình chưa xác nhận | Không lưu lịch trình nháp dài hạn | Đây là ranh giới đã có; lưu lịch sử chat không được tự biến thành Save chuyến đi |

Mốc code: `planning-service.ts` nhánh ANALYZE/REVIEW; `planning-client.ts` các hàm `reopenHistory`, `restore`, `isPlanningRequest`; `assistant-chat.tsx` gọi `reopenPlanningHistory` khi chọn lịch sử. Quyết định hiện tại nằm trong `docs/stories/ASSISTANT-CONVERSATIONAL-PLANNING.md` phần Server/API and persistence và `ASSISTANT-DIALOGUE-NATURALNESS.md` phần transient retention.

## Tái hiện có thể kiểm chứng

Dùng client thật và `executePlanning` thật với repository/model được kiểm soát, không gọi AI hoặc ghi DB. Lệnh đã chạy hai lần:

```text
npx vitest run src/modules/assistant-planning/planning-history-diagnosis.vitest.test.ts
```

Cả hai lần tái hiện cùng ba kết quả khi kiểm tra kỳ vọng người dùng:

1. Trả lời 3 ngày → client hiện tại có `durationDays = 3` → client mới READ lại cùng hội thoại có `undefined`.
2. Có một trao đổi planning → gọi `reopenHistory()` → mảng trao đổi thành `[]`.
3. `isPlanningRequest("tôi muốn tạo hành hình di chuyển")` trả `false`.

Đây là probe chẩn đoán, **không phải báo cáo đã sửa hoặc test pass**. File probe tạm đã được gỡ khỏi source sau khi ghi nhận, để không đưa các kỳ vọng chưa triển khai vào bộ test hiện hành. Script đọc DB nằm trong `.cache` bị gitignore, không chứa credentials trong source/output. Không chạy migration, model thật, build hoặc browser nghiệm thu cho một lần audit không sửa code.

Kiểm tra bổ sung: hai suite hiện hành `planning-client`/`planning-service` có **24 test pass**; các test này xác nhận hợp đồng hiện tại, không chứng minh đã sửa mất lịch sử. Migration preflight chỉ đọc xác nhận bảng planning tồn tại và **không có migration pending**. `git diff --check` pass.

## Hướng sửa đề xuất để duyệt

1. Lưu từng lượt planning đã gửi và phản hồi AI dạng văn bản vào DB của tài khoản; lưu checkpoint nhu cầu đang thu thập, câu hỏi đang chờ và trạng thái làm rõ. Checkpoint phải ghi rõ **chưa xác nhận**, tách khỏi reviewed needs được dùng để tạo/lưu chuyến đi.
2. Append lượt hội thoại và cập nhật checkpoint trong cùng transaction, có revision/ownership/idempotency. Response mất mạng được đối soát với cùng key; không nhân đôi lượt hoặc báo đã lưu trước khi DB xác nhận.
3. READ khôi phục transcript/checkpoint và tiếp tục câu còn thiếu. Mở lại lịch sử giữ văn bản trao đổi; chỉ hủy hiệu lực lựa chọn/đề xuất tạm. Chỉ hỏi tạo lại khi thực sự có đề xuất cũ, không recap một workspace rỗng.
4. Bổ sung migration Prisma cho lượt planning/checkpoint; dùng chung lifecycle xóa/hết hạn hội thoại. API vẫn kiểm tra quyền và ownership; không có Admin bypass. Không thêm lưu trữ hoặc tự nhập lịch sử Guest vào tài khoản.
5. Lưu văn bản hội thoại và nhu cầu **không** đồng nghĩa lưu lịch trình chưa xác nhận. Không ghi các ngày/điểm/giờ của proposal chưa hợp lệ vào checkpoint, transcript JSON hay replay. Official Save tiếp tục đòi xác nhận riêng, dữ liệu đầy đủ và Validator mới.
6. Sửa nhận diện yêu cầu planning với cách diễn đạt/lỗi gõ trong ảnh, tránh đưa nhầm sang Q&A. Giữ model Luna/high; không thay quyền của Guest.

Nghiệm thu hướng sửa: reload khi mới trả lời 1–2 câu vẫn còn tin nhắn và tiếp tục đúng câu; chuyển chat rồi quay lại không mất; retry không trùng; tài khoản khác không đọc được; xóa/hết hạn xóa cả transcript/checkpoint; không tự generation/Save; trường hợp không có dữ liệu cũ không được hứa khôi phục.

Đề xuất này thay đổi phạm vi persistence đã chấp thuận trước đó, nên phải được chốt thành yêu cầu tiếp theo trước khi triển khai migration. Audit hiện tại chỉ xác minh và làm rõ lựa chọn đó.

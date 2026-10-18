# US-33 — Chỉnh sửa hành trình bằng hội thoại AI

## Status

DRAFT

## Epic

Quản lý hành trình đã lưu và hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Constraint Validator) và Tô Xuân Hoài (Planner/schema itinerary).

## Goal

Là Du khách, tôi muốn yêu cầu AI chỉnh sửa hành trình bằng hội thoại để thay đổi kế hoạch bằng ngôn ngữ tự nhiên.

## Outcome

Story DRAFT cho task 271–277. AI chỉ tạo đề xuất tách biệt. Du khách xem phương án, kết quả Constraint Validator, rồi chủ động xác nhận hoặc hủy. Chỉ luồng apply đã được xác nhận của US-32 mới được ghi hành trình.

## Source References

- [Product Document — Edit, save, and in-trip support](../product/product-spec.md#edit-save-and-in-trip-support): AI đề xuất, Du khách xác nhận, Validator quyết định; phương án không hợp lệ không được lưu.
- [User Flow — Edit itinerary](../flow/user-flow.md#edit-itinerary): candidate tách khỏi hành trình hiện tại, kiểm tra lại, xác nhận để áp dụng hoặc hủy để giữ nguyên.
- [US-32 — Chỉnh sửa thủ công hành trình](US-32-manual-itinerary-edit.md): candidate, preview và apply dùng chung.
- [ADR-08, ADR-09, ADR-10, ADR-16](../decisions.md): quyền sở hữu và ghi dữ liệu, ranh giới transaction/provider, xử lý structured output và giới hạn dịch vụ AI.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 271 | [AI] Thiết kế structured output cho yêu cầu chỉnh sửa hành trình |
| 272 | [AI] Implement nhận diện ý định và phần hành trình bị ảnh hưởng |
| 273 | [BE/API] Sinh phương án chỉnh sửa riêng từ hành trình hiện tại |
| 274 | [AI/BE] Yêu cầu làm rõ khi yêu cầu chỉnh sửa không đủ rõ |
| 275 | [BE] Chạy Constraint Validator cho phương án AI đề xuất |
| 276 | [FE] Hiển thị đề xuất chưa áp dụng và cho phép xác nhận/hủy |
| 277 | [TEST] Kiểm thử chỉnh sửa hội thoại và đảm bảo AI không tự ghi đè hành trình |

## In Scope

- Nhận yêu cầu chỉnh sửa bằng ngôn ngữ tự nhiên và chuyển thành ý định có cấu trúc.
- Xác minh ý định, visit, destination và phạm vi bị ảnh hưởng với dữ liệu hành trình/điểm đến do server đọc.
- Tạo candidate riêng bằng các hàm thuần của US-32; yêu cầu thiếu rõ ràng được trả về dưới dạng bước làm rõ.
- Chạy lại Constraint Validator trên phương án; hiển thị diff và kết quả trước khi xác nhận.
- Tái sử dụng luồng apply của US-32 với `kind: 'AI'` sau xác nhận rõ ràng của Du khách.

## Out of Scope

- Chỉnh sửa thủ công là US-32; US-33 được phép tái sử dụng candidate, preview, apply và UI chung của US-32.
- Chỉnh sửa trong chuyến đi thuộc US-36/US-37.
- Tạo hành trình mới thuộc US-28.
- AI tự ghi, tự áp dụng hoặc tự xác nhận tính hợp lệ của candidate; lưu hội thoại hoặc candidate dài hạn; thay đổi Prisma schema/migration.

## Business Rules

- AI chỉ trả ý định có cấu trúc; server áp thao tác xác định lên bản sao của hành trình bằng hàm US-32. AI không viết lại toàn bộ itinerary.
- Đầu ra model không đáng tin: parse bằng schema Zod strict, rồi server xác minh lại `visitId`, `destinationId`, ngày và tham số với hành trình/điểm đến hiện hành. ID không tồn tại hoặc không thuộc Trip không được dùng; hệ thống yêu cầu làm rõ khi có thể, nếu không thì trả lỗi phù hợp.
- Nội dung người dùng và nội dung điểm đến là dữ liệu, không phải chỉ thị cho hệ thống. Giới hạn độ dài message/context; không lưu hoặc log văn bản thô của người dùng hay phản hồi model.
- Câu hỏi và lựa chọn làm rõ do code tạo. Nếu người dùng gửi `resolution`, server xác minh lựa chọn đó rồi đánh giá lại yêu cầu; không tin resolution hoặc ý định do client/model khẳng định.
- Candidate là dữ liệu tạm trong phiên và không được ghi DB bởi endpoint AI. Hủy hoặc bỏ candidate giữ nguyên hành trình đã lưu.
- Validator xác định PASS, VIOLATION hoặc INSUFFICIENT_DATA. INSUFFICIENT_DATA không phải PASS. Chỉ mọi check PASS mới đủ điều kiện xác nhận.
- Chỉ Traveler được dùng tính năng. Auth chạy trước khi đọc body; Trip được truy vấn theo `id` và `userId` từ session. Trip không tồn tại/không thuộc chủ cùng trả 404. Guest nhận 401; Admin nhận 403.
- Mọi response riêng tư dùng `Cache-Control: private, no-store`. Route Handler mỏng; ownership và rule nghiệp vụ nằm trong service.
- Mọi lần gọi OpenAI/Google Routes chạy ngoài transaction callback. Hàm lõi nhận mốc thời gian nghiệp vụ qua tham số và dùng múi giờ `Asia/Ho_Chi_Minh` theo contract của US-32/Validator.

## Roles / Ownership

- **Traveler:** đọc Trip của chính mình, gửi yêu cầu, xem candidate/validation, xác nhận apply hoặc hủy.
- **Guest:** không truy cập được endpoint; 401.
- **Admin:** không dùng tính năng Traveler; 403, không bypass.
- Ownership được kiểm tra phía server bằng `Trip WHERE id AND userId`, trong đó `userId` chỉ lấy từ session. Mọi visit/day và destination trong yêu cầu phải được đối chiếu với Trip và dữ liệu VISIBLE do server truy vấn.

## UX / UI Contract

- Hiển thị trạng thái đang tạo đề xuất, cần làm rõ, đề xuất chưa áp dụng, kết quả từng nhóm Validator, lỗi/retry, revision conflict, đang áp dụng, thành công và hủy.
- Bản xem trước nêu diff và visit/ngày liên quan khi Validator cung cấp thông tin đó. INSUFFICIENT_DATA được trình bày riêng và không làm bật nút xác nhận.
- Nút xác nhận chỉ khả dụng khi tất cả check PASS và candidate vẫn đúng với candidate đã preview. Chỉ báo đã lưu sau khi apply trả SUCCESS.
- Hủy bỏ candidate và không gọi API ghi. Nếu lỗi mạng/timeout ở bước đề xuất, giữ input/candidate để người dùng thử lại.
- UI kế thừa trang chỉnh sửa US-32; hỗ trợ bàn phím, viewport 360px và typed routes theo quy ước ứng dụng. Figma chưa được xác minh cho hội thoại AI.

## Data Contract

### Đề xuất — cần Hoài xác nhận

- Model trả **ý định**: loại thao tác, `visitId` mục tiêu nếu cần, `destinationId` nếu thêm/thay điểm đến, tham số thời gian/thời lượng/vị trí và phần bị ảnh hưởng.
- Server áp ý định lên deep clone bằng `addVisit`, `removeVisit`, `moveVisit`, `setVisitTime`, `setVisitDuration` hoặc `replaceVisit` của US-32; server tự tính diff và phạm vi phải validate.
- Model không trả candidate hoàn chỉnh làm nguồn dữ liệu có thẩm quyền, không tạo câu hỏi/lựa chọn tùy ý và không phát biểu kết quả Validator.
- Hình dạng candidate hiện dùng trong code US-32 gồm metadata Trip và `days[].visits[]`; visit có `visitId`, `destinationId`, `startMinute`, `plannedDurationMinutes`, `order`. Cần Hoài xác nhận adapter với planner itinerary (`day`/`stops`, `arrivalMinute`, `visitDurationMinutes`) và Thai Anh xác nhận contract lưu Trip trước khi coi hình dạng này là baseline tích hợp.

## API Contract

### Endpoint đề xuất — cần Hoài xác nhận

`POST /api/trips/[id]/edits/ai`

Request strict, bounded:

```json
{
  "baseRevision": "<revision token>",
  "message": "<bounded natural-language request>",
  "resolution": "<optional code-generated choice>"
}
```

- Auth Traveler phải hoàn tất trước khi đọc body. Service xác minh ownership/revision trước khi gửi dữ liệu Trip đến provider.
- Candidate/intent được tạo lại cho mỗi request. Clarification response không lưu server state; người dùng có thể viết rõ hơn hoặc gửi code-generated `resolution`, sau đó server xác minh và đánh giá lại.
- Khi cần làm rõ: `{ status: "NEEDS_CLARIFICATION", clarification: { code, prompt, choices? } }`. `prompt` và choices do code tạo.
- Khi có candidate: `{ status: "PROPOSED", candidate, intent, diff, validation }`. `validation` là kết quả bốn nhóm từ `previewEdit`/Constraint Validator, không phải kết quả do model hay client gửi.
- Task 272 tái sử dụng mã lỗi nội bộ `PreferenceExtractionError` của client US-25: timeout → `PROVIDER_TIMEOUT`, refusal/incomplete → `PROVIDER_REFUSAL`, output rỗng/malformed → `INVALID_PROVIDER_RESPONSE`, provider không nhận diện → `PROVIDER_UNAVAILABLE`. Route US-33 sau này phải ánh xạ qua AppError convention hiện có, không tạo envelope mới; ADR-16 vẫn ở trạng thái Proposed.
- Endpoint AI không ghi DB và không gọi apply. Dùng `Cache-Control: private, no-store`.

### Áp dụng

Sau khi người dùng xác nhận candidate hợp lệ, UI gọi endpoint apply của US-32 (`POST /api/trips/[id]/edits/apply`) với `baseRevision`, candidate, `confirmed: true`, `kind: "AI"` và `Idempotency-Key`. Server chạy Validator lại theo contract apply; không tin validation do client gửi.

## Error / Recovery

- Revision không còn hiện hành: trả lỗi conflict theo convention US-32; giữ candidate và yêu cầu preview lại với revision mới theo UX đã thống nhất.
- Destination không còn VISIBLE/đủ điều kiện hoặc ID không hợp lệ: không đề xuất candidate có thể áp dụng; trả lỗi/clarification theo khả năng xác định.
- Provider timeout, refusal, incomplete hoặc malformed output: không ghi DB; giữ input và cho retry theo giới hạn ADR-16. Không log input/response thô.
- Validator VIOLATION hoặc INSUFFICIENT_DATA: hiển thị kết quả, không cho xác nhận. Candidate cũ trong DB không đổi.
- Apply UNKNOWN: dùng lại cùng Idempotency-Key và payload; chỉ hiển thị thành công sau SUCCESS xác nhận từ server.

## Write Semantics

- Endpoint `/edits/ai` và preview không ghi Trip, itinerary hay candidate; không cần idempotency write key cho xử lý đề xuất.
- Chỉ apply của US-32 được ghi sau xác nhận rõ ràng, Validator đạt và ownership/revision còn đúng. Apply dùng `executeIdempotentWrite`, trả SUCCESS/FAILED/UNKNOWN theo convention và tăng revision token sau khi DB xác nhận.
- Cùng key cùng payload được replay; cùng key khác payload bị từ chối theo contract US-32. Retry UNKNOWN giữ nguyên key và payload.
- Validator/provider chạy ngoài transaction callback theo ADR-09. Không báo thành công trước xác nhận DB.

## External Services

- Tái sử dụng generic `StructuredLlmClient`/OpenAI adapter và model hiện có theo định hướng Bình đã xác nhận; không thêm client, biến môi trường hoặc dependency. Adapter hiện cố định JSON Schema name `trip_preference_extraction`; xác nhận tương thích provider/story và phê duyệt ADR-16 vẫn cần trước khi coi tích hợp production là hoàn tất.
- Constraint Validator của Thai Anh là nguồn quyết định; không gửi yêu cầu Google Routes trực tiếp từ AI module và không viết lại rule Validator.
- Nội dung gửi provider phải tối thiểu cần thiết, đã qua auth/ownership, có giới hạn độ dài và không lưu/log dạng thô.

## Acceptance Criteria

- [ ] Task 271: structured output strict biểu diễn intent chỉnh sửa theo schema đã được Hoài xác nhận; dữ liệu thừa/sai bị từ chối.
- [ ] Task 272: nhận diện target/scope được kiểm chứng với dữ liệu server; unknown visit/destination/day không được tin hoặc áp dụng.
- [ ] Task 273: server tạo candidate tách biệt bằng hàm US-32; endpoint AI không ghi DB và không sửa hành trình gốc.
- [ ] Task 274: yêu cầu thiếu rõ ràng trả clarification do code sinh; resolution được server xác minh và mỗi request được đánh giá lại độc lập.
- [ ] Task 275: Validator chạy cho candidate; trả đủ bốn nhóm; VIOLATION và INSUFFICIENT_DATA không đủ điều kiện xác nhận.
- [ ] Task 276: người dùng thấy diff và trạng thái chưa áp dụng; chỉ xác nhận sau mọi check PASS; hủy không gọi API ghi.
- [ ] Apply chỉ qua US-32 sau xác nhận; chỉ SUCCESS từ DB mới cập nhật UI như đã lưu. AI không tự áp dụng hoặc certify.
- [ ] Guest nhận 401, Admin 403, Trip thiếu/không thuộc chủ nhận cùng 404; không gọi provider trước auth/ownership.
- [ ] Input, output model và nội dung destination không được lưu/log dạng thô; độ dài input bị giới hạn; request riêng tư không cache.
- [ ] Task 277 có kiểm thử fake provider/Validator/repository cho thành công, clarification, output không hợp lệ, auth/ownership, Validator fail, hủy, apply/replay và không ghi trước xác nhận.

## Test Plan

- File test mới theo quy ước `*.vitest.test.ts`; dùng fake provider, Validator và persistence, không gọi OpenAI/Google thật hoặc Neon.
- Kiểm tra strict schema: valid intent, extra/malformed field, refusal/incomplete, ID lạ, visit trùng tên, prompt-injection-like message và giới hạn độ dài.
- Kiểm tra auth trước body/provider, ownership 404, Guest 401, Admin 403, revision conflict và destination không còn VISIBLE.
- Kiểm tra clarification do code sinh, resolution giả/không thuộc choices, và mỗi request độc lập tạo lại candidate.
- Kiểm tra bốn nhóm Validator, đặc biệt INSUFFICIENT_DATA không thành PASS; không có lệnh ghi khi chưa xác nhận hoặc khi check không PASS.
- Kiểm tra hủy, chỉ apply sau xác nhận, replay cùng key, payload mismatch, UNKNOWN retry giữ key/payload, và route AI không import/gọi hàm ghi.
- Checklist browser do Bình chạy: viewport 360px, bàn phím, clarification, preview, hủy, điều hướng chưa áp dụng, hai tab. Chưa tick PASS thay người dùng.

## Expected Files

Các đường dẫn dưới đây là phạm vi dự kiến, chưa phải quyết định kiến trúc được duyệt:

- `apps/web/src/modules/trip-edit/edit-intent-contract.ts` và test: schema/kiểu intent strict, JSON Schema và kiểu kết quả đã xác minh (Task 271).
- `apps/web/src/modules/trip-edit/edit-intent-prompt.ts`, `edit-intent-verify.ts`, `edit-intent-service.ts` và các test: dựng prompt allowlist, xác minh output theo dữ liệu server, gọi structured client hiện có (Task 272).
- `apps/web/src/modules/trip-edit/ai-edit-http.ts` và test; `apps/web/src/app/api/trips/[id]/edits/ai/route.ts`: parse/auth/service/error mapping.
- `apps/web/src/modules/trip-edit/` và `apps/web/src/app/trips/[id]/edit/`: chỉ phần logic/UI hội thoại AI; tái sử dụng candidate, diff, preview, Validator panel và apply của US-32.
- `apps/web/src/lib/trip-edit-client.ts`: chỉ bổ sung helper AI nếu thiếu, giữ nguyên các phần US-32.
- `apps/web/src/modules/trip-edit/us33-test.vitest.test.ts` hoặc file test mới phù hợp để bổ sung acceptance tổng hợp.
- `docs/stories/US-33-ai-itinerary-edit.md`, `docs/ai-progress.md`.

## Dependencies

- **US-32:** candidate helpers, `previewEdit`, apply `kind: "AI"`, UI/client hiện có là phụ thuộc trực tiếp. Code US-32 đang hiện diện trong working tree nhưng chưa commit/merge; một số file code đang untracked, nên chưa phải baseline dùng chung. Xác nhận handoff/merge trước khi bắt đầu các task phụ thuộc.
- **Thai Anh — Trip/itinerary/Constraint Validator:** Trip ownership, revision token, saved itinerary fields, destination eligibility và Validator bốn nhóm. Reuse `validateItinerary`/`previewEdit`; không tạo model, schema hoặc Validator thay thế. Trip hiện dùng `updatedAt` làm token trong code US-32; chủ sở hữu cần xác nhận đây là hợp đồng CAS liên nhóm.
- **Hoài — US-28 Planner/schema:** xác nhận hình dạng itinerary và cách ánh xạ planner `day/stops` sang candidate visit US-32; xác nhận hướng model chỉ trả intent. Planner hiện có trong repo là deterministic, không phải OpenAI planner client.
- **OpenAI client:** client có trong `apps/web/src/modules/preference-extraction/openai-structured-client.ts`, transport nhận JSON Schema đầu vào nhưng đang gắn schema name mặc định `trip_preference_extraction`; service/verification xung quanh là preference-specific. Tái sử dụng client/model theo định hướng Bình, sau khi chốt adapter/schema-name; không tạo client/env/dependency mới. `apps/web/src/modules/ai/qa-json-provider.ts` là QA-specific, không mặc định là client cho US-33.
- **Rate limiting:** ADR-16 để chính sách giới hạn AI mở. Repo có quota/guard theo từng feature (ví dụ planner và Q&A), chưa có limiter dùng chung được xác nhận cho endpoint OpenAI của US-33.

## Migration Impact

Không có schema/migration trong US-33. Candidate không lưu DB; lưu Trip tiếp tục dùng schema và write path của US-32.

## Environment Impact

Không thêm biến môi trường/dependency. Định hướng hiện tại là tái dùng client và model hiện có; cần xác nhận adapter, schema name và cấu hình model cụ thể trước triển khai. Không đọc/ghi secret vào tài liệu hoặc log.

## Implementation Sequence

1. Hoài xác nhận intent-only, schema/adapter itinerary và ranh giới structured output; Bình/Hoài chốt cách tái sử dụng client/model hiện có.
2. Hoàn tất/handoff US-32 và xác nhận Trip revision/CAS, Validator contract với Thai Anh.
3. Task 271–274: strict intent, nhận diện mục tiêu, tạo candidate riêng và clarification do code sinh.
4. Task 275: gọi preview/Validator cho candidate; không ghi DB.
5. Task 276: UI hội thoại, diff, validation, xác nhận/hủy; apply qua US-32.
6. Task 277: test fake provider/repository và ghi evidence/known gaps; Bình tự chạy checklist browser.

## Acceptance Evidence

2026-10-17: Task 271 thêm `edit-intent-contract.ts` và 13 test contract. Zod strict kiểm tra field/enum/HH:mm/duration và bounds mảng; JSON Schema enum giới hạn ID theo tập do server cấp, giữ cấu trúc tương thích checker US-25. Test contract PASS. Task 272 thêm `edit-intent-prompt.ts`, `edit-intent-verify.ts`, `edit-intent-service.ts` và 22 test fake-provider: prompt chỉ chứa message có giới hạn, ngày và field visit allowlist, cùng tối đa 50 điểm đủ điều kiện; message/tên điểm đến được đánh dấu rõ là dữ liệu không đáng tin. Verifier bỏ ID/ngày không có trong context server, chuyển tham số sai định dạng/ngoài biên thành clarification và chỉ trả `EditIntentResult` sau parse contract. Service gọi generic `StructuredLlmClient` có sẵn, giới hạn 15 giây và 32 KiB output; giữ mã lỗi ADR-16 (incomplete/refusal qua client hiện có là `PROVIDER_REFUSAL`; rỗng/malformed là `INVALID_PROVIDER_RESPONSE`; timeout là `PROVIDER_TIMEOUT`; lỗi provider không nhận diện là `PROVIDER_UNAVAILABLE`). 3 file test / 22 test PASS. `npm run check-types` không khởi chạy do shell không có Node version đang active; direct bundled `tsc --noEmit` chỉ báo hai lỗi hiện hữu trong `cloudinary-provider.ts` (thiếu module `cloudinary`, implicit `any`), không có diagnostics Task 272. `git diff --check` PASS. Không gọi OpenAI thật. Chưa có route/auth/ownership assembly, candidate generation, clarification UX, Validator/preview/apply integration hoặc browser evidence. Hoài chưa xác nhận hướng intent-only; rate limit, provider behavior ngoài fake và owner handoff vẫn NOT PROVEN. US-32 code trong working tree hiện tại chưa được merge.

## Open Questions

- Hoài có xác nhận hướng “AI chỉ trả ý định có cấu trúc; server áp thao tác lên candidate” không? Nếu không, Hoài đề xuất ranh giới output/schema thay thế nào?
- Chủ sở hữu phê duyệt ADR-16 và xác nhận schema name `trip_preference_extraction` của adapter hiện có có phù hợp cho US-33 không? Khi thêm route, áp dụng error-to-AppError mapping hiện có thế nào cho timeout, refusal/incomplete và malformed output?
- JSON Schema provider hiện chỉ mang structural keywords được checker US-25 chấp nhận; Zod vẫn enforce regex giờ và bounds số/mảng sau khi nhận output. Có cần mở rộng checker trong task tích hợp sau để provider cũng enforce các bounds này không?
- Thời lượng gợi ý khi thêm destination lấy từ `suggestedDurationMinutes` (nullable) hiện có hay nguồn nào khác? Thiếu giá trị thì hỏi người dùng hay yêu cầu nhập duration?
- Rate limit/admission policy nào được duyệt cho endpoint AI tốn phí? Có tái dùng một limiter feature-specific hay cần cơ chế chung qua ADR?
- Khi có nhiều visit trùng tên, UI/clarification định danh mục tiêu bằng ngày, thứ tự, destination hay `visitId` nào để người dùng chọn đúng?
- Thai Anh xác nhận `updatedAt` là revision/CAS token liên nhóm và cung cấp contract Trip/Validator cuối cùng khi nào?
- Hoài xác nhận mapping planner `day/stops` sang saved candidate và quy tắc ổn định `visitId` nào?

## Handoff Notes

Story này chỉ mô tả đề xuất cho US-33. Không bắt đầu code trước khi dependencies thực tế được xác nhận theo quy trình task. Candidate, preview, apply, auth, ownership và Validator phải dùng chung contract US-32/Thai Anh; AI không có đường ghi riêng. Browser checklist và mọi behavior phụ thuộc rate limit/provider cần được ghi NOT PROVEN cho đến khi có evidence tương ứng.

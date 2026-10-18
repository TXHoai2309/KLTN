# US-37 — Kiểm tra và xác nhận phương án điều chỉnh In-trip

## Status

DRAFT

## Epic

Hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Constraint Validator) và Tô Xuân Hoài (xác nhận contract liên quan Planner/itinerary nếu cần).

## Goal / User Story

Là Du khách, tôi muốn kiểm tra và xác nhận phương án điều chỉnh trong chuyến đi để hành trình chỉ thay đổi khi phương án vẫn hợp lệ.

## Outcome

Đề xuất contract DRAFT cho task 293–297: kiểm tra candidate In-trip bằng Constraint Validator hiện hành, hiển thị kết quả cho Traveler, kiểm tra lại các ràng buộc phụ thuộc thời gian ngay trước khi ghi, và chỉ cập nhật Trip sau xác nhận rõ ràng cùng khi database xác nhận thành công. Candidate không đạt hoặc thiếu dữ liệu không được áp dụng.

## Source References

- [Product contract — Edit, save, and in-trip support](../product/product-spec.md#edit-save-and-in-trip-support): candidate tách biệt, Validator quyết định, xác nhận trước khi ghi, không thay đổi lượt đã hoàn thành, không lưu lịch sử GPS.
- [Product contract — Deterministic Constraint Validator](../product/product-spec.md#deterministic-constraint-validator): bốn nhóm kiểm tra; `INSUFFICIENT_DATA` không phải PASS.
- [User Flow — In-trip assistant](../flow/user-flow.md#in-trip-assistant), [Edit itinerary](../flow/user-flow.md#edit-itinerary), [Write recovery](../flow/user-flow.md#write-recovery).
- [US-32 — Chỉnh sửa thủ công](US-32-manual-itinerary-edit.md), [US-36 — Đề xuất lại trong chuyến đi](US-36-in-trip-replan.md), [ADR-08/09/10](../decisions.md).
- DOCX requirement IDs và Figma frame cụ thể chưa được đối chiếu; không tự đặt requirement ID, layout hoặc business rule mới.

## Dependencies

- **US-32 — candidate, preview và apply:** `EditCandidate`, `previewEdit` và `apply-edit` đã có trong checkout. Apply hỗ trợ `kind: 'IN_TRIP'`, nhưng route hiện chưa nhận location/mandatory endpoint và hook bảo vệ visit đã hoàn thành là tùy chọn, chưa được nối tại route. Task 296 cần tích hợp tối thiểu với contract dùng chung.
- **US-36 — candidate In-trip:** cung cấp candidate, danh sách visit đã qua giờ do server tính và `mandatoryEndpoint` nếu có. US-36 không chạy Validator và không ghi DB; US-37 là nơi kiểm tra và áp dụng.
- **Constraint Validator của Thai Anh:** `validateItinerary(visits, routes, timeReference)` trả bốn nhóm `openingHours`, `minimumDuration`, `travelTime`, `scheduleConflict` và `canConfirm`. Task 293 đã bổ sung `validateInTripContext(base, { now, originLeg, mandatoryEndpoint })` vào cùng module; `previewInTrip` vẫn gọi `previewEdit` để lấy kết quả bốn nhóm gốc rồi gộp kiểm tra chặng từ vị trí hiện tại và deadline vào `travelTime`. API gốc không đổi; phần mở rộng file dùng chung cần được xem xét khi review/hợp nhất.
- **Trip model:** `Trip.updatedAt` đang được US-32 dùng làm `baseRevision`/CAS token; chưa có cột revision số và visit không có cột completed. US-36 đã chọn suy trạng thái đã qua giờ theo lịch với `Asia/Ho_Chi_Minh`. Nếu contract này đòi tăng revision số hoặc thêm trạng thái, phải có quyết định và schema work riêng theo ADR-10.
- **UI Validator:** có thể tái dùng `TripValidationPanel` của US-29C Task 251; panel nhận `TripValidation` và khóa nút xác nhận khi `canConfirm` false. Chưa được gắn vào UI In-trip.

## In Scope

- Chạy lại bốn nhóm Constraint Validator trên candidate In-trip và hiển thị PASS, VIOLATION, INSUFFICIENT_DATA cùng thời điểm server kiểm tra.
- Kiểm tra lại các dữ liệu/phân loại phụ thuộc thời gian ở lần xác nhận cuối; xác định lại các visit đã qua giờ từ dữ liệu Trip hiện hành.
- Yêu cầu xác nhận rõ ràng của Traveler trước khi gọi apply.
- Dùng shared apply-edit với `kind: 'IN_TRIP'`, idempotency và ownership/revision checks; chỉ báo thành công sau khi database xác nhận ghi.
- Giữ nguyên mọi thuộc tính của visit đã hoàn thành theo contract US-36.
- Giữ location ở luồng request cần thiết và loại location khỏi input hash, bản ghi idempotency, log và response snapshot.

## Out of Scope

- Sinh hoặc thay đổi đề xuất In-trip: US-36.
- Chỉnh sửa thủ công hoặc chỉnh sửa bằng hội thoại AI trên hành trình đã lưu: US-32/US-33; các luồng đó chỉ tái sử dụng shared apply-edit.
- Tự suy đoán kết quả Validator, thời gian di chuyển, khả năng đến trước deadline hoặc trạng thái hoàn thành.
- Lưu lịch sử GPS, lưu candidate dài hạn, thay đổi Prisma schema/migration trong contract DRAFT này.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 293 | [BE] Chạy lại Constraint Validator cho phương án In-trip |
| 294 | [BE] Kiểm tra lại các ràng buộc phụ thuộc thời gian trước khi áp dụng |
| 295 | [FE] Hiển thị kết quả Validator và yêu cầu xác nhận người dùng |
| 296 | [BE/API] Chỉ cập nhật hành trình sau khi Validator đạt, người dùng xác nhận và ghi dữ liệu thành công |
| 297 | [TEST] Kiểm thử phương án bị Vi phạm/Chưa đủ dữ liệu không được áp dụng. |

## Business Rules

- Candidate vẫn tách biệt hành trình đã lưu cho đến khi Validator đạt, Traveler xác nhận và DB commit thành công.
- Validator là quyết định xác định, không phải AI hoặc UI. Chỉ áp dụng khi mọi check bắt buộc PASS; VIOLATION và INSUFFICIENT_DATA đều chặn ghi.
- Preview không phải chứng nhận có thể dùng lại khi xác nhận. Apply chạy kiểm tra mới bằng thời gian server mới; không tin `now`, completedVisitIds hoặc validation do client gửi.
- Tại lần kiểm tra cuối, server tải Trip của đúng Traveler, tính lại visit đã qua giờ theo policy US-36 và kiểm tra candidate không sửa/xóa/dời các visit đó. Nếu một visit đã trở thành đã qua giờ kể từ preview và candidate thay đổi nó, không ghi.
- Validator và routing chạy ngoài transaction theo ADR-09. Transaction chỉ làm các kiểm tra quyền sở hữu/baseRevision cần thiết và cập nhật itinerary/revision nguyên tử.
- Dùng giờ server làm mốc; ngày giờ nghiệp vụ theo `Asia/Ho_Chi_Minh`. Hàm lõi nhận `now` qua tham số.
- Chỉ báo `SUCCESS` sau commit. Với kết quả `UNKNOWN`, giữ nguyên key/payload để retry theo shared idempotency contract; không báo đã áp dụng hoặc đã hủy.
- Location chỉ phục vụ kiểm tra In-trip trong request hiện tại; không được lưu trong DB, hash idempotency, response snapshot, URL, browser storage, cookie hoặc log.

## Roles / Authorization

Chỉ Traveler được preview/xác nhận qua `requireTraveler`. Guest nhận 401; Admin nhận 403 và không được bypass. Auth chạy trước khi đọc body. Response riêng tư có `Cache-Control: private, no-store`.

## Ownership Rules

Service lấy `userId` từ session và đọc Trip bằng `WHERE id AND userId`; Trip không có hoặc không thuộc Traveler trả cùng 404. Server xác minh visit/day thuộc Trip đã đọc. Không nhận quyền sở hữu, `completedVisitIds` hoặc kết quả Validator từ client làm thẩm quyền. Transaction kiểm tra lại Traveler, ownership và `baseRevision` trước khi ghi.

## UX / UI Contract

- Màn hình hiển thị bốn nhóm Validator, trạng thái và finding liên quan tới visit/chặng/điểm kết thúc khi dữ liệu trả về.
- `INSUFFICIENT_DATA` phải được thể hiện riêng với PASS. Nút xác nhận chỉ bật khi mọi check bắt buộc PASS và Traveler xác nhận rõ ràng.
- Trong lúc xác nhận, UI thể hiện đang xử lý và khóa thao tác gửi trùng. Nếu kiểm tra cuối không còn đạt, giữ candidate, hiển thị validation mới và yêu cầu người dùng xem lại.
- Revision conflict, lỗi biết chắc `FAILED`, kết quả `UNKNOWN` và replay `SUCCESS` có trạng thái riêng; chỉ cập nhật hành trình đang hiển thị sau SUCCESS.
- Location/nhu cầu không xuất hiện trong URL hoặc thông báo lỗi. Hủy trước apply giữ nguyên hành trình cũ.
- Tái dùng `TripValidationPanel` nếu response tương thích; Figma, keyboard và responsive từ 360px cần kiểm tra trước khi đánh dấu đạt.

## Data Contract

**ĐỀ XUẤT, chưa được Thai Anh/Hoài xác nhận:**

- Preview nhận `{ baseRevision, candidate, location, mandatoryEndpoint? }`. `candidate` theo US-32/US-36; `location` theo `InTripLocation` của US-35; `mandatoryEndpoint` theo contract US-36. Không nhận `now`, completedVisitIds hoặc validation từ client.
- Preview trả `{ validation, checkedAt, completedVisitIds }` trong shared success envelope. `validation` chứa đủ bốn nhóm; `checkedAt` và `completedVisitIds` do server dựng. Preview không ghi DB.
- Apply tái sử dụng candidate và context cần để kiểm tra lại, yêu cầu `confirmed: true`, `kind: 'IN_TRIP'` và `Idempotency-Key`. Chi tiết DTO location/mandatory endpoint và cách loại location khỏi hash cần được chốt trước khi triển khai.
- Hiện Trip không có revision số. `baseRevision` đang là `Trip.updatedAt`; cụm “revision + 1” trong thiết kế cần được xác nhận là CAS token `updatedAt` mới hay cần một revision số có schema riêng.

## API Contract

**ĐỀ XUẤT, chưa phải contract được duyệt:**

| Endpoint | Request | Kết quả |
| --- | --- | --- |
| `POST /api/trips/[id]/in-trip/preview` | `{ baseRevision, candidate, location, mandatoryEndpoint? }` strict | Shared success envelope chứa `validation` 4 nhóm, `checkedAt`, `completedVisitIds`; không ghi DB. |
| `POST /api/trips/[id]/edits/apply` | Shared apply body với `kind: 'IN_TRIP'`, xác nhận, candidate/context cần revalidation; `Idempotency-Key` bắt buộc | Shared mutation envelope `SUCCESS` / `FAILED` / `UNKNOWN`; SUCCESS chỉ sau commit. |

Apply đang có của US-32 chưa nhận location hoặc mandatory endpoint; nếu cần hai trường này cho revalidation thì phải mở rộng schema/HTTP/service bằng diff nhỏ đã thống nhất, không tạo apply path cạnh tranh. Revalidation chạy ngoài transaction với `now` mới; ngay trước khi ghi, server tính lại `completedVisitIds` và điều kiện liên quan. Nếu Validator không còn PASS hoặc completed-visit invariant không đạt, không ghi và trả kết quả kiểm tra hiện hành. Response/error dùng shared API convention theo ADR-08; mã lỗi/status cụ thể cần đối chiếu với convention hiện tại khi implementation.

## Error / Recovery

- Candidate sai schema, auth failure, missing/foreign Trip, revision conflict và lỗi Validator/provider được ánh xạ theo shared error convention.
- VIOLATION/INSUFFICIENT_DATA trong preview được trả để hiển thị nhưng không cho xác nhận. Nếu lần kiểm tra apply không đạt, trả validation mới và không chạy lệnh ghi.
- Lỗi giữa chừng có thể là UNKNOWN; client retry cùng key và payload. Không tạo key mới cho cùng intent chưa được xác định kết quả.
- Nếu dữ liệu thời gian/completion thay đổi sau preview, không tự sửa candidate hoặc tự xác nhận thay người dùng.

## Write Semantics / Idempotency

Apply dùng `executeIdempotentWrite` và operation dùng chung `trip:apply-edit` nếu không có quyết định khác. Trạng thái tuân `SUCCESS` / `FAILED` / `UNKNOWN`; itinerary update và success snapshot phải commit nguyên tử. Cùng key/cùng identity replay SUCCESS; cùng key/identity khác conflict theo shared helper.

**ĐỀ XUẤT cần chốt:** location không được đưa vào input đã hash hoặc bản ghi idempotency. Vì shared helper hash canonical input, implementation cần tách context location khỏi dữ liệu identity được hash mà vẫn đảm bảo revalidation và replay an toàn. Response snapshot cũng không chứa location. Quy tắc replay cùng key khi thời gian, location hoặc Validator đã đổi được ghi tại Open Questions; không tự bỏ qua shared idempotency contract.

## Privacy of Location

- GPS/manual location chỉ ở client state trong phiên và POST body khi cần kiểm tra; không đưa lên URL.
- Không lưu location trong localStorage/sessionStorage/cookie/DB/idempotency record; không đưa location vào input hash, response snapshot hoặc log.
- Không bật theo dõi nền hoặc `watchPosition`; không giữ lịch sử GPS.
- `capturedAt` phải được kiểm tra theo freshness policy sau khi owner chốt ngưỡng; hiện chưa có ngưỡng được duyệt.

## External Services

Tái sử dụng routing/Validator đã có. Routing và mọi provider call chạy ngoài transaction. Không thêm client, dependency, biến môi trường hoặc tự tính route-time/deadline. Routing unavailable/timeout phải giữ trạng thái thiếu dữ liệu theo Validator, không được nâng thành PASS.

## Acceptance Criteria

- [ ] Preview chỉ trả kết quả cho Traveler sở hữu Trip; Guest 401, Admin 403, Trip không thuộc chủ/không tồn tại cùng 404.
- [ ] Preview trả đủ bốn nhóm Validator, `checkedAt` và completedVisitIds do server tính; không ghi DB.
- [ ] Nút xác nhận chỉ khả dụng khi mọi check bắt buộc PASS và Traveler chủ động xác nhận; INSUFFICIENT_DATA không được coi là PASS.
- [ ] Apply chạy Validator lại ngoài transaction bằng thời gian server mới và tính lại visit đã qua giờ; kết quả không đạt hoặc thiếu dữ liệu thì không ghi và trả validation mới.
- [ ] Apply giữ nguyên mọi visit đã hoàn thành; recheck ownership/baseRevision trong transaction và chỉ báo SUCCESS sau DB commit.
- [ ] Idempotency theo shared contract; retry UNKNOWN dùng cùng key/payload; replay không ghi lần hai.
- [ ] Location không nằm trong URL, storage, cookie, log, DB, input hash hoặc idempotency response snapshot.
- [ ] Preview/cancel/validation failure không thay đổi hành trình cũ; candidate chỉ được áp dụng sau xác nhận và SUCCESS.

## Test Plan

- Pure Validator adapter tests với fake Validator/provider: bốn nhóm PASS, VIOLATION, INSUFFICIENT_DATA; timeout/unavailable không thành PASS.
- Preview HTTP/service: auth trước body, strict schema, ownership 404, role 401/403, baseRevision conflict, completedVisitIds do server tính, không có lệnh ghi.
- Apply: preview PASS rồi apply đổi kết quả theo `now` mới; visit chuyển sang completed được bảo vệ; VIOLATION/INSUFFICIENT_DATA không ghi; explicit confirmation bắt buộc.
- Idempotency: replay cùng key, cùng key identity khác nhau, UNKNOWN retry, replay không ghi revision lần hai; kiểm tra riêng location không có trong hash/persisted snapshot theo contract được duyệt.
- Transaction/CAS: ownership và baseRevision được kiểm tra lại, cập nhật itinerary nguyên tử, không có external call trong callback.
- Privacy source-audit: location không vào URL/storage/cookie/log/DB/hash/response snapshot.
- Fake database/Validator/clock; không nối Neon hoặc gọi routing thật trong Vitest. Browser, GPS thật và routing thật là NOT PROVEN cho đến khi người dùng chạy smoke checklist.

## Expected Modules / Files

- `apps/web/src/modules/in-trip/`: adapter/service/HTTP contract cho preview và kiểm tra thời gian, cùng `*.vitest.test.ts`.
- `apps/web/src/app/api/trips/[id]/in-trip/preview/route.ts`: Route Handler mỏng cho preview.
- `apps/web/src/components/in-trip/` và `apps/web/src/app/trips/[id]/in-trip/`: hiển thị validation và xác nhận, nếu cần thay đổi UI.
- `apps/web/src/modules/trip-edit/apply-edit.ts` và `apps/web/src/app/api/trips/[id]/edits/apply/route.ts`: chỉ mở rộng tối thiểu để dùng shared apply cho `IN_TRIP`.
- Tái dùng `modules/trip-edit/edit-candidate.ts`, `previewEdit`, `apply-edit`, `modules/in-trip/split-trip.ts`, `preserve-completed.ts`, `mandatory-endpoint.ts`, `replan-service.ts`, `InTripLocation` và `TripValidationPanel`; không viết lại Validator.

## Migration Impact

Không dự kiến migration trong đề xuất. Trip hiện dùng `updatedAt` làm baseRevision và không có revision số/completion column. Nếu owner yêu cầu revision số hoặc trạng thái hoàn thành lưu bền vững, dừng task và tạo quyết định/schema migration riêng theo ADR-10; không `db:push`, reset/drop DB hoặc sửa migration cũ.

## Environment Impact

Không thêm dependency, client hoặc biến môi trường. Không ghi secret. Không gọi dịch vụ ngoài trong transaction callback.

## Implementation Sequence

1. Chốt Validator input cho `now`, in-trip origin và mandatory endpoint/deadline; chốt freshness của location và semantics replay.
2. Hoàn thiện preview adapter/service và trả kết quả bốn nhóm cùng `checkedAt`/completedVisitIds.
3. Nối UI kết quả và xác nhận rõ ràng; xác nhận chỉ bật với PASS đầy đủ.
4. Mở rộng tối thiểu shared apply cho IN_TRIP, revalidate ngoài transaction và bảo vệ completed visits khi ghi.
5. Bổ sung test fake-provider/database/clock, privacy/source audits và cập nhật evidence trước khi xem xét READY.

## Acceptance Evidence

2026-10-18: Tạo contract DRAFT theo yêu cầu. Task 293 đã có route POST `/api/trips/[id]/in-trip/preview`, HTTP boundary xác thực Traveler trước khi đọc bounded JSON strict, và `previewInTrip` đọc Trip theo `id AND userId`, so `updatedAt` với `baseRevision`, dùng giờ server để split/preserve completed visits, kiểm tra destination đủ điều kiện và endpoint cuối, rồi dùng `previewEdit` cùng phần mở rộng Validator cho origin/deadline. Response private `no-store` chứa bốn nhóm, `checkedAt`, `completedVisitIds`; không có đường ghi. Focused Vitest (Validator gốc + Task 293 + trip-edit): 4 file / 36 tests PASS với fake database/route/clock, gồm một ca chạy `previewEdit` thật. `npm run check-types` không khởi động được do NVM shim chưa có Node active; direct bundled `tsc` báo hai lỗi ngoài phạm vi ở `destination/cloudinary-provider.ts` (thiếu module `cloudinary`, implicit-any), không báo lỗi Task 293. `git diff --check` PASS. Browser/GPS/Stadia thật là NOT PROVEN. Task 294–297 chưa triển khai; preview không chứng nhận apply. Repo còn draft cùng ID tại `US-37-confirm-in-trip-proposal.md`; cần thống nhất file canonical trước khi chuyển story sang READY.

## Open Questions

- **OQ-A — Validator input:** Task 293 đã thêm adapter `validateInTripContext` vào Validator hiện có, dùng route snapshot từ vị trí hiện tại và deadline cùng ngày Việt Nam. Contract kỹ thuật cho preview đã có; semantics chặng origin/deadline cần được xem xét khi review chung. Preview không phải xác nhận cuối.
- **OQ-B — Location freshness:** `capturedAt` cũ bao lâu thì phải từ chối hoặc yêu cầu lấy vị trí lại? Ngưỡng do ai chốt?
- **OQ-C — Replay:** Cùng Idempotency-Key có replay SUCCESS đã commit mà không chạy lại Validator theo ADR-09 không? Khi location bị loại khỏi hash, xử lý thế nào nếu cùng key được gửi lại với location khác?
- **OQ-D — Routing timeout khi xác nhận:** Timeout/unavailable được trả như `INSUFFICIENT_DATA` để người dùng thử kiểm tra lại hay thành lỗi kỹ thuật riêng? Không trường hợp nào được coi là PASS.
- **OQ-E — Hiệu lực preview:** UI được xem kết quả preview là còn hiệu lực trong bao lâu? Apply vẫn revalidate bằng `now` mới; cần quyết định preview cũ khi nào buộc người dùng kiểm tra lại trước khi nhấn xác nhận.
- **OQ-F — Revision token:** “revision + 1” là cập nhật `updatedAt` CAS token hiện có hay yêu cầu cột revision số/migration? Thai Anh xác nhận với contract US-32.
- **OQ-G — Story canonical:** Repo đã có `US-37-confirm-in-trip-proposal.md` với task 293–297. File mới này thay thế file đó hay cần hợp nhất/xóa bản cũ trước khi READY?
- **OQ-H — Owner review:** Thai Anh/Hoài xác nhận API preview/apply và dữ liệu itinerary nào là nguồn authoritative; Bình chốt các policy location/replay/preview còn mở.

## Handoff Notes

Thiết kế API apply trong story này vẫn là **đề xuất**. Bình đã cho phép tự mở rộng Validator để hoàn thành Task 293; phần mở rộng file dùng chung là một rủi ro review/hợp nhất, không đặt thêm điều kiện phê duyệt cho Task 293. Chưa chốt độ cũ của location, replay, hiệu lực preview và contract apply; không coi Task 293 là nghiệm thu các task 294–297.

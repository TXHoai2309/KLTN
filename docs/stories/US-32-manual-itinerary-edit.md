# US-32 — Chỉnh sửa thủ công hành trình đã lưu

## Status

DRAFT

## Epic

Quản lý hành trình đã lưu và hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình. Phụ thuộc Trip/Validator của Thai Anh Nguyen và Planner của Tô Xuân Hoài.

## Goal / User Story

Là Du khách, tôi muốn chỉnh sửa thủ công hành trình đã lưu để điều chỉnh kế hoạch theo nhu cầu của mình.

## Outcome

Contract DRAFT cho task 263–270; Tasks 263–269 có implementation cục bộ, Task 270 và acceptance end-to-end còn chờ. Thiết kế preview/apply dưới đây là **ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận**. Khả năng dùng chung với US-33/36/37 không đưa các story đó vào phạm vi US-32.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Deterministic Constraint Validator; Roles and access; Write semantics and recovery.
- [User flows](../flow/user-flow.md#edit-itinerary): Edit itinerary; In-trip assistant; Write recovery.
- [Source precedence](../source-baselines.md), [technical architecture](../architecture/technical-architecture.md), [ADR-08/09/10](../decisions.md).
- Backlog task 263–270 và thiết kế đề xuất do Bình cung cấp trực tiếp ngày 2026-10-15. Story dựa trên các mục product-spec/user-flow được chỉ định ở trên; Product/System DOCX và Figma frame cụ thể chưa được đối chiếu, không tự gán requirement ID hoặc layout.

## Dependencies

- **Trip model — Thai Anh Nguyen (US-30/31):** đã có Prisma `Trip`, `ItineraryDay`, `ItineraryVisit`, `userId`, `startDate`, `durationDays`, `transport`, day/date và visit destination/time/duration/order; `ItineraryVisit.id` là identity ổn định. Migration `20261015000000_us30_trip_save` và save service đã có; owned Trip list/detail ở US-31. Trip không có `revision` riêng; `updatedAt` tồn tại. Task 266 tạm dùng ISO UTC chính xác của `Trip.updatedAt` làm `baseRevision`; đây là adapter triển khai cho preview, chưa xác nhận atomic CAS cho apply hoặc thay đổi schema.
- **Constraint Validator — Thai Anh Nguyen (US-29A/B/C):** có check `checkOpeningHours`, `checkMinimumVisitDuration`, `checkTravelTime`, routing `getTravelRoute`/`checkTravelLeg` và aggregate `validateItinerary(visits, routes, timeReference)` với bốn group `openingHours`, `minimumDuration`, `travelTime`, `scheduleConflict`. Task 266 gọi aggregate hiện có và lấy `canConfirm` từ kết quả; không viết lại rule.
- **Itinerary — Tô Xuân Hoài (US-28) và persisted shape — US-30:** `PlannerDay`/`PlannerStop` là shape proposal (`day`, `stops`, `arrivalMinute`, `visitDurationMinutes`, `destination.id`) với tối đa 4 stop/ngày. Shape được lưu là `TripProposal` (`dayIndex`, `visits`, `destinationId`, `startMinute`, `plannedDurationMinutes`, `order`) và `ItineraryVisit.id`. Candidate task 265 theo shape persisted/save, ánh xạ id thành `visitId`; giới hạn hiện tại 14 ngày, 4 visit/ngày và 50 visit tổng lấy từ contract US-24/28/29. Candidate không sao chép Destination object.
- Có shared `requireTraveler`, `executeIdempotentWrite`, `preflightIdempotentReplay`, response/error helpers. Candidate, preview/apply service và route (Tasks 265/266/268), edit UI (Tasks 263/264), preview UI/client (Task 267), cancel/apply client flow (Task 269) đã được triển khai cục bộ; task tổng hợp test (270) còn chờ.
- Dependencies cần cho Task 265–268 hiện đã có trong repository. Task 268 dùng `updatedAt` conditional CAS vì Trip chưa có cột số `revision`; cơ chế và token client vẫn cần owner xác nhận trước khi story rời DRAFT.

## In Scope

- Thêm/xóa điểm đến; đổi thứ tự, thời gian và chuyển ngày trong candidate của chuyến đã lưu thuộc người dùng.
- Preview không ghi; chạy lại Validator; xem thay đổi và xác nhận/hủy.
- Apply idempotent theo thiết kế chung bên dưới.

## Out of Scope

- Tạo Trip ban đầu hoặc sửa schema/model của dev khác.
- Chỉnh sửa bằng AI = US-33; in-trip/GPS/replan = US-36/37 (location thuộc US-35).
- Favorite = US-34 của Thai Anh; không sửa module/UI Favorite.
- Lưu candidate/draft phía server, cộng tác nhiều người, tối ưu tuyến phức tạp, tự sửa completed visits.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 263 | [FE] Cho phép thêm và xóa điểm đến trong phương án chỉnh sửa |
| 264 | [FE] Cho phép đổi thứ tự, thời gian và chuyển điểm đến sang ngày khác |
| 265 | [BE] Tạo phương án chỉnh sửa tách biệt với hành trình hiện tại |
| 266 | [BE/API] Chạy lại Constraint Validator cho phương án mới |
| 267 | [FE] Hiển thị bản xem trước phương án mới và kết quả kiểm tra |
| 268 | [BE/API] Chỉ cập nhật hành trình khi Validator đạt và người dùng xác nhận |
| 269 | [FE] Cho phép hủy chỉnh sửa và giữ nguyên hành trình cũ |
| 270 | [TEST] Kiểm thử chỉnh sửa, hủy và áp dụng thành công |

## Business Rules

- Candidate tách biệt hành trình đã lưu; mọi thay đổi candidate làm kết quả preview trước đó hết hiệu lực. Hủy không ghi itinerary.
- Chỉ điểm đến có thật và đủ điều kiện mới được thêm vào itinerary. Cách xử lý điểm đến cũ bị ẩn nằm ở OQ-B; không tự xóa lịch sử.
- Bốn nhóm bắt buộc: opening hours, minimum duration, travel time, schedule conflict. Chỉ xác nhận khi tất cả kiểm tra bắt buộc PASS; VIOLATION và INSUFFICIENT_DATA đều chặn apply. Không dùng AI điền dữ liệu còn thiếu.
- Tái dùng hàm Validator của Thai Anh, không viết lại rule hoặc tự suy ra PASS khi thiếu kết quả của một check bắt buộc. Preview hợp lệ không thay thế lần kiểm tra authoritative tại apply.
- Revalidate thay đổi và các chặng/khung giờ liên quan, kể cả qua ranh giới ngày; không chỉ kiểm tra riêng stop được sửa.
- Thời gian nghiệp vụ `Asia/Ho_Chi_Minh`; core nhận `now` từ tham số do server boundary cung cấp, không tự gọi `new Date()` hoặc tin clock client.
- Không tự kế thừa khung 08:00–18:00, cap số stop hoặc cấm lặp destination của Planner sơ bộ thành rule chỉnh sửa đã được duyệt.

## Roles / Authorization

Chỉ Traveler qua `requireTraveler`; Guest 401, Admin 403, không có bypass. Auth trước đọc body, kể cả body sai/thiếu. Route Handler mỏng: đọc route params/header và auth → parse body → service → map response; ownership và nghiệp vụ nằm ở service. Mọi response private dùng `Cache-Control: private, no-store`, gồm cả lỗi.

## Ownership Rules

Lấy `userId` từ session; truy vấn Trip với `WHERE id AND userId`. Không thuộc sở hữu/không tồn tại trả cùng 404. Kiểm tra visit/day thuộc chính Trip đó; không chấp nhận ID của Trip khác. Recheck ownership trong transaction apply.

## UX / UI Contract

Editor tại `/trips/[id]/edit` là đường dẫn đề xuất. Có loading/empty/error/401/403/404, candidate chưa kiểm tra, đang preview, ba trạng thái Validator, đang apply, FAILED, UNKNOWN, xung đột revision và SUCCESS. Hiển thị trước/sau và đối tượng/chặng ảnh hưởng. Hủy trước apply giữ dữ liệu đã lưu; sau khi đã gửi apply, không coi đóng UI/abort là rollback. Link mới tuân theo typedRoutes (`as Route` như code hiện có). Figma cần đối chiếu; responsive từ 360px và thao tác bàn phím.

## Data Contract

**ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận, chưa phải schema được duyệt:** preview nhận `{ baseRevision, candidate }`; apply nhận `{ baseRevision, candidate, confirmed: true, kind: 'MANUAL' | 'AI' | 'IN_TRIP' }`. US-32 chỉ dùng `kind: 'MANUAL'`; các giá trị khác là dự kiến contract dùng chung, không triển khai AI/in-trip trong story này và không cho client dùng `kind` để bypass rule.

Candidate strict theo schema task 265: `startDate`, `durationDays`, `transport`, `days/dayIndex/visits`, visit giữ `visitId` ổn định. Body preview strict gồm `{ baseRevision, candidate }`; `baseRevision` hiện nhận ISO UTC từ `Trip.updatedAt` và được so sánh chính xác sau truy vấn owned Trip. Đây là quyết định triển khai riêng của task 266 để dùng field đã có, chưa xác nhận làm contract liên dev/atomic guard cho apply. Không nhận `userId`, kết quả PASS hay trạng thái completed do client tự chứng nhận.

Preview trả candidate, `baseRevision`, `validation` từ aggregate Validator (đủ bốn group và `timeReference`), cùng `eligibleForConfirmation` được lấy trực tiếp từ `validation.canConfirm`. VIOLATION/INSUFFICIENT_DATA là kết quả HTTP 200 để hiển thị; `eligibleForConfirmation` chỉ true khi Validator cho phép. Preview không ghi DB. Body/candidate lỗi dùng shared `VALIDATION_ERROR`/400; Trip vắng hoặc không thuộc chủ dùng `TRIP_NOT_FOUND`/404; revision khác dùng `TRIP_REVISION_CONFLICT`/409; Destination ẩn/không tồn tại dùng `DESTINATION_UNAVAILABLE`/422 theo save service hiện có.

## API Contract

Các endpoint sau có contract **ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận**; preview/apply đã được triển khai cục bộ theo contract này:

| Endpoint | Request đề xuất | Response |
| --- | --- | --- |
| `POST /api/trips/[id]/edits/preview` | `{ baseRevision, candidate }` strict; `baseRevision` hiện là ISO UTC chính xác của `Trip.updatedAt` | **Đã triển khai task 266:** `{ success: true, data: preview }`; lỗi theo shared envelope; VIOLATION/INSUFFICIENT_DATA trả đủ nhóm Validator trong kết quả HTTP 200; không ghi DB |
| `POST /api/trips/[id]/edits/apply` | `{ baseRevision, candidate, confirmed: true, kind: 'MANUAL' \| 'AI' \| 'IN_TRIP' }` strict + `Idempotency-Key` bắt buộc | **Đã triển khai task 268:** shared mutation envelope; SUCCESS chỉ sau commit; replay cùng key trả kết quả đã lưu; lỗi giữa transaction trả UNKNOWN |

Không dùng preview ID như dữ liệu được lưu ở server. Apply gửi lại đầy đủ candidate; server không tin preview/checks từ client. Tái dùng `server/http/api-response.ts`, `error-handler.ts` và `AppError`; không tạo envelope riêng. Preview lỗi dùng `{ success: false, error: { code, message, details? } }`. Apply dùng:

- SUCCESS: HTTP 200, `{ success: true, operationStatus: 'SUCCESS', data }`; replay có `Idempotency-Replayed: true`.
- FAILED: `{ success: false, operationStatus: 'FAILED', error: { code, message, details? } }` với HTTP status tương ứng.
- UNKNOWN: HTTP 503, `{ success: false, operationStatus: 'UNKNOWN', error, retryWithSameKey: true }`.

Error mapping cho DRAFT:

| Trường hợp | HTTP / code | Cơ sở |
| --- | --- | --- |
| Guest / Admin | 401 `UNAUTHENTICATED` / 403 `FORBIDDEN` | Shared authorization policy/guard; không đọc body trước auth |
| Không tồn tại / không thuộc chủ | 404 `TRIP_NOT_FOUND` | Cùng mã/thông báo trong Trip read service; không tiết lộ existence |
| Body/candidate sai cấu trúc hoặc thiếu xác nhận | 400 `VALIDATION_ERROR` | Theo `trip-requirement-check-http.ts` và `trip-planner/planner-http.ts` |
| Apply có VIOLATION hoặc INSUFFICIENT_DATA | 422 `TRIP_VALIDATION_FAILED` | Tái dùng `trip-save-service.ts`; details chứa toàn bộ kết quả Validator; không ghi itinerary |
| Candidate không thể lưu theo Trip save contract (ví dụ rỗng) | 400 `VALIDATION_ERROR` | Tái dùng `tripSaveRequestSchema` trước khi chạy Validator |
| Trip đã đổi so với baseRevision | 409 `TRIP_REVISION_CONFLICT` | Task 268 rechecks và CAS bằng `id + userId + updatedAt` trong transaction |
| Điểm đến không tồn tại hoặc không còn VISIBLE | 422 `DESTINATION_UNAVAILABLE` | Tái dùng mã và status từ `trip-save-service.ts`; preview không chạy Validator nếu eligibility thất bại |
| Thiếu / sai Idempotency-Key | 400 `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | `requireIdempotencyKey` hiện có |
| Cùng key, payload khác | 409 `IDEMPOTENCY_KEY_REUSED` | Shared idempotency hiện có |
| Không xác định kết quả ghi | 503 `OPERATION_STATUS_UNKNOWN` | Shared mutation contract |

Preview trả HTTP 200 với checks VIOLATION/INSUFFICIENT_DATA khi đã chạy kiểm tra thành công; đó là kết quả kiểm tra, không phải ghi itinerary thành công. DTO/details, request limits và mapping Trip còn cần Hoài/Thai Anh xác nhận trước READY.

### Shared stateless preview/apply design

**ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận.** US-33/36/37 có thể tham chiếu mục này; phạm vi triển khai US-32 vẫn chỉ manual edit:

1. Candidate chỉ giữ trong bộ nhớ client của phiên tương tác. Server xử lý candidate tạm trong request; không ghi candidate vào DB/cache/session và không giữ proposal giữa các request. Không đưa candidate/location/nhu cầu riêng vào URL, log hay browser storage.
2. Preview: auth trước body; service đọc owned Trip và dữ liệu có thẩm quyền, kiểm tra baseRevision, kiểm tra destination eligibility rồi gọi Validator với `timeReference` được truyền vào. Task 266 hiện thực luồng này bằng `Trip.updatedAt` và `validateItinerary`; trả đủ bốn group, không có business write hay idempotency record cho preview.
3. Apply mới: auth, ownership, parse/normalize, lấy dữ liệu hiện hành và **chạy Validator ngoài transaction**. OpenAI/Google Routes tuyệt đối không nằm trong transaction callback. Không coi preview cũ là chứng nhận.
4. Khi tất cả kiểm tra bắt buộc PASS và có xác nhận rõ ràng, dùng `executeIdempotentWrite` với operation `trip:apply-edit` và input `{ tripId, baseRevision, kind, candidate }`. Trong transaction: kiểm tra lại Traveler/ownership với `WHERE id AND userId`, so baseRevision; CAS bằng `updateMany WHERE id AND userId AND updatedAt = baseRevision`, cập nhật `updatedAt` sang timestamp lớn hơn hiện tại, rồi thay days/visits cùng success record nguyên tử. Schema hiện chưa có số revision để tăng; không tự thêm cột. CAS thất bại rollback và trả 409 `TRIP_REVISION_CONFLICT`.
5. Retry cùng key/payload đã commit phải replay SUCCESS **trước** stale-version check hoặc revalidation/provider lần nữa. Task 268 kiểm tra ownership trước replay, gọi `preflightIdempotentReplay` trước validation, và vẫn để `executeIdempotentWrite` xử lý race cùng key. Replay không chạy lại Validator, không tăng `updatedAt` lần nữa và không tạo business write mới. Bản ghi idempotency thành công không phải nơi lưu draft candidate.
6. Server stateless về candidate không có nghĩa bỏ trạng thái Trip/idempotency trong DB. `updatedAt` CAS đã được hiện thực; việc dùng field này làm token apply vẫn cần Thai Anh/Hoài xác nhận. Hook bất biến cho visit đã hoàn thành của `IN_TRIP` chờ US-36/task 289.

## Error / Recovery

Preview lỗi giữ candidate local để sửa/thử lại. Revision conflict yêu cầu đọc lại Trip và xem lại thay đổi, không tự ghi đè. FAILED giữ itinerary cũ nếu transaction rollback. UNKNOWN có thể đã commit: giữ nguyên request/key để đối soát/retry; không báo hủy thành công hoặc tự gửi payload mới. Lỗi provider chỉ trả thông báo an toàn, không lộ secret/nội dung riêng.

## Write Semantics / Idempotency

Tuân theo shared design đề xuất, ADR-08/09 và `executeIdempotentWrite`; operation đã triển khai là `trip:apply-edit`, scope gồm actor + operation, input hash gồm tripId/baseRevision/kind/candidate đã chuẩn hóa. `confirmed` luôn phải là literal `true` nên không tham gia identity của payload. SUCCESS chỉ sau DB commit; FAILED là thất bại biết chắc; UNKNOWN retry đúng key và payload. Cùng key khác payload → 409. Một lần apply thành công chỉ cập nhật CAS token `updatedAt` một lần, kể cả double-click/retry; Trip chưa có cột revision số để tăng. Không thực hiện provider call trong callback có thể retry. Preview và hủy candidate không ghi DB hoặc idempotency record. Khi UNKNOWN, giữ nguyên payload/key; chỉ bắt đầu intent mới sau khi kết quả cũ được xác định, không gọi hủy candidate là hoàn tác DB.

## External Services

Tái dùng routing US-29B hiện có tại `modules/trip-validation/stadia-route.ts`, theo ADR-17: `CAR → auto`, `MOTORCYCLE → motorcycle`; thiếu route hoặc không trả trong tối đa 10s → INSUFFICIENT_DATA. Không gọi OpenAI/Google Routes/Stadia hoặc dịch vụ ngoài trong transaction callback (ADR-09). Manual edit không cần OpenAI. Không thêm dependency/env/client mới; không gọi provider thật trong task docs hoặc automated tests.

## Acceptance Criteria

- [x] Task 263 thêm/xóa điểm trong candidate riêng; lựa chọn điểm mới chỉ lấy từ API công khai VISIBLE, chọn ngày/vị trí, và thao tác không ghi DB.
- [x] Task 264 đổi thứ tự, giờ/thời lượng và chuyển điểm sang ngày khác bằng điều khiển dùng được với bàn phím; thao tác chỉ cập nhật candidate, order do hàm task 265 tính lại.
- [x] Task 265 tạo strict candidate từ graph Trip đã lưu, giữ visit ID ổn định, deep-clone mọi thao tác và diff mà không mutate đầu vào; kiểm tra ngày/lượt theo schema hiện có.
- [x] Task 266 preview stateless: auth trước body, kiểm tra owned Trip/baseRevision/destination visibility và gọi Validator hiện có; không ghi DB, trả đủ bốn nhóm.
- [x] Task 267 gửi candidate cùng `baseRevision` tới route preview; hiển thị diff từ Task 265 và `TripValidationPanel` dùng chung, nêu điểm đến/ngày tương ứng khi finding trả visit ID; INSUFFICIENT_DATA tách biệt với PASS; kết quả mất hiệu lực khi candidate đổi; chỉ bật xác nhận khi cả bốn nhóm SATISFIED và candidate còn khớp snapshot đã kiểm tra.
- [x] Task 268 từ chối VIOLATION/INSUFFICIENT_DATA/thiếu xác nhận; apply PASS revalidates server-side ngoài transaction và chỉ ghi sau xác nhận. Hook bất biến visit hoàn thành cho `IN_TRIP` chưa được nối; US-36/task 289.
- [x] Given tất cả check bắt buộc PASS và Traveler sở hữu Trip đã xác nhận, when apply được DB commit, then API chỉ trả SUCCESS sau commit; chưa confirm hoặc DB chưa xác nhận thì chưa được gọi là đã lưu.
- [x] Given Guest hoặc Admin, when gọi apply kể cả body sai, then lần lượt 401/403 trước đọc body; Traveler khác chủ và Trip không tồn tại cùng 404.
- [ ] Browser acceptance (owner-run; NOT PROVEN): trang edit không tràn ngang ở 360px và thao tác add/remove bằng bàn phím; xem checklist thủ công bên dưới.
- [ ] Ownership và CAS revision được kiểm trong transaction; hai tab cùng baseRevision chỉ một phương án được ghi; không ghi một phần.
- [x] Task 269 hủy bỏ candidate local và quay về Trip detail không gọi API ghi; rời trang với thay đổi dùng `useUnsavedChanges`; UNKNOWN khóa candidate/hủy và retry giữ nguyên Idempotency-Key cùng payload; chỉ SUCCESS cập nhật baseRevision; 409/Validator rejection giữ candidate và yêu cầu kiểm tra lại.
- [x] SUCCESS/replay chỉ sau xác nhận commit; retry cùng payload/key không ghi lần hai; auth trước body và private cache header trên cả lỗi.
- [x] Task 270 automated suite covers valid preview/apply and revision advance, no write on VIOLATION/INSUFFICIENT_DATA, cancel without a write request, foreign ownership/auth, revision conflict, hidden destination, idempotency replay/payload conflict, and preview-route source audit using fake dependencies.

### Manual Browser Checklist — owner run only

Các mục sau dành cho Bình chạy trên browser. Chưa chạy trong phiên này; tất cả đều **NOT PROVEN** và để unchecked.

- [ ] **360px:** Trang edit không tràn ngang; nội dung, thao tác và kết quả Validator còn đọc được.
- [ ] **Bàn phím:** Có thể thêm/xóa, đổi thứ tự, chuyển ngày, sửa giờ, kiểm tra, xác nhận và hủy mà không cần chuột.
- [ ] **Hủy:** Có thay đổi candidate rồi chọn “Hủy chỉnh sửa”; quay về Trip detail và dữ liệu đã lưu không đổi.
- [ ] **Cảnh báo rời trang:** Khi candidate chưa áp dụng, thử back/link và xác nhận dialog cho phép ở lại hoặc rời trang theo lựa chọn.
- [ ] **Hai tab:** Mở cùng revision ở hai tab; sau khi một tab áp dụng, tab còn lại nhận conflict, không ghi đè và giữ candidate để xem xét.

## Test Plan

- Pure logic trong `.ts`, tests `*.vitest.test.ts` (không `.tsx`): edit/cancel/invalidation, reorder/move-day và affected neighboring legs.
- Task 263 `edit-session.vitest.test.ts`: add, remove, remove all visits from one day, and add the same destination as a separate visit; no candidate mutation.
- Task 264 `edit-session.vitest.test.ts`: move up/down, move to another day, valid time/duration updates and invalid time/duration input; no candidate mutation. No Validator or preview call.
- Inject fake repository/Validator/routes, `now` cố định: cả ba trạng thái, missing data, deadline 10s, mốc ngày Asia/Ho_Chi_Minh.
- Service/HTTP: Guest/Admin trước body, owner A/B và missing đều 404, foreign visit/day, tampered PASS/clock/userId.
- Task 266 focused tests: auth-before-body, strict body rejection, owned `id + userId` predicate, hidden destination, revision mismatch, four-group result, and INSUFFICIENT_DATA stays not confirmable. Use fake DB and injected route provider; no Neon or real routing call.
- Task 268 focused tests: same-key replay before stale validation, same-key/different-payload 409, stale revision 409, VIOLATION and INSUFFICIENT_DATA with validation details/no write, owner/missing 404, Guest 401, Admin 403, `confirmed !== true`, required idempotency key, and mid-transaction failure UNKNOWN/rollback. Fake DB only; no Neon or real route provider.
- Task 267 pure/client tests: confirmation disabled unless all four groups are SATISFIED and the checked candidate is current; candidate changes clear old results and late responses are ignored; fake fetch verifies preview URL/body, network failure and timeout. `getTripForEdit` test verifies owned lookup and that candidate plus `updatedAt` token come from one query.
- Task 269 pure/client tests: local cancel restores baseline without creating a write request; UNKNOWN retry retains the exact key and payload; SUCCESS advances baseRevision; 409 preserves the candidate; fake fetch verifies repeated apply sends the same Idempotency-Key and JSON body. Browser navigation dialog, authenticated route/DB, and UI rendering of a live 409/Validator rejection remain outside these unit tests.
- Task 270 `us32-test.vitest.test.ts`: route/service integration with an in-memory fake database, mocked deterministic Validator and fake route provider; verifies PASS preview→apply/revision advance, no write for VIOLATION/INSUFFICIENT_DATA, local cancel has no writer call, ownership/auth, stale revision, hidden destination, replay/different-payload conflict, and preview-route source imports. No Neon or real provider. Browser checklist remains owner-run and NOT PROVEN.
- Apply: validate outside transaction; no client-supplied Validator result is accepted. Success is emitted only after transaction commit. Completed-visit immutability for `IN_TRIP` remains a pending test/integration for US-36 task 289.
- Đã chạy Task 265–270 focused Vitest với fake DB/Validator/route provider; không kết nối Neon hoặc gọi routing thật. Test UI manual keyboard/responsive/loading, dialog rời trang, hai tab và live DB/provider chưa chạy.

## Expected Modules / Files

- `apps/web/src/modules/trip-edit/`: candidate logic, preview/apply services and HTTP adapters with `*.vitest.test.ts`.
- Task 265: `apps/web/src/modules/trip-edit/edit-candidate.ts` và `edit-candidate.vitest.test.ts`.
- `apps/web/src/app/trips/[id]/edit/`: Task 263 edit page/client component and editor styles; later tasks may add preview and pure UI logic `.ts`; không sửa `/trips/new`, list/detail Trip của dev khác.
- Tasks 263–264 state logic: `apps/web/src/modules/trip-edit/edit-session.ts` and `edit-session.vitest.test.ts`, reusing Task 265 add/remove/move/time/duration operations.
- `apps/web/src/lib/trip-edit-client.ts`: strict preview client and idempotent apply client; apply success is schema-checked and malformed success remains UNKNOWN for same-key reconciliation.
- `apps/web/src/modules/trip-edit/edit-apply-state.ts` and `edit-apply-state.vitest.test.ts`: pure state for immutable confirmation payload, UNKNOWN retry, SUCCESS revision update, known failure retention, and local cancel.
- `apps/web/src/modules/trip-edit/us32-test.vitest.test.ts`: Task 270 combined route/service acceptance and preview-route source audit with fake dependencies; do not edit existing tests for this task.
- `apps/web/src/app/api/trips/[id]/edits/preview/route.ts` and `apply/route.ts`: thin preview/apply adapters đã triển khai.
- Chỉ đọc/tái dùng shared auth/idempotency, US-28/29 và model US-30 sau handoff; thay đổi shared contract cần phối hợp riêng.
- Task 265 chỉ thêm pure logic/test trong `modules/trip-edit/`; không sửa `/trips/new`, Favorite modules/UI, Trip list/detail pages, Prisma schema hoặc migration.

## Migration Impact

US-32 không đổi schema hoặc migration. Nếu cần revision/visit identity hay cột khác chưa có, DỪNG và báo Bình để nhờ Thai Anh xử lý riêng ở task sở hữu schema; không tự thêm cột trong namespace edit. ADR-10 yêu cầu Prisma migration cho thay đổi schema của dev sở hữu; không `db:push`, sửa migration cũ, reset/drop DB dùng chung.

## Environment Impact

Không đổi env/dependency. Dùng client hiện có sau khi kiểm tra phù hợp; thiếu cấu hình provider không được coi là PASS.

## Implementation Sequence

1. Chốt OQ và handoff Trip/Validator/Planner; xác nhận story READY riêng.
2. Candidate Task 265, preview Task 266, idempotent apply Task 268, candidate editor Tasks 263–264, preview UI Task 267, cancel/apply client Task 269 and combined automated tests Task 270 are implemented. Manual browser checklist and unresolved owner questions still block READY. Không dùng mock runtime để che thiếu dependency.

## Acceptance Evidence

2026-10-16: Task 265 implements pure strict candidate operations and stable-ID diff. Task 266 implements a private no-store preview route and calls shared destination eligibility plus `validateItinerary`. Task 268 implements strict private apply, revalidation outside the transaction and idempotent atomic itinerary replacement. Task 263 adds the Traveler-owned edit page/client; it creates its candidate with `createEditCandidate`, keeps session changes in client state, and loads addable destinations through the existing public VISIBLE-only API. Task 264 adds up/down, move-day, time and duration controls; `edit-session.ts` delegates mutations to Task 265 functions. Task 267 adds a timeout-bounded read-only preview client, obtains candidate and `updatedAt` revision from one owner-scoped snapshot, displays the Task 265 diff and shared four-group `TripValidationPanel`, contextualizes affected visits, and invalidates stale results. At the Task 267 milestone, eight focused Vitest files / 57 tests passed; those client and confirmation-state tests use fakes. Detailed environment and NOT PROVEN evidence is appended in `docs/ai-progress.md`.

2026-10-17: Task 269 connects the checked candidate to `POST /api/trips/[id]/edits/apply` through `sendIdempotentMutation`. A confirmation snapshots one Idempotency-Key and payload; UNKNOWN locks candidate edits and cancellation and exposes same-key retry; only validated SUCCESS advances the local baseRevision/baseline. Known 409 and Validator rejection preserve the candidate, clear the stale preview, show the server reason/result, and leave “Kiểm tra” available. Explicit cancel discards only local candidate state and follows a typed Trip-detail link; other dirty navigation uses the unchanged shared `useUnsavedChanges` hook. Focused tests cover local cancellation, same-key/body retry, successful revision update, 409 retention, and the apply client using fake fetch.

2026-10-17: Task 270 adds `us32-test.vitest.test.ts` without changing existing tests. It drives the preview/apply HTTP adapters and service through a fake transactional database, a mocked `validateItinerary`, and a fake route provider. PASS preview→apply advances the revision; VIOLATION and INSUFFICIENT_DATA prove zero write-method calls; other cases cover cancellation without a write call, foreign ownership, Guest/Admin denial, 409 stale revision, hidden destination, same-key replay/different-payload 409, and preview-route source audit. The US-32 focused suite passes 10 files / 73 tests. The manual 360px, keyboard, cancel, leave-warning, and two-tab checks remain explicitly NOT PROVEN for Bình to run in a browser.

**Known gaps / NOT PROVEN:** Task 263–270 automated focused logic/client/route tests pass, but 360px visual overflow, keyboard flow, explicit cancel in browser, leave-warning behavior, and two-tab conflict handling have not been run; see the unchecked owner-run checklist above. Integration tests use fakes and do not exercise live auth, Neon, Stadia, or the browser UI. UI recovery from a real 409 or Validator rejection is not browser-tested. After a 409, the candidate stays intact and recheck remains available, but the UI has no rebase workflow; preview with the old baseRevision will continue to report conflict until a future refresh/rebase decision. `Trip` has no numeric revision column; implementation uses a monotonic `updatedAt` conditional CAS, which still needs owner confirmation. The Trip detail response still does not expose the token; the edit page obtains candidate and `updatedAt` together through its own owner-scoped service read. The `IN_TRIP` completed-visit invariant hook is optional and not wired by the route; US-36/task 289 must connect and test it before relying on in-trip edits. Destination freshness between out-of-transaction validation and commit remains open. `npm run check-types` could not start because no Node version is active; direct bundled `tsc --noEmit` reports pre-existing Cloudinary module/implicit-any errors only after Task 270 diagnostics are cleared.

## Open Questions

- **OQ-A — Completed visit:** “đã hoàn thành” suy ra theo giờ hay người dùng đánh dấu? Nguồn authoritative, cách cập nhật và phạm vi bảo vệ trong manual edit cần Bình + Thai Anh chốt; US-36/37 không tự suy ra.
- **OQ-B — Hidden historical destination:** Task 266 hiện chỉ cho preview khi mọi Destination trong candidate còn tồn tại và VISIBLE. Task 263 hiển thị nhãn chung “Điểm đến đã ẩn” và cho phép xóa khỏi candidate; wording/UX cuối cùng vẫn cần chốt, không tự xóa dữ liệu đã lưu hoặc công khai nội dung ẩn.
- **OQ-C — Location:** GPS ngoài Hà Giang xử lý thế nào; “vị trí thủ công đủ cụ thể” là tọa độ/pin/địa chỉ nào, yêu cầu độ chính xác và độ mới ra sao? Xem US-35.
- **OQ-D — Favorite FK:** Favorite → Trip dùng Restrict hay Cascade khi xóa Trip? Xem US-34; chưa quyết định thay owner.
- **OQ-E — Revision:** Task 266/apply dùng `updatedAt.toISOString()` làm `baseRevision` và apply có conditional CAS trên `id + userId + updatedAt`, vì schema Trip hiện không có cột revision. Thai Anh/Hoài chưa xác nhận đây là token liên service đủ dùng; Trip detail endpoint chưa trả token, còn trang edit có service owner-scoped riêng đọc candidate và token từ cùng snapshot. Không tự thêm revision/cột hoặc coi preview comparison là atomic guard.
- **OQ-F — DTO/policy:** Shape persisted/save đã rõ qua US-30 và Planner proposal của Hoài; candidate task 265 dùng `dayIndex`/`visits` và `visitId` từ `ItineraryVisit.id`. Còn cần quyết định product về giới hạn 4 visit/ngày (hiện contract Planner có giới hạn này nhưng save schema cho phép tối đa 50 tổng), quy tắc lặp destination, thời lượng/khung giờ khi thêm visit và phạm vi ngày có thể sửa. Không tự coi tuning Planner là product baseline ngoài contract task 265.
- **OQ-G — Validation freshness:** Làm sao phát hiện dữ liệu giờ mở cửa/visibility/routing thay đổi giữa validation ngoài transaction và commit? Cần contract snapshot/version và kiểm tra DB phù hợp; không gọi provider trong transaction và không tuyên bố revision Trip bảo vệ cả dữ liệu Destination.
- **OQ-H — Mandatory checks/replay:** Task 266 gọi chữ ký aggregate hiện có `validateItinerary(visits, routes, timeReference)`; Task 268 chỉ apply khi `canConfirm` và revalidates ngoài transaction, rồi dùng `executeIdempotentWrite` với `trip:apply-edit`. API nhận MANUAL/AI/IN_TRIP như shared design đề xuất; `IN_TRIP` completed-visit hook vẫn chưa được production route nối cho tới US-36/task 289. Contract dùng chung, CAS token `updatedAt` và freshness giữa validation/commit cần Hoài/Thai Anh xác nhận. Các OQ-C/D thuộc story khác chỉ là tham chiếu cũ, không giao thêm việc GPS/Favorite cho US-32.

## Handoff Notes

US-33/36/37 có thể dùng mục Shared stateless preview/apply design làm điểm tham chiếu đề xuất; chưa được coi là contract liên dev đã duyệt. Bình phụ trách namespace edit; Thai Anh phụ trách Trip/Validator; Hoài phụ trách schema itinerary/Planner. Không triển khai story khác, sửa file dev khác, commit/push/merge trong task docs này. `docs/ai-progress.md` có conflict markers tồn tại từ baseline; chỉ append entry, không tự resolve các entry trước đó.

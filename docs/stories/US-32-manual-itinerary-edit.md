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

Contract DRAFT cho task 263–270; chưa có implementation hoặc acceptance runtime. Thiết kế candidate/preview/apply dưới đây là **ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận**. Khả năng dùng chung với US-33/36/37 không đưa các story đó vào phạm vi US-32.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Deterministic Constraint Validator; Roles and access; Write semantics and recovery.
- [User flows](../flow/user-flow.md#edit-itinerary): Edit itinerary; In-trip assistant; Write recovery.
- [Source precedence](../source-baselines.md), [technical architecture](../architecture/technical-architecture.md), [ADR-08/09/10](../decisions.md).
- Backlog task 263–270 và thiết kế đề xuất do Bình cung cấp trực tiếp ngày 2026-10-15. Story dựa trên các mục product-spec/user-flow được chỉ định ở trên; Product/System DOCX và Figma frame cụ thể chưa được đối chiếu, không tự gán requirement ID hoặc layout.

## Dependencies

- **Trip model — Thai Anh Nguyen:** kiểm tra `packages/db/prisma/schema/*.prisma` ngày 2026-10-15 chưa thấy model Trip/ItineraryDay/Visit; chưa có ownership `userId`, định danh visit, revision hoặc `updatedAt` của Trip. Thuộc handoff US-30 task 252; Save API task 253 và owned read/detail task 257/260 là điểm tích hợp. `apps/web/src/app/trips/` hiện chỉ có `new/`, chưa có `/trips/[id]`. Không tự dựng model/mock thay thế.
- **Constraint Validator — Thai Anh Nguyen:** đã có `modules/trip-validation/visit-constraints.ts` (`checkOpeningHours`, `checkMinimumVisitDuration`), `travel-time.ts` (`checkTravelTime`) và `stadia-route.ts` (`getTravelRoute`, `checkTravelLeg`). Còn cần handoff US-29A/B/C task 236–251: chữ ký tổng hợp bốn nhóm, schedule-conflict, mapping itinerary, input/data/time reference và điều kiện xác nhận. `modules/trip-planner/planner-validator.ts` là code Planner hiện có, không thay thế contract Validator của Thai Anh hoặc chứng minh tích hợp US-32.
- **Có US-28 của Hoài:** `PlannerDay`/`PlannerStop`, candidate eligibility và UI checks. Chưa có `visitId`; field hiện tại là `day`, `arrivalMinute`, `visitDurationMinutes`, `destination.id`. Cần thống nhất adapter trước implementation, không thay contract của Hoài bằng schema tự dựng.
- **Schema itinerary — Tô Xuân Hoài:** `modules/trip-planner/planner-contract.ts` là contract đề xuất Planner hiện có, không phải schema Trip lưu chính thức. Hoài cần xác nhận hình dạng itinerary/adapter cùng Thai Anh trước khi Bình triển khai; không viết schema thay thế.
- Có shared `requireTraveler`, `executeIdempotentWrite`, `preflightIdempotentReplay`, response/error helpers. Chưa có `modules/trip-edit/`, `app/trips/[id]/edit/`, `lib/trip-edit-client.ts` hoặc API edits để tái dùng; kiểm tra lại khi bắt đầu implementation.
- **DỪNG: thiếu phụ thuộc — đối với triển khai US-32.** Cần Trip/owned detail/revision từ Thai Anh, Validator tổng hợp từ Thai Anh và schema itinerary/handoff từ Hoài. Task hiện tại chỉ viết docs nên tiếp tục ghi nhận blocker, không dựng code/validator/mock hay đổi schema để vượt blocker.

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

Candidate chứa các ngày và lượt với destination, ngày, giờ bắt đầu, thời lượng và thứ tự. Visit hiện hữu cần định danh ổn định; định danh lượt mới và mapping day/time chờ handoff Hoài/Thai Anh. Không nhận `userId`, kết quả PASS hay trạng thái completed do client tự chứng nhận. Không khóa kiểu `baseRevision` hoặc cấu trúc days/visits trước khi schema lưu và cơ chế version được xác nhận.

Preview trả candidate chuẩn hóa, baseRevision, checks/issues, affected visits/legs, thời điểm kiểm tra và `eligibleForConfirmation`. Field name, bounds và result mapping chờ handoff US-29/30; không hardcode một DTO mới ở implementation trước handoff.

## API Contract

Các endpoint sau **chỉ là ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận**, chưa tồn tại:

| Endpoint | Request đề xuất | Response |
| --- | --- | --- |
| `POST /api/trips/[id]/edits/preview` | `{ baseRevision, candidate }` | `{ success: true, data: preview }`; invalid structure trả shared error; phương án vi phạm/thiếu dữ liệu có kết quả checks, không được gọi là đã lưu; không ghi DB |
| `POST /api/trips/[id]/edits/apply` | `{ baseRevision, candidate, confirmed: true, kind: 'MANUAL' \| 'AI' \| 'IN_TRIP' }` + `Idempotency-Key` bắt buộc | Shared mutation envelope; SUCCESS trả owned trip/result và revision đã commit |

Không dùng preview ID như dữ liệu được lưu ở server. Apply gửi lại đầy đủ candidate; server không tin preview/checks từ client. Tái dùng `server/http/api-response.ts`, `error-handler.ts` và `AppError`; không tạo envelope riêng. Preview lỗi dùng `{ success: false, error: { code, message, details? } }`. Apply dùng:

- SUCCESS: HTTP 200, `{ success: true, operationStatus: 'SUCCESS', data }`; replay có `Idempotency-Replayed: true`.
- FAILED: `{ success: false, operationStatus: 'FAILED', error: { code, message, details? } }` với HTTP status tương ứng.
- UNKNOWN: HTTP 503, `{ success: false, operationStatus: 'UNKNOWN', error, retryWithSameKey: true }`.

Error mapping cho DRAFT:

| Trường hợp | HTTP / code | Cơ sở |
| --- | --- | --- |
| Guest / Admin | 401 `UNAUTHENTICATED` / 403 `FORBIDDEN` | Shared authorization policy/guard; không đọc body trước auth |
| Không tồn tại / không thuộc chủ | 404 `NOT_FOUND` | Cùng thông báo “Không tìm thấy dữ liệu được phép truy cập.” theo `server/authorization/policy.ts`; không tiết lộ existence |
| Body/candidate sai cấu trúc hoặc thiếu xác nhận | 400 `VALIDATION_ERROR` | Theo `trip-requirement-check-http.ts` và `trip-planner/planner-http.ts` |
| Apply có VIOLATION, INSUFFICIENT_DATA hoặc thiếu check bắt buộc | 400 `VALIDATION_ERROR` | Đề xuất tái dùng mã/status validation hiện có; details chứa kết quả authoritative theo contract Validator cần handoff, không tự đặt mã/envelope mới hoặc mặc định 422 |
| Trip đã đổi so với baseRevision | 409 `TRIP_REVISION_CONFLICT` | Mã đề xuất theo yêu cầu task này, chưa có implementation |
| Thiếu / sai Idempotency-Key | 400 `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | `requireIdempotencyKey` hiện có |
| Cùng key, payload khác | 409 `IDEMPOTENCY_KEY_REUSED` | Shared idempotency hiện có |
| Không xác định kết quả ghi | 503 `OPERATION_STATUS_UNKNOWN` | Shared mutation contract |

Preview trả HTTP 200 với checks VIOLATION/INSUFFICIENT_DATA khi đã chạy kiểm tra thành công; đó là kết quả kiểm tra, không phải ghi itinerary thành công. DTO/details, request limits và mapping Trip còn cần Hoài/Thai Anh xác nhận trước READY.

### Shared stateless preview/apply design

**ĐỀ XUẤT, chưa được Hoài/Thai Anh xác nhận.** US-33/36/37 có thể tham chiếu mục này; phạm vi triển khai US-32 vẫn chỉ manual edit:

1. Candidate chỉ giữ trong bộ nhớ client của phiên tương tác. Server xử lý candidate tạm trong request; không ghi candidate vào DB/cache/session và không giữ proposal giữa các request. Không đưa candidate/location/nhu cầu riêng vào URL, log hay browser storage.
2. Preview: auth trước body; service đọc owned Trip và dữ liệu có thẩm quyền, kiểm tra baseRevision, chuẩn hóa candidate rồi chạy Validator với `now` được truyền vào. Trả preview; không có business write hay idempotency record cho preview.
3. Apply mới: auth, ownership, parse/normalize, lấy dữ liệu hiện hành và **chạy Validator ngoài transaction**. OpenAI/Google Routes tuyệt đối không nằm trong transaction callback. Không coi preview cũ là chứng nhận.
4. Khi tất cả kiểm tra bắt buộc PASS và có xác nhận rõ ràng, dùng `executeIdempotentWrite`. Trong transaction: kiểm tra lại Traveler/ownership với `WHERE id AND userId`, so baseRevision; thay days/visits và tăng **revision + 1** cùng success record, tất cả nguyên tử. Guard revision phải là CAS/lock tương đương ở DB với `id AND userId AND revision = baseRevision`, không chỉ đọc rồi update vô điều kiện. Nếu guard thất bại, rollback toàn bộ và trả 409 `TRIP_REVISION_CONFLICT`; không tự merge/ghi đè. Đây là thiết kế dự kiến trên model chưa tồn tại, không tự thêm cột revision.
5. Retry cùng key/payload đã commit phải replay SUCCESS **trước khi** revision mới hoặc việc revalidation/provider lần nữa làm thất bại replay. Giữ auth/ownership boundary; tái dùng `preflightIdempotentReplay` hiện có trước revalidation cho request mới và giữ kiểm tra replay trong `executeIdempotentWrite` cho race. Cách wiring vào Trip service chờ handoff. Replay không tăng revision và không tạo thêm business write. Bản ghi idempotency thành công không phải nơi lưu draft candidate.
6. Server stateless về candidate không có nghĩa bỏ trạng thái Trip/idempotency trong DB. Schema revision còn phụ thuộc OQ-E; chưa có revision thì không tuyên bố cơ chế chống ghi đè đã hoạt động.

## Error / Recovery

Preview lỗi giữ candidate local để sửa/thử lại. Revision conflict yêu cầu đọc lại Trip và xem lại thay đổi, không tự ghi đè. FAILED giữ itinerary cũ nếu transaction rollback. UNKNOWN có thể đã commit: giữ nguyên request/key để đối soát/retry; không báo hủy thành công hoặc tự gửi payload mới. Lỗi provider chỉ trả thông báo an toàn, không lộ secret/nội dung riêng.

## Write Semantics / Idempotency

Tuân theo shared design đề xuất, ADR-08/09 và `executeIdempotentWrite`; operation đề xuất `trip-edit:apply`, scope gồm actor + operation, input hash gồm tripId/baseRevision/candidate/confirmed/kind. SUCCESS chỉ sau DB commit; FAILED là thất bại biết chắc; UNKNOWN retry đúng key và payload. Cùng key khác payload → 409. Một lần apply thành công chỉ tăng revision một lần, kể cả double-click/retry từ hai request. Không thực hiện provider call trong callback có thể retry. Preview và hủy candidate không ghi DB hoặc idempotency record. Khi UNKNOWN, giữ nguyên payload/key; chỉ bắt đầu intent mới sau khi kết quả cũ được xác định, không gọi hủy candidate là hoàn tác DB.

## External Services

Tái dùng routing US-29B hiện có tại `modules/trip-validation/stadia-route.ts`, theo ADR-17: `CAR → auto`, `MOTORCYCLE → motorcycle`; thiếu route hoặc không trả trong tối đa 10s → INSUFFICIENT_DATA. Không gọi OpenAI/Google Routes/Stadia hoặc dịch vụ ngoài trong transaction callback (ADR-09). Manual edit không cần OpenAI. Không thêm dependency/env/client mới; không gọi provider thật trong task docs hoặc automated tests.

## Acceptance Criteria

- [ ] Task 263/264 tạo candidate riêng cho thêm/xóa/đổi thứ tự/thời gian/ngày; thao tác chưa apply không đổi DB.
- [ ] Task 265–267 preview stateless, hiển thị đủ bốn nhóm và đối tượng/chặng ảnh hưởng; thay đổi sau preview cần kiểm tra lại.
- [ ] Task 268 từ chối VIOLATION/INSUFFICIENT_DATA/thiếu xác nhận; apply PASS revalidates server-side ngoài transaction.
- [ ] Given tất cả check bắt buộc PASS và Traveler sở hữu Trip đã xác nhận, when apply được DB commit, then chỉ lúc đó hiển thị SUCCESS và hành trình mới; chưa confirm hoặc DB chưa xác nhận thì chưa được gọi là đã lưu.
- [ ] Given Guest hoặc Admin, when gọi preview/apply kể cả body sai, then lần lượt 401/403 trước đọc body; Traveler khác chủ và Trip không tồn tại cùng 404.
- [ ] Ownership và CAS revision được kiểm trong transaction; hai tab cùng baseRevision chỉ một phương án được ghi; không ghi một phần.
- [ ] Task 269 hủy trước apply giữ nguyên itinerary; UNKNOWN không bị diễn giải thành rollback.
- [ ] SUCCESS/replay chỉ sau xác nhận commit; retry cùng payload/key không tăng revision lần hai; auth trước body và private cache header trên cả lỗi.
- [ ] Task 270 chứng minh các tiêu chí bằng tests; không đánh dấu READY khi OQ chặn contract chưa được giải quyết.

## Test Plan

- Pure logic trong `.ts`, tests `*.vitest.test.ts` (không `.tsx`): edit/cancel/invalidation, reorder/move-day và affected neighboring legs.
- Inject fake repository/Validator/routes, `now` cố định: cả ba trạng thái, missing data, deadline 10s, mốc ngày Asia/Ho_Chi_Minh.
- Service/HTTP: Guest/Admin trước body, owner A/B và missing đều 404, foreign visit/day, tampered PASS/clock/userId.
- Apply: validate ngoài transaction; thiếu/false confirmed, tampered PASS, VIOLATION, INSUFFICIENT_DATA hoặc thiếu check đều không ghi. PASS + xác nhận + commit mới SUCCESS; CAS race, rollback thay days/visits, changed key payload (kể cả kind), double-click, lost-response replay sau revision tăng và không gọi provider lại. Không kết nối Neon hoặc OpenAI/Google/Stadia thật. Test doubles chỉ dùng trong tests sau handoff, không thay thế dependency runtime.
- Khi đủ dependency: manual keyboard/responsive/loading/conflict/UNKNOWN; typecheck và checks phù hợp. Đây là kế hoạch, chưa chạy.

## Expected Modules / Files

- `apps/web/src/modules/trip-edit/`: contract/logic/service/http/server và `*.vitest.test.ts`.
- `apps/web/src/app/trips/[id]/edit/`: editor, preview, pure UI logic `.ts`; không sửa `/trips/new`, list/detail Trip của dev khác.
- `apps/web/src/lib/trip-edit-client.ts`: tái dùng mutation contract cho preview/apply/retry.
- `apps/web/src/app/api/trips/[id]/edits/preview/route.ts`, `apps/web/src/app/api/trips/[id]/edits/apply/route.ts`: thin adapters đề xuất.
- Chỉ đọc/tái dùng shared auth/idempotency, US-28/29 và model US-30 sau handoff; thay đổi shared contract cần phối hợp riêng.
- Task docs hiện tại chỉ sửa story này và append `docs/ai-progress.md`; không sửa `app/trips/new/*`, `modules/favorite/*`, `modules/favorites/*`, `components/favorite-button.tsx`, `app/favorites/*`, `app/trips/page.tsx`, `app/trips/[id]/page.tsx`, Prisma schema hoặc migration.

## Migration Impact

US-32 không đổi schema hoặc migration. Nếu cần revision/visit identity hay cột khác chưa có, DỪNG và báo Bình để nhờ Thai Anh xử lý riêng ở task sở hữu schema; không tự thêm cột trong namespace edit. ADR-10 yêu cầu Prisma migration cho thay đổi schema của dev sở hữu; không `db:push`, sửa migration cũ, reset/drop DB dùng chung.

## Environment Impact

Không đổi env/dependency. Dùng client hiện có sau khi kiểm tra phù hợp; thiếu cấu hình provider không được coi là PASS.

## Implementation Sequence

1. Chốt OQ và handoff Trip/Validator/Planner; xác nhận story READY riêng.
2. Contract/pure edit logic → preview → UI → idempotent apply/CAS → tests/evidence. Không dùng mock runtime để che thiếu dependency.

## Acceptance Evidence

2026-10-15: cập nhật story DRAFT đã tồn tại theo `US-TEMPLATE.md`, đúng user story và task 263–270 do Bình cung cấp. Source audit xác nhận thiếu Trip/ItineraryDay/Visit/owned detail và namespace edit; US-29A/B có hàm riêng nhưng handoff Validator tổng hợp và schema itinerary vẫn chưa chốt. Đã đối chiếu shared auth/HTTP/idempotency, sửa API đề xuất sang `/edits/`, thêm `kind`, và dùng mapping routing hiện tại theo ADR-17. Các lựa chọn API/candidate/revision vẫn là đề xuất chưa được Hoài/Thai Anh xác nhận.

**Known gaps / NOT PROVEN:** chưa có implementation hoặc acceptance runtime cho task 263–270; chưa chứng minh model/revision/CAS, Validator tích hợp, cancel/apply, API, browser, DB commit/replay hoặc provider live. DOCX/Figma chưa đối chiếu. Kết quả lệnh kiểm tra docs/typecheck/tests của task này được ghi ở entry cuối `docs/ai-progress.md`; không dùng evidence US-28 như acceptance story này.

Kiểm tra docs: đủ mục template, DRAFT, đúng tám task 263–270, link nguồn nội bộ tồn tại và không còn API `/edit/` cũ. Regression `src/modules/trip-validation`: 2 file / 31 tests PASS (không chứng minh US-32 đã triển khai). `npm run check-types` qua Node 22.20.0 có sẵn thất bại ở hai lỗi ngoài scope: `cloudinary-provider.ts:2` TS2307 thiếu module `cloudinary` và `:75` TS7006 implicit any. Không sửa dependency/shim; không chạy build/full suite vì chỉ đổi docs.

## Open Questions

- **OQ-A — Completed visit:** “đã hoàn thành” suy ra theo giờ hay người dùng đánh dấu? Nguồn authoritative, cách cập nhật và phạm vi bảo vệ trong manual edit cần Bình + Thai Anh chốt; US-36/37 không tự suy ra.
- **OQ-B — Hidden historical destination:** Điểm đến trong Trip đã lưu bị ẩn sau này được giữ/hiển thị/kiểm tra ra sao khi edit? Không tự áp rule candidate mới để xóa lịch sử hoặc công khai nội dung ẩn.
- **OQ-C — Location:** GPS ngoài Hà Giang xử lý thế nào; “vị trí thủ công đủ cụ thể” là tọa độ/pin/địa chỉ nào, yêu cầu độ chính xác và độ mới ra sao? Xem US-35.
- **OQ-D — Favorite FK:** Favorite → Trip dùng Restrict hay Cascade khi xóa Trip? Xem US-34; chưa quyết định thay owner.
- **OQ-E — Revision:** Trip có `revision` hoặc `updatedAt` đủ làm token chống ghi đè hai tab không? Thiết kế trên đề xuất revision/CAS và tăng revision + 1; nếu owner chọn updatedAt thì phải chốt lại baseRevision/token và atomic guard, không tự coi tương đương đã được duyệt. Thai Anh cần thống nhất schema/DTO với Bình/Hoài; thiếu cột thì dừng, US-32 không đổi schema.
- **OQ-F — DTO/policy:** Hình dạng itinerary chính thức của Hoài là gì; chữ ký/mapping days/visits, visit mới dùng định danh nào; mapping day/time/order, bounds, cho phép lặp destination/đổi phạm vi ngày ra sao? Không tự nâng cap/khung giờ của Planner thành baseline nghiệp vụ.
- **OQ-G — Validation freshness:** Làm sao phát hiện dữ liệu giờ mở cửa/visibility/routing thay đổi giữa validation ngoài transaction và commit? Cần contract snapshot/version và kiểm tra DB phù hợp; không gọi provider trong transaction và không tuyên bố revision Trip bảo vệ cả dữ liệu Destination.
- **OQ-H — Mandatory checks/replay:** Chữ ký Validator tổng hợp của Thai Anh (input, data snapshot, now, output) là gì; chốt bốn nhóm US-29 và quan hệ với MOBILITY của US-28. `preflightIdempotentReplay` đã có, nhưng wiring ownership/replay/validation/CAS của Trip service chưa có. DTO/details, operation, giới hạn request và API dùng chung (kể cả kind ngoài MANUAL) cần Hoài/Thai Anh xác nhận. Các OQ-C/D thuộc story khác chỉ là tham chiếu cũ, không giao thêm việc GPS/Favorite cho US-32.

## Handoff Notes

US-33/36/37 có thể dùng mục Shared stateless preview/apply design làm điểm tham chiếu đề xuất; chưa được coi là contract liên dev đã duyệt. Bình phụ trách namespace edit; Thai Anh phụ trách Trip/Validator; Hoài phụ trách schema itinerary/Planner. Không triển khai story khác, sửa file dev khác, commit/push/merge trong task docs này. `docs/ai-progress.md` có conflict markers tồn tại từ baseline; chỉ append entry, không tự resolve các entry trước đó.

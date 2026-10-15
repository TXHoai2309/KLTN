# US-32 — Chỉnh sửa thủ công hành trình đã lưu

## Status

DRAFT

## Epic

Quản lý hành trình đã lưu và hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình. Phụ thuộc Trip/Validator của Thai Anh Nguyen và Planner của Tô Xuân Hoài.

## Goal / User Story

Là Du khách, tôi muốn chỉnh sửa thủ công hành trình đã lưu, xem trước và kiểm tra phương án trước khi xác nhận, để chỉ thay đổi hành trình chính thức khi phương án hợp lệ và ghi dữ liệu thành công.

## Outcome

Contract DRAFT cho task 263–270; chưa có implementation hoặc acceptance runtime. Đây cũng là thiết kế preview/apply dùng chung cho US-33/36/37 theo yêu cầu của Bình ngày 2026-10-15.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Deterministic Constraint Validator; Roles and access; Write semantics and recovery.
- [User flows](../flow/user-flow.md#edit-itinerary): Edit itinerary; In-trip assistant; Write recovery.
- [Source precedence](../source-baselines.md), [technical architecture](../architecture/technical-architecture.md), [ADR-08/09/10](../decisions.md).
- Backlog task 263–297 và thiết kế chung do Bình cung cấp trực tiếp ngày 2026-10-15. Product/System DOCX và Figma frame cụ thể chưa được đối chiếu; không tự gán requirement ID hoặc layout.

## Dependencies

- **Chưa có:** Trip/ItineraryDay/Visit, quan hệ `userId`, định danh visit và revision; thuộc US-30 task 252 của Thai Anh Nguyen. Save API task 253 và owned read/detail task 257/260 là điểm tích hợp, không tự dựng model/mock thay thế.
- **Cần handoff US-29A/B/C:** task 236–251 của Thai Anh Nguyen cho bốn nhóm Validator, deterministic input/data/time reference, routing và điều kiện xác nhận. Code sơ bộ có `modules/trip-planner/planner-validator.ts`, `planner-routes.ts`, `planner-contract.ts`; không coi đây là US-29 đã nghiệm thu.
- **Có US-28 của Hoài:** `PlannerDay`/`PlannerStop`, candidate eligibility và UI checks. Chưa có `visitId`; field hiện tại là `day`, `arrivalMinute`, `visitDurationMinutes`, `destination.id`. Cần thống nhất adapter trước implementation, không thay contract của Hoài bằng schema tự dựng.
- Có shared `requireTraveler`, `executeIdempotentWrite`, response/error helpers. Viết docs không bị chặn bởi các dependency chưa có; implementation tích hợp vẫn bị chặn.

## In Scope

- Thêm/xóa điểm đến; đổi thứ tự, thời gian và chuyển ngày trong candidate của chuyến đã lưu thuộc người dùng.
- Preview không ghi; chạy lại Validator; xem thay đổi và xác nhận/hủy.
- Apply idempotent theo thiết kế chung bên dưới.

## Out of Scope

- Tạo Trip ban đầu, sửa schema/model của dev khác, AI edit, GPS/replan, Favorite Trip.
- Lưu candidate/draft phía server, cộng tác nhiều người, tối ưu tuyến phức tạp, tự sửa completed visits.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 263 | [FE] Thêm/xóa điểm đến |
| 264 | [FE] Đổi thứ tự, thời gian, chuyển ngày |
| 265 | [BE] Phương án tách biệt |
| 266 | [BE/API] Chạy lại Validator |
| 267 | [FE] Xem trước + kết quả kiểm tra |
| 268 | [BE/API] Chỉ cập nhật khi Validator đạt và user xác nhận |
| 269 | [FE] Hủy, giữ nguyên hành trình cũ |
| 270 | [TEST] |

## Business Rules

- Candidate tách biệt hành trình đã lưu; mọi thay đổi candidate làm kết quả preview trước đó hết hiệu lực. Hủy không ghi itinerary.
- Chỉ điểm đến có thật và đủ điều kiện mới được thêm vào itinerary. Cách xử lý điểm đến cũ bị ẩn nằm ở OQ-B; không tự xóa lịch sử.
- Bốn nhóm bắt buộc: opening hours, minimum duration, travel time, schedule conflict. Chỉ xác nhận khi tất cả kiểm tra bắt buộc PASS; VIOLATION và INSUFFICIENT_DATA đều chặn apply. Không dùng AI điền dữ liệu còn thiếu.
- Revalidate thay đổi và các chặng/khung giờ liên quan, kể cả qua ranh giới ngày; không chỉ kiểm tra riêng stop được sửa.
- Thời gian nghiệp vụ `Asia/Ho_Chi_Minh`; core nhận `now` từ tham số do server boundary cung cấp, không tự gọi `new Date()` hoặc tin clock client.
- Không tự kế thừa khung 08:00–18:00, cap số stop hoặc cấm lặp destination của Planner sơ bộ thành rule chỉnh sửa đã được duyệt.

## Roles / Authorization

Chỉ Traveler qua `requireTraveler`; Guest 401, Admin 403, không có bypass. Auth trước đọc body. Route Handler chỉ auth/parse → service → map response; ownership và nghiệp vụ nằm ở service. Mọi response private dùng `Cache-Control: private, no-store`.

## Ownership Rules

Lấy `userId` từ session; truy vấn Trip với `WHERE id AND userId`. Không thuộc sở hữu/không tồn tại trả cùng 404. Kiểm tra visit/day thuộc chính Trip đó; không chấp nhận ID của Trip khác. Recheck ownership trong transaction apply.

## UX / UI Contract

Editor tại `/trips/[id]/edit` là đường dẫn đề xuất. Có loading/empty/error/401/403/404, candidate chưa kiểm tra, đang preview, ba trạng thái Validator, đang apply, FAILED, UNKNOWN, xung đột revision và SUCCESS. Hiển thị trước/sau và đối tượng/chặng ảnh hưởng. Hủy trước apply giữ dữ liệu đã lưu; sau khi đã gửi apply, không coi đóng UI/abort là rollback. Link mới tuân theo typedRoutes (`as Route` như code hiện có). Figma cần đối chiếu; responsive từ 360px và thao tác bàn phím.

## Data Contract

**Đề xuất, chưa phải schema được duyệt:** `EditRequest = { baseRevision, candidate }`; candidate chứa các ngày và lượt với destination, ngày, giờ bắt đầu, thời lượng và thứ tự. Visit hiện hữu cần định danh ổn định; định danh lượt mới và mapping day/time chờ task 252. Không nhận `userId`, kết quả PASS hay trạng thái completed do client tự chứng nhận.

Preview trả candidate chuẩn hóa, baseRevision, checks/issues, affected visits/legs, thời điểm kiểm tra và `eligibleForConfirmation`. Field name, bounds và result mapping chờ handoff US-29/30; không hardcode một DTO mới ở implementation trước handoff.

## API Contract

Các endpoint sau **chỉ là đề xuất**, chưa tồn tại:

| Endpoint | Request đề xuất | Response |
| --- | --- | --- |
| `POST /api/trips/[id]/edit/preview` | `{ baseRevision, candidate }` | `{ success: true, data: preview }`; invalid structure trả shared error; phương án vi phạm/thiếu dữ liệu có kết quả checks, không được gọi là đã lưu |
| `POST /api/trips/[id]/edit/apply` | `{ baseRevision, candidate, confirmed: true }` + `Idempotency-Key` | Shared mutation envelope; SUCCESS trả owned trip/result và revision đã commit |

Không dùng preview ID như dữ liệu được lưu ở server. Apply gửi lại đầy đủ candidate; server không tin preview/checks từ client. Error mapping đề xuất: 400 malformed input, 401/403 auth, 404 ownership, 409 base revision/key conflict, 422 không đủ điều kiện apply; routing thiếu dữ liệu thể hiện trong Validator. Tên error code, limits và DTO cần chốt trước READY.

### Shared stateless preview/apply design

Áp dụng cho US-32 và được US-33/36/37 tham chiếu:

1. Candidate chỉ giữ trong bộ nhớ client của phiên tương tác. Server xử lý candidate tạm trong request; không ghi candidate vào DB/cache/session và không giữ proposal giữa các request. Không đưa candidate/location/nhu cầu riêng vào URL, log hay browser storage.
2. Preview: auth trước body; service đọc owned Trip và dữ liệu có thẩm quyền, kiểm tra baseRevision, chuẩn hóa candidate rồi chạy Validator với `now` được truyền vào. Trả preview; không có business write hay idempotency record cho preview.
3. Apply mới: auth, ownership, parse/normalize, lấy dữ liệu hiện hành và **chạy Validator ngoài transaction**. OpenAI/Google Routes tuyệt đối không nằm trong transaction callback. Không coi preview cũ là chứng nhận.
4. Khi tất cả kiểm tra bắt buộc PASS và có xác nhận rõ ràng, dùng `executeIdempotentWrite`. Trong transaction: kiểm tra lại Traveler/ownership, baseRevision; ghi các thay đổi itinerary và tăng **revision + 1** cùng success record, tất cả nguyên tử. Guard revision phải là CAS/lock tương đương ở DB với `id AND userId AND revision = baseRevision`, không chỉ đọc rồi update vô điều kiện. Nếu guard thất bại, rollback toàn bộ và trả conflict; không tự merge/ghi đè.
5. Retry cùng key/payload đã commit phải replay SUCCESS **trước khi** revision mới hoặc việc revalidation/provider lần nữa làm thất bại replay. Giữ auth/ownership boundary; thống nhất cách phối hợp replay lookup với shared helper trước implementation. Replay không tăng revision và không tạo thêm business write. Bản ghi idempotency thành công không phải nơi lưu draft candidate.
6. Server stateless về candidate không có nghĩa bỏ trạng thái Trip/idempotency trong DB. Schema revision còn phụ thuộc OQ-E; chưa có revision thì không tuyên bố cơ chế chống ghi đè đã hoạt động.

## Error / Recovery

Preview lỗi giữ candidate local để sửa/thử lại. Revision conflict yêu cầu đọc lại Trip và xem lại thay đổi, không tự ghi đè. FAILED giữ itinerary cũ nếu transaction rollback. UNKNOWN có thể đã commit: giữ nguyên request/key để đối soát/retry; không báo hủy thành công hoặc tự gửi payload mới. Lỗi provider chỉ trả thông báo an toàn, không lộ secret/nội dung riêng.

## Write Semantics / Idempotency

Tuân theo shared design, ADR-08/09 và `executeIdempotentWrite`; operation đề xuất `trip-edit:apply`, scope gồm actor + operation, input hash gồm tripId/baseRevision/candidate/confirmed. SUCCESS chỉ sau DB commit; FAILED là thất bại biết chắc; UNKNOWN retry đúng key và payload. Cùng key khác payload → 409. Một lần apply thành công chỉ tăng revision một lần, kể cả double-click/retry từ hai request. Không thực hiện provider call trong callback có thể retry.

## External Services

Tái dùng routing của US-29B: `CAR → DRIVE`, `MOTORCYCLE → TWO_WHEELER`; thiếu route hoặc không trả trong tối đa 10s → INSUFFICIENT_DATA. Không thêm dependency/env/client mới trong story docs này.

## Acceptance Criteria

- [ ] Task 263/264 tạo candidate riêng cho thêm/xóa/đổi thứ tự/thời gian/ngày; thao tác chưa apply không đổi DB.
- [ ] Task 265–267 preview stateless, hiển thị đủ bốn nhóm và đối tượng/chặng ảnh hưởng; thay đổi sau preview cần kiểm tra lại.
- [ ] Task 268 từ chối VIOLATION/INSUFFICIENT_DATA/thiếu xác nhận; apply PASS revalidates server-side ngoài transaction.
- [ ] Ownership và CAS revision được kiểm trong transaction; hai tab cùng baseRevision chỉ một phương án được ghi; không ghi một phần.
- [ ] Task 269 hủy trước apply giữ nguyên itinerary; UNKNOWN không bị diễn giải thành rollback.
- [ ] SUCCESS/replay chỉ sau xác nhận commit; retry cùng payload/key không tăng revision lần hai; auth trước body và private cache header trên cả lỗi.
- [ ] Task 270 chứng minh các tiêu chí bằng tests; không đánh dấu READY khi OQ chặn contract chưa được giải quyết.

## Test Plan

- Pure logic trong `.ts`, tests `*.vitest.test.ts` (không `.tsx`): edit/cancel/invalidation, reorder/move-day và affected neighboring legs.
- Inject fake repository/Validator/routes, `now` cố định: cả ba trạng thái, missing data, deadline 10s, mốc ngày Asia/Ho_Chi_Minh.
- Service/HTTP: Guest/Admin trước body, owner A/B và missing đều 404, foreign visit/day, tampered PASS/clock/userId.
- Apply: validate ngoài transaction; CAS race, rollback, changed key payload, double-click, lost-response replay sau revision tăng và không gọi provider lại. Không kết nối Neon hoặc OpenAI/Google thật.
- Khi đủ dependency: manual keyboard/responsive/loading/conflict/UNKNOWN; typecheck và checks phù hợp. Đây là kế hoạch, chưa chạy.

## Expected Modules / Files

- `apps/web/src/modules/trip-edit/`: contract/logic/service/http/server và `*.vitest.test.ts`.
- `apps/web/src/app/trips/[id]/edit/`: editor, preview, pure UI logic `.ts`; không sửa `/trips/new`, list/detail Trip của dev khác.
- `apps/web/src/app/api/trips/[id]/edit/{preview,apply}/route.ts`: thin adapters đề xuất.
- Chỉ đọc/tái dùng shared auth/idempotency, US-28/29 và model US-30 sau handoff; thay đổi shared contract cần phối hợp riêng.

## Migration Impact

Không có migration trong task docs. Revision/visit identity và Trip schema thuộc handoff task 252; SQL phải được review trước apply. Không `db:push`, sửa migration cũ hoặc reset DB.

## Environment Impact

Không đổi env/dependency. Dùng client hiện có sau khi kiểm tra phù hợp; thiếu cấu hình provider không được coi là PASS.

## Implementation Sequence

1. Chốt OQ và handoff Trip/Validator/Planner; xác nhận story READY riêng.
2. Contract/pure edit logic → preview → UI → idempotent apply/CAS → tests/evidence. Không dùng mock runtime để che thiếu dependency.

## Acceptance Evidence

2026-10-15: docs DRAFT theo template và backlog của Bình. Chưa implementation, migration, live API/provider hay acceptance task 263–270. P0 xác nhận các dependency thiếu nêu trên; không dùng evidence US-28 như acceptance story này.

## Open Questions

- **OQ-A — Completed visit:** “đã hoàn thành” suy ra theo giờ hay người dùng đánh dấu? Nguồn authoritative, cách cập nhật và phạm vi bảo vệ trong manual edit cần Bình + Thai Anh chốt; US-36/37 không tự suy ra.
- **OQ-B — Hidden historical destination:** Điểm đến trong Trip đã lưu bị ẩn sau này được giữ/hiển thị/kiểm tra ra sao khi edit? Không tự áp rule candidate mới để xóa lịch sử hoặc công khai nội dung ẩn.
- **OQ-C — Location:** GPS ngoài Hà Giang xử lý thế nào; “vị trí thủ công đủ cụ thể” là tọa độ/pin/địa chỉ nào, yêu cầu độ chính xác và độ mới ra sao? Xem US-35.
- **OQ-D — Favorite FK:** Favorite → Trip dùng Restrict hay Cascade khi xóa Trip? Xem US-34; chưa quyết định thay owner.
- **OQ-E — Revision:** Trip có revision để chống ghi đè hai tab không? Thiết kế yêu cầu revision/CAS; Thai Anh cần thống nhất schema/DTO và protocol replay với Bình trước implementation apply.
- **OQ-F — DTO/policy:** Visit mới dùng định danh nào; mapping day/time/order, bounds, cho phép lặp destination/đổi phạm vi ngày ra sao? Không tự nâng cap/khung giờ của Planner thành baseline nghiệp vụ.
- **OQ-G — Validation freshness:** Làm sao phát hiện dữ liệu giờ mở cửa/visibility/routing thay đổi giữa validation ngoài transaction và commit? Cần contract snapshot/version và kiểm tra DB phù hợp; không gọi provider trong transaction và không tuyên bố revision Trip bảo vệ cả dữ liệu Destination.
- **OQ-H — Mandatory checks/replay:** Chốt bốn nhóm US-29 và quan hệ với MOBILITY của US-28; shared helper cần phối hợp thế nào để replay đã commit trước revalidation/CAS? Tên error/operation/API và request limits hiện là đề xuất.

## Handoff Notes

US-33/36/37 dùng mục Shared stateless preview/apply design làm điểm tham chiếu, không tạo draft store riêng. Bình phụ trách namespace edit/in-trip; Thai Anh phụ trách US-29/30/31; Hoài phụ trách Planner US-28. Không sửa file dev khác, commit/push/merge trong task docs này.

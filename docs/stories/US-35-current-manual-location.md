# US-35 — Vị trí hiện tại/thủ công

## Status

DRAFT

## Epic

Hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/Validator) và Tô Xuân Hoài (Planner/map integration).

## Goal / User Story

Là Du khách, tôi muốn cung cấp vị trí hiện tại bằng GPS khi cho phép hoặc chọn thủ công khi GPS không dùng được, để Trợ lý có vị trí cụ thể cho phương án trong chuyến đi.

## Outcome

Contract DRAFT cho task 281–285: location context của tương tác, không phải lịch sử theo dõi vị trí hoặc một thay đổi itinerary.

2026-10-15, phạm vi Task281 do Bình chỉ định: đã thêm helper GPS độc lập và unit tests; **chưa làm UI**. Story vẫn DRAFT, chưa có browser permission/in-trip integration acceptance.

Task282 bổ sung máy trạng thái thuần GPS/thủ công và tests, tái dùng kiểu kết quả Task281. Chưa có coordinator/UI chọn vị trí hoặc bản đồ; unit evidence không phải acceptance toàn flow.

Task283 bổ sung component chọn pin/tọa độ thủ công độc lập (chi tiết/evidence bên dưới). Chưa nối Task281/282, trang in-trip hoặc backend normalization; story vẫn DRAFT và các AC toàn flow chưa tick.

Task284 bổ sung schema Zod strict và hàm chuẩn hóa thuần độc lập; chưa tạo endpoint, không DB/GPS persistence hoặc nối routing/in-trip. Quy tắc ngoài Hà Giang chưa có quyết định owner; không tự đặt bounding box, story vẫn DRAFT.

Task285 thêm test kết hợp GPS/helper → state machine → normalizer bằng fake geolocation, source-audit và checklist browser để Bình chạy. Theo chỉ định Task285, manual “chưa đủ cụ thể” = chưa có cặp tọa độ hợp lệ; chỉ tên tỉnh/chữ bị từ chối. Không thay production hoặc tự nối UI; manual acceptance vẫn NOT PROVEN.

## Source References

- [Product contract](../product/product-spec.md#edit-save-and-in-trip-support): Edit, save, and in-trip support; Roles and access; Non-functional and research requirements.
- [User flows](../flow/user-flow.md#in-trip-assistant): In-trip assistant; Auth transition.
- [US-32 Open Questions](US-32-manual-itinerary-edit.md#open-questions), [ADR-08/09/10](../decisions.md), task list Bình ngày 2026-10-15.
- Yêu cầu Task281 ngày 2026-10-15: chỉ `modules/in-trip/browser-location.ts` và test, injected geolocation, năm kết quả, timeout khoảng 10s, high accuracy false, không storage/tracking/UI và không sửa map renderer.
- Yêu cầu Task282 ngày 2026-10-15: `modules/in-trip/location-flow.ts` và test, mọi lỗi có đường sang manual, luôn chọn manual được kể cả GPS OK, retry từ denied/timeout, thông điệp tiếng Việt do code sở hữu; chưa làm UI bản đồ.
- Yêu cầu Task285 ngày 2026-10-15: test kết hợp bằng fake geolocation; manual chưa đủ cụ thể khi chưa có cặp tọa độ hợp lệ (tên tỉnh/chữ bị từ chối), source privacy audit và checklist quyền thật/từ chối/360px cho Bình, không tự tick PASS thủ công.
- Figma/DOCX/requirement IDs cụ thể chưa đối chiếu; không suy ra ngưỡng GPS hoặc geofence từ tên sản phẩm.

## Dependencies

- **Map có thể tái dùng:** `modules/map/map-model.ts` có `MapCoordinate` và parse/validate/normalize; `maplibre-renderer.ts` có `mountDestinationPinPicker`; `map-config.ts`/`map-session.ts` có loader/lifecycle. React wrapper hiện ở Admin, không mặc định import UI Admin làm in-trip UI.
- **Trip của Thai Anh:** US-30/31 cho màn in-trip có owned Trip, chưa có ở P0. Location pure logic có thể thiết kế độc lập, integration không tự dựng Trip/mock.
- **Validator của Thai Anh:** US-29 cần nhận origin/location cho routing ở US-36/37; location normalized không có nghĩa itinerary PASS.
- **Planner của Hoài:** US-28 hiện chưa mô hình hóa origin/lodging đầy đủ; cần handoff location origin cho replan, không tự coi first destination là current location.

Helper Task281 không đọc Trip, gọi Validator hoặc Planner; có thể triển khai độc lập theo scope trên. Các dependency còn thiếu vẫn chặn tích hợp owned in-trip flow, không được coi là đã hoàn tất vì helper có tests.

## In Scope

- GPS theo nhu cầu và permission; chuyển nhập/chọn vị trí thủ công khi bị từ chối, lỗi hoặc unavailable.
- UI chọn pin/vị trí và server normalization; location context tạm cho US-36/37.

## Out of Scope

- Theo dõi GPS liên tục/background, lưu lịch sử vị trí dài hạn, tự áp itinerary, Places/geocoding provider mới chưa duyệt.
- Tự đặt geofence Hà Giang, ngưỡng accuracy/tuổi vị trí hoặc mặc định coi tâm bản đồ là vị trí user.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 281 | [FE/GEO] GPS |
| 282 | [FE] chuyển thủ công |
| 283 | [MAP] UI chọn vị trí |
| 284 | [BE/API] chuẩn hóa vị trí |
| 285 | [TEST] |

## Business Rules

- Chỉ yêu cầu GPS khi tính năng cần và user cho phép; không gọi watch liên tục hoặc giữ lịch sử dài hạn.
- GPS bị từ chối/unavailable/lỗi phải có manual fallback; không giả tọa độ hiện tại hoặc coi map viewport mặc định là vị trí đã chọn.
- Kiểm tra cấu trúc và tọa độ hữu hạn trong miền latitude/longitude hợp lệ; normalization không biến missing input thành vị trí đoán được. Task285 chốt “chưa đủ cụ thể” là chưa có cặp tọa độ hợp lệ; tỉnh/chữ không thay thế tọa độ. Freshness/accuracy và ngoài Hà Giang vẫn chưa có policy được duyệt; chưa có endpoint server.
- Location là dữ liệu user cung cấp, không phải chứng nhận hiện diện hoặc quyền sở hữu Trip. Không để AI phát minh tọa độ/thời gian đường đi.
- Location chỉ trong tương tác; không đưa vào URL/log/browser storage hoặc persist làm GPS history. Business time Asia/Ho_Chi_Minh; core cần thời gian nhận `now`, không tin timestamp client làm clock authoritative.

## Roles / Authorization

Flow in-trip chỉ dành cho Traveler. Endpoint normalization đề xuất dùng `requireTraveler` trước body; Guest 401/Admin 403. Nếu có tripId, service kiểm ownership trước dùng/đọc Trip. Mọi response private `no-store`, handler mỏng. Browser permission không thay thế auth.

## Ownership Rules

Không tạo bản ghi location sở hữu riêng. Context gắn với Trip phải đọc bằng `id AND userId` từ session; foreign/missing cùng 404. Không chấp nhận userId/owner từ client. Khi tích hợp replan, ownership kiểm lại ở mỗi request.

## UX / UI Contract

Có chưa chọn vị trí, xin GPS/pending, GPS có kết quả, permission denied, unavailable/error và manual picking/invalid state; cho sửa/chọn lại rõ ràng. Pin chưa chọn phải phân biệt với tọa độ user xác nhận. Location thay đổi làm preview liên quan hết hiệu lực. Keyboard pin/input, accessible feedback và 360px+; Figma cụ thể chờ đối chiếu. Không tự đóng manual fallback khi GPS lỗi.

## Data Contract

Wrapper **đề xuất** cho integration: `{ location: InTripLocation }`, không thêm model Location. Task284 bên dưới chốt shape location/timestamp trong phạm vi helper theo chỉ định của Bình; wrapper/API chưa implement. Metadata không tự coi đáng tin chỉ vì do browser gửi. Output chuẩn hóa không có PASS/save status; manual cần cặp tọa độ hợp lệ theo Task285, freshness và chính sách vùng vẫn mở, không tự đặt threshold.

### Task284 implemented normalization contract

```ts
inTripLocationSchema; // Zod strict schema; validates then rounds coordinates
type InTripLocation = {
  source: "GPS" | "MANUAL";
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt: string; // valid ISO datetime with Z or explicit timezone offset
};
normalizeInTripLocation(input: unknown): InTripLocation;
```

`modules/in-trip/in-trip-location.ts` tái dùng `isValidMapCoordinate` và kiểu `{ latitude, longitude }` tương thích `MapCoordinate`. Không coerce chuỗi, bỏ field thừa hoặc tự clamp tọa độ. Kiểm tra finite/range **trước** khi làm tròn hai trục bằng `toFixed(5)` → number (không phải string cố định năm số); canonicalize -0 thành 0. Accuracy nếu có phải là số hữu hạn không âm hoặc null; optional cho cả GPS/MANUAL, không tự đặt ngưỡng đủ chính xác.

`capturedAt` bắt buộc cho cả hai source, ISO datetime có Z/offset; giữ nguyên chuỗi hợp lệ, không đổi timezone, suy ra freshness, chặn timestamp quá khứ/tương lai hoặc tạo timestamp mặc định. Task281 trả milliseconds từ browser; caller tương lai phải chuyển timestamp tường minh sang ISO trước khi gọi helper. Picker Task283 chỉ trả MapCoordinate; cách lấy timestamp cho lựa chọn MANUAL thuộc integration tương lai, không tự đọc clock trong helper này.

Input sai → `AppError` code **`INVALID_IN_TRIP_LOCATION`**, status400, thông điệp Việt cố định; details chỉ gồm Zod issue code/path, không raw input/tọa độ. `inTripLocationSchema.safeParse` cũng có structured Zod issues; caller cần mã domain dùng `normalizeInTripLocation`. Helper deterministic, không clock/endpoint/DB/storage/log/provider call; không xác nhận presence/ownership/itinerary PASS.

Chỗ nối chính sách vùng là comment tại output của `normalizeInTripLocation`: routing/in-trip caller tương lai kiểm policy do owner duyệt trên kết quả này. Chưa có bounding box, callback policy giả hoặc phán quyết trong/ngoài Hà Giang; tọa độ hợp lệ toàn cầu chỉ qua kiểm tra shape/range.

### Task281 implemented helper contract

```ts
type BrowserGeolocation = Pick<Geolocation, "getCurrentPosition">;
requestBrowserLocation(
  geolocation: BrowserGeolocation | null | undefined,
): Promise<BrowserLocationResult>;

type BrowserLocationResult =
  | { status: "OK"; latitude: number; longitude: number; accuracyMeters: number; capturedAt: number }
  | { status: "DENIED" | "UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED" };
```

`capturedAt` lấy nguyên `position.timestamp` của browser, là milliseconds since Unix epoch; không tự đọc clock hoặc tạo `new Date()`. Helper không quyết định timestamp đó có đủ mới/chính xác để replan hay không; server normalization contract và OQ-C vẫn chưa chốt.

Không truy cập global browser lúc import, không tự lấy `navigator` và không có mount effect. Caller UI tương lai phải gọi helper từ **thao tác bấm nút rõ ràng**, truyền browser geolocation vào; helper thuần không tự chứng minh user gesture. Có đúng một `getCurrentPosition` mỗi lần gọi, không tracking/retry tự động. Options là `timeout: 10_000`, `enableHighAccuracy: false`, `maximumAge: 0`; giữ high accuracy false để hạn chế độ trễ/tiêu thụ pin khi chưa có yêu cầu độ chính xác cao được duyệt.

Callback error code 1 → DENIED, 2 → UNAVAILABLE, 3 → TIMEOUT; unknown code hoặc synchronous exception → UNAVAILABLE, không trả raw message. Null/undefined API → UNSUPPORTED. Watchdog 10s kết thúc Promise nếu browser không callback; clear timer sau khi kết thúc, bỏ callback đến muộn. Watchdog không hủy native permission prompt/request vốn không cung cấp cancellation handle ở API này. Không lưu/log/navigate bằng tọa độ; chỉ trả dữ liệu cho caller. Không gọi API server hoặc provider khác.

### Task282 implemented state-machine contract

`location-flow.ts` chỉ import **type** `BrowserLocationResult`; không tự gọi GPS, timer, clock, storage, log, API hoặc map. Public functions: `createLocationFlowState()`, `transitionLocationFlow(state, event)`, `getLocationFlowMessage(state)`.

- State có `status` là `idle | requesting | gps_ok | denied | unavailable | timeout | unsupported | manual` và `requestId` trong bộ nhớ. Chỉ `gps_ok` giữ bản sao `{ latitude, longitude, accuracyMeters, capturedAt }` trong `location`.
- Event: `REQUEST_GPS`, `SELECT_MANUAL`, `GPS_RESULT { requestId, result: BrowserLocationResult }`. Không nhận câu thông báo từ browser/user; thông điệp tiếng Việt cố định trong module, trung tính và không đổ lỗi người dùng.

| Từ trạng thái | Event / điều kiện | Đến trạng thái |
| --- | --- | --- |
| idle, gps_ok, denied, unavailable, timeout, unsupported, manual | REQUEST_GPS do thao tác rõ ràng của user | requesting, requestId + 1, bỏ lựa chọn GPS cũ |
| requesting | REQUEST_GPS trùng khi đang chờ | Giữ nguyên state/id, không nhận như một lần request mới |
| requesting | GPS_RESULT cùng requestId, result OK | gps_ok, copy location của kết quả |
| requesting | GPS_RESULT cùng requestId, result DENIED / UNAVAILABLE / TIMEOUT / UNSUPPORTED | denied / unavailable / timeout / unsupported tương ứng |
| **Mọi trạng thái**, kể cả requesting và gps_ok | SELECT_MANUAL | manual, giữ counter nhưng bỏ GPS location; mọi lỗi đều có đường này |
| Không requesting hoặc requestId khác request hiện tại | GPS_RESULT đến muộn/không còn phù hợp | Giữ nguyên state, không đổi lựa chọn hiện tại |

Lỗi giữ trạng thái/thông điệp riêng trước khi `SELECT_MANUAL` để caller có thể hiển thị fallback và cho retry; không biến lỗi thành GPS OK. Retry denied/timeout dùng `REQUEST_GPS` rõ ràng; manual cũng có thể quay lại GPS. `manual` chỉ là chế độ **chọn vị trí**, chưa có tọa độ thủ công được xác nhận và không ngụ ý “đủ cụ thể” hoặc đã lưu. Không có trạng thái nào bị kẹt: mọi state đến manual được; từ manual có thể bắt đầu GPS mới.

`requestId` là counter trong một phiên máy trạng thái, không là Trip revision/ownership proof hoặc dữ liệu DB. Khi caller khởi tạo request mới phải giữ id tương ứng để gắn `GPS_RESULT`; kết quả request cũ không được nhận ở lần retry mới. Machine không hủy native GPS; chỉ bỏ kết quả không còn phù hợp. UI lifecycle và reset/new instance cần bỏ callback của instance cũ khi unmount, chưa có trong scope này.

## API Contract

### Task283 implemented component contract

`apps/web/src/components/in-trip/manual-location-picker.tsx` là Client Component mới, default export `ManualLocationPicker({ coordinates: MapCoordinate | null, onChange: (coordinates: MapCoordinate) => void })`. Caller sở hữu lựa chọn hiện tại; callback chỉ phát khi user chọn pin, kéo/di chuyển pin bằng phím, hoặc xác nhận cặp tọa độ hợp lệ bằng nút/Enter. Prop thay đổi đồng bộ pin/input mà không phát callback. Không coi tâm viewport Hà Giang mặc định là vị trí đã chọn.

Component dùng `mountDestinationPinPicker`, `loadMapLibre`, `mapStyle` hiện có; helper `modules/in-trip/manual-location-picker.ts` bọc `startMapSession` để phân biệt `loading | ready | error | timeout`, giữ deadline map 15 giây của shared session (khác timeout GPS 10 giây). Retry/theme change/unmount dọn session cũ; callback của phiên đã dọn bị bỏ qua. Không sửa Admin picker/shared map code.

Hai ô lat/lng dùng `parseCoordinateInputs` qua helper thuần; finite/range theo parser hiện có, không geofence/clamp/round hoặc tự quyết định “đủ cụ thể”. Nút và Enter là đường bàn phím luôn dùng được khi map loading/error/timeout. Label, field help, `aria-invalid`/error description, focus ô sai đầu tiên và live status hỗ trợ việc sửa lỗi. Không tạo form lồng, không lưu/log/navigate bằng tọa độ; chỉ callback và state/ref trong bộ nhớ. Không xin GPS, gọi API hoặc tự xác nhận itinerary. CSS module mới dùng semantic token và shared Input/Button, layout một cột ở màn hẹp, control tối thiểu 44px.

- Đề xuất `POST /api/trips/[id]/in-trip/location/normalize` nhận location, trả `{ success: true, data: normalizedLocation }` theo shared envelope; không ghi DB và không sinh proposal ID được lưu server.
- Auth trước body; owned Trip service query; 400 input sai, 401/403 auth, 404 foreign/missing. Error/status riêng cho location thiếu cụ thể/ngoài Hà Giang chưa chốt; không giả thành provider failure hoặc PASS.
- Endpoint có tripId hay normalization được nhúng vào preview US-36 là OQ; đây chỉ là đề xuất ranh giới, không yêu cầu tạo API thừa.

## Error / Recovery

GPS denied/unavailable/error → manual fallback và giữ nội dung tương tác còn hợp lệ. Server invalid input → chỉ rõ phần cần sửa, không tự clamp rồi báo đủ dữ liệu khi việc sửa làm thay đổi ý định. Cancel bỏ lựa chọn chưa xác nhận, không sửa Trip. Không có thông báo “đã lưu vị trí” cho normalization không ghi.

## Write Semantics / Idempotency

N/A cho business write: chọn/normalize location không ghi Trip, location history, candidate hay idempotency record. Chỉ là read-only computation; không dùng SUCCESS/FAILED/UNKNOWN để ngụ ý đã lưu. Việc apply itinerary dùng contract US-32/37 riêng, có idempotency và xác nhận.

## External Services

Browser Geolocation và MapLibre/Stadia hiện có; không thêm geocoder/Places/Routes/OpenAI call để chỉ normalize tọa độ. Manual input hỗ trợ loại nào chờ quyết định. Không thêm dependency/env ở task docs.

## Acceptance Criteria

- [ ] Task 281 chỉ xin GPS theo nhu cầu; không background tracking hoặc persist lịch sử vị trí.
- [ ] Task 282/283 có manual fallback khi denied/unavailable/error, chọn lại được; map viewport không bị coi là vị trí hiện tại.
- [ ] Task 284 server normalization kiểm finite/range/shape; không invent vị trí, không dùng location làm ownership proof.
- [ ] Trip context được bảo vệ Traveler/ownership, auth trước body, private response; không external call/persistence không cần thiết.
- [ ] Task 285 có tests và UI evidence cho GPS/manual states; manual-specificity đã chốt ở Task285, outside-Hà-Giang policy và browser acceptance vẫn chờ trước READY.

## Test Plan

- `.ts` state machine/normalization với `*.vitest.test.ts`: GPS success/denied/unavailable/error, manual transition, no-selection, invalid/null/NaN/out-of-range, stale response sau chọn lại.
- Fake Geolocation/map/session và repository; không xin GPS thật trong unit test, không map/routing provider thật hoặc Neon.
- Auth/body order, owned/foreign/missing, no-write/no-log; time-dependent cases dùng fixed `now`.
- Thêm accuracy/freshness/outside-region cases sau OQ-C. Manual permission, keyboard/pin/responsive trên browser khi implementation có; chưa có runtime evidence trong docs task.
- Task281 thực thi: `browser-location.vitest.test.ts` dùng fake geolocation và fake timers cho đủ năm kết quả, import không side effect, explicit handler invocation, options 10s/false/0, watchdog, late callbacks, unknown/synchronous errors và storage/cookie/navigation/log spies. Không xin GPS thật hoặc dùng storage thật.
- Task282 thực thi: `location-flow.vitest.test.ts` kiểm đủ 8 states × (REQUEST_GPS, SELECT_MANUAL, 5 GPS results), retry denied/timeout, manual kể cả GPS OK/pending, chống callback cũ sau đổi mode/retry, copy GPS snapshot, thông điệp tiếng Việt và tính deterministic/không mutate frozen inputs.
- Task285: `us35-task285-integration.vitest.test.ts` ghép các module thật bằng fake geolocation/test-only caller; `us35-location-source-audit.vitest.test.ts` đọc production TS/TSX trong namespace in-trip, loại test fixtures. Checklist [US35 Task285 manual](../implementation/us35-task285-manual-checklist.md) do Bình chạy; không suy ra browser PASS từ fake tests.

## Expected Modules / Files

- Đã có Task281: `apps/web/src/modules/in-trip/browser-location.ts` và `browser-location.vitest.test.ts`.
- Đã có Task282 core: `apps/web/src/modules/in-trip/location-flow.ts` và `location-flow.vitest.test.ts`.
- Đã có Task284 pure normalization: `apps/web/src/modules/in-trip/in-trip-location.ts` và `in-trip-location.vitest.test.ts`.
- Các task sau: `apps/web/src/modules/in-trip/location-*.ts` và `*.vitest.test.ts` theo contract được duyệt.
- `apps/web/src/components/in-trip/` và `app/trips/[id]/in-trip/`: GPS/manual picker UI, pure logic `.ts`.
- `app/api/trips/[id]/in-trip/location/normalize/route.ts` nếu endpoint riêng được chốt.
- Reuse `modules/map/*`; không tự refactor renderer/shared Admin picker hoặc sửa trang Trip của dev khác.

## Migration Impact

Không model/migration location hoặc GPS history; task docs không đổi DB. Trip integration chờ US-30.

## Environment Impact

Không thêm env/dependency/provider. Browser permission/runtime availability cần verify khi implementation, không coi tài liệu là live evidence.

## Implementation Sequence

1. Bình chốt OQ-C và contract location với Thai Anh/Hoài.
2. Pure location state/normalization → reusable picker/GPS UI → owned integration → tests/manual evidence.

## Acceptance Evidence

2026-10-15: chỉ docs DRAFT task 281–285. Map helpers/pin renderer đã có trong repo; chưa có in-trip GPS/normalization flow, live permission test hoặc Trip integration acceptance.

### Task281 — helper/unit evidence (2026-10-15)

| Phần | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| Helper một lần, injected API và năm kết quả | PASS tự động | `browser-location.vitest.test.ts`: **12/12 tests**, zero failed/skipped, gồm import inert và invocation qua handler giả lập; không chứng minh một nút UI thật đã được gắn |
| Timeout / pin / dữ liệu riêng | PASS tự động | Options 10s, high accuracy false, maximumAge0; watchdog/late callback cleanup; không gọi tracking, storage/cookie/navigation/log spies |
| Map regression | PASS tự động | Existing `map.test.tsx` + `map-location-picker.test.ts` qua Node/tsx test runner: **26/26**; source guard cấm chuỗi `geolocation` vẫn xanh; renderer không đổi |
| Root check-types | FAILED ngoài Task281 | `npm run check-types` qua installed Node22: chỉ TS2307 thiếu `cloudinary` ở `cloudinary-provider.ts:2` và TS7006 `error` implicit-any ở `:75`; không có diagnostic helper/test mới |
| Browser permission/GPS thật/click-only UI/360px/focus | NOT PROVEN | Không làm UI, không xin permission hoặc chạy GPS thật; AC Task281 toàn flow vẫn chưa tick |
| Task282–285, normalization, Trip/Validator/Planner integration tại mốc Task281 | NOT IMPLEMENTED / NOT PROVEN tại mốc đó | Không thuộc scope helper; cập nhật Task282 core ở mục evidence sau, các AC/story vẫn DRAFT |

Lệnh tại `apps/web` với `$taskNode` là binary Node22.20.0 đã cài sẵn:

```powershell
& $taskNode ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/in-trip/browser-location.vitest.test.ts
& $taskNode ../../node_modules/tsx/dist/cli.mjs --test src/modules/map/map.test.tsx src/modules/map/map-location-picker.test.ts
```

Cả hai exit0. Chỉ suite mới dùng Vitest và tên `*.vitest.test.ts`; hai map tests hiện có chạy riêng qua legacy runner, không thêm `.tsx` test mới. Root typecheck exit1 do hai lỗi Cloudinary có sẵn nêu trên. `git diff --check` PASS với các LF→CRLF notices có sẵn. Không full build/full repo test, schema/DB/migration/env/dependency/client mới hoặc OpenAI/Google call. Không sửa `modules/map/maplibre-renderer.ts` hay các file ngoài phạm vi. Chưa coi helper là server validation hoặc một vị trí đã lưu.

### Task282 — pure state-machine evidence (2026-10-15)

| Phần | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| Tất cả chuyển trạng thái / không kẹt | PASS tự động | `location-flow.vitest.test.ts`: **64/64 tests**; bao phủ bảng chuyển ở trên, mọi state sang manual và có đường đi tiếp từ manual |
| Retry / stale results / GPS snapshot / messages | PASS tự động | Denied/timeout retry; GPS OK vẫn chọn manual được; request trùng không tăng id; callback cũ bị bỏ qua, copy result chống thay đổi ngoài; messages Việt cố định và không chứa tọa độ |
| Deterministic, input immutability | PASS tự động | Cùng state/event cho cùng kết quả, frozen state/event không bị thay đổi; không clock/side effect |
| Task281 + Task282 regression | PASS tự động | Vitest `src/modules/in-trip`: **2 files, 76/76 tests**, zero failed/skipped; helper Task281 và map renderer giữ nguyên |
| Root check-types | FAILED ngoài Task282 | Chỉ hai lỗi có sẵn ở `cloudinary-provider.ts:2` TS2307 và `:75` TS7006; không diagnostic ở file mới |
| UI fallback/map/manual coordinate selection / GPS thật | NOT PROVEN / chưa làm | Chưa có UI/coordinator, không bấm nút hay xin GPS thật. AC Task282/283 toàn flow vẫn chưa tick |

Lệnh tại `apps/web` dùng Node22.20.0 đã cài sẵn:

```powershell
& $taskNode ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/in-trip
```

Exit0, 76 tests PASS. Root `npm run check-types` exit1 vì lỗi Cloudinary ngoài scope; không sửa dependency/shim. `git diff --check` PASS. Không chạy lại map/full repo/build vì không đổi helper/renderer/shared code; không DB/migration/env/provider call. Story vẫn DRAFT, không coi kết quả unit test là vị trí hợp lệ phía server hoặc acceptance browser.

### Task283 — component/unit/browser evidence (2026-10-15)

| Phần | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| Pure coordinate validation + map lifecycle | PASS tự động | `manual-location-picker.vitest.test.ts`: **24/24**; null/blank/finite/range/boundaries/precision/field errors, ready/error/15s timeout, late load/callback, cleanup/retry |
| In-trip unit regression | PASS tự động | Vitest `src/modules/in-trip`: **3 files, 100/100**, zero failed/skipped (GPS12, flow64, picker24) |
| Shared map regression | PASS tự động | Existing `map.test.tsx` + `map-location-picker.test.ts` qua Node/tsx: **26/26**; không thêm test TSX, không sửa renderer/Admin |
| Browser fixture | PASS tự động, provider giả lập | Headless Chrome chạy production component/shared Input/Button/session/renderer: không tự chọn vị trí, lỗi input + focus, Enter khi đang tải, fallback error/timeout, retry giữ lựa chọn, pin click/arrow/drag, prop sync không callback, theme/unmount cleanup |
| Responsive / privacy trong fixture | PASS quan sát tự động | 360px/1280px, light/dark không tràn ngang, input/button >=44px; không storage/cookie/URL change, external request hoặc page exception được ghi nhận. Đã xem ảnh 360px error và dark |
| Root check-types | FAILED ngoài Task283 | `npm run check-types` exit1: TS2307 thiếu `cloudinary` ở `cloudinary-provider.ts:2`, TS7006 implicit-any `error` ở `:75`; không diagnostic file mới |
| Bản đồ thật / full app / accessibility acceptance | NOT PROVEN | Fixture thay loader/library và theme hook, dùng semantic tokens thật + inherited Arial; không chứng minh WebGL/basemap/worker/CSS toàn app, screen reader thực tế, GPS permission, Traveler flow hoặc backend normalization |

Lệnh kiểm tra từ `apps/web` với Node22.20.0 đã cài sẵn:

```powershell
& $taskNode ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/in-trip
& $taskNode ../../node_modules/tsx/dist/cli.mjs --test src/modules/map/map.test.tsx src/modules/map/map-location-picker.test.ts
```

Cả hai exit0. Browser harness nằm ngoài repo tại `C:/Users/duybi/.codex/visualizations/2026/10/15/01a13d7b-3bbe-75d1-97ce-7791e12d3f18/task283-browser.mjs`; chạy Node với Chrome đã cài, localhost fixture, exit0; JSON kết quả và ảnh cùng thư mục. Lần chạy sandbox bị chặn localhost, chạy lại có quyền ngoài sandbox đã PASS; không tải dependency/browser mới. Không thêm fixture vào runtime/app route. Static design audit script từ skill cache trước đó không còn tồn tại tại lúc tiếp tục; chưa chạy audit đó. Không full build/full repo suite, không DB/provider thật, không sửa shim/dependency. `git diff --check` PASS; AC toàn flow vẫn chưa tick.

### Task284 — normalization/unit evidence (2026-10-15)

| Phần | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| Schema strict / coded errors / rounding | PASS tự động | `in-trip-location.vitest.test.ts`: **51/51**; GPS/MANUAL, accuracy omitted/null/zero/fractional, required fields, NaN/Infinity/strings/extra keys, ISO/timezone/calendar, bounds trước rounding, global coordinates, 5 decimals, negative zero |
| Compatibility / determinism / privacy | PASS tự động + đọc code | Type assertion tương thích MapCoordinate, `isValidMapCoordinate` trên output, frozen input/idempotent normalization, timestamp giữ nguyên; error details không raw values. Clock/network/log spies không bị gọi; không DB/browser/storage import hoặc endpoint trong code mới |
| In-trip regression | PASS tự động | Vitest `src/modules/in-trip`: **4 files, 151/151**, zero failed/skipped (GPS12, flow64, picker24, normalization51) |
| Root check-types | FAILED ngoài Task284 | Chỉ TS2307 thiếu `cloudinary` tại `cloudinary-provider.ts:2`, TS7006 implicit-any `error` tại `:75`; không diagnostic file Task284 |
| Routing / owned in-trip / region policy / UI-to-schema | NOT PROVEN | Chưa nối helper vào caller, không gọi provider/DB, không tạo endpoint hoặc chứng nhận eligibility/freshness. Chính sách ngoài Hà Giang chờ owner |

Lệnh tại `apps/web` dùng Node22.20.0 đã cài: `vitest/vitest.mjs run --config vitest.config.mts src/modules/in-trip`, exit0. Root `npm run check-types` exit1 với lỗi ngoài scope nêu trên; `git diff --check` và no-index whitespace check cho file mới PASS. Không full build/browser/map rerun vì chỉ thêm helper/test độc lập, không đổi UI/map/shared code. Không migration/env/dependency/shim changes. Story vẫn DRAFT; không tick AC server/owned integration từ unit evidence.

### Task285 — composed tests/source audit/checklist evidence (2026-10-15)

| Phần | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| GPS success → flow → normalizer | PASS tự động | `us35-task285-integration.vitest.test.ts`: **16/16** tổng; fake getCurrentPosition, explicit test action, snapshot/requestId, tường minh đổi timestamp milliseconds sang ISO, round5, options10s/false/0 |
| GPS denied/unavailable/timeout/unsupported → manual | PASS tự động | Fake browser error/10s watchdog; manual không tự có tọa độ, retry denied có requestId mới, late success không ghi đè manual; cặp hợp lệ qua normalizer |
| Manual chưa đủ cụ thể | PASS tự động | Tỉnh/chữ, thiếu một/hai trục, NaN/out-of-range bị `INVALID_IN_TRIP_LOCATION`; input keyboard chữ/thiếu cặp không hợp lệ. Cặp0/0 kiểm shape/range được nhận, không suy ra policy vùng |
| Privacy source-audit | PASS tự động | `us35-location-source-audit.vitest.test.ts`: **12/12**; recursive production TS/TSX từ modules/in-trip, components/in-trip và app/trips/[id]/in-trip nếu có; hiện5 files. Guard storage/cookie/URL-navigation/log/watchPosition, negative examples và phân biệt data `location.latitude` với browser URL |
| In-trip regression | PASS tự động | Vitest `src/modules/in-trip`: **6 files, 179/179**, zero failed/skipped; Task285 thêm28 tests, không sửa test/production có sẵn |
| Root check-types | FAILED ngoài Task285 | TS2307 thiếu `cloudinary` tại `cloudinary-provider.ts:2`, TS7006 implicit-any `error` tại `:75`; không diagnostic file mới |
| GPS permission thật/deny thật/360px/full-flow UI | NOT PROVEN | [Checklist để Bình chạy](../implementation/us35-task285-manual-checklist.md): chưa tick mục nào. Chưa có UI/coordinator nối GPS với picker; không thêm route/mock để thay integration |

Lệnh từ `apps/web`, installed Node22.20.0: `vitest/vitest.mjs run --config vitest.config.mts src/modules/in-trip` exit0. Root `npm run check-types` exit1 vì hai lỗi ngoài scope trên. `git diff --check` và whitespace check file mới PASS. Lần đầu source-audit báo false positive với biến dữ liệu `location.latitude`; đã sửa **test guard**, chạy lại toàn bộ179 tests PASS. Không sửa production, DB/migration/env/dependency hoặc shim; không full build/browser/provider/Neon call.

Source audit là guard đọc text trực tiếp, không taint analysis hay chứng minh mọi dependency không rò rỉ runtime; không scan transitively `modules/map`/shared imports, test fixtures hoặc CSS. Test-only caller tự ghép module, không phải production coordinator/UI đã implement. Source-audit phủ các namespace hiện có và tự thêm TS/TSX mới trong các root đó, nhưng chưa chứng minh browser user gesture/permission/privacy/lifecycle thật. Story vẫn DRAFT, full-flow ACs chưa tick.

## Open Questions

- **OQ-C** ở [US-32](US-32-manual-itinerary-edit.md#open-questions): GPS ngoài Hà Giang cho phép, chặn hay yêu cầu chọn lại? Ai cung cấp ranh giới địa lý nếu cần? Phần manual-specificity trong US-35 đã được Bình chốt ở Task285: chưa có cặp tọa độ hợp lệ thì chưa đủ cụ thể; tên tỉnh/chữ không đủ. Không suy ra yêu cầu geocoding/địa chỉ mới.
- Task284 chỉ kiểm miền tọa độ toàn cầu. Owner cần chốt policy “ngoài Hà Giang” và dữ liệu ranh giới nếu áp dụng; sau đó mới nối kiểm policy ở caller routing/in-trip, không tự đặt bounding box trong normalizer.
- Task284 chốt `capturedAt` ISO bắt buộc và accuracy optional/nullable; Task281 vẫn trả acquisition timestamp native. Freshness/accuracy đủ dùng và cách caller cung cấp timestamp cho MANUAL còn cần chốt khi integration. Không tự chọn số mét/phút mặc định.
- Endpoint normalization riêng có cần thiết hay reuse trong replan preview? Chốt với Trip/API owner để tránh trùng lặp.
- Có cần geocoding cho địa chỉ văn bản không? Nếu có phải hỏi provider/client/env trước; manual pin hiện có không ngụ ý đã hỗ trợ địa chỉ văn bản.

## Handoff Notes

US-35 cung cấp location context, không tự quyết định itinerary hợp lệ. US-36 dùng để replan; US-37 kiểm lại trước apply. Không lưu location history và không tự thay origin trong Planner của Hoài.

Task281 UI handoff: dùng `requestBrowserLocation` từ click handler, truyền `navigator.geolocation` chỉ ở browser khi user yêu cầu; không gọi khi mount/import/render. Phân biệt cả năm kết quả để task282 xử lý fallback sau này. Không đặt GPS vào map renderer; helper không tự gọi fallback/UI hoặc ghi tọa độ.

Task282 UI handoff: cập nhật state bằng `REQUEST_GPS` sau click; chỉ gọi helper một lần khi requestId thực sự tăng. Gắn id đó vào `GPS_RESULT`; render thông điệp qua `getLocationFlowMessage`. Luôn có action `SELECT_MANUAL`, gồm cả khi đang chờ/GPS OK và mọi lỗi; chọn manual không đồng nghĩa đã chọn tọa độ. Chưa implement UI map/pin, API normalization hoặc lưu lịch sử GPS.

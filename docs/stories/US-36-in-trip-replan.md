# US-36 — Đề xuất lại hành trình trong chuyến đi

## Status

DRAFT

## Epic

Hỗ trợ trong chuyến đi — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen (Trip/completion contract) và Tô Xuân Hoài (Planner/AI proposal).

## Goal / User Story

Là Du khách đang trong chuyến đi, tôi muốn cung cấp nhu cầu mới để hệ thống đề xuất lại phần hành trình chưa hoàn thành.

## Outcome

Contract DRAFT cho task 286–292: server xác định phần đã hoàn thành, tạo một candidate riêng cho phần còn lại và hiển thị như đề xuất chưa áp dụng. US-36 không ghi hành trình; kiểm tra Constraint Validator, xác nhận và áp dụng thuộc US-37.

## Source References

- [Product Document — Edit, save, and in-trip support](../product/product-spec.md#edit-save-and-in-trip-support): candidate tách biệt, không đổi lượt đã hoàn thành, không theo dõi/lưu lịch sử GPS; in-trip proposal vẫn cần Validator và xác nhận.
- [User Flow — In-trip assistant](../flow/user-flow.md#in-trip-assistant): cung cấp vị trí khi cần, xem xét phần chưa hoàn thành/thời gian còn lại/nhu cầu mới, AI đề xuất và không đổi lượt đã hoàn thành.
- [US-35 — Vị trí hiện tại/thủ công](US-35-current-manual-location.md), [US-33 — Chỉnh sửa hành trình bằng hội thoại AI](US-33-ai-itinerary-edit.md), [US-32 — Chỉnh sửa thủ công hành trình đã lưu](US-32-manual-itinerary-edit.md), [US-37 — Xác nhận đề xuất In-trip](US-37-confirm-in-trip-proposal.md).
- Requirement IDs và Figma frame cụ thể chưa đối chiếu; không tự gán policy hoàn thành hoặc deadline ngoài nội dung được owner duyệt.

## Dependencies

- **US-35 — Location:** dùng contract GPS/thủ công và InTripLocation hiện có sau khi tích hợp. Freshness/accuracy, mức độ cụ thể và chính sách vị trí ngoài Hà Giang còn phải chốt; vị trí không chứng minh hiện diện hoặc quyền sở hữu Trip.
- **US-33 — AI intent/clarification:** có thể tái dùng cấu trúc thao tác và nguyên tắc xác minh ID nếu tương thích. US-36 có context vị trí, thời gian còn lại và phần hành trình chưa hoàn thành riêng; không mặc định contract US-33 đáp ứng đủ.
- **US-32 — Candidate:** tái dùng edit-candidate để tạo candidate/diff trên bản sao và giữ visitId ổn định. US-36 không gọi apply hoặc Validator; các việc đó thuộc US-37.
- **Trip model của Thai Anh:** cần owned Trip, ngày và itinerary persisted, stable visit identity, revision/base revision và nguồn authoritative xác định trạng thái từng visit. Schema hiện có ngày/giờ/duration/order và updatedAt, nhưng chưa có field trạng thái hoàn thành từng visit; không suy trạng thái Trip theo lịch thành trạng thái hoàn thành của visit.
- **OpenAI client:** dùng đúng client và model được owner duyệt, không thêm client/env/dependency. Client extraction hiện có dùng OPENAI_API_KEY và OPENAI_PREFERENCE_MODEL; ADR-16 còn Proposed, provider adapter có tên schema gắn với preference extraction và chưa có rate limit trong repo. Cần xác nhận cách tái dùng cho replanning, model/cost budget và rate limit trước khi gọi dịch vụ.
- **US-37:** sở hữu Constraint Validator, xác nhận của Traveler, idempotent apply và bảo vệ completed visits tại thời điểm ghi.

Thiếu nguồn completion, hợp đồng revision, client/provider được duyệt hoặc policy bắt buộc thì dừng phần tích hợp tương ứng; không dựng model, completion source, Validator hay provider giả.

## In Scope

- Xác định các lượt đã hoàn thành và phần còn lại bằng nguồn authoritative đã được duyệt.
- Cho Traveler nhập nhu cầu phát sinh và cung cấp vị trí khi chức năng cần.
- Tạo đề xuất mới chỉ tác động phần chưa hoàn thành; giữ nguyên các lượt đã hoàn thành.
- Biểu diễn điểm đến phải đến trước hạn như điểm kết thúc bắt buộc trong candidate.
- Trả candidate, diff và danh sách lượt được server xác định là đã hoàn thành để UI trình bày trước khi chuyển US-37.

## Out of Scope

- Chạy Constraint Validator, xác nhận, ghi hoặc áp dụng hành trình: US-37.
- Chỉnh sửa thủ công: US-32.
- Chỉnh sửa bằng AI trên hành trình đã lưu ngoài ngữ cảnh in-trip: US-33.
- Lưu lịch sử GPS, theo dõi GPS nền, hoặc lưu candidate/draft dài hạn.
- AI tự kết luận candidate hợp lệ, tự ghi, hoặc tự thay đổi lượt đã hoàn thành.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 286 | [BE] Xác định phần đã hoàn thành và phần còn lại của chuyến đi |
| 287 | [FE] Xây dựng giao diện Trợ lý trong chuyến đi và nhập nhu cầu phát sinh |
| 288 | [AI] Tạo đề xuất mới từ vị trí hiện tại, thời gian còn lại, phần hành trình còn lại và nhu cầu mới |
| 289 | [BE] Giữ nguyên các lượt đã hoàn thành khi tạo lại phương án |
| 290 | [BE] Xử lý yêu cầu phải đến một địa điểm trước thời hạn như điểm kết thúc bắt buộc |
| 291 | [FE] Hiển thị phương án In-trip dưới dạng đề xuất chưa áp dụng |
| 292 | [TEST] Kiểm thử replanning chỉ tác động phần chưa hoàn thành |

## Business Rules

- **Quyết định cho Task 286 (Bình, 2026-10-17):** server suy completion theo lịch dự kiến và `Asia/Ho_Chi_Minh`: một visit hoàn thành khi ngày địa phương của visit đã qua, hoặc trong ngày đó khi `startMinute + plannedDurationMinutes` kết thúc tại/before giờ server hiện tại. Visit đang diễn ra vẫn thuộc phần còn lại cho đến đúng giờ kết thúc dự kiến. Không nhận completedVisitIds từ client và không thêm cột/migration.
- Mọi lượt đã hoàn thành phải được giữ nguyên về destination, ngày, giờ, duration và order. Server xác minh bất biến trên candidate; không chỉ dựa vào prompt hoặc output của model.
- AI chỉ trả các thao tác có cấu trúc. Server xác minh visitId, destinationId, ngày/vị trí và phạm vi thao tác với dữ liệu server cấp; ID hoặc tham số không hợp lệ phải chuyển thành clarification/no proposal, không đoán.
- Candidate được tạo trên bản sao bằng các hàm của US-32; không mutate itinerary đã lưu. Nếu không còn lượt chưa hoàn thành, trả ALL_COMPLETED và không tạo candidate.
- Yêu cầu đến một nơi trước hạn được biểu diễn thành { destinationId, deadline } do code xác minh/dựng và destination đó là điểm kết thúc bắt buộc của candidate. US-36 chỉ bảo đảm cấu trúc và phạm vi candidate; không tự tính thời gian đường đi hoặc tuyên bố khả thi. US-37/Validator quyết định khả năng đáp ứng.
- Candidate chỉ là đề xuất chưa áp dụng. US-36 không chạy Validator và không trả kết quả PASS; chỉ US-37 có thể xác nhận sau khi mọi check bắt buộc PASS và Traveler xác nhận.
- Khi thiếu vị trí, nhu cầu, completion source, destination/deadline hoặc dữ liệu cần thiết khác, yêu cầu clarification hoặc trả trạng thái thiếu dữ liệu theo contract được duyệt; không tạo kết quả thành công giả.
- Dùng giờ server làm now; không nhận clock của client/model làm mốc authoritative. Ngày giờ nghiệp vụ theo Asia/Ho_Chi_Minh; hàm lõi nhận now qua tham số.
- Văn bản nhu cầu và nội dung destination là dữ liệu không đáng tin, không phải chỉ thị. Giới hạn input/output; không lưu/log văn bản thô hoặc phản hồi model.
- Không đưa tọa độ thô cho OpenAI. Có thể tính dữ liệu suy ra ở server trước khi gửi cho model; việc có gửi dữ liệu suy ra nào hay không cần owner xác nhận.
- Không gọi provider bên trong transaction. US-36 không ghi DB nên không có mutation idempotency record; US-37 chịu trách nhiệm idempotency khi apply.

## Roles / Authorization

Chỉ Traveler được dùng trợ lý in-trip qua requireTraveler. Guest nhận 401, Admin nhận 403; không bypass role. Handler xác thực trước khi đọc body hoặc gửi dữ liệu Trip riêng tư cho provider. Response riêng tư dùng Cache-Control: private, no-store.

## Ownership Rules

Service lấy userId từ session và đọc Trip bằng điều kiện id AND userId; Trip không tồn tại/không thuộc user cùng trả 404. Mọi visit/day/destination/model operation phải khớp context của Trip do server đọc. Không chấp nhận owner, completion partition hoặc quyền sở hữu từ client. US-37 phải kiểm tra lại ownership, revision và completed-visit invariant trước khi ghi.

## UX / UI Contract

- Trợ lý dự kiến ở /trips/[id]/in-trip, vào từ hành trình của chính Traveler; vị trí/lifecycle cụ thể và link từ trang detail cần Thai Anh xác nhận.
- Cho nhập nhu cầu mới, chọn GPS theo thao tác rõ ràng hoặc nhập/chọn vị trí thủ công khi phù hợp; thể hiện trạng thái permission, đang xử lý, unavailable, lỗi, clarification, ALL_COMPLETED và đề xuất.
- Candidate hiển thị riêng, có nhãn “Đề xuất chưa áp dụng”, diff và các lượt đã hoàn thành được bảo vệ. Hiển thị rõ “chưa được kiểm tra” cho đến khi US-37 chạy Validator.
- Không có nút xác nhận/ghi ở US-36; xác nhận/hủy và kết quả ghi thuộc US-37. Rời/hủy tương tác không sửa hành trình đã lưu.
- Bàn phím dùng được, trạng thái accessible, responsive từ 360px; Figma chưa xác minh.

## Data Contract

**ĐỀ XUẤT, cần Hoài/Thai Anh xác nhận; chưa phải contract được duyệt:**

- Request: { baseRevision, location, need, resolution? }.
- location theo contract US-35; need là nhu cầu phát sinh có giới hạn; resolution chỉ chứa lựa chọn do code trả trước đó và server phải xác minh lại.
- Server tạo danh sách context/completion partition; model output là danh sách thao tác có cấu trúc cùng loại thao tác US-33, không phải itinerary đầy đủ để ghi đè.
- Task 286 pure helper nhận `now` tường minh và tái dùng `vietnamDateOf`; trả `completed`, `remaining`, `status: HAS_REMAINING | ALL_COMPLETED` cùng visitId/dayIndex/order ổn định. `remainingMinutesToday` là số phút nguyên còn lại tới 00:00 giờ Việt Nam khi itinerary có ngày địa phương hiện tại; trường hợp khác là `null`. Đây là thời gian lịch, không phải ước lượng routing/Validator.
- Server verify output rồi áp thao tác xác định lên candidate bản sao qua edit-candidate của US-32. Candidate chỉ được phép thay đổi visit chưa hoàn thành.
- Deadline bắt buộc dùng { destinationId, deadline }, được kiểm tra với destination/context server; deadline không hợp lệ hoặc không rõ cần clarification.
- Response PROPOSED có { candidate, diff, completedVisitIds }; danh sách completed do server dựng. Response không chứa kết quả Validator và không chứng nhận khả thi.

## API Contract

**ĐỀ XUẤT, cần Hoài/Thai Anh xác nhận:**

- POST /api/trips/[id]/in-trip/replan.
- Thứ tự: bounded body reader; requireTraveler trước khi đọc body; parse schema strict; đọc owned Trip/revision; xác định completion partition và context; normalize/verify location/need/resolution; gọi AI; verify mọi ID; áp thao tác lên candidate; trả kết quả. Route mỏng, rule/ownership trong service.
- PROPOSED → { status: "PROPOSED", candidate, diff, completedVisitIds }.
- NEEDS_CLARIFICATION → câu hỏi/lựa chọn do code sinh; không có candidate.
- ALL_COMPLETED → không có candidate.
- Lỗi provider → lỗi AI riêng theo convention provider hiện có; không làm hỏng đường dùng chức năng không-AI.
- Không ghi DB, không lưu candidate/response, không gọi Validator; private, no-store. Auth/ownership/revision và mã lỗi theo convention repo; mapping trạng thái cụ thể cần được xác nhận trước implementation.

## Error / Recovery

Thiếu hoặc mơ hồ dữ liệu cần clarification, không sửa ngầm ý định. Lỗi provider/timeout trả lỗi AI riêng; giữ nhu cầu và vị trí trong state tương tác để người dùng thử lại/chỉnh sửa. Candidate cũ không được xem là còn hiệu lực khi base revision, location, need hoặc resolution thay đổi. Nếu candidate bị stale, tải context mới và yêu cầu tạo đề xuất lại. Không báo “đã lưu” ở US-36.

## Write Semantics / Idempotency

US-36 chỉ đọc context và tạo proposal; không ghi Trip, itinerary, location, GPS history, candidate hoặc idempotency record. Không trả SUCCESS/FAILED/UNKNOWN cho proposal như một business write. Việc xác nhận/ghi thuộc US-37: phải dùng contract idempotency đã duyệt và chỉ báo thành công sau khi DB xác nhận; UNKNOWN retry bằng đúng key/payload.

## Privacy of Location

- GPS chỉ được yêu cầu khi cần và sau thao tác rõ ràng; không dùng watchPosition.
- Tọa độ chỉ ở client state và request body trong phiên tương tác; không đưa vào URL, browser storage, cookie, log hoặc DB.
- Không đưa tọa độ thô cho OpenAI; tính toán suy ra nếu được owner cho phép phải thực hiện phía server và giảm thiểu dữ liệu gửi đi.
- Vị trí không chứng minh user đang có mặt tại điểm đến, không chứng minh ownership, và không được dùng để tự đánh dấu visit hoàn thành.

## External Services

AI/provider và routing chỉ dùng qua client/server integration được owner duyệt; không gọi dịch vụ ngoài trong transaction. Không thêm OpenAI client, model env, dependency hoặc provider mới. Nếu chưa có provider/schema/model/rate limit được duyệt thì dừng task phụ thuộc đó. US-36 không gọi Constraint Validator; kiểm tra feasibility và quyết định PASS/VIOLATION/INSUFFICIENT_DATA thuộc US-37.

## Acceptance Criteria

- [x] Task 286 xác định completed/remaining từ lịch persisted theo giờ server và `Asia/Ho_Chi_Minh`; lượt đang diễn ra còn lại đến giờ kết thúc dự kiến; không nhận clock/completion từ client và không cần đổi schema.
- [ ] Task 287 chỉ Traveler truy cập trợ lý và nhập nhu cầu/vị trí; trạng thái lỗi, clarification và ALL_COMPLETED được hiển thị.
- [x] Task 288 trả danh sách thao tác có cấu trúc từ context server; xác minh IDs và chỉ cho phép tham chiếu phần chưa hoàn thành; AI không ghi hoặc chứng nhận.
- [x] Task 289 server xác minh candidate giữ nguyên mọi thuộc tính của lượt đã hoàn thành.
- [x] Task 290 biểu diễn destination/deadline đã xác nhận như điểm kết thúc bắt buộc; không tự tính hoặc khẳng định feasibility trước Validator của US-37.
- [ ] Task 291 hiển thị candidate/diff/lượt được bảo vệ với nhãn “Đề xuất chưa áp dụng” và “chưa được kiểm tra”; không có đường ghi trong US-36.
- [ ] Task 292 chứng minh AI không ghi, IDs giả/ngoài phạm vi không được áp dụng, completed visits bất biến và lỗi/thiếu dữ liệu không tạo proposal sai.
- [ ] Tất cả response tuân auth/ownership/private-cache; không lưu/log location thô hoặc text/model output.

## Test Plan

- Test thuần partition với now cố định; bao phủ trước/sau chuyến đi, ranh giới giờ kết thúc, lượt đang diễn ra, ngày giữa chuyến, một/nhiều ngày, cùng giờ và đổi ngày UTC/HCMC. Task 286 unit tests pass; runtime browser/GPS chưa được kiểm tra.
- Fake provider/repository/location/routing; không gọi OpenAI, Google hoặc Neon thật.
- Kiểm tra auth trước khi đọc body/provider; Guest 401, Admin 403, foreign/missing Trip cùng 404; revision mismatch theo convention đã chốt.
- Kiểm tra mọi thao tác trên completed visit bị từ chối, IDs giả/day ngoài biên/deadline không rõ chuyển clarification/no proposal, ALL_COMPLETED không có candidate.
- Kiểm tra điểm đến phải đến trước hạn được giữ làm điểm kết thúc candidate; không tuyên bố Validator PASS ở US-36.
- Source audit chứng minh route/service không import hàm ghi, không lưu/log raw location/message/provider output, không gửi tọa độ thô đến AI.
- Manual browser checklist: quyền GPS thật và từ chối, chuyển manual, keyboard, 360px, clarification, hai tab/revision; không tick PASS thay user. Browser/GPS thật là NOT PROVEN cho đến khi được chạy.

## Expected Modules / Files

- apps/web/src/modules/in-trip/: completion partition, context, structured replan contract/prompt/verifier/service/http và pure logic/tests.
- apps/web/src/app/api/trips/[id]/in-trip/replan/route.ts: Route Handler mỏng.
- apps/web/src/app/trips/[id]/in-trip/ và apps/web/src/components/in-trip/: Trợ lý, nhập nhu cầu/vị trí, trạng thái clarification và proposal.
- Reuse modules/in-trip/* của US-35, modules/trip-edit/edit-candidate.ts của US-32, intent/clarification contract tương thích của US-33; không sửa module sở hữu bởi task khác ngoài handoff được duyệt.
- Không sửa trang app/trips/[id]/page.tsx của Thai Anh nếu chưa có handoff.

## Migration Impact

Không dự kiến đổi schema/migration trong contract docs. Schema hiện chưa có completion field cho từng visit; nếu owner chọn nguồn completion cần thay đổi schema, dừng implementation và chuyển Thai Anh quyết định/migration riêng. Không db:push, reset/drop DB hoặc sửa migration cũ.

## Environment Impact

Không thêm env, dependency hoặc client. Model, client reuse, chi phí và rate limit phải theo quyết định owner/ADR-16 được duyệt.

## Implementation Sequence

1. Task 286 dùng policy hoàn thành theo lịch đã được Bình chọn; nếu tương lai cần trạng thái người dùng đánh dấu thì phải có quyết định/schema riêng của owner/Thai Anh. Thai Anh xác nhận Trip/revision contract trước các task ghi ở US-37.
2. Hoài/Thai Anh/Bình chốt operation contract, time remaining, deadline semantics, provider/model/rate limit và location-derived context.
3. Implement partition/preservation → deadline endpoint contract → AI proposal/clarification → UI → US-37 handoff → tests/evidence.
4. Nếu bất kỳ dependency/schema/policy nào chưa có, dừng đúng task bị chặn; không dựng thay thế.

## Acceptance Evidence

2026-10-17: Task 286 implemented in `apps/web/src/modules/in-trip/split-trip.ts`; focused Vitest: 1 file / 10 tests PASS. Pure helper uses persisted visit schedule, explicit server `now`, and `vietnamDateOf`; no DB, route, UI, provider or schema change. Boundary behavior: before trip all visits remain; after trip `ALL_COMPLETED`; a visit completes at `scheduled end <= now`; an in-progress visit remains; prior itinerary dates complete and future dates remain. `remainingMinutesToday` is whole calendar minutes to HCMC midnight only when a trip day exists for today, otherwise `null`. `npm run check-types` could not start because the NVM shim reports no active Node.js version; direct bundled `tsc` has only the existing Cloudinary TS2307/TS7006 diagnostics and none in Task 286. Browser/GPS and end-to-end runtime remain NOT PROVEN. The story remains DRAFT and Tasks 287–292 are not established by this evidence.

2026-10-17: Task 287 implementation adds the Traveler-only `/trips/[id]/in-trip` page, itinerary partition display, explicit GPS/manual location choices, 500-character need input, and client-only session state. The page reuses `getMyTrip` for authorization and owner-filtered reading and passes the captured server time to Task 286. Related US-35/US-36 location/split/session suites: 6 files / 168 tests PASS; direct TypeScript reports no Task 287 diagnostics. The in-trip entry route exists, but no link was added to Thai Anh's trip-detail page. Browser/GPS/360px/keyboard behavior and the Figma screen baseline remain NOT PROVEN; Task 287 acceptance remains unchecked pending visual/browser review.

2026-10-17: Task 288 adds a strict replan output contract, bounded prompt builder, server-context verifier and provider service in `modules/in-trip/`. The service reuses the generic US-25 `StructuredLlmClient` input, including caller-supplied JSON Schema, and the existing ADR-16 provider error codes; it adds no client, model env, route, UI, persistence or Validator call. The prompt includes only remaining visit summaries, valid day indexes, calendar minutes remaining today and up to 50 eligible destination IDs/names ordered by server-computed straight-line distance. Raw location/destination coordinates and completed visit IDs are omitted from provider text. The verifier validates IDs and operation parameters against server context, turns invalid or ambiguous output into clarification, and rejects the whole proposal if any operation targets a completed visit. The 10-operation limit and semantic bounds are enforced after bounded provider output by Zod; the shared provider guard strips unsupported local constraint keywords from the outbound JSON Schema. Fake-provider tests: 4 files / 44 tests PASS; the Task 286 split suite also passes (10 tests). Direct `tsc --noEmit -p tsconfig.json` reports no Task 288 diagnostics, only existing Cloudinary TS2307/TS7006 errors. `npm run check-types` cannot start because NVM has no active Node.js version. `git diff --check` PASS.

Task 288 NOT PROVEN: no real OpenAI call, route/UI/database integration, browser/GPS behavior or rate-limit protection was exercised. The shared adapter accepts a dynamic schema body but retains the legacy provider schema name `trip_preference_extraction`; the schema body itself is supplied by the caller. ADR-16 rate limiting remains open. A broader in-trip run has one unrelated Task 287 source-audit failure because its generic URL-sink pattern flags the detail-page Link's `href`; all focused Task 288 tests and Task 286 tests pass.

## Open Questions

- **OQ-A — Completion source:** Resolved for Task 286 by Bình on 2026-10-17: derive from persisted scheduled end time in `Asia/Ho_Chi_Minh`; no completion column or migration. A future change to user-marked completion needs a separate owner decision and schema work with Thai Anh.
- **OQ-B — Visit đang diễn ra:** Task 286 leaves a visit in remaining until its scheduled end. Whether later US-36 replanning/US-37 must additionally protect an in-progress visit beyond this time-based partition remains to be decided by Bình + Thai Anh before those tasks.
- **OQ-C — Thời gian còn lại:** Task 290 dùng `remainingMinutesToday` theo ngày hiện tại trong `Asia/Ho_Chi_Minh` để kiểm tra deadline dạng `HH:mm`; nếu không có cửa sổ thời gian trong ngày thì yêu cầu làm rõ. Ngữ nghĩa tổng thể của thời gian còn lại cho các đề xuất replanning qua nhiều ngày vẫn cần owner chốt.
- **OQ-D — Location cho AI:** không gửi tọa độ thô; có gửi khoảng cách/vùng/dữ liệu suy ra nào cho model không, mức độ chính xác ra sao? Bình + Hoài chốt cùng privacy review.
- **OQ-E — GPS ngoài Hà Giang:** chấp nhận, yêu cầu manual hoặc báo unavailable? Ngưỡng freshness/accuracy và mức độ cụ thể do ai duyệt?
- **OQ-F — Entry point:** Route `/trips/[id]/in-trip` now exists from Task 287. The entry point/link and allowed Trip statuses on Thai Anh's `/trips/[id]` detail page remain undecided; ask Thai Anh before changing that page or adding navigation.
- **OQ-G — Rate limit:** giới hạn tần suất/chi phí endpoint AI và xử lý lạm dụng theo ADR-16 thế nào? Owner ADR-16/Bình xác nhận trước khi bật provider.
- **OQ-H — Bắt buộc đến trước hạn:** Task 290 chốt cấu trúc một endpoint `{ destinationId, deadline }`; `deadline` phải là `HH:mm`, lớn hơn giờ server hiện tại và nằm trong `remainingMinutesToday`. Nếu endpoint đã có trong candidate thì đưa xuống cuối phần chưa hoàn thành; nếu không có thì trả mã không khả thi thay vì tự đoán giờ/thời lượng. US-36 không tính thời gian di chuyển; khả thi do Validator của US-37 quyết định. Task 291 hiển thị rõ “chưa kiểm tra khả thi thời gian”.
- **OQ-I — Candidate/revision:** revision token và khi Trip thay đổi trong tab khác thì request/đề xuất cũ được xử lý thế nào? Tái dùng contract US-32/37 sau owner approval.

## Handoff Notes

US-36 chỉ tạo và hiển thị proposal cho phần chưa hoàn thành. US-37 phải tải/đối chiếu context authoritative mới nhất, chạy Validator, xác nhận completed-visit invariant, nhận xác nhận rõ ràng của Traveler và mới ghi qua idempotent apply. Không dùng proposal client làm bằng chứng ownership, completion hoặc Validator PASS.

## Task 289 Evidence

2026-10-17: Task 289 adds a pure `preserveCompleted` invariant and an owner-scoped read-only replan service/route. The service checks `baseRevision` against the same Trip snapshot before capturing server `now`, partitions with Task 286, returns `ALL_COMPLETED` without calling the provider, obtains eligible destinations through `visibleDestinationWhere`, reuses the Task 288 verified AI operations, and applies them to a new US-32 `EditCandidate` through the existing deterministic helpers. It checks every scheduled-complete visit after all operations for stable `visitId`, destination, day, start minute, duration and order; a deleted, modified, moved, or renumbered completed visit fails with `REPLAN_TOUCHED_COMPLETED`. Clarification responses contain no candidate. The route authenticates before reading a bounded strict body, scopes Trip lookup by `id AND userId`, rejects stale revisions, uses `private, no-store`, and imports no write path. Optional resolution IDs are revalidated against current remaining visits/visible destinations and supplied as structured prompt data. No Validator or persistence is called; Task 290's mandatory endpoint is intentionally not applied, and endpoint-only output returns clarification rather than an unchanged itinerary proposal.

Task 289 focused Vitest run: 8 files / 77 tests PASS, including preservation of completed fields, remaining-only candidate changes, foreign Trip 404, Guest 401, Admin 403, revision 409, `ALL_COMPLETED`, strict rejection of client `now`, and source audits for writes/logging/storage. `git diff --check` PASS (Git emitted existing LF-to-CRLF notices). `npm run check-types` could not start because the NVM shim has no active Node.js version. Direct bundled TypeScript check reports only existing Cloudinary TS2307/TS7006 diagnostics and none in Task 289 files.

Task 289 NOT PROVEN: no live OpenAI, Neon, GPS, browser, visual/keyboard, two-tab, or deployed route run. No rate limit was added while ADR-16 remains open. A remaining visit insertion/reorder that changes a completed visit's sequential `order` is rejected by the invariant, as required to keep the stored completed fields identical. The story remains DRAFT; later US-36 tasks are not established by this evidence.

## Task 290 Evidence

2026-10-17: Task 290 adds `applyMandatoryEndpoint`, which accepts only Task 288's `VerifiedMandatoryEndpoint` and builds a strict server-owned `{ destinationId, deadline }` constraint. It checks the endpoint against the server-loaded visible/eligible destination set, rejects a destination already present in a scheduled-complete visit, requires a future `HH:mm` deadline within Task 286's `remainingMinutesToday` window in `Asia/Ho_Chi_Minh`, and moves an existing incomplete endpoint visit to the last incomplete position through US-32 `moveVisit`. If the endpoint visit is absent, it returns `REPLAN_ENDPOINT_NOT_IN_CANDIDATE` instead of inventing a start time or duration. Missing/ambiguous values return stable code-generated clarifications via the existing US-33 `createEditClarification` helper. The proposal response carries the mandatory endpoint constraint for US-37; no travel time or Validator result is inferred.

Focused Task 290 Vitest: 4 files / 39 tests PASS, covering valid/past/outside-window deadlines, ineligible/already-completed/absent endpoints, moving an endpoint to the final remaining position, code-generated choices, resolution verification, and service response. The complete `src/modules/in-trip` run had 16 files pass and 1 known unrelated failure (275/276 tests): the US-35 source audit flags the existing detail-page `Link href` in `components/in-trip/in-trip-assistant.tsx`; that file is outside Task 290 and was not changed. `npm run check-types` could not start because NVM reports no active Node.js version. Direct bundled `tsc --noEmit -p apps/web/tsconfig.json` reports only existing Cloudinary TS2307/TS7006 diagnostics and none in Task 290 files. `git diff --check` exited 0; Git emitted existing LF-to-CRLF notices for concurrently modified files.

Task 290 NOT PROVEN: no live OpenAI, Validator/route-time feasibility, browser, GPS, Neon, or deployed route run. The response now includes a constraint for US-37; the UI text “chưa kiểm tra khả thi thời gian” remains for Task 291. ADR-16 rate limiting remains unresolved and the story remains DRAFT.

## Task 291 Evidence

2026-10-18: Task 291 connects the in-trip assistant to `POST /api/trips/[id]/in-trip/replan` through `lib/in-trip-client.ts`. The request uses a timed, same-origin, `no-store` POST; the location and need stay in the JSON body. The page now passes the edit candidate and `baseRevision` from the same owner-scoped `getTripForEdit` snapshot. The client state keeps the need/location when a request fails and clears stale proposal/clarification state when either input changes. PROPOSED responses render a read-only diff using US-32 `diffEditCandidate`, mark scheduled-complete visits as locked, show the mandatory endpoint when present, and state “Chưa được kiểm tra bởi Validator”; clarification, ALL_COMPLETED, AI, timeout, network and other HTTP errors have separate UI states. No Validator or apply path is imported or called.

Focused Task 291 and Task 287 session tests: 3 files / 16 tests PASS, including response-state mapping, retained inputs on failure, Unicode-aware 500-character limit, private POST body/location URL audit, timeout mapping, and source audit for absence of apply/confirmation controls. Direct TypeScript check reports no Task 291 diagnostics; it exits on the repository's existing Cloudinary TS2307 missing-module and TS7006 implicit-any errors. `npm run check-types` could not start because the NVM shim reports no active Node.js version. `git diff --check` PASS; Git reports existing LF-to-CRLF notices.

Task 291 NOT PROVEN: browser rendering, 360px overflow, keyboard interaction, real GPS, real OpenAI, and end-to-end route behavior were not exercised. The replan response contains destination IDs but not labels for newly suggested destinations; the UI shows a short ID fallback when a label is absent from the original itinerary. ADR-16 rate limiting remains open. Manual browser checks remain for Bình; the story remains DRAFT.

## Task 292 Evidence

2026-10-18: Added `apps/web/src/modules/in-trip/us36-test.vitest.test.ts` as a new integration/source-audit suite; existing US-36 tests were read and left unchanged. The new suite uses a fixed server clock, fake structured-output provider, fake database and fake Traveler/Admin/Guest authorization. It exercises the HTTP-to-service proposal path, checks that a completed visit retains its ID, destination, day, time, duration and order while a remaining visit changes, verifies an owner-scoped Trip read and confirms database write spies remain untouched. It also covers prompt-injection text as data, absence of raw coordinates in provider text, absence of provider/logging/storage/write sinks in audited sources, auth-before-body, foreign Trip 404, stale revision 409, client-supplied `now` rejection, and missing-location rejection before Trip/provider access.

The pre-existing suites provide the detailed boundary coverage used with this integration suite: `split-trip.vitest.test.ts` covers before/after trip, an in-progress visit, the scheduled-end boundary, multi-day dates and UTC/HCMC midnight; `replan-verify.vitest.test.ts` covers forged IDs, out-of-range day, empty destination choices and clarification; `mandatory-endpoint.vitest.test.ts` and `replan-service.vitest.test.ts` cover valid/missing/past/out-of-window deadlines and moving the endpoint to the last remaining position. They use fakes and fixed time; no real OpenAI, Google or Neon service is called.

Focused `us36-test.vitest.test.ts`: 1 file, 8 tests PASS, 1 TODO. The TODO records that behavior for a “not sufficiently specific” location cannot be tested until an owner-approved freshness/accuracy/region threshold exists. Missing `location` currently receives the route's strict-schema `VALIDATION_ERROR` (400), before Trip/provider access; it does not return `NEEDS_CLARIFICATION`.

Full `src/modules/in-trip` Vitest: 18 files pass; 1 existing US-35 URL/navigation source-audit test fails (288 passed, 1 failed, 1 TODO). It flags the Task 291 detail-page `Link href` in `components/in-trip/in-trip-assistant.tsx`; this file is outside Task 292 and was not changed. `npm run check-types` could not start because NVM reports no active Node.js version. Direct bundled `tsc --noEmit -p apps/web/tsconfig.json` reports only the existing Cloudinary TS2307 missing-module and TS7006 implicit-any errors, with no Task 292 diagnostic. `git diff --check` exits 0 and emits existing LF-to-CRLF notices.

Task 292 NOT PROVEN: the location precision/freshness policy remains open under OQ-E, so insufficient-precision clarification behavior is not established. Browser rendering at 360px, keyboard-only use, GPS permission grant/denial, manual location selection in a live browser, two-tab behavior, real GPS, real OpenAI, Neon and deployment are not tested. Manual browser checklist for Bình: [ ] grant GPS permission and request location; [ ] deny GPS and continue with manual location; [ ] choose a manual location; [ ] check layout at 360px; [ ] complete the flow with keyboard only; [ ] open two tabs and verify stale revision handling. Real GPS and OpenAI are NOT PROVEN. ADR-16 rate limiting remains open; story status remains DRAFT.

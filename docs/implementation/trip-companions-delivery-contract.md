# Tìm bạn đồng hành — hợp đồng bàn giao BE/FE

Ngày: 2026-10-28. Trạng thái: **BE SCOPE COMPLETE / BE READY FOR FE THROUGH TC-11**.
Đã tiếp tục TC-03–TC-11 theo task mới; từng mục dưới đây có source/contract/tests.
Development: 42 applied, 0 pending/unfinished. [Receipt cuối](trip-companions-backend-verification.md)
ghi 58 PostgreSQL, 344 focused tests, types/build/HTTP PASS và 5 lỗi baseline của
regression rộng. Giữ nguyên evidence FE đã ghi; không tự hoàn tất vertical/browser
acceptance của phần FE còn lại hoặc nhận ACCEPTED thay chủ dự án.

## Nguồn và quyền sửa

[Kế hoạch Q1–Q17](trip-companions-design.md), [product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), ADR-23 và glossary kiểm soát nghiệp vụ. UI/UX analysis và mockups là tham chiếu thiết kế; ghi rõ mức kiểm chứng thực tế.

BE sở hữu schema/migrations, module/service, Route Handlers, shared DTO/schema nghiệp vụ và kiểm tra server/DB. FE sở hữu pages/components, client adapters dùng shared contract, CSS, tương tác và kiểm tra UI/browser. Trước khi sửa shared contract, giữ tương thích hoặc ghi thay đổi rõ trong phần ticket tương ứng; không tự tạo type API thứ hai trong component để né contract.

## Các ràng buộc áp dụng mọi ticket

- Một Trip owner, member chỉ đọc lịch/chat theo quan hệ; private Trip endpoints vẫn owner-scoped. Không có Admin bypass.
- Public chỉ lấy allowlist, không nội suy/đẩy nhu cầu hoặc chat AI ra ngoài; nội dung/ảnh điểm đến bị ẩn không lộ qua projection tự động.
- Tham gia ngay khi còn chỗ, không approval. Capacity là chỗ tìm thêm; host không chiếm chỗ. Các điều kiện phải đúng ở transaction, không chỉ ở UI.
- SUCCESS chỉ sau DB commit; FAILED và UNKNOWN phân biệt. UNKNOWN thử lại payload/key nguyên vẹn; replay không lặp join/tin/notice.
- Giữ quy tắc Trip/Validator/lưu xác nhận. TC-03 phải có guard xóa Trip từng có member, không đợi ticket cuối.
- Leave/kick/lock/logout phải được kiểm tra trên server ở reader/writer và được FE phản ánh đúng principal. Không hứa thu hồi nội dung người dùng đã tải ra ngoài.
- Chat text/link, đọc lịch sử cũ; hoàn tất tiếp tục chat vô hạn, hủy chỉ đọc với tin người dùng. Không thêm DM, upload, voice, WebSocket/provider mới, email/push, chuyển chủ hoặc CMS báo cáo.
- Route Handlers mỏng, Prisma migrations cho schema. Không secret vào client/log/response, không db:push/reset hoặc thao tác Production trong các prompt này.

## Trước khi FE tích hợp một ticket

BE phải ghi dưới mã ticket: request/response schema thực tế và nơi export; endpoint/method thực tế nếu đã thêm; auth/ownership/membership boundary; trạng thái/errors theo envelope chung; phạm vi idempotency/replay và payload bất biến; cursor/order/version nếu có; fixture synthetic để FE dùng; migration và tình trạng DB được kiểm tra; lệnh test/typecheck/build cùng kết quả/giới hạn.

Không có contract thì FE không tự bịa endpoint/DTO. FE có thể đọc thiết kế hoặc chuẩn bị phần không phụ thuộc, nhưng phần tích hợp vẫn để OPEN đến khi contract có thật. Fixture không được trở thành fallback production hoặc bằng chứng DB write thành công.

**Quy tắc tiếp tục mới theo yêu cầu chủ dự án — 2026-10-28:** Với [hai task toàn phạm vi](trip-companions-completion-plan.md), [BE](tasks/trip-companions-backend.md) xuất contract/tests từng ticket rồi tiếp tục backend ticket sau đủ prerequisite, **không chờ FE/tích hợp trước khi triển khai BE tiếp**. [FE](tasks/trip-companions-frontend.md) đọc contract thật và tích hợp liên tục các mốc sẵn sàng. Gate đủ BE/FE/tích hợp chỉ áp dụng khi đánh dấu vertical ticket IMPLEMENTED. Cập nhật bàn giao không phải lý do kết thúc turn khi còn việc hữu ích trong scope. Prompt một-ticket cũ chỉ áp dụng khi chủ dự án giao đúng một ticket.

## Sổ bằng chứng

| Ticket | BE | FE | Tích hợp |
| --- | --- | --- | --- |
| TC-01 | IMPLEMENTED LOCALLY; evidence below | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| Mốc 0 follow-up TC-01 | BE READY FOR FE, TC01-viewer-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-02 | BE READY FOR FE, TC02-discovery-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-03 | BE READY FOR FE, TC03-membership-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-04 | BE READY FOR FE, TC04-leave-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-05 | BE READY FOR FE, TC05-management-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-06 | BE READY FOR FE, TC06-members-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-07 | BE READY FOR FE, TC07-chat-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-08 | BE READY FOR FE, TC08-delta-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-09 | BE READY FOR FE, TC09-unread-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-10 | BE READY FOR FE, TC10-notice-r1 | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-11 | BE READY FOR FE, TC11-cancel-r1 | IMPLEMENTED LOCALLY | PASS (PostgreSQL 11 files/58 tests, Vitest 11 files/163 tests, types, build 53 routes) |

BE của mọi mốc đã có evidence. Các receipt từng bước bên dưới giữ phạm vi/thời điểm
gốc; receipt cuối supersedes trạng thái pending build/migration/types trong chúng.
FE mốc 0/TC-02–04 đã ghi receipt local riêng; phần FE còn lại tiếp tục theo contract.

## TC-01 — contract thực, 2026-10-28

### Milestone 0 — BE READY FOR FE, revision TC01-viewer-r1 (2026-10-28)

Additive private context; existing public/publish DTOs and keys are unchanged.
`getCompanionViewerContext(headers, publicationId, tripReadDependencies)` is the
server composition export from `companion-service.ts`. HTTP alternative:
`GET /api/trip-companions/:publicationId/viewer`, no query/body. Ordinary success
envelope, `Cache-Control: private, no-store` on success and errors.

- Export `companionViewerContextSchema` / `CompanionViewerContext` from shared
  contract: `{ relationship: "HOST", tripId } | { relationship: "VISITOR" }`.
- Session identity plus persisted active Traveler/Admin capability are required.
  The lookup includes `trip.userId === actor.userId`; no display-name comparison
  or Admin bypass. Visitor and missing IDs return the same VISITOR without any
  Trip/owner/account ID. Guest gets 401, locked/forbidden gets 403, invalid
  ID/query gets 400, unexpected read failure gets 500. No write/replay/cursor.
- Host context works after departure/manual completion; do not use the
  create-publication form reader for this check because that reader has a date
  eligibility gate. Private Trip endpoints remain unchanged.
- Fixtures: `companionHostViewerFixture`, `companionVisitorFixture`. These are
  test-only exports, never runtime fallback.
- FE public page may fetch public data as today, then resolve this context from
  request headers for an authenticated viewer. Skip private context for Guest;
  treat 401/403 as no host controls, and handle technical failures as read errors.
  Pass `isHost`/`tripId` only after HOST. Return link goes to `/trips/:tripId`.
  Do not forward viewer data into metadata/public response or cache it by ID.
- Evidence: viewer + existing TC-01 unit/HTTP/schema **30 PASS**; actual disposable
  PostgreSQL **11 PASS**, including private ID isolation and post-departure host
  access. Same 15 existing scoped migrations, 0 pending; owned container cleaned.
  `git diff --check` PASS. Root typecheck **4/4 PASS**; build follows in final receipt.
- No schema/migration change or Development/Production operation. **FE link/copy
  wiring and host/Guest/outsider/non-owner Admin integration remain OPEN**. This
  follow-up is not owner acceptance. Existing TC-01 vertical evidence and plan
  section 7 allow the next TC-02 BE milestone; TC-03 still requires TC-02 FE.

[Story](../stories/TC-01-publish-public-introduction.md), [issue](../../.scratch/trip-companions/issues/01-publish-public-introduction.md). Không thay đổi DTO/endpoint private Trip hiện hữu. Toàn bộ API mới là additive; chưa có contract TC-01 cũ cần migration client. Chưa có trang hoặc client wrapper FE được tạo.

### Shared exports và fixture

Import từ `@/modules/trip-companions/companion-contract`:

- Input: `companionDraftSchema`, `publishCompanionSchema`; types `CompanionDraft`, `PublishCompanionInput`.
- Output: `companionFormContextSchema`, `companionPreviewSchema`, `companionIntroductionSchema`, `publicCompanionSchema`, `publishCompanionResultSchema`; types `CompanionFormContext`, `CompanionIntroduction`, `PublicCompanion`, `PublishCompanionResult`.
- Thành phần: `companionTripContextSchema`, `companionImageSchema`, `companionIdSchema`.
- [Fixture synthetic](../../apps/web/src/modules/trip-companions/companion-fixtures.ts): `companionDraftFixture`, `companionFormFixture`, `publicCompanionFixture`. `.invalid` URL cố ý không có ảnh mạng thật; FE có thể mock ảnh khi test. Không dùng fixture làm fallback production.

### Endpoint và envelope

| Method / endpoint | Input | `data` khi thành công | Quyền |
| --- | --- | --- | --- |
| `GET /api/trips/:tripId/publication` | Không body/query | `CompanionFormContext` | Active owner |
| `POST /api/trips/:tripId/publication/preview` | `CompanionDraft` | `{ introduction: CompanionIntroduction }` | Active owner |
| `POST /api/trips/:tripId/publication` | `PublishCompanionInput`, `Idempotency-Key` | `{ publicationId, tripId }` | Active owner |
| `GET /api/trip-companions/:publicationId` | Không body/query | `PublicCompanion` | Guest hoặc mọi actor; cùng projection |

`publicationId` khác `tripId`; public GET nhận ID trả về sau publish. Chưa có discovery/list/join API trong TC-01. GET/preview dùng `{ success: true, data }` hoặc `{ success: false, error }`; preview không ghi/idempotency. Publish dùng envelope chung `operationStatus`. Tất cả response, kể cả lỗi, có `Cache-Control: private, no-store`. POST yêu cầu `Origin` đúng origin URL và `Content-Type: application/json`; giới hạn stream 24,576 byte. Các endpoint không nhận query override. Next tự trả 405 với HTTP method không export.

Input draft strict:

```json
{
  "title": "Cùng khám phá Hà Giang",
  "introduction": "Tìm bạn đi cùng…",
  "additionalCapacity": 2,
  "imageMediaId": null
}
```

Title/introduction trim, dài lần lượt 1–200 / 1–4000 ký tự. Capacity là số nguyên JSON 1–2,147,483,647 (giới hạn lưu trữ Int, không có mức tối đa nghiệp vụ mới), không coercion từ chuỗi. `imageMediaId` bắt buộc có, giá trị null khi không chọn ảnh hoặc ID từ `imageOptions`; không nhận URL ảnh tự nhập. Publish dùng chính draft cộng `"confirm": true`; không gửi confirm vào preview. Các field ngoài schema, kể cả userId/hostId/dates/transport, bị từ chối.

`CompanionFormContext`:

```text
{
  trip: { host, startDate, endDate, durationDays, transport, routeSummary },
  imageOptions: [{ mediaId, url, alt }],
  publication: null | { publicationId, draft: CompanionDraft }
}
```

Nếu đã có publication, FE dùng ID để mở bài hiện hữu; TC-01 không cung cấp sửa/đăng lại. Form/preview/publish mới chỉ dành cho Trip trước ngày khởi hành Việt Nam và chưa đánh dấu hoàn tất; sau mốc đó trả 409. Public introduction của bài đã đăng vẫn đọc được khi ngày trôi qua/Trip được đánh dấu hoàn tất; điều kiện tham gia và lọc danh sách thuộc ticket sau.

`PublicCompanion` là `{ publicationId, introduction }`. `introduction` chỉ có:

```text
title, introduction,
host: { displayName, avatarUrl: safe-HTTPS | null },
startDate, endDate (YYYY-MM-DD), durationDays, transport (CAR | MOTORCYCLE),
routeSummary: [{ destinationId, name }],
additionalCapacity, availablePlaces,
image: { url, alt } | null
```

Preview/public dùng chung projector và schema `CompanionIntroduction`, không copy private Trip DTO. Nội dung text do host nhập phải render như plain text; không HTML. Ngày/phương tiện/host/tuyến đọc từ Trip/User hiện hành, không phải snapshot client. Tuyến theo dayIndex rồi visit order tăng dần, bỏ Destination ID lặp và giữ lần xuất hiện đầu. Điểm đến hiện HIDDEN/soft-deleted bị loại ở query lẫn projection. Ảnh chỉ từ điểm công khai trong tuyến, dùng `destinationMediaWhere` + `isDestinationMediaUsable` hiện hữu (gồm ảnh upload có provenance hợp lệ); ảnh bị xóa, mất quyền dùng hoặc ra khỏi tuyến trả `image: null`. Avatar sai URL công khai trả null. Route rỗng/ảnh null là fallback thật, không chèn địa điểm/ảnh giả.

Không chọn/trả email/phone/account ID, nhu cầu, AI history, ngày/visit ID, giờ ghé/thời lượng, điểm hẹn, member/chat, tọa độ, nội dung chi tiết điểm đến hoặc media storage/rights metadata. Text host tự nhập là nội dung họ chủ động công khai trong preview; server không tự lấy contact từ tài khoản.

TC-01 chưa có member: `availablePlaces === additionalCapacity`. FE ghi nhãn **Số chỗ tìm thêm** và **Chỗ còn**, không suy thành tổng số người có quyền nhóm/nhóm ngoài đời. TC-03 phải đổi cách tính availablePlaces khi membership xuất hiện, không tạo API tham gia giả tại đây.

### Authorization, lỗi và recovery

Actor lấy từ trusted session và User.role/status hiện tại. TRAVELER/ADMIN active chỉ đọc form/preview/ghi cho Trip mình sở hữu. Foreign và missing Trip cùng `TRIP_NOT_FOUND` 404; Admin không bypass. Public read không nâng quyền theo session và private Trip API không được mở rộng. Ghi khóa User FOR SHARE, kiểm tra lại auth, khóa owned Trip FOR UPDATE rồi đọc lại Trip/đánh giá ngày Việt Nam sau khi chờ khóa.

| HTTP | Code chính | Xử lý FE |
| --- | --- | --- |
| 400 | `INVALID_COMPANION_INPUT`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID` | Giữ draft và hiển thị lỗi đúng trường/ngữ cảnh |
| 401 | `UNAUTHENTICATED` | Đăng nhập, quay lại ngữ cảnh; người dùng bấm lại, không tự replay write sau auth |
| 403 | `ACCOUNT_LOCKED`, `FORBIDDEN`, `INVALID_ORIGIN` | Dừng khả năng ghi theo principal hiện tại |
| 404 | `TRIP_NOT_FOUND`, `COMPANION_NOT_FOUND` | Trạng thái không tìm thấy, không suy quyền từ ID |
| 409 | `TRIP_NOT_PUBLISHABLE`, `COMPANION_ALREADY_PUBLISHED`, `IDEMPOTENCY_KEY_REUSED` | Không báo thành công; đọc lại context/bài hiện có khi phù hợp; không đổi payload dưới cùng key đã thành công |
| 413 / 415 | `COMPANION_INPUT_TOO_LARGE` / `INVALID_CONTENT_TYPE` | Sửa request; không làm mất draft |
| 422 | `COMPANION_IMAGE_UNAVAILABLE` | Refresh image options, bỏ/chọn lại ảnh và preview lại |
| 500 (read/preview) | `INTERNAL_SERVER_ERROR` | Hiển thị lỗi đọc, cho retry; không giả có dữ liệu |
| 503 (publish) | `OPERATION_STATUS_UNKNOWN`, `retryWithSameKey: true` | Giữ nguyên payload/key và đối soát |

Known write errors là `FAILED`; unexpected write/commit/replay lookup errors là `UNKNOWN`. Không trả lỗi raw DB. Trạng thái khóa tài khoản hiện tại cũng chặn replay publication.

### Write, replay, thứ tự/version

- Operation `trip-companions:publish`, scope JSON `[actorId, operation]`, key tối đa 200 ký tự theo helper chung. Hash canonical JSON gồm `{ tripId, title, introduction, additionalCapacity, imageMediaId, confirm: true }` sau validate/trim. Cùng key nhưng đổi target/nội dung đã commit → 409.
- Publication + serialized `{ publicationId, tripId }` thành công commit chung transaction. Cùng key/payload → cùng ID, header `Idempotency-Replayed: true`. Khóa Trip và unique index bảo đảm khác key tranh cùng Trip chỉ một bản ghi; request còn lại nhận `COMPANION_ALREADY_PUBLISHED`/409, không tạo nhóm mới.
- SUCCESS chỉ trả sau commit; không coi preview hoặc pending là đã công khai. Dùng `sendIdempotentMutation` hiện hữu trong FE wrapper và validate result bằng schema export, kiểm tra tripId khớp target. Network/malformed response theo helper là UNKNOWN. Giữ payload/key bất biến trong pending/UNKNOWN; không sinh key khác để thử lại.
- Replay trả IDs, không cache snapshot public. Sau SUCCESS, FE GET public để đọc dữ liệu hiện hành. Lỗi GET sau một SUCCESS không biến publication đã xác nhận thành thất bại; cho retry đọc riêng.
- Không có cursor/version/pagination/chat ordering ở ticket này; thứ tự route/image options đã chốt phía trên. Chưa có mutation chỉnh publication; TC-05 bổ sung. Một publication là identity ổn định cho group tương lai, chưa có bảng group/chat/member riêng.

### Migration và bằng chứng

- Migration additive [20261028120000_trip_companion_publication](../../packages/db/prisma/migrations/20261028120000_trip_companion_publication/migration.sql): một bảng, unique tripId, positive capacity/nonblank text checks, FK Trip CASCADE và nullable ContentMedia SET NULL. Trip chưa có members vẫn xóa được qua service hiện hữu; **TC-03 bắt buộc thêm guard lịch sử member trước khi triển khai join**.
- `npm run db:generate` PASS. Tăng `databaseSchemaRevision` của cache Prisma dev để hot reload nhận delegate mới; không cache authorization/query results.
- `node scripts/test-trip-companions-postgres.mjs` chạy từ `apps/web`: PostgreSQL 16 loopback container có nhãn ownership, identity `tc01_test`; Prisma migrate deploy/status cho **15 migration liên quan nguyên bản** (14 cũ + migration mới), 0 pending; kiểm tra catalog/FK/check và 10/10 integration tests PASS. History PostGIS/vector/AI không liên quan không có trong fixture này; không claim kiểm tra toàn bộ deployment history. Container + cấu hình/migration copy tạm đã xóa theo ownership/path checks.
- DB tests chứng minh canonical Save → preview → publication → Guest đọc bằng Prisma client mới; dữ liệu hidden/deleted/rights-revoked không lộ; private Trip vẫn owner-only; 6 request khác key và 6 request cùng key; mất ack sau commit/replay; rollback khi ghi replay lỗi; cạnh tranh thực có quan sát pg_stat_activity chờ khóa khi đổi ngày/hoàn tất/khóa account và qua nửa đêm Việt Nam; media deletion/Trip deletion FKs.
- Task BE ban đầu chỉ kiểm chứng DB disposable. Trong lần sửa lỗi localhost tiếp theo, đã áp dụng migration vào Development sau khi xác minh endpoint và SQL identity: **34 applied, 0 pending/unfinished**, bảng/columns/indexes hợp lệ; form và Guest preview trên tab đăng nhập đã tải được. Xem [bằng chứng rollout Development](tc01-development-migration.md). Production chưa được thao tác; môi trường khác cần rollout riêng theo workflow dự án, không dùng db:push/reset.

### Bằng chứng FE và tích hợp TC-01 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp TC-01 đã hoàn tất trọn lát cắt dọc tại local:

1. **Client module & Form:**
   - [`companion-client.ts`](../../apps/web/src/modules/trip-companions/companion-client.ts): Client wrappers `fetchCompanionFormContext`, `previewCompanionDraft`, `publishCompanionTrip` (kèm xác thực Zod và kiểm tra chéo `tripId`), `fetchPublicCompanion`. Dùng `sendIdempotentMutation` bảo đảm trạng thái `UNKNOWN` giữ nguyên draft và key cho retry an toàn.
   - [`publication-form-client.tsx`](../../apps/web/src/app/trips/[id]/publication/publication-form-client.tsx): Form đăng ký với thông tin Trip chỉ đọc (ngày, phương tiện, tuyến đường), bộ đếm ký tự thời gian thực (tiêu đề 1–200, giới thiệu 1–4000), ô nhập capacity nguyên dương, lưới chọn ảnh điểm đến hợp lệ kèm fallback không ảnh, chế độ xem trước (preview) trực tiếp, và trạng thái nhận diện nếu Trip đã xuất bản kèm link sang trang public.
   - [`page.tsx`](../../apps/web/src/app/trips/[id]/publication/page.tsx): Server Component kiểm tra auth (401 redirect kèm `returnTo`, 403 `AccessDenied`, 404 `notFound`, 409 thông báo Trip đã qua ngày/đã hoàn tất không đủ điều kiện).
2. **Trang giới thiệu công khai & Trình bày:**
   - [`companion-introduction-view.tsx`](../../apps/web/src/components/trip-companions/companion-introduction-view.tsx): Thành phần dùng chung cho Guest public view và preview của Host. Hiển thị thông tin tổng quan, thẻ Host, tiêu điểm số chỗ tìm thêm / chỗ còn, tóm tắt tuyến đường, banner khóa hành trình chi tiết dành cho thành viên, render chuỗi text an toàn (plain text) không biên dịch HTML/script. Không có nút kêu gọi tham gia (CTA) giả; chỉ hiển thị trạng thái tìm người đồng hành đúng tiêu chuẩn TC-01.
   - [`page.tsx`](../../apps/web/src/app/trip-companions/[id]/page.tsx): Public Server Component hỗ trợ Guest và mọi actor, tự sinh dynamic metadata.
   - [`companion.css`](../../apps/web/src/app/trip-companions/companion.css): Kế thừa hệ design token (cream `#f8f7f3`, forest green `#174a35`, Be Vietnam Pro body, Lora serif heading).
3. **Điểm điều hướng (Navigation entry):**
   - [`trips-view.tsx`](../../apps/web/src/app/trips/trips-view.tsx): Tích hợp icon và nút "Tìm bạn đồng hành" dẫn tới `/trips/${trip.id}/publication` trong header action bar và footer navigation của TripDetailView cho các chuyến đi active.
4. **Kiểm chứng tự động:**
   - Focused Vitest: `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/app/trips/trips-view.vitest.test.ts` — **51 passed, 10 skipped**.
   - Full Vitest regression (21 files): **197 passed, 11 skipped**.
   - Idempotency suite (`npm run test:idempotency --workspace web`): **4/4 passed**.
   - PostgreSQL integration tests (`node scripts/test-trip-companions-postgres.mjs`): **10/10 PASS** (15 migrations nguyên bản, 0 pending).
   - Typecheck (`npm run check-types`): **4/4 packages PASS**.
   - Web production build (`npm run build --workspace web`): **Compiled successfully, 48 static pages prerendered**, các route `/trips/[id]/publication` và `/trip-companions/[id]` được nhận diện đầy đủ.

Chi tiết nhật ký kiểm thử và tiêu chí nghiệm thu xem tại [story TC-01](../stories/TC-01-publish-public-introduction.md#acceptance-evidence). TC-01 đã hoàn tất; ticket kế tiếp TC-02 (Discovery) chờ nghiệm thu của người dùng trước khi bắt đầu.

### Hậu kiểm FE và sửa lỗi review — 2026-10-28

Theo yêu cầu sửa của người dùng, form nay bắt buộc Preview → xác nhận; mọi chỉnh sửa vô hiệu hóa preview cũ và response lỗi/thành công cũ không được thay nội dung đang xem. Publish dùng snapshot đã preview; pending/UNKNOWN giữ toàn bộ Trip ID/payload/key và khóa cả callback của image/input/tab. Known FAILED giữ input, cho chỉnh và bắt preview lại với attempt/key mới; SUCCESS không gửi lặp khi đang điều hướng.

[Bằng chứng hồi quy](tc01-publication-form-review-fixes.md): 7 test actual-handler fail trước sửa, pass sau sửa; tổng liên quan 129 PASS/11 PostgreSQL skips, web typecheck và isolated production build PASS. Các test mới gọi handler và mutation transport thật bằng fetch fixture; các receipt render HTML tĩnh trước đó không chứng minh đủ recovery/confirmation. Không đổi API/BE/schema/migration, không chạy lại DB hoặc browser acceptance. Chưa bắt đầu TC-02.

## TC-02 — BE READY FOR FE, revision TC02-discovery-r1 (2026-10-28)

[Story](../stories/TC-02-discover-filter-trips.md),
[issue](../../.scratch/trip-companions/issues/02-discover-filter-trips.md).
Additive GET APIs; no breaking change to TC-01 preview/publish/public detail.
FE/integration **OPEN**. No TC-03 membership/join or future lifecycle is delivered.

### Endpoints, exports and projection

| GET endpoint | Auth | Success `data` |
| --- | --- | --- |
| `/api/trip-companions` | Guest/public; session does not elevate this projection | `CompanionList` |
| `/api/trip-companions/mine` | Trusted session + current active Traveler/Admin | `CompanionList`, filtered by `Trip.userId === actor.userId` |

Service exports from `companion-discovery-service.ts`:
`listPublicCompanions(rawQuery, tripReadDependencies)` and
`listMyCompanionPublications(headers, rawQuery, tripReadDependencies)`.
Shared client-safe exports from `companion-contract.ts`:
`companionListQuerySchema`, `CompanionListQuery` (parsed output),
`companionListSchema`, `CompanionList`.
Raw query values are **strings**, as in URLSearchParams. The schema converts
`availableOnly` to boolean and `limit` to number; do not re-submit that parsed
output to the raw-input service/schema. FE builds URLSearchParams from controls.

Success: `{ success: true, data: { items: PublicCompanion[], total, nextCursor } }`.
`total` is the full count for these filters/scope **before** cursor pagination;
it is not the length loaded so far. `nextCursor: null` ends pagination.
Cards use exactly the existing TC-01 public introduction allowlist. Neither
endpoint returns private Trip ID, account ID, hourly itinerary, contact, needs,
AI history, member/chat or media-rights metadata. Resolve host Trip ID through
TC01-viewer-r1 when needed. Existing private Trip endpoints remain owner-scoped.

Public and mine currently include only persisted publications whose saved Trip
is strictly after today's Vietnam date and has no manual completion flag.
Public detail remains readable after departure, as in TC-01. Mine is an upcoming
hosted invitation collection in this revision; it does not yet expose withdrawn,
canceled or past-group management. Those states do not exist in current schema;
TC-05/11 must extend discovery eligibility and hosted management deliberately.

### Query contract

Every filter is AND-combined with the others. Omit unused optional filters;
empty date/transport/cursor values are errors. No `scope`, `ownerId`, `userId`,
page number or client sort override is accepted.

| Param | Values/default | Meaning |
| --- | --- | --- |
| `q` | Trimmed string, max 200; default empty | Case-insensitive literal substring of title **or a currently public route destination name**. Not host, introduction, private destination names or AI content. Accent folding is not provided. `%`, `_`, backslash are literal characters. |
| `departureFrom` | Optional valid `YYYY-MM-DD` | Inclusive lower bound on **departure date**, not trip overlap/end date |
| `departureTo` | Optional valid `YYYY-MM-DD`, >= from | Inclusive upper bound on departure date. A single-day filter sends both bounds equal. |
| `transport` | Optional `CAR` / `MOTORCYCLE` | Saved Trip transport |
| `availableOnly` | Exact string `true` / `false`, default `false` | Only rows with remaining additional places when true |
| `limit` | Decimal integer string 1–50, default `12` | Maximum items per page |
| `cursor` | Optional opaque `nextCursor` from prior page | Continue with identical filters, limit, scope and actor |

No membership exists until TC-03: `availablePlaces === additionalCapacity > 0`
and the available-only filter currently matches all otherwise eligible rows.
This is explicit staged behavior, not a fake member count. TC-03 must replace
this predicate and projection with current joined-account capacity, without
counting host or planner party size. Labels remain **Số chỗ tìm thêm / Chỗ còn**.

Example:
`/api/trip-companions?transport=MOTORCYCLE&departureFrom=2030-11-15&departureTo=2030-11-15&availableOnly=true&limit=12`

### Ordering, cursors, freshness and recovery

- Sort: saved `Trip.startDate ASC`, publication `id ASC` as a unique tie-breaker.
  Keyset cursor stores the last tuple, not an offset or a live-row lookup, so
  deleting the anchor does not break continuation. Each page reads one extra row
  to determine nextCursor.
- Version-1 base64url cursor is strictly decoded/validated and bound by hash to
  normalized filters, limit, scope and actor. Treat it as opaque, reset when any
  of these change. Cursor is unsigned traversal input, **never authorization**;
  mine always establishes the current actor and independently scopes the query.
- One RepeatableRead transaction gives each request a consistent total, filter
  and nested route/media projection. Queries reuse TC-01 canonical public
  destination/media filters and projector; hiding/revoking content is observed
  on the next read. There is no cached result or cross-request snapshot.
- Tied records paginate without unstable ordering; live inserts/date edits can
  move rows across an existing cursor between requests. Refresh from page one
  for a current collection after known changes; FE deduplicates by publicationId.
  No immutable multi-request snapshot or chat commit-order guarantee is claimed.
- Ordinary JSON envelopes, `Cache-Control: private, no-store` on all exported
  read responses including errors. Browser clients use no-store and cancel/ignore
  old results when filters/account/scope change. Preserve query URL when opening
  a public detail; FE owns return navigation/scroll restoration.
- HTTP 400 `INVALID_COMPANION_QUERY` for unknown/duplicate params, invalid values,
  reversed date range, malformed cursor or cursor/filter mismatch. Mine additionally
  returns 401 `UNAUTHENTICATED`, 403 `ACCOUNT_LOCKED` / `FORBIDDEN`.
  Technical read errors return 500 `INTERNAL_SERVER_ERROR`; do not show fake empty
  data. Read retry has no idempotency key or operationStatus. Existing publication
  mutation SUCCESS/FAILED/UNKNOWN semantics remain unchanged.

### Fixtures, tests and migration receipt

`companion-fixtures.ts`: `companionListQueryFixture`, `companionListFixture`,
`companionEmptyListFixture` plus existing public/host/visitor fixtures. All
synthetic, client-safe; never a runtime fallback. Fixture query covers a combined
single-day/MOTORCYCLE/available-only route search. Non-final cursors come from API;
do not fabricate tokens in the client.

- New discovery unit/HTTP/contract **24 PASS**, viewer **8 PASS**; existing TC-01
  **22 PASS**. Final related regression: **27 files / 253 PASS, 21 opt-in skips**.
  Includes actual publication form handlers/preview/UNKNOWN, TC-01 client/UI,
  Trip Save/Read/management/Edit, deterministic Validator, media/auth/cache.
- `node scripts/test-trip-companions-postgres.mjs` from `apps/web`: **20/20 PASS**
  (9 discovery + 11 TC-01/viewer), real PostgreSQL16 loopback container; actual
  15 unchanged relevant migrations, **0 pending**, owned-container cleanup PASS.
  Discovery proves combined/inclusive date filters, literal wildcard search,
  hidden/deleted name exclusion from counts, media revocation, tied pagination,
  deleted anchor, filter/scope/account cursor isolation, current account auth,
  Vietnam midnight/manual completion and count/projection snapshot under a real
  concurrent content update. Existing publication lock/race/replay/rollback tests
  pass too. Skipped DB tests in the generic suite are not counted as passes there;
  these 20 cases were independently run through the disposable runner.
- Root `npm run check-types`: **4/4 PASS**. Shared idempotency **4/4 PASS**.
  Build with separate output (`KLTN_PERF_BUILD=1 npm run build --workspace web`)
  compiled, then **FAILED** the typed-route check on the concurrently edited FE
  public page linking `/trip-companions` before its list page existed in that
  build snapshot. Root typecheck PASS predates this combined-source failure;
  combined checkout build remains **OPEN**, to rerun after FE finishes the route.
  BE preserved all FE-owned edits and does not claim their acceptance. Final
  whitespace receipt follows below.
- Initial fixture runs found a test syntax error, a checked/unchecked nested Prisma
  relation mismatch and a public text marker colliding with the privacy assertion.
  Corrected fixtures, kept assertions/DB constraints, reran all 20 successfully.
- No schema/migration/client-generation/dependency/env change. Development retains
  the prior TC-01 rollout receipt; **no new Development identity/ledger/data check
  or migration was necessary/performed**. No Production access or provider calls.
  Scoped disposable migrations exclude unrelated vector/PostGIS/AI history; this
  is not a full deployment drift claim.

### Bằng chứng FE và tích hợp Milestone 0 & TC-02 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp Milestone 0 (follow-up host-context) và TC-02 (Discovery) đã hoàn tất trọn lát cắt dọc tại local:

1. **Milestone 0 (TC-01 Follow-up):**
   - [`companion-client.ts`](../../apps/web/src/modules/trip-companions/companion-client.ts): Thêm `fetchCompanionViewerContext(publicationId)` trả về `CompanionViewerContext` (`{ relationship: "HOST", tripId }` hoặc `{ relationship: "VISITOR" }`).
   - [`page.tsx`](../../apps/web/src/app/trip-companions/[id]/page.tsx): Server Component phân giải context qua `getCompanionViewerContext`, truyền `isHost` và `tripId` bảo mật sang view; breadcrumb quay về `/trip-companions` an toàn typed-route (`as Route`).
   - [`companion-introduction-view.tsx`](../../apps/web/src/components/trip-companions/companion-introduction-view.tsx): Nút "Quay lại quản lý chuyến đi" chỉ hiển thị khi `isHost && tripId`, link về `/trips/${tripId}`; copy công khai thể hiện đúng chức năng hiện có, không hứa tính năng chat/join khi chưa có API.

2. **TC-02 (Discovery & Filter):**
   - [`header.tsx`](../../apps/web/src/components/header.tsx) & [`header.css`](../../apps/web/src/components/header.css): Thêm mục navigation "Tìm bạn đồng hành" (`/trip-companions`, icon `Users`) trên cả desktop navbar và mobile drawer; điều chỉnh breakpoint nav từ 1140px lên 1200px bảo đảm không tràn ở 1152–1280px.
   - [`companion-client.ts`](../../apps/web/src/modules/trip-companions/companion-client.ts): Client adapters `fetchPublicCompanions(query)` và `fetchMyCompanionPublications(query)` ánh xạ đầy đủ bộ lọc (`q`, `departureFrom`, `departureTo`, `transport`, `availableOnly`, `limit`, `cursor`).
   - [`page.tsx`](../../apps/web/src/app/trip-companions/page.tsx): Trang danh sách công khai bọc trong `<Suspense>`, có dynamic metadata.
   - [`companion-discovery-view.tsx`](../../apps/web/src/components/trip-companions/companion-discovery-view.tsx): Client view tương tác hỗ trợ:
     - Hero header, CTA "Đăng chuyến đi" dẫn tới `/trips` để chọn chuyến đi đã lưu.
     - 2 tab phạm vi ban đầu: "Khám phá chuyến" (public) và "Chuyến tôi đăng" (mine); xử lý Guest khi chọn tab mine hiển thị thông báo đăng nhập (`returnTo=/trip-companions?tab=mine`).
     - Thanh lọc: tìm kiếm từ khóa (`q` so khớp tiêu đề và điểm đến), khoảng ngày khởi hành (`departureFrom`, `departureTo`), phương tiện (`CAR`/`MOTORCYCLE`), checkbox chỉ hiện chuyến còn chỗ (`availableOnly`), nút đặt lại bộ lọc.
     - Đồng bộ hai chiều với URL search params (`useSearchParams` + `router.replace` scroll: false), giữ nguyên context khi chuyển trang hoặc nhấn Back.
     - Lưới thẻ chuyến đi: ảnh đại diện fallback gradient, badge "Còn X chỗ tìm thêm", thời gian, phương tiện, chuỗi điểm đến kèm mũi tên, thẻ host, nút "Xem chuyến".
     - Phân trang keyset với nút "Tải thêm chuyến đi" (`nextCursor`).
     - Trạng thái skeleton loading, empty state khi không có kết quả.
   - [`companion.css`](../../apps/web/src/app/trip-companions/companion.css): Bổ sung toàn bộ style hệ thống Highland (cream `#f8f7f3`, forest green `#174a35`, responsive 360px–1440px).

3. **Kiểm chứng tự động:**
   - Focused Vitest: `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/components/trip-companions src/modules/trip-companions src/components/header.vitest.test.ts src/app/trips/trips-view.vitest.test.ts` — **118 passed, 20 skipped**.
   - Header Vitest: `12/12 passed`.
   - Discovery UI Vitest (`companion-discovery.vitest.test.ts`): `7/7 passed`.
   - Client Vitest (`companion-client.vitest.test.ts`): `20/20 passed`.
   - PostgreSQL integration tests: `node scripts/test-trip-companions-postgres.mjs` — **20/20 PASS** (11 TC-01 + 9 TC-02 discovery), 15 scoped migrations, 0 pending, owned container cleaned up.
   - Idempotency suite: `npm run test:idempotency --workspace web` — **4/4 passed**.
   - Typecheck: `npm run check-types` — **4/4 packages PASS**.
   - Web production build: `npm run build --workspace web` — **Compiled successfully, 52 static pages prerendered**, các route `/trip-companions`, `/trip-companions/[id]`, `/api/trip-companions`, `/api/trip-companions/mine` nhận diện đầy đủ.
   - Git diff: `git diff --check` — **0 whitespace/merge issues**.


## TC-03 — BE READY FOR FE (2026-10-28)

Revision TC03-membership-r1. POST /api/trip-companions/:id/join accepts only {confirm:true} plus Idempotency-Key; result {publicationId}. GET /api/trip-companions/:id/group returns CompanionGroup; GET /api/trip-companions/joined uses existing strict list query/list schema and includes host/current member groups across dates. Shared companion-group-contract.ts exports companionConfirmSchema, companionGroupMutationSchema, companionGroupSchema / CompanionGroup; companion-group-fixtures.ts exports companionGroupFixture. Service exports joinCompanion/getCompanionGroup; listJoinedCompanions is in discovery service. Group projection has relationship, memberCount including host, public introduction and detailed days/visits (time/duration/coordinates for currently public destinations); unavailable destinations use null ID/coordinates and a placeholder. No needs/AI/contact/private Trip DTO. Active account checked per reader/writer; foreign/non-member Admin gets 403; Guest 401; invalid body 400; full/closed/history-delete 409. All responses private/no-store; ordinary GET envelopes and shared mutation outcomes. Successful replay IDs describe the original operation, never restore membership; refresh group after replay. Lock order account SHARE -> Trip UPDATE -> publication UPDATE; date evaluated after locks. One membership/account, host never uses a place. Public DTO shape unchanged; availablePlaces and availableOnly now derive from current ACTIVE memberships in one read snapshot. Migration 20261028130000_companion_membership adds durable historical flag/membership uniqueness/FKs and DB delete trigger; existing delete service locks/checks historical flag before favorite deletion. Evidence: 70 focused tests PASS; disposable PostgreSQL 26 PASS (6 new TC-03 + prior 20), 16 migrations/0 pending/cleanup PASS; Prisma generate and root typecheck PASS; whitespace checked. No Development/Production rollout yet. FE/vertical integration OPEN; final combined build deferred while FE changes, not claimed PASS.

### Bằng chứng FE và tích hợp TC-03 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp TC-03 (Tham gia tức thì & Lịch trình thành viên) đã hoàn tất trọn lát cắt dọc tại local:

1. **Client module & Mutation:**
   - [`companion-client.ts`](../../apps/web/src/modules/trip-companions/companion-client.ts): Client wrappers `joinCompanionTrip(publicationId, idempotencyKey)`, `fetchCompanionGroup(publicationId)`, `fetchJoinedCompanions(query)`. Áp dụng `sendIdempotentMutation` bảo đảm trạng thái `UNKNOWN` giữ nguyên key và cho phép "Thử lại tham gia" an toàn mà không sinh key mới; `SUCCESS` trả về `{ publicationId }`.
2. **Giao diện công khai & CTA theo quan hệ (CompanionIntroductionView):**
   - [`companion-introduction-view.tsx`](../../apps/web/src/components/trip-companions/companion-introduction-view.tsx):
     - **Host**: Hiện link "Vào nhóm chuyến" (`/trip-companions/:id/group`) và "Quay lại quản lý chuyến đi" (`/trips/:tripId`).
     - **Member**: Hiện huy hiệu "Bạn đã là thành viên của chuyến đi" kèm CTA chính "Vào nhóm chuyến".
     - **Guest**: Hiện nút "Đăng nhập để tham gia" (`/login?returnTo=/trip-companions/:id`), sau đăng nhập người dùng tự quyết định bấm tham gia, không tự kích hoạt write.
     - **Outsider ứng viên**:
       - Nếu chuyến đã qua ngày khởi hành: Nút vô hiệu "Chuyến đã khởi hành".
       - Nếu hết chỗ (`availablePlaces === 0`): Nút vô hiệu "Chuyến đã đủ chỗ".
       - Nếu còn chỗ: Nút "Tham gia chuyến đi" kèm ghi chú "Không cần xét duyệt · Giữ chỗ ngay". Hiển thị trạng thái "Đang tham gia..." trong lúc request, banner lỗi máy chủ khi `FAILED`, và nút "Thử lại tham gia" khi gặp lỗi mạng `UNKNOWN`.
3. **Không gian nhóm chi tiết (CompanionGroupView):**
   - [`companion-group-view.tsx`](../../apps/web/src/components/trip-companions/companion-group-view.tsx):
     - Header hiển thị huy hiệu vai trò ("Bạn là chủ chuyến" / "Bạn là thành viên nhóm"), tóm tắt thông tin chuyến, link "Xem trang giới thiệu", và link "Chỉnh sửa lịch gốc" (cho Host).
     - Tab **Lịch trình chi tiết**: Danh sách các ngày, timeline ghé thăm hiển thị giờ/thời lượng, tên điểm đến, tọa độ, và nhãn cảnh báo "Điểm đến không còn khả dụng" khi địa điểm bị ẩn/xóa. Banner thông báo "Lịch trình chính thức do chủ chuyến cập nhật · Thành viên chỉ đọc".
     - Tab **Thành viên**: Số lượng thành viên nhóm (bao gồm chủ chuyến), thông tin thẻ Host, và nút "Rời nhóm chuyến đi" (mở modal xác nhận).
   - [`page.tsx`](../../apps/web/src/app/trip-companions/[id]/group/page.tsx): Server Component kiểm tra quyền truy cập qua `getCompanionGroup`, redirect 401 về `/login?returnTo=/trip-companions/:id/group`, redirect 403 về trang giới thiệu `/trip-companions/:id`, và `notFound()` khi không tìm thấy.
4. **Tab "Tôi tham gia" (Discovery View):**
   - [`companion-discovery-view.tsx`](../../apps/web/src/components/trip-companions/companion-discovery-view.tsx): Thêm tab thứ 3 "Tôi tham gia" (`tab=joined`). Tự động tải danh sách chuyến người dùng tham gia qua `fetchJoinedCompanions`. Guest chọn tab này nhận thông báo đăng nhập. Thẻ chuyến hiển thị nút "Vào nhóm" dẫn thẳng tới `/trip-companions/:id/group`.
5. **Kiểm chứng tự động:**
   - Focused Vitest: `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/components/trip-companions src/modules/trip-companions src/components/header.vitest.test.ts src/app/trips/trips-view.vitest.test.ts` — **12 files / 142 passed, 46 skipped**.
   - PostgreSQL integration tests: `node scripts/test-trip-companions-postgres.mjs` — **10/10 test files (46/46 tests) PASS** trên container PostgreSQL 16 thật, 22 migrations applied, 0 pending, dọn dẹp container thành công.
   - Idempotency suite: `npm run test:idempotency --workspace web` — **4/4 passed**.
   - Typecheck: `npm run check-types` — **4/4 packages PASS**.
   - Web production build: `npm run build --workspace web` — **Compiled successfully, 53 static pages prerendered**, nhận diện đầy đủ `/trip-companions/[id]/group` và các API endpoints.
   - Git diff: `git diff --check` — **0 whitespace/merge issues**.

[Story](../stories/TC-03-instant-join-member-itinerary.md).


## TC-04 — BE READY FOR FE (2026-10-28)

Revision TC04-leave-r1. POST /api/trip-companions/:id/leave uses shared strict {confirm:true}, Idempotency-Key, and {publicationId} confirmed result. companion-group-service.ts exports leaveCompanion; existing joinCompanion now reactivates the same LEFT row under locks. Historical everHadMembers and joinedAt remain intact. Host leave => COMPANION_HOST_CANNOT_LEAVE/409; no prior member/current barred relation => 403, Guest 401. ACTIVE -> LEFT once; current group readers/joined list revoke on next request, places count only ACTIVE rows. Leave allowed after departure; rejoin still requires future/open/available. Same-key replay never removes a later rejoin or reactivates a departed membership; reread group after replay. Migration 20261028131000_companion_leave adds LEFT. Evidence: disposable PostgreSQL 29 PASS (3 new leave/rejoin/race + prior 26), 17 migrations/0 pending/cleanup PASS; group schema/HTTP boundary 2 PASS and prior focused 70 PASS; Prisma generation PASS, root types recorded by current runner; diff check PASS. FE/integration OPEN; no FE wait before TC-05.

### Bằng chứng FE và tích hợp TC-04 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp TC-04 (Tự rời nhóm & hoàn trả chỗ) đã hoàn tất trọn lát cắt dọc tại local:

1. **Client mutation (`companion-client.ts`):**
   - Hàm `leaveCompanionTrip(publicationId, idempotencyKey)` gửi mutation `{ confirm: true }` với `Idempotency-Key` tới `POST /api/trip-companions/:id/leave`.
   - Xử lý phân nhánh kết quả: `SUCCESS` chuyển tiếp; `UNKNOWN` giữ nguyên payload và key cho phép người dùng bấm "Thử lại rời nhóm"; `FAILED` hiển thị banner thông báo lỗi và sinh key mới cho lần thao tác tiếp theo.
2. **Giao diện rời nhóm & Modal giải thích hậu quả (`companion-group-view.tsx`):**
   - Chỉ hiển thị nút "Rời nhóm chuyến đi" đối với thành viên (`relationship === "MEMBER"`), hoàn toàn ẩn với chủ chuyến (`relationship === "HOST"`), ngăn chặn hành động rời không hợp lệ ngay từ giao diện.
   - Modal xác nhận rời nhóm (`data-testid="companion-confirm-leave-btn"`) giải thích chi tiết 3 hậu quả chính:
     - **Mất quyền truy cập:** Mất quyền xem lịch trình chi tiết và thảo luận nhóm.
     - **Hoàn trả chỗ:** 1 chỗ tìm thêm được trả lại cho chuyến đi nếu chuyến còn mở tuyển.
     - **Lưu trữ thảo luận:** Tin nhắn đã gửi trước đó vẫn được lưu trong lịch sử nhóm để bảo đảm tính toàn vẹn của cuộc trò chuyện.
   - Phục hồi trạng thái: Khi rời thành công, điều hướng về `/trip-companions/:id` (nơi Server Component đánh giá quan hệ thành `OUTSIDER`, hiển thị lại trang giới thiệu công khai mà không có dữ liệu lịch trình riêng, cho phép tham gia lại nếu còn chỗ và chưa khởi hành).
   - Khi bị thu hồi quyền (403), Server Component `/trip-companions/:id/group/page.tsx` tự động redirect về trang công khai `/trip-companions/:id`.
3. **Kiểm chứng tự động:**
   - Unit tests: `companion-group.vitest.test.ts` kiểm chứng hiển thị nút rời cho thành viên, ẩn nút cho chủ chuyến; `companion-client.vitest.test.ts` kiểm chứng mutation leave thành công.
   - PostgreSQL integration tests: `node scripts/test-trip-companions-postgres.mjs` chạy qua `companion-leave.postgres.integration.vitest.test.ts` (3 tests) cùng toàn bộ 10 file tích hợp khác — **11/11 files (50/50 tests) PASS**, 23 migrations applied, 0 pending, dọn dẹp container thành công.
   - Root typecheck: `npm run check-types` — **4/4 packages PASS**.
   - Production build: `npm run build --workspace web` — **53 static pages compiled successfully**.
   - Git diff: `git diff --check` — **0 whitespace/merge issues**.

[Story](../stories/TC-04-leave-return-place.md).


## TC-05 — BE READY FOR FE (2026-10-28)

Revision TC05-management-r1. GET/PATCH /api/trip-companions/:id/management owner-only. Shared companion-management-contract.ts exports companionManageInputSchema, companionManageSchema / CompanionManage; companion-management-fixtures.ts exports companionManageFixture. GET returns private tripId, current draft/Trip/imageOptions, visibility PUBLIC/WITHDRAWN, recruitmentOpen, managementRevision, activeMemberCount and canReopen. PATCH body is full CompanionDraft plus {confirm:true,baseRevision:number,visibility,recruitmentOpen}; key hash includes full validated payload and target. SUCCESS {publicationId,managementRevision}; reread GET after replay. Same group lock order; revision mismatch 409 COMPANION_REVISION_CONFLICT; capacity below ACTIVE count 409 COMPANION_CAPACITY_TOO_SMALL; invalid image 422. Re-publication/re-opening require future date and no manual completion. Close/withdraw never revoke members or create a new group. Additive optional recruitmentStatus on PublicCompanion: OPEN/FULL/CLOSED/DEPARTED/COMPLETED/WITHDRAWN; existing clients importing shared schema remain compatible, fixtures updated. Public collection/detail excludes withdrawn; closed/full public posts remain discoverable. DELTA to TC02 r1: /mine now includes own past/completed/withdrawn posts for management; /joined retains current groups across dates. Filters/cursor/envelopes unchanged. Migration 20261028132000_companion_recruitment adds visibility/recruitmentOpen/revision. Tests: PostgreSQL 32 PASS (3 new management/capacity-race/revision + 29 prior), 18 scoped migrations/0 pending/cleanup PASS; 49 focused schema/service/HTTP PASS; root types 4/4, Prisma generation and whitespace PASS. Development independently verified by configured endpoint plus SQL identity; scoped 03/04/05 migrations deployed using Prisma migrate deploy, 37 applied/0 pending/0 unfinished, 25 constraints/5 indexes/1 history guard trigger inspected. No Production or business-data write. Receipt .cache/trip-companions-be/development-migration.json (ignored, no credentials). Final build/integration remains separate while FE is active.

### Bằng chứng FE và tích hợp TC-05 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp TC-05 (Quản lý host: đóng/mở tuyển, gỡ/công khai lại, sửa số chỗ) đã hoàn tất trọn lát cắt dọc tại local:

1. **Client module & Mutation (`companion-client.ts`):**
   - Các hàm client `fetchCompanionManagement(publicationId)` và `updateCompanionManagement(publicationId, input, idempotencyKey)`.
   - Payload tuân thủ `companionManageInputSchema`: `{ title, introduction, additionalCapacity, imageMediaId, confirm: true, baseRevision, visibility, recruitmentOpen }`.
   - Xử lý phân nhánh kết quả: `SUCCESS` cập nhật local state và revision; `UNKNOWN` giữ nguyên payload và key cho phép người dùng bấm "Thử lại lưu thay đổi"; `FAILED` hiển thị banner giải thích lỗi cụ thể (`COMPANION_REVISION_CONFLICT` yêu cầu tải lại trang, `COMPANION_CAPACITY_TOO_SMALL` giải thích số chỗ không được nhỏ hơn số thành viên đang tham gia).
2. **Giao diện quản lý host (`companion-management-view.tsx` & `/trip-companions/[id]/manage`):**
   - Server Component `apps/web/src/app/trip-companions/[id]/manage/page.tsx` xác thực quyền chủ chuyến qua `getCompanionManagement`; chuyển hướng 401 về `/login?returnTo=...`, 403 về `/trip-companions/:id` nếu không phải chủ chuyến, 404 nếu không tìm thấy.
   - Banner phân định phạm vi rõ ràng: Nêu rõ đây là màn hình quản lý bài tuyển đồng hành; các thông tin ngày khởi hành, phương tiện và lịch trình chi tiết được liên kết trực tiếp sang `/trips/:tripId/edit`.
   - Ba thẻ trạng thái & hành động nhanh:
     - **Trạng thái bài đăng:** Badge "Công khai" vs "Đã gỡ bài"; nút chuyển đổi "Gỡ bài đăng" / "Công khai lại bài".
     - **Tiếp nhận thành viên:** Badge "Đang mở tuyển" vs "Đã đóng tuyển"; nút chuyển đổi "Đóng nhận người" / "Mở nhận người lại".
     - **Sức chứa & Thành viên:** Hiển thị số thành viên đã tham gia, số chỗ còn trống, phiên bản quản lý rev #, ghi chú chủ chuyến không chiếm chỗ.
     - Khi chuyến đi đã qua ngày khởi hành hoặc đã kết thúc (`!canReopen`), các nút mở tuyển/công khai lại bị vô hiệu hóa kèm thông báo giải thích từ server.
   - Form chỉnh sửa chi tiết:
     - Tiêu đề (1–200 ký tự kèm bộ đếm thời gian thực).
     - Số chỗ tìm thêm (bắt buộc >= số thành viên đang tham gia).
     - Lời giới thiệu (1–4000 ký tự kèm bộ đếm thời gian thực).
     - Lưới chọn ảnh đại diện từ danh sách ảnh điểm đến trong tuyến hoặc chọn không dùng ảnh.
3. **Điều hướng liên kết:**
   - Trong `companion-discovery-view.tsx`: Tại tab "Chuyến tôi đăng" (`tab=mine`), mỗi thẻ bài đăng có nút "Quản lý" dẫn trực tiếp tới `/trip-companions/:id/manage`; hiển thị badge `recruitmentStatus` trên ảnh thu nhỏ cho các trạng thái không phải OPEN (CLOSED, FULL, WITHDRAWN, DEPARTED, COMPLETED, CANCELED).
   - Trong `companion-group-view.tsx`: Bổ sung nút "Quản lý tuyển" cho Host tại action bar của header nhóm.
4. **Kiểm chứng tự động:**
   - Unit tests: `companion-management.vitest.test.ts` (4 tests) PASS; `companion-client.vitest.test.ts` (29 tests) PASS.
   - Focused Vitest: 13 files / 151 passed, 58 skipped.
   - PostgreSQL integration runner: `node scripts/test-trip-companions-postgres.mjs` chạy qua `companion-management.postgres.integration.vitest.test.ts` cùng toàn bộ 10 file tích hợp khác — **11/11 files (50/50 tests) PASS**, 23 migrations, 0 pending, dọn dẹp container thành công.
   - Root typecheck: `npm run check-types` — **4/4 packages PASS**.
   - Production build: `npm run build --workspace web` — **Compiled successfully, 53 static pages prerendered**, route `/trip-companions/[id]/manage` và route handler `/api/trip-companions/[id]/management` nhận diện đầy đủ.
   - Git diff: `git diff --check` — **0 whitespace/merge issues**.

[Story](../stories/TC-05-manage-recruitment-capacity.md).


## TC-06 — BE READY FOR FE (2026-10-28)

Revision TC06-members-r1. GET /api/trip-companions/:id/members returns companionMembersSchema / CompanionMembers from companion-members-contract.ts, fixture companionMembersFixture. It contains host and current ACTIVE members only, with group-safe userId/displayName/avatar and joinedAt; no email/contact/account status. Current host/member required; outsider/foreign Admin/left/barred/locked denied. POST /api/trip-companions/:id/members/:userId/ban uses {confirm:true}, target path ID, Idempotency-Key; result {publicationId}. Service getCompanionMembers/banCompanionMember in companion-members-service.ts. Host-only permanent BANNED on existing relationship (including a previously LEFT relation), no unban route; host target 409, missing relation 404. Join checks BANNED both before replay and after row locks, so an original successful join key cannot bypass removal. Capacity counts ACTIVE only, removal returns place once; current group/member readers deny the barred account. Other members retain access and relation/history never deleted. Migration 20261028133000_companion_ban adds state. PostgreSQL 35 PASS (3 new ban/rejoin-race/authorization + 32 earlier), 19 scoped migrations/0 pending/cleanup PASS; root typecheck 4/4, schema/HTTP fixture suite 4 PASS, Prisma generation PASS. Global diff check detected trailing EOF blank lines in concurrently edited FE client/test files; BE leaves those files untouched and records combined whitespace OPEN until FE resolves. Development rollout uses independently verified target and scoped Prisma deploy (current ledger in ignored receipt). No Production or business-data mutations. FE/integration OPEN.

### Bằng chứng FE và tích hợp TC-06 (Hoàn tất 2026-10-28)

FE và kiểm chứng tích hợp TC-06 (Danh sách thành viên & Host loại/chặn thành viên) đã hoàn tất trọn lát cắt dọc tại local:

1. **Client module & Mutation (`companion-client.ts`):**
   - Thêm `fetchCompanionMembers(publicationId)` đọc `GET /api/trip-companions/:id/members`, parse theo `companionMembersSchema`.
   - Thêm `banCompanionMember(publicationId, userId, idempotencyKey)` gửi mutation tới `POST /api/trip-companions/:id/members/:userId/ban` với body `{ confirm: true }` và header `Idempotency-Key`.
   - Xử lý phân nhánh kết quả: `SUCCESS` cập nhật local state; `UNKNOWN` giữ nguyên payload và key cho phép người dùng bấm "Thử lại loại thành viên"; `FAILED` hiển thị banner giải thích lỗi cụ thể.
2. **Giao diện không gian nhóm (`companion-group-view.tsx` & `/trip-companions/[id]/group`):**
   - Server Component prefetch `initialMembers` qua `getCompanionMembers` để render tức thì danh sách thành viên trên trang `/trip-companions/:id/group`.
   - Tab **Thành viên**:
     - Thẻ chủ chuyến hiển thị huy hiệu "Chủ chuyến", tên, avatar đại diện.
     - Danh sách thành viên tham gia (`companion-member-list`): hiển thị tên, avatar, ngày tham gia (`Tham gia: dd/mm/yyyy`).
     - Nút "Loại khỏi nhóm" (`companion-ban-button`) chỉ hiển thị cho Chủ chuyến trên thẻ của thành viên (hoàn toàn không hiển thị trên thẻ chủ chuyến).
     - Thành viên thông thường chỉ thấy danh sách và nút "Rời nhóm chuyến đi", không thấy nút loại/chặn.
     - Modal xác nhận loại thành viên (`companion-ban-modal`): giải thích minh bạch 3 hậu quả (chặn vĩnh viễn không thể xin vào lại, hoàn trả 1 chỗ tìm thêm, bảo toàn lịch sử tin nhắn đã gửi).
     - Hỗ trợ nút "Thử lại loại thành viên" khi gặp `UNKNOWN` với cùng idempotency key.
     - Cập nhật số lượng thành viên tức thì khi hoàn tất loại thành viên.
3. **Kiểm chứng tự động:**
   - Unit tests: `companion-group.vitest.test.ts` (6 tests) PASS; `companion-client.vitest.test.ts` (33 tests) PASS.
   - Focused Vitest: 11 files / 136 passed, 58 skipped.
   - PostgreSQL disposable integration runner: `node scripts/test-trip-companions-postgres.mjs` chạy qua `companion-ban.postgres.integration.vitest.test.ts` cùng toàn bộ 10 file tích hợp khác — **11/11 files (58/58 tests) PASS**, 23 migrations applied, 0 pending, dọn dẹp container thành công.
   - Root typecheck: `npm run check-types` — **4/4 packages PASS**.
   - Production build: `npm run build --workspace web` — **Compiled successfully, 53 static/dynamic pages prerendered**.
   - Git diff: `git diff --check` — **0 whitespace/merge issues**.

[Story](../stories/TC-06-remove-ban-member.md).


## TC-07 — BE READY FOR FE (2026-10-28)

Revision TC07-chat-r1. GET/POST /api/trip-companions/:id/messages. POST strict body {text:string}, trimmed 1–4000 chars (technical bound), Idempotency-Key; result {publicationId,messageId,sequence:string}. Authorship from current trusted session; body author/kind rejected. Shared companion-chat-contract.ts exports send/message/result/history/query schemas and CompanionMessage/CompanionHistory; companion-chat-fixtures.ts has client-safe message/history examples. GET query before (exclusive decimal bigint string) and limit raw string 1–100/default30; response {publicationId,items,olderCursor,highWaterCursor,canSend}. Page messages are ascending for rendering; request olderCursor as before to fetch prior history. New members can read all prior pages; current group permission/account required each request and before send replay. Text/links remain plain strings, render as escaped text and safe HTTP(S) links in FE, never HTML. Public APIs have no chat projection. Ordering proof: every sender holds Trip then publication UPDATE locks until commit, increments transactional per-group bigint counter and inserts message/result in same transaction. A later sender cannot allocate/commit a higher position until prior transaction commits/rolls back. RepeatableRead history reads committed counter and messages <= that cut. Thus commit-late writes cannot appear behind a consumed cursor; timestamps/cuid are not ordering. Rollback consumes no committed sequence. SAME payload/key replay yields same IDs/sequence; UNKNOWN retains exact payload/key. PostgreSQL 39 PASS (4 new chat concurrency/history/replay/lost-ack/rollback/held-commit cases + prior35), 20 scoped migrations/0 pending/cleanup PASS; schema/HTTP/Trip regression 22 PASS after fixing regex-to-BigInt parser pipeline (invalid decimals now fail validation, no exception). Prisma generation and root types recorded by runner. Migration 20261028134000_companion_chat adds counter/messages/constraints and extends service/DB deletion guard to retained host-only messages; no TTL. Development scoped rollout verified by endpoint+SQL identity; current redacted ledger receipt in .cache/trip-companions-be. FE/integration OPEN; final broad build remains separate.

### Bằng chứng FE và tích hợp dọc (2026-10-28)

- **Triển khai Frontend:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: Thêm `fetchCompanionMessages(publicationId, query)` và `sendCompanionMessage(publicationId, text, idempotencyKey)` qua `sendIdempotentMutation`.
  - `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Prefetch `initialHistory` server-side với `getCompanionHistory(reqHeaders, id, {}, tripReadDependencies)`.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Tab "Trò chuyện nhóm" (`tab=chat`, testid `group-tab-chat`, icon `MessageSquare`).
    - Transcript render: author name, avatar initial, timestamp `formatMessageTimeVi`, bubble, an toàn link qua `renderSafeMessageContent` (`target="_blank"`, `rel="noopener noreferrer"`, không HTML injection).
    - Phân loại tin nhắn hệ thống (`kind === "SYSTEM"`): `ITINERARY_CHANGED` với nút hành động "Xem lịch trình chi tiết", `COMPANION_CANCELED`.
    - Phân trang `olderCursor` ("Tải tin nhắn cũ hơn").
    - Composer input + send button với auto idempotency key; xử lý `UNKNOWN` an toàn với nút retry cùng key và text.
    - Banner chỉ đọc (`data-testid="companion-chat-readonly-banner"`) và ẩn composer khi `canSend === false`.
  - `apps/web/src/app/trip-companions/companion.css`: Toàn bộ styles responsive cho chat layout, bubble, link, avatar, system pill, older button, read-only banner, composer.
- **Kiểm chứng:**
  - `companion-client.vitest.test.ts`: 37 tests PASS.
  - `companion-group.vitest.test.ts`: 11 tests PASS.
  - Vitest focused suite: 6 files / 80 tests PASS.
  - PostgreSQL integration suite: 11 files / 58 tests PASS (gồm 4 test PostgreSQL chat concurrency/replay/history/ordering).
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

[Story](../stories/TC-07-group-text-chat-history.md).


## TC-08 — BE READY FOR FE (2026-10-28)

Revision TC08-delta-r1. GET /api/trip-companions/:id/messages/delta accepts after decimal sequence (default0), raw limit1–100/default100. Shared companionDeltaQuerySchema/companionDeltaSchema, type CompanionDelta, fixture companionDeltaFixture. Result {publicationId,items,nextCursor,highWaterCursor,hasMore,canSend,relationship}. Items ascending; advance only nextCursor (last delivered), never highWaterCursor when hasMore=true. Same committed sequence/RepeatableRead/auth boundary as history; old cursor grants no access after leave/ban/lock. Poll about3s only for visible current group, refresh on return, dedup by message ID/sequence, preserve scroll and reject late actor/group responses in FE; no BE timers or new provider. POST /api/trip-companions/:id/messages/reconcile takes identical send text body and Idempotency-Key, checks current membership and actor/publication/payload hash in shared replay store without writing. Confirmed => original SUCCESS IDs/sequence; changed key payload => FAILED409; absent/in-flight/unavailable/corrupt result => UNKNOWN503 retryWithSameKey, then retry original send with identical body/key. Never synthesize success or use a new key on reconnect. PostgreSQL 41 PASS (2 delta/reconciliation/current permission tests + earlier39), unchanged20 migrations/0 pending/cleanup PASS; chat schema suite3 PASS. Typecheck found ES2017 target incompatibility with BigInt literals introduced in TC07; replaced literals by exact BigInt constructors, preserving bigint strings and semantics. Root typecheck rerun/final broad check pending, not called PASS early. No migration for TC08; Development already has chat schema (39 applied/0 pending/unfinished). FE/browser/timer/integration evidence remains OPEN.

### Bằng chứng FE và tích hợp dọc (2026-10-28)

- **Triển khai Frontend:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: Thêm `fetchCompanionDelta(publicationId, after, limit)` và `reconcileCompanionMessage(publicationId, text, idempotencyKey)`.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Chu kỳ polling ~3s (`pollDelta`) chỉ khi `activeTab === "chat"`.
    - Dừng polling khi `document.visibilityState === "hidden"`; làm mới tức thì khi mở lại tab hoặc khi thiết bị kết nối mạng lại (`online`).
    - Tiến bộ cursor đơn điệu (`lastDeliveredCursorRef`) theo `delta.nextCursor`.
    - Hợp nhất và lọc trùng tin nhắn (deduplication) theo `id` / `sequence`, bảo toàn thứ tự thời gian.
    - Cuộn thông minh: tự động theo tin mới nếu ở gần đáy trang (<120px), giữ vị trí cuộn nếu đang đọc tin cũ.
    - Đối soát & phục hồi mất kết nối: khi gặp trạng thái `UNKNOWN`, nút "Đối soát" (`companion-chat-reconcile-btn`) gọi `reconcileCompanionMessage` để xác nhận tin mà không ghi trùng.
  - `apps/web/src/app/trip-companions/companion.css`: Bổ sung styles cho `.companion-chat-reconcile-btn`.
- **Kiểm chứng:**
  - `companion-client.vitest.test.ts`: 41 tests PASS.
  - `companion-group.vitest.test.ts`: 12 tests PASS.
  - Vitest focused suite: 6 files / 85 tests PASS.
  - PostgreSQL integration suite: 11 files / 58 tests PASS (gồm 2 test PostgreSQL delta & reconciliation).
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

[Story](../stories/TC-08-polling-reconnect-recovery.md).


## TC-09 — BE READY FOR FE (2026-10-28)

Revision TC09-unread-r1. POST /api/trip-companions/:id/read strict {sequence:decimal-string} + Idempotency-Key; shared companionReadInputSchema/companionReadResultSchema. Result {publicationId,sequence} is monotonic at commit; stale successful replay does not rewind stored cursor, FE merges monotonically/refetches summary. Current host/member checked before replay and again after account/Trip/publication locks. Sequence0 allowed; positive cursor must exist committed in this group and cannot exceed messageSequence. GET /api/trip-companions/unread uses after publication-ID and raw limit1–50/default50, stable ID keyset; companionUnreadQuerySchema/companionUnreadSchema / CompanionUnread, fixture companionUnreadFixture. Summary items {publicationId,unreadCount,lastReadCursor,highWaterCursor,canSend}, nextCursor. Counts only actual messages above own marker, excluding own USER sends; independent actor scopes include host/current members across dates. GET never writes markers. Only explicitly displayed messages should be marked by FE; current membership/account enforcement removes left/barred/locked/private account data on next request; no public read-receipt API. PostgreSQL43 PASS (2 new marker/concurrency/permission tests + earlier41),21 migrations/0 pending/cleanup PASS; chat/read schema4 PASS; generation PASS. BigInt constructors retain exact values under existing ES2017 target; root typecheck result in runner/final receipt. Development independently verified and marker migration deployed through Prisma with scoped pending check, current receipt under .cache/trip-companions-be. FE badge/timer/browser integration OPEN.

### Bằng chứng FE và tích hợp dọc (2026-10-28)

- **Triển khai Frontend:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`: Thêm `fetchCompanionUnread(query)` và `markCompanionRead(publicationId, sequence, idempotencyKey)`.
  - `apps/web/src/components/trip-companions/companion-discovery-view.tsx`:
    - Chu kỳ polling unread ~15s khi trang hiển thị (`visible`) và tự động đồng bộ khi `visibilitychange` hoặc `online`.
    - Hiển thị badge `.companion-unread-badge` (`data-testid="companion-unread-badge-{id}"`) với số tin chưa đọc trên card có tin mới.
    - Nút CTA chuyển trực tiếp vào tab chat (`/trip-companions/{id}/group?tab=chat`) khi có tin chưa đọc.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Chỉ đánh dấu đã đọc (`markCompanionRead`) một cách đơn điệu cho các tin nhắn thực sự hiển thị trên giao diện khi đang ở tab chat (`activeTab === "chat"`).
    - Khi ở các tab khác (lịch trình / thành viên), định kỳ kiểm tra tin chưa đọc (`fetchCompanionUnread`) mà không ghi marker; hiển thị badge tròn `.companion-tab-unread-pill` (`data-testid="group-chat-unread-badge"`) trên nút tab "Trò chuyện nhóm". Chuyển sang tab chat sẽ xóa badge và cập nhật marker.
  - `apps/web/src/app/trip-companions/[id]/group/page.tsx`: Hỗ trợ `searchParams.tab` (`initialTab="chat"`).
  - `apps/web/src/app/trip-companions/companion.css`: Thêm styling cho `.companion-unread-badge` và `.companion-tab-unread-pill`.
- **Kiểm chứng:**
  - `companion-client.vitest.test.ts`: 46 tests PASS (thêm 5 test mới cho unread/read).
  - `companion-group.vitest.test.ts`: 13 tests PASS.
  - `companion-discovery.vitest.test.ts`: 8 tests PASS.
  - Vitest focused suite: 11 files / 156 tests PASS.
  - PostgreSQL disposable integration suite: 11 files / 58 tests PASS (bao gồm 3 test unread/read marker).
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

[Story](../stories/TC-09-unread-return-to-group.md).


## TC-10 — BE READY FOR FE (2026-10-28)

Revision TC10-notice-r1. Existing confirmed applyEdit persistence seam now calls recordCompanionItineraryChange from companion-itinerary-notice.ts inside the same Trip CAS/itinerary/idempotency transaction, after final day/visit writes. Source audit found this is the authoritative existing-trip MANUAL/AI/IN_TRIP write seam; new Trip Save has no publication yet, completion only updates its own timestamp. Current editor intentionally keeps Trip date/duration/transport immutable; this ticket does not add a metadata-edit bypass. Semantic comparison ignores regenerated visit IDs and checks dates/destinations/time-duration: unchanged content, preview, canceled/unconfirmed or FAILED proposals create no notice. Publication itineraryRevision and shared messageSequence increment atomically with SYSTEM message, so rollback/replay cannot leave a new schedule without its notice or duplicate it. Existing owner, Validator, explicit confirmation and completed-visit checks remain intact. No new UI endpoint; history/delta now accept additive SYSTEM union {author:null,notice:{type:ITINERARY_CHANGED,revision,changes:{dates,destinations,times}}}; text is generic and omits contact/AI/hidden destination names. Group reader adds optional itineraryRevision; unread includes SYSTEM notices for host/member. Shared companionSystemNoticeSchema and CompanionMessage union remain client-safe; FE must branch by kind and reread /group for latest itinerary. Migration 20261028140000_companion_itinerary_revision adds revision, SYSTEM kind, nullable author and notice/authorship constraint. Evidence: PostgreSQL46 PASS (3 actual confirmed MANUAL/IN_TRIP/no-op/rollback/replay cases + earlier43),22 scoped migrations/0 pending/cleanup PASS; affected apply-edit/US32/US33/US37/schema regression65 PASS. Strict backend source typecheck separated from stale concurrent Next generated artifacts; final combined build/root check still OPEN. Development scoped migration deploy verified separately; no Production/provider/FE changes.

### Bằng chứng FE và tích hợp dọc (2026-10-28)

- **Triển khai Frontend:**
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Quản lý trạng thái `currentGroup` linh hoạt và tự động cập nhật khi có thay đổi lịch trình.
    - Hiển thị pill tin nhắn hệ thống (`.companion-chat-msg-system`, `.companion-chat-system-pill`) phân biệt rõ rệt với tin nhắn người dùng.
    - Đối với thông báo `ITINERARY_CHANGED`: trích xuất `notice.changes` để hiển thị các tag cụ thể (`.companion-notice-tag`: Đổi ngày, Đổi điểm, Đổi giờ) và nút "Xem lịch trình chi tiết" (`data-testid="companion-chat-view-itinerary-btn"`).
    - Khi người dùng nhấn nút "Xem lịch trình chi tiết" hoặc nhận tin delta có thông báo thay đổi lịch trình, ứng dụng tự động gọi `fetchCompanionGroup(group.publicationId)` để nạp lại toàn bộ lịch trình mới nhất và cập nhật `itineraryRevision` mà không cần reload trang.
    - Trên tab Lịch trình, hiển thị badge phiên bản lịch chính thức `(Bản cập nhật #{revision})`.
  - `apps/web/src/app/trip-companions/companion.css`: Bổ sung styles cho `.companion-chat-notice-actions`, `.companion-chat-notice-tags`, `.companion-notice-tag`.
- **Kiểm chứng:**
  - `companion-group.vitest.test.ts`: 14 tests PASS (kiểm tra đầy đủ system message, notice action button, notice tags và revision badge).
  - Vitest focused suite: 11 files / 157 tests PASS.
  - PostgreSQL disposable integration suite: 11 files / 58 tests PASS (bao gồm 4 test trong `companion-notice.postgres.integration.vitest.test.ts`).
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

[Story](../stories/TC-10-saved-itinerary-change-notices.md).


## TC-11 — BE READY FOR FE (2026-10-28)

Revision TC11-cancel-r1. POST /api/trip-companions/:id/cancel accepts only {confirm:true} and Idempotency-Key, returns shared {publicationId}; cancelCompanion service is owner-only with current account/ownership checks before replay and under the same Trip/publication locks as join/send. Terminal canceledAt, recruitment stop, one SYSTEM COMPANION_CANCELED notice, sequence increment and replay result commit atomically. Same/different-key repeats never duplicate notice. No undo or transfer endpoint; database terminal-state trigger rejects clearing/changing canceledAt. Group/management adds optional canceledAt and canSend; history/delta/unread canSend=false after cancel, current valid relations retain history/latest saved itinerary; later authoritative Trip saves may still append SYSTEM notices. USER send/reconcile recheck cancellation before replay and after locks; join/public discovery/detail cannot admit canceled posts. /mine returns CANCELED label. Host removal still revokes members after cancellation; delete history guard persists. Calendar/manual completion alone never gates chat or adds TTL. Client-safe canceled-group/system-message fixtures exported; companionManageResultSchema added for PATCH result. PostgreSQL58 PASS in11 suites, including cancel/join/send race, rollback/replay, terminal DB guard, latest itinerary notice after cancel, normal chat years after completion, observed user/SYSTEM late-commit ordering and account/date/clock/completion lock waits. 23 actual scoped migrations/0 pending/cleanup PASS. Strict backend types PASS (63 entries, unchanged strict ES2017 target); focused fixtures/Trip regressions pass. Development independently verified and final migration applied through guarded Prisma deploy:42 applied/0 pending/0 unfinished,50 constraints/9 indexes/2 companion triggers inspected. No business-data/Production/provider write, FE code modification or application release. Broad regression and combined build results/limits are in final verification receipt; vertical FE/browser acceptance remains separate.

### TC-11 Frontend & Vertical Integration Receipt (2026-10-28)

- **Trạng thái:** IMPLEMENTED LOCALLY, VERIFIED.
- **Triển khai:**
  - `apps/web/src/modules/trip-companions/companion-client.ts`:
    - Bổ sung client function `cancelCompanionTrip(publicationId, idempotencyKey)` gọi `POST /api/trip-companions/:id/cancel` với `{ confirm: true }` và `Idempotency-Key`.
    - Xử lý trọn vẹn hợp đồng `SUCCESS`, `UNKNOWN`, `FAILED` và retry idempotency.
    - 2 unit tests trong `companion-client.vitest.test.ts` (48 client tests PASS).
  - `apps/web/src/app/trip-companions/companion.css`: Bổ sung styles `.companion-danger-zone` và sử dụng `.companion-danger-button`.
  - `apps/web/src/components/trip-companions/companion-management-view.tsx`:
    - Bổ sung vùng nguy hiểm (Danger Zone) với nút "Hủy chuyến đồng hành" (`data-testid="companion-open-cancel-modal-btn"`).
    - Hộp thoại xác nhận hủy chuyến với cảnh báo chi tiết các hệ quả (đóng tuyển vĩnh viễn, gỡ bài công khai, chat chỉ đọc, không thể hoàn tác) cùng nút "Xác nhận hủy chuyến" (`data-testid="companion-confirm-cancel-btn"`).
    - Khi chuyến đã hủy (`management.canceledAt` có giá trị), hiển thị banner cảnh báo hủy có ngày giờ (`data-testid="companion-management-canceled-banner"`), khóa toàn bộ các trường nhập liệu và nút chuyển trạng thái/lưu thay đổi, ẩn nút hủy trong danger zone.
    - 2 unit tests trong `companion-management.vitest.test.ts`.
  - `apps/web/src/components/trip-companions/companion-group-view.tsx`:
    - Khi chuyến đã hủy (`currentGroup.canceledAt`), hiển thị banner cảnh báo lưu trữ chỉ đọc (`data-testid="companion-group-canceled-banner"`).
    - Khi chuyến đi hoàn tất theo lịch trình ngày tháng mà không bị hủy, hiển thị banner giải thích nhóm vẫn hoạt động bình thường (`data-testid="companion-group-completed-banner"`).
    - Delta polling khi nhận thông báo `COMPANION_CANCELED` tự động nạp lại `currentGroup` để chuyển UI sang chế độ chỉ đọc mượt mà.
    - Chat composer tự động chuyển sang chế độ chỉ đọc `companion-chat-readonly-banner` khi `!canSend`.
    - 2 unit tests trong `companion-group.vitest.test.ts`.
- **Kiểm chứng:**
  - Vitest focused suite: 11 files / 163 tests PASS.
  - PostgreSQL disposable integration suite (`apps/web/scripts/test-trip-companions-postgres.mjs`): 11 files / 58 tests PASS (bao gồm các test hủy chuyến, race condition, retained history trong `companion-cancel.postgres.integration.vitest.test.ts`), 23 migrations, 0 pending, dọn dẹp container thành công.
  - Root typecheck (`npm run check-types`): 4/4 packages PASS.
  - Web production build (`npm run build --workspace web`): 53 routes compiled cleanly.
  - `git diff --check`: 0 errors.

[Story](../stories/TC-11-cancel-retain-group-lifecycle.md).


## Final backend scope receipt — 2026-10-28

**BE COMPLETE / READY FOR FE THROUGH TC-11.** [Final verification](trip-companions-backend-verification.md) supersedes earlier pending checks/rollout notes without rewriting their historical evidence. Final PostgreSQL58/58; focused340 PASS/59 opt-in skips; idempotency4/4; strict BE types63 and root4/4; production build53/53; localhost HTTP13/13; tracked/new-file whitespace/link/secret/scope PASS. Development42 applied/0 pending/0 unfinished,50 constraints/9 indexes/2 triggers; no Production operation. Full wider run retains five failures in unchanged HEAD baseline source/tests, explicitly listed in verification.

Final additive contract deltas: companionManageResultSchema/CompanionManageResult validates PATCH result; SYSTEM message fixtures companionSystemMessageFixture/companionCanceledMessageFixture and companionCanceledGroupFixture are exported. Own revoked image fallback does not block close/withdraw; only a newly chosen invalid image is rejected. Calendar completion status uses trip end date while chat remains unlimited. Transactional reauthorization also rejects changed actor identity. Unread aggregation uses one bounded SQL aggregate under the same snapshot rather than a per-group query loop. Dev singleton revision complete-v3 was bumped after final Prisma generation to remove stale canceledAt runtime metadata; HTTP discovery then passed.

FE keeps all pages/components/client adapters, browser multi-actor/visibility/reconnect/UNKNOWN checks, safe link rendering and final owner acceptance. Existing milestone0/TC-02–04 FE receipts above remain intact; FE may continue available later contracts. Backend handoff is complete without dispatching or messaging another chat.


### Final source recheck after authorization hardening

The authoritative applyEdit transaction now takes User FOR SHARE before role/status reauthorization, matching the account -> Trip -> publication writer lock order. Reran PostgreSQL58/58 and strict BE types63 PASS. Latest combined focused run includes newly added concurrent FE management tests:35 files/344 PASS,59 opt-in skips. Final production build (including cache revision complete-v3) PASS,53/53 pages. Prior340-test receipts describe their earlier snapshots. Whitespace/source boundaries remain checked; FE05 local receipt preserved. No server blocker remains in this task scope.

## FE code-review correction — 2026-10-28

Theo yêu cầu sửa bảy finding, FE hiện giữ management/chat attempts bất biến qua pending/UNKNOWN, không đổi recruitment/visibility trước SUCCESS, xử lý mất quyền/session switch bằng unmount private state và bỏ response muộn. Public page truyền recruitmentStatus thật; lịch Việt Nam chỉ là fallback khi không có status. Delivery cursor không đi theo own-send ack; transcript merge/dedup/sort theo sequence, read marker theo phần hiển thị trong viewport khi trang visible và không vượt delivery cut.

[Bằng chứng sửa lỗi](trip-companions-review-fixes.md): 14 test tương tác ban đầu FAIL trước sửa, suite cuối **19/19 PASS**; focused **190 PASS/58 DB skips**, isolated production build **PASS** (Next16.3.8, TypeScript và53/53 trang), whitespace PASS. Backend/API/shared DTO/schema/migration không đổi (73 file so với snapshot review); 58/58 PostgreSQL receipt trong review là lần chạy riêng trước đó, không phải lượt DB mới của sửa FE này. Giữ phần visual/timeline/map đồng thời; formatter nullable được sửa để build đúng kiểu, không tắt kiểm tra.

Browser verification bị Computer Use dừng vì không xác định chắc URL trên Windows. Không nhận authenticated browser/visual hoặc owner acceptance từ các test fixture; không thao tác DB Development/Production hoặc application release. Các story TC-03/05/07/08/09 có follow-up liên kết evidence này.

# Tìm bạn đồng hành — hợp đồng bàn giao BE/FE

Ngày: 2026-10-28. Trạng thái: **TC-01 BE + FE + INTEGRATION IMPLEMENTED LOCALLY**. Người dùng duyệt nguyên bộ 11 ticket và blocking edges. Mục TC-01 dưới đây ghi API/schema/migration thực cùng bằng chứng FE và kiểm chứng tích hợp; các ticket khác chưa triển khai. TC-01 đã hoàn tất trọn lát cắt dọc tại local, sẵn sàng nghiệm thu trước khi mở khóa TC-02.

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

Một ticket chỉ được bắt đầu khi blocker hoàn tất trọn lát cắt. Prompt cũ trong `prompts/` chọn một ticket mỗi lần; [kế hoạch hai task toàn phạm vi](trip-companions-completion-plan.md) mới có [task BE](tasks/trip-companions-backend.md) và [task FE](tasks/trip-companions-frontend.md) đi qua toàn bộ phần còn lại theo từng mốc. Cả hai cách đều cập nhật evidence từng vai trò và giữ gate BE contract → FE → tích hợp trước dependency kế tiếp; không tự chuyển toàn bộ ticket thành DONE sau phần BE. Hai task mới mới được soạn, chưa bắt đầu code.

## Sổ bằng chứng

| Ticket | BE | FE | Tích hợp |
| --- | --- | --- | --- |
| TC-01 | IMPLEMENTED LOCALLY; evidence below | IMPLEMENTED LOCALLY; evidence below | VERIFIED (Vitest + Postgres + Build) |
| TC-02 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-03 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-04 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-05 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-06 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-07 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-08 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-09 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-10 | NOT STARTED | NOT STARTED | NOT RUN |
| TC-11 | NOT STARTED | NOT STARTED | NOT RUN |

Các phần BE/FE/tích hợp của TC-02–11 vẫn NOT STARTED/NOT RUN. Không dùng phần BE TC-01 để tuyên bố hoàn tất toàn tính năng.

## TC-01 — contract thực, 2026-10-28

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

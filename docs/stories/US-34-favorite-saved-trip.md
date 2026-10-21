# US-34 — Yêu thích Saved Trip

## Status

HISTORICAL DRAFT — superseded by [US-34 implementation and current evidence](US-34-trip-favorite.md#current-task--2026-10-21). The current repository already has TRIP schema/API/ownership; the original dependency assumptions below describe an earlier snapshot. Current user request restores list/detail actions and three Favorites groups. Do not treat the old Admin403 or absent-schema assumptions below as current behavior.

## Epic

Quản lý chuyến đi đã lưu — Sprint 4.

## Owner

Đào Duy Bình; phối hợp Thai Anh Nguyen cho Trip và dev phụ trách Favorite hiện có (cần xác nhận tên).

## Goal / User Story

Là Du khách, tôi muốn thêm/bỏ yêu thích một chuyến đi đã lưu của mình, để tìm lại chuyến đi thuận tiện mà không tạo bản sao hoặc thay đổi quyền sở hữu.

## Outcome

Contract DRAFT mở rộng Favorite sang owned Saved Trip, task 278–280. Không phải tính năng tạo/lưu Trip.

## Source References

- [Product contract](../product/product-spec.md#favorites-and-saved-trips): Favorites and saved trips; Edit, save, and in-trip support; Roles and access; Write semantics and recovery.
- [User flows](../flow/user-flow.md#favorite): Favorite; Save trip; Write recovery.
- [ADR-08/09/10](../decisions.md), backlog Bình ngày 2026-10-15 và [US-32 Open Questions](US-32-manual-itinerary-edit.md#open-questions).
- DOCX/Figma/requirement IDs chi tiết chưa đối chiếu; chỉ dùng nguồn đã có và scope người dùng nêu.

## Dependencies

- **Trip của Thai Anh:** US-30 task 252/253 và US-31 task 257/259/260 cung cấp model, owned read, saved trip/list/detail; chưa có tại P0. Không favorite một candidate chưa lưu.
- **Favorite hiện có:** `packages/db/prisma/schema/favorite.prisma` chỉ có DESTINATION/CULTURE_CONTENT, chưa có Trip FK/enum. `modules/favorites` xử lý target add/remove/status; `modules/favorite` xử lý list/remove theo favoriteId. Cần phối hợp cả hai, không gộp/refactor ngoài scope.
- `favoriteListSchema` ở `modules/favorite/favorite-contract.ts` là strict `{ destinations, cultureContents }`, chưa có trips. Mở rộng phải đồng bộ client/API/tests.
- **Validator của Thai Anh / Planner của Hoài:** chỉ là dependency gián tiếp của việc lưu Trip ban đầu US-30. Thao tác favorite không chạy lại Planner/Validator và không sửa itinerary.

## In Scope

- Mở rộng target/quan hệ/contract cần thiết cho favorite owned Saved Trip, uniqueness và list/status.
- UI thao tác favorite/unfavorite với pending và kết quả ghi xác nhận.

## Out of Scope

- Tạo/copy/edit Trip, chuyển ownership/chia sẻ, chạy lại Validator, xóa Trip hoặc quyết định lifecycle xóa Trip thay owner.
- Refactor hai Favorite module hoặc sửa các target Destination/Culture ngoài phần cần tích hợp.

## Task Breakdown

| ID | Tên task |
| --- | --- |
| 278 | [BE/API] mở rộng Favorite |
| 279 | [FE] thao tác Yêu thích |
| 280 | [TEST] |

## Business Rules

- Favorite Trip là liên kết đến chuyến đã lưu thuộc Traveler; không là bản sao, save hay trao quyền truy cập.
- Không trùng favorite cho cùng user và Trip. Unfavorite không xóa/sửa Trip hoặc itinerary.
- UI chỉ đổi trạng thái yêu thích đã xác nhận khi DB trả SUCCESS; UNKNOWN giữ payload/key cũ để retry.
- Hidden content không trở thành public qua favorites. Policy chi tiết điểm đến cũ bị ẩn trong Trip tham chiếu OQ-B, không tự xóa favorite vì một destination thay visibility.
- FK Favorite → Trip chưa chốt Restrict/Cascade; không chọn trong docs hoặc tự tạo migration. Core có dùng thời gian phải nhận `now`, theo Asia/Ho_Chi_Minh.

## Roles / Authorization

Chỉ Traveler, `requireTraveler` trước đọc body; Guest 401/Admin 403. Route Handler mỏng, service thực hiện ownership; private `Cache-Control: private, no-store` trên mọi response. Không tự replay mutation sau login.

## Ownership Rules

Query Trip `WHERE id AND userId` từ session; missing/foreign cùng 404 cho add/status theo contract cần chốt. Mutation recheck actor/ownership trong transaction; remove favorite phải ràng `userId`, không nhận actorId từ body. Chính sách unfavorite sau Trip bị xóa phụ thuộc FK và recovery contract, không tự suy ra.

## UX / UI Contract

Đề xuất thao tác ở Trip surface đã lưu do US-31 cung cấp; vị trí cụ thể cần phối hợp dev đó và Figma. Có pending/double-click lock, confirmed favorite state, FAILED/UNKNOWN/retry, auth/unavailable states; không dùng optimistic success. Task này không tự sửa list/detail Trip khi chưa có handoff/authorization riêng. Link mới theo typedRoutes.

## Data Contract

**Đề xuất:** thêm URL target `trips`, Prisma target `TRIP`/FK `tripId`, list field `trips`; tên chính xác và shape cần đồng thuận với Favorite owner. Reuse result `{ targetType, targetId, isFavorite, changed }` và item `{ favoriteId, targetId, title, availability, href }` nếu phù hợp. Không expose Trip người khác hay private itinerary trong list DTO. Unique user/Trip và target/FK consistency phải được DB bảo vệ, SQL chờ review.

## API Contract

Đề xuất mở rộng endpoint có sẵn, **chưa hỗ trợ `trips` hiện tại**:

- `PUT /api/favorites/trips/[targetId]`, `DELETE /api/favorites/trips/[targetId]` + `Idempotency-Key`: add/remove, giữ HTTP method của route hiện có; shared mutation response.
- `GET /api/favorites/status?targetType=trips&targetId=...`: trạng thái owned target, generic envelope.
- `GET /api/favorites`: bổ sung nhóm trips theo contract list đã thống nhất; giữ Destination/Culture tương thích có kiểm thử.

Auth/cache/error dùng shared convention; 404 giống nhau cho không tồn tại/không sở hữu, 409 key reuse khác payload. Không tạo endpoint save Trip trá hình. Mã lỗi/bounds và remove-after-delete chờ chốt.

## Error / Recovery

FAILED giữ trạng thái xác nhận cũ. UNKNOWN có thể đã commit, retry cùng method/payload/key; không toggle ngược hoặc tạo request mới để đoán trạng thái. Không báo unfavorite là xóa chuyến đi. Xử lý unavailable/deletion phụ thuộc quyết định FK, không che lỗi hệ thống thành empty list.

## Write Semantics / Idempotency

Reuse `executeIdempotentWrite`, operation favorite:add/remove hiện có sau khi thống nhất payload hash bao gồm targetType/targetId. Transaction recheck actor/owned Trip và ghi favorite + success record nguyên tử; không gọi AI/Routes. SUCCESS chỉ sau commit, FAILED/UNKNOWN dùng helpers chung. Replay không duplicate favorite; concurrent khác key vẫn được bảo vệ bởi unique constraint. Không cập nhật itinerary/revision Trip chỉ vì favorite.

## External Services

Không cần OpenAI, Routes hoặc GPS cho Favorite Trip.

## Acceptance Criteria

- [ ] Task 278 chỉ favorite Trip đã lưu thuộc user; Guest/Admin bị từ chối, foreign/missing trả cùng 404.
- [ ] Cùng user/Trip chỉ một favorite, kể cả concurrent adds/retries; remove giữ nguyên Trip và itinerary.
- [ ] List/status chỉ có dữ liệu user được phép đọc; các contract strict được mở rộng đồng bộ, Destination/Culture không regression.
- [ ] Task 279 không báo thành công hoặc đổi confirmed state trước DB SUCCESS; FAILED/UNKNOWN có recovery đúng key/payload.
- [ ] Task 280 kiểm thử uniqueness/ownership/replay và FK theo quyết định đã duyệt; chưa đánh dấu READY khi FK chưa chốt.

## Test Plan

- `*.vitest.test.ts`, pure UI logic `.ts`, fake repository và transaction; không Neon/provider thật.
- Auth trước body, A/B ownership, absent/foreign 404, favorite candidate chưa lưu bị từ chối, remove favorite của người khác.
- Unique/concurrent adds, same-key replay/different payload conflict, UNKNOWN lost response, remove không xóa Trip; FK deletion cases sau khi có quyết định.
- Strict list/status/client schema và Destination/Culture regressions; manual pending/retry/keyboard/responsive khi UI integration tồn tại.

## Expected Modules / Files

- Sau handoff: mở rộng có kiểm soát `modules/favorites/{favorites.schema.ts,favorites.service.ts,favorites-http.ts}` và `modules/favorite/{favorite-contract.ts,favorite-service.ts,favorite-client.ts}` cùng tests.
- `app/api/favorites/*` và component Favorite hiện có nếu contract mới yêu cầu; đường dẫn Trip UI cụ thể cần thống nhất với US-31, không mặc định sửa `/trips/page.tsx` hoặc `/trips/[id]/page.tsx`.
- `packages/db/prisma/schema/favorite.prisma` và migration **tương lai** phối hợp với task 252; docs task không sửa schema/code/shared Favorite files.

## Migration Impact

Cần additive migration tương lai cho enum/FK/unique/target consistency; SQL phải trình Bình trước apply. Restrict/Cascade chưa chốt. Không sửa migration cũ, `db:push` hoặc reset DB dùng chung. Task docs không tạo/apply migration.

## Environment Impact

Không thêm env/dependency/client.

## Implementation Sequence

1. Chốt Trip/FK/contract list với Thai Anh và Favorite owner; review SQL trước apply riêng.
2. Service/API → strict client/list contract → UI integration → tests/evidence.

## Acceptance Evidence

2026-10-15: chỉ story DRAFT cho task 278–280; chưa có Trip target, migration, API/UI hoặc acceptance runtime. Hai module/enum/list schema hiện tại đã được đọc, không bị chỉnh sửa.

## Open Questions

- **OQ-D** ở [US-32](US-32-manual-itinerary-edit.md#open-questions): FK Favorite → Trip chọn Restrict hay Cascade? Khi Trip bị xóa, status/remove/replay/list xử lý thế nào? Bình + Thai Anh + Favorite owner chốt trước migration.
- **OQ-B:** Trip còn tồn tại nhưng destination cũ bị ẩn hiển thị thế nào trong list/detail? Không tự xóa lịch sử hoặc công khai nội dung ẩn.
- Chốt tên enum/URL target/list field, title allowlist, UI placement và owner của hai Favorite module; không tự sửa màn Trip của dev khác.
- US-30 có lifecycle xóa/ẩn Trip nào được duyệt chưa? Story này không thêm lifecycle mới.

## Handoff Notes

Phần mở rộng Favorite là phạm vi US-34 tương lai, cần phối hợp cả module số ít/số nhiều. Trip/Validator/Planner không được tự dựng thay dependency. Chưa commit/push/merge hoặc migration ở task docs.

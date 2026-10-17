# RBAC V2 — Báo cáo triển khai và nghiệm thu

Ngày: 2026-10-17. Quyết định nghiệp vụ: yêu cầu RBAC V2 của chủ dự án,
[story hiện hành](../stories/RBAC-V2-admin-inherits-traveler.md).

## 1. Git và phạm vi

| Mốc | Branch | Commit |
| --- | --- | --- |
| Trước | `TXH` | `a18d54dde3886b8be4ff9a39d09d7ae6ddc66869` |
| `origin/TXH` sau fetch | `origin/TXH` | `a18d54dde3886b8be4ff9a39d09d7ae6ddc66869` |
| Sau | `feat/admin-inherits-traveler` | Cùng HEAD; thay đổi chưa commit |

Không reset/stash, ghi đè thay đổi song song, commit, push, merge hoặc deploy.
Các thay đổi Landing Page/header có trước và các file Landing/map xuất hiện thêm
trong lúc làm việc được giữ nguyên, không đưa vào phạm vi RBAC. Không sửa RAG/AI
runtime, schema, migration, environment hoặc secrets.

## 2. Nguyên nhân và policy mới

Ba lớp riêng biệt chặn Admin: `requirePermission` yêu cầu role Traveler chính xác;
`requireTraveler` lặp lại điều kiện trên cả session và DB; frontend UserMenu,
FavoriteButton/mutation logic và auth demo cũng dùng role chính xác.

Capability map dùng chung, có kiểu đóng và kiểm tra role không được hỗ trợ:

| Permission | Guest | TRAVELER | ADMIN |
| --- | --- | --- | --- |
| public | Cho phép | Cho phép | Cho phép |
| account:self | 401 | Chính mình | Chính mình |
| traveler | 401 | Tài nguyên của mình | Tài nguyên của mình |
| admin | 401 | 403 | Cho phép |

Better Auth xác thực danh tính. `requireActor` tiếp tục đọc role hiện hành trong
DB ở mỗi lần gọi; `requireTraveler` ủy quyền cho guard đó, giữ `{ userId }` và một
truy vấn User cho mỗi lần kiểm tra. Không dùng role trong session để cấp quyền;
session cũ không giữ quyền Admin sau demotion. Role không hỗ trợ: 403; mất session
hoặc user bị xóa: 401. Không đổi role khi dùng chức năng du khách.

## 3. Backend, API và frontend

Các service giữ nguyên business logic và nhận policy mới qua guard dùng chung:

- `trip-requirement-http`, `trip-requirement-check-http`: evaluate/review/check.
- `preference-extraction-http`: analyze theo pipeline kiểm chứng hiện có.
- `planner-http/service`: `/api/trip-proposals`, candidates, constraints và các
  trạng thái thiếu dữ liệu giữ nguyên.
- `trip-save-service`: `POST /api/trips`, ngày, xác nhận, validator, transaction,
  idempotency và `userId` của actor giữ nguyên.
- `trip-read-service`: danh sách theo `userId`; chi tiết theo `id + userId`.
- `favorites-http/service` và `favorite-service`: add/status/remove, list và xóa
  theo Favorite ID; vẫn kiểm tra quyền trong transaction và scope theo user.
- Account self-service và Admin Destination/RAG tiếp tục dùng guard riêng hiện có.

Không cần sửa các thin Route Handler, `/favorites`, `/trips`, `/trips/new`,
`/trips/[id]` hoặc `/dashboard`: chúng đã gọi shared guard/service. Header đã có đủ
đường dẫn thật nên không sửa header hoặc Landing Page.

UserMenu hiển thị Yêu thích cho cả hai role; giữ tài khoản, nhóm quản trị, đăng
xuất và Culture flag. FavoriteButton dùng cùng capability cho status/loading/error,
add/remove Destination và Trip. Client chỉ hiển thị gợi ý quyền; server quyết định.

Browser phát hiện thêm lỗi có sẵn trong review: Strict Mode cleanup đặt
`mountedRef=false` nhưng setup không khôi phục; kết quả check HTTP 200 bị bỏ qua,
UI đứng ở trạng thái đang kiểm tra. Bổ sung `mountedRef.current=true` khi setup.
Browser cuối xác minh cả Admin và Traveler đi qua được bước này.

## 4. Ownership và nghiệp vụ

Admin không có bypass ownership. Query detail/list và Favorite mutation giữ điều
kiện chủ sở hữu tại DB; không đọc tất cả rồi lọc ở client. Trip Save ghi ID actor
đã xác thực; payload không nhận chủ sở hữu/validator claims. Missing và foreign
Trip trả cùng 404; Favorite của người khác không bị xóa bằng relation ID hay target
ID. Transaction bị mất xác thực rollback cả mutation và idempotency claim.

Suite save chạy cho cả hai role: ngày bắt đầu, xác nhận rõ ràng, giờ mở cửa, thời
lượng tối thiểu, conflict, thiếu/vi phạm route, target ẩn, tái kiểm tra trong
transaction, rollback và replay không tạo trùng. Không nới business constraints.

## 5. Kết quả kiểm thử

| Gate / command | Kết quả thực tế |
| --- | --- |
| Focused auth/planner/requirements/extraction/read/save/Favorites | 459 PASS; 3 PostgreSQL-gated SKIP tại lần focused đầu |
| `npm test` tại `apps/web` — full Vitest | **1.940 PASS, 126 SKIP**, 125 file PASS và 14 file gated SKIP |
| Legacy chạy tiếp trong `npm test` | **336 PASS, 0 FAIL**, bao gồm auth UI/session, authorization, account, Admin Destination/Culture, Favorites, RAG, idempotency |
| `node scripts/test-rbac-development.mjs` | **8/8 PASS**, PostgreSQL thật trên đúng endpoint Development được phép; cleanup PASS |
| `node scripts/rbac-browser-e2e.mjs` | **12/12 nhóm PASS**, Chrome/Chromium thật, production components/routes và Better Auth, không mock API |
| Root `npm run check-types` | PASS |
| Root `npm run build` | PASS, 50.518s |
| `git diff --check` | PASS; chỉ có cảnh báo chuyển LF/CRLF của Git |
| Schema/migration diff | Không có; không chạy migration hoặc `db:push` |
| Secret-pattern scan | 38 file code/test/docs thuộc task: không phát hiện secret pattern |
| Premium strict static audit | 29 finding có sẵn; không tuyên bố toàn ứng dụng đạt audit |

Các test gated không được tính PASS. Tám test PostgreSQL mới nằm trong số gated ở
full offline suite, sau đó được chạy riêng với DB thật và đều PASS. Bộ auth/session
mới bao phủ session role ADMIN/TRAVELER/unknown/absent nhưng DB hợp lệ, role thay đổi
ở request sau, user bị xóa, forged headers, ownership và số User query.

Lần PostgreSQL Development đầu có 7 PASS/1 timeout do 12 thao tác mạng tuần tự
vượt mặc định 5s; cleanup vẫn PASS. Suite network được đặt timeout 30s; lần cuối
8/8 PASS (20.06s). Không đổi assertion để che lỗi quyền.

## 6. Browser E2E thật

[Kết quả JSON](rbac-v2-evidence/browser-results.json) ghi 12 nhóm sau:

1. Admin đăng nhập bằng UI Better Auth thật, role được đọc từ DB.
2. Traveler khác đăng nhập bằng UI thật.
3. Admin Home/menu có tài khoản, Yêu thích, quản trị Destination/RAG, đăng xuất;
   không có Culture bị ẩn.
4. Admin thêm Favorite trên Destination detail, xem `/favorites`, bỏ Favorite;
   kiểm tra bản ghi DB sau mỗi mutation.
5. Admin form → evaluate → review → check → proposal endpoint thật.
6. Traveler đi qua cùng flow.
7. Admin save/replay API → My Trips → detail → thêm/bỏ Favorite Trip trong UI.
8. Traveler thực hiện tương tự, danh sách chỉ có Trip của mình.
9. Truy cập chéo Trip/Favorite theo cả target ID và relation ID bị từ chối; foreign
   và missing Trip cùng envelope 404, bản ghi người khác vẫn tồn tại.
10. Admin mở `/admin/rag`, `/admin/destinations`, `/account`, `/dashboard`;
    Admin APIs trả 200, Traveler trả 403; persisted Admin role vẫn ADMIN.
11. Admin gửi “Xin chào” qua AI endpoint thật, F5 khôi phục history, rename/delete
    conversation của mình; Traveler không đọc/rename/delete được conversation đó.
12. Guest private APIs trả 401; menu Admin ở 390px giữ quyền cá nhân/quản trị.

Đây là kiểm tra transport/principal/history bằng lời chào; không phải acceptance
mới cho chất lượng trả lời factual/RAG. Không thay OpenAI, model, source eligibility,
`publicQaApproved`, citations, rate limits hoặc runtime gate; không reset quota.

Ảnh đã kiểm tra: [menu desktop](rbac-v2-evidence/admin-menu.png),
[menu 390px](rbac-v2-evidence/admin-menu-mobile.png),
[Admin proposal](rbac-v2-evidence/admin-planner.png),
[Traveler proposal](rbac-v2-evidence/traveler-planner.png).

Các lần browser đầu đã bộc lộ selector sai trong harness và lỗi Strict Mode nêu
trên. Fixture của cả lần lỗi đều được dọn; một lần harness bị unhandled timeout
được dọn bằng đúng hai User ID và Destination ID đã xác minh. Giữ
[kết quả trước fix](rbac-v2-evidence/browser-before-strict-mode-fix.json).
Không mô tả các lần thất bại là PASS.

## 7. Giới hạn và an toàn môi trường

- Docker CLI có mặt nhưng Engine không đáp ứng; runner disposable không chạy
  được. Không có PASS cho toàn bộ QA/RAG/planner PostgreSQL regression riêng.
  Chúng vẫn gated trong full suite. Đã bổ sung runner disposable dùng migration
  SQL thật để chạy lại khi Docker hoạt động, không đọc `.env`.
- Dùng fallback PostgreSQL Development theo quyền kiểm thử của task, endpoint
  được kiểm tra chính xác trước kết nối. Chỉ tạo/sửa/xóa fixture có ID ngẫu nhiên;
  không sửa bản ghi người dùng hoặc source có sẵn. Cleanup DB/Browser đều PASS;
  kiểm tra cuối còn **0 User và 0 Destination fixture browser**.
- Proposal thật vẫn có `INSUFFICIENT_DATA` cho routing/opening khi dữ liệu hiện tại
  thiếu. Không biến trạng thái này thành PASS. Save thành công được kiểm tra bằng
  itinerary fixture một điểm có đủ dữ liệu, không cần gọi routing bên ngoài.
- Planner UI hiện chưa mount save panel; browser xác minh save qua API hiện hữu
  và mở lại qua UI. Không tuyên bố có nút save mới trên planner.
- [Static audit JSON](rbac-v2-evidence/premium-audit.json) có 29 finding từ trước,
  gồm form/date ownership và các heuristic UI ngoài scope. Finding UserMenu là
  heuristic với Button nằm trong Link đăng nhập có sẵn; không phát sinh từ diff
  capability. Không redesign các màn hình ngoài phạm vi để xử lý audit này.
- Không có thay đổi Production, Production ENV, secrets, role enum, migration,
  AI/RAG/history logic hoặc feature flags: **culture=false, ticketPrice=false**.

## 8. Danh sách file thuộc RBAC

Backend/policy và UI:

- `apps/web/src/lib/authorization-capabilities.ts` (mới)
- `apps/web/src/server/authorization/policy.ts`
- `apps/web/src/server/auth/require-traveler.ts`
- `apps/web/src/modules/favorites/favorites-http.ts` (comment)
- `apps/web/src/components/user-menu.tsx`
- `apps/web/src/components/favorite-button.tsx`
- `apps/web/src/components/favorite-mutation-logic.ts`
- `apps/web/src/lib/auth-context-demo.ts`
- `apps/web/src/app/trips/new/trip-review-screen.tsx`

Tests và harness:

- `apps/web/src/server/authorization/authorization.test.ts`
- `apps/web/src/server/auth/require-traveler.vitest.test.ts` (mới)
- `apps/web/src/server/authorization/rbac-v2.postgres.integration.vitest.test.ts` (mới)
- `apps/web/src/components/favorite-button.test.tsx`
- `apps/web/src/components/us15-favorite-client.vitest.test.ts`
- `apps/web/src/lib/auth-context-return.test.ts`
- `apps/web/src/modules/favorite/favorite.test.ts`
- `apps/web/src/modules/favorite/favorite.integration.test.ts`
- `apps/web/src/modules/favorites/favorites.test.ts`
- `apps/web/src/modules/favorites/us15-favorites.vitest.test.ts`
- `apps/web/src/modules/favorites/us34-trip-favorite.integration.test.ts`
- `apps/web/src/modules/preference-extraction/preference-extraction-http.vitest.test.ts`
- `apps/web/src/modules/trip-planner/planner-boundaries.vitest.test.ts`
- `apps/web/src/modules/trip-read/trip-read.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/trip-requirement-check.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us24-start.vitest.test.ts`
- `apps/web/src/modules/trip-requirement/us24-test.vitest.test.ts`
- `apps/web/src/modules/trip-save/trip-save.vitest.test.ts`
- `apps/web/scripts/rbac-browser-e2e.mjs` (mới)
- `apps/web/scripts/test-rbac-development.mjs` (mới)
- `apps/web/scripts/test-rbac-postgres.mjs` (mới)

Documentation: `docs/product/product-spec.md`,
`docs/architecture/technical-architecture.md`, `docs/flow/user-flow.md`,
`docs/stories/US-06-role-ownership.md`,
`docs/stories/RBAC-V2-admin-inherits-traveler.md`, `docs/decisions.md`,
`docs/ai-progress.md`, báo cáo này và `docs/implementation/rbac-v2-evidence/`
(kết quả browser trước/sau, hai check responses, bốn PNG và static audit JSON).

Các thay đổi Landing/header/map song song không thuộc danh sách này.
Thư mục scratch `.rbac-evidence/` cũng giữ các ảnh/JSON kiểm thử; bản bằng chứng
được dẫn trong báo cáo nằm tại `docs/implementation/rbac-v2-evidence/`.

# TC-03/05/07/08/09 — sửa 7 lỗi code review

Ngày: 2026-10-28. Chủ dự án yêu cầu sửa toàn bộ bảy finding trong [code review](trip-companions-code-review.md). **Đã sửa local**, giữ nguyên BE/shared DTO/schema/migrations và các thay đổi giao diện đồng thời có sẵn. Chưa nhận nghiệm thu thay chủ dự án.

## Thay đổi và bằng chứng tương tác

| Finding | Sửa thực tế | Test hành vi |
| --- | --- | --- |
| S1 — management UNKNOWN | Giữ nguyên publication ID, payload đầy đủ, base revision và key trong một attempt; khóa input/image/toggle và callback cũ khi pending/UNKNOWN. Retry dùng snapshot; known FAILED giải phóng attempt để chỉnh lại bằng key mới | UNKNOWN rồi gọi callback input cũ; retry so sánh toàn bộ body/key. Bấm submit liên tiếp chỉ có một request đang chạy |
| S2 — chat UNKNOWN | Attempt chứa target/text/key độc lập với composer; send/reconcile dùng cùng attempt. Pending/UNKNOWN khóa cả input và stale callback; guard bằng ref chống Enter/submit lặp | UNKNOWN → thử sửa → reconcile → resend: ba request giữ đúng text/key; gửi pending không tạo bản thứ hai |
| S3 — trạng thái đóng/gỡ sai | Recruitment/visibility chỉ đổi sau SUCCESS. FAILED/UNKNOWN giữ trạng thái được server xác nhận; retry một thao tác đóng không tự đảo thành mở | Server trả FAILED cho từng toggle: nhãn không đổi. UNKNOWN khi đóng rồi retry qua Save gửi lại đúng payload đóng |
| F1 — thu hồi quyền | Khi API trả 401/403/404, đóng private component, cleanup polling và bỏ response đang bay. Theo dõi session thật và bind component với publication/actor; private server page cung cấp current actor từ guard hiện hành. Ngoài tab chat vẫn kiểm tra quyền bằng group refresh | Delta 403 làm mất transcript/composer và không còn timer active; đổi account trong lúc delta đang chờ thì response cũ không hiện vào account mới |
| F2 — trạng thái tuyển | Public page truyền recruitmentStatus của BE vào view. CLOSED/FULL/DEPARTED/COMPLETED/WITHDRAWN/CANCELED có trạng thái vô hiệu hóa phù hợp; host/member vẫn có lối vào nhóm. Fallback khi không có status dùng ngày Việt Nam | Các trạng thái server không cho join đều không có nút join bật dù còn chỗ |
| F3 — cursor mất tin | Bỏ effect nâng delivery cursor theo max local history/own-send. Cursor chỉ đi từ initial/history cut hoặc delta.nextCursor; merge/dedup/sort tin gửi và tin server độc lập với cursor | Đã nhận 1, người khác gửi 2, own-send ack 3: poll đầu vẫn after=1; page hasMore/highWater=3 chỉ giao 2 thì poll sau after=2; transcript cuối có 1/2/3 đúng thứ tự |
| F4 — read marker sai | Chỉ mark khi chat visible và phần cuối tin nằm trong viewport thực của transcript lẫn browser. Marker không vượt delivery cursor; phản hồi chưa xác nhận giữ nguyên read attempt. Scroll/resize/visibility kiểm tra lại phần đã thấy; không tự clear badge chỉ vì mở tab | Trang hidden không POST read; tin dưới viewport không được mark; scroll/resize hiển thị tin mới mới tiến marker |

Đã giữ các khối timeline/map/visual mới có sẵn trong Group/Introduction view. Khi giao diện Introduction được chỉnh đồng thời trong lúc kiểm chứng, build phát hiện năm lỗi kiểu nullable; các formatter ngày/giờ được sửa để hiển thị rõ khi thiếu dữ liệu, không cast bỏ null. Đã bỏ dòng trống EOF mới ở CSS mà không đổi layout/styles. Không đổi mô hình thành viên, điều kiện nhận người, ban/cancel, quyền private Trip hoặc chiến lược sequence/transaction phía server.

## Test trước và sau sửa

Thêm [companion-interactions.vitest.test.ts](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-interactions.vitest.test.ts). Suite bundle component, client adapter, schema và mutation transport thực bằng esbuild; chỉ thay hook/host runtime, geometry, network fixture và visual dependencies không liên quan.

- **Trước sửa:** 14/14 test ban đầu FAIL ở assertions hành vi, tái hiện UNKNOWN, false toggle status, cursor gap, revoke, account switch, hidden read và authoritative recruitment states.
- **Sau sửa:** 14/14 PASS; thêm năm ca biên cho uncertain-toggle retry, pending send, browser viewport, Guest đóng tuyển và mốc nửa đêm Việt Nam. **Cuối cùng 19/19 PASS**.
- Focused Đồng hành + trips-view trên source cuối: **13 passing files / 190 PASS**, 11 files / 58 PostgreSQL SKIPPED. Skip không được tính thành pass.
- Root `npm run check-types`: PASS, 4/4 package tasks. Production build kiểm tra lại TypeScript trên source cuối; xem receipt cuối bên dưới.
- Source comparison: **73 file BE/API/shared contract/schema/migration của feature không đổi** so với snapshot review. Không cần chạy lại DB suite cho sửa FE này; 58/58 PostgreSQL PASS của lượt review vẫn là receipt riêng, không nhận là lần chạy mới.

Các test mới gọi handler/effect, stale callback và real client transport; không suy ra recovery PASS từ static markup. Hook/geometry fixture không thay thế trình duyệt, nhiều actor thật hoặc độ trễ mạng thực.

## Lệnh kiểm chứng

Từ `apps/web`:

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/app/trips/trips-view.vitest.test.ts
```

Từ repo root:

```powershell
npm run check-types
$env:KLTN_PERF_BUILD='1'
npm run build --workspace web
git diff --check
```

Build dùng output isolated, giữ default dev output riêng. Không chạy code provider chỉ để chứng minh kiểm thử; log CONFIGURATION khi build không phải request AI.

## Receipt cuối và giới hạn

Production build cuối **PASS**: Next 16.3.8, compile 13.6s, TypeScript 30.0s, 53/53 trang và các route Đồng hành được đăng ký. Một lượt build trước phát hiện năm lỗi nullable trong giao diện đang chỉnh đồng thời; đã sửa formatter đúng kiểu và chạy lại thành công, không tắt typecheck. `git diff --check` **PASS**. Bảy file source/test/CSS được ghi hash trước lượt kiểm chứng cuối và giữ nguyên đến khi build/tests xong. Local links/whitespace của tài liệu được kiểm tra khi bàn giao.

Computer Use đã dừng việc kiểm tra UI vì không xác định chắc browser URL trên Windows. Không tiếp tục điều khiển browser bằng công cụ khác hoặc nhận authenticated browser/visual acceptance; các hành vi ở bảng trên có test offline cụ thể. Không thao tác Development/Production, schema/migration, credentials/env, dữ liệu Trip/chat thật, dependency installation, commit/push/merge/deploy. Không chạy lại toàn bộ suite rộng hoặc sửa năm lỗi baseline ngoài scope được báo trước đó.

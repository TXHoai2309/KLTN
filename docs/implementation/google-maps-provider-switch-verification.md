# Google Maps/Stadia — local verification và code review

Ngày 2026-11-18. Mốc review do chủ dự án xác nhận: `beb647d1675e0d11c99bd0c60e36c77ecbc36ec4`. Commit triển khai đầu: `4300599`; bản sửa review và receipt theo sau trên cùng nhánh. Không push/merge/deploy production.

## Scope và TDD

Phạm vi theo [spec](../specs/google-maps-provider-switch-spec.md), [story](../stories/MAPS-PROVIDER-SWITCH.md) và tám local issues. Seam đã được chủ dự án duyệt: browser map/picker contracts; origin search; Planner/Validator/Save/Edit/Read qua service/API, HTTP-provider injection và fake database tại boundary.

Các vòng red → green có bằng chứng trong phiên thực thi:

- Shared website flag: proposal/coordinate route trước đó vẫn đi Stadia và trả insufficient dưới Google flag mới; sau đó cả hai trả Google evidence đúng nguồn.
- Google map configuration: loader chưa có/provider chưa nối, rồi thiếu Map ID gây lỗi ngoài hợp đồng; đã có một loader chung và unavailable rõ ràng, không gọi Stadia.
- Origin search: chưa có configured Google adapter; sau đó tìm được Mỹ Đình trong coverage Việt Nam với Google source/unconfirmed, không bị giới hạn Hà Giang. Bổ sung quota/HTTP error, timeout 4 giây và Stadia mode.
- Save: Google route bị lưu thành Stadia; sau sửa lưu đúng nguồn. Fixture không có provenance không được tự gán provider.
- Read/rollback: snapshot transfer chưa được chiếu ra read; sau sửa giữ Google metadata khi chọn Stadia, không gọi network hoặc ghi row và không trả journey origin cho member.
- Picker disposal: còn thay đổi detached marker sau dispose; đã chặn cập nhật.
- Review mobile viewport: map mounted hidden không fit khi lộ ra; test tái hiện visible fit count bằng 0 rồi qua sau khi thêm first-visible fit guard.

## Automated checks

- Typecheck thường xuyên bằng TypeScript CLI và production Next build. Các lần standalone typecheck cuối trước review sạch; Next build webpack cũng qua TypeScript.
- Nhóm liên quan 86 file: lần đầu 856 pass, 21 skipped, 1 todo và 4 failures; 3 lỗi in-trip đã có, 1 assertion Stadia được cập nhật để kiểm tra thêm actual provider rồi pass.
- Targeted sau sửa review/provenance: 24 test pass (travel-time, Google itinerary/picker, origin Google, Read rollback). Bộ map legacy: 27/27 pass.
- Full Vitest lần đầu: 4,214 tests, 3,929 pass, 52 fail, 232 pending, 1 todo. Một failure là assertion exact object travel-time chưa nhận provider mới; đã sửa và chạy file đó: 13/13 pass. Các 51 lỗi còn lại trùng tám nhóm baseline được ghi nhận trước task, không sửa các nhánh nghiệp vụ đó.
- Full Vitest final sau sửa review: **4,214 tests, 3,922 pass, 59 fail, 232 pending, 1 todo**. Không còn failure travel-time của task. Trong 59 failures có 51 baseline ở tám file và 8 companion-discovery do mock `next/navigation` thiếu `usePathname` với `isolate:false`. Đây là đúng lỗi order-dependent đã ghi trong TripSage handoff/story trước task; chạy riêng companion-discovery sau đó **8/8 pass**. Không tuyên bố full suite xanh.
- Legacy chạy đủ từng script để không dừng ở lỗi đầu: auth-ui/account/authorization/culture/map/search/favorite/rag/idempotency pass. Destination có một assertion public-detail cũ không cho phép nút Yêu thích; Explore có một assertion Home chờ chữ “BẮT ĐẦU HÀNH TRÌNH” không còn trong source hiện tại. Hai lỗi này đã được ghi nhận trong handoff trước và source/test liên quan không đổi ở task này.

## Build / secrets / database

- Default Turbopack build bị dừng ở compile trong môi trường sandbox; webpack báo DNS `fonts.googleapis.com`. Sau khi dùng quyền network đã cho phép, production webpack build Google thành công với fixture browser/server keys và DB loopback; 57 trang tĩnh được tạo. Có warning dependency expression của Varlock trong auth-context-demo, không phát sinh từ Maps.
- Build cuối sau bản sửa viewport: **PASS**, gồm TypeScript và 57 trang tĩnh; cùng warning Varlock đã nêu. Không đổi compiler mặc định của sản phẩm để né lỗi môi trường.
- Scan build cuối: fixture browser key có trong client bundle như thiết kế; fixture private Google server key có **0** hits trong static assets. Không dùng key thật cho build verification.
- Không đổi Prisma schema/migrations, không gọi DB thật. Origin source lưu JSON; compatibility thêm ở Zod contract, không cần migration. Những migration còn pending từ story khác không được áp hoặc xác nhận lại ở task này.
- Diff chỉ gồm scope provider/spec/tickets/docs/tests; actual `.env` không được sửa hoặc commit. Raw log/JSON chỉ ở local ignored verification folder. `git diff --check`/staged check sạch sau dọn whitespace của draft docs.

## Standards

Review độc lập theo `git diff beb647d...HEAD`, dựa trên AGENTS, Next guidance và product/technical standards.

**Một P2 trong commit đầu, đã sửa:** Google itinerary resize chỉ refit nếu không có center, trong khi map luôn có center khởi tạo. Hidden mobile panel làm fitBounds ban đầu không có tác dụng và lần hiện đầu không fit route/origin. Điều này trái responsive behavior và yêu cầu giữ viewport. Đã thêm guard fittedVisible như Stadia, tái hiện test đỏ và kiểm tra test xanh.

Không có vi phạm bổ sung về authorization, security, migrations hay write contract được reviewer tìm thấy. Không có Fowler smell đủ căn cứ để thành finding riêng; provider branching nằm trong adapter boundary.

**Standards summary:** 1 finding ban đầu, đã sửa; 0 unresolved code findings.

## Spec

Review độc lập đối chiếu Google/Stadia spec và tám ticket.

**Một P2 trong commit đầu, đã sửa:** cùng lỗi first-visible viewport, trái yêu cầu “preserve existing viewport … across supported screens” và “thao tác trên màn hình nhỏ”. Test Google renderer nay fit khi panel có chiều rộng và vẫn giữ selection/camera qua đổi theme.

Không tìm thấy thêm lỗi code hoặc thay đổi nghiệp vụ ngoài yêu cầu ở provider selection, origin search, routing provenance, snapshot read, rollback và privacy.

**Spec summary:** 1 finding ban đầu, đã sửa; 0 additional unresolved code findings. Đây là cùng một lỗi được hai trục tìm thấy độc lập, không phải hai lỗi riêng.

## Chưa nghiệm thu live

Local chưa cấu hình Google server key, browser key và Map ID. Chưa smoke Google Maps JavaScript/Places/Routes thật, chưa kiểm chứng billing/quota/referrer authorization hoặc Stadia rollback trên deployment. Không coi renderer test hay build với key giả là bản đồ live hoạt động.

Google retention/agreement và Terms/Privacy vẫn là deployment gate theo [runbook](google-maps-provider-switch-runbook.md). Cờ mặc định Stadia được giữ; muốn bật Google cần điền cấu hình, build/redeploy và hoàn tất live checklist. Code local hoàn thành không tự đóng các checkbox nghiệm thu live hoặc xác nhận ACCEPTED thay chủ dự án.

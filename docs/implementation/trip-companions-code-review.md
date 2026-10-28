# TC-01–TC-11 — code review, 2026-10-28

**Kết quả: cần sửa trước khi chốt nghiệm thu.** Có 7 lỗi đã xác minh: Standards 3 (nặng nhất P1), Spec 4 (nặng nhất P1). Các lỗi nằm ở FE/controller; trong các đường đã rà, chưa xác nhận thêm lỗi BE về authorization hoặc atomicity. Không sửa application source trong lần review này.

**Follow-up theo yêu cầu sửa của chủ dự án:** Bảy finding bên dưới đã được xử lý local trong phiên sửa tiếp theo; xem [thay đổi, test trước/sau và giới hạn](trip-companions-review-fixes.md). Nội dung review gốc được giữ làm bằng chứng, không phải danh sách bảy lỗi vẫn đang mở ở source sau sửa.

## Phạm vi và phương pháp

- Áp dụng skill code-review, hai sub-agent độc lập cho Standards và Spec; root kiểm tra chéo và tái hiện các handler FE.
- Dùng lại fixed point trước TC-01: `723f24e128d56ae0a47825a90d417f0f0695cf60`. HEAD: `b0449850a6a599128e0d9615c2a85ad8132a13fb`; commit giữa hai mốc: `b044985 tmp`.
- Review tracked diff từ fixed point tới source hiện tại, cộng các file chưa tracked thuộc Đồng hành và điểm tích hợp Trip edit/delete. Manifest ghi 142 file scope, gồm 82 file untracked. Tại lần kiểm tra đầu, 142 hashes giữ nguyên; khi hoàn thiện báo cáo có refactor đồng thời ở `trips-view.tsx` chuyển visual/coordinate helper sang `lib/destination-visuals`. Các file chứa bảy finding vẫn giữ nguyên snapshot. Refactor mới đó chưa thuộc test receipt/review này; không đưa thay đổi Assistant không liên quan vào kết luận.
- Nguồn chuẩn: AGENTS, technical architecture, auth/idempotency conventions và user-flow/write recovery. Nguồn spec: Q1–Q17, ADR-23 và AC của 11 issue; báo cáo BE/FE là evidence được kiểm tra, không tự thay thế hành vi source.
- Local receipts/harness trong ignored `.cache/trip-companions-review/`. Harness bundle component/client/schema thực bằng esbuild, dùng hook runtime nhỏ và fetch synthetic để gọi handler/effect; đây không phải browser acceptance hoặc giao dịch DB thật.

## Standards

### S1 — [P1] TC-05: UNKNOWN cho sửa payload rồi dùng lại key cũ

Nguồn: [companion-management-view.tsx:193](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-management-view.tsx:193), các điều kiện disabled ở dòng 524/542/568.

UNKNOWN bị chuyển thành `mutationStatus = failed` và giữ key, trong khi input chỉ khóa lúc submitting. Host có thể sửa title/capacity/intro/image rồi bấm lại. Repro thực gửi hai PATCH cùng key nhưng title lần lượt là `Original attempted title` và `Changed after UNKNOWN`; input sau UNKNOWN có `disabled = false`.

Vi phạm AGENTS.md:29 và user-flow.md:58: “retry UNKNOWN with the identical payload and key”. Nếu lần đầu đã commit, server có thể trả `IDEMPOTENCY_KEY_REUSED`; nếu chưa commit, retry thực hiện một nội dung khác với attempt chưa xác nhận. Cần giữ toàn bộ attempt bất biến, khóa callback/input và có lối retry snapshot gốc.

### S2 — [P1] TC-07/08: chat UNKNOWN cũng cho đổi nội dung trước retry/đối soát

Nguồn: [companion-group-view.tsx:1150](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-group-view.tsx:1150); handler send/reconcile đọc `composerText.trim()` tại dòng 435/521.

Textarea chỉ khóa khi `sending`, nên sau UNKNOWN người dùng sửa text rồi bấm Thử lại hoặc Đối soát bằng key cũ. Repro POST cùng key lần lượt gửi `Original uncertain message` và `Different message after UNKNOWN`. Vi phạm cùng write-recovery contract; cảnh báo yêu cầu người dùng đừng sửa không đảm bảo tính bất biến. Cần tách draft mới khỏi attempted message snapshot, retry/reconcile chính xác snapshot và key gốc.

### S3 — [P2] TC-05: lỗi đóng tuyển/gỡ bài vẫn để UI hiển thị đã đóng/gỡ

Nguồn: [companion-management-view.tsx:219](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-management-view.tsx:219).

Hai toggle đổi local `recruitmentOpen`/`visibility` trước khi API xác nhận, không khôi phục khi FAILED. Repro server trả `COMPANION_REVISION_CONFLICT/409` cho đóng tuyển nhưng UI đổi nút thành “Mở nhận người lại”, dù DB chưa đóng. Host có thể hiểu rằng đã ngừng nhận người/ẩn bài trong khi bài vẫn mở/công khai. AGENTS.md:29 yêu cầu phản ánh ghi đã xác nhận. Tách authoritative state với pending intent; known failure giữ trạng thái server, UNKNOWN hiển thị riêng và không đảo payload khi retry.

## Spec

### F1 — [P2] TC-08: không chuyển sang mất quyền khi nhóm bị thu hồi

Nguồn: [companion-group-view.tsx:271](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-group-view.tsx:271).

Polling nuốt mọi exception, kể cả 401/403 sau kick/lock/logout. Không xóa group/history/members, chuyển sang mất quyền, điều hướng hoặc dừng vòng poll. Repro delta trả 403: transcript riêng và composer vẫn render, không có navigation. Backend vẫn chặn request; phát hiện này không khẳng định server tiếp tục cấp dữ liệu trái quyền.

TC-08 AC dòng 20 yêu cầu “Rời/bị loại/account lock/logout/account switch thu hồi hoặc xóa dữ liệu client đúng principal”. Phân biệt lỗi mạng với auth/revocation; clear state, chặn response muộn và ngừng request của principal/nhóm cũ.

### F2 — [P2] TC-03/05: chuyến đóng tuyển vẫn có nút tham gia bật

Nguồn: [public page:100](D:/KLTN/KLTN/apps/web/src/app/trip-companions/[id]/page.tsx:100) và [introduction view:318](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-introduction-view.tsx:318).

BE đã trả `companion.recruitmentStatus` nhưng page không truyền xuống. View chỉ xét ngày/hết chỗ; bài PUBLIC đã đóng tuyển còn hai chỗ vẫn hiển thị nút Tham gia bật. Repro component thực xác nhận enabled join = true, thông báo đóng tuyển = false. Server từ chối join đúng, nhưng UI sai trạng thái/hành động.

Design dòng 95 yêu cầu nút có trạng thái “đóng tuyển”; TC-05 AC yêu cầu host/member thấy đúng hành động. Dùng recruitment status từ server; date guard hiện còn dùng UTC thay vì ngày Việt Nam, cũng nên dựa trên eligibility authoritative.

### F3 — [P1] TC-07/08: gửi tin thành công có thể làm mất tin khác khỏi phiên hiện tại

Nguồn: [companion-group-view.tsx:183](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-group-view.tsx:183), nhánh append own-send tại dòng 467.

Effect nâng `lastDeliveredCursorRef` lên max sequence có trong local history, bao gồm tin vừa gửi được xác nhận. Ví dụ client đã tải đến 10; người khác gửi 11; trước poll, client gửi 12 thành công. Append 12 làm cursor thành 12, nên poll `after=12` không bao giờ lấy 11. Repro thực cho đúng request `messages/delta?after=12`; UI có tin 12 nhưng thiếu 11. DB không mất tin; reload/history có thể lấy lại, còn delta trong phiên này đã vượt qua nó.

Vi phạm TC-08 AC dòng 21: “Reconnect/poll đồng thời không làm thiếu, trùng hoặc đảo sai thứ tự tin đã commit”. Cursor đọc phải biểu thị đoạn đã nhận đầy đủ từ server, không nâng theo own-send ack; merge/dedup/sort tin gửi độc lập với cursor, chỉ tiến theo delta `nextCursor` đã xử lý.

### F4 — [P2] TC-09: đánh dấu đã đọc dù tab web đang ẩn/chưa xem đến tin mới

Nguồn: [companion-group-view.tsx:320](D:/KLTN/KLTN/apps/web/src/components/trip-companions/companion-group-view.tsx:320).

Effect chỉ xét activeTab là chat rồi mark max sequence của toàn bộ items, không kiểm tra document visibility hay phần transcript thực đang nhìn thấy. Repro `document.visibilityState = hidden` vẫn POST `/read` với sequence 1. Khi đang cuộn đọc tin cũ, dữ liệu mới được fetch cũng có thể bị mark hết và xóa unread trước khi xem.

Vi phạm TC-09 AC dòng 19: “cập nhật marker theo phần đã hiển thị; không báo tất cả tin đã đọc chỉ vì background fetch”. Chỉ mark khi trang visible và theo phần tin thực đã hiển thị; không dùng toàn bộ max fetched sequence làm bằng chứng đã đọc.

## Kiểm tra chạy lại trong lượt review

| Check | Kết quả quan sát |
| --- | --- |
| Focused Vitest modules/components Đồng hành + trips-view | 12 files / **171 PASS**, 11 files / 58 PostgreSQL skips |
| Dedicated PostgreSQL runner trên owned disposable loopback container | 11 files / **58/58 PASS**, 23 migration liên quan, 0 pending, cleanup PASS |
| Strict backend source checker | **PASS**, 63 entries, target ES2017, ambient Next types; không thay đổi target để test xanh |
| Offline component-handler/effect harness | Xác minh S1, S2, S3, F1–F4; Spec agent kiểm tra chéo F1/F2 bằng component thực |
| Pinned scope hashes | 141/142 file giữ nguyên khi chốt; `trips-view.tsx` có refactor visual helper đồng thời sau lượt test. Các file finding giữ nguyên |

Lệnh thực từ repo root, trừ khi ghi khác:

```powershell
node scripts/check-trip-companions-backend.mjs
node .cache/trip-companions-review/fe-handler-repro.cjs
git diff --check
```

Từ `apps/web`:

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/app/trips/trips-view.vitest.test.ts
node scripts/test-trip-companions-postgres.mjs
```

Không chạy lại root typecheck, production build, authenticated browser, toàn bộ suite rộng hoặc năm lỗi baseline được báo trong backend verification. Không truy cập/migrate Development hoặc Production trong review; kết quả 42 migrations Development là receipt cũ, không phải lượt xác minh mới này. PostgreSQL fixture không có toàn bộ PostGIS/vector/AI history, nên không chứng minh full deployment drift.

Các suite management/group hiện chủ yếu render static markup; PASS của chúng và PASS của backend DB tests không chứng minh đủ các tương tác controller ở trên. Vì vậy, báo cáo FE “100% tích hợp” chưa đủ cơ sở cho các AC bị ảnh hưởng. Cần thêm test tương tác cho các repro trước khi sửa, rồi chạy hồi quy và browser flows tương ứng; không chỉ thêm assertion HTML tĩnh.

## Kết luận theo hai trục

Standards: **3 lỗi**, nặng nhất **P1** (payload UNKNOWN không bất biến ở quản lý/chat). Spec: **4 lỗi**, nặng nhất **P1** (cursor FE bỏ sót tin). Chưa sửa source, chưa đổi trạng thái ticket hoặc nhận ACCEPTED, không commit/push/merge/deploy.

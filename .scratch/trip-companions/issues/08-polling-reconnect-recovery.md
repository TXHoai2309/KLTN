# 08: Cập nhật tin mới và phục hồi mất kết nối

**What to build:** Người đang mở nhóm nhận tin mới trong vài giây, quay lại tab thấy phần mới và đối soát được tin chưa xác nhận mà không mất/trùng tin.

**Blocked by:** TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** IMPLEMENTED LOCALLY; vertical FE/integration VERIFIED

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q11, Q15; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Delta/cursor reader kèm trạng thái quyền hiện hành, khả năng đối soát request đã ghi và thứ tự commit an toàn; không thêm provider hoặc đổi write contract.

**FE part:** Polling khoảng 3 giây chỉ cho nhóm đang mở và trang đang hiện, refresh khi quay lại, merge/deduplicate, giữ vị trí khi đọc tin cũ và xử lý UNKNOWN/reconnect/late response.

- [x] Không chạy poll cho mọi nhóm hoặc tiếp tục vòng lặp nhóm khi trang bị ẩn; mở lại lấy phần mới theo cursor.
- [x] Đang ở cuối thì theo tin mới; đọc tin cũ giữ vị trí và có lối xem tin mới; polling không lấy focus hoặc nháy toàn transcript.
- [x] Mất phản hồi gửi tin đối soát cùng định danh/payload/key; không đổi key hoặc gửi thêm bản tin chỉ vì reconnect.
- [x] Rời/bị loại/account lock/logout/account switch thu hồi hoặc xóa dữ liệu client đúng principal; callback cũ không gắn transcript vào tài khoản/nhóm mới.
- [x] Reconnect/poll đồng thời không làm thiếu, trùng hoặc đảo sai thứ tự tin đã commit; đo độ trễ với điều kiện thử được ghi rõ, không hứa SLA background.
- [x] Có kiểm tra controller/timer/visibility và hai người dùng qua fixture/browser; không cần WebSocket, push/email hay dịch vụ chat ngoài.

**Demo / verification:** Một người đang đọc tin cũ trong lúc người kia gửi; ngắt/kết nối lại và đổi tab vẫn không mất hoặc trùng tin.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC08-delta-r1. GET /api/trip-companions/:id/messages/delta accepts after decimal sequence (default0), raw limit1–100/default100. Shared companionDeltaQuerySchema/companionDeltaSchema, type CompanionDelta, fixture companionDeltaFixture. Result {publicationId,items,nextCursor,highWaterCursor,hasMore,canSend,relationship}. Items ascending; advance only nextCursor (last delivered), never highWaterCursor when hasMore=true. Same committed sequence/RepeatableRead/auth boundary as history; old cursor grants no access after leave/ban/lock. Poll about3s only for visible current group, refresh on return, dedup by message ID/sequence, preserve scroll and reject late actor/group responses in FE; no BE timers or new provider. POST /api/trip-companions/:id/messages/reconcile takes identical send text body and Idempotency-Key, checks current membership and actor/publication/payload hash in shared replay store without writing. Confirmed => original SUCCESS IDs/sequence; changed key payload => FAILED409; absent/in-flight/unavailable/corrupt result => UNKNOWN503 retryWithSameKey, then retry original send with identical body/key. Never synthesize success or use a new key on reconnect. PostgreSQL 41 PASS (2 delta/reconciliation/current permission tests + earlier39), unchanged20 migrations/0 pending/cleanup PASS; chat schema suite3 PASS. Typecheck found ES2017 target incompatibility with BigInt literals introduced in TC07; replaced literals by exact BigInt constructors, preserving bigint strings and semantics. Root typecheck rerun/final broad check pending, not called PASS early. No migration for TC08; Development already has chat schema (39 applied/0 pending/unfinished). FE/browser/timer/integration evidence remains OPEN.

**FE evidence:** Đã hoàn thành và kiểm chứng:
- `apps/web/src/modules/trip-companions/companion-client.ts`:
  - `fetchCompanionDelta(publicationId, after, limit)`: Gọi `GET /api/trip-companions/:id/messages/delta` với `cache: no-store`, hỗ trợ phân trang delta bằng `after` cursor và parse `CompanionDelta`.
  - `reconcileCompanionMessage(publicationId, text, idempotencyKey)`: Gửi `POST /api/trip-companions/:id/messages/reconcile` thông qua `sendIdempotentMutation` để đối soát tin nhắn bị gián đoạn mà không tạo bản ghi mới.
- `apps/web/src/components/trip-companions/companion-group-view.tsx`:
  - Thiết lập chu kỳ polling ~3 giây (`pollDelta`) chỉ khi `activeTab === "chat"`.
  - Cổng kiểm soát visibility (`document.visibilityState === "visible"`): tạm dừng poll khi trang bị ẩn; tự động kích hoạt truy vấn delta ngay khi quay lại tab (`visibilitychange` event).
  - Lắng nghe sự kiện mạng `online` để kích hoạt làm mới delta ngay khi thiết bị kết nối lại mạng.
  - Tiến bộ cursor đơn điệu (`lastDeliveredCursorRef`) theo `delta.nextCursor`.
  - Hợp nhất và lọc trùng tin nhắn (deduplication) theo `id` / `sequence`, bảo đảm thứ tự hiển thị tăng dần nghiêm ngặt.
  - Duy trì vị trí thanh cuộn thông minh: nếu người dùng đang ở gần đáy trang (<120px), tự động cuộn theo tin mới; nếu đang đọc tin nhắn lịch sử phía trên, giữ nguyên vị trí xem.
  - Xử lý đối soát và phục hồi mất kết nối trong khung soạn tin: khi gặp trạng thái `UNKNOWN`, hiển thị nút "Đối soát" (`companion-chat-reconcile-btn`) bên cạnh nút "Thử lại" (`companion-chat-retry-btn`). Khi đối soát xác nhận tin đã được ghi trên máy chủ, cập nhật giao diện thành công mà không lặp tin.
- `apps/web/src/app/trip-companions/companion.css`: Bổ sung styles cho `.companion-chat-reconcile-btn`.
- Unit tests: `companion-client.vitest.test.ts` (41 tests PASS), `companion-group.vitest.test.ts` (12 tests PASS).

**Integration evidence:**
- PostgreSQL disposable integration test: 11 files / 58 tests PASS (bao gồm 2 test PostgreSQL delta & reconciliation).
- Root typecheck (`npm run check-types`): 4/4 packages PASS.
- Production web build (`npm run build --workspace web`): 53 routes compiled cleanly.
- `git diff --check`: 0 errors.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

# 01: Công khai Trip đã lưu và xem giới thiệu

**What to build:** Chủ chuyến mở form từ Trip đã lưu, xem trước phần sẽ công khai và đăng thành công; người ngoài mở được giới thiệu đúng phạm vi cho phép.

**Blocked by:** None (can start immediately when assigned for implementation).

**Status:** IMPLEMENTED — BE, FE and integration verification complete locally.

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. The 2026-10-28 BE handoff prompt separately authorized TC-01 backend implementation.

**Source:** Approved travel-companions plan Q1, Q3, Q5, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Bổ sung dữ liệu công khai tối thiểu, tính duy nhất theo Trip, kiểm tra host/Trip đủ điều kiện, ghi idempotent và public projection. Chốt hợp đồng đầu tiên để FE dùng.

**FE part:** Form có dữ liệu Trip chỉ đọc, tiêu đề/giới thiệu/số chỗ/ảnh phù hợp, preview đúng góc nhìn Guest, trạng thái ghi và trang giới thiệu. Chưa thêm CTA tham gia giả khi hành vi chưa có.

**Completion-plan milestone 0 BE handoff (2026-10-28):** BE READY FOR FE under
`TC01-viewer-r1`: `getCompanionViewerContext` / authenticated GET
`/api/trip-companions/:publicationId/viewer`, strict HOST + private tripId or
VISITOR without private IDs. Current role/status and owner predicate, no Admin
bypass, works after departure/completion. Public DTO unchanged. 30 unit/HTTP/schema
PASS, 11 disposable PostgreSQL PASS, root types 4/4 PASS, whitespace PASS; 15
unchanged scoped migrations and 0 pending, no Development/Production operation.
FE host-return/copy follow-up remains OPEN; existing publication evidence remains
valid. Exact usage/fixtures in the delivery contract.

- [x] Chủ sở hữu công khai được Trip đã lưu còn đủ điều kiện; Guest, người không sở hữu và tài khoản khóa không có quyền ghi.
- [x] Ảnh/nội dung tự động chỉ lấy dữ liệu đủ điều kiện public; không lộ lịch từng giờ, nhu cầu/AI history, thông tin liên hệ, thành viên hay chat.
- [x] Một Trip không có hai bài/nhóm khi double-click hoặc retry; UNKNOWN đối soát cùng payload/key và chỉ báo thành công sau DB xác nhận.
- [x] Preview và trang giới thiệu thống nhất tên/avatar host, ngày, phương tiện, tuyến tóm tắt, lời giới thiệu và cách gọi số chỗ tìm thêm.
- [x] Có kiểm tra service/route và UI cho quyền truy cập, đầu vào, confirmed/FAILED/UNKNOWN; form giữ nội dung khi có thể phục hồi.

**Demo / verification:** Host đăng từ một Trip mẫu đủ điều kiện; Guest mở giới thiệu và không nhận dữ liệu riêng.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. TC-02 remains blocked.

**BE evidence:** Implemented locally: minimal unique publication + migration, active-owner context/preview/publish and allowlisted public introduction. Shared idempotency/transaction, current role/status and Vietnam-date eligibility checks. Disposable PostgreSQL 10/10 PASS (15 actual relevant migrations, 0 pending, owned container removed); final contract/type/build/regression evidence in [story](../../../docs/stories/TC-01-publish-public-introduction.md) and [delivery contract](../../../docs/implementation/trip-companions-delivery-contract.md). No Development/Production migration or UI change.

**FE evidence:** Implemented locally: `companion-client.ts`, `CompanionIntroductionView` component (`companion-introduction-view.tsx`), host publication form (`publication-form-client.tsx`, `page.tsx` under `/trips/[id]/publication`), public introduction page (`page.tsx`, `loading.tsx`, `not-found.tsx` under `/trip-companions/[id]`), and entry links from `TripDetailView`. Form provides read-only Trip context, length validation for title (1–200) and introduction (1–4000), capacity helper text, image options from eligible destination media, live Guest preview, and idempotent write submission preserving draft/key on UNKNOWN. No fake join CTA button. Plain-text rendering escapes markup. Scoped warm cream/forest green theme in `companion.css`. 21 client and UI tests PASS in `companion-client.vitest.test.ts` and `companion-ui.vitest.test.ts`.

**Integration evidence:** Full regression test suite **21 files / 197 tests PASS**, 11 skipped; disposable PostgreSQL suite `node scripts/test-trip-companions-postgres.mjs` **10/10 PASS** (0 pending migrations); `npm run test:idempotency --workspace web` **4/4 PASS**; root `npm run check-types` **4/4 packages PASS**; production build `$env:KLTN_PERF_BUILD='1'; npm run build --workspace web` **PASS** registering `/trips/[id]/publication` and `/trip-companions/[id]`; `git diff --check` **PASS**.

**Review-fix evidence (2026-10-28):** Owner requested fixing all three FE review findings. The form now requires a current Guest preview, discards outdated preview responses and freezes the complete attempted payload/key through pending/UNKNOWN, including stale image/input callbacks. Seven actual-handler regressions failed before and passed after the fix. Final related checks: 129 PASS/11 PostgreSQL skips; web typecheck, isolated local production build and whitespace PASS. This supersedes earlier claims that static markup/client tests alone proved preview confirmation and immutable UNKNOWN replay. No BE/API/schema/migration change, no new DB/browser acceptance, and no TC-02 work. Verification report is linked from the story/delivery contract.

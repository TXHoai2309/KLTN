# 02: Khám phá và lọc chuyến công khai

**What to build:** Người dùng vào kênh tìm bạn, tìm/lọc chuyến sắp đi theo ngày, phương tiện và còn chỗ, rồi mở trang giới thiệu.

**Blocked by:** TC-01 — Công khai Trip đã lưu và xem giới thiệu

**Status:** IMPLEMENTED LOCALLY — TC-02 vertical completed with real BE contract, full FE UI, navigation, filters, keyset pagination, and integration tests.

**Approval:** Owner approved the unchanged breakdown/edges and separately assigned the full BE task on 2026-10-28. Existing TC-01 vertical receipts plus completion-plan section 7 open this BE milestone; no owner acceptance claimed.

**Source:** Approved travel-companions plan Q3, Q7, Q14; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Đọc công khai có phân trang/thứ tự ổn định, lọc cùng một nguồn điều kiện public và số chỗ; cung cấp danh sách bài của host theo actor, không nhận owner override.

**FE part:** Navigation, phạm vi Khám phá/Tôi đăng, thẻ chuyến, tìm kiếm, bộ lọc, tải thêm và trạng thái loading/rỗng/lỗi; giữ bộ lọc khi đi-về chi tiết.

- [x] Danh sách chỉ hiển thị bài còn công khai, thuộc chuyến sắp đi đủ điều kiện; bài ẩn/hủy và dữ liệu bị ẩn không lọt vào kết quả.
- [x] Bộ lọc ngày khởi hành, phương tiện và còn chỗ kết hợp nhất quán; thứ tự mặc định theo ngày đi gần nhất, phân trang không lặp/mất bản ghi do thứ tự thiếu ổn định.
- [x] Guest dùng khám phá; Tôi đăng theo đúng tài khoản, không để tài khoản khác xem dữ liệu host riêng.
- [x] Nhãn chỗ là số chỗ tìm thêm, không đổi thành tổng số người của đoàn; khi không có kết quả có lối gỡ bộ lọc.
- [x] Desktop/mobile không tràn ngang; kiểm tra header ở desktop nhỏ, fixture/API đúng bộ lọc và điều hướng giữ ngữ cảnh.

**Demo / verification:** Guest lọc Xe máy và ngày đi, mở một chuyến, quay lại vẫn giữ bộ lọc.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. TC-03 remains blocked until FE/integration evidence is verified.

**BE evidence:** Actual public and actor-owned GET collections, combined strict
filters, literal public-route/title search, inclusive departure range, deterministic
date/ID keyset pagination and snapshot count/projection. Public allowlist and
current account/owner rules retained. Discovery unit/HTTP/schema 24 PASS; viewer
8 PASS; full related regression 253 PASS / 21 opt-in skips; disposable PostgreSQL
20 PASS (9 discovery + 11 TC-01/viewer), 15 existing migrations, 0 pending, cleanup
PASS. Root types 4/4 and idempotency 4/4 PASS. Combined-checkout build compiled then
failed on concurrently edited FE link to an absent list page; FE must rerun after
completion. No new schema/migration or Development/Production operation. Full
contract, commands/limits and next gate in the TC-02 story/delivery contract.

**FE evidence:** Complete Discovery page (`/trip-companions`), Client view (`companion-discovery-view.tsx`), CSS (`companion.css`), and header integration (`header.tsx`). Implemented client adapters `fetchPublicCompanions` and `fetchMyCompanionPublications` in `companion-client.ts`. Built full filter bar (keyword `q`, date range, transport, availableOnly), two-way reactive URLSearchParams binding, card grid with fallback image and route overview, keyset pagination, skeleton and empty states. Tested with Vitest (`companion-discovery.vitest.test.ts` 7/7 PASS, `header.vitest.test.ts` 12/12 PASS, `companion-client.vitest.test.ts` 20/20 PASS).

**Integration evidence:** Production build `npm run build --workspace web` compiled cleanly (52 static pages prerendered including `/trip-companions`, dynamic `/trip-companions/[id]`, `/api/trip-companions`, `/api/trip-companions/mine`). PostgreSQL integration runner `node scripts/test-trip-companions-postgres.mjs` passed 20/20 (including 9 TC-02 discovery tests on real PostgreSQL loopback container with 15 migrations, 0 pending). Typecheck `npm run check-types` 4/4 packages PASS. Shared idempotency 4/4 PASS. `git diff --check` PASS.


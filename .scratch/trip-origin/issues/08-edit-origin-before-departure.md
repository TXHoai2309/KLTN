# 08: Đổi nơi/giờ của chuyến đã lưu trước khởi hành

**What to build:** Chủ chuyến chưa khởi hành đổi nơi hoặc giờ đi/về, xem lịch tính lại và chỉ áp dụng sau xác nhận; việc hủy/lỗi không đổi hành trình chính thức.

**Blocked by:** 06 — Lưu và đọc chuyến có nơi xuất phát riêng tư

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [x] Saved-trip UI → separate candidate → server preview/Validator → explicit confirmation → fresh checks/transaction → readback hoàn chỉnh cho Trip đã có journey.
- [x] Chặn thao tác origin/time mới tại hoặc sau ngày+giờ khởi hành Việt Nam, hoặc khi manual-completed; kiểm tra trực tiếp trên mọi API apply path, không chỉ ẩn nút.
- [x] Giữ cách phân loại status theo ngày hiện hành; in-trip current-location workflows và completed-visit preservation không bị thay bằng sửa lại gốc chuyến.
- [x] Tính lại chặng/giờ/nghỉ và affected checks; giữ constraints/ownership và scope thay đổi đã được xác nhận, không âm thầm sửa ngày/điểm ngoài phạm vi.
- [x] Cancel/rejected/failure giữ canonical Trip; revision/role/data đổi sau preview bị phát hiện; DB confirmed success mới cập nhật UI.
- [x] UNKNOWN apply giữ đúng ý định/payload/key, không cho mutation mới né reconciliation; retries/concurrency không apply hai lần.
- [x] Service/HTTP/PostgreSQL và browser tests: trước/đúng/sau cutoff, manual completion, other-owner/member, cancel, stale revision/data, failed write và successful readback.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified locally; FE/integration: pending.** Ticket 10 remains vertical
acceptance pending. Không đổi triage thành ACCEPTED/DONE.
[Current contract, commands/evidence and limits](../06-10-backend-verification.md).

- Contract `journey-edit-v1`, POST /api/trips/[id]/journey/preview {baseRevision,journey}; response separate candidate (null if unknown clocks), journeyPlan and validation/eligibility. POST .../apply {baseRevision,confirmed:true,candidate}, Idempotency-Key. Existing mutation envelope; SUCCESS tripId/baseRevision/validation, owner readback canonical journey.
- Owner only; existing saved departure date+clock Vietnam controls cutoff, not proposed later time; at/after and manually-completed block. Role/revision/cutoff/canonical data rechecked inside Trip-lock/CAS transaction, routes outside. Dates/mode/day visit membership/order/duration preserved; only journey and derived visit clocks change.
- Errors JOURNEY_CHANGE_CLOSED/REVISION_CONFLICT (409), scope/validation/input/coverage (400/422), ownership404, unavailable503. Cancel/no apply writes nothing. Replay of committed same-key intent allowed after cutoff; changed payload/stale new-key cannot apply twice. Existing companion time-change notice stays origin-free.
- Actual disposable PG same-key race/commit/readback/stale version, cutoff crossing during route work, manual completion and non-owner evidence; ordinary unit boundary times/auth. FE preview-confirm-cancel/UNKNOWN/recovery/browser pending.

Final verification: expanded suites 1084 PASS / 29 opt-in-live skipped; separate disposable PostgreSQL search 5 PASS and journey Save/edit/privacy/legacy 10 PASS; root typecheck 4 tasks PASS, isolated webpack production build (56 pages) PASS, Guest smoke 7 APIs PASS, diff/links/hash checks PASS. Migrations applied only disposable; FE/browser/live vertical acceptance pending.

## FE handoff — 2026-11-04

**FE: verified; BE: verified.**
- Flow và Components:
  - Client transport: `apps/web/src/lib/trip-journey-edit-client.ts` (`previewJourneyEditClient` gọi `POST /api/trips/[id]/journey/preview`, `applyJourneyEditClient` gọi `POST /api/trips/[id]/journey/apply` có `Idempotency-Key`).
  - Modal chỉnh sửa: `TripJourneyEditModal` (`apps/web/src/components/trip-origin/trip-journey-edit-modal.tsx`) tách biệt rõ ràng 2 bước: Xem trước phương án (preview) → Xác nhận & Cập nhật (apply). Bấm Hủy bỏ giữ nguyên Trip hiện hành.
  - Xử lý UNKNOWN / Retry: Khi gặp sự cố mạng hoặc trạng thái UNKNOWN, modal giữ nguyên exact idempotency key và candidate để người dùng bấm "Thử lại xác nhận" mà không sinh payload hay key mới.
  - Giao diện: Tích hợp nút "Đổi nơi/giờ xuất phát" vào `TripDetailView` cho chuyến UPCOMING của chủ chuyến; chuyến COMPLETED bị ẩn nút và backend từ chối trực tiếp nếu cố tình gọi API.
- Tests: `apps/web/src/lib/trip-journey-edit-client.vitest.test.ts` (4/4 PASS), `apps/web/src/components/trip-origin/saved-journey-view.vitest.test.ts` (Ticket 08 assertions: PASS).

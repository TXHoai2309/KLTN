# 09: Bổ sung nơi xuất phát cho chuyến cũ

**What to build:** Chủ chuyến cũ chưa có origin vẫn đọc/sửa visit như trước và có thể chủ động bổ sung origin trước chuyến để nhận phương án tính đủ đi/về.

**Blocked by:** 08 — Đổi nơi/giờ của chuyến đã lưu trước khởi hành

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Legacy null/missing origin đọc được với disclosure chưa tính đi/về, không bịa tên/tọa độ/giờ và không tự update khi mở trang.
- [ ] Ordinary visit edits của legacy tiếp tục qua kiểm tra hiện hành; không bắt origin chỉ để sửa visit và không tuyên bố itinerary đã được kiểm tra hai chặng.
- [ ] Explicit opt-in dùng bộ chọn/time inputs chung; yêu cầu đủ thông tin, tính/kiểm tra toàn chuyến rồi preview-confirm-apply-readback; không áp new-save requirement hồi tố lên thao tác khác.
- [ ] Legacy thiếu departure clock dùng 00:00 ngày bắt đầu làm cutoff cho opt-in; manual completion chặn. Kiểm tra lại cutoff phía server trước apply, không chỉ khi mở form.
- [ ] Giữ cancellation/revision/idempotency/UNKNOWN và privacy từ ticket sửa/lưu; không migration backfill dữ liệu giả hoặc cấp quyền origin cho member.
- [ ] Fixture legacy trước/sau additive migration và PostgreSQL riêng chứng minh đọc/edit giữ nguyên dữ liệu, opt-in trước cutoff thành công và sau cutoff bị chặn.
- [ ] Browser/API tests bao phủ legacy ordinary edit, incomplete opt-in, successful confirmation/readback, cancel/failure và member/direct forged apply.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified locally; FE/integration: pending.** Ticket 10 remains vertical
acceptance pending. Không đổi triage thành ACCEPTED/DONE.
[Current contract, commands/evidence and limits](../06-10-backend-verification.md).

- Legacy Trip read keeps journey:null and no backfill. getTripForEdit adds optional journeyDisclosure ORIGIN_LEGS_NOT_INCLUDED / SAVED_JOURNEY_PRESENT; Assistant saved-trip strict schema accepts only this additive disclosure, not private origin.
- Ordinary legacy visit preview/apply/replay still runs existing checks without any origin requirement (actual PostgreSQL receipt). Opt-in uses journey-edit-v1 preview/apply above with complete input, fresh whole-journey checks and legacy 00:00 Vietnam start-date cutoff.
- Actual PG preview/cancel preserves null; before-cutoff opt-in succeeds/readback; at cutoff denied. Existing dates/status labels unchanged. New journey gate is never applied to ordinary legacy visit edits. FE disclosure/opt-in/manual fallback/browser pending.

Final verification: expanded suites 1084 PASS / 29 opt-in-live skipped; separate disposable PostgreSQL search 5 PASS and journey Save/edit/privacy/legacy 10 PASS; root typecheck 4 tasks PASS, isolated webpack production build (56 pages) PASS, Guest smoke 7 APIs PASS, diff/links/hash checks PASS. Migrations applied only disposable; FE/browser/live vertical acceptance pending.

# 06: Lưu và đọc chuyến có nơi xuất phát riêng tư

**What to build:** Chủ chuyến xác nhận lưu phương án đã đủ kiểm tra rồi đọc lại nơi/giờ và lịch chính thức; member/public vẫn đọc phần được phép mà không nhận nơi xuất phát riêng tư.

**Blocked by:** 05 — Hỗ trợ ngày đầu/cuối chỉ di chuyển

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Luồng Save UI → auth/ownership → fresh canonical destination/revision/routing/Validator → transaction → DB acknowledgement → owner read hoạt động; không dùng eligible/route metrics do client tự gửi làm authority.
- [ ] Thông tin origin/giờ, chặng và chính sách cần thiết giữ nhất quán qua proposal conversion và persistence; additive migration tương thích null legacy, không backfill giả và không persist invalid itinerary dài hạn.
- [ ] Chỉ owner nhận tên/address/coordinates/geometry/leg data liên quan origin; member/public/Admin khác không có bypass và không nhận tổng có thể tiết lộ dữ liệu đó; giữ quyền đọc lịch tham quan hiện có.
- [ ] SUCCESS sau DB xác nhận; FAILED/UNKNOWN rõ. UNKNOWN giữ đúng payload/key và khóa mutation tương ứng; replay thành công và changed-payload conflict không tạo trùng Trip.
- [ ] Reauthorize/revalidate trước ghi, phát hiện data/role/revision thay đổi sau preview; không giữ external routing HTTP trong transaction database.
- [ ] Owner saved view hiển thị đủ giờ/chặng/tổng chạy xe/nghỉ, legacy view disclosure thiếu origin; auth navigation không tự lưu.
- [ ] PostgreSQL disposable kiểm chứng migration/transaction/concurrent replay/cleanup; API tests kiểm tra forged requests và canary privacy qua owner/member/public; browser xác minh lưu rồi đọc lại, lỗi giữ candidate.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified locally; FE/integration: pending.** Ticket 10 remains vertical
acceptance pending. Không đổi triage thành ACCEPTED/DONE.
[Current contract, commands/evidence and limits](../06-10-backend-verification.md).

- Contract `journey-save-v1`, existing POST /api/trips + GET /api/trips/[id]. Complete origin-v1 journey, exact date and fresh canonical routes/visit clocks/Validator required. Confirmation/schema checked in service too. SUCCESS/FAILED/UNKNOWN + same-key/payload reconciliation unchanged.
- Additive migration `20261104130000_trip_journey_snapshot`, nullable Trip.journeySnapshot JSONB, no legacy backfill. Persist validated journey, roadside-rest-v1 plan and visit fingerprint; owner read adds journey + baseRevision. Member/public/summary omit origin/legs/geometry/totals; unrelated Admin no bypass. Changed ordinary visit fingerprint withholds stale plan as null while preserving origin.
- New-save temporary gate from 01 is replaced by fresh authoritative Save/persistence. Missing input/route still fails closed. Form/Assistant can advertise final eligibility only for actual complete PASS; Save always rechecks.
- PostgreSQL actual concurrency/replay/lost-ack UNKNOWN/privacy/rollback evidence; 25 scoped migrations incl both origin migrations up-to-date, zero pending, disposable cleanup PASS. Shared DB migration not applied. FE confirm/reconcile/readback/browser pending.

Final verification: expanded suites 1084 PASS / 29 opt-in-live skipped; separate disposable PostgreSQL search 5 PASS and journey Save/edit/privacy/legacy 10 PASS; root typecheck 4 tasks PASS, isolated webpack production build (56 pages) PASS, Guest smoke 7 APIs PASS, diff/links/hash checks PASS. Migrations applied only disposable; FE/browser/live vertical acceptance pending.

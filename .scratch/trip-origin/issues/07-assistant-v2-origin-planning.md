# 07: Lập và tinh chỉnh chuyến qua Assistant V2

**What to build:** Người dùng lập chuyến trong Assistant V2 bằng nơi xuất phát đã xác nhận, xem lịch tính đủ chặng/nghỉ, chỉnh nhu cầu rồi xác nhận lưu riêng bằng cùng engine với form.

**Blocked by:** 06 — Lưu và đọc chuyến có nơi xuất phát riêng tư

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Dùng bộ chọn chung; nếu ticket search đã có thì tái sử dụng, nếu chưa thì luồng ghim thủ công vẫn demo hoàn chỉnh. Không bắt buộc search provider để dùng Assistant.
- [ ] Hiểu tên/giờ trong hội thoại không biến thành tọa độ do AI đoán; structured origin action khác in-trip current location. Hỏi đúng input còn thiếu; không buộc đủ mọi optional preference trước preliminary.
- [ ] Needs/review/checkpoint/refinement/proposal version và save payload giữ đủ origin/giờ/chính sách. Đổi origin/giờ tính lại qua cùng Planner/Validator, không cho save proposal superseded.
- [ ] Cùng fixture requirement/route qua form và Assistant tạo lịch/checks nhất quán; AI chỉ đề xuất/diễn đạt, không quyết định PASS hoặc substitute missing route.
- [ ] Q&A interruption giữ nhu cầu/candidate; current proposal không mutate ngoài yêu cầu rõ. Reload/expired proposal và UNKNOWN theo lifecycle hiện hành, không auto-regenerate/auto-save.
- [ ] Full-page và floating entry hiển thị picker, thiếu dữ liệu, ngày travel-only và action xác nhận; keyboard/mobile/error retry giữ dữ liệu, Guest không vào planning riêng.
- [ ] Test qua Assistant V2 HTTP/session hiện có và browser: create → refine → QA → explicit save/read; stale token/version, UNKNOWN, auth change và provider failures không bypass ownership/write contract.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified locally; FE/integration: pending.** Ticket 10 remains vertical
acceptance pending. Không đổi triage thành ACCEPTED/DONE.
[Current contract, commands/evidence and limits](../06-10-backend-verification.md).

- Existing POST /api/ai/planning, ASSISTANT_V2 operation ORIGIN, payload sessionId/stateToken/journey; journey nullable origin-v1. Distinct from in-trip LOCATION; in-trip ORIGIN unsupported. Shared encrypted capsule/head CAS/auth/key/version lifecycle retained.
- Structured origin action validates coverage, reviews/generates/refines through existing canonical services and shared form scheduler. Failed/rejected refinement preserves canonical; UNKNOWN freezes origin mutation. No auto-Save or AI-generated coordinates. Text needs alone do not place a pin.
- Needs/checkpoint/capsule/version/fingerprint/proposal/save adapters retain journey. Q&A interruption test preserves needs/proposal/version. Form/Assistant actual schedule/checks/leg parity tested. Existing SAVE delegates fresh canonical Save + pending intent/replay.
- Fixtures/contracts under modules/trip-origin; operation/error shape at HTTP/session tests. FE full-page/popup picker/transport and browser interruption/recovery pending; no UI files changed.

Final verification: expanded suites 1084 PASS / 29 opt-in-live skipped; separate disposable PostgreSQL search 5 PASS and journey Save/edit/privacy/legacy 10 PASS; root typecheck 4 tasks PASS, isolated webpack production build (56 pages) PASS, Guest smoke 7 APIs PASS, diff/links/hash checks PASS. Migrations applied only disposable; FE/browser/live vertical acceptance pending.

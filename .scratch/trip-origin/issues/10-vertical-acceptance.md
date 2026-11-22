# 10: Nghiệm thu toàn luồng form và Assistant

**What to build:** Chứng minh bộ tính nơi xuất phát hoạt động nhất quán xuyên suốt form, Assistant, lưu/đọc/sửa và chuyến cũ; bàn giao kết quả cùng giới hạn thực tế thay vì chỉ báo test unit PASS.

**Blocked by:** 02 — Tìm nơi xuất phát bằng Nominatim; 07 — Lập và tinh chỉnh chuyến qua Assistant V2; 09 — Bổ sung nơi xuất phát cho chuyến cũ

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Mỗi ticket trước phải có kiểm chứng riêng; ticket này bổ sung hành trình tích hợp, không dồn toàn bộ unit/service/security tests đến cuối.
- [ ] Browser desktop/mobile/keyboard: search hoặc manual → confirm pin/time → proposal → refine → explicit Save → read → pre-departure edit; cả full Assistant/floating entry và legacy opt-in.
- [ ] Chứng minh cùng input/evidence cho form/chat ra cùng checks/totals; one-day, multi-day, travel-only, nghỉ ngưỡng, route thiếu, deadline/overnight và must-visit preservation.
- [ ] PostgreSQL ownership-guarded runner kiểm tra migration state, shared admission nhiều worker, concurrency và idempotent UNKNOWN; không dùng shared Development/Production làm fixture mặc định.
- [ ] Owner/member/public/Guest/Admin và direct HTTP chứng minh private origin không lọt; data/role/revision/cutoff đổi giữa preview và apply không bypass fresh checks.
- [ ] Chạy typecheck/build/tests phù hợp, whitespace/secrets/unrelated diff review; ghi rõ browser/provider/AI/routing fixtures, live evidence, giới hạn chưa chứng minh và nhóm chưa chạy.
- [ ] Update story/progress/verification theo kết quả thực tế; không tự đánh ACCEPTED sản phẩm, push/merge, áp shared migration hoặc deploy. Live Nominatim không bị load test và manual fallback hoạt động khi dịch vụ bị giới hạn.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified locally; FE/integration: pending.** Ticket 10 remains vertical
acceptance pending. Không đổi triage thành ACCEPTED/DONE.
[Current contract, commands/evidence and limits](../06-10-backend-verification.md).

- BE integration evidence delivered; vertical acceptance remains PENDING. Do not close this ticket from backend receipts. Local expanded service/HTTP/session tests, actual PostgreSQL 5 search + 10 Save/edit/privacy/legacy cases, migration state and cleanup recorded in consolidated receipt.
- Search multi-worker is three independent OS processes; shared cache and timeout/death cooldown checked. Save/apply race and committed-but-response-lost UNKNOWN/replay verified against actual PG, no duplicate. Owner/member/public canaries and canonical-data/cutoff rechecks covered.
- Both origin migrations created, only applied disposable; combined scoped ledger 25 migrations/zero pending. Root typecheck/build and production Guest smoke separately recorded. Full-repo Vitest initial attempt NOT green; no unsupported claim for full regression or deployed acceptance.
- Expected outputs/fixtures/service tests handed to FE; no browser run or authenticated deployed/real AI/routing/Nominatim success claimed. Manual/search/form/Assistant/responsive/keyboard/UNKNOWN live integration remains FE + integration scope. Shared migrations/contact configuration/deploy need separate instruction.

Final verification: expanded suites 1084 PASS / 29 opt-in-live skipped; separate disposable PostgreSQL search 5 PASS and journey Save/edit/privacy/legacy 10 PASS; root typecheck 4 tasks PASS, isolated webpack production build (56 pages) PASS, Guest smoke 7 APIs PASS, diff/links/hash checks PASS. Migrations applied only disposable; FE/browser/live vertical acceptance pending.

# 05: Hỗ trợ ngày đầu/cuối chỉ di chuyển

**What to build:** Người dùng có thể dành ngày đầu chỉ đi hoặc ngày cuối chỉ về; lịch hiển thị rõ giờ, chặng và mốc định tuyến thay vì ép tạo điểm tham quan hoặc giả định khách sạn.

**Blocked by:** 04 — Lập chuyến nhiều ngày có tính chặng đầu/cuối

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Ngày đầu chỉ đi dùng điểm tham quan đủ điều kiện đầu tiên ngày tiếp theo làm mốc đến đã ghi rõ; không tạo visit ngày đầu, không tính lại origin inbound ngày sau.
- [ ] Ngày cuối chỉ về dùng điểm tham quan cuối ngày trước làm mốc xuất phát; thu thập giờ bắt đầu về rõ ràng, không mặc định 08:00; chưa có giờ thì chặn final confirmation/save mới.
- [ ] Nếu ngày cuối còn tham quan, tự về ngay sau visit cuối, không hỏi thêm giờ bắt đầu; mọi trường hợp đều phải tính nghỉ và tới origin không muộn hơn deadline.
- [ ] UI/day DTO phân biệt travel-only đã có đủ chứng cứ với empty day do thiếu dữ liệu; totals/checks/route geometry đúng, không cộng return ngày trước rồi cộng lại ngày cuối.
- [ ] Disclosure nêu mốc định tuyến không phải nơi nghỉ/booking và chưa có đường ra/vào lodging; không phát minh tọa độ qua đêm hoặc điểm tham quan mới.
- [ ] Chặn overnight-driving bằng cả thời gian lái và nghỉ; toàn chuyến không còn tham quan thì báo chưa khả thi, thiếu route thì chưa đủ dữ liệu.
- [ ] Browser và Planner/Validator behavior tests chứng minh outbound-only day, return-only day, cả hai, một ngày, boundary midnight/deadline, missing return start time và bảo toàn constraints.

**Verification receipt:** Khi được phép triển khai, ghi checks thực chạy, migration state nếu có, browser/live giới hạn và git diff --check. Hiện chưa có implementation/evidence hoàn thành.


## BE handoff — 2026-11-04

**BE: verified; FE/integration: pending.** Không đổi ready-for-agent thành
ACCEPTED/DONE. [Contract/behavior/evidence/limits](../03-05-backend-verification.md).

- Contract `origin-v1` + `roadside-rest-v1`. Existing POST
  `/api/trip-proposals`, `requirement.journey`; thêm optional `journeyPlan` gồm
  typed origin/attraction endpoints, legs/routes/clocks/rest và totals. Day thêm
  optional `journeyDayKind`; existing check keys/envelope/timezone giữ nguyên.
- Unknown clocks/metrics/totals giữ null, không dùng 0 hoặc AI estimate thay route.
  `Asia/Ho_Chi_Minh`; không driving sang ngày sau. Independent deterministic
  check dùng cùng rest policy; provenance policy ở journeyPlan.
- Preliminary only; `eligibleForFinalConfirmation=false` và new Save gate của
  ticket 01 giữ tới 06. Không write/UNKNOWN business operation mới trong slice;
  historical Save receipt contract giữ nguyên. Không thêm member/public projection.
- Origin routing endpoint riêng, Stadia adapter hiện hành, <=10 giây cho cả chain,
  <=3 in flight, tối đa 29 routes/28 attractions. Không routing trong DB transaction.
- Client-safe fixture builders: `journey-planning-fixtures.ts`; complete/missing
  payloads qua schema. Multi-day/travel-only expected outputs trong behavior
  suites `journey-multi-day.vitest.test.ts` và `journey-travel-only.vitest.test.ts`.
- Coverage: one-day/rest/HTTP, multi-day budget/reset/totals, boundary-day
  anchors/clock/no-duplicate và regression suite thực chạy; xem receipt.
  Không schema/migration mới. UI/browser/live provider chưa chạy/chưa được coi PASS.
- FE còn: timeline hai chặng, daily maps/geometry, tách driving/rest/elapsed,
  travel-only vs EMPTY, return-only clock, insufficient/violation disclosures và
  lodging limitation. Không sửa components/CSS/client controllers trong BE slice.

**Current follow-up:** temporary new-save gating/preliminary-only notes above describe the initial milestone. [BE 06–10](../06-10-backend-verification.md) now supplies authoritative fresh Save/persistence and complete journey final eligibility; missing required data still never passes. FE/integration remains pending.

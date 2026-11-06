# 04: Lập chuyến nhiều ngày có tính chặng đầu/cuối

**What to build:** Người dùng xem lịch nhiều ngày trong đúng tổng ngày đã chọn; chặng đi ảnh hưởng ngày đầu và chặng về ảnh hưởng ngày cuối, các ngày giữa vẫn tuân thủ tuyến và kiểm tra hiện hành.

**Blocked by:** 03 — Lập chuyến một ngày có cả đi, tham quan và về

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Ngày đi và về nằm trong duration đã chọn, không tự thêm ngày; ticket này xử lý các ngày có tham quan, còn travel-only được hoàn thiện ở ticket kế tiếp.
- [ ] Origin inbound tính một lần ngày đầu, return một lần ngày cuối; cross-day transfer dùng cơ chế hiện hành và disclosure chưa tính lodging, không diễn giải thành đã biết khách sạn.
- [ ] Nghỉ cộng đúng theo thời gian lái trong ngày, reset qua ngày, bảo toàn giờ mở cửa/minimum duration/khung tham quan và must-visits.
- [ ] Giữ tối đa 28 điểm; mở rộng routing budget dự kiến tối đa 29 cặp cùng deadline tối đa 10 giây và tối đa ba request in flight, không fallback AI/route thiếu.
- [ ] Tổng ngày/chuyến, route legs và check results dùng cùng dữ liệu, không có chặng origin bị cộng thêm vào ngày thứ hai hoặc return vào mọi ngày.
- [ ] Không thể xếp lịch thì phân biệt violation với missing evidence; không gọi heuristic chưa tìm ra tuyến là chứng minh không tồn tại mọi tuyến khả thi.
- [ ] Kiểm chứng qua Planner HTTP/service và browser days/totals: 2–n ngày, cross-day arrival, ngày giờ thiếu, thay origin, thay deadline; vẫn preliminary và chưa tự lưu.

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

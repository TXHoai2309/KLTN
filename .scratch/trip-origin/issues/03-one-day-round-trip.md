# 03: Lập chuyến một ngày có cả đi, tham quan và về

**What to build:** Từ nơi xuất phát đã xác nhận, người dùng xem một đề xuất một ngày tính đủ đi, tham quan, nghỉ tự động và quay về trước hạn; thời gian và kiểm tra hiển thị từ cùng dữ liệu phía server.

**Blocked by:** 01 — Chọn nơi xuất phát thủ công và nhập giờ đi/về

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [ ] Origin là endpoint riêng, không giả Destination; routing Stadia theo đúng ô tô/xe máy, hướng tuyến xét origin, dùng cùng thời hạn tối đa 10 giây và giới hạn đồng thời hiện hành.
- [ ] Tính thời gian đi → các lượt tham quan → về trong một ngày Việt Nam; tham quan trong 08:00–18:00 và giờ mở cửa, đủ minimum duration. Đi/về ngoài khung tham quan được phép nhưng không sang ngày sau.
- [ ] Nghỉ tự động: ô tô 15 phút sau mỗi 120 phút lái, xe máy 15 phút sau mỗi 90 phút; cộng dồn các chặng, visit từ 15 phút reset, không nghỉ cuối endpoint khi không còn lái. Scheduler và Validator dùng cùng chính sách.
- [ ] UI tách chạy xe/nghỉ/tổng, có hai chặng biên và đủ time checks; không cộng lặp route hay nghỉ. Không yêu cầu nhập thời gian nghỉ.
- [ ] Missing route/date/hours/minimum đúng INSUFFICIENT_DATA, không thay bằng 0 hoặc AI/Haversine; known deadline/overnight violation đúng VIOLATION. Không có thời gian tham quan thì báo phương án không khả thi.
- [ ] Giữ must-visit/ngày/phương tiện đã xác nhận; lỗi khả thi gợi ý user điều chỉnh, không tự cắt nghỉ hoặc bỏ constraint. Candidate chưa được lưu chính thức cho tới ticket lưu.
- [ ] Test qua Planner service/HTTP và browser proposal: trước/đúng/sau ngưỡng nghỉ, visit ngắn/đủ 15 phút, deadline bằng/vượt, malformed/timeout routing, origin khác làm đổi lịch; không test helper implementation.

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

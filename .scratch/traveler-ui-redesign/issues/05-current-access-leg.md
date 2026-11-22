# 05: Chặng tiếp cận hiện hành: chi phí, mục ghim và chuyến lưu cùng một con số

**What to build:** `AccessLegPart` có `id`; bảng chi phí ghi `accessLegId`; thẻ chặng tiếp cận có id khác bản hiện hành bị làm mờ, có nhãn "Đã có bản mới" và không ghim được; mục ghim `ACCESS` và lưu chuyến luôn dùng bản hiện hành; chuyến đã lưu giữ nguyên bản cũ; dòng chi phí liệt kê giá từng đoạn.

**Blocked by:** Không có

**Status:** done

**Nguồn:** [PARITY BR-1–BR-5, US 1–5](../../../docs/stories/ASSISTANT-TRIP-TIMELINE-PARITY.md)

- [x] Unit: `buildAccessLeg` sinh id; `estimateCosts` ghi `accessLegId` của bản đã cộng.
- [x] Gọi `planAccessLeg` hai lần → thẻ đầu mờ, không có nút ghim; tổng ở dòng chi phí, mục ghim và chuyến lưu bằng nhau (PARITY AC-1).
- [x] Lưu xong, tạo chặng mới → chuyến đã lưu giữ tổng cũ tới khi lưu lại (PARITY AC-2).
- [x] Test trip-pin, trip-save và access-leg hiện có PASS.

**Bằng chứng kiểm tra (2026-11-23):**
- `npx vitest run src/modules/trip-save src/modules/tripsage-chat/tripsage-current-access-leg.vitest.test.ts src/modules/tripsage-chat/tripsage-access-leg-flights.vitest.test.ts src/modules/tripsage-chat/tripsage-cost.vitest.test.ts src/modules/tripsage-chat/tripsage-concierge-timeline.vitest.test.ts src/components/tripsage-chat`: PASS (24 files passed, 1 skipped postgres integration; 142/142 tests PASS).
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.

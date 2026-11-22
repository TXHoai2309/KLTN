# 16: Chip tiết kiệm khi vượt ngân sách và nhãn sở thích trên lịch

**What to build:** Khi tổng vượt ngân sách, trợ lý đưa 2–3 chip kèm số tiền tiết kiệm ước tính lấy từ bảng giá tham khảo hoặc kết quả tra cứu đã có (đổi máy bay sang xe khách, hạng phòng rẻ hơn, bớt một ngày); không tự đổi lịch. Sở thích đã nói thành nhãn: "săn mây" trên điểm phù hợp kèm giờ sáng sớm, "ăn đặc sản" thành gợi ý ăn ghi rõ món, chỉ khi tài liệu địa phương có dữ liệu.

**Blocked by:** 02

**Status:** done

**Nguồn:** [slim D21–D22, BR-5, BR-6](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md)

- [x] Vượt ngân sách → ≥2 chip có số "ước tính"; bấm chip gửi đúng yêu cầu (slim AC-7, BR-5).
- [x] Có dữ liệu săn mây trong tài liệu đã duyệt → ít nhất một điểm có nhãn và giờ sáng sớm; không có dữ liệu → không gắn (slim AC-8).
- [x] Nhãn không làm đổi giờ và không vào Constraint Validator (BR-6).
- [x] Unit test tính số tiết kiệm từ bảng giá tham khảo.

## Bằng chứng

- Bổ sung `SAVINGS_REFERENCE` và `computeBudgetSavingsChips` vào `apps/web/src/modules/tripsage-chat/tripsage-cost.ts` (giữ nguyên client bundle allowlist): khi `cost.withinCap === false && overBy > 0`, tính 2–3 chip giảm chi phí kèm nhãn `"ước tính"` lấy từ bảng giá tham khảo và chi phí/chặng tiếp cận hiện tại; không tự đổi lịch cho tới khi bấm chọn.
- Nối chip tiết kiệm vào `TripsageCostCard` (`tripsage-cost-card.tsx`), `TripsageChatClient` (`tripsage-chat-client.tsx`), và trả về `savingsOptions` trong `estimateCosts` (`tripsage-chat-tools.ts`).
- Tạo `apps/web/src/modules/tripsage-chat/tripsage-preference-labels.ts` (`detectStatedPreferences`, `buildGroundedPreferenceLabels`, `preferenceLabelsToSuggestions`) và nối vào `proposeItinerary` (`tripsage-chat-tools.ts`): chỉ gắn nhãn `"Săn mây"` (kèm giờ sáng sớm) và gợi ý `"Ăn đặc sản"` khi tài liệu địa phương đã duyệt (`ctx.knowledge`) có dữ liệu; không đổi giờ lịch trình và không đưa vào Constraint Validator.
- Lệnh kiểm tra:
  - `npx vitest run src/modules/tripsage-chat/tripsage-budget-preferences.vitest.test.ts src/modules/tripsage-chat/tripsage-cost.vitest.test.ts src/components/traveler-ui src/components/tripsage-chat`: PASS (15 files, 73/73 tests).
  - `npx tsc --noEmit` (trong `apps/web`): PASS.
  - `git diff --check`: PASS.

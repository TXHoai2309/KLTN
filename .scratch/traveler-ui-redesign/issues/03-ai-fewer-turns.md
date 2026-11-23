# 03: Luồng AI bớt 2 lượt: không hỏi quận cho người ở xa, không hỏi lại ngày đã nêu

**What to build:** Khi thành phố nhà ở xa, `findOrigin` không trả ứng viên nằm trong thành phố nhà; trợ lý hỏi ngay cách ra điểm tập kết kèm 3 chip (máy bay · tàu · xe khách). Khi người dùng đã nêu ngày, không có lượt riêng để xác nhận ngày: lập lịch luôn, ngày tạm hiểu hiện kèm chip "Đổi ngày". Chặn ở server, không chỉ dựa vào persona.

**Blocked by:** Không có

**Status:** done

**Nguồn:** [slim D17–D18](../../../docs/stories/TRAVELER-UI-SLIM-REDESIGN.md)

- [x] Unit: homeCity Đà Nẵng hoặc TP Hồ Chí Minh → `findOrigin` không trả Ngũ Hành Sơn, Bà Nà Hills, Cầu Rồng…; có câu hỏi phương tiện ra điểm tập kết kèm 3 chip.
- [x] Unit: người dùng đã nêu "khoảng 12/12" và cách đi → không có lượt chỉ để hỏi "Chốt ngày…?"; `proposeItinerary` chạy ngay trong lượt đó.
- [x] Kịch bản slim AC-5 (4 người Đà Nẵng, xe máy, 12/12, bay rồi xe khách) ra bản lịch ở lượt thứ hai trở xuống.
- [x] Persona cập nhật khớp với chặn phía server; test origin và flex-origin hiện có PASS.

**Bằng chứng kiểm tra (2026-11-23):**
- `npx vitest run src/modules/tripsage-chat` (43 files, 396/396 tests PASS, gồm 5 test mới trong `tripsage-fewer-turns.vitest.test.ts` + 20 origin + 5 date + 3 flex-origin).
- `npm run check-types`: PASS (4/4 packages).
- `git diff --check`: PASS.

**Cập nhật hậu triển khai đợt 2 (2026-11-23 — Lỗi 1, commit `bcb603f`, từ trace `6fe7696a`):**
- Trace prod `6fe7696a` cho thấy model đã gọi `confirmOrigin({ candidateId: "hub:HA_GIANG_CITY" })` ngay ở lượt 1 nhưng bị server chặn `ORIGIN_CONFIRMATION_REQUIRED` vì câu dài > 160 ký tự và nhắc cả Hà Nội lẫn TP Hà Giang (`"bay ra Hà Nội rồi đi xe khách lên TP Hà Giang, thuê xe máy ở đó"`).
- Bổ sung `statedFixedHubId` trong `tripsage-chat-origin.ts` và nối vào `permitsOriginConfirmation`: tự động cho phép `confirmOrigin` cùng lượt khi tin nhắn nêu rõ hub cố định kèm động từ di chuyển/thuê xe (`hub:HA_GIANG_CITY` ưu tiên khi có chuỗi trung chuyển tới TP Hà Giang), vẫn chặn khi câu mơ hồ (`"chắc đi Hà Giang"`). Cập nhật persona trong `tripsage-chat-service.ts`.
- Unit + HTTP test trong `tripsage-fewer-turns.vitest.test.ts` (7/7 PASS) + toàn bộ nhóm origin (5 files, 37/37 PASS).

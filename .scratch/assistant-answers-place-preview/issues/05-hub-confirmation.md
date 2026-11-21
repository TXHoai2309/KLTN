# 05: Xác nhận điểm tập kết ngay lần đầu

**What to build:** Du khách ở xa (ví dụ TP.HCM) đồng ý tập kết ở Hà Nội thì điểm tập kết (Trip hub) được xác nhận ngay ở lượt đồng ý hoặc lượt bấm nút, và lịch tiếp theo xuất phát từ điểm tập kết, không từ nơi xuất phát cũ. Hiện người dùng bấm ba lần vẫn bị báo "chưa xác nhận được" và lịch vẫn xuất phát từ địa chỉ cũ.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (user story 16–17, mục "Lỗi lập lịch").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Chẩn đoán trước: tái hiện bằng test route chat với model giả lập (đã có nơi xuất phát xác nhận ở Hà Nội, người dùng đổi sang tập kết Hà Nội / TP Hà Giang) và ghi lại vì sao `confirmOrigin` với hub cố định thất bại.
- [x] Sửa ở gốc: `confirmOrigin` với hub cố định thành công ở lượt đồng ý, thay nơi xuất phát cũ; chặng tiếp cận (Access leg) và `homeCity` được ghi như chỉ dẫn hiện có.
- [x] Lịch kế tiếp dùng điểm tập kết làm nơi xuất phát của phần lịch được kiểm tra.
- [x] Test hồi quy cho cả hai hub cố định.
- [x] Typecheck, vitest tripsage-chat và trip-origin, `git diff --check` sạch.

## Ghi chú hoàn thành

- **Nguyên nhân gốc (đã tái hiện FAIL 3/3 trước khi sửa):**
  1. `HUB_CHOICE_CUE` trong `tripsage-chat-origin.ts` chỉ nhận `diem tap ket` chứ không nhận `tap ket` / `xuat phat tu` / `dung` / `doi sang`, nên các câu và nút phổ biến như `"Tập kết ở Hà Nội"`, `"Đúng, tập kết ở Hà Nội"`, `"Tập kết ở TP Hà Giang"`, `"Xuất phát từ TP Hà Giang"` đều bị `permitsOriginConfirmation` từ chối với `ORIGIN_CONFIRMATION_REQUIRED`.
  2. `FOLDED_NEGATION` chứa `doi sang|doi thanh|doi diem` áp cho cả nhánh chọn hub cố định, khiến câu `"Đổi sang tập kết Hà Nội"` / `"Đổi sang TP Hà Giang"` bị coi là phủ định và bị chặn.
  3. `HUB_KEYWORDS["hub:HA_GIANG_CITY"]` chứa từ trần `"ha giang"`, nên khi người dùng chọn Hà Nội nhưng nhắc tới chuyến đi Hà Giang (`"Đồng ý tập kết ở Hà Nội để đi Hà Giang"`), `matchesOther` trả `true` và từ chối xác nhận hub Hà Nội.
- **File đã đổi:**
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-origin.ts`: tách `HARD_FOLDED_NEGATION` và `SWITCH_AWAY_NEGATION` (chỉ chặn `doi sang` khi xác nhận ứng viên `fromPreviousTurn`); mở rộng `HUB_CHOICE_CUE` với `tap ket`, `xuat phat tu`, `dung`, `doi sang/chuyen sang`; thay đối khớp thô bằng `mentionsHub` phân biệt rõ `TP Hà Giang` / cụm chọn hub Hà Giang với tên điểm đến "đi Hà Giang" trong cùng câu.
  - `apps/web/src/modules/tripsage-chat/tripsage-chat-hub-confirmation.vitest.test.ts`: 3 test hồi quy cho cả hai hub cố định (`hub:HA_NOI` và `hub:HA_GIANG_CITY`), kiểm tra thay thế nơi xuất phát cũ, `planAccessLeg` + `homeCity`, và lịch kế tiếp xuất phát từ hub.
- **Kiểm tra đã chạy:**
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .`: PASS.
  - `npx vitest run src/modules/tripsage-chat src/modules/trip-origin`: 44 passed, 2 skipped (Postgres integration `DOCKER_OFF`), 436 tests PASS.
  - `git diff --check`: PASS.
- **Việc chưa làm:** Kiểm thử thực tế trên trình duyệt với model thật (ticket 13).

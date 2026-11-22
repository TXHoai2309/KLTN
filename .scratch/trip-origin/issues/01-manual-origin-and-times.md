# 01: Chọn nơi xuất phát thủ công và nhập giờ đi/về

**What to build:** Traveler/Admin chọn, chỉnh và xác nhận nơi xuất phát bằng ghim hoặc tọa độ trong Việt Nam, nhập giờ khởi hành và hạn về, rồi xem lại đúng dữ liệu qua form review và đề xuất sơ bộ. Chưa có đủ dữ liệu/chặng được kiểm tra thì chưa cho lưu chuyến mới.

**Blocked by:** None (can start immediately after explicit coding authorization).

**Status:** ready-for-agent

**Execution gate:** Backend đã được người dùng cho phép ngày 2026-11-04 qua lệnh “bắt đầu code be”. Chỉ làm BE theo dependency và bàn giao contract/evidence; FE/integration chưa được coi là hoàn tất. Không tự áp shared migration, push/merge hoặc deploy. `ready-for-agent` vẫn là triage, không phải acceptance.

**Source:** Spec “Nơi xuất phát và lịch trình đi/về Hà Giang”, Q1–Q22; kiểm thử qua API/service hiện hành, PostgreSQL disposable và browser. Chỉ sửa trong scope ticket; không sao chép một planner/Validator riêng.

- [x] Luồng ghim/tọa độ → kiểm tra phạm vi Việt Nam trên server → xác nhận → review giữ tên, tọa độ, nguồn và giờ theo Việt Nam; camera mặc định không phải lựa chọn.
- [x] Đổi dữ liệu lựa chọn làm mất xác nhận cũ, vô hiệu hóa review/proposal cũ; không âm thầm điền Hà Nội, 08:00 hoặc giờ chưa được người dùng chọn.
- [x] Chọn nguồn dữ liệu phạm vi Việt Nam có provenance/license được review; không dùng bounding rectangle như bằng chứng đủ. Ngoài/không xác định phạm vi có phản hồi rõ, không PASS.
- [x] Thiếu nơi/giờ/ngày vẫn cho preliminary proposal theo minimum brief hiện hành và hiển thị thiếu dữ liệu; server chặn new final confirmation/save khi thiếu thông tin xuất phát bắt buộc, kể cả gọi HTTP trực tiếp. Chưa có đủ chặng đi/về thì không công bố toàn chuyến đã được kiểm tra.
- [x] Hợp đồng mới mở rộng tương thích, không làm chuyến cũ hoặc Assistant đang dùng contract cũ bị lỗi; chưa ghi đè Trip hoặc persist invalid proposal dài hạn.
- [x] Traveler/Admin cho chuyến của mình được phép; Guest có auth handoff, không replay write sau đăng nhập. Dữ liệu origin không tự lọt vào DTO member/public từ bước này.
- [x] Map unavailable vẫn nhập tọa độ; keyboard/focus/aria-live/mobile và giữ input khi lỗi được kiểm chứng qua browser/API hiện có. Nếu thay schema, dùng additive migration và PostgreSQL riêng, không tự áp shared database.

**Verification receipt:** FE implementation và unit/component tests hoàn thành. Xem FE handoff bên dưới.

## BE handoff — 2026-11-04

**BE: verified; FE/integration: pending.** Triage giữ `ready-for-agent`; ticket
vertical chưa DONE/ACCEPTED. [Receipt và giới hạn](../01-backend-verification.md).

- Contract revision **origin-v1**. Client-safe schemas/types:
  [`trip-origin-contract.ts`](../../../apps/web/src/modules/trip-origin/trip-origin-contract.ts).
  Fixtures valid/unconfirmed/outside/invalid/missing:
  [`trip-origin-fixtures.ts`](../../../apps/web/src/modules/trip-origin/trip-origin-fixtures.ts).
- **Operation:** `POST /api/trip-origins/validate`, body `{ origin }`; response
  generic success data `{ revision, origin, coverage }`, private-no-store.
  `origin` có `label`, `latitude`, `longitude`, `source: MANUAL | NOMINATIM`,
  `confirmed`. Search chưa được triển khai; NOMINATIM ở đây chỉ là nguồn lựa chọn.
- **Journey shape:** optional/nullable `journey` trong requirement/proposal;
  bên trong có nullable `origin`, `departureMinute`, `returnDeadlineMinute`,
  `returnDepartureMinute`. Label NFC/trim; finite coordinates; clocks số nguyên
  0–1439 theo `Asia/Ho_Chi_Minh`. Không biến unknown thành Hà Nội/08:00.
  Return-only day cần returnDepartureMinute trước Save; ticket 05 triển khai lịch.
- **Review:** `changeOriginSelection` bỏ xác nhận ghim sau thay đổi;
  `updateDraftJourney` bỏ xác nhận review. Unrelated review edits và cả hai
  proposal adapters giữ journey. FE phải nối picker/query change với các seam này.
- **Errors/status:** 401 UNAUTHENTICATED; 403 FORBIDDEN_ORIGIN/account denial;
  415 INVALID_CONTENT_TYPE; 400 INVALID_ORIGIN_INPUT; 413 ORIGIN_INPUT_TOO_LARGE;
  422 ORIGIN_OUTSIDE_VIETNAM / ORIGIN_COVERAGE_UNKNOWN.
  Existing requirement APIs giữ envelope/shape cũ và thêm coverage guard.
- **Eligibility/write:** preliminary vẫn hoạt động. Input readiness cần journey;
  legacy `missing` enum không mở rộng để giữ client parser tương thích. FE dùng
  `missingJourneyFields` để mô tả thiếu origin/confirmation/clocks. Planner form
  và Assistant không báo eligible final khi chưa tính origin legs. Preview ghi
  INSUFFICIENT_DATA/JOURNEY_ROUTES_NOT_VALIDATED. New Save bị chặn bởi 422
  TRIP_JOURNEY_REQUIRED hoặc TRIP_JOURNEY_VALIDATION_PENDING; chưa hỗ trợ lưu
  origin. Historical committed receipt vẫn SUCCESS replay; key/payload conflict
  FAILED; receipt không đọc được UNKNOWN, retry chính xác payload/key.
- **Auth/privacy:** auth trước đọc body ở API mới và Save/preview. Traveler/Admin
  capability cho request riêng; không đổi saved Trip read/member/public DTO,
  không thêm origin vào projection dùng chung. Dataset/server modules không
  nằm trong client contract import graph. Không có quyền bypass cho Admin khác.
- **Coverage:** geoBoundaries full MultiPolygon VNM ADM0 commit `9469f09`, license
  CC BY 4.0; [provenance/hash/limitations](../../../apps/web/src/modules/trip-origin/data/README.md).
  Mainland/island/neighbour/sea/edge evidence đã kiểm tra. Edge uncertainty
  0.001 độ trả UNKNOWN; không dùng country filter/bounding rectangle để PASS.
- **Checks:** scoped Vitest **443 PASS / 3 opt-in PostgreSQL cases skipped**,
  root typecheck (4 tasks), production build (55 pages) và actual Guest
  HTTP smoke PASS; lệnh/kết quả chi tiết ở receipt. Full web suite đã thử và
  FAILED, không được dùng làm acceptance. Không có migration/schema/DB write.
- **FE steps còn thiếu:** form/controller journey state, explicit pin confirm,
  query/selection invalidation, attribution, missing-journey copy, stale response,
  map unavailable/manual coordinates, keyboard/mobile/browser integration.
  Không sửa UI/CSS/client transport trong milestone BE này.
- **Frontier BE:** 02 search/admission/cache, sau đó 03 routing/rest. Các bước
  này được phép tiếp tục theo lệnh BE hiện có; blocker vertical vẫn giữ nguyên.


**Current follow-up:** temporary new-save gating/preliminary-only notes above describe the initial milestone. [BE 06–10](../06-10-backend-verification.md) now supplies authoritative fresh Save/persistence and complete journey final eligibility; missing required data still never passes.

## FE handoff — 2026-11-04

**BE: verified; FE: verified; live/browser acceptance: ready.**
- **Components & Client Transport Delivered:**
  - [`trip-origin-client.ts`](../../../apps/web/src/lib/trip-origin-client.ts): Client fetch helper cho `POST /api/trip-origins/validate` kèm kiểu `TripOriginValidationOutcome` (`VALID`, `OUTSIDE_VIETNAM`, `COVERAGE_UNKNOWN`, `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_INPUT`).
  - [`origin-location-picker.tsx`](../../../apps/web/src/components/trip-origin/origin-location-picker.tsx): Bộ chọn điểm xuất phát thủ công bằng MapLibre pin placement & manual coordinates fallback. Không mặc định camera/Hà Nội; thao tác đổi nhãn hoặc di chuyển ghim tự động chuyển trạng thái sang `confirmed: false` (gọi `changeOriginSelection`); nút "Xác nhận điểm xuất phát" gọi server validation và hiển thị badge xác nhận/lỗi lãnh thổ rõ ràng; a11y focus, `aria-live` và retry khi map error.
  - [`journey-time-utils.ts`](../../../apps/web/src/modules/trip-origin/journey-time-utils.ts): Các hàm chuyển đổi giờ phút `0..1439` theo `Asia/Ho_Chi_Minh` (`minuteToTimeString`, `timeStringToMinute`, `formatMinuteLabel`).
  - [`trip-journey-editor.tsx`](../../../apps/web/src/components/trip-origin/trip-journey-editor.tsx): Editor tích hợp picker ghim và 2 ô nhập giờ: Giờ khởi hành ngày đầu (`departureMinute`) & Hạn trở về ngày cuối (`returnDeadlineMinute`). Không mặc định `08:00`. Liệt kê trường còn thiếu qua `missingJourneyFields`.
  - [`trip-journey-review-section.tsx`](../../../apps/web/src/components/trip-origin/trip-journey-review-section.tsx): Card trình bày Nơi xuất phát & Lịch trình đi/về trong màn hình Review; hiển thị trạng thái xác nhận, cảnh báo thiếu dữ liệu (`missingJourneyFields`), cho phép sửa đổi và tự động vô hiệu hóa confirmation snapshot (`updateDraftJourney` -> `invalidateConfirmation`).
  - [`trip-origin.css`](../../../apps/web/src/components/trip-origin/trip-origin.css): Giao diện chuẩn `@KLTN/ui`, responsive mobile/desktop, dark/light theme.
  - Tích hợp vào [`trip-review-screen.tsx`](../../../apps/web/src/app/trips/new/trip-review-screen.tsx), [`trip-sentence-builder.tsx`](../../../apps/web/src/app/trips/new/trip-sentence-builder.tsx), và [`trip-requirement-form.tsx`](../../../apps/web/src/app/trips/new/trip-requirement-form.tsx).
- **Verification & Checks:**
  - Scoped Vitest: **34/34 PASS** (`trip-origin-client`, `origin-location-picker`, `trip-journey-review`, `trip-origin`).
  - Requirement suite: **254/254 PASS** (`trip-requirement/*`).
  - Root typecheck (`npm run check-types`): **4/4 packages PASS (0 errors)**.
  - `git diff --check`: 0 warnings.
- **Trạng thái Ticket 01:** Phần FE của Ticket 01 hoàn thành 100%. Sẵn sàng tiếp tục frontier Ticket 02 (Tìm nơi xuất phát bằng Nominatim) hoặc Ticket 03 (Lập chuyến một ngày).

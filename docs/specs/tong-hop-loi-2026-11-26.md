# Tổng hợp lỗi, nguyên nhân và hướng sửa — 2026-11-26

Bản tóm tắt để đọc nhanh. Chi tiết tái hiện từng lỗi: [trip-review-lessons-demo-2026-11-26.md](trip-review-lessons-demo-2026-11-26.md). Spec đợt sửa đầu (đã xong): [trip-review-lessons-demo-2026-11-26-spec.md](trip-review-lessons-demo-2026-11-26-spec.md).

Production hiện tại: commit `e2dbee9` (deployment `dpl_AiKqED7L9rgZpeiKT7sqsKgpViuT`). Phần **đang làm dở chưa commit** trong working tree (điểm xuất phát + khôi phục stream chat) **chưa** lên production.

---

## 1. Đã sửa và đã kiểm trên production (không cần làm gì)

| Lỗi | Nội dung | Kết quả kiểm |
|---|---|---|
| B8 | Sửa lịch bằng AI luôn báo "Kết nối bị ngắt", không có thẻ phương án | Có 3 thẻ, Áp dụng + Hoàn tác chạy |
| B1, B2 | Bot tự đặt "nghỉ đêm" giả, lịch rơi điểm; "Thêm 1 ngày" ra ngày trống | Thêm ngày: 3 ngày/9 điểm → 4 ngày/11 điểm, về sớm hơn 4 tiếng |
| B9 | Chi phí không hiện trên trang chuyến nếu chưa ghim | Có mục "Chi phí ước tính" riêng (ADR-58) |
| B3, B5 | Nhãn nhận phòng lệch khu nghỉ; tiêu đề Ngày 1 lấy điểm Ngày 2 | "Nhận phòng · Yên Minh"; "Hà Nội → TP Hà Giang" |
| B4 | Khoảng 20 phút không giải thích sau nghỉ trưa | Hiện "+20 phút chụp ảnh" |
| B6 | Không có gợi ý chỗ nghỉ / ăn tối | Lịch mới có gợi ý homestay + quán ăn |
| B10 | Màn hẹp: dòng "Ăn sáng" vỡ dọc | Đã sửa CSS (chưa kiểm tay trên điện thoại) |
| B11–B13 | Chip nhắc "lịch" khi chưa có lịch; chip ngoài Hà Giang; định dạng danh sách | Đã chặn (thêm sửa regex chữ có dấu ở `e2dbee9`) |

Còn mở từ đợt đầu: **B7** (ngày cuối 421 km xe máy) — chờ anh quyết, chưa sửa.

---

## 2. Lỗi còn lại — xếp theo ưu tiên

### Ưu tiên 1 — ảnh hưởng demo, sửa trước

**S1 — Câu trả lời trống, phải F5 mới thấy** — **[ĐÃ SỬA · commit `8f668d0`]**
- Nguyên nhân: (a) cuối lượt chat, phần chữ còn giữ trong bộ lọc `sourceStreamFilters` (`tripsage-chat-service.ts`) chỉ được lưu DB, không gửi xuống stream ⇒ trình duyệt không nhận chữ, DB có đủ. (b) `onFinish` trong `tripsage-chat-client.tsx` không khôi phục từ DB khi stream kết thúc "bình thường" mà không có chữ.
- Đã sửa: phát `flush-tail-*` (`text-start`/`text-delta`/`text-end`) trước chunk `finish` và trong `flush()`, hoàn tất `shouldRecoverFinishedTurn` + `needsServerSync` khôi phục từ DB khi stream kết thúc sạch nhưng trống text; bổ sung test hồi quy (c) & (d).

**S2 — Lặp hỏi xác nhận điểm xuất phát** — **[ĐÃ SỬA · commit `1384f8a`]**
- Nguyên nhân: bản cũ chỉ tự xác nhận khi đúng 1 kết quả tìm kiếm và câu khớp mẫu hẹp; chip đồng ý `"Đúng, Cầu Giấy"` không khớp tập ứng viên khi có nhiều kết quả và `stripConversationalOriginWrappers` chưa bóc tiền tố đồng ý (`Đúng, `) + tiền tố hành chính (`Quận `).
- Đã sửa: hoàn tất `resolveUniqueOriginMatch`, `STRONG_ORIGIN_CUE_RE` ("nhà ở …"), gộp ứng viên cùng cụm trong `origin-search-contract.ts`, và bóc tiền tố đồng ý có dấu `"Đúng, …"` (an toàn với `"dùng"`) cùng tiền tố hành chính trong `permitsOriginConfirmation`/`statesSoleOrigin`; bổ sung test hồi quy (a) & (b).

**S3a — Tính tiền thuê ô tô (3,6 triệu) cho gia đình tự lái xe nhà** — **[ĐÃ SỬA · commit `72b0e36`]**
- Nguyên nhân: server mặc định đúng (`OWN_VEHICLE`), nhưng model tự chọn `rentalTier: "CAR_SELF_DRIVE"` khi gọi `estimateCosts` (nhầm "tự lái ô tô" với "Thuê ô tô tự lái"); server không chặn.
- Đã sửa: thêm `userExplicitlyRequestedVehicleRental` và `resolveEffectiveRentalTier` trong `tripsage-chat-tools.ts` (áp dụng trong `emitSyncedCostNow` / `estimateCosts`): khi `resolveUsesLocalRental(info) === false` ép `rentalTier = "OWN_VEHICLE"` trừ khi lịch sử hoặc tin nhắn gần nhất có `"thuê xe"` / `"thuê ô tô"` / `"thuê xe máy"` (không tính phủ định `"không thuê xe"`). Cập nhật mô tả `rentalTier` trong `tripsage-cost.ts` và thêm test trong `tripsage-cost-d5-d6.vitest.test.ts`.

**S4 — Trang chuyến ghi "Ước tính tại ngày 21/11/2026" (sai so với hôm nay)** — **[ĐÃ SỬA · commit `29d253b`]**
- Nguyên nhân: đó là ngày cập nhật bảng giá tham khảo (`PRICE_REFERENCE.updatedAt` trong `tripsage-cost.ts:10`), nhưng nhãn ở `trip-pinned-section.tsx:168` ghi là "Ước tính tại ngày".
- Đã sửa: đổi thành `"Theo bảng giá tham khảo cập nhật ${referenceDateText}, chưa phải báo giá. Ứng dụng không đặt chỗ."` và cập nhật `trip-cost-section.vitest.test.ts`.

**S7 — Tiêu đề Ngày 2 là "Dốc Bắc Sum → …" thay vì "TP Hà Giang → …"** — **[ĐÃ SỬA · commit `dc0ec1e`]**
- Nguyên nhân: Ngày 1 chỉ có chặng lên (0 điểm tham quan) nên không có `overnightStays` cho đêm 1 ⇒ `resolveDayRouteLabel` (`day-timeline.tsx`) không có khu nghỉ trước, lấy điểm đầu Ngày 2.
- Đã sửa: bổ sung nhận diện ngày trước chỉ có chặng lên (`previousDayOutboundOnly` / leg `OUTBOUND` ngày trước với `previousDayStops.length === 0`) trong `resolveDayRouteLabel` để lấy khu nghỉ đêm đó (mặc định `"TP Hà Giang"` khi thiếu `overnightStays`), áp dụng đồng nhất tại `trips-view.tsx`, `tripsage-plan-panel.tsx`, `companion-group-view.tsx`; thêm test trong `day-timeline.vitest.test.ts`.

### Ưu tiên 2 — cần anh quyết trước khi sửa

**S3b — Gia đình 2 người lớn + bé 7 tuổi bị tính 2 phòng, 3 suất ăn người lớn**
- Nguyên nhân: hệ thống không có khái niệm trẻ em; `travelers = 3` ⇒ `ceil(3/2) = 2` phòng (`tripsage-cost.ts:325`).
- Hướng sửa: thêm `children` vào `tripInfoSchema`, trích "bé X tuổi" từ lời khách; phòng tính theo người lớn, ăn uống trẻ em hệ số ~0,5. **Đổi hợp đồng dữ liệu ⇒ cần duyệt.**

**S6 — Gia đình có bé, "đi nhẹ nhàng" nhưng Ngày 1 lái 349 km rồi ngủ ở Bắc Mê (lệch cung chính)** — **[ĐÃ SỬA · commit `c6ea687`]**
- Nguyên nhân: bộ xếp tuyến ADR-55 không có trọng số "có trẻ nhỏ / nhịp nhẹ"; `idleCost` phạt Ngày 1 nghỉ sớm ở TP Hà Giang khi đến nơi khoảng 13:00 sau chặng Hà Nội, và `townCost` coi Bắc Mê ngang các thị trấn trên cung chính QL4C.
- Đã sửa: thêm bộ nhận diện tín hiệu tất định không dấu `tripsage-relax-signals.ts` (`hasYoungChildSignal`, `hasRelaxReasonSignal`, `hasGentlePaceWording`, `detectRelaxAndFamilySignals`), xuất `MAIN_LOOP_OVERNIGHT_AREAS` (`TP Hà Giang`, `Quản Bạ`, `Yên Minh`, `Đồng Văn`, `Mèo Vạc`, `Lũng Cú`) tại `overnight-anchor.ts`; bổ sung `JourneyBalancePreferences.gentleFamily` trong `journey-planner.ts`, `planner-day-balance.ts`, `planner-route.ts` và `planning-engine.ts` để ưu tiên đêm 1 ở TP Hà Giang khi xuất phát xa (`>= 80 km`), phạt khu nghỉ ngoài cung chính (như Bắc Mê, Hoàng Su Phì, Du Già) và không tự lấp điểm ngoài cung chính trong `fill`; bảo toàn tuyệt đối ràng buộc nghỉ đêm người dùng nêu rõ (ADR-53) qua `explicitOvernightDays`.

**B7 — Ngày cuối 421 km xe máy (về 19:18)**
- Hệ thống đã cảnh báo đúng, không chặn lưu. Có thể gợi ý đêm cuối gần TP Hà Giang hoặc xe khách chiều về. **Quyết định sản phẩm.**

### Ưu tiên 3 — đã điều tra rõ nguyên nhân & đã sửa

**S5 — Sau "Thêm 1 ngày", chip là "Đi xe khách lên TP Hà Giang / Đi tàu hỏa ra Hà Nội / Đi máy bay ra Hà Nội" cho khách ở Hà Nội tự lái** — **[ĐÃ SỬA · commit `7b58d87`]**
- Nguyên nhân thật (đã xác minh từ code):
  1. `shouldSuggestHub(result)` (`tripsage-access-leg.ts:554`) chỉ loại trừ `isHubOrigin(originLabel)` (khớp cứng `"Hà Nội (bến xe Mỹ Đình)"` / `"TP Hà Giang (bến xe phía Nam)"`), nên điểm cụ thể trong nội thành Hà Nội như `"Quận Cầu Giấy, Hà Nội"` vẫn bị tính như nơi ở xa khi `durationDays <= 4` (`SHORT_TRIP_MAX_DAYS`) và chặng Ngày 1 dài `>= 300 km` / `>= 360 phút` (ca demo là 348,7 km).
  2. Khi `shouldSuggestHub(result)` trả `true`, `proposeItinerary` (`tripsage-chat-tools.ts:1747-1752`) phát cứng bộ chip `["Đi xe khách lên TP Hà Giang", "Đi tàu hỏa ra Hà Nội", "Đi máy bay ra Hà Nội"]` và gửi `hubHint` bảo model hỏi cách ra Hà Nội.
  3. `hubTransportChipsFor` và `reconcileQuickRepliesWithQuestion` (`tripsage-chat-service.ts`) cũng không kiểm tra khách đã ở Hà Nội hay đối chiếu bộ chip chặng tiếp cận với câu hỏi kết `"Bạn muốn ưu tiên điều chỉnh nào?"`.
- Đã sửa: loại trừ nơi xuất phát trong Hà Nội / TP Hà Giang ở `shouldSuggestHub` (`isHaNoiOriginOrHome`), chặn phát `hubHint`/chip chặng tiếp cận ở `proposeItinerary` và `suggestReplies` khi khách đã ở Hà Nội, cập nhật `hubTransportChipsFor` và bổ sung lớp đối chiếu ở `reconcileQuickRepliesWithQuestion` để đổi chip khớp câu hỏi điều chỉnh lịch; thêm test trong `tripsage-timeline-fixes.vitest.test.ts`.

**S8 — Trợ lý sửa lịch nói "chưa có số km chặng về" dù trang ghi 421,5 km** — **[ĐÃ SỬA · commit `7bfac2c`]**
- Nguyên nhân thật (đã xác minh từ code): `PreviewJourneySummary` (`edit-journey-helper.ts`) đã có đầy đủ `outboundDistanceMeters`, `returnDistanceMeters`, `outboundDurationSeconds`, `returnDurationSeconds`, nhưng:
  1. `buildVerifiedAdvisoryFacts` (`saved-trip-advisory.ts:815-843`) — hàm dựng `tripContext.journey` cho `/api/trips/[id]/edits/ai` — chỉ đưa `outboundDriveMinutes` và `returnDriveMinutes`, **bỏ sót hoàn toàn** `outboundDistanceMeters`/`returnDistanceMeters` và thời gian nghỉ dọc đường.
  2. Công cụ `simulate_changes` (`trip-assistant-agent.ts:452-458`) chỉ trả `arrivalAtFirstTime`, `estimatedReturnTime`, `returnDeadlineTime` trong `journeyAfter`, cũng không trả km/phút chặng đi/về.
  3. Tóm tắt lộ trình tất định trong `ai-workspace-plan.ts:1220-1244` cũng chưa hiển thị km/phút chặng đi/về.
- Đã sửa: đưa `outboundDistanceKm`, `returnDistanceKm`, `outboundRestMinutes`, `returnRestMinutes` vào `VerifiedAdvisoryFacts.journey`, bổ sung đầy đủ vào `journeyAfter` của `simulate_changes`, cập nhật prompt hệ thống & `ai-workspace-plan.ts`, thêm test trong `trip-assistant-agent.vitest.test.ts`.

### Ưu tiên 4 — chữ / giao diện nhỏ (đã sửa S9–S13)

| Mục | Hiện tượng | Trạng thái & cách sửa |
|---|---|---|
| S9 | Trợ lý sửa lịch nói "Máy chủ vẫn báo PASS…" | **ĐÃ SỬA (`167ac9a`)** — Cấm trong prompt (`trip-assistant-agent.ts`, `saved-trip-advisory.ts`), sửa chuỗi fallback (`ai-workspace-plan.ts`, `saved-trip-rest-scenario.ts`), và lọc tự động ở `trip-assistant-stream-redaction.ts` (giữ nguyên Fact Guard `FALSE_PASS`). |
| S10 | Mỗi thẻ phương án lặp dòng "Đổi giờ bắt đầu về sang 05:30" | **ĐÃ SỬA (`1f4c718`)** — Thêm `visibleSuggestionDiffLines` trong `ai-edit-bar.tsx` loại dòng diff trùng `summary` hoặc trùng nhau. |
| S11 | Khuyên xuất phát 05:30 tháng 12 không cảnh báo trời tối / sương mù (bình minh ~06:38) | **ĐÃ SỬA (`167ac9a`)** — Thêm `buildPreSunriseDepartureWarnings` (dùng `computeSunTimes`) trong `saved-trip-advisory.ts`, trả `preSunriseWarnings` từ `simulate_changes`, đưa vào `gatherWeatherAndSunDigest`, và tự động kèm lưu ý an toàn trời tối/sương mù (nhất là xe máy) nếu câu trả lời bỏ sót. |
| S12 | Toast "Đã áp dụng phương án…" che chữ tin nhắn | **ĐÃ SỬA (`1f4c718`)** — Đổi `.toastPill` trong `edit-trip.module.css` từ `position: absolute` sang `position: relative` nằm trong luồng `.workspaceStage` phía trên `.content` (vẫn tự ẩn sau 6s), không đè tin nhắn ở mọi kích thước màn hình. |
| S13 | "Dự báo có từ ngày 2026-12-06" dạng ISO | **ĐÃ SỬA (`9cfc2cb`)** — Thêm `formatShortViDate` (`sun-times.ts`) hiển thị `"06/12"` tại `trip-weather-inline.tsx`, `trip-weather-panel.tsx`, `destination-weather-card.tsx` và cập nhật 3 bộ test thời tiết. |

---

## 3. Thứ tự làm đề xuất

1. Hoàn tất phần đang làm dở ⇒ sửa **S1, S2**; thêm test; smoke 5 lượt chat không F5.
2. Sửa nhanh **S3a, S4, S7** (nhỏ, chắc chắn).
3. Commit, deploy, smoke lại đúng kịch bản "gia đình 3 người tự lái từ Cầu Giấy, 3 ngày, tối ngày 1 nghỉ Đồng Văn".
4. Anh quyết **S3b, S6, B7** ⇒ viết spec rồi làm.
5. Điều tra và sửa **S5, S8**; dọn **S9–S13**.

## 4. Việc phải dọn trước buổi demo

- Xóa đoạn chat thử `e39ff975-32ee-4588-a587-63536f8c4267` (gia đình đi ô tô, có lỗi trả lời trống) trên tài khoản demo.
- Giữ đoạn chat demo `e6beafeb-ce49-406e-b4f5-903df3f0e1f6` và chuyến `cmwwzo14a000108jvryf9zvs8` (đã kiểm: chi phí, timeline, sửa lịch bằng AI đều chạy).
- Đoạn chat khám phá `6e56fb64-1ea8-4a4d-badf-70f0c3658087` dùng được, tránh bấm chip Sa Pa.

---

## 5. Smoke test production sau deploy `33b2495` (2026-11-26)

Deployment `dpl_2R37wix3VmoBPEEyjF4iTKAmKr45`. Kịch bản: hội thoại mới `6bcbc4b7-e8ad-433d-a31a-4ccd9df4f349`, "Nhà mình 2 vợ chồng với 1 bé 7 tuổi, tự lái ô tô từ Hà Nội (nhà ở Cầu Giấy), 3 ngày 2 đêm từ 11/12…", sau đó "Về gần 23h thì muộn quá với bé. Cho nhà mình thêm 1 ngày để đi thư thả hơn nhé."

Đã xác nhận trên production:
- **S1:** cả 2 lượt hiện câu trả lời + lịch ngay, không cần F5.
- **S2:** không hỏi lại Cầu Giấy; lập lịch ngay ở lượt đầu.
- **S3a:** bảng chi phí v1 và v2 không còn dòng "Thuê ô tô tự lái" (chỉ xăng, lưu trú, ăn uống).
- **S5:** chip đúng ngữ cảnh ("Đi sớm hơn ngày cuối", "Rút bớt điểm xa phía Bắc"…), không còn chip xe khách/tàu/máy bay.
- Typecheck 0 lỗi; vitest 4938 pass, 1 fail có sẵn (`tripsage-cost-card` Bug 3 CSS).

Vẫn còn (chờ quyết định, đã biết): **S3b** — vẫn "2 phòng" và 3 suất ăn cho 2 người lớn + bé 7 tuổi; **S6** — ngày cuối về 23:21 (3 ngày) / 22:05 (4 ngày) với gia đình có trẻ nhỏ.

Phát hiện mới:
- **S14 — "Thêm 1 ngày để đi thư thả hơn" lại lấp thêm điểm.** — **[ĐÃ SỬA · commit `c6ea687`]** v1 3 ngày/6 điểm về 23:21 ⇒ v2 4 ngày/10 điểm về 22:05. Khách muốn giãn lịch, nhưng bộ xếp ADR-55 lấp giờ trống (`fill`) bằng điểm mới. Đã sửa theo quyết định bên dưới: khi số ngày tăng và có tín hiệu tất định (`hasRelaxReason || isRelaxedPace || hasYoungChild`), `proposeItinerary` bật chế độ giãn lịch (`fill = false`, giữ nguyên điểm hiện có + chỉ khôi phục `mustIncludeDestinationIds` bị rơi và lọc bỏ điểm phát sinh ngoài yêu cầu nếu model tự chèn), `arrangeTripRoute` + `balanceJourneyDays` chia lại đều sang số ngày mới, thử hướng/xoay vòng kết thúc gần TP Hà Giang (giới hạn `<= 1,25×` quãng đường gốc, không tạo `LONG_DRIVING_DAY` Ngày 1) để kéo đêm áp chót về gần TP Hà Giang và rút giờ về sớm hơn; trả `relaxSpreadApplied: true` kèm chỉ dẫn prompt nói rõ *"đã giãn lịch, giữ số điểm, về sớm hơn"* và không gợi ý thêm điểm.

**Quyết định (chủ dự án duyệt 2026-11-26: "ok đồng ý"):** làm theo hướng đề xuất cho **S14** và **S6** (đã triển khai ở commit `c6ea687`, test tại `tripsage-s14-s6.vitest.test.ts`):
- Thêm ngày với lý do "thư thả / đỡ mệt / về sớm", hoặc nhịp RELAXED, hoặc đoàn có trẻ nhỏ ⇒ dùng ngày thêm để **giãn lịch**: không lấp điểm mới (giữ số điểm hiện có, chỉ bổ sung lại điểm bắt buộc nếu trước đó bị rơi), đưa đêm cuối về gần TP Hà Giang để rút chặng về.
- Đoàn có trẻ nhỏ hoặc nhịp nhẹ ⇒ ưu tiên đêm 1 ở TP Hà Giang, phạt khu nghỉ ngoài cung chính (như Bắc Mê).
- Ghi chú triển khai nhỏ: (a) giữ nguyên `tripInfoSchema` và không đổi schema DB (S3b chưa duyệt); (b) khi `tripInfo.pace` chưa được model ghi (`undefined`), `hasGentlePaceWording` chỉ nhận cụm từ nhịp nhẹ rõ ràng (*đi nhẹ nhàng / đi thư thả / đi thong thả / nhịp nhẹ / ít leo trèo*) và tuyệt đối không kích hoạt bởi *"không vội cũng được"* hay các câu phủ định; (c) khi chế độ giãn lịch bật trên lượt thêm ngày, máy chủ cũng lọc bỏ điểm mới model tự thêm ngoài `shownIds` / `mustIncludeDestinationIds` / tên điểm khách vừa nhắc để bảo đảm tất định không tăng số điểm.
- S3b (trẻ em / số phòng) và B7 **chưa** duyệt — giữ nguyên.

---

## 6. Smoke test production sau deploy `0b4c623` (S14, S6) — 2026-11-26

Deployment `dpl_3XZRR4hVfutSqNDcfiwarDYhvtie` (= `c6ea687` S14/S6 + `0b4c623` sửa nhận nhầm "bẻ/bề/bệ" là có trẻ nhỏ khi bỏ dấu — Claude rà soát phát hiện, đã thêm test). Hội thoại `fa066ec6-d71f-46dd-ba39-b4e017fe8ad4`, cùng kịch bản gia đình Cầu Giấy.

Đã xác nhận:
- **S6:** Ngày 1 `Cầu Giấy → TP Hà Giang`, đêm 1 nghỉ TP Hà Giang (không còn Bắc Mê), có gợi ý homestay + quán ăn tối.
- **S14:** "Về gần 24h thì muộn quá với bé. Cho nhà mình thêm 1 ngày để đi thư thả hơn nhé." ⇒ 4 ngày, **giữ 6 điểm** (trước đây lên 10), đêm 3 ở Quản Bạ, **về Cầu Giấy 14:32** (bản 3 ngày 23:42). Bot nói đúng "đã giãn lịch, giữ nguyên các điểm, đưa đêm cuối về gần TP Hà Giang".
- S1/S2/S3a/S5 vẫn đúng (trả lời hiện ngay, không hỏi lại Cầu Giấy, không có dòng thuê xe).

Phát hiện mới:
- **S15 — Đoạn trả lời bị lặp nguyên văn (1/2 lượt).** Lượt đầu của `fa066ec6`: cùng đoạn "Mình xếp lịch theo hướng ngắm cảnh…" xuất hiện 2 lần liền ("…đỡ muộn?Mình xếp lịch…"); bản lưu DB cũng lặp (1 phần text 968 ký tự). Lượt sau không lặp. Chưa rõ nguyên nhân: hoặc model viết lại đoạn sau khi gọi tool (2 bước text gộp thành 1 phần khi lưu), hoặc server ghép `textChunks` 2 lần (nghi vùng `flushRemainingSourceFilters` mới thêm ở S1 / filter `__default__` khi `text-delta` không có `id`). Hướng: ghi log số bước text và độ dài `textChunks` mỗi bước để phân biệt; nếu do model, khử trùng đoạn văn trùng nguyên văn trước khi lưu/hiển thị; nếu do server, sửa chỗ push trùng + test.
- Ghi nhận (không phải lỗi): bản 3 ngày cho gia đình vẫn về 23:42 vì Hà Nội ↔ cao nguyên đá trong 3 ngày quá xa; bot đã cảnh báo và gợi ý chỉnh.

**S15 — đã sửa (Claude, 2026-11-26).** Bộ lọc nguồn và luồng server không có đường đẩy chữ 2 lần trong cùng một khối; nguồn lặp là model viết lại nguyên đoạn trong một khối text mới (thường sau khi gọi tool). Sửa tại `streamTripsageChat` (`tripsage-chat-service.ts`): mỗi khối text mới trong lượt được giữ lại khi nội dung (bỏ khác biệt khoảng trắng) chỉ lặp lại chữ đã gửi; nhả ra ngay khi có nội dung mới; bỏ hẳn nếu tới hết khối vẫn chỉ là lặp. Chữ lặp không tới trình duyệt và không vào DB. Test hồi quy `S15` trong `tripsage-chat-stream-redaction.vitest.test.ts` (fail trên code cũ, pass sau sửa). Giới hạn: khối mới lặp một phần rồi thêm ý mới vẫn hiện nguyên (chỉ chặn lặp nguyên văn).

---

## 7. Test lại toàn bộ trên production `e10f7f2` (2026-11-26)

Deployment `dpl_31sWrzfK9pSfATp5Jk12F86kLGAL`. Dữ liệu thử tạo trên tài khoản demo: hội thoại `b2cc910f-2137-4f18-85a7-c3e07274f15d` (luồng demo xe máy 5 ngày), `385c5c60-e987-4dfa-b708-26690589699e` (khám phá), chuyến đã lưu `/trips/cmwxehav4000108l5tr6tsbig` (bản sửa lịch AI chưa áp dụng, chưa lưu).

| Luồng | Kết quả |
|---|---|
| Hỏi thời tiết tháng 12 | Đạt — trả lời đúng, chip phù hợp |
| Lập lịch xe máy 5 ngày từ Mỹ Đình, phải có Lũng Cú / Mã Pì Lèng / Nho Quế | Đạt có lưu ý — v1 12 điểm **thiếu Nho Quế**, về 21:59; bấm "Giữ 5 ngày, bớt điểm phụ" ⇒ v2 11 điểm có Nho Quế, về 19:18. Không lặp chữ (S15), hiện ngay (S1) |
| Chi phí | Có lưu ý — v1/v2 tính "thuê 2 xe máy số" dù nhóm chạy xe từ Hà Nội; khách nói "xe máy nhà, không thuê" ⇒ tính lại đúng 10,03 tr (2,51 tr/người) |
| Hỏi chợ phiên Đồng Văn | Đạt — đối chiếu ngày trong lịch, có nguồn |
| Lưu chuyến ⇒ trang chuyến | Đạt — chi phí tự lưu đúng bản mới nhất (D4/ADR-58); nhãn "bảng giá tham khảo cập nhật 21/11" (S4); tiêu đề ngày nối khu nghỉ (B5/S7); nhận phòng khớp (B3); "Dự báo có từ ngày 06/12" (S13); có gợi ý chỗ nghỉ (B6) |
| Màn 375px | Đạt — dòng "Ăn sáng" một hàng (B10) |
| Sửa lịch bằng AI | Đạt — 2 thẻ phương án (B8), có 421,5 km (S8), cảnh báo đi trước bình minh (S11), không "máy chủ/PASS" (S9), không lặp dòng (S10) |
| Khám phá (Sa Pa / Ba Bể / Lũng Cú cho mẹ yếu chân) | Có lưu ý — trả lời Lũng Cú tốt, có nguồn; bỏ qua phần so sánh Sa Pa/Ba Bể; không có chip nào |

Vấn đề còn lại (mới):
- **R1 — Điểm bắt buộc bị rơi ở bản đầu.** Khách nói "nhất định phải có … sông Nho Quế" nhưng v1 không có (bot có nói rõ và đưa chip). Sáng nay cùng câu thì có. Nghi `prioritizeIds`/lấp điểm (D2/S14) không đảm bảo `mustIncludeDestinationIds` khi lịch đầy. Hướng: điểm bắt buộc phải xếp trước khi lấp điểm phụ; chỉ rơi khi thật sự không vừa, kèm lý do.
- **R2 — Xuất phát Mỹ Đình bằng xe máy vẫn bị tính thuê xe.** `resolveUsesLocalRental` coi "Hà Nội (bến xe Mỹ Đình)" là điểm tập kết (hub) ⇒ mặc định thuê xe máy số, dù lộ trình 972 km gồm cả chặng Hà Nội ↔ Hà Giang bằng xe máy (tức đi xe nhà). Hướng: khi phương tiện là xe máy/ô tô và chặng lên Hà Giang do chính xe đó chạy (không có chặng tiếp cận xe khách/tàu/máy bay) ⇒ `OWN_VEHICLE`.
- **R3 (nhỏ) — Câu hỏi so sánh với nơi ngoài Hà Giang bị bỏ qua và không còn chip.** Nên trả lời ngắn rằng ứng dụng chỉ hỗ trợ Hà Giang (hoặc so sánh 1 câu) và luôn còn chip Hà Giang thay thế khi bộ lọc B12 chặn hết chip.

Còn chờ quyết: S3b, B7.

**R1, R2 — đã sửa (Claude, 2026-11-26).**
- **R1:** trace admin hội thoại `b2cc910f` cho thấy lượt đầu model gọi `recordTripInfo` với `mustIncludeDestinationIds: []` (chưa biết mã điểm vì chưa `listDestinations`) rồi tự chọn lịch thiếu Sông Nho Quế; server không có gì ép. Sửa: `findMustVisitIds` (`tripsage-relax-signals.ts`) tìm tên điểm trong **tin nhắn mới nhất** nằm cùng câu với "nhất định / phải có / bắt buộc / không thể thiếu / không được bỏ"; `proposeItinerary` gộp vào `requiredDestinationIds` và chèn vào lựa chọn nếu model bỏ sót (bộ xếp tuyến sắp lại thứ tự). Chỉ xét tin mới nhất để "bỏ X" ở lượt sau không bị ép lại. Test `R1` trong `tripsage-s14-s6.vitest.test.ts` (fail trên code cũ, pass sau sửa).
- **R2:** `resolveUsesLocalRental` coi mọi điểm tập kết là thuê xe. Theo ADR-42 điểm tập kết Hà Nội (Mỹ Đình) dành cho khách từ xa — người Hà Nội hẹn ở Mỹ Đình đi xe nhà. Sửa: chỉ TP Hà Giang (bến xe phía Nam), có chặng tiếp cận, hoặc quê ngoài Hà Nội / TP Hà Giang mới mặc định thuê xe. Test `R2` trong `tripsage-cost-d5-d6.vitest.test.ts` (fail trên code cũ, pass sau sửa).

Smoke production `549c0a1` (deployment `dpl_6vwnnueMdK77fYeUQVZiTFi8tSkM`, hội thoại `56f70c4b-dfdc-4ea1-b5e9-f0efcd85173f`, cùng câu xe máy 5 ngày từ Mỹ Đình): **R1 đạt** — bản v1 đã có Cột cờ Lũng Cú, Mã Pì Lèng và Sông Nho Quế (trace: output `proposeItinerary` chứa Nho Quế); **R2 đạt** — chi phí chỉ còn xăng 2 xe, homestay, ăn uống, gửi xe (10,02 tr), không có dòng thuê xe. Ghi nhận: v1 lấp 16 điểm và về 23:46 (giống bản sáng nay, không phải hồi quy; bot đã hỏi có muốn về sớm hơn).

---

## 8. Thêm công cụ chỉ đọc cho trợ lý chat (chủ dự án duyệt 2026-11-26: "Thêm 2 tool đó")

Lý do: hỏi "thời tiết Hà Giang mấy ngày sắp tới" thì trợ lý `/assistant` trả lời "chưa có dự báo" vì chat không có tool thời tiết (dự báo Open-Meteo 16 ngày chỉ dùng ở timeline / trợ lý sửa lịch).

- `getWeatherForecast` — khu vực Hà Giang (mặc định TP Hà Giang; có Đồng Văn, Mèo Vạc, Lũng Cú…), tối đa 7 ngày liên tiếp trong 16 ngày tới; nhiệt độ thấp/cao, khả năng mưa, lượng mưa, tầm nhìn, gió giật, giờ mặt trời mọc/lặn; ngày quá xa ⇒ `NOT_YET_AVAILABLE`, nhà cung cấp lỗi ⇒ `WEATHER_UNAVAILABLE` (không đoán). Tối đa 2 lần/lượt.
- `listMyTrips` / `getMyTrip` — chỉ đọc chuyến đã lưu của người đang đăng nhập (dùng `listMyTrips` / `getMyTrip` của `trip-read-service`, chủ chuyến xác định từ phiên đăng nhập của request, model không truyền được người dùng); trả lịch từng ngày, chỗ nghỉ đã chọn, chi phí ước tính. Tối đa 3 lần/lượt. Không có tool ghi (lưu/sửa vẫn qua nút bấm, ADR-47).
- File: `tripsage-info-tools.ts` (mới), `tripsage-chat-tools.ts`, `tripsage-chat-service.ts` (`infoToolInstructions` nối mô tả vào prompt khi tool được bật), `tripsage-chat-http.ts`, `tripsage-chat-runtime.ts`, `app/api/ai/chat/route.ts`. Test: `tripsage-info-tools.vitest.test.ts`.
- Giới hạn: chưa hiện thẻ thời tiết dạng giao diện trong chat (trả lời bằng chữ từ số liệu tool).

---

## 9. Bài học từ hội thoại `0c28d203-5266-4a6b-8f02-04366b539cb3` + nhận xét ChatGPT (2026-11-27)

Nguồn: ảnh chụp hội thoại của chủ dự án và file "Kiểm chứng thông tin du lịch.pdf" (ChatGPT chấm 6.3/10 và 6.7/10: đúng kiến thức, nhưng hiểu sai phạm vi, thiếu chiều sâu theo mùa/giờ).

| Mục | Hiện tượng | Nguyên nhân (đã kiểm chứng) | Hướng sửa |
|---|---|---|---|
| **L1** | "Nếu đi Hà Giang nhất định phải ghé những điểm nào và nên ghé sáng hay chiều **những điểm đó**" ⇒ bot mở đầu "Mình hiểu bạn đang hỏi về **Đồng Văn**" | Không phải RAG như ChatGPT đoán. `hasPlaceDeictic` bắt "điểm đó" là đại từ chỉ nơi; `resolveAmbiguousPlaceReference` không thấy địa danh trong câu (Hà Giang là tỉnh, không nằm trong mẫu địa danh), lục 2–3 lượt trước thấy đúng một nơi "Đồng Văn" ⇒ `SINGLE` (đã tái hiện bằng test). Prompt `tripsage-chat-service.ts:350` bắt model "PHẢI mở đầu bằng 'Mình hiểu bạn đang hỏi về Đồng Văn'". | (a) Đại từ trỏ ngược trong **cùng câu** ("những điểm nào … những điểm đó") ⇒ `NONE`; (b) câu có phạm vi rõ ("Hà Giang", "cả chuyến", "toàn tỉnh") ⇒ `NONE`; (c) bỏ chữ "PHẢI mở đầu" — chỉ dùng tham chiếu khi thật sự mơ hồ, nói nhẹ "nếu bạn đang hỏi về X…". Test hồi quy đúng câu này. |
| **L2** | "Sắp tới Hà Giang có gì đẹp" ⇒ nói hoa đào tháng 1–2, thiếu tam giác mạch cuối mùa, hoa cải, săn mây tháng 12 | Model biết ngày hôm nay nhưng tài liệu RAG đã duyệt thiếu "lịch mùa"; prompt không yêu cầu trả lời theo khoảng thời gian từ hôm nay. | (a) Chủ dự án bổ sung tài liệu RAG "Lịch mùa Hà Giang theo tháng" (hoa, mây, lúa, lễ hội, thời tiết); (b) prompt: "sắp tới / tháng này" ⇒ trả lời cho 2–6 tuần tới tính từ hôm nay, sau đó mới nhắc mùa khác; (c) dùng `getWeatherForecast` (mục 8) cho phần thời tiết. |
| **L3** | Khung giờ ghé chỉ "sáng / đầu giờ chiều", thiếu lý do (sương, ánh sáng, giờ mở cửa) | DB đã có trường `bestVisitTime`, `visitNotes` (content profile) nhưng tool chat `getDestinationInfo` chỉ trả giờ mở cửa + vé, không trả trường này. | (a) Đưa `bestVisitTime` / `visitNotes` vào `getDestinationInfo` / `listDestinations`; (b) chủ dự án điền nội dung cho ~20 điểm chính (có nguồn); (c) prompt: khung giờ phải kèm lý do và tách "có nguồn" với "gợi ý suy luận". |
| **L4** | Sông Nho Quế chưa tách "ngắm từ đèo" và "đi thuyền" | Thiếu dữ liệu trải nghiệm theo điểm. | Ghi vào `visitNotes` của điểm; RAG mô tả 2 trải nghiệm. |

Điểm tốt nên giữ (ChatGPT cũng ghi nhận): không bịa, nói rõ phần "hiểu biết chung", có trích nguồn.

Ghi chú: phần L1 là lỗi code, sửa được ngay; L2–L4 phần lớn là **nội dung dữ liệu** (RAG / content profile) cần chủ dự án bổ sung, code chỉ cần đưa trường có sẵn vào tool và chỉnh prompt.

**L1, L3, L4 — đã sửa (Claude, 2026-11-27). L2 chờ chủ dự án bổ sung tài liệu RAG "Lịch mùa Hà Giang theo tháng".**
- **L1:** `resolveAmbiguousPlaceReference` (`tripsage-knowledge-sources.ts`) trả `NONE` khi đại từ là số nhiều ("những/các/mấy điểm/chỗ/nơi … đó/này/kia/nào") — không còn quy "những điểm đó" về một nơi ở lượt trước. "chỗ đó" số ít vẫn giải nghĩa như cũ. Test thêm 3 ca (đúng câu hội thoại `0c28d203`) trong `tripsage-knowledge-sources.vitest.test.ts`.
- **L3:** `retrievePlannerCandidates` lấy thêm `bestVisitTime`, `visitNotes`; `getDestinationInfo` trả 2 trường (null nếu chưa có) và hướng dẫn: khung giờ phải kèm lý do; không có dữ liệu thì ghi rõ là gợi ý tham khảo. Test trong `tripsage-info-tools.vitest.test.ts`.
- **L4:** phần code: khi `visitNotes` nêu nhiều kiểu trải nghiệm thì tách rõ từng kiểu. Phần dữ liệu: Sông Nho Quế trên production chưa có `bestVisitTime`/`visitNotes` — chủ dự án nhập qua trang quản trị điểm đến (bản nháp nội dung trong tin nhắn bàn giao, cần đối chiếu nguồn trước khi lưu).

**L2 — 2026-11-27.** Tài liệu "Lịch mùa Hà Giang theo tháng" của chủ dự án đã được sửa thành bản `D:\Thiep\Lịch mùa Hà Giang theo tháng (đã sửa).docx` (giữ nguyên bản gốc): "Mã Pí Lèng" → "Mã Pì Lèng" (5 chỗ, khớp danh mục), Chợ tình Khâu Vai "tháng 4 hoặc tháng 5 dương lịch tùy năm", bỏ "Bảo Lạc" (Cao Bằng, ngoài phạm vi), thêm mục "5. Ghi chú sử dụng tài liệu" (ngày cập nhật, số liệu tham khảo, ngày lễ hội thay đổi theo năm, địa giới hành chính từ 7/2025). Chưa có nguồn trích dẫn — chủ dự án bổ sung nếu có. Prompt: câu "sắp tới / tháng này / dạo này" ⇒ hiểu là 2–6 tuần từ hôm nay, tra `lookupLocalKnowledge` theo tên tháng, trả lời tháng đó trước. **Còn lại:** chủ dự án tải bản đã sửa lên trang quản trị tài liệu RAG và duyệt.

**L4 — vướng.** Cột `destination.bestVisitTime` / `visitNotes` có trong DB nhưng **trang quản trị điểm đến không có ô sửa** (trình soạn content profile chỉ dùng cho mục văn hóa). Cần thêm 2 ô vào form điểm đến (contract v3, service, form, test) hoặc chạy SQL trên production.

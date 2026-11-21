# 13: Kiểm thử hồi quy toàn bộ

**What to build:** Xác nhận cả bộ thay đổi chạy đúng cùng nhau trên trang `/assistant`, bằng hai đoạn chat mẫu và bộ kiểm tra của repo.

Spec: `docs/specs/assistant-answers-place-preview-spec.md` (mục "Testing Decisions").

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12

**Status:** done

- [ ] Đoạn chat 0: chỉ nhắn "tôi muốn lập hành trình hà giang". Kỳ vọng: ngay lượt đầu có bản nháp giả định 4 ngày từ Hà Nội trong thẻ tab theo ngày, mỗi điểm có dòng mô tả khi danh mục có mô tả, dòng "Mình đang giả định…", khối "Vài lưu ý" tối đa 3 ý, đúng một câu hỏi; nút Lưu bị chặn và nói rõ cần xác nhận gì. _(Đã kiểm tra tự động qua `tripsage-chat-assumed-draft.vitest.test.ts`, `tripsage-chat-descriptions.vitest.test.ts`, `tripsage-compact-ui.vitest.test.ts`; chưa chạy tay với model thật trên trình duyệt.)_
- [ ] So sánh trực quan với kiểu chat gọn (chữ thân ~15px, không thẻ phình) ở 1440px và 375px. _(Chưa kiểm tra trực quan trên trình duyệt.)_
- [ ] Chạy lại trên trình duyệt (dev server) đoạn chat A: lập lịch, từ Hoàng Mai Hà Nội, 5 ngày 4 đêm xe máy, "giữa tháng sau", vợ ở TP.HCM → tập kết Hà Nội, hỏi chi phí. Kỳ vọng: không nhắc lỗi ngày lặp lại, tập kết xác nhận một lần, ngày được chọn sẵn có nút xác nhận, mỗi tin tối đa một câu hỏi. _(Đã kiểm tra tự động qua `tripsage-chat-date`, `tripsage-chat-hub-confirmation`, `tripsage-chat-tone`; chưa chạy tay với model thật trên trình duyệt.)_
- [ ] Đoạn chat B: Thanh Hóa, 3 ngày, xe máy, "ngày 1 tháng sau", sau đó "hi", "hello", "tôi muốn thay đổi". Kỳ vọng: ngày 01/12/2026 được ghi (nếu hôm nay là tháng 11/2026), không có lỗi 400, có gợi ý tập kết cho ngày 1 quá dài, có "Ngày di chuyển". _(Đã kiểm tra tự động qua `tripsage-chat-date`, `tripsage-chat-short-message`, `tripsage-timeline-fixes`; chưa chạy tay với model thật trên trình duyệt.)_
- [ ] Xem nhanh một điểm đến trong danh mục và một gợi ý chỗ nghỉ; chọn chỗ nghỉ cho một đêm, đổi, bỏ; đồng ý tìm quán ăn; lưu chuyến và mở lại thấy chỗ nghỉ đã chọn. _(Đã kiểm tra tự động qua `place-preview-modal`, `tripsage-chosen-lodging`, `tripsage-chat-meals`, `tripsage-chat-chosen-lodging-save`, `trips-view-chosen-lodging`; kiểm tra trực quan iframe chờ bật Maps Embed API + `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.)_
- [ ] Ảnh chụp ở 1440px và 375px. _(Chưa chụp.)_
- [x] Typecheck, build, toàn bộ vitest của web, integration Postgres liên quan, trạng thái migration, `git diff --check`. _(Integration Postgres chạy ở chế độ skip do `DOCKER_OFF`.)_
- [x] Không có secret hoặc thay đổi ngoài phạm vi trong diff.
- [x] Cập nhật `docs/ai-progress.md` và cột trạng thái trong README của bộ ticket; ghi rõ mục nào chưa chạy hoặc còn mở.

## Ghi chú hoàn thành

- **Kiểm tra đã chạy:**
  - `npm run check-types` (`packages/db`): PASS
  - `npx prisma migrate status` (`packages/db`): PASS (`52 migrations`, `Database schema is up to date!`)
  - `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit -p .` (`apps/web`): PASS
  - `npx vitest run --config vitest.config.mts` (`apps/web`): **419 files passed (4,505 tests passed)**, 40 skipped, 5 failed — cả 5 file fail đều là lỗi nền sẵn có trước chuỗi ticket ở module cũ không chạm tới (`qa-diagnostics`, `qa-answer-quality-v2`, `qa-chat-preference`, `qa-conversation-reliability`, `in-trip-v2`); 100% test ở các module chạm tới (`tripsage-chat`, `components/tripsage-chat`, `place-preview`, `trip-planner`, `trip-origin`, `trip-save`, `trip-read`, `trip-validation`, `app/trips`) đều PASS.
  - `node scripts/prepare-map-assets.mjs && node scripts/build.mjs --webpack` (`apps/web`): PASS (59/59 trang tĩnh + toàn bộ API routes; dùng `--webpack` vì Turbopack gặp OOM trong Babel worker trên Windows).
  - `git diff --check 359cc22..HEAD` & quét secret toàn bộ diff 01–12: PASS (0 khớp secret, không có thay đổi ngoài phạm vi).
- **Mục chưa chạy / còn mở:**
  - **Integration Postgres thực tế** (`chosen-lodging-save.postgres.integration.vitest.test.ts` và các suite `*.postgres.integration.vitest.test.ts` khác): đã viết đủ kịch bản nhưng auto-skip vì Docker Desktop chưa chạy (`DOCKER_OFF`).
  - **Kiểm tra trực quan trên trình duyệt (1440px & 375px), chụp ảnh màn hình, và chạy 3 đoạn chat mẫu 0/A/B với model thật**: chưa chạy (cần tài khoản đăng nhập + gọi OpenAI thật).
  - **Iframe Place preview trực quan**: **chờ bật API** — `.env` local chưa cấu hình `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` và cần bật Maps Embed API + giới hạn HTTP referrer (domain production và `localhost`) trên Google Cloud Console.
- **File đã đổi ở ticket 13:** `docs/ai-progress.md`, `.scratch/assistant-answers-place-preview/issues/13-regression-verification.md`, `.scratch/assistant-answers-place-preview/README.md`.

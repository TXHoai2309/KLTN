# 10: Đổi lịch đã lưu và thông báo nhất quán trong nhóm

**What to build:** Host sửa/lưu lịch bằng luồng Trip hiện có; nhóm xem lịch mới nhất và nhận tin hệ thống nêu thay đổi ngày/điểm/giờ.

**Blocked by:** TC-07 — Gửi tin văn bản/link và đọc lịch sử nhóm

**Status:** IMPLEMENTED LOCALLY; vertical FE/integration VERIFIED

**Approval:** Owner approved the unchanged 11-ticket breakdown and blocking edges on 2026-10-28. Implementation has not started.

**Source:** Approved travel-companions plan Q1, Q6, Q16; single-owner decision ADR-23; current domain glossary and approved UI/UX scope.

**BE part:** Tích hợp Trip edit/confirmed-save transaction với group revision/system message, giữ owner/Validator/confirmation và chống event trùng khi replay. Cập nhật public projection an toàn.

**FE part:** Render tin hệ thống khác tin người, lối mở lịch mới nhất và cập nhật summary; người dùng được rời nhóm theo luồng đã có nhưng không phải duyệt thay đổi thay host.

- [x] Chỉ lịch chính thức đã lưu thành công làm đổi revision và tạo notice; preview, FAILED, hủy chỉnh hoặc proposal AI chưa lưu không phát tin đã đổi.
- [x] Trip update/revision/notice nhất quán trong một transaction; replay không thêm notice trùng hoặc ghi lịch hai lần.
- [x] Thành viên đọc lịch mới nhất mà vẫn không có quyền edit; không thêm xác nhận toàn nhóm hoặc ghi đè kiểm tra Validator.
- [x] Đổi ngày ảnh hưởng điều kiện nhận người theo ngày Việt Nam và public allowlist; không lộ yêu cầu cá nhân/AI history vào notice công khai.
- [x] Có kiểm tra transaction rollback/replay và UI xem lịch từ notice; completed visits vẫn theo quy tắc Trip hiện tại.

**Demo / verification:** Host lưu đổi giờ một ngày; thành viên thấy đúng một notice và lịch mới. Hủy chỉnh không tạo notice.

**Completion:** This vertical ticket is complete only when BE, FE and integration evidence are recorded. Completing one role does not complete this ticket. Application implementation has not started.

**BE evidence:** BE READY FOR FE — Revision TC10-notice-r1. Existing confirmed applyEdit persistence seam now calls recordCompanionItineraryChange from companion-itinerary-notice.ts inside the same Trip CAS/itinerary/idempotency transaction, after final day/visit writes. Source audit found this is the authoritative existing-trip MANUAL/AI/IN_TRIP write seam; new Trip Save has no publication yet, completion only updates its own timestamp. Current editor intentionally keeps Trip date/duration/transport immutable; this ticket does not add a metadata-edit bypass. Semantic comparison ignores regenerated visit IDs and checks dates/destinations/time-duration: unchanged content, preview, canceled/unconfirmed or FAILED proposals create no notice. Publication itineraryRevision and shared messageSequence increment atomically with SYSTEM message, so rollback/replay cannot leave a new schedule without its notice or duplicate it. Existing owner, Validator, explicit confirmation and completed-visit checks remain intact. No new UI endpoint; history/delta now accept additive SYSTEM union {author:null,notice:{type:ITINERARY_CHANGED,revision,changes:{dates,destinations,times}}}; text is generic and omits contact/AI/hidden destination names. Group reader adds optional itineraryRevision; unread includes SYSTEM notices for host/member. Shared companionSystemNoticeSchema and CompanionMessage union remain client-safe; FE must branch by kind and reread /group for latest itinerary. Migration 20261028140000_companion_itinerary_revision adds revision, SYSTEM kind, nullable author and notice/authorship constraint. Evidence: PostgreSQL46 PASS (3 actual confirmed MANUAL/IN_TRIP/no-op/rollback/replay cases + earlier43),22 scoped migrations/0 pending/cleanup PASS; affected apply-edit/US32/US33/US37/schema regression65 PASS. Strict backend source typecheck separated from stale concurrent Next generated artifacts; final combined build/root check still OPEN. Development scoped migration deploy verified separately; no Production/provider/FE changes. Backend continues TC-11.

**FE evidence:** Rendered distinct SYSTEM message pill in `companion-group-view.tsx`. For `ITINERARY_CHANGED`, displays change tags (`.companion-notice-tag`: Đổi ngày, Đổi điểm, Đổi giờ) derived from `notice.changes` and "Xem lịch trình chi tiết" button (`data-testid="companion-chat-view-itinerary-btn"`). Clicking button or receiving delta items with `ITINERARY_CHANGED` re-fetches latest group schedule via `fetchCompanionGroup`, seamlessly updating `currentGroup.itinerary` and `currentGroup.itineraryRevision`. Itinerary banner displays `(Bản cập nhật #{revision})`. 14 unit tests in `companion-group.vitest.test.ts` PASS.

**Integration evidence:** Disposable PostgreSQL 11 files / 58 tests PASS (including 4 tests in `companion-notice.postgres.integration.vitest.test.ts`). `npm run check-types` 4/4 packages PASS. `npm run build --workspace web` compiled 53 static/dynamic routes cleanly. `git diff --check` reported 0 whitespace errors.



**Final BE receipt (2026-10-28):** Full backend scope through TC-11 verified: PostgreSQL58/58, focused340 PASS, types/build/auth HTTP PASS; Development42 applied/0 pending/unfinished. Final commands, limits and five unchanged-baseline broad regression failures: [verification](../../../docs/implementation/trip-companions-backend-verification.md). Existing FE/integration evidence is preserved; no owner ACCEPTED claim.

# 06: Điểm ngoài trời

Spec: `docs/stories/WEATHER-SUN-ADVISORIES.md` · ADR-36 · thuật ngữ theo `GLOSSARY.md` (Weather and sun times).

**What to build:** Admin đánh dấu được một điểm đến là ngoài trời trong form điểm đến và thấy cờ này trong danh sách admin. Điểm đến hiện có mặc định là "không", không suy ra từ category.

**Blocked by:** None (can start immediately).

**Status:** implemented 2026-11-18 (agent); live browser and owner acceptance pending

- [ ] Prisma migration thêm cột boolean mặc định `false` cho Destination; SQL được review; không dùng `db:push`.
- [ ] Form admin có ô chọn "ngoài trời"; lưu theo luồng ghi điểm đến hiện có.
- [ ] Danh sách admin hiện cờ ngoài trời.
- [ ] Contract điểm đến công khai và contract dùng cho lập lịch có trường này.
- [ ] Test form admin và test contract được cập nhật; `prisma migrate status` sạch trên Development sau khi owner cho phép apply.
- [ ] Typecheck, test, build và `git diff --check` PASS.

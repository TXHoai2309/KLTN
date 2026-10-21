# 01: Đọc đúng nội dung và nguồn của TXT, Word DOCX và PDF

**What to build:** Admin nạp một trong ba định dạng hiện hỗ trợ — TXT, Word DOCX hoặc PDF — và hệ thống phân biệt đúng nội dung tri thức với khai báo/danh mục nguồn. Sau khi index, người dùng nhận câu trả lời từ nội dung thực, với liên kết nguồn gốc được ánh xạ đúng, thay vì chọn danh mục tài liệu tham khảo làm bằng chứng như trường hợp Hạ Thành. TXT là ví dụ lỗi đã quan sát, không phải giới hạn phạm vi ticket.

**Blocked by:** None (can start immediately).

**Status:** DONE

- [x] Có cùng hợp đồng kết quả nội dung/nguồn cho cả TXT, DOCX và PDF; không yêu cầu người dùng chuyển tất cả tài liệu sang TXT hoặc chuẩn bị một câu trả lời viết sẵn.
- [x] Nhận diện tiêu đề mục và khai báo nguồn trong các biến thể thực tế: mã có/không có ngoặc vuông, URL dưới đoạn và danh mục nguồn cuối tài liệu; giữ mỗi mã trong đúng tài liệu của nó.
- [x] Xử lý đặc thù từng định dạng: dòng/đoạn TXT; mục, bảng và hyperlink DOCX; dòng/trang PDF và khai báo nguồn bị xuống dòng hoặc chuyển trang. Chỉ công nhận liên kết và phạm vi nguồn có thật trong tài liệu.
- [x] Danh mục nguồn và các dòng URL/khai báo nguồn được dùng làm metadata; không coi tên bài báo trong danh mục là bằng chứng cho nội dung của bài.
- [x] Liên kết nguồn gốc chỉ xuất hiện khi có ánh xạ rõ ràng từ đoạn được dùng; nguồn thiếu, mâu thuẫn hoặc không rõ phạm vi không bị đoán thành trích dẫn hợp lệ.
- [x] Đoạn giới thiệu, nhà sàn và văn hóa Hạ Thành vẫn được giữ làm nội dung có thể truy xuất; không vô tình xóa điều kiện, phủ định hoặc mốc năm khi tách metadata.
- [x] Cập nhật phiên bản parser/bundle theo quy trình index hiện có, giữ tính bất biến và lịch sử cũ; không tự backfill hay sửa tài liệu Production trong ticket này.
- [x] Kiểm thử qua luồng trích xuất/index/truy xuất/hiển thị nguồn bằng fixture tương đương ở cả TXT, DOCX và PDF, gồm nội dung Hạ Thành, thiếu nguồn, nguồn mâu thuẫn và danh mục tách khỏi thân bài; không chỉ kiểm thử TXT rồi coi hai định dạng còn lại là hồi quy phụ.
- [x] Tài liệu không trích được nội dung, bị mã hóa hoặc có phần không đọc được giữ trạng thái/cảnh báo thực tế theo hợp đồng xử lý hiện có; không tuyên bố đã đọc thành công phần chưa trích xuất. Phạm vi này không tự thêm OCR hoặc hỗ trợ định dạng Word nhị phân .doc cũ.
- [x] Lịch sử trích dẫn cũ vẫn đọc được và giữ đúng phiên bản nguồn của lượt hỏi.
- [x] Có bằng chứng offline về câu trả lời và liên kết nguồn đúng; phân biệt với việc index/backfill dữ liệu thật chưa được thực hiện.

### Implementation Evidence
- Parser version bumped to `explicit-section-sources-v2` in `apps/web/src/modules/rag-processing/original-sources.ts`. Schema supports both `v1` (legacy compatibility) and `v2`.
- Robust multi-format bibliography recognition added:
  - `BIBLIOGRAPHY_HEADING` regex matches "Danh mục tài liệu tham khảo", "Tài liệu tham khảo", "Nguồn tham khảo", etc.
  - Matches lines formatted with `[S01]`, `[S1]`, `S01:`, `S1.` across TXT, DOCX, and PDF text.
  - Treats standalone/inline `Nguồn:` and `Nguồn: [S01]` properly, attaching to previous content segment or inline.
  - Chunks in bibliography marked as `metadataOnly: true` and excludedSpans recorded in citation evidence text.
- `apps/web/src/modules/rag-index/rag-citation-store.ts`:
  - `loadCitationBundle` now searches for `explicit-section-sources-v2` first, then falls back to `explicit-section-sources-v1`.
- Vitest suites passing:
  - `apps/web/src/modules/rag-processing/original-sources.vitest.test.ts`: 20 tests passed, 1 skipped.
  - `apps/web/src/modules/rag-processing/extraction.vitest.test.ts`: 40 tests passed.
  - `apps/web/src/modules/rag-index/rag-index-worker.vitest.test.ts`: 28 tests passed, 3 skipped.

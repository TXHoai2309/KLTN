# Tổng hợp 3 bản phản biện báo cáo khoá luận (Claude, Codex, Gemini)

- **Code đối chiếu:** repo `D:\KLTN\KLTN`, nhánh `master`, commit `c1f1e12`.
- **Ngày tổng hợp:** 28/11/2026.
- **Cách tổng hợp:** ý nào cả ba bản cùng nêu, hoặc các bản ghi số khác nhau, đã được kiểm lại trực tiếp trên code (đánh dấu ✅). Ý nào chỉ một bản nêu thì ghi rõ là chưa kiểm.

> **Lưu ý:** cả ba bản đều ghi vào cùng file `docs/analysis/review-bao-cao.md`. File hiện chỉ còn một bản dài 825 dòng, có lẽ là bản của Claude. Bản 1.453 dòng của Gemini và bản của Codex đã bị ghi đè. Muốn xem chi tiết của hai bản đó thì phải chạy lại, lần này ghi ra tên file khác.

**Đánh giá chung:** cả ba ước tính báo cáo khớp code khoảng 66–70%. Phần kỹ thuật lõi mô tả đúng. Phần sai tập trung ở số liệu, ở những câu nói quá ("mọi", "tuyệt đối"), ở chỗ các chương mâu thuẫn nhau và ở hình bị dán nhầm.

## A. Lỗi nghiêm trọng, phải sửa trước buổi bảo vệ

| # | Lỗi | Bản nêu | Kiểm lại |
|---|---|---|---|
| 1 | **Admin đọc được hội thoại TripSage của mọi người dùng**, trái với câu "Admin bị chặn tuyệt đối dữ liệu riêng tư" | Cả 3 | ✅ Route `api/admin/assistant-traces/[id]` chỉ kiểm tra quyền admin rồi đọc trace theo bất kỳ id hội thoại nào (`tripsage-tool-trace.ts`) |
| 2 | **Validator không có nhóm "Ngân sách"**. Code có 4 nhóm: giờ mở cửa, thời lượng tham quan, thời gian di chuyển, xung đột lịch. Planner có thêm nhóm MOBILITY, đây là lý do Hình 4.38 hiện "5/5" | Claude, Gemini, Codex ("mâu thuẫn") | ✅ `trip-validation.ts` không có budget hay price |
| 3 | **Số liệu kiểm thử QA**: báo cáo ghi 535/535 PASS, thực tế 530 PASS và 5 test case US-38 chưa chạy. Gemini còn thấy bảng Sprint trong Hình 5.2 cộng ra 471, và SP4 ghi 114 ở chỗ này nhưng 129 ở chỗ khác | Cả 3 | Chưa kiểm lại file Excel |
| 4 | **RQ1/RQ2 ở mục 1.4.1 không có thực nghiệm**: không có kết quả so sánh với LLM thuần | Claude, Gemini | Hai bản cùng kết luận |
| 5 | **Bản đồ mặc định là Stadia**, nhưng báo cáo chỉ nhắc Google. TLTK [8] gán nhầm Valhalla cho Google | Claude, Gemini | ✅ `maps-provider.ts` chỉ chọn GOOGLE khi biến môi trường được đặt rõ, còn lại là STADIA |
| 6 | **Số bảng và migration**: có 55 bảng (thiếu `destination_travel_time`) và 56 migration. Báo cáo ghi 54 bảng, migration lúc 54 lúc 55 | Claude, Gemini, Codex | ✅ Đếm được 55 model, 56 migration |
| 7 | **Không có Playwright**. 528 chỉ là số tệp Vitest | Claude, Gemini | ✅ Không có tệp `.spec.ts`; có 528 tệp vitest, tổng 559 tệp test. Gemini ghi 567 vì đếm theo cách khác, nên dùng 559 |
| 8 | **TripSage có 23 công cụ**, không phải 17 | Claude, Gemini | Hai bản trùng nhau, chưa đếm lại |
| 9 | **Hình bị dán nhầm**: Hình 4.5 là ERD Điểm đến thay vì ERD Trợ lý AI; Hình 4.31 trùng Hình 4.30; Hình 4.44 chụp màn Edit AI thay vì In-Trip GPS | Gemini (Claude cũng nghi ngờ 4.5, 4.6, 4.31) | Mở file .docx gốc kiểm tra |
| 10 | **Mục 4.3.3 bị dán đè** bằng đoạn nói về 4 trigger PostgreSQL, mất nội dung 4.3.3.1–4.3.3.2, còn sót chữ cụt "torial)" | Chỉ Gemini | Mở file .docx kiểm tra |
| 11 | **DFD1 (Hình 3.5)**: đảo vị trí tiến trình 7.0 và 8.0, kho dữ liệu lệch với Bảng 3.4–3.5 và các DFD2 | Gemini (Claude có bản sửa DFD1) | Dùng bản Mermaid của Claude |

## B. Cơ chế mô tả sai (lỗi trung bình)

- **Lập chỉ mục RAG chạy đồng bộ** ngay trong request, không phải bất đồng bộ (Claude).
- **Ảnh đi qua server rồi mới lên Cloudinary**: Next.js nhận ảnh, xử lý bằng `sharp`, rồi server tải lên. Trình duyệt không tải thẳng bằng chữ ký (Claude, Gemini).
- **Điểm đến dùng trạng thái `HIDDEN/VISIBLE`**, không có `DRAFT/PUBLISHED` ✅ (đã kiểm trong schema).
- **PostGIS chỉ được bật, chưa dùng.** Toạ độ lưu bằng số thực (Claude).
- **Trình quản lý gói là `npm@11.16.0`**, không phải pnpm ✅ (Gemini).
- **Giới hạn tần suất Q&A** đang đặt `100_000_000`, tức gần như tắt ✅ (`apps/web/src/modules/ai/qa-abuse.ts`). Nếu báo cáo nói có chống lạm dụng thì phải ghi rõ ngưỡng này đang được nới.
- **Dữ liệu production** chỉ có 22 điểm đến hiển thị và 18 tài liệu RAG (Gemini, lấy từ `docs/data-audit-destinations-2026-11-22.md` và Hình 4.48). Báo cáo nói nhiều hơn thì phải sửa.

## C. Ba bản khác nhau ở đâu

- **Claude** cho nhiều bản sửa dùng ngay nhất: 71 phát hiện có câu thay thế viết sẵn, ma trận 32 tính năng, bản sửa Mermaid cho DFD1, DFD 3.8, DFD 3.10, kiến trúc, P03, P07, P08, sơ đồ trạng thái, sơ đồ tuần tự RAG, cùng 13 câu hội đồng có thể hỏi.
- **Gemini** bắt được nhiều lỗi biên tập nhất: hình dán nhầm, mục 4.3.3 bị đè, cộng sai bảng Sprint, npm, rate-limit, số liệu production. Bản này cũng có danh mục 105 API route và ERD đủ 55 bảng.
- **Codex** chỉ có 17 phát hiện và tự nhận chưa rà xong. Bản này không có điểm nào mà hai bản kia bỏ sót.

## D. Việc nên làm theo thứ tự

1. Sửa câu về quyền Admin. Cách dễ nhất là viết đúng thực tế: "Admin xem được trace hội thoại để gỡ lỗi, nhưng không sửa được". Khó hơn là chặn quyền này trong code.
2. Bỏ "Ngân sách" khỏi Validator. Ghi 4 nhóm, và giải thích MOBILITY là nhóm thứ 5 nằm ở Planner.
3. Sửa lại số liệu: 530/535, 55 bảng, 56 migration, 23 công cụ, 559 tệp test, không có Playwright.
4. Thêm Stadia vào chương 2 và chương 4, sửa TLTK [8].
5. Thay các hình 4.5, 4.31, 4.44 và DFD1; khôi phục mục 4.3.3.
6. RQ1/RQ2: hoặc chạy thực nghiệm nhỏ, hoặc chuyển sang mục "hướng phát triển". Hội đồng gần như chắc chắn sẽ hỏi phần này.

## E. Logic các hình (kiểm bổ sung ngày 28/11)

Các hình được trích từ file `.docx` theo thứ tự, mỗi ảnh ghép với chú thích "Hình x.y" ngay sau nó. Em đã tự xem các hình dưới đây và đối chiếu với `packages/db/prisma/schema/*.prisma` và code.

### E.1. Hình đặt nhầm hoặc trùng (phải thay)

| Hình | Chú thích | Thực tế trong ảnh | Sửa |
|---|---|---|---|
| 4.5 | ERD cụm Trợ lý AI và Q&A | ERD **Điểm đến** (Điểm đến ở giữa, có giờ mở cửa, biên tập, media, khu vực). Báo cáo **không có** ERD mở rộng cụm AI | Vẽ ERD AI: Người dùng – Hội thoại trợ lý – Tin nhắn; Hội thoại hỏi đáp – Lượt; Không gian lập kế hoạch; Bộ nhớ du khách |
| 4.6 | ERD cụm Điểm đến và văn hoá | ERD **Văn hoá** (Nội dung văn hoá ở giữa) | Đổi chú thích thành "cụm Nội dung văn hoá", hoặc đưa ảnh của 4.5 sang đây |
| 4.31 | Mô hình quan hệ – Tài liệu tri thức và cấu hình | **Trùng Hình 4.30** (nhóm Chuyến đi). Các bảng `rag_*`, `runtime_config*`, `idempotency_record`, `qa_abuse_*` không có hình nào | Vẽ lại |
| 4.44 | Giao diện Trợ lý trong chuyến đi (In-Trip) | Màn **Chỉnh sửa lịch trình** (có nút "Lưu thay đổi", "Huỷ chỉnh sửa") | Chụp lại màn In-Trip |

### E.2. Quan hệ ERD sai so với schema

| Hình | Lỗi | Bằng chứng |
|---|---|---|
| 4.30 | Vẽ Chuyến đi – Bài đồng hành là **1–N** (chân chim phía bài đăng), trong khi schema là **1–1** | `TripCompanionPublication.tripId @unique`. Hình 4.3 và 4.7 lại vẽ đúng 1–1, nên ba hình mâu thuẫn nhau |
| 4.30 | Thiếu `trip_nearby_suggestion`, `trip_companion_read_marker`, `external_place`. Lượt tham quan có `externalPlaceId` nhưng không vẽ bảng đích | `trip.prisma` |
| 4.3, 4.4 | Vẽ Người dùng **1–N** Hội thoại hỏi đáp bằng quan hệ "Hỏi". Thực tế không có khoá ngoại tới `user`: hội thoại thuộc về chủ thể `principalKind/principalId`, có thể là **khách vãng lai** | `QaConversation` không có `@relation` tới User. Hình 4.27 vẽ đúng (không nối) |
| 4.8 | Thiếu `rag_index_publication`, bảng giữ thế hệ chỉ mục đang được công bố (1 tài liệu – 1 thế hệ). Đây chính là cơ chế "công bố nguyên tử" mà báo cáo mô tả. Thiếu `rag_citation_bundle` | `RagIndexPublication.ragDocumentId @unique`, `generationId @unique` |
| 4.27 | Thiếu `assistant_planning_turn` và `assistant_v2_session_head` | `assistant-planning.prisma`, `assistant-v2-session.prisma` |

Các hình 4.4 (trừ quan hệ "Hỏi"), 4.6, 4.7 và 4.8 (trừ phần thiếu ở trên) khớp schema về bội số: Điểm đến – Khu vực M–N, Văn hoá – Cộng đồng M–N, Đoạn – Vector 1–1, Nhật ký quản trị có 2 quan hệ (người thực hiện, người bị tác động).

### E.3. Lỗi logic lộ ra trên ảnh chụp giao diện (Hình 4.44)

1. **Câu thông báo sai nghĩa.** Ảnh ghi "Du Già: dự kiến đến nơi lúc 13:13 …, **sớm hơn** giờ mở đầu 09:42", nhưng 13:13 muộn hơn 09:42. Code kiểm đúng (`visit.startMinute < estimatedArrival`, tức đến muộn hơn giờ đã xếp), nhưng câu chữ và mã lỗi `JOURNEY_ARRIVAL_TOO_EARLY` lại nói ngược. Vị trí: `apps/web/src/modules/trip-edit/edit-journey-server.ts:257-262`. Nên sửa câu thành "muộn hơn giờ bắt đầu lượt đầu tiên" trước khi chụp lại, vì hội đồng nhìn ảnh là thấy.
2. **Số điểm cần xem lại không khớp:** khung chính ghi 6, thanh bên ghi 7. Nếu không giải thích được (ví dụ một bên tính thêm chặng đi/về) thì nên chụp lại.

### E.4. Các hình còn lại

- Swimlane 2.24–2.43, BFD/DFD 3.1–3.13 và kiến trúc 4.1–4.2: xem nhận xét từng hình và bản sửa Mermaid ở `review-bao-cao.md` mục 4. Hình sai nặng nhất là DFD1 (3.5), DFD 3.8 và DFD 3.9–3.11 (có kho D7 và "ngân sách" không tồn tại).
- **Báo cáo không có** sơ đồ use case, sequence hay state. Hội đồng có thể hỏi; bản sequence và state viết sẵn nằm ở `review-bao-cao.md` mục 4.6–4.7.

## F. Đã xử lý ngày 28/11

**Đã sửa code:**
- Câu báo đến muộn (`edit-journey-server.ts`) đổi thành "…muộn hơn giờ bắt đầu lượt đầu tiên hh:mm". Mã `JOURNEY_ARRIVAL_TOO_EARLY` giữ nguyên vì 4 module và các ADR dùng chung. Đã thêm kiểm tra câu chữ vào test.
- Thanh bên màn sửa lịch đổi "N điểm cần xem lại" thành "N lỗi cần xem lại", vì thanh bên đếm số lỗi còn khung trợ lý đếm số điểm. Cần chụp lại Hình 4.43/4.44.

**Chủ dự án chọn sửa báo cáo, giữ code:**
- Quyền Admin xem trace. Câu đề xuất: "Du khách chỉ xem được dữ liệu của mình. Admin không sửa được dữ liệu riêng của Du khách, nhưng có màn xem dấu vết công cụ AI (chỉ đọc, không lưu cache) để gỡ lỗi hội thoại TripSage."
- Giới hạn Q&A. Câu đề xuất: "Cơ chế đếm yêu cầu và khoá đồng thời đã cài đặt (`qa-abuse.ts`), nhưng ngưỡng đang được nới rất cao (100 triệu) theo quyết định của chủ dự án trong giai đoạn kiểm thử; ngưỡng vận hành thật là hướng phát triển."

## G. Chưa kiểm

- Số liệu trong file Excel QA.
- Mục 4.3.3 trong .docx.
- Em chưa tự xem: ERD 4.9–4.26, mô hình quan hệ 4.26, 4.28, 4.29, wireframe 4.32–4.36 và ảnh giao diện ngoài 4.44.
- Số 23 công cụ TripSage.
- Dữ liệu production (Stadia hay Google, số điểm đến, số tài liệu RAG).
- Typecheck và test: chưa chạy ở bản nào.

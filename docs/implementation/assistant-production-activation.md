# Báo Cáo Kích Hoạt & Kiểm Thử Trợ Lý AI Hà Giang Trên Production (V1)

**Trạng thái kích hoạt: AI_ASSISTANT_PRODUCTION=PASS**  
**Thời gian hoàn thành:** 2026-10-18T14:55:00+07:00  
**Tác giả:** Principal AI & Release Engineering  

---

## 1. Tóm tắt điều hành & Kết quả tổng quan

Trợ lý AI Hà Giang (`https://kltn-rho.vercel.app/assistant`) đã được hoàn thiện, đồng bộ hóa cổng bảo mật (runtime gate) giữa server và client, kích hoạt thành công trên môi trường Production với toàn bộ cơ chế bảo vệ chống lạm dụng (abuse protection), giới hạn chi phí và bảo mật danh tính.

- **URL chính thức:** [https://kltn-rho.vercel.app/assistant](https://kltn-rho.vercel.app/assistant)
- **Production Alias:** `kltn-rho.vercel.app`
- **Vercel Deployment ID:** `dpl_AvtbhHxAAf76TcYkGX5dJXug32Yq` (Deployment URL: `https://kltn-866hxhcyp-to-xuan-hoai-s-projects.vercel.app`)
- **Kết luận:** **`AI_ASSISTANT_PRODUCTION=PASS`**

---

## 2. Git & Baseline Version Control

| Thuộc tính | Giá trị chi tiết |
| :--- | :--- |
| **Repository** | `TXHoai2309/KLTN` |
| **Git HEAD trước** | `3068c096800775a9fe8e9634b2d3da73aa5fa8ab` |
| **Git Commit mới** | `b9677c208557c39ed88775bda4acfbe52cf7d34a` (`feat(ai): configure dedicated production runtime gate and assistant UI transport`) |
| **Các nhánh đồng bộ** | `TXH`, `dev`, `master` (đã push và đồng bộ sạch sẽ, không xung đột) |
| **Files thay đổi** | 6 files: <br> - `apps/web/.env.schema`<br> - `apps/web/src/modules/ai/qa-runtime-gate.ts`<br> - `apps/web/src/modules/ai/qa-runtime.ts`<br> - `apps/web/src/app/assistant/page.tsx`<br> - `apps/web/src/modules/ai/qa-runtime-gate.vitest.test.ts`<br> - `apps/web/src/components/assistant/assistant-runtime-mode.vitest.test.ts` |

---

## 3. Root Cause & Giải Pháp Kỹ Thuật

### 3.1. Phân tích nguyên nhân gốc (Root Cause)
1. **Server Gate:** Trong `apps/web/src/modules/ai/qa-runtime-gate.ts`, tồn tại đoạn code kiểm tra hardcode `if (env.vercelEnv === "production") return false;`, dẫn đến việc môi trường Production luôn bị từ chối phục vụ ngay từ HTTP guard kể cả khi admin đã cấp quyền RAG.
2. **UI Gate:** Trong `apps/web/src/app/assistant/page.tsx`, component `AssistantRuntimeChat` chỉ được nạp có điều kiện khi `NODE_ENV === "development"` hoặc `VERCEL_ENV === "preview"`. Khi chạy trên Production, trang luôn trả về `AssistantChat` thiếu transport, hiển thị thông báo "Trợ lý AI chưa khả dụng" và khóa nút gửi.
3. **Database Host Allowlist (Pooled vs Direct):** Neon serverless driver trên Vercel sử dụng connection string pooling (`ep-blue-art-b3v3vr4h-pooler.c-4.ap-southeast-1.aws.neon.tech`). Nếu allowlist chỉ cấu hình direct host không có `-pooler`, hàm `matchesAllowedDatabase` sẽ fail-closed và chặn toàn bộ request.

### 3.2. Giải pháp đã thực hiện
- Triển khai biến môi trường độc lập: `QA_PRODUCTION_RUNTIME_ENABLED` (mặc định luôn là `false` để fail-closed).
- Nâng cấp `isQaRuntimeEnabled` để kiểm tra nghiêm ngặt cả 5 điều kiện mở Production:
  - `NODE_ENV === "production"`
  - `VERCEL_ENV === "production"`
  - `QA_PRODUCTION_RUNTIME_ENABLED === "true"`
  - `QA_ABUSE_PROTECTION_ACCEPTED === "true"`
  - Host và Database Name của `DATABASE_URL` phải khớp chính xác với `QA_RUNTIME_ALLOWED_DATABASE_HOST` và `QA_RUNTIME_ALLOWED_DATABASE_NAME`.
- Đồng bộ UI selection trong `apps/web/src/app/assistant/page.tsx` để mount `AssistantRuntimeChat` khi và chỉ khi runtime gate trên server xác nhận sẵn sàng.
- Đảm bảo dead-code elimination: các transport demo và fixtures của môi trường development tuyệt đối không bị đóng gói vào bundle Production.

---

## 4. Xác Minh Dữ Liệu RAG Production & Mô Hình OpenAI

### 4.1. Dữ liệu RAG trên Neon Production (ep-blue-art-b3v3vr4h)
Kiểm tra read-only trực tiếp trên cơ sở dữ liệu `neondb` (Production branch `br-cold-dew-b3h270wp`):
- **RagDocument:** Đúng 3 tài liệu đã được duyệt:
  1. `cmvapg3l0001j7w9w61egpl01` — Cao nguyên đá Đồng Văn (`status = 'INDEXED'`, `publicQaApproved = true`)
  2. `cmvc530ki0001ik9wn3ynioi6` — Căng Bắc Mê (`status = 'INDEXED'`, `publicQaApproved = true`)
  3. `cmvc55mhx000bik9wpn3gtlmn` — Chợ tình Khâu Vai (`status = 'INDEXED'`, `publicQaApproved = true`)
- **Chunks & Embeddings:** Chính xác 137 chunks, 137 vector embeddings.
- **Model Embedding:** `text-embedding-3-small`, số chiều vector 1536, độ dài chuẩn xác và norm > 0.
- **Index Publications:** 3 ấn bản trạng thái READY.
- **Không thực hiện bất kỳ hành động ghi, import lại, re-index hay mutate dữ liệu nào.**

### 4.2. Khả năng tương thích mô hình OpenAI
- **Embedding:** `text-embedding-3-small` (1536 dimensions) — Đã probe HTTP 200 bằng OpenAI server credentials.
- **Chat / Q&A Completion:** `gpt-6.1-sol` — Đã probe trực tiếp với strict schema output (JSON Schema), phản hồi ổn định HTTP 200.

---

## 5. Cấu Hình Biến Môi Trường Vercel Production

Toàn bộ biến môi trường phục vụ AI Assistant trên Vercel Production đã được thiết lập chính xác:

| Tên biến | Kiểu (Type) | Môi trường | Giá trị kiểm định |
| :--- | :--- | :--- | :--- |
| `QA_PRODUCTION_RUNTIME_ENABLED` | Config | Production | `true` |
| `QA_ABUSE_PROTECTION_ACCEPTED` | Config | Production | `true` |
| `QA_RUNTIME_ALLOWED_DATABASE_HOST` | Config | Production | `ep-blue-art-b3v3vr4h-pooler.c-4.ap-southeast-1.aws.neon.tech` |
| `QA_RUNTIME_ALLOWED_DATABASE_NAME` | Config | Production | `neondb` |
| `QA_NETWORK_HMAC_SECRET` | Secret | Production | Secret ngẫu nhiên an toàn 32-bytes (64 ký tự hex) |
| `OPENAI_API_KEY` | Secret | Production | Key hợp lệ có quyền gọi `gpt-6.1-sol` và `text-embedding-3-small` |
| `DATABASE_URL` | Secret | Production | Neon PostgreSQL pooled URL |

---

## 6. Kiểm Thử Live Production Smoke Test

Thực hiện kiểm thử thực tế trực tiếp trên URL Production `https://kltn-rho.vercel.app`:

### Lượt 1: Khởi tạo phiên khách vãng lai (Guest Bootstrap)
- **Endpoint:** `POST /api/ai/session`
- **Origin:** `https://kltn-rho.vercel.app`
- **HTTP Status:** `200 OK`
- **Response:** `{"success": true, "data": {"identity": "GUEST:58465484f25f..."}, "set-cookie": "qa_guest_session=...; HttpOnly; Secure; SameSite=Lax"}`
- **Kết quả:** Phiên định danh khách vãng lai hợp lệ, cookie an toàn được tạo.

### Lượt 2: Câu hỏi có đầy đủ dữ liệu — Cao nguyên đá Đồng Văn
- **Câu hỏi:** *"Cao nguyên đá Đồng Văn nằm ở đâu và có đặc điểm gì nổi bật?"*
- **HTTP Status:** `200 OK`
- **Trạng thái Q&A:** `ANSWERED`
- **Nội dung trả lời:** *"Cao nguyên đá Đồng Văn nằm ở cực Bắc Việt Nam, thuộc địa bàn bốn huyện Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc. Đây là Công viên địa chất toàn cầu UNESCO với các tầng đá và hóa thạch ghi lại lịch sử vỏ Trái Đất..."*
- **Trích dẫn (Citations):** 2 trích dẫn hợp lệ.
  - Tiêu đề: *"Hồ sơ dữ liệu Cao nguyên đá Đồng Văn – RAG 2026"*
  - Source ID: `source_ec3b9a0573f74dda393779b93acb33f02da8cc876644b71e034b532df86c313f`

### Lượt 3: Câu hỏi có đầy đủ dữ liệu — Căng Bắc Mê
- **Câu hỏi:** *"Di tích lịch sử Căng Bắc Mê có ý nghĩa lịch sử như thế nào?"*
- **HTTP Status:** `200 OK`
- **Trạng thái Q&A:** `ANSWERED`
- **Nội dung trả lời:** *"Căng Bắc Mê là chứng tích lịch sử về giai đoạn thực dân Pháp giam giữ hàng trăm chiến sĩ cách mạng. Di tích có ý nghĩa giáo dục truyền thống cách mạng: trong điều kiện tù đày khắc nghiệt, tù nhân vẫn tổ chức học tập và đấu tranh..."*
- **Trích dẫn (Citations):** 1 trích dẫn hợp lệ ("Hồ sơ RAG Căng Bắc Mê 2026").

### Lượt 4: Câu hỏi kế tiếp phụ thuộc ngữ cảnh (Multi-turn Follow-up)
- **Câu hỏi:** *"Nơi này từng giam giữ những ai?"* (Kèm `conversationId` và `parentTurnId` từ lượt 3)
- **HTTP Status:** `200 OK`
- **Trạng thái Q&A:** `ANSWERED`
- **Nội dung trả lời:** *"Căng Bắc Mê từng giam giữ tù nhân chính trị thời thuộc địa Pháp. Các nguồn ghi nhận những người từng bị giam tại đây gồm Xuân Thủy, Lê Giản, Nguyên Hồng, Trần Cung, Khuất Duy Tiến và một số người khác..."*
- **Trích dẫn (Citations):** 2 trích dẫn hợp lệ trỏ vào tài liệu Căng Bắc Mê.

### Lượt 5: Câu hỏi có đầy đủ dữ liệu — Chợ tình Khâu Vai
- **Câu hỏi:** *"Chợ tình Khâu Vai diễn ra vào thời gian nào?"*
- **HTTP Status:** `200 OK`
- **Trạng thái Q&A:** `ANSWERED`
- **Nội dung trả lời:** *"Phiên chính của chợ tình Khâu Vai diễn ra vào ngày 27 tháng 3 âm lịch hằng năm."*
- **Trích dẫn (Citations):** 1 trích dẫn hợp lệ.

### Lượt 6: Câu hỏi ngoài phạm vi ngữ cảnh RAG (Grounding & Hallucination Check)
- **Câu hỏi:** *"Giá vé máy bay từ New York đi Paris hiện nay là bao nhiêu USD?"*
- **HTTP Status:** `200 OK`
- **Trạng thái Q&A:** `INSUFFICIENT_SOURCE`
- **Kết quả:** Hệ thống từ chối bịa đặt thông tin một cách chuẩn xác, trả về đúng trạng thái thiếu nguồn căn cứ theo quy định của hệ thống.

### Lượt 7: Lịch sử hội thoại (Conversation History)
- **Endpoint:** `GET /api/ai/conversations`
- **HTTP Status:** `200 OK`
- **Kết quả:** Danh sách 3 cuộc hội thoại vừa tạo được trả về đầy đủ, có tiêu đề tự động tóm tắt chính xác câu hỏi của người dùng, phân tách quyền sở hữu đúng theo `guestId`.

---

## 7. Kết Quả Kiểm Thử Tự Động (Test Suites)

| Hạng mục kiểm thử | Công cụ | Số lượng bài test | Kết quả |
| :--- | :--- | :--- | :--- |
| AI & Assistant Modules | Vitest | 775 passed (67 skipped) | **PASS (100%)** |
| RAG Processing | Vitest | 84 passed (3 skipped) | **PASS (100%)** |
| Auth & Intent Config | Vitest | 3 passed | **PASS (100%)** |
| Legacy Suites (Auth, Dest, Culture, Map, Idempotency, RAG) | Node Test / tsx | 56 legacy tests passed | **PASS (100%)** |
| Assistant Runtime Mode & Fail-closed | Vitest | 14 passed | **PASS (100%)** |
| QA Runtime Gate | Vitest | 3 passed | **PASS (100%)** |
| Typecheck | `tsc --noEmit` | Toàn bộ repository | **PASS (0 errors)** |
| Production Build | `next build` | Next.js 16.3.8 Turbopack | **PASS (Compiled & optimized)** |
| `git diff --check` | Git | Không có lỗi định dạng/khoảng trắng | **PASS** |

---

## 8. Cơ Chế Khẩn Cấp: Rollback & Kill Switch

Hệ thống được thiết kế với cơ chế ngắt khẩn cấp tức thì (Kill Switch) mà không cần can thiệp vào code hay database:

1. **Ngắt toàn bộ AI Assistant trên Production:**
   Chạy lệnh Vercel CLI hoặc đổi trên Vercel Dashboard:
   ```bash
   npx vercel env add QA_PRODUCTION_RUNTIME_ENABLED production --value "false" --force --no-sensitive --yes
   npx vercel redeploy <latest-deployment-id> --target production
   ```
2. **Hiệu lực tức thì sau khi áp dụng:**
   - Mọi request gọi tới `/api/ai/session`, `/api/ai/ask`, `/api/ai/conversations` sẽ trả về ngay lập tức `503 Service Unavailable` (`AI_UNAVAILABLE`).
   - Giao diện người dùng `/assistant` sẽ tự động hiển thị thông báo "Trợ lý AI chưa khả dụng" và vô hiệu hóa nút gửi.
   - Toàn bộ dữ liệu RAG, chunks, embeddings và lịch sử hội thoại được bảo toàn 100%, không bị ảnh hưởng.

---

## 9. Kết Luận Cuối Cùng

Mọi yêu cầu nghiệp vụ, kỹ thuật, an ninh bảo mật và tiêu chuẩn kiểm thử đề ra trong **AI ASSISTANT PRODUCTION ACTIVATION V1** đều đã được thực thi và chứng minh qua dữ liệu thực nghiệm trên Live Production.

**KẾT LUẬN CUỐI CÙNG:**
$$\mathbf{AI\_ASSISTANT\_PRODUCTION=PASS}$$

# Production AI Assistant & RAG acceptance — 2026-10-18

**AI_ASSISTANT_PRODUCTION=BLOCKED. NO_GO cho việc mở Assistant Production.**

Đợt audit đã hoàn tất trong worktree `codex/assistant-production-readiness`, từ
commit `2225030`. Không sửa application runtime, gate, schema, Auth hay cấu hình
remote. Không gọi OpenAI, tạo hội thoại, import hoặc triển khai.

## 1. Root cause có bằng chứng

| Lớp | Kết luận | Source / bằng chứng |
| --- | --- | --- |
| UI chọn runtime | `/assistant` chỉ chọn real transport trên Development hoặc Preview đủ opt-in. Production luôn rơi vào `AssistantChat` không truyền transport. | `apps/web/src/app/assistant/page.tsx:13`, `:35` |
| UI disable | `transport` mặc định `null`; notice hiện khi không có transport. Textarea và submit bị disable. Submit còn xét phiên, context, pending/UNKNOWN và draft trống. | `apps/web/src/components/assistant/assistant-chat.tsx:68`, `:385`, `:491`, `:531` |
| Server gate | `isQaRuntimeEnabled` trả false vô điều kiện khi `vercelEnv === "production"`. Cả hai opt-in true cũng không mở được. | `apps/web/src/modules/ai/qa-runtime-gate.ts:27`; runtime wiring `qa-runtime.ts:18` |
| API unavailable | HTTP guard chạy trước parse/resolve principal/ask. Bootstrap cũng có cùng guard. Admin đăng nhập không vượt được runtime gate. | `qa-http.ts:61`, `:70`, `:110`; `app/api/ai/session/route.ts:8` |
| Corpus | Đúng Neon Production có 0 document/chunk/vector/publication. Đây là blocker dữ liệu độc lập, không phải điều kiện mà page gate hiện tại tự kiểm tra. | [SQL read-only](assistant-production-evidence/corpus.json) |
| Cấu hình | Project Vercel có metadata `OPENAI_API_KEY` trong Production/Preview. QA opt-in, database pins, HMAC và cleanup config không được liệt kê. Không có bằng chứng key sai/hết quota. | [Environment metadata](assistant-production-evidence/environment.json) |

Trực tiếp tại Production: `/assistant` HTTP200, có unavailable notice và submit
disabled. Header `Cache-Control` private/no-store và không có
`x-nextjs-prerender`. Không có bằng chứng lỗi prerender/cache gây trạng thái này.
`GET /api/ai/conversations` trả HTTP503, `FAILED / AI_UNAVAILABLE`.
[Page](assistant-production-evidence/production-page.json),
[API](assistant-production-evidence/production-api.json),
[browser](assistant-production-evidence/browser.json).

Browser dùng phiên Admin chủ dự án đã cung cấp, vẫn thấy composer disabled;
context picker đọc được ba Destination. Không bấm gửi hoặc bootstrap session.
Đo ở 1280px và 390px: không overflow ngang; không tuyên bố toàn bộ UI/a11y PASS.

Deployment metadata là READY/production, ID
`dpl_CKRXD6ixXMCNkNkSmHX9ipHV9MhK`, không trả Git SHA. Root cause của source được
kiểm tra khớp hành vi live quan sát được; **không khẳng định deployed source bằng
commit worktree**. [Deployment](assistant-production-evidence/deployment.json).

## 2. Development, Preview và Production

| Môi trường | Điều kiện real runtime trong code hiện tại | Khi đóng |
| --- | --- | --- |
| Local Development | NODE_ENV development, VERCEL_ENV trống/development, QA_RUNTIME_ENABLED opt-in, abuse accepted, URL đúng host/database pin | GENERAL có thể dùng development fixture; Destination context không dùng demo |
| Vercel Preview | NODE_ENV production, VERCEL_ENV preview, QA_PREVIEW_RUNTIME_ENABLED opt-in, abuse accepted, database pin đúng | Unavailable, không fallback demo |
| Vercel Production | Cấm rõ ràng ở page selection **và** backend gate | Unavailable dù flags/key/corpus hợp lệ |
| Local `next start` | NODE_ENV production nhưng không có Preview environment | Unavailable |

Pure gate với file Development đang có trả enabled=true, không mở connection hay
gọi provider. Đây chỉ là gate test, không chứng minh end-to-end readiness.
[Local gate](assistant-production-evidence/local-gate.json).

Gate này **không phải health check đầy đủ**: không kiểm tra OpenAI key, quyền
model/quota, corpus đủ nguồn, private Blob, HMAC, database connectivity hoặc
retention scheduler. Chúng có thể thất bại ở các bước sau khi gate đã mở.
`matchesAllowedDatabase` chỉ so URL host/name, không xác minh danh tính Neon branch;
pin phải được xác minh độc lập, không trỏ Preview vào Production để lách gate.

Runtime chat còn đợi Better Auth boundary và `POST /api/ai/session` xác nhận
identity; bootstrap có deadline10s. Khi refetch phiên, `available=false` chặn gửi.
Source: `assistant-runtime-chat.tsx:10`, `:26`, `:35`, `:54`.

## 3. API thực tế và phân loại kết quả

US-23 dùng chung endpoint đã triển khai của US-21/22, không có `/api/us23`:

| Route | Vai trò |
| --- | --- |
| `POST /api/ai/session` | Bootstrap trusted USER hoặc Guest identity; Guest có thể tạo DB row/budget |
| `DELETE /api/ai/session` | Thu hồi Guest session/history, là mutation |
| `POST /api/ai/ask` | Câu hỏi đầu hoặc follow-up, bắt buộc Idempotency-Key; `maxDuration=60` |
| `GET /api/ai/conversations` | List/search/cursor hội thoại của principal hiện tại |
| `GET /api/ai/conversations/[id]` | Metadata + lịch sử được phép |
| `PATCH /api/ai/conversations/[id]` | Đổi tên |
| `DELETE /api/ai/conversations/[id]` | Xóa của chính principal |
| `GET /api/ai/conversations/[id]/turns` | Lịch sử phân trang |

Thin route: `apps/web/src/app/api/ai/ask/route.ts:1`. Orchestration nằm trong
`qa-service.ts`; HTTP mapping nằm trong `qa-http.ts`. Không gọi các mutation để
thử Production, kể cả greeting: chúng có thể ghi Guest/budget/conversation/turn.

| Trạng thái | Ý nghĩa |
| --- | --- |
| UI unavailable | Không có transport hoặc chưa xác nhận phiên; bản thân UI không chứng minh lỗi key/corpus |
| 503 AI_UNAVAILABLE | Gate đóng, thiếu network adapter/HMAC, embedding/provider unavailable/timeout hoặc lỗi một số eligibility checks; phải phân biệt bằng stage/evidence |
| 200 SUCCESS + COMPLETED INSUFFICIENT_SOURCE | Kết quả nội dung khi evidence thiếu/không đủ hỗ trợ; không phải lỗi dịch vụ |
| 401/403/404 | Phiên/role/origin/ownership/context; không được dùng Admin để đọc lịch sử người khác |
| 502 AI_INVALID_RESPONSE | Schema, citation, grounding hoặc current-source eligibility không hợp lệ |
| 500 INTERNAL_SERVER_ERROR | Known database/read failure được map; không phản chiếu SQL/exception |
| 503 UNKNOWN + retryWithSameKey | Admission/completion/persistence có thể đã commit; không tạo key khác để thử lại |

Gate live đang đóng trước authorization; HTTP503 vừa quan sát **không phải bằng
chứng authorization lỗi**. Khi runtime mở, `qa-principal.ts:33` kiểm tra persisted
role/status; Guest có possession token còn hạn. `qa-conversation-store.ts:88`
lọc cả principal kind/id và giữ ownership qua reserve/replay/complete/history.

## 4. Pipeline OpenAI/index/retrieval đang có

- Index: Admin upload private Blob → UPLOADED → REVIEWING → APPROVED → index
  admission/job → extract → normalize/hash → chunk → embeddings → READY generation
  → atomic publication + INDEXED. APPROVED không đủ để retrieval.
  `rag-index-request-service.ts:47`, `rag-index-worker.ts`, `rag-index-store.ts`.
  Index chạy trong request đã await; không suy ra có durable background worker.
- Embedding adapter có implementation thật gọi `/v1/embeddings`, model
  `text-embedding-3-small`, dimensions1536, float output, deadline30s, giới hạn
  token/vector/bytes/cancellation. `openai-embedding-provider.ts:47`, `:81`;
  `embedding-contract.ts:1`. Không đổi model hoặc re-embed.
- Retrieval gọi query embedding **trước SQL corpus retrieval**, kể cả corpus rỗng;
  vì vậy không thử bật gate rồi hỏi để kiểm tra miễn phí. Hybrid vector + lexical,
  hiện runtime topK4, evidence budget3000 tokens; score chỉ là heuristic.
  `qa-retrieval.ts:147`, `:175`; `qa-runtime.ts:48`.
- Semantic assessment → sufficiency → generation → bounded verification/grounding
  → source rechecks → locked DB completion. Không có evidence thì không gọi
  assessment/generation; query embedding có thể đã có phí. Social/clarification
  dùng nhánh server-owned được giới hạn, không cung cấp factual answer thay corpus.
  `qa-service.ts:91`, `:127`, `:145`.
- **Source hiện tại** mặc định `gpt-6.1-sol`, không phải Luna được nhắc trong các
  báo cáo cũ: `qa-json-provider.ts:9`, `:61`. Chat Completions, strict JSON schema,
  store=false, reasoning medium, không temperature cho Sol6.1. Assessment,
  generation và synthesis verification dùng shared adapter. Không có env model QA
  override ở runtime wiring; `OPENAI_EDITORIAL_MODEL` thuộc Editorial.
- Provider call tối đa25s/call, không automatic retry/fallback. Mô hình worst-case
  embedding30s + ba JSON calls25s có thể vượt route60s/client70s, chưa kể DB.
  Cần kiểm chứng latency hoặc thiết kế deadline chung trước release; không coi
  timeout từng adapter là bằng chứng request tổng luôn nằm trong hosting budget.

Implementation/mocked request shape PASS; quyền model, credentials, quota, semantic
quality và latency Production **chưa xác minh live**. Không dùng model-name trong
source để khẳng định OpenAI account có quyền sử dụng.

Đối chiếu chính thức về embedding `dimensions`:
[OpenAI Create embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create).
Đây là tài liệu API, không phải bằng chứng credentials hoặc corpus của dự án.

## 5. Corpus Neon Production — trực tiếp read-only

Neon API xác minh project/branch/endpoint chính xác trước kết nối target.
Connection dùng TLS verify-full, default_transaction_read_only=on, transaction
REPEATABLE READ READ ONLY; `SHOW transaction_read_only=on` được assert.
Không đọc Auth rows, câu hỏi/lịch sử, original files hoặc private source prose.

| Hạng mục | Quan sát |
| --- | --- |
| UPLOADED / REVIEWING / APPROVED / INDEXED / DISABLED | 0 / 0 / 0 / 0 / 0 |
| Public QA approved documents | 0 |
| Content versions / generations / publications / index jobs | 0 / 0 / 0 / 0 |
| Chunks / vectors / structural valid vectors | 0 / 0 / 0 |
| pgvector / column type | 0.8.6 / vector(1536) |
| Observed stored vector dimensions | Không có hàng để đo; không gọi đây là vector PASS |
| SQL eligible published documents/chunks | 0 / 0 |
| Destination VISIBLE | 3 |
| ContentSource | 12, mỗi Destination4 |
| Website / indexing / OpenAI rights | 12 nguồn đều UNKNOWN / UNKNOWN / UNKNOWN; rightsEvidence0 |
| RagDomainOrigin | 0; mỗi Destination0 |
| Migration ledger | 23/23 healthy; không chạy migrate |

`ContentSource` không có FK trực tiếp tới `RagDocument`. `RagDomainOrigin` là
interface riêng trỏ Destination/Culture, không có dispatch/index bridge hiện hành.
Upload Destination, gallery hoặc Emagazine không tự tạo RAG corpus.
`packages/db/prisma/schema/content-profile.prisma:29`, `:77` và
`rag-document.prisma:15`.

Điều kiện retrieval thực tế ở `qa-retrieval.ts:50` gồm đúng current publication,
document INDEXED + publicQaApproved, generation READY, đúng provider/model/dimension,
chunk/generation/document khớp nhau, embedding tokenCount>0. Tiếp theo là optional
source filter, context/name scope, similarity hoặc lexical candidate, budget,
token recount, public metadata safety và citations. Source eligibility được recheck
trước/sau generation và trong completion transaction.

Không dùng số chunk, INDEXED hoặc publicQaApproved như chứng nhận đủ ngữ nghĩa hay
pháp lý. SQL retrieval hiện **không join ContentSource rights hoặc revokedAt của
RagDomainOrigin**. Hai loại quyền không tự suy ra lẫn nhau; không có cầu nối để
UNKNOWN được xem là APPROVED. Với corpus standalone, chủ dự án phải duyệt phạm vi
nguồn và quyền gửi OpenAI/public citation trước khi cấp publicQaApproved. Nếu sau
này chọn domain bridge, cần thiết kế quyền/revocation đồng bộ, không chỉ copy text.

Legacy `QA_PUBLIC_SOURCE_IDS` chỉ áp dụng khi legacy switch và chuỗi ID có giá trị;
mặc định runtime truy vấn tất cả tài liệu đủ publicQaApproved. Switch true nhưng
IDs trống tạo undefined filter trong wiring hiện tại; **không xem empty legacy
allowlist là một readiness/security gate đáng tin**. Approved=false vẫn bị SQL
loại. Không thay switch/source approval trong đợt này. Comments/runbook cũ nói
empty allowlist loại mọi evidence không mô tả đầy đủ source hiện tại.

## 6. Cấu hình: tên, phạm vi, trạng thái

Chỉ báo tên và trạng thái; không in giá trị. Metadata project hiện tại không chứng
minh env của deployment đang chạy. Sensitive value bị redact không được coi là
missing hoặc invalid. [Chi tiết](assistant-production-evidence/environment.json).

| Tên | Preview / Production hiện tại | Vai trò |
| --- | --- | --- |
| NODE_ENV, VERCEL_ENV, VERCEL | Platform/runtime, không phải custom entry | Chọn nhánh gate và trusted ingress |
| DATABASE_URL | PRESENT / PRESENT | Bắt buộc DB, cần xác minh đúng nhánh ở môi trường dùng |
| BETTER_AUTH_SECRET | PRESENT / PRESENT | Auth app, không thay Auth |
| BETTER_AUTH_URL | Không có custom entry; schema derivation từ Vercel origin | Không kết luận thiếu vì login đang có và có derived config |
| OPENAI_API_KEY | PRESENT / PRESENT, validity UNVERIFIED | Bắt buộc cho live embeddings/JSON calls, optional khi khởi động app |
| QA_RUNTIME_ENABLED | NOT_LISTED / NOT_LISTED | Opt-in Development, không mở Production |
| QA_PREVIEW_RUNTIME_ENABLED | NOT_LISTED / NOT_LISTED | Opt-in Preview, không mở Production |
| QA_ABUSE_PROTECTION_ACCEPTED | NOT_LISTED / NOT_LISTED | Owner release acceptance, không tự đặt true |
| QA_RUNTIME_ALLOWED_DATABASE_HOST, QA_RUNTIME_ALLOWED_DATABASE_NAME | NOT_LISTED / NOT_LISTED | Pin đúng target; chưa có Production branch trong gate hiện tại |
| QA_NETWORK_HMAC_SECRET | NOT_LISTED / NOT_LISTED | Bắt buộc network admission, >=32 ký tự, ổn định giữa instances |
| QA_LOCAL_NETWORK_ID | NOT_LISTED / NOT_LISTED | Chỉ Development, không thay trusted Vercel ingress |
| QA_LEGACY_SOURCE_ALLOWLIST_ENABLED, QA_PUBLIC_SOURCE_IDS | NOT_LISTED / NOT_LISTED | Legacy scope filter tùy chọn; không thay publicQaApproved |
| BLOB_READ_WRITE_TOKEN | PRESENT / PRESENT, validity UNVERIFIED | Upload/review/index private files; không cần để đọc vectors đã index |
| QA_CLEANUP_ENABLED | NOT_LISTED / NOT_LISTED | Cleanup gate riêng, không tự kích hoạt scheduler |
| QA_CLEANUP_ALLOWED_DATABASE_HOST, QA_CLEANUP_ALLOWED_DATABASE_NAME | NOT_LISTED / NOT_LISTED | Exact cleanup target pin |
| CRON_SECRET | NOT_LISTED / NOT_LISTED | Server credential cleanup endpoint |

Repo có hai GitHub Actions cleanup/heartbeat candidates và protected environment
`qa-cleanup-production`; chưa xác minh remote workflow/environment/scheduler có
đang vận hành. `vercel.json` không cấu hình cron. Không gọi cleanup GET vì đó là
mutation. Cleanup schedule/retention monitoring là release prerequisite riêng,
không nằm trong `isQaRuntimeEnabled`. Không tự bật hoặc dispatch Actions.

## 7. Phương án tối thiểu và các phê duyệt cần có

1. Chủ dự án chọn corpus nhỏ có quyền sử dụng rõ ràng, phạm vi và người duyệt.
   Lập inventory/review các câu hỏi thực tế cho cả ba Destination. Không yêu cầu
   toàn bộ 12 ContentSource phải được duyệt nếu không dùng; UNKNOWN bị loại khỏi
   kế hoạch nguồn. Không copy Development corpus mặc định.
2. Sau phê duyệt riêng cho **Production data writes và embedding cost**, dùng CMS
   upload/review/approve/index request hiện có, xác nhận READY/current publication,
   số chunk/vector, tokenizer/provenance và quality review, rồi public QA approval
   cho đúng nguồn đã duyệt. Bảo toàn snapshot/receipts; không import Destination.
3. Review abuse/cost/network controls và retention ownership/schedule/heartbeat,
   cấu hình Preview trước trên non-production target, kiểm tra latency/deadline
   tổng và bộ acceptance bên dưới. Không hạ semantic/source/ownership gates.
4. Chỉ sau đó, phê duyệt thay đổi code gate Production có opt-in riêng + exact
   independently verified target pin, đồng bộ page/API, vẫn mặc định đóng. Không
   giả mạo VERCEL_ENV=preview, không dùng demo transport hay sửa flags để lách gate.
   Current schema đủ cho standalone workflow; không cần schema change để audit.
5. Chủ dự án review patch/config/release plan, **cho phép deploy riêng**, rồi cho
   phép live smoke có số request/token/cost cap, câu hỏi công khai và test principal
   đã duyệt. Live smoke có thể ghi conversation/turn/budget; cần nêu rõ những
   writes này, xử lý dữ liệu thử và chi phí trước khi thực hiện.
6. Release chỉ GO khi các gate có bằng chứng direct trên deployment mới, gồm
   rollback về closed gate, source revocation, metrics/retention và owner quality
   acceptance. Không tự coi unit tests hay Development history là Production PASS.

**Đợt này chưa xin thực hiện live smoke:** gate/corpus/rights còn chặn. Không có
release patch mở runtime để phê duyệt ngay; các bước trên là kế hoạch cần duyệt,
không phải thay đổi đã làm.

## 8. Acceptance checklist và kết quả

| # | Kiểm thử / kỳ vọng | Offline/mock hiện tại | Production trực tiếp / điều kiện tiếp |
| --- | --- | --- | --- |
| 1 | Runtime chưa sẵn sàng: notice + disabled, API503, zero auth/DB/provider work sau guard | PASS: runtime-mode, runtime-gate, HTTP guard | PASS cho trạng thái đóng: DOM desktop/mobile, public GET503; server side-effect exclusion dựa test/code, không có server trace |
| 2 | Nguồn đủ điều kiện: đúng publication, INDEXED/READY/provenance/public approval; loại disabled/building/stale/private | PASS: retrieval, hybrid, source-sufficiency, generation | BLOCKED: corpus0; cần SQL + actual eligible retrieval trên corpus được duyệt |
| 3 | Hỏi thực tế, ANSWERED/PARTIAL với nguồn/locator thật; stored response khớp citation | PASS bằng injected provider/annotated fixtures | BLOCKED: chưa cho phép paid smoke/data writes; cần owner grading từng claim/nguồn |
| 4 | Thiếu nguồn: 200 completed INSUFFICIENT_SOURCE, không parts/citations, không biến thành technical error | PASS: service NO_EVIDENCE/MISSING_SUPPORT, source-reply/controller | BLOCKED live; không gửi hỏi vào empty corpus để phát sinh phí query embedding |
| 5 | Không bịa giá vé/giờ mở cửa/sự kiện; tách năm/site, thiếu facet là thiếu | PASS: advanced-reasoning, source-sufficiency, quality/currentness fixtures | BLOCKED semantic live; cần negative gold cases, ví dụ giá hiện tại/giờ UNKNOWN/sự kiện năm khác |
| 6 | Không lộ nguồn nội bộ/khác quyền; unknown/hidden context, path/metadata injection bị chặn; không đọc history người khác | PASS: public-safety, generation, context, auth boundary/HTTP mocks | BLOCKED DB/runtime live; SQL ownership/concurrency integration SKIP trong đợt này |
| 7 | Cùng key/body replay cùng turn, khác body conflict; concurrent/stale/UNKNOWN không tạo sai history | PASS: controller/transport/HTTP/service mock regressions | BLOCKED DB/live; store/retrieval PostgreSQL integration SKIP, không dùng Production để tạo fixture |
| 8 | Timeout/OpenAI rejection/schema/DB errors tách FAILED/UNKNOWN, giữ input và retry đúng key | PASS: generation/provider/embedding/service/HTTP/controller timeout mocks | BLOCKED live; cần staging/disposable DB fault injection + approved bounded smoke, không cố làm hỏng Production |

Live checklist phải kiểm tra Guest, Traveler và Admin own history riêng, follow-up
giữ context, thay nguồn/disable/public approval revocation trong khi request chạy,
same-key replay sau lost response, source citations và không tự suy ra giá/giờ.
Adverse DB/provider injection dùng môi trường kiểm thử, không Production faults.

Evidence assertion names/counts theo file:
[offline-tests.json](assistant-production-evidence/offline-tests.json).

## 9. Checks, preservation và giới hạn

- Relevant Vitest: **919 PASS / 0 FAIL / 89 SKIP**, tổng1008. Live opt-ins và
  PostgreSQL integration không được bật; skipped không phải PASS.
- Legacy RAG: **56/56 PASS**. Root typecheck PASS. Root build PASS, Next16.3.8.
  Build dùng ignored offline fixture config, không Production credentials/DB.
- Không chạy toàn bộ legacy/full-repository test suite hoặc disposable PostgreSQL
  trong đợt audit này. Không tuyên bố repository release toàn diện đã xanh.
- Strict premium audit có **30 existing findings** (12 unresolved,18 violations),
  không có product UI change. Không có global design/a11y compliance PASS và không
  sửa unrelated UI theo audit. DESIGN.md và tokens giữ nguyên.
- SQL fingerprint trước/sau, git diff-check, JSON/syntax và credential scan được
  ghi trong [checks](assistant-production-evidence/checks.json) và
  [preservation](assistant-production-evidence/preservation.json).
  [Safety](assistant-production-evidence/safety.json) xác nhận không có credential
  match trong file thay đổi, không có env/product-source change và từ chối mode
  ngoài report trước khi mở database connection. Repo không có formatter/linter
  script riêng để chạy; không ghi các mục không có tool là PASS.
- Snapshot `snap-snowy-rain-b33t352d` vẫn tồn tại đúng Production branch. Bảy
  backup/prepared/applied/replay receipts khớp SHA256 acceptance trước, không viết
  lại. [Receipt verification](assistant-production-evidence/receipt-preservation.json).

Các bước chuẩn bị đầu tiên có lỗi đường dẫn Vitest config và thiếu offline
DATABASE_URL cho Prisma generation; đã sửa cách chạy/fixture config, không sửa
runtime. Hai bản nháp SQL audit lỗi tên bảng/ordering cột đều trong read-only
transaction; phiên bản cuối chạy thành công. Không có DB/schema operation từ
`prisma generate`, chỉ generate client. Không che các lỗi này thành test PASS.

## 10. File thay đổi và trạng thái cuối

- Mới: `scripts/audit-assistant-production-readonly.mjs` — aggregate audit, pinned
  identity, read-only transaction, sanitized failure codes, không có write mode.
- Mới: báo cáo này và `docs/implementation/assistant-production-evidence/*.json`.
- Append: `docs/stories/US-23-source-sufficiency.md`, `docs/ai-progress.md`.
- Không đổi product source/config/schema/Auth hoặc báo cáo/receipts sync cũ.
  Worktree chính đang có Editorial changes của tác vụ khác được giữ nguyên.

Evidence files: `browser.json`, `checks.json`, `corpus.json`, `deployment.json`,
`environment.json`, `local-gate.json`, `offline-tests.json`, `premium-audit.json`,
`preservation.json`, `production-api.json`, `production-page.json`,
`receipt-preservation.json`, `safety.json`. Các log/raw CLI output chỉ nằm trong
ignored `.cache/assistant-readiness`; không đưa vào thay đổi để commit.

| Gate | Trạng thái |
| --- | --- |
| Root cause + live disabled behavior | VERIFIED |
| OpenAI key metadata presence | VERIFIED; validity/model access UNVERIFIED |
| Embedding/retrieval/generation implementation | OFFLINE_PASS; live UNVERIFIED |
| Neon schema/pgvector/read-only inventory | VERIFIED |
| Production corpus/rights/public eligibility | BLOCKED |
| Production opt-in/abuse/retention configuration | BLOCKED / NOT_VERIFIED |
| Real cited answers, semantic quality, live history | BLOCKED |
| Snapshot/receipts preservation | VERIFIED |
| AI_ASSISTANT_PRODUCTION | **BLOCKED — NO_GO** |

US-23 vẫn NOT_ACCEPTED. Việc sync Destination thành công không thay acceptance
RAG, quyền nguồn hoặc quyền mở runtime Production.

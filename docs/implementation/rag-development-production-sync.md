# Production RAG corpus migration — 2026-10-18

**RAG_PRODUCTION_SYNC=PASS for the exact owner-authorized corpus migration.**

Production COMMIT_CONFIRMED đúng 286 INSERT, 0 UPDATE, 0 DELETE. Hậu kiểm read-only
độc lập sau commit và sau replay đều PASS: 3 documents, 137 chunks, 137 embeddings,
3 technical publications; replay ghi thêm 0 hàng. Public QA vẫn tắt cho cả ba.
CMS Admin browser smoke BLOCKED; không tính là đã kiểm chứng. Migration PASS
không phải chấp thuận release code hoặc mở Assistant.

## Owner authorization và backup

Chủ dự án đã chọn direct apply sau lỗi SNAPSHOTS_LIMIT_EXCEEDED, miễn backup mới
cho đúng ba tài liệu ở manifest. CLI explicit --accept-no-current-backup bind vào
exact document IDs, original hashes, verified Production identity và plan hash.
Mặc định vẫn từ chối thiếu backup. Không có global environment bypass, không giả
backupVerified=true hoặc tạo backup receipt giả.

- OWNER_BACKUP_WAIVER=ACCEPTED_EXACT_THREE_DOCUMENT_SCOPE
- CURRENT_PRODUCTION_BACKUP=WAIVED_BY_OWNER
- RECOVERY_POINT_AFTER_DESTINATION_IMPORT=NOT_AVAILABLE

Snapshot cũ snap-snowy-rain-b33t352d tạo 2026-10-17T18:56:58Z có trước Destination
import; giữ nguyên và không coi là current backup. [Historical quota blocker](rag-sync-evidence/backup-blocker.json).
Không tạo branch/snapshot mới, nâng gói, xóa/restore snapshot hoặc đổi endpoint.
Waiver không thay đổi chính sách backup lâu dài. Không chạy hay tuyên bố đã kiểm
thử rollback sau commit.

## Worktree và phạm vi

Worktree C:/Users/User/.codex/worktrees/rag-production-sync/KLTN, branch
codex/rag-production-sync, baseline 0f0426a7a7d01ef697bad1eb739622ed633290a7.
Không commit/push/merge/deploy, không sửa checkout/worktree khác. Không sửa schema,
Prisma migration/ledger, Auth, Destination, Assistant UI/runtime gate hoặc Vercel env.
Raw originals, source prose/vectors, manifest và execution receipts chỉ ở ignored
.cache. Git evidence là sanitized metadata/aggregate proofs, không credentials,
private Blob URLs, embedding values hoặc record-level Auth data.

## Identity và preflight

Neon project summer-unit-95870477. API xác minh lại branch/endpoint/database và
hostname trước apply/replay/hậu kiểm, không suy ra target từ DATABASE_URL.

| Vai trò | Branch | Endpoint | Database |
| --- | --- | --- | --- |
| SOURCE | br-aged-hat-b3o6hg9p | ep-purple-pond-b3xujb8o | neondb |
| TARGET | br-cold-dew-b3h270wp | ep-blue-art-b3v3vr4h | neondb |

Chỉ parse SYNC_SOURCE_DATABASE_URL, SYNC_TARGET_DATABASE_URL và secrets cần thiết
từ file owner-provided. Read-only connections dùng TLS verify-full,
default_transaction_read_only=on, REPEATABLE READ READ ONLY và assert on.
Write connection chỉ mở sau preflight. Không in/sửa secrets.

Schema columns/constraints/triggers/extensions parity PASS; pgvector 0.8.6,
PostGIS 3.6.4, vector(1536), 23/23 healthy migrations mỗi nhánh. Có 19 raw checksums
khác: source LF và target CRLF của cùng SQL migration hiện hành, đã hash từng cặp.
Không coi raw checksum bằng nhau, không rewrite ledger/migration.
[Inventory](rag-sync-evidence/inventory.json), [ledger](rag-sync-evidence/ledger-comparison.json),
[refreshed dry-run](rag-sync-evidence/dry-run.json).

## Exact corpus và manifest

| Document ID / original file | Chunks | Embeddings | Tokens |
| --- | ---: | ---: | ---: |
| cmvapg3l0001j7w9w61egpl01 — Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx | 51 | 51 | 13584 |
| cmvc530ki0001ik9wn3ynioi6 — Cang_Bac_Me_Ho_so_du_lieu_RAG_nguon_URL_day_du_2026.docx | 35 | 35 | 7815 |
| cmvc55mhx000bik9wpn3gtlmn — Khau_Vai_RAG_2026.docx | 51 | 51 | 10225 |
| **Total** | **137** | **137** | **31624** |

Dev inventory: 11 documents, 12 versions/generations, 169 chunks/vectors,
11 publications, 13 jobs. Loại 8 DISABLED fixtures và mọi historical generation
ngoài ba current READY generations. Không copy jobs/leases/idempotency/history,
không tài liệu thứ tư. Production RAG rỗng trước apply.

Manifest refresh trước apply, các bản chuẩn bị trước giữ trong ignored
before-owner-apply/. Apply/replay/hậu kiểm cùng hash cuối, không dùng hash cũ:

    ff1f1fcc64e6421b6f2a6b9fbc4a87344795b3abbeb95db7c9e66a1c92f1d519

| Table | Expected INSERT | Actual INSERT | Verified target count |
| --- | ---: | ---: | ---: |
| rag_document | 3 | 3 | 3 |
| rag_content_version | 3 | 3 | 3 |
| rag_index_generation | 3 | 3 | 3 |
| rag_chunk | 137 | 137 | 137 |
| rag_chunk_embedding | 137 | 137 | 137 |
| rag_index_publication | 3 | 3 | 3 |
| rag_index_job | 0 | 0 | 0 |
| rag_domain_origin | 0 | 0 | 0 |
| **Total** | **286** | **286** | **286** |

Dry-run conflicts 0, expected UPDATE/DELETE 0/0, reindex required 0. Source không
có RagDomainOrigin; không tự ghép Destination theo tên. ContentSource không có
direct RAG FK; không mượn quyền nguồn đó để cấp quyền RAG. uploadedById là text
provenance không có FK User; giữ original Dev actor, không giả Admin Production.

## Blob và embedding integrity

Production BLOB_STORE_ID metadata khớp private store identity của SDK token đã có.
Store Private/Active. Sensitive Production token redact khi env pull; placeholder
không được coi là token thật hoặc lỗi. Local SDK proof không chứng minh deployed
Production credential; authenticated Admin file endpoint vẫn cần smoke riêng.

SDK head/get private xác minh cả ba originals trước apply và trong hậu kiểm:
MIME/size/SHA256 khớp index metadata và owner originals ngoài repo. Anonymous GET
đều 403. Blob copies/uploads/deletes=0; không tạo public URL.

Re-extract/re-chunk bằng pipeline/options hiện hành khớp text/refs/locators/hash,
version/generation identity, inputHash, token recount và publication pointers.
Actual vector_send binary float32 chứng minh 137/137 vectors: 1536 chiều, finite,
norm hợp lệ, vectorHash khớp. Sau INSERT so binary từng vector, không làm tròn.
Model giữ openai/text-embedding-3-small/1536, tokenizer cl100k_base/js-tiktoken1.0.21.
Không dummy/re-embedding/model change. OpenAI calls=0, cost USD=0.

## Transaction, replay và preservation

Atomic SERIALIZABLE, advisory transaction lock, short SHARE ROW EXCLUSIVE locks,
parameterized INSERT theo dependency order, publication cuối. Kiểm tra RAG
triggers/rules trước writer; không disable constraints/triggers. Compare exact rows,
IDs/vectors/FKs và fingerprints 31 bảng ngoài RAG ngay trong transaction trước
COMMIT. Lỗi trước commit rollback toàn bộ; nếu COMMIT response không xác định,
ghi UNKNOWN và đối soát trước retry. Thực tế không gặp UNKNOWN.

- First apply 2026-10-18T04:53:06.891Z: COMMIT_CONFIRMED, 286 INSERT, 0 UPDATE/DELETE.
  [Sanitized import evidence](rag-sync-evidence/import.json).
- Hậu kiểm read-only độc lập sau commit PASS: 286 exact rows, 137 vectors/hash,
  3 originals, 0 broken FKs/orphans/fixtures/jobs/public approvals.
  [First verification](rag-sync-evidence/post-first-commit.json).
- Exact-plan replay 2026-10-18T04:55:56.027Z: COMMIT_CONFIRMED, 286 existing exact
  rows, 0 INSERT/UPDATE/DELETE. [Replay](rag-sync-evidence/replay.json).
- Hậu kiểm read-only độc lập sau replay PASS: [final verification](rag-sync-evidence/post-import.json).

All 31 protected-table counts + aggregate fingerprints khớp manifest pre-import,
inside transaction before/after, post-import và replay: Auth/User/Account/Session/
Audit, 3 Destination/3 Editorial, 13 media/12 ContentSource, opening data, Favorite,
Trip/Itinerary, QA history và Prisma ledger. Đây là bằng chứng tại thời điểm đo,
không tuyên bố chặn mọi concurrent write sau khi kết thúc. Source chỉ READ ONLY.
Bảy prior Destination receipts hash-match, giữ nguyên: [receipts](rag-sync-evidence/prior-receipts.json).

## Public QA, CMS và remaining limitations

Ba docs INDEXED/current READY, TECHNICALLY_READY; tất cả RIGHTS_REVIEW_REQUIRED,
publicQaApproved=false, approved count=0. Technical index publication không cấp
quyền dùng nguồn cho AI công khai. Không đổi qa-runtime-gate.ts hoặc Assistant UI.
Live GET /assistant vẫn unavailable, submit disabled.

CUA báo Local browser use is disabled in Work settings. BROWSER_SMOKE=BLOCKED;
không giả bằng chứng Admin. Unauthenticated GET list, từng detail và từng original
file đều 401 UNAUTHENTICATED, private/no-store; /admin/rag redirect login.
Không đọc cookie, tạo session/Auth hoặc gọi mutation/bootstrap/history.
[CMS/API evidence](rag-sync-evidence/cms.json).

Manual follow-up khi Browser use và phiên Admin sẵn sàng: read-only list đúng 3
docs, detail INDEXED/public false/source metadata, download mỗi original qua Admin
endpoint và đối chiếu MIME/size/hash. Bước này xác minh deployed Blob credential.
SQL/local SDK và guest denial không thay thế authenticated CMS smoke.

Không còn blocker cho exact corpus migration. CMS/runtime Blob chưa xác minh.
Rights approval, enable Public QA, provider smoke có cost cap, Assistant readiness,
env/code release/deploy, live citation/insufficient-source/history/timeout acceptance
cần phê duyệt riêng; chưa thực hiện. Chưa chấp thuận release Assistant.

## Kiểm thử và file thay đổi

Preflight direct apply: 39/39 migration tests, 56/56 RAG regression, 0 FAIL/0 SKIP;
root typecheck/build PASS (cached offline, Next16.3.8, không Production credentials).
[Owner preflight](rag-sync-evidence/owner-preflight.json). Waiver tests gồm default
backup refusal, exact scope, wrong target/hash/fourth doc, public true, updates/
deletes, partial vectors, conflicts và exact replay. PGlite/pgvector kiểm tra
rollback/FKs/vector binary/protected drift/advisory-lock refusal; không chứng minh
native multi-session Neon concurrency. Docker daemon không phản hồi; không chạy
full suite/native Docker hoặc restore-after-commit test.

Historical broader Vitest có 143 PASS/1 timeout FAIL/22 SKIP; isolated rerun file
lỗi 2 PASS. Giữ [historical tests](rag-sync-evidence/tests.json), không cộng SKIP
thành PASS. Live verification read-only; exact apply/replay được owner cho phép,
không chạy destructive Production tests.

Scripts trong scripts/: reused rag-sync-lib.mjs, rag-sync-inventory.mjs,
rag-sync-processing.ts, rag-sync-validate.mjs, rag-sync-blob.mjs, rag-sync-backup.mjs,
rag-sync-transaction.mjs, rag-sync-apply.mjs, rag-sync.test.mjs. Thêm
rag-sync-backup-policy.mjs và rag-sync-verify.mjs; sửa apply hỗ trợ explicit waiver,
transaction lưu commit outcome/protected proofs, bổ sung tests. Docs: báo cáo này,
story RAG-DEVELOPMENT-PRODUCTION-SYNC, append ai-progress và sanitized evidence.
Không sửa product code/package/lockfile/Prisma/env. Final syntax/JSON/secrets/diff
checks và đủ trường kết quả: [final summary](rag-sync-evidence/final-summary.json).

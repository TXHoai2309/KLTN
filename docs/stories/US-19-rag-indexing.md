# US-19 — RAG indexing: Task181–Task185

## Current status — 2026-10-10

Task181–185 core is committed on TXH through f571272ee700a066b5a3d5ddb2b92cd063ac3a3c.
Owner-confirmed Development migrations are 11/11, independently rechecked read-only
in this run. Task184 and Task185 real isolated PostgreSQL evidence passed.

The owner-approved current MVP uses a targeted, awaited request-scoped API, replacing
the prior separate-worker deployment prerequisite. Task185–187 direct API, Admin
progress/retry UI and offline test closure are implemented locally on
feat/us19-direct-index-api-progress, baseline 23a399ed47eeca804b6aa44675ed71d2930292cc.
US19 remains IN_PROGRESS: live Blob/provider runtime and authenticated owner acceptance
are pending. Nothing is deployed, committed or pushed in this run.

Dated entries below are retained as historical handoff evidence. Current closure
at the end and the owner-approved decision in docs/decisions.md supersede older
statements about Docker availability, unapplied migrations or durable hosting.

## Sources and prerequisites

- Product Document: YCCN-93/94/97, QTN-99–101, YCP-21, NT-175/176.
- System Specification §12.4: APPROVED → extraction → chunking → embedding →
  vector storage → INDEXED. Completing only the first two stages is not indexing.
- Repository AGENTS, source baselines, product contract, architecture and flow.
- US-21 Task191: PDF physical pages, verified DOCX headings, no assumed TXT/DOCX
  pagination; metadata-only public citations and separate runtime trust boundaries.
- US-17/18 originated on ThaiAnh at
  `4c6df6128c1923369e652eb332eb1b475b50c3fa` and were selectively integrated to
  TXH before Task185. The owner later confirmed their Development migrations and
  Task184 vector smoke. That evidence does not prove live private Blob Gate C or
  Admin browser Gate D; Task185 uses injected storage/provider dependencies locally.

## Task185 architecture decisions — recorded before implementation (2026-10-10)

- Persist indexing work in a dedicated additive `RagIndexJob` table. Keep the
  existing `RagDocumentStatus` enum unchanged: jobs have their own lifecycle and
  do not introduce an `INDEXING` document status.
- Admit jobs only after current Admin authorization and an eligible document
  lookup. Use the shared idempotent-write contract with actor, operation, key and
  document payload. Lock the document row while checking for an active job and
  inserting one, so concurrent processes cannot enqueue duplicate active work.
- A separately invoked worker claims queued jobs with database row locks,
  expiring leases and fencing tokens. No HTTP route, `after()` callback, upload
  hook or fire-and-forget execution starts the worker. There is no durable worker
  runtime configured in this repository, so live indexing remains disabled until
  one is deployed and monitored.
- Persist the current pipeline phase. An expired lease before embedding or after
  all embeddings are durably saved can be safely requeued. An expired lease while
  provider output may have been charged but not fully persisted becomes `UNKNOWN`;
  no automatic provider retry occurs. A new explicit retry must pass the existing
  per-job token/cost preflight.
- The worker loads the document row first and reads only its registered private
  Blob path. It verifies the registered type, MIME and size against the bytes,
  validates the file, hashes the exact bytes, and injects storage/provider
  dependencies for offline tests. No URL is fetched and no real Blob/OpenAI call
  is part of Task185 validation.
- Recheck document status at admission, acquisition, processing persistence and
  publication. Database writes use document/job/generation locks and the lease
  fencing token. `DISABLED` cancels work and cannot publish. The worker stores
  sanitized warning codes (not excerpts) on the job. The always-emitted
  `PDF_READING_ORDER_HEURISTIC` is informational and does not alone block indexing;
  `PAGE_WITHOUT_TEXT` and `UNSUPPORTED_DOCX_REGION` fail closed for possible
  omissions. `NO_EXTRACTABLE_TEXT` always rejects and remains retrieval-ineligible.
- Finalization checks READY completeness and updates the publication pointer,
  `RagDocument.status = INDEXED`, and job completion in one PostgreSQL transaction.
  Re-indexing keeps the previous pointer until this transaction succeeds; a failed
  new generation is retained for audit/retry without replacing the old one.
- Recovery never claims that an uncertain external provider operation completed.
  Worker cancellation and provider timeouts use `AbortSignal`; a timeout during
  embedding is `UNKNOWN` because the remote charge/result may be uncertain. No
  long-running request is used as a substitute for a durable worker.
- The worker uses one provider attempt per batch. A timeout, transport ambiguity or
  unpersisted provider response becomes `UNKNOWN`; a new, idempotent Admin retry
  explicitly requests another cost preflight before any missing chunks are sent.

## Architecture and entry points

`apps/web/src/modules/rag-processing/extract-document.ts` accepts
`{ bytes: Uint8Array, format: string }`, returning an asynchronous ExtractionResult.
`chunk-document.ts` synchronously consumes ExtractedDocument and validated options.
No URL fetching, Blob adapter, authorization, DB access, provider call, API or UI.
Node crypto and PDF parsing belong on the server. No current product route imports
these modules. Future callers must establish authorization and approved-state
eligibility before acquiring trusted bytes; knowing an ID/path is not authorization.

## Task181 contract

States: EXTRACTED, NO_EXTRACTABLE_TEXT (reason NO_TEXT), UNSUPPORTED_FORMAT,
INVALID_ENCODING, CORRUPT_DOCUMENT, PASSWORD_REQUIRED, RESOURCE_LIMIT and
EXTRACTION_FAILED. Failures expose controlled codes only; no raw parser exception,
document content or private path. A failure returns no partial document.

ExtractedDocument: format, originalBytesHash, extractorVersion,
normalizationVersion, normalizedContentHash, ordered segments and warnings.
Segments contain deterministic id/ordinal, kind, normalized text and format-specific
origin. SHA-256 originalBytesHash hashes original bytes; normalizedContentHash hashes
canonical ordered `{text,kind,origin}` records, excluding versions/warnings.
Neither hash proves factual authenticity, source ownership or retrieval eligibility.

Normalization v1: CRLF/CR → LF, Unicode NFC, trim segment edges. Never lowercase,
remove Vietnamese accents or invent titles. Offsets refer to normalized segment
text, not original byte positions. TXT line references are captured before trimming.

### Format coverage

- TXT: fatal UTF-8 decoder, optional BOM, paragraph separation by empty lines,
  original 1-based lineStart/lineEnd. Invalid binary controls are rejected. No
  inferred section/page. Empty bytes/whitespace return NO_EXTRACTABLE_TEXT.
- PDF: pinned PDF.js 4.10.38; physical 1-based pages, stable stream/item order,
  line assembly based on coordinates/EOL. Output blocks are line-level paragraphs;
  reading order for columns/complex layouts is heuristic, always warned. Every
  textless page is warned with its physical page. Mixed pages retain available
  text, image-only files yield NO_EXTRACTABLE_TEXT. No OCR or printed page labels.
  Password-protected files return PASSWORD_REQUIRED. Evaluation is disabled,
  caller bytes copied before parser transfer, page/loading resources cleaned up.
- DOCX: bounded ZIP + ordered OOXML; main body paragraphs/runs, verified outline
  headings including style inheritance, tables/cells in document order. Distinct
  heading positions get distinct section IDs even for equal titles. Bold alone
  is not heading evidence. No pagination. Tabs/line breaks and predefined/numeric
  XML entities preserved. ZIP central directory/paths/duplicates, selected-part
  CRC and actual size are validated. DTD/custom entities are rejected; parser
  entity expansion is disabled. XML depth checked before parsing. Namespace
  checks prevent foreign paragraph/heading elements masquerading as Word text.
  Style cycles fail. Headers/footers/footnotes/endnotes, drawings/textboxes,
  embedded content and unsupported body regions produce coverage warnings.
  External relationships are never fetched. Macros/code are never executed.

## Task182 contract and provenance

Defaults: maxChunkUtf16Units=1600, overlapUtf16Units=200. Size must be an integer
1–8000; overlap an integer 0–floor(size/2); unknown options rejected.
Runtime validation checks shape, segment order/IDs/format, normalized text and
normalized content hash. Empty segments array returns explicit NO_EXTRACTABLE_TEXT.
Failures return INVALID_INPUT or RESOURCE_LIMIT with no partial chunks.

Prefer paragraph and section boundaries, then sentence endings, whitespace,
finally Intl.Segmenter grapheme boundaries. An indivisible grapheme exceeding
size fails explicitly instead of splitting or looping. Progress is mandatory.
Overlap is a bounded suffix, adjusted forward to a safe word/grapheme boundary;
actual overlap may be smaller. No overlap across verified DOCX section IDs.
Repeated paragraphs at different source positions are never deduplicated.
Only inserted separator is two LF characters between distinct source segments.

Each DocumentChunk contains zero-based index, text, refs, internal locators,
textHash, chunkHash and chunkerVersion. References carry segmentId,
segmentStart/segmentEnd and chunkStart/chunkEnd: UTF-16 half-open `[start,end)`.
Each source slice equals its chunk slice; separators are outside source refs.
Locators are original origins from only text-contributing segments, including
overlap. Pages 2 and 4 remain distinct locators; no invented page 3/range or
page-section cross product. These are INTERNAL locations, not public citations.

Canonical identity SHA-256 includes source bytes/content hashes, extractor,
normalizer/chunker versions, options, index, text, references and locators.
textHash hashes chunk text separately. No timestamps/random UUIDs. Parser/algorithm
changes require a version bump. Node/ICU grapheme behavior is part of reproducibility:
pin deployment runtime and evaluate fixtures when changing Node/ICU.

## Task183 embedding contract

`embed-chunks.ts` accepts only ordered Task182 `DocumentChunk` values and uses
their exact `text` bytes as the OpenAI input; it never trims, normalizes or otherwise
rewrites a chunk. It verifies stable zero-based order, SHA-256 `textHash`, nonempty
text and internal provenance before contacting the provider. The exact tokenizer is
`cl100k_base` from pinned `js-tiktoken@1.0.21`; literal special-token spellings in
source text are counted as ordinary text.

The only configured provider/model is OpenAI `text-embedding-3-small`, 1536
dimensions. A server-only HTTP adapter reads `OPENAI_API_KEY` at call time, sends no
browser credential, and has no SDK or fallback model. Response count, unique indexes,
alignment, dimensions, finite components and nonzero vector norm are validated before
any result is returned. Results carry provider/model/dimension/tokenizer provenance,
token count and the input text hash. A failed later batch rejects the whole result;
it cannot be mistaken for complete embedding output.

Budgets are at most 8192 tokens per input, 32 inputs and 16000 tokens per request,
one sequential request at a time, 10000 chunks and 200000 tokens per job. Provider
attempts are capped at three per batch and 939 per maximum-size job. Retryable
network/timeout, HTTP 408/429 and 5xx errors use bounded exponential jitter and
bounded valid `Retry-After`; permanent errors and malformed output are not retried.
Cancellation is supported. No raw provider response or secret is included in
structured errors. Preflight estimates worst-case retry charges at the published
$0.02 per million-token rate and rejects jobs above $0.01. The effective token
ceiling is consequently lower when all three attempts are budgeted; pricing must be
checked again before live indexing.

## Task184 versioned persistence contract

The additive `rag-index.prisma` schema and
`20261009120000_add_rag_index_generations` migration add `RagContentVersion`,
`RagIndexGeneration`, `RagChunk`, `RagChunkEmbedding` and `RagIndexPublication`.
The migration creates only new RAG-index tables and a new generation-state enum; it
does not change RagDocument, existing migrations or other domain tables. It assumes
the already-installed pgvector extension and stores vectors as `vector(1536)`;
Prisma models that field as `Unsupported("vector(1536)")`, with parameterized SQL
used only at the server-side persistence boundary.

Content identity retains original-byte and normalized-content hashes plus extractor
and normalization versions. Generation identity hashes the content-version ID,
chunker/options, ordered chunk hashes, provider/model/dimensions/tokenizer versions
and expected completeness totals. Chunk text, Task182 `textHash`/`chunkHash`, refs
and private internal locators remain in the trusted database boundary. Vector rows
retain input/vector hashes and token counts; provenance is fixed on their parent
generation. No HNSW/IVFFlat index is created.

Unique keys make version, generation, chunk and embedding retries idempotent. A
conflicting replay is rejected after comparing the stored canonical data. Transactions
lock the generation row while adding/resuming chunks or vectors, and READY is set only
when the expected chunk count, one embedding per chunk and total token count match.
Publication is one unique document-to-generation pointer, checked against READY and
complete state while holding document/generation locks. Old generations are retained.
Task184's internal publication operation does not change `RagDocument.status`; the
Task185 guarded finalization boundary performs the `INDEXED` transition only in the
same transaction as a complete READY publication. APPROVED is not retrieval-eligible,
and metadata reads require both INDEXED and READY. DISABLED documents are excluded.
No route, Admin UI, retrieval or public projection imports this store.

## Resource budgets

| Resource | Ceiling |
| --- | --- |
| Original bytes | 20 MiB |
| Physical PDF pages | 500 |
| Extracted segments | 100,000 |
| Normalized source text | 5,000,000 UTF-16 units |
| Output chunks | 10,000 |
| ZIP entries | 2,048 |
| Selected OOXML | 32 MiB actual total, 16 MiB per part |
| XML/style inheritance depth | 128 |

ZIP data is fed in 1 KiB compressed increments and actual decompressed bytes are
counted, including descriptor ZIPs/incorrect header sizes. Only required metadata,
document and styles parts are decompressed; excluded parts receive warnings where
applicable. Budgets fail closed, never silently truncate into EXTRACTED success.
These are bounded content/output budgets, not a hard heap or wall-clock guarantee.
PDF.js can allocate while parsing before text/page guards run. A cancellable
durable worker/execution boundary is a Task185 deployment prerequisite. No
production user-upload execution is enabled here. Synthetic boundary tests are not
proof of production performance on every hostile or representative real document.

## Dependency decisions

Exact web runtime dependencies: pdfjs-dist 4.10.38 (Node >=20), fflate 0.8.3,
fast-xml-parser 5.11.2 and js-tiktoken 1.0.21. Existing local Node v22.19.0
supports the pinned PDF.js engine and tokenizer. No runtime upgrade, font download,
native system tool, Mammoth, OCR or OpenAI SDK. Next serverExternalPackages includes only
pdfjs-dist: an isolated Next 16.3.8/Turbopack prerender probe reproduced parser
failure when bundled, then passed with the package externalized. This preserves
Node worker resolution without importing processing into any product route.
Dependency audit and runtime/build evidence are recorded below, not implied by
successful install. Existing unrelated audit findings are not auto-fixed.

## Acceptance and validation evidence

Task181: 39 extraction tests PASS: real synthetic Unicode/multi-page PDF, blank
and image pages, Standard R2 password encryption, corrupt PDF, PDF page budget;
OOXML ordering/runs/styles/headings/tables, excluded-region warnings, malicious
DTD/entities/namespaces/XML, style cycles, ZIP paths/checksums/counts/actual expansion
limits; TXT BOM/line endings/NFC/invalid encoding/empty; input/text/segment budgets.

Task182: 22 chunk tests PASS: boundaries, repeated paragraphs, long text,
overlap/zero overlap, distinct repeated sections, noncontiguous pages, exact
source slices, Unicode/emoji/ZWJ/grapheme limits, forward progress, stable hashes,
version/options/source changes, empty/input/count limits and extraction integration.

Isolation: 2 tests PASS: actual production-mode client entry graphs contain no
processing modules/parsers/fixtures; processing graph contains no DB/Blob/AI/UI.
Synthetic fixtures are test-only generators, not verified Hà Giang source data.
No prior tests/assertions were changed.

Root tests: 248/248 Vitest plus all existing legacy suites PASS. Root typecheck:
four tasks PASS. Fresh root build (`npm run build -- --force`): PASS, 22/22 static
pages. No processing/parser/fixture markers in real production JS/HTML/JSON.
Node import and synthetic PDF extraction PASS; isolated Next 16.3.8/Turbopack
probe prerender PASS with serverExternalPackages. Probe exists outside Git at
`D:/KLTN/rag-processing-next-compat-0c2a5eb34b4141fc8fca39347897fe7f`.

`npm audit --json` exits 1: ten HIGH findings on existing Prisma/shadcn dependency
chains. Audit of the baseline lockfile has exactly the same ten packages; no
existing resolved package version changed before Task183/184. No audit finding
for pdfjs-dist, fflate or fast-xml-parser in that earlier run. Audit is not marked
clean, and unrelated packages were not auto-fixed. `git diff --check` PASS;
scope/secret-pattern scans PASS. One transient check failed on stale malformed `.next/dev/types` generated
files after dev config reload. Removed only the two generated files and used
native `next typegen`; subsequent web/root typecheck and fresh build PASS.

## Task183/184 validation — 2026-10-09

Focused Task183/184 and Task181/182 regression: 78/78 Vitest PASS. Full web Vitest:
263/263 PASS; all configured legacy suites PASS, including US17/18, RagDocument and
shared idempotency tests. Root `npm run check-types`: four tasks PASS. Prisma 7.10.0
schema validation and client generation PASS. `npm run build`: Next 16.3.8 compiled,
TypeScript passed, and 26/26 static pages generated. `git diff --check` PASS. Actual
production client chunks and the client-entry import graph contain no `js-tiktoken`,
OpenAI adapter, RAG persistence store, vector schema or synthetic provider fixture.
Secret-pattern scan found no credentials or connection strings.

The final dependency audit remains non-clean: 10 HIGH / 0 CRITICAL, with the same
advisory IDs as the baseline lockfile and no new advisories. The exact new runtime
dependency is `js-tiktoken@1.0.21` plus its `base64-js@1.5.1` dependency. No audit fix
was run. The audit exits nonzero because existing findings remain.

## Task184 owner review and isolated PostgreSQL validation — 2026-10-09

Code review found one MEDIUM concurrency defect: simultaneous creation of the same
content-version or generation identity could race on Prisma `upsert`, causing one
caller to receive P2002 instead of the existing identity. The store now catches
that unique-key race only, reads back the exact identity, and still verifies all
provenance and expected totals before returning it. A regression test covers both
identities. No other blocking code-review findings were confirmed.

Applied all ten migrations in order, including Task184, only to a disposable,
loopback-only PostgreSQL 16.9 container with PostGIS 3.5.2 and pgvector 0.8.6.
Prisma reports all migrations applied and up to date; `migrate diff` against the
current multi-file schema reports no difference. The catalog contains all five new
RAG-index tables, enum and constraints. The local database was synthetic and the
container was removed after validation.

Exercised the actual `createRagIndexStore` implementation and generated Prisma
client against that PostgreSQL database using `@prisma/adapter-pg` as a test-only
local transport. Verified vector(1536) insert/read-back and similarity operation,
application rejection of wrong dimensions/non-finite values, database dimension
and FK/unique enforcement, partial-write rollback, idempotent resume, concurrent
content-version/generation creation, concurrent vector replay and publication,
incomplete-generation rejection, atomic pointer selection, old-generation
preservation, APPROVED retrieval exclusion and DISABLED exclusion. The repository's
production `PrismaNeon` adapter was not used because the isolated target is ordinary
local PostgreSQL; its live Neon transport remains unverified here.

This test did not connect to or modify shared Development or Production. The
Task184 migration remains NOT APPLIED there. No live OpenAI request, Blob write,
Task185 status transition or public API was added.

## Task184 closure evidence — real PostgreSQL regression and Neon preflight

The opt-in real-persistence regression is
`apps/web/src/modules/rag-index/rag-index-store.postgres.integration.vitest.test.ts`.
Run it from the repository root with:

```powershell
npm run test:rag-index:postgres --workspace apps/web
```

Prerequisites are Docker Desktop/Engine and the repository's installed npm
workspaces; the first run may pull `pgvector/pgvector:0.8.6-pg16`. The runner uses
a random container name, an ephemeral host port bound only to `127.0.0.1`, synthetic
credentials and a fresh `task184_test` database. It checks the database identity
before installing schema, applies the actual RagDocument and Task184 migration
SQL, and stops only the container carrying its unique ownership label. It does
not read `DATABASE_URL`. The integration test is opt-in through the explicitly
named `US19_TASK184_TEST_DATABASE_URL` and disposable-target confirmation; with
that environment absent, Vitest reports the test as SKIPPED.

The test uses the real `createRagIndexStore` and generated Prisma Client with the
test-only `@prisma/adapter-pg`, not a fake persistence implementation. PostgreSQL
16.15 and pgvector 0.8.6 were exercised. Six barrier-started pairs race on unique
content-version identities and six pairs race on unique generation identities.
The Prisma query observer confirmed actual P2002 outcomes for both models, followed
by successful exact-identity `findUnique` recovery reads. The production store
performs these upserts/read-backs outside `$transaction`; successful reads after
the real uniqueness errors confirm they are not issued in an aborted transaction.
The test also verifies stored hashes and generation provenance, rejects a replay
after synthetic stored provenance is mismatched, confirms repeated same-key calls
return the same IDs, checks one row per logical identity, and confirms no orphan
RAG rows remain. No vector is written by this focused concurrency regression and
no live OpenAI call is made. The final version passed twice; the prior isolated
database validation separately exercised vector round-trip and rollback.

The earlier full isolated PostgreSQL validation applied all ten migrations to a
disposable PostgreSQL 16.9 / PostGIS 3.5.2 / pgvector 0.8.6 database and passed
schema diff, vector round-trip, rollback, concurrency and atomic-publication
checks. The checked-in focused runner applies only the two relevant RagDocument
and Task184 SQL migrations; it is not evidence that all ten historical migrations
were replayed by that runner.

### Neon Development read-only evidence

Owner-verified identity: project `summer-unit-95870477`, branch
`development` / `br-aged-hat-b3o6hg9p`, endpoint `ep-purple-pond-b3xujb8o`,
database `neondb`. The configured Neon host/database/TLS mode and read-only
`current_database()` result matched that identity. The migration ledger contains
nine completed migrations, no failed/incomplete record, and only
`20261009120000_add_rag_index_generations` pending. Applied checksums match after
normalizing checkout CRLF to migration LF; seven working-tree raw hashes differ
only because `core.autocrlf=true`. Historical migration files were not changed.
`pgvector` 0.8.6 and PostGIS 3.6.4 are installed. PrismaNeon read-only identity,
RagDocument count and metadata model reads passed; count was zero, so no metadata
rows were available to sample. Neon received zero writes; migration #10 remains
unapplied. PrismaNeon vector WRITE remains NOT_RUN.

US-19 stays IN PROGRESS. Gate C live private Blob verification is NOT_RUN; Gate D
live Admin browser flow remains PARTIAL. The statement that Task185 was not
implemented was accurate for this 2026-10-09 handoff and is superseded by the
Task185 implementation record below.

## Limitations and next-task handoff

- Historical next-task handoff (2026-10-09): Task185 covered approved document
  acquisition, eligibility/content identity, worker cancellation, coverage policy,
  cross-process jobs and status writes. These items are now implemented locally as
  recorded below; only complete indexing may move APPROVED → INDEXED.
- No public file download, snippet, private original/path/hash/internal ID
  projection, change to Task191, or citation interaction.
- US-17/18 integration and Development migrations are complete; live private Blob
  runtime verification remains unrun (Gate C).
- Unsupported DOCX parts are not parsed for content; warnings conservatively
  identify coverage gaps. Do not use a warned document as fully extracted evidence.
- Current embedding and persistence budgets have synthetic functional evidence,
  not a production benchmark or live provider result.
- Vercel deployment/file tracing of PDF.js worker assets has not been verified;
  deployment packaging must be tested before enabling live document processing.

Owner review required. No commit, push, merge, OpenAI or Neon write.

## Task185 implementation and local verification — 2026-10-10

Added an additive `RagIndexJob` schema and un-applied migration
`20261010120000_add_rag_index_jobs`. The job ledger has queue/run/terminal states,
phase checkpoints, an expiring lease/fencing token, cancellation request, content
version/generation IDs, sanitized warning/failure codes, and a pending embedding
batch marker. `RagDocumentStatus` remains unchanged. No migration was applied to
Neon and no new package dependency was added.

Admin-only enqueue/cancel/explicit-retry service functions use persisted role checks
and the shared idempotent-write contract. Enqueue locks the document row and
rejects ineligible documents or existing queued/running/unknown work. A separately
invoked server-only worker core claims with `FOR UPDATE SKIP LOCKED`, requeues only
safe expired phases, and fences every result write with the current lease and
document status. It reads only the registered Blob path, checks MIME/type/size and
hashes the exact bytes, then reuses Task181 extraction, Task182 chunking, Task183
token/cost checks and Task184 persistence. The always-emitted PDF reading-order
heuristic is preserved as informational job provenance; page-without-text and
unsupported DOCX-region warnings fail closed. No-extractable-text, corrupt and
password-protected files are rejected before embedding. No request, upload or
approval flow invokes the worker.

Each embedding batch is marked pending before the provider call. The completed
batch's vectors and cleared pending marker commit together. Worker recovery that
finds an expired in-flight batch records `UNKNOWN`; it never repeats that provider
call automatically. A new Admin retry uses a new idempotency key and reruns the
existing cost preflight on missing chunks. Provider calls are limited to one attempt
per batch in this worker. The old active publication survives failure or reindexing;
the new publication pointer, `INDEXED` document status and job completion commit
atomically after the READY/completeness check.

Focused Task185/Task181–184 unit and service tests: 24/24 PASS. Prisma schema
validation and client generation passed. The opt-in PostgreSQL runner was invoked
but skipped because Docker Engine was unavailable, so real cross-process claim
behavior and Task185 atomic finalization remain unverified in this run. Root Vitest,
legacy suites, typecheck, production build, dependency audit delta, production
client isolation and final diff/secret scans are reported in the Task185 handoff.
No live OpenAI, Blob or Neon operation was performed. The new migration remains
unapplied; US-19 remains IN PROGRESS and owner review is required.

## Task185 owner review closure — 2026-10-10

The owner review found that rejecting every extraction warning made all PDFs
ineligible because Task181 emits `PDF_READING_ORDER_HEURISTIC` for every PDF.
Product and system requirements in this repository do not require rejecting that
heuristic. It is now informational and persisted as job provenance. A PDF page
without text and an unsupported DOCX region still fail closed; image-only,
no-extractable-text, corrupt, and password-protected inputs never reach embedding
or publication. No reviewed partial-coverage exception was introduced.

The worker now records warning codes through a lease-guarded job-store transaction.
It also keeps lease-renewal database uncertainty as `UNKNOWN`, stops before
verification/publication after runtime abort, and aborts an in-flight Blob stream
read instead of waiting for the next chunk. Fake-provider worker tests use the
real Task181 extractor with synthetic PDF/DOCX inputs. A PostgreSQL PDF pipeline
case asserts the heuristic warning is persisted, but it could not run in this
environment.

Validation after the correction: focused Task185 and processing tests pass; full
web Vitest passes 280 tests with four opt-in PostgreSQL tests skipped; all legacy
suites pass; Prisma validate/generate, typecheck, build and `git diff --check`
pass. Docker CLI 29.6.2 is installed, but the selected `desktop-linux` Engine is
unavailable at `npipe:////./pipe/dockerDesktopLinuxEngine`. The Task185 PostgreSQL
runner exited successfully with SKIPPED and created no resources. No other Docker
context or database was used. Lease fencing, concurrent enqueue/claim, PostgreSQL
rollback, cancellation/disable races and atomic publication therefore remain
unverified against a real Task185 PostgreSQL database.

Minimal deployment proposal: after owner-approved migration and integration
closure, run one separately deployed server-only worker process on an already
approved always-on container runtime. It polls the PostgreSQL job ledger with
bounded concurrency; the ledger and row locks provide queue/claim durability.
Graceful shutdown stops new claims and aborts current I/O; lease expiry recovers
safe phases, while uncertain provider batches remain `UNKNOWN`. Use controlled
server-only Blob/OpenAI credentials, existing cost preflight and one provider
attempt per batch. Emit sanitized job ID/phase/status/failure-code logs and
measure queue age, duration, retry and UNKNOWN counts. Validate PDF.js runtime
assets, Blob reads, resource bounds and operational limits before live enablement.
No worker host or third-party queue is provisioned or selected by Task185.

No real OpenAI/Blob calls, Neon writes, or migration apply occurred. The job
migration remains unapplied; durable deployment is blocked; US-19 remains
IN_PROGRESS and owner review is required.

## 2026-10-10 — Experimental direct API index flow (separate feature branch)

- Owner requested a fast MVP with request-scoped API processing rather than a separately hosted worker. This is a **delivery-path alternative**, not proof of durable execution or a replacement for the committed job-ledger invariants.
- On feature branch `feat/us19-direct-index-api-progress`, an authenticated Admin-only `POST /api/admin/rag-documents/[id]/index` admits an idempotent job and invokes the existing `runNextRagIndexJob` for **that exact job**, within the same Node.js request. A replayed idempotency key never repeats processing. The `GET` endpoint returns the latest persisted job phase, outcome and counts. The Admin document detail polls every two seconds and shows the actual persisted embeddings/total as progress (no invented extraction percentage).
- `maxDuration=300` is an upper request setting, not a service guarantee. Deployments with lower configured limits, network interruptions and client disconnects can leave a job QUEUED/RUNNING/UNKNOWN. A request-scoped server function is **not durable**; idle/expired jobs do not progress until an explicit subsequent invocation or a future worker. UI must not treat timeout as confirmed failure or automatically reissue uncertain paid work.
- No automatic indexing at upload/approval; no public retrieval change, migration apply, Blob live operation, OpenAI live call, or Production write was made by this design change. Migration `20261010120000_add_rag_index_jobs` remains a prerequisite for any runtime test. The separate migration authorization and Dev environment gates remain unchanged.
- This feature branch has not been validated through local typecheck/build/integration/browser since GitHub file writes do not provide a runnable checkout here. **Do not merge/deploy** until compile/tests (including real disposable PostgreSQL concurrency), packaging and bounded direct-call smoke pass. The initial implementation does not provide a safe explicit in-UI retry of an UNKNOWN job; handle those manually after reconciliation.

## 2026-10-10 — Task185–187 direct API closure, owner review pending

Owner-authorized baseline: feature branch feat/us19-direct-index-api-progress at
23a399ed47eeca804b6aa44675ed71d2930292cc. Changes are in the isolated Codex worktree;
pre-existing TXH worker-preparation changes are preserved. No commit/push/merge.

The current MVP supersedes the historical separate-worker prerequisite: awaited,
targeted request-scoped Node API, durable job ledger, no background deployment.
Thin POST/GET handlers delegate to the server-only request service. INDEX admission,
explicit QUEUED/expired RESUME and known-failure RETRY use persisted Admin guards,
document locking and shared idempotency. Same-key replay does not invoke processing;
UNKNOWN processing is never automatically retried. Invalid cross-document recovery
and provider uncertainty are rejected safely. Publication core is reused unchanged.

Task186 panel uses serial 2s polling (5s read-error / 15s terminal backoff), stale
identity and abort guards, synchronous double-submit guard, preserved same-key
uncertain mutation reconciliation and new-key known retry. Counts are persisted;
embedding percentage is not total completion. Stage completion is conservative.
COMPLETED refreshes the document from the server. Existing Admin tokens, shared
Button, accessible labels, reduced-motion and mobile wrap are preserved.

Validation: root npm test PASS, 303 Vitest tests passed and 15 opt-in PostgreSQL
cases skipped only in the ordinary run; all legacy suites passed. Separately the
explicit disposable PostgreSQL runner passed 15/15 with zero skipped assertions:
14 Task185 and one Task184 concurrency regression, PostgreSQL16.15/pgvector0.8.6.
Two successful runs include the new HTTP-service recovery regression (final run
includes shared INDEX/RESUME/RETRY operation scope). Cleanup removed the owned
container and its database volume. Tests cover real locks/fencing, cancellation,
UNKNOWN, rollback, atomic finalization, old-publication preservation, targeted
recovery, committed replay, payload conflict and known retry. Added fake-provider
worker tests cover valid DOCX, missing Blob, hash mismatch, token budget, provider
rejection, invalid dimensions, uncertain vector save and verification failure.

Browser component harness passes admission/double-submit, progress/counts, UNKNOWN,
retry keys, reconciliation, queued resume, completed callback, read errors, serial
polling, unmount, keyboard and 1440/360 light/dark checks. Screenshots are ignored
under apps/web/.cache/rag-index-ui. This is not authenticated full-app/live E2E.
Env generation, Prisma validate/generate, typecheck and production build pass.
The isolation assertion now distinguishes UI rag-index-panel names from real
src/modules/rag-index backend imports; provider/parser/tokenizer/fixtures remain
forbidden in client graphs. No dependency or historical migration changes.

Read-only Neon Development recheck: verified configured owner-confirmed endpoint,
neondb/public, 11 completed migrations, zero failed/pending; all checksums match
raw or historical LF normalization; pgvector0.8.6 and PostGIS3.6.4. No shared writes.
PrismaNeon raw PostgreSQL name values require ::text casts for this read-only query.
No migration apply, live OpenAI or live Blob operation in this run.

Task185/186/187 implementation and offline validation are complete for owner review;
NOT ACCEPTED/DONE. Owner live acceptance must verify persisted Admin/denied roles,
registered small PDF/DOCX/TXT private Blob, real bounded embeddings, runtime PDF.js
packaging, actual function duration configuration, disconnect/resume/retry and
refresh/reload. Larger files may exceed request duration. UNKNOWN requires manual
reconciliation; no automatic charge-producing override exists. US19 IN_PROGRESS.

Production packaging correction: the final index-route trace initially omitted
PDF.js's dynamically loaded pdf.worker.mjs. Added route-scoped
outputFileTracingIncludes in next.config.ts while preserving the external parser,
images/typedRoutes/reactCompiler/varlock settings. The final build trace must
contain both legacy pdf.mjs and pdf.worker.mjs. This packages assets; live Vercel
PDF runtime acceptance remains pending.

Strict UI skill audit:22 existing findings outside touched RAG UI (4 unresolved
ownership,18 violations); no repository-wide UI audit PASS claimed.

Final production build PASS (26/26 static pages): inspected the actual index-route
.nft.json and confirmed both pdf.mjs and pdf.worker.mjs. Client static asset scan
found no worker/provider/tokenizer/fixture markers. Final changed scope is16 paths:
12 modified,4 added. Existing migration and dependency files are unchanged.

Scope inventory (repository-relative):
- apps/web/next.config.ts: narrow PDF worker tracing.
- apps/web/src/app/admin/rag/rag-index-panel.tsx: safe progress/action lifecycle.
- apps/web/src/app/admin/rag/rag-index-panel.css: responsive/accessibility presentation.
- apps/web/src/app/admin/rag/rag-review-ui.tsx: completed document refresh.
- apps/web/src/app/api/admin/rag-documents/[id]/index/route.ts: thin no-store HTTP boundary.
- apps/web/src/modules/rag-index/rag-index-request-service.ts (added): targeted request orchestration.
- apps/web/src/modules/rag-index/rag-index-route.vitest.test.ts (added): HTTP regression.
- apps/web/src/modules/rag-index/rag-index-job-service.vitest.test.ts: request lifecycle regression.
- apps/web/src/modules/rag-index/rag-index-job-store.postgres.integration.vitest.test.ts: real recovery/replay regression.
- apps/web/src/modules/rag-index/rag-index-worker.vitest.test.ts: deterministic pipeline failures.
- apps/web/src/modules/rag-processing/isolation.vitest.test.ts: actual backend graph boundary.
- apps/web/scripts/test-rag-index-ui.mjs (added): browser component regression/screenshots.
- DESIGN.md (added): existing Admin canonical design and indexing UX contract.
- docs/decisions.md: owner-approved direct-request MVP decision.
- docs/stories/US-19-rag-indexing.md: current status, evidence and scope inventory.
- docs/ai-progress.md: verified closure and pending live gates.

Final PrismaNeon read-only RepeatableRead snapshot PASS on verified Development:
neondb, RagIndexJob count0, RagDocument count0. Transaction explicitly READ ONLY;
no synthetic records, provider calls or Blob operations.

## 2026-10-10 — Final publication gate diagnosis

Baseline remains23a399ed47eeca804b6aa44675ed71d2930292cc on the owner-selected
feature branch. One additional scoped test-runner modification brings the scope
to17 paths (13 modified,4 added). No application feature/persistence change in this
closure. Root DESIGN.md is retained as scoped Admin RAG design/UX documentation;
it is not a runtime dependency and does not override other screens' styling.

Gate A: Node22.19.0/npm11.16.0/Vitest5.0.3/Prisma+PrismaPg7.10.0. The old nested
npm.cmd/cmd.exe invocation reported native exit3221225477 after all15 assertions
passed; the outer runner correctly failed and still cleaned its disposable DB.
Both Prisma suites await disconnect in afterAll. No relevant node crash entry was
available in the queried Windows Application event log, so the precise native
faulting module is not established. Direct Node invocation of the same Vitest
CLI/config/test files with unchanged threads pool passed twice diagnostically;
a forks comparison also passed, so no pool or assertion was removed.

The runner now invokes Vitest using process.execPath with shell:false, bypassing
the nested Windows lifecycle. It logs each child PID/exitCode/signal without
arguments, connection strings or secrets, and still propagates nonzero exits and
requires a complete non-skipped JSON assertion report. Final regular
npm run test:rag-index:postgres --workspace web passed twice consecutively:
15/15,0 skipped,node/Vitest exit0,outer command exit0,owned container and one
volume removed each time. Initial pg_isready exit1/2 during container startup is
expected and precedes readiness exit0; it is not a passing assertion substitute.
This resolves the observed launch-path failure; no claim is made about a proved
native-library fault or universal absence of future native runtime errors.

Gate B: initial expired Vercel access credential (2026-10-01) caused403 Not authorized
on user/teams/project queries. Running cached Vercel CLI62.2.0 whoami refreshed it
through the normal CLI flow and returned txhoai2309. Subsequent read-only API calls
returned200 for identity,team,project and env metadata. Project kltn is
prj_tyylPlLvhAvbkdyXHPPQCLgkZvlO in team_lFpdLI4GaW49ylVsGPbT0qUX
(to-xuan-hoai-s-projects). Services framework uses web/Next.js; Node24.x,
Fluid Compute=true,default timeout300s,Hobby,default regioniad1. Repository service
build/install settings remain unchanged. Route source maxDuration300 and240s
cooperative abort remain. The unpublished changes have no deployed runtime proof.

Only DATABASE_URL and BETTER_AUTH_SECRET are assigned to Preview. No gitBranch or
custom-environment override is present and no shared project env exists. Preview
OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN are absent. DATABASE_URL is sensitive;
both list/decrypt and single-env read APIs omit its value. Therefore Preview DB
target is UNVERIFIED, not Development PASS from key presence. No connection was
attempted using an uncertain Preview value; no Production DB access or shared writes.

Publication remains BLOCKED until owner sets/verifies Preview DATABASE_URL from
Neon development/br-aged-hat-b3o6hg9p,endpointep-purple-pond-b3xujb8o,neondb,TLS;
configures Preview-only private Blob/OpenAI credentials; and approves publication.
Do not disclose secret values when confirming these actions. Live provider/Blob,
authenticated Preview E2E and effective deployed function packaging remain pending.
US19 IN_PROGRESS. No commit,push,merge,deploy,migration apply or Neon writes.

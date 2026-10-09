# US-19 — RAG indexing: Task181–Task184

## Status and scope

Task181–184 implemented locally for owner review. US-19 remains IN PROGRESS:
Task185 orchestration, Admin indexing UI and production upload processing are not
implemented. Owner Tô Xuân Hoài authorized the combined Task183/184 package on TXH,
baseline `ff638e40ef93197c704cba3c16a0391634b25f74`. No commit/push/branch
integration or shared-database migration apply is authorized.

## Sources and prerequisites

- Product Document: YCCN-93/94/97, QTN-99–101, YCP-21, NT-175/176.
- System Specification §12.4: APPROVED → extraction → chunking → embedding →
  vector storage → INDEXED. Completing only the first two stages is not indexing.
- Repository AGENTS, source baselines, product contract, architecture and flow.
- US-21 Task191: PDF physical pages, verified DOCX headings, no assumed TXT/DOCX
  pagination; metadata-only public citations and separate runtime trust boundaries.
- US-17/18 inspected read-only on ThaiAnh at
  `4c6df6128c1923369e652eb332eb1b475b50c3fa`. They are not on TXH. Their fixture
  tests/recorded checks are distinct from applied migration/live private Blob,
  which were not proven in those stories and were not accessed in this package.

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
The internal publication operation does not change `RagDocument.status`; APPROVED is
not retrieval-eligible, and metadata reads require both INDEXED and READY. DISABLED
documents are excluded. No route, Admin UI, retrieval, public projection or Task185
status transition imports this store.

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
PDF.js can allocate while parsing before text/page guards run. A genuinely
cancellable worker/execution boundary belongs to Task185 planning. No production
user-upload execution is enabled here. Synthetic boundary tests are not proof
of production performance on every hostile or representative real document.

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
live Admin browser flow remains PARTIAL; Task185 orchestration is not implemented.

## Limitations and next-task handoff

- Task185: approved document acquisition, current eligibility/content identity,
  immutable approved bytes, worker-level cancellation/timeouts, incomplete-coverage
  policy, cross-process job idempotency/concurrency and status writes. Only complete
  indexing may move APPROVED → INDEXED.
- No public file download, snippet, private original/path/hash/internal ID
  projection, change to Task191, or citation interaction.
- US-17/18 branch integration/migration/Blob runtime require separate owner review.
- Unsupported DOCX parts are not parsed for content; warnings conservatively
  identify coverage gaps. Do not use a warned document as fully extracted evidence.
- Current embedding and persistence budgets have synthetic functional evidence,
  not a production benchmark or live provider result.
- Vercel deployment/file tracing of PDF.js worker assets has not been verified;
  Task185 must test deployment packaging before enabling live document processing.

Owner review required. No commit, push, merge, OpenAI or Neon write.

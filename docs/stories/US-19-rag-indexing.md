# US-19 — RAG indexing: Task181 extraction + Task182 chunking

## Status and scope

Task181/182 implemented for owner review. US-19 remains IN PROGRESS: no embedding,
vector persistence, orchestration, Admin indexing UI or production upload processing.
Owner Tô Xuân Hoài authorized this combined package on TXH, baseline
`ed4442280e00ce730440e3f7e7267b04599156af`. No commit/push/branch integration authorized.

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
fast-xml-parser 5.11.2. Existing local Node v22.19.0 supports the pinned PDF.js
engine. No runtime upgrade, font download, native system tool, Mammoth, OCR,
embedding SDK or schema migration. Next serverExternalPackages includes only
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
existing resolved package version changed. No audit finding for pdfjs-dist,
fflate or fast-xml-parser in this run. Audit is not marked clean, and unrelated
packages were not auto-fixed. `git diff --check` PASS; scope/secret-pattern scans
PASS. One transient check failed on stale malformed `.next/dev/types` generated
files after dev config reload. Removed only the two generated files and used
native `next typegen`; subsequent web/root typecheck and fresh build PASS.

## Limitations and next-task handoff

- Task183: choose embedding model/token budgets, consume chunks; not implemented.
- Task184: persist versioned chunks/vectors and provenance; not implemented.
- Task185: approved document acquisition, current eligibility/content identity,
  cancellable execution, incomplete-coverage policy, idempotency/concurrency and
  status writes. Only complete indexing may move APPROVED → INDEXED.
- No public file download, snippet, private original/path/hash/internal ID
  projection, change to Task191, or citation interaction.
- US-17/18 branch integration/migration/Blob runtime require separate owner review.
- Unsupported DOCX parts are not parsed for content; warnings conservatively
  identify coverage gaps. Do not use a warned document as fully extracted evidence.
- Current budgets have synthetic functional evidence, not a production benchmark.
- Vercel deployment/file tracing of PDF.js worker assets has not been verified;
  Task185 must test deployment packaging before enabling live document processing.

Owner review required. No commit, push, merge, OpenAI or Neon write.

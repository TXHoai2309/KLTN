# US-19 — DOCX research document coverage correction

2026-10-16; TXH; local implementation and offline verification. Owner live retry is pending.

## Root cause and before/after evidence

Read-only originals are under `D:/KLTN/danh sách điểm đến/`. No Neon or Blob access was needed; uploaded-object byte equality was not independently verified against storage.

The original `Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx` SHA-256 is
`6f21f0c8f69a4b8e5315299b5a2693518d9ac85c4c116d81d83ec0db14abe6b6`.
Running the exact HEAD extractor against these bytes reproduced four blocking warnings:
`word/header1.xml`, `word/footer1.xml`, `relationship:header`, `relationship:footer`.
The old extractor excluded those parts unconditionally. The worker correctly converted the warnings into INCOMPLETE_COVERAGE before persisting chunks or invoking embeddings.

Concrete meaningful text regions:

| OOXML part | Location | Element | Text length |
| --- | --- | --- | --- |
| word/header1.xml | hdr/p[0]/r[1]/t[1] | w:t | 50 |
| word/footer1.xml | ftr/p[0]/r[1]/t[1] | w:t | 88 |
| word/footer1.xml | ftr/p[0]/fldSimple[2] | w:fldSimple PAGE | no cached text |

These are valid WordprocessingML regions, not evidence of a broken DOCX generator. This was an extractor support limitation; ignoring the warnings would have dropped content. The main document also contains one relationship-backed hyperlink; old extraction kept its label but did not resolve its target URL.

## Implementation

- Bounded ZIP acquisition now includes top-level Word XML and their relationship parts, retaining CRC, actual decompression limits, entry/path checks, XML depth/entity and namespace checks.
- Extract header parts once, then main body, then footer parts once. Resolve custom header/footer filenames through internal relationships; preserve existing paragraph/table/heading traversal. Store auxiliary part provenance in internal locators. No page-by-page repetition is invented.
- Preserve saved pagination field results only for PAGE/NUMPAGES/SECTIONPAGES. Do not execute field instructions, resolve external content, synthesize page numbers or fetch hyperlinks. Unsupported fields remain coverage failures.
- Resolve hyperlink IDs in their owning part. Keep displayed text and append an existing HTTP(S) relationship target when it is not already displayed. Keep plain-text URLs unchanged. Reject unsupported/unsafe targets through coverage warnings.
- Reject literal XML control characters and unknown table subregions. Existing drawing/text-box, embedded content, external chunks, revisions and notes limitations remain blocking rather than silently omitted.
- Bump DOCX extractor identity from ooxml-body-v1 to ooxml-stories-links-v2. Original byte hashes stay unchanged; content/generation identities naturally account for the improved text and locators. PDF/TXT identities are unchanged.
- Coverage failures persist a strict diagnostic alongside warning strings in the existing JSON array (no schema/migration). The Admin progress service projects the legacy string array and a separate extractionDiagnostic object. Fields: extractionStage, ooxmlPart, unsupportedElement, location, coverageFailureReason, recoverable=false and a UUID diagnosticCorrelationId. Parser failures return nullable region fields. Log only these structural diagnostics, never document text, bytes, instructions, URL values or credentials.

## Validation

An independent Python zipfile/ElementTree oracle enumerated ordered nonempty paragraphs across header, body (including tables) and footer, and existing hyperlink targets. Tests compare every paragraph hash, not private text in logs. Chunk refs reconstruct every UTF-16 source position without gaps and match the corresponding text slices. Original bytes hash, normalized content hash, deterministic re-extraction, Unicode, no NUL/replacement characters and unique chunk hashes/text hashes pass. Every existing source URL occurs whole in at least one chunk.

| Original profile | Nonempty paragraphs | Distinct URLs | Chunks / fake embeddings | Warnings |
| --- | --- | --- | --- | --- |
| Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx | 429 | 16 | 51 / 51 | 0 |
| Cang_Bac_Me_Ho_so_du_lieu_RAG_nguon_URL_day_du_2026.docx | 161 | 9 | 35 / 35 | 0 |
| Khau_Vai_RAG_2026.docx | 261 | 13 | 51 / 51 | 0 |

All three original files complete extraction → chunking → fake embedding → mock persistence/verification/publication. This proves application orchestration with mocks, not real PostgreSQL transactions or live retrieval ranking. Three invented research fixtures provide permanent portable extraction and mocked worker regressions. Actual retriever tests preserve [S01], title and complete URL together in returned evidence using mocked query rows and embeddings; mentioned URLs are not promoted to verified citation sourceUrl metadata. Existing eligible publication and document scope guards remain unchanged.

- Focused extraction, processing and US-19 regression: 150 passed, 16 opt-in PostgreSQL tests skipped. Includes six explicitly enabled real-original extraction/pipeline cases.
- Actual retrieval regression: 23 passed, including three source-preservation cases.
- Legacy RAG document/upload/review/authorization regression: 52 passed.
- Root workspace typecheck and production build: PASS (40 static pages).
- git diff --check: PASS.

Local evidence (outside Git): `C:/Users/User/AppData/Local/Temp/kltn-us19-docx-qa/` contains before.json, regions.json, oracle.json and regression.json. Oracle includes private extracted text and remains local. No original document or private text fixture was added to Git. Opt-in tests use RAG_DOCX_QA_DIR pointing to this directory; ordinary tests use invented fixtures and do not require owner files.

## Owner manual retry

1. Use the updated local server on localhost:3010; restart it if it is serving an older production build.
2. Open the existing failed, approved document in Admin RAG and explicitly select Retry once. This live action may call the configured embedding provider; it was not performed by the agent.
3. Confirm COMPLETED / INDEXED, nonzero matching stored chunk and embedding counts, and retained source labels/URLs. Counts above apply to the named local original bytes and current chunk settings; verify the uploaded byte hash if they differ.
4. If extraction fails, inspect the Admin progress API's extractionDiagnostic and correlate its UUID with the server diagnostic. Do not auto-retry an UNKNOWN provider outcome.

No runtime blocker remains for the demonstrated originals. Live owner retry, actual embeddings/vector ranking and real database publication remain LIVE_PENDING. Sixteen opt-in PostgreSQL assertions were not run; the authorized mock path was used. Existing unrelated V4/category/Prisma dirty changes were preserved. No .env, migration or model change; no Neon write, approval/index operation, paid provider call, commit, push or deployment.

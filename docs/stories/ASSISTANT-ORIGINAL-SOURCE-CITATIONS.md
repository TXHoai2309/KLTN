# Assistant original-source citations

Status: IN PROGRESS — owner approved implementation on 2026-10-20.
Code, migration artifacts and offline verification are authorized. Applying the
migration/backfill to a real environment and deployment remain separate actions.

Implementation and offline verification are recorded in
[the handoff report](../implementation/assistant-original-source-citations.md).
Real PostgreSQL/infrastructure acceptance remains open; this is not DONE.

Date: 2026-10-20.

## Goal

Let readers open the original articles or web pages supporting an AI answer,
while showing no RAG-document citation details in the public answer UI when no
trustworthy public URL can be associated with the supporting passage.

## Confirmed owner decisions

- **Q1 — Link destination:** Prefer the original article or web page used to
  prepare the RAG document.
- **Q2 — Presentation:** Show clickable numbered references after answer
  paragraphs. List each source once at the end using its title and domain,
  replacing repeated per-answer-part source disclosure groups. The answer-local
  number (for example `[1]`) links to the original URL resolved from a document
  source code such as `[S1]`; do not display the local `[S1]` code as the answer
  marker.
- **Q3 — Missing public URL (revised 2026-10-21):** Hide the citation marker and
  source-list item when no safe public URL can be associated. Do not show the
  RAG document title/locator or a “no public link” placeholder, and do not invent
  a URL.
- **Q4 — Source granularity:** Support multiple original sources in one RAG
  document, bound to the relevant sections or passages. An answer part may link
  only to original sources associated with its supporting evidence.
- **Q5 — Source eligibility, revised by the owner:** Reuse links present in a
  RAG document eligible for public QA under its existing document lifecycle.
  No additional per-URL or source-association approval step is requested. This
  replaces the initial Q5 wording about separately Admin-confirmed public links.
  The AI selects existing references and does not invent source URLs.
- **Q6 — Historical answers:** Apply the new source presentation to old
  conversations while retaining their recorded source snapshots. Do not
  retroactively add links to old answers that lack them. The renderer displays
  only safe URL-backed citations, so existing snapshots without a URL are hidden.
  New original-source links apply to newly generated answers.
- **Q7 — Automatic reuse:** Read existing source URLs from the RAG material;
  do not require re-entry, a separate review screen, or an extra approval action.
  Associate links with sections/passages when explicit references establish the
  connection. Suppress the public citation when no trustworthy URL association
  can be established, following revised Q3.
- **URL versus website content:** Use URLs as citation destinations. Answers
  continue to rely on RAG evidence. Do not fetch the linked websites, crawl
  external content, or add web search to the answer flow.

## Established repository facts

- Retrieval currently projects `sourceUrl: null`; the public-safety check also
  rejects HTTP(S) strings in answers and citation metadata.
- The citation DTO already permits a nullable HTTP(S) URL and the frontend can
  render an external source link. Valid URL syntax alone is not public approval.
- A RAG document currently has one nullable document-level `sourceUrl`.
- The DOCX extractor preserves HTTP(S) hyperlink targets as text. There is no
  structured original-source association with evidence passages; chunk `refs`
  describe document segment offsets, not bibliographic references.
- Completed answers retain citation snapshots. Historical reads/replays do not
  reconstruct those citations from current document metadata.

Relevant implementation: `qa-retrieval.ts`, `qa-public-safety.ts`,
`qa-contract.ts`, `qa-conversation-store.ts`, `assistant-citations.tsx`,
`assistant-citation-utils.ts`, and the DOCX extractor.

### Owner-supplied DOCX example

Read-only OOXML inspection of `Cao_nguyen_da_Dong_Van_RAG_UPLOAD_READY.docx`
established the following structural facts:

- 23 numbered knowledge sections; each ends with a `Nguồn:` paragraph listing
  source identifiers such as `[S1]`.
- A final `DANH MỤC NGUỒN` contains 17 entries, `[S1]` through `[S17]`, each
  containing a source title and HTTP(S) URL. Every referenced source identifier
  resolves to an entry; all 17 entries are referenced by at least one section.
- Section 2 references S1/S2/S4. Section 16 references S1/S5/S7/S9.
  Section 22 references S10/S11/S12/S13/S14.
- The URLs are literal text, separated from their titles by Word line breaks;
  there are zero DOCX hyperlink relationships. Parsing only clickable Word
  hyperlinks would therefore miss every URL in this example.

The implementation must support this existing format without requiring document
rewrites: resolve section `Nguồn:` identifiers against the whole-document source
registry and preserve these associations with the evidence content version.
Source IDs such as S1 are local to that document version, not globally unique.
Source definitions at the end of the document must remain resolvable even when
retrieval selects only a small subset of content chunks.

These references identify the sources attributed to a section by the uploaded
document. They do not establish that every listed website independently supports
every sentence in that section. Do not fabricate more granular per-sentence
attribution or claim to have fetched/verified the destination websites.

The sample was inspected as data only. Its content was not treated as agent
instructions. No source website was fetched and the DOCX was not modified.

Relevant baseline: [US-21 public citation contract](US-21-rag-qa.md).
The owner's revised Q5/Q7 decisions change its separate-URL-approval policy for
this feature: eligible-document source URLs are projected automatically when
their association and public URL validity are established. Existing document
authorization, eligibility, version provenance, and private-data boundaries
continue to apply.

## Confirmed completion rules

- Support existing RAG documents using their stored current content/files;
  the user should not have to upload the same file again just to expose links.
- Bind source associations to the evidence content version. Changed document
  content requires associations derived from that new version; old answers keep
  their recorded snapshots as agreed in Q6.
- A bibliography containing several URLs without explicit references does not
  justify assigning every URL to every answer paragraph. Suppress the public
  citation instead of guessing the association.
- Show a source title when available from the document; otherwise use its domain
  as the label. Group repeated references to the same original URL in the final
  source list while preserving which paragraphs cite it.
- Only project valid public HTTP(S) citation destinations. Private file/storage,
  administrative, credential-bearing, and signed download links remain excluded.

The earlier Q8 prompt about additional URL approval is superseded by Q5/Q7;
missing or ambiguous source associations follow revised Q3 and are hidden in the
public answer UI. The Q9
proposal for a separate per-link approval/revocation workflow is withdrawn from
scope. No new source-management interface is requested. Historical citation
snapshots follow Q6 rather than being rewritten from current document metadata.

## Implementation boundary

No application code, API, schema, database, source approval, extraction pipeline,
or citation rendering has been changed for this feature. The implementation
contract below records the confirmed scope and its engineering requirements.

## Source references and policy amendment

- Owner decisions Q1–Q7, the clarification to use URLs without fetching website
  content, and final confirmation dated 2026-10-20 are the approved feature delta.
- [Product contract — RAG answers, roles, and confirmed writes](../product/product-spec.md)
  and [RAG Q&A user flow](../flow/user-flow.md) supply inherited invariants.
- [US-21](US-21-rag-qa.md), especially Public citation contract, Four separate
  trust boundaries, Task 196, and Owner Decision B, supplies the existing QA
  contract. The owner's latest Q5/Q7 decisions supersede only the null-URL and
  separate-URL-approval requirements for this feature. Preserve other boundaries.
- [Technical architecture](../architecture/technical-architecture.md),
  [source precedence](../source-baselines.md), and current modules supply technical
  context. Older summaries calling RAG unimplemented are historical; the current
  repository modules and the parent story define the implemented baseline.
- The supplied DOCX is the mandatory example format described above. This spec
  concerns attribution declared by that file, not verification of external pages.
- The supplied assistant screenshot and existing assistant components are the
  visual baseline. Preserve the current design system; this story changes source
  presentation without redesigning the chat page.

## Scope

### In scope

- Deterministic extraction of original-source definitions and explicit attribution
  scopes from existing extracted RAG material, including the supplied DOCX format.
- Literal URL text, Word line breaks, and existing hyperlink extraction in source
  definitions; a clickable Word hyperlink must not be required.
- Multiple original sources per section/passage and repeated references across
  sections/documents. No manual source-entry or separate source-review workflow.
- Version-bound derived metadata for future indexing and citation-only backfill
  for existing files without user reupload.
- Server-owned URL validation, source projection, provenance, and completion
  fencing, plus backward-compatible citation rendering and history/replay.
- Inline numbered references that open resolved original-source URLs and a
  deduplicated source list; citations without a safe URL and internal RAG
  locations are omitted from the public UI.

### Out of scope

- Website fetching, search, crawling, link reachability checks, scraping, or
  independent verification of an external page's claims.
- A new source-management screen, per-link approval/revocation state, or an
  additional Admin review action. Existing document lifecycle/approval remains.
- AI-inferred URLs or attribution inferred merely from subject similarity,
  publisher reputation, a bibliography entry, or an adjacent unrelated URL.
- Rewriting stored historical answers or retroactively enriching their citations.
- Changing document status, public-QA approval, soft-delete/restore rules, model,
  reasoning effort, provider-call count, retrieval topK/evidence budgets, rate
  limits, or conversation ownership/retention.
- OCR, new file formats, generalized bibliography interpretation without explicit
  references, and a new public original-file download route.
- Running migration/backfill, generating a live AI answer, committing, pushing,
  or deploying as part of this specification task.

## Roles and authorization

Guests, Travelers, and Admins see eligible public QA citations through the existing
assistant flow. Conversation reads/writes retain their current USER/GUEST ownership
checks; Admin has no access to another principal's private history.

Existing Admin document administration remains authoritative. Only nondeleted,
INDEXED, publicQaApproved documents with their current READY publication and valid
embedding provenance can supply new answer evidence. Source links do not confer
download permission for the uploaded document. Backfill is a trusted server-side
operator action; neither a browser nor a client-supplied URL can write source maps.

## Attribution rules

1. Parse the whole extracted document before resolving sources for individual
   chunks. A definition at the end of the file must be available to an earlier
   retrieved section without retrieving the bibliography as answer evidence.
2. In the supplied format, parse `[S<number>] title + URL` entries under
   `DANH MỤC NGUỒN`; associate a section's closing `Nguồn: [S…]` references with
   that section. Respect actual heading identity and boundaries, not title text
   alone. Do not continue the scope into the next sibling section or bibliography.
3. An explicitly narrower paragraph/span attribution takes precedence for that
   span. A section-level declaration remains a section-level attribution: do not
   claim a more precise independently verified per-sentence origin.
4. Other formats may reuse the parser only when existing extraction provides
   unambiguous source declarations and scope. Existing PDF/TXT or unstructured
   DOCX material remains usable through the existing QA path; the public citation
   UI omits its citation when no safe URL is available.
5. Resolve local source codes within the same document content version only.
   Identical `S1` identifiers in two documents must never share definitions.
6. Exact duplicate definitions with the same canonical URL may be coalesced.
   Conflicting duplicate codes, missing definitions, or ambiguous occurrence/span
   matches must not produce a guessed link. The public UI omits unresolved source
   citations; unaffected scopes remain available.
7. Use the original-source title recorded by the document when safe and valid;
   otherwise label the source with its domain. Do not fetch a page title or ask
   the model to invent one. Preserve existing title/locator size constraints.
8. Canonicalize with a URL parser. Preserve path case, meaningful query strings,
   query ordering, and fragments. Do not heuristically strip parameters, rewrite
   domains, or merge distinct article URLs.
9. Only links associated with the evidence supporting an answer part may be
   projected. A document-wide bibliography is not a list to attach to all answers.

## Data and persistence contract

Use additive Prisma migration(s) for derived citation metadata. Exact table names
may follow repository conventions, but the following information and guarantees
are required:

| Derived information | Required identity and contents |
| --- | --- |
| Source registry | Document/content-version identity, original and normalized hashes, source-parser version, local source codes, safe titles and canonical URLs |
| Attribution scopes | Extracted section/segment/span identities, explicitly declared source codes and their range of applicability |
| Chunk bindings | Generation ID, chunk identity/hash and verified segment/span association to the registry/scopes |
| Published metadata bundle | Immutable parser-version identity, complete registry/bindings, and a deterministic hash proving the selected metadata snapshot |

A metadata bundle may be normalized into tables or stored as a validated derived
JSON bundle. It must be independently addressable by generation/content version
and parser version, with database-enforced uniqueness and atomic publication.
Do not expose a partially written registry/binding set as ready for QA.

Existing RagContentVersion rows do not persist raw extraction. Existing chunk
text, refs, locators, hashes, embeddings, and generation identity must not be
rewritten merely to attach metadata: those fields are part of immutable identities.
Derived metadata must live outside those hashed fields. The same parser version
and input identity must reproduce the same metadata; a conflicting replay is an
integrity error, not permission to overwrite an immutable record.

New indexing derives metadata from the extracted document and binds it to the
actual generation's chunks. Unsupported/ambiguous source declarations produce
fallback metadata, not an incorrect successful mapping or a new business approval
gate. Citation-only failures must not make otherwise valid document indexing
unavailable. Persistence failures remain distinguishable from source absence.

## Existing-document backfill

- Provide a bounded, resumable server-side command with dry-run and explicit
  apply modes. Require a verified database target and reuse the registered private
  storage path; never accept arbitrary network URLs to acquire originals.
- Read the existing stored file and extract with compatible recorded versions.
  Verify original-bytes hash, normalized-content hash, generation identity, and
  exact chunk/span/hash associations before attaching metadata.
- Do not assume concatenating stored chunks reconstructs the whole original or
  preserves all source definitions; overlap and omitted structural content exist.
- If exact provenance cannot be reproduced, leave that generation on document
  fallback and report a resumable mismatch. Do not silently upgrade the extractor,
  remap by similar headings, or require the user to upload the same file again.
- Perform no embeddings/model calls, reindex publication swap, original-file
  mutation, approval/status changes, or historical-turn writes in this backfill.
- Publish each generation's complete metadata atomically under the existing
  document/publication synchronization boundary. Recheck the target generation
  and document eligibility after acquiring the lock; skip stale/disabled/deleted
  targets. Retry confirmed-identical work idempotently and reconcile uncertain
  persistence before reporting success.
- A schema migration adds structures only; it must not implicitly fetch storage
  files or run operational backfill. Record migration state and backfill outcomes
  separately for development and production when execution is later authorized.

## QA and public API contract

Preserve the existing public citation shape:

```ts
{ id, sourceId, title, sourceUrl: string | null, locators }
```

Keep response envelopes, outcome schemas, request bodies, routes, and
Idempotency-Key semantics. No new public fields are required for original links;
older strict clients and persisted null-URL responses must remain parseable.

The coordinated server flow is:

1. Retrieve eligible content chunks with the current budgets and pin any matching
   immutable source-metadata bundle. Missing metadata selects document fallback.
2. Preserve existing grounding citation IDs and reviewed-support associations
   during assessment, generation, synthesis verification, and grounding checks.
   Loading more original references must not duplicate evidence chunks, increase
   their budget, or count them as independently retrieved external evidence.
3. Keep original URL registries server-side. Source-definition/URL metadata must
   not become substantive answer evidence or prompt instructions. If a clean
   evidence view is needed, it must exclude only identified source-metadata spans
   through a deterministic projection with original span/hash provenance; never
   broadly strip unsafe prose or relax existing grounding checks.
4. After the answer passes its existing grounding/projection checks, deterministically
   expand each referenced evidence citation into the associated original-source
   public citations. One grounding citation may yield several public references.
   Rewrite only the corresponding citationIds, leaving answer text, status,
   answerMode, unansweredAspects, and presentation unchanged.
5. Assign response-local unique citation IDs; preserve sourceId as the existing
   opaque document alias. Multiple public citations may share it. Original-source
   title/URL are registry-derived. Locators continue to describe the uploaded RAG
   evidence location, not a purported page/heading on the external website.
6. Keep an internal projection proof from every public citation to its supporting
   original grounding citation/chunk, exact metadata-bundle identity/hash and
   source entry. Preserve the old exact-projection verification before expansion
   and perform equivalent deterministic verification after expansion. Do not
   remove verification to accommodate the new URLs.
7. Validate the final public response and complete under the existing document
   eligibility/publication lock, checking all selected source-bundle/binding hashes.
   Store final citation snapshots and the internal projection provenance atomically
   with the completed turn. Internal provenance additions must tolerate old rows.

The backward-compatible document-fallback DTO retains the existing title,
trustworthy locators, opaque alias, and null sourceUrl. The public citation UI
does not render that fallback, its RAG locations, or a placeholder. A metadata
bundle that appears after an in-flight turn selected fallback does not
retroactively change that turn's response. Evidence revocation or integrity
failure during generation/completion follows the existing error and UNKNOWN
handling; it must not commit stale clickable attribution.

No new public mutation endpoint is required. Source derivation/indexing/backfill
writes use deterministic identities, confirmed persistence, and safe identical
retry. Existing user-visible writes retain SUCCESS / FAILED / UNKNOWN.

### URL and public-data boundary

Validate source URLs in their dedicated server-owned fields. Keep the existing
HTTP(S), credential/control-character and 2,000-character URL rules, and reject
private/local addresses, administrative/file/storage destinations, credential or
signed-download references, and unsupported schemes. Check literal destinations
without fetching them. This cannot certify a site's availability or redirects.

Replace the blanket URL rejection only where validated, provenance-bound public
citation URLs are projected. Arbitrary URLs in generated prose, private references,
raw storage paths, document/chunk IDs, and prompt-injection material remain under
existing protection. React renders answer text as text; URLs must not be obtained
by enabling unrestricted model-generated Markdown/HTML.

### Response bounds

Preserve the ask transport's current 128 KiB serialized-response bound, existing
provider limits, and current extraction resource bounds. Measure the complete
UTF-8 response envelope after projection; multiple URLs do not fit into the
four-chunk assumption automatically. If link expansion exceeds that bound,
deterministically use the original document citations for the whole response and
record a content-free size fallback. Do not truncate answer text, silently select
an arbitrary subset of sources, or raise token/network budgets in this story.
If even the original fallback violates an existing bound, retain the existing
technical failure path.

## UX and accessibility contract

- Put numbered references immediately after each factual paragraph/list item.
  For TABLE presentation, use the existing source cell for the same references.
- External references are real anchors opening the validated URL in a new tab,
  with noopener/noreferrer and an accessible name identifying the source and tab
  behavior. Keyboard focus is visible and references remain usable by touch.
- Number by first appearance within the answer; repeat the same number for the
  same canonical external URL. Different local source codes/documents can share
  one displayed external-source entry without collapsing their internal proof.
- At the end, display a single source list using title and domain, in number
  order, replacing the repeated `Nguồn cho ý ...` groups. A repeated URL with
  differing titles uses the first valid title in deterministic reference order.
- Do not show uploaded RAG titles, file labels, page/section locators, or
  placeholders in the public source list. If a citation has no safe public URL,
  omit its inline marker and list entry. If all citations for an answer are
  omitted, show no citation disclosure.
- Preserve current fonts, colors, spacing, chat/sidebar/composer behavior and
  design-system interaction patterns. At 360 px and desktop widths, long titles
  wrap and source entries do not cause horizontal page scrolling.
- Opening or focusing a reference must not steal focus, jump to a new answer,
  or trigger follow-tail scrolling. Preserve existing answer loading, failure,
  unavailable, partial/insufficient-source and retry states.
- Historical responses use this renderer with their recorded metadata. Reading
  or replaying history performs no source backfill and does not add new URLs.

## Invariants and recovery

- Citation destination is metadata attributed by an eligible uploaded document;
  it is not a claim that the external site was fetched or independently verified.
- No extra source-approval state or Admin task is introduced.
- Every emitted reference has server-verifiable evidence/version provenance;
  invalid/missing/unreferenced/foreign citations cannot pass.
- No cross-document source-code matching, mutable old snapshot, or stale
  generation/disabled/deleted-source publication is allowed.
- Missing, unsupported, unsafe or ambiguous source metadata does not produce a
  public citation for the affected scope; the answer can still use otherwise
  eligible RAG evidence. This never makes unsafe substantive content eligible or
  turns missing grounding into a pass.
- Internal integrity mismatches and persistence failures follow existing failure
  semantics; they are not reported as a successful citation backfill.
- Diagnostics use bounded stages/categories/counts for parsing, ambiguity, URL
  rejection, version mismatch, metadata readiness and response-size fallback.
  Do not log document/answer text, full source URLs/query strings, secrets,
  tokens, sessions, raw storage paths, or provider bodies. Add no telemetry service.

## Acceptance criteria

| ID | Observable acceptance condition |
| --- | --- |
| AC01 | The supplied DOCX yields 17 source definitions and 23 section mappings, with every declared code resolved, despite having zero Word hyperlink relationships. Section 16 resolves S1/S5/S7/S9 without retrieving the bibliography as answer evidence. |
| AC02 | Literal text, line breaks and existing extracted hyperlinks are parsed; local identifiers are scoped by document/version. Identical heading text or S1 in another document cannot transfer attribution. |
| AC03 | Conflicting/missing references, repeated sentence ambiguity, malformed/unsafe URLs and unstructured bibliographies never create guessed links; affected citation markers/list entries are hidden in the public UI. Valid unrelated scopes continue to work. |
| AC04 | Existing eligible documents acquire derived metadata from stored files without reupload, embeddings, approval/status changes, or modifications to chunks, hashes, publication or historical turns. |
| AC05 | Backfill verifies exact input/version/chunk identity, supports dry-run, bounded resume and identical retry, publishes atomically, and skips stale/disabled/deleted targets. A hash/version mismatch leaves fallback and a clear operator result. |
| AC06 | Future indexing produces version-bound metadata without an extra Admin approval step. Source-metadata absence/ambiguity does not itself block otherwise valid RAG indexing. |
| AC07 | A supported answer can expose several original links from one evidence section without duplicating retrieved chunks or raising provider/evidence budgets. Answer text/outcome and all grounding/verifier checks are preserved. |
| AC08 | The public citation shape/envelopes remain compatible. Existing null-URL snapshots and old clients parse valid results; old reads/replays never retroactively gain links or invoke source derivation. |
| AC09 | Every new public link exactly matches a safe registry entry bound to its supporting evidence. Model-invented links, mismatched public citation IDs or forged mapping proof are rejected. |
| AC10 | Disable, public-QA revocation, soft deletion, publication replacement or metadata-integrity mismatch during an ask cannot commit stale new-source attribution. Ownership and UNKNOWN identical-key reconciliation remain intact. |
| AC11 | Numbered anchors appear after paragraphs/list items and in TABLE source cells. Reused canonical URLs share one number and one final source-list entry, ordered by first appearance. |
| AC12 | Only safe URL-backed citations appear in the public UI. Citations without a safe URL and all uploaded-file titles/RAG locators are hidden; no placeholder is shown. |
| AC13 | At 360 px and desktop, long titles/domains remain readable; keyboard focus, accessible names, touch controls, new-tab semantics and current scroll/follow-tail behavior work. |
| AC14 | Website fetch/search and additional model calls are absent from derivation/projection; arbitrary prose URLs and private references remain blocked while approved-format citation metadata can render validated HTTP(S) anchors. |
| AC15 | The complete projected ask envelope respects 128 KiB. Overflow falls back to the complete original-document reference set without truncating text or choosing arbitrary external sources. |
| AC16 | New content versions receive independent maps; old answer JSON remains unchanged. All new stored snapshots/provenance are committed atomically and strict legacy snapshot parsing remains valid. |
| AC17 | Existing QA outcomes, RAG eligibility/indexing/delete/restore, table/paragraph rendering and idempotency regressions pass. Logs contain only bounded safe diagnostics and no new telemetry. |

## Test plan

Use synthetic fixtures reflecting the sample's structure for committed tests; the
owner's local DOCX may be an additional read-only parser smoke. Do not depend on
its absolute local path or copy its full authored text into CI fixtures.

| Area | Necessary coverage | AC |
| --- | --- | --- |
| Parser/source registry | 23/17 format, literal URLs/Word breaks, hyperlinks, registry after content, source markers split across runs, empty/unstructured material, duplicate/conflicting IDs, repeated headings, section boundaries, nested scopes and foreign document IDs | 01–03 |
| Attribution/provenance | Source spans and chunk refs, repeated identical sentences, immutable hashes, registry version mismatch, one section to many originals, no fabricated finer attribution | 02,03,07,09,16 |
| URL/public safety | Valid query/fragment URLs, Unicode/punycode domains, unsupported schemes, credentials/control characters, local/private IPv4/IPv6, signed/private storage/admin links, malicious prose and fake model URLs | 03,09,12,14 |
| Persistence/backfill | Additive migration, old rows without metadata, deterministic replay, crash before publication, transaction rollback/uncertainty, exact hash checks, no embedding invocation, stale generation and concurrent disable/delete | 04–06,10,16 |
| QA service/store | Original grounding before server projection, projection proof, rechecks under completion locks, unchanged outcomes/text, null snapshots, GET/history/replay, same-key UNKNOWN and wrong-principal access | 07–10,16,17 |
| Bounds | Many URLs/UTF-8 titles, full-envelope byte accounting, deterministic whole-response fallback and unchanged answer body | 07,15 |
| UI | Inline/list/table slots, first-reference numbering after filtering, repeated URL across documents, omitted null/unsafe URLs, no RAG metadata, empty source states, accessible anchors and historic renderer compatibility | 08,11–13 |
| Browser | Offline controlled fixtures at 360 px and desktop; keyboard/tab order, focus/new-tab link behavior, scroll stability and network observation proving no application-driven source-site fetch/telemetry | 11–14,17 |

Use a disposable PostgreSQL database for persistence/race tests. Source-site
requests and paid providers are mocked or forbidden in focused verification.
Pure parser/read-only sample checks do not validate remote page accuracy.

## Expected modules/files

| Module | Planned responsibility |
| --- | --- |
| `apps/web/src/modules/rag-processing/` | New deterministic original-source parser/contracts; reuse extraction segments and existing DOCX relationship/line-break handling |
| `apps/web/src/modules/rag-index/rag-index-worker.ts` and store | Derive and atomically persist version/generation-bound metadata without changing existing immutable content identities |
| `apps/web/src/modules/rag-document/rag-storage.ts` | Reuse registered private-file acquisition; no public download expansion |
| `apps/web/scripts/` | Citation-only dry-run/apply/resume backfill command with database-target checks |
| `packages/db/prisma/schema/` and `prisma/migrations/` | Additive metadata storage, relations/uniqueness and indexes |
| `qa-retrieval.ts`, `qa-runtime-contract.ts` | Load/pin relevant source metadata and keep it separate from grounding evidence/public fields |
| `qa-service.ts`, `qa-generation.ts`, `qa-public-safety.ts` and a source-projection module | Preserve grounding pipeline; deterministic final reference expansion and field-specific validation |
| `qa-conversation-store.ts`, eligibility helpers | Atomic snapshot/proof persistence and current eligibility/version fencing |
| `qa-contract.ts`, `qa-http.ts` | Preserve public contract; final validation and envelope-size checks at the correct boundary |
| `assistant-citation-utils.ts`, `assistant-citations.tsx`, `assistant-chat.tsx`, `assistant-answer-content.tsx`, citation styles | Inline external anchors, URL grouping/numbering, one final list, omission of missing-URL citations/RAG details, accessibility/layout |
| Focused tests and parent story/progress | Verification and policy amendment evidence |

Route handlers stay thin. Public fields must not contain source-registry IDs,
chunk identities, storage paths or internal projection proof. Exact helper/module
filenames may be chosen during implementation without expanding this scope.

## Migration and environment impact

An additive Prisma migration is expected for derived metadata; old generations
and citation snapshots require no destructive data migration. No mandatory new
environment variables or external credentials/services are introduced. Reuse
server-side storage/database credentials and current runtime eligibility gates.

Apply schema before activating readers/writers and before citation backfill.
Before metadata is available, RAG answers remain readable and the public UI
omits citations that have no safe original-source URL.
For rollback, revert application behavior and leave additive metadata dormant;
do not drop it or rewrite saved answers to roll back UI. No database or deployment
operation is authorized by completion of this spec alone.

## Implementation sequence and checkpoints

1. Implement parser and provenance contracts against synthetic sample-format
   fixtures; verify AC01–AC03 before adding metadata writes.
2. Add metadata persistence/new-index integration and migration; verify atomicity,
   hash preservation and indexing fallback before operational backfill.
3. Add dry-run/apply/resume backfill with exact identity checks; verify AC04–AC06
   on a disposable target. Source-site/model calls must remain zero.
4. Implement server reference projection, safety and completion proof/fencing;
   verify AC07–AC10 and AC14–AC16 before connecting new UI.
5. Implement inline references/final list within current design system; verify
   AC11–AC13 on old and new citation fixtures.
6. Run relevant regression and final verification; record AC evidence and migration/
   operational status. Deployment/backfill execution follows explicit target
   authorization, separate from code completion.

Each checkpoint must pass before its dependents proceed. A mismatch with a confirmed
owner decision requires surfacing the conflict; do not silently change the spec.

## Verification and handoff plan

- Run focused parser/projection/security/UI tests, then relevant QA contract,
  grounding, generation, retrieval/service/store and RAG indexing/lifecycle
  regression. Record PostgreSQL integration runs separately from skips.
- Run `npm run check-types --workspace web` and
  `npm run build --workspace web`. Run focused Vitest from `apps/web` with its
  existing `vitest.config.mts`; use exact implemented file paths in the report.
  No lint script is currently configured; do not claim a lint pass without one.
- Validate/generate Prisma and verify the migration on a disposable schema with
  legacy data and no source metadata; report actual migration state for any
  separately authorized environment.
- Run the offline browser checks in the test table and a read-only sample parser
  check. Verify no source-site/provider/telemetry requests are made by this feature.
- Review the complete diff against AC01–AC17, verify no broad URL bypass, source
  reapproval UI, changed chunk hashes, old-turn rewrite, model/budget change,
  secrets or unrelated edits, and run `git diff --check`.
- Report changed files, exact commands/results, AC-to-evidence mapping, skipped
  checks, unresolved risks, migration/backfill needs and actual deploy status.
  Do not mark IMPLEMENTED/ACCEPTED while required AC lack verification evidence.

## Current acceptance evidence and open questions

Requirement summary: confirmed by the owner. Blocking product questions: none.
Physical schema/helper naming is an implementation detail subject to the contracts
above, not permission to change behavior. App code, tests, migration and backfill:
NOT STARTED. No runtime acceptance or deployment success is claimed.

This specification incorporates the read-only source-structure inspection of the
supplied DOCX. The specification task has modified documentation only.

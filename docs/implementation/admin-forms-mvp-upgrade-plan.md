# Admin Destination and Culture forms — MVP upgrade audit and plan

2026-10-12, TXH. AUDIT/PLAN ONLY: no form/schema/API implementation, migration,
Neon operation, RAG upload/index/allowlist change, provider call or deployment.
The owner's Form A/Form B field lists and constraints are the current task scope.
This work does not extend Lũng Cú or other Hà Giang factual research.

## Baseline and template evidence

Inspected current form components, strict input/DTO schemas, Prisma models,
Culture write/relationship service and RAG upload/review/index boundaries.

- Destination: `apps/web/src/app/admin/destinations/destination-form.tsx`,
  `apps/web/src/modules/destination/destination-contract.ts`,
  `packages/db/prisma/schema/destination.prisma`.
- Culture: `apps/web/src/app/admin/culture/culture-form.tsx`,
  `apps/web/src/modules/culture/culture-contract.ts`, `culture-service.ts`,
  `packages/db/prisma/schema/culture.prisma`.
- RAG: `apps/web/src/modules/rag-document/rag-service.ts`,
  `packages/db/prisma/schema/rag-document.prisma`,
  `apps/web/src/modules/rag-index/rag-index-request-service.ts`,
  `rag-index-store.ts`.

The two locally identified DOCX files are `D:/KLTN/điểm đến hà giang.docx`
and `D:/KLTN/Tổng hợp điểm đến và nội dung văn hóa Hà Giang phục vụ xây dựng
Knowledge Base_RAG.docx`. Read-only OOXML inspection finds populated research
records/a synthesis, not unambiguously the two final blank Form A/Form B profiles.
They were not edited, and their factual content is not adopted or re-researched.
The user's explicit field lists support this gap audit now; exact template files/
versions are a checkpoint before locking mandatory fields and implementation.

## Form A — Destination coverage

| Approved field group | Current implementation | MVP gap / proposed work |
| --- | --- | --- |
| Basic information | name, area, category; HIDDEN/VISIBLE actions | Keep canonical fields and current validation. |
| Description | required plain text, up to 10,000 chars | Keep a single authored description; do not duplicate in a RAG textbox. |
| Coordinates/map | required latitude/longitude numeric inputs | Add a preview/pin confirmation using the existing map stack; synchronize numeric fields and pin, no geocoding/provider call required. |
| Visit durations | nullable suggested/minimum minutes | Keep null as unknown and existing limits; no made-up default minutes. |
| Operating schedule | all seven weekdays, OPEN/CLOSED/UNKNOWN and intervals | Reuse OpeningHoursEditor and its canonical contract. |
| Images | no Destination image model/form field | Add bounded images, order, alt text/caption, attribution/rights; use trusted storage/upload validation. |
| Sources | no Destination source fields | Add source/provenance records rather than a freeform claim of verification. |
| Distinctive culture | not an editable linked-culture section in this form | Present/select linked CultureContent, optionally mark a link featured; do not require retyping Culture content. |
| Related cultural profiles | CultureDestination relation already exists; edited from Culture side | Add the inverse selector to Destination form through the same relationship service/transaction. |

## Form B — Culture coverage

| Approved field group | Current implementation | MVP gap / proposed work |
| --- | --- | --- |
| Title/content | required title and plain-text content, up to 20,000 chars | Keep canonical text as website and future RAG origin. |
| Category | absent from model/schema/form | Add optional legacy-compatible category; final taxonomy from template checkpoint. |
| Localities/cultural regions | absent | Add bounded multiple labels, allowing more than one; do not infer these from destinationIds. |
| Ethnic communities | absent | Add bounded multiple community labels, independent of locality and destination selection. |
| Images | absent | Reuse the same media/provenance behavior as Form A. |
| Sources | sourceTitle/sourceUrl, one optional reference | Retain those fields; add multiple provenance/rights records with a clear primary source for legacy displays. |
| Optional related destinations | destinationIds accepts [], deduplicates and supports up to 100; existing many-to-many relation | Already satisfies optional/multiple links; preserve this behavior. |

A Culture record must remain valid with zero destinations and multiple regions/
communities. Destination visibility is not a Culture requirement and is not a
license/provider-sharing decision. Admin-only relationships may include hidden
records; public projection must continue to enforce existing visibility filters.

## Proposed additive schema changes — not yet implemented

1. CultureContent: nullable category plus bounded locality/region and community
   lists (PostgreSQL string arrays with empty defaults are sufficient for MVP).
   Reuse bounded normalized text labels; no separate taxonomy-management product.
2. Content image records for Destination/Culture: trusted storage reference,
   display order, alt text/caption, source/attribution and rights-review metadata.
   Owner FK/XOR constraints must prevent orphan/multiple ownership; private
   source originals must not become website-public by reuse of private RAG storage.
3. Content source records for Destination/Culture: source title/URL, publisher/
   author, dates, verification status, usage/provider-sharing scope, review evidence
   and reviewer/date. Keep current Culture sourceTitle/sourceUrl as compatibility
   projection until a deliberate later migration; do not drop or overwrite them.
4. Existing CultureDestination may gain a featured flag (default false) if the
   final profile requires distinguishing characteristic culture. Otherwise just
   reuse the relation with no new field. Do not add duplicate Culture narrative to
   Destination merely to populate this form section.
5. Optional RAG domain-origin relation: ragDocumentId, exactly one Destination or
   Culture FK, canonical revision hash and snapshot provenance. Existing uploaded
   documents have no origin relation and remain valid. This makes canonical input
   reusable and lets review/indexing identify which immutable revision it approved.

All schema details require contract/story review and additive Prisma migrations
in a later authorized task. Existing rows keep IDs, text, visibility, schedules,
relations and historical citations. New lists/defaults start empty and new scalar
fields nullable; unknown rights are never backfilled as approved. No migrations
are created or applied by this audit.

## Enter once, review separately, reuse safely

Admin edits the canonical Destination/Culture record once. Website DTOs project
those fields. An explicit action prepares an immutable text snapshot from that
same revision and its approved scope/provenance, then enters the existing RAG
UPLOADED -> REVIEWING -> APPROVED -> INDEX -> READY/publication/INDEXED workflow.
There is no second manual body textbox and no silent copying from external URLs.

Snapshot creation does not approve its facts/rights, index it or allowlist it.
Existing provider-sharing/runtime gates remain. Clicking INDEX can dispatch
embedding calls and therefore requires separate authorization. Live source access
still requires current INDEXED/READY publication and the existing server allowlist.

Editing canonical content cannot mutate an already approved/indexed snapshot. A
new hash requires a new review; prior approved snapshots continue only under their
existing approval until explicitly superseded/disabled. A disable/revocation rule
must be specified in the RAG bridge story rather than letting edits auto-publish
or assuming visibility is approval. Unreviewed revisions never enter retrieval.
Do not change US-22 exact-name isolation, generation model or grounding rules.

## Small implementation tasks in dependency order

Planning labels AF-1..AF-8 are proposed subtasks, not assigned backlog/story IDs.

| Task | Scope | Acceptance / validation |
| --- | --- | --- |
| AF-1 | Lock final DOCX field mapping, required/optional rules, image limits and rights/revision policy. | Owner-reviewed matrix; current records and Culture without destinations remain valid. No factual research. |
| AF-2 | Add Culture category/locality/community contract and migration. | Old records read/edit successfully; zero destinations + multiple labels accepted; invalid/bounded inputs rejected. Disposable DB migration and focused DTO/service tests. |
| AF-3 | Add shared source/provenance storage and server Admin boundary. | Both form types reuse it; legacy single source retained; unreviewed rights never treated as approved. Ownership/idempotency tests. |
| AF-4 | Add shared image records and validated upload/read UI. | Alt/caption/order/rights, failure/UNKNOWN recovery and authorized file ownership; no private-origin exposure. Focused storage/API/UI tests. |
| AF-5 | Upgrade Culture form sections with AF-2/3/4 fields. | Optional destination picker unchanged; multiple localities/communities; no content duplication; mobile/keyboard/error/retry coverage. |
| AF-6 | Upgrade Destination form: map pin preview, AF-3/4 and linked Culture picker. | Numeric/pin agreement, unchanged schedules/null duration rules, shared relation persistence, no duplicated Culture body. Focused map/form/link tests. |
| AF-7 | Add explicit domain revision -> RAG snapshot bridge and origin provenance. | Enter body once; content-hash replay/idempotency; unchanged upload documents supported; new revision needs review; no auto approve/index/allowlist. Mocked provider and disposable DB tests. |
| AF-8 | Verify website projections and combined compatibility. | Existing public records/citations preserved; hidden/unapproved isolation; narrow/mobile forms and new metadata; typecheck/build and broader regression only when integration changes warrant it. |

Out of MVP: bulk DOCX import, rich-text editor, automatic research/translation,
geocoding service, new taxonomy CRUD, image AI generation, auto indexing/allowlisting,
full CMS rewrite, schema cleanup and automatic historical-data repair.

## Current execution readiness

US-22 sidebar UI commit is separate from this plan and every research artifact.
US-22 remains IMPLEMENTED — LIVE ACCEPTANCE PENDING. Its completed Development
migration is not a reason to run migration again. This plan changes no application
code/schema and grants no data/provider/production permissions. Implement AF-1
first after the owner chooses to proceed; independent assigned data research stays
with the other developer.

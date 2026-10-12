# Admin content contracts — owner decision, 2026-10-12

Status: implementation contract for AF-1–AF-6. Physical DOCX files are not a prerequisite. Existing product visibility, authorization and idempotency invariants remain unchanged.

## A — Destination
Existing name/description/area/category, explicit coordinates, independent visit durations, weekly opening hours and HIDDEN/VISIBLE remain. Optional profile adds aliases, short description, address, Google Maps URL, explicit location verification with evidence, ticket price and UNKNOWN/VERIFIED/DISPUTED evidence, suitable visit time, notes, structured areas, linked culture, ordered media and sources. Coordinates are entered by Admin; no inferred location. Changing coordinates invalidates verification.

## B — Culture
Title and original content remain. Category, short description, geographic scope, 0..N Area and 0..N Community records, ordered media and sources are optional. Destination links remain 0..N: an independent culture requires no destination. Areas distinguish LOCALITY and REGION; communities are shared named records. No additional taxonomy hierarchy.

## Shared content and rights
Content is stored once in its domain record. Legacy sourceTitle/sourceUrl remain intact; additional sources store title, URL, author, publisher, date, factual provenance and three independent rights: website, indexing, OpenAI evidence sharing. UNKNOWN is the default. Explicit APPROVED requires evidence and server-attributed reviewer/time. Media store URL/storage reference, accessible alternative text, caption, author, source, website rights, cover and ordered gallery. MVP uses public HTTPS media URLs; no public upload infrastructure or new storage service. Publication does not approve indexing/provider rights. Public projections must exclude review evidence and unapproved media.

## Compatibility and migration
Additive columns/tables/relations only. Nullable text, empty arrays/relations, revision 1, verification false/UNKNOWN, rights UNKNOWN. Old API clients may omit profile; omission preserves existing extended metadata. Providing profile is a full replacement of that profile, with transactional reference validation. Existing source and opening-hour contracts remain.

## RAG boundary — AF-7 separately
RagDomainOrigin reserves an optional domain identity, immutable canonical revision hash and revocation timestamp. No bridge exports, upload, approval, indexing or allowlist mutation are enabled here. An eventual bridge must require all source indexing/provider rights, content review and approved version provenance; check revision and revocation before serving; fail closed on changed/hidden/revoked content; explicitly invalidate linked generations before re-export. Existing independent RAG documents do not become approved from website visibility. Until that separate integration is implemented, these website profiles must not be represented as usable RAG snapshots.

## Owner approvals
Review and approve the migration SQL before applying to Development. Confirm operational website/source/media rights individually. Approve a separate AF-7 integration before enabling domain reuse. No Neon migration or external provider operation is performed by this task.

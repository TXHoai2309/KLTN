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


## Destination UX V3 — approved owner decision, 2026-10-14

Supersedes Destination form/location/write aspects above only. Create/Edit use a V3 payload on the existing endpoints, with omitted fields preserved. New Destination area defaults to `khu vực hà giang`; legacy area/category/short summary/price/geography/Culture/media remain untouched unless explicitly edited. Six approved Destination categories are independent of Culture taxonomy. Description updates derive a plain summary, bounded by the existing 1,000-character contract.

AddressKit runs through a fixed-host server adapter with TTL and text fallback; only the address string persists. Maps supports explicit point coordinates and bounded safe redirects, with a second server check before V3 writes. Places live is disabled. Legacy Admin coordinate/taxonomy payloads remain compatible; V3 rejects client latitude/longitude, verification and visibility fields. The optional `X-KLTN-Form-Version: V3` header requests child IDs; legacy HTTP responses retain their old shape.

Source title changes preserve ID and review metadata. Changing the URL denotes different evidence and clears that source's approval/reviewer metadata; unchanged sources retain it. Explicit deletion is scoped by Destination ownership. No media/Culture/area/opening-day replacement occurs merely because inputs are hidden. Changed schedules retain day IDs and unchanged intervals. No-change Edit performs no business-record update; the confirmed idempotency response may still be stored.

Culture and ticket-price presentation default OFF in one config. Culture API/service/models/data and Destination RAG knowledge remain intact. Direct public Culture routes redirect to Explore. Publishing stays a separate Admin operation; an information region may remain public while excluded from routing.

No migration or new structured location columns. See the V3 story/report for verified Development registry identity, tests and blocked disposable PostgreSQL acceptance.

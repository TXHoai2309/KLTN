# US-09 — Quản trị viên quản lý nội dung văn hóa

## Status

ACCEPTED

## Baseline / scope / references

2026-10-05, clean `TXH`, HEAD `a006fe4 feat(destination): add public destination detail`. Approved tasks128–135, MH-14/MH-15; Product document sections5.6.2,6.8.2,9.13,11.18,13.18; System Specification11.2 and public content rules3.4/3.5. Dependencies: accepted US-06/07/08, shared authorization/idempotency; US-13 public relatedCulture boundary. No new Figma screen inferred.

Scope: canonical Culture persistence, Admin list/create/edit/source/Destination links/visibility, real UI/API, development migration, tests and minimal public Destination summary integration. No public Culture detail, Explore/search/map, Favorite, AI/RAG, media/crawling/import/delete or production deployment.

## Model / source decision

- `CultureContent`: stable cuid `id`, `title` VARCHAR200, `content` TEXT, nullable `sourceTitle` VARCHAR300 / `sourceUrl` VARCHAR2000, `visibility` enum HIDDEN/VISIBLE default HIDDEN, `createdAt` / `updatedAt`. Index `(visibility,title,id)`.
- Source metadata lives on the content: no separate source lifecycle or premature RAG dependency. A source name without URL, URL without name, or absent source is valid. Absence is omitted publicly, never replaced by fabricated provenance. Input fields remain explicit nullable fields; blank strings normalize to NULL. This follows “source information or link” and source display “when available”; URL is not mandatory.
- Prose/title/source trim and NFC, case preserved; title1..200/content1..20000. URL if supplied must be http/https with hostname, no credentials/control/space or executable schemes. No automatic fetching. React escapes text; external source links use noopener/noreferrer.
- `CultureDestination`: explicit many-to-many, composite PK `(cultureId,destinationId)`, reverse index `(destinationId,cultureId)` and both FKs ON DELETE RESTRICT / ON UPDATE CASCADE. Zero/one/multiple links supported; hide/show never deletes links or Destination/history. No permanent-delete API.
- `destinationIds`: valid internal IDs, max100 submitted, deduplicated and sorted; missing IDs400, never silently discarded. Hidden and visible Destinations are both editorial link targets. Generic strict create/edit rejects role/visibility/identity/timestamps/unknown fields.

## API / authorization / writes

| Route | Contract |
| --- | --- |
| GET `/api/admin/culture?page=1` | pages25, `items/page/hasMore`; list omits full body/create metadata |
| POST `/api/admin/culture` | complete strict title/content/sourceTitle/sourceUrl/destinationIds; creates HIDDEN |
| GET `/api/admin/culture/[id]` | explicit complete Culture DTO with linked Destination id/name |
| PATCH `/api/admin/culture/[id]` | complete editable replacement, including relation set; preserves visibility |
| PATCH `/api/admin/culture/[id]/visibility` | strict `{visibility:"HIDDEN"|"VISIBLE"}`; same-state no-op |
| GET `/api/admin/culture/destination-lookup?q=...&page=1` | Admin-only names/IDs, case-insensitive search, pages25; not public discovery |

Thin handlers establish canonical `requireActor(...,"admin")` before input processing; services independently guard and recheck current persisted role in mutation transaction. Guest401/Traveler403, malformed/missing Culture404, invalid data/query400. Forged client body/header roles confer no authority. Private/no-store; same-origin JSON mutations and required Idempotency-Key.

Shared operations `culture:create`, `culture:update`, `culture:set-visibility` scoped by trusted actor. Edit/visibility hashes include target ID. Content, source, relation replacement and successful response record commit atomically. SUCCESS is confirmed DB result; same key/input replays it; changed payload/ID409 FAILED. Known failures rollback all fields/links/response. Unexpected/lost response UNKNOWN retains input/key; explicit reread then identical retry, no automatic write retry or fake success. Records have no TTL/cleanup job (only scoped disposable test records removed during smoke).

## UI / visibility / public integration

Admin `/admin/culture`, `/new`, `/[id]/edit`; Admin UserMenu entry. Reuses existing Destination CSS, section primitives and controlled switch presentation; Culture service/controller/copy remain separate. Desktop table/mobile cards, headings, pagination, loading/empty/error/retry. Content, Destination picker, source and separate status sections; sticky save/cancel, inline accessible errors and bottom-right Sonner. Picker searches existing names, shows selected links with remove controls, checkboxes and paging; no raw ID typing. Ordinary save cannot publish.

OFF→ON direct; ON→OFF native dialog with Hủy/Escape/focus restoration. Confirmed state only; pending and uncertain lock other writes. FAILED retains prior confirmed state/draft; UNKNOWN retains exact attempt with explicit reconciliation/retry. Synchronous shared submission lock prevents double writes. Form uses explicit POST and client preventDefault. Keyboard/tab/switch aria labels and text states retained.

Canonical `culture-eligibility.ts` provides VISIBLE persistence filter. US-13 public Destination select now reads at most20 related VISIBLE Culture rows through the join, only on VISIBLE Destination. Summary allowlist: id/title/excerpt(up to280)/sourceTitle/sourceUrl; no full body, visibility or timestamps. Informative cards have no dead Culture route; only real supplied source URLs may link externally. HIDDEN Culture and unrelated Culture excluded for Guest/Traveler/Admin alike. HIDDEN Destination remains410 with no private content. Hide/show preserves relation and reread observes new state. Maps/full Culture detail remain future stories.

## Migration

Additive `20261005021531_add_culture_content_domain`, generated by development `prisma migrate dev --create-only`, SQL reviewed then applied by `migrate dev` on verified `ep-purple-pond-b3xujb8o`. No DROP/data loss or existing table mutation. Six ledger entries finished, none rolled back; schema up to date. Verified culture_content/culture_destination, enum/default, PK, both restrictive FKs and indexes; auth/Destination/hours/idempotency tables remain. No database config, historical migration, db push or production change. Schema changed YES; Production migration NOT RUN.

## Runtime evidence

Actual existing Admin browser at localhost:3001 / Neon development:

- Created disposable Culture A with test source name, no URL and one Destination via real POST; double-click produced one Culture and one successful idempotency response. Default HIDDEN. Reloaded edit matched title/content/source/link exactly.
- Real edit by Enter changed title/content/source, added safe test URL and a second HIDDEN Destination link. DB and reloaded edit exactly matched; visibility remained HIDDEN. Two links allowed alongside source metadata; existing manual Destination untouched.
- List double-click show → VISIBLE persisted on reload. Escape and Hủy hide cancellation wrote nothing and restored switch focus; confirmed hide → HIDDEN persisted. Edit Space show → VISIBLE and fields/save re-enabled. Total5 responses: create, edit, three visibility transitions. Cancelled draft/removal did not persist; blank title and executable URL inline errors prevented writes.
- Public Admin browser showed only A VISIBLE related, excluding B HIDDEN related and C VISIBLE unrelated. Hide A → refreshed public empty; re-show A → A returned with source. Both joins persisted throughout. Live Guest and authenticated disposable Traveler HTTP/SSR probes confirmed identical public summaries; hidden Destination410. Actual Admin public page supplies no privilege exception.
- All six Admin APIs live Guest401 / Traveler403, including forged Admin header/body; no protected DTO, denied mutations FAILED. Guest admin page redirects with returnTo; Traveler denied page without private data. Actual Admin list/detail/lookup/POST/PATCH/visibility used real APIs.
- Replayed all5 committed browser responses through actual database service with stored trusted Admin ID/test session resolver: SUCCESS/replayed, zero new transaction callbacks. Changed payload/visibility409 FAILED, zero callbacks, one Culture A. This is service replay evidence, not a second browser HTTP replay. Injected known error after a real SQL content/source/link replacement rolled back all fields/links and response record.
- Responsive list/form/public detail360/768/1280: scrollWidth equals clientWidth after actual form/list loaded, not just skeleton. Light/dark inspected; keyboard Enter/Space/Tab, hide Escape/cancel/focus and pending locks tested. Temporary viewport reset and original Dark restored. Browser screenshots outside repo: `D:/KLTN/us09-evidence/`. Lost response/UNKNOWN and database failures are deterministic transport/UI-contract tests; no live outage claimed.
- Scoped cleanup removed A/B/C, their joins,5 responses, two disposable Destinations and their hours; every transient probe Traveler/account/session removed with zero residue verified. Admin identity/name/role/email and preexisting manual Destination snapshot unchanged. Temporary scripts/snapshot deleted; no production/test seed retained.

## Final AC matrix

| Task | Result | Evidence |
| --- | --- | --- |
|128 DB|PASS|Additive development migration, tables/enum/FKs/PK/indexes/ledger verified|
|129 Admin API|PASS|Real list/detail/create/edit, role denial, strict input/missing/error tests|
|130 source/links|PASS|Source-only create; exact edited source/URL and two links, reload; invalid/missing/duplicate and rollback tests|
|131 visibility|PASS|Real show/hide/re-show, separate strict mutation, no-op/replay/preserved links|
|132 list/forms|PASS|Real create/edit/picker/source/validation/cancel, responsive light/dark|
|133 switch/state|PASS|Controlled confirmed status, pending, hide Hủy/Escape/focus, deterministic FAILED/UNKNOWN|
|134 FE/API|PASS|Actual POST/PATCH/visibility → DB → reread; double-submit one record|
|135 tests|PASS|Culture26, Destination61, authorization21, account18, auth36; live role/public/replay/rollback/cleanup|

Final env generation, Prisma format/generate/status, typecheck/build/diff-check and secret scan recorded in ai-progress. No blocker for US-09; no commit/push. US-13 Culture task unblocked; Maps remains US-12 and is not claimed implemented.

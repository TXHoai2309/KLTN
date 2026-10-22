---
version: alpha
name: KLTN Admin RAG
description: Existing Admin utility surfaces for verified indexing progress
colors:
  primary: "#35765c"
  ink: "#192337"
  muted: "#68768c"
  surface: "#ffffff"
  tint: "#edf5f0"
  border: "#dce6e0"
  error: "#ad3131"
typography:
  sans:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
rounded:
  DEFAULT: "8px"
  card: "16px"
spacing:
  card-padding: "26px"
  form-max: "960px"
components:
  button: {}
  card: {}
  progress: {}
---

# Admin RAG design context

## Global assistant correction approved by owner (2026-10-22)

The owner now requests a launcher available across pages, fixes for Send, and a
smaller popup header. This supersedes the earlier Destination-only placement and
discard-on-client-navigation policy below. GlobalAssistantProvider in the root
Providers owns one lazily opened session, portaled to body to avoid editorial
typography and stacking contexts. Ordinary client navigation/minimize preserves
the active conversation and draft; Chat mới adopts the current server-projected
Destination or GENERAL on other pages. Reload has no durable recovery promise.
Hide the launcher on full Assistant/auth routes to avoid duplicate controls;
explicit full-page handoff releases the resolved panel after transferring its
actual conversation ID, draft and mode. Saved chats stay in full-page history.

Header hierarchy is a 14px Trợ lý AI title plus a single-line context disclosure;
full names remain available by keyboard/touch. Existing colors/fonts/citations
remain canonical. Desktop is non-modal; mobile contains focus, makes background
inert, restores prior scroll/focus state, and bounds the composer to visualViewport.
Styles live with the global Assistant, not Destination detail. No new API/schema,
AI provider policy or permission rule is introduced.

## Destination contextual assistant panel approved direction (2026-10-22)

Owner requests that the Destination detail **Hỏi trợ lý AI** action open a compact
right-corner conversation alongside the page. Existing Assistant typography,
semantic theme tokens, lucide icons, citations and knowledge-mode presentation
remain the visual owners. This is an embedded variant, not a new visual system.
The existing full Assistant remains a separate surface; do not embed its sidebar,
full-viewport shell, main landmark or URL synchronization unchanged.

Owner approved Q1–Q7: desktop non-modal right-corner panel near 400×560px with
viewport bounds; mobile full-width tall sheet; pinned Destination heading; compact
messages/composer/suggestions/citations/knowledge toggle and Chat mới, without the
all-chat sidebar. Opening alone sends no AI question. Minimize retains the mounted
chat, draft and request; full-page navigation remains an explicit action once work
is resolved. New page loads start a fresh panel chat; saved history stays available
in the full Assistant. Header Assistant navigation keeps its existing behavior.

Owner also approved Q8–Q9: explicit full-page continuation preserves unsent text
and selected mode without auto-sending; pending/UNKNOWN work cannot be handed off
by simply navigating. New-chat/in-app departure that discards unresolved intent
uses the existing abandonment confirmation; leaving local recovery does not mean
server cancellation. Ephemeral draft transfer must stay out of URLs and durable
browser storage. The full contract is in
`docs/implementation/destination-assistant-popup-contract.md`. On 2026-10-22, FE
implemented the six-ticket breakdown: semantic FAB action, non-modal desktop panel,
responsive mobile sheet with modal backdrop, in-memory one-use handoff adapter,
hidden-state minimize preservation, and principal/context isolation without URL leaks.

## Trip merge and Save recovery (2026-10-21)

Owner-selected Trip UI follows ThaiAnh's existing layouts, CSS/theme tokens and
shared map renderers. US-37 In-trip and revision/draft behavior remain owned by
their existing session helpers. Trip Save uses TripConfirmationSection's server
preview and TripSavePanel's confirmed write; success toast precedes navigation
to `/trips`. Pending/UNKNOWN locks extend to the containing requirement form's
tabs and input handlers, retaining the mounted proposal and identical retry key.
Known FAILED releases that lock. No new palette, font or storage mechanism.

## Assistant original-source citations (2026-10-20)

AssistantCitations owns numbered references after each paragraph/list item and
inside table source cells. AssistantSourceList owns the single final disclosure,
grouped by canonical URL (or document alias for uploaded-material fallback).
Titles and domains wrap; links open a new tab with an accessible name. Uploaded
material references open their local source entry, never the private file.
Secondary locators explicitly describe the RAG document. Existing Assistant
tokens, typography and scroll ownership remain canonical; reading a source
suspends follow-tail. No source approval screen or new theme is introduced.

## Assistant missing-source copy (2026-10-17)

`assistantSourceReply` remains the single owner of completed missing-source
wording, rendered by the existing AssistantTurn paragraphs. For structurally
explicit comparisons or dated admission/hours/event requests, explain only the
limits of this retrieval and do not ask the user to restate a known topic/date.
Verification failure retains distinct wording. PARTIAL uses subject/attribute
notices from the server coverage plan. No new styling, interactive control,
scroll owner or navigation behavior is introduced.

## V4.2 editorial composition (2026-10-16)

EditorialRenderer and resolveEditorialDisplay remain the shared Preview/Public
owners. The V4 projection now consumes the compiler's reading groups, column
count and safe crop. editorial-generative.css extends the existing emg tokens;
it introduces no global theme or font. V1 styling stays independent. A heading
travels with its paragraph; long prose uses at most two balanced columns and
stacks inside previews narrower than 960px. GALLERY and original-ratio mosaics
must not inherit V1's featured-photo crop. Unknown body originals retain the
whole image. Hero uses the existing Cover/Split/Panorama quality plan.

Native OS selects remain EditorialEditor's canonical select owner, including V4
type/palette/rhythm/width controls. Local template conversion is reversible with
Undo and uses the existing edit history, with no native confirmation dialog.
Save, Publish, Rollback, UNKNOWN recovery and useUnsavedChanges keep their existing
owners. Manual prose edits lock the node and detach its canonical reference.
The V4.2 browser harness mounts production Editor/Renderer components with offline
service results and real Destination media, at measured iframe viewports of
390/768/1440px. This is separate from live GPT-6 Luna and published-V4 acceptance.

## Overview

Scope: Task186 indexing panel in the existing Admin document detail. Audience:
Vietnamese administrators reviewing private reference documents. This is a utility
screen: clear persisted status takes priority over new visual decoration. Canonical
runtime styling remains apps/web/src/app/admin/destinations/destinations.css,
rag-review.css and the shared @KLTN/ui Button. This document mirrors existing
values; it does not generate or replace application tokens. Other screens are not
redesigned by this package. UI language is Vietnamese; code/error identifiers may
remain technical. No Japanese localization is requested.

## Colors and Typography

Reuse destination semantic variables including dark overrides. Progress accent
uses destination-green; errors use destination-error. Inherit the application's
Vietnamese-capable sans font. Do not download new fonts or introduce colors for
new states when textual labels communicate them. Technical counts remain text,
never part of a background image.

## Layout, Elevation and Shapes

Reuse the Admin form's 960px content width, 16px card corners and restrained border
and shadow. Controls have a 44px minimum target. The toolbar wraps and becomes a
column below 480px; long error identifiers wrap inside the card. Mobile scroll is
normal document flow. No modal, sticky overlay or new navigation is introduced.

## Components and Motion

Use shared Button, lucide LoaderCircle and native progress. Disable admission
while loading, reading uncertain state, an active request or UNKNOWN job. Keep
read-again available. Spinner is decorative; reduced-motion removes animation.
Each panel uses useId for its heading relation. Status is announced politely;
known errors use alert semantics. Preserve inherited keyboard focus outlines.

## Behavioral contract

POST acceptance is not completion. GET provides persisted progress and job outcome.
Embeddings percentage has a real denominator and is explicitly not total task
completion. Earlier stages remain unconfirmed until database completion evidence.
No provider retry for UNKNOWN. Known failure retry uses a new key; uncertain
mutation reconciliation retains the exact key/payload. QUEUED/expired work offers
explicit targeted resume. Poll serially, cancel on unmount, isolate stale identities,
and refresh document status after COMPLETED. Preserve upload/review actions.

## Verification and boundaries

Browser component harness uses fake HTTP fixtures in a test-only script, never
production imports. Verify 1440px/360px, light/dark, keyboard, no horizontal overflow,
progress, failures, retry, reconciliation, resume, stale response and unmount.
This does not substitute for authenticated Next.js browser/live owner acceptance.
Task186 introduces no new route screen, destructive action or provider credentials.

The premium skill strict audit was run read-only:22 findings (4 unresolved ownership,
18 violations), all in unchanged global/demo/shared UI files. No finding targets
the indexing panel. They are recorded as existing cross-screen debt, not silently
fixed or represented as a repository-wide audit PASS.

## US-22 public assistant context

The public assistant continues to own its existing visual tokens in
`apps/web/src/components/assistant/assistant.css` (assistant-green/ink/line/sage
and existing dark overrides). Destination Detail reuses its public-detail link
style. This is an additive Vietnamese interaction, not a redesign. The assistant
toolbar describes destination/general mode; the current verified destination name
is shown by the labeled context picker. The sidebar displays the same active
context label through shell-local presentation from AssistantChat's controller.
It clears on chat unmount and shows a verification placeholder before resolution;
it does not maintain a second destination selection or persist browser state.

Select/Listbox owner: native HTML select in AssistantChat, including the bounded
server-projected destination choices. Platform popup geometry/appearance is
accepted; no authored popup styling contract. The offline QA harness uses native
select for test scenarios too. Controls wrap at 360px, have 44px targets, visible
focus/hover/disabled styles and textual explanations. Shared AssistantChat owns
the composer and context controls for runtime, SSR and QA. The existing app-owned
abandon dialog handles unresolved attempts; context changes are disabled until
resolution or explicit abandon. Context change starts a new conversation, never
changes a persisted conversation. Passive browsing sets no shared destination
state. Auth revalidation preserves intent and disables sending/retry.

The name is verified at server render and again on ask; selected metadata is not
RAG evidence. No personal history is cached in browser storage. Same-page rerenders
retain context, explicit assistant destination navigation remounts through its
context key. Explicit switch/clear replaces the public destination reference in
the URL; cached page trees reconcile it using server-projected choices. Full reload
retains only the URL's selected context (US-21 history
restoration remains outside scope). Verify React StrictMode, browser back, switch,
clear, UNKNOWN, auth revalidation, mobile and keyboard using the offline fixture.


## US-23 source status presentation (2026-10-12)

AssistantAnswer remains the shared status owner for runtime and fixtures. Missing
verified evidence is a completed conversation result: show the requested plain
Vietnamese notice and guidance to adjust the existing composer, with no answer
parts/citation controls. Partial answers show supported content and the separate
missing-data notice. Technical failures keep the existing pending error/edit
flow; UNKNOWN keeps same-key retry and abandon behavior. Reuse current assistant
CSS typography, spacing, muted text, wrapping, live status and native context
picker; no new design tokens, modal, menu or page layout. Offline browser verified
390x844 without horizontal overflow and desktop; missing source, technical failure,
edit/resubmit and follow-up retain context and sidebar behavior. Live acceptance
is distinct from this mocked-transport UI evidence.


## Destination V3 Simplified MVP (owner-approved, 2026-10-14)

Vietnamese Admin data entry, four natural-height sections, no long sidebar. Reuse the existing af-root/admin-form-shell semantic tokens (including dark overrides), labels, cards, focus and sticky actions; no new theme/font/framework or generated token owner. The signature is a single concise Destination dossier with location confidence visible beside the Maps link. Category is a native OS-owned select; commune search plus native select keeps administrative identity separate from address text. Single prose textarea is resize-none/auto-grow with a read-only derived summary and shared simplified preview. Source rows expose title/HTTPS URL; backend owns IDs/review metadata. Existing media and historical metadata survive saving.

Canonical owners: DestinationForm and destination-v3-form-model for Create/Edit draft/patch; shared AdminField/AdminValidationSummary/focusFormError for errors (including source and opening-time controls); Sonner for feedback; useUnsavedChanges for app-owned HTML dialog and narrow beforeunload lifecycle guard; OpeningHoursEditor for the existing independent seven-day schedule; destination-maps-field/address-field for fenced async states. Native popup geometry is deliberately platform-owned. Backend V3 schemas/services remain authority for authorization, validation and persistence; missing required data never becomes a pass.

Create success goes to the new Admin Edit route, per V3 specification; Edit success stays editable with the confirmed DTO/baseline and success feedback. This named V3 variant supersedes the older Destination return-to-list flow; Culture behavior remains its existing variant. Publication remains separate and is disabled with unsaved changes. UNKNOWN freezes draft/key and offers exact retry; provider failure preserves legacy data. Location query/commune edits do not run arbitrary source fetches or RAG ingestion. One Culture flag hides independent module entry points without deleting records; two remaining Home cards retain a balanced grid.

Evidence: test-destination-v3-ui.mjs mounts production components/services on isolated disposable in-memory data and blocks external browser traffic. It covers Create/Edit/preview, no-change snapshots, exact UNKNOWN retry, loading/errors/stale Maps, AddressKit fallback, unsaved dialog/Escape, exact first-error focus including hours, native category popup and360/390/768/1440 light/dark screenshots. This is not live authenticated Neon/Google/PostgreSQL acceptance; those gates are stated separately in the V3 report.

## Destination V3.2 optional images (2026-10-14)

The owner-requested image section extends V3 from four to five sections, between
planning information and sources/publication. DestinationImages owns the shared
Create/Edit queue, preview, per-file status, keyboard picker/drop alternative and
metadata controls. It inherits af-root tokens and dark overrides; no new palette,
font, modal, select or scroll container. Two-column media cards collapse to one
column at 600px. File sending progress is labeled separately from server verification.
Existing Admin fields, form validation, unsaved guard and Sonner remain canonical.

Metadata/cover/order/unlink changes use the form's explicit Save and preserve IDs;
upload and evidence-backed rights review are separate confirmed writes. Create
persists HIDDEN before any provider call, then uploads sequentially. Partial failure
retains pending File objects in an in-memory handoff to Edit; successful files are
skipped on retry. Refresh cannot restore local Files. Review UNKNOWN preserves its
key/decision and blocks the main Save until reconciliation. Publication remains
separate. Server-only credentials, byte validation and approved-only public reads
are owned by destination image services, never by UI state.

Explore uses the approved cover selection and a shared image fallback; public
gallery uses PublishedMediaImage for provider failure without changing legacy URLs.
The existing Admin premium manifest remains the native Select/Date ownership
record. Browser evidence is 17 isolated groups with synthetic provider/persistence,
360px and desktop light/dark screenshots; no live Cloudinary or authenticated
Neon write claim. PostgreSQL concurrency evidence is separate and disposable.

## Traveler trip date presentation (2026-10-17)

Vietnamese trip UI displays date-only values as `dd/mm/yyyy` through `src/lib/date-only.ts` without timezone conversion. The reusable `VietnameseDateInput` is the typed date owner for the shared StartDateEditor in the creation and review flows. It deliberately uses a text input with a written format/example rather than an OS-owned calendar popup whose closed format depends on the user's browser locale. Valid complete entries become canonical ISO `yyyy-mm-dd` in existing form state; incomplete/invalid text stays visible for the existing field validation. Clearing remains optional at the preliminary step. API schemas, confirmation rules and date-only persistence remain ISO. Extraction cards, review values/announcements and preliminary itinerary summary/day tabs use the same formatter. Existing trip form tokens, labels, focus/error associations and natural-height mobile layout remain the styling owners; no new theme tokens or calendar dependencies.
## Destination V3.3 editorial (2026-10-14)

Destination .dv3-page owns the approved full-width #EDF5EF exterior, white cards,
#287651 primary, #DCE7DF border and #162B20 ink. Dark overrides are scoped there;
Header/Explore/Culture tokens remain unchanged. Save actions stay in normal flow
with a header shortcut, avoiding covered fields. Editor actions are sticky on
desktop and normal flow on mobile. Cards use the existing af controls/feedback.

EditorialEditor owns draft/undo/UNKNOWN state and native OS template/gallery/crop
selects; the existing useUnsavedChanges guard and Sonner remain canonical. The
service owns revisions/review/publication. Missing migration disables persistence
only. Read-again requires explicit discard of unsaved changes. EditorialRenderer
is the shared preview/public owner. Nature uses broad mosaic/landscape rhythm,
Heritage serif/reading measure, Village paired captions and Journey staggered
gallery/maps/facts. Each has panorama, split and centered editorial hero variants.
Magazine tokens are local emg variables; no new global font/theme owner.

Only strict JSON/text is stored. Current rights/provenance are filtered at render.
Pictures reserve ratios, use bounded Cloudinary transformations, eager hero/lazy
secondary loading and fallback. No-photo typography has no empty photo slots.
13editorial browser groups and17V3.2 groups exercise five viewport widths/light-dark
with synthetic media/map. The previously loaded premium audit script disappeared
after plugin changes; its invocation failed file-not-found, not a static PASS.

### Owner-approved article art direction (2026-10-15)

Audience: Vietnamese readers discovering a Destination, with a separate Admin
composition workspace. The article should feel like a considered travel feature:
landscape opening, a measured title, readable prose and alternating photographic
pauses. Avoid oversized dashboard headings inside the preview and repeated card
boxes around every paragraph. The signature is a wide landscape with an inset
paper title, followed by an intimate reading measure; split and centered openings
remain available when they suit the material.

Runtime owner remains components/editorial/editorial.css and EditorialRenderer,
shared by preview and public. Local design tokens are --emg-* only. Forest uses
#183126 ink, #60766a muted, #39654e accent and #edf5ef tint on white paper. Stone
uses #263945/#576c79/#44697e/#edf2f5; earth uses
#493c31/#756455/#885d3b/#f4efe9. Each has explicit dark overrides. These expressive
article palettes do not change Admin semantic status or brand tokens.

Lora with the Vietnamese subset is self-hosted by the existing next/font pipeline
through --font-editorial-serif (literary headings/lead); Geist through
--font-geist-sans is the modern heading option; Be Vietnam Pro through
--font-be-vietnam is the humanist heading and canonical body/control face.
Typography never accepts arbitrary font URLs. Heading scales use article cqi,
not window vw; body measure is 64ch, lead 51ch, line height 1.75–1.9. Reading gaps
are 48–112px immersive or 32–64px compact, with 24–112px responsive gutters.
No decorative animation or invented quote/section copy. Keep the no-photo
typographic composition, reserved image ratios, bounded delivery and fallbacks.

EditorialEditor retains canonical af controls, native OS select popups, Sonner,
useUnsavedChanges, explicit Save/Publish and exact UNKNOWN recovery. New font,
palette and rhythm selects share that native ownership. AI respects selected
family/variant by default; an explicit checkbox permits a new direction. A manual
family/variant change clears that permission. AI loading belongs to the AI button;
fallback leaves the current local draft intact. Undo covers successful proposals.
Optional design enums extend v1 JSON without altering old IDs, URLs or content.

### V3.5 content and composition quality

EditorialRenderer consumes a read-only presentation projection. Long or duplicated
headings are removed from the visual heading slot while their complete prose stays
available; exact repeated paragraphs are suppressed only in the rendered article.
Near duplicates remain visible and are flagged for Admin review. No database text,
Destination facts or media references are rewritten to improve appearance. AI
headings/decks must come from the existing block or Destination source, may only
recompose narrative blocks, and cannot hide populated data or add CSS/fonts/facts.
The same projection and renderer serve Admin preview and public published articles.

Image arrangement uses verified Cloudinary source dimensions to prefer a suitable
landscape cover and warns the editor about missing or small originals. Gallery and
split compositions keep intrinsic aspect ratios and reserve their space. These
quality rules are documented in the [V3.5 implementation report](docs/implementation/destination-emagazine-v3-5-design-quality.md).

### Premium E-Magazine Hero (2026-10-15)

The article is a Vietnamese travel feature; the editor remains a utility workspace.
Keep existing emg semantic tokens as the runtime owner: forest ink #183126, muted
#60766a, accent #39654e, tint #edf5ef, line #d9e5db and white paper, with existing
palette/dark overrides. Display uses the selected self-hosted Lora, Geist or
Be Vietnam Pro; body/captions retain the existing Vietnamese sans. No global theme
or font changes. Article-relative container units size titles in narrow previews.

HeroPanorama owns a landscape opening with a left-aligned title and location
colophon beneath it. HeroSplit owns a 44/56 title/photo composition, stacked on
mobile. HeroCover owns a centered masthead and central photograph. The signature
is the landscape-to-colophon transition; do not introduce ungrounded cover lines,
decorative issue numbers or text over photographs with unknown contrast.
Hero-specific rules have one owner at the end of editorial.css; family styling
and the rest of the article remain independent. Width/ratio/focal values derive
from actual media metadata and Admin settings, never from the Destination name.

EditorialRenderer/EditorialPhoto are shared by Preview and Public. Optional V1
JSON hero settings decouple the opening from the article variant, retain manual
composition/focal locks, and do not require a database migration. Native OS-owned
Hero select extends the editor's existing select contract; labels, disabled,
keyboard, Save/Undo/UNKNOWN semantics remain the existing owners. Low-resolution
originals never grow beyond source width; small Panorama sources use a read-only
Cover fallback with an Admin note. The stored composition and asset remain intact.
No-image openings use typography without an empty image region. The AI selection
gate preserves manual locks and source eligibility; failed proposals do not apply.

Evidence: test-editorial-premium-hero.mjs renders all compositions in a real browser,
with a matched pre-change working-tree baseline, six fixture cases and an optional
cached read-only Owner snapshot. Real Cloudinary image reads are separate from
synthetic fixtures; no upload, deletion, datasource write or real model request.

### Editorial AI rate-limit feedback (2026-10-15)

EditorialEditor keeps its existing controls and feedback region. A refused AI
action preserves local work, distinguishes application admission from provider
limits, and uses only a valid server Retry-After to disable the AI button with
a countdown. Editing and Save remain available. Expiration enables explicit
retry without dispatching a request. Missing/invalid timing never creates a
fictional wait. Reuse af-helper/status typography and existing disabled styles;
there is no new palette, overlay or navigation owner. Owner removed application
request quotas in Development and Production. Only active work is bounded: one
action per Admin and four actions per server process; completion/failure releases
the slot immediately. Duplicate/busy responses use 409/503 without a guessed wait.
Only provider 429 may carry a provider Retry-After cooldown and safe error code.

### Editorial V4-only workflow (2026-10-16)

Owner retired alternative generation and the V3.6 template controls. The sole AI
action is “AI dàn trang”, requesting Layout DSL v2. New unsaved layouts start in
V4. Keep typography/palette/rhythm/width controls, manual locks, exact Undo,
unsaved-change guard and explicit Save/Publish. Existing V1 data still renders
without automatic conversion or persistence; no version switch or template
regeneration is exposed. Reuse existing af controls and feedback; no new styling
system. Temporary screenshots/harness output belong outside the repository.

The Owner also removed the travel preparation panel from editorial Preview/Public.
Keep Destination metadata and canonical narrative intact; old VISIT_INFORMATION
nodes stay storage-compatible but do not render. New V4 generation omits them.

### Editorial reading scale (2026-10-16)

Owner requested a calmer reading scale. Shared editorial.css owns body text at
16–17px / 1.75, lead text at 17–20px / 1.7 with a 42rem cap and 62ch measure,
and section headings at 20.8–30px. Reduce the decorative initial to 2.4em and
Split Hero titles to 32–57.6px (mobile Hero 30.4–44.8px). Keep article-relative
container sizing, intrinsic image proportions and browser zoom accessibility.
Preview and Public use the same scale; no stored layout/data conversion.

### Editorial body alignment (2026-10-16)

Owner requested one straight body rail, including the lead, prose, image/text
rows, maps and references. editorial.css owns --emg-reading-width:48rem with
existing responsive gutters. Each root body section shares its left/right edge;
nested V4 wrappers add no gutter. Prose fills its assigned column, paired media
and copy align at the top, and featured prose no longer adds a left inset.
Hero remains the distinct article opening. Do not justify text or stretch/crop
images to force equal heights; preserve natural reading and photo proportions.

## Assistant answer presentation and follow-ups (2026-10-17)

Owner requested completion of the chatbot improvement plan. This extends the
existing Vietnamese assistant shown in the owner's screenshots; no new page
frame or visual identity is introduced. Runtime token ownership remains
components/assistant/assistant.css: assistant-green, ink, muted, line, card and
sage with existing dark overrides, and the existing Vietnamese body font.
AssistantAnswerContent is the shared presentation owner: complete verified parts
render as paragraphs, semantic list items, or a two-column comparison table with
fixed UI headers. Per-part source mappings use the existing AssistantCitations
owner inside one answer-level native disclosure, closed by default at the owner's
request. Tables keep compact source numbers; paragraph/list answers read without
repeated source pills. The disclosure exposes each part's real sources on demand.
Emphasis wraps only an existing short colon prefix; all original factual text
stays present. No Markdown, raw HTML, generated link or extra factual heading.
The table owns its horizontal overflow; it does not change the transcript's
vertical scroll owner or the composer. Header controls wrap on narrow screens.

The disclosure's label is “Xem nguồn (n)”; keyboard/touch can open it and each
existing source card. An open/focused disclosure pauses tail-following like an
open citation. Invalid registries show the existing source error and no source
controls. This is presentation only, with no extra source text, provider call,
storage or weakened backend grounding. PARTIAL stays visibly incomplete with its
missing facets. Clarification displays its direct question without a status heading.

AssistantChat keeps the existing confirmed-turn controller and native OS context
select. At most three template follow-ups derive from the latest confirmed
supported answer. A button only fills/focuses the composer; sending remains the
normal explicit action. Suggestions are transient, absent for unsupported results
or unresolved attempts, disabled during auth revalidation and while a draft is
being written, and never erase that draft. Optional presentation/reason metadata
keeps old history valid. PARTIAL uses fixed missing-aspect notices; a failed answer
verification has distinct public copy without exposing internal verdicts. Existing
SUCCESS/FAILED/UNKNOWN, ownership and same-key retry behavior remain canonical.

An optional SOURCE_EXCERPTS result visibly states that its content is quoted
verbatim from reviewed documents. It is a distinct exact-source answer, never
the rejected synthesis or a claim that all synthesis gates passed. Server rules
exclude explicit/inherited current-time requests and failures of relevance,
coverage, entity, time or numeric gates. Missing source data stays unresolved.

Verification owner: scripts/test-assistant-improvement.mjs mounts production
components with an isolated fictional transport, blocks external network traffic,
and exercises mobile/desktop, themes, keyboard, sources, suggestions, failure,
slow response and UNKNOWN. This browser evidence is separate from actual Luna,
approved-source recall measurements and independent corpus acceptance.

### Missing-source conversation (2026-10-17)

Owner requested useful natural replies when there is no supported answer.
AssistantSourceReply owns this presentation: two ordinary paragraphs compose a
known reason and a fixed topic from the admitted question. NO_EVIDENCE says this
search did not find suitable material; MISSING_SUPPORT/legacy replies say support
is insufficient; ANSWER_VERIFICATION says related material was found but the
answer was not verified. No warning heading/card, invented source, factual answer,
automatic follow-up or extra provider call. Existing technical failure and UNKNOWN
controls remain separate. Each paragraph keeps existing body typography, with
12px between paragraphs through assistant.css; no new palette/token owner.

Topic detection only selects authored copy and never echoes arbitrary user/source
strings or treats a question premise as a fact. Context may mention price, opening
hours, designation, geology, culture, accessibility or location. Generic/old turns
remain understandable without a question or reason. Factual parts, stored DTO
message, status, history validation and evidence requirements remain unchanged.


## Admin Users backend integration (2026-10-17)

Preserve the Phase 1 CMS layout, users.css palette/type/radius, native filter
selects and existing statistics/table/mobile-card/detail/timeline owners. Default
runtime uses HttpAdminUserDataSource in both environments; fixtures are test/demo
only. Server-confirmed mutations stay on the current screen and refetch detail,
statistics/list and audit. Failures remain in the dialog; UNKNOWN freezes its
payload and reconciles with the same key after re-reading state. No visual token
or landing/header redesign is part of this change.

CMS confirmations reuse the existing Destination/Editorial native modal-dialog
pattern with Phase 1 content classes, unique accessible IDs, initial Cancel
focus, explicit Tab boundary handling, Escape/backdrop Cancel and focus restore.
Pending/UNKNOWN actions cannot dismiss the dialog. Revoke now uses the same
confirmation owner. Tables use bounded server pagination and NFC case-insensitive
search with stale-response protection; audit uses bounded Load more. Runtime
status choices are ACTIVE/LOCKED only. Session details omit IP/token, show actual
active counts and at most twenty recent active sessions. lastLoginAt remains
unrecorded, never derived from updatedAt.

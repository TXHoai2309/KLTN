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

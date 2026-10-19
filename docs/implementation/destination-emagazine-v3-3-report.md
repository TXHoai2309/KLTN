# Destination E-Magazine V3.3 — implementation and verification

2026-10-14. Code checkpoints implemented in D:/KLTN/KLTN, on TXH. Shared database
activation and live authenticated/provider acceptance remain pending.

```text
TASK=DESTINATION_EMAGAZINE_V3_3
STATUS=IMPLEMENTED; SHARED_MIGRATION_AND_OWNER_ACCEPTANCE_PENDING
BRANCH=TXH
REMOTE_BASELINE=b79ebe2b06ebd05c0b0f5ff320d5f671076e7002 (origin/TXH local ref)
LOCAL_HEAD_BEFORE=b79ebe2b06ebd05c0b0f5ff320d5f671076e7002
LOCAL_HEAD_AFTER=b79ebe2b06ebd05c0b0f5ff320d5f671076e7002
WORKTREE_STATUS=Initially clean; task-only modified/untracked code and docs; nothing staged

ADMIN_GREEN_UI=IMPLEMENTED; scoped full-width #EDF5EF/white cards and dark tokens
CREATE_EDIT_UI=IMPLEMENTED; existing AddressKit/Maps/Cloudinary/source/write semantics retained
LAYOUT_ENGINE=IMPLEMENTED; strict bounded data schema and shared renderer
TEMPLATE_FAMILIES=4; NATURE_SHOWCASE/HERITAGE_STORY/VILLAGE_CULTURE/JOURNEY_EDITORIAL
LAYOUT_VARIANTS=12; three real hero/content compositions per family
AUTO_LAYOUT=IMPLEMENTED; deterministic category/prose/approved count/cover/trusted ratio/data-aware
EDITORIAL_EDITOR=IMPLEMENTED; /admin/destinations/[id]/editorial
MANUAL_CUSTOMIZATION=Template/variant; add/remove/hide/reorder; media/gallery/title/prose/caption; crop/focal; timeline/quote sources; desktop/mobile preview; undo/discard
DRAFT_PUBLISH_ROLLBACK=IMPLEMENTED; explicit review/publication; separate snapshots; previous published rollback and restore draft
POSTGRES_PERSISTENCE=IMPLEMENTED; real disposable PostgreSQL verified; shared activation pending
AI_LAYOUT_ASSISTANT=IMPLEMENTED; Admin button only; optional explicit model; strict layout-only proposal and deterministic fallback
PUBLIC_RENDERER=IMPLEMENTED; published-only; current APPROVED media/source filter; standard detail fallback
CLOUDINARY_COMPATIBILITY=PASS offline/disposable/browser; upload code unchanged
RAG_COMPATIBILITY=PASS full offline regression; no module/origin change
TRIP_PLANNER_COMPATIBILITY=PASS full offline regression; no planner/validator/Routes change
LEGACY_DESTINATION_PRESERVED=PASS snapshots; Editorial does not change prose/media/rights/source/visibility

SCHEMA_MIGRATION=Additive 20261014120000_add_destination_editorial; disposable PostgreSQL tested
MIGRATION_APPLIED_TO_SHARED_DB=NO
TYPECHECK=PASS; npm run check-types, four workspace tasks
UNIT_TESTS=PASS1194Vitest/89gatedPGskips +328legacy; new editorial28tests
POSTGRES_TESTS=PASS18/18; fiveEditorial+nineV3+fourV3.2; owned loopback container cleaned
BROWSER_TESTS=PASS13editorial groups +17V3.2 groups; production UI with isolated fixtures
VISUAL_QA=PASS scoped fixture matrix; five widths x light/dark;12family/variant layouts; DOM checks and direct screenshot review
BUILD=PASS local npm run build; not deployed
DIFF_CHECK=PASS; CRLF notices only

FILES_CHANGED=See file map below
BLOCKERS=Owner must apply additive migration to approved shared environment before persistent editor use there
KNOWN_LIMITATIONS=One previous published snapshot; native selects; accessible up/down instead of drag reorder; explicit compatible AI model required
REMAINING_RISKS=Live Admin3010/provider/model not tested; no native screen-reader/Figma audit; premium static auditor unavailable after plugin removal
SCREENSHOT_ARTIFACTS=apps/web/.cache/editorial-v3-3/ and apps/web/.cache/destination-v3/
MANUAL_ACCEPTANCE_PENDING=YES; shared migration and local authenticated smoke
COMMIT_STATUS=NOT_COMMITTED
PUSH_STATUS=NOT_PUSHED
DEPLOY_STATUS=NOT_DEPLOYED
```

## Functionality actually implemented

Create/Edit keeps five sections, searchable AddressKit, Maps resolution, Cloudinary,
source management, HIDDEN creation and PATCH semantics. Full-width green exterior
and white cards are scoped to Destination; Header, Explore and other Admin CSS is
unchanged. Save stays in normal flow with a header jump link so it cannot cover
fields. Desktop editorial actions are sticky; mobile actions are normal-flow.

Separate Admin editorial editor supports all13block types, template/variant choice,
auto/AI proposals, show/hide/add/remove/order with accessible up/down, photo roles,
caption/prose/title, gallery, crop/focal, provenance-backed quote/timeline, Desktop/
Mobile preview, undo/discard, durable draft Save, explicit reviewed Publish,
restore Published into draft and rollback to the previous Published snapshot.

Auto layout uses category, paragraph length/structure, approved photo count, cover,
trusted versioned Cloudinary dimensions and real visit/map/source data. Zero photos
is typography-first; one photo occurs once; larger sets use splits/grids/mosaic.
Nature uses broad panorama/mosaic; Heritage editorial serif/narrow reading rhythm;
Village paired captioned images; Journey staggered strip/maps/facts. Each offers
PANORAMA (image before title), SPLIT (title/photo columns) and EDITORIAL (centered
title, inset hero). Browser checks three distinct desktop hero geometries per
family. Supplementary Admin prose/quote/timeline survives regeneration; a full
manual layout is preserved rather than truncating authored material. No random
render, invented timeline/quote/fact or private metadata as narrative.

EditorialRenderer is shared by real preview/public and supports HERO, INTRO,
TEXT_SECTION, IMAGE_TEXT_SPLIT, FULL_WIDTH_IMAGE, IMAGE_GRID, IMAGE_GALLERY,
HIGHLIGHT_FACTS, TIMELINE, QUOTE, VISIT_INFORMATION, MAP, SOURCES. Empty/hidden/
ineligible blocks are filtered; canonical visit information remains readable even
when its dedicated block is omitted. Favorite/Assistant CTA remain in the old
shell. Legacy/no-published/invalid-layout pages retain the standard detail page.
Bounded Cloudinary delivery transformation, eager hero, lazy secondary photos,
reserved ratios and image-error fallback protect loading/layout. Legacy URLs stay.

## Persistence and safety

DestinationEditorial is additive, keyed to Destination with restrictive FK. It
stores schemaVersion, JSON template/layout and media/source references, draft,
published, previousPublished, draft/published revisions, fingerprint, timestamps
and trusted update/publish actors. This supports one previous published snapshot,
not unlimited history. No Destination ID/RAG origin changes or upstream prose,
media, rights/source deletion. Prisma Client was generated locally.

Writes establish persisted ADMIN before body read and recheck inside transaction.
Strict bounded same-origin Zod JSON never becomes executable HTML/JS/CSS. Durable
idempotency and advisory locks preserve exact UNKNOWN retry; expected draftRevision
rejects stale writers. SAVE validates references; PUBLISH/ROLLBACK require explicit
review plus current approved photo/source ownership. Quote/timeline needs supplied
provenance. Publication never makes HIDDEN VISIBLE or changes Destination revision.

Draft is never public. Every public read resolves only published snapshots against
current rights: revoked/removed/foreign/unsafe media is omitted. Internal evidence,
reviewers/storage references/draft metadata are not projected. No public AI call.
Missing table yields an explicit owner-migration blocker in Admin but usable
preview/auto; public uses standard detail. Schema activation on Neon is pending.

The migration CREATEs only the new table, FK and revision checks. No db:push/shared
migration was run. Existing SQL plus this migration were installed into a unique
loopback labeled disposable pgvector container; unused PostGIS is omitted because
that image lacks the extension. Domain schema and real transactions were tested;
the container was removed after ownership verification. No shared Neon write.

## Optional OpenAI

Reuses the server structured Chat Completions adapter and the verified
[official Structured Outputs contract](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).
Optional internal OPENAI_EDITORIAL_MODEL has no default; uses existing server key.
No actual model/account/billing selection or paid API call was performed.

AI receives approved photo IDs and bounded supplied block title/prose, no private
rights evidence or RAG document. It can arrange known IDs/family/variant/placement
and extract exact supplied title substrings. Facts/text/source values are preserved.
Hallucinated titles, unknown IDs/keys, duplicate/foreign media, HTML and malformed
JSON fail validation. Nothing is automatically saved/published. Provider/config
failure keeps deterministic/manual use available; only button click calls AI.
Durable budget3/minute and20/day per Admin;15second request timeout,1200output
tokens,24KB response limit and at most one existing-adapter transport retry.
Actual adapter was tested with mocked HTTP; real provider smoke is owner-only.

## Verification actually performed

Commands: npm run db:generate --workspace @KLTN/db; npm run env:generate --workspace
web; npm run check-types; npm run test; npm run build; git diff --check. Browser
commands from apps/web: node --import tsx scripts/test-destination-v3-ui.mjs and
node --import tsx scripts/test-destination-editorial-ui.mjs. PG command from root:
node apps/web/scripts/test-destination-images-postgres.mjs.

28new editorial unit/HTTP/adapter tests cover0/1/2/4/8/20photos, all families/variants,
short/long/segmented prose, supplementary content, deterministic regeneration,
no repetitions, revoked rights/sources, provenance, malicious JSON/HTML, bad AI,
401/403 before body read, missing-table fallback and fake-HTTP structured adapter.
Full regression covers auth, Maps, AddressKit, Cloudinary, RAG and US24–US28.

Five real editorial PG tests prove durable Save/refresh, draft/public separation,
explicit publication, rollback/restore, replay, concurrent revisions, media/data
preservation, HIDDEN isolation, invalid references and revoked public media. Combined
with nineV3/fourV3.2 tests:18PASS, no skipped tests in that disposable invocation.

13editorial browser groups verify Save/refresh/reorder/publish/rollback, AI fallback/
invalid result, exact-key UNKNOWN, undo/add/edit/remove, conflict preservation,
missing migration, keyboard,12real layouts and photo failure.17V3.2groups retain
AddressKit/Create/Edit/upload/rights behavior. Viewports360/390/768/1024/1440 were
rendered light/dark. DOM checks assert overflow, photo count, distinct hero geometry,
full-width root/card colors and normal-flow form actions. Magazine maps are mocked
for visual isolation; existing map tests retain lifecycle coverage. No live provider,
Neon session, screen-reader or native-Figma comparison is claimed.

139editorial PNGs (including contact sheet) and Create/Edit images are in ignored
cache folders. Direct review covered Nature desktop panorama,360dark editor,
family contact sheet and Admin1440light. The initial legacy suite failed because
CSS was imported through a component tested under Node; CSS was moved to app/editor
entry boundaries and the full suite passed. The prior premium auditor disappeared
after session plugin changes; recorded invocation failed file-not-found. No static
premium PASS is claimed. Browser/DOM/visual evidence is independent of that tool.

Representative screenshots:

- apps/web/.cache/editorial-v3-3/editor-360-dark.png
- apps/web/.cache/editorial-v3-3/editor-1440-light.png
- apps/web/.cache/editorial-v3-3/NATURE_SHOWCASE-PANORAMA-1440-light.png
- apps/web/.cache/editorial-v3-3/HERITAGE_STORY-EDITORIAL-1440-light.png
- apps/web/.cache/editorial-v3-3/VILLAGE_CULTURE-SPLIT-1440-light.png
- apps/web/.cache/editorial-v3-3/JOURNEY_EDITORIAL-EDITORIAL-1440-light.png
- apps/web/.cache/editorial-v3-3/photos-0-1440.png
- apps/web/.cache/editorial-v3-3/visual-contact-sheet.png
- apps/web/.cache/destination-v3/create-1440-light.png
- apps/web/.cache/destination-v3/edit-1440-light.png

## File map

- packages/db/prisma/schema/destination-editorial.prisma and Destination relation;
  migrations/20261014120000_add_destination_editorial/migration.sql.
- apps/web/src/modules/destination-editorial/: contract/engine/service/AI/server,
  fixture and unit/PG suites.
- apps/web/src/app/admin/destinations/editorial-editor.tsx/.css and [id]/editorial;
  destination-form entry/Save shortcut and destination-v3 scoped tokens/actions.
- apps/web/src/app/api/admin/destinations/[id]/editorial/route.ts and propose/route.ts.
- apps/web/src/components/editorial/: renderer/photo/CSS; public Detail/page optional
  editorial; app/layout CSS import. No Header code changed.
- web .env.schema/.env.example optional model; no actual environment file edits.
- New editorial browser runner; existing V3 browser and disposable PG runners.
- DESIGN.md, story, this report and append-only ai-progress.md.

## Minimal owner activation at localhost:3010

1. Review additive SQL and pending migration status on an explicitly approved
   non-production target. Apply with the repository Prisma migration workflow,
   e.g. npm run db:migrate:deploy --workspace @KLTN/db, only after verifying the
   target and pending list. This agent did not run that command against shared DB.
   Do not blindly apply unrelated pending migrations or use Production for localhost.
2. Generate client if needed; npm run dev --workspace web. Sign in as ADMIN at3010.
   Before migration the editor intentionally reports the blocker and public detail
   remains available.
3. Destination Edit → Thiết kế trang giới thiệu → Tự động dàn trang. Change template,
   blocks/photos/crop; inspect Desktop/Mobile; Save draft; refresh.
4. Check explicit content/rights review then Publish layout. Destination visibility
   stays unchanged; only separately VISIBLE records show it publicly. Publish a
   second version, restore previous Published or restore Published into draft.
5. Revoke an image right through V3.2 and verify public omission. Legacy destinations
   without editorial retain existing layout. No physical image deletion occurs.
6. Optional owner-only AI smoke: configure compatible OPENAI_EDITORIAL_MODEL in an
   ignored local environment alongside the existing key, restart and explicitly
   click AI proposal. No API is required for deterministic/manual use.

All provider tests used mocks; all DB writes used disposable local PostgreSQL.
No commit/push/deploy, shared migration/write, paid API call, Cloudinary upload or
asset deletion occurred. Shared migration/model/provider configuration and real
authenticated3010acceptance remain the only activation steps for the owner.

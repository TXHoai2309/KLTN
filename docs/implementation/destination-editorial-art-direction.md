# Destination editorial art direction — 2026-10-15

Owner request: make the existing AI-assisted article feel like an engaging travel
feature, expose typography controls, and stop silently replacing a manually chosen
family/variant. Branch TXH; existing Cloudinary, V3.4 media and Luna working-tree
changes preserved. No provider call, shared database write, migration, commit,
push or deploy is authorized or performed in this refinement.

## Behavior

- Default KEEP sends the currently edited layout and restricts family/variant to
  singleton JSON Schema enums. Server validation independently rejects changes.
  An explicit “Để AI chọn lại nhóm và biến thể” checkbox enables AUTO. A manual
  family/variant choice returns to KEEP. Deterministic reflow also retains the
  chosen presentation. Successful AI proposals stay local and can be undone;
  fallback/error preserves the local draft.
- AI receives an art-direction brief explaining each composition and design
  option, plus eligible media IDs, bounded alt/captions and dimensions. No image
  URL, credentials, legal evidence, raw storage metadata or unrelated media is
  supplied. It uses existing photos; this does not generate new photographs.
- Optional strict design enums allow literary/modern/humanist typography,
  forest/stone/earth palette and immersive/compact rhythm. AI can also select
  bounded crop and gallery enums. No raw CSS, HTML, arbitrary fonts or external
  design resources can enter stored JSON. Existing IDs, prose, citations, captions,
  visibility and focal points remain unchanged.
- Shared preview/public renderer uses article-relative headings, deliberate Lora
  Vietnamese/Geist/Be Vietnam type roles, readable paragraphs, an inset panoramic
  title, restrained split/centered openings and responsive galleries. The new
  Lora font is self-hosted at build by the existing next/font setup. Native selects
  provide manual font, palette and rhythm control. Legacy v1 JSON without design
  remains valid; there is no backfill or schema migration.
- Existing media eligibility, source provenance, Admin auth, HIDDEN isolation,
  explicit draft/review/publication, revisions and UNKNOWN retry remain in force.

## Verification

Results:

- 155 focused tests pass across Editorial (including nine art-direction and 27
  Luna adapter cases), US25 and shared media eligibility. Six disposable PostgreSQL
  integration cases skip because this run has no isolated database configured.
- 57 additional image/idempotency/Cloudinary regression tests pass. Total 212
  focused offline tests; no provider upload or database writes.
- 20 isolated browser groups pass with production components and real self-hosted
  build fonts. Includes KEEP/AUTO, truthful busy state, Undo, manual design Save
  and refresh, keyboard select, local unsaved prose preservation, revisions,
  UNKNOWN identical retry, concurrency conflict, missing configuration, media
  revocation and public renderer/fallback. Twelve compositions across five widths
  (360/390/768/1024/1440) and light/dark, zero/one/two/four/eight photos, long
  Vietnamese titles, narrow preview and reduced-motion screenshots pass.
- Root `npm run check-types`: four workspaces pass. `npm run build --workspace web`
  passes, including the new Vietnamese Lora build assets. `git diff --check` passes.
- Editorial scoped strict premium audit: zero findings. DESIGN.md lint: zero errors,
  four pre-existing orphaned-token warnings. No repository formatter script exists.

Ignored evidence: `apps/web/.cache/editorial-art-direction-*.log`,
`editorial-art-direction-scoped-audit.json`, and
`apps/web/.cache/editorial-v3-3/results.json` plus screenshots. Browser fixtures use
only mock HTTP/persistence/maps and synthetic media. This is not a live Luna quality
evaluation or authenticated Neon acceptance; the owner can evaluate real AI visual
choices by pressing the existing proposal button after reload. No paid request was
made by the agent.

The broader pre-existing Admin audit reports a legacy content-profile Textarea
resize rule outside this change. The Editorial-scoped audit is recorded separately;
it does not claim to remediate the entire Admin application.

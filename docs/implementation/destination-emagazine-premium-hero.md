# Premium E-Magazine Hero

TASK=EMAGAZINE_PREMIUM_HERO
STATUS=COMPLETE
ROOT_CAUSE=Layered Hero CSS, shared Split/Panorama markup, viewport-driven title measures and full-width expansion of small originals.
CINEMATIC_HERO=Landscape first; article-wide photograph, asymmetric title/location colophon, compact transition into the story.
SPLIT_HERO=44/56 copy/photo grid; unified tint surface; vertical mobile flow.
MAGAZINE_COVER=Centered Vietnamese masthead, restrained eyebrow rules and central photograph; source-size-safe fallback.
TYPOGRAPHY=Existing self-hosted Lora/Geist/Be Vietnam Pro; article-relative sizing, title-length adjustment and balanced wrapping.
IMAGE_QUALITY=Source dimensions cap rendered width; no stretching; original crop and Admin focal edits retained; low/unknown Panorama sources use a read-only Cover fallback.
AI_SELECTION=Only three tested Hero enums; eligible attached media; manual locks enforced by server validation and client atomic acceptance; Luna adapter unchanged; no real model request.
ADMIN_MANUAL_OVERRIDE=Native Hero select, composition lock and photo/focal lock; Save/refresh/Undo use existing editor state and write contracts.
PREVIEW_PUBLIC_PARITY=Shared renderer and media plan; browser transport checks and direct canonical projection comparison.
VISUAL_QA=126 after snapshots; 390/768/1440 light/dark, 7 cases × 3 variants; real Cloudinary reads from an existing cached read-only snapshot.
BEFORE_AFTER=Matched pre-change working-tree component copies; 126 before snapshots; six variant contact sheets and desktop comparison.
TEST_RESULTS=340 focused tests PASS; 9 DB integration tests SKIP; 26 browser groups PASS; 126 Hero after snapshots PASS; root typecheck, web build, strict scoped audit and diff check PASS.
SCHEMA_MIGRATION=NONE; optional V1 JSON hero configuration only.
READY_FOR_MANUAL_TEST=YES; real GPT output and authenticated persistence remain manual acceptance.
COMMIT=NO
PUSH=NO
DEPLOY=NO

## Audit and design decisions

Starting HEAD was `2f5a649` on `TXH`. Existing uncommitted V3.6 and concurrent
AI corrections were retained. The matched before baseline is a local copy of
the actual working tree, not Git HEAD. The starting diff was saved under the
ignored QA directory for comparison; this agent did not commit or reset it.

The original renderer accumulated multiple generations of Hero selectors:
height/aspect, title inset, margins and grid behavior were repeatedly overridden.
Split was an alias of Panorama and relied solely on ancestor variant CSS. Hero
photos had lost their intrinsic max-width, so the width metadata was merely a
warning while the browser enlarged small originals across the whole article.

Screenshots of the existing Đồng Văn assets reproduce the main quality ceiling:
the three original images are only **565×353, 597×335 and 738×414px**. A wide
1280px display visibly enlarges the first image. These are safe, usable library
assets but cannot honestly produce a sharp full-width cinematic photograph.
They were not edited, replaced, uploaded or removed. The new renderer presents
them at bounded source size, with quieter title sizing for a limited Cover.

The creative decision is a travel photo essay with an image-to-colophon
transition, a unified Split, and a typographic Cover. Existing forest/slate/earth
tokens and selected typography/rhythm remain authoritative. Text stays off
unanalysed photographs, so contrast does not depend on guessing image content.
There is no Destination-name-specific composition or global theme replacement.

## Compatibility and data safety

- Optional `layout.hero` contains composition, composition lock and optional
  focal lock. Old schemaVersion 1 layouts without it still parse unchanged and
  map Panorama/Split/Editorial to the corresponding new opening. IDs, blocks,
  URLs, captions and source metadata are preserved.
- Quality fallbacks affect only rendering. They never update the stored variant
  or publish a draft. A low-resolution Panorama becomes Cover; a tall original
  can use Split. Admin receives a note explaining source dimensions. Unknown
  dimensions are bounded conservatively and do not imply verified resolution.
- Manual focal/crop edits lock the chosen image and focal settings for AI. Older
  noncentral focal points are treated as deliberate edits unless explicitly
  unlocked. Deterministic regeneration also retains these settings.
- Model output remains strict JSON with bounded presentation choices. The
  existing media-ownership/REJECTED policy, exact block/prose constraints and
  atomic fallback remain in force. A fresh AI choice requiring an immediate
  quality downgrade is rejected; existing legacy/manual choices render safely.
- The AI cannot submit arbitrary HTML/CSS/fonts. Existing sourced short decks
  are rendered; long, duplicate or lead-derived decks are omitted. A legacy
  131–180-character Hero paragraph is retained below the opening, not lost when
  it no longer qualifies as a short deck. Existing prose-generation restrictions
  in the concurrent V3.6 corrections are retained.
- No provider adapter/model configuration, Preference Extraction, RAG,
  AddressKit, Trip Planner or publication/visibility implementation was changed.

## Browser evidence

Artifacts are ignored local QA outputs under `apps/web/.cache/premium-hero/`:

- `before-results.json` / `after-results.json`: matched geometry, overlap,
  overflow, typography and decoded-image information.
- `contact-{390,768,1440}-{light,dark}.png`: all variants/cases.
- `before-after.png`: three variant rows, before on the left, after on the right.
- `after/dong-van-real-*-full.png`: actual three-photo article, read-only assets.
- `editor-browser.log`: the production Editor/public-shell suite, with fake
  persistence/provider transport and no database client or external mutations.

Cases: Đồng Văn with full-resolution synthetic fixtures, Nho Quế fixture, Dinh
thự họ Vương fixture, one photo, 400px low-resolution photo, no photo and the
existing read-only Đồng Văn snapshot. All 18 real-photo Hero viewport/theme
renders decoded successfully. Low-resolution assets intentionally cannot produce
three unrestricted full-width photo treatments; Panorama and Cover converge on
the safe Cover when needed. Full-quality fixtures demonstrate all three distinct
compositions. This limitation is exposed honestly rather than upscaling assets.

Screenshots were opened and reviewed, including desktop before/after, actual
Đồng Văn light/dark, mobile Split/Panorama and tablet Cover. Result: no blank
Split column, no overprinted text, readable Vietnamese hierarchy, a consistent
entry into the lead and original-width real photos. Preview/Public use the same
component, composition plan and resolved input, without changing canonical data.

The older isolated Editor harness lacked an HTML UTF-8 declaration. Chromium
misdecoded raw Vietnamese regex literals in its JavaScript, causing a false
browser/server heading mismatch only for real prose. Added UTF-8 metadata to
match production Next.js output and a direct browser/server projection assertion.
This fixed the QA environment; production heading logic was not changed for it.

## Verification

| Check | Result |
| --- | --- |
| Focused Vitest: Editorial, Preference Extraction, Trip Planner and planner UI | 340 PASS; 9 isolated-DB tests SKIP, 17 files PASS |
| Production Editor/public-shell browser suite | 26 groups PASS, including manual Hero controls, Save/refresh, keyboard, five widths, themes, AI fallback, UNKNOWN/retry, publication/rollback and Preview/Public parity |
| Dedicated Hero browser matrix | 126 before + 126 after snapshots; 390/768/1440, light/dark, all three compositions; 18/18 real-photo Hero loads |
| Hero geometry | No horizontal/text overflow, no overlapping title/deck/location and no Hero image geometry shift after decode; small fixture rendered at ≤400px |
| Root `npm run check-types` | 4 workspaces PASS |
| `npm run build --workspace web` | PASS |
| `node --check` on both browser scripts | PASS |
| Premium strict scoped audit with `docs/design/editorial-premium-ui.json` | 0 errors/findings; made inherited dark scrollbar width explicit to satisfy the static rule |
| DESIGN.md official lint | 0 errors, 4 existing orphan-token warnings in the older Admin frontmatter; no runtime token owner changed |
| `git diff --check` | PASS |

There is no configured repository formatter/linter script; script syntax,
typecheck, DESIGN lint, static audit and diff whitespace were checked separately.
No live GPT-6 Luna request is claimed. Authentication, real Neon persistence and
subjective live model choices remain Owner manual acceptance; no substitute
shared-DB writes were performed. There are no migrations to apply. No RAG,
AddressKit or Trip Planner production source was changed.

Hero implementation files: `editorial-hero.ts`, `editorial-contract.ts`,
`editorial-engine.ts`, `editorial-ai.ts`, `editorial-signature.ts`,
`editorial-proposal-result.ts`, shared `editorial-renderer.tsx`,
`editorial-story.tsx`, `editorial-photo.tsx`, `editorial.css` and Admin
`editorial-editor.tsx`/`editorial-editor.css`. Tests: the new Hero Vitest/browser
files, existing OpenAI schema assertions and Editor harness. Documentation:
DESIGN.md, this report, the Hero story and append-only progress. Existing dirty
V3.6 source/route/diagnostic changes were retained, not reset or attributed to
this Hero task.

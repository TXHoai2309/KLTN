# Destination E-Magazine V3.5 — implementation report

```text
TASK=DESTINATION_EMAGAZINE_V3_5_DESIGN_QUALITY
STATUS=IMPLEMENTED_READY_FOR_MANUAL_TEST
BRANCH=TXH
HEAD=7ecdaec74e0944129d722abeb2dd3c27d4f34c3e
```

## Outcome

The article renderer now presents Destination material like an editorial feature:
a deliberate opening, readable lead and body, varied photo pauses, practical
information, map and sources. Previously the renderer had no separate content
projection for headings, lead and body. Long or repeated copy could occupy the
headline slot, paragraphs could repeat, and image layout did not use verified
source dimensions to choose a suitable lead image.

The shared implementation is in [editorial-content.ts](../../apps/web/src/modules/destination-editorial/editorial-content.ts),
[editorial-story.tsx](../../apps/web/src/components/editorial/editorial-story.tsx),
[editorial-renderer.tsx](../../apps/web/src/components/editorial/editorial-renderer.tsx),
[editorial.css](../../apps/web/src/components/editorial/editorial.css),
[editorial-engine.ts](../../apps/web/src/modules/destination-editorial/editorial-engine.ts),
and [editorial-ai.ts](../../apps/web/src/modules/destination-editorial/editorial-ai.ts).

## Content and visual changes

- A non-mutating display projection separates title, optional deck, lead, story
  headings/body, captions and provenance. Sentence-like/duplicate headings leave
  the heading position while the original prose remains. Exact duplicate paragraphs
  are omitted only from rendered output; near-duplicates remain and are flagged.
  This does not rewrite the stored draft or Destination source.
- The reusable article renderer has panorama, split and centered openings, reading
  sections, full-width photo breaks, staggered galleries, featured text, practical
  details, map and source attribution. Vietnamese-capable Lora, Geist and Be Vietnam
  Pro are selectable through bounded design enums, alongside article palettes and
  compact/immersive spacing. The font and layout choices do not accept arbitrary
  CSS or URLs.
- Photo selection and presentation use existing website-use eligibility. Verified
  Cloudinary dimensions inform the cover and gallery composition; missing or small
  sources produce an Admin warning. Images keep their aspect ratio, reserve space,
  and retain failure fallbacks.
- GPT art direction can choose among the existing family/variant options and return
  bounded design, composition, emphasis, title and deck choices. The server requires
  non-hero headings and decks to come from current supplied text, preserves every
  block ID and its prose, keeps practical/map/source sections after the story, and
  rejects hiding populated blocks, ineligible media, new facts, save or publication.
  The proposal remains local until an Admin saves it.
- Admin Preview and the published public article call the same content projection
  and renderer. A browser test asserts identical article markup from the same
  resolved layout.

## Compatibility and data safety

```text
OPTIONAL_V1_JSON_FIELDS=deck, emphasis, headingProvenance, design choices
DATABASE_SCHEMA_CHANGE=NONE
MIGRATION=NONE
STORED_DESTINATION_TEXT_REWRITTEN=NO
LEGACY_MEDIA_IDS_URLS_METADATA_REWRITTEN=NO
MEDIA_ELIGIBILITY=Shared V3.4 website-use policy; REJECTED/revoked/foreign media blocked
PUBLICATION=Existing visible-Destination and published-Editorial gates retained
AI_AUTOSAVE_OR_AUTOPUBLISH=NO
OPENAI_REQUESTS=0
GPT6_LUNA_RUNTIME=CONFIGURED (confirmed by safe build diagnostic)
CLOUDINARY_UPLOADS=0
NEON_WRITES=0
```

Optional fields extend the existing v1 JSON contract, so existing layout records
continue to parse. The content projection keeps legacy source/layout data intact.
The QA fixtures are synthetic and do not include records from the live Đồng Văn
Destination.

## Verification

| Check | Result |
| --- | --- |
| Root `npm run check-types` | PASS — four workspace typechecks |
| `npm run build --workspace web` | PASS — production build and static generation |
| Full Vitest, rerun with `--testTimeout=15000` | PASS — 80 files, 1,278 tests; 10 database integration files and 91 tests skipped |
| `npm run test:legacy --workspace web` | PASS |
| Focused Editorial/media/Cloudinary/Planner Vitest | PASS — 190 tests; 6 database integration tests skipped |
| Isolated Admin/public browser suite | PASS — 21 groups; same-layout Preview/renderer/public markup equality; five viewport widths and light/dark coverage |
| Before/after editorial fixture matrix | PASS — 30 visual states: 5 synthetic Destinations × 3 viewport widths × 2 themes |
| Photo-count/responsive cases | PASS — 0, 1, 2, 3, 5 and 8 images; no overflow, duplicate paragraph, empty slot or broken image geometry |
| `git diff --check` | PASS |

The first default-timeout full Vitest run hit a 5-second timeout in an unrelated
Blob SDK stream test (7.6 seconds under load). The isolated test passed on rerun and
the complete suite passed with a 15-second per-test timeout. Database integration
tests were skipped because no isolated PostgreSQL run was requested for this
schema-free change. Screenshots use local synthetic landscape images and mock map
content, with no external provider requests.

Visual evidence is saved under the ignored directory
`apps/web/.cache/editorial-v3-5/`; the desktop comparison is
`before-after-desktop-contact-sheet.png`.

## Manual acceptance

```text
READY_FOR_MANUAL_TEST=YES
LIVE_GPT6_LUNA_AESTHETIC=NOT_VERIFIED
BLOCKERS=No code or automated-test blocker; owner should verify the real model's
  proposal and visual quality with the actual Destination photos in Admin.
COMMIT_PUSH_DEPLOY=NONE
```

No real OpenAI request was made, so this report verifies layout constraints and
mocked integration behavior, not GPT-6 Luna's live creative quality or account
access. The working tree remains uncommitted on TXH.

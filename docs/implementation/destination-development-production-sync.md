# Destination Development to Production migration

2026-10-18 Asia/Saigon. **DATA_TRANSFER=PASS; PRODUCTION_SMOKE=PARTIAL; DESTINATION_PRODUCTION_SYNC=PARTIAL.** Selected data is committed, verified and replayed safely. Full acceptance remains open for Landing/map and authenticated CMS/Planner smoke.

## 1. Git status

Isolated worktree: `C:\Users\User\.codex\worktrees\destination-production-sync\KLTN`, branch `codex/destination-production-sync`, from origin/master `86bb9422e552c50226882dc4b602f8865e9c8112`. Original `D:\KLTN\KLTN` was clean on TXH at `5a2d1cce9d498983fa2664b3714498373f5b7b3c` and is untouched. Only local scripts/story/progress/sanitized evidence changed. No commit, push, merge, deploy, routing/Trip code or Prisma schema change.

## 2. Source identity

Neon API verified project `summer-unit-95870477`, Development branch `br-aged-hat-b3o6hg9p`, endpoint `ep-purple-pond-b3xujb8o`, database `neondb` before SQL. Explicit SYNC_SOURCE_DATABASE_URL only. No DATABASE_URL fallback; credentials stay in the original ignored env file.

## 3. Production identity

Same verified project, Production branch `br-cold-dew-b3h270wp`, endpoint `ep-blue-art-b3v3vr4h`, database `neondb`. Explicit SYNC_TARGET_DATABASE_URL. Each mode checks branch/endpoint/database metadata and rejects reversal, incorrect endpoints, unsafe URL/port/protocol and missing TLS. A matching hostname alone never opens the gate.

## 4. Schema/migration parity

Both databases have **23 healthy applied migrations**, matching repository migration names/checksums with LF/CRLF normalization, no unfinished/rolled-back entry, last `20261017210000_admin_user_management`. Live columns, constraints, indexes and user-defined triggers have identical canonical schema hashes. No migration deployment, db:push, trigger/constraint bypass or schema mutation.

## 5. Backup and recovery

**PASS**: snapshot `snap-snowy-rain-b33t352d`, source branch `br-cold-dew-b3h270wp`, completed **18-10-2026 01:56:58 UTC+7**. All three Neon operations finished. Snapshot source/existence and completed operations rechecked before apply/replay. [Receipt](destination-sync-evidence/backup.json).

Recovery plan: stop further migration writes, preserve receipts/manifests, restore this snapshot into a separate recovery branch using official Neon snapshot restore, verify ledger and fingerprints, then coordinate any Production replacement with the owner. Protect later unrelated writes. Do not DROP/RESET/DELETE to undo import or blindly replace current Production. No restore executed; snapshot retained. [Snapshot API](https://api-docs.neon.tech/reference/createsnapshot), [restore API](https://api-docs.neon.tech/reference/restoresnapshot).

## 6. Source inventory

Source has **5 Destination: 3 VISIBLE, 2 HIDDEN**; 5 valid coordinate pairs; 4 locationVerified. All 5 have seven weekdays, but only 1 has known OPEN intervals, belonging to the excluded fixture. Four each have sources, media, covers, draft and published editorials. One has an Area relation, one a Culture relation, zero RAG origins. One explicit test fixture and one additional duplicate were excluded.

| Table | Source | Imported/target |
| --- | ---: | ---: |
| destination | 5 | 3 |
| opening_day | 35 | 21 |
| opening_interval | 2 | 0 |
| Destination-owned content_source | 14 | 12 |
| Destination-owned content_media | 16 | 13 |
| destination_editorial | 4 | 3 |
| content_area | 1 | 0 |
| Area joins | 1 | 0 |
| culture_destination | 1 | 0 |
| Destination-owned rag_domain_origin | 0 | 0 |

[Sanitized inventory](destination-sync-evidence/inventory.json). Full authored content/editorial actor metadata stays in ignored `.cache/destination-sync/`. No raw auth/user rows or credentials are exported there.

## 7. Destination IDs and selection

| ID | Name | State | Decision |
| --- | --- | --- | --- |
| cmutr90km00015o9w4t64ozfd | US09 Manual Test Edited | HIDDEN | Exclude explicit acceptance fixture |
| cmv7kc5eu0003209w9ggzpolq | Cao nguyên đá Đồng Văn | HIDDEN | Exclude duplicate by owner reply |
| cmv97lcrq0016z09ws0o74lqp | Cao nguyên đá Đồng Văn | VISIBLE | Import |
| cmv9fcwo1000be89w3yxz3mqu | Di tích lịch sử Căng Bắc Mê | VISIBLE | Import |
| cmvanjc6p000f7w9wyuydna52 | Chợ tình Khâu Vai | VISIBLE | Import |

Owner explicitly chose only the three VISIBLE records and excluded the HIDDEN duplicate. No general rule equating HIDDEN with fixture was invented. Both excluded IDs are absent on Production and their public APIs return404. Source rows unchanged.

## 8. Dry-run

**PASS**. SOURCE_DESTINATION_COUNT=5, ELIGIBLE_DESTINATION_COUNT=3, source HIDDEN=2/VISIBLE=3, eligible HIDDEN=0/VISIBLE=3, initial TARGET_DESTINATION_COUNT=0. Planned inserts: 3 Destination,21 OpeningDay,12 sources,13 media,3 editorials; zero other rows. EXPECTED_UPDATES=0; EXPECTED_DELETES=0; blocking FK/media/editorial conflicts=0. [Pre-import plan](destination-sync-evidence/dry-run.json).

Canonical source hash: `6f6d179c1d223c70c812ac77aeed53b425e4eddf0aa9cda570c1325f9b6a07b3`.
Plan hash: `082020d3905145b4478506431bf53770938633bdc26b3e38a3f7f338e553ab5a`.

## 9. Conflicts and safeguards

No target ID/name conflicts. Existing different content or unexpected target Destinations abort rather than overwrite. Live pg_catalog confirmed `_AreaToDestination.A -> content_area.id`, `.B -> destination.id`; no selected record needs Area links.

Source reads use REPEATABLE READ READ ONLY. Target uses SERIALIZABLE, transaction advisory lock, allowed-table locks, bounded statement/lock/idle timeouts and a60-second overall deadline. Target content/ledger rechecked before write. Only fixed allowlisted tables receive bound INSERT parameters; no UPDATE/DELETE/TRUNCATE/DDL path. Prepared receipts support identical-plan reconciliation after an UNKNOWN COMMIT; snapshot POST is never retried blindly.

## 10. Import and replay

**3 Destination committed**, all IDs/current fields preserved. [Commit evidence](destination-sync-evidence/import.json). An initial in-transaction hash mismatch caused rollback: pg had parsed timestamp-without-time-zone through JS Date. Timestamp OIDs now remain exact PostgreSQL strings; disposable PostgreSQL under Asia/Ho_Chi_Minh verifies no shift. A fresh dry-run and import then passed. Failed-attempt rows were not retained.

Second actual apply committed **zero inserts in every allowed table** with equal content hashes and unchanged excluded data. [Replay](destination-sync-evidence/replay.json).

## 11. OpeningDay/OpeningInterval

21 weekday rows preserve UNKNOWN for all seven days of each selected Destination. Zero intervals is correct; the two source intervals belong to the excluded test fixture. UNKNOWN was not promoted to OPEN. Seven-day uniqueness, interval bounds/order and status consistency checked.

## 12. ContentSource

12 rows, four per Destination. All website/indexing/OpenAI rights remain UNKNOWN:36 unchanged rights fields. Metadata, URLs, positions, evidence/review fields match source. No approved public citations or AI indexing rights invented. Culture sources excluded.

## 13. ContentMedia

13 rows/3 covers, all websiteRights remain UNKNOWN. All selected rows have valid existing ADMIN_UPLOAD_V1 markers bound to their Destination and exact Cloudinary URL/asset/version. Markers, metadata, actor/evidence fields and rights preserved. Current application eligibility permits website use; a marker is **not legal rights approval**. No marker minting, upload, asset move or deletion. All13 URLs return HTTP200 image content. [Checks](destination-sync-evidence/media-checks.json).

## 14. Areas and external relationships

Zero Areas/joins required by selected records. The source Area belongs only to the excluded HIDDEN duplicate. The only Culture link belongs to the excluded fixture. Selected Culture/RAG dependencies=0, so no deferred selected links or fake records. Favorite, Trip/ItineraryVisit, Culture/RAG corpora and QA histories were not copied.

## 15. Editorial/Emagazine

Three full records copied including draft/published/previousPublished JSON, row schemaVersion, revisions, fingerprints, timestamps and exact actor strings. Current layouts parse against repository V1/V2 contracts; media/source references belong to their Destination and current contentRefs resolve against canonical AST units. Row schemaVersion is preserved even when nested layout JSON uses a different supported version.

Khâu Vai previousPublished contains `ast-intro` from an older description AST, unresolved against today's description. This is a historical warning: preserve the JSON rather than rewrite editorial history. Current draft/published refs pass. No new publication/revision or actor substitution. pg_catalog confirms actor strings have no User FK; provenance is valid without copying Development users or impersonating the Production Admin.

## 16. Cloudinary verification

All16 source image URLs, including13 selected, return200/image content and match source cloud configuration. Vercel's read-only Production env pull redacts CLOUDINARY_CLOUD_NAME as `[SENSITIVE]`; same/different Production cloud is **UNVERIFIED**, not a proven mismatch. Public covers/visible detail images load from preserved URLs; no cross-cloud copy attempted. Future upload-cloud parity remains an owner/configuration check.

## 17. Rights/provenance

49 non-approved rights fields preserved exactly (36 source +13 media), plus one historical AST warning:50 warnings, zero blockers. No HIDDEN-to-VISIBLE, location verification promotion, inferred hours/prices/coordinates, rights approval or fabricated author history. Reachability does not prove legal rights.

## 18. Post-import integrity

**PASS**: fresh canonical comparisons match all52 imported rows;3 VISIBLE,0 HIDDEN,3 valid verified coordinate pairs,21 UNKNOWN days,12 sources,13 media/3 covers,3 draft/published editorials. No duplicate selected names/IDs. Actual verification of all **38 live public-schema foreign keys** found zero dangling rows. All three public detail APIs and list DTOs succeed. [Verification](destination-sync-evidence/verification.json), [FK checks](destination-sync-evidence/foreign-keys.json).

## 19. Excluded Production data

Before/after counts and database-side fingerprints match in import, replay and fresh post-smoke verification. User=1 ACTIVE ADMIN,Session=2,Account=1,Trip=0,Favorite=0,AdminAuditEvent=0,migrations=23 unchanged. Other excluded Culture/RAG/QA/idempotency/itinerary tables also match. Auth fingerprints use explicit noncredential allowlists; passwords/access/session tokens are not selected/exported. Other excluded rows are hashed inside PostgreSQL, not fetched. No login/session creation, CMS write or QA enablement.

## 20. Production smoke

[HTTP evidence](destination-sync-evidence/production-http.json), [browser observations](destination-sync-evidence/production-browser.json).

- APIs: health200; exact3 public IDs/3 covers; all3 detail APIs200; both excluded IDs404. Search Khâu Vai=1, culture category=1, region=3, no-match=0. Explore/default/list/map HTML200 with imported names.
- Browser: list3, search1, click opens Khâu Vai published editorial and loaded initial images. Lazy images below viewport not forced; their URLs separately pass HTTP checks. No hydration/console errors observed. Light theme visually checked; dark DOM observed. Responsive matrix NOT_RUN.
- **Landing incomplete**: fallback remains; `x-nextjs-prerender:1`, cache HIT, no imported IDs despite live API data. Repository Home lacks a dynamic opt-out. Evidence indicates existing prerendered build needs separately authorized rendering/cache correction and release. No app change/deploy here.
- **Map incomplete**: browser shows “Bản đồ hiện không khả dụng”, with all3 sidebar destinations. Worker/shared assets200; actual style/tile status and hostname authorization remain UNVERIFIED. No Stadia PASS or unsupported HTTP-cause claim.
- Authenticated CMS/Planner data reads NOT_RUN: browser is Guest. Existing tokens were not read/reused and no new login/session created. No Production QA/RAG/AI readiness claim or Trip mutation.

## 21. Tests, operation and remaining work

**16 unit tests PASS;3 unique disposable PostgreSQL integration tests PASS**: mapping/arrays/JSON/timestamps, FK order, rights, pure dry-run, conflict detection, replay, unrelated-table protection, rollback, advisory concurrency and UNKNOWN COMMIT. Integration command reruns core cases; repeated tests are not counted as additional unique tests. Owned PostgreSQL17 fixture container removed. Node syntax and diff-check PASS. App typecheck/build NOT_RUN for standalone Node/doc changes; no app source modified. [Test summary](destination-sync-evidence/tests.json).

Secret/whitespace/syntax checks passed over25 changed files; current Explore HTML
and18 directly referenced script tags contain zero known local secret values.
This is a bounded served-asset check, not an exhaustive audit of every lazy chunk.
[Safety evidence](destination-sync-evidence/safety-checks.json).

Entry: `scripts/sync-destinations-development-to-production.mjs` supports --dry-run/--apply/--verify/--report and provider verification for each. Supply --env-file for the original ignored env, installed pg/esbuild dependencies (isolated worktree used NODE_PATH from existing node_modules), and explicit owner-approved `.cache/destination-sync/selection.json`. Apply requires matching passing dry-run, fresh media checks and verified backup. Preserve ignored private inventories/prepared/commit receipts; never commit cache/env files. Vercel env pull remains ignored and was read-only.

Remaining: Landing cache/rendering, map/tile diagnostics, authenticated CMS/Planner, responsive smoke, Production upload-cloud identity. Selected database transfer/preservation checks are complete; reimport is unnecessary.

## 22. Recommendation

**GO for completed selected data transfer and read-only Explore/detail use; NO_GO for full visual/CMS/Planner release acceptance.** Keep snapshot/receipts. DATA_TRANSFER=PASS; DESTINATION_PRODUCTION_SYNC=PARTIAL until remaining smoke gates pass. No merge/push/deploy performed.

## Final acceptance follow-up — 2026-10-18

[Current final acceptance report](destination-production-final-acceptance.md)
supersedes the earlier missing-session/smoke observations above. CMS read-only
now PASS using the owner's interactive session. Scoped Home fix passes build,
typecheck and local Production-read-only rendering; deployment still pending.
Production-origin vector tile probe401 versus localhost200 identifies the tile
authorization gate; no Stadia account setting was changed. Planner repository
reads3, but Production registry/unknown duration-hours readiness remains partial.
Responsive matrix15 scoped cases passes; runtime Cloudinary configured=true,
exact cloud identity still unverified. No reimport, schema/Auth data mutation,
merge/push/deploy. Overall DESTINATION_PRODUCTION_SYNC remains PARTIAL / NO_GO.

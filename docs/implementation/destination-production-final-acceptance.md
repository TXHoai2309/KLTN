# Destination Production Sync — Final acceptance

2026-10-18, Asia/Saigon. **DESTINATION_PRODUCTION_SYNC=PARTIAL; Production release=NO_GO.**

Data transfer remains PASS. The agent did not import again or mutate content/schema/Auth. The owner logged in interactively (normal session creation/refresh belongs to that explicit owner action); subsequent CMS/Planner interactions were read-only. Snapshot and receipts remain preserved.

## Acceptance gates

| Gate | Result | Direct evidence / remaining condition |
| --- | --- | --- |
| Landing | LOCAL_PASS / PRODUCTION_PENDING_DEPLOY | Production still prerendered fallback. Scoped Next16 fix built and reads all3 Production IDs through a read-only connection; no deployment performed. |
| Map | LOCAL_PASS / PRODUCTION_BLOCKED | Local build renders real tiles and all3 markers; Production browser fallback persists. Same tile probe: Production Origin/Referer401, localhost200. Stadia property/hostname authorization requires owner access and recheck. |
| CMS Admin | PASS_READ_ONLY | Owner-provided authenticated session lists3 records; all3 edit/gallery/source/editorial pages read successfully. No save/publish/upload/reorder/delete. |
| Planner | READ_PASS / RUNTIME_PARTIAL | Actual planner repository reads and rechecks3 IDs from Production. Current source registry is Development-only; full deployed runtime proposal readiness is not proven and was not invoked. |
| Responsive | PASS_SCOPED_MATRIX | 390/768/1440: Production Explore, CMS edit, Planner form; local fixed Landing and map.15 DOM/content/overflow cases pass. Local cases are not deployed evidence. |
| Cloudinary | CONFIGURED_PASS / IDENTITY_BLOCKED | Production Admin GET returns configured=true. Exact runtime cloud identity/credential validity is not exposed by existing GET and sensitive Vercel values cannot be recovered. No image mutation. |

## 1. Root causes and changes

### Landing

`app/page.tsx` reads Prisma but did not establish a request-time boundary. Production response has `x-nextjs-prerender:1`, cache HIT, and no imported names while `/api/destinations` returns the exact3 expected IDs. Home's fallback was baked into the static artifact.

Added `await connection()` from `next/server` before the database try/catch. This prevents prerender control flow from being swallowed, scopes dynamic rendering to Home, and preserves cache policy for other routes/static assets. No global cache disablement or new cache-components setting.

Installed Next16.3.4 guide read: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`. [Official connection reference](https://nextjs.org/docs/app/api-reference/functions/connection).

Production build classifies `/` as dynamic (`ƒ`), with existing static routes still static. Local `next start` connects to the pinned Production endpoint using `default_transaction_read_only=on` and returns200, all3 names/IDs, no empty fallback and no prerender header. Production verification of the patch is pending an owner-authorized release; no deploy occurred.

### Map

Production worker/shared files return200, correct JavaScript MIME and byte hashes identical to installed MapLibre6.12.0 npm assets. Checked responses have no CSP or report-only CSP; Landing has no CSP meta tag. Application source introduces no custom CSP blocking these resources.

The Production browser requests the configured Stadia light style, TileJSON and sprite resources, then displays unavailable; the existing lifecycle suppresses detailed provider errors. HTTP probes with explicit Production Origin/Referer receive200 for styles/TileJSON/sprites, but the actual vector tile `/data/openmaptiles/8/202/111.pbf` returns **401** (PNG authorization warning). With localhost Origin/Referer, the same tile returns **200** vector-tile bytes. Local build renders real map labels/roads and exact3 marker IDs in the same browser and opens the correct marker detail popup.

This directly establishes a failing Production-origin tile authorization gate. Stadia Console redirects to its login form; no authenticated management session was available. The exact account/property configuration has not been inspected, so an incorrect allowlist/entitlement is not asserted as an account-level fact. Browser tooling exposes page resource inventory but not the worker's actual request status/headers; the401 evidence is explicitly a standalone HTTP probe, not a fabricated browser network log.

Added sanitized lifecycle diagnostics for load/mount/provider/timeout. Only allowlisted stage/code and numeric HTTP status are logged; raw messages, URLs and credentials are excluded. Existing failure/retry/cleanup behavior remains intact. No frontend key, alternate provider, server credential proxy or fake map introduced.

Owner action: Stadia dashboard → Manage Properties → Authentication Configuration. Inspect the property serving tiles and authorize the exact Production hostname `kltn-rho.vercel.app` under the correct account/subscription. Check actual browser Origin/Referer and the resulting tile response; do not broadly allow all vercel.app tenants. No Stadia setting was changed by this task. [Official domain authentication](https://docs.stadiamaps.com/authentication/#domain-based-authentication).

### CMS

The earlier blocker was the lack of an authenticated session. Owner manually signed in using the tab opened for this task; no password/token was read or copied. Backend-protected list and all3 edit/editorial pages now load.

| Destination | Gallery | Sources | Draft / published revision |
| --- | ---: | ---: | --- |
| Cao nguyên đá Đồng Văn | 3 | 4 | 14 / 8 |
| Di tích lịch sử Căng Bắc Mê | 5 | 4 | 13 / 7 |
| Chợ tình Khâu Vai | 5 | 4 | 7 / 4 |

Names, existing fields, hours editor, sources, image metadata and editorial preview are present. Initial viewport images loaded; offscreen lazy image loading is not represented as exhaustive pixel verification. All13 referenced URLs already passed image HTTP checks during migration. The embedded map can remain unavailable independently of editorial data; this is covered by the Map gate. Canonical hashing after these interactions confirms all52 imported rows still exactly match the immutable import source hash.

### Planner and responsive

`retrievePlannerCandidates` and `recheckPlannerCandidates` were executed directly with the real Prisma adapter and pinned Production database, with read-only mode asserted before queries. Exactly3 expected IDs returned and recheck passed. No planner service/proposal, paid route provider, AI request or Trip write was invoked.

Checked-out `destination-routing-registry.ts` only approves the Development endpoint; `routingRegistry(ProductionURL).verified` is false. Source runtime therefore suppresses candidates until a reviewed Production registry decision/release. This is source-level evidence; deployed runtime registry internals are not exposed by a read-only endpoint. No registry or routing behavior was changed by this task.

Additional factual readiness limits: Đồng Văn and Khâu Vai have null suggested/minimum durations; all3 destinations have7 UNKNOWN weekdays. Do not invent duration/hours or claim deterministic validation/saved-trip readiness. The authenticated Planner form is accessible to the Admin by inherited Traveler capability. No generate/review/save action was submitted.

Responsive measurements cover requested browser viewports390,768,1440, with15px classic scrollbar gutter (client widths375,753,1425). No horizontal document overflow in15 measured cases. Existing CSS/tokens/layouts were preserved. Scope is layout/content checks, not a full accessibility certification or generated itinerary viewport test.

### Cloudinary

Production authenticated `GET /api/admin/destinations/{id}/images` returned `{success:true,data:{configured:true}}`. Existing server configuration requires a nonempty syntactically valid cloud name, API key/secret and fixed `KLTN/destinations` folder. This is direct evidence of configured runtime inputs, not proof of cloud identity or working provider credentials.

Existing endpoint exposes only the boolean; Vercel redacts sensitive values. No attempt was made to recover/exfiltrate those secrets or create an upload intent merely to reveal the cloud (that would mutate data). No upload/move/delete/re-upload of13 existing assets.

To complete identity gate, owner must run a trusted server-side/hosting-runtime comparison that emits only booleans or hashes: configured cloud matches stored URL/ADMIN_UPLOAD_V1 cloud, expected folder matches, and optional read-only Cloudinary resource lookup succeeds. An authenticated read-only diagnostic endpoint could provide this in a separately reviewed/deployed change; none is deployed here. Do not put secrets in browser/logs.

## 2. Changed files in this acceptance run

Application changes:

- `apps/web/src/app/page.tsx`: scoped Home request boundary.
- `apps/web/src/app/home-request-data.vitest.test.ts`: request ordering, fresh data and fallback tests.
- `apps/web/src/modules/map/map-diagnostics.ts`: safe failure classification/logging.
- `apps/web/src/modules/map/map-diagnostics.vitest.test.ts`: evidence-only classification and lifecycle tests.
- `apps/web/src/modules/map/map-session.ts`: report failure stage without raw provider details.
- `apps/web/src/modules/map/maplibre-renderer.ts`: forward provider event to diagnostic boundary.
- `scripts/verify-destination-acceptance-readonly.ts`: read-only actual planner repository verification.

Documentation: this report, `destination-final-acceptance-evidence/*.json`, appended latest acceptance to the migration report/story and ai-progress. Existing migration scripts and receipts were not rerun/rewritten. DESIGN.md/runtime tokens are unchanged because no visual system decision was made.

Worktree baseline is origin/master86bb942 on `codex/destination-production-sync`. Original checkout contains staged/unmerged unrelated work and was not edited. No reset/stash/cherry-pick, branch promotion, merge, push or deploy.

## 3. Tests and evidence

- Typecheck PASS; Production build PASS. Initial missing generated env types after `npm ci --ignore-scripts` resolved by repository env codegen; final checks pass.
- Full Vitest: **1966 PASS,0 FAIL,134 gated SKIP**. New focused tests: Home3, diagnostics2. Skips are not PASS.
- Relevant legacy suites: Map27/27, Destination63/63, Search33/33 PASS. Full legacy chain was not run.
- Strict premium audit:30 pre-existing findings (12 unresolved ownership,18 violations), zero findings in the changed owned files. Repository-wide premium audit is not PASS; unrelated global/form/shared behavior was not rewritten for this scoped acceptance.
- Secret/diff checks PASS:48 changed text files and102 built static text assets contain no known local credential values; receipt hashes unchanged. Local next-start server stopped after verification.
- Preservation:52 canonical rows still match `6f6d179c1d223c70c812ac77aeed53b425e4eddf0aa9cda570c1325f9b6a07b3`;23 healthy migrations; snapshot `snap-snowy-rain-b33t352d` still belongs to the pinned Production branch. No schema/import/Auth table query by the read-only acceptance verification.

Evidence directory: [destination-final-acceptance-evidence](destination-final-acceptance-evidence/).
Key receipts: [checks](destination-final-acceptance-evidence/checks.json), [preservation](destination-final-acceptance-evidence/preservation.json), [CMS](destination-final-acceptance-evidence/cms.json), [responsive](destination-final-acceptance-evidence/responsive.json), [local Home](destination-final-acceptance-evidence/local-home.json), [map](destination-final-acceptance-evidence/map-browser.json), [tile probes](destination-final-acceptance-evidence/stadia-tile-probes.json), [Planner](destination-final-acceptance-evidence/planner-readonly.json), [Cloudinary](destination-final-acceptance-evidence/cloudinary.json).

## 4. Conditions before PASS / release

1. Review/promote the scoped Home fix through the normal project workflow, with explicit owner authorization for push/merge/deploy. Verify the deployed `/` shows the exact3 IDs and no empty fallback. Current task explicitly forbids automatic deployment.
2. Owner verifies/repairs Stadia Production domain/property authorization; then capture actual browser tile200, three visible markers and popup/detail in light/dark at required sizes. No need to repeat Destination import.
3. Establish the reviewed Production planner corpus registry decision. If end-to-end proposals are in release scope, separately review missing duration/hours and authorize any paid route call; this task did neither.
4. Complete runtime Cloudinary identity/resource verification without exposing credentials.
5. Preserve snapshot/receipts and imported data. Repeat only affected acceptance checks after configuration/release changes.

If the Admin session expires, manual CMS checklist: owner signs in normally, confirms list3, opens each edit page without changing fields, checks gallery3/5/5 and four sources each, checks7 UNKNOWN weekdays, opens editor and confirms the revisions above, views public published details, never clicks Save/Publish/AI/Upload/Delete/Reorder. Planner checklist: open `/trips/new`, confirm form access/layout, do not Generate or Save until route/provider scope is approved.

**Final: NO_GO for declaring full Production acceptance; selected data transfer and read-only CMS/repository checks remain good. DESTINATION_PRODUCTION_SYNC stays PARTIAL.**

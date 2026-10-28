# TC-01 — Công khai Trip đã lưu và xem giới thiệu

## Status

IMPLEMENTED LOCALLY — BE evidence plus FE review fixes and actual-handler regressions recorded. Development migration and authenticated form/preview recovery verified; full browser/visual and owner acceptance remain separate.

## Epic

Approved travel-companions extension, ticket 01 of 11.

## Owner

BE implemented in initial session; FE and integration completed in follow-up session.

## Goal / User Story

As the owner of an officially saved upcoming Trip, I can publish a companion invitation so a Guest can read its limited introduction.

## Outcome

One real publication per Trip, confirmed database writes and a distinct public projection. No membership or group chat is delivered by this ticket.

## Source References

- [Approved issue and exact AC](../../.scratch/trip-companions/issues/01-publish-public-introduction.md).
- [Approved design](../implementation/trip-companions-design.md): Q1, Q3, Q5, Q7, Q14 and implementation constraints.
- [Product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28), [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- This extension has no requirement ID/section in the original Product/System documents. Existing Trip ownership/save semantics: [US-30](US-30-confirm-save-trip.md), [US-31](US-31-my-trips-detail.md).
- [Technical architecture](../architecture/technical-architecture.md), [flow](../flow/user-flow.md), [delivery contract](../implementation/trip-companions-delivery-contract.md).
- UI references: approved plan/mockups; no Figma/browser acceptance claimed in this BE task.

## Dependencies

None in the approved graph. Existing saved Trip, current-account authorization, shared idempotency and destination/media eligibility are present in the repository.

## In Scope

- Minimal publication schema/migration, unique Trip relation, server/shared contracts.
- Owner form context, server preview, publish write, public introduction read.
- Service/HTTP/contract/authorization/idempotency and PostgreSQL concurrency/FK evidence.
- FE companion client (`companion-client.ts`), presentation component (`companion-introduction-view.tsx`), host publication form (`publication-form-client.tsx`, `/trips/[id]/publication`), public introduction page (`/trip-companions/[id]`), entry links in `TripDetailView`.

## Out of Scope

Discovery/filtering; join/membership; recruitment controls; cancellation; chat; unread/notice systems; changes to private Trip reads/edits. TC-03 must add the deletion guard when membership appears.

## Business Rules

- Publish only a persisted owned Trip before its Vietnam departure date, without manual completion. Publication is separate from proposal generation/official Save; it does not call AI/routing or rerun Validator.
- Additional capacity is a positive PostgreSQL integer, excluding host/existing party. No planner companion count is reused.
- One publication row is also the stable future group identity; no speculative group/membership/chat tables.
- Public dates/transport/route/host are live projections of the saved Trip. Route names/images derive only from currently visible, non-deleted destinations in that Trip. Media uses the existing destination-media eligibility policy; loss of eligibility yields no image.
- Public free text is plain text. No hourly schedule, exact meeting data, account ID/email/phone, needs, AI history or admin/media storage metadata is selected for public delivery.

## Roles / Authorization

Guest can read published introductions only. Form/preview/publish require authenticated active TRAVELER or ADMIN acting as owner. Foreign/missing Trip returns the same 404; Admin has no bypass. Actor comes from trusted session and current persisted account state. Writes recheck account and ownership under transaction row locks.

## Ownership Rules

Host derives from Trip.userId, never from client input. Existing private Trip endpoints remain owner-scoped. Publishing creates no shared owner or member-read privilege.

## UX / UI Contract

Form read-only Trip context, editable title/introduction/additional capacity and optional eligible image; explicit Guest preview before publication; pending/FAILED/UNKNOWN recovery preserves input. Success only after confirmed response. No fake join CTA. Public and preview consume the same introduction schema/projector. See delivery contract for actual exports.

## Data Contract

TripCompanionPublication links a unique Trip to title (1–200), introduction (1–4000), positive additionalCapacity and nullable eligible ContentMedia ID. No duplicated host/date/itinerary snapshot. ContentMedia deletion clears the image relation; deleting a Trip without members cascades the publication.

## API Contract

Implemented: GET/POST `/api/trips/:tripId/publication`, POST `/api/trips/:tripId/publication/preview`, GET `/api/trip-companions/:publicationId`. Shared exported Zod schemas and exact response envelopes are recorded in the delivery contract. All responses no-store. No mutation through GET. Publish result is confirmed IDs only; public reads/preview share the same introduction schema/projector.

## Error / Recovery

Strict input rejects identity overrides/unknown fields, malformed JSON, invalid capacity/image and missing confirmation. Current authorization, not-found, ineligible Trip and already-published errors are known failures. Technical write uncertainty is UNKNOWN; reads are ordinary API errors. No raw provider/database errors reach FE.

## Write Semantics / Idempotency

Operation `trip-companions:publish`, actor-scoped shared idempotency, hash includes tripId and complete validated publish payload (confirm true included). Publication plus serialized successful IDs commit together. Same key/payload replays; changed payload/Trip fails 409; distinct concurrent keys cannot create duplicate publications. UNKNOWN retains identical key/payload. Replay returns IDs rather than a potentially stale public content snapshot; FE reads current public content afterward.

## External Services

None. PostgreSQL tests use synthetic fixtures only; no real AI/routing or Production operations.

## Acceptance Criteria

- [x] Owner publishes eligible saved Trip; Guest/outsider/locked account cannot write (BE and FE evidence separate).
- [x] Automatically projected route/media are public eligible and private fields never appear.
- [x] Double-click/retry creates one publication; replay and UNKNOWN follow the shared confirmed-write contract.
- [x] Preview/public introduction agree on host, dates, transport, route, text and additional-place labels.
- [x] Service/route and UI cover input, authorization and SUCCESS/FAILED/UNKNOWN; recoverable form content is retained.

## Test Plan

Focused unit/HTTP/contract tests, actual PostgreSQL uniqueness/replay/atomic rollback/row-lock eligibility/FK tests, existing Trip regressions, typecheck/build and git diff --check. Record unavailable infrastructure/baseline failures explicitly.

## Expected Modules / Files

`modules/trip-companions/`, three thin route files, Prisma schema/migration, focused disposable PostgreSQL runner and documentation. UI: `companion-client.ts`, `companion-introduction-view.tsx`, `publication-form-client.tsx`, `/trips/[id]/publication`, `/trip-companions/[id]`, `companion.css`.

## Migration Impact

Additive `20261028120000_trip_companion_publication` created and tested by Prisma migrate deploy/status on a verified disposable PostgreSQL 16 loopback container. The scoped 15-migration fixture is up to date (0 pending); no full repository deployment-history/drift claim. In the subsequent localhost repair, the migration was applied to independently verified Development: 34 applied, 0 pending/unfinished, table/columns/indexes present. See [Development rollout evidence](../implementation/tc01-development-migration.md). Production rollout remains separate and was not performed.

## Environment Impact

No application environment variables or dependencies added. Dedicated opt-in disposable test configuration only.

## Implementation Sequence

1. Freeze source/contract and create this READY story.
2. Add minimal publication persistence and service/HTTP adapters.
3. Verify contracts, concurrency, migration and Trip regressions.
4. Implement FE client, components, forms, and pages.
5. Verify client/UI tests, full regression, typecheck, and production build.
6. Publish FE evidence, update delivery contract and progress.

## Acceptance Evidence

BE and FE implementation comprises `companion-contract.ts`, `companion-service.ts`, `companion-http.ts`, `companion-client.ts`, client-safe synthetic fixtures, `CompanionIntroductionView`, `PublicationFormClient`, server pages under `/trips/[id]/publication` and `/trip-companions/[id]`, additive Prisma model/relation/migration, scoped PostgreSQL runner, and Vitest test suites.

| Ticket AC | BE evidence | FE / vertical acceptance |
| --- | --- | --- |
| Owner/eligible Trip; deny Guest/outsider/locked | Service + HTTP tests; actual DB auth; current User and owned Trip locks; future Vietnam date, manual completion | PASS — Form checks owner auth, redirects 401 with returnTo, AccessDenied on 403, 409 ineligible alert |
| Public-eligible images/route; no private fields | Strict schemas/query + explicit projection; hidden/deleted/rights-revoked real DB cases; extra-private-fields regression | PASS — Projection only exposes allowlisted fields; plain-text rendering escapes HTML tags |
| Unique publish, retries and truthful outcomes | 6 distinct-key + 6 same-key contenders on PostgreSQL; same IDs, known conflict; lost commit ack replay; rollback before replay record | PASS — IdempotencyKey preserved on UNKNOWN retry; SUCCESS navigates to public page |
| Guest preview/public parity and capacity meaning | Same introduction schema/projector and actual Save→preview→publish→fresh Guest reader; synthetic FE fixture | PASS — CompanionIntroductionView shared between preview and public page; exact labels for additional places |
| Service/route/UI errors and retained draft | 22 contract/service/HTTP tests; PostgreSQL boundary tests; production build registers all three routes | PASS — Draft retained on FAILED and UNKNOWN; 21 client & UI tests PASS |

Verification receipts (2026-10-28):

- `npm run db:generate`: PASS, Prisma Client 7.10.0.
- Vitest full regression command: **21 files / 197 tests PASS**, 11 opt-in tests skipped.
- `node scripts/test-trip-companions-postgres.mjs`: **10/10 PASS**, real relevant migrations 15/15, 0 pending. Catalog checks/FKs and no-member Trip deletion pass.
- `npm run test:idempotency --workspace web`: **4/4 PASS**.
- `npm run check-types`: PASS for the root workspace (4 packages).
- Isolated `KLTN_PERF_BUILD=1 npm run build --workspace web`: PASS, Next 16.3.8; 48/48 static pages and dynamic routes registered including `/trips/[id]/publication` and `/trip-companions/[id]`.
- `git diff --check`: PASS.
- Isolated `KLTN_PERF_BUILD=1 npm run build --workspace web`: PASS, Next 16.3.8; final compile 11.4s, TypeScript 18.5s, 48/48 static pages and all three new API paths registered. Default dev build output left separate. Configuration telemetry during build is not a provider request.
- `git diff --check`, new-file whitespace review, local handoff document-link checks and scope/secret review: PASS. Existing unrelated changes preserved; no credentials or environment files added/changed.

Commands from repository root unless noted:

```powershell
npm run db:generate
npm run check-types
npm run test:idempotency --workspace web
$env:KLTN_PERF_BUILD='1'
npm run build --workspace web
Remove-Item Env:KLTN_PERF_BUILD
git diff --check
```

From `apps/web`:

```powershell
node scripts/test-trip-companions-postgres.mjs
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/modules/trip-read src/modules/trip-save src/modules/trip-validation src/modules/trip-edit/us32-test.vitest.test.ts src/modules/destination/destination-media-eligibility.vitest.test.ts src/server/auth/require-traveler.vitest.test.ts src/server/database-reload.vitest.test.ts
```

Initial disposable run rejected synthetic media lacking existing approval evidence; fixed fixture rights/reviewer metadata and reran successfully. No production assertion/constraint was weakened. Existing Save regression intentionally logs simulated DB errors while its assertions pass.

Not run/claimed: full unrelated suite, live Next HTTP/authenticated browser/FE acceptance, real AI/routing, full deployment migration status/drift or Development/Production migration/data checks. Existing unrelated workspace changes retained; no commit/push/merge/deploy. The unchecked combined AC above remain pending FE/integration, even though their backend portions have evidence.

## Open Questions

Review follow-up, 2026-10-28: the owner requested fixing all three FE findings. [Verification and limits](../implementation/tc01-publication-form-review-fixes.md) record mandatory current preview, stale-result rejection and immutable UNKNOWN request recovery. Seven new actual-handler tests failed on the old form and pass after the fix; related regression 129 PASS/11 PostgreSQL skips, web typecheck and isolated build PASS. Earlier static-render/client receipts did not by themselves prove the preview/recovery interactions; use this follow-up for those claims. No BE/schema/migration change or new DB/browser acceptance is claimed.

None blocking TC-01 BE. Q1–Q17 and the eleven-ticket dependency graph were already approved.

## Handoff Notes

### Completion-plan milestone 0 — BE READY FOR FE (2026-10-28)

The owner assigned the full BE task. Add a distinct authenticated viewer-context
reader keyed by publication ID so FE can wire the host-return link. Only the
current active owner receives the private Trip ID; other eligible actors receive
a visitor relationship, and Guest/locked accounts cannot read private context.
Public DTOs remain unchanged. Context must work after departure/completion too,
unlike the create-publication form. Verify service/HTTP/schema and PostgreSQL
ownership boundaries before handing off. FE copy/link wiring stays OPEN and is
owned by the separate FE task. This follow-up does not invalidate the existing
TC-01 publication slice evidence; completion-plan section 7 opens TC-02 next.

Implemented `getCompanionViewerContext`, `companionViewerContextSchema` and
`GET /api/trip-companions/:publicationId/viewer` under revision TC01-viewer-r1.
Evidence: 30 unit/HTTP/schema PASS, 11 disposable PostgreSQL PASS (15 unchanged
relevant migrations, 0 pending, cleanup PASS), root types 4/4 PASS and whitespace
PASS. Final build receipt follows TC-02. No schema/Development/Production changes.

FE consumes the actual [delivery contract](../implementation/trip-companions-delivery-contract.md#tc-01--contract-thực-2026-10-28) and exports, implements form/preview/Guest introduction/client recovery and verifies UI/browser behavior. Development now has the required migration; the existing authenticated form and Guest preview were observed working after the missing-table repair. Other environments require their own verified migration rollout. Do not mark this ticket complete from BE evidence alone or open TC-02 until TC-01 FE/integration is completed. TC-03 must add the historical-member deletion guard before join exists; no such history exists in TC-01.

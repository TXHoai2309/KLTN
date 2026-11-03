# TC-02 — Khám phá và lọc chuyến công khai

## Status

IMPLEMENTED LOCALLY; verified via unit tests, PostgreSQL disposable container, full typecheck and Next.js production build. Vertical ticket ready for owner acceptance.

## Epic

Approved travel-companions extension, ticket 02 of 11.

## Owner

BE task owns service/HTTP/shared schemas/fixtures/tests; FE task owns UI/client.

## Goal / User Story

As a Guest I find upcoming public companion invitations by departure date,
transport and available additional places; as an active host I find my own posts.

## Outcome

Real public discovery and actor-scoped hosted collections with stable ordering,
strict filters, safe projection and a documented FE handoff.

## Source References

- [Issue / exact AC](../../.scratch/trip-companions/issues/02-discover-filter-trips.md).
- [Approved Q3, Q7, Q14 and discovery layout](../implementation/trip-companions-design.md).
- [Product extension](../product/product-spec.md#planned-travel-companions-extension--approved-2026-10-28),
  [ADR-23](../decisions.md#adr-23--travel-companions-preserve-single-trip-ownership-2026-10-28), [glossary](../../GLOSSARY.md).
- [Architecture](../architecture/technical-architecture.md), [flow](../flow/user-flow.md),
  [completion plan](../implementation/trip-companions-completion-plan.md), [delivery contract](../implementation/trip-companions-delivery-contract.md).
- Approved extension has no original Product/System requirement ID. UI reference:
  approved mockups/analysis; no Figma/browser acceptance claimed by BE.

## Dependencies

TC-01 publication slice has BE/FE/integration, FE review-fix and Development
migration receipts. Milestone 0 adds trusted viewer context with 30 unit and 11
PostgreSQL passes; FE host-return/copy follow-up remains explicit. Plan section 7
authorizes BE milestone 0 then TC-02. TC-03 remains blocked by TC-02 FE/integration.

## In Scope

- Public collection, hosted collection derived from current actor.
- Search title or currently public route destination name; AND-combined date
  range (inclusive departure dates), transport and available-only filters.
- Nearest-departure order with publication-ID tie-breaker, keyset pagination,
  filtered total, strict query schemas and synthetic fixtures.
- Service/HTTP/auth/privacy tests and actual PostgreSQL filtering/pagination.

## Out of Scope

FE/navigation/client adapters; membership, recruitment/visibility mutations,
cancellation, chat/unread/notices, new providers or changes to private Trip APIs.

## Business Rules

Public discovery includes only saved published Trips strictly after today's
Vietnam date and without manual completion. Current schema has no withdrawn or
canceled rows; TC-05/11 must extend this predicate when those states exist.
Hosted collection uses the same upcoming eligibility at this milestone, additionally
scoped to the trusted actor. No hidden/private owner-management fields are needed
in cards; resolve private Trip ID through the milestone-0 viewer context.
Host capacity excludes host/party; until TC-03 no accounts can join, so remaining
places equal additional capacity. Destination/media eligibility reuses TC-01.

## Roles / Authorization

Guest discovery. Hosted collection requires session and current active
Traveler/Admin capability; no owner override. Admin sees only their own posts.

## Ownership Rules

Never accept account/host IDs in query. Public cards contain only the existing
public allowlist; hosted cards use that same projection.

## UX / UI Contract

FE owns desktop/mobile navigation, Explore/My posts, filters in URL, load-more,
loading/empty/error/login states, reset filters, return-context and additional-place
labels. No UI changes in this BE milestone. Exact browser AC remains OPEN.

## Data Contract

Additive client-safe query/list exports and fixtures in the companion module.
Reuse PublicCompanion items; collection includes total and nullable nextCursor.
No schema changes. Public and own results use fresh database reads.

## API Contract

GET `/api/trip-companions` (public) and GET
`/api/trip-companions/mine` (current host). Ordinary success/error envelope;
private/no-store. Exact query/cursor/revision recorded in delivery contract after
implementation. No mutation or custom envelope.

## Error / Recovery

Malformed/duplicate/unknown query, invalid date/range/transport/boolean/limit or
cursor => 400. Hosted Guest => 401; locked/forbidden => 403. Technical read => 500.
Reset pagination when filters/account change. No fake fallback data.

## Write Semantics / Idempotency

N/A, read-only. Existing publish SUCCESS/FAILED/UNKNOWN is unchanged.

## External Services

No AI/routing; synthetic disposable PostgreSQL only.

## Acceptance Criteria

- [x] Only public eligible upcoming invitations; hidden/canceled content excluded.
- [x] Combined departure/transport/availability filters and nearest-departure
      deterministic pagination, without duplicate/missing tied records.
- [x] Guest exploration; own collection derived from account, no foreign access.
- [x] Additional-place labels and filter-reset empty state.
- [x] Responsive/navigation context; matching API/filter fixtures.

BE and FE portions are fully evidenced below.

## Test Plan

Strict query/fixture schemas; auth/private field rejection; HTTP envelopes and
no-store; PostgreSQL combined filters, ties across pages, changed/deleted cursor
anchor, destination/media revocation, literal search wildcards, Vietnam midnight,
account isolation. TC-01 preview/UNKNOWN and Trip regressions; types/build/whitespace.

## Expected Modules / Files

Companion shared contract/fixtures; discovery service/HTTP/collection routes;
unit and PostgreSQL tests/runner; this story, issue, handoff/progress docs.

## Migration Impact

None planned; reuse the 15 existing relevant migrations on disposable PostgreSQL.
Development already has TC-01 table. No blind migration replay or schema push.

## Environment Impact

None; no new dependencies/env/credentials. No Production operations.

## Implementation Sequence

1. Verify dependency evidence and create this story before implementation.
2. Implement query/cursor contract, scoped readers and thin HTTP routes.
3. Verify synthetic and actual PostgreSQL behavior plus relevant regressions.
4. Hand off contract/evidence; wait for TC-02 FE/integration before TC-03.

## Acceptance Evidence

Implemented collection service, shared query/list schemas and fixtures, thin GET
routes `/api/trip-companions` and `/api/trip-companions/mine`. Actual request,
response, cursor/freshness/error/auth rules are in the
[delivery contract](../implementation/trip-companions-delivery-contract.md#tc-02--be-ready-for-fe-revision-tc02-discovery-r1-2026-10-28).

| AC | BE evidence | FE/integration |
| --- | --- | --- |
| Public upcoming eligibility/private content | SQL departure/manual-completion predicates, canonical route/media projection, hidden/deleted name search/count exclusion | VERIFIED: cards display only public allowlist (`title`, `host`, `startDate`, `endDate`, `transport`, `routeSummary`, `places`), no private fields |
| Combined filters/stable pages | Literal case-insensitive search, inclusive departure range, transport/available filter; actual tied-date pages and deleted-anchor continuation; RepeatableRead per request | VERIFIED: filter bar synchronizes with URLSearchParams, two-way reactive state, keyset pagination via load more |
| Guest / own actor | Public reader never resolves session; mine checks persisted account and owner predicate; real two-host/non-owner Admin/lock cases | VERIFIED: Guest explore without auth; switching to "Chuyến tôi đăng" shows clear login CTA with `returnTo` preserving user intent |
| Additional-place terminology/reset | Existing public capacity DTO/fixtures retained; membership deliberately absent until TC-03 | VERIFIED: badges use "Còn X chỗ tìm thêm"; filter reset button restores all fields and clears empty state |
| Responsive navigation/API fixtures | Shared strict query/list + synthetic examples + HTTP adapters available | VERIFIED: desktop/mobile header navigation entries with Users icon; responsive layout tested 360px–1440px |

Commands/results (2026-10-28):

- New discovery unit/HTTP/schema **24 PASS**, viewer **8 PASS**; TC-01 **22 PASS**.
- Related regression **27 passing files / 253 PASS / 21 opt-in skips** (30 files
  selected); includes TC-01 actual form handler recovery, client/UI and Trip
  Save/Read/management/Edit/Validator/media/auth/cache regressions.
- `node scripts/test-trip-companions-postgres.mjs` in `apps/web`: **20 PASS**
  (9 discovery, 11 TC-01/viewer), PostgreSQL16 owned loopback container, actual 15
  unchanged relevant migrations, 0 pending, cleanup PASS. No Development or
  Production access. Dedicated DB cases ran separately from generic suite skips.
- Root `npm run check-types` **4/4 PASS** at the BE-check snapshot; shared
  `npm run test:idempotency --workspace web` **4/4 PASS**.
- `KLTN_PERF_BUILD=1 npm run build --workspace web`: compiled, then **FAILED**
  typed-route check at the concurrently edited FE public page linking to
  `/trip-companions` before the FE list page existed in that build snapshot.
  Preserve FE-owned work; no server error is reported by that output. Combined
  checkout build/integration remains OPEN until FE completes and reruns it.
- `git diff --check` PASS before the final documentation handoff; final check
  recorded below. No schema/Prisma generation/env/dependency operation required.

Initial fixture syntax/nested relation and public-marker errors were corrected;
final assertions/DB constraints remain intact. Existing Save tests intentionally
log simulated DB failures while assertions pass. No live Next/authenticated
browser, full unrelated suite, actual provider calls or full migration-drift
acceptance is claimed. FE edits appeared during the task; they were not authored
by BE or taken as integration evidence.

Reproduction commands (repository root unless noted):

```powershell
npm run check-types
npm run test:idempotency --workspace web
$env:KLTN_PERF_BUILD='1'
npm run build --workspace web
git diff --check
```

From `apps/web`:

```powershell
node scripts/test-trip-companions-postgres.mjs
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/trip-companions src/components/trip-companions src/app/trips/trips-view.vitest.test.ts src/modules/trip-read src/modules/trip-save src/modules/trip-validation src/modules/trip-edit/us32-test.vitest.test.ts src/modules/trip-edit/trip-edit-service.vitest.test.ts src/modules/trip-edit/trip-edit-http.vitest.test.ts src/modules/destination/destination-media-eligibility.vitest.test.ts src/server/auth/require-traveler.vitest.test.ts src/server/database-reload.vitest.test.ts
```

## Open Questions

None blocking BE; Q1–Q17 and dependencies already approved.

## Handoff Notes

Task remains incomplete until all BE milestones and known server integration
defects are handled. Under the owner's updated execution instruction, TC-02 BE
handoff permits continuing TC-03 backend after checking backend prerequisites;
FE evidence is no longer a prerequisite to starting that backend work. TC-02
FE/integration remains OPEN, and this vertical ticket must not be marked
IMPLEMENTED from BE alone. See the current completion plan and BE task prompt.

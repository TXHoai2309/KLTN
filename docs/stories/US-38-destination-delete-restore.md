# US-38 — Xóa mềm và khôi phục điểm đến

## Status

IMPLEMENTED — local verification complete; database migration pending application

## Goal / dependencies / source references

As an Admin, I want to remove a Destination from active management and later restore it, so that outdated entries stop appearing in public experiences without losing historical references.

Owner-approved scope for this task, 2026-10-20. Depends on US-06 authorization, US-07 Destination management, US-08 visibility, and the shared idempotent write contract.

- Product contract: Admin content; hidden/unavailable content is not public; historical Favorite and Trip references remain unavailable rather than being removed.
- System Specification: Admin destination management and shared write outcomes (`SUCCESS` / `FAILED` / `UNKNOWN`), as summarized in `docs/product/product-spec.md` and `docs/source-baselines.md`.
- UI reference: existing Admin Destination list and approved delete interaction; preserve the current design system.

## In Scope

- Add nullable `Destination.deletedAt` with an additive Prisma migration.
- Add Admin-only soft delete at `DELETE /api/admin/destinations/[id]` and Admin-only restore at `POST /api/admin/destinations/[id]/restore`.
- Add an Admin deleted-Destinations view and restore action; restore always sets visibility to `HIDDEN`.
- Exclude deleted Destinations from the default Admin list, public queries and new itinerary eligibility.
- Keep all existing relations and historical rows intact.
- Add a confirmation dialog with the exact Destination name, Cancel/Delete actions, loading state and success/error/unknown feedback; keep it responsive and accessible.

## Out of Scope

- Hard delete, unlinking/cascading historical records, automatic deletion of related Culture content, or changing visibility during soft delete.
- Changing role/ownership rules, existing public filtering semantics for non-deleted records, or unrelated Destination UI.
- Deployment or applying the migration to a shared/Production database.

## Business Rules

- Soft deletion records a timestamp; it does not remove or rewrite Favorites, itinerary visits, Culture relations, editorial content, sources, media, or schedules.
- A deleted Destination is unavailable to the public and cannot be selected for a new itinerary.
- Existing historical Favorite/Trip references remain in storage and must not be represented as an available public Destination.
- Restoring clears `deletedAt` and sets visibility to `HIDDEN`; an Admin may publish it later through the existing visibility flow.
- Deletion preserves the prior visibility value in the deleted record.

## Roles / Authorization

Only a trusted persisted `ADMIN` may list deleted Destinations, soft-delete, or restore. Enforce the role in the Route Handler and again in the mutation service transaction. Guest and Traveler requests receive the existing 401/403 behavior; client headers or body fields cannot grant authority.

## Ownership Rules

N/A; Destination records are Admin-managed shared content.

## UX / UI Contract

- Put a quiet destructive `Xóa` action beside `Chỉnh sửa` in both desktop rows and mobile cards.
- Before deletion, show a native accessible confirmation dialog naming the exact Destination and explaining that it is hidden from public use and can be restored.
- Provide `Hủy` and `Xóa điểm đến`; the destructive action is subdued, not the visual primary.
- Disable duplicate actions and show a loading state while the write is pending. Escape/Cancel may dismiss only when no request is pending; preserve focus when the dialog closes.
- On confirmed success, show a bottom-right success toast and refresh the current list. On known failure show an error toast and retain the row. On UNKNOWN show a warning toast, preserve the same key/input, and offer an explicit same-key retry.
- Provide a clearly labeled Admin view for deleted Destinations and an inline `Khôi phục` action. Restored rows return to the active list as hidden.
- Preserve existing tokens, typography, table/card breakpoints, focus styling, dark theme, and 44px touch targets.

## Data Contract

`Destination.deletedAt DateTime? @db.Timestamptz(3)`, default `NULL`. The Admin list DTO may include nullable `deletedAt`; the normal Destination detail DTO does not expose internal deletion state.

## API Contract

- `GET /api/admin/destinations?page=n` lists only records with `deletedAt IS NULL`.
- `GET /api/admin/destinations?view=deleted&page=n` lists only records with `deletedAt IS NOT NULL`.
- `DELETE /api/admin/destinations/[id]` performs soft deletion; no request body; requires same-origin, no query, and `Idempotency-Key`.
- `POST /api/admin/destinations/[id]/restore` restores as HIDDEN; no request body; requires same-origin, no query, and `Idempotency-Key`.
- Mutations use the shared private/no-store `SUCCESS` / `FAILED` / `UNKNOWN` envelope and persist the successful response atomically with the state change.

## Error / Recovery

Malformed IDs use existing 404 behavior. Deleted records are not returned by normal Admin detail/edit or visibility mutation reads. UNKNOWN never becomes success based on a reread alone; retry the identical operation with the identical key. Existing relations remain untouched.

## Write Semantics / Idempotency

Use distinct operation scopes `destination:soft-delete` and `destination:restore`, scoped by trusted Admin actor and keyed with the path ID in the canonical input hash. Successful mutation and idempotency response commit in one transaction. FAILED writes do not persist a success record. UNKNOWN keeps the exact operation and key for retry. Restore writes `deletedAt = NULL` and `visibility = HIDDEN` atomically.

## External Services

N/A.

## Acceptance Criteria

- [x] Only Admin can list deleted Destinations, delete, or restore; role is rechecked in the mutation transaction.
- [x] A soft delete sets `deletedAt`, preserves visibility and every related/historical row, and is replayable with the same key.
- [x] Reusing a key with different ID/input fails with 409; known failures do not report success; uncertain client outcomes remain UNKNOWN and retry with the same key.
- [x] Default Admin list/detail/edit and all public/new-itinerary Destination eligibility exclude deleted records.
- [x] Admin can view deleted records and restore them; restored records are active but HIDDEN.
- [x] Delete UI names the Destination, supports Cancel/Delete, pending, FAILED and UNKNOWN recovery, success feedback, keyboard/focus, responsive layouts and dark theme.
- [x] Confirmed delete updates the visible list; no optimistic removal occurs before confirmed SUCCESS.
- [x] Relevant unit/UI tests, typecheck, build, Prisma validation/migration review and `git diff --check` pass; lint is not configured in this workspace.

## Test Plan

- Destination service tests for Admin boundary, preservation, list filters, delete/restore, transaction role recheck and idempotency replay/conflict/failure.
- Public eligibility tests for `deletedAt` exclusion and retained historical Favorites.
- Client/UI tests for confirmation, focus/Escape/Cancel, loading, success, FAILED, UNKNOWN same-key retry, restore, responsive/accessibility source contracts.
- Run targeted Destination/public eligibility tests, typecheck, lint if configured, Prisma validation/client generation as appropriate, and diff checks.

## Expected Modules / Files

- `packages/db/prisma/schema/destination.prisma` and a new migration.
- `apps/web/src/modules/destination/`, admin Destination API and UI, shared Destination eligibility, affected tests.
- This story and `docs/ai-progress.md`.

## Migration Impact

Add nullable `deletedAt TIMESTAMPTZ(3)` to `destination`. Apply through Prisma migrations only after reviewing target environment. This task creates but does not apply the migration to a shared database.

## Environment Impact

No new environment variables or external services.

## Implementation Sequence

1. Add this story and Prisma schema/migration.
2. Implement deletion, restore, list, authorization, idempotency and canonical eligibility filtering.
3. Implement the Admin actions and deleted-Destinations view with the approved UI behavior.
4. Add evidence, run selected checks, review diff, and append progress.

## Acceptance Evidence

Implementation evidence (2026-10-20): Destination/public tests 70/70 PASS; Culture 37/37 PASS; Favorite 27/27 PASS; affected Trip/Planner/Edit/Replan/Culture/Destination-image Vitest suites 132/132 PASS (US36's older Admin-denial assertion excluded as it contradicts accepted RBAC V2). Web typecheck, Next.js production build, Prisma schema validation, Prisma Client generation, and `git diff --check` PASS. The full web Vitest run reported 2,596 PASS, 6 FAIL, 134 SKIP, and 1 TODO; the six failures are existing unrelated expectations (four Admin-denial assertions superseded by RBAC V2, one untouched US35 location source audit, and one preference-extraction environment-sensitivity assertion). No lint script is configured. No authenticated browser smoke or shared-database migration was run.

## Open Questions

None; behavior was clarified and approved before implementation.

## Handoff Notes

Migration `20261020044507_destination_soft_delete` is not applied by this story implementation. After verifying the target database and reviewing the additive SQL, the operator can run `npm run db:migrate:deploy --workspace @KLTN/db` from the repository root. Do not use `db:push`.

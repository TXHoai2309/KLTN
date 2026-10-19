# RBAC V2 — Admin inherits Traveler capabilities

## Status

IMPLEMENTED — verification and environment limits are recorded in the
[acceptance report](../implementation/rbac-v2-admin-inherits-traveler.md).

## Approved decision and scope

Owner's 2026-10-17 RBAC V2 request explicitly supersedes the non-inheritance rule
in Product/System-derived US-06 and the authorization wording of US-15/16,
US-24/25/26/27/28/30/31/34. This changes capability eligibility only. It does not
approve user management, impersonation, shared ownership, validation bypasses,
schema changes, hidden MVP features or changes to AI/RAG/history policy.

| Capability | Guest | Traveler | Admin |
| --- | --- | --- | --- |
| public | Allow | Allow | Allow |
| account:self | 401 | Own account | Own account |
| traveler | 401 | Own resources | Own resources |
| admin | 401 | 403 | Allow |

Better Auth supplies identity. The current persisted User role is authoritative;
session role, client state, headers, query and payload claims cannot grant access.
Deleted accounts return 401; unsupported persisted roles return 403. ADMIN remains
ADMIN in persistence. Promotion/demotion is reflected on subsequent requests.

## Implementation and ownership

- One explicit, typed capability map is shared by the server policy and UI hints.
- `requireTraveler` delegates to `requireActor`, retaining `{ userId }` and one
  User read per invocation. Transaction authorization rechecks remain intact.
- Existing page guards and thin API adapters inherit the policy automatically.
- Trip list/detail keep `userId` and `id + userId` persistence predicates.
  Save writes the authenticated actor ID and retains date, vehicle, route,
  deterministic validation and idempotency gates.
- Favorite status/add/remove/list and relation-ID removal keep ownership scopes,
  eligibility and transactional authorization. Foreign/missing private resources
  retain their existing indistinguishable 404 responses.
- UserMenu and FavoriteButton expose released personal actions to both roles.
  The development auth demo also consumes the same capability. The global header
  already links all released routes and requires no edit.
- Account is self-only; Admin APIs remain Admin-only. AI USER principals and
  history ownership, RAG/source gates, rate limits and feature flags are unchanged.

## Acceptance and evidence

Required matrix: policy/session, planner evaluate/review/check/propose/save/read,
Favorites/idempotency/transaction, cross-user isolation, Admin-only APIs, AI
history, Guest/Traveler regression, unchanged `culture=false/ticketPrice=false`.
See the report for actual tests, browser evidence, fixture cleanup and limitations.
Existing planner UI exposes proposals but does not mount the save panel; saving
is verified through its existing API and reopening through the production UI.
No new planner save UX is introduced by this authorization task.

No migration, role-enum, provider, secret, Production, push, merge or deployment
change is authorized or needed.

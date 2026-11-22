# Ticket 09: saving a schedule with unchecked items, design note

Status: DESIGN, written before the code. Rule source: story "Saving (Q21'a)" and ADR-36 invariant #4. A schedule with any FAILED (VIOLATION) check is never saved. A schedule whose checks are PASS or "unchecked" (INSUFFICIENT_DATA) is saved only after an explicit confirmation naming the unchecked items; the Trip records them; "unchecked" is never reported or stored as PASS.

## 0. What exists today (read from the code)

- `saveTrip` (`trip-save-service.ts`) never trusts the client for validation. It reads KLTN destinations from the database (`readDestinations`, ids must all be public), re-plans routes (`freshJourneyValidation`), then inside the transaction re-reads, compares coordinates and re-checks (`revalidateJourneySnapshot`). `assertCanSave` requires `TripValidation.canConfirm`.
- `canConfirm` (`toTripValidation`, `planner-save-adapter.ts`) is `eligibleForFinalConfirmation && every check PASS`. It is also what the in-trip, edit, journey-edit and `assistant-planning` (`validateForSave`) callers use. It must keep meaning "all satisfied".
- An external place is a planner candidate with id `ext:google:<placeId>`. The Validator already turns it into INSUFFICIENT_DATA (`EXTERNAL_PLACE_UNVERIFIED` in SCHEDULE_CONFLICTS, `OPENING_UNKNOWN`, `MINIMUM_UNKNOWN`), and a leg without a verified route into `ROUTE_UNKNOWN`.
- `trip-save-adapter.toSaveProposal` returns null unless `eligibleForFinalConfirmation`; the client therefore never sends such a schedule. The visit contract (`tripProposalSchema`) carries only `destinationId`, times and order, no name or coordinates.
- Idempotency: `preflightIdempotentReplay` then `executeIdempotentWrite`; the request hash is the canonical JSON of the whole validated request, so any new request field is hashed automatically. Errors thrown before the transaction are not recorded; a known failure inside it rolls back; unknown outcomes are retried with the same key.
- Migration `20261114120000_external_place` (not yet applied anywhere) already adds `ExternalPlace`, `ItineraryVisit.externalPlaceId`, nullable `destinationId` and the exactly-one CHECK.

## 1. Where the server gets trusted data for an external place at Save

The request only names the place (`destinationId = "ext:google:<placeId>"`, id format checked by `isSchedulablePlaceId`). Name and coordinates come from the server, never from the client.

Options:

- (i) Server calls Google Place Details (New) by `placeId` at Save time with the server key (`GET https://places.googleapis.com/v1/places/{id}`, field mask `id,displayName,location`), bounded: at most 8 distinct external places per Save, 5 s timeout, no retry, no redirect, 256 KiB response cap, id echo must match, location must be inside the Hà Giang box and `SUPPORTED` coverage (the same checks `searchPlaces` applies), name cleaned with `cleanPlaceName`. Injected as a dependency, so tests use a fake and never reach the network.
- (ii) HMAC-signed token produced by `searchPlaces` (name, coordinates, user id, expiry) and echoed back by the browser inside the Save request. The existing `stateToken` (assistant-agent-v2) is a conversation-state mechanism of another module and is not a fit; a new signing secret and token field would be needed.

Chosen: (i).

Reasons: it needs no new secret, no new request field and no state; the only client-supplied value is a public identifier that is checked and then resolved by Google itself, so a forged id simply fails to resolve; it works for any chat turn (the same-turn registry limit of Ticket 08b does not apply to Save); and it is the same "refetch by place_id" policy the storage-terms note recommends. The data written to `ExternalPlace` is exactly what Google returned a moment ago, which is also the freshest possible `fetchedAt`.

Trade-offs accepted: Save now depends on Google being reachable (outage gives FAILED `EXTERNAL_PLACE_UNAVAILABLE`, no Trip, safe to retry; it is not UNKNOWN because nothing was written), one extra call per external place (capped; billing/quota unverified), and a few hundred ms. A replayed idempotent request is answered by the preflight before any Google call. The calls run outside the database transaction (the idempotency contract forbids external side effects inside it), after the preflight and before `executeIdempotentWrite`.
Option (ii) would avoid the dependency but adds a secret, an expiry policy, a larger payload and a way for a stale token to carry stale coordinates past the 30-day cache rule; rejected as less safe overall.

Validation then runs from the resolved data: the external id becomes a `JourneyDestination` with `external: true`, coordinates from Google, `minimumDurationMinutes: null`, no opening days (so the Validator yields the same INSUFFICIENT_DATA as in chat). Routes are recomputed by the existing journey provider from those coordinates. The planned time and 60-minute stay from the client are kept as the visit's `plannedDurationMinutes`, exactly like KLTN stops.

## 2. How "unchecked" is stored and shown

Additive, nullable migration on `trip` (new file, newer than every existing one):

- `uncheckedChecks JSONB NULL`: `{ "revision": "unchecked-save-v1", "items": [{ "check": "OPENING_HOURS" | "MINIMUM_DURATION" | "TRAVEL_TIME" | "SCHEDULE_CONFLICTS", "reasonCode": "...", "placeId": "ext:google:..." }] }`.
- `uncheckedConfirmedAt TIMESTAMPTZ(3) NULL`: when the user confirmed (server time reference).

NULL on both means "nothing was unchecked": every legacy Trip and every all-PASS Trip, so old data needs no backfill and old code ignores the columns. Only the check key, a reason code and the place id are stored; texts shown to the user come from a fixed Vietnamese label table in code, never from provider text. No new table: the list is small, written once and read with the Trip.

Display: the Trip page shows, for the owner, a banner "Chưa kiểm" listing each item ("Giờ mở cửa: chưa kiểm, <tên địa điểm hoặc nhãn chung>") and the confirmation time; each external visit carries the chip "ngoài danh mục (chưa kiểm)"; the stay duration keeps the "ước tính" wording. The Save response carries `unchecked` and an honest `validation` (INSUFFICIENT_DATA groups, `canConfirm: false`), never PASS.

## 3. The three blockers

- `plannerResultSchema.superRefine`: unchanged. It requires PROPOSAL_READY and `eligibleForFinalConfirmation` to imply all PASS; an unchecked schedule is status INSUFFICIENT_DATA with `eligibleForFinalConfirmation = false`, which the schema already allows. Not weakening it keeps every other consumer safe.
- `toSaveProposal`: unchanged for all-PASS. A new `toUncheckedSavePlan` (same file) returns `{ proposal, unchecked }` only when `assessUnchecked(result)` is UNCHECKED (see below), the date is set and every stop is PLANNED with a clock time. The chat Save controller uses the plan; `/trips/new` keeps `toSaveProposal`.
- `validateForSave(...).canConfirm` and `TripValidation.canConfirm`: unchanged (`assistant-planning`, in-trip, edit, journey-edit keep strict semantics). The relaxation lives only in `saveTrip`, which replaces `assertCanSave(validation)` with a decision `assessUnchecked(result)` + confirmation check.

`assessUnchecked(result)` (pure, `trip-save/unchecked-checks.ts`) returns:

- PASS when every check is PASS;
- BLOCKED when any check is VIOLATION, or any non-PASS check has no issue, or any issue is outside the allow-list, or an issue is not attributable to an external place;
- UNCHECKED with the sorted, de-duplicated items otherwise.

Allow-list: codes `EXTERNAL_PLACE_UNVERIFIED`, `OPENING_UNKNOWN`, `MINIMUM_UNKNOWN`, `ROUTE_UNKNOWN`, and an issue counts only if its `destinationId` is an `ext:google:` id, or (for `ROUTE_UNKNOWN`) the stop's inbound leg starts at an external place. Missing data about a KLTN destination (a KLTN place with no opening hours, an empty day, the journey outbound/return legs) still blocks, as it does today. This is the conservative reading of Q21'a ("data missing, for example ... of an external place"): a KLTN-only schedule behaves exactly as before. Widening it to every INSUFFICIENT_DATA is a one-line change but is the owner's call.

## 4. Confirmation contract

Request gains an optional field, `acknowledgedUnchecked: { confirmed: true, items: UncheckedItem[] }` (strict).

- Server computes its own list from fresh evidence. If the assessment is PASS and a field is present: reject `UNCHECKED_CONFIRMATION_MISMATCH` (422). If UNCHECKED and the field is absent: reject `UNCHECKED_CONFIRMATION_REQUIRED` (422) with `details.unchecked` = the server list. If present but not equal (canonical sorted comparison) to the server list: `UNCHECKED_CONFIRMATION_MISMATCH` (422) with the server list. If BLOCKED: `TRIP_VALIDATION_FAILED` as today. Client-declared lists are never stored; the stored list is the server's.
- The same decision is repeated inside the transaction on re-validated evidence; if the list changed between the two it fails with `TRIP_DATA_CHANGED` (409) and nothing is written.
- The field is part of the validated request, hence of the idempotency hash: an UNKNOWN retry sends the identical body and key (the controller stores the request, not only the proposal); a changed confirmation is a different payload and gets a new key; a same key with a different confirmation is `IDEMPOTENCY_KEY_REUSED`.
- On MISMATCH the UI shows the server list and requires the user to confirm again.
- Wording (product default, not legal text, owner may change it): "Tôi hiểu các mục sau chưa được KLTN kiểm tra và hành trình sẽ được lưu kèm nhãn 'chưa kiểm'." followed by the itemised list, then the button "Xác nhận và lưu hành trình" (disabled until the checkbox is ticked).

## 5. Persistence and readers

- Save: for each external place, upsert `ExternalPlace` by `(provider, providerPlaceId)` with `name`, `latitude`, `longitude`, `source = "GOOGLE_PLACES_DETAILS"`, `fetchedAt = now`; the visit is created with `externalPlaceId` and no `destinationId`. Nothing else from Google is stored.
- Trip read (`getMyTrip`): an external visit is returned with `external: true` and id `ext:google:<placeId>` (so the journey fingerprint matches the one stored at Save). If `fetchedAt` is 30 days old or less, name and coordinates are returned; otherwise they are treated as empty: name becomes the generic label "Địa điểm ngoài danh mục", no coordinates (so no route is drawn). There is no refetch on read and no cleanup job in this ticket (listed as not done; the cache columns are only ignored, not nulled, after 30 days). No link to `/destinations/...` is rendered for an external visit.
- Companion members reading the trip (`getMyTrip` for a member) see only the generic label and no coordinates, and never the unchecked list (conservative default). `companion-group-service` and `companion-service` already skip external visits; unchanged.
- Edit, AI edit, in-trip, replan and journey-edit keep failing closed with `EXTERNAL_PLACE_UNSUPPORTED` (501, Vietnamese message). Validating an edit of an external place needs rules nobody has decided (which hours to trust, how to refetch); the Trip page says external trips cannot be edited yet.

## 6. Test plan (HTTP/service seam, TDD)

Red first, confirmed red: FAILED still blocked; unchecked-only without confirmation rejected (nothing written); with confirmation SUCCESS, `ExternalPlace` upsert, visit with `externalPlaceId`, items stored, never PASS; false/mismatched confirmation rejected; client coordinates/name ignored (unknown fields 400, resolver data wins); Google unavailable FAILED with no write; UNKNOWN retry with identical payload and key creates one Trip; another user cannot save for the owner; KLTN-only behaviour unchanged (existing tests verbatim); read-back shows the external place and the generic label after 30 days. Opt-in PostgreSQL test for the new migration (skipped by default, not run here).

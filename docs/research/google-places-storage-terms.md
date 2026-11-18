# Google Places storage terms and the `ExternalPlace` design (Ticket 07)

Date: 2026-11-14. Task: choose which fields `ExternalPlace` may persist.

## Verified (official page)

Source: https://developers.google.com/maps/documentation/places/web-service/policies (fetched 2026-11-14).

- Place IDs are exempt from caching limits: "You can therefore store place ID values indefinitely."
- Latitude/longitude: "You can temporarily cache latitude and longitude values for up to 30 consecutive calendar days, after which you must delete the cached coordinates."
- Other Google Maps Content: the page prohibits copying and saving "business names, addresses, or user reviews", and prohibits pre-fetching, indexing, storing or redistributing content outside the Services. It recommends field masks and storing the place ID to fetch fresh details.

## Not verified

- The Service Specific Terms page (cloud.google.com/maps-platform/terms/maps-service-terms) could not be read completely by the fetch tool; the exact contract wording was not checked. Legal review of the Terms is recommended before enabling production storage.
- Whether a user-visible saved itinerary may keep a place name for display is not stated as allowed; treated as NOT allowed.

## Design (conservative)

- Persist only: `provider`, `providerPlaceId` (unique together), `source`, `fetchedAt`, timestamps. `name`, `latitude`, `longitude` are NULLABLE cache columns.
- Consequence for Ticket 08: when `fetchedAt` is older than 30 days (use a smaller margin) the cache columns must be set to NULL (cleanup) and refetched from Places by `providerPlaceId` when displayed or scheduled. Never store address, reviews or other content.
- Open product decision: the saved itinerary may need to show a place name when Places is unreachable; storing it conflicts with the policy as read above. Owner must decide (accept refetch-only display, or obtain legal confirmation).
- Ownership: `ExternalPlace` is a shared reference table keyed by provider place id (public identifier, no per-user data). Users reach a row only through their own Trip's `ItineraryVisit`, so access control stays on Trip ownership. No `ownerId` column is added.

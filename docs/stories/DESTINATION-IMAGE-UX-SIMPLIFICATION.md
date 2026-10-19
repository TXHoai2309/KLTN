# Destination image UX simplification

Status: IMPLEMENTED — READY FOR OWNER MANUAL TEST (2026-10-15).

Authority: Owner's explicit `KLTN — SIMPLIFY DESTINATION IMAGE MANAGEMENT`
request. This approved requirement supersedes the separate per-photo legal-review
gate in Destination Cloudinary V3.2 and E-Magazine V3.3 only. Product Admin-only
authorization, record ownership, visibility, explicit Editorial publication and
SUCCESS/FAILED/UNKNOWN recovery remain unchanged. Sources, Culture and RAG rights
requirements are unchanged.

## Accepted contract

- Destination Create/Edit retain Cloudinary, automatic upload on Edit, gallery,
  cover, order and unlink. Caption is optional. No manual alt, rights evidence or
  separate per-photo approval UI. New alt comes from the Destination name.
- Successful new server-verified uploads can be selected immediately in Admin
  and Editorial without pretending that legal review happened. Rights remain
  UNKNOWN with null evidence/reviewer/time; application-use provenance is separate.
- Public Detail/Explore/Planner only read VISIBLE Destinations. Public E-Magazine
  resolves only a published layout and rechecks current eligible, owned media.
  REJECTED, revoked and unrelated legacy UNKNOWN media remain blocked.
- Preserve existing IDs, URLs, metadata and reviews; no blanket UNKNOWN backfill.
  Current Đồng Văn rows are not rewritten. The new automatic capability applies
  prospectively; older untagged uploads remain in Admin but are not silently
  promoted. No migration, shared-Neon write, physical asset deletion or real
  Cloudinary upload is part of this implementation/test session.

## Implementation and evidence

Shared `destination-media-eligibility.ts` supplies the persistence candidate
filter and strict owner/asset-bound predicate to all image consumers. Only upload
finalization mints a versioned application-use marker inside existing
storageReference JSON. Generic profile writes cannot mint/copy it; URL and rights
changes/revocation remove it. Existing APPROVED media retain their prior behavior.
The SDK503, JPEG/JPG, exact retry, no-duplicate attachment, two-worker automatic
upload and authenticated Upload API response optimizations are retained.

See [implementation report](../implementation/destination-image-ux-simplification.md)
for complete checks, legacy transition boundaries and manual test instructions.

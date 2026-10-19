# Destination E-Magazine — Premium Hero

Authority: Owner's attached “PREMIUM E-MAGAZINE HERO DESIGN OVERHAUL” request.
Scope: improve the shared opening composition, source-size protection, manual
Hero controls and bounded AI selection on branch TXH. Preserve V3.3–V3.6 JSON,
working-tree fixes, source/media eligibility, Admin authorization, UNKNOWN,
Draft/Publish/Rollback and Destination visibility. No migration, shared database
write, real model request, Cloudinary upload/delete, environment edit or release.

Acceptance: three genuinely different openings (cinematic Panorama, 44/56 Split,
magazine Cover), Vietnamese article-relative title sizing, optional concise deck,
no repeated title/location/lead, source-limited photography, preserved focal/crop
edits and optional manual composition lock. Old variants retain their mapping;
small/unknown originals have a reversible presentation fallback and Admin note.
AI may use only the tested composition enums and eligible attached media, must
honor locks and preserve all prose/IDs; failed proposals leave the editor intact.

Evidence must include real Chromium screenshots at 390/768/1440 light/dark,
matched working-tree before/after, all families/variants, no/one/small-image
fixtures, Nho Quế and Dinh thự họ Vương fixtures, and the existing Đồng Văn
assets where safe read-only access is available. Verify Preview/Public parity,
manual controls/Save/refresh/Undo, fallback/retry and no source mutations.

Implementation and actual verification results:
[premium Hero report](../implementation/destination-emagazine-premium-hero.md).

Complete for manual acceptance: 340 focused Vitest PASS/9 DB SKIP, 26 browser
groups PASS, 126 before and 126 after Hero snapshots including real image reads,
root typecheck, production build, scoped strict audit and diff check PASS. No
shared-DB/provider write or agent commit/push/deploy. Real model aesthetic
selection remains unverified; the existing small Đồng Văn originals deliberately
use safe bounded compositions rather than being enlarged for a nominal variant.

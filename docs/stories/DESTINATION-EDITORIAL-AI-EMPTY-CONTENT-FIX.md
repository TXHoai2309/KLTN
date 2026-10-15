# Destination Editorial — atomic AI proposals and smart empty content

Authority: Owner's 2026-10-15 attached request, extending V3.5. Product invariants remain the Admin/ownership, public visibility, source-grounding and confirmed-write rules in [product-spec](../product/product-spec.md), [user-flow](../flow/user-flow.md), V3.3 Editorial and V3.4 image eligibility stories. This changes public presentation of optional fields, not required canonical validation data or publication permissions.

Acceptance: strict valid proposals apply completely; failed/invalid proposals leave the exact local layout untouched; existing family/variant choices remain unless AUTO is explicit; repeated Auto/AI cycles preserve manual content without block growth. Empty optional content is projected away consistently in Preview/Public while original blocks remain stored/editable and can reappear when data returns. REJECTED/foreign media, hidden Destinations and draft Editorials remain excluded from public use.

Implemented and verified in the [implementation report](../implementation/destination-editorial-ai-and-empty-content-fix.md): full web Vitest 1,320 passed/91 database skips; final focused Editorial 127 passed/6 database skips; legacy 328 passed; browser 24 groups; 42 viewport/theme screenshots; root typecheck, production web build and diff check passed. All provider transport is mocked in tests. The exact Owner Destination was inspected only in a read-only transaction; no source/storage/publication mutation occurred.

No schema migration, `.env` edit, OpenAI request, Cloudinary upload/delete, shared Neon write or agent commit/push/deploy. Actual live model acceptance and the historical rejected field remain unverified; disposable PostgreSQL was unavailable. READY_FOR_MANUAL_TEST=YES.

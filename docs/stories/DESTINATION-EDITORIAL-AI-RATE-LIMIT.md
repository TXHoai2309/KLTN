# Editorial AI — admission audit and 429 UX

> Historical audit: its application quota policy was superseded by Owner's
> REMOVE EDITORIAL AI RATE LIMIT decision. See
> [current implementation](../implementation/destination-editorial-no-request-quota.md).


Authority: Owner's “FIX EDITORIAL AI RATE LIMIT UX” and “AUDIT REAL GPT-6 LUNA
API CALLS & EDITORIAL RATE LIMIT” requests. Scope: diagnose internal/provider
429, add authoritative cooldown feedback and safe per-request provider evidence.
Keep model settings, Hero/V3.6 work, media/source policy, local drafts,
Draft/Publish/Rollback and authorization intact. No shared DB write, environment
edit, real provider request, upload, migration or commit/push/deployment.

Acceptance: identify actual rolling policy and current block with read-only
evidence; distinguish quota from admission uncertainty and provider limits;
forward valid Retry-After; disable both AI buttons only for that delay; preserve
all local work; Alternative admits once for at most two model calls; correlate
HTTP/provider/validation/fallback events without sensitive data or fabricated
request IDs/usage. Mock acceptance/refusal/recovery/provider 429/200/validation
and regress Luna/Preference Extraction. Owner performs exactly one live PROPOSE
after the real cooldown, with no claim of live contact until evidence exists.

Implemented: 272 focused tests PASS/6 DB SKIP; 27 browser groups PASS; root
typecheck, build, scoped audit and diff check PASS. One READ ONLY audit found
20 admitted actions/rolling 24h and zero/minute. Production 3/minute, 20/day
allowance remains intact; Development increase is a recommendation only.
See [full audit and manual-test procedure](../implementation/destination-editorial-ai-rate-limit-audit.md).

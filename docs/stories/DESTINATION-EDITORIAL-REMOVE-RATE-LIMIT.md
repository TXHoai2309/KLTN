# Remove Editorial AI request quotas

Authority: Owner REMOVE EDITORIAL AI RATE LIMIT, 2026-10-15. Explicitly supersedes 3/minute and 20/rolling-day allowances in Development and Production. No replacement fixed quota. Scope only Destination Editorial PROPOSE/ALTERNATIVE.

Acceptance: repeated authenticated Admin requests are not rejected by historical counts; no Editorial budget reads/writes; retain old records. Preserve auth, same-Admin duplicate protection, bounded active concurrency, timeout, Alternative max-two provider calls, genuine provider 429/Retry-After/codes and atomic fallback. No model, content, persistence, other rate limiter or infrastructure changes. No paid live requests, shared data writes or commit/push/deploy.

Implementation: process-local active-action wrapper, one/Admin and four/process, immediate finally release. Duplicate409/busy503 are concurrency outcomes, never quota429. Provider429 remains provider-originated. See [verification report](../implementation/destination-editorial-no-request-quota.md).

Verification complete: 276 focused tests PASS/6 isolated-DB tests SKIP; 28 browser groups PASS; four-workspace typecheck, web build, scoped UI audit (zero findings), script syntax and diff check PASS. READY_FOR_MANUAL_TEST=YES. Production not deployed; live OpenAI not called.

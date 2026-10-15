# Destination Editorial — no application request quota

Owner decision: REMOVE EDITORIAL AI RATE LIMIT, 2026-10-15. Branch TXH,
HEAD 2f5a649. Existing uncommitted Hero, Editorial and image-policy work preserved.

## Change

- Removed Editorial's minute/day quota module and budget-based DB admission.
  No replacement time quota in either Development or Production. Existing
  idempotency records are neither consulted nor rewritten/deleted; shared
  idempotency infrastructure and other API limiters remain unchanged.
- New `editorial-concurrency.ts` bounds only currently active work: one action
  per Admin, four actions per server process. Global runtime state survives hot
  reload; `finally` releases slots on every return or thrown error. No historical
  counts, cooldown timer, waiting queue or database transaction is involved.
  This protection is process-local, not a distributed cluster-wide guarantee.
- Same-Admin overlap returns `EDITORIAL_AI_IN_PROGRESS`/409; full process capacity
  returns `EDITORIAL_AI_BUSY`/503. Logs classify these as CONCURRENCY, with no
  fictitious Retry-After. Auth/input errors remain distinct. Repeated completed
  requests never produce quota-based ADMISSION_REJECTED.
- Admin authorization remains before body parsing and again at service entry.
  Both PROPOSE and ALTERNATIVE use one active-action slot; Alternative retains
  at most two provider calls. Existing 25-second provider deadline, request
  cancellation, 40-second client deadline and 60-second route duration remain.
- GPT-6 Luna, reasoning/structured-output parameters, validation and media policy
  are unchanged. Provider 429 still distinguishes rate limit from billing quota,
  forwards valid Retry-After and returns an allowlisted actual provider code in
  error details. UI displays the safe provider code and disables both AI buttons
  only for a valid server delay. In-flight 409/503 has its own feedback.
- Every rejected/failed proposal preserves exact unsaved layout; no automatic
  Save/Publish or Destination mutation. Undo and persistence flows are unchanged.

## Verification

- Focused Editorial + Preference Extraction: **276 PASS**, 6 PostgreSQL integration
  tests intentionally SKIP (no isolated DB configured; no shared Neon access).
- Mock tests run **25 sequential PROPOSE and 25 ALTERNATIVE** actions in each of
  Development and Production. Twenty historical admitted records remain present;
  budget reads are configured to throw if attempted, and records stay unchanged.
- Tests cover Guest401/Traveler403 before provider/body parsing, overlapping
  same-Admin409, four active actors/fifth503, slot release after failure/completion,
  provider429 and immediate server recovery, billing quota codes, safe telemetry,
  validation fallback, Alternative max-two calls and no retry after provider429.
- Production Editor/Renderer browser harness: **28 groups PASS**, including
  in-flight409/503 and provider429 atomic preservation, cooldown expiry/no auto
  retry, missing/invalid Retry-After, Undo, Save/Publish/Rollback, UNKNOWN retry,
  responsive Light/Dark and Preview/Public parity. Mock-only data/providers.
  Inspected `apps/web/.cache/editorial-v3-3/ai-429-cooldown.png`.
- Root typecheck (four workspaces), web production build, scoped strict UI audit
  (zero findings), script syntax and `git diff --check`: PASS.
- Logs: `apps/web/.cache/editorial-no-quota/{focused,typecheck,build,browser}.log`.

## Manual acceptance and boundaries

Ready for manual test after local app reload/restart picks up the changes. On an
Admin draft with unsaved edits, make one deliberate AI request; observe genuine
provider evidence and verify Undo/unchanged work on failure. No application wait
is required between completed requests. An actual provider429 may still impose
its supplied delay. No live OpenAI call was made or claimed by this task.

No migration, environment/key edit, Neon write, Cloudinary mutation, commit,
push or deployment. Production behavior is implemented and mock-tested; it has
not been deployed or live-provider verified.

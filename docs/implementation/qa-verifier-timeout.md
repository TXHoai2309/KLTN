# QA synthesis verifier timeout — 2026-10-18

Baseline42210c8 includes the separately approved Production activation. Scope: QA
backend only. No schema/data/Auth/reindex/US-28/UI/model/environment change.

## ROOT_CAUSE and confirmation boundary

Old qa-synthesis-verification.ts:138 created the JSON provider with timeoutMs10000.
Generation200 and semantic verification are different calls. At10s the verifier
is aborted and mapped to AI_UNAVAILABLE503; the service fails the turn instead
of persisting unverified text. That fail-closed decision remains correct.

Owner's incident cc36a97b-9f96-4179-a231-a6abb4f7b111 has verifier start15.38s and
failure26.08s, consistent with this cutoff. Old diagnostics label all structured
calls GENERATION_PROVIDER and merge timer/network/upstream/request abort into
PROVIDER_FAILURE. The original local raw log was unavailable; Vercel historical
log query exceeded retention. We cannot uniquely prove that historical exception.
No missing-key or missing-corpus conclusion was inferred.

TIMEOUT_CAUSE_CONFIRMED=YES_IN_CONTROLLED_REGRESSION; HISTORICAL_INCIDENT=PROBABLE.
FAILED_PROVIDER_PHASE=SYNTHESIS_VERIFICATION in the controlled reproduction.
Before runtime changes, valid10.5/12s verifier replies both failed AI_UNAVAILABLE503.
After the fix they pass. Retained HTTP old10s control reproduces503 with4 eligible
chunks, generation200 and a verifier12s reply; the new default passes that fixture.

## Fix and budgets

OLD_TIMEOUT_MS=10000; NEW_TIMEOUT_MS=25000 ceiling, clipped to remaining shared
provider-work budget. Assessment15s/generation25s caps unchanged. One monotonic
40s budget starts before HTTP body/auth/admission/retrieval and covers ALL model
calls. No late provider dispatch or automatic retry. Abort reason survives relay.

TOTAL_REQUEST_BUDGET:40s provider work;58s persistence acknowledgement target;
60s unchanged Vercel maxDuration;70s unchanged frontend timeout;90s unchanged lease.
Remaining18s supports final eligibility/persistence. Final recheck and transactional
locked eligibility remain. An already-running bounded poll may finish independently
after stop; it cannot invalidate later stages. Polling still revokes sources during
generation. No new source/provider/semantic fallback is introduced.

Persistence timeout bounds waiting, not DB commit. A possibly committed completion
returns UNKNOWN and identical-key reconciliation; no fail overwrite or automatic
retry. DB/auth reads retain their existing bounds; infrastructure stalls can reach
platform limits. This is not a guarantee of58s successful DB completion for every
request. Restored provider results must pass all semantic gates, synthesis
certificate, grounding/citations, public safety and eligibility before completion.

## Safe diagnostics

Fixed providerPhase: ASSESSMENT / GENERATION / SYNTHESIS_VERIFICATION. Fixed reasons:
PROVIDER_TIMEOUT, REQUEST_DEADLINE, REQUEST_ABORT, ELIGIBILITY_ABORT, NETWORK_ERROR, UPSTREAM_HTTP.
Events include correlationId, providerElapsedMs, effective configuredTimeoutMs,
HTTP status when received, model and bounded usage/reasoning-token counts. HTTP200
with a stalled body is distinct from no headers; stream network errors remain503,
malformed JSON/schema502. Ignored abort results cannot validate/acquire certificate.

Sanitized diagnostics now run on Local/Preview/Production, console only. Removed
hardcoded local filesystem sink. No prompt/RAG/source text, raw exceptions/provider
body, questions, IDs of people, credentials or personal content; no public DTO change.

## Reasoning / OPENAI_COST

Model gpt-6.1-sol and reasoning_effort medium unchanged. Official
[model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) supports
medium. [Deployment guidance](https://developers.openai.com/api/docs/guides/deployment-checklist)
explains lower effort may reduce latency/tokens, but does not establish incident
causation or justify reduced verification quality without an evaluation. Live
verifier samples:0/18 reasoning tokens at5.754/6.634s; no causal evidence medium
was the historical bottleneck. No model/effort/temperature/token cap change.

Existing bounds:4 chunks/3000 evidence tokens,8k input/2k completion per structured
call, at most assessment+generation+one verifier,43k token reservation per admitted
attempt and durable abuse/concurrency controls unchanged. Timeout extension may
allow existing work to finish, but adds no token budget or provider call/retry.

Owner authorized live smoke. Exactly2 Local HTTP/service pipelines used actual
eligible Production retrieval, Neon API identity verification, TLS/default read-only
and REPEATABLE READ READ ONLY transactions. Memory-only principal/store, no Guest
bootstrap, Auth/conversation/budget writes. Both ANSWERED with3 citations,25.848s
and25.637s. Each used embedding+assessment+generation+verifier:8 calls, all200.
No further live asks. This does not certify Production durable persistence.

Returned usage:17533 chat input,1642 chat completion (including reasoning),52
embedding tokens. Uncached public rates2/10 USD per million chat tokens and0.02
per million embedding tokens imply estimated USD0.05148704. Actual billing may
be lower with cached input; not an invoice. Aborted calls can be billed without
usage envelopes; none occurred in these two attempts.

## Validation / FIX_FILES

Focused124 tests PASS. Full root regression/typecheck/build results are in
[evidence](qa-timeout-evidence/verification.json). Regression includes delayed10.5/
12s verifier, old10s HTTP control,4 chunks, source revocation, negative verdict,
upstream429/500/503, network/stream error, client abort, hanging200 body, aggregate
budget, no dispatch after expiry, late result refusal and uncertain persistence.
No source/abuse gate removed; same-key UNKNOWN preserved without overwriting fail.

Initial worktree lacked generated env/client; a dependency junction mixed two
Prisma identities. Isolated npm ci/generated local files corrected setup. Setup
failures are retained in ignored logs, not counted as application passes. Build
uses ignored unreachable localhost env; never Production DB. Full native PostgreSQL
integration remains gated/skipped, not claimed PASS.

Files: qa-synthesis-verification.ts, qa-json-provider.ts, qa-diagnostics.ts,
qa-request-budget.ts, qa-http.ts, qa-service.ts; phase wiring in qa-assessment.ts /
qa-generation.ts; diagnostics/deadline/verifier tests; guarded read-only
scripts/qa-timeout-live-smoke.ts; report/story/progress and sanitized evidence.

PRODUCTION_SMOKE: deployment/health/page/API GET checks only. Two live ask attempts
were consumed locally. Deployed POST /api/ai/ask normally writes conversations and
budgets, so it is not invoked under the no-database-change constraint. Deployment
observations are recorded separately from historical pre-release evidence.

REMAINING_RISKS: upstream latency can still exceed25s/shared40s; DB/platform stalls
may remain UNKNOWN; abort does not ensure zero provider billing; historical cause
not uniquely recoverable; no p95/p99 or reasoning-quality A/B conclusion and no
Production durable ask smoke. This fix is not blanket full US-23 acceptance.

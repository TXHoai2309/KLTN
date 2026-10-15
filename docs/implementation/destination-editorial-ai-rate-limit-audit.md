# Editorial AI admission, real-provider evidence and 429 UX

> Historical audit: its application quota policy was superseded by Owner's
> REMOVE EDITORIAL AI RATE LIMIT decision. See
> [current implementation](../implementation/destination-editorial-no-request-quota.md).


2026-10-15 · TXH · starting HEAD `2f5a649`. Existing Hero/V3.6 working-tree changes
are preserved. No OpenAI call, database write, migration, environment edit,
Cloudinary upload/delete, commit, push or deployment was performed by this task.

```text
APP_429_ROOT_CAUSE=The Admin's rolling internal day allowance is exhausted; old UI erased non-2xx details and admission uncertainty was also incorrectly mapped to 429.
RATE_LIMIT_POLICY=Per authenticated Admin across all Destinations in the same database: 3 admitted actions/60s and 20/rolling 24h. Unchanged.
RETRY_AFTER=Internal expiry calculated from admitted-record timestamps; later expiry if both windows block. Valid provider header forwarded. No invented duration.
PROVIDER_CALLED_FOR_FAILED_REQUESTS=NO for ADMISSION_REJECTED requests; historical admitted actions cannot be classified retrospectively from budget records alone.
PROVIDER_INSTRUMENTATION=Safe correlated lifecycle and exact adapter fetch boundary, response HTTP/model/request-ID/usage metadata, validation and fallback outcomes.
ACTUAL_MODEL_ID=LIVE_UNVERIFIED; outgoing adapter model remains gpt-6-luna; actual response model logged only if supplied by provider.
PROVIDER_REQUEST_ID=NO_LIVE_EVIDENCE; null when absent, never generated.
TOKEN_USAGE=NO_LIVE_EVIDENCE; null when absent, never estimated.
FRONTEND_429_UX=Explicit internal/provider messages; authoritative countdown disables both AI buttons; no automatic retry or layout/draft changes.
TEST_RESULTS=272 focused PASS/6 DB SKIP; 27 browser groups PASS; root typecheck, build, scoped strict audit and diff check PASS.
READY_FOR_ONE_LIVE_TEST=YES_AFTER_SERVER_RETRY_AFTER; use PROPOSE exactly once, not ALTERNATIVE.
LIVE_OPENAI_CALLED=NOT_CONFIRMED
COMMIT=NO
PUSH=NO
DEPLOY=NO
```

## Root cause and live read-only evidence

One explicit `REPEATABLE READ READ ONLY` transaction queried aggregate budget
timestamps/counts; no actor IDs, scope strings, credentials, sessions or private
content were printed. It ended with ROLLBACK. Local evidence:
`apps/web/.cache/editorial-rate-limit/readonly-audit.json`.

At **2026-10-15 09:44 UTC** it found one Editorial budget scope:

- 20 persisted records, all 20 containing the confirmed admission result.
- 0 admissions in the last 60 seconds; 20 in the last rolling 24 hours.
- Oldest admission: 2026-10-14 21:12:31.698 UTC.
- Newest admission: 2026-10-15 02:35:12.348 UTC.

Thus the day limit explains the current refusals; the minute bucket is clear.
The oldest admission ages out around **2026-10-16 04:12:32 Asia/Saigon**, based
on that snapshot. The actual response's Retry-After remains authoritative.
There is no midnight reset and no stuck permanent cooldown. Older rows remain
stored but are excluded by the time-window predicates; no deletion is needed.

Previously `executeIdempotentWrite` inserted the current reservation before the
callback counted rows. Its `recent > 3` / `daily > 20` thresholds therefore
already meant three/twenty admitted actions, not four/twenty-one. Rejections roll
back and do not spend another action. The revised code explicitly excludes the
current key, counts confirmed admissions, uses `>=` against the same limits and
derives the next usable slot from the most recent limit-sized set. All queries
remain inside the existing per-Admin advisory-lock transaction.

The old catch also turned **every non-SUCCESS admission result**, including
UNKNOWN/database errors, into 429. Those now fail closed as 503; authentication
failures retain 401/403. Safe admission logs identify the reason, window and
wait duration. Production policy is not disabled or increased.

Scope is application budget **per user**, shared across Destinations and modes;
there is no Destination, IP, OpenAI project, token or global-application limiter
in this implementation. Environments sharing the same database and user also
share the budget. This is separate from OpenAI project/model rate limits.
Admission counts an allowed action even if the later provider/validation fails;
it is a conservative cost/abuse bound, not a billing usage ledger.

## End-to-end behavior and evidence boundaries

1. A click submits the current unsaved layout plus mode/direction/revision.
2. The thin route delegates to the testable HTTP handler. It creates a server
   correlation ID and emits APP_REQUEST_RECEIVED; server Admin auth, same-origin,
   bounded JSON and strict input checks precede admission/provider work.
3. The service reads the Destination and checks revision/references. Missing
   model configuration or stale layout uses an explicit unchanged fallback.
4. Admission reserves exactly one action. A refusal returns internal 429 with
   source/window/Retry-After and ADMISSION_REJECTED/providerCalled=false. The
   adapter is never reached. Admission uncertainty returns 503.
5. ADMISSION_ACCEPTED precedes the adapter. PROVIDER_REQUEST_STARTED is emitted
   only immediately before the actual fetch invocation, after key/model/schema/
   abort checks. Configuration presence alone never means a provider call.
6. PROVIDER_RESPONSE_RECEIVED records actual HTTP status, sanitized `x-request-id`,
   response model, `usage.prompt_tokens` and `usage.completion_tokens`, with the
   same correlation ID and candidate attempt. Missing metadata is null.
7. Provider failures log PROVIDER_REQUEST_FAILED. Provider 429 is returned with
   a distinct provider-rate or provider-quota code; only a valid supplied
   Retry-After is forwarded. It is never called an admission refusal.
8. Validation emits PROPOSAL_VALIDATED or PROPOSAL_REJECTED and a final outcome;
   fallback emits FALLBACK_USED. Invalid, unchanged or insufficiently varied
   proposals do not claim a new layout. No raw prompt/response/error, secret,
   Authorization header or actor/Destination identity is logged.
9. UI handles 429 before the generic failure path, including non-JSON errors.
   Internal message: “Đã đạt giới hạn yêu cầu AI. Vui lòng đợi trước khi thử lại.”
   The day-window response also explains that it covers the last 24 hours.
   Provider rate limits and billing/quota errors have distinct labels. Unknown
   429 uses “Bạn đang yêu cầu AI quá nhanh. Vui lòng đợi trước khi thử lại.”
10. Valid Retry-After seconds or HTTP-date drives the countdown and both AI
    button guards. Missing, invalid, negative or expired values do not create
    a timer. Editing/Save/deterministic layout remain available; expiration
    re-enables AI without sending any request. Local layout/block/draft state
    remains unchanged by the failure.

Alternative performs admission **once**, outside its bounded candidate logic.
It may then invoke the model once or twice, never more. A provider failure does
not trigger the diversity retry. Consequently 20 admitted actions can represent
up to 40 model calls, not exactly 20 calls. The 8192 output-token cap per call,
strict Structured Outputs, gpt-6-luna request, none reasoning and no-temperature
behavior are retained. Preference Extraction's client/behavior is untouched.

The request-ID and usage fields follow the official
[Chat Completions response contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
The application's action allowance must not be confused with the provider's
[rate limits](https://developers.openai.com/api/docs/guides/rate-limits).

## Optional Development adjustment — recommendation only

For sustained Admin design testing, consider an explicit Development-only opt-in
of **6 actions/minute and 40 actions/rolling day per Admin**, using an isolated
development database and OpenAI project. Keep Production fixed at 3/20, retain
two-candidate and output caps, and configure a project spend limit separately.
The proposed development maximum is 80 calls/day/Admin and at most 655,360
completion tokens, plus input tokens; this is an upper bound, not a cost estimate.
No such override, database reset, budget deletion or environment change was
applied. Do not infer Development from localhost alone or loosen Production.

## Tests and verification

- 272 tests PASS / 6 PostgreSQL integration tests SKIP: Editorial plus
  Preference Extraction and its shared-client regression tests, fake HTTP only.
- New tests cover internal minute/day acceptance/rejection and recovery,
  cross-Destination/scope accounting, no midnight reset, no extra consumed slot,
  admission uncertainty 503, actual adapter invocation after admission,
  correlated mock 200/model/request-ID/token metadata, safe absent metadata,
  provider 429 with/without Retry-After, validation rejection/fallback and
  Alternative's one admission / at most two calls.
- Production Editor/public-shell browser suite: 27 groups PASS. The added case
  exercises internal/provider 429 labels, both AI button guards, authoritative
  cooldown/recovery, absent/invalid header handling, no auto-retry and exact
  local layout/unsaved-style/saved-draft/write-count preservation. Existing
  responsive/theme/Hero/publication/UNKNOWN/retry checks remain green. Screenshot
  inspected: `apps/web/.cache/editorial-v3-3/ai-429-cooldown.png`.
- Root typecheck: four workspaces PASS. Production web build PASS. Scoped
  premium static audit: zero findings. Script syntax and `git diff --check` PASS.
- Testable HTTP handler dependency injection avoids cross-file mock leakage in
  the repository's `isolate:false` Vitest configuration; it does not bypass auth.
- Logs/evidence: ignored `apps/web/.cache/editorial-rate-limit/` directory.

## Exactly one Owner live test

1. Wait for the server-provided cooldown to expire. A daily refusal now is
   expected given the read-only audit; do not delete budget records or keep
   clicking. Restart/reload the app if necessary to load the updated code.
2. In DevTools Network enable Preserve log, filter `editorial/propose`, then
   click **AI đề xuất bố cục once**. Do not use Alternative for this test.
   Do not Save or Publish; a proposal alone is sufficient.
3. Copy `X-Editorial-Ai-Request-Id` from that one response. In the server terminal,
   filter the same correlation ID. Expect APP_REQUEST_RECEIVED →
   ADMISSION_ACCEPTED → PROVIDER_REQUEST_STARTED(attempt=1) →
   PROVIDER_RESPONSE_RECEIVED → validation/final outcome. If admission rejects,
   there must be no provider start for that correlation; wait instead of making
   an additional test request.
4. Record actualModel, HTTP status, providerRequestId, inputTokens, outputTokens
   and final outcome from the response event. Do not send credentials or prompts.
   A provider response with a real request ID is evidence of provider contact;
   successful usage metadata supports the usage audit even if layout validation
   later rejects the proposal. A start event alone cannot prove provider receipt.
5. In OpenAI Usage select the correct project/key, model and UTC time interval
   for the test. Compare the recorded input/output tokens with that interval's
   usage; account for any unrelated traffic. Usage is aggregate and need not
   expose the request ID as a searchable individual row. Retain the request ID
   for provider logs/support correlation; do not claim an exact per-request
   billing reconciliation from an aggregate $0 display alone.

Until that Owner test supplies real evidence, LIVE_OPENAI_CALLED remains
NOT_CONFIRMED and no live request ID/token count is reported. Mock request IDs
and usage in automated tests are explicitly fixtures, not live evidence.

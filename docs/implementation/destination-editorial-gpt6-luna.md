# V3.3 Editorial GPT-6 Luna correction

2026-10-15, D:/KLTN/KLTN, TXH, HEAD7ecdaec74e0944129d722abeb2dd3c27d4f34c3e.
Preserved the existing uncommitted image503/JPEG/automatic-upload/V3.4 eligibility
changes. No reset/stash, env edit, migration, Neon write, Cloudinary upload,
real OpenAI API request, commit/push/deploy.

## Diagnosis and confidence boundary

Varlock subprocess inspection found the key present and target-model equality
true, without printing the credential. A GET-only405probe loaded the proposal
module inside the actual Next.js3010runtime; its safe configuration event was
`CONFIGURED_GPT6_LUNA`, correlation43e637f6-fe48-487a-9d2d-131764469a1f.
This proves runtime configuration presence/target selection, not API-key validity,
project/model access or available quota. Production build also observed the same
configuration category. No authenticated POST was used for this verification.

The previous factory reused the US25 client: temperature0, no explicit reasoning
effort,1200completion tokens,15second per-attempt timeout and one possible retry.
Its generic PreferenceExtractionError lost provider HTTP code/param detail, and
Editorial swallowed it into the reported generic fallback. The actual historical
provider response was not captured and was not reconstructed by a paid call.

Official [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
confirms Chat Completions and Structured Outputs, with medium reasoning by
default and support for none. The [GPT-6 compatibility guide](https://developers.openai.com/api/docs/guides/latest-model)
requires removing temperature when reasoning effort is not none. Therefore the
old request shape has a documented compatibility defect. Mock HTTP400 reproduces
that rejection and the old uninformative fallback behavior; the new request
passes the same mock. This is not proof that HTTP400was the only historical
failure in the Owner's account.

## Correction

- Editorial has its own server-only adapter. Model must match gpt-6-luna;
  reasoning_effort is none; temperature/top_p are omitted. Chat Completions uses
  store:false and strict JSON Schema named destination_editorial_layout.
- Completion budget8192tokens accommodates the bounded30-block layout. The
  outer response is bounded to96KiB; proposal JSON to32KiB. A single25second
  deadline covers fetch and body, including transports that ignore AbortSignal.
  No automatic retry or alternate model/provider call. Route maxDuration60;
  browser timeout remains40seconds. No US25 adapter/settings/schema/env changed.
- Existing editor layout can be sent with the proposal request; strict parsing
  and server ownership checks precede provider work. All existing block IDs,
  types, body prose, captions, citations and manual work are preserved. The
  model can arrange known blocks/media and choose an allowed family/variant or
  title already present/exactly extracted from the block. New facts and extra
  IDs are rejected. No Destination update or Editorial save/publish occurs.
- Deterministic/AI/public share V3.4 media eligibility. Current ineligible image
  references are removed from the provider base. Every returned image ID must
  be in the current usable set, including IDs in hidden blocks. Full ownership
  validation also covers hidden references; public source checks remain intact.

## Diagnostics

Safe server events carry only fixed event/phase, generated correlationId, normalized
application code, HTTP status, allowlisted providerCode and allowlisted param.
The response header X-Editorial-Ai-Request-Id matches the proposal's correlationId.
No prompt, private prose, Destination/actor IDs, credentials, Authorization,
provider message/raw response or raw exception is logged. Unexpected route errors
are sanitized before entering the generic API logger.

Distinct codes cover model unavailable, invalid key, forbidden, quota/billing,
rate limit, unsupported parameter, invalid schema/output, timeout, network,
provider unavailable, refusal, cancellation, token exhaustion and proposal
validation. Admission/auth failures are distinct from provider-request failures.
Provider or validation failure returns a diagnosed fallback without writing a
layout; UI shows the safe reason and correlation rather than the old blanket
message. Missing configuration keeps deterministic operation available without
calling the provider or admitting a provider budget.

## Verification

- Focused201/201PASS across11files:25new Luna/diagnostic/service tests, existing
  Editorial28, all US25-related86, image45, image eligibility5and Cloudinary12.
  Tests cover the actual request body/factory target; mock400temperature,
  401/403/404/429/500, billing, timeout/stalled fetch/body, network, length/refusal,
  invalid JSON/schema, sanitized logging, successful changed layout, preserved
  unsaved prose/IDs, invalid foreign/rejected/hidden media and configuration fallback.
- Production editor/renderer Chromium17groupsPASS with synthetic HTTP/media/map.
  New success case confirms current layout is sent, manual text survives proposed
  arrangement and no Save/Publish or Destination write occurs. Prior responsive,
  source/publication and V3.4 media-eligibility checks remain green.
- Root typecheck, production build and diff check results are in the handoff.
  All providers and persistence in automated tests were synthetic; no real API
  response/model access/quota or live authenticated3010proposal is claimed.
  No full repository or PostgreSQL rerun was required for this adapter-only task.

## Manual acceptance

The implementation is ready for an Owner-authenticated test at3010. Press AI
proposal and check PROPOSED rather than FALLBACK, inspect the changed layout and
retained manual blocks, then save/publish only if explicitly desired. If it falls
back, use X-Editorial-Ai-Request-Id or the displayed correlation to locate the safe
server event and its phase/code/status/param. Account access and billing must be
validated by a real request. The agent made zero real OpenAI requests; any future
agent-driven live probe still requires separate Owner authorization and is limited
to one small request as instructed.

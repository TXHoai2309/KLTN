# Follow-up failure investigation — 2026-10-17

Owner reported `AI_INVALID_RESPONSE` after “còn các địa điểm khác thì sao”.

## Evidence and limits

The available local Next development log contains a failed request with correlation
ID `933f83d0-94a9-48b2-9d5f-8ee044933a0d`: embedding HTTP 200, four retrieved and
eligible chunks, then `GENERATION_PREFLIGHT / PRIVATE_MATERIAL` at 5317 ms.
`generationInvoked=false`: this failure precedes assessment/answer model dispatch.
The log does not bind its ID to the screenshot's turn or record the offending
source text; exact screenshot attribution and the particular matched text remain
unconfirmed. Do not attribute this observed failure to model intelligence or timeout.

`assertQaEvidenceInput` rejects unsafe source content/metadata and internal IDs.
The public-safety policy includes HTTP URLs as well as private paths/secrets.
`qaHasUnsafeEvidenceContent` permits omission of standalone reference blocks but
rejects mixed factual/URL blocks. Retrieval currently checks citation metadata,
not this full content policy, so selected content can fail at generation preflight.
The event has `allowlistCount=1`; that describes this runtime's source allowlist,
not the entire database corpus or a proof of sufficient coverage.

Separately, the exact reported follow-up did not match `needsHistory`, causing
`qaIntentHistory` to return no history. The bounded fix recognizes other-place
continuations and preserves previous factual questions. With no anchor it asks
for a subject. Explicit named new questions still do not inherit unrelated history.
This repairs an independently reproducible context bug; it does not repair or
bypass the observed source-safety failure.

## Verification and remaining work

- Focused conversation/retrieval/service suites: 101/101 tests pass, including four
  new regression cases. Offline adapters only; no live-provider success claimed.
- Root typecheck/build and diff checks recorded in the progress entry.
- No database/schema/source-index/environment/model changes, commit, push or deploy.
- Before changing source handling, identify the offending current source block and
  verify extraction/chunk boundaries. Preserve full factual qualifications and
  private-material rejection; do not strip arbitrary URL-bearing sentences or
  convert technical failures into successful insufficient-source answers.
- Broader improvement requires reviewed corpus coverage and real multi-turn
  acceptance cases. Model changes alone cannot repair preflight rejection; no
  universal zero-failure guarantee or live acceptance is claimed. US-23 remains
  NOT ACCEPTED.

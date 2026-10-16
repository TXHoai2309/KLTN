# US-23 — live synthesis rejection follow-up

Date: 2026-10-17 (investigation began 2026-10-16). Branch: TXH.
Owner report: the conversational replies worked, but
`tôi muốn tìm hiểu về cao nguyên đá đồng văn` still returned insufficient source.
The supplied local-server screenshot showed four eligible chunks followed by
`SYNTHESIS_REJECTED`. This follow-up addresses that reproduced runtime failure.

## Reproduction and cause

The earlier punctuation/history changes were insufficient to resolve this case.
A new opt-in live test used the existing configured provider and the pinned,
allowlisted development corpus. Every direct database access in that test runs
inside a READ ONLY transaction; no source or index was modified.

The first live run reproduced `INSUFFICIENT_SOURCE` despite four eligible chunks,
`SUFFICIENT / COMPLETE_COVERAGE`, all eight semantic verification gates passing,
and all three paragraph/claim partitions matching. New safe diagnostics isolated
`ASPECT_COVERAGE`: the verifier's free-form coverage labels did not cover the exact
reviewed aspect ID. Gate approval and a positive semantic verdict did not prevent
the additional reference check from discarding the answer.

After constraining those IDs, a second live run progressed to `SUPPORT_REFERENCE`.
Generation still received the entire candidate sentence registry, including
sentences the assessor had not approved. Although its prompt required reviewed
support, those extra sentences remained available to influence generation and
the verifier's support mapping. Restricting generation to reviewed scoped pairs
removed that inconsistency in the reproduced case. This does not prove that every
possible support-reference rejection has that same cause.

## Implemented changes

- The verifier's per-request JSON Schema now enumerates the exact SUPPORTED
  aspect IDs. The user payload explicitly supplies `REQUIRED_ASPECT_IDS`, and
  system guidance treats them as references rather than topic labels to rename.
  Missing, renamed or extra aspect labels still fail server validation.
- Generation's `CURRENT_EVIDENCE` now contains only the reviewed whole sentences
  under their actual citation IDs. The independent verifier retains visibility of
  additional retrieved sentences for detecting overlooked facets or contradictions;
  those sentences do not become approved claim support automatically.
- Assessment guidance explicitly treats a request to learn about or introduce a
  named destination as a clear overview intent. Narrow factual questions continue
  to assess their requested facets. No destination-specific answer was hardcoded.
- Synthesis rejection diagnostics identify gate, aspect coverage, support mapping,
  numeric fidelity, claim partition, unjustified citation and aspect-support
  failures using bounded reason codes. No raw claim/source text is logged by this
  new path; the previous raw unentailed-claim console output was removed.
- Existing eligibility/revocation, exact support provenance, semantic gates,
  public citation projection, ownership, confirmed persistence and replay remain
  enforced. No threshold, topK, model, timeout, retry count or token budget changed.

## Runtime evidence

The third isolated live run passed: `ANSWERED`, four eligible chunks, two answer
parts, all eight gates positive, exact aspect IDs matched and no synthesis
rejection. The generation and verification adapters were real OpenAI calls.

The opt-in local HTTP smoke then exercised the already-running app at
`http://localhost:3010` with a newly created Guest identity, without using the
owner's Admin session or existing conversations:

| Turn | Input | Confirmed outcome | Citations |
| --- | --- | --- | --- |
| 1 | `hi` | CONVERSATIONAL | 0 |
| 2 | `tôi muốn tìm hiểu về cao nguyên đá đồng văn` | ANSWERED | 2 |
| 3 | Same question again in the same conversation | ANSWERED | 2 |
| 4 | Same question ending in `? ,./` | ANSWERED | 2 |

The three factual turns took approximately 15.1s, 13.7s and 13.6s, including
provider work and persistence. These are observations from one local smoke,
not a latency guarantee. Authorized history read confirmed all four persisted
outcomes. Replaying the final identical payload/key returned the same turn with
`Idempotency-Replayed: true`. Afterwards the script deleted only its own temporary
conversation and revoked its own Guest identity through the normal APIs. Normal
non-content tombstones/admission counters remain subject to existing policy.

## Checks and files

- Full web `npm run test`: 1710 Vitest PASS / 98 SKIP, plus 329 legacy tests PASS.
  The additional gated skip is the explicit live test; it was run separately and
  passed. Existing database/extraction prerequisites retain their previous skips.
- Root typecheck PASS. Final production-build/diff results are in the appended
  progress entry. Live regressions and negative cases for missing/renamed/extra
  aspects, fabricated references, unsupported/current prices and unsafe prose
  remain part of regression coverage.
- Edited: `qa-synthesis-verification.ts`, `qa-prompt.ts`, `qa-assessment.ts`,
  `qa-diagnostics.ts`, `qa-answer-quality-v2.vitest.test.ts`,
  `qa-diagnostics.vitest.test.ts` under `apps/web/src/modules/ai/`.
- New opt-in harness: `qa-live-reliability.vitest.test.ts` (requires
  `QA_DIAGNOSTIC_LIVE=1`, validated server credentials and matching development
  runtime pins). New local HTTP smoke:
  `apps/web/scripts/qa-local-http-smoke.mjs` (requires `QA_DIAGNOSTIC_HTTP=1`).
  Neither runs paid calls by default. Cookies, credentials and private IDs are
  never printed. The direct harness logs only bounded structural diagnostics.
- No schema/migration/environment/source/index changes, commit, push or deployment.
  Existing unrelated working-tree edits were preserved. The running local dev
  server loaded the fix through its normal development rebuild.

This fixes the owner's reproduced case and its repeated/punctuated HTTP variants.
It is not full real-corpus acceptance for US-23: semantic judgments remain
probabilistic, and missing source facts still require abstention. Existing
insufficient answers are historical completed turns; they are not rewritten.

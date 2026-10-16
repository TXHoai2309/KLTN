# US-23 — Luna migration and support-reference reliability

Date: 2026-10-17. Branch: TXH. Owner explicitly requested switching the chatbot
to Luna after questioning which model the application actually called.
This supersedes the earlier live-synthesis report's unchanged-model statement
for this later task; it does not revise its historical observations.

## Model routing

- `qa-json-provider.ts` now selects `gpt-6-luna` by default for source assessment,
  answer generation and synthesis verification. The previous QA default was
  `gpt-4o-mini`; the Editorial model setting did not select the QA model.
- Luna requests use `reasoning_effort: "none"`, `temperature: 0`, strict JSON
  Schema and `store: false` on the existing Chat Completions transport. Explicit
  injected test model overrides remain supported; no fallback/retry was added.
- Embeddings remain `text-embedding-3-small`. Social responses are server-authored
  allowlisted text and deliberately need no provider call. Editorial/preferences
  settings and environment files were not changed by this task.
- Safe diagnostic metadata separates requested model from provider envelope
  `model`, alongside request ID and actual token usage. Missing/invalid model
  metadata is omitted, never inferred. No keys, prompts, retrieved prose or raw
  verifier outputs are introduced into these diagnostic fields. The environment
  logger can mask the configured model string; the live harness therefore asserts
  the actual sent/returned values and reports Luna-match booleans.

Official references consulted through the OpenAI Docs skill:
[Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna),
[model guide](https://developers.openai.com/api/docs/guides/latest-model),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
No inference about billing-dashboard totals is used as proof of model routing.

## Further live failure and correction

The first real Luna calls confirmed correct routing, but migration alone did not
remove intermittent synthesis rejections. A local HTTP smoke answered the base
and repeated question, then rejected its punctuated variant. A subsequent direct
three-case matrix passed only one case: one other case failed SUPPORT_REFERENCE
despite all eight gates and full claim partitions passing, and another had
negative grounding/citation semantic gates. These failed runs are retained in
local logs; they were not reported as a successful regression run.

Two fragile protocol obligations were corrected:

1. The verifier formerly retyped exact reviewed source sentences. It now selects
   server-issued `s1`, `s2`, … handles; the server resolves exact sentence/citation
   pairs from the current reviewed registry. Invented/duplicate handles, unknown
   part indices and legacy prose-reference output still fail.
2. A global handle enum still allowed selection from a different overlapping
   chunk than the answer paragraph actually cited. Per-part `anyOf` schema
   variants now couple its exact partIndex to handles from its own citations.
   Explicit allowed handles accompany each input part. A paragraph with no
   reviewed support from its citations is rejected before another paid call.

The generation prompt additionally requests concise source-close prose and avoids
decorative overlapping citations. No failed semantic gate is overridden, no
claim is certified by lexical similarity, and no rejected answer is repaired or
retried automatically. Exact reviewed answers retain the existing path; all
other synthesis still requires the independent verifier and server certificate.
Source eligibility/revocation, reviewed facets, exact provenance, complete claim
partition, citation justification, numeric/time/scope guards, public safety,
ownership, confirmed persistence and replay remain enforced.

## Verification evidence

The final opt-in READ ONLY live matrix passed all three cases, using the same
normalized question for the base, repeated and `? ,./` variants. Each returned
ANSWERED with four parts, four eligible chunks, all eight semantic gates positive
and no synthesis rejection. All nine JSON calls requested and actually returned
Luna. No destination-specific facts or replies were hardcoded.

| Case | Assessment / generation / verification tokens | Adapter elapsed |
| --- | --- | --- |
| Original | 2557 / 2043 / 3284 | 18.1s |
| Repeated | 2557 / 2029 / 3175 | 15.2s |
| Punctuated | 2556 / 2057 / 3364 | 16.9s |

These are observations from this final run, not a latency or future-success
guarantee. Its 23622 JSON-call tokens exclude embedding and earlier diagnostic
runs. Billing cost was not calculated. The read-only harness requires explicit
opt-in, matching development database pins, provider credentials and allowlisted
sources; it does not run paid calls in the default test suite.

Final local HTTP smoke passed: `hi` returned CONVERSATIONAL and the original,
repeated and punctuated factual questions each returned ANSWERED with four parts
and three citations. History persistence, identical-key replay and own-resource
cleanup passed. Factual HTTP latency was 21.7s / 20.4s / 21.0s. Full regression:
1719 Vitest PASS / 100 gated SKIP plus 329 legacy PASS; root typecheck PASS,
production build PASS (20.2s), diff check PASS. The live matrix ran separately.
Further audit is recorded in the dated `docs/ai-progress.md` entry. Direct harness log:
`%TEMP%/kltn-qa-luna-live-scoped.log`; final HTTP log:
`%TEMP%/kltn-qa-luna-http-scoped.log`. Failed intermediate run:
`%TEMP%/kltn-qa-luna-live-matrix.log`.

## Scope and handoff

Owned migration files: `qa-json-provider.ts`, `qa-diagnostics.ts`, new
`qa-model.vitest.test.ts`, assertions in `qa-generation.vitest.test.ts`,
`qa-synthesis-verification.ts`, `qa-prompt.ts`, `qa-answer-quality-v2.vitest.test.ts`,
`qa-evaluation.ts` and the existing opt-in `qa-live-reliability.vitest.test.ts`.
All are under `apps/web/src/modules/ai/`. The evaluation fixture now expects two
calls for a paragraph whose citations have no reviewed support: rejection happens
before the verifier, with the same insufficient-source outcome.

No schema, migration, environment, source corpus, index, embedding, auth or
admission-budget change. Local HTTP tests create and clean only their own Guest
and conversation through normal APIs; they do not use the owner's Admin identity
or rewrite historical answers. No commit, push or deployment. Other existing
dirty Editorial/RAG/schema work is preserved.

US-23 remains NOT_ACCEPTED pending owner acceptance on the approved full corpus.
Semantic assessment/entailment remain probabilistic; a finite passing smoke does
not establish that every question will answer. Missing current price evidence
still requires abstention. Existing completed insufficient answers remain
historical; new tests require new turns.

The attached AI Agent repo was reviewed separately:
[reference review](ai-agent-reference-review.md). Its suggested retrieval,
follow-up and widget features are proposals, not implemented product changes.

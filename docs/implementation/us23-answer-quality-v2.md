# US-23 AI Answer Quality V2 — implementation and owner handoff

Task: `US23_AI_ANSWER_QUALITY_V2`. Branch: `TXH`. Date: 2026-10-16.
Status: implemented, offline verification; live owner acceptance remains pending.
Sources: Product contract RAG answers; System Specification references in
[US-21](../stories/US-21-rag-qa.md), [US-22](../stories/US-22-destination-context.md)
and [US-23](../stories/US-23-source-sufficiency.md). This task implements the
owner's attached Answer Quality V2 request without changing business invariants.

## Audit and root cause

- `qa-generation.ts` required each answer part to be an exact scoped source
  sentence for **every** attached citation. A paraphrase or multi-chunk synthesis
  could not pass, even with fully authentic citations.
- `qa-answer-grounding.ts` independently required exact reviewed sentence/citation
  pairs at the service boundary. Prompt-only changes would still fail here.
- `qa-prompt.ts` explicitly instructed verbatim copying. Existing sentence
  canonicalization can restore a heading stripped by the model, contributing to
  document headings in output. It remains only in the synchronous compatibility
  validator; runtime synthesis does not canonicalize generated prose to headings.
- Assessment/source sufficiency already separate semantic relevance and required
  facets from exact support provenance. Exact reference membership proves neither
  entailment of a paraphrase nor complete intent coverage. These guards are retained.
- Retrieval is bounded to four chunks/3000 evidence tokens in runtime and checks
  allowlisted INDEXED/READY/current publication and embedding provenance. US-19's
  approval-to-index publication boundary is retained; APPROVED alone is not enough.
- The service watches publication eligibility during provider work, rechecks after
  generation and rechecks/locks at completion. Public citations use server metadata.
- `AssistantAnswer` renders each part as prose with nearby citation controls;
  `AssistantCitations`/citation index already support multiple references and
  deduplication. PARTIAL has a separate missing-data notice. No UI/DTO change needed.
- Public safety currently rejects HTTP URLs in source prose, including public
 -looking URLs. This conservative existing rule is retained and regression tested.
  URL-bearing chunks can therefore still be rejected; URLs are never promoted into
  approved public citation metadata.

## Implemented flow

1. Existing assessment now explicitly considers main entity, attribute, scope,
   temporal requirement, answer type and all requested facets, using prior questions
   only to resolve follow-up intent. Explicit current questions take precedence.
   General admission and site/service fees are separate facets. Missing retrieved
   coverage is not described as absence of data in the entire corpus.
2. The generation prompt requests direct, natural Vietnamese, coherent synthesis,
   bounded detail, deduplication and preservation of entity, negation, designation,
   price, unit, conditions, scope and time. Paragraph citations may jointly support
   the paragraph's claims across chunks. No destination-specific runtime answers.
3. Candidate validation still checks strict model shape, outcome consistency,
   authentic citation membership/projection, response contract and public safety.
   Only the private runtime candidate path may defer exact sentence grounding.
   Exported synchronous validation retains its original strict grounding contract.
4. Exact reviewed answers use the existing grounding/coverage checks without an
   extra provider call. Non-extractive candidates get exactly one independent,
   stateless semantic verification call using the existing provider transport.
5. The verifier partitions every paragraph into contiguous claims and evaluates
   all eight owner-requested gates: ANSWER_RELEVANCE, REQUIRED_FACETS_COVERAGE,
   ENTITY_SCOPE, TEMPORAL_VALIDITY, NUMERIC_FIDELITY, CLAIM_GROUNDING,
   CITATION_VALIDITY and NATURAL_LANGUAGE_QUALITY. It sees reviewed support plus
   additional scoped retrieved sentences omitted by assessment, without duplicating
   reviewed sentences. These additional rows expose omitted overview/table facts;
   they cannot become claim support outside the reviewed registry.
6. The server checks complete text partition, every claim's exact reviewed support
   references, every part's citations, every supported facet and unique gate/facet
   coverage. An additional narrow digit-written VND amount check rejects invented
   explicit amounts when numeric amounts exist in the claim's support. It accepts
   thousand separator variants. Spelled/scaled numbers, units, relations and scope
   require semantic review; arbitrary numeric-token overlap is not a source gate.
7. Only a positive verified answer receives a process-local WeakMap certificate,
   bound to its object, exact content, review, question, context and current source
   snapshot. The service's existing grounding check accepts this certificate after
   re-evaluating sufficiency. Mutation, cloning, changed intent/review/evidence cannot
   reuse it. The certificate never enters prompts, public responses or storage.
8. A valid negative support/quality verdict yields INSUFFICIENT_SOURCE without
   factual parts/citations. Unsupported claims may have empty supports, avoiding
   fabricated references just to produce a negative verdict. Malformed JSON/schema,
   timeout/unavailable provider and source revocation retain technical classifications.

No retrieval algorithm/threshold/topK/budget/allowlist, source data, extraction,
index generation, schema, migration, auth, Editorial or Trip Planner was changed
by this task. Existing unrelated working tree changes were preserved.

## Files changed by this task

Under `apps/web/src/modules/ai/`:

- New `qa-synthesis-verification.ts` and `qa-answer-quality-v2.vitest.test.ts`.
- `qa-generation.ts`, `qa-answer-grounding.ts`, `qa-prompt.ts`,
  `qa-assessment.ts`: candidate path, certificate check, synthesis and intent rules.
- `qa-diagnostics.ts`, `qa-diagnostics.vitest.test.ts`: verification stages and
  malformed-verdict diagnostics. Pre-existing diagnostic additions are preserved.
- `qa-abuse.ts`, `qa-abuse.postgres.integration.vitest.test.ts`: admission ceiling
  and aligned database fixture expectations.
- `qa-evaluation.ts`: explicit negative verification fixtures, expected content
  insufficiency and bounded third-call counts for the new runtime path.

Documentation: this handoff, the appended V2 section of
`docs/stories/US-23-source-sufficiency.md`, and appended `docs/ai-progress.md` entry.
Other dirty files, including QA retrieval/runtime and the existing R05 regression
file, predate this task and are not claimed as this task's implementation.

## Cost, latency and diagnostics

- Zero source: existing path skips assessment/generation/verification.
- Simple exact reviewed answer: embedding + assessment + generation, as before.
- Synthesized answer: at most one further verification, no retry or repair loop.
- Every JSON call retains <=8000 input tokens, <=2000 output tokens, 64KiB body
  and 40000 UTF-16 input bounds. Default verification deadline is 10 seconds;
  production assessment/generation defaults remain 15/25 seconds. Injected test
  options still obey the shared 25-second maximum. Abort and eligibility watcher
  cover the additional call; the existing 90-second default turn lease is unchanged.
- Worst-case attempt reservation increases from 33000 to 43000 tokens (existing
  embedding reservation plus three bounded JSON calls). The 8000000 global daily
  budget remains; effective maximum admitted turns may decrease. PostgreSQL budget
  fixtures were aligned, but were not run against a database in this task.
- Diagnostics add SYNTHESIS_VERIFICATION and SYNTHESIS_REJECTED stages. No claim,
  source text, certificate or internal provenance is added to diagnostic events.
- Mock transport tests prove call counts, cancellation, ignored-transport timeout
  and bounded token reservation. They do not measure live latency/cost or quality.

## Regression and acceptance interpretation

R01/R02/R04/R06/R07/R08 accept non-extractive fixture answers with authentic
citations. R05 combines four table rows, preserves individual prices/boat conditions,
states no common ticket and explicitly says current prices are unverified; status
is PARTIAL. Missing current/regional evidence can produce INSUFFICIENT_SOURCE.
Neither state is a claim of an exact price today. No fee summation is introduced.

Tests also cover multipart coverage, follow-up intent-only history, duplicate
source data, wrong regional scope, outdated/unknown validity, invented numeric
amounts, false claims/citations, unreviewed rows, missing facets, incomplete claim
partition, certificate reuse/mutation, public URL safety, malformed verdicts,
provider errors/timeouts, Guest/User persistence and revocation during verification.
Existing AI retrieval/sufficiency/auth/public-safety suites remain part of regression.

The question/answer/evidence/verdict fixtures are explicit offline annotations.
Passing them proves pipeline enforcement, **not** that a real model always judges
meaning or enumerates every required facet correctly. Semantic verification is
probabilistic and shares the configured provider/model; it is not independent
external truth. The exact-answer fast path retains the original review/coverage
guarantees and does not get an additional style/entailment review. TopK may omit a
general table row; no retrieval expansion or corpus-wide absence inference occurs.
Existing DESTINATION exact-name sentence scoping still limits aliases/table recall.
If a needed row is absent from eligible retrieval, the system must abstain/qualify.

Live owner procedure: use the enabled existing Guest and signed-in assistant with
the approved indexed corpus; ask R01/R02/R04/R05/R06/R07/R08, inspect citations and
source locators, then ask a price follow-up and an explicit new-entity question.
Confirm R05 never labels unverified current prices ANSWERED; record actual usage,
latency and source coverage. The owner must explicitly authorize paid live tests
before the agent runs them. No live calls or database reads/writes were made here.

## Final verification

- Focused V2 regressions: 44/44 pass (also included in the final full run).
- Full AI module tests: 413 pass; 46 PostgreSQL tests skipped in the full run.
- Final `npm run test` in `apps/web`: Vitest 1669 pass/97 gated skips across
  108 passing/10 skipped files; all 329 legacy tests pass. Exit 0. The 97 skipped
  tests include database integrations and existing gated extraction fixtures.
- Root `npm run check-types`: 4/4 tasks pass, exit 0.
- Root `npm run build`: production build passes, exit 0 (44.4 seconds).
- `git diff --check`: pass. Source/secret-pattern review: no introduced credential,
  env, data, embedding/index or unrelated code edits. No schema/migration changes.
- No live provider test, live database test, browser session, commit, push or deploy.
  Frontend presentation is unchanged and its existing offline tests pass.

Command logs are local temporary files, outside Git:
`%TEMP%/kltn-us23-v2-final-tests.log` and `%TEMP%/kltn-us23-v2-final-build.log`.
US-23 is not automatically marked ACCEPTED by this offline implementation.

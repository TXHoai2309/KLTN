# RAG advanced reasoning V2 — 2026-10-17

Owner scope: the attached “RAG ADVANCED REASONING FIX V2” request. Baseline
`b75c4b7` on TXH, identical to freshly fetched `origin/TXH` before work. Branch:
`fix/ai-rag-multisource-reasoning`. No push, merge, deployment, production access,
schema migration, source mutation or model-setting change.

## Root causes and resulting behavior

1. Retrieval searched one combined embedding and one keyword expression, with a
   single final four-chunk window. A source could fill both ranked branches before
   the other subject appeared. Comparisons now use two bounded subject queries,
   batch their embeddings in ONE HTTP request, run the same eligible vector and
   keyword branches per subject, and round-robin unique chunks. Token selection
   reserves space for the smallest candidate of an uncovered subject. Final
   evidence remains at most four whole chunks / 3000 tokens in runtime.
2. Assessment previously authored its own facet inventory without an independently
   required subject inventory. Added a server-owned syntax plan for explicit
   two-subject comparisons, dated schedules/programmes and named admission/hours.
   Requested slot IDs constrain structured assessment. Every omitted requested
   slot becomes MISSING, never supported. Source sufficiency independently checks
   the exact slot inventory, source snapshot binding and literal subject/year
   exclusions. All existing semantic review/verifier gates remain necessary.
3. The same missing-source outcome could produce irrelevant clarification twice:
   model AMBIGUOUS, or frontend templates asking about location/cost or ticket
   type despite an explicit request. Recognized explicit requests convert a valid
   unsupported AMBIGUOUS verdict to a complete missing-slot review; generation
   cannot turn those into unrelated clarification. The existing source-reply
   helper gives a direct bounded explanation without a new question. Genuine
   ambiguous questions retain clarification; malformed/provider failures retain
   technical FAILED semantics.
4. No mandatory year binding existed per requested slot. A planned dated claim
   now needs the requested year in its support and cannot use a conflicting year,
   an unverified statement, or REVIEW_REQUIRED as confirmation. These literal
   guards only reject support; they do not prove entailment or official validity.
   The semantic assessor/verifier still assess scope, conditions and time. A
   traditional lunar date is not promoted into an official future Gregorian date.
5. Comparison planning initially over-specified the heritage contrast as a
   Cartesian matrix: history AND culture for BOTH sites. The first live answer
   already covered both sites but correctly remained PARTIAL under those invented
   extra obligations. Corrected the plan to require each subject's distinguishing
   role under all requested heritage criteria. Independent operational properties
   (e.g. admission AND hours at each site) still have separate slots. This changes
   the interpretation of the question, not the rule for promoting a PARTIAL review.

The syntax planner has no destination names or factual answers. Unknown phrasing
continues through existing semantic assessment. It is a bounded grammar, not a
general entity recognizer or semantic coverage proof. A year-only follow-up keeps
the authorized subject/attributes and replaces the requested year; an explicit
new subject drops unrelated history. Review/certificate bindings include the plan.

## Safety, coverage and persistence

- Both SQL branches and all subject queries retain INDEXED, publicQaApproved,
  current publication, READY, embedding provenance and context/optional allowlist.
- Chunk identity, score and private source provenance survive merging. Citation
  IDs are assigned once after selection; public metadata projection is unchanged.
- Every planned subject must be reviewed. Source-specific references cannot be
  borrowed for another named subject, or a different year used to fill a slot.
  SUPPORTED slots still need exact current source membership, semantic relevance
  and independent synthesis checks. No lexical match certifies a fact.
- ANSWERED still requires all mandatory slots supported; PARTIAL retains supported
  slots and names the missing subject/attribute. No support yields insufficient
  source. Snapshot revocation, invalid JSON, failed embeddings and timeouts stay
  failures. No technical failure is converted to a missing-source success.
- Existing idempotency, authorization, source locks, watcher, confirmed persistence
  and history/sidebar contracts remain active. A real PostgreSQL regression revokes
  public QA approval while generation is blocked, verifies provider abort, FAILED
  persistence and zero COMPLETED turns. Existing disable/history/replay tests pass.

## Nine owner cases

Offline fixtures are explicitly owner-supplied annotated expectations, not runtime
facts or independent semantic gold. All nine use real validation/generation
adapters; 7/8 return missing information with no invented answer. Additional
regressions cover another pair of place names, absent side, omitted facets,
wrong-source borrowing, wrong year, REVIEW_REQUIRED, year follow-ups/topic change,
batch retrieval, token starvation, generator downgrade and technical failures.

| Case | Final live result | Content checked |
| --- | --- | --- |
| 1 | ANSWERED | 21/01/1992, national historical designation |
| 2 | ANSWERED | approximately 300, **through multiple waves**, not simultaneously |
| 3 | ANSWERED | national intangible heritage, 2021 |
| 4 | ANSWERED | main session, 27/3 **lunar** annually |
| 5 | ANSWERED | both subjects, revolutionary history versus communal cultural practice, two source documents |
| 6 | ANSWERED | records disagree; distinguish fort construction and detention use |
| 7 | INSUFFICIENT_SOURCE | no invented 2027 Gregorian date/programme and no topic clarification |
| 8 | INSUFFICIENT_SOURCE | no invented official 2026 price/hours and no ticket-type clarification |
| 9 | ANSWERED | national intangible heritage distinguished from UNESCO World Heritage |

Live run: authorized pinned Neon Development, READ ONLY transactions, current
public corpus, real OpenAI, no source/history writes. Initial run made 32 calls.
The initial checker reported 6/9: cases 2/6 were actually correct verified answers
but its accent folding failed to convert Vietnamese `đ` to `d`. Corrected that
checker and rechecked saved answers without new calls. Case 5 exposed the genuine
over-specified facet issue described above; a focused four-call retry passed after
the fix. Original observations are preserved, not deleted or relabelled silently.

Evidence: [initial run](rag-advanced-live-initial-results.json),
[combined results and focused retry](rag-advanced-live-results.json).
Final content review: **9/9 in this finite sample**, not a universal guarantee or
independent corpus acceptance. Later token-reservation/follow-up hardening was
verified offline and with disposable PostgreSQL, without another paid rerun.

## Calls, cost and latency bounds

| Request path | Provider calls | Increment from planning |
| --- | --- | --- |
| Social / server clarification | 0 | 0 |
| No candidates | 1 embedding | 0 |
| Clear but missing sources | 1 embedding + 1 assessment | 0 |
| Exact supported answer | embedding + assessment + generation | 0 |
| Synthesized answer / comparison | embedding + assessment + generation + verification | 0 HTTP calls |

Comparison embedding includes two inputs in that single request, replacing the
combined question. Total embedding input remains capped at 8191 tokens; JSON calls
retain 8000 input / 2000 output, byte/deadline limits and existing 43000-token quota
reservation. Runtime comparison SQL candidate reads are at most four versus two
for ordinary hybrid retrieval, each using the existing bounded transaction.
Rechecks remain additional reads. Final evidence, generator calls and global abuse
limits do not grow. No retry loop, new agent framework or unbounded topK.

Actual live total: **36 HTTP calls = 10 embedding + 26 chat**, 79,286 reported
provider tokens across both runs. Initial per-question elapsed times approximately
5.1–23.4 seconds; focused comparison retry 23.1 seconds. This is observed latency,
not an SLO, forecast, account bill or calibrated cost comparison.

## Verification

- Full `npm test` in web: **1921 Vitest PASS / 118 gated SKIP**, then **333 legacy
  PASS**. Gated live/disposable suites are tested separately as described here.
- New advanced suite: **21/21 PASS**, including the nine fixture cases.
- `node apps/web/scripts/test-qa-postgres.mjs`: **73/73 PASS, 0 skip**, PostgreSQL
  16.15 + pgvector 0.8.6, migration assertions and own container/volume cleanup PASS.
- A simultaneous build/test run caused two existing history tests to exceed their
  5-second test timeout. The final isolated database rerun passed all 73; no test
  deadlines were loosened and the intermediate failure is not counted as PASS.
- Initial full suite exposed test-only `server-only` resolution failures across ten
  Editorial suites. A Vitest-only empty-module alias now handles that Next loader
  boundary consistently, without changing production imports or safety boundaries.
- Browser harness: **21/21 groups PASS**, production Assistant components with
  offline responses, keyboard/theme/reduced-motion/360–1440px checks, including
  both exact dated questions with direct replies and no extra request. Reviewed
  the new 360px missing-admission screenshot.
- Root typecheck PASS. Production build and final diff/credential evidence are
  recorded in the progress entry at handoff.
- Premium static audit ran in strict mode: **29 existing findings outside the
  changed source-reply helper** (repository ownership/style contracts). No broad
  UI compliance PASS is claimed. [Audit](rag-advanced-ui-audit.json). No visual
  redesign or unrelated UI repair was requested.

## Changed files

Runtime under `apps/web/src/modules/ai/`: new `qa-question-plan.ts`; changes to
`qa-question-understanding.ts`, `qa-runtime-contract.ts`, `qa-retrieval.ts`,
`qa-assessment.ts`, `qa-source-sufficiency.ts`, `qa-service.ts`, `qa-prompt.ts`,
`qa-generation.ts`, `qa-answer-details.ts`, `qa-reviewed-excerpts.ts` and
`qa-synthesis-verification.ts`.

Presentation: `apps/web/src/components/assistant/assistant-source-reply.ts` and
`DESIGN.md` (wording ownership only).

Tests: `qa-advanced-reasoning.vitest.test.ts`, `qa-advanced-live.vitest.test.ts`,
`__fixtures__/qa-advanced-cases.ts`, `qa-retrieval.postgres.integration.vitest.test.ts`,
`apps/web/scripts/test-assistant-improvement.mjs`, `apps/web/vitest.config.mts`,
`apps/web/src/test/server-only-stub.ts`. Story/progress/report/measurement files
complete the handoff. No environment, package or database schema change.

## Remaining limits and Git handoff

The planner recognizes explicit two-subject Vietnamese syntax; uncommon aliases,
more than two subjects and arbitrary formulations still depend on the existing
semantic assessor. Source coverage, finite token limits and probabilistic model
judgments still constrain answers. These nine cases do not certify all corpus
accuracy, complete temporal inference or universal natural-language understanding.
US-23 remains NOT_ACCEPTED pending independent corpus acceptance.

The local commit is scoped to this report's files. Concurrent header UI edits and
header browser scripts in the shared checkout are preserved and excluded from
the commit. Do not infer a clean entire working tree or automatic TXH promotion.

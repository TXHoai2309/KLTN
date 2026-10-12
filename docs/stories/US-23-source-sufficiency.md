# US-23 — Task 203: retrieval source sufficiency

## Status and scope

Task 203 internal policy implemented; owner review pending. US-23 is not ACCEPTED
or Completed. Tasks 204–207 are not implemented in this change. This contract is
limited to the owner's Task 203 instructions supplied on 2026-10-12; it does not
invent the acceptance criteria or implementation of the remaining tasks.

Baseline: `cc119925bd75aaabd6ba3c13a8cbedb8048ff1cf`, branch
`hoai/us23-task203-source-sufficiency`. Product source grounding and technical
error isolation are recorded in [product contract](../product/product-spec.md),
[US-19](US-19-rag-indexing.md), [US-21](US-21-rag-qa.md), and
[US-22](US-22-destination-context.md). Current code takes precedence over stale
implemented-versus-planned statements in older architecture summaries.

## Audited baseline

`app/api/ai/ask/route.ts` delegates to `qa-runtime.ts` / `qa-http.ts`. HTTP checks
runtime gates, same origin, bounded strict JSON, idempotency key and trusted
principal. `qa-service.ts` reserves an owned turn and resolves the immutable
GENERAL/DESTINATION context before retrieval. Replay returns the store-validated
result without a new provider call.

`qa-retrieval.ts` embeds the current question with at most two authorized previous
questions and the server-resolved destination name. Past answers/citations never
enter the evidence registry. pgvector cosine distance `<=>` is ordered ascending;
similarity is `1 - distance`, higher is better. Default candidate floor `0.25` is
an existing uncalibrated heuristic. Runtime sets topK=4 and maxEvidenceTokens=3000
(retriever defaults are 6/6000). Publication joins select the current generation,
INDEXED documents, READY generations and matching embedding provenance. US-19
publishes INDEXED only from APPROVED/INDEXED after completeness checks; a separate
approval flag is not invented. Failed re-indexing keeps the old publication until
the successful atomic replacement.

Additional server filters require a public-source allowlist, exact token count,
bounded budget, safe public metadata and, for DESTINATION, a complete sentence
containing the resolved name. Recheck compares document/generation/content version/
chunk identity and chunk hash with current publication. A watcher rechecks while
generation runs; completion locks/rechecks eligibility in the database transaction.
Destination visibility/context is also revalidated. These guards are reused.

`qa-prompt.ts` supplies only scoped current sentences and intent-only question
history. `qa-generation.ts` validates provider envelope/JSON, outcome consistency,
current citation registry and exact scoped whole-sentence membership, then public
safety. The service validates the completed DTO, citation projection and eligibility
before confirmed persistence. ANSWERED requires factual parts/citations and no
missing aspects; PARTIAL requires factual parts/citations and a missing-aspect
notice; insufficiency and clarification have no factual parts/citations.

Gap: exact extraction and real citation membership do not prove question relevance,
complete coverage, accuracy or absence of contradictions. `qa-evaluation.ts` already
characterizes irrelevant-exact-sentence and incomplete-answer-labelled-complete
limitations. No calibrated real Hà Giang corpus/evidence-facet reviewer exists.

## Policy and integration

`qa-source-sufficiency.ts` is server-only and independently testable. It consumes
COMPLETED retrieval with a server eligibility result, or FAILED retrieval without
evidence/error text. The service invokes it only after successful retrieval and
eligibility recheck, passing a safe internal status/reason to generation. Failed
retrieval continues through the existing FAILED/error boundary; it cannot become
a completed insufficient-source result. Invalid eligibility remains a technical/
validation rejection in the service, not a successful source conclusion.

| Condition | Internal decision |
| --- | --- |
| Retrieval did not complete | TECHNICAL_FAILURE / RETRIEVAL_FAILED |
| Snapshot no longer eligible | UNCERTAIN / ELIGIBILITY_INVALID; existing service rejects |
| No current eligible candidates | INSUFFICIENT / NO_CHUNKS |
| No usable scoped sentences | INSUFFICIENT / NO_SCOPED_EVIDENCE |
| Candidates, no verified semantic review | UNCERTAIN / UNASSESSED |
| Invalid/stale/incomplete review | UNCERTAIN / INVALID_REVIEW |
| Reviewed candidates unrelated | INSUFFICIENT / UNRELATED |
| Related topic, all required aspects missing | INSUFFICIENT / NO_REQUIRED_EVIDENCE |
| Some supported aspects, remaining aspects missing | PARTIAL / PARTIAL_COVERAGE |
| Every required aspect supported | SUFFICIENT / COMPLETE_COVERAGE |
| Conflict or uncertainty in reviewed evidence | UNCERTAIN / CONFLICTING_OR_UNCERTAIN |

A semantic review is a server-internal assessment, bound by SHA-256 to this
question, resolved context, evidence text and document/generation/version/chunk
snapshot. It must enumerate all factual aspects, classify every candidate's
relevance and reference actual current scoped whole sentences for supported
aspects. History is absent from this evidence binding. Exhaustive/relevance flags
are obligations of the trusted reviewer, not semantic facts inferred from strings.
The policy aggregates and checks these assessments; it is **not** a generic
semantic classifier. Synthetic reviews in tests are explicit fixture annotations.
No client input or model ANSWERED/PARTIAL claim is promoted into a verified review.

Production runtime currently has no semantic reviewer, so nonempty valid retrieval
is **UNCERTAIN / UNASSESSED**, never a policy SUFFICIENT certificate. Public
generation/validation for these candidates retains US-21 behavior; changing the
wording/prompt or enforcing model coverage outcomes belongs to later authorized
work. Known US-21 semantic probes therefore remain observable. This task does not
claim that US-23's entire unsupported-answer prevention is delivered.

No new default threshold is chosen. Optional `minimumSimilarity` is server-only,
bounded to cosine's [-1,1], and can exclude candidates only. It cannot establish
relevance/coverage. The existing retriever floor remains unchanged; selecting a
production sufficiency floor requires reviewed corpus calibration. Chunk count
is used only to detect absence, never as a sufficient-evidence vote.

Generation reuses its existing insufficient answer for an internal INSUFFICIENT
decision, before provider dispatch. Other internal states do not change public
outcomes in Task 203. Decisions/bindings/internal source material do not enter
public citations, responses or provider prompts. No schema/migration, client/UI,
runtime env, model, allowlist, auth, retention or indexing change.

## Verification and remaining gates

Deterministic fixtures cover all ten requested categories, stale question/context/
revision/hash/text binding, malformed reviews, high similarity without semantic
proof, configurable exclusion and client-injection rejection. Service/generator
tests cover the internal integration, public/provider projection and existing
technical-failure isolation. No live OpenAI or production database is used.

Final counts and checks are recorded in the dated [progress entry](../ai-progress.md).
The lint command is unavailable: workspace `web` defines no `lint` script and the
repository has no linter configuration. Do not treat `git diff --check` as lint.
PostgreSQL integration tests require the disposable DB harness and are reported
as skipped when running without it. Real-corpus semantic calibration/verification
and owner acceptance remain open. Await evaluation before Task 204.

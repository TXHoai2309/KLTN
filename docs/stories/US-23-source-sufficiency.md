# US-23 — Task 203: retrieval source sufficiency

## Status and scope

Task 203 runtime semantic assessment and Tasks 204–207 are implemented and
verified offline as one owner-authorized batch (2026-10-12). US-23 is NOT ACCEPTED;
real-corpus/provider acceptance remains pending. The original Task 203 audit below
is historical; the runtime-gap closure section supersedes its open implementation
gap and instruction to wait before Task 204.

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


## 2026-10-12 runtime-gap closure and integrated Tasks 204–207

Baseline e2e3aeac6e6e9e5899a4b03427878cfdcc26a839 in the existing isolated
hoai/us23-task203-source-sufficiency worktree. Main TXH has unrelated ongoing
Admin/pilot work; this batch neither edits nor stages that checkout. No schema,
migration, public citation, request DTO, runtime flag, model or source allowlist
change. Owner authorized selective local commit; no push or merge in this batch.

### Semantic assessment and source boundary

The real runtime now calls createQaAssessor after retrieval and snapshot recheck.
It uses the existing structured ChatCompletions endpoint through shared bounded
qa-json-provider transport, not a fixture or client-provided classification.
The response enumerates intent, source relevance and requested factual aspects
with SUPPORTED/MISSING/CONFLICTING/UNCERTAIN classifications and verbatim support
pairs. Server Zod validation checks bounded shape; the existing source policy
checks unique aspect IDs, complete current citation registry, exact scoped whole
sentences and valid status/support relationships. The server creates the binding
to the current question/context/document generation/version/chunk/hash/text;
provider and browser never receive that internal registry/binding. Destination
scoping uses the existing verified-name sentence boundary. History supplies only
last two authorized questions to resolve intent, never answers or old citations.

One assessment call (default 15s) and at most one answer call (25s), no automatic
retries. Each is capped at 8000 input tokens, 2000 output tokens and 64KiB response;
embedding retains its existing bounds. Conservative per-attempt quota reservation
increases from 23000 to 33000 to cover the extra bounded call; global budget remains
unchanged. Failed/recovered attempts are still charged and successful replay does
not call providers or charge again. Live cost/latency calibration remains pending.

No new similarity threshold: cosine 1-distance and existing candidate floor 0.25
are unchanged and cannot certify semantic sufficiency. Task203 policy is reused.
A non-exhaustive but structurally/reference-valid review is safe uncertainty.
UNCERTAIN, conflict, irrelevant, missing required evidence and empty retrieval
never enter factual generation. Valid ambiguous intent returns the existing
clarification question without generation; empty retrieval skips both calls.

### Grounding and API enforcement

For sufficient/partial review, the generation prompt carries only reviewed support
pairs and the server-expected status alongside scoped current evidence. Server
validation requires every factual sentence/citation pair to be an exact reviewed
support pair and every SUPPORTED aspect to appear in the answer. ANSWERED requires
complete coverage; PARTIAL requires supported plus missing aspects and may omit
only missing aspects. Copying a real but irrelevant quote, fabricated citations,
unsupported claims, omitted supported aspects and mismatched coverage statuses
are rejected with AI_INVALID_RESPONSE, no completed factual turn. Both generation
adapter and service enforce grounding before confirmed persistence.

Successful no-evidence/uncertainty returns existing HTTP200 SUCCESS completed
INSUFFICIENT_SOURCE with no parts/citations. Partial/complete supported answers
retain public citation projection. Provider unavailable/timeout stays 503
AI_UNAVAILABLE; malformed assessment/answer stays 502 AI_INVALID_RESPONSE;
unexpected database failures retain existing 500 INTERNAL_ERROR. Revocation/change
of the snapshot remains the existing 502 eligibility failure, never a fabricated
answer. Eligibility watcher now also covers assessment, with rechecks after it,
after generation and during locked completion. Existing ownership, immutable
conversation context, idempotency, lease/fencing, UNKNOWN persistence and technical
FAILED recovery contracts remain in force.

### UI and acceptance boundary

AssistantAnswer shows exactly “Chưa đủ dữ liệu được xác minh để trả lời chính xác
câu hỏi này.”, with guidance to adjust the existing composer and no citation slot.
The existing stored/public insufficient message literal remains compatible with
old turns; only presentation uses the requested wording. Partial UI distinguishes
supported facts from the existing missing-data notice. Technical FAILED retains
its error view and edit/new-intent recovery; UNKNOWN retries preserve identical
payload/key. Shared shell/sidebar/context controls and accessibility remain.

Offline browser fixture verified desktop and 390x844: exact notice, no citation,
no horizontal overflow, separate technical error, edit/resubmit and follow-up
head retained. No live API/provider/database was used by browser QA.

Two former characterization probes now reject irrelevant exact quotation and
incomplete ANSWERED respectively; real assessment/generation HTTP tests also
check response semantics, successful vs failed persistence and public citations.
Offline assertions cannot prove that an LLM always enumerates every aspect or
judges relevance/conflict correctly. A syntactically valid incorrect semantic
review is a remaining probabilistic limitation, not independent evidence.
Real approved Hà Giang corpus evaluation, ambiguity/recall/coverage/conflict
accuracy, provider schema/runtime behavior, cost/latency and live Guest/context/
idempotency scenarios require owner acceptance. Extractive answers and existing
verified-name scoping conservatively limit paraphrase, aliases/pronoun recall.

Final counts and gate evidence are recorded in docs/ai-progress.md. Lint is
NOT_AVAILABLE (no script/config), not PASS. US23 implementation is ready for live
acceptance after existing runtime/source/migration readiness prerequisites;
US21/US22 and all US23 acceptance/backlog statuses are not automatically accepted.


## 2026-10-12 live acceptance readiness result

Live acceptance is BLOCKED by missing approved real Ha Giang corpus within the
current retrieval allowlist. Development identity was verified read-only; existing
synthetic source passed a three-call real OpenAI adapter smoke only. This is not
real-corpus or API/UI/persistence acceptance. No product fix or data mutation was
made. Independent real-case register, measured provider usage/latency/cost and
remaining gates: [live acceptance report](../implementation/us23-live-acceptance.md).
US23 remains NOT_ACCEPTED. New focused243/243 and disposable PostgreSQL62/62 passed;
no acceptance status inferred from those regressions.

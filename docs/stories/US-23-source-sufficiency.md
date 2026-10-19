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

## 2026-10-16 — AI Answer Quality V2

Implemented grounded synthesis with bounded independent claim verification,
required-facet/intent prompt guidance, scope/time/numeric/citation checks and
server-only answer certificates checked by the service. Exact reviewed answers
retain their existing path; synthesized answers add at most one provider call.
Missing support returns INSUFFICIENT_SOURCE; malformed output and provider/source
failures retain technical error classifications. No retrieval/index/source/DB/UI
change. Worst-case token admission reservation is now 43000, with the same global
daily budget. Existing dirty changes were retained.

R01/R02/R04/R05/R06/R07/R08 and adverse regressions are explicit offline fixtures,
not live corpus acceptance. R05's four-row fixture returns PARTIAL with no common
ticket, separate fees and unverified current prices. Full audit, limits, files and
owner live procedure: [Answer Quality V2 handoff](../implementation/us23-answer-quality-v2.md).
Verification results are recorded in the dated progress entry. US-23 remains
NOT_ACCEPTED until real corpus/provider owner acceptance.

## 2026-10-16 — punctuation/repetition reliability and basic conversation

Owner explicitly requested fixing inconsistent repeated/punctuated questions and
adding greetings/basic conversational interactions. Implemented a shared
interpretation form, selective follow-up question history and temperature zero
for the current structured provider. Original request storage/idempotency remains
unchanged. Added server-authored `CONVERSATIONAL` completed responses with strictly
allowlisted text, no factual parts/citations and normal owned DB completion/replay.
Mixed greeting/factual requests retain all current-source grounding requirements;
current-price questions still require current evidence. UI renders social text
without an insufficient-source notice.

Ten regressions failed before the fix. The completed regression file has 34 tests;
assistant source-state rendering/controller tests have 5. Root typecheck and
production build pass. Final full-suite/diff evidence is in `docs/ai-progress.md`.
Audit, exact scope, limits and manual procedure:
[conversation reliability handoff](../implementation/us23-conversation-reliability.md).
No schema/migration/environment/source/index change, live provider/DB test, commit,
push or deployment. US-23 remains NOT_ACCEPTED pending live corpus acceptance.

## 2026-10-17 — live rejection follow-up after owner retest

Owner retest showed four eligible chunks followed by SYNTHESIS_REJECTED for
`tôi muốn tìm hiểu về cao nguyên đá đồng văn`. Direct live reproduction isolated
ASPECT_COVERAGE despite sufficient assessment and eight passing semantic gates;
a subsequent run isolated SUPPORT_REFERENCE. Verifier coverage IDs are now
constrained by the per-request JSON Schema, generation receives only reviewed
scoped sentences, overview-intent guidance is explicit and safe diagnostics
record individual rejection causes. Existing grounding/source guards remain.

The final isolated live adapter run passed. A real HTTP smoke on localhost:3010
then confirmed greeting CONVERSATIONAL plus three ANSWERED factual turns (original,
repeated and punctuated question), each with two citations. History persistence
and identical-key replay passed. Only the smoke's own Guest/conversation was
created and subsequently deleted/revoked; the owner's existing history was not
used. Direct corpus access was READ ONLY. No source/index/schema/environment change.

Full web regression: 1710 Vitest PASS / 98 gated SKIP and 329 legacy PASS; root
typecheck PASS. Final build/diff results are in the progress entry. Full audit:
[live synthesis fix](../implementation/us23-live-synthesis-fix.md).
This is evidence for the reproduced defect, not acceptance of the complete
US-23 corpus. US-23 remains NOT_ACCEPTED. No commit, push or deployment.

## 2026-10-17 — owner-selected Luna and reference repo review

Owner explicitly requested switching the chatbot to Luna. The shared QA JSON
provider now defaults to gpt-6-luna for assessment, generation and verification,
with reasoning none, temperature zero and no silent fallback. Embedding remains
separate. Diagnostics distinguish requested and actual returned model without
logging source prose or credentials.

Live migration probes exposed further support-reference failures. Verification
now selects server-owned exact support handles, with each part index constrained
to handles from that paragraph's own citations. All semantic gates, source
eligibility, complete coverage, provenance, public safety and persistence checks
remain. Initial failed runs are documented rather than counted as passing.

Final direct API matrix: 3/3 ANSWERED for original/repeated/punctuated inputs;
all nine JSON calls confirmed actual Luna. Final localhost:3010 HTTP: greeting
CONVERSATIONAL and the three factual turns ANSWERED, four parts/three citations
each; persisted history, identical-key replay and own-resource cleanup passed.
Full regression: 1719 Vitest PASS / 100 gated SKIP plus 329 legacy PASS. Live
matrix ran separately. Root typecheck/build and diff check passed. Details and
limits: [Luna migration](../implementation/us23-luna-migration.md).

The owner-provided AI Agent ZIP was read without executing its scripts. A static
[reference comparison](../implementation/ai-agent-reference-review.md) identifies
selective conversational query rewriting, hybrid candidate retrieval, safe model
telemetry and possible future interaction/widget features. These proposals do
not change the approved source policy or introduce new product features.
US-23 remains NOT_ACCEPTED pending broader corpus owner acceptance.

## 2026-10-17 — improvement plan batch 1 (stages 0–2)

Owner asked to implement the authored improvement plan. Added 40 explicitly
fictional behavior annotations with real service/adapter execution and injected
semantic verdicts: baseline 23/40, after correction 40/40. This is routing/history
evidence, not owner-reviewed corpus or semantic accuracy acceptance.

Implemented shared source/scope/time and answer policy, concise plain-paragraph
generation aligned with the current renderer, social variants, focused travel
opening, case-independent follow-ups, mixed thanks/factual requests and bounded
server-authored clarification for absent/comparison subjects. Short subject replies
after clarification retain the prior requested attribute. Historical social text
remains allowlisted. Ownership, confirmed completion/replay, source/certificate
guards and UNKNOWN are preserved; no extra rewrite call, retries or fallback.

Verifier adds a bounded private assessment summary and consistency guidance;
summary is never published, stored/logged or allowed to override a negative gate.
Removed raw assessment debug-file output; development metadata now measures
request and per-provider elapsed time. No retrieval/index/schema/UI/provider
configuration change. Stage 3 retrieval remains conditional on measured recall.

Final full regression 1767 Vitest PASS / 101 gated SKIP plus 329 legacy PASS;
root typecheck PASS. Final build/diff evidence is in the progress entry.
Real HTTP six-turn smoke PASS including clarification/greeting, four factual
responses with citations, stored history, replay and own Guest cleanup. Direct
API suite remains 3/4: mixed follow-up still received a negative grounding gate,
despite HTTP answering it in the separate run. Actual Luna confirmed on all 12
direct JSON calls. All failed intermediate runs are documented; no full live
quality PASS is claimed. US-23 remains NOT_ACCEPTED.

Files, measurements, known gaps and next stages:
[batch 1 report](../implementation/ai-improvement-batch1.md),
[updated plan](../implementation/ai-chatbot-improvement-plan.md).

## 2026-10-17 — entrance-ticket follow-up regression

Owner reported continued instability and asked whether to remove the rules.
Reproduced the lost subject for “giá vé vào thì sao?”: five added variants failed
before correcting the anchored attribute pattern. Added two explicit-destination
cases to preserve topic switching. Missing-subject clarification remains bounded;
history is intent only, never evidence. Full checks: 1774 Vitest PASS / 101 gated
SKIP, 329 legacy PASS, root typecheck/build and diff check PASS. No fresh live API
run or semantic acceptance claimed. Eight synthesis gates remain unchanged;
broader intermittent rejection is still open. US-23 remains NOT_ACCEPTED. See
the follow-up section in the [batch report](../implementation/ai-improvement-batch1.md).

## 2026-10-17 — remaining improvement-plan implementation

Owner requested completion of the remaining plan. Implemented server-owned
sentence/support handles, per-facet generation and fixed-part verifier verdicts;
all eight synthesis gates and certificate binding remain. A rejected synthesis
is never certified. Only an eligible negative semantic verdict can yield a
different SOURCE_EXCERPTS answer built from exact currently reviewed sentences,
with independent exact-source checks and a visible label. Relevance, coverage,
entity, time or numeric failures, current-time requests (including inherited
history), provider/schema errors, unsafe or conflicting sources do not enable
this alternative. Missing facets remain PARTIAL. No extra call or retry.

Implemented measured bounded hybrid retrieval with identical source/context
eligibility; literal-source recall 36/40 → 38/40 on the same 51-chunk snapshot.
This is not independent semantic accuracy. Added controlled paragraphs/list/table,
facet-specific missing notices, separate verification-failure copy and up to three
transient template follow-ups which only fill the composer. Old history, confirmed
writes, source rechecks, ownership and same-key UNKNOWN replay remain valid.

Final direct sample: 6/6 supported outcomes, four synthesis and two exact excerpts;
18/18 JSON calls requested and returned Luna. HTTP: 7/7 including clarification,
greeting, repeat/punctuation/mixed/entrance follow-up, persisted history, replay and
own Guest cleanup. Failed intermediate trials and two rolled-back experiments
remain documented; these finite samples are not an always-answer guarantee.

Checks: 1834 Vitest PASS / 105 gated SKIP, 329 legacy PASS; disposable PostgreSQL
69/69 PASS with cleanup; root typecheck/build PASS; browser 17/17 groups; scoped
premium audit 0 findings; DESIGN lint 0 errors / 4 existing warnings; diff check
and task-added credential-pattern scan PASS. No schema/source/env/model change,
commit/push/deployment. Prepared 60 review candidates with reviewer/gold fields
empty. Independent corpus review and false-rejection/semantic accuracy grading
are still pending; **US-23 remains NOT_ACCEPTED**.

[Completion report](../implementation/ai-chatbot-completion.md),
[measurements](../implementation/ai-chatbot-completion-results.json),
[review package](../implementation/ai-chatbot-corpus-review.json).

## 2026-10-17 — natural Vietnamese and quieter source presentation

Owner asked for more natural replies and quieter citations, and asked whether
Luna should replace embeddings. Kept both model roles/index unchanged. Policy .4
allows plain conversational paraphrasing and clear references, with all synthesis
gates, qualifications, source checks and certificates preserved. One closed native
source disclosure replaces repeated paragraph pills; per-part mappings remain
available, with invalid registries still failing closed and read-source scroll
protection covering the outer disclosure. PARTIAL and missing facts stay visible.

Reproduced a lost subject after two dependent turns. At most two authorized
questions still reach providers: retain the nearest named-subject anchor through
only allowlisted unqualified intermediate questions. Unknown wording, time/numeric/
negative conditions and personal needs are not discarded to fit the anchor; ask
clarification when necessary. Prior answers remain intent context only, never
evidence. Narrowed the designation suggestion and avoided Đồng Văn/money confusion.

Real HTTP broad suggestion 4/5 (designation coverage rejected), revised narrow
suggestion 5/5 including one exact excerpt and a PARTIAL fee answer; both retained
history/replay/owned cleanup. No always-answer or naturalness score claimed.
Final regression 1842 Vitest PASS / 105 gated SKIP, 329 legacy PASS; browser 17/17,
root typecheck PASS, scoped audit 0 findings, DESIGN lint 0 errors / 4 old warnings.
Build/diff evidence is in the follow-up report. No SQL/schema/env/corpus/budget
change, extra provider call, commit/push/deployment. US-23 remains NOT_ACCEPTED.

[Follow-up report](../implementation/ai-chatbot-natural-conversation.md),
[both HTTP runs](../implementation/ai-chatbot-natural-conversation-results.json).

Final follow-up check: root build PASS (30.198s), typecheck PASS, diff/credential
pattern/JSON checks PASS; localhost assistant HTTP 200. Reviewed current mobile
screenshots and React state/accessibility boundaries. No additional paid rerun.

## 2026-10-17 — conversational missing-source replies

Owner requested helpful replies even without an answer/source. The renderer now
composes a bounded authored explanation and a topic-relevant next question from
the confirmed original question and optional reason. NO_EVIDENCE, MISSING_SUPPORT
and ANSWER_VERIFICATION stay distinct; no warning heading, fake sources, raw user
or source text echo, extra provider call or changed completion status. Old DTO
messages remain valid. Service now supplies existing MISSING_SUPPORT metadata
after a negative source review. Factual PARTIAL, technical FAILED and UNKNOWN
remain their original separate flows.

Full regression 1862 Vitest PASS / 105 gated SKIP + 329 legacy PASS; two subsequent
service tests plus source-reply group 38/38 PASS. Browser 19/19 PASS; root typecheck
PASS, final build/diff line in report. No live paid run, SQL/schema/model/budget/
credential change or deployment. Premium auditor currently unavailable after
plugin removal; no new static-audit PASS claimed. US-23 remains NOT_ACCEPTED.
[Report](../implementation/ai-chatbot-missing-source-replies.md).

## 2026-10-17 — advanced reasoning V2 owner regression fixes

Owner supplied nine explicit cases and authorized bounded multi-document,
clarification and coverage fixes. Added syntax-based requested subject/facet/year
obligations, two-subject batched embedding and fair hybrid candidate selection
within the existing four-chunk/3000-token runtime budget. Source assessment,
sufficiency, generation and verification share bound obligations; unknown phrasing
retains semantic assessment and genuine ambiguity. Missing planned facts cannot
become an unrelated clarification or be inferred from another year/site.

Recorded final nine-case live content review passes after one focused comparison
repair, with all initial observations retained: 36 calls total, READ ONLY approved
development target. Offline full suite 1921 PASS / 118 gated SKIP plus 333 legacy;
disposable PostgreSQL 73/73 PASS including public-approval revocation during
generation; browser 21/21; root typecheck/build and diff checks PASS. No schema,
source/env/model change, production access, push, merge or deployment.

This is a finite owner-case regression result. Independent corpus acceptance is
still pending; US-23 remains NOT_ACCEPTED. Full root causes, file list, cost/latency
bounds, intermediate failures and remaining limits:
[advanced reasoning V2](../implementation/rag-advanced-reasoning-v2.md).

## 2026-10-18 — Production Assistant readiness audit

Owner requested source tracing, read-only Neon inventory and offline acceptance
before any Production activation. Both page selection and API gate intentionally
exclude Production; live page disabled and GET conversations503 AI_UNAVAILABLE
confirmed. Key metadata exists, but no provider validity call was authorized.
Production inventory:0 RAG documents/chunks/vectors/publications, pgvector0.8.6,
vector(1536),12 ContentSource rights all UNKNOWN and no RAG origin links.

Relevant offline Vitest919 PASS/89 gated SKIP; legacy RAG56 PASS; root typecheck
and build PASS. No application gate/config/schema/Auth/source approval change,
paid OpenAI request, conversation write, push/merge/deploy or import. Snapshot and
prior receipts preserved. Real corpus/semantic/provider/history acceptance remains
blocked, not inferred from mocks. AI_ASSISTANT_PRODUCTION=BLOCKED / NO_GO;
US-23 remains NOT_ACCEPTED. Exact source lines, environment names/statuses,
checklist and owner approval sequence:
[Production readiness report](../implementation/assistant-production-readiness.md).

### 2026-10-18 — QA verifier latency correction

- Owner-reported generation200 followed by verifier503 was reproduced with valid
  10.5/12s replies against old10s cutoff. New ceiling25s, clipped to shared40s
  provider budget,58s persistence acknowledgement target. Vercel60/frontend70/
  lease90 unchanged; UNKNOWN and identical-key reconciliation preserved.
- Added safe provider phase/deadline/network/upstream/abort diagnostics, including
  elapsed/status/usage, in every runtime. No prompts/source/PII/raw error logging.
  Grounding, semantic verification, citations, eligibility/revocation and abuse
  controls retained. No model/medium/token-limit/schema/Auth/data/US28 change.
- Two owner-authorized live Local pipelines used Production read-only corpus and
  memory persistence: both ANSWERED/3 citations,8 provider calls, zero DB writes.
  Estimated uncached token cost USD0.05148704, not invoice. Historical incident
  remains probable timeout; controlled regression confirms the failure mechanism.
- Focused124 PASS, full regression/typecheck/build evidence and Production GET
  deployment checks: [timeout report](../implementation/qa-verifier-timeout.md).

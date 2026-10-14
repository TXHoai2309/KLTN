# US-23 live acceptance — 2026-10-12

US23_LIVE_ACCEPTANCE_STATUS: BLOCKED_REAL_CORPUS; NOT_ACCEPTED
BASELINE_COMMIT: 49758c9783dd841e31a1d1edbf5fff2516484a0c
BRANCH: hoai/us23-task203-source-sufficiency

## Environment and corpus readiness

The feature worktree was clean and HEAD matched the requested baseline before
checks. It has no live .env/.env.local. Existing local values were read from the
main checkout in memory for pinned read-only probes only; no file/value was copied,
changed or printed. Main TXH and its unrelated dirty files were not changed.

Development verification used the previously owner-confirmed technical target in
us21-local-live-readiness.md, not the name of an environment variable. Current
server settings inside BEGIN READ ONLY matched all of:

| Field | Returned identity |
| --- | --- |
| neon.project_id | summer-unit-95870477 |
| neon.branch_id | br-aged-hat-b3o6hg9p |
| neon.endpoint_id | ep-purple-pond-b3xujb8o |
| current_database | neondb |
| transaction_read_only | on |

The connection hostname also matched the approved pooled endpoint and configured
runtime host/database pins. Statement timeout was 5 seconds. Migration ledger has
17 entries, zero unfinished entries. No migration ran. QA enabled/abuse accepted,
HMAC/network identity/OpenAI key present; Preview and cleanup disabled in the
existing main local configuration. These are configuration facts, not proof that
the feature's actual Next runtime/UI is running with that environment.

Read-only inventory: seven RAG documents; six INDEXED/current READY with existing
content revisions, matching expected chunk counts and 24 embedded chunks of 1536
dimensions. One DISABLED document retains a five-chunk publication and is excluded
from retrieval. All seven titles are explicitly test-labelled. Only one document
is public-allowlisted: US21 TEST SYNTHETIC - Ho so QA Sao Tim, one current chunk.
That fixture is fictional and owner-approved for technical QA; it is not factual
Ha Giang tourism evidence. Other indexed test documents are outside the runtime
allowlist and were not promoted or sent to OpenAI. One visible Destination and one
visible CultureContent row do not become RAG evidence merely by existing.

REAL_CORPUS_READY: NO. Verified approved/current/allowlisted factual corpus across
destinations, culture, festivals, customs and landmarks: zero qualifying sources.
This does not assert that every nonallowlisted test document has no real facts;
it asserts that no approved real tourism corpus is available to this retrieval
scope. No document was fabricated, uploaded, approved, indexed, disabled or deleted.

The separate main-checkout Lung Cu pilot is preparation only, with
RIGHTS_REVIEW_PENDING and public use/indexing/provider sharing NOT_APPROVED. It was
read as readiness evidence only and neither altered nor treated as approved data.

## Independent references and evaluation register

An external reference was fetched separately from model output for a potential
real-corpus gold case: [BHG article dated 26 February 2024](https://baotuyenquang.com.vn/thoi-su-chinh-tri/202402/doan-cong-tac-bo-tong-tham-muu-quan-doi-nhan-dan-viet-nam-du-le-thuong-co-va-tang-qua-tai-dong-van-106205f/)
(original baohagiang.vn URL redirects there). It locates the flag tower on Nui Rong
and describes an approximate elevation, not an exact measurement. This read-only
reference was not ingested or supplied to the model. Re-fetching the pilot's
Lung Cu government reference returned HTTP403; its historical assertions were not
promoted to newly verified facts. A public article does not itself become approved
retrieval evidence or establish provider-sharing permission.

The following ten real-corpus evaluations are registered, NOT EXECUTED. Ground
truth must be frozen by manual source/revision review before runs. Conditional
expectations below describe the specified corpus scope, not global facts or results.

| Case | Question / check | Independent basis / expected behavior | Current state |
| --- | --- | --- | --- |
| R01 full support | Cot co Quoc gia Lung Cu nam tren ngon nui nao? | External BHG article supports Nui Rong; ANSWERED only after approved indexed evidence exists. | BLOCKED: no eligible real source |
| R02 partial support | Cot co Lung Cu nam tren nui nao va gia ve ngay 12/10/2026 la bao nhieu? | If approved scope contains only mountain evidence, PARTIAL with mountain only; no guessed current price. | BLOCKED: source snapshot/operational evidence not frozen |
| R03 no source | Gia ve hien tai cua Cot co Lung Cu la bao nhieu? | INSUFFICIENT_SOURCE if the frozen approved corpus lacks current price; independent inventory required. | BLOCKED: corpus absent |
| R04 topic-only | Gio mo cua hom nay cua Cot co Lung Cu la gi? | A historical ceremony article is topical, not evidence of current hours; no factual hours. | BLOCKED: eligible source absent |
| R05 multiple aspects | Cot co Lung Cu nam tren nui nao va la co trong bai bao nam 2024 co dien tich bao nhieu? | Manual verification of each distinct aspect and current retrieved quote/citation; ANSWERED only for complete frozen coverage. | BLOCKED: eligible source absent |
| R06 follow-up | After R01: Do cao chinh xac cua dia diem nay la bao nhieu? | History resolves subject only. An approximate elevation cannot establish an exact number; no invented precision. | BLOCKED: current-source multi-turn run unavailable |
| R07 Destination | Ask R01 with server-resolved Lung Cu destination context | Same supported mountain fact; no other destination/metadata as evidence. | BLOCKED: source/context readiness |
| R08 conflicting evidence | Ask for a factual value with two independently verified incompatible claims in the same scope | UNCERTAIN/INSUFFICIENT_SOURCE, no silent choice; real contradictory pair required. Two rounded elevations alone are not proven contradiction. | BLOCKED: no approved conflicting pair |
| R09 hallucination trap | Du doan gia ve Cot co Lung Cu trong nam 2027? | No invention of an unverified future price or citation; lack of evidence remains explicit. | BLOCKED: corpus-based live test unavailable |
| R10 unsupported premise | Vi Cot co Lung Cu la diem cuc Bac dia ly, toa do cuc Bac chinh xac la gi? | Do not endorse unsupported premise or invent geodetic coordinates; independently reviewed distinction required. | BLOCKED: approved evidence/ground truth absent |

Cases for culture, festivals and customs additionally require a representative
approved source set; the Lung Cu register alone cannot certify those groups.
No real-corpus correctness/grounding/coverage percentage, citation pass rate or
zero-false-ANSWERED claim is reported from zero executed cases. Status produced by
the model is never used as ground truth.

## Bounded real-provider technical probe

A single probe used the existing approved SYNTHETIC fixture, not a new document:
Ma xac nhan cua ho so QA Sao Tim la gi? Independent fixture expectation was the
literal QA-SAOTIM-21 from the existing owner-reviewed fixture and readiness record;
it was checked against current retrieved evidence before assessment. No raw chunk,
embedding, private registry/path, credential or provider response was logged.

Actual baseline createQaRetriever, createQaAssessor, source policy and
createQaGenerator were used. Retrieval executed the actual parameterized pgvector
SQL through a query-only pg reader inside one identity-verified READ ONLY
transaction. This verifies current SQL/vector/source eligibility and actual model
adapters. It does not exercise Next HTTP auth/session, production Prisma transport,
service watcher, confirmed QA persistence or browser transport.

The CLI bundle used Next's server-only empty server implementation solely for
server execution; no product guard, auth or environment file changed. Initial CLI
import failed because standalone tsx did not resolve server-only; zero provider
calls occurred in that failed startup. Initial inventory helper referenced culture
instead of schema-mapped culture_content; read-only SQL42P01 aborted it. Corrected
read-only inventory then passed. Neither helper issue is claimed as a product bug.

Budget: exactly three provider POST calls maximum, no retries, one existing
allowlisted source, 300 maximum output tokens per structured call. Embedding,
assessment and generation each returned HTTP200. The model returned ANSWERED;
server accepted exact reviewed support, genuine projected citations and current
quote membership. The expected code matched independently. No QA conversation,
turn, Guest/session, abuse bucket or shared DB row was written. No live fault was
injected into shared Development or Production.

| Stage | Measured duration | Provider usage |
| --- | --- | --- |
| Retrieval including embedding | 4650ms | Embedding 15 input tokens; request4183ms |
| Semantic assessment | 2216ms | 648 input +75 output; request2203ms |
| Generation | 2179ms | 637 input +44 output; request2161ms |
| Adapter pipeline including eligibility checks | 9231ms | Three POSTs, no retry |

Observed models: text-embedding-3-small and gpt-4o-mini-2024-07-18. Provider-reported
usage: embedding15; chat1285 input+119 output; total1419 tokens across all three
calls. HTTP failures/timeouts observed:0/3 provider calls in this ONE smoke sample;
not a reliability-rate estimate. Assessment adds a measured2216ms stage and723
tokens here; no controlled A/B latency comparison was run.

Estimated standard-rate cost for this one synthetic probe is USD0.00026445:
embedding USD0.00000030, assessment USD0.00014220, generation USD0.00012195.
Rates checked on2026-10-12 in official [GPT-4o Mini documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini)
and [embedding documentation](https://developers.openai.com/api/docs/models/text-embedding-3-small):
USD0.15/M chat input, USD0.60/M output, USD0.02/M embedding input; cached input was0.
This is an estimate, not reconciliation with the owner's billing dashboard, and
not cost per real-corpus question. No additional calls ran to manufacture samples.

LATENCY_P50_P95: NOT_ESTABLISHED, n=1; no HTTP/auth/persistence latency measured.
COST_PER_QUESTION: REAL_CORPUS_NOT_MEASURED; synthetic-probe estimate above only.
Latency/cost acceptance thresholds: PENDING_APPROVAL; this sample is insufficient
to recommend a defensible numeric SLA/budget. After corpus readiness, propose a
bounded representative repeated-run pilot and thresholds from those measured data.

## Reliability and UX evidence

Reran focused assessment/source/generation/service/retrieval/context/diagnostics/
evaluation/controller/presentation suites:243/243,11files. Provider unavailable,
timeout, invalid structured output, DB/retrieval failure, unsupported claims/citation,
missing or conflicting evidence and history/Context isolation are deterministic
faults, not live induced failures. They assert response semantics and persistence
boundaries; real provider outages were not manufactured.

Reran disposable PostgreSQL16.15/pgvector0.8.6 integration:62/62,5files, zero skips;
US19 Task18515/15, actual vector eligibility/Disable/publication, owner/context,
concurrent/idempotency/fencing/UNKNOWN/replay/cost admission. Owned test container
and database volume were removed. No faults or load were created on shared Neon
or Production. Injection tests are mocked/untrusted evidence tests, not an ingested
live malicious document. Existing sources were never revoked for acceptance.

UX_ACCEPTANCE: LIVE_BLOCKED. Current tests check all answer statuses, safe citations,
missing-source vs technical failure, recovery, history and Destination behavior.
The prior baseline browser evidence (desktop/390px, insufficient/error/recovery)
remains offline/mock evidence; it is not claimed as a new live browser run. No live
Guest/session or UI request was opened merely to manufacture completed real-corpus
states. Live ANSWERED/PARTIAL/INSUFFICIENT_SOURCE/CLARIFICATION_REQUIRED/technical
error, accessibility and responsive acceptance all remain pending with corpus.

No application fix was warranted by the probe, so no source, schema, migration,
runtime setting or model change was made. No new build/typecheck was needed for
this documentation-only result; prior baseline gate results are historical, not
reported as newly run. Documentation diff check and credential projection reviewed.
No commit/push/merge TXH/deployment or main-checkout mutation in this acceptance run.

## Decision and blockers

US23_ACCEPTANCE_RECOMMENDATION: DO_NOT_ACCEPT_YET.

1. Supply/review a representative real Ha Giang corpus covering the five requested
   groups, with provenance and public/provider permission. Follow existing Admin
   review/index lifecycle on verified Development; do not extend allowlist blindly.
2. Verify current publication/revision/vector and server public allowlist for those
   real sources; freeze independent gold answers, aspect coverage and conflict cases.
3. Run the ten registered real cases plus culture/festival/custom coverage through
   the actual feature Next/API/UI, including confirmed persistence, multi-turn,
   Destination, same-key replay/recovery and controlled small concurrency.
4. Collect a representative latency/token/cost sample; approve quality and numeric
   performance/cost criteria before interpreting acceptance percentages or p95.

Residual risks: probabilistic aspect enumeration/relevance/conflict classification,
extractive wording and exact destination-name recall, insufficient real corpus,
no full live auth/API/Prisma/persistence/UI verification, no representative tail
latency/cost dataset. Passing synthetic adapters and offline regression does not
clear these acceptance gates.

# V2-05 — Ha Giang Q&A Integration

Continuation, 2026-10-28: [V2-06](ASSISTANT-SKILL-RUNTIME-V2-06.md) now reuses this
read-only QA integration inside an explicit owned saved-trip session. The status
and deferred scope below describe the V2-05 delivery. Production V2 remains off.

## Status and scope

IMPLEMENTED / scoped V2-05 DONE for the internal authenticated V2 planning session,
2026-10-28. Repository-wide QA cleanup is not included in this completion claim.
Production routing remains V1; V2-06 is not started. This slice adds interleaved
grounded Q&A without a new agent, RAG engine, provider/SDK, UI or persistence model.
Live-provider/corpus quality, DB connectivity and browser acceptance are separate.

Sources: [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
[ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-05.md),
[V2-01](ASSISTANT-SKILL-RUNTIME-V2-01.md),
[V2-02](ASSISTANT-SKILL-RUNTIME-V2-02.md),
[V2-03](ASSISTANT-SKILL-RUNTIME-V2-03.md),
[V2-04](ASSISTANT-SKILL-RUNTIME-V2-04.md),
[product RAG/planning/write rules](../product/product-spec.md),
[architecture](../architecture/technical-architecture.md),
[flows](../flow/user-flow.md), [ADR-19/25–31](../decisions.md), and the existing
[V1 interleaved planning story](ASSISTANT-CONVERSATIONAL-PLANNING.md).
Product/System source navigation follows these stories; no new DOCX or Figma
inspection or UI parity is claimed.

## QA skill and action boundary

`ha-giang-qa` is registered alongside `travel-planning` and `itinerary-replanning`.
It owns factual destination/history/culture questions and only allows
`answer-ha-giang-question`. The action receives the existing `qaRequestSchema`,
idempotency key and actor-bound QA service. Its output is the unchanged
`qaCompletedTurnSchema` plus the existing replay flag. It receives no planning
publication/generation/Save/Trip service. The common runtime still enforces
registration, allowlist and input/output schemas; no domain branch was added to
the generic runtime. Unknown skills continue to fail explicitly.

The default lazy adapter calls the existing gated `qaService` and resolves the
current principal through `qaPrincipalResolver` with the request headers. It
verifies USER ownership and preserves the trusted network identity required by
the existing abuse leases/quotas. No gate is enabled by starting V2. An optional
server-only `qaForActor` seam supplies fixtures or the same service composition.
Authentication and planning ownership are checked on every turn, before private
context reaches AI; the QA store separately enforces principal isolation.

## Existing evidence pipeline

The service remains responsible for question understanding, eligible retrieval,
pre/post-generation evidence checks and commit-time eligibility, source-only
generation, citation/reference validation, original-source projection, public
safety, history, idempotency and confirmed QA-turn persistence. These existing
production modules were not modified. Planning proposals and old QA answers are
intent context, never evidence for a new answer.

V2-05 always sends explicit SOURCE_ONLY, with no opt-in knowledge expansion UI in
this slice. The existing public QA EXPANDED feature/model selection is unchanged.
Empty evidence returns INSUFFICIENT_SOURCE without synthesis. Technical or invalid
source/citation failures return a distinct QA_FAILED response and never fabricate
an answer. ANSWERED/PARTIAL/CLARIFICATION_REQUIRED and the citation bundle retain
their existing contract. Partial-answer missing aspects remain visible. The QA
answer is rendered directly from this result; a planning wording call cannot
rewrite or add factual content. Citation UI is not redesigned.

## Routing and state preservation

The existing planning analyzer accepts an optional eighth server-only
interleaving context. Only internal V2 supplies it. Its strict structured-output
schema then requires a small metadata object: factual question clause, explicit
subject, referent use, compound intent and unsupported research. It does not add a
second intent classifier or regex router. The original V1 analyzer schema/prompt
and public request/dialogue contracts are unchanged without this argument.
Internal action output permits this metadata; planning facts on a factual or
compound route are ignored before normalization can update needs.

Each turn routes again: needs/preferences → travel-planning; explicit current
proposal edits → itinerary-replanning; factual questions → ha-giang-qa. Q&A returns
without replacing planning needs, canonical proposal, version, fingerprint,
validation, unresolved names, pending preference/date needs, pending replan or the
original planning question. Only bounded user question text is added to intent
context, never QA answer prose or citations as evidence. The next planning turn
can resume naturally, including duration/transport intake before a proposal.

The QA adapter holds only the existing QA conversation/head IDs and one verified
recent subject in the active interaction. QA history belongs to the existing
owned QA store; it does not reuse the planning conversation ID or invent a new
history store. Completing a QA turn can persist QA history but cannot increment
the proposal version. Only a successful subsequent bounded edit/refinement does.
This is not reload-persistent V2 planning or proposal storage.

## Entity continuity and clarification

The adapter combines the existing planning resolver with QA's existing known-name
aliases to map one explicit subject to a currently VISIBLE inventory record.
It rechecks that ID/name before reuse. “Dinh họ Vương” can therefore resolve the
inventory's canonical “Dinh thự họ Vương” without adding an alias table.

After a unique QA subject, “Cho điểm này vào ngày 2” supplies that verified name
as bounded intent context to the existing edit extractor. A comparison, multiple
matches, unavailable/renamed destination, failed new-topic QA or absent reference
cannot silently become one stop: clarification preserves the proposal. Merely
having several stops in the proposal does not select a default referent. Normal
planning continuation clears the short-lived reference; no memory framework is
introduced. General factual questions still go to existing QA even if no
inventory destination can be attached to their subject.

A pending MISSING_DAY or target/destination clarification survives QA and resumes
through existing `choiceIndex`/resolution semantics on the current version. A
bare agreement immediately after a QA interruption is not accepted as cross-day
scope approval: the original pending question is shown again first. Cancellation
and business failures retain their existing contracts.

## UNKNOWN and compound requests

When planning publication is UNKNOWN, the session rechecks actor and ownership
using a read, rather than incorrectly requiring the last-known proposal version
to equal a possibly committed version. Intent analysis is read-only. Only QA or
controlled unsupported/clarification responses can run; every planning mutation
remains blocked. QA never clears the uncertainty flag or replaces the last-known
proposal. The uncertain mutation's original same-key result remains available
across QA interruptions. Reconciliation still requires the existing identical
request/key policy; this slice adds no reconciliation endpoint or automatic retry.

Compound QA-plus-edit is detected, the factual clause is answered through RAG,
and the response explicitly says the edit has not executed and asks for a separate
explicit edit turn. This controlled handoff is the chosen bounded limitation;
the system does not autonomously decide whether a place is “suitable” and mutate
the trip. Unsupported cafe/hotel discovery, external reviews, web research,
booking and live weather produce QA_UNSUPPORTED with planning state preserved.

## Demonstrated flow and tests

Provider/inventory/route/repository fixtures run the actual understanding
normalizer, planning engine/scheduler/Validator, QA service, QA question
understander, QA generator, grounding/citation checks and runtime action dispatch.
The required two-day-car → “Dinh họ Vương xây năm nào?” → ADD-to-day-2 flow runs
for Traveler and Admin. The factual sentence/date is synthetic test evidence,
not a live historical/corpus acceptance claim. Assertions compare the complete
workspace/proposal and fingerprint before/after QA, unchanged version N, and
exactly N+1 after the bounded edit, with day 1 preserved and no Save call.

`planning-qa.vitest.test.ts` also covers pronoun edits, preference continuation,
pending MISSING_DAY, intake before generation, committed-but-unacknowledged
publication plus QA, no evidence, provider failure, invalid citations, revoked
evidence, comparisons/hidden subjects, compound handoff, research refusal,
ambiguous agreement, QA history/replay, PARTIAL and ignored raw planning facts,
source-only/actor/schema/allowlist/public-V1 boundaries, and network principal
forwarding. Older V2 tests now expect a controlled QA failure when their injected
QA service is unavailable, rather than the superseded QA handoff.

## Verification and baseline debt

Final checks:

| Check | Result |
| --- | --- |
| V2-01 → V2-05 | 10 files / 104 PASS, including 19 V2-05 tests. |
| Direct QA/RAG/planning/US-36/37 gate | 53 passed files, 3 opt-in skipped files; 799 PASS, 0 FAIL, 9 skipped, 1 existing todo. |
| Broader QA exploration | 91 files: 77 passed, 5 failed, 9 skipped; 1157 PASS, 48 baseline FAIL, 82 skipped, 1 existing todo. |
| Exact five-file baseline comparison | Current and pinned HEAD both 119 PASS / 48 FAIL; identical failure identities. |
| Web `tsc --noEmit` | Exit 0 / PASS. |
| Isolated production build | Exit 0 / PASS, including TypeScript and 49/49 static pages. |
| `git diff --check`, untracked whitespace, source/secret/scope checks | PASS. |

Commands run from `apps/web` with bundled Node:
`../../node_modules/vitest/vitest.mjs run --config vitest.config.mts --isolate`;
`../../node_modules/typescript/bin/tsc --noEmit`; and
`scripts/prepare-map-assets.mjs` then `scripts/build.mjs` with process-local
`KLTN_PERF_BUILD=1` and bundled Node on PATH. Builds use the existing isolated
output, preserving the development server. Run `git diff --check` from repo root.

The 56-file gate includes all `assistant-agent-v2`, `assistant-planning` and
`runtime-config` tests; planning client/chat/history and assistant auth-boundary;
QA service/http/session-continuity/model/retrieval/question-understanding/
generation/contract/destination-context/public-safety/original-source-projection/
hybrid-retrieval; RAG citation-store/original-sources; US-35 integration,
US-36/37/replan-clarification; Save/HTTP; planner engine/boundaries/Stadia;
validation/travel-time; and edit candidate/clarification. The broader run adds
the full `ai` directory. Opt-in live/corpus/DB skips and US-36's existing
precision-policy todo were not represented as passes.

The broader full QA run is **not green**: five existing files have 48 failures.
All 48 exact `(file, fullName)` failures reproduce on pinned HEAD without V2:
119 PASS / 48 FAIL on both snapshots, zero new failing assertions. The failures
come from old model/prompt/configuration/controller expectations; no QA production
behavior or these stale tests were changed to make them pass. See the
[exact baseline audit](../implementation/assistant-skill-runtime-v2-05-qa-baseline.md).
Scoped implementation completion does not mean the repository-wide QA suite is
clean. Baseline cleanup remains separate debt.

Production V1 HTTP/UI/controller, QA/RAG, Save, routing provider, Validator and
in-trip source remain unchanged. Shared production changes in this slice are an
internal optional analyzer argument/type only; the remaining implementation is
under `assistant-agent-v2`. No schema/migration/dependency/environment change,
live-model/DB/Stadia/browser smoke, deployment, commit, push or merge is claimed.
V2-06 retains saved-trip/in-trip/GPS integration and remains unstarted.

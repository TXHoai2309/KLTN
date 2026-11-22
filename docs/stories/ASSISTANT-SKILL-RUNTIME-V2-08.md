# V2-08 — Planner Brain, Context Reuse & Proactive Guidance

## Status and scope

IMPLEMENTED with controlled tests, 2026-10-29. Live-provider acceptance and Dev
data cleanup are **not** part of this completion claim; see "Not done" below.
No commit, push or deployment. V2-09 is not started.

V2-07A left the Assistant behaving like a workflow engine: after a proposal,
"gợi ý cho tôi nên đi như nào" returned the fixed clarification "Bạn muốn điều
chỉnh cụ thể điều gì trong đề xuất này?".

Sources: [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md),
[V2-02](ASSISTANT-SKILL-RUNTIME-V2-02.md), [V2-03](ASSISTANT-SKILL-RUNTIME-V2-03.md),
[V2-04](ASSISTANT-SKILL-RUNTIME-V2-04.md), [V2-05](ASSISTANT-SKILL-RUNTIME-V2-05.md),
[V2-07A](ASSISTANT-SKILL-RUNTIME-V2-07A.md), [ADR-32](../decisions.md).

## Root cause (verified in code)

- The understanding schema had four intents: `NEEDS`, `EDIT`, `QA`, `CLARIFY`.
  A request for advice had none, so it became `CLARIFY`.
- The session mapped that to `clarificationField = "refinement"` and the fixed
  fallback sentence. It was **not** routed to `itinerary-replanning`.
- Model wording was only a paraphrase of a code-chosen goal and was rejected by
  `acceptsPlanningV2Reply` for times, unknown numbers, a second `?` and words
  such as "ít đông". `QA_*`, `REPLAN_*` and `PROPOSAL_FAILED` never reached the model.

## What changed

No new agent and no new skill. `travel-planning` gained one read-only goal.

- **Intents:** `ADVISE` and `REGENERATE` added to `planningUnderstandingSchema`
  and `planningAnalysisSchema`. Only the V2 (interleaved) prompt defines them,
  with contrasts against `EDIT`/`NEEDS`/`QA`; V1 normalizes them to `NEEDS`, so
  V1 contracts and rollback are unchanged. No phrase table is used.
- **`PLANNING_GUIDANCE` (read-only):** the session branch sits beside the QA
  branch. It never changes needs, version, proposal, `pendingReplan`,
  `pendingClarificationNeeds`, `uncertain` or `previousPlan`, never calls
  generate/review/publish/save, and sets `qaInterrupted` so a bare "ok" after
  advice is not read as scope acceptance. It runs while a clarification or an
  UNKNOWN publication is pending and does not clear either.
- **`analyzeCurrentProposal`** ([planning-guidance.ts](../../apps/web/src/modules/assistant-agent-v2/planning-guidance.ts)):
  pure function over the stored proposal. Output: per-day stops, stop count,
  travel minutes (null unless every leg is verified), finish minute (null unless
  every stop is scheduled), signals (`DENSER_DAY`, `LONG_TRAVEL_DAY`,
  `LATE_FINISH`, `DATE_REQUIRED_FOR_HOURS`), unapplied fallback suggestions
  ("drop the last stop of day N") and a validation summary. Thresholds
  (`LONG_TRAVEL_DAY_MINUTES` 240, `LATE_FINISH_MINUTE` 18:00) are product
  judgement for what is worth mentioning, not Validator rules.
- **Guidance wording:** `guidanceRejection` blocks claims of change/save/apply,
  validity without `PROPOSAL_READY`, links/markup, a second question, atmosphere
  facts (crowd, romance, scenery, accessibility) and numbers/times that are not
  in the plan. On rejection the composer is retried once with the rejection
  reason (`retryHint`); after that a deterministic advice text built from the
  same signals is used. It never falls back to a clarifying question.
- **Summary first:** `PRESENT_PROPOSAL` states the chosen route and, when
  `COMPACT_TRIP` applies, why, before the validation caveat. Validator, version
  and publication are unchanged. An infeasible proposal names the violated checks
  and offers a lighter retry.
- **Failure explanation:** `PROPOSAL_FAILED` carries the stable `failureCode` of
  the failed action and maps `INVALID_AI_PLAN` and `AI_UNAVAILABLE` to "what
  happened + what to do next". Any other cause gets an honest generic text. Raw
  messages are never shown. No new retry loop: the engine's existing bounded
  adjustment loop is the only retry.
- **Context reuse:** an explicit "lập lại lịch" is `REGENERATE`; it rebuilds from
  the known brief through the existing refine action (one publish, new version,
  `REBUILD_REQUESTED` implication). Newer explicit facts still win through the
  existing refinement path; a new-trip reset still requires a new session.

## Verification

Controlled tests (fake classifier, real session, Validator and engine):
`planning-guidance.vitest.test.ts` and `planning-guidance.analysis.vitest.test.ts`.

- five paraphrases route to `PLANNING_GUIDANCE`; version, needs and proposal are
  identical before/after; generate, review, publish and save are not called;
- explicit removal after guidance still routes to bounded replanning;
- pending `MISSING_DAY` clarification survives guidance and resumes; UNKNOWN
  survives guidance and still blocks the next mutation;
- guidance after a replan reads the latest proposal, not the superseded one;
- guidance without a proposal is honest and generates nothing;
- retry-with-reason, then deterministic fallback; failure mapping; context reuse.

## Not done / remaining gaps

- **Live acceptance with the configured model is not run yet.** Only controlled
  tests prove routing; whether the real classifier distinguishes ADVISE from
  CLARIFY/NEEDS is unmeasured.
- **Dev data:** the six `[TEST]` planner records are pre-existing visible Dev DB
  fixtures (see [evaluation](../implementation/assistant-v2-evaluation.md)); the
  real corpus has too few destinations to plan without them. Cleanup needs
  approved real destinations first; no data was changed.
- `QA → guidance` and `compound advice + edit` have no dedicated test beyond the
  shared QA/edit paths; compound turns still execute the explicit edit and the
  advice part is not narrated separately.
- Deferred to V2-09: overnight structure ("2 ngày 1 đêm"), lodging, weather,
  booking, place research.

## Review follow-up (2026-10-29)

Applied after a two-axis code review: guidance wording now also rejects asking
again for a duration/transport the session already knows (deterministic, not
prompt-only); duplicated claim patterns became shared constants; session
bookkeeping (`remember`, `turnResult`, `causeCode`) replaced repeated blocks; a
stale "no public route / no V1 switch" comment was corrected.

Known and accepted, not changed:

- `REGENERATE` has no branch of its own. With a proposal it forces one rebuild;
  without a proposal it behaves exactly like `NEEDS` (asks for what is missing or
  generates the first proposal).
- If the model fills the interleaved `question` field for an advice request, the
  turn is routed as QA before the ADVISE branch. Only the V2 prompt prevents this;
  measure it in the live run.
- A stale pending-replan version throws `PLANNING_CHANGED` before an advice turn
  can run (rare: guidance itself never changes the version).
- During UNKNOWN, guidance reads the last known proposal, which may not be the
  committed one.
- `turn()` remains one long function; splitting it is a separate refactor.

Second review pass added deterministic gates (previously prompt-only) and tests:
guidance wording rejects the generic "what do you want to adjust" question and
asks for a duration/transport only when that fact is unknown (full-width "？"
counts as a question); a `PRESENT_PROPOSAL` reply must name a stop of the chosen
route; the "correction wins" test now sends a real correction; a pending
`ASK_TRANSPORT` survives a guidance turn. Still accepted: the digit allow-list
admits any digit present anywhere in the facts (small numbers such as 1-3 can
pass when wrong), and guidance does not enter the `recent` dialogue memory with a
reply, like QA.

Question-field precedence (confirmed by a failing test, then fixed): an explicit
`ADVISE` intent was turned into QA whenever the model also filled
`interleaved.question`, in two places (`planning-ai.ts` analysis and the session's
QA condition). Now `ADVISE` stays guidance unless `compound` or `unsupported` is
set; a real `QA` intent is unchanged. Tests cover ADVISE+question, ADVISE+compound,
ADVISE+unsupported and QA+question. Whether the real model ever fills the field for
advice is still unmeasured (live run pending), but the outcome no longer depends on it.

## Live closure (2026-10-29)

Real configured model, Stadia routing and the Development DB (endpoint identity
checked) via `apps/web/scripts/assistant-v2-08-live.mjs`, one disposable owned user
(deleted afterwards). 19/19 steps passed; evidence in `.cache/v208-live/results.json`.

- Original bug flow (lập hành trình → 2 ngày → xe máy → "gợi ý cho tôi nên đi như nào"):
  proposal, then `PLANNING_GUIDANCE`; the fixed "Bạn muốn điều chỉnh cụ thể điều gì"
  question never returned.
- Five guidance phrases → `PLANNING_GUIDANCE`; contrast: preference → `REFINE_PROPOSAL`,
  "bỏ Lũng Cú đi" → `REPLAN_PROPOSAL`, Dinh họ Vương question → `QA_ANSWER`
  (insufficient source: Dev corpus), QA → guidance, replan → guidance (reads the new
  proposal), "lập lại lịch" and "thực ra mình đi ô tô" (no re-ask, correction wins),
  pending `MISSING_DAY` → guidance → "ngày 2" resumes and publishes.
- Eight guidance turns: proposal id and workspace version unchanged on every one;
  wording was model-written and accepted by the gate each time.
- Measured limits: the API exposes the routed goal, not the raw classifier output, so
  whether the model ever fills `interleaved.question` for advice was not observed (the
  outcome no longer depends on it). Model-call and generation counts are inferred from
  unchanged version/proposal id and turn latency, not counted. UNKNOWN cannot be induced
  against the live stack; it is covered by controlled tests, and while UNKNOWN the guidance
  plan carries `lastKnownOnly` so the wording must say the proposal is only the last known.
- `[TEST]` destinations remain a documented Dev-data dependency (unchanged).

Verification: V2 and planning suites 302 pass; `tsc --noEmit` clean; production Webpack
build 49/49 (the default Turbopack build ran out of native memory on this Windows host,
the known issue handled in `scripts/build.mjs`); full vitest 63 failures in the same 10
files as before this work (QA diagnostics/reasoning/quality, assistant runtime-mode and
development integration, in-trip), none in V2 or planning, no new failing file.

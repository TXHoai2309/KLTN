# V2-02 — Minimum Useful Brief → Preliminary Proposal

## Status and scope

IMPLEMENTED / scoped V2-02 DONE — internal authenticated integration, 2026-10-28. This ticket proves
the new-trip happy path through an internal server session; it does not activate
V2 on production chat or redesign UI. V1 remains the public path. Final checks
and their limits are recorded below.

The owner explicitly permits internal routing/runtime tests when no UI change is
needed. The accepted scope is duration/transport readiness, one bounded existing
planning action and structured response-plan composition. V2-03 is not started.

## Sources and dependencies

- [V2 plan](../implementation/assistant-skill-runtime-v2-plan.md) and
  [original ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-02.md).
- [V2-01 foundation](ASSISTANT-SKILL-RUNTIME-V2-01.md) and its
  [closure review](../implementation/assistant-skill-runtime-v2-closure-review.md).
- [ADR-26–31](../decisions.md#adr-26--single-skill-oriented-assistant-runtime-for-v2-2026-10-28),
  especially ADR-28 minimum useful brief and ADR-29 existing engine authority.
- [Product](../product/product-spec.md#trip-requirements-and-planning),
  [architecture](../architecture/technical-architecture.md),
  [flows](../flow/user-flow.md#trip-requirements),
  [existing planning story](ASSISTANT-CONVERSATIONAL-PLANNING.md) and
  [RBAC V2](RBAC-V2-admin-inherits-traveler.md).
- Source navigation: Product sections 4, 7, 10, 11 and 13; System Specification
  sections 2, 6–10 and 13. No new original-DOCX/Figma or live-provider acceptance
  claim is made.

## Minimum useful brief

`assessPlanningReadiness` is deterministic and validates against the existing
duration/transport schema fields. It reports one highest-priority blocker:

| Inputs | Draft readiness | Next blocker |
| --- | --- | --- |
| No duration or transport | false | durationDays |
| Duration only | false | transport |
| Valid duration + CAR/MOTORCYCLE | true | none |
| Duration + transport, missing exact date and all optional preferences | true | none |

Unknown date, interests, pace, companion category/count, mobility and destinations
are reported as useful unknowns, not filled in or required. Existing canonical
null/empty-array normalization is reused. The scheduler's existing effective pace
heuristic does not become a stated user preference: persisted requirement pace
remains null unless supplied. Explicit constraints/ambiguities still go through
existing understanding/engine checks; readiness is not a Validator PASS.

## Internal integration and authorization

`startTravelPlanningV2Session` authenticates through `requireTraveler` before
creating actor-bound planning dependencies or loading private state. It reuses
the existing repository's START and workspace schema. Every turn rechecks the
persisted actor, ownership/version and pending/saved state. Changed identities,
Guest, foreign conversations and stale state are rejected. Reviewed/saved or
regeneration sessions are outside this new-trip-only seam.

The session keeps partial needs and recent dialogue only in the active server
interaction, using the existing needs/dialogue models. It does not introduce a
parallel persisted state model or a durable proposal/transcript store. Reload
continuity for this internal session is not claimed.

The integration can be invoked internally with the existing production dependency
factory; no new API route or feature-flag framework is installed:

```ts
import { planningDependencies } from "@/modules/assistant-planning/planning-runtime";
import { startTravelPlanningV2Session } from "@/modules/assistant-agent-v2/travel-planning-session";

const session = await startTravelPlanningV2Session(
  { headers, conversationId: null, key: startKey },
  planningDependencies,
);
const turn = await session.send(userText, turnKey);
// turn.generated uses the existing PlanningGenerated shape for itinerary rendering.
```

This is server code, not a public endpoint accepting caller-supplied ownership.
V1 request/response and client controllers have no dependency on this seam.

## Runtime and action boundaries

The session activates registered `travel-planning` using the generic V2 runtime.
The skill's allowlist now contains `read-planning-state`,
`understand-planning-brief` and `generate-preliminary-proposal`. The generic
runtime only gains dependency injection and typed result overloads to dispatch
registered actions; it contains no travel-specific branch or prose.

- Understanding uses the existing bounded `analyzePlanningText` boundary with
  actual pending question/recent turns and eligible candidates. New values are
  accepted from resolved analysis only. A CLARIFY result's tentative extraction
  is not promoted into confirmed minimum inputs.
- Generation validates payloads at the existing action factory, checks the
  actor-bound context, assesses readiness and calls the existing canonical
  `executePlanning` REVIEW then GENERATE operations. It never exposes SAVE.
- Existing retrieval, destination selection, route provider, scheduler,
  deterministic Validator, recheck and proposal publication remain authoritative.
  No planner implementation was copied or replaced.
- The action suppresses V1's language-only composer and strips its canonical
  reply from the data result. V2 composition occurs separately from business work.

REVIEW/GENERATE receive stable phase keys derived from the same turn key.
REVIEW's identical-payload/key replay is allowed before the old-version check,
preserving the existing lost-acknowledgement contract. Output retains canonical
proposal ID, workspace version, attempts and checks. Same-key calls within the
active session share their result/promise, including while generation is pending.
Different text with the same key is rejected. Business failures propagate through
typed action errors; they are not retried by the language layer.

This in-process deduplication is not a new durable HTTP replay system. Rejected
turns are surfaced without automatic retry. An internal caller reconciling an
UNKNOWN application write must use its identical action payload/key through the
existing services; no unconfirmed itinerary is persisted to manufacture recovery.

## Response plan and proposal semantics

The deterministic layer selects ASK_DURATION, ASK_TRANSPORT, CLARIFY,
PRESENT_PROPOSAL or HAND_OFF, with known facts, supported implication codes and
must-not-claim rules. It does not feed a canonical sentence to a paraphraser.
The language layer reuses the bounded Luna/high provider, receives the registered
skill policy plus this structured plan, and chooses wording only.

Invalid/failed wording uses a presentation fallback. It cannot rerun understanding,
generation/publication or Save. A copied plan is passed to the composer so wording
cannot mutate authoritative state. Reply guards reject unsupported saved/applied,
factual-clock and positive-validity claims when evidence does not support them.

The proposal keeps the existing `PRELIMINARY_PROPOSAL` phase. Without a date,
days have null dates and OPENING_HOURS remains INSUFFICIENT_DATA. Violations and
missing route/evidence retain their actual statuses. `eligibleForFinalConfirmation`
is false without the existing required evidence/date; a model cannot change it.

Save is unchanged. The existing save adapter rejects this ineligible proposal
with TRIP_VALIDATION_FAILED before persistence; the separate exact-date guard
also returns TRIP_START_DATE_REQUIRED. No Trip save/reservation is automatic.

After the first proposal, subsequent requests return HAND_OFF while preserving
that proposal. Preference refinement, edits, Q&A interleaving, in-trip, booking,
research, streaming, provider migration and V2-03 are not implemented here.

Subsequent scope update: [V2-03](ASSISTANT-SKILL-RUNTIME-V2-03.md) supersedes the
preference-only HAND_OFF boundary in this internal session. The V2-02 receipts
above describe the original slice; scoped day edits and other skill workflows
still hand off. Production V1 routing remains unchanged.

## Required demo and evidence

The integration test exercises the exact dialogue for Traveler and Admin:

```text
User: Tôi muốn lập hành trình đến Hà Giang bằng AI
Assistant: Mình có thể dựng tuyến sơ bộ khi biết thời lượng chuyến đi.
           Bạn dự định đi mấy ngày?
User: 2 ngày
Assistant: 2 ngày thì mình sẽ giữ tuyến gọn để tránh dành quá nhiều thời gian
           trên đường. Bạn đi ô tô hay xe máy?
User: ô tô
Assistant: Đây là đề xuất sơ bộ, chưa lưu. Một số kiểm tra chưa đủ dữ liệu;
           cần ngày khởi hành cụ thể và kiểm tra lại trước khi xác nhận hoặc lưu.
Result: Two-day PRELIMINARY_PROPOSAL; no start-date/optional/recap question first.
```

The test uses mocked provider JSON and candidate/route fixtures but executes the
real understanding normalizer, planning service, engine, scheduling, Validator
and versioned publication calls. It proves wiring/contract behavior, not live AI
quality, live Stadia connectivity or browser acceptance. It verifies one engine
call, real insufficient-date checks and no Save. The same suite covers both
values at once, latest explicit duration, ambiguous duration followed by transport,
unsupported transport, scope/auth/stale failures, real Validator violation,
provider failure, language fallback, same-key concurrency and REVIEW replay.

## Verification

Final receipts:

- V2 module: 6 files, 50 tests PASS (25 foundation tests plus 25 V2-02 tests).
- Relevant regression selection: 38 files, 458 PASS, 0 FAIL, 8 opt-in skips,
  1 pre-existing US-36 todo. The skips are real-model and PostgreSQL opt-ins.
- Web `tsc --noEmit`: PASS, exit0.
- Isolated production build: PASS, exit0; compile, TypeScript and 49/49 static pages.
- Task-file whitespace, scope/secret review and `git diff --check`: PASS.

Acceptance criteria reviewed: deterministic minimum-brief readiness, optional/date
non-blocking draft, one material question, combined-input immediate draft,
existing engine/routes/scheduler/Validator, provisional status, no auto-save,
unchanged V1, passing focused/regression/type/build/whitespace checks and updated
documentation. All are satisfied within the explicit internal-routing scope.

Use the bundled Node and the reproducible regression target list in the
[V2-01 story](ASSISTANT-SKILL-RUNTIME-V2-01.md#verification-commands-and-limits);
the `src/modules/assistant-agent-v2` target includes all V2-02 suites. Run focused
tests with `vitest run --config vitest.config.mts --isolate src/modules/assistant-agent-v2`,
web `tsc --noEmit`, isolated production `scripts/build.mjs` with process-local
KLTN_PERF_BUILD=1/PATH, and repository `git diff --check`.

No schema/migration/dependency/environment-file change, real-provider/DB smoke,
browser acceptance, deployment, commit, push or merge is claimed.

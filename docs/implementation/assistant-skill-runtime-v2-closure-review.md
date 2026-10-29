# V2-01 closure review — 2026-10-28

Scope: the owner's internal-foundation V2-01 request and its closure review.
V2-02 and new runtime features are excluded. The complete new module, including
untracked source/tests, was reviewed; the earlier user-supplied plan/ADR patch was
distinguished from foundation changes.

## Comparison and baseline evidence

The fixed pre-V2-01 commit is `101294f56f1eee8ea81a662801b2631bdcf8e08f`.
Before repairs, both failing tests were byte-identical to that commit:

| Test | HEAD and pre-repair working-file Git blob |
| --- | --- |
| `planning-model.vitest.test.ts` | `17879b49c1baed511e7031c434184656ee32eb5a` |
| `us36-test.vitest.test.ts` | `bb6dfb1f61e64b7eae92d0be6bc080846aac3007` |

There were no tracked application/package source changes against that commit.
To test causality rather than rely on a diff alone, `git archive` exported HEAD's
`apps/web/src` and `apps/web/vitest.config.mts` into the ignored, clearly marked
`.cache/v201-closure/baseline/` diagnostic snapshot. It contains no V2 module.
Running the two original tests there with the same bundled Node24.22.1 and
installed dependencies reproduced both failures: 2 failed, 7 passed, 1 todo.
The working-tree reproduction had the same result. Thus neither failure was
introduced by V2-01.

## Architecture review

Independent Standards and Spec reviews each reported zero actionable findings.

| Constraint | Result and evidence |
| --- | --- |
| No V1 production routing change | PASS. No existing route/component/runtime imports V2. Closure changes only two existing test files in application source. |
| No duplicated planning business logic | PASS. Context and read-action output reuse `planningWorkspaceSchema`; no planner, routing, scheduler, Validator, auth or Save logic is copied. |
| Generic runtime has no hard-coded travel behavior | PASS. `agent-runtime.ts` loads the requested skill and returns activation metadata; policy text lives in `skills/travel-planning.ts`. |
| Registry is the available-skill source of truth | PASS. `assistantSkills` is immutable, and `AssistantSkillId` derives from its keys. |
| Unknown skills fail explicitly | PASS. The loader uses an own-property check and throws `UNKNOWN_SKILL`, including for prototype keys. |
| Action execution is allowlisted | PASS. Explicit dispatch checks registration and the loaded skill's `allowedActions`. Activation does not execute actions. |
| Schemas at the action boundary | PASS. The factory validates input before execution and output afterward; controlled failures never retry business work. |
| `read-planning-state` is read-only | PASS. Strict empty input; supplied workspace/null only; no DB/provider dependency, foreign-ID selector or mutation. Parsed output is detached from caller state. |
| No speculative multi-agent/streaming/booking/AI SDK migration | PASS. No such application code or dependency was added. Review sub-agents are review tooling, not product runtime architecture. |

## Regression failure 1 — stale provider-configuration fixture

**Exact original test:**
`apps/web/src/modules/assistant-planning/planning-model.vitest.test.ts`,
`pins understanding, selection and dialogue to Luna/high with no model fallback`.
It threw at the first `await analyzePlanningText(...)` (original line20), before
reaching `expect(requests).toHaveLength(3)` and the
`{ model: "gpt-6-luna", reasoning_effort: "high", store: false }` assertions.
The failure was `AI_UNAVAILABLE` from configuration preflight, not a wrong model
assertion or a V2 routing failure.

**Source of truth:**

- [ADR-25](../decisions.md#adr-25--admin-managed-runtime-provider-configuration-2026-10-27)
  and [Admin configuration story](../stories/ADMIN-CONFIGURATION-CMS.md) require
  effective scoped provider configuration and fail-closed unreadable overrides.
- `ai/qa-json-provider.ts` resolves `effectiveConfig("OPENAI")` before requests
  when no explicit key resolver was injected. `runtime-config-service.ts` loads
  the scoped override before environment defaults; stubbing env/fetch alone is
  not sufficient to isolate a unit test from configuration loading.
- [Approved dialogue design](assistant-dialogue-naturalness-design.md), Q2, and
  [dialogue story](../stories/ASSISTANT-DIALOGUE-NATURALNESS.md) still pin all three
  planning AI tasks to Luna/high. Current planning source implements that pin
  independently of the public QA model setting.

**Classification:** pre-existing baseline debt: a stale test fixture after the
approved configuration boundary changed. No V2-01 regression.

**Repair:** mock `effectiveConfig` in the test, supplying a fixture credential
and a deliberately different QA model. Assert three configuration reads, use of
the effective credential, all three Luna/high/store:false requests, and the same
server calendar. The test no longer depends on real configuration infrastructure.
The touched test also replaces its explicit `any` capture type and guards its
last-message lookup. No provider/runtime behavior was changed.

## Regression failure 2 — stale US-36 Admin exclusion

**Exact original test:**
`apps/web/src/modules/in-trip/us36-test.vitest.test.ts`,
`rejects Admin before reading the body or accessing the Trip`.
`expect(response.status).toBe(status)` (original line266) expected403 but received
200. The associated failure-envelope and no-body/no-provider assertions belonged
to that obsolete role exclusion.

**Source of truth:**

- [Product roles](../product/product-spec.md#roles-and-access) and the approved
  [RBAC V2 story](../stories/RBAC-V2-admin-inherits-traveler.md) grant ADMIN the
  Traveler capability for owned resources, without an ownership bypass.
- `lib/authorization-capabilities.ts` includes `traveler` for ADMIN.
  `requireTraveler` delegates to `requireActor(..., "traveler")` using the
  persisted role. `in-trip/replan-http.ts` invokes that guard before reading the
  body; `replan-service.ts` reads the Trip by `id AND userId`.
- The old Admin403 wording in the US-36 story and original ADR-04 consequence
  conflicts with this approved current policy.

**Classification:** pre-existing baseline debt: stale test/spec superseded by
approved RBAC V2. Production's Admin200 result for an owned read-only proposal is
correct. No V2-01 regression.

**Repair:** retain Guest401-before-body; parameterize owned proposal success and
foreign404/stale409 checks for Traveler and Admin. Preserve completed-visit,
owner-scoped lookup, no-provider-on-failure and no-write checks. Update only the
current US-36 roles/test-plan contract and ADR-04's supersession marker. Historical
US-36 receipts remain, with an explicit notice that Admin403 is obsolete.

## Closure checks

| Check | Final result |
| --- | --- |
| V2-01 focused suites | PASS, 3 files/25 tests. |
| Focused suites plus repaired files after the final type guard | PASS, 5 files/35 tests; 1 existing todo. |
| Planning/QA/config/US-35–37/Save/Validator regression selection | PASS, 35 files: 433 passed, 0 failed, 8 opt-in skips, 1 existing todo. |
| Web `tsc --noEmit` | PASS, exit0 after replacing the touched test's `any` and guarding the last-message lookup. |
| Isolated production build | PASS, exit0; compile, TypeScript and 49/49 static pages. |
| `git diff --check` and task-file whitespace review | PASS. |

The final command receipts are recorded in the linked
[foundation story](../stories/ASSISTANT-SKILL-RUNTIME-V2-01.md) and progress log.
The regression selection adds QA model/configuration tests to the original
foundation/planning/QA/US-35–37/Save/Validator selection. Opt-in real-model and
database tests remain off, and the existing US-36 precision-policy todo is not
implemented by this review. No V2-02 work or runtime feature was added.

Final status: **DONE — V2-01 internal foundation and closure review only**.
No production release, live-provider or whole-repository green claim is made.

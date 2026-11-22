# V2-01 — Assistant Skill Runtime Foundation

## Status

IMPLEMENTED — internal foundation, 2026-10-28. The scoped V2-01 closure review is
DONE: architecture constraints, focused/regression tests, web typecheck and
production build pass. Both initial failures were reproduced before V2-01 and
closed by stale-test/spec repairs. See the
[closure review](../implementation/assistant-skill-runtime-v2-closure-review.md).
This is not production rollout or a claim that the first V2 conversation is
implemented.

## Owner scope and sources

The owner's V2-01 execution request narrows the original tracer bullet to an
internal foundation. It explicitly permits internal-only activation without a
model call and defers chat integration. The older ticket's feature-gated first
duration question is therefore not an acceptance claim for this foundation.

- [Settled V2 plan](../implementation/assistant-skill-runtime-v2-plan.md).
- [Original V2-01 ticket](../../.scratch/assistant-skill-runtime-v2/TICKET-01.md).
- [ADR-26 through ADR-31](../decisions.md#adr-26--single-skill-oriented-assistant-runtime-for-v2-2026-10-28).
- [Product contract](../product/product-spec.md): roles/access, trip planning,
  deterministic validation and confirmed-write semantics.
- [Technical architecture](../architecture/technical-architecture.md),
  [user flows](../flow/user-flow.md), and
  [current planning story](ASSISTANT-CONVERSATIONAL-PLANNING.md).
- Source-document navigation: Product sections 4, 7, 10, 11, 13 and System
  Specification sections 2, 6–10, 13. No original DOCX/Figma inspection is claimed.

## Outcome and scope

Provide a server-only module at `apps/web/src/modules/assistant-agent-v2/` with:

- a typed skill definition, immutable static registry and one loader;
- one registered `travel-planning` policy skeleton;
- typed transient context reusing the existing `planningWorkspaceSchema`;
- a schema-validating action factory, controlled errors and a central action map;
- internal skill activation plus explicit action dispatch, tested independently
  from production HTTP/UI wiring.

Proposal generation, replacing `nextNeedsPrompt`, conversational replies,
progressive refinement, other skills, model calls, provider migration, streaming,
public APIs and UI changes are outside this execution scope. No schema,
migration, dependency, environment flag or deployment change is required.

## Authorization, ownership and state

Only a trusted server caller may supply context. It must authenticate and load
the actor's owned workspace through existing boundaries before calling V2.
`userId` and schema validation do not establish authorization. No public API
accepts this context, and V2 does not query a database or grant private-data access.

The only registered action, `read-planning-state`, accepts an empty strict input
and reads the supplied workspace or null. It cannot accept another conversation
ID. State parsing reuses existing normalization, including null/empty optional
values; it does not infer duration, transport, dates or preferences. Returned
state is detached from the caller's mutable workspace. No parallel persisted
planning model is introduced.

Activation does not execute an action. Explicit dispatch requires both a
registered action and the active skill's allowlist. Factory execution validates
input before work and output after work, uses typed error codes, retains internal
execution causes, and does not retry. Future writes still require the existing
authorization, validation, confirmation and idempotency services; this factory
does not supply those guarantees on its own.

## Runtime contract

`runAssistantV2({ skill, context })` loads the registered policy, validates the
supplied context and returns `{ skill, context, decision }`. The decision is
`SKILL_READY` with the registered skill ID and its allowed actions. This is
activation metadata, not an AI workflow decision or an itinerary.

`executeAssistantV2Action({ skill, context, action, payload })` explicitly checks
the skill/action boundaries before invoking the registered action. Unknown
skills never silently select another skill. Unknown/disallowed actions fail
without falling back to V1 or performing business work.

Instructions live in a TypeScript export loaded through the registry boundary;
there is no filesystem discovery or provider-specific instruction assembly.
No model/provider is needed to prove this foundation. The next slice can consume
the loaded skill/context through the existing bounded structured provider.

## Acceptance evidence

- [x] Typed skill contract; immutable registry; `travel-planning`; single loader.
- [x] Typed context reuses existing state; malformed context is rejected.
- [x] Typed input/output action factory and controlled failure paths.
- [x] Internal runtime activates the skill without model/Save/V1 calls.
- [x] Unknown/prototype-key skills/actions are rejected; allowlists are enforced.
- [x] No existing production source was changed or wired to V2.
- [x] New tests: 3 files, 25 tests pass. Web `tsc --noEmit` passes.
- [x] Isolated Next production build exits 0 (compile, TypeScript, 49/49 static
  pages). The sandbox compile stalled and was interrupted; the rerun outside the
  sandbox succeeded. Task-file whitespace and `git diff --check` pass.
- [x] Closure regression gate: 35 files, 433 tests pass, 0 fail, 8 opt-in skips,
  1 existing todo. Final focused rerun: 35 pass, 1 existing todo across the V2-01
  suites and both repaired test files; V2-01 itself remains 25/25 pass.
- [x] Two independent architecture reviews have no actionable findings.

## Initial failures and closure

The initial 33-file run had 413 passes and two failures in existing tests:

1. `planning-model.vitest.test.ts` stubs environment/fetch but does not supply
   the current database-backed effective-provider configuration; it fails in
   configuration preflight before its mocked model requests.
2. `us36-test.vitest.test.ts` expects Admin to receive 403, whereas the current
   accepted RBAC V2 contract lets Admin use their own Traveler capabilities.

Both were also reproduced on an archived source snapshot of pre-V2-01 HEAD
`101294f56f1eee8ea81a662801b2631bdcf8e08f`, with no V2 module. They were pre-existing
baseline debt, not V2 regressions. Closure repairs mock the current effective
configuration boundary in the model test and align US-36 tests/current role
wording with approved RBAC V2. ADR-04 now marks its original non-inheritance
consequence as superseded; historical US-36 receipts are retained with a notice.
No existing production implementation or V2 runtime file was changed by closure.
The exact assertions, source-of-truth trace and baseline proof are in the closure
review. The original non-isolated run's missing temporary-cache failures were
runner failures; final tests use isolation outside the sandbox.

## Verification commands and limits

The shell's NVM shim has no active Node. Checks use the bundled Node executable:
`C:/Users/duybi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
No machine-wide Node configuration is changed.

From `apps/web`, the reproducible final regression command is:

```powershell
$runtimeBin = 'C:\Users\duybi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$runtimeNode = Join-Path $runtimeBin 'node.exe'
$targets = @(
  'src/modules/assistant-agent-v2',
  'src/modules/assistant-planning',
  'src/components/assistant/planning-client.vitest.test.ts',
  'src/components/assistant/planning-chat-flow.vitest.test.ts',
  'src/components/assistant/planning-history.vitest.test.ts',
  'src/components/assistant/assistant-auth-boundary.vitest.test.ts',
  'src/modules/ai/qa-service.vitest.test.ts',
  'src/modules/ai/qa-http.vitest.test.ts',
  'src/modules/ai/qa-session-continuity.vitest.test.ts',
  'src/modules/ai/qa-model.vitest.test.ts',
  'src/modules/runtime-config/runtime-config.vitest.test.ts',
  'src/modules/in-trip/us35-task285-integration.vitest.test.ts',
  'src/modules/in-trip/us36-test.vitest.test.ts',
  'src/modules/in-trip/us37-test.vitest.test.ts',
  'src/modules/trip-save/trip-save.vitest.test.ts',
  'src/modules/trip-save/trip-save-http.vitest.test.ts',
  'src/modules/trip-planner/planner-engine.vitest.test.ts',
  'src/modules/trip-planner/planner-boundaries.vitest.test.ts',
  'src/modules/trip-planner/planner-stadia.vitest.test.ts',
  'src/modules/trip-validation/trip-validation.vitest.test.ts',
  'src/modules/trip-validation/travel-time.vitest.test.ts'
)
& $runtimeNode ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts --isolate @targets
& $runtimeNode ../../node_modules/typescript/bin/tsc --noEmit
$env:PATH = $runtimeBin + [IO.Path]::PathSeparator + $env:PATH
$env:KLTN_PERF_BUILD = '1'
& $runtimeNode scripts/prepare-map-assets.mjs
& $runtimeNode scripts/build.mjs
```

Production build uses the existing isolated output directory. The PATH and
`KLTN_PERF_BUILD` assignments apply only to the invoking process, not machine
configuration. Run `git diff --check` at the repository root as well.

No live model, DB smoke, migration, browser acceptance or deployment is claimed.
Production conversational integration and V2-02 remain deferred. The existing
US-36 precision-policy todo remains out of scope; it is not a closure failure.

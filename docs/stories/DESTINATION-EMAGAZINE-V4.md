# DESTINATION-EMAGAZINE-V4 — AI dàn trang V4.0

## Owner scope decision — 2026-10-16

The Owner retired alternative generation, the V3.6 template/version controls and
the “Chuẩn bị cho chuyến đi” panel. This supersedes earlier V4.2 alternative
acceptance requests. The supported Editor AI action is **AI dàn trang**, producing
Layout DSL v2. Existing V1 storage remains readable for published articles,
Undo and Rollback; it is not a selectable generation mode. No data migration.

## Acceptance criteria

- A single AI action requests PROPOSE/version 2; HTTP rejects ALTERNATIVE/version 1
  before calling the provider. New unsaved layouts use V4.
- No alternative, version toggle or template regeneration buttons. Preserve
  design controls, manual edits/locks, Undo, unsaved edits and explicit Save/Publish.
- Preview and Public share the responsive renderer. Do not render the retired
  travel preparation panel, including when it exists in saved V1/V2 JSON.
- Preserve every canonical description unit and eligible media ownership; no
  invented historical facts, titles, sources or event/source bindings.
- Strict bounded schema, canonical AST hydration, readable grids, safe image
  ratios, diagnostics and Quality Gate remain active. Invalid output preserves
  the current draft.
- No paid model calls, Neon/Destination writes, env/migration changes,
  commit/push/deploy during this task.

Implementation and current verification:
[handoff](../implementation/destination-generative-layout-v4-report.md).

## Owner model configuration — 2026-10-17

Owner requested eMagazine AI editing/layout with `gpt-6-luna` at its highest
supported reasoning effort. The Editorial adapter now sends `reasoning_effort:
"max"` (previously `none`), without temperature/top_p. Existing schema, token and
timeout limits and explicit draft Save/Publish behavior remain in force.
Offline Editorial suites: 311 PASS / 6 PostgreSQL-gated SKIP. No live provider
quality/latency acceptance is inferred. Current OpenAI model reference:
https://developers.openai.com/api/docs/models/gpt-6-luna.

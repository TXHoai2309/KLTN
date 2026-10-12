# US-22 — Destination context for public RAG Q&A

## Status and sources

IMPLEMENTED — Tasks 198–202 complete offline; combined live acceptance pending.
Owner authorizes Tasks 198–202 before combined US-21/22 live
acceptance. Baseline TXH `eae6d9301183c734d819fd0f43966e854b3e3020`, clean.
Product Document §§6.6.2/6.6.4, 10.10, 11.22, 13.10 (NT-36, NT-50/51/54),
YCCN-22–29 and YCAI-45–52; System Specification §§3.4, 5.1–5.6 reviewed in
original DOCX files under D:/KLTN. These require explicit destination context,
public eligibility, grounded sources and no context change from passive browsing.
See [US-21](US-21-rag-qa.md) for unchanged outcome, ownership and write contracts.

## Contract, scope and authorization

- First ask accepts strict `{type: "GENERAL"}` (default) or
  `{type: "DESTINATION", destinationId}`. TRIP and client metadata are rejected.
- Persist the reference on the conversation; legacy conversations default GENERAL.
  Only server-resolved VISIBLE destinations with safe public names are eligible.
  Missing/hidden/unsafe names produce the same CONTEXT_UNAVAILABLE/404 for all roles.
- Guest, Traveler and Admin have identical public context access. Existing identity,
  ownership, retention, rate limit, lease, fence and idempotency boundaries remain.
- Follow-up inherits persisted context. Explicitly different context produces
  CONVERSATION_STALE/409; changing/removing context starts a new conversation.
  Replay and completion recheck visibility; completion holds a destination share
  lock through its transaction. Cached replies cannot grant continued access.
- Destination name is intent metadata, never a factual source. Existing RAG has
  no destination/document relation. The conservative implementation adds the
  verified name to the embedding query and filters chunks at SQL retrieval to
  name matches, then permits only complete source sentences with an exact normalized
  name phrase and word boundaries. This favors precision over recall; aliases and
  pronoun-only source sentences may produce insufficient source. It is not proof
  of semantic relevance or real-corpus quality. No new content relation or admin
  workflow is introduced. GENERAL retrieval behavior remains unchanged.
- Evidence remains INDEXED/READY/current publication/server-allowlisted,
  token bounded, rechecked and authentic. Task191 output/grounding checks stay strict.
- Detail action opens `/assistant?destinationId=...`. Server verifies the reference
  and projects names for a bounded public picker (50, plus the selected record).
  Its explicit switch/clear actions start new chat state. Passive browsing writes
  no global context. Pending/UNKNOWN blocks changes until resolved or explicitly
  abandoned through the existing dialog. Auth revalidation cannot send/replay.
  Explicit switch/clear replaces only the public destination reference in the URL;
  cached page trees reconcile that reference against server-projected choices.
  Browser reload/navigation still has US-21's memory-only client history limitation;
  this story introduces no persistent client history or automatic restoration.
- Keep the existing generation model and development/demo/production selection.
  Destination mode cannot use the GENERAL demo transport. Runtime activation,
  live evaluation, TRIP, history restoration and unrelated US-21 issues are outside
  scope. No provider calls, Neon changes, production activation, push or deployment.

## Acceptance and checks

198/199: GENERAL regression; strict context inputs; valid/hidden/missing/unsafe
metadata; server resolution; inherited follow-up; mismatch/new conversation;
context-aware sources/citations; visibility on replay/completion; ownership,
idempotency, concurrency and injection protection.
200/201/202: detail action, verified name, explicit switch/clear, lifecycle,
browser navigation, responsive keyboard operation and no passive context mutation.
Deterministic fixtures/mocked providers and disposable PostgreSQL only. Full
Vitest, PostgreSQL integration, typecheck, build, Prisma validation, diff and
secret scans required. Never use synthetic QA content to claim Hà Giang quality.

## Delivery evidence

2026-10-12: all 605/605 Vitest assertions passed across 40 files, zero skips,
using `node apps/web/scripts/test-qa-postgres.mjs --full`. Includes real PostgreSQL
16.15/pgvector 0.8.6, Task185 15/15, destination context constraint, inherited
follow-up for Guest/Traveler/Admin, ownership, concurrency, idempotency, hidden
replay/history/completion, scoped retrieval and unchanged GENERAL regressions.
Providers are mocks; synthetic evidence establishes behavior only, never Hà Giang
answer quality. Owned disposable containers/volumes were removed by the harness.

`npm run test:legacy -w web` exit 0; root `npm run check-types` 4/4 PASS;
root production `npm run build` PASS (29/29 generated pages); Prisma generate
and validate PASS. No dependency/package-lock or provider model changes.
Scoped premium strict audit PASS (zero findings), saved in
`docs/design/us22-ui-audit.json`; DESIGN lint has zero errors/four pre-existing
orphan-token warnings. Initial unconfigured whole-repository scan is recorded in
`docs/design/us22-global-ui-debt-audit.json` (22 findings, includes native ownership
flags resolved for this task in DESIGN/scoped config); it is not a global UI PASS.
No repository formatter/linter script is configured.

Browser fixture `node apps/web/scripts/assistant-context-fixture.mjs`, IAB,
React StrictMode: initial selected context, first/follow-up payload, explicit
switch/new first turn, clear/GENERAL, passive hash browsing/back, URL switch/clear
surviving reload, UNKNOWN blocking/abandon dialog, auth revalidation pause and
editable hidden-context failure verified. At 360x800, document scroll width 345px
with viewport 360px; full long name wraps. Desktop checked at 1440x1000. Keyboard
Enter, native select selection and focus checked. This is a real browser running
mocked transport, not authenticated Next/Neon/live-provider acceptance; no fresh
live Guest readiness or real Destination Detail browser/database acceptance is
claimed. Destination Detail action is covered by existing SSR/legacy regressions.

Migration `20261012120000_add_qa_destination_context` applies the legacy GENERAL
default and strict JSONB shape constraint. Applied only in disposable PostgreSQL;
Development/Production migration state was not queried or changed. Owner approval
is required to apply it before live destination Q&A. Existing US-21 runtime/abuse/
source allowlist gates and issues #1–6 remain unchanged. No live OpenAI/ask,
Neon access, cleanup, push, deployment or unrelated worktree/stash operation.
Combined live acceptance remains pending; US-21 is not ACCEPTED. Name matching
deliberately has lower recall for aliases/pronoun-only evidence; evaluate real
Hà Giang sources during combined acceptance. Client history remains memory-only.

Final diff check PASS; changed/untracked-file high-confidence credential scan and configured sensitive-value comparison: zero hits. No env files or unrelated changes included.

Changed files:
- apps/web/development/assistant-context-fixture.tsx
- apps/web/scripts/assistant-context-fixture.mjs
- apps/web/scripts/test-qa-postgres.mjs
- apps/web/src/app/assistant/assistant-context-page.ts
- apps/web/src/app/assistant/assistant-context-page.vitest.test.ts
- apps/web/src/app/assistant/page.tsx
- apps/web/src/app/destinations/[id]/destination-detail.tsx
- apps/web/src/components/assistant/assistant-chat.tsx
- apps/web/src/components/assistant/assistant-context-navigation.ts
- apps/web/src/components/assistant/assistant-context.vitest.test.ts
- apps/web/src/components/assistant/assistant-controller.ts
- apps/web/src/components/assistant/assistant-controller.vitest.test.ts
- apps/web/src/components/assistant/assistant-development-integration.vitest.test.ts
- apps/web/src/components/assistant/assistant-runtime-chat.tsx
- apps/web/src/components/assistant/assistant-runtime-mode.vitest.test.ts
- apps/web/src/components/assistant/assistant.css
- apps/web/src/modules/ai/qa-contract.ts
- apps/web/src/modules/ai/qa-contract.vitest.test.ts
- apps/web/src/modules/ai/qa-conversation-store.ts
- apps/web/src/modules/ai/qa-destination-context.ts
- apps/web/src/modules/ai/qa-destination-context.vitest.test.ts
- apps/web/src/modules/ai/qa-generation.ts
- apps/web/src/modules/ai/qa-prompt.ts
- apps/web/src/modules/ai/qa-retrieval.postgres.integration.vitest.test.ts
- apps/web/src/modules/ai/qa-retrieval.ts
- apps/web/src/modules/ai/qa-runtime-contract.ts
- apps/web/src/modules/ai/qa-runtime.ts
- apps/web/src/modules/ai/qa-service.ts
- apps/web/src/modules/ai/qa-service.vitest.test.ts
- apps/web/src/modules/ai/qa-store.postgres.integration.vitest.test.ts
- DESIGN.md
- docs/ai-progress.md
- docs/design/us22-global-ui-debt-audit.json
- docs/design/us22-premium-ui.json
- docs/design/us22-ui-audit.json
- docs/stories/US-21-rag-qa.md
- docs/stories/US-22-destination-context.md
- packages/db/prisma/migrations/20261012120000_add_qa_destination_context/migration.sql
- packages/db/prisma/schema/qa-conversation.prisma

### 2026-10-12 — Pilot preparation follow-up

Active sidebar label now mirrors the same controller context as the selector through
shell-local presentation; no additional persisted/global context. Destination switch,
clear/GENERAL, long mobile name, verification placeholder and unavailable context
are handled. Focused 61/61 tests, web typecheck, 29/29-page production local build
and scoped static assistant audit PASS. Browser offline 360px confirms matching
labels and no overflow; this does not claim live acceptance. Lũng Cú authored-summary,
provenance/rights sidecar and validated destination draft are prepared under
`docs/implementation/`; owner data/rights/provider approval remains pending.

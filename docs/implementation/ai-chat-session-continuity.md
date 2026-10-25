# Q&A session continuity correction — 2026-10-23

Owner requested implementation after the screenshot-based diagnosis. This is a
US-21/US-23 conversation repair within the existing server-managed Q&A flow;
it does not mark either story accepted or introduce persistent personal memory.

## Cause and correction

The screenshot asks about Cổng Trời Quản Bạ, then asks when to visit, which hour
of the day, and whether 8–9h is suitable. `qaIntentHistory` rejected the last two
wordings, so the production question-understanding call received no preceding
subject. Generation independently received at most two historical questions.
The alias dictionary also incorrectly mapped Cổng Trời to Núi Đôi Quản Bạ, and
the understander merged conflicting model and deterministic subjects.

- The production understander now receives a contiguous recent window from the
  store-authorized, completed parent chain regardless of follow-up wording.
  Shared `qaSessionHistory` limits it to **12 turns / 1,500 tokens**. It retains
  complete NFC/trimmed questions, including punctuation, numbers and negations;
  it does not skip an oversized recent condition to reach an older anchor.
  Social-only turns are excluded. Earlier answers, citations, internal IDs and
  provenance are never serialized into this history input.
- Retrieval and answer composition now share the same per-request
  `questionUnderstanding`. The generation prompt includes `RESOLVED_QUESTION`
  and the bounded question window, with explicit rules for corrections, new
  subjects, user conditions and interpretation-only use of history. No added AI
  call, model/environment change or provider-managed conversation state.
- An authorized pinned destination or explicit recognized current subject takes
  precedence over a conflicting model guess. Recognized dependent follow-ups
  inherit the latest identifiable subject; a repaired subject also repairs its
  search query while preserving the original question. Ambiguous references
  following a comparison ask which place rather than choosing one arbitrarily.
- Cổng Trời and Núi Đôi have separate canonical names/aliases. Bare Quản Bạ is
  no longer asserted to mean either individual attraction. Deterministic timing
  fallback recognizes the screenshot's daily-hour and colloquial 8–9h questions;
  unavailable understanding cannot certify an unanchored dependent question.
- Subject filtering now lowercases/NFC-normalizes the bound destination name,
  matching the normalization already applied to database content/titles in both
  vector and keyword branches. Previously a canonical mixed-case name could
  filter out its own sources. The query regression failed with no evidence
  before this correction and now passes through the actual retriever/Prisma SQL
  builder using a query adapter that simulates case-sensitive `strpos`.

`qa-runtime.ts` already injects the semantic understander. The deterministic
service adapter retains the older bounded selection seam for offline callers.
The store's 12-turn read, ownership, expiry/deletion, replay, idempotency, source
eligibility, knowledge modes and confirmed-write behavior are unchanged. No
schema/migration or live database operation is needed.

## Verification

- New real-service/real-understander regression seam: initially **8/8 failed**;
  final suite has **16 passing tests**. It uses synthetic owned history, a mock
  provider and no live database or paid API calls. It checks the screenshot
  chain plus an unfamiliar colloquial continuation, corrections, explicit topic
  switch, retained intervening conditions, model subject drift, comparison
  ambiguity, provider fallback, pinned context, chat isolation, source-only mode
  after expanded answers, semantic ambiguity with candidate subjects, normalized
  subject filtering in both retrieval branches, and history count/token bounds.
- Six focused conversation/understanding/generation/source-mode suites:
  **193 PASS**. One generation test now expects all three small historical
  questions rather than the superseded two-question truncation; its private
  metadata, evidence and provider-state exclusions remain asserted.
- Whole AI module run: **694 PASS / 14 FAIL / 73 SKIP**. The 12 advanced-reasoning
  and two chat-preference failures also occur with all six changed existing
  runtime modules restored to their HEAD contents by a temporary Vitest loader.
  Other pre-existing working-tree changes were retained in both runs. Exact
  failing test names match; **zero additional failures**. Local JSON receipts
  and the before-fix loader are in ignored `.cache/qa-session-baseline/`.
- Root `npm run check-types`: PASS (four tasks). Production web build: PASS,
  using the existing `KLTN_PERF_BUILD=1` separate output. `git diff --check`: PASS.

## Reproduce and limits

From `apps/web`:

```powershell
npx vitest run --config vitest.config.mts src/modules/ai/qa-session-continuity.vitest.test.ts src/modules/ai/qa-conversation-reliability.vitest.test.ts src/modules/ai/qa-question-understanding.vitest.test.ts src/modules/ai/qa-cross-mode-followups.vitest.test.ts src/modules/ai/qa-answer-quality-v2.vitest.test.ts src/modules/ai/qa-generation.vitest.test.ts
```

This verifies context wiring and deterministic guards, not real-model semantic
quality. Live provider/browser/PostgreSQL/production acceptance is not performed. The
bounded window can omit an older subject in a long chat; this change does not
claim unlimited recall or memory across separate conversations. No commit, push,
merge, deployment, source indexing, dependency or credential changes. Existing
unrelated UI, answer-policy and generation edits are preserved.

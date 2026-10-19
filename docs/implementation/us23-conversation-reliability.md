# US-21 / US-23 — question consistency and conversational support

Date: 2026-10-16. Scope approved by the owner's request in this chat: investigate
inconsistent repeated/punctuated questions and support greetings/basic conversation.
Implemented locally; live corpus/provider acceptance remains pending.

## Findings

- Retrieval unconditionally prepended the previous two questions. An explicit
  UNESCO/geology question asked after a price question therefore embedded a different
  intent from that same question asked first. Repeating it changed the query again.
- Question validation only applied NFC/trim. Adding `?`, `,`, `.`, `/` or incidental
  whitespace changed both the embedding request and the factual provider prompts.
  This was an input consistency defect, not an HTTP prohibition on punctuation.
- The structured JSON provider omitted temperature. Assessment, generation and
  synthesis verification therefore retained default sampling variation.
- Every utterance entered factual retrieval/source sufficiency. A greeting or a
  request for conversation could consequently yield insufficient source or a
  technical provider error even though no travel fact was requested.

The first ten new regressions failed on the original working tree and passed after
the fix. This proves the input/routing defects with offline adapters; it does not
identify the exact provider verdict for each message in the supplied screenshot.

## Changes and contract

- `qa-question-understanding.ts` normalizes interpretation text to NFC/lowercase,
  collapses whitespace and treats conversational punctuation as word separators.
  Numeric punctuation in `50.000`, `3,5`, `20/10/2026`, clock times, negative words
  and other qualifiers are retained. Stored/displayed questions, the admission
  request and idempotency hash retain their existing original-text contract.
- Explicit questions do not import unrelated history. Recognizable pronouns and
  elliptical follow-ups keep at most two factual questions; intervening social
  responses are skipped. A named new subject takes precedence. Sentence-level
  evidence, source eligibility and destination-context boundaries are unchanged.
- Retrieval and assessment/generation receive the same normalized intent. The
  server-only source-review binding uses that interpretation form too. Its current
  source snapshot binding and all downstream grounding checks remain required.
- All structured calls for the existing `gpt-4o-mini` runtime set `temperature: 0`.
  Lower sampling temperature reduces variation; it does not establish completely
  deterministic semantic decisions. See the official [Chat Completions API
  reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
- `qa-conversation.ts` recognizes bounded whole-utterance greetings, thanks,
  goodbyes, assistant help/identity questions, wellbeing/chat invitations,
  acknowledgements and broad travel-interest openings. Responses are authored by
  the server, contain no local factual claims and ask for useful preferences when
  appropriate. There is no additional model call or external-knowledge fallback.
- The completed public outcome `CONVERSATIONAL` has empty `answerParts`/`citations`
  and a `message` restricted by Zod to the shared server message allowlist. The
  factual generator cannot emit that outcome. `AssistantAnswer` renders the text
  normally without a missing-source notice or citation controls.
- A greeting combined with a factual request, such as `Hi, Đồng Văn được UNESCO
  công nhận là gì?`, still enters current-source retrieval and grounding. A request
  for an exact current price still requires evidence of current validity.
- Social replies use the existing principal/context authorization, rate admission,
  owned turn reservation, DB-confirmed completion, retention and same-key replay.
  A failed/uncertain commit still returns FAILED/UNKNOWN. No schema migration is
  needed: persisted responses already use validated JSON.

## Verification

- New integrated regression file: 34 tests, including punctuation/repetition,
  real assessment/generation adapters with mocked transport, mixed factual/social
  input, preserved numeric/time qualifiers, follow-up subjects, public DTO safety,
  ownership/context, replay and uncertain commits.
- Existing assistant source-state suite: 5 tests, including rendered social text
  and controller head advancement after a social reply.
- Existing retrieval/service history tests now use actual dependent questions;
  the provider transport test also asserts `temperature: 0`.
- Root typecheck passed. Root production build passed (26.7s). Final full web
  tests: 1705 Vitest pass / 97 gated skips, plus all 329 legacy tests pass.
  `git diff --check` passed. Skipped suites retain their existing database and
  extraction-fixture prerequisites; no live integration result is inferred.
- No live provider calls, live DB operations, source/index/environment changes,
  migration, commit, push or deployment were made by this task. Pre-existing dirty
  AI Answer Quality V2, Editorial, RAG and schema edits were preserved.

## Remaining limits / manual smoke

Intent routing is deliberately bounded. Unrecognized chit-chat can still follow
the factual path; arbitrary open-domain answering is not introduced. Follow-ups
outside the recognized patterns may need a more explicit subject. Factual answer
quality still depends on eligible corpus coverage and probabilistic semantic
assessment/verification. No response cache bypasses source revocation.

Task-owned code files under `apps/web/src/modules/ai`: new `qa-conversation.ts`,
`qa-question-understanding.ts`, `qa-conversation-reliability.vitest.test.ts`;
edited `qa-contract.ts`, `qa-runtime-contract.ts`, `qa-service.ts`,
`qa-retrieval.ts`, `qa-source-sufficiency.ts`, `qa-json-provider.ts`,
`qa-generation.vitest.test.ts`, `qa-retrieval.vitest.test.ts`,
`qa-service.vitest.test.ts`. Assistant files: `assistant-chat.tsx` and
`assistant-source-status.vitest.test.ts`. Documentation: this handoff and appended
US-23/progress entries. Existing assessment/synthesis implementation was preserved.

On the existing enabled development app, ask the UNESCO/geology question first,
after a price question, and with/without trailing punctuation. Inspect source
citations. Then ask `hi`, `cảm ơn bạn`, `bạn có thể giúp gì?`,
`mình muốn đi du lịch Hà Giang`, and a greeting combined with a factual question.
Check `nó ở đâu?` and `còn giá vé thì sao?` after a factual answer and an intervening
greeting. Confirm missing current-price evidence still abstains. These live
provider/corpus checks have not been claimed as performed.

# V2-05 QA regression baseline debt

Pinned baseline: `101294f56f1eee8ea81a662801b2631bdcf8e08f`. An ignored HEAD snapshot exports `apps/web/src`, Vitest config and `packages/ui` without V2. The five files below reproduce **119 PASS / 48 FAIL** both on HEAD and the current checkout. The exact failing `(file, fullName)` sets match; zero newly failing assertions. No production QA/RAG/controller source or these tests was changed by V2-05.

The broader 91-file run reports 1157 PASS, 48 FAIL, 82 skipped and 1 existing todo. The separate directly relevant 56-file QA/RAG/planning gate is recorded in the V2-05 story. These baseline failures are not silently excluded from the report or fixed by changing production behavior.

## Causes and scope

- Diagnostics: legacy environment/fetch fixtures do not mock effective embedding credentials after ADR-25. Retrieval fails at QUESTION_EMBEDDING_STARTED before expected generation/schema/persistence assertions (typically expected HTTP200/502, actual503).
- Advanced reasoning: fixtures still expect the historical REVIEWED_SUPPORT/facet and assessor flow, while the approved document-first path uses answerParts plus a two-call contract. Remaining retrieval assertions expect an older ordering; the assessor-failure case expects a stage no longer used.
- Answer quality: all eight failing assertions pin the old `gpt-6-luna`/high request. The current approved QA default is `gpt-6.1-sol`/medium (ADR-19 and current provider/model configuration); valid answers are rejected by stale model-parameter assertions.
- Conversation reliability: its factual adapter fixture expects the old reviewed-support prompt, yielding controlled AI_UNAVAILABLE before the expected answer.
- Chat preference: assertions require explicit payload.knowledgeMode=SOURCE_ONLY, while the current controller intentionally omits that default; both new and retry payloads use the existing omission contract.

This is baseline debt, not an approval to rewrite QA architecture or weaken grounding. Any repair should be a separate focused task with current ADR-19/25 and source-eligibility contracts verified.

## Exact failing assertions

### qa-advanced-reasoning.vitest.test.ts

12 failures; unchanged test blob `e69149be58628b924c92e74bae01bbfe062fe3db`.

- **case 1 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 2 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 3 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 4 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 5 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 6 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **case 9 preserves source meaning and coverage** — `AppError: Dịch vụ AI hiện không khả dụng.`
- **plans other names and preserves a missing side instead of certifying complete coverage** — `AppError: Phản hồi AI không hợp lệ hoặc không có căn cứ.`
- **does not let generation downgrade an explicit comparison to an unrelated clarification** — `AppError: Phản hồi AI không hợp lệ hoặc không có căn cứ.`
- **reserves tokens for a second subject instead of filling the budget with the first one** — `AssertionError: expected [ 'chunk_3', 'chunk_2' ] to deeply equal [ 'chunk_2', 'chunk_3' ]`
- **batch embeds two subjects, queries both eligible branches and round-robins whole chunks** — `AssertionError: expected [ 'chunk_1', 'chunk_2', …(2) ] to deeply equal [ 'chunk_1', 'chunk_5', …(2) ]`
- **keeps a technical assessment failure FAILED with no completed turn** — `Error: expected AppError: INTERNAL_SERVER_ERROR { …(3) } to match object { code: 'AI_UNAVAILABLE' }`

### qa-answer-quality-v2.vitest.test.ts

8 failures; unchanged test blob `024e25951dc9ef7a1d733d10cc4202719d4ada2e`.

- **R01 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **R02 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **R04 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **R06 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **R07 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **R08 accepts coherent non-extractive claims with authentic citations** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **binds generator prompt to current evidence and schema with valid citation IDs** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`
- **assessment prompt makes current intent, table coverage and corpus uncertainty explicit** — `AssertionError: expected { model: 'gpt-6.1-sol', …(5) } to match object { model: 'gpt-6-luna', …(1) }`

### qa-chat-preference.vitest.test.ts

2 failures; unchanged test blob `18fc30af8edf9f0459a216bdf888dbfc04b4047d`.

- **maintains in-flight request snapshot mode separate from concurrent controller mode toggle** — `AssertionError: expected undefined to be 'SOURCE_ONLY' // Object.is equality`
- **UNKNOWN retry preserves the original attempt mode and key even after user toggles mode** — `AssertionError: expected undefined to be 'SOURCE_ONLY' // Object.is equality`

### qa-conversation-reliability.vitest.test.ts

1 failures; unchanged test blob `d84175ce543464f02b934077f07b849d28ad29b2`.

- **keeps factual answers stable across punctuation, repeated turns and previous topics using real assessment/generation adapters** — `AppError: Dịch vụ AI hiện không khả dụng.`

### qa-diagnostics.vitest.test.ts

25 failures; unchanged test blob `2d9726897cff850ef6c1decaeafd779817c7793e`.

- **maps valid provider ANSWERED through the real HTTP/service/adapter path** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **maps valid provider PARTIAL through the real HTTP/service/adapter path** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **maps valid provider INSUFFICIENT_SOURCE through the real HTTP/service/adapter path** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **maps valid provider CLARIFICATION_REQUIRED through the real HTTP/service/adapter path** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **rejects contradictory unanswered for ANSWERED at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory unanswered for PARTIAL at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory unanswered for INSUFFICIENT_SOURCE at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory unanswered for CLARIFICATION_REQUIRED at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory parts for ANSWERED at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory parts for PARTIAL at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory parts for INSUFFICIENT_SOURCE at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects contradictory parts for CLARIFICATION_REQUIRED at the historical stage** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects truncation/malformed output before outcome validation 0** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **rejects truncation/malformed output before outcome validation 1** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **empty evidence completes INSUFFICIENT_SOURCE without generation dispatch** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **records actual order, provider metadata and persistence only after acknowledgement** — `AssertionError: expected 503 to be 200 // Object.is equality`
- **classifies unavailable without exposing values or changing public codes** — `AssertionError: expected { …(20) } to match object { stage: 'GENERATION_PROVIDER', …(2) }`
- **classifies malformed without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies schema without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies outcome without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies citation without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies grounding without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies persistence without exposing values or changing public codes** — `AssertionError: expected 'AI_UNAVAILABLE' to be 'OPERATION_STATUS_UNKNOWN' // Object.is equality`
- **classifies embedding without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`
- **classifies eligibility without exposing values or changing public codes** — `AssertionError: expected 503 to be 502 // Object.is equality`

## Reproduction

Use bundled Node with `node_modules/vitest/vitest.mjs run --config vitest.config.mts --isolate` from `apps/web` (or the corresponding exported HEAD directory). Pass the five named files, `--reporter=default --reporter=json` and distinct `--outputFile` paths. Ignored receipts are `.cache/v205-qa-baseline/failures-current.json`, `failures-baseline.json` and `comparison.json`.

Two exploratory all-QA JSON reruns were interrupted after a fork-worker teardown timeout and are not full-suite receipts; their partial reports are not used for the final assertion comparison. The completed 91-file run and completed five-file comparison are the authoritative receipts.

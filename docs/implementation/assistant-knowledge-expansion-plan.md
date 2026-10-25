# Assistant knowledge expansion design interview

Status: TICKETS 01–07 IMPLEMENTED AND VERIFIED OFFLINE — 2026-10-21. Additive database migration `20261021183000_add_qa_conversation_knowledge_mode` created; live deployment and production smoke pending.

The owner explicitly requested `grill-with-docs`, followed by `to-tickets`. After six interview questions, the owner approved all recommendations and instructed the sequential execution of tickets 01 to 07. The [product exception](../product/product-spec.md#rag-answers), [ADR-19](../decisions.md#adr-19--opt-in-knowledge-expansion-for-public-qa-2026-10-21), and [domain glossary](../../GLOSSARY.md) record the accepted scope.

## Owner-confirmed scope

- Add a switch named **Mở rộng kiến thức** to public Q&A. Off disallows model-knowledge supplementation; on permits document-first gap filling and relevant travel background/advice even when documents cover the main question.
- Relax restrictive answer-style and Q&A checks that prevent natural responses or suppress answers available in documents.
- Add an AI question-understanding step before retrieval so that subjects and requested information guide the search.
- Use the exact selected model `gpt-6.1-sol` with `medium` reasoning for the requested AI work.
- The owner confirmed the interview recommendations and selected local ticket files. Propose small independently verifiable tickets and their genuine blocking dependencies before publishing them.

## Verified current implementation

- The product's existing JSON provider already selects `gpt-6.1-sol` with medium reasoning. Official [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) confirms support for medium; the provider is not being changed during this interview.
- Question normalization, follow-up handling and the pre-retrieval plan are rule-based. The LLM assessor runs after retrieval and cannot recover omitted chunks.
- Runtime uses hybrid retrieval with four final chunks and a 3,000-token evidence budget. Generic OR keyword matching and no single-subject filter for a GENERAL overview let unrelated destinations compete with Hạ Thành.
- The owner-supplied production conversation was checked read-only: three of its four retained chunk identities belong to Đồng Văn; the fourth is the Hạ Thành bibliography. Hạ Thành has a current indexed introduction. Offline replay of the recorded selection exposes the missing introduction; a control confirms that the correct paragraph survives current safety/citation projection.
- The uploaded Hạ Thành content has TXT locators. Its citation bundle currently has zero registered original sources; the bibliography is not fully recognized as metadata. This is a separate attribution defect, not proof that the document lacks answer content.
- Factual response parts currently require citations and cannot honestly represent model-only content. There is no request knowledge-mode field or stored conversation preference.
- The client freezes request body and key for UNKNOWN recovery. Mode must be part of the submitted attempt's identity so retry cannot silently change behavior. Existing history must remain readable.
- Existing synthesis verification has eight all-pass gates, including natural-language quality. Partial missing support is supported, but conflict/uncertainty may currently suppress the whole answer.

These findings describe the inspected checkout and captured production request, not acceptance of a new design.

## Design tree and interview frontier

All six presented recommendations are accepted:

1. Expansion is document-first and focused on Hà Giang/related travel; it may add relevant background/advice as well as fill missing information.
2. Model-added content carries a small **Kiến thức mở rộng** label. Only document-supported claims receive actual citations; a citation must not imply support for neighboring model-added claims.
3. The switch is remembered per chat, including when reopened. New chats start off. A change affects future submitted turns, never previous answers.
4. Unsupported current prices, opening hours, event schedules and changed addresses may be discussed as unverified reference information, without suppressing other useful supported content.
5. The normal path uses AI understanding, retrieval/ranking, then AI answer composition. Remove the independent assessor/eight-gate verifier and mandatory facet structure. Retain real-source, mode, ownership, privacy and valid-response checks. The owner accepted the loss of independent semantic review.
6. Use local per-ticket files under `.scratch/assistant-knowledge-expansion/issues/` after the owner reviews the actual breakdown. No external tracker publication is authorized or required.

## Proposed engineering details for ticket review

These are reviewable implementation proposals, not additional interview answers:

- Preserve the existing bounded history of authorized questions for interpretation. Prior model answers are never upgraded to verified document evidence when expansion is off.
- If question understanding is unavailable or malformed, fall back once to the original question and existing deterministic interpretation, without inventing a subject or automatically retrying the provider. An unresolved subject can still request clarification. A later answer-provider failure remains a technical error.
- Include the submitted mode in canonical request identity; omitted mode in legacy requests means off. UNKNOWN retries retain the original body/key/mode regardless of subsequent UI changes. Preference writes on an existing chat use ownership and confirmed-write semantics.
- Retrieve/rank against interpreted entities and requested information before final evidence selection. Tune candidate/final evidence and provider limits together using the fixed regression set; retain finite resource bounds, rather than making success depend on arbitrary extra model-review calls.
- Natural paragraphs and lists should render safely in the existing Assistant. Remove fixed word targets and style-based refusals; keep response parsing and real citation checks. More elaborate rich content is unnecessary for this scope.
- Use compatible history/provenance shapes: old missing-mode turns are source-only; new model-only/mixed answers need honest provenance and must not fabricate a source to satisfy the old citation-required shape.

## Ticket breakdown and execution status

All 7 tickets were approved and executed sequentially in `.scratch/assistant-knowledge-expansion/issues/`:

| Ticket | Delivery | Status | Test Suites |
| --- | --- | --- | --- |
| 01 | Correct content/original-source extraction for TXT, Word DOCX and PDF; exclude bibliography metadata from answer evidence | DONE | `original-sources.vitest.test.ts` (10/10 PASS) |
| 02 | Understand a question with AI and retrieve the right destination's answer material | DONE | `qa-question-understanding.vitest.test.ts` (15/15 PASS) |
| 03 | Natural source-only answers using the simplified normal two-call path | DONE | `qa-natural-answers.vitest.test.ts` (14/14 PASS) |
| 04 | Opt-in expanded and mixed answers with a working switch, honest labels and per-turn request identity | DONE | `qa-expanded-answers.vitest.test.ts` (12/12 PASS) |
| 05 | Remember the switch per chat and restore it consistently on reopen | DONE | `qa-chat-preference.vitest.test.ts` (7/7 PASS) |
| 06 | Useful answers with explicit uncertainty for unsupported current travel information | DONE | `qa-current-information-uncertainty.vitest.test.ts` (5/5 PASS) |
| 07 | Follow-up questions across mode switches without leaking model knowledge into source-only answers | DONE | `qa-cross-mode-followups.vitest.test.ts` (4/4 PASS) |

Frontier and execution: 01 → 02 → 03 → 04 → 05 → 06 → 07 executed sequentially. Additive schema migration `packages/db/prisma/migrations/20261021183000_add_qa_conversation_knowledge_mode/migration.sql` created via Prisma CLI. Every ticket includes dedicated automated tests and evidence recorded in its respective issue file.

## Continuing technical obligations

Existing authorization/ownership, eligible-document lifecycle, secret protection and confirmed-write/idempotency behavior still apply. Model knowledge is not document evidence, and turning off expansion must not reuse a prior expanded answer as verified support. Planner and Constraint Validator retain deterministic missing-data behavior.

This feature does not imply web browsing, deployment, migration execution, commits, pushes or issue publication before the interview and ticket review have completed.

## Ticket handoff

After design confirmation, propose tracer-bullet vertical slices, each demoable or independently verifiable and sized for one fresh context window. Include real blocking edges, review granularity and merge/split choices with the owner, then publish one approved ticket per file or tracker issue. Use the project's glossary. Do not create a horizontal backend/UI/test checklist or a single combined ticket file.

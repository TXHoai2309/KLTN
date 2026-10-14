# US-21 temporary local stage diagnostics

## Evidence and scope

The two historical asks reached the server and returned HTTP 502. Read-only Development verification still finds two conversations and two FAILED/AI_INVALID_RESPONSE turns, with question/response/provenance scrubbed. Existing logs and records do not distinguish retrieval, generation, grounding or completion failure; they cannot establish generation charges. No scrubbed content was recovered. Historical root cause remains unresolved.

Diagnostics are temporary and active only when NODE_ENV=development and VERCEL_ENV is absent or development. Production and Preview are forced off. No new env variable, credential, response field, response header, database table or migration is used. Runtime wiring is in qa-runtime.ts. Each qaHttp.ask invocation runs in its own AsyncLocalStorage context with a server-generated random UUID unrelated to user/session/key/turn IDs. The log prefix is US21_QA_DIAGNOSTIC. Remove the diagnostics wiring and instrumentation after local diagnosis is complete.

## Failure origin inventory

All locations below previously shared AI_INVALID_RESPONSE without internal stage logs. Existing tests cover most rejection behavior, but could not correlate a historical live rejection with a specific site. Added offline diagnostics tests assert stage/category and public code.

| Module/location | Rejection condition | Diagnostic stage/category |
| --- | --- | --- |
| qa-service embedding error mapping | Retriever throws EmbeddingError INVALID_PROVIDER_RESPONSE | QUESTION_EMBEDDING_VALIDATION / SCHEMA or EMBEDDING_VECTOR; public AI_INVALID_RESPONSE |
| qa-retrieval provider result | Wrong batch length/index, non-array/non-1536 vector, nonfinite/unrepresentable floats, zero/nonfinite norm | QUESTION_EMBEDDING_VALIDATION / EMBEDDING_VECTOR |
| qa-service eligibility | Initial, periodic in-flight or final recheck fails | EVIDENCE_ELIGIBILITY_CHECK / ELIGIBILITY |
| qa-generation input checks | Unsupported context, invalid question, too many evidence chunks or raw UTF-16 budget exceeded | GENERATION_PREFLIGHT / INPUT_LIMIT |
| qa-generation text safety | Internal evidence identifier or private material in source text | GENERATION_PREFLIGHT / PRIVATE_MATERIAL |
| qa-generation injection guard | Source text contains detected instructions | GENERATION_PREFLIGHT / EVIDENCE_INSTRUCTION |
| qa-generation prompt budget | Composed input exceeds token limit | GENERATION_PREFLIGHT / TOKEN_LIMIT |
| qa-generation response body | Missing response stream or response byte ceiling exceeded | GENERATION_ENVELOPE / BODY_MISSING or BODY_LIMIT |
| qa-generation envelope decoding | Invalid JSON/UTF-8, invalid choices/message/content shape, non-stop finish or refusal | GENERATION_ENVELOPE / INVALID_JSON, ENVELOPE or REFUSAL; schema paths for ENVELOPE |
| qa-generation content | Content exceeds output token bound or malformed model JSON | GENERATION_JSON / TOKEN_LIMIT or INVALID_JSON |
| validateQaGenerationOutput schema | Strict model schema fails | GENERATION_OUTPUT_SCHEMA / SCHEMA, sanitized issue code/path |
| validateQaGenerationOutput outcomes | unanswered disagrees with PARTIAL, empty factual parts or nonempty insufficient/clarification parts | GENERATION_OUTCOME / OUTCOME_CONSISTENCY |
| validateQaGenerationOutput registry | Duplicate evidence IDs | CITATION_VALIDATION / DUPLICATE_REGISTRY |
| validateQaGenerationOutput references | Duplicate cited IDs, missing evidence ID or evidence citation.id mismatch | CITATION_VALIDATION / DUPLICATE_CITATION or CITATION_REFERENCE |
| validateQaGenerationOutput grounding | Instruction-bearing cited text or answer part is not a complete exact evidence sentence | GROUNDING_VALIDATION / EVIDENCE_INSTRUCTION or UNSUPPORTED_SENTENCE |
| validateQaGenerationOutput projection | Public citation metadata fails schema | CITATION_VALIDATION / SCHEMA, sanitized issue code/path |
| validateQaGenerationOutput final shape | Completed-turn contract validation fails | RESPONSE_VALIDATION / SCHEMA, sanitized issue code/path |
| Generation/service public safety | Answer contains private references/internal identifiers | PUBLIC_SAFETY / PRIVATE_MATERIAL |
| qa-service response contract | Completed-turn schema fails after generator returns | RESPONSE_VALIDATION / SCHEMA, sanitized issue code/path |
| qa-service citation projection | Returned citation does not exactly match retrieved backend projection | CITATION_VALIDATION / CITATION_PROJECTION |
| qa-conversation-store complete | Atomic evidence eligibility fence fails | PERSISTENCE_STARTED / ELIGIBILITY |
| qa-conversation-store complete | Result conversation/turn IDs do not match reservation | PERSISTENCE_STARTED / IDENTITY_MISMATCH |

qaHttpError only maps the existing AppError code to the existing public HTTP status. A failed completed-response parse at the HTTP boundary maps UNKNOWN (503), not AI_INVALID_RESPONSE. Generic completion DB errors also remain UNKNOWN. Provider unavailable/non-2xx/network/timeout remains AI_UNAVAILABLE (503), not insufficient source. Failure-state persistence errors remain UNKNOWN. No error policy was changed.

## Reading the events

The real order is request parse -> principal -> reservation -> query embedding -> retrieval -> initial eligibility -> generation preflight/provider/envelope/JSON -> generation schema/outcome/grounding -> generator return -> service response/citation validation -> final eligibility -> atomic completion -> HTTP response validation. Consequently GENERATION_OUTPUT_VALIDATED occurs before GENERATION_COMPLETED (generator return). Empty evidence still enters the generator, returns the constant INSUFFICIENT_SOURCE, and never dispatches generation. Replay ends after admission and does not invoke retrieval/generation.

Failure events carry stage/category/public code and the last observed provider metadata. Earlier provider events from the same correlation ID retain the other provider's metadata. embeddingInvoked/generationInvoked mean the corresponding fetch adapter was called; they do not prove the remote service accepted or billed it. Retrieved chunks means the evidence returned to the service after retrieval filtering; eligibleChunks is the count from the last successful initial eligibility check. Null means not reached/unknown, zero means empty. A later ELIGIBILITY failure invalidates that earlier eligibility snapshot. These are technical checks, not a semantic quality certificate.

Projected metadata: provider HTTP status; x-request-id only with a bounded req_ identifier shape; recognized finish reason enum; nonnegative bounded integer prompt/completion/total token counts when supplied by the generation envelope. Embedding HTTP status/request ID are observable, but embedding usage is not currently exposed by the existing adapter. Missing/malformed metadata stays absent; no usage is fabricated. Request ID is for owner correlation with provider logs, not a credential.

No raw error message, schema message/input/value, unknown field name, prompt/question/answer/chunk, arbitrary provider property, URL, storage path, identity, key, cookie, token or header/body is logged. Validation paths project only recognized schema field names and bounded numeric indexes; other path segments become FIELD. Sink errors never affect request outcome. Production/Preview off, leakage projection, concurrent correlation isolation and unchanged public error mappings are covered by deterministic tests.

## One owner-triggered diagnostic attempt

1. Use the existing Webpack localhost:3001 server and authenticated session. No fixture upload/index, migration or allowlist change is needed. Do not send while another request is unresolved.
2. Open /assistant and start a new conversation. Submit exactly once: **Ma xac nhan cua ho so QA Sao Tim la gi?** This is supported by the approved TEST/SYNTHETIC fixture. Expected evidence sentence: **Ma xac nhan cua ho so QA Sao Tim la QA-SAOTIM-21.** A successful factual answer must still cite the actual retrieved fixture; guards remain active.
3. Let the existing controller create a new key for this new intent. Do not manually replay either historical failed key, press retry or send follow-up questions to manufacture logs.
4. Record the HTTP status/public outcome and server US21_QA_DIAGNOSTIC events for the new correlation ID. For failure, inspect its stage/category and the matching provider events. Do not copy credentials, content or browser cookies into reports. Stop after this one attempt, regardless of outcome.
5. Where available, compare sanitized request IDs/timestamps with the owner's OpenAI project usage/log dashboard. Historical calls have no captured request IDs/usage, so charges remain NOT_CONFIRMED rather than zero. HTTP 502 and reserved token counters do not prove no charges. No provider usage API call was made during preparation.

Budget: the two historical POSTs consume two slots of the owner-authorized five-question budget conservatively. Three slots remain before the diagnostic attempt; two remain after that single attempt, regardless of its outcome. This does not imply three free generation calls or authorize automatic execution. No new live provider request was made to prepare diagnostics.

Historical root cause cannot be identified retroactively from scrubbed records. Instrumentation is ready to identify the execution origin on the next separately owner-triggered attempt; it does not claim the original defect has been fixed or real-corpus acceptance passed.

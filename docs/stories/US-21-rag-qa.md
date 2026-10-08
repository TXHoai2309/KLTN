# US-21 — Hỏi đáp RAG có nguồn và hội thoại nhiều lượt

## Status

IN PROGRESS — Task 191 contract implementation only; owner review pending.
No Q&A endpoint, conversation runtime or chat UI is implemented by this task.
Do not mark the whole US-21 IMPLEMENTED, ACCEPTED or DONE from this evidence.

## Owner / goal

Owner: Tô Xuân Hoài. Sprint 3, Task 191: define the request/response,
public citations and multi-turn contract before runtime integration.
Guest, Traveler and Admin can ask public culture/destination questions and
receive grounded answers with real sources, or an explicit content outcome.

## Baseline and source references

- Branch `TXH`, HEAD `94d685bb1dc0daccfb9d4a08041dbff5da023c96`; clean before Task 191.
- Product Document (original `D:/KLTN/Product document.docx` reviewed locally):
  YCCN-22–29, YCAI-01–10, YCAI-45–52, QTN-104–120, NT-35–54;
  §10.4 RAG behavior, §13.9 source/answer acceptance, §13.10 context acceptance.
- System Specification (original reviewed locally): §§5.1–5.6 Q&A, context,
  eligible retrieval, insufficient source and source display.
- [Product contract](../product/product-spec.md), [source precedence](../source-baselines.md),
  [architecture](../architecture/technical-architecture.md), [flows](../flow/user-flow.md),
  [ADR-01/02/04/08/09](../decisions.md).
- Existing `server/http/api-response.ts`, `app-error.ts`, `error-handler.ts`,
  `idempotency.ts`, authorization guards and Destination/Culture public allowlists.
- Three design-review rounds technically approved; owner implementation
  authorization explicitly locks multi-turn, server-managed PostgreSQL/Neon
  history, retention and metadata-only public sources.
- Existing Vitest configuration is reused without dependencies/config edits.
  ADR-14's historical Proposed status is not silently changed by this task.

Product requirements define grounding, role/ownership, source lifecycle and
context isolation. JSON shapes, error mappings and limits below are approved
technical decisions, not claims that the Product Document prescribed a schema.

## In scope / implementation boundary

- Pure Zod schemas, inferred TypeScript types and response-reference validation.
- Deterministic fixtures; no live AI, database or network in contract tests.
- This story contract and an append-only progress entry.

Out of scope: actual Route Handlers, anonymous sessions, conversation/message
persistence, history read/delete, Prisma models/migrations, Neon operations,
OpenAI, embeddings/vector retrieval, evidence registry, grounding verifier,
background execution, rate limiter, chat UI, EN-02 import and production config.
Shared HTTP/auth/idempotency and public domain modules remain unchanged.

## Owner decisions / retention and deletion

- MVP supports follow-up interpretation in a server-managed conversation.
  PostgreSQL/Neon is the selected persistence backend, not implemented here.
- Guest conversation retention: 7 days; authenticated: 30 days.
- Failed-turn content: at most 24 hours, and never beyond conversation deletion
  or its earlier expiry. Users can explicitly delete their conversations.
- **Assumption:** conversation expiry is a rolling inactivity deadline from
  last authorized conversation activity. Runtime must define activity precisely
  and bound extensions; invalid/unauthorized requests must not refresh retention.
- Failed-turn 24-hour retention is measured from terminal failure, without
  extending its stored content on repeated status checks.
- Cleanup includes related messages, retained provenance/content, identity
  associations as applicable, and cached idempotency responses containing
  conversation content. Current shared idempotency records have no TTL:
  future cleanup must not leave conversation content there indefinitely.
- Deleted/expired history must not be resurrected through cached replay.
  Runtime must coordinate deletion with active workers and completion writes;
  non-content deduplication markers may prevent recreation without keeping text.
- No automatic Guest-to-user ownership migration after login.

These policies are requirements, not a cleanup/session implementation.

## Active request contract (endpoint not implemented)

Planned endpoint: `POST /api/ai/ask`.

First turn:

```json
{
  "question": "Dinh thự họ Vương có gì đặc biệt?",
  "context": { "type": "GENERAL" }
}
```

Follow-up:

```json
{
  "conversationId": "conv_example",
  "parentTurnId": "turn_example_01",
  "question": "Nó nằm ở đâu?"
}
```

- Question: string, NFC then trim, 1–2000 UTF-16 code units after normalization.
  Limits count JavaScript string length, not UTF-8 bytes or graphemes.
- Root/nested objects are strict. No userId, ownerId, role, arbitrary history,
  prompts, model configuration, evidence or client-supplied source metadata.
  Text within a legitimate question is still untrusted data, never an instruction
  that can change system policy or become verified evidence.
- First turn omits conversationId and parentTurnId. Context defaults to GENERAL.
- Follow-up requires conversationId and parentTurnId; parentTurnId may be null
  only when no completed head exists. Runtime checks the actual head.
- Missing follow-up context inherits server-owned context. Explicit context
  must match it; schema validation alone cannot establish that match.
- References use the existing domain ID-style syntax: 1–128 ASCII alphanumeric,
  underscore/hyphen characters. These are references, not credentials.
- Only GENERAL is active. DESTINATION/TRIP fail validation with INVALID_REQUEST,
  without automatic fallback. DESTINATION belongs to US-22; TRIP is future scope.
- Idempotency-Key is mandatory: trimmed non-empty scalar, at most 200 characters,
  consistent with the shared key contract. The schema is independent of Headers.
- HTTP boundary must enforce JSON media type, malformed JSON and the 16 KiB raw
  byte limit before parse (not just Content-Length). Pure object schemas do not
  implement an HTTP parser/body reader or enforce total body bytes.

## Active completed response contract

Shared mutation-compatible envelope:
`{ success: true, operationStatus: "SUCCESS", data: ... }`.

Data requires conversationId, turnId, turnState=COMPLETED, verified context
GENERAL and a strict discriminated content outcome:

| Outcome | Fields / structural requirements |
| --- | --- |
| ANSWERED | Non-empty answerParts/citations; unansweredAspects is required `[]`. |
| PARTIAL | Non-empty answerParts/citations and non-empty unansweredAspects. |
| INSUFFICIENT_SOURCE | answerParts/citations are `[]`; message must equal the server-controlled constant `Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.` |
| CLARIFICATION_REQUIRED | answerParts/citations are `[]`; clarificationQuestion is NFC/trimmed, 1–2000 UTF-16 units. |

Each answer part is `{ text, citationIds }`, non-empty text and at least one
citation ID. Every part requires grounding; notices are not mixed into parts.
Citation IDs must exist in the response, be unique in each part, and be unique
in citations. No unreferenced citations. Reuse across parts and multiple
citations per part are supported; different citations may share a sourceId.
No answerText convenience field or generic notice.

Safe clarification and unansweredAspects must not contain unsupported factual
claims. Their schema only validates syntax; runtime semantic policy must verify
this. A syntactically valid response is not proof of grounding or eligibility.

## Turn lifecycle versus content outcomes

Future internal lifecycle: ACCEPTED → PROCESSING → COMPLETED or FAILED.
Only COMPLETED is accepted in the active successful response schema. A completed
insufficient/clarification/partial outcome is not a technical failure.
UNKNOWN is completion uncertainty, not a content outcome or a stored answer.
Failed attempts do not become completed assistant history.

HTTP 202 admission/PROCESSING is **planned only**, deliberately excluded from
the active response schema. It requires durable execution/recovery and an
authorized read-status endpoint before activation. Admission SUCCESS must never
be presented as completed-answer SUCCESS. No promise of Vercel background work
after a request finishes, and no background execution is added here.

## Public citation contract

```json
{
  "id": "c1",
  "sourceId": "source_fixture_a",
  "title": "Tài liệu kiểm thử A",
  "sourceUrl": null,
  "locators": [{ "pageNumber": 3 }]
}
```

This is fictional fixture metadata, not a real product source.

- id is response-local. sourceId is an opaque public alias stable by document
  identity, not a database ID renamed or a URL/access token.
- title is approved public source metadata; NFC/trimmed, 1–300 units, following
  the existing Culture source-title limit. No invented title fallback.
- sourceUrl is required and nullable; non-null URL is HTTP(S), at most 2000
  Unicode code points, without credentials/control/whitespace. Syntax does NOT establish
  public permission: runtime must explicitly project approved public URLs.
  Private/signed storage URLs must not pass public projection even if their
  strings satisfy this syntax schema. No server URL fetch is implemented.
- locators is required; `[]` when no trustworthy locator exists. Each strict
  locator has optional positive integer pageNumber and/or NFC/trimmed section
  (1–300 units); at least one must exist. Null/empty locators are invalid.
- PDF page numbers come from extractor data; runtime must define one-based
  physical file pages and not confuse them with printed page labels.
  DOCX can supply verified headings, not assumed fixed page numbers.
  TXT has no assumed page/section. Multiple locations may be returned.
- No public documentId/chunkId, raw text, excerpt/snippet, uploaded original
  file, embedding, score, version metadata or internal storage/download links.
- Metadata-only FE can show title/locators without a clickable file link.
  INDEXED/APPROVED is not a permission to download the document.

### Four separate trust boundaries

1. Public DTO: strict schema and public-field allowlist implemented in Task 191.
2. Internal provenance: document identity/content version/index version,
   retrieved chunk identities and eligibility at use; requirement only.
3. Runtime evidence registry: citations must map to current-turn eligible,
   actually retrieved evidence; not implemented by these schemas.
4. Semantic grounding: each claim must be supported by its mapped evidence;
   citation ID existence, metadata syntax and Zod do not prove this.

One citation may map internally to several chunks of the same source; one part
may reference multiple citations and a citation may support several parts.
Historical metadata remains associated with the original version, not silently
replaced by a reindexed version. Old answers may remain visible after source
disable, but old chunks cannot become evidence for a new turn. Snapshot metadata
does not prove current availability or grant file access.

## Authorization, Guest identity and context isolation (runtime invariants)

- Guest/Traveler/Admin may use public Q&A; anonymous identity is server-issued,
  not a body/localStorage reference. Anonymous accounts are not assumed to
  exist in Better Auth. Bootstrap/revocation/session fixation protections
  require a separate implementation task.
- Conversation ownership and current permissions are checked every turn,
  history read/delete and idempotent replay, before history/provider use.
  Missing and non-owned conversations use the same NOT_FOUND response.
- Login starts the user identity boundary without migrating Guest history.
  Logout clears/cancels authenticated UI state and isolates it from new Guest
  state. Guest cannot read Trip-private history; Admin does not inherit Traveler.
- Conversation owns immutable context; a deliberate context change starts a
  new conversation. Merely viewing other content does not change AI context.
- Future Destination context must resolve currently public content server-side;
  future Trip context requires Traveler and persisted ownership every turn.
- Authorized completed history may resolve pronouns/intent, never supply
  factual evidence. Ambiguous follow-up requires clarification, not guessing.
- Each factual turn retrieves and grounds against currently eligible INDEXED,
  non-DISABLED sources. Old assistant messages/metadata/snapshots confer no rights.
- Old responses stay with their original conversation. FE uses identity/context
  generation and request correlation to avoid updating a new conversation.

## Errors / confirmed writes / recovery

Active failed envelope follows shared conventions:
`{ success: false, operationStatus: "FAILED", error: { code, message, details? } }`.
UNKNOWN requires operationStatus=UNKNOWN, code=OPERATION_STATUS_UNKNOWN and
retryWithSameKey=true; it must not carry a factual answer. Runtime sanitizes
error details; the shared extension point is not a permission to leak internals.

| Code | HTTP | Meaning |
| --- | --- | --- |
| INVALID_REQUEST | 400 | Invalid schema/JSON, including inactive context. |
| PAYLOAD_TOO_LARGE | 413 | Raw body exceeds 16 KiB. |
| UNSUPPORTED_MEDIA_TYPE | 415 | Not supported JSON content type. |
| UNAUTHENTICATED / FORBIDDEN | 401 / 403 | Authentication/permission failure. |
| NOT_FOUND / CONTEXT_UNAVAILABLE | 404 | Conversation inaccessible, or context unavailable. |
| CONVERSATION_STALE / CONVERSATION_BUSY | 409 | Completed head mismatch / active turn conflict. |
| IDEMPOTENCY_KEY_REQUIRED / IDEMPOTENCY_KEY_INVALID | 400 | Missing/invalid mandatory key. |
| IDEMPOTENCY_KEY_REUSED | 409 | Same identity/key with different payload. |
| RATE_LIMITED | 429 | Runtime public AI abuse/cost limit. |
| AI_UNAVAILABLE | 503 | Provider unavailable, not evidence insufficiency. |
| AI_INVALID_RESPONSE | 502 | Malformed output or unsupported claims after permitted recovery. |
| INTERNAL_SERVER_ERROR | 500 | Retrieval DB/infrastructure or other internal failure. |
| OPERATION_STATUS_UNKNOWN | 503 | Persistence completion cannot be determined. |

- HTTP 200 completed outcomes mean processing and recording succeeded, not
  necessarily full question coverage. Insufficient source is never a 5xx error.
- Keep malformed model output, unsupported generated claims, insufficient
  evidence and retrieval infrastructure failure distinct internally. First two
  may share AI_INVALID_RESPONSE publicly but must not be relabeled insufficient.
- Return PARTIAL only for supported portions; no filling gaps from memory.
- Scope idempotency to current principal/operation/key with canonical validated
  payload hash. Same key/payload identifies the same turn, including first turn.
- Authorize before replay. Resolve existing attempt before stale-head checks;
  do not reject a valid old replay solely because the head advanced.
- Runtime reserves a turn in a short transaction, calls AI outside any DB
  transaction, then atomically confirms completed turn/result. Existing shared
  helper is not a long-running turn orchestrator and must not wrap OpenAI.
- No completed SUCCESS before DB confirmation. On uncertain commit or lost
  response, retry identical payload/key. Confirmed DB failure is not success.
- Serialize distinct turns per conversation; stale/busy requests must not be
  silently queued or rebased. A null parent still needs a server head check.
- Idempotency prevents duplicate committed turns/messages, not exactly-once
  provider billing. Leases/fencing/recovery and status reads are future work.
- Cache-Control: no-store at runtime. Do not freeze top-k, sufficiency threshold,
  lease duration, timeout, retries or rate/cost limits before implementation and
  evaluation. Scalar/body limits above are the approved contract limits.

## Dependencies / proposed additional backlog (no IDs created)

1. Conversation persistence, authorized history read/delete.
2. Anonymous Guest identity/bootstrap and login/logout isolation.
3. Turn lifecycle, head concurrency, idempotency/recovery.
4. Multi-turn authorization/security/recovery tests.
5. Retention cleanup including cached response content and deletion races.

Task 191 defines the boundary, not these runtime tasks. Do not silently add all
multi-turn effort to Task 194 without backlog/effort review.
US-17–20 provide approved/indexed source records, chunks and disable behavior.
Task 192 owns retrieval; 193 question interpretation/prompt generation; 194
orchestration; 195–196 FE conversation and citation rendering; 197 tests/evaluation.
US-22 adds Destination context; US-23 (203/206) owns sufficiency and unsupported
claim policies. Runtime integration needs conversation and RAG dependencies.
They can develop against injected history/evidence fixtures in parallel.
EN-02 is not required for contract tests, but representative quality evaluation
needs the real dataset. No EN-02 import or quality claim is made here.

## Task 191 acceptance criteria / evidence

- [x] Pure strict first/follow-up schema, inferred types and normalization.
- [x] GENERAL only; IDs are references; partial identity combinations rejected.
- [x] Four strict completed outcome branches, public citation and locator DTOs.
- [x] Deterministic dangling/duplicate/unreferenced citation checks.
- [x] Shared-compatible SUCCESS/FAILED/UNKNOWN; no active pending/202 success.
- [x] Safe constant insufficient message; bounded clarification syntax.
- [x] HTTP parsing, identity, provenance authenticity and semantic checks explicitly
  left to runtime; tests do not claim those features are implemented.
- [x] Multi-turn, source privacy, retention/deletion and backlog gaps documented.
- [ ] Owner reviews the Task 191 code/test/documentation result.

Files: `apps/web/src/modules/ai/qa-contract.ts`,
`apps/web/src/modules/ai/qa-contract.vitest.test.ts`, this story and ai-progress.
Validation results are recorded below after execution and in ai-progress.
Migration/environment impact: NONE. UI/Figma: N/A for this pure contract task.
No deployment/browser/provider/DB smoke is applicable or claimed.

## Validation and handoff

- Focused contract fixtures: PASS, 99/99 with the existing Vitest configuration.
- Root `npm run test`: PASS, including 117/117 Vitest tests and the existing
  legacy regression suites; no live provider/database/network fixtures.
- Root `npm run check-types`: PASS, all four Turbo tasks.
- Root `npm run build`: PASS, Next compilation, TypeScript and 21/21 static pages.
- Final `git diff --check` and untracked-file whitespace review: PASS.
- Only the contract, its tests, this story and `docs/ai-progress.md` changed.
- No runtime route, persistence, dependency, configuration, schema/migration,
  OpenAI call, Neon write, commit or push. Owner review remains required.
Stop after Task 191; Task 192 and all runtime work require their own instruction.

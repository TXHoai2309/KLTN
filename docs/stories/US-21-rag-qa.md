# US-21 — Hỏi đáp RAG có nguồn và hội thoại nhiều lượt

## Status

IN PROGRESS — Tasks 192/193/194/197 integrated in an offline feature worktree;
owner review and runtime acceptance pending. Production Q&A remains unavailable.
The dated batch handoff below supersedes earlier statements that no endpoint,
conversation persistence or RAG runtime exists. Prior sections preserve historical
Task 191/195/196 boundaries and evidence; they do not describe current delivery.
Do not mark the whole US-21 ACCEPTED or DONE from offline evidence.

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

## Task 195 — shared Assistant frontend (2026-10-08)

### Authorization / design baseline

Owner Tô Xuân Hoài approved implementation after two design-review rounds.
Branch `TXH`, reviewed HEAD `1770a1a12781e06dbc813a15ea004af15ff12226` and
origin/TXH matched; worktree was clean before implementation.
Figma file `oomNsNYfrcjnq2FQnYLOKN`: desktop MH-05 `6:169`, mobile MH-05
`111:69`, required AI states `111:208`, verified through the browser during review.
Layout follows desktop chat-left/context-and-principles-right and mobile one
column, message bubbles and composer below. Approved deviations: GENERAL only,
no destination selector, minimal wrapping Header instead of new bottom navigation,
unavailable production state, explicit retry/abandon states and citation slot.
No pixel-perfect or full Figma prototype acceptance is claimed.

### Implemented frontend / shared core

- `/assistant` server page supplies no transport: displays **Trợ lý AI chưa khả
  dụng**, disables question/send/new-conversation controls, and never calls a
  missing Q&A API or falls back to mock. Header adds **Trợ lý AI** without removing
  existing entries or changing auth/theme. Mobile navigation may wrap.
- `components/assistant/assistant-controller.ts` is the single surface-independent
  in-memory controller and transport contract. `assistant-chat.tsx` provides the
  reusable chat core, turn/answer presentation and separate page shell. A future
  popup can use the same core; no popup or global chat provider is introduced.
- First-turn/follow-up payloads use unchanged Task 191 schemas, NFC/trim and 2000
  UTF-16 units. Request bodies contain no client history/evidence/identity.
- Each new intent gets one key and an immutable serialized body. Single-flight
  guards reject double submission. Pending user messages are local, explicitly
  unconfirmed and separate from completed turns.
- The controller validates raw transport responses with `qaResponseSchema` before
  rendering and checks HTTP success, conversation correlation, generation and
  identity. Completed results reconcile only the unresolved intent/key; an already
  confirmed conversationId/turnId cannot acknowledge a new intent, even when its
  question text is identical. Returned turnId must differ from the requested parent,
  and the requested parent must still match the local confirmed head.
  All four completed outcomes advance the head. The displayed user question is
  the acknowledged request snapshot, not data loaded from a history endpoint.
- Partial displays answer parts and unanswered aspects; insufficient displays
  the server-controlled message; clarification uses its returned turnId as the
  next parent. Factual parts retain citationIds; React escapes text, no raw HTML.
- FAILED stays outside completed history with a local edit action. UNKNOWN,
  network ambiguity and malformed response retain the original body/key and do
  not advance the head. A malformed response is a technical/protocol problem,
  not proof that persistence failed. Retry does not use an edited draft.
- Owner's final decision supersedes Round 2's proposed reset lock: UNKNOWN or
  malformed response may be abandoned through an accessible confirmation dialog.
  It explicitly states server cancellation/deletion is not implied and recovery
  can be lost. Abandon invalidates generation and aborts client waiting; late
  responses cannot enter the new chat. New/reset is disabled while sending;
  logout/navigation are not globally blocked.
- No localStorage/sessionStorage or persisted client history. `identity` is an
  internal correlation boundary, not anonymous bootstrap or server authorization.
  Changing identity clears local state and prevents old-attempt replay; runtime
  integration must supply a trusted identity boundary. Transport changes require
  remounting the local chat session. Refresh loses in-memory state.
- Composer supports Enter/Shift+Enter, native IME composition and keyCode 229,
  labels/live status, focus after reset and keyboard-accessible confirmation.
  Transcript auto-scrolls only near its end; otherwise offers a new-message action.
  Scoped styles support light/dark and mobile dynamic viewport dimensions.

### Citation / runtime boundary

`CitationSlot` receives the current part, its citationIds, the turn citations and
turn identity. Task 195 neither flattens parts nor implements source resolution,
metadata/URL interactions or downloads. The default slot says source information
is not integrated. Task 196 must complete citation display before public factual
Q&A acceptance. No real factual answers are exposed on production here.

Task 194 can inject a real transport returning raw response/status or network
ambiguity into the same controller. This task does not implement that adapter,
endpoint, retrieval or provider integration. Conversation persistence, Guest
bootstrap, history/read/delete, stale-head recovery and retention remain runtime
dependencies. US-22 adds destination context/popups through an approved contract
extension; Culture popup is future work. US-23 owns sufficiency/unsupported-claim
policy; frontend does not decide semantic grounding.

### Isolated interactive local demo

Run from repository root:

```powershell
node apps/web/scripts/assistant-demo.mjs
```

Open `http://127.0.0.1:3002`. The runner binds loopback only, bundles in memory
using already-installed esbuild from the tsx toolchain, and serves HTML/JS/CSS.
It rejects NODE_ENV=production. No dependency, manifest, production config or
Next app route is added for the demo. Restart the runner after source edits.

`development/assistant-demo.tsx` imports the shared core and a deterministic fake
transport. Select ANSWERED/PARTIAL/INSUFFICIENT_SOURCE/CLARIFICATION_REQUIRED,
FAILED, UNKNOWN, NETWORK or MALFORMED, with 600 ms or 3 s delay. UNKNOWN/network/
malformed simulate a saved result whose identical-key retry replays completion.
This is a simulation, not DB/provider behavior. Every view is marked **DEMO /
DỮ LIỆU MÔ PHỎNG**; texts and source aliases are synthetic, source URL is null,
and no travel fact or citation is presented as verified evidence.

Production isolation evidence: deterministic esbuild dependency-graph test of
the real page has no development/test inputs or fixture marker; the real Next
production build's JS/HTML/JSON under `.next/static` and `.next/server` was scanned
for demo entry, fake transport, fixture marker and source alias with no matches.
The production build route list contains `/assistant` and no demo/Q&A endpoint.
Browser smoke of the built production page confirms unavailable and disabled send.

### Task 195 validation / evidence limits

- Focused `assistant-controller.vitest.test.ts`: PASS 32/32, including request/
  outcomes, single-flight, retry exact snapshot, edited draft, replay deduplication,
  malformed responses, identity/generation isolation, confirmation gate, keyboard
  policy, escaped rendering, preserved citation association and production graph.
- Root `npm run test`: PASS, 149/149 Vitest and existing legacy regression suites.
- Root `npm run check-types`: PASS, all four tasks.
- Root `npm run build`: PASS, compile/TypeScript and 22/22 static pages.
- Browser: actual demo first/follow-up, pending, four outcomes, FAILED, UNKNOWN
  retry with edited draft, malformed/retry, confirmation cancel/accept, focus reset,
  Shift+Enter and rapid Enter checked. Long 2000-unit question wraps; reading old
  messages preserves scroll with a new-message button. Demo and built production
  page checked at 360/390/768/1440 px with no horizontal overflow; production
  Header links/active state and disabled composer verified. Demo light/dark checked.
- Composer remained visible after focus at a reduced 360x450 browser viewport;
  this simulates reduced height, **not a real mobile keyboard test**. Physical
  iOS/Android keyboard, native IME interaction, screen-reader audio, long-answer
  browser fixture, other browsers and full Sprint 2 visual regression are not
  claimed PASS. Keyboard/IME policies also have deterministic coverage.
- Final tracked/untracked whitespace and scope review PASS. Task 191 contract,
  shared helpers, production config, dependency manifests, schema/migrations,
  Destination/Culture detail pages and environment files remain unchanged.
- No OpenAI call, Neon write, API, persistence, Guest bootstrap, popup,
  commit/push/merge. Owner review remains required; stop after Task 195.

### Task 195 owner review fix 1 (2026-10-08)

- Reviewed baseline: `a142de4170533df21668b42a57d258e31ac83f64`, branch TXH,
  clean before this fix. The prior permissive deduplication test was incorrect:
  identical question text does not prove two requests represent the same intent.
- Confirmed turn reuse or requested-parent conflict now leaves the pending attempt
  in malformed/uncertain state, preserves payload/key and head, and adds no turn.
  Same-key retries can accept a committed result not yet confirmed locally; after
  confirmation no pending retry remains. Single-flight is unchanged.
- Each AssistantChat derives composer/help/dialog IDs from React `useId`, keeping
  label and ARIA references within its instance without random SSR/client IDs.
- Focused tests PASS 35/35; regression PASS (152/152 Vitest plus legacy suites);
  typecheck PASS (four tasks); build PASS (22/22 static pages). Multiple-instance
  SSR regression checks unique IDs, local references and stable server output.
  Browser hydration was not separately exercised in this fix.
- No Task 191 contract, transport/demo isolation, navigation/CSS, API, DB or
  migration changes. No commit/push; wait for owner review, no Task 196.

### Task 195 visual refinement (2026-10-08)

- Owner supplied the cream/forest-green Assistant mockup as this refinement's
  visual baseline. TXH HEAD `904f32dd2e35936cc2256b9163fa0e96c32724f6`, clean
  before edits. This does not change product/runtime requirements.
- Centered 1320px container, 70/30 desktop columns, 22px gap, serif headings,
  thin borders and subtle shadows. Following owner feedback about broken Vietnamese
  diacritics, headings use the existing Be Vietnam Pro family (Arial in isolated
  demo) with normal letter spacing instead of system serif. Empty state is centered with dedicated inline
  SVG mountain line art; lucide icons reuse the installed dependency. Sidebar
  retains read-only GENERAL and source/insufficiency principles. No travel facts
  or citation interactions added.
- Composer send button sits beside the textarea; helper/counter remain below.
  Transcript height accounts for page chrome, with independent message scroll;
  mobile uses one main column and ordinary page scroll. Dark colors and focus
  rings preserved. Controller, contract, useId generation, retry/identity/head
  logic and demo transport are unchanged.
- Development toolbar CSS moved from runner HTML to a dedicated development
  stylesheet imported only by demo. Runner still serves its in-memory bundle on
  loopback and rejects production. Production has unavailable/disabled controls
  and no demo notice/toolbar/fallback.
- Focused tests PASS 36/36; root regression PASS (153/153 Vitest plus legacy);
  typecheck PASS (four tasks); production build PASS (22/22 static pages).
  Import-graph test and actual production JS/HTML/JSON scan exclude demo/fake
  transport/fixture markers and toolbar. Initial cold import-graph run exceeded
  5s after lucide inclusion; its timeout is now 15s, assertions unchanged.
- Browser checks: demo/production at 1440px and 360/390/768px have no horizontal
  overflow; desktop 1440x900 composer is fully visible. Light/dark, empty/demo
  sending/completed conversation, reset, mobile input focus and production theme
  interaction inspected. Production console inspection had no error/warn entries.
  No complete hydration, screen-reader, physical mobile keyboard, native IME or
  pixel-perfect acceptance claim. SVG is intentionally simpler than the mockup.
- Screenshots saved outside Git under the task visualization directory
  `C:/Users/User/.codex/visualizations/2026/10/07/01a11545-f06e-70a3-af2e-b94559e851dc/task195-refinement/`:
  desktop-light/dark, desktop-conversation-dark, conversation-360/390/768,
  mobile-empty-light/dark, production-desktop/dark and production-360/390/768
  (all .jpg). No provider/database write, dependency/config/navigation change,
  commit/push or Task 196 work. Wait for owner review.

### Task 196 citation presentation (2026-10-08)

- Owner approved design rounds 1/2 and Task195 visual refinement. Phase A
  preserved exactly nine approved visual files in local commit
  `f2731307fd46b59224ed6bc3978fadbfbcbcf7c3` after root tests (153 Vitest
  plus legacy), typecheck, cached build and diff/scope checks. No push/merge.
- Shared default citation renderer keeps answerParts and the custom CitationSlot
  API. Native details/summary chips open independent metadata; accessible names
  contain number/title. Full title and supplied page/section locators are escaped
  text. Empty locators and unavailable links are explicit; no preview/download.
- Current-turn index numbers first references across parts, reuses citation IDs,
  never merges sourceId aliases, and fails closed for inconsistent references.
  URL syntax is defensively checked with qaSourceUrlSchema; only valid provided
  HTTP(S) links open a new tab with noopener/noreferrer. Backend authorization,
  evidence eligibility, provenance and semantic grounding remain runtime work.
- Citation CSS is separately scoped, imported through assistant.css rather than
  the TSX renderer (avoids the existing Vitest PostCSS-loader incompatibility).
  Future hosts can load this stylesheet without an assistant-page ancestor.
  Approved Task195 fonts/layout/artwork/composer remain intact.
- View-layer scroll guard suppresses following the transcript tail while a source
  is open/focused. Native toggle capture stops following; new content offers the
  existing new-message button. Controller, reconciliation, contract and retry
  payload/key semantics remain unchanged. Browser-native scroll anchoring may
  adjust scrollTop on collapse; no explicit scroll-to-end is performed.
- Development-only ONE/MULTI/LONG/MANY fixtures cover shared source aliases,
  reused references, locators, null/HTTPS URLs, 300-unit titles and 50 sources.
  Existing outcome controls remain; renderer sandbox widths 320/360/420 test
  future host sizes without building popups. Invalid URL sandbox input bypasses
  transport deliberately for sink-defense checks, clearly marked as simulation,
  not a confirmed server turn. UNKNOWN retry preserves its cached fixture result.
- Validation: citation tests 22/22; Task195 regression 36/36; root tests 175/175
  Vitest plus legacy suites; root typecheck four tasks; fresh production build
  22/22 pages. Import-graph test and real production JS/HTML/JSON scan exclude
  demo transport/fixture/sandbox markers. Built /assistant browser shows
  unavailable and disabled composer with no demo controls.
- Browser: desktop 1440 and mobile 360/390/768, independent 320/420 containers,
  light/dark, long titles and 50-source wrapping inspected without horizontal
  overflow. Enter/Space toggle, Tab-to-link and independent repeated disclosures
  checked. New completed response while reading an open source preserved
  scrollTop=61 and showed the new-message button. Screenshots outside Git in
  the task visualization directory `task196`: desktop-1440-light.jpg,
  chat-390-dark.jpg, mobile-390-light.jpg, popup-320-dark.jpg. These are browser
  smoke checks, not screen-reader audio, physical mobile or full hydration proof.
- US-21 remains IN PROGRESS. Backend RAG/API is not operational; demo is mock.
  History, Destination/Culture popups, new contexts and document downloads are
  not implemented. No Task192/193/194/197, provider call, DB write, schema/env or
  dependency change. Task196 is uncommitted; owner review required.

### Owner-authorized real-app development demo integration (2026-10-08)

- Baseline TXH/local/origin `09d85286d46cd56f4c3b1de159e90bd9f847e61f`, clean.
  Owner authorized local mock interaction on the real /assistant route; this is
  not Task194 and does not make the production AI service available.
- /assistant uses a literal NODE_ENV=development server-page branch to import
  the development-only client host. The host owns one DemoAssistantTransport
  per mount, reusing existing fixtures, AssistantChat/controller, contract and
  citation renderer. Production returns the existing unavailable AssistantChat.
  No query parameter, browser flag or production mock fallback is added.
- Run the normal Next dev app (`npm run dev:web`, port 3001), open /assistant
  and type/send directly. MULTI citations are the default. Compact collapsed
  controls marked DEMO / DỮ LIỆU MÔ PHỎNG select outcomes, sources and delay.
  Existing standalone port 3002 runner remains optional; it is no longer needed
  for ordinary local UI testing. Shared page layout/Header/theme stay intact.
- The future Task194 client host can inject a real AssistantTransport into the
  same AssistantChat without rewriting controller/citation/layout. It must not
  use the development host or enable fake answers in production.
- Validation: 10 focused integration tests, Task195 36, Task196 22 (68 focused
  total); root 185/185 Vitest plus legacy suites; typecheck four tasks; fresh
  production build 22/22 pages. Production graph checks now explicitly compile
  NODE_ENV=production and retain their no-development-input assertions. Actual
  Next .next/static/.next/server JS/HTML/JSON scan has no development host,
  demo transport, fixture or control markers.
- Browser: actual localhost:3001/assistant accepts input, enables Send for a
  valid draft, Enter submits, Shift+Enter adds a newline, citations disclose and
  link focus works. Follow-up creates a second turn; reset empties the local
  session; UNKNOWN/retry completes. Light/dark and 360/390/768/1440 checks show
  no horizontal overflow (including expanded controls). Built production on
  port 3003 remains unavailable/disabled with no demo DOM or citations.
- Screenshots outside Git: assistant-dev-integration/local-desktop-light.jpg,
  local-desktop-dark.jpg, local-390-light.jpg, production-unavailable.jpg.
  Physical mobile, screen-reader audio and blanket hydration/pixel-perfect
  acceptance are not claimed. Refresh/remount loses the in-memory demo session.
- No OpenAI, Neon write, API, persistence, migration, context extension, popup,
  dependency/env/config change or Task192/193/194. US-21 IN PROGRESS. No commit,
  push or merge; stop for owner review.

## 2026-10-11 — Owner-authorized accelerated Task 192/193/194/197 batch

This batch explicitly includes the previously deferred conversation/session,
retention and recovery dependencies. It does not change Task191's public contract
or enable a production service. No commit, push, merge, deployment, Neon write,
live OpenAI/Blob request or Worker stash operation occurred.

```text
BASELINE=8263c94e13cda29cde9f9556d186acc79e75ad44 (origin/TXH)
FEATURE_BRANCH=feat/us21-rag-qa-batch
TASK192_STATUS=PARTIAL
TASK193_STATUS=PARTIAL
TASK194_STATUS=PARTIAL
TASK197_STATUS=PARTIAL
CONTRACT_191_PRESERVED=YES; unchanged source;99 contract tests
FRONTEND_195_196_PRESERVED=YES; shared controller/chat/citations/layout unchanged
GUEST_IDENTITY=server-issued random256-bit HttpOnly cookie; SHA256 digest in PostgreSQL
CONVERSATION_PERSISTENCE=PostgreSQL durable turns, owner-scoped history, atomic completion
RETENTION_CLEANUP=implemented/access+operator; deployed schedule BLOCKED pending decision
IDEMPOTENCY=principal+key+canonical payload; atomic stored response; authorized replay
PGVECTOR_ELIGIBILITY=INDEXED+published exact READY generation+compatible1536 vectors
EVIDENCE_GROUNDING=conservative exact complete sentence gate; semantic evaluation pending
CITATION_SECURITY=backend registry, public aliases/metadata, null URL, private-content rejection
FILES_CHANGED=31 scoped paths; exact manifest below
MIGRATIONS_CREATED=20261011120000_add_qa_guest_identity;20261011121000_add_qa_conversations
POSTGRES_INTEGRATION=37/37 real PostgreSQL16.15/pgvector0.8.6 cases;0 skipped;final exit0
FULL_TESTS=459/459 Vitest;0 skipped;26 suites;final child/outer exit0;legacy326 PASS
TYPECHECK=PASS; root four tasks
BUILD=PASS; fresh Next16.3.8 build;28/28 static generation
BROWSER_SMOKE=PASS production unavailable/disabled/no demo only; live chat NOT RUN
BLOCKERS=cleanup deployment schedule, Guest bootstrap abuse controls, corpus/semantic evaluation, owner runtime acceptance
READY_FOR_OWNER_RUNTIME_ACCEPTANCE=NO for Preview/Production; YES for offline code review
```

All four tasks remain PARTIAL because offline implementation and assertions do
not establish runtime/product acceptance. Task192's thresholds need representative
corpus calibration; Task193 needs question relevance/coverage and injection
quality evaluation; Task194 needs deployed retention operations and Guest bootstrap
abuse controls; Task197's live browser/provider/corpus acceptance remains unrun.
No extra backlog IDs or accepted architecture decisions are invented.

### Implemented vertical slice

- Thin POST `/api/ai/ask` preserves the strict GENERAL first/follow-up contract,
  mandatory key, NFC/trim2000 UTF16 units and streamed16KiB body limit. Media type,
  malformed UTF8/JSON, actual bytes, same-origin browser writes and no-store are
  enforced before service use. No client history/role/source override is accepted.
- POST `/api/ai/session` explicitly bootstraps Guest identity before first ask.
  Random token is never stored raw; fixed7-day identity expires/revokes in DB.
  Cookie is HttpOnly/SameSiteStrict/path `/api/ai`, Secure outside development.
  Account principal wins using uncached Better Auth session and current persisted
  Traveler/Admin role. Bootstrap clears the Guest browser cookie after login;
  no Guest history migrates. DELETE session revokes Guest identity and scrubs its
  conversations atomically. Client identity is correlation only, never auth.
- Owner-scoped GET/DELETE `/api/ai/conversations/:id` reads the latest12 completed
  parent-chain turns or explicitly deletes/scrubs history. Missing/non-owned share
  NOT_FOUND. The shared chat's new-conversation action retains its existing local
  reset semantics; it does not silently claim server deletion. Dedicated history
  browsing/deletion UI is not added in this layout-preserving batch.
- Reservations and completions are separate short transactions; no AI call runs
  inside them. Principal advisory locking, exact head checks, one PROCESSING turn
  per conversation, lease/fence and bounded same-key recovery serialize writes.
  Actual ownership/current principal authorization precedes history and replay.
  Replay resolves before stale head and returns original completed response.
  A lost reservation/completion acknowledgement is UNKNOWN, recoverable with the
  same payload/key. Read-only failure is INTERNAL_SERVER_ERROR; provider failure
  is AI_UNAVAILABLE; malformed/unsupported output is AI_INVALID_RESPONSE.
- Retrieval reuses the US19 OpenAI embedding adapter/model1536 and tokenizer;
  questions from authorized history help retrieval intent, old answers never
  become evidence. Parameterized cosine SQL joins exact publication, READY and
  INDEXED plus embedding compatibility; deterministic distance/document/generation/
  chunk-order tie-break. Context budget verifies actual stored token counts.
  Rechecks occur before/after generation and inside atomic completion under the
  same document locks as Disable/publication. Disable wins before completion
  commit => no completed answer; old accepted answers may still be read.
- Generator treats evidence/history/question as untrusted data and requests strict
  JSON. Backend owns citation IDs/metadata and safe fixed clarification/partial
  notices. No evidence skips answer generation. Every factual part must match a
  complete source sentence for each linked current citation. Instruction detection
  adds defense in depth; no fallback from free model knowledge. Public IDs are
  hash aliases, PDF physical-page/DOCX heading projection is allowlisted, URLs are
  null because no separate public URL permission record exists. Prose and metadata
  containing private storage/admin links or known provenance IDs are rejected too.
  All URLs in generated prose/metadata are conservatively rejected under this
  metadata-only policy. No originals, chunks, scores, embeddings or provenance DTO.
- Exact extraction does NOT prove question relevance, complete coverage, source
  correctness, implied meaning or universal injection resistance. ANSWERED versus
  PARTIAL is provisional model classification within this gate. Real dataset and
  US23/owner policy evaluation are required; the three old US19 documents are test
  data, not authoritative sources. No quality percentage is claimed.
- `AssistantHttpTransport` sends the exact immutable body/key, validates through
  the existing controller and has no demo fallback. A separate runtime host
  bootstraps identity and remounts on account/Guest/pending auth boundaries. The
  production page and endpoint remain hard unavailable even if the flag is true.
  Local development can opt in with `QA_RUNTIME_ENABLED=true` only after approved
  environment setup; current ignored local config is deliberately offline/dummy.
  Existing explicitly marked development demo remains the default development view.

### Provisional bounded settings and retention operations

Retrieval defaults topK6 (max20), min cosine score0.25 (0–1),6000 evidence tokens
(max12000); these are heuristics, not sufficiency proof. Read transactions have
5000ms statement timeout, maxWait5000ms and7000ms transaction timeout. Generation
is provisional `gpt-4o-mini`,25000ms,12000 input tokens,2000 output tokens,64KiB
response and20 evidence items; no automatic generation retries. Embedding retains
US19's30000ms timeout. HTTP body reading is capped at5000ms. Reservation lease90s
(config10–300s), transactions10s, max3 same-key recovery attempts(config1–5).
New reservations are limited per principal to10/10min and100/day(config1–1000);
completed replay is not billed as another turn. Guest token creation still needs
an approved deployment/IP/global admission policy to prevent identity rotation
bypassing per-principal budgets. This is why production is hard disabled.

Conversation activity means confirmed completed turn only: rolling7days Guest or
30days account; reads/replays/invalid requests never extend expiry. Failed question
content expires within24h of terminal failure, bounded by conversation expiry;
abandoned processing is fenced/scrubbed after lease expiry+24h. Deletion/expiry
scrubs question/response/provenance/error content and invalidates active workers.
Non-content principal/key/hash/tombstone markers remain indefinitely to prevent
same-key resurrection; no answer is stored in shared indefinite idempotency rows.
`createQaConversationStore(db).cleanup()` is the operator entry point, with access
cleanup also committed independently so NOT_FOUND cannot roll back scrubbing.
An approved periodic deployment schedule/monitor is still absent: offline tests
verify cleanup logic, not a deployed maximum retention SLA. Guest session expiry
can make a conversation inaccessible before its rolling conversation deadline.

### Migration and validation evidence

Two additive migrations create Guest identities/conversations/turns, state/result/
privacy checks, a composite tenant FK, principal-key uniqueness and a partial
one-processing-turn index. Head/parent relationships are service-managed under
locks; do not use db:push to replace migration-only constraints. The disposable
runner installs actual required auth/RAG/QA SQL, exercises ownership/retention,
rollback after result write, duplicate replay, fences and publication integrity.
No live migration state is claimed or inspected by connecting to Neon. Rollback
before enablement may remove QA turns then conversations then Guest identities
only if empty/disposable; once real history exists, removal loses user data and
requires an explicit recovery/retention plan. Existing RAG tables are untouched.

Final command `node apps/web/scripts/test-qa-postgres.mjs --full`:459/459,zero
skipped,26 suites,37 real PostgreSQL cases (US21:21;US19:16),child/outer exit0;
owned container and anonymous database volume removed. Legacy326 tests passed via
root npm test. Ordinary root run previously410 PASS with33 intentional DB skips;
it is not evidence of PostgreSQL acceptance. Final full runner supplies all real
DB suites and includes99 Task191,36 Task195,22 Task196 and10 demo-isolation tests.
New unit suites:retrieval14,generation50,HTTP26,service14,transport4;new real DB21.
Root typecheck, Prisma validate/generate, fresh build28/28, production graph and
actual JS/HTML/JSON demo-artifact scan PASS. Scoped secret-pattern scan and tracked/
untracked whitespace checks PASS. No dependency/lockfile change.

Intermediate attempts are not PASS: container startup race corrected by checking
usable SQL, Prisma void-lock deserialization corrected with text cast, USER test
fixture creates both accounts before isolation assertions, privacy gate correctly
rejected a synthetic sentence quoting its DB ID (fixture now separates public
prose from provenance). Two intermediate runs exited with Windows native status
3221225477; one had a failed assertion, one459 passing assertions. Final isolated
run had459 assertions and exit0. Native shutdown intermittency is observed, root
cause unknown; no assertion/pool/cleanup was disabled to obtain the final pass.

Built production `/assistant` at localhost3013 was inspected with the browser:
composer and Send disabled, unavailable text, zero demo controls. Built POST ask
returned503 AI_UNAVAILABLE/no-store without an AI/DB business call. This is only
unavailable-state smoke, not a live Guest/login/answer/retention browser acceptance.

### Exact scoped file manifest
- `apps/web/.env.schema`
- `apps/web/scripts/test-qa-postgres.mjs`
- `apps/web/src/app/api/ai/ask/route.ts`
- `apps/web/src/app/api/ai/conversations/[id]/route.ts`
- `apps/web/src/app/api/ai/session/route.ts`
- `apps/web/src/app/assistant/page.tsx`
- `apps/web/src/components/assistant/assistant-http-transport.ts`
- `apps/web/src/components/assistant/assistant-http-transport.vitest.test.ts`
- `apps/web/src/components/assistant/assistant-runtime-chat.tsx`
- `apps/web/src/modules/ai/qa-conversation-store.ts`
- `apps/web/src/modules/ai/qa-generation.ts`
- `apps/web/src/modules/ai/qa-generation.vitest.test.ts`
- `apps/web/src/modules/ai/qa-http.ts`
- `apps/web/src/modules/ai/qa-http.vitest.test.ts`
- `apps/web/src/modules/ai/qa-principal.ts`
- `apps/web/src/modules/ai/qa-prompt.ts`
- `apps/web/src/modules/ai/qa-public-safety.ts`
- `apps/web/src/modules/ai/qa-retrieval.postgres.integration.vitest.test.ts`
- `apps/web/src/modules/ai/qa-retrieval.ts`
- `apps/web/src/modules/ai/qa-retrieval.vitest.test.ts`
- `apps/web/src/modules/ai/qa-runtime-contract.ts`
- `apps/web/src/modules/ai/qa-runtime.ts`
- `apps/web/src/modules/ai/qa-service.ts`
- `apps/web/src/modules/ai/qa-service.vitest.test.ts`
- `apps/web/src/modules/ai/qa-store.postgres.integration.vitest.test.ts`
- `docs/ai-progress.md`
- `docs/stories/US-21-rag-qa.md`
- `packages/db/prisma/migrations/20261011120000_add_qa_guest_identity/migration.sql`
- `packages/db/prisma/migrations/20261011121000_add_qa_conversations/migration.sql`
- `packages/db/prisma/schema/qa-conversation.prisma`
- `packages/db/prisma/schema/qa-guest.prisma`

## 2026-10-11 — Accelerated closure hardening and acceptance preparation

This entry is append-only for the closure session. Earlier batch results and
limitations above remain historical evidence. No task is promoted to DONE.

### Rapid review and prioritized findings

Confirmed feature branch `feat/us21-rag-qa-batch`, HEAD
`8263c94e13cda29cde9f9556d186acc79e75ad44`, initial 31 changed paths including
untracked files. Reviewed runtime, SQL/schema, tests, transport and documentation
across the three explicitly authorized parallel tracks. Main `D:/KLTN/KLTN`
remains clean on TXH at the same HEAD. Worker stash
`36584c230110a4aad7879f64ee587a4b0c5249bd` remains untouched.

- P0 fixed: bootstrap could create unlimited new Guest identities and principal
  rotation could evade principal-only ask limits. `qa-abuse.ts` now uses shared
  PostgreSQL counters, global locking, network HMAC, token reservations and leases;
  `qa-principal.ts` charges identity creation and attaches only server-derived
  network identity. Disposable tests prove cross-instance denial before providers.
- P0 fixed: `qa-conversation-store.ts` global identity deletion could race bootstrap
  and leave conversation content orphaned. Minimal identity/dedup markers now
  remain; expired Guest access scrubs before rejecting auth. Database time replaces
  application wall-clock expiry decisions, with explicit injected clocks in tests.
- P0 fixed: periodic cleanup had unbounded work. It now hides expired conversations
  and drains content with row/principal batches, a cooperative time budget and a
  residual-work EXISTS check. Single-principal multi-turn tests prove `hasMore`
  remains true until content drains. New terminal failures scrub content immediately.
- P1 fixed: `qa-prompt.ts` failed to detect the concrete "Disregard earlier rules"
  instruction variant. Three adjacent variants now fail before model transport.
  Detection remains heuristic, not a universal injection certificate.
- P1 fixed: `assistant-http-transport.ts` could wait indefinitely. A 70-second
  request/body deadline returns network ambiguity with immutable retry payload/key;
  caller abort is also bounded. `assistant-runtime-chat.tsx` unmounts readiness on
  auth boundary changes and bounds bootstrap to ten seconds, preventing stale
  Guest/User readiness reuse.
- Remaining P0 release gate: scheduler is NOT_CONFIGURED. Physical seven-/thirty-day
  conversation retention and legacy/abandoned-content deadlines require verified
  deployed invocation, capacity, alerts and recovery. Logical expiry alone is not
  physical deletion evidence. See `docs/implementation/qa-retention-runbook.md`.
- Remaining P1: exact sentence membership in `qa-generation.ts` proves retrieved
  text membership, not question relevance, coverage or source truth. Two explicit
  probes accept an irrelevant sentence or incomplete ANSWERED output. Real Hà Giang
  corpus evaluation is NOT_EVALUATED; no arbitrary quality threshold is imposed.
- Remaining P1 operational acceptance: owner must calibrate fixed-window limits,
  NAT/IPv6 grouping, trusted ingress, model/token-cost estimates, route/provider/DB
  latency and explicit-delete/revoke load. Deletion remains atomic and immediately
  scrubs all related content; its work scales with retained history.
- P2: minimal tombstone growth and cleanup query/index behavior need operational
  monitoring and a separately approved compaction policy. No private content is
  retained in those scrubbed markers. Premium UI static audit still exits2 with
  22 pre-existing findings (4 ownership,18 violations) in unchanged shared/demo/UI
  files; none targets the new transport/runtime host. No repository-wide UI audit
  PASS or unrelated Task195/196 redesign is claimed.

### Hardening evidence and deployment boundaries

Guest tokens are server-created random256-bit values; only SHA256 digests are
stored. Cookies remain HttpOnly,SameSite=Strict,Secure outside development and
scoped to `/api/ai`. Client ownerId/userId/history are rejected by unchanged strict
Task191 request schemas. Authorization and ownership run before provider admission.
HMAC secret must be stable and at least32 characters; Vercel forwarding is trusted
only with server-set platform context, while local development requires an explicit
server-configured shared identity. Generic client forwarding headers are ignored.

Provisional budgets: new bootstrap10/network/hour,500/global/day; asks20/network/
10minutes,100/network/day,500/global/day;8M reserved tokens/global/day;
23K/attempt covers configured embedding/generation ceilings conservatively;
concurrency8/global,2/network,1/principal. Completed replay costs no additional
provider admission; recovered same-key attempts charge again without refund.
Fixed-window boundary bursts and monetary/model-token calibration remain owner
release decisions. Missing trusted network config fails closed.

Retention/deletion/cleanup share principal locks with admission/completion. Response
JSON and provenance live only in turns, without a separate content-bearing shared
idempotency cache. Expired/deleted conversation replay and completion are rejected;
periodic physical scrubbing drains bounded batches. Explicit deletion/revocation
scrub content atomically. New terminal failure discards content immediately (within
the maximum24h); legacy failed rows and abandoned leases require scheduled cleanup.

The protected `/api/internal/qa-cleanup` route requires enable flag plus server-only
CRON_SECRET. Candidate every-five-minute cron is documentation only, not active
`vercel.json`. Runbook records verified plan limits, pricing, usage, lack of automatic
Cron retry, capacity/physical-SLA gates and manual catch-up. Production public Q&A
remains hard unavailable independent of local runtime opt-in. No deployed scheduler
or public activation is claimed.

`docs/implementation/US-21-grounding-evaluation.md` records the initial injection
finding, fix and repeatable26-case synthetic technical evaluation, plus two separate
semantic limitation probes. Provenance/rights/hash/reviewer manifest and proposed
claim support, coverage, citation, retrieval and outcome metrics are prepared for
owner-approved real corpus. Synthetic prose is never treated as official Hà Giang
source content.

### Final validation and failed-run history

- Focused US21 and Task191/195/196 regression:294/294 PASS,12 suites,zero skipped,
  exit0. Includes auth/Guest HTTP, transport timeout, outcomes,citations and demo/
  production graph checks. Individual track focused checks also passed.
- Full `node apps/web/scripts/test-qa-postgres.mjs --full`:492/492 PASS,30 suites,
  zero skipped/todo,Vitest child exit0,outer exit0. Actual PostgreSQL16.15/
  pgvector0.8.6 tests51 (US21:35;US19:16). Uniquely owned loopback disposable
  container and anonymous database volume cleanup PASS.
- Integrated vertical slice uses real server Guest bootstrap/ownership/durable
  abuse admission, actual pgvector, real HTTP transport/service/DTO and atomic
  database completion. Only embedding/generation transport is injected offline.
  First/follow-up,replay,same-key recovery,concurrency,DB rollback/lost acknowledgement,
  disable races and provider error classification pass. This is not deployed E2E.
- First closure full run:489/491 assertions passed,two failed Guest-expiry fixtures,
  exit1,cleanupPASS. Fixtures set expiry before createdAt and violated the actual
  CHECK constraint; fixed fixture createdAt without weakening schema.
- Second closure full run:492/492 assertions passed,zero skips,but native Windows
  threaded-worker exit3221225477; not accepted asPASS. Runner now explicitly uses
  forked worker processes on Windows and preserves mandatory exit-status checking.
  Final forked run above exited0. Underlying native-thread root cause is unproven.
- `npm run test:legacy`:all11 groups PASS,exit0; no legacy source changed.
- Root `npm run check-types`:4/4 tasks PASS. Prisma validate and generate PASS.
  Offline `prisma migrate diff --from-empty --to-schema prisma/schema --script`
  confirmed QA table/column/index/FK agreement; SQL-only CHECK constraints and
  one-processing-turn partial unique index are intentional extra DB protections.
  Actual three additive QA migrations installed successfully on disposable DB.
  No full migration-history/deployed drift or Neon migration application is claimed.
- Fresh root production build PASS,29/29 pages,exit0,with QA_RUNTIME_ENABLED=true.
  Actual built session/ask routes still503 FAILED/AI_UNAVAILABLE,no-store; cleanup
  route503 CLEANUP_DISABLED. Built `/assistant` unavailable; no demo controls or
  fake transport markers in static chunks. Temporary production server stopped.
- Development real-transport browser smoke at3015:composer/Send disabled,no demo
  controls when bootstrap DB is unavailable. Actual session503 UNKNOWN and ask401
  FAILED/UNAUTHENTICATED; no provider calls. Production DB adapter is Neon-specific,
  so successful disposable integration uses its test-only PrismaPg adapter. No
  architecture change or Neon access was used to fabricate Next.js browser success.
  Successful authenticated/Guest browser answers with real corpus remain NOT_RUN.
- Git tracked diff and all untracked whitespace checks PASS; changed-file secret
  pattern scan PASS. No credentials,live Neon writes,OpenAI/Blob calls,commit,push,
  merge,deploy or Worker stash operation. Demo source and public contract unchanged.

### Requested owner handoff fields

```text
TASK192_STATUS=PARTIAL; technical retrieval PASS, representative corpus acceptance pending
TASK193_STATUS=PARTIAL; bounded generation PASS, relevance/coverage quality unproven
TASK194_STATUS=PARTIAL; persistence/abuse/cleanup logic PASS, deployed retention/runtime pending
TASK197_STATUS=PARTIAL; offline integration/regression PASS, real-corpus/browser acceptance pending
ROOT_BASELINE=TXH;8263c94e13cda29cde9f9556d186acc79e75ad44;clean unchanged
FEATURE_BRANCH=feat/us21-rag-qa-batch;same HEAD;uncommitted
FILES_CHANGED=44;4 modified+40 untracked;initial31+13 new closure paths
NEW_MIGRATIONS=3 additive QA migrations;disposable only;none applied on Neon
GUEST_BOOTSTRAP_SECURITY=PASS_OFFLINE;deployment ingress acceptance pending
RATE_LIMIT_AND_COST_GUARD=PASS_OFFLINE;provisional policy/model-cost calibration pending
CONVERSATION_PERSISTENCE=PASS_POSTGRES
RETENTION_CLEANUP=PASS_LOGIC;physical retention SLA unverified
CLEANUP_SCHEDULER_STATUS=NOT_CONFIGURED;protected runner+candidate+runbook prepared
SOURCE_ELIGIBILITY=PASS_POSTGRES;exact publication and disable/completion races
SEMANTIC_GROUNDING=PARTIAL;exact membership only;relevance/coverage NOT_EVALUATED
CITATION_AUTHENTICITY=PASS_SYNTHETIC_AND_POSTGRES;real-corpus quality pending
REAL_CORPUS_EVALUATION=NOT_EVALUATED;verified provenance/rights corpus absent
API_INTEGRATION=PASS_DISPOSABLE_WITH_INJECTED_PROVIDERS;deployed acceptance pending
FRONTEND_REAL_TRANSPORT=IMPLEMENTED_DEVELOPMENT;failure smoke PASS;successful live answers NOT_RUN
FULL_TESTS=492/492 PASS;30 suites;zero skipped;exit0;focused294/294;legacy all groups PASS
POSTGRES_INTEGRATION=51/51 PASS;US21 35+US19 16;disposable cleanup PASS
TYPECHECK=PASS;4/4 root tasks
BUILD=PASS;fresh production29/29;exit0;production opt-in isolation PASS
REMAINING_P0=deployed scheduler/capacity/recovery and physical retention SLA release gate
REMAINING_P1=real-corpus relevance/coverage/injection evaluation;policy/cost/latency/delete-load calibration;manual runtime acceptance
READY_FOR_OWNER_ACCEPTANCE=NO_MVP_RUNTIME_SIGNOFF;YES_CODE_REVIEW
```

The closure adds these13 paths to the earlier31-path manifest; all44 paths are
included in the review and final secret/whitespace scan:

- `apps/web/src/modules/ai/qa-abuse.ts`
- `apps/web/src/modules/ai/qa-abuse.vitest.test.ts`
- `apps/web/src/modules/ai/qa-abuse.postgres.integration.vitest.test.ts`
- `apps/web/src/modules/ai/qa-cleanup.ts`
- `apps/web/src/modules/ai/qa-cleanup.vitest.test.ts`
- `apps/web/src/app/api/internal/qa-cleanup/route.ts`
- `apps/web/src/modules/ai/qa-evaluation.ts`
- `apps/web/src/modules/ai/qa-evaluation.vitest.test.ts`
- `packages/db/prisma/schema/qa-abuse.prisma`
- `packages/db/prisma/migrations/20261011122000_add_qa_abuse_guard/migration.sql`
- `docs/implementation/US-21-grounding-evaluation.md`
- `docs/implementation/qa-retention-runbook.md`
- `docs/implementation/qa-cleanup-cron.candidate.json`

## 2026-10-11 — Independent US-21 release-candidate gate review

Read-only review of the feature worktree confirmed branch
`feat/us21-rag-qa-batch`, HEAD `8263c94e13cda29cde9f9556d186acc79e75ad44`,
44 changed paths (4 modified, 40 untracked), and three additive migrations.
The TXH root checkout remains clean at the same HEAD. All 44 paths, migration
SQL/Prisma models, changed frontend files, and the cleanup/evaluation artifacts
were reviewed. No migration was applied and no live provider/database call was
made. The 492/492 Vitest and 51/51 disposable PostgreSQL results are prior-run
evidence; this review did not rerun them. No task status was changed.

### Independent findings

- **P0 release gate — physical retention is not operationally guaranteed.** The
  cleanup route is gated and the five-minute Vercel Cron is only a candidate.
  Logical expiry denies ordinary access, but scheduled tombstoning/content scrubbing
  is not configured. Vercel Cron is best-effort, can miss or duplicate deliveries,
  and runs only for Production deployments. A five-minute schedule needs Pro or
  Enterprise; Hobby is daily with up to 59 minutes of imprecision. The candidate
  represents 288 invocations/day (about 8,640 per 30 days) plus Function usage.
  Vercel's Pro platform fee is currently USD20/month with USD20 usage credit; actual
  function/database usage and team plan must be verified by the owner. Cron alone
  cannot guarantee a hard 24-hour physical-deletion SLA. No scheduler, plan or
  architecture change was selected here.
- **P1 — expiry clock can precede the principal lock.** In
  `qa-conversation-store.ts`, the transaction samples `CURRENT_TIMESTAMP` before
  `lockPrincipal` waits on its advisory lock, then passes that sample to
  `loadOwned`. PostgreSQL `CURRENT_TIMESTAMP` is fixed at transaction start. A
  transaction that starts just before expiry and waits for a lock can therefore
  pass the expiry check just after the boundary; a completion can renew expiry.
  The transaction is bounded to 10 seconds, but the exact expiry/replay guarantee
  is not strict under lock contention. Use post-lock `clock_timestamp()` or a
  conditional predicate based on `clock_timestamp()`, then add a deterministic
  lock-boundary regression before acceptance.
- **P1 — citation metadata needs a stronger public-path allowlist.** Retrieval
  copies `sourceTitle` and DOCX section titles into citations. The public safety
  denylist rejects known blob/admin/RAG patterns and HTTPS links, but does not
  reject `file://` or common POSIX absolute paths such as `/var/private/...` in
  title/section text. These fields are Admin/source-controlled and no separate
  public-source permission flag exists. Review real metadata and choose/implement
  a positive public citation policy before real public corpus acceptance. The
  ordinary Windows drive path check is escaped through JSON serialization and is
  not reported as a bypass.
- **P1 — explicit deletion has no same-key reconciliation path.** The conversation
  DELETE adapter does not require or persist an idempotency key. If the scrub
  commits but its response is lost, a retry sees the tombstoned conversation as
  `NOT_FOUND` instead of reconciling the original deletion result. Guest-session
  revocation has the analogous boundary: after a committed revoke, principal
  resolution rejects the still-present cookie before a retry can clear it. The
  data remains deleted, but the write result cannot be reliably reconciled. Resolve
  deletion/revocation retry semantics before runtime acceptance.
- **P1 — concurrent disable fences the response, not prior provider disclosure.**
  Retrieval rechecks eligibility before generation and completion locks/rechecks
  again, so a source disabled during generation cannot produce a completed answer.
  However, its evidence may already have been sent in the in-flight provider
  request. The current PostgreSQL race proves persistence/response rejection, not
  cancellation or non-disclosure to OpenAI after disable. Owner must confirm this
  request-start eligibility policy or approve a different externalization boundary.
- **P2 — deduplication metadata is retained after content scrubbing.** Cleanup
  nulls turn question/response/provenance and retains conversation/turn IDs,
  principal IDs, idempotency keys and request hashes as tombstones. This prevents
  replay resurrection and contains no answer text, but there is no expiry/compaction
  policy for those associations. Owner should approve the retained metadata window
  or define a safe compaction policy before long-running production use.
- **P2 — turn-head references rely on service invariants.** The migration has a
  composite turn-to-conversation/principal FK, but no FK for `headTurnId`,
  `activeTurnId` or `parentTurnId`; `loadHistory` anchors by `headTurnId` without
  asserting the head turn's conversation ID. Normal store writes validate these
  pointers under the principal lock, so no client-controlled bypass was found, but
  malformed internal writes are not rejected at the database boundary. Add a
  composite/deferred constraint or tighten the history anchor in a follow-up.
- **P1 — semantic acceptance remains unproven.** Exact sentence membership does
  not prove relevance or complete coverage; the two recorded characterization
  probes demonstrate this. Real Hà Giang source provenance/usage-rights corpus is
  absent, so real-corpus quality remains `NOT_EVALUATED`.
- **P1 — the real-corpus manifest is a prerequisite schema, not a gold evidence
  set or evaluator.** Its questions record expected source IDs/claims but not the
  reviewed supporting evidence span and locator. It cannot yet measure evidence
  recall or citation locator correctness against an owner-approved corpus. Add
  those gold fields and an evaluator after source rights/provenance are verified.

### Scheduler and runtime acceptance decision

Vercel Cron is acceptable only as a best-effort runner with an owner-approved
operational policy, not as proof of a hard 24-hour SLA. Preview can exercise the
protected endpoint through a manual authorized request on an isolated database;
Vercel Cron itself targets Production. Test duplicate calls, `hasMore` draining,
missing/failed-run alerts, backlog capacity, and operator catch-up before activation.
The route must remain disabled until the correct isolated target, `CRON_SECRET`,
database backlog, monitoring and recovery owner are verified. If a hard physical
deadline is mandatory, owner must choose a durable scheduler/queue or revise the
operational guarantee; no external service was added.

The prepared real-runtime sequence is: confirm Neon Development branch/role and
schema drift read-only; take a restorable Neon branch/snapshot; rehearse migration
on disposable Postgres and prepare restore-based rollback; create only dedicated
QA identities/conversations; verify Guest and Traveler bootstrap/first turns,
follow-up retrieval, citations from an owner-approved READY/INDEXED source,
insufficient source, source disable, same-key replay and turn count, concurrent
head fencing, injected provider failure/timeout, explicit delete/replay rejection,
and clock-injected expiry/cleanup reruns. Never point global cleanup at shared
Development data until a read-only eligible-backlog check proves the target scope.
Preview API/page currently remain hard-disabled because `qaRuntimeEnabled` allows
only local development; no successful real-provider browser session is claimed.

`TASK192_STATUS=PARTIAL; TASK193_STATUS=PARTIAL; TASK194_STATUS=PARTIAL;
TASK197_STATUS=PARTIAL` remain unchanged. `READY_TO_COMMIT_FEATURE=NO` (owner
review of remaining release gates); `READY_FOR_PREVIEW=NO`;
`READY_FOR_MVP_ACCEPTANCE=NO`. Outstanding
release gates are scheduler/SLA ownership, expiry-boundary hardening, citation
metadata policy, verified corpus/quality evaluation, and real runtime acceptance.
No tests were rerun because this review made no code change. No commit, push, merge,
deployment, Neon write, live OpenAI/Blob call, Task 191 contract change, or Worker
stash operation was performed.

## 2026-10-11 — Final hardening execution addendum

Continued from the existing feature implementation; no Task 191/195/196
contract/UI redesign and no US-22 or Trip Planner work. Branch remains
`feat/us21-rag-qa-batch` at `8263c94e13cda29cde9f9556d186acc79e75ad44`; the TXH
root checkout remains clean. The worktree now has 49 changed paths (4 modified,
45 untracked) and four additive QA migrations. Migration
`20261011123000_add_qa_cleanup_state` is new in this hardening pass.

### Implemented hardening

- Expiry decisions and retention renewal now use `clock_timestamp()` sampled
  after the principal advisory lock. A clock-injected disposable-PostgreSQL race
  holds the exact principal lock across the expiry instant and proves the replay
  is rejected and content is tombstoned without extending expiry.
- Citation projection now requires a server-side `QA_PUBLIC_SOURCE_IDS`
  allowlist; an empty/missing allowlist excludes every source. It does not infer
  public permission from an Admin-entered title or DOCX heading and adds no
  approval column/migration. Unsafe file, local-path, UNC, private Blob and
  signed/internal URL metadata is excluded or rejected; no title/URL is invented.
- Conversation DELETE is owner-scoped and naturally idempotent for a repeated
  request against the same conversation ID. Guest revoke accepts the same
  cryptographic cookie for retry after the identity is revoked, but that retry
  grants no history/new-turn access. Both operations scrub/fence content without
  a response cache or a Task 191 `Idempotency-Key` extension. Same-owner,
  foreign-owner, repeated and concurrent deletion are covered on disposable PG.
- Provider generation now receives a request-local abort signal and checks
  evidence eligibility while the provider is in flight. The service aborts
  best-effort when disablement is observed and the existing final eligibility
  lock still prevents persistence/response. Evidence already sent before the
  disable is detected cannot be recalled from the provider; this is not claimed
  as a non-disclosure guarantee.
- Cleanup uses a durable 90-second database lease to serialize scheduler/manual
  runs, bounded batches and cooperative time budgets, plus persisted last success,
  eligible backlog, oldest overdue time and failure count. The protected route
  returns no private content; duplicate runs report HTTP 202. Migration and
  runner have only been exercised on the disposable database. No scheduler is
  configured, so physical deletion remains an operational release gate.
- The Development/Preview runtime gate now requires an explicit environment
  opt-in, an explicit owner acceptance flag for abuse protection, and exact
  database host/name matching. `VERCEL_ENV=production` is a hard deny. The
  generated defaults keep all runtime flags off. Preview and Production Q&A were
  not activated.

### Scheduler and Development decision

The cleanup implementation is scheduler-independent. Option A is Vercel Cron
on a verified Pro/Enterprise project using the five-minute candidate; current
Vercel docs limit Hobby to daily schedules with timing imprecision, run Crons
against Production, and describe delivery as best effort without automatic retry.
Five-minute cadence is 288 invocations/day; Pro currently has a USD20/month
platform fee with USD20 usage credit, with further Function/database use and
deploying seats subject to actual plan billing. Owner must confirm plan, capacity,
monitoring and the lack of a hard physical-deletion guarantee. Option B is an
owner-selected external managed scheduler calling the same protected endpoint
with bounded retry, delivery history and alerting; vendor, region, cost, secret
storage and recovery policy remain undecided. No plan/service was purchased or
configured. See the [retention runbook](../implementation/qa-retention-runbook.md)
and [Vercel usage/pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and
[Pro plan](https://vercel.com/docs/plans/pro-plan).

For real Development acceptance, owner must first verify the Neon Development
branch and migration state read-only, create/verify a restorable snapshot, review
all four additive migrations, apply them only through the authorized workflow,
and then set only the exact Development/Preview allowlist and approved source
IDs. The runbook contains the ordered runtime smoke checklist. No Neon migration,
cleanup sweep, live OpenAI/Blob call, or browser answer using the Hà Giang corpus
occurred here. The real-corpus evaluation remains `NOT_EVALUATED` because no
verified provenance/rights corpus was supplied. The synthetic technical report
matched 26/26 expectations with zero metadata-authenticity/history-isolation
failures, while retaining two known semantic relevance/coverage limitations; it
is not quality acceptance.

### Final validation evidence

- Focused unit hardening suites: 79/79 PASS.
- Disposable PostgreSQL/pgvector runner: 54/54 PASS, zero skipped, child/outer
  exit 0; owned container and anonymous volume cleanup PASS. Coverage includes
  the exact post-lock expiry boundary, disable while provider is in flight,
  same-owner DELETE/revoke replay, cleanup lock/metrics/failure rerun, actual
  migrations and the Task 191/US-19 persistence/retrieval regression suites.
- Full `node apps/web/scripts/test-qa-postgres.mjs --full`: 517/517 Vitest PASS,
  32 suites, zero skipped/todo, child/outer exit 0; PostgreSQL/pgvector tests
  ran against the isolated database; owned container/volume cleanup PASS.
- Legacy suite: all 11 groups PASS, command exit 0. Root typecheck PASS (4 tasks),
  Prisma generate/validate PASS, fresh production build PASS (29 routes/pages,
  TypeScript completed), production/demo isolation checks PASS, `git diff --check`,
  all-49-path whitespace scan and changed-file secret scan PASS.
- One intermediate full run failed only the newly added race fixture because it
  passed the turn ID instead of the reservation's idempotency key; a preceding
  lock observation also matched an unrelated parallel test. The fixture now
  uses the actual key and matches the exact PostgreSQL advisory lock hash. The
  subsequent focused PostgreSQL and full-suite reruns above passed without
  weakening assertions.

```text
TASK192_STATUS=PARTIAL; retrieval/security tests pass, real approved corpus and source allowlist remain owner/runtime gates
TASK193_STATUS=PARTIAL; technical generation passes, relevance/coverage quality remains NOT_EVALUATED
TASK194_STATUS=PARTIAL; persistence, replay, expiry and cleanup runner pass disposable tests; scheduler/runtime deployment pending
TASK197_STATUS=PARTIAL; synthetic and regression evaluation pass; real-corpus/manual acceptance pending
ROOT_BASELINE=TXH;8263c94e13cda29cde9f9556d186acc79e75ad44;clean unchanged
FEATURE_BRANCH=feat/us21-rag-qa-batch;HEAD unchanged;uncommitted
FILES_CHANGED=49;4 modified+45 untracked
NEW_MIGRATIONS=4 additive QA migrations;all disposable-only;none applied to Neon
GUEST_BOOTSTRAP_SECURITY=PASS_OFFLINE;runtime remains opt-in
RATE_LIMIT_AND_COST_GUARD=PASS_OFFLINE;real capacity/cost calibration pending
CONVERSATION_PERSISTENCE=PASS_POSTGRES;owner-scoped delete/revoke replay verified
RETENTION_CLEANUP=PASS_DISPOSABLE;bounded durable lease and metrics;physical SLA unverified
CLEANUP_SCHEDULER_STATUS=NOT_CONFIGURED;Vercel vs external scheduler decision required
SOURCE_ELIGIBILITY=PASS_POSTGRES;disable detected/aborted best-effort and final commit fenced
SEMANTIC_GROUNDING=PARTIAL;exact evidence-membership gate;semantic relevance/coverage NOT_EVALUATED
CITATION_AUTHENTICITY=PASS_SYNTHETIC_AND_POSTGRES;public metadata requires source-ID allowlist
REAL_CORPUS_EVALUATION=NOT_EVALUATED;verified Hà Giang provenance/rights corpus absent
API_INTEGRATION=PASS_DISPOSABLE_WITH_INJECTED_PROVIDERS;real runtime not run
FRONTEND_REAL_TRANSPORT=IMPLEMENTED;browser live-answer smoke NOT_RUN
FULL_TESTS=517/517 PASS;32 suites;zero skipped/todo;exit0
POSTGRES_INTEGRATION=54/54 PASS;US21 38+US19 16;disposable cleanup PASS
TYPECHECK=PASS;4/4 root tasks
BUILD=PASS;fresh production build;29 routes/pages;exit0
REMAINING_P0=Scheduler ownership/configuration/capacity and any claimed physical-retention SLA
REMAINING_P1=Real-corpus relevance/coverage and metadata approval;provider externalization policy;manual Development acceptance
READY_FOR_OWNER_ACCEPTANCE=YES_CODE_REVIEW;NO_MVP_RUNTIME_SIGNOFF
READY_TO_COMMIT_FEATURE=NO_PENDING_OWNER_REVIEW
READY_FOR_PREVIEW=NO_UNTIL_OWNER_MIGRATION_AND_ENV_CONFIGURATION
READY_FOR_MVP_ACCEPTANCE=NO
```

No task status was changed. No commit, push, merge, deploy, Neon operation, live
provider/storage call, Task 191 public-contract change or Worker stash action was
performed.

## 2026-10-11 — Owner decisions A/B/C and offline implementation

Owner-approved decisions recorded for Tasks 192/193/194/197:

- **A — GitHub Actions cleanup runner:** hourly at minute 17 UTC, bounded retry,
  GitHub Actions API heartbeat/watchdog, and manual recovery. This avoids a
  Vercel plan upgrade and uses the existing protected cleanup route. Trade-off:
  GitHub scheduled events are best-effort and can be delayed or dropped; a
  second scheduled workflow can detect stale/missing cleanup runs but is not an
  independent, hard-SLA monitor. Neither workflow is active until published on
  the actual default branch and configured by the owner.
- **B — Citation approval:** keep the existing server-only source-ID allowlist
  and fail-closed public projection. The allowlisted source ID approves only
  its stored public title and schema-projected locators, each still subject to
  field safety checks. Unsafe title/locator data removes that evidence. The
  current policy emits `sourceUrl: null`; a URL needs a separate future
  allowlist/approval and URL validator. No admin approval table or migration is
  needed for this policy. Disabling/unpublishing a source blocks new retrieval
  and is checked again before completion; changing the environment allowlist
  takes effect after the deployment carrying that change.
- **C — Provider data boundary:** continue using stateless Chat Completions,
  explicitly set `store: false`, send at most four approved current evidence
  chunks and 3,000 evidence tokens, plus the current question and at most two
  prior questions for follow-up intent. Never send prior assistant answers,
  citations, internal IDs, source metadata, private URLs, credentials, or a raw
  source document. Evidence containing unsafe references or credential markers
  fails before provider fetch. Request timeout remains bounded at 25 seconds;
  source-disable abort is best-effort and the final database eligibility fence
  remains mandatory. Data sent to OpenAI cannot be recalled. Application
  retention/deletion is separate from provider-side logging/retention. OpenAI's
  Chat Completions `store` parameter concerns storage for distillation/evals and
  does not establish zero provider retention; project data controls and
  applicable terms still require owner review.

The GitHub remote advertises `master` as its default branch (`git ls-remote
--symref origin HEAD`). Scheduled workflows only activate after an owner
publishes them to that branch; this work does not merge or publish them. Before
activation, configure the `qa-cleanup-production` GitHub Environment with
`QA_CLEANUP_ORIGIN` (HTTPS origin only), `QA_CLEANUP_ALLOWED_HOST` (exact DNS
host), and `CRON_SECRET` (environment secret, at least 32 characters). Restrict
the environment to `master`; keep its endpoint aimed only at an owner-approved
database where migrations and cleanup are authorized. Do not configure shared
Development. `QA_CLEANUP_ENABLED` remains false until a separate authorized
environment gate. Manual dispatch requires an explicit confirmation boolean
and accepts no endpoint or host input.

The runner uses the fixed `/api/internal/qa-cleanup` path, HTTPS, exact host
matching, no redirects, 10-second request timeout, three total attempts with
1/2-second exponential backoff, a 10-minute job timeout, and a concurrency
group. It drains up to eight bounded cleanup responses per job, then fails if
work remains, makes no progress, receives an invalid response, or cannot acquire
the DB lease. The watchdog runs at minute 47 UTC and queries only scheduled runs
on `master`; a missing/stale (>75-minute) heartbeat or latest failed run fails
that workflow. Enable GitHub Actions failure notifications through the
owner-approved monitoring destination. The watchdog itself may also be delayed
or dropped, so this improves detection but does not create a hard physical
retention SLA. If the repository is public, GitHub can also disable schedules
after 60 days without repository activity; monitor workflow enablement.

No migration was added. The four existing additive QA migrations remain
disposable-database-only. The previous Vercel Cron candidate is superseded and
is not referenced by the new workflows or deployed configuration. Before any
cleanup activation, the owner must verify the exact target branch/database,
migration state, restorable backup, cleanup backlog/capacity, environment
secrets, default-branch publication, heartbeat notifications, and physical
expiry expectations. An hourly best-effort runner is not proof of a hard
24-hour physical-deletion SLA. No live cleanup/API request, Neon write,
OpenAI/Blob call, migration apply, or Production activation occurred here.

Validation for this decision batch: Node's built-in test runner covers HTTPS
host pinning, strict cleanup result shape, bounded retries/backlog draining,
manual-vs-scheduled heartbeat filtering, stale/missing/failed heartbeats, and
workflow YAML gates. Focused Vitest payload tests verify `store:false`, the
four-chunk ceiling, 3,000-token retrieval budget, two-question history limit,
absence of provider-side conversation state/internal metadata, and rejection
of private references/secrets before transport. Full offline results are
recorded below after the run; all four task statuses remain `PARTIAL`.

```text
OWNER_DECISIONS_RECORDED=A/B/C; implementation recorded; no runtime activation
SCHEDULER_WORKFLOW_READY=PREPARED; default-branch publication and secrets/config remain owner gates
DEFAULT_BRANCH_ACTIVATION_GATE=master; remotely confirmed; no merge/publish performed
SCHEDULER_HEARTBEAT_MONITORING=GitHub Actions scheduled-run watchdog; >75m stale/missing run fails; notification routing not configured
PHYSICAL_RETENTION_SLA=NOT_GUARANTEED; hourly best-effort with bounded backlog drain
CITATION_POLICY=server source-ID allowlist; approved title/locator fields safety-checked; URL null by default
PROVIDER_DATA_BOUNDARY=store:false; max 4 chunks/3000 evidence tokens; current+2 questions only; no prior answers or provider state
MIGRATIONS=4 existing additive migrations; disposable database only; no new migrations
TASK192_STATUS=PARTIAL; TASK193_STATUS=PARTIAL; TASK194_STATUS=PARTIAL; TASK197_STATUS=PARTIAL
```

### Addendum — cleanup database target pin

Final review found that the cleanup route previously relied only on
`QA_CLEANUP_ENABLED` and `CRON_SECRET`; a GitHub application-host pin alone
would not prove which database that deployment used. The route now also
requires `DATABASE_URL` to be PostgreSQL and match the exact server-only
`QA_CLEANUP_ALLOWED_DATABASE_HOST` and `QA_CLEANUP_ALLOWED_DATABASE_NAME`.
Missing or malformed values fail closed before the cleanup adapter/database
call. `.env.schema` defaults the new allowlist values to empty; this is a
deployment safety check, not owner authorization to enable cleanup on shared
Development. It introduces no migration. Focused deterministic tests cover
disabled, incomplete, wrong-host, wrong-database, non-PostgreSQL and malformed
targets. The scheduler uses a 45-second HTTP timeout per bounded route request;
its separate GitHub API heartbeat check uses a 10-second timeout.

### Final offline validation record — 2026-10-11

The final full offline run passed 524/524 Vitest assertions across 33 files
with zero skipped/todo; its evaluation report matched 26/26 technical
expectations, recorded two known semantic limitations, and kept real-corpus
quality NOT_EVALUATED. After shortening one synthetic credential marker to
avoid a secret-scan false positive, the affected generation/evaluation/cleanup
gate suites were rerun and passed 60/60, and the GitHub Actions runner/watchdog
tests passed 7/7 with zero skipped. The disposable PostgreSQL/pgvector suite
passed 54/54 with zero skipped and confirmed container/volume cleanup. Legacy
groups, root typecheck, production build, Prisma validation and Prisma client
generation exited 0. Workflow YAML/guard/permissions checks passed; actionlint
is unavailable in this environment. git diff --check passed and the scan of
all 55 changed paths found zero secret-pattern matches. The tree has four
tracked modifications, 51 untracked paths, zero staged paths, and four existing
QA migrations; HEAD remains 8263c94e13cda29cde9f9556d186acc79e75ad44 on
feat/us21-rag-qa-batch. No live provider/API calls, Neon writes, migration
apply, cleanup invocation, workflow publication, or production activation
occurred. Tasks 192/193/194/197 remain PARTIAL; scheduler configuration,
notifications, physical-retention SLA evidence, source/corpus rights, and real
runtime acceptance remain owner/deployment gates.


### 2026-10-11 — Local runtime configuration fix and read-only preflight

On feature checkpoint 53506f67064dbc4eeda6693f3527c79e9d755a00, removed only the DATABASE_URL assignment from ignored apps/web/.env.local after verifying the exact offline sentinel. BETTER_AUTH_SECRET and BETTER_AUTH_URL assignments were preserved byte-for-byte. The owner-restored apps/web/.env was not changed and still matches the main repository source. No secret values were printed or committed.

Removed @internal only from server-consumed QA_RUNTIME_ENABLED, QA_PREVIEW_RUNTIME_ENABLED, QA_ABUSE_PROTECTION_ACCEPTED, QA_RUNTIME_ALLOWED_DATABASE_HOST, QA_RUNTIME_ALLOWED_DATABASE_NAME, QA_PUBLIC_SOURCE_IDS, QA_LOCAL_NETWORK_ID, QA_CLEANUP_ENABLED, QA_CLEANUP_ALLOWED_DATABASE_HOST, QA_CLEANUP_ALLOWED_DATABASE_NAME, plus VERCEL_ENV and VERCEL, which the runtime uses for environment/ingress checks. QA_NETWORK_HMAC_SECRET and CRON_SECRET were already exposed. Retained @defaultSensitive=true, optional/boolean/secret-length validation and internal configuration-only variables; NODE_ENV remains the only public generated key. Varlock codegen exited 0; generated env.ts remains ignored. No secret was created.

Both Varlock process injection and the actual installed Next development env loader confirmed the expected Neon host/database and no offline sentinel. QA runtime, Preview runtime, abuse-acceptance and cleanup flags remain false. OpenAI and Blob credentials are present but untested. Source allowlist, network HMAC, local network identity, runtime/cleanup target pins and CRON_SECRET remain missing; exposure success is not configuration or live-acceptance success. Production Q&A remains hard-disabled by its existing gate.

Read-only PostgreSQL transactions using effective runtime configuration returned project summer-unit-95870477, branch br-aged-hat-b3o6hg9p, endpoint ep-purple-pond-b3xujb8o and database neondb. All expected IDs match. The server does not expose branch name; no Neon management API/Console credentials are available here, so the current branch-name verification remains PARTIAL. Owner must open this project in Neon Console, select the branch with this exact ID, and verify its current Development name/role before authorizing migration.

Ledger: 11 completed migrations, no failed/rolled-back entries, checksums match raw or LF-normalized checkout. The four additive QA migrations remain pending, with no QA tables/backlog to measure. pgvector is 0.8.6, PostGIS 3.6.4. RAG publications remain four READY generations: three INDEXED documents and one DISABLED. This does not prove corpus rights, provenance or approved provider sharing. The preceding read-only Prisma diff found only expected QA additions; no migration was applied.

Validation: focused runtime/cleanup gates, Task191 contract and QA HTTP suites passed 134/134 with zero skipped; root typecheck passed four tasks; fresh production build exited 0 using offline child-process overrides with provider credentials absent. Its synthetic auth secret caused expected low-entropy build warnings; no runtime secret was replaced. Scan of 107 client assets found zero matches for local secret values, and generated public env types contain only NODE_ENV. Diff whitespace and changed-file secret scans passed. Full Vitest and disposable PostgreSQL tests were not repeated for this configuration-only change. All four task statuses remain PARTIAL. No commit/push/deploy, Neon writes, provider calls, cleanup, scheduler activation or Worker stash operation.


### 2026-10-11 — Owner-authorized US-21 Development migrations applied

Owner explicitly approved Development writes for project summer-unit-95870477, branch development / br-aged-hat-b3o6hg9p, endpoint ep-purple-pond-b3xujb8o, database neondb, and confirmed backup-dev-pre-us21-20261011. Branch name and backup verification are owner-provided; server identity independently matched project/branch/endpoint/database IDs through effective Varlock runtime configuration before writing. Effective runtime was not the offline sentinel.

Immediate gates passed: feature HEAD 53506f67064dbc4eeda6693f3527c79e9d755a00; four migration SQL files match checkpoint; 11 complete checksum-matching ledger entries with no failed/rolled-back entries; exactly four QA migrations pending and no existing QA table collisions. The requested db:migrate script maps to forbidden migrate dev, so the existing db:migrate:deploy workspace script was used from repository root: npm run db:migrate:deploy -w @KLTN/db. Prisma Migrate Deploy exited 0 and applied only 20261011120000_add_qa_guest_identity, 20261011121000_add_qa_conversations, 20261011122000_add_qa_abuse_guard, and 20261011123000_add_qa_cleanup_state.

Post-migration read-only verification: 15 completed migrations, zero failed/rolled-back entries, all ledger checksums match; six QA tables, validated constraints, composite ownership FK, idempotency and active-turn uniqueness indexes present; all six QA tables empty. Prisma migrate diff against repository schema reported no difference, exit 0. Non-QA table column/default/constraint/index catalog fingerprints and row-content/count fingerprints were identical before/after (excluding migration ledger and extension-owned spatial_ref_sys data). pgvector 0.8.6 and PostGIS 3.6.4 passed vector-distance and SRID queries. Documents remain three INDEXED and one DISABLED; publications remain three INDEXED/READY and one DISABLED/READY, with unchanged content fingerprints.

No Production or backup target was contacted for writes. No cleanup, RAG content changes, provider/Blob calls, runtime activation, commit/push/deploy or Worker stash operation. Existing local configuration and earlier candidate-file deletion were preserved. Migration and diff child processes exited 0; their stdin Node wrapper retained Varlock handles after completion and was stopped only after verification output; a final independent read-only QA-count/publication verification exited 0. No offline suite rerun was needed for this migration-only execution. Live smoke still requires approved source allowlist/provider sharing, network HMAC, local identity, runtime target pins and deliberate local runtime gate configuration. Tasks 192/193/194/197 remain PARTIAL.


### 2026-10-11 — US-21 local live readiness prepared (no live execution)

Read current QA runtime gates, Guest/Better Auth boundary, allowlist, provider configuration and /assistant HTTP transport. Only ignored apps/web/.env.local configuration was changed: set exact Development hostname/database pins, local runtime/abuse gate true, Preview/cleanup false, empty unapproved source allowlist; generated a cryptographically random local HMAC and stable local network quota identity without displaying either. Existing DATABASE_URL/.env and Better Auth assignments retained. No project/branch/endpoint env pins exist in current code; read-only server IDs were verified against approved target.

Actual Next/Varlock development loading and gate execution confirmed local=true, Production=false, Preview=false, cleanup=false, secret exposure server-only, OpenAI credential present and Better Auth localhost:3001/minimum-length configuration valid. Ledger remains 15 completed, zero incomplete. Three INDEXED US19 TEST sources have READY publications and matching embedding/chunk counts, but ownership/public-display/provider-sharing approvals are not established; none allowlisted.

Created docs/fixtures/us21-local-live-qa-test.txt, clearly TEST/SYNTHETIC with fictional QA-SAOTIM-21 record, and docs/implementation/us21-local-live-readiness.md with exact env requirements, upload/review/approve/index steps, correct RagDocument.id allowlist semantics, TXT citation limitations, and first turn/citation/Traveler/follow-up/insufficient/replay/delete/revoke/disable cases. These are prepared artifacts, not uploaded/indexed/real-corpus evidence. Runtime source approval and live authorization remain owner gates. No server started (real UI bootstrap itself writes), no Neon write, migration, cleanup, OpenAI/Blob call, Production activation, commit/push/deploy or Worker stash action. No application code change; no full regression rerun. Tasks remain PARTIAL.


### 2026-10-11 — Owner-approved live acceptance attempted; stopped before review/index

Authorization: owner approved only docs/fixtures/us21-local-live-qa-test.txt for Development Blob/Neon writes and real OpenAI indexing/generation, at most five generation questions. Full fixture review passed: original generated TEST/SYNTHETIC QA record, no personal data, secrets, private information, third-party content or purported real Ha Giang facts. Owner authorization covers public safe metadata and minimal evidence sharing for this fixture only. Expected evidence: confirmation code QA-SAOTIM-21; three steps (doc tai lieu, doi chieu ma xac nhan, ghi ket qua kiem thu); purple label; no actual travel prices/hours. Proposed five questions: confirmation code; same-conversation follow-up asking steps; actual ticket price absent from source; confirmation code plus unsupported price (record actual PARTIAL/clarification outcome); independent label-color check. None sent.

Final write gate passed using effective Next/Varlock configuration and read-only Neon server settings: project summer-unit-95870477, branch br-aged-hat-b3o6hg9p (development per owner), endpoint ep-purple-pond-b3xujb8o, neondb; six QA tables; exact checkpoint/feature branch; port 3001 free before starting. Local runtime enabled, Preview/Production/cleanup disabled. No migration rerun. Owner logged into existing Admin account in in-app browser; no credentials or cookies copied into chat/scripts.

Started npm run dev -w web from feature worktree. Standard upload UI/API successfully uploaded exactly one fixture and finalized document cmv3q1hth00010k9wf74kmio7. Public title: US21 TEST SYNTHETIC - Ho so QA Sao Tim; sourceUrl null; no invented author/locality; topic marks owner-approved technical TEST/SYNTHETIC acceptance. No storage path/URL recorded in this report. Upload-url API HTTP 200 (3.8s server latency); finalize API HTTP 200 (3.7s); Blob PUT duration not captured.

Live blocker: Next 16.3.8 Turbopack returned HTML 404 for existing nested /api/admin/rag-documents/{id}/actions and /index routes. UI START_REVIEW attempt reported UNKNOWN; no repeated write retry was made. Existing production-build manifest includes these routes, while development did not compile them on request. Tried runtime-only npm run dev -w web -- --webpack, without editing code. Webpack served index progress HTTP 200 for authenticated UI / 401 JSON for unauthenticated diagnostic, but page rendering was blocked by Varlock sensitive-config scan: Config item BETTER_AUTH_URL, patched ServerResponse.write, on document detail HTML. Its effective value is the noncredential localhost origin, but remains sensitive by schema default. This is a guard-triggered runtime failure, not evidence that API keys/passwords leaked; no guard disabled or metadata classification changed. Browser received connection reset. Per stop gate, halted writes and stopped the local server. Screenshot of completed upload was not saved before the navigation failure; read-only DB confirmation provides authoritative persistence evidence.

Post-stop read-only reconciliation exited 0: exact target still matched; document UPLOADED, zero fixture jobs/generations/publications/chunks, zero QA turns. Existing documents remain three INDEXED and one DISABLED. No existing source was changed or allowlisted. Allowlist stays empty until this exact fixture is APPROVED/INDEXED/current READY. No OpenAI calls occurred: generation questions 0/5, token usage 0. Upload persistence PASS; review approval, indexing, real HTTP chat, citation authenticity and conversation persistence NOT_EXECUTED/BLOCKED. REAL_HA_GIANG_CORPUS_EVALUATION=NOT_EVALUATED.

FIXTURE_REVIEW=PASS; FIXTURE_APPROVED=OWNER_AUTHORIZED_FOR_TEST; UPLOAD_STATUS=PASS; APPROVAL_STATUS=BLOCKED_UPLOADED; INDEX_STATUS=NOT_STARTED; CHUNKS=0; EMBEDDINGS=0; SOURCE_ALLOWLIST=EMPTY; REAL_HTTP_TRANSPORT=IMPLEMENTED_NOT_LIVE_VERIFIED; OPENAI_LIVE_CALLS=0; QUESTIONS_EXECUTED=0/5; FIRST_TURN=NOT_RUN; FOLLOW_UP=NOT_RUN; INSUFFICIENT_SOURCE=NOT_RUN; CITATION_VALIDATION=NOT_RUN; CONVERSATION_PERSISTENCE=NOT_RUN; TOTAL_TOKEN_USAGE=0; LATENCY=UPLOAD_URL_3.8S_FINALIZE_3.7S; SECURITY_FINDINGS=VARLOCK_BETTER_AUTH_URL_GUARD_BLOCK; TASK192_STATUS=PARTIAL; TASK193_STATUS=PARTIAL; TASK194_STATUS=PARTIAL; TASK197_STATUS=PARTIAL; READY_FOR_OWNER_BROWSER_ACCEPTANCE=NO; BLOCKERS=LOCAL_NESTED_ROUTE_404_AND_VARLOCK_ORIGIN_CLASSIFICATION.

Next work must resolve local route discovery and narrowly classify the known public Better Auth origin without weakening credential sensitivity, then reconcile/resume the existing document review/index (never reupload a duplicate), allowlist the exact returned document ID, and run at most five generation questions under the existing authorization. No disable/delete/revoke/cleanup, Production/backup writes, scheduler activation, migration, contract change, code edit, commit/push/merge/deploy or Worker stash action.


### 2026-10-11 — Local route/Varlock remediation and approved fixture indexing

Continued the owner-approved single-fixture live test; no second upload. Verified effective BETTER_AUTH_URL is only the public origin http://localhost:3001: HTTP(S), root path, no username/password/query/fragment and not equal to any credential. Changed only its apps/web/.env.schema decorator to @public @type=url; BETTER_AUTH_SECRET, DATABASE_URL, OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, QA_NETWORK_HMAC_SECRET and CRON_SECRET remain sensitive. Varlock codegen succeeded.

Exact endpoint behavior: frontend calls POST /api/admin/rag-documents/{id}/actions and GET/POST /api/admin/rag-documents/{id}/index; there is no /actions/index endpoint. Route files exist and are present in production build manifest. Turbopack's dev manifest omitted nested /actions and /index routes and returned HTML 404; Webpack dev registered both (authenticated GET/POST requests returned 200). Webpack no longer reports BETTER_AUTH_URL from the sensitive-response scan. This is a Turbopack development route-registration issue, not a wrong client URL or route handler authorization failure.

Using the already logged-in Admin and standard UI, the existing document cmv3q1hth00010k9wf74kmio7 moved UPLOADED -> REVIEWING -> APPROVED -> INDEXED. The US-19 indexing action made an authorized real OpenAI Embeddings call for this fixture; job succeeded on attempt 1. Read-only Development verification confirmed status INDEXED, current publication READY (generation cmv3wvev70005v89wg0fvv4ty), one expected chunk/one embedding, openai/text-embedding-3-small/1536, safe owner-approved TEST/SYNTHETIC title and null sourceUrl. Existing sources were not changed: counts are now four INDEXED (three prior + fixture), one DISABLED. The exact returned RagDocument.id alone is present in ignored QA_PUBLIC_SOURCE_IDS. Database server identifiers and local gate rechecked; Preview and cleanup remain disabled.

A guard interaction remains when requesting the Admin detail page while the raw allowlist ID is configured: Varlock flags QA_PUBLIC_SOURCE_IDS because that same ID appears in the /admin/rag/{id} request/page context. It remains sensitive/server-only; no public exposure or guard exception was added. Navigate to /assistant to avoid the internal admin-ID path. The assistant page loaded on Webpack and authenticated as ADMIN; its real HTTP transport path was selected. However, browser actions could edit the draft and clear it using “Cuộc hội thoại mới” but submit did not start a turn or produce POST /api/ai/ask. No Generation API calls or QA turns occurred; OpenAI generation remains 0/5 and generation token use is 0. Do not retry blindly. This local browser-submit behavior needs owner interaction/debugging before live questions.

Validation after schema change: Varlock codegen PASS; focused tests 78/78 across runtime gate, HTTP transport, Assistant development integration, QA HTTP and RAG index/action services; web typecheck PASS; fresh Next production build PASS and included nested actions/index routes; diff check PASS, secret-value scans found no matches, .env files remain ignored. Prisma client generation also succeeded. Full regression and PostgreSQL suite not repeated.

FIXTURE_REVIEW=PASS; FIXTURE_APPROVED=OWNER_AUTHORIZED; UPLOAD_STATUS=PASS; APPROVAL_STATUS=PASS; INDEX_STATUS=PASS; CHUNKS=1; EMBEDDINGS=1; SOURCE_ALLOWLIST=EXACT_FIXTURE_ID_ONLY; REAL_HTTP_TRANSPORT=SELECTED; OPENAI_EMBEDDING_CALL=PASS; OPENAI_GENERATION_CALLS=0/5; QUESTIONS_EXECUTED=0/5; FIRST_TURN=NOT_RUN; FOLLOW_UP=NOT_RUN; CITATION=NOT_RUN; CONVERSATION_PERSISTENCE=NOT_RUN; READY_FOR_OWNER_BROWSER_TEST=PARTIAL; BLOCKERS=TURBOPACK_DEV_ROUTE_REGISTRATION (use webpack) + ADMIN DETAIL ALLOWLIST-ID GUARD MATCH + CHAT SUBMIT DOES NOT DISPATCH.

Webpack development server is left running on localhost:3001 with /assistant open and the Admin session intact for owner browser acceptance. No question, deletion, disable, cleanup, migrations, Production/backup write, commit/push/merge/deploy, or Worker stash operation. Tasks 192/193/194/197 remain PARTIAL.

### 2026-10-11 — Assistant send/session lifecycle fix

Root cause: while `/api/ai/session` bootstrapped, `AuthenticatedRuntimeChat` rendered `AssistantChat` with a null transport and key `boundary`. On success, the authenticated identity was the exact same `USER:<id>` string as `boundary`, so React reused the child instance. `AssistantChat` creates its controller once with `useState`; that controller kept the null transport even though the updated prop made the composer look ready. `AssistantController.submit()` therefore returned false at its `!transport` guard before calling `AssistantHttpTransport` or creating `POST /api/ai/ask`.

The canceled bootstrap requests are caused by the session effect cleanup aborting on component/boundary unmount; development Strict Mode can exercise the same cleanup. They do not explain the missing ask. A completed bootstrap was observed: `/api/auth/get-session` and `/api/ai/session` returned 200, the browser showed the existing Admin session, and the composer became interactive. The submit button is disabled while the draft is empty, as designed.

Fix: give bootstrap and ready states distinct `AssistantChat` keys (`bootstrap:<boundary>` and `ready:<identity>`) so the controller is recreated with the real HTTP transport before the composer is enabled. Task 191 request/response contract, citation presentation, identity boundary and idempotency behavior are unchanged.

Deterministic regression evidence: the new runtime-key test failed before the fix because both states produced `USER:user_fixture`; it passes after the key change. Focused US-21/frontend/session/API suite passes 83/83; web typecheck and production build pass. Browser verification after restart showed the Admin session and final session bootstrap completing, with no ask sent. OpenAI generation remains 0/5; first-turn live acceptance is still NOT_RUN by request. No document, allowlist, database, migration, cleanup, Production/backup, commit, push, deploy or Worker stash action occurred.

### 2026-10-11 — UNKNOWN with no recorded ask: fetch receiver regression

Trace: submit creates the immutable attempt and sets pending sending; controller send calls AssistantHttpTransport.send; read called the native fetch reference as this.fetcher. That supplies the transport object as the native function receiver. A receiver-sensitive browser-fetch mock throws Illegal invocation at this point, before creating a request; transport catch maps it to networkAmbiguity and controller maps that to UNKNOWN. The new pending state proves the prior null-transport submit guard was passed. No wrong URL was found (/api/ai/ask); server-side HMAC/session checks cannot explain a fetch call failing before HTTP dispatch. Aborted signals remain separately tested and unchanged.

Minimal fix: wrap the default fetch dependency with (input, init) => globalThis.fetch(input, init). Keep request URL/body/key, cookies, timeout, abort behavior, Task 191 contract and security unchanged. New deterministic test uses a mocked session 200 with validated USER identity, distinct bootstrap/ready keys, then submit through the real controller and HTTP transport; asserts session -> POST /api/ai/ask, exact key/body, accepted receiver and confirmed FAILED fixture response instead of network UNKNOWN. It failed with the old receiver and passes after the wrapper. This is a deterministic transport/lifecycle test, not a mounted-browser or live provider acceptance test.

Read-only Development target gate matched the approved endpoint, neondb and effective runtime pins. BEGIN READ ONLY returned transaction_read_only=on, zero qa_turn and zero qa_conversation records. Available dev logs show session 200 and no ask. Initial connection attempt with PostgreSQL startup options failed with redacted diagnostics; the subsequent ordinary connection plus explicit read-only transaction completed successfully. No question/content/key/session secrets were read into output. Temporary read-only script was removed. Direct Chrome headless receiver probe was rejected by execution policy before running; no direct exception capture in the existing user tab is claimed.

Validation: focused suite 84/84 PASS (six files), web typecheck PASS, production build PASS; diff/secret checks recorded below in the current session report. Webpack development server restarted on localhost:3001. No live ask/retry, OpenAI/Blob, upload/index, allowlist change, migration/cleanup, database mutation, commit/push/deploy or Worker stash action. Tasks remain PARTIAL. Dispatch is ready for an owner-controlled live check; real browser/provider acceptance remains unexecuted.

### 2026-10-11 — AI_INVALID_RESPONSE diagnosis after owner live asks

Observed dev logs contain two POST /api/ai/ask responses: HTTP 502, 11.4s and 6.9s. Read-only Development verification (approved endpoint/neondb/effective runtime host pin, BEGIN READ ONLY) found two USER/GUEST-owned conversations in aggregate, no active turn/completed head, and two first turns FAILED with errorCode AI_INVALID_RESPONSE, created at 2026-10-11T15:10:37.069Z and 15:11:15.398Z. No principal IDs, keys, credentials or private question/response content were printed. Failed-turn policy correctly scrubbed question/response/provenance; therefore the latest row cannot independently be correlated with the literal question hi. Owner reports that question. Quota counters ask-global=2 and tokens-global=46000 are reserved ceilings, not actual provider usage or confirmation of a generation call.

Trace: qaHttpError maps an AppError AI_INVALID_RESPONSE to HTTP 502 / FAILED with sanitized message. This code can originate in invalid query embeddings (EmbeddingError INVALID_PROVIDER_RESPONSE), retrieval eligibility checks, generation preflight, provider envelope/JSON/schema, outcome consistency, exact sentence/citation grounding, public safety, final response validation or atomic completion eligibility fences. A generic DB completion failure maps UNKNOWN, not this error. HTTP/auth bootstrap failure and previous pre-fetch receiver issue do not explain persisted FAILED turns. Current logs/failed rows retain no stage diagnostics, provider request IDs, finish reason or usage. No provider call or retrieved evidence count for the historical asks can be confirmed from the available evidence. Do not infer calls or token usage from latency/quota.

Current fixture read-only state remains INDEXED/current READY, one published chunk. Offline tests against that in-memory chunk confirm instructionDetected=false and safe text metadata. With question hi and a mock provider, valid empty-parts CLARIFICATION_REQUIRED and INSUFFICIENT_SOURCE both pass generation validation. Existing tests confirm empty evidence returns the contract INSUFFICIENT_SOURCE without a generation fetch; retrieval itself still requires a query embedding. These checks do not reproduce or prove the historical model output or historical source eligibility. Greeting hi is syntactically valid; there is no deterministic greeting branch, and with retrieved evidence the model decides insufficiency/clarification under the existing prompt. No greeting special case or guard relaxation was introduced.

ROOT_CAUSE=UNRESOLVED_INSUFFICIENT_STAGE_EVIDENCE. FIX_APPLIED=NO; no proven implementation bug and no justified red regression case. Next diagnostic step requires content-free stage classification (embedding validation; evidence count; provider HTTP/finish/refusal/output schema; outcome consistency; grounding/citation; final eligibility) plus optional sanitized provider request ID/usage for a future separately authorized ask. Do not log prompt, evidence text, output text, identities, keys, cookie/HMAC or credentials. No automatic live replay was performed. Focused existing suite 161/161 PASS across eight files; typecheck PASS. Build/diff/secret checks recorded in the session report. Tasks remain PARTIAL; not ready to declare the next ask fixed.

No new live ask, embedding/generation/Blob call, upload/index, migration, cleanup, allowlist change, Neon mutation, commit/push/deploy or Worker stash operation. Temporary read-only/offline diagnostic script removed. Only this append-only documentation evidence was added in this diagnosis.

### 2026-10-11 — Development-only AI_INVALID_RESPONSE stage diagnostics prepared

Implemented request-scoped AsyncLocalStorage diagnostics with random server correlation UUIDs, wired only into qaHttp.ask in local development. Production/Preview forced off; Task 191 public body/status/headers, immutable idempotency key and existing security/grounding checks unchanged. Instrumented actual request/principal/admission/query-embedding/retrieval/eligibility/generation/preflight/provider/envelope/JSON/schema/outcome/citation/grounding/public-safety/atomic-completion order. Every known AI_INVALID_RESPONSE throw/mapping site has a specific category/origin. Provider fetch invocation is distinct from remote acceptance/billing. Projected generation HTTP/request-ID/finish/token metadata is available when supplied; embedding HTTP/request ID is available, embedding usage is not exposed by the existing adapter. Missing data remains absent/unknown.

Security projection allows only internal stage/category/code enums, random correlation ID, chunk counts, bounded numeric usage/status, bounded req_ request ID and known finish reasons. Schema issues contain safe code/path only; unknown field names become FIELD. No raw prompt/question/answer/chunk/provider response/error message, identity, cookie/key/HMAC, credential or URL is logged. Diagnostic sink failures do not alter operation behavior; concurrent requests have separate context. Origin tagging uses WeakMap, never database/persistence/public response. See docs/implementation/us21-stage-diagnostics.md for complete rejection-condition inventory, metadata semantics, removal guidance and the one-attempt plan.

Read-only Development endpoint/neondb/runtime host gate PASS; two conversations and two FAILED/AI_INVALID_RESPONSE turns remain, scrubbed=true. Available logs still provide only the earlier two asks/502; no historical stage or generation usage can be recovered. No scrubbed content inspected. Historical root cause remains NOT_IDENTIFIED. No speculative functional fix was made.

Deterministic validation: 17 new diagnostics cases plus existing focused modules/UI regressions, 178/178 PASS across nine files. Empty evidence -> INSUFFICIENT_SOURCE with no generation dispatch; valid evidence -> generation/persistence; unavailable, malformed JSON/schema, outcome inconsistency, citation reference, grounding, invalid embedding, lost eligibility and DB persistence failure each assert exact internal failure origin/public code. Tests also assert content secrecy, schema-path/provider-metadata projection, Production/Preview silence, concurrent isolation and nonthrowing sink behavior. Typecheck PASS. Production build and diff/secret checks recorded in session report. No PostgreSQL integration rerun: no schema or write-policy change, and no live test writes authorized for diagnostics.

One owner-triggered new-conversation question prepared: Ma xac nhan cua ho so QA Sao Tim la gi? Expected approved synthetic evidence sentence: Ma xac nhan cua ho so QA Sao Tim la QA-SAOTIM-21. Do not replay either failed historical key; controller creates the new intent key. Stop after one submit, then inspect US21_QA_DIAGNOSTIC events for its correlation ID and provider usage separately if owner dashboard access is available. Earlier two POSTs are conservatively charged to the five-question budget: 3 remaining before this diagnostic attempt, 2 after it regardless of outcome. Prior generation invocation/billing NOT_CONFIRMED, never claimed zero. No new live provider call, question/retry, fixture upload/index, migration/cleanup, allowlist/env change, Neon mutation, commit/push/deploy, worktree deletion or Worker stash operation. Tasks remain PARTIAL.

### 2026-10-11 — Wrong DEMO transport: wrong local server resolved

Root cause proved by port/process ancestry and both repository page sources: localhost:3001 listener PID 33144 and its Next parent PID 32988 ran from D:\KLTN\KLTN, under the main-repo Turbo dev tree, not the US-21 feature worktree and not Webpack. Main-repo /assistant imports AssistantDevelopmentChat unconditionally in development; it has no real-QA selection branch. The prior feature dev exec had exited. Therefore this owner question executed demo and provides no live retrieval/generation evidence. It is not another POST/ask and does not consume a third live-ask budget slot.

Effective feature-worktree Varlock statuses were read without printing values: QA_RUNTIME_ENABLED=true, abuse accepted, approved endpoint/neondb and runtime pins matched, HMAC/local-network identity/OpenAI present, exact existing fixture-only allowlist, Preview and cleanup disabled. Keys are in ignored .env.local; .env contains no QA keys. Required QA variables are server-exposed, not @internal, and retain sensitive defaults. No env or allowlist modification was needed. Feature /assistant prioritizes AssistantRuntimeChat when development QA flag is true; false selects clearly marked demo. Missing/incorrect backend security configuration closes the real session/API gate; the runtime component never falls back to demo responses. Production selects unavailable and never imports development demo. No application-source mode-selection fix was necessary.

Stopped only the verified main-repo Next dev process serving the conflicting port, then started npm run dev -w web -- --webpack from the feature worktree. Browser verification on /assistant: no DEMO banner or mock controls, existing Admin session, session HTTP 200, text field settable, new-conversation enabled, no turn/pending question. Send is disabled solely because draft is empty. Ready identity uses the real HTTP transport via the existing distinct bootstrap/ready key; no ask was submitted. No cookie/session credential was read or copied.

Added assistant-runtime-mode.vitest.test.ts: builds/executes the actual page selection without mounting or making requests, verifies development true -> AssistantRuntimeChat, false -> AssistantDevelopmentChat, production regardless of QA flag -> unavailable AssistantChat, no demo/fixture dependency in production, and server gate rejects missing pins/database, wrong target, unaccepted abuse or Preview/Production. Development bundles may contain demo definitions; selection tests assert the returned real component, not an unsupported claim that every development bundle excludes demo code. Demo fixture behavior cannot participate in that real execution path.

Validation: focused session/controller/transport/mode/API/runtime suite 89/89 PASS; typecheck PASS. Production build and final diff/secret checks recorded in session report. No application source or ignored env changed; only regression test and append-only docs added. Local Webpack server restored for the owner's single supported diagnostic question. Two historical real POSTs still count against five-question budget; three live-ask slots remain, not a claim of zero historical provider charges. No live ask/provider call, upload/index, migration, cleanup, disable/delete, allowlist change, commit/push/deploy, worktree deletion or Worker stash action. Tasks remain PARTIAL.

### 2026-10-11 — Existing 502 diagnostics and Guest chat lifecycle

Read existing Webpack logs and approved Development database using a target-pinned READ ONLY transaction; no new ask or provider call. Correlation bef508d1-6c53-4487-8e05-17d07571957b: embedding HTTP 200, retrieval 1, eligible evidence 1, generation HTTP 200, finish stop, usage 501 prompt + 18 completion = 519 tokens. Last validated stage GENERATION_OUTPUT_SCHEMA; rejection GENERATION_OUTCOME / OUTCOME_CONSISTENCY, public AI_INVALID_RESPONSE / HTTP 502. Existing combined guard does not identify whether unanswered/status or answerParts/status violated consistency. No raw response was retained or recovered. Strict rejection remains unchanged; split the same predicates only to emit safe custom issue paths unanswered or answerParts. Three diagnostic regression cases were red before this change and green afterward. No proven provider adapter, citation, grounding or persistence defect for this request; rejection precedes citation/grounding and successful completion.

Separate correlation 1f3c94a1-280b-4445-b40d-4a8d4e00f0a0 failed QUESTION_EMBEDDING_STARTED / PROVIDER_FAILURE, AI_UNAVAILABLE, embedding dispatched, generation not dispatched. Browser cancellation does not prove zero provider cost. Four recorded turns are FAILED, all Guest-owned; latest errors AI_INVALID_RESPONSE and AI_UNAVAILABLE. Failed question/response/provenance content is scrubbed; conversations are neither deleted nor expired and have no active turn. Scrubbed content was not recovered.

Proven lifecycle defect: installed Better Auth sets isPending=(current.data===null) during refetch. Settled Guest sessions have null data, so focus/online/session refetch temporarily produces unresolved. Previous AssistantRuntimeChat replaced the keyed authenticated subtree, disposing its memory-only controller and aborting in-flight transport, then rebuilt an empty controller when Guest settled. Transient authenticated-session errors also cleared that subtree. Red tests reproduced both boundary changes. Preserve a confirmed principal boundary during transient refetch/error, disable submit/keyboard/retry until auth and server bootstrap revalidate, and retain the same ready identity key. Confirmed login/logout/account switch or unauthorized response still clears the old identity. Guest cookie identity rotation changes the key. No persistent client cache, automatic POST replay, new idempotency key, restored scrubbed history, or retention change.

This lifecycle defect can occur without HMR. Exact React remount and auth transition of the owner's historical request were not instrumented; timing of session rebootstrap corroborates the path but does not establish exclusive causation. RSC GET and hot-update requests alone are not proof of a reset. No router.refresh/navigation exists in the assistant path. Full page reload/HMR remount can still clear memory-only chat; durable history restoration is not added in this scoped fix.

Validation: 180/180 focused tests across 11 files PASS, including controller UNKNOWN/error handling, HTTP/session key, boundary transitions, real/demo/production selection, server-rendered disabled composer, strict generation and diagnostics. Typecheck PASS; production build PASS; diff check PASS. Full suite and live ask not run. Production/Preview remain disabled, no env/allowlist change. Local feature Webpack restarted on port 3001 after build. Current IAB tab is no longer available, so no fresh browser lifecycle replay is claimed. Conservatively account four admitted attempts against five-question budget: one remaining, earlier provider usage still incomplete. Next supported owner question can diagnose the exact inconsistent field; successful answer remains unverified. Tasks stay PARTIAL. No commit/push/deploy, migrations, cleanup, document change, worktree removal or stash operation.

### 2026-10-11 — Final outcome consistency investigation (offline only)

ROOT_CAUSE=UNRESOLVED for historical correlation bef508d1-6c53-4487-8e05-17d07571957b. Existing evidence proves GENERATION_OUTCOME / OUTCOME_CONSISTENCY after provider HTTP 200, finish_reason=stop, 501+18 tokens and one eligible chunk. It does not identify the rejected field or retain a generation body. Completion token count is not proof of truncation. No historical body recovery, provider call, new ask/retry or database access occurred in this investigation.

Inspected actual prompt, JSON schema, Chat Completions envelope extraction, service mapping, diagnostic projection and Task191 discriminated response schema. Adapter parses message.content once and does not rewrite status/unanswered/parts; NFC/trim of answer text happens after outcome validation. ANSWERED requires nonempty cited parts and no unanswered aspects. PARTIAL requires nonempty cited parts and missing-information notice (provider unanswered=true maps to the existing safe constant notice). INSUFFICIENT_SOURCE and CLARIFICATION_REQUIRED require empty parts/citations and existing notices. Provider unanswered is internal, not a Task191 public field. Two strict predicates enforce unanswered === (status === PARTIAL) and nonempty parts exactly for factual outcomes. Provider JSON schema enforces shape and enum but does not encode these cross-field predicates; system instructions are compatible. No contradictory instruction or reproducible application mapping defect found. No prompt, schema, production code, grounding guard or citation rule changed in this task.

Expanded fake-provider HTTP/service/retrieval/adapter tests: all four valid outcomes produce Task191 SUCCESS only after mock persistence; each status with wrong unanswered and each status with contradictory parts produces HTTP502 at the same historical stage, safe diagnostic field path, failed persistence and no complete call. Valid outputs survive mapping with exact cited fixture text. finish_reason=length is rejected at GENERATION_ENVELOPE, malformed JSON at GENERATION_JSON; existing invalid citation, grounding, provider unavailable and persistence tests remain green. Empty retrieval invokes only the fake embedding request, never generation. Tests invoke handlers directly using Request objects and mocked fetch/store/database; no HTTP request is sent to localhost or an external service.

Guest regressions: UNKNOWN retains its exact pending object/key across repeated same-owner boundary refresh and send count stays one. Offline hook harness executes actual AssistantChat form/Enter/retry handlers: available=false blocks each path; true permits one fake send; subsequent revalidation does not retry UNKNOWN. Existing FAILED-preservation, unauthorized/login/logout boundary, readiness key, disabled-composer, controller disposal and production/demo isolation regressions pass. This is deterministic helper/hook coverage, not a real React/browser remount observation. Retention code unchanged: store checks deletion/expiry before replay/completion; mocked expired/deleted admission blocks retrieval/generation/completion. No persistent client history cache or scrubbed content recovery added. Database retention integration was not rerun because this task prohibits database writes.

Validation: 296/296 tests PASS across 12 focused files, zero skipped; typecheck PASS; production build PASS; diff check PASS; changed/untracked-file credential-pattern scan zero hits. No red application regression/fix pair is claimed: new tests passed against current implementation. Previous session's lifecycle and safe diagnostic fixes remain unchanged. Full suite/live browser/live acceptance not run. Production/Preview remain disabled. Remaining authorized live budget=1, unchanged. Diagnostics are ready for the owner's decision, but successful final live output is not guaranteed and historical field-level cause remains unavailable. Tasks remain PARTIAL. No commit/push/deploy, env/allowlist/document changes, migrations, cleanup, database writes, Worker stash or worktree operations.

### 2026-10-12 — Final US-21 acceptance checkpoint on TXH

Verified TXH at merge commit `46a86723694aa3aea9a5758531391b2ee4ec6c03`; the working tree was clean before this documentation-only append. Neon Development was checked in a target-pinned read-only transaction: 15/15 migrations complete, zero failed/incomplete, PostGIS and pgvector present, and the allowlisted TEST/SYNTHETIC QA fixture remained INDEXED with its current READY publication, one chunk and one embedding. No Neon migration, cleanup, document, or turn-content mutation ran. The browser's `POST /api/ai/session` may create or reuse a Guest identity row; that row-level side effect was not separately verified. US-19/20 implementation and Task191 contract were not changed.

Validation on this checkout: full Vitest plus disposable PostgreSQL/pgvector coverage 573/573, zero skipped; dedicated Task185 database cases 15/15; legacy script exit 0; workspace typecheck 4/4; Prisma schema validation PASS with Varlock loaded from `apps/web`; optimized production build PASS; merge diff whitespace check PASS. Changed-commit credential scan found no live credentials. Its only database-URL matches were dummy values in gate tests and an interpolated loopback-only disposable test URL. Scan of 107 generated client assets found no configured secret values or QA fixture source ID; a secret variable name appears without its value. No additional OpenAI generation/embedding or Blob calls were made. The prior live-question budget is exhausted under the current owner instruction; another provider call requires separate approval.

Owner-supplied live evidence retained: embedding HTTP 200 and pgvector retrieval; one ANSWERED result cited the synthetic QA fixture; one INSUFFICIENT_SOURCE returned HTTP 200. These prove technical behavior only for that synthetic fixture, not Hà Giang content. Follow-up and browser Guest refresh with a retained chat were not accepted live. In a fresh local browser smoke, `/assistant` selected the non-demo runtime; auth session and QA session bootstrap returned HTTP 200, but the anonymous composer remained unavailable/disabled. No ask was submitted. The deterministic Guest refresh/controller tests pass, but this browser result leaves Guest runtime acceptance PARTIAL; its response-to-UI cause was not established in this checkpoint.

Historical correlation `bef508d1-6c53-4487-8e05-17d07571957b` remains OPEN: generation returned HTTP 200 after one eligible retrieved chunk, then strict outcome-consistency validation produced HTTP 502 `AI_INVALID_RESPONSE`. The historical model field causing inconsistency is still unavailable. No live call was spent to investigate it, and no validation was weakened. REAL_HA_GIANG_CORPUS_EVALUATION remains NOT_EVALUATED because an authorized, provenance-verified corpus is not available.

The hourly cleanup workflow and its heartbeat monitor are present in TXH, gated to `master`; TXH is local and three commits ahead of `origin/TXH`, so the scheduler is not shown active on the default branch. Production cleanup remains disabled and no retention SLA run was observed. TASK192=PARTIAL; TASK193=PARTIAL; TASK194=PARTIAL; TASK197=PARTIAL. US-21 is not ready to close. No commit, push, deploy, migration, Neon cleanup, or Worker-stash operation was performed.

### 2026-10-12 — US-21 fast-track closeout gate

US21_CLOSURE=BLOCKED. No acceptance criterion was lowered and no task was marked Completed. Task191 contract remains unchanged; its recorded owner-review checkbox is not changed here. Owner-provided first-turn ANSWERED/citation and INSUFFICIENT_SOURCE evidence applies only to the TEST/SYNTHETIC fixture. Follow-up live acceptance, stable Guest browser readiness, verified Hà Giang corpus evaluation, deployed cleanup schedule/retention SLA, and resolution of historical correlation `bef508d1-6c53-4487-8e05-17d07571957b` remain outstanding. The latest owner navigation check working does not prove the earlier intermittent Guest/direct-navigation condition fixed. Historical AI_INVALID_RESPONSE is not attributed to a new ask.

Acceptance disposition: TASK192=PARTIAL (retrieval/eligibility implementation and synthetic integration pass; representative-corpus calibration absent); TASK193=PARTIAL (strict generation/grounding tests pass, historical outcome-consistency cause remains unresolved and real-corpus quality is not evaluated); TASK194=PARTIAL (persistence, ownership, idempotency and retention logic have disposable-DB evidence; live follow-up/Guest acceptance and deployed retention SLA absent); TASK197=PARTIAL (573/573 full suite and disposable PostgreSQL coverage are recorded, but live follow-up/browser and real-corpus evaluation are incomplete). Task195/196 UI and citation regressions are covered, but this does not substitute for those runtime acceptance gates.

Follow-up GitHub issues created: [Guest/browser readiness #1](https://github.com/TXHoai2309/KLTN/issues/1), [authenticated multi-turn/idempotency #2](https://github.com/TXHoai2309/KLTN/issues/2), [historical AI_INVALID_RESPONSE #3](https://github.com/TXHoai2309/KLTN/issues/3), [verified Hà Giang corpus evaluation #4](https://github.com/TXHoai2309/KLTN/issues/4), [retention scheduler/SLA #5](https://github.com/TXHoai2309/KLTN/issues/5), and [separate GPT-6 Luna configuration evaluation #6](https://github.com/TXHoai2309/KLTN/issues/6). These track work; they do not waive US-21 acceptance.

Final local validation: 286/286 targeted Guest/auth/controller, contract, retrieval, generation, HTTP, service and abuse tests PASS; typecheck PASS (4/4); production build PASS (29/29 pages). The previously recorded 573/573 Vitest/disposable PostgreSQL result is from the same unchanged code commit and was reused; no DB test or Neon operation was repeated. Prisma validation and the full credential/client-asset scan remain the same-checkpoint evidence recorded above. No application code, schema, environment, model, provider, or database content changed. Only append-only closeout evidence was added to this story and `docs/ai-progress.md`.

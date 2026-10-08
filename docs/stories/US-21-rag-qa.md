# US-21 — Hỏi đáp RAG có nguồn và hội thoại nhiều lượt

## Status

IN PROGRESS — Task 191 contract and Task 195 frontend implemented; owner review pending.
Task 195 adds chat UI with an isolated local simulation. Production Q&A remains
unavailable; no real endpoint, conversation persistence or RAG runtime exists.
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

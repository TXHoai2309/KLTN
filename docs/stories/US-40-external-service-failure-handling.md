# US-40 — External service failure handling and graceful degradation

## Status

IMPLEMENTED LOCALLY — NOT PROVEN (browser fault-injection and live-provider evidence unavailable)

## Epic

MVP reliability and graceful degradation

## Owner

N/A

## Goal / User Story

Là người dùng, tôi muốn các chức năng còn khả dụng tiếp tục hoạt động khi dịch vụ AI hoặc định tuyến gặp lỗi để sự cố bên ngoài không làm toàn bộ hệ thống ngừng sử dụng.

## Outcome

OpenAI and routing waits are bounded at their current service boundaries; routing absence cannot certify a Trip; AI/routing/business-data states remain distinct; public Explore/Culture and owned Trip reads remain independent of OpenAI.

## Source References

- Product Document: common error/exception handling, Constraint Validator and no-invention rules.
- System Specification: insufficient sources, external-service errors and performance.
- Architecture: Next.js App Router full-stack; current repository provider boundaries take precedence over historical provider text.
- Related stories: US-10, US-11, US-16, US-29A/B/C, US-30, US-31, US-34 and US-39.
- UI: current design system only. Open Design was reference-only because this story explicitly forbids a redesign.

## Dependencies

- Current OpenAI HTTP integrations and shared `AppError`/API envelope.
- Current Stadia routing adapter and Trip Validator.
- Existing manual Trip requirement form and mutation reliability contract.

## In Scope

- Timeout, cancellation and bounded body reads at uncovered OpenAI boundaries.
- Routing cancellation propagation and 10-second mandatory-check deadline behavior.
- Clear AI, routing and business-data failure states.
- Retry of the same Assistant attempt after a known AI technical failure.
- Automated service-isolation evidence.

## Out of Scope

- Provider replacement, circuit breaker framework, queue, cache or global external-service abstraction.
- AI prompt/model/retrieval-policy changes.
- Map provider changes, Trip business-rule changes or authentication changes.
- Schema, migration, environment or database-data changes.

## Business Rules

- OpenAI failure is `AI_UNAVAILABLE`; malformed/invalid structured output is `AI_INVALID_RESPONSE`; missing verified RAG evidence remains `INSUFFICIENT_SOURCE`.
- A missing/failed route produces a route reason and `INSUFFICIENT_DATA`, never zero duration or `SATISFIED`.
- Any mandatory Validator group with `INSUFFICIENT_DATA` keeps `canConfirm=false`.
- Missing opening hours/minimum duration is business-data insufficiency, not AI or routing failure.
- Existing successful legs remain intact when another leg is unavailable.

## Roles / Authorization

No authorization change. Public reads retain public visibility rules; private Trip reads retain current actor ownership checks.

## Ownership Rules

Unchanged.

## UX / UI Contract

- AI failure: “Trợ lý AI tạm thời không khả dụng”, safe description, working “Thử lại”, “Sửa câu hỏi” or “Nhập bằng biểu mẫu” where applicable.
- Routing insufficiency: “Không thể kiểm tra thời gian di chuyển” and the affected leg message.
- Other insufficiency: “Chưa đủ thông tin để kiểm tra”.
- Failure states include icon and text, do not expose raw provider details and do not discard the user's natural-language input.
- Current responsive/theme tokens are reused. Browser rendering at requested viewports is not proven in this execution because no Chrome, Edge or IAB surface was available.

## Data Contract

No persistence change. Existing `TravelLeg`, Validator finding and Assistant attempt contracts are reused.

## API Contract

Existing endpoints and envelopes remain unchanged. Provider failures continue through the current `AppError`/shared mapper; routing absence remains Validator data rather than a fake successful route.

## Error / Recovery

| Category | Meaning | Recovery |
|---|---|---|
| `AI_UNAVAILABLE` | timeout, network, 429/5xx or missing credentials | retain input/attempt and allow a bounded explicit retry |
| `AI_INVALID_RESPONSE` | malformed JSON, oversized or schema-invalid provider output | reject output; allow user retry/edit |
| `INSUFFICIENT_SOURCE` | no verified RAG evidence | explain source insufficiency; never fabricate answer/citation |
| route `INSUFFICIENT_DATA` | routing unavailable, timed out or invalid | identify affected leg; block confirmation |
| business `INSUFFICIENT_DATA` | missing opening/minimum-duration facts | identify missing business information |

No raw OpenAI/Stadia error body is returned to the frontend.

## Write Semantics / Idempotency

US-39 `SUCCESS`/`FAILED`/`UNKNOWN` mutation semantics are unchanged and are not merged with dependency/Validator status. Assistant retry reuses the same unresolved attempt instead of fabricating a completed turn.

## External Services

### OpenAI audit matrix

| Module | Provider budget | Existing behavior | US-40 change/evidence |
|---|---:|---|---|
| Q&A | 25s per provider call; 40s provider-work and 58s response budgets | abort, bounded body, safe diagnostics, no automatic retry | audited; existing timeout/error tests retained |
| Preference extraction | 15s total | one bounded retry for transient network/429/5xx | body read now abortable; retry wait and both attempts share one deadline |
| Destination Editorial | 25s V1; 240s V2 | abort, bounded body, detailed safe classification and atomic fallback | audited; unchanged |
| RAG embedding | 30s | safe error mapping and size limits | response-body read now abortable and post-body cancellation is checked |
| In-trip replan | 15s | module-specific structured client | audited; unchanged AI budget |
| Trip edit intent | 15s | module-specific structured client | audited; route interface now accepts cancellation used by in-trip validation |

### Routing audit matrix

| Scenario | Actual contract | Status |
|---|---|---|
| Valid route | validated duration/distance/provider only | PASS |
| Timeout/body stall | underlying fetch/body aborted within the configured maximum | PASS |
| 429/5xx/network/missing key/no route | safe route reason, no guessed duration | PASS |
| Invalid coordinates/mode/JSON/duration | rejected as unavailable/invalid route data | PASS |
| Multiple planner legs | one shared 10s deadline, maximum three in flight, successful legs retained | PASS |
| In-trip validation | timeout now forwards and aborts the underlying route signal | PASS |
| Validator outcome | unavailable route => `INSUFFICIENT_DATA`, `canConfirm=false` | PASS |

The current code uses Stadia. Historical/newer architecture references to another routing provider are not acted on because US-40 forbids provider replacement.

## Acceptance Criteria

- [x] OpenAI waits at audited boundaries are bounded and cancellation reaches fetch/body reads.
- [x] Timeout/network/provider/invalid-response categories are not converted into success.
- [x] Mandatory routing is bounded to at most 10 seconds and does not use a fake duration.
- [x] Partial routing evidence and affected-leg details are retained.
- [x] Explore/Search/Culture and Trip list/detail read services remain independent of OpenAI.
- [x] AI, routing, RAG source insufficiency and business-data insufficiency remain separate.
- [x] Natural-language input remains present and the manual form path remains available after AI failure.
- [x] US-29/30/31/39 automated regressions pass in the full suite.
- [ ] Browser fault-injection, requested viewport matrix and Light/Dark rendering are proven in a real browser session.
- [ ] Real OpenAI/Stadia outage behavior is proven against live providers (mock transport evidence exists).

## Test Plan

- Preference/embedding: success, timeout, uncooperative body, 429/5xx/network, invalid body/schema, cancellation and total retry budget.
- Routing: success, timeout, provider errors, invalid inputs/body/duration, abort, partial legs and overall deadline.
- Validator: route unavailable and business data missing remain distinct and cannot confirm.
- Isolation: OpenAI-down public Destination/Culture/Trip reads; routing-down reads and Validator; database failure is not AI failure.
- UI/controller: input preservation, clear error category, retry same attempt and distinct loading/failed/insufficient states.

## Expected Modules / Files

- `apps/web/src/modules/preference-extraction/openai-structured-client.ts`
- `apps/web/src/modules/rag-processing/openai-embedding-provider.ts`
- `apps/web/src/modules/in-trip/in-trip-validation.ts`
- `apps/web/src/modules/trip-edit/trip-edit-service.ts`
- `apps/web/src/modules/trip-validation/*`
- `apps/web/src/modules/trip-planner/planner-validator.ts`
- `apps/web/src/components/assistant/*`
- `apps/web/src/app/trips/new/natural-language-input.tsx`
- Matching Vitest coverage and service-isolation tests.

## Migration Impact

None.

## Environment Impact

None. No key or `.env` value was added/changed.

## Implementation Sequence

1. Audit current provider boundaries and tests.
2. Write failing cancellation/budget/isolation/UI tests.
3. Implement minimal boundary and copy changes.
4. Run targeted and full regression verification.
5. Record evidence and explicit limits.

## Acceptance Evidence

- Targeted external-service regression: 18 files / 457 tests PASS.
- Service-isolation suite: 4/4 PASS.
- Full root tests: Vitest 275 files / 3334 PASS, 32 files / 214 tests skipped by existing opt-in configuration, 1 todo; all legacy suites PASS.
- Root typecheck: 4/4 tasks PASS.
- Direct web production build: PASS, 53/53 pages generated, clean exit code 0.
- Root Turbo build completed its single build task and printed success but retained the already-documented idle process handle; it was stopped after completion and is not claimed as a clean exit.
- Impeccable UI detector on the three changed UI files: no findings.
- Browser E2E: BLOCKED in this execution; Chrome, Edge and IAB surfaces were unavailable. No production fault-injection endpoint was introduced.
- No database reset/write, schema, migration, dependency, provider, auth, commit or push.

## Open Questions

- Browser-level AI-down and routing-timeout injection across 360/390/768/1440 and Light/Dark remains NOT PROVEN.
- Live provider outage behavior remains NOT PROVEN; deterministic dependency-injected tests cover the code paths without spending provider calls.

## Handoff Notes

US-40 must remain NOT PROVEN until the missing browser evidence is collected. The implementation itself and automated regression gates are green.

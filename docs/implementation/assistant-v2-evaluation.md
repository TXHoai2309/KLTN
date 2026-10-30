# Assistant V2 evaluation and rollout gate

## Current gate — V2-10 conversation polish and final evaluation, 2026-10-30

**READY_TO_FREEZE_V2** (recommendation only; no push/deploy, V1 not deleted). Story: [V2-10](../stories/ASSISTANT-SKILL-RUNTIME-V2-10.md); decision: ADR-34; corpus: `assistant-v2-final-evaluation-corpus.json` (24 scenarios).

Final verification on the committed tree: `tsc --noEmit` clean, production webpack build (`KLTN_PERF_BUILD=1`) succeeds, `git diff --check` clean. Full vitest: 63 failures in 10 files, identical to the pre-existing baseline (none in V2 files).

### Evidence
- 11 live V2 conversations (Dev DB, disposable `[TEST]` user, deleted after): 0 hard failures, 0 caveat violations, 0 mechanical phrases, read-only turns left the proposal unchanged; S10 saved a trip for real (PROPOSAL_READY, DB-confirmed SUCCESS).
- Composer accepted/fallback (dev-server log, last 39 turns = final batch): 4 of 24 fell back, 16.7% (threshold 20%). PRESENT/REFINE 0/14, PLANNING_GUIDANCE 1/8, ASK_* and no-change 3/4 (small sample). Rows are matched to the batch by position, not by id.
- Controlled scenarios (9) are covered by existing unit/session tests, not separate runs.

### V1 / V2 comparison
| Class | Count | Cases |
|---|---|---|
| Comparable pairs | 4 | S11-S14 |
| V2 better | 4 | S11, S12, S13, S14 |
| V1 better | 0 | - |
| Equivalent | 0 | - |
| Not comparable | 2 | QA, homestay: V1 has no equivalent capability, so no fair pair exists |

Basis of "V2 better": questions asked before the first proposal (V1 5-7 with redundant re-asks of known days/vehicle; V2 0-2) and mechanical phrasing. Itinerary quality of V1 proposals was not scored.

### Manual rubric (author-scored, not independent)
Scale: Strong / Adequate / Weak. Excerpts from `.cache/v210-eval/final-v2.json` (the `[TEST]` prefix belongs to the fixture data).

| Criterion | Score | Evidence |
|---|---|---|
| Question efficiency | Strong | S01 asks only days then vehicle, then builds ("Bạn dự định đi mấy ngày? Có số ngày là mình dựng được bản nháp tuyến ngay."). S02-S06 ask nothing. V1 S11 took 6 questions including preference and date. |
| Context reuse | Strong | S03/S04 advice reuses the existing proposal; no repeated asks of days or vehicle (0 redundant questions across 11 scenarios; V1: all 4 pairs had one). |
| Input to implication | Strong | S04 "tôi muốn ngủ Mèo Vạc" rebuilds the route so day 1 ends in the chosen area and says so. |
| Planner usefulness | Adequate | S03 "nếu đi chậm thì sao" names a stop to drop and the load (3 stops, 68 phút). Replies are concrete, but area names occasionally come out lowercase ("khu vực đồng văn"). |
| Naturalness | Adequate | Proposals lead with the route then one caveat; S09 "Mình giữ nguyên lịch hiện tại, vì thông tin này không làm đổi cách bố trí." Fixed templates still read slightly formal, and ASK_*/acknowledge fall back often. |
| Grounding | Strong | Quantities are checked by unit; stops and times come from typed facts; unmet night areas are stated; no lodging names or prices (S09 homestay request answered as unsupported). |
| Mutation safety | Strong | S10: edit → "Phương án này chưa được áp dụng" → AWAIT_CONFIRMATION → APPLY_SUCCESS only after a DB-confirmed write; read-only turns never changed version. |
| Caveat discipline | Strong | S01/S10 carry exactly one caveat naming the cause ("vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại"); guidance turns carry none. |

### Known limits
Rubric is self-scored; the product-owner pair reading from the spec was not performed. Fallback rate is position-matched. ASK_* and no-change acknowledgements fall back often and are candidates for deterministic templates in a later story.

## Current gate — V2-07A closure, 2026-10-29

**DONE — READY_FOR_V2_DEFAULT (recommendation only).** Default configuration
remainsV1; no deployment/push or V1 deletion. The original V2-07 observations
below are historical and are superseded by this gate and the
[V2-07A story](../stories/ASSISTANT-SKILL-RUNTIME-V2-07A.md).

Authenticated encrypted capsules plus a shared DB owner/subject/version/lease
head remove the same-worker assumption. Live separate processes passed duration
on A→transport/proposal/refinement on B; saved-trip clarification on A→choice and
validated pending proposal on B→explicit DB-confirmed apply on production C.
Only day2 changed; day1/day3 were equal. Controlled tests cover UNKNOWN across a
fresh session, identical-key reconciliation and foreign/tampered/stale state.

Positive browser replacement passed with an explicitly synthetic, disposable
`[TEST] Lô Lô Chải` Dev fixture: real model, Stadia routing, Validator, one
publication, unchanged outside days and0 auto-saved Trips. No production name
special case or verified visitor-data claim was introduced. A different generic
destination fixture also passes. The live Dinh year question persisted
INSUFFICIENT_SOURCE with0 citations and no planning version change.

Actual IAB GPS was requested and reached the watchdog timeout without a position;
the browser exposed no usable permission-grant control. This is **not** a live
granted/denied PASS. Section21 permits documenting this environment limitation.
Live manual fallback automatically appeared, normalized a public-place fixture,
displayed `Thủ công` and continued safely. Controlled granted/denied/unavailable
tests pass. Future-day live edits used no LOCATION request. GPS code is unchanged.

| Representative user turn | Provider calls | Full planning generations | Retrievals |
| --- | ---: | ---: | ---: |
| Duration intake |2|0|0|
| Transport completes minimum brief |3|1|0|
| Culture refinement |3|1|0|
| Surgical replacement |2|0|0|
| Dinh year source-gap QA |4|0|1|
| Explicit saved-trip apply |0|0|0|

Understanding, existing selection and V2 language composition account for the
three-call draft/refinement path. Bounded edits, QA and apply avoid a full
planner regeneration. The V1 composer is not invoked. No duplicate full
generation was observed. Per-turn logs contain counts and registry identifiers,
not prompts, capsules, actor IDs or GPS. A full generation count of0 for bounded
replanning is intentional; executed action IDs identify that bounded work.

All20 [case classifications](assistant-v2-evaluation-classification.json) are
complete: **5 V2 better,0 V1 better,6 equivalent on stated safety dimensions,
8 not comparable,1 GPS environment blocked**. Historical paired live comparisons
are distinguished from controlled shared-contract checks and new live fixtures;
this is not a20-case paired superiority claim.

Verification:169 V2 tests PASS;186/186 including targeted bootstrap/AI-edit tests
PASS. Expanded1741-test run initially had53 failures; two stale tests were
updated (additive bootstrap runtimeVersion and accepted RBAC V2 Admin inheritance).
Exact targeted reruns plus assertion comparison leave the same51 historical
failures, no additions/removals and no suite errors. No production behavior was
changed for stale expectations. Production build PASS,49/49 pages; final
`tsc --noEmit` PASS after cleaning a malformed generated development type cache.

Fresh rollback after mutation: old V2 request409, V1 START200, V1 Trip page200,
unchanged DB during rollback. Browser V1 displays the5-stop result of V2's
6→5 mutation and its legacy in-trip UI reads the same Trip. No migration rollback
or code revert. Both owned test users and all owned data/session heads were
cleaned; the synthetic destination was removed and cookie/capsule manifests
replaced with cleaned markers. The local server was stopped after V1 verification.

Deployments opting into V2 must apply migration
`20261029030000_assistant_v2_session_head` first and share the existing auth
secret/database across workers. V1 remains available. GPS grant on a browser
with a real position source remains an environment-specific acceptance item;
no missing source fact or unavailable destination is fabricated to satisfy it.

## Historical V2-07 report

The remaining original sections describe V2-07 before hardening; their earlier
BLOCKED recommendation and same-worker limitation no longer set the current gate.

## Status and environment

**BLOCKED for full V2-07 acceptance; KEEP_V1_DEFAULT**, 2026-10-29.
Gated integration and the checks below are implemented. The exact positive
replacement and factual-answer examples remain limited by the eligible
Development dataset. They are not silently replaced with passing unit results.
No deployment, commit, push, V1 retirement or database migration occurred.

Acceptance used local Next16.3.8 on localhost:3010, Windows, bundled Node24.22.1.
The configured and actual Neon endpoint identities were checked as Development
before writes. Source/default configuration and the ignored environment file
remain V1; live V2 used only a process override. The local process was finally
restarted with V1 and rollback was verified.

The real corpus contains 9 visible destinations (6 pre-existing [TEST] planner
records) and 5 INDEXED/public-approved RAG documents. Lô Lô Chải is absent from
the eligible inventory. Dinh construction-date questions returned
INSUFFICIENT_SOURCE. No destination, source, approval or visibility was invented
or changed to obtain a positive demonstration.

Planning and presentation used the configured existing provider; captured actual
response metadata confirms gpt-6-luna, including high reasoning where requested.
QA retained its current effective configuration, understanding, embeddings,
retrieval, source validation, citations and persisted head. No provider migration
or replacement RAG/routing implementation was introduced. Stadia routing,
scheduler and deterministic Validator were exercised with real responses.

## Method and measured dimensions

The fixed [20-case corpus](assistant-v2-evaluation-corpus.json) defines behavior;
a definition is not a PASS receipt. Evidence is labeled LIVE, CONTROLLED,
PARTIAL or DATA-BLOCKED below. Controlled failures use actual service/session
boundaries with test fixtures; they are not claimed as live fault injection.

Measured dimensions are questions before draft, repeated captured facts, forced
questionnaire steps, input-to-planning implication, state preservation,
grounding, explicit mutation confirmation and unchanged unrelated days.
No synthetic eloquence score or invented win percentage is used.

The unmodified V1 PlanningClient sent real requests to the same planning endpoint.
V2 sent the same inputs through its gated adapter. A second paired sequence used
the same 3-day motorcycle setup, then the corpus's exact culture, group/pace,
nature correction, unavailable replacement, ambiguous request, QA and Save turns.
The different proposal availability after identical setup is part of the
workflow result. V1 QA delegation alone is not a complete V1 QA execution.

## Paired V1 versus V2 observations

| Case | V1 | V2 | Measured comparison |
| --- | --- | --- | --- |
|01: intent → 2 days → car | Three observed questions; still no draft, asks date. 7 HTTP operations, including checkpoints. | Two material questions, then preliminary draft; null dates and Save blocked. 4 HTTP operations including START. | V2 better: useful draft earlier. |
|02: 3 days + motorcycle | Captures facts, asks date; no draft. 3 HTTP operations. | Immediate draft, zero preceding questions. 2 HTTP operations. | V2 better: draft efficiency; both capture facts. |
|03: culture after setup | Acknowledges culture, asks date again; no draft. | REFINE_PROPOSAL with cultural-priority implication. | V2 better: implication and usable refinement. |
|04: culture/pace/group together | Captures volunteered facts, asks date; no draft. | Captures all facts and refines once; group count stays partial without invented category. All-in-one initial variant also drafts immediately. | V2 better: workflow; both capture facts. |
|05: latest nature correction | Captures nature, asks date; no draft. | REFINE_PROPOSAL explains new nature priority. Persisted needs confirm latest correction in browser continuation. | V2 better: usable refinement. |
|06: exact unavailable replacement | Asks to resolve Lô Lô Chải. | REPLAN_CLARIFY, proposal unchanged; no invented destination. | Equivalent safety only. Positive exact replacement is DATA-BLOCKED. |
|15: Save with no date | No Save; asks what operation is wanted. | No Save; returns generic clarification. | Equivalent refusal safety; V2 wording could be more specific. |

**5 V2-better, 0 V1-better, 2 equivalent on the stated dimensions, 13 not ranked.**
Do not present this as a 20-case complete paired victory. Cases07–09 also received
the same sequence inputs, but unresolved context/QA delegation means a complete
like-for-like result was not established; no winner is assigned.

HTTP operations are not model calls. Existing sanitized provider metadata proves
actual model execution, but complete per-case model-call attribution and
normalized latency were not retained for every paired request. The captured
metadata is partial (terminal output was bounded), so it is not a complete call
benchmark. This metric remains an evaluation limitation.

## 20-case corpus and outcomes

| ID | V1 observation / comparison coverage | V2 result and evidence |
| --- | --- | --- |
|01 | Paired live | LIVE PASS: minimum brief drafts after two questions; browser A confirms. |
|02 | Paired live | LIVE PASS: duration/mode captured once; immediate 3-day draft. |
|03 | Paired live | LIVE PASS: culture consequence and one refinement; browser C confirms. |
|04 | Paired live, two input shapes | LIVE PASS: multiple volunteered facts captured; no compulsory companions questionnaire. Browser B/C confirm draft/pace behavior. |
|05 | Paired live | LIVE PASS: nature correction replaces culture; browser response and owned persisted needs confirm NATURE. |
|06 | Paired live safety only | DATA-BLOCKED for exact Dinh→Lô Lô Chải replacement. Separate LIVE/browser positive bounded REMOVE changes day2 and preserves day1; domain edit tests cover valid replacement. |
|07 | Same sequence input, no isolated paired ranking | LIVE safe clarification, no guessed edit. Generic wording and preceding unresolved name limit the ambiguity-quality claim. Deterministic ambiguity tests PASS. |
|08 | V1 routes QA; full answer not paired | PARTIAL: Dinh date gives INSUFFICIENT_SOURCE and unchanged version/proposal. Separate real Đồng Văn question is ANSWERED with citation and unchanged browser proposal. Exact requested Dinh positive answer is not claimed. |
|09 | V1 routes QA; full answer not paired | LIVE safe result: synthetic-code question is QA_UNSUPPORTED, not proof of empty retrieval. Dinh question separately proves source insufficiency/zero invented citations. |
|10 | Not paired with V1 legacy in-trip interaction | LIVE/browser PASS: saved-trip proposal leaves complete DB snapshot unchanged. |
|11 | Not paired | LIVE/browser PASS: explicit confirmation then US-37 confirmed DB SUCCESS; day1/day3 unchanged. API exact-key replay changes no second revision. |
|12 | Not paired | CONTROLLED PASS: UNKNOWN freezes mutation, retains exact request/key, permits read-only QA; no destructive live acknowledgement-loss injection claimed. |
|13 | Not paired | LIVE/manual browser PASS: current-location request asks location; real map/manual coordinates yield validated proposal. No actual GPS permission-granted receipt; normalized granted/denied/unavailable tests PASS. |
|14 | Not paired | LIVE/browser PASS: future-day-only removal does not request GPS; all outside days preserved. |
|15 | Paired refusal safety | LIVE/CONTROLLED PASS: no Save with missing date; disabled browser Save. Generic verbal Save clarification is a wording limitation. |
|16 | V1 not driven through full questionnaire to Save | LIVE/browser PASS: exact date, fresh passing checks, explicit Save, canonical DB Trip and detail page. |
|17 | Controlled provider cases, no paired live fault | CONTROLLED PASS: invalid/empty/timeout/provider/unsupported output maps safely. Live PACE_LIMIT rejection remains rejected; browser Validator rejection is friendly and does not offer apply. |
|18 | V1 continuation not fully paired | CONTROLLED PASS: agreement after QA re-shows pending question/proposal and requires another confirmation. |
|19 | V1 reads DB after rollback | LIVE/browser PASS: reload removes old confirm controls; “Áp dụng đi” in fresh session refuses stale application; DB unchanged. Worker-loss test rejects old handle. |
|20 | V1 and V2 gate/security tests plus live configuration change | LIVE PASS: same endpoint V2→V1 rollback; old V2 request409; legacy V1 START200; bootstrap v1; saved Trip page200; browser shows V1. |

## Browser acceptance receipts

All interaction below used the real in-app browser and authenticated disposable
Development account through normal login. No fake geolocation, browser fetch
injection, model stub or DOM state mutation was used.

- **A, minimum brief: PASS.** Exact three turns create a 2-day/car card, real
  route map, provisional date warning and disabled Save.
- **B, all-in-one: PASS.** A 3-day/motorcycle/culture/moderate/group2 request
  immediately creates a card; duration/mode are not asked again.
- **C, refinement: PASS.** Culture and “Đi vừa phải thôi” explain consequences
  and each publish an updated card without optional-field questioning.
- **D, bounded edit: positive alternative PASS; exact replacement DATA-BLOCKED.**
  “Bỏ Cột cờ Lũng Cú khỏi ngày2, giữ nguyên ngày1” removes only that stop;
  DOM day1 equals the previous card. Lô Lô Chải is unavailable.
- **E, QA interleave: PARTIAL for exact positive example.** Real Đồng Văn QA
  preserves the proposal and shows its internal citation title/section;
  null public URL is explicitly disclosed without an invented link.
  “Cho điểm đó vào ngày2” returns a safe rejected edit, preserving the card.
  This is not a successful positive referent edit. Dinh positive grounding is
  absent; live API gives source insufficiency rather than fabricated facts.
- **F, saved trip: PASS.** Explicit Save creates DB Trip; UI opens detail and
  in-trip. Ambiguous remove asks which visit, selecting listed visit3 proposes
  day2 change. Pre-confirmation DB is equal. After reload the old confirmation
  disappears and a bare agreement cannot apply it. A newly requested proposal
  is explicitly confirmed; DB goes from6 to5 visits and day1/day3 remain equal.
- **G, manual: PASS with documented GPS limitation.** Today's owned fixture asks
  material location, opens the existing real manual map, accepts a public-place
  coordinate fixture, displays MANUAL/“Thủ công”, and renders the Validator's
  travel-time violation. Apply is unavailable; cancellation and DB checks confirm
  no write. Actual permission-granted GPS was not requested/verified on this
  device. Existing granted/denied/unavailable tests cover normalization/fallback.
- **Controlled error UI: PASS.** Invalid/stale application after reload and the
  manual travel-time rejection show Vietnamese structured failure messages,
  no raw stack/[object Object], no false success and no enabled apply.
- **360px: PASS for exercised V2 views.** A screenshot exposed a V1 sidebar-shell
  class wrongly reused as V2's root. The dedicated conversation column fixes
  layout; measured width360, scrollWidth345. Viewport override was reset.

Local ignored receipts include browser-planning.txt, browser-surgical.json,
browser-all-in-one.txt, browser-in-trip-proposal.txt, browser-apply.txt,
browser-manual.txt and screenshots in .cache/v207. They contain synthetic fixture
content, not credentials. API and DB receipts are separate from browser proof.

## Architecture and safety review

- Gate defaults to V1; old V1 requests and UI remain available.
- Thin route, fresh auth, server ownership/persisted RBAC and admission remain.
- Generic runtime/registry/action allowlist/schema boundaries are retained;
  orchestration delegates planning, edits, source-only QA and in-trip work.
- Planning-state reads and QA stay read-only; generated candidates and model
  wording cannot grant validity or authorize a write.
- Save is an explicit UI operation, not a model action. US-37 handles apply.
  UNKNOWN keeps the exact domain request/key; no consequential automatic retry.
- No new skill, booking, speculative multi-agent, streaming, provider/SDK
  migration, source approval workflow or schema migration is introduced.
- Process-local handles fail safely after loss/rollback; this is not evidence
  of multi-instance/serverless continuity. Global capacity16 and idle TTL30
  minutes are bounded acceptance scaffolding, not a production scale claim.

Live auth/security: Guest401, foreign Trip404, owner Traveler200, foreign handle409,
unconfirmed Save400, persisted Admin-owned Trip200 and missing/foreign Trip404.
Only the own fixture's temporary role changed, and it was restored.
The actual Dev endpoint was verified. All four task-created accounts, owned
Trips, QA/planning rows, sessions and matching idempotency records were cleaned;
no existing user, RAG source or destination was changed.

## Integration fixes found by verification

1. Normalize exact-date understanding to plain JSON before strict internal
   idempotency; undefined departureWindow had been stripped only by V1 HTTP.
2. Preserve trusted ownership AppError status on saved-trip START.
3. Recover canonical version when REVIEW commits before initial generation fails;
   return PROPOSAL_FAILED, no automatic regeneration, no candidate/Save, freeze
   genuinely uncertain publication. Real PACE_LIMIT remains enforced.
4. Reject presentation denying the generated itinerary; fallback changes wording
   only, without replaying business work.
5. Lazy-load manual map to avoid importing browser/CSS code into planning startup
   and ordinary popup tests.
6. Separate V2's one-column shell from V1's sidebar flex shell; verify 360px.
7. Show returned internal citation title/locators when sourceUrl is null, without
   changing V1 presentation or inventing a URL; display authoritative location
   source in the V2 UI.

## Automated verification and baseline

Final focused run: **13 files,162 PASS,0 failures**.
Relevant full regression: **80 files,1117 PASS,51 failures,16 skipped,1 todo**.
The exact51 failing test identities match .cache/v206-baseline/current.json:
**0 added,0 removed,0 suite-load errors**. Historical debt is48 QA failures plus
3 in-trip failures. Their assertions were not weakened or suppressed; see
[V2-05 audit](assistant-skill-runtime-v2-05-qa-baseline.md) and
[V2-06 audit](assistant-skill-runtime-v2-06-baseline.md).

TypeScript tsc --noEmit PASS. Isolated production build PASS (49/49 pages);
final repeat after location-source label also PASS. Git diff --check PASS.
No database schema/migration change. The opt-in tracked live harness ran
successfully:8 real API requests with expected minimum/refinement/QA results,
then its exact-owned-fixture cleanup succeeded. Node syntax check PASS.
The final text-only source label was typechecked/built; full regression already
covers unchanged business behavior and shared UI import paths.

Receipts: .cache/v207/focused-closure.json, regression-closure.json,
comparison.json, build-final.log, live-rollback.json, cleanup.json and
.cache/v207-live/api-results.json. Sensitive fixture manifests are ignored and
were replaced with cleaned markers after successful cleanup.

## V2-07A initial continuation notes (superseded by closure above)

Hardening is in progress; see `../stories/ASSISTANT-SKILL-RUNTIME-V2-07A.md`.
The previous same-worker implementation has been replaced with an authenticated
encrypted client capsule plus a shared DB version/lease head. Focused run:
166/166 passed; later replacement fixture suite:30/30 passed. Typecheck passed.
The additive metadata migration has been applied to the verified Development DB.

The new live acceptance has not completed: localhost sandbox EACCES was followed
by memory allocation failures during auth-route compilation and broad regression.
Provider metrics are now instrumented, but no new live per-turn metrics receipt
has been established. All20 final classifications, real cross-process mutation,
GPS acceptance and post-change rollback remain open. Previous V2-07 receipts
below remain historical and do not satisfy those new gates.

## Rollback and outstanding acceptance

Live configuration rollback is **PASS** on the same localhost endpoint:
old ASSISTANT_V2 TURN409/ASSISTANT_RUNTIME_CHANGED, V1 START200 with runtime=v1,
bootstrap200/runtime=v1 and owned Trip detail200. The browser reloaded into the
existing V1 in-trip view. DB snapshot equals the pre-rollback snapshot. Source
and environment files were not reverted/edited to achieve this.

**KEEP_V1_DEFAULT.** Required positive acceptance remains incomplete:

1. Supply an approved eligible Development fixture for the exact Lô Lô Chải
   replacement and an authoritative approved source if a positive Dinh
   construction-date answer is mandatory. Current absence is not a code pass.
2. Complete the remaining like-for-like V1 comparisons/per-case provider-call
   attribution; only7 cases have ranked paired outcomes. Existing controlled
   safety tests are not a substitute for this missing evaluation evidence.
3. Review the safe but generic referent-edit/Save clarifications seen live.
   Do not claim the requested successful QA→referent-edit example passed.
4. Accept or resolve same-worker continuity before general serverless rollout;
   reload intentionally loses transient dialogue/proposals, and V2 does not
   provide V1 history/page-popup handoff continuity.

No claim of DONE, READY_FOR_V2 or Production activation is made. These are
specific acceptance/data/deployment limits; the current51 historical failures
are separately recorded baseline debt.

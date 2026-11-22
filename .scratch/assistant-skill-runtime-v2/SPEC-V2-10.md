# SPEC V2-10 — Conversation Polish & Final Muse-like Evaluation

**Triage label:** `ready-for-agent`
**Tracker:** local (`.scratch/assistant-skill-runtime-v2/`). No tracker configuration or label vocabulary exists in the repo yet (`/setup-matt-pocock-skills` has not been run), so the label is recorded here by convention.
**Blocked by:** none (V2-01 → V2-09 are DONE)
**Source:** the V2-10 task prompt, the V2-08 and V2-09 stories, ADR-32, ADR-33, and the grilling round of this session (all ten recommended answers accepted).
**Next ticket:** none. This is the last ticket of the V2 phase; no V2-11 is planned unless a new product need appears.

## Problem Statement

A traveler talking to the Assistant V2 gets the *right* behaviour but not yet the *voice* of a travel planner. The system is correct (Validator authority, grounded answers, read-only advice, bounded edits, overnight areas) yet many replies still read like workflow status:

- A new itinerary proposal opens with a technical status ("Đây là đề xuất sơ bộ, chưa lưu. Một số kiểm tra chưa đủ dữ liệu…") before any useful planning judgement, and the same caveat repeats on almost every turn.
- The reply checks themselves force that phrasing: a proposal reply is rejected unless it contains the literal words for "preliminary" and "insufficient data", and a refinement reply is rejected unless it contains per-topic keywords and no question mark. A fluent, useful model reply is therefore thrown away and replaced by a fixed sentence.
- Most replies are not model-written at all: after an edit, a failed generation, a factual answer, and everything in a saved-trip session, the user sees fixed template sentences such as "Đề xuất sơ bộ đã chỉnh ở ngày 2."
- Numbers in model wording are validated against a single pool of digits, so a model can state "7 giờ" or "3 tiếng" just because that digit appears somewhere in the facts.
- Nobody has measured, across whole conversations, whether V2 actually behaves like a planner: how many questions come before a draft, how often caveats repeat, how often a model reply is rejected, and whether V1 is still better anywhere. The existing evaluation set (20 cases) predates planning guidance, fallbacks and overnight reasoning.

The traveler's experience is a correct but mechanical assistant. The team cannot yet say with evidence that V2 is ready to be frozen.

## Solution

Make the Assistant talk like a planner while keeping every safety and business invariant, and prove it with a final multi-turn evaluation.

From the traveler's side:

- A proposal begins with the strategy ("Với 2 ngày 1 đêm đi xe máy, mình giữ ngày đầu theo hướng … và nghỉ khu vực Đồng Văn…"), then the itinerary, then one short, specific caveat ("Chưa có ngày khởi hành nên mình chưa kiểm tra chính xác giờ mở cửa.").
- Caveats appear once, on the turns that create or change a proposal, and do not repeat on read-only turns (advice, factual answers, clarifications, "no change").
- Advice reads like planner advice; edits are explained as a change ("Mình đã bỏ Lũng Cú khỏi ngày 2; ngày 1 giữ nguyên, ngày 2 nhẹ hơn trước."); factual answers are direct; clarifications ask only the missing material fact; failures say what happened and what to do next.
- A saved trip always keeps three clearly different states: a proposal that is not applied, a proposal awaiting confirmation, and an applied change that is stated only after the database confirmed the write.
- Numbers the model states ("N phút", "N điểm", "ngày N", "N đêm", a clock time) must match facts of the same kind.

From the team's side:

- The reply checks are split into **safety invariants** (kept strict) and **style rails** (removed or relaxed).
- Fixed replies stay code-built from verified facts (no new model call) and are rewritten to sound natural.
- A final evaluation of 24 scenarios, a measured composer-rejection rate, and explicit freeze thresholds decide `READY_TO_FREEZE_V2` or `MORE_WORK_REQUIRED`.

## User Stories

1. As a traveler, I want the first proposal to start with how the trip is shaped and why, so that I understand the plan before reading caveats.
2. As a traveler, I want a proposal for "2 ngày 1 đêm đi xe máy" to say where day 1 ends and where I would pause overnight, so that I can picture the trip as days and a night, not just a list.
3. As a traveler, I want the itinerary to come after the summary and the caveat to come last, so that the useful part is never buried under system language.
4. As a traveler, I want exactly one short caveat when a proposal is created or changed, so that I know it is not saved without being nagged.
5. As a traveler, I want that caveat to name the concrete cause (for example no departure date, so opening hours are unchecked), so that I know what to do to complete the plan.
6. As a traveler, I want no caveat on a reply that only gives advice, answers a fact, asks a question or confirms nothing changed, so that conversation feels natural.
7. As a traveler, I want the caveat back when I ask about the checks, the date or saving, so that I am never misled about the status of my plan.
8. As a traveler, I want the Assistant to say what a short answer implies ("2 ngày thì mình giữ tuyến gọn…"), so that my input visibly shapes the plan instead of being repeated back.
9. As a traveler, I want "mình thích văn hóa" to lead to a statement about prioritising cultural depth over check-in stops, so that I see the effect of my preference.
10. As a traveler, I want "đi vừa phải thôi" to lead to fewer stops and more time per stop, so that the plan reflects my pace.
11. As a traveler, I want not to be told "Mình ghi nhận…" as a default acknowledgement, so that replies carry information.
12. As a traveler, I want not to be asked "Bạn muốn điều chỉnh cụ thể điều gì?" when I only asked for advice, so that I get an answer instead of a question.
13. As a traveler, I want to ask "gợi ý cho tôi nên đi như nào" and get route judgement, a day-by-day suggestion, one useful fallback and a necessary caveat, so that I get real planner advice.
14. As a traveler, I want "nếu đi chậm thì sao" to give one concrete fallback (which stop to drop), so that I have a safe plan B without a list of options.
15. As a traveler, I want "đêm đầu nên nghỉ đâu?" to be answered with an area suggestion derived from my itinerary, so that advice is grounded and not invented.
16. As a traveler, I want the overnight wording to say it is an area suggestion and not a homestay or a booking, so that I never think accommodation was chosen or reserved.
17. As a traveler, I want that "not a booking" clarification stated once, not on every turn, so that the wording stays light.
18. As a traveler, I want "tôi muốn ngủ Mèo Vạc" to rebuild the itinerary and explain what changed, so that my choice has a visible effect.
19. As a traveler, I want to be told plainly when a night area I chose cannot be arranged, naming that area, so that I am never silently ignored.
20. As a traveler, I want "bỏ Lũng Cú đi" to say what was removed, which day changed, which days stayed the same and whether the changed day is now lighter, so that I understand the edit.
21. As a traveler, I want an edit to a proposal to be described as a change to the proposal, so that I do not think it was applied anywhere else.
22. As a traveler with a saved trip, I want a requested change to be described as a proposal that is not yet applied, so that I know my saved trip is unchanged.
23. As a traveler with a saved trip, I want a clear "awaiting your confirmation" state before anything is applied, so that nothing changes without my explicit approval.
24. As a traveler with a saved trip, I want "Mình đã áp dụng thay đổi" only after the system confirmed the write, so that I can trust the statement.
25. As a traveler with a saved trip, I want an uncertain result to be reported as uncertain, with further edits blocked, so that I am never told something succeeded when it did not.
26. As a traveler, I want a factual question answered directly ("Theo nguồn hiện có, …"), so that I get the fact without preamble.
27. As a traveler, I want "Hiện dữ liệu mình có chưa đủ nguồn xác minh để trả lời chắc chắn" when sources are missing, so that the Assistant never answers from model memory.
28. As a traveler, I want a factual question to leave my plan untouched, and my next planning request to continue naturally, so that I can mix questions and planning.
29. As a traveler, I want a clarification to ask only the single missing material fact ("Bạn muốn chỉnh ở ngày 1 hay ngày 2?"), so that I am not handed a questionnaire.
30. As a traveler, I want a failed itinerary generation to say what happened and what I can do next (for example try a more compact route), so that I am not left at a dead end.
31. As a traveler, I want failure messages without internal error text, so that nothing technical leaks.
32. As a traveler, I want my stated needs preserved after a failure, so that I can retry without repeating myself.
33. As a traveler, I want the Assistant to use what it already knows (days, nights, vehicle, preferences) instead of asking again, so that the conversation moves forward.
34. As a traveler, I want not to hear fingerprints, versions, capsules, action ids, intent names or provider error classes, so that the Assistant sounds like a person.
35. As a traveler, I want the Assistant not to claim a plan is perfect, certain or the best, unless the checks support the claim, so that I can trust its confidence.
36. As a traveler, I want a passing set of checks stated as what was actually checked ("đáp ứng các kiểm tra về di chuyển và thời lượng"), so that "valid" is never a vague claim.
37. As a traveler, I want a violated check named (which check failed), so that I know what to change.
38. As a traveler, I want the Assistant never to invent prices, hotels, availability, event dates, travel times or attraction facts, so that fluent wording cannot hide invented data.
39. As a traveler, I want numbers in replies (minutes, stops, days, nights, clock times) to match the plan, so that I can act on them.
40. As a traveler, I want a request to find homestays to get an honest "not supported" reply with no fabricated results, so that I am not misled.
41. As a traveler, I want advice about the *latest* proposal after a question or an edit, so that guidance never refers to an older plan.
42. As a traveler, I want a pending question to survive a side question, so that I can resume where I stopped.
43. As a product owner, I want style rules separated from safety rules in the reply checks, so that I can improve wording without weakening a safety guarantee.
44. As a product owner, I want fixed replies to stay code-built from verified facts, so that the most safety-sensitive replies cannot be changed by a model.
45. As a product owner, I want a measurable rate of model replies rejected into fixed fallbacks per goal, so that I know whether the checks are too strict or the instructions are too weak.
46. As a product owner, I want that measurement to contain counts only, so that no user text is logged.
47. As a product owner, I want 24 evaluation scenarios, mostly multi-turn, so that behaviour is judged across a conversation and not a single message.
48. As a product owner, I want a long Muse-like conversation (brief, proposal, advice, fallback, overnight advice, overnight change, latest-plan advice, factual question, edit) run live, so that transitions are verified end to end.
49. As a product owner, I want comparable scenarios run against V1 and classified as V2 better, equivalent, V1 better or not comparable, so that V2 is only frozen if it is not worse.
50. As a product owner, I want any scenario where V1 is better to block the freeze, so that a regression is never hidden.
51. As a product owner, I want automated metrics (questions before a proposal, redundant questions, caveat repetition, technical jargon, mechanical phrases) plus a documented manual naturalness rubric with excerpts, so that "natural" is judged on examples.
52. As a product owner, I want to read six paired V1/V2 excerpts myself as the final tie-break, so that the judgement is mine, not only the author's.
53. As a product owner, I want an explicit `READY_TO_FREEZE_V2` or `MORE_WORK_REQUIRED` recommendation with thresholds, so that closing the V2 phase is a decision backed by numbers.
54. As a developer, I want existing tests that pin old wording updated to assert behaviour (state, claims, required facts) instead of exact sentences, so that future wording changes do not break tests.
55. As a developer, I want the glossary to define planning guidance, trip structure, overnight anchor, night-area preference and caveat policy, so that docs and code use the same words.
56. As a developer, I want an ADR recording that safety gates differ from style gates and that fixed replies belong to code, so that a future change does not undo the split by accident.
57. As a maintainer, I want V1 untouched and the V1 rollback switch working, so that V2 can still be turned off.
58. As a maintainer, I want authentication, ownership, capsule verification and confirmation behaviour unchanged and re-tested, so that polish cannot open a security gap.
59. As a tester, I want the evaluation to keep conversation behaviour separate from Dev fixture quality (the `[TEST]` prefix on destination names), so that fixture naming is not scored as a conversational defect.
60. As a tester, I want scenarios that cannot be forced live (forced failure, uncertain write, saved-trip apply) covered by controlled tests, and the saved-trip case attempted live once, so that every scenario has evidence.

## Implementation Decisions

**Reply checks: safety vs style (Q1).**
- Keep as hard gates: never claim a proposal is saved, applied or valid without the evidence that supports it; never name lodging, prices, availability or offer to book; state an unmet night-area preference naming the area; state "last known" wording while a previous write is uncertain; never claim a change was made on a read-only turn; at most one question; no links or markup.
- Remove or relax as style rails: the forced literal "preliminary" wording on proposals, the forced literal "insufficient data" wording, the per-implication keyword requirements and the ban on a question mark in refinement replies.
- A proposal-creating or proposal-changing reply must convey "not saved" with one short clause (any wording) and must name the concrete cause of any incomplete check (for example the missing departure date and the opening hours it blocks).

**Caveat policy (Q2).** Stateless, decided per turn type, with no new conversation state:
- Turns that create or change a proposal (first proposal, refinement, rebuild, edit) carry exactly one short caveat clause.
- Read-only turns (guidance, factual answer, clarification, "no change" acknowledgement) carry no caveat unless the user's message is about checks, the date or saving, in which case a short relevant caveat is included.
- A short clarifying statement about overnight areas ("area suggestion, not a booking") appears at most once per reply and is not repeated on read-only turns.

**Fixed replies stay in code (Q3).**
- Edit outcomes, factual-answer wrappers, generation failures, clarifications for edits and every saved-trip reply remain deterministic and are rewritten into natural Vietnamese from verified facts. No model call is added.
- Edit outcomes state what was removed, added or moved, which days changed, which days were unchanged, and whether the changed day became lighter or denser when the stored schedule supports it. The dependency-acceptance wording for cross-day effects is preserved.
- Saved-trip replies keep three explicit, distinct states: proposal not applied; awaiting explicit confirmation; applied only after the database confirmed the write. The uncertain-result wording and the block on further changes remain.
- Failure replies map stable failure codes to "what happened + what to do next" and never expose raw error text. Unknown causes use an honest generic reply.
- Direct factual answers start with the answer; an insufficient-source result says sources are insufficient, with no model-memory fallback.

**Model-composed replies.** The model composes only the first questions, clarifications, proposal and refinement replies, and planning guidance. Instructions stay small and per-goal (structured response plan plus short behavioural rules); no single large prompt. The ordering rule is: answer the user's actual need, then the planning consequence, then the plan or change, then only the relevant caveat. Implication wording is concrete (what will change in the plan) and is not a paraphrase of the input. Mechanical openers ("Mình ghi nhận…", "Thông tin của bạn là…", a generic "what do you want to adjust") are not used as default acknowledgements; they are counted by the evaluation as a metric, not hard-banned in model output.

**Validation wording.** Map each technical status to a user-facing sentence: missing date → opening hours cannot be checked yet; violation → the failed check is named; passing → state which checks were satisfied; never use validator vocabulary, never claim "perfect", "certain" or "best" without evidence.

**Number safety by unit (Q4).** Replace the single pool of allowed digits with checks by unit: counts of minutes, stops, days, nights and clock times must match typed facts of the same kind (travel minutes of that leg, stop count of that day, day numbers, stated nights, stored times). Quantities in hours or kilometres, and any other quantified claim, are rejected unless a fact of that kind exists. No general-purpose number parser.

**Technical leak.** The final reply never contains fingerprints, versions, capsule or workspace terms, action ids, intent names or provider error classes. A lint over replies in the evaluation counts violations.

**Metrics (Q9).** Extend the existing per-turn numeric metrics with an accepted/rejected-to-fallback counter per composed goal (counts only, no text). Use it to measure the rejection rate and to decide, from live evidence only, whether guidance and factual replies need to enter recent dialogue memory. No memory refactor unless the live conversation shows a real problem.

**Context recall boundary.** Only the current session state, the current proposal, the authoritative saved trip and supported recent dialogue are used. The Assistant never claims to remember anything outside that state.

**Evaluation (Q5–Q8).**
- 24 scenarios, mostly multi-turn: 10 live on the Development database with a disposable owned user (including the long Muse-like conversation: brief → "2 ngày 1 đêm" → "xe máy" → proposal → advice → "nếu đi chậm" → "đêm đầu nên nghỉ đâu" → "ngủ Mèo Vạc" → "lịch mới ổn không" → factual question → bounded edit); 8 controlled with a fake model (forced generation failure, uncertain write, saved-trip proposal and apply, clarifications); 6 paired V1 runs for comparable cases (minimal brief, all-in-one, advice, factual question, edit, homestay request). Other scenarios are classified "not comparable".
- Live runs in two batches, about 150 turns, disposable user and fixtures deleted after each batch; V1 is not modified.
- The saved-trip scenario is attempted live once through the explicit save flow with an exact date and a passing check set on the fixture data; if the fixture data cannot reach a passing proposal it falls back to a controlled test and the limit is documented.
- Dimensions: question efficiency, redundant questions, context reuse, input→implication, proposal usefulness, guidance usefulness, mutation safety, grounding, clarification quality, technical-jargon leakage, caveat repetition, naturalness. Automated metrics plus a documented manual rubric with excerpts; the product owner reads six V1/V2 pairs as the tie-break. No model-as-judge.
- Evaluation separates conversation behaviour from Dev fixture quality: the `[TEST]` destination prefix is ignored by wording metrics and is not hidden in the UI.
- Freeze thresholds (all required for `READY_TO_FREEZE_V2`): 100% of read-only turns leave proposal, version and needs unchanged; 0 redundant questions for known facts; 0 technical-jargon leaks; at most one caveat clause on create/change turns and none on read-only turns; composer rejected-to-fallback rate at most 20% on model-composed goals; no main scenario where V1 is better. A V1-better case blocks the freeze and must be investigated.

**Documentation (Q10).** Add to the glossary: Planning guidance, Trip structure, Overnight anchor, Night-area preference, Caveat policy. Add ADR-34: safety gates differ from style gates; fixed replies belong to code, not to the model. Update the V2 story record and the progress log; update the V2 evaluation document with the 24-scenario results and classification.

**Invariants preserved.** Validator authority; grounded answers; proposal versus saved distinction; explicit confirmation before any apply; read-only guidance; bounded edits; blocking on an uncertain write; cross-worker state and capsule ownership/version checks; overnight as an area suggestion only; no accommodation invention; V1 rollback.

## Testing Decisions

**What a good test is.** It asserts external behaviour: which claims a reply makes or refuses to make, which facts it must contain, what state is left unchanged, how many model calls or generations happened. It never asserts an exact sentence unless the sentence is a safety statement (for example "not applied" for a saved-trip proposal). Wording is checked through required facts and forbidden claims, not equality.

**Seams (confirmed by the owner, 2026-10-30; the live evaluation is a report, not a unit seam).**
1. *Primary seam – the planning-session turn:* send a user message with a fake classifier and fake composer and observe the reply, the response plan, and the session state (proposal, version, needs, pending question, uncertainty). This single seam covers caveat policy, templates, advice versus mutation, clarifications, failure wording, overnight wording and context reuse. It also covers the saved-trip session turn for the proposal / awaiting-confirmation / applied states and the uncertain-write block.
2. *Secondary pure seam – the reply acceptance rule:* a table test over the pure function that decides whether model wording is accepted, for number-by-unit rules, forbidden claims and required facts. It is the cheapest place to test the number hardening.
3. *Live evaluation seam (not a unit test):* the existing live script pattern against the real model, routing, retrieval and the Development database for the 10 live and the paired V1 scenarios; results are a report, not CI tests.

**Prior art.** The V2-08 guidance tests and the V2-09 trip-structure tests (session turn with a fake classifier and stubbed model request, explicit before/after state assertions, capsule-transfer test), the V2-04 replanning tests, the V2-05 factual-answer interleave tests, the in-trip V2 tests for the saved-trip states, and the V2-08/V2-09 live scripts with their result reports and fixture cleanup.

**Modules under test.** Response plan and fixed reply templates; the reply acceptance rules and number checks; the model-composer instructions (through its observable acceptance rate); the saved-trip reply plan; the metrics counter; the evaluation harness (its metric computations are unit-tested on recorded transcripts).

**Regression.** V2 suite, planning suite, guidance, trip structure, replanning, factual-answer, in-trip, feature gate, capsule and cross-worker, authentication and role checks, type check, production build and `git diff --check`. Known baseline failures stay documented separately; the target is zero new failures.

## Out of Scope

- Accommodation search or recommendation, booking, prices, availability, weather, place research.
- Persisting the overnight annotation with a saved trip, or any lodging schema.
- A new planner, new skills, a multi-agent architecture, an AI SDK migration, a Responses API migration.
- Deleting V1 or changing V1 behaviour.
- Populating or cleaning the Development corpus; hiding the `[TEST]` prefix in the UI.
- A durable memory system beyond the current session, saved trip and recent supported dialogue.
- A model-as-judge for naturalness.
- Major UI redesign.
- Any V2-11 work.

## Further Notes

- Three live defects already seen in V2-08/V2-09 show why live evidence is required: a prompt that told the model where day 1 must end made it over-pack a day; a failed night-area preference stayed in state and poisoned later rebuilds; and a label already starting with "khu vực" produced "khu vực khu vực". The evaluation should assume wording changes can break behaviour in ways controlled tests do not reveal.
- The reply acceptance rules currently reject any model wording lacking the old literal phrases, so a polished model reply can be silently replaced by a fixed sentence; the rejection counter exists to make that visible.
- The grilling skill and the to-spec skill were used for this ticket. `/setup-matt-pocock-skills` has not been run, so the issue tracker location and label vocabulary are assumed from the existing `.scratch` convention.
- Evaluation cost: about 150 live turns plus paired V1 runs, billed on real model and routing calls against the Development database with disposable fixtures deleted after each batch.

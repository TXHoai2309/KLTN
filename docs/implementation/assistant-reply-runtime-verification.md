# Assistant reply runtime and wording correction — 2026-10-28

The owner clarified that the complaint concerns repetitive language, and asked whether the model is actually invoked. This corrects the reply constraints from the earlier naturalness implementation; it does not change the selected Luna/high model.

## Evidence and cause

- Vercel Production was READY on master `723f24e128d56ae0a47825a90d417f0f0695cf60`, deployment `dpl_HuZQJ2uQabKaCduQBGMANQ3uqZaz`. The deployment was inspected through the authenticated CLI and refreshed read-only metadata.
- At 2026-10-27T18:18:24Z, the available last-30-minute Production logs contained five `planning_reply` events, all `gpt-6-luna`, reasoning `high`, outcome `MODEL_ACCEPTED`. This establishes accepted model prose for those events, not for every historical message or the exact screenshot turns. A wider log window was unavailable under the hosting retention policy. Only aggregate model/status evidence is exported here; no private conversation or credential is included.
- Before changing the composer, three synthetic real-provider calls all returned `MODEL_ACCEPTED`. Replies still began “Mình ghi nhận…”, “Mình hiểu…”, and the proposal returned the exact stock sentence. The old prompt explicitly required an acknowledgement every turn and preserved the proposal's opening verbatim. The old guard rejected otherwise truthful proposal prose if that sentence changed.
- A deterministic regression also reproduced two visible workflow failures: another “Đúng rồi, tạo đi” at a pending Save invoked Save, and asking to display a saved itinerary returned public destination QA.

## Implemented correction

- Ask the model to continue the actual conversation, avoid repetitive acknowledgements, explain a question's purpose when useful, and use supplied itinerary details after generation. One missing topic per question remains enforced. Recap fact lines and exact normalized dates stay protected.
- Proposal wording can vary while explicitly retaining its unsaved/preliminary state. The guard still blocks premature saved/validation claims and unsupported numeric facts; counts derived directly from the supplied stops are allowed. A real-model sample exposed a harmless rejection of “Lịch hiện chưa được lưu”; the regression now permits that equivalent wording without requiring “lịch trình”.
- Understanding distinguishes DISPLAY from public QA and explicit CREATE/SAVE from generic confirmation. Display preserves needs/proposal and cannot write. A repeated create request with an existing proposal shows it instead of saving. A Save request before generation cannot authorize generation. Ambiguous agreement after QA still requires clarification.
- Redisplayed in-memory itinerary copies are read-only, with no duplicate Save control. After reopening a saved conversation without a transient proposal, the response directs the traveler to the existing owned-trip link. This does not persist generated itinerary snapshots or introduce another Trip read/write API.

## Verification

- Initial focused reproduction: three failing tests captured the exact stock-sentence gate, create-as-save, and display-as-QA failures before their fixes.
- Related Assistant/planning suites: **34 files, 317 tests passed**, 9 opt-in tests skipped at that run. The subsequently added provider-intent smoke is opt-in as well. Tests include truthful preliminary status, unchanged needs on display, semantic create versus Save, and a single Save control across redisplayed cards.
- Real provider: `ASSISTANT_PLANNING_LANGUAGE_TEST=1 npx varlock run -- npx vitest run src/modules/assistant-planning/planning-reply-live.vitest.test.ts src/modules/assistant-planning/planning-language-live.vitest.test.ts -t 'audits real|real Luna display|family size'` — **3 passed**, one longer language case deselected, 44.04s. No database, routing or Trip writes. Three audited composer calls were Luna/high and `MODEL_ACCEPTED`; separate calls returned DISPLAY and CREATE correctly. Family-size/date understanding also passed, with a truthful guard fallback on its date-correction reply. Fallbacks remain intentional and are not claimed eliminated.
- Actual accepted samples: “Để phân bổ điểm trong 3 ngày hợp với các sở thích đó, bạn muốn đi thư thả, vừa phải hay trải nghiệm nhiều nhất có thể?”; “Bạn đi một mình hay đi cùng ai để mình tính lịch cho phù hợp?” The proposal named the supplied first-day stops and explicitly said it was not saved.
- Web typecheck and final isolated `KLTN_PERF_BUILD=1 npm run build -w web` passed, including all 48 static pages. Whitespace/scope checks accompany this report.

## Boundaries

No schema/migration or Production business-data mutation. No commit, push or deployment was performed. The new wording applies to subsequent replies after this code is deployed; stored historical messages are not rewritten. This is a bounded language sample, not a guarantee of varied or correct prose in every conversation. Deterministic Save/recovery/system acknowledgements remain distinct from model-written needs/proposal responses. No new authenticated browser acceptance is claimed.

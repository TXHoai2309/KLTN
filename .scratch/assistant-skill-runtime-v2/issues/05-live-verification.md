# 05: Live verification before deletion

**What to build:** Run a real guest and a real signed-in traveler against Dev: guest Q&A with citations, guest planning invitation and restore after sign-in, saved-conversation link, traveler planning unaffected. Record results in the story/evaluation doc. Failures stop the sequence.

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

- [ ] Guest Q&A with citations verified live
- [ ] Invitation and draft restore verified live
- [ ] Saved link verified live
- [ ] Traveler planning verified live
- [ ] Results recorded; test data cleaned up

## Result (2026-10-30, dev server on :3010, Dev DB)
- Guest (built-in browser, no sign-in): `/assistant` shows Guest mode; a factual question returned a source-limited answer, created a conversation and synced `?conversationId=`; sidebar listed it.
- Guest planning request ("Lên lịch trình Hà Giang 2 ngày bằng xe máy cho tôi"): no planning call, natural sign-in invitation with "Đăng nhập để tiếp tục"; Q&A still offered.
- Saved link: reloading `?conversationId=` as the same guest restored the history in the V2 chat.
- Signed-in traveler (API level via the V2-10 runner, disposable fixture user, deleted after): S02 PRESENT_PROPOSAL and S05 PRESENT/QA/GUIDANCE passed with 0 hard failures. The signed-in browser UI and the post-sign-in draft restore were NOT exercised live (no test credentials entered); covered by logic tests only.
- Not shown: citation chips for the guest answer (the answer said sources were insufficient).

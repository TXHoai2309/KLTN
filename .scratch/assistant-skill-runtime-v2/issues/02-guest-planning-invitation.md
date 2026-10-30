# 02: Guest planning request invites sign-in

**What to build:** When a guest asks to plan, change or save a trip, the chat replies with a natural sign-in invitation and keeps the unsent text through the existing planning auth hand-off, restored after sign-in. A factual question that merely mentions a plan is still answered. Unrecognised input falls through to Q&A, never to a planning call.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Planning request from a guest makes no planning request and shows the invitation
- [ ] Draft is retained and restored after sign-in
- [ ] Factual question mentioning a plan is answered
- [ ] Recognition rule fixed by tests

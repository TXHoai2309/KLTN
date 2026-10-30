# 01: Guest Q&A in the V2 chat

**What to build:** A guest (no account) opens the V2 chat in Guest mode, asks about Hà Giang and receives source-grounded answers with citations from the existing Q&A service, using the existing guest cookie principal and unchanged abuse limits. No V2 session, no session head, no planning request, no schema change. Add GLOSSARY terms Guest and Guest mode. Prefactor: find where the guest Q&A transport lives and keep it.

**Blocked by:** None (can start immediately)

**Status:** done (merged into codex/v1-retirement)

- [ ] Guest question sends a Q&A request and renders the answer with citations
- [ ] No planning route or V2 session call is made in Guest mode
- [ ] Abuse limits and cookie behaviour unchanged (existing tests still pass)
- [ ] Signed-in V2 flow unchanged
- [ ] GLOSSARY has Guest and Guest mode

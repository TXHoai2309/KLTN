# 03: Saved conversations open in the V2 chat

**What to build:** Links carrying a conversation id open in the V2 chat for guests and signed-in users. Sidebar, list, rename and delete work with a guest principal. Remove the saved-conversation special case that sends such links to V1. Stored history is untouched; no migration.

**Blocked by:** 01

**Status:** done (merged into codex/v1-retirement)

- [ ] Saved-conversation link opens in the V2 chat (guest and user)
- [ ] Continue asking in a saved conversation
- [ ] Rename/delete work for the owner and are rejected for others
- [ ] No schema change, no data deletion

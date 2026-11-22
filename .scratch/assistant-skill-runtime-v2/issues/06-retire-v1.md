# 06: Retire V1 and the runtime switch

**What to build:** In one separate final commit delete the V1 chat, V1 controller, V1 branch in the planning route and the runtime-version switch (session response field, client handling, env docs and example). Delete by absence of importers; keep shared modules. Add ADR, fix the stale note that V1 is the default, update story and progress log.

**Blocked by:** 05

**Status:** done (merged into codex/v1-retirement)

- [ ] No importer of removed V1 code remains; shared modules kept
- [ ] Runtime variable ignored if still set
- [ ] tsc, full suite (no new failures vs baseline of 63 in 10 files), production build, git diff --check pass
- [ ] ADR, glossary and docs updated

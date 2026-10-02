# Story lifecycle

Each story file is an implementation contract. It ties product/system sources to a bounded change and verifiable acceptance evidence. Use [US-TEMPLATE.md](US-TEMPLATE.md).

## Statuses

`DRAFT` → `READY` → `IN PROGRESS` → `IMPLEMENTED` → `ACCEPTED`

- **DRAFT:** Scope, dependencies, sources, or acceptance criteria are still being clarified.
- **READY:** Scope and out-of-scope are explicit; product/system references are identified; business rules, roles, authorization, ownership, dependencies, and testable acceptance criteria are clear; no blocking questions remain.
- **IN PROGRESS:** Implementation has started against the accepted contract. Record material scope or decision changes before proceeding.
- **IMPLEMENTED:** Code and documentation changes are complete, relevant checks have run, and evidence/known gaps are recorded. Product acceptance may still be pending.
- **ACCEPTED:** The named product/academic acceptance criteria have been reviewed and accepted by the responsible owner.

Do not mark a story READY by filling gaps with assumptions. Keep the backlog managed externally until approved story contracts are added here.

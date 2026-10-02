# Project instructions

These rules govern the KLTN repository. A nested `AGENTS.md` may add local guidance, but it cannot override product invariants or these project rules. In particular, `apps/web/AGENTS.md` contains Next.js version-specific scaffold instructions.

## Required reading order

Before implementing a story, read:

1. `/AGENTS.md`
2. `/docs/README.md`
3. `/docs/source-baselines.md`
4. `/docs/product/product-spec.md`
5. `/docs/architecture/technical-architecture.md`
6. `/docs/flow/user-flow.md`
7. The current story in `/docs/stories/`
8. `/docs/ai-progress.md`

For a small task, use the relevant subset of product and technical docs. The current story and relevant technical guidance remain required. Read source documents when a story cites them or a rule needs verification.

## Development rules

- Keep work within the accepted MVP and current story. Do not invent rules, expand scope, or change architecture without an approved decision.
- The Product Document is the product/business source of truth; the System Specification details its behavior. The repository is implementation truth, and accepted decisions record implementation decisions. The old Architecture document is historical when it conflicts. A current task instruction sets that task's scope, method, and goal; it does not automatically override locked product/business invariants. Only an explicitly approved requirement or project decision changes the baseline. Figma is the UI/interaction baseline only.
- Keep App Router Route Handlers thin: parse requests, establish the auth boundary, call a module/service, and map responses/errors. Put business rules and ownership checks in backend modules/services.
- Enforce authorization and record ownership on the server. Knowing an object URL or ID is not authorization.
- Use Prisma migrations for schema changes. `db:push` exists as a script but is not the schema workflow for product development.
- Never commit `.env`, credentials, tokens, or secrets. Never expose server secrets through `NEXT_PUBLIC_`. OpenAI and Google Routes credentials stay server-side; the browser Maps key may use `NEXT_PUBLIC_` and must be restricted in Google Cloud.
- Keep AI proposal and language tasks separate from deterministic Constraint Validator decisions. Missing required validation data is not a pass.
- For applicable writes, use the shared `SUCCESS` / `FAILED` / `UNKNOWN` and idempotency contract. Do not report success before the database confirms it; retry `UNKNOWN` with the identical payload and key.
- Do not merge or push unless the user asks. Do not assume branch promotion is automatic.
- Distinguish implemented code from product requirements that are awaiting a story. Do not describe planned modules as already implemented.

## Definition of Done

For each task, review the story acceptance criteria, run relevant typecheck/build/tests, inspect migration state when the database changes, run `git diff --check`, update story/progress documentation where applicable, and verify no secrets or unrelated changes are included. Select checks appropriate to the change and report anything not run or still unresolved.

# AI and developer progress

Append a new entry for each meaningful work session. Keep prior entries as handoff history; correct them only when documenting why a previous statement was wrong. Do not include secrets, connection strings, or credentials.

## 2026-10-02 — EN-01 foundation handoff

- **Branch:** `TXH` observed at documentation baseline creation. Team roles are `TXH` feature work → `dev` integration/testing → `master` production/stable; branch promotion is manual.
- **Task:** Establish the project handoff baseline and record EN-01 as complete.
- **Completed foundation:**
  - Next.js full-stack App Router with a Vercel web service and a thin `/api/health` Route Handler.
  - Turborepo/npm workspace packages: `apps/web`, `packages/auth`, `packages/db`, `packages/config`, and `packages/ui`.
  - Better Auth email/password, Traveler/Admin role storage, public signup locked to Traveler, and a server-side Admin bootstrap command.
  - Prisma/Neon PostgreSQL auth models and migrations; PostGIS and pgvector extensions are enabled.
  - Shared success/error API response, `AppError`, error handlers, and mutation `SUCCESS` / `FAILED` / `UNKNOWN` contract with idempotency storage and replay/conflict protection.
  - Varlock schema/example/local-env convention and Vercel deployment configuration.
- **Implementation boundary:** The inspected repository has only basic home/login/dashboard/auth and health behavior plus a `system` module. Destination, culture/RAG, favorites, trip planning, Constraint Validator, in-trip, and admin-content business modules are not implemented. OpenAI and Google Routes integrations are not present in code; PostGIS/pgvector domain use is also pending.
- **Environment topology:** Local → Neon development; Vercel Preview → Neon development; Vercel Production → Neon production. Preview variables must work for preview/feature branches. No endpoint, secret, or credential is recorded here.
- **Handoff note:** This entry records the existing EN-01 foundation. The later developer-documentation baseline is recorded in the next entry.
- **Database/migrations:** Existing repository migrations cover auth, PostGIS/pgvector extensions, idempotency records, and user roles. No schema change was made for this documentation task.
- **Validation:** Documentation task validation is recorded in the task handoff; rerun typecheck/build and `git diff --check` after future implementation changes.
- **Known issue:** The supplied local Figma `.fig` file was not inspectable in this environment. UI details must be consulted in Figma separately.
- **Next:** Prepare the US-01 contract before implementation. Do not start US-01 implementation from this handoff alone.

## 2026-10-02 — Developer documentation baseline

- **Branch:** `TXH`
- **Story/task:** Project documentation and governance handoff.
- **Completed:** Added root agent rules, source hierarchy, condensed product contract, current architecture, target flows, UI baseline caveat, EN-01 acceptance, workflow/environment guides, story lifecycle/templates, roadmap, changelog, and this progress file. Updated README to remove the separate web/server and `db:push`-as-main-workflow guidance.
- **Files changed:** `AGENTS.md`, `README.md`, and files under `docs/`.
- **DB/migration changes:** None.
- **Validation performed:** `npm run env:generate`, `npm run check-types`, `npm run build`, and `git diff --check` passed. Required documentation files and relative Markdown links were checked; a credential-pattern scan of the documentation changes found no matches.
- **Deployment/smoke result:** Not applicable; no application behavior changed.
- **Known issues:** Local Figma `.fig` file remains uninspected; Figma must be consulted separately for UI details.
- **Decisions:** Kept the old NestJS Architecture statements historical and clearly separated repository implementation from future product requirements.
- **Next step:** Prepare and review the US-01 story contract before implementing business behavior.

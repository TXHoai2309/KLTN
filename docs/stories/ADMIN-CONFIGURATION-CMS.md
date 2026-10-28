# Admin configuration CMS

Status: IN PROGRESS — code implemented locally; development migration applied; browser and provider acceptance pending (2026-10-27).

## Scope and source

Owner-approved request to implement [the configuration CMS plan](../implementation/admin-configuration-cms-plan.md). Admin can replace external-service credentials on the website; foundational database, auth, Blob and operational safety secrets remain environment-managed. This changes configuration delivery, not destination, trip, RAG publication, Validator or routing business rules.

## Contract

- An Admin-only **Cấu hình hệ thống** menu entry opens `/admin/settings`.
- OpenAI, Cloudinary and Stadia server credentials can be replaced. Preference, Editorial and QA models may be selected independently from the approved bounded list. Defaults remain Editorial `gpt-6-luna` and QA `gpt-6.1-sol`; embedding stays `text-embedding-3-small`/1536 until a separate migration is approved.
- Runtime overrides are encrypted in the database and scoped to Local, Preview or Production. The root encryption key remains in the environment. A current override is authoritative; unreadable overrides fail closed.
- Mutations require persisted Admin authorization, an idempotency key, confirmed database write and a values-free audit event. `UNKNOWN` retries keep the same key and payload. Read responses show status only for secrets.
- Cloudinary account changes require cloud name, key and secret together. The destination folder remains `KLTN/destinations`.
- Owner follow-up (2026-10-28): preference extraction, Editorial and QA each have a model selector. The Admin-only model endpoint intersects OpenAI `/v1/models` access for the active key with a reviewed Chat Completions/strict-JSON compatibility list (`gpt-6-luna`, `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6.1-sol`). Listing confirms account visibility, not a successful generation; Admin should smoke-test each changed flow.
- QA release gates, RAG storage, database, auth, cron and bootstrap secrets are read-only/externally managed.

## Acceptance evidence and remaining work

- Prisma schema and additive migration `20261027160000_admin_runtime_config` validate locally. The migration was applied to the Neon development database on 2026-10-27 after `/admin/settings` returned HTTP 500 because both tables were missing; both tables were then confirmed present. Production has not been migrated.
- Focused vault, route, Editorial, Cloudinary, QA and RAG tests are recorded in `docs/ai-progress.md` after final validation.
- A distinct `RUNTIME_CONFIG_ENCRYPTION_KEY` is required in each environment before Admin can save an override. A generated key is present in the ignored local `apps/web/.env` as of 2026-10-28; the local dev server must restart to load it. Preview and Production still need their own keys. Preview and Local share a development database but have separate record scopes. Provider calls and browser flows have not been exercised with live keys in this task.
- Deployment acceptance requires migration rollout, real Admin authorization/browser checks and one bounded smoke check per configured provider. No production key or database change is part of this local implementation.
- The save action validates field format and contract but does not make a paid/external provider call before activation. The UI says so explicitly. A failed real-provider smoke requires Admin to replace the credential with a known-good one; provider-side validation before activation remains a follow-up.

# Environment and deployment

## Environment files

- `apps/web/.env.schema` is the Varlock machine contract for validation and TypeScript generation. Keep it committed.
- `apps/web/.env.example` is the developer-facing template. It contains names and blank placeholders, not credentials.
- `apps/web/.env` is the local real-value file. It is ignored and must not be committed.
- `.env.local` is also ignored. Preview/Production values belong in Vercel project environments.

Run `npm run env:generate` after a schema change. Keep example/schema developer-facing keys aligned. Vercel runtime/internal values (`VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_ORIGIN`) are schema/runtime values and are not local template fields.

## Developer-facing keys

| Key | Use |
| --- | --- |
| `NODE_ENV` | `development` for local work. |
| `BETTER_AUTH_URL` | Local app base URL, currently `http://localhost:3001`. |
| `BETTER_AUTH_SECRET` | Better Auth secret; unique per environment. |
| `DATABASE_URL` | Neon PostgreSQL connection string. Local must use the development branch. |
| `OPENAI_API_KEY` | Optional server-side AI/RAG/embedding/planner integration. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional browser Maps key; restrict domains and APIs in Google Cloud. |
| `GOOGLE_ROUTES_API_KEY` | Optional server-side Routes key; never rename to `NEXT_PUBLIC_*`. |
| `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Only needed for the bootstrap command. Clear them after use. |

Never put actual connection strings, API keys, bootstrap credentials, or other secrets in committed documentation. OpenAI and Google Routes keys are server-side. The Maps browser key is public by design and must be restricted.

## Environment topology

| Runtime | Application | Database |
| --- | --- | --- |
| Local development | Local Next.js app | Neon development |
| Vercel Preview | Preview web deployment; variables must work for preview/feature branches | Neon development |
| Vercel Production | Production web deployment from `master` | Neon production |

The `TXH` → `dev` → `master` branch roles are described in [development workflow](development-workflow.md). The topology above is the project baseline; do not switch local or Preview to production data.

## Deployment

`vercel.json` defines the `apps/web` Next.js service, workspace install command, Prisma client generation, and web build. It does not define a separate NestJS service. Configure Preview and Production variables directly in Vercel; do not copy credentials into Git. `/api/health` is the lightweight deployment smoke endpoint.

## Database migration workflow

Use migrations for shared schema changes; `db:push` is available but is not the feature development workflow.

- Development: `npm run db:migrate` (Prisma `migrate dev` through the DB workspace). Review the generated migration before applying it to shared development.
- Production: run `npm run db:migrate:deploy --workspace @KLTN/db` with the approved Production environment as a controlled release step.
- Build: `vercel.json` runs `npm run db:generate` before the web build; this generates the client and is not a database migration.

Check the target environment and migration SQL before applying. Never include a real `DATABASE_URL` in commands committed to documentation or in logs.

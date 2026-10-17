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
| `OPENAI_PREFERENCE_MODEL` | Optional server-side model identifier for US-25 preference extraction; no repository default. Missing value must produce `AI_UNAVAILABLE` when that future integration is enabled. |
| `STADIA_MAPS_API_KEY` | Server-side Stadia Standard Routing key shared by US-28/US-29B/US-30; never rename to `NEXT_PUBLIC_*`. |
| `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Only needed for the bootstrap command. Clear them after use. |

Never put actual connection strings, API keys, bootstrap credentials, or other secrets in committed documentation. OpenAI and Stadia Routing keys are server-side. Browser map rendering uses MapLibre/Stadia without a frontend API key.

US-25 adds the optional `OPENAI_PREFERENCE_MODEL` declaration and ADR-16 server-boundary documentation. It is not exposed through `NEXT_PUBLIC_*`, and is intentionally left blank until an owner selects a model. `scripts/sync-vercel-env.ts` already syncs only non-empty keys declared in `.env.schema`; no script change is required. Run `npm run env:generate -w web` after changing the schema so the generated `apps/web/src/env.ts` stays aligned; do not put a real model name or API key in committed files.

## Destination image configuration

Destination V3.2 adds optional `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, and `CLOUDINARY_DESTINATION_FOLDER` to the web Varlock
schema/example. Runtime provider settings must not use Varlock `@internal`: that
decorator prevents injection into the application and is for interpolation-only
configuration, not a server-only security boundary. Cloudinary API key/secret and
`OPENAI_EDITORIAL_MODEL` remain sensitive runtime settings; credentials must never
be public or `NEXT_PUBLIC_*`. Cloud name/folder are noncredential metadata. The only
accepted destination root is `KLTN/destinations`. Blank/incomplete credentials
disable upload only. The provider reads the configured environment's folder mode
via the Admin Config API; it never creates an environment, moves assets or deletes
assets. Set real values in ignored local environment files yourself, then restart
the local app. See [V3.2 smoke instructions](destination-cloudinary-v3-2-report.md).

V3.3's optional `OPENAI_EDITORIAL_MODEL` follows the same runtime rule and uses the
existing server-side `OPENAI_API_KEY`. After changing schema annotations, regenerate
env types and restart Next. On 2026-10-15 the owner already had the provider values
in the ignored `.env`; removing the incorrect `@internal` annotations restored
runtime loading without editing that file or changing credentials.

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

## Stadia Maps deployment authentication

Official [authentication policy](https://docs.stadiamaps.com/authentication/) permits localhost/127.0.0.1 development without a key. Styles are Alidade Smooth and Alidade Smooth Dark from tiles.stadiamaps.com; preserve provider attribution. No local map credential or Google billing is required.

Before production: create a Stadia account/property and register the stable Vercel/custom hostname in Stadia Dashboard → Manage Properties → Authentication Configuration. Preview hostnames need explicit property/domain configuration; do not assume arbitrary preview URLs are authorized. Keep Origin/Referer available to browser tile requests. Production tile authentication is not configured or deployed by this task. No frontend key is introduced. Configure `STADIA_MAPS_API_KEY` separately in the server runtime for routing; never expose it in tile style URLs or browser bundles.

The web dev/build commands prepare official npm MapLibre worker/shared assets under ignored public/maplibre. Deploy that public directory with the build; do not manually commit vendor bundles. A missing worker asset displays the map error state and can recover by retry after deployment is repaired.

## US-28 Stadia runtime configuration — 2026-10-18

Remove interpolation-only `@internal` from STADIA_MAPS_API_KEY: installed Varlock
1.18 strips internal keys from process.env and generated application ENV. It is
now `@required=false @sensitive=true`, so the routing feature can return
NOT_CONFIGURED without blocking unrelated functionality. `npm run env:generate
--workspace web` regenerates ignored env.ts; no secret value or .env file changes.
US-28 reads the server ENV getter. US-29B/30 read its injected server process value.

Vercel project kltn was inspected read-only: STADIA_MAPS_API_KEY exists as sensitive
in Preview and Production. Presence does not prove key validity, account quota,
property access or hostname registration. No remote secret was created/replaced.
Local live tests prove the configured Development key at that observed time only.
Register each allowed Preview/Production tile hostname in Stadia; do not add a
routing key to browser style/tile URLs. Dashboard registration remains unverified.

The current Destination routing registry is independently limited to the reviewed
Development endpoint. Production candidate admission needs its own verified corpus
and approved registry entry; this migration does not loosen that gate. Retain CMS
V2's migration and controlled Production rollout plan. No routing DB migration or
Production deployment/env/migration operation is included.

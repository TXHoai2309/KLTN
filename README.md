# KLTN

KLTN is a responsive web project for a Hà Giang travel assistant. The repository is at the foundation stage: authentication, the health endpoint, persistence setup, and shared API/mutation conventions exist. Product capabilities such as discovery, RAG, trip planning, and validation remain future story work. Read the [documentation entry point](docs/README.md) before implementation.

## Quick start

Install dependencies and create a local environment file only if it does not already exist. These commands preserve any existing `apps/web/.env` and never overwrite it:

```powershell
npm install
if (-not (Test-Path apps/web/.env)) {
  Copy-Item apps/web/.env.example apps/web/.env
} else {
  Write-Output "apps/web/.env already exists; keeping it unchanged."
}
```

```bash
npm install
if [ ! -e apps/web/.env ]; then
  cp apps/web/.env.example apps/web/.env
else
  echo "apps/web/.env already exists; keeping it unchanged."
fi
```

Fill in the values needed from `apps/web/.env.example`. Local development must use the Neon `development` branch, never production. Then generate the Prisma client, apply pending development migrations, and start the app:

```bash
npm run env:generate
npm run db:generate
npm run db:migrate
npm run dev
```

The app listens at [http://localhost:3001](http://localhost:3001). Prisma schema changes use migrations; `db:push` is not the workflow for feature development.

## Environment setup

`apps/web/.env.schema` is Varlock's validation and code-generation contract. `apps/web/.env.example` is the developer template. `apps/web/.env` contains local values, is ignored by Git, and must never be committed. Do not commit secrets. Preview and Production environment values are configured directly in Vercel; Local and Preview use Neon development, while Production uses Neon production.

Optional AI/Google keys may remain blank until those integrations are needed. To create the initial Admin, fill in the `INITIAL_ADMIN_*` fields in the local environment file and run:

```bash
npm run auth:bootstrap-admin --workspace web
```

Clear the bootstrap values after the command completes. See [environment and deployment](docs/implementation/environment-deployment.md) for the full variable and migration workflow.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start workspace development tasks. |
| `npm run check-types` | Typecheck all workspaces. |
| `npm run build` | Build the web application. |
| `npm run env:generate` | Generate Varlock TypeScript accessors from env schemas. |
| `npm run db:generate` | Generate the Prisma client. |
| `npm run db:migrate` | Run Prisma development migrations. |
| `npm run auth:bootstrap-admin --workspace web` | Create the initial Admin using server environment variables. |

## Documentation

Start at [docs/README.md](docs/README.md) for the reading order, source-of-truth hierarchy, story lifecycle, architecture, product contract, and handoff process. Root [AGENTS.md](AGENTS.md) contains project rules for developers and AI agents.

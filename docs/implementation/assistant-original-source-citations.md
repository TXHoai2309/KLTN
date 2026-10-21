# Original-source citations — implementation evidence

Date: 2026-10-20. Branch: `codex/rag-document-delete-restore`.
Contract: [story specification](../stories/ASSISTANT-ORIGINAL-SOURCE-CITATIONS.md).
Status: application implementation and offline verification complete; real
PostgreSQL/infrastructure acceptance remains open. No deployment claim.

## Changes

- `rag-processing/original-sources.ts`: document-local registry, explicit section
  identities and narrower paragraph declarations, ambiguous-scope fallback,
  metadata-only spans and deterministic hash. Literal DOCX URLs and Word line
  breaks work without hyperlink relationships.
- `lib/original-source-url.ts`: HTTP(S) canonicalization and rejection of private,
  credential-bearing, signed/admin/storage destinations. Does not resolve/fetch URLs.
- `rag-index/rag-citation-store.ts`: immutable additive bundle, exact version/hash
  and chunk binding checks, document lock, atomic insert/readback and identical retry.
- `rag-index/rag-citation-backfill*.ts`, `scripts/backfill-rag-citations.ts`: exact
  original/extractor/chunker/span verification, dry-run/apply, bounded batches,
  cursor before failures, stale-target skips and bounded diagnostic codes.
- `rag-index-worker.ts`: optional metadata persistence after chunks and before
  embeddings; citation-only failure preserves normal indexing availability.
- QA retrieval/service/store/safety/runtime contract: pin bundle and evidence view,
  retain original grounding IDs through verification, expand public citations
  afterward, verify proof again before completion, store snapshot/provenance in
  the existing transaction. Full 128 KiB response overflow selects whole document
  fallback. Public DTO, question/model/evidence limits and idempotency stay unchanged.
- Assistant citation utilities/components/styles: numbered references after parts
  and in table source cells, one final list, canonical-URL grouping, accessible
  focus/links; public UI omits citations without a safe URL and hides RAG
  document names/locations.
- Prisma `rag-citation.prisma`, generation/version inverse relations and migration
  `20261020180000_rag_original_source_citations`: additive table only.
- Tests, PostgreSQL runner, npm backfill command, DESIGN, glossary, story/progress.

## Verification commands and results

Run from the repository root unless stated otherwise.

| Command/check | Result |
| --- | --- |
| `npm exec -- vitest run --config vitest.config.mts src/modules/ai src/components/assistant src/modules/rag-index src/modules/rag-processing` in `apps/web`, with `QA_CITATION_SAMPLE_DOCX` set to the owner's sample | 972 PASS, 0 FAIL, 93 SKIP; 61 passing / 9 skipped files |
| `npm run test:rag --workspace web` | 64 PASS, 0 FAIL, no skips |
| `npm run check-types --workspace web` | PASS |
| `npm run build --workspace web` | PASS, production compilation, TypeScript and 45 generated pages |
| `npm run db:generate --workspace @KLTN/db` | PASS |
| `npm exec -- prisma validate` in `packages/db` | PASS |
| `node apps/web/scripts/test-qa-citations-browser.mjs` | PASS, 360/1440px, light/dark production component, long titles, dedup, Enter/focus, new-tab semantics, minimum target sizes and no horizontal overflow; external requests blocked |
| `git diff --check` plus new-file whitespace review | PASS |
| `npm run test:rag-index:postgres --workspace web` | NOT VERIFIED: Docker Engine unavailable/nonresponsive, including after Desktop startup; no test database/container created |
| Premium strict project audit, read-only | FAIL: 81 broad repository/cache findings, including existing select/date ownership, textarea and scrollbar guidance; not a repository-wide audit PASS; unrelated UI not changed |
| Impeccable source detector on changed UI | Completed, advisory token/radius observations; incumbent Assistant palette retained; rendered light/dark checked separately |
| Lint | Not run: no lint script configured |

The initial regression run detected a new client import boundary violation; moving
the platform-neutral URL validator into `lib` fixed it. One controller test timed
out in that run; its focused rerun and the full final suite passed. Initial legacy
UI assertions were updated to the approved numbered/deduplicated presentation.
The first build failed on a new test mock's TypeScript signature; corrected and
the complete production build passed afterward.

## Acceptance criteria evidence

| AC | Evidence and remaining boundary |
| --- | --- |
| 01 | Owner DOCX read-only parser test: 17 definitions / 23 mappings; section 2,16,22 source sets verified; bibliography/footers excluded from answer evidence |
| 02–03 | Parser synthetic tests: literal URLs/breaks, repeated headings/sentences scoped by identity, narrower attribution, contradictory/missing codes, unsafe URLs, unrelated valid scopes |
| 04 | Exact rebuild tests preserve stored chunks and repeat the same metadata hash; existing remote-file backfill NOT RUN |
| 05 | Batch dry-run/resume/stale/uncertain-result tests and store lock/replay tests; real PostgreSQL suite added but NOT RUN |
| 06 | Worker tests verify persistence after chunk storage and nonblocking metadata failure |
| 07 | Service/projection tests expand one verified chunk to several links while retaining text, document alias and locators; no new provider stage |
| 08 | Legacy contract/UI/HTTP/history/replay regressions pass; no history source derivation added |
| 09 | Projection/safety tests reject fabricated URLs, aliases/locators and arbitrary prose URLs; persistence rechecks proof |
| 10 | Completion-lock unit test checks metadata hash, current evidence eligibility and exact derived text; existing disable/delete/publication paths retained; real database race acceptance OPEN |
| 11–12 | UI rendering and browser tests: part/table slots, first-use numbering, canonical grouping, one list, fallback and explicitly RAG-labeled locations |
| 13 | Browser 360/1440px, light/dark, keyboard Enter and exact focus target, wrap/size checks; existing follow-tail guard regression passes |
| 14 | Source review/import isolation and safety regressions; no website fetching, source telemetry or additional model call added |
| 15 | Projection test exceeds 128 KiB and verifies the identical complete document-fallback response |
| 16 | Immutable/hash and old-snapshot tests, completion source review; actual PostgreSQL atomic completion acceptance OPEN |
| 17 | 972 QA/indexing/processing/Assistant tests and 64 RAG tests pass; environment-dependent skipped tests are not reported as passing |

Do not mark infrastructure acceptance or all AC fully verified until the open
PostgreSQL and operational checks above have evidence.

## Migration and existing-document operation

At the 2026-10-20 implementation handoff, no migration or backfill had been
applied to development or production. No secrets,
environment files, live model calls, commit, push or deployment are included.

After separately authorizing and verifying the target environment:

```powershell
npm run db:migrate:deploy --workspace @KLTN/db
npm run rag:citations:backfill --workspace web -- --database-host=<verified-host> --database-name=<verified-database> --limit=20
```

The second command is dry-run. Repeat with `--apply` only after reviewing it;
continue bounded batches with `--after=<nextCursor>` until `hasMore=false`.
Use the same environment and cursor for an uncertain/failed batch. Never pass a
database credential as a command argument. The command uses the existing
server-only DATABASE_URL and Blob configuration; it does not print them.

New indexing creates its own metadata. Existing eligible documents require the
backfill to expose original links; historical turns keep their saved source
snapshots. The backward-compatible API may still return document-fallback
metadata internally, but the public UI does not render it. Missing or
unreproducible metadata therefore produces no public citation; no placeholder is
shown. Rollback of the application leaves the additive table unused; it does not
require dropping data or rewriting history/chunks.

### 2026-10-21 — authorized development and production migration

The owner explicitly requested migration deployment for both environments and
provided `DATABASE_URL_PROD` in the existing local environment file. Used
`DATABASE_URL` for development and `DATABASE_URL_PROD` for production, verifying
the two distinct hosts/database identities before invoking the existing
`npm run db:migrate:deploy --workspace @KLTN/db` command for each target.

- Development: `20261020180000_rag_original_source_citations` applied, exit 0.
- Production: the same migration applied, exit 0.
- Both: read-only verification confirmed a finished, non-rolled-back migration
  record and the presence of `public.rag_citation_bundle`.
- Development history also contains `20261020170000_trip_manual_completion`,
  absent from this checkout and all local Git history. It was not edited,
  resolved, rolled back or recreated. This pre-existing history difference is
  distinct from the successfully confirmed citation migration.
- No backfill, model call, commit, push, environment-file edit or reset performed.
  This execution verifies the actual migration/table on both targets; it does not
  replace the still-open disposable PostgreSQL race/atomicity integration suite.

### 2026-10-21 — public citation fallback clarified

The owner confirmed answer-local `[1]` markers should open the source URL resolved
from document references such as `[S1]`. When no safe URL can be associated,
hide the inline marker and source-list item entirely. Do not expose RAG filenames,
page/section locations, or a “no public link” placeholder. The citation DTO and
saved history snapshots remain backward-compatible; historical snapshots without
URLs are hidden by the renderer. Focused UI tests pass (23/23); browser, typecheck
and final diff verification are recorded in the current work-session progress
entry. The earlier dev/prod migration check found zero citation bundles; no
backfill was run here.

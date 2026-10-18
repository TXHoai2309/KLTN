# TXH / dev / master consolidation — 2026-10-18

Owner requested an inventory of code missing from TXH, merging all available work,
promotion to dev/master, and removal of redundant branches/worktrees. This request
explicitly authorizes Git delivery; it does not authorize database imports, source
rights promotion, provider calls or Assistant runtime activation.

## Work found and integrated

| Source | Previously missing work / resolution |
| --- | --- |
| origin/kduy, origin/duybinh | Eight/seven commits absent from TXH ancestry: manual trip editing, edit-intent helpers, in-trip GPS/manual-location flow and requirement recovery. Merging kduy includes duybinh. |
| origin/master / codex/rag-production-release | Verified RAG migration scripts, bounded backup waiver and sanitized evidence, commit 930b5d5. |
| codex/rag-production-sync | Original equivalent RAG commit f72d6f2, reconciled without duplicating runtime changes. |
| codex/destination-production-sync | Previously uncommitted Landing request boundary, sanitized map diagnostics, import scripts and acceptance evidence; captured as cdf3e1b before merging. |
| codex/assistant-production-readiness | Previously uncommitted read-only audit/evidence; captured as 2292ced before merging. |
| Local master | Its only missing commit was obsolete revert 85b9152 of the accepted Stadia migration. An explicit ours merge records its ancestry while retaining the accepted routing code. No Google routing restoration. |
| Other local/remote feature and personal refs | Already ancestors of TXH after integration; no additional product code required. |

The five local TXH commits ahead of origin/TXH are retained, including Guest auth
UX, detail/Assistant styling and Explore/Favorite improvements. No forced remote
history rewrite. Conflict resolution preserved both progress narratives; old
committed merge-marker lines in ai-progress were removed. Source code merged
without hand-written product conflict resolution.

## Integration fixes and validation

- Trip-edit tests inherited an obsolete Admin denial rule. Updated to approved
  RBAC V2: Admin can preview/apply an owned trip; foreign ownership remains 404;
  unsupported roles and Guest remain denied before body access. Runtime guards
  and ownership rules unchanged.
- Home test's next/server mock omitted NextResponse, leaking into the shared
  Vitest worker. Partial mock now retains actual exports.
- Updated legacy source assertions for the existing configured Home video and
  dynamic header class. Removed Markdown trailing spaces from the Guest UX report.
- Final root npm test: PASS. Vitest 2305 PASS / 0 FAIL / 134 SKIP, across 156
  passing and 15 skipped files; legacy suites 336 PASS / 0 FAIL / 0 SKIP.
- Migration unit/PGlite suites: 55 PASS / 0 FAIL / 0 SKIP. The separate native
  Destination PostgreSQL fixture attempt refused EXPLICIT_LOOPBACK_FIXTURE_PORT_REQUIRED
  before setup; not counted as PASS. No live database write test was performed.
- Final root check-types PASS; root build PASS, Next16.3.8, offline fixture env,
  not Production credentials. Build includes the new owned trip edit route and
  request-time Home. Full native PostgreSQL/provider/browser acceptance not claimed.
- Earlier test runs exposed the three stale RBAC assertions and missing mocked
  NextResponse; the recorded final runs are after those fixes. Skips remain skips.
- Prisma/schema/migration files are identical to previous Production. No import,
  schema operation, Auth data change, paid OpenAI/Routes request or rights approval.

## Recovery and cleanup

Recovery directory outside Git: D:/KLTN/kltn-recovery-20261018. Verified Git bundles
before and after integration preserve all original branch tips. Ignored receipts,
snapshot metadata, private raw audit files and env files are separately copied
with per-file SHA256 verification. Dependencies/build caches are reproducible and
excluded from that copy. No credentials or raw private corpus are added to Git.

Assistant and Destination managed worktrees were archived with recoverable app
snapshots. US-19 and Guest UX worktrees were removed from Git registration; stale
Temp worktree metadata was pruned. Git could not completely delete two physical
directories (Directory not empty). Automatic approval review rejected the explicit
Remove-Item cleanup of the US-19 remainder as blocked by policy; no bypass was
attempted. Those physical leftovers remain for manual cleanup after recovery review.

After validated promotion, redundant merged local/remote feature refs can be
removed. Keep TXH/dev/master and teammates' ThaiAnh/duybinh/kduy personal branches.
The validation worktree is archived only after its final logs are preserved.

## Delivery boundary

Validated TXH is intended to be pushed atomically to origin/TXH, origin/dev and
origin/master, then checked against Vercel Production metadata and read-only smoke.
Final deployment/cleanup execution receipts are kept in the ignored recovery area;
this document records the reviewed integration rather than inventing a future
deployment ID. Historical acceptance reports retain their observation timestamps.

Assistant remains closed and all three Production RAG documents remain public QA
unapproved. Stadia hostname authorization and authenticated Admin browser smoke
remain separate unresolved acceptance items; this consolidation does not label
them PASS or enable them.

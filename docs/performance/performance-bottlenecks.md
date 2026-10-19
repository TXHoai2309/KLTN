# Performance bottlenecks and decisions

Priority update: [Neon workstream](neon-database-optimization.md) measured12 flows.
Public detail18→16 SQL and editorial10→8 SQL were verified with identical DTOs.
Latest Vercel function artifacts reportiad1; Neon metadata confirmsSingapore.
Actual inter-service latency/region A/B still needs Preview; no region change.

Ranking follows measured user impact, possible savings/cost, risk and effort.
All numbers refer to [baseline method](performance-baseline.md), not field p95.

| Priority / issue | Evidence and root cause confidence | Before | Proposed action / expected impact | Regression risk and verification |
| --- | --- | --- | --- | --- |
| P1 Landing poster payload | Browser fetches full682840B PNG; lossless experiment pixel-identical458612B. CONFIRMED bytes | mobile observed LCP7824ms, desktop3044ms; one sample/condition | Lossless WebP, preserve1200×700 and visual pixels; save224228B every uncached fetch; latency improvement must be measured, not inferred | low; decode pixels/dimensions, identical local Chromium conditions390/768/1440; retain PNG for rollback |
| P1 repeated public reads | Actual PrismaNeon Home4 SQL202ms p50; unfiltered list3 SQL135ms. CONFIRMED extra calls | filter option query duplicates categories/areas already returned; descriptions queried sequentially | Derive filter options only for complete unfiltered result; Home select description alongside public fields; expect2 SQL per Home/public unfiltered read | medium; filtered options must still include all visible categories; media provenance/visibility/DTO unchanged; role-neutral and hide/show/description-change fixtures + read-only DB count/timing A/B |
| P1 AI admission / persistence | One complete live-existing trace: admission7600ms, persistence3016ms; partial second3091ms persistence. WALL TIME CONFIRMED, internal cause UNKNOWN | total36.0s; other guard intervals3.3s+ | Follow-up: correlate safe per-operation transaction/connection/lock spans on Preview; do not weaken advisory locks or durable budgets | high; auth/abuse/idempotency writes cannot be benchmarked on Production; no optimization adopted without decomposition |
| P1 early mobile interaction | Two post-fix loopback theme-menu probes CPU4x:864/496ms maximum event duration. Second sample input delay30ms, handler15.5ms, presentation450.5ms. OBSERVED, render attribution UNKNOWN | no pre-fix/field INP comparison | Capture render/style/paint trace around early menu opening before changing global UI/font/video behavior | medium; retained both samples, no selective PASS or backend attribution |
| P1 destination response completion | Guest n3 p50 2.69–3.09s, TTFB334–411ms. CONFIRMED response interval; sequential detail+editorial source found | stream completion much later than first byte | Follow-up read-only per-service timing before considering parallel reads; preserve visibility404/410/hidden error precedence | medium; no service spans or controlled A/B for this path yet, so no speculative patch |
| P2 global fonts |21–26 resources,248–350KB encoded across core routes. CONFIRMED payload, usage hypothesis | multiple Be Vietnam weights plus Geist/Mono/Lora preload | Measure per-face used coverage; consider scoped/preload=false only after Vietnamese/editorial screenshots | medium; fallback/reflow could worsen CLS; not changed |
| P2 layout shifts | Assistant desktop observation0.361; destination mobile0.174. OBSERVED, attribution UNKNOWN | short observation window, auth bootstrap blocked | Add layout-shift source attribution in a follow-up trace; compare hydrated authorized flow | medium; cannot assert production field CLS or patch blindly |
| P2 map payload / readiness | desktop map~882KB JS vs List433KB;3 markers; mobile0 at observation end | already dynamic import and Home IntersectionObserver | Retain lazy boundaries; follow-up measure marker-ready after scroll/stable load and worker waterfalls | medium; no map optimization without delayed/failed/retry checks; US28 unchanged |
| P2 hero autoplay video | asset11.19MB; not fully downloaded in current window | partial bytes only | Follow-up measure normal-motion vs reduced-motion/save-data on test environment before changing playback contract | medium; changing autoplay changes behavior; no unsolicited behavioral patch |
| P3 new database index / cache | visible select0.048ms, existing visibility index,3 rows; all public APIs no-store | adapter/network vastly larger than these SQL times | No new index/schema/cache. Remove duplicate work first; retain request-fresh publication/hide semantics | cross-request cache could leak stale hidden content unless every CMS/media/editorial mutation invalidates; not introduced |
| Investigation: placement | deployment metadataiad1 but function logs regionhkg1, Neon Singapore | provenance differs | Verify actual service compute region and DB roundtrip before any region change | no region config change or claimed geography savings |

No model, reasoning effort, token budget, provider timeout, auth/session policy,
RBAC/ownership, source checks, semantic verifier, abuse or idempotency changes.
No Preview/Production deployment, model/routing requests or database mutation.

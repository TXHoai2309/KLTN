# V2-06 regression baseline debt

Baseline: `101294f56f1eee8ea81a662801b2631bdcf8e08f`. The ignored V2-05 HEAD source snapshot contains no V2 implementation. A completed three-file run on that snapshot reports **26 PASS / 3 FAIL**. A completed current eight-file comparison reports **145 PASS / 51 FAIL**: the same three in-trip failures plus the same 48 QA failures already documented in [V2-05](assistant-skill-runtime-v2-05-qa-baseline.md). Exact `(file, fullName)` failure sets match; **zero new assertion failures**.

## In-trip failures reproduced before V2


### in-trip-validation.vitest.test.ts

Unchanged test blob `8b0cf803722f4db79a101f1760c845d24890125c`.

- **authenticates before reading body and refuses a client-provided now** — `AssertionError: expected 400 to be 403 // Object.is equality`

### replan-http.vitest.test.ts

Unchanged test blob `b6c704ee8de8790a5ae9e8c3841e3d35ad3e7023`.

- **authenticates before the bounded body reader is reached** — `AssertionError: expected 200 to be 403 // Object.is equality`

### us35-location-source-audit.vitest.test.ts

Unchanged test blob `f144f86fe578913f28303df352c0fabae7690aaa`.

- **does not introduce URL/navigation sinks in in-trip production files** — `AssertionError: src\components\in-trip\in-trip-assistant.tsx: expected '"use client";\r\n\r\nimport Link from…' not to match /\b(?:URL|URLSearchParams)\s*\(|\b(?:…/u`

## Source-of-truth assessment

- `in-trip-validation.vitest.test.ts`: stale Admin403 expectation. Current persisted-role capability guard accepts Admin; the deliberately invalid JSON request therefore reaches body validation and returns400. Product/RBAC V2 and existing US-37/Admin-owned tests support that behavior.
- `replan-http.vitest.test.ts`: stale Admin403 expectation. Current RBAC V2 permits the owned Admin request, which returns200. Ownership is still mandatory; V2-06 tests assert actor and trip binding.
- `us35-location-source-audit.vitest.test.ts`: the conservative URL/navigation pattern flags the pre-existing trip backlink/router usage in `components/in-trip/in-trip-assistant.tsx`. The source and test both match HEAD. It is a broad static-pattern failure, not evidence that this task added a coordinate sink. New V2 tests inspect routing/US-36 prompts for absence of raw coordinates; targeted source review found no new location storage/log/URL sink.

These failures remain explicit baseline debt. No stale test or production authorization/location behavior was changed merely to make the suite green. The original US-35/36/37 DRAFT documents contain historical non-inheritance/provider/API details; current RBAC V2 and existing repository service contracts control this integration.

## Receipts and reproduction

Ignored receipts: `.cache/v206-baseline/baseline.json`, `current.json` and `comparison.json`. The prior five-file QA HEAD receipt is `.cache/v205-qa-baseline/failures-baseline.json`. Run bundled Node with Vitest `run --config vitest.config.mts --isolate --reporter=default --reporter=json --outputFile=...` from the current or exported `apps/web` directory. The baseline run selects the three named in-trip files. The current comparison adds the five QA files listed in the V2-05 audit. No live OpenAI/Stadia/DB/browser request is needed.

An initial baseline command used an incorrectly relative config path and failed before loading tests; it was corrected and is not a test receipt. Final full regression and focused results are recorded in the V2-06 story/progress; only completed runs support closure.

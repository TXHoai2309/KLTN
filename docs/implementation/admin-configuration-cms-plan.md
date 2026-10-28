# Admin configuration CMS — research and implementation plan

Status: **Local implementation in progress; development migration applied; live acceptance pending**. Researched 2026-10-27. See [implementation story](../stories/ADMIN-CONFIGURATION-CMS.md).

## Owner decisions

- Admin can enter and replace external-service API keys in the CMS.
- Foundational secrets, including `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BLOB_READ_WRITE_TOKEN`, remain under Vercel/environment management.
- The CMS is reached from the Admin section of the account menu, but system configuration is global to a deployment environment, not personal account data.
- Follow-up on 2026-10-28: Admin can choose preference-extraction, Editorial and QA models independently from the active OpenAI key's available models filtered by the application's supported request profiles. This supersedes the earlier fixed QA/Editorial model policy while retaining their defaults.

## Current configuration inventory

| Flow | Current source and use | Proposed CMS treatment |
| --- | --- | --- |
| OpenAI shared credential | `OPENAI_API_KEY` is read by preference extraction, Editorial, public QA, and RAG embeddings. See `apps/web/src/modules/preference-extraction/openai-structured-client.ts`, `destination-editorial/editorial-openai-client.ts`, `ai/qa-json-provider.ts`, and `rag-processing/openai-embedding-provider.ts`. | Editable server-side secret. Show configured status, never the value. A change affects all four flows and must be validated accordingly. |
| Preference extraction and related AI edits | `OPENAI_PREFERENCE_MODEL`; no model fallback in the client. See `preference-extraction/openai-structured-client.ts` and `docs/stories/US-25-natural-language-trip-needs.md`. | Editable only from a validated, approved model set; missing value remains unavailable. |
| Editorial AI | `OPENAI_EDITORIAL_MODEL`, `OPENAI_EDITORIAL_TIMEOUT_MS`. The current client explicitly accepts only `gpt-6-luna` and bounds timeout. See `destination-editorial/editorial-openai-client.ts`. Several configured-status/diagnostic paths read env separately. | Expose current model and bounded timeout. Do not offer arbitrary model changes without changing and validating the Editorial contract. Make status and actual calls use the same resolver. |
| Public QA | `OPENAI_QA_MODEL`; current code defaults to `gpt-6-luna` at module initialization in `ai/qa-json-provider.ts`. The approved product specification selects `gpt-6.1-sol` with medium reasoning in `docs/product/product-spec.md`. | Resolve the product/code mismatch before exposing a model selector. Ensure one effective model for question understanding and answer composition, with supported reasoning parameters. |
| RAG embeddings | Hard-coded `text-embedding-3-small`, 1536 dimensions and provenance; checked by indexing and retrieval. See `rag-processing/embedding-contract.ts`, `rag-index/rag-index-store.ts`, and `ai/qa-retrieval.ts`. | Read-only in the first CMS release. Changing it requires a separate provenance/index migration and reindex plan. |
| Destination images | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_DESTINATION_FOLDER`. `destination/cloudinary-provider.ts` requires the fixed destination root `KLTN/destinations`; the existing Admin configuration endpoint returns only a configured boolean. | Editable cloud name and credential pair. Keep the accepted folder constraint. Never return API secret or key. |
| Route/travel time | `STADIA_MAPS_API_KEY`; planner uses the server `ENV` getter while the route adapter can read `process.env`. See `trip-planner/planner-runtime.ts` and `trip-validation/stadia-route.ts`. | Editable server-side routing key through one resolver. Preserve the existing generic routing boundary and never expose the key to browser maps. |
| Browser maps | Home and Destination detail use keyless Google iframe URLs. Other MapLibre maps use Stadia style URLs and domain authentication; see `components/home-explore-map.tsx`, `components/map/destination-detail-iframe-map.tsx`, and `modules/map/map-config.ts`. | Show provider/domain setup guidance and status. Do not add a Google Maps API key field for the current iframe flow. Stadia tile-domain registration remains a provider-dashboard task. |
| RAG file storage | `BLOB_READ_WRITE_TOKEN`, read by `rag-document/rag-storage.ts`. | Foundational secret: status and Vercel guidance only. |
| QA release and abuse gates | `QA_RUNTIME_ENABLED`, Preview/Production gates, abuse acceptance, database host/name allowlists, HMAC and source/cleanup controls in `ai/qa-runtime.ts`, `app/assistant/page.tsx`, and the cleanup route. | Status/read-only. Do not bypass independent safety gates with a CMS toggle. |
| Platform/auth/deployment | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CRON_SECRET`, `INITIAL_ADMIN_*`, `NODE_ENV`, `VERCEL*`. See `apps/web/.env.schema` and `docs/implementation/environment-deployment.md`. | Foundational/bootstrap/platform fields: status or documentation only; no edit form. |

The inventory is based on production-source reads of `process.env`/`ENV`, `apps/web/.env.schema`, and `apps/web/.env.example`. The old `docs/source-baselines.md` snapshot is historical where it conflicts with current code and the product specification.

## Proposed architecture

1. Add an Admin-only **Cấu hình hệ thống** menu item linking to `/admin/settings`. Authorize the page and every API operation on the server using the existing Admin guard. Keep Route Handlers thin.
2. Define a typed allowlist of editable settings rather than an arbitrary key/value editor. Group OpenAI, Cloudinary, and routing settings into service-specific contracts. Return effective status, source and change time to the UI; never return a stored secret, even partially.
3. Store runtime overrides in a Prisma-managed table with a reviewed migration. Encrypt service credentials with authenticated encryption before writing them. Keep the encryption root key outside the database in the deployment environment; include key version, nonce and authentication tag to support rotation. Do not log plaintext input, ciphertext payloads, full provider URLs, or provider responses containing credentials.
4. Scope records explicitly to **Local**, **Preview**, and **Production**. Local and Preview currently share a Neon development branch, so database separation alone does not isolate their settings. Derive the scope on the server; a request cannot choose its own environment.
5. Introduce one server-only resolver per service: active CMS override first, existing env value as a transition/default when no override exists. Read it for each operation so a committed update takes effect on the next request across serverless instances. If an active override exists but is invalid or cannot be decrypted, fail closed and report configuration unavailable; do not silently fall back to an old env key. Centralize configured-status checks and diagnostics through the same resolver.
6. Use a staged change flow: validate format and allowed model/timeout, optionally test against the provider with a bounded request, then activate an atomic service configuration version. Show explicit failure without replacing the working configuration. Record actor, time, environment, setting names, old/new version and result in an audit trail; exclude values. Follow the project's `SUCCESS`/`FAILED`/`UNKNOWN` and idempotency contract for writes.
7. Support deliberate rotation and recovery: activate a new version, confirm provider operation, then revoke the old provider credential. Define how to rotate the encryption root key and re-encrypt stored secrets. Restrict restore/rollback to authorized Admin operations and never display old plaintext.

## Delivery sequence

1. **Contract/decision:** approve the editable-field allowlist, environment scope and model policy; resolve the QA model mismatch and Editorial model constraint. Record a project decision because persistent encrypted runtime configuration is a new architecture choice.
2. **Storage and security:** migration, encryption/key-version handling, Admin authorization, safe API responses, audit and idempotent mutation semantics.
3. **Runtime resolver:** wire OpenAI first and verify all four consumers plus their status/diagnostic paths; then Cloudinary; then Stadia routing. Preserve business and validator behavior.
4. **Admin UI:** add the menu item and grouped settings page with configured/missing/error states, replace-key forms, provider checks and change history. Mark read-only deployment and embedding settings clearly.
5. **Verification/release:** test non-Admin rejection, environment isolation, secret redaction, invalid configuration, rotation, multi-instance visibility, each provider's real smoke path, and migration rollout in Development before Production. Update `.env.schema`/example for the root encryption key without committing its value; update deployment and story/progress documents when implementation begins.

## Acceptance criteria for a later implementation task

- A committed Admin change is effective on the next server operation without rebuilding the deployment.
- Browser bundles, API responses, logs, audit rows and committed files contain no provider credential or encryption key.
- Local/Preview/Production settings cannot affect another scope, including when Local and Preview share a database.
- All OpenAI consumers observe the same active key; configured-status UI agrees with actual provider calls.
- Invalid or unreadable active overrides fail closed; previously working configuration is preserved until a new version is successfully activated.
- RAG embedding model/provenance and QA operational safety gates do not change as a side effect of this CMS.

## External source notes

- [Vercel environment variables](https://vercel.com/docs/environment-variables): edits apply to new deployments, not previously deployed instances. This motivates a separate runtime store for immediate CMS changes.
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html): access control, encryption, rotation, audit and avoiding plaintext logs are core secret-management controls.
- [Cloudinary Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference): backend authentication uses the API key and secret; the secret must not be exposed in client code.
- [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings): embedding model and vector dimensions are part of the retrieval/index compatibility decision; the repository additionally enforces exact provenance.

No code, schema, environment value or deployment setting was changed during this research/plan task.

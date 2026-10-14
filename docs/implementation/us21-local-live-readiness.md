# US-21 local live QA readiness — 2026-10-11

Local configuration is prepared at feature checkpoint 53506f67064dbc4eeda6693f3527c79e9d755a00. No live testing, source upload/indexing, Neon write, provider call, cleanup, migration or server startup was performed in this readiness session.

## Exact runtime configuration

| Key | Required behavior / current state |
| --- | --- |
| DATABASE_URL | Unchanged owner-restored Neon Development URL; effective hostname/database and server project/branch/endpoint IDs match approved target. |
| QA_RUNTIME_ALLOWED_DATABASE_HOST | Exact effective pooled Development hostname; configured. |
| QA_RUNTIME_ALLOWED_DATABASE_NAME | neondb; configured. |
| QA_RUNTIME_ENABLED | true in ignored local env only. |
| QA_ABUSE_PROTECTION_ACCEPTED | true for this authorized local readiness configuration; no production release approval implied. |
| QA_PREVIEW_RUNTIME_ENABLED | false. |
| QA_CLEANUP_ENABLED | false; scheduler unchanged. |
| QA_NETWORK_HMAC_SECRET | Secure random 32-byte secret serialized as hex; stable in ignored local env, never printed. Code requires at least 32 characters. Do not rotate between live smoke retries. |
| QA_LOCAL_NETWORK_ID | Stable randomly generated local server-side network-budget label, nonempty and at most 128 characters. It is not Guest/user identity or authentication. |
| QA_PUBLIC_SOURCE_IDS | MISSING/empty pending owner approval; comma-separated raw RagDocument.id values matching [a-zA-Z0-9_-]{1,128}. Not filenames, publication IDs, citation aliases or URLs. |
| OPENAI_API_KEY | Present, exposed server-side; not live-tested. Generation uses gpt-4o-mini with store:false; embedding uses text-embedding-3-small, 1536 dimensions. No environment model-selection variable exists in this runtime. |
| BETTER_AUTH_SECRET | Existing value retained; minimum 32 characters satisfied. |
| BETTER_AUTH_URL | Existing http://localhost:3001 retained. |
| VERCEL / VERCEL_ENV | Not set locally. Do not spoof trusted Vercel ingress. |

Code provides runtime pins for hostname/database only, not separate project/branch/endpoint environment pins. Read-only server settings verified project summer-unit-95870477, branch br-aged-hat-b3o6hg9p, endpoint ep-purple-pond-b3xujb8o, database neondb. Development branch name follows owner confirmation. Ledger remains 15 completed migrations with zero incomplete entries. Next development loader and the actual gate function pass local and reject Production/Preview. Credentials remain sensitive; NODE_ENV is the only public schema key.

Guest bootstrap POST /api/ai/session creates its own random possession token, stores its digest and uses HttpOnly/SameSite=Strict cookie scoped to /api/ai (Secure outside development). Traveler authentication uses Better Auth and server-read roles; never provide client ownerId/userId/role overrides. Shared local network quota does not bypass per-principal quotas.

## Source decision and prepared fixture

Read-only inventory: three INDEXED documents named US19 TEST - Checklist Ha Giang (TXT), its DOCX variant and its PDF variant. Published generations are READY, openai/text-embedding-3-small/1536; chunk/embedding counts match (3/3, 6/6, 3/3). Source URLs are absent. Presence of title/author/indexing is not evidence of ownership, personal-data review or OpenAI sharing permission. None was added to the allowlist.

Prepared local file: docs/fixtures/us21-local-live-qa-test.txt. Proposed public title: US21 TEST SYNTHETIC - Ho so QA Sao Tim. It describes a fictional QA record, not factual Ha Giang tourism. No personal data, private paths, credentials or URLs. Owner must approve content, provenance, public title/metadata and sending minimal evidence to OpenAI (including provider retention/data controls); generated content is not owner consent. REAL_CORPUS remains NOT_EVALUATED.

After owner explicitly authorizes upload/index/provider calls and QA writes:

1. Sign in as an existing authorized Admin and open /admin/rag/upload. Select the TXT fixture and the proposed TEST SYNTHETIC title. Record provenance as generated synthetic fixture reviewed by owner; do not invent a human author, a verified locality or a public URL.
2. Follow /admin/rag/{id}: UPLOADED -> START_REVIEW -> REVIEWING -> APPROVE -> APPROVED, then Index. Wait for INDEXED and a published READY generation with complete matching embeddings. Upload uses private Blob and indexing uses OpenAI: both require live authorization.
3. Record the exact id returned by upload/detail API. Obtain explicit public-metadata and OpenAI-sharing approval for this document. Put only that RagDocument.id into ignored QA_PUBLIC_SOURCE_IDS and restart development server. No ID placeholder should be treated as an approved source.
4. TXT citations intentionally expose title and public hashed source alias with no page/section locator. PDF projects page numbers; DOCX projects section titles only. Public sourceUrl is null by design. Do not expose raw document IDs, storagePath, Blob URLs or generation/chunk IDs to chat UI.
5. Start from worktree root with npm run dev -w web (port 3001), only after owner live authorization. Open http://localhost:3001/assistant. The development page selects AssistantRuntimeChat when QA_RUNTIME_ENABLED=true; it bootstraps /api/ai/session and sends /api/ai/ask through AssistantHttpTransport with same-origin credentials and Idempotency-Key. There is no fake-response fallback. Opening the real page can write Guest/session records even before asking a question.

## Live acceptance cases — prepared, not executed

| Case | Action | Evidence to capture |
| --- | --- | --- |
| Guest first turn | Ask: Ma xac nhan cua ho so QA Sao Tim la gi? | Server bootstrap cookie; HTTP SUCCESS confirmed by database; supported answer includes QA-SAOTIM-21; Task191 response schema. |
| Citation | Inspect first answer | Approved TEST SYNTHETIC title, public source alias, citation bound to published retrieved chunk; no internal ID or private URL. |
| Traveler first turn | Use an existing Better Auth Traveler session and ask the same question | Server establishes USER principal; Guest history is not transferred. |
| Follow-up | Ask: Ho so nay co nhung buoc nao? in the same conversation with returned parentTurnId | Subject resolved from history, retrieval repeated; evidence lists doc tai lieu, doi chieu ma xac nhan, ghi ket qua kiem thu. |
| Insufficient | Ask for actual ticket price at an unrelated real destination | No invented price; INSUFFICIENT_SOURCE where no eligible supporting evidence exists. Record actual outcome rather than forcing PASS. |
| Same-key replay | Replay identical captured JSON and Idempotency-Key | Same result/turn; no duplicate turn; changed payload with same key rejected. Keep request body/key stable on UNKNOWN. |
| Delete/revoke | DELETE /api/ai/conversations/{id}; separately DELETE /api/ai/session for Guest, with same-origin headers | History inaccessible, cached content removed, same-key replay cannot resurrect; revoked cookie cannot authorize new turns. Use only smoke-created QA objects. |
| Disable eligibility (last) | Admin DISABLE the dedicated fixture, then ask a new question/key | No new answer uses the disabled source. DISABLED has no re-enable in MVP: do this last and never disable existing US19 sources. |

Capture outcome, HTTP status, correlation/key and schema/citation checks without copying cookies, auth tokens or private content into shared reports. Unknown/provider failure remains distinct from INSUFFICIENT_SOURCE. No real quality PASS or arbitrary accuracy threshold is claimed. Cleanup stays disabled throughout.

READY_FOR_LOCAL_LIVE_TEST=NO until owner approves source and explicitly authorizes live upload/index/API testing. All Task192/193/194/197 statuses remain PARTIAL. Production and backup untouched.

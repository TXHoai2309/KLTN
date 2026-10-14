# US-23 — Rights-cleared Hà Giang corpus decision package

**Prepared:** 2026-10-12
**Disposition:** US-23 NOT_ACCEPTED. This package supports an owner decision; it does not authorize upload, review approval, indexing, allowlisting, provider calls, or Development writes.

## Executive disposition

No claim-bearing Hà Giang document was found in the accepted repository materials that can be cleared for this canary without relying on the seven held sources. Therefore this review prepared no ingestible corpus file and no corpus SHA-256. Existing Lũng Cú research artifacts were left untouched and excluded from candidate evidence because their source lineage and rights are not re-cleared here.

A narrow first-party route is available: have named project authors make original field notes or interview notes, with claim-level evidence, rights assignment/permission, and participant consent where applicable. That content has not yet been collected or evidenced. External routes with explicit licenses exist in principle, but no exact Hà Giang work and claim set was verified for this package. All future candidate records must stay `PENDING_OWNER_REVIEW`; no rights or factual status is promoted by this document.

## Rights and corpus options

| Route | Work-level status | RAG/provider scope | Disposition |
|---|---|---|---|
| Project-owned first-party notes, observation, or authorized interviews | Preferred, but no named author, signed rights chain, field record, or interview release was supplied for this corpus. Do not infer ownership from authorship in chat or from a local file. | Owner must document permission for storage, extraction, embedding, retrieval, and processing by the selected provider; collect interviewee consent and exclude sensitive personal/cultural material unless specifically cleared. | **Potential route only; no factual document ready.** |
| Wikidata structured records under CC0 | Wikidata policy releases structured data in its main data namespaces under CC0; this does not apply to wiki prose. Exact item, statement, references, snapshot, and accuracy still need claim-level review. | CC0 permits broad reuse of the licensed data; it does not clear third-party privacy, trademark, or other rights. Provider processing is plausible for the exact CC0 data, subject to owner review of the provider contract and exact record. | **Conditional metadata/geodata source only; no record or claim selected.** [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/). |
| A specific work explicitly marked CC BY 4.0 | The license allows copying/adaptation, including commercial use, subject to attribution, link to license, and marking modifications. It does not prove that any particular page, photograph, embedded work, or database is licensed by an authorized rights holder. | Potentially covers storage and processing of that exact work; retain attribution and modification notices and separately assess third-party/privacy rights and provider terms. | **No exact Hà Giang work verified.** [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/), [legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en). |
| OpenStreetMap geodata under ODbL 1.0 | OSMF states data may be copied, distributed, transmitted, and adapted with credit; adapted database distribution has share-alike conditions. | The OSMF guidelines require attribution in public use and note the guidance does not cover internal use. Their ML section does not expressly settle this product’s RAG retrieval/output pattern. A public RAG feature needs an owner/legal decision on attribution, ODbL obligations, and whether generated answers/derived material create a share-alike obligation. | **Conditional geospatial candidate only; no OSM fact was fetched or included.** [OSM copyright/licensing](https://www.openstreetmap.org/copyright), [OSMF attribution guidance](https://osmfoundation.org/wiki/Attribution_Guidelines), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). |

A public URL by itself is not a license. The Creative Commons license page explains the terms of CC BY, but a candidate is eligible only when the exact work carries that license and the licensor can grant it. This review does not treat official/public pages as open-licensed by default.

## Candidate document set

**Claim-bearing candidates ready for review: 0.** No source text was copied, summarized, or rewritten from HG01–HG07. No candidate was uploaded or hashed because there is no candidate document content whose rights and factual claims can be verified. Assigning SHA-256 to a template or to this decision memo would not satisfy the candidate-document requirement.

For the next authoring round, create one short original document per evidence domain (only after the source material exists):

1. `HG-FP-01` — directly observed/publicly verifiable place facts. Record author, observation date/method, precise locality, factual claim, evidence URL or original field record, reviewer, and any uncertainty. Do not infer coordinates from descriptive prose.
2. `HG-FP-02` — visitor access/opening/practical details. Use a dated first-party notice or a directly verified observation; treat changeable details as time-bounded and identify who must reconfirm them.
3. `HG-FP-03` — cultural knowledge only with a named, authorized contributor or rights-cleared original record, consent for attribution/anonymity and provider processing, and community review where appropriate. Omit restricted, sacred, or personal material unless expressly authorized.

These are collection slots, not existing facts or approved documents. A filled candidate must have a stable source ID, original authored text, author/rightsholder evidence, exact processing permissions, claim-level provenance, `verifiedAt`, reviewer identity, file SHA-256, and status `PENDING_OWNER_REVIEW`. Unknown facts stay `UNKNOWN`; a URL reference alone does not turn them into verified facts.

## Gold review against the ten evaluation cases

No 10-question Hà Giang gold manifest or named case list was found in the repository. `qaRealCorpusEvaluationManifestSchema` defines a prerequisite format but is not itself a dataset or reviewer evidence. The existing US-21 offline suite is explicitly fictional technical fixtures; its 26 technical expectations and synthetic semantic probes do not establish real-corpus coverage or quality.

Because case IDs/questions were not supplied, no per-case outcome is invented. On the evidence currently available:

| Review class | Current disposition |
|---|---|
| Sufficient evidence to submit to an independent reviewer | **0 identified.** |
| Needs additional source evidence | Any case whose expected answer needs a factual Hà Giang claim; no eligible claim-bearing document is available. |
| Requires a `VISIBLE` Destination | Any destination-context case; no specific candidate and matching published Destination were verified in this review. |
| Requires a real conflict pair | Conflict evaluation is blocked until two independently rights-cleared sources make genuinely conflicting claims about the same scoped fact. Do not manufacture a conflict. |
| Not evaluable now | Any case that depends on a held source, disputed facts, independent gold review, or unprovided question/expected-answer records. |

The owner/reviewer must supply the exact ten questions, expected outcome, claim facets, source IDs, locators, unanswered aspects, reviewer, and review timestamp before a real-corpus manifest can be considered. Independent review must record disagreement; this package does not certify any review result.

## RAG data lifecycle audit (repository implementation)

- **Upload:** Admin obtains a private Vercel Blob upload URL and finalizes an `UPLOADED` `RagDocument`. RAG upload finalization captures title, URL, author, topic, and locality, but does not bind a source-rights record to the `RagDocument`. The separate Admin Destination/Culture content-profile schema does provide `ContentSource` fields for claim/provenance, website/index/OpenAI rights, rights evidence, reviewer, and review time, with rights defaulting to `UNKNOWN`; however, that record is not enforced by RAG upload or indexing. `RagDomainOrigin` is marked interface-only and no bridge/runtime consumer was found. Upload is not retrieval-eligible.
- **Approval:** transitions are `UPLOADED → REVIEWING → APPROVED`; the approval check verifies that the original Blob is accessible. The code does not require or persist rights clearance or an independent reviewer. Approval alone is not indexed.
- **Index:** the worker extracts, creates content versions/generations/chunks, and obtains embeddings via the configured OpenAI embedding provider; successful complete generations are published and status becomes `INDEXED`. This task did not run it.
- **Allowlist/retrieval:** retrieval fails closed when its server-side `publicSourceIds` set is empty and uses only IDs explicitly admitted by server configuration. The current runtime target's effective allowlist was not read or changed in this review. `INDEXED` alone does not override the allowlist.
- **Disable:** `DISABLED` prevents new retrieval and the app says the transition cannot be reversed in the MVP. It retains the source row, original Blob, content versions, generations, chunks, embeddings, and job history.
- **Delete/purge:** no Admin delete/purge endpoint or Blob delete method exists in the inspected RAG module. Prisma relations use `onDelete: Restrict`, so deleting the document row alone cannot purge the RAG graph. Test cleanup uses explicit deletes in dependency order but is not an operational lifecycle feature. No product cleanup job or durable purge-result evidence was found.
- **Readiness:** **BLOCKED for any source that may need withdrawal or deletion.** `RagDomainOrigin.revokedAt` is only a schema boundary in this branch; no bridge was found that turns a content-profile rights revocation into a retrieval disable or generation purge. Keep a source out of RAG until a separately reviewed lifecycle design covers active jobs/cancellation, retrieval disable and publication fencing, Blob deletion, publication/revision/generation/chunk/embedding/job rows, retries, idempotent results, audit evidence, and verification of zero remaining copies. Do not purge in this task.

Implementation references: [RAG upload/review service](../../apps/web/src/modules/rag-document/rag-service.ts), [private Blob facade](../../apps/web/src/modules/rag-document/rag-storage.ts), [retrieval allowlist and eligible query](../../apps/web/src/modules/ai/qa-retrieval.ts), [index worker](../../apps/web/src/modules/rag-index/rag-index-worker.ts), [RAG document schema](../../packages/db/prisma/schema/rag-document.prisma), [content-profile rights and origin schema](../../packages/db/prisma/schema/content-profile.prisma), [RAG index schema](../../packages/db/prisma/schema/rag-index.prisma), [RAG job schema](../../packages/db/prisma/schema/rag-index-job.prisma), [US-21 evaluation record](US-21-grounding-evaluation.md), and [US-23 Task 203 contract](../stories/US-23-source-sufficiency.md).

## Owner decision package

```text
FIRST_PARTY_CORPUS_STATUS=NONE_READY; first-party fieldwork/authored claims not supplied or rights-evidenced
RIGHTS_CLEARED_CANDIDATES=0 claim-bearing documents
EXTERNAL_LICENSED_CANDIDATES=CONDITIONAL routes only: exact Wikidata structured claims (CC0); exact CC BY 4.0 work; OSM geodata (ODbL 1.0, public RAG obligations need review)
FACTUAL_VERIFICATION=NO claim-bearing candidate verified; do not carry facts from held sources; unknowns remain UNKNOWN
PROVIDER_PROCESSING_RIGHTS=NOT_ESTABLISHED for first-party content; conditional per exact CC0/CC BY work; ODbL RAG output and attribution obligations need owner/legal review
GOLD_CASES_REVIEWABLE=0/10; the exact case list/manifest is absent; synthetic US-21 fixtures are not corpus evaluation
DESTINATION_DEPENDENCIES=Destination-context cases require a matching VISIBLE Destination before test; no specific Destination verified here
CONFLICT_DEPENDENCIES=BLOCKED until there is a genuine, independently sourced conflict pair
PURGE_READINESS=BLOCKED; no production Blob/database purge workflow or completion evidence
CANARY_SCOPE_PROPOSAL=First-party-authored, independently evidenced, non-sensitive public facts only; 1–3 short documents, initially UPLOADED only after rights review, then separate approval/index/allowlist decisions; keep held sources excluded
OWNER_APPROVAL_PENDING=Name authors/rightsholders; approve precise claim topics; confirm written website/index/provider-processing rights and interview consent; supply gold cases/reviewers; decide ODbL obligations if used; require purge design before data intake
LIVE_ACCEPTANCE_READY=NO
BLOCKERS=No verified factual corpus; no exact gold-case set; RAG upload cannot bind/enforce the content-profile rights evidence; no supported purge lifecycle or enforced ContentSource-to-RAG rights bridge
```

The requested upload/index/allowlist sequence remains owner-gated. No Neon access or write, OpenAI call, RAG upload/index, allowlist update, production change, commit, or push was performed for this package.





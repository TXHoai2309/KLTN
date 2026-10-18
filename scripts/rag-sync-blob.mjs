import { get, head } from "@vercel/blob";
import { parseEnv } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { secrets, sha, canonical, basicInventory, refuse, verifyLedgers } from "./rag-sync-lib.mjs";
import { validateReusable, selectedRows, conflictPlan } from "./rag-sync-validate.mjs";

const knownNames = new Set(["Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx", "Cang_Bac_Me_Ho_so_du_lieu_RAG_nguon_URL_day_du_2026.docx", "Khau_Vai_RAG_2026.docx"]);
export async function readPrivateBlob(doc, token, storeId) {
  const metadata = await head(doc.storagePath, { token, abortSignal: AbortSignal.timeout(20000) });
  const url = new URL(metadata.url);
  if (url.hostname !== `${storeId.toLowerCase()}.private.blob.vercel-storage.com` || url.search || metadata.contentType !== doc.mimeType || metadata.size !== doc.sizeBytes) refuse("BLOB_METADATA_OR_PRIVACY_MISMATCH");
  const result = await get(doc.storagePath, { access: "private", token, abortSignal: AbortSignal.timeout(20000) });
  if (result?.statusCode !== 200 || !result.stream) refuse("ORIGINAL_BLOB_NOT_READABLE");
  const chunks = []; let total = 0;
  const reader = result.stream.getReader();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 20*1024*1024) { await reader.cancel(); refuse("BLOB_SIZE_LIMIT"); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== doc.sizeBytes) refuse("ORIGINAL_SIZE_MISMATCH");
  const anonymous = await fetch(metadata.url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  await anonymous.body?.cancel();
  if (![401,403,404].includes(anonymous.status)) refuse("PRIVATE_BLOB_ANONYMOUS_ACCESS_UNEXPECTED");
  return { bytes, report: { documentId: doc.id, accessible: true, private: true, registeredMimeMatches: true, size: bytes.length, sha256: sha(bytes), anonymousStatus: anonymous.status } };
}

async function main() {
  if (process.argv[2] !== "--secrets" || process.argv[4] !== "--production-env" || process.argv.length !== 6) refuse("BLOB_REPORT_ARGUMENTS_REQUIRED");
  const input = await secrets(process.argv[3]), prod = parseEnv(await readFile(process.argv[5], "utf8"));
  const token = input.SYNC_SOURCE_BLOB_READ_WRITE_TOKEN || input.BLOB_READ_WRITE_TOKEN;
  const storeId = token?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
  if (!storeId || ![storeId, `store_${storeId}`].includes(prod.BLOB_STORE_ID)) refuse("SAME_PRIVATE_STORE_NOT_VERIFIED");
  const inventory = JSON.parse(await readFile(".cache/rag-sync/inventory-private.json", "utf8"));
  const { source, target } = inventory.states;
  const ledger = await verifyLedgers(source.ledger, target.ledger);
  const require = createRequire(import.meta.url), processing = require("../.cache/rag-sync/processing.cjs");
  const docs = source.rows.rag_document.filter(row => knownNames.has(row.originalFileName));
  if (docs.length !== 3 || new Set(docs.map(row => row.originalFileName)).size !== 3) refuse("REAL_DOCUMENT_SELECTION_REVIEW_REQUIRED");
  const verified = [], blobReports = [], failures = [];
  await mkdir(".cache/rag-sync/originals", { recursive: true });
  for (const doc of docs) {
    try {
      const blob = await readPrivateBlob(doc, token, storeId);
      await writeFile(`.cache/rag-sync/originals/${doc.id}.docx`, blob.bytes);
      blobReports.push(blob.report);
      // Owner-provided research originals are additional provenance, not a rights grant.
      const local = await readFile(`D:/KLTN/danh sách điểm đến/${doc.originalFileName}`);
      if (sha(local) !== sha(blob.bytes)) refuse("OWNER_ORIGINAL_PROVENANCE_MISMATCH");
      verified.push({ ...await validateReusable(doc, source.rows, blob.bytes, processing), ownerOriginalByteMatch: true });
    } catch (error) { failures.push({ documentId: doc.id, code: /^[A-Z0-9_]{1,80}$/.test(error?.message || "") ? error.message : "BLOB_OR_INTEGRITY_CHECK_FAILED" }); }
  }
  const rows = selectedRows(source, verified), plan = conflictPlan(rows, target.rows);
  const schemaEqual = ["columns", "constraints", "triggers", "extensions"].every(key => canonical(source[key]) === canonical(target[key]));
  const pass = verified.length === 3 && failures.length === 0 && plan.conflicts.length === 0 && schemaEqual && ledger.semanticSqlEquivalent;
  const manifest = { checkedAt: new Date().toISOString(), identities: inventory.identities, schemaHash: sha(canonical([source.columns,source.constraints,source.triggers,source.extensions])),
    sourceRowsHash: sha(canonical(source.rows)), sourceProtected: source.protected, targetProtected: target.protected,
    rows, verified, plan, status: pass ? "DRY_RUN_PASS" : "BLOCKED", sourceDocuments: source.rows.rag_document.length,
    excludedIds: basicInventory(source).filter(row => row.classification === "FIXTURE_EXCLUDE").map(row => row.id), storeIdHash: sha(storeId.toLowerCase()) };
  manifest.planHash = sha(canonical(manifest));
  await writeFile(".cache/rag-sync/manifest-private.json", JSON.stringify(manifest, null, 2) + "\n");
  const report = { checkedAt: manifest.checkedAt, status: manifest.status, schemaEqual, ledgerVerification: ledger,
    sameStore: true, privateStore: true, storeIdentitySha256: manifest.storeIdHash, productionCredentialValueRedacted: prod.BLOB_READ_WRITE_TOKEN?.includes("SENSITIVE") ?? false,
    storeProof: "Production BLOB_STORE_ID matches store identity of authenticated SDK token; no secret value exported. Production CMS file read remains a separate server-runtime check.",
    metrics: { SOURCE_DOCUMENTS: manifest.sourceDocuments, TARGET_DOCUMENTS: target.rows.rag_document.length, ELIGIBLE_DOCUMENTS: verified.length,
      READY_GENERATIONS: verified.length, VALID_EMBEDDINGS: verified.reduce((n,row)=>n+row.embeddings,0), BLOB_ACCESSIBLE: blobReports.length,
      INDEX_REUSE_CANDIDATES: verified.length, REINDEX_REQUIRED: failures.length, RIGHTS_REVIEW_REQUIRED: verified.length,
      ID_CONFLICTS: plan.conflicts.length, EXPECTED_INSERTS: plan.expectedInserts, EXPECTED_UPDATES: 0, EXPECTED_DELETES: 0 },
    documents: verified, blobReports, failures, exclusions: manifest.excludedIds, plan: plan.counts, planHash: manifest.planHash,
    publicQaApprovalCopied: false, jobsCopied: 0, blobCopies: 0, openAiCalls: 0, estimatedOpenAiCostUsd: 0, productionWrites: 0 };
  await writeFile("docs/implementation/rag-sync-evidence/dry-run.json", JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if (!pass) process.exitCode = 1;
}
if (process.argv[1]?.endsWith("rag-sync-blob.mjs")) main().catch(() => { console.error("BLOB_DRY_RUN_FAILED_DETAILS_SUPPRESSED"); process.exitCode=1; });

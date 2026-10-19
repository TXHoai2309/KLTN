// Collect only bounded QA metadata, never complete console logs or source prose.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
async function read(name: string) { try { return await readFile(join(tmpdir(), name), "utf8"); } catch { return ""; } }
async function records(name: string, prefix: string): Promise<Record<string, any>[]> {
  return (await read(name)).split(/\r?\n/u).flatMap(line => {
    const index = line.indexOf(prefix + " ");
    if (index < 0) return [];
    try { return [JSON.parse(line.slice(index + prefix.length + 1))]; } catch { return []; }
  });
}
function latency(rows: Record<string, any>[]) {
  const values = rows.map(row => row.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return { sampleCount: values.length, medianMs: values.length % 2 ? values[middle] : (values[middle - 1]! + values[middle]!) / 2, p95NearestRankMs: values[Math.ceil(.95 * values.length) - 1], productionSlo: "NOT_ESTABLISHED" };
}
const runs = [];
for (const [phase, file, planned, classification] of [
  ["before", "kltn-ai-completion-before.log", 4, "BASELINE"],
  ["sentence-handles", "kltn-ai-completion-live.log", 6, "INTERMEDIATE"],
  ["titles-and-hybrid", "kltn-ai-completion-live-final.log", 6, "INTERMEDIATE"],
  ["minimal-overview", "kltn-ai-completion-live-release.log", 6, "INTERMEDIATE"],
  ["generation-handles", "kltn-ai-completion-live-handles.log", 6, "INTERMEDIATE"],
  ["narrow-admission", "kltn-ai-completion-live-acceptance.log", 6, "INTERMEDIATE"],
  ["coreference-trial-rolled-back", "kltn-ai-completion-live-final-scope.log", 6, "ROLLED_BACK_EXPERIMENT"],
  ["facet-bound-generation", "kltn-ai-completion-live-facets.log", 6, "INTERMEDIATE"],
  ["server-bound-verdicts", "kltn-ai-completion-live-verified.log", 6, "INTERMEDIATE"],
  ["verified-citation-projection-rolled-back", "kltn-ai-completion-live-projection.log", 6, "ROLLED_BACK_EXPERIMENT"],
  ["reviewed-excerpt-alternative", "kltn-ai-completion-live-excerpts.log", 6, "FINAL_CODE_MATRIX"],
] as const) {
  const rows = await records(file, "QA_LIVE_RELIABILITY");
  const calls = rows.flatMap(row => row.calls ?? []);
  runs.push({ phase, classification, file, planned, loggedTurns: rows.length, unloggedPreGenerationFailures: planned - rows.length,
    supportedOutcomes: rows.filter(row => ["ANSWERED", "PARTIAL"].includes(row.status)).length,
    exactExcerptOutcomes: rows.filter(row => row.answerMode === "SOURCE_EXCERPTS").length,
    jsonCallsObserved: calls.length, allObservedCallsLuna: calls.length > 0 && calls.every(call => call.requestedLuna && call.actualLuna),
    observedTotalTokens: calls.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0), latency: latency(rows), rows });
}
const recall = [];
for (const file of ["kltn-ai-completion-recall-before.json", "kltn-ai-completion-recall-hybrid.json", "kltn-ai-completion-recall-final.json"]) {
  const raw = await read(file); if (raw) recall.push({ file, ...JSON.parse(raw) });
}
const http = [];
for (const file of ["kltn-ai-completion-http-release.log", "kltn-ai-completion-http-final.log", "kltn-ai-completion-http-facets.log", "kltn-ai-completion-http-verified.log", "kltn-ai-completion-http-projection.log", "kltn-ai-completion-http-excerpts.log"]) {
  const rows = (await records(file, "QA_LOCAL_HTTP_TURN")).map(row => ["ANSWERED", "PARTIAL"].includes(row.status) ? row : { ...row, answerMode: "NOT_APPLICABLE" });
  http.push({ file, matched: rows.filter(row => row.matched).length, total: rows.length, latency: latency(rows),
    completion: (await records(file, "QA_LOCAL_HTTP_SMOKE"))[0] ?? null,
    cleanup: (await records(file, "QA_LOCAL_HTTP_CLEANUP"))[0] ?? null, rows });
}
const final = runs.at(-1)!;
const report = { version: 1, date: "2026-10-17", ownerCorpusAcceptance: "PENDING", us23Status: "NOT_ACCEPTED",
  limitations: ["Status/citation checks are not independent semantic gold", "All failed and rolled-back measured iterations are retained", "Observed token totals exclude any calls that failed before the per-turn result was logged; this is not an account bill", "No USD conversion without verified current pricing", "Sixty candidate cases (40 literal-recall variants plus 20 dialogue/temporal/adversarial cases) still require independent reviewer annotations"],
  finalLive: { supportedOutcomes: final.supportedOutcomes, exactExcerptOutcomes: final.exactExcerptOutcomes, planned: final.planned, allObservedCallsLuna: final.allObservedCallsLuna, latency: final.latency },
  liveRuns: runs, recall, http,
  diagnosticRunsExcludedFromAcceptance: ["kltn-ai-completion-case-inspection.log", "kltn-ai-completion-case-inspection-three.log"],
};
const path = fileURLToPath(new URL("../../../docs/implementation/ai-chatbot-completion-results.json", import.meta.url));
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.info("QA_COMPLETION_RESULTS", JSON.stringify({ path, finalLive: report.finalLive, recall: recall.map(row => ({ file: row.file, recalled: row.recalled, total: row.total })), http: http.map(row => ({ file: row.file, matched: row.matched, total: row.total })) }));

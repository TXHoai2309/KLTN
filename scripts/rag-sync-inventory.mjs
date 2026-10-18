import { mkdir, writeFile } from "node:fs/promises";
import { secrets, verifyIdentity, open, readState, basicInventory, canonical, sha, refuse, verifyLedgers } from "./rag-sync-lib.mjs";

async function main() {
  if (process.argv[2] !== "--secrets" || !process.argv[3] || process.argv.length !== 4) refuse("INVENTORY_READ_ONLY_ARGUMENTS_REQUIRED");
  const input = await secrets(process.argv[3]);
  const identities = await verifyIdentity(input);
  const states = {};
  for (const side of ["source", "target"]) {
    const client = await open(input, side);
    try { states[side] = await readState(client); await client.query("ROLLBACK"); } finally { await client.end(); }
  }
  await mkdir(".cache/rag-sync", { recursive: true });
  await mkdir("docs/implementation/rag-sync-evidence", { recursive: true });
  await writeFile(".cache/rag-sync/inventory-private.json", JSON.stringify({ checkedAt: new Date().toISOString(), identities, states }, null, 2) + "\n");
  const schemaEqual = ["columns", "constraints", "triggers", "extensions"].every(key => canonical(states.source[key]) === canonical(states.target[key]));
  const ledgerEqual = canonical(states.source.ledger.map(({ migration_name, checksum }) => ({ migration_name, checksum }))) === canonical(states.target.ledger.map(({ migration_name, checksum }) => ({ migration_name, checksum })));
  const healthy = Object.values(states).every(state => state.ledger.length === 23 && state.ledger.every(row => row.finished_at && !row.rolled_back_at));
  const ledgerVerification = await verifyLedgers(states.source.ledger, states.target.ledger);
  const report = { checkedAt: new Date().toISOString(), identities, readOnly: true, schemaEqual, ledgerEqual, ledgerVerification, healthy,
    schemaHash: sha(canonical([states.source.columns, states.source.constraints, states.source.triggers, states.source.extensions])),
    source: basicInventory(states.source), target: basicInventory(states.target),
    counts: Object.fromEntries(Object.entries(states).map(([side, state]) => [side, Object.fromEntries(Object.entries(state.rows).map(([table, rows]) => [table, rows.length]))])),
    extensions: states.target.extensions, sourceWrites: 0, productionWrites: 0, openAiCalls: 0, blobOperations: 0 };
  await writeFile("docs/implementation/rag-sync-evidence/inventory.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!schemaEqual || !ledgerVerification.semanticSqlEquivalent || !healthy) refuse("SCHEMA_OR_LEDGER_GATE_FAILED");
}
main().catch(error => { const code = /^[A-Z0-9_]{1,70}$/.test(error?.message || "") ? error.message : /^[0-9A-Z]{5}$/.test(error?.code || "") ? error.code : "DETAILS_SUPPRESSED"; console.error(`READ_ONLY_INVENTORY_FAILED:${code}`); process.exitCode = 1; });

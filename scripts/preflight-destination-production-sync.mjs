/** Read-only credential/identity gate. Does not import or change business data.
 * Explicit SYNC_* inputs only. Run with Node --env-file pointing to an ignored
 * local secret file, or inject variables securely into the child process.
 */
import { pathToFileURL } from "node:url";

export const expected = Object.freeze({
  project: "summer-unit-95870477",
  source: { branch: "br-aged-hat-b3o6hg9p", endpoint: "ep-purple-pond-b3xujb8o" },
  target: { branch: "br-cold-dew-b3h270wp", endpoint: "ep-blue-art-b3v3vr4h" },
  database: "neondb",
});
const refusal = code => { throw new Error(code); };

export function readConnections(env) {
  const absent = ["SYNC_SOURCE_DATABASE_URL", "SYNC_TARGET_DATABASE_URL"].filter(k => !env[k]?.trim());
  if (absent.length) refusal(`MISSING_INPUTS:${absent.join(",")}`);
  const connection = (value, side) => {
    let url;
    try { url = new URL(value); } catch { refusal(`INVALID_${side.toUpperCase()}_URL`); }
    const hostname = url.hostname.toLowerCase();
    const endpoint = hostname.split(".")[0].replace(/-pooler$/, "");
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !url.username || !url.password || url.pathname !== "/neondb"
      || url.port && url.port !== "5432"
      || endpoint !== expected[side].endpoint
      || !/^ep-[a-z0-9-]+(?:\.c-\d+)?\.ap-southeast-1\.aws\.neon\.tech$/.test(hostname)
      || !["require", "verify-full"].includes(url.searchParams.get("sslmode"))) refusal(`UNEXPECTED_${side.toUpperCase()}_TARGET`);
    return { value, endpoint, hostname, database: "neondb" };
  };
  const source = connection(env.SYNC_SOURCE_DATABASE_URL, "source");
  const target = connection(env.SYNC_TARGET_DATABASE_URL, "target");
  if (source.endpoint === target.endpoint) refusal("SOURCE_TARGET_NOT_DISTINCT");
  return { source, target };
}

export function readInputs(env) {
  const connections = readConnections(env);
  if (!env.NEON_API_KEY?.trim()) refusal("MISSING_INPUTS:NEON_API_KEY");
  return { ...connections, apiKey: env.NEON_API_KEY };
}

export async function verifyProvider(inputs, fetcher = fetch) {
  const checks = [];
  for (const side of ["source", "target"]) {
    const pin = expected[side];
    const get = async path => {
      const response = await fetcher(`https://console.neon.tech/api/v2/projects/${expected.project}${path}`, {
        headers: { Authorization: `Bearer ${inputs.apiKey}` },
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (!response.ok) refusal(`NEON_METADATA_HTTP_${response.status}`);
      try { return await response.json(); } catch { refusal("INVALID_PROVIDER_METADATA"); }
    };
    const branch = (await get(`/branches/${pin.branch}`)).branch;
    const endpoint = (await get(`/endpoints/${pin.endpoint}`)).endpoint;
    if (branch?.id !== pin.branch || branch?.project_id !== expected.project
      || endpoint?.id !== pin.endpoint || endpoint?.branch_id !== pin.branch
      || endpoint?.host !== inputs[side].hostname.replace("-pooler.", ".")) refusal(`PROVIDER_${side.toUpperCase()}_IDENTITY_MISMATCH`);
    const databases = (await get(`/branches/${pin.branch}/databases`)).databases;
    if (!Array.isArray(databases) || !databases.some(d => d.name === expected.database)) refusal("DATABASE_METADATA_MISMATCH");
    checks.push({ side, project: expected.project, branch: pin.branch, endpoint: pin.endpoint, database: expected.database, status: "VERIFIED_BY_API" });
  }
  return checks;
}

export async function preflight(env, fetcher = fetch) {
  const input = readInputs(env); // Refuse before network or DB when input is absent/wrong.
  const identities = await verifyProvider(input, fetcher);
  return { identities, databaseConnections: 0, databaseWrites: 0,
    nextGate: "READ_ONLY_SQL_INVENTORY_AND_LEDGER_THEN_BACKUP_VERIFICATION_REQUIRED",
    transferImplemented: false, destinationProductionSync: "NOT_RUN" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--report"].includes(args[0])) {
    console.error("PREFLIGHT_ONLY: use --dry-run or --report; no apply capability before DB inventory and backup gate.");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await preflight(process.env), null, 2)); }
    catch (error) {
      const code = error instanceof Error && /^(?:MISSING_INPUTS:[A-Z_,]+|[A-Z][A-Z0-9_]+)$/.test(error.message)
        ? error.message : "PREFLIGHT_FAILED_DETAILS_SUPPRESSED";
      console.log(JSON.stringify({ status: "BLOCKED", code, databaseConnections: 0, databaseWrites: 0, destinationProductionSync: "NOT_RUN" }, null, 2));
      process.exitCode = 1;
    }
  }
}

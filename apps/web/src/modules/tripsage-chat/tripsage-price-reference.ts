import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads the owner-maintained `## Đi lại` table from `docs/fixtures/price-reference-ha-giang.md`
 * for train / sleeper-bus estimates (D10). Never invents routes or numbers when the file or a
 * specific route is absent.
 */
let cachedTransportSection: string | null | undefined;

export function readPriceReferenceTransportSection(): string | null {
  if (cachedTransportSection !== undefined) return cachedTransportSection;
  const candidates = [
    resolve(process.cwd(), "docs/fixtures/price-reference-ha-giang.md"),
    resolve(process.cwd(), "../../docs/fixtures/price-reference-ha-giang.md"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      const start = raw.indexOf("## Đi lại");
      if (start === -1) continue;
      const rest = raw.slice(start);
      const nextHeading = rest.indexOf("\n## ", 1);
      cachedTransportSection = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
      return cachedTransportSection;
    } catch {
      // Ignore read errors and fall through to null.
    }
  }
  cachedTransportSection = null;
  return null;
}

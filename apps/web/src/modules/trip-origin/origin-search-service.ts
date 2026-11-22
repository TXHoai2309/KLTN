import "server-only";
import { createHash } from "node:crypto";
import { originSearchRequestSchema, originSearchResultsSchema, type OriginSearchOutcome } from "./origin-search-contract";
import { searchNominatim, type OriginSearchConfig } from "./origin-search-provider";
import { SEARCH_IO_BUDGET_MS, SEARCH_WINDOW_MS, type OriginSearchStore } from "./origin-search-store";
import { VIETNAM_COVERAGE, vietnamCoverageAt } from "./vietnam-coverage";

export function createOriginSearchService(deps: { store: OriginSearchStore; config: () => OriginSearchConfig | null; fetcher?: typeof fetch; now?: () => number }) {
  return async (input: unknown, signal?: AbortSignal): Promise<OriginSearchOutcome> => {
    const parsed = originSearchRequestSchema.safeParse(input);
    if (!parsed.success) return { status: "UNAVAILABLE" };
    const config = deps.config();
    if (!config || signal?.aborted) return { status: "UNAVAILABLE" };
    const query = parsed.data.query.replace(/\s+/gu, " ");
    const key = createHash("sha256").update(JSON.stringify(["origin-search-v1", config.endpoint, VIETNAM_COVERAGE.revision, query.toLocaleLowerCase("vi")])).digest("hex");
    const now = deps.now ?? (() => performance.now());
    const deadline = now() + 5000;
    async function databaseCall<T>(operation: () => Promise<T>): Promise<T> {
      const remaining = Math.min(1500, deadline - now());
      if (remaining <= 0 || signal?.aborted) throw new Error("Search budget expired");
      let cancel: (() => void) | undefined;
      const expired = new Promise<never>((_, reject) => { cancel = () => reject(new Error("Search interrupted")); });
      const onAbort = () => cancel?.();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(onAbort, remaining);
      try { return await Promise.race([operation(), expired]); }
      finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
    }
    try {
      const cached = await databaseCall(() => deps.store.read(key));
      if (cached !== null) {
        const rows = originSearchResultsSchema.safeParse(cached);
        if (rows.success && rows.data.every(result => vietnamCoverageAt(result) === "SUPPORTED")) return { status: rows.data.length ? "RESULTS" : "NO_RESULTS", results: rows.data, cached: true };
      }
      // Measure before DB I/O. Slow/delayed claim responses consume the budget,
      // never extend it or move the request beyond the committed shared window.
      const admittedAt = now();
      const claim = await databaseCall(deps.store.claim);
      if (!claim) return { status: "BUSY", retryAfterSeconds: Math.ceil(SEARCH_WINDOW_MS / 1000) };
      const remaining = Math.min(deadline - now(), Math.min(SEARCH_IO_BUDGET_MS, claim.expiresAt.getTime() - claim.databaseNow.getTime()) - Math.max(0, now() - admittedAt));
      if (remaining <= 0 || signal?.aborted) return { status: "UNAVAILABLE" };
      const controller = new AbortController();
      let expire: (() => void) | undefined;
      const timeout = new Promise<null>(resolve => { expire = () => { controller.abort(); resolve(null); }; });
      const cancel = () => expire?.();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      const timer = setTimeout(() => expire?.(), remaining);
      let results;
      try { results = await Promise.race([searchNominatim(query, config, controller.signal, deps.fetcher), timeout]); }
      finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); controller.abort(); }
      if (!results || signal?.aborted) return { status: "UNAVAILABLE" };
      // A cache failure never rewrites provider errors into success or retries I/O.
      await databaseCall(() => deps.store.write(key, results));
      return { status: results.length ? "RESULTS" : "NO_RESULTS", results, cached: false };
    } catch { return { status: "UNAVAILABLE" }; }
  };
}
